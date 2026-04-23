// MP02 — Risoluzione cantiere (order_id) per l'operaio.
// 4 regole in cascata:
//   1. Sessione attiva < 4h → usa whatsapp_sessions.current_cantiere_id
//   2. Un solo cantiere attivo oggi → auto-associa
//   3. Match fuzzy su hint (RPC trigram) → auto se sim > 0.35 e 1 match; ask se 2-3
//   4. Ask con lista (max 5)

import type { ToolCtx } from "./types.ts";

export interface ResolveCantiereResult {
  cantiere_id: string | null;
  cantiere_nome: string | null;
  ask_user: string | null;
  candidates?: Array<{ id: string; name: string; indirizzo?: string | null }>;
  source: "session" | "single" | "fuzzy" | "ask" | "none";
}

interface TrigramMatch {
  id: string;
  name: string;
  indirizzo: string | null;
  similarity: number;
}

interface OrderRow {
  id: string;
  description: string | null;
  order_code: string | null;
  indirizzo_lavori: string | null;
  status: string | null;
  work_start_date: string | null;
  work_end_date: string | null;
}

const ACTIVE_STATUSES = [
  "in_produzione",
  "in_corso",
  "attivo",
  "aperto",
  "in_lavorazione",
];

function cantiereNome(o: { description?: string | null; order_code?: string | null }): string {
  return o.description || o.order_code || "Cantiere";
}

export async function resolveCantiere(
  ctx: ToolCtx,
  hint?: string,
): Promise<ResolveCantiereResult> {
  // Regola 1 — sessione < 4h
  if (ctx.sessionId) {
    const { data: sess } = await ctx.supabase
      .from("whatsapp_sessions")
      .select("current_cantiere_id, last_activity_at")
      .eq("id", ctx.sessionId)
      .maybeSingle();

    if (sess?.current_cantiere_id) {
      const lastActivity = sess.last_activity_at
        ? new Date(sess.last_activity_at).getTime()
        : 0;
      const hoursSince = (Date.now() - lastActivity) / 3_600_000;
      if (hoursSince < 4) {
        const { data: c } = await ctx.supabase
          .from("orders")
          .select("id, description, order_code")
          .eq("id", sess.current_cantiere_id)
          .eq("company_id", ctx.company_id)
          .maybeSingle();
        if (c) {
          return {
            cantiere_id: c.id,
            cantiere_nome: cantiereNome(c),
            ask_user: null,
            source: "session",
          };
        }
      }
    }
  }

  // Regola 3 prima di 2 se c'è hint — fuzzy match via RPC
  if (hint && hint.length >= 3) {
    const { data: matches } = await ctx.supabase.rpc("search_cantieri_by_trigram", {
      p_company_id: ctx.company_id,
      p_query: hint,
      p_limit: 3,
    });

    const ms = (matches ?? []) as TrigramMatch[];
    if (ms.length === 1 && ms[0].similarity > 0.35) {
      return {
        cantiere_id: ms[0].id,
        cantiere_nome: ms[0].name,
        ask_user: null,
        source: "fuzzy",
      };
    }
    if (ms.length >= 2) {
      const opts = ms.map((m, i) => `${i + 1}. ${m.name}`).join("\n");
      return {
        cantiere_id: null,
        cantiere_nome: null,
        ask_user: `Ho trovato più cantieri:\n${opts}\n\nQuale?`,
        candidates: ms.map((m) => ({ id: m.id, name: m.name, indirizzo: m.indirizzo })),
        source: "ask",
      };
    }
  }

  // Regola 2 — un solo cantiere attivo oggi
  const today = new Date().toISOString().substring(0, 10);
  const { data: cantieri } = await ctx.supabase
    .from("orders")
    .select("id, description, order_code, indirizzo_lavori, status, work_start_date, work_end_date")
    .eq("company_id", ctx.company_id)
    .in("status", ACTIVE_STATUSES)
    .limit(10);

  const filtered: OrderRow[] = ((cantieri ?? []) as OrderRow[]).filter((c) => {
    const startOk = !c.work_start_date || c.work_start_date <= today;
    const endOk = !c.work_end_date || c.work_end_date >= today;
    return startOk && endOk;
  });

  if (filtered.length === 1) {
    return {
      cantiere_id: filtered[0].id,
      cantiere_nome: cantiereNome(filtered[0]),
      ask_user: null,
      source: "single",
    };
  }

  // Regola 4 — ask con lista
  if (filtered.length > 1) {
    const shown = filtered.slice(0, 5);
    const opts = shown.map((c, i) => {
      const addr = c.indirizzo_lavori ? ` — ${c.indirizzo_lavori}` : "";
      return `${i + 1}. ${cantiereNome(c)}${addr}`;
    }).join("\n");
    return {
      cantiere_id: null,
      cantiere_nome: null,
      ask_user: `Su quale cantiere?\n${opts}`,
      candidates: shown.map((c) => ({
        id: c.id,
        name: cantiereNome(c),
        indirizzo: c.indirizzo_lavori,
      })),
      source: "ask",
    };
  }

  return {
    cantiere_id: null,
    cantiere_nome: null,
    ask_user:
      "Non hai cantieri attivi oggi. Contatta il titolare se è un errore.",
    source: "none",
  };
}
