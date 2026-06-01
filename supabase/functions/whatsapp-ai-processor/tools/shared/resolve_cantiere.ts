// MP02 + P0-B — Risoluzione cantiere (order_id) per l'operaio.
//
// Cascata. Le regole "documentali" 0a–0c scattano SOLO se `signals` è passato
// (es. da carica_ddt). Sono più affidabili del contesto sessione perché legate
// al documento stesso, quindi hanno priorità:
//   0a. Riferimento ODA sul documento → purchase_orders.order_id (commessa)   [signals]
//   0b. Fornitore con un solo ODA aperto collegato a una commessa             [signals]
//   0c. Indirizzo di consegna ~ orders.indirizzo_lavori (match univoco)       [signals]
//   1.  Sessione attiva < 4h → whatsapp_sessions.current_cantiere_id
//   2.  Match fuzzy su hint (RPC trigram) → auto se sim>0.35 e 1 match; ask se 2-3
//   3.  Un solo cantiere attivo oggi → auto-associa
//   4.  Ask con lista (max 5)
//
// Senza `signals` il comportamento è identico alla versione MP02 (zero regressioni
// per rapportino/foto/segnalazione/imposta_cantiere_corrente).

import type { ToolCtx } from "./types.ts";

/** Segnali estratti dal documento per auto-puntare il cantiere (P0-B). */
export interface ResolveCantiereSignals {
  /** Indirizzo di consegna/destinazione letto dal documento. */
  indirizzo?: string | null;
  /** Ragione sociale fornitore. */
  fornitore?: string | null;
  /** Numero ordine (ODA) citato sul documento. */
  riferimento_ordine?: string | null;
}

export interface ResolveCantiereResult {
  cantiere_id: string | null;
  cantiere_nome: string | null;
  ask_user: string | null;
  candidates?: Array<{ id: string; name: string; indirizzo?: string | null }>;
  source: "oda" | "address" | "session" | "single" | "fuzzy" | "ask" | "none";
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

interface PoRow {
  id: string;
  order_id: string | null;
  status: string | null;
}

const ACTIVE_STATUSES = [
  "in_produzione",
  "in_corso",
  "attivo",
  "aperto",
  "in_lavorazione",
];

// Stati ODA considerati "chiusi" (non utili per inferire la commessa attiva).
const PO_STATI_CHIUSI = new Set([
  "closed",
  "cancelled",
  "annullato",
  "chiuso",
  "completed",
  "completato",
]);

// Parole funzionali dell'indirizzo da ignorare nel confronto a token.
const ADDR_STOPWORDS = new Set([
  "via", "viale", "vle", "piazza", "pza", "corso", "cso", "strada", "str",
  "largo", "vicolo", "localita", "loc", "snc", "civico", "int", "interno",
  "scala", "km", "ss", "sp", "sr", "edificio", "palazzo", "lotto",
]);

function cantiereNome(o: { description?: string | null; order_code?: string | null }): string {
  return o.description || o.order_code || "Cantiere";
}

/** Tokenizza un indirizzo in parole significative + numeri civici (P0-B). */
function addrTokens(raw?: string | null): { words: Set<string>; nums: Set<string> } {
  const words = new Set<string>();
  const nums = new Set<string>();
  if (!raw) return { words, nums };
  const norm = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  for (const tok of norm.split(/\s+/)) {
    if (!tok) continue;
    if (/^\d+$/.test(tok)) {
      nums.add(tok);
      continue;
    }
    if (tok.length >= 3 && !ADDR_STOPWORDS.has(tok)) words.add(tok);
  }
  return { words, nums };
}

/** Punteggio di somiglianza fra due indirizzi: token condivisi + bonus civico. */
function addrScore(
  a: { words: Set<string>; nums: Set<string> },
  b: { words: Set<string>; nums: Set<string> },
): number {
  let shared = 0;
  for (const w of a.words) if (b.words.has(w)) shared++;
  let numShared = 0;
  for (const n of a.nums) if (b.nums.has(n)) numShared++;
  return shared + (numShared > 0 ? 2 : 0);
}

async function loadCantiereById(ctx: ToolCtx, orderId: string): Promise<ResolveCantiereResult | null> {
  const { data: c } = await ctx.supabase
    .from("orders")
    .select("id, description, order_code")
    .eq("id", orderId)
    .eq("company_id", ctx.company_id)
    .maybeSingle();
  if (!c) return null;
  return { cantiere_id: c.id, cantiere_nome: cantiereNome(c), ask_user: null, source: "oda" };
}

async function loadActiveCantieri(ctx: ToolCtx): Promise<OrderRow[]> {
  const today = new Date().toISOString().substring(0, 10);
  const { data: cantieri } = await ctx.supabase
    .from("orders")
    .select("id, description, order_code, indirizzo_lavori, status, work_start_date, work_end_date")
    .eq("company_id", ctx.company_id)
    .in("status", ACTIVE_STATUSES)
    .limit(50);
  return ((cantieri ?? []) as OrderRow[]).filter((c) => {
    const startOk = !c.work_start_date || c.work_start_date <= today;
    const endOk = !c.work_end_date || c.work_end_date >= today;
    return startOk && endOk;
  });
}

export async function resolveCantiere(
  ctx: ToolCtx,
  hint?: string,
  signals?: ResolveCantiereSignals,
): Promise<ResolveCantiereResult> {
  // Carica i cantieri attivi una sola volta (memoizzato), riusato dalle regole 0c/3.
  let activeCache: OrderRow[] | null = null;
  const getActive = async (): Promise<OrderRow[]> => {
    if (activeCache == null) activeCache = await loadActiveCantieri(ctx);
    return activeCache;
  };

  // ── Regole documentali (P0-B) — solo se ci sono segnali dal documento ──────
  if (signals && (signals.riferimento_ordine || signals.fornitore || signals.indirizzo)) {
    // 0a — ODA citato sul documento → commessa collegata (segnale più forte).
    // SICUREZZA: ref è AI-estratto (untrusted) → niente .or() con stringa
    // interpolata (filter-injection PostgREST); .ilike() parametrizzato.
    const ref = (signals.riferimento_ordine ?? "").toString().trim().slice(0, 80);
    if (ref) {
      const sel = "id, order_id, status";
      let po: PoRow | null = null;
      const byOda = await ctx.supabase
        .from("purchase_orders").select(sel)
        .eq("company_id", ctx.company_id).ilike("oda_number", `%${ref}%`)
        .not("order_id", "is", null).limit(1).maybeSingle();
      po = (byOda.data as PoRow | null) ?? null;
      if (!po) {
        const bySup = await ctx.supabase
          .from("purchase_orders").select(sel)
          .eq("company_id", ctx.company_id).ilike("supplier_reference", `%${ref}%`)
          .not("order_id", "is", null).limit(1).maybeSingle();
        po = (bySup.data as PoRow | null) ?? null;
      }
      if (po?.order_id) {
        const resolved = await loadCantiereById(ctx, po.order_id);
        if (resolved) return resolved;
      }
    }

    // 0b — fornitore con un SOLO ODA aperto collegato a una commessa.
    if (signals.fornitore) {
      const nomeForn = signals.fornitore.toString().trim();
      if (nomeForn) {
        const { data: sup } = await ctx.supabase
          .from("suppliers").select("id")
          .eq("company_id", ctx.company_id).ilike("name", nomeForn).limit(1).maybeSingle();
        if (sup?.id) {
          const { data: pos } = await ctx.supabase
            .from("purchase_orders").select("order_id, status")
            .eq("company_id", ctx.company_id).eq("supplier_id", sup.id).not("order_id", "is", null);
          const openOrderIds = Array.from(new Set(
            ((pos ?? []) as PoRow[])
              .filter((p) => !PO_STATI_CHIUSI.has((p.status || "").toLowerCase()))
              .map((p) => p.order_id)
              .filter((x): x is string => !!x),
          ));
          if (openOrderIds.length === 1) {
            const resolved = await loadCantiereById(ctx, openOrderIds[0]);
            if (resolved) return resolved;
          }
        }
      }
    }

    // 0c — indirizzo di consegna ~ indirizzo_lavori (match univoco fra attivi).
    if (signals.indirizzo) {
      const target = addrTokens(signals.indirizzo);
      if (target.words.size > 0 || target.nums.size > 0) {
        const active = await getActive();
        let best: { o: OrderRow; score: number } | null = null;
        let secondScore = 0;
        for (const o of active) {
          const score = addrScore(target, addrTokens(o.indirizzo_lavori));
          if (!best || score > best.score) {
            secondScore = best?.score ?? 0;
            best = { o, score };
          } else if (score > secondScore) {
            secondScore = score;
          }
        }
        // Richiede match robusto (≥2) e strettamente migliore del secondo (univoco).
        if (best && best.score >= 2 && best.score > secondScore) {
          return {
            cantiere_id: best.o.id,
            cantiere_nome: cantiereNome(best.o),
            ask_user: null,
            source: "address",
          };
        }
      }
    }
  }

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
  const filtered = await getActive();

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
