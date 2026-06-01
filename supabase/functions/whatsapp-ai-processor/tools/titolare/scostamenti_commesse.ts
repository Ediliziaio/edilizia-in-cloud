// MP02 — Scostamenti commesse: marginalità di portafoglio (preventivo vs consuntivo).
//
// Legge la vista autoritativa `v_ordine_marginalita` (security_invoker=true,
// tenant-safe) — la STESSA usata dalla pagina Marginalità Cantieri, dal widget
// del cruscotto e dal Controllo di Gestione. Niente stime: usa margine /
// margine_perc già calcolati dalla vista, così i numeri coincidono con la UI.
//
// Complementare a `marginalita_cantiere` (singolo cantiere, stima manodopera):
// qui si risponde a "come vanno le commesse", "quali sono in perdita",
// "scostamenti". Read-only. La logica rispecchia `src/lib/commesse/scostamenti.ts`.

import type { ToolCtx, ToolResult, ToolDef } from "../shared/types.ts";
import { errResult, okResult } from "../shared/types.ts";

/** Soglia di marginalità "sana" (%) — allineata a src/lib/commesse/scostamenti.ts. */
const SOGLIA_VERDE_PERC = 15;
/** Errori/rilavorazioni ≥ 2% del preventivo → segnale di causa. */
const INCIDENZA_ERRORI_SEGNALE = 0.02;
/** Consuntivo ≥ 85% del preventivo (senza sforamento) → margine a rischio. */
const INCIDENZA_COSTI_ALTA = 0.85;
const FETCH_LIMIT = 500;

export const scostamentiCommesseDef: Omit<ToolDef, "handler"> = {
  name: "scostamenti_commesse",
  description:
    "Analizza la marginalità (preventivo vs consuntivo) di TUTTE le commesse: KPI di portafoglio, commesse più a rischio o in perdita e CAUSE dello scostamento (sforamento costi, errori/rilavorazioni, incidenza costi alta). Read-only. Usa per domande come 'come vanno le commesse', 'quali sono in perdita', 'perché va in perdita', 'scostamenti', 'margini cantieri'.",
  parameters: {
    type: "object",
    properties: {
      solo_in_perdita: {
        type: "boolean",
        description: "Se true, elenca solo le commesse in perdita.",
      },
      limit: {
        type: "number",
        description: "Numero di commesse da elencare (default 5, max 15).",
      },
    },
    additionalProperties: false,
  },
  requires_grants: ["marginalita.read"],
};

interface VistaRow {
  id: string;
  order_code: string | null;
  description: string | null;
  cliente_nome: string | null;
  preventivo_contratto: number | string | null;
  preventivo_totale: number | string | null;
  costo_acquisti: number | string | null;
  costo_errori: number | string | null;
  consuntivo: number | string | null;
  margine: number | string | null;
  margine_perc: number | string | null;
}

type CausaScostamento = "sforamento" | "errori" | "incidenza_alta";
interface SegnaleCausa {
  tipo: CausaScostamento;
  gravita: "alta" | "media";
  label: string;
}

interface Commessa {
  id: string;
  orderCode: string | null;
  description: string;
  preventivo: number;
  consuntivo: number;
  costoErrori: number;
  incidenzaCosti: number;
  margine: number;
  marginePerc: number;
  isInPerdita: boolean;
  cause: SegnaleCausa[];
}

function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function semaforoEmoji(marginePerc: number, hasConsuntivo: boolean): string {
  if (!hasConsuntivo) return "⚪";
  if (marginePerc < 0) return "🔴";
  if (marginePerc < SOGLIA_VERDE_PERC) return "🟡";
  return "🟢";
}

function fmtEur(n: number): string {
  return "€ " + Math.round(num(n)).toLocaleString("it-IT");
}

/**
 * Cause derivate dello scostamento (mirror di src/lib/commesse/scostamenti.ts).
 * Spiega "perché va male": sforamento costi, errori/rilavorazioni, incidenza alta.
 */
function analizzaCause(c: {
  preventivo: number;
  consuntivo: number;
  costoErrori: number;
  margine: number;
  incidenzaCosti: number;
}): SegnaleCausa[] {
  const out: SegnaleCausa[] = [];
  if (c.consuntivo > c.preventivo) {
    out.push({
      tipo: "sforamento",
      gravita: "alta",
      label: `Costi oltre il preventivo di ${fmtEur(c.consuntivo - c.preventivo)}`,
    });
  }
  if (c.costoErrori > 0 && c.preventivo > 0) {
    const incid = c.costoErrori / c.preventivo;
    if (incid >= INCIDENZA_ERRORI_SEGNALE) {
      const gravita: "alta" | "media" =
        c.margine < 0 || c.costoErrori >= Math.max(c.margine, 0) ? "alta" : "media";
      out.push({
        tipo: "errori",
        gravita,
        label: `Errori/rilavorazioni ${fmtEur(c.costoErrori)} (${(incid * 100).toFixed(1)}% del preventivo)`,
      });
    }
  }
  if (c.consuntivo <= c.preventivo && c.incidenzaCosti >= INCIDENZA_COSTI_ALTA) {
    out.push({
      tipo: "incidenza_alta",
      gravita: "media",
      label: `Costi al ${(c.incidenzaCosti * 100).toFixed(0)}% del preventivo`,
    });
  }
  return out.sort((a, b) => (a.gravita === b.gravita ? 0 : a.gravita === "alta" ? -1 : 1));
}

export async function scostamentiCommesse(
  ctx: ToolCtx,
  args: { solo_in_perdita?: boolean; limit?: number },
): Promise<ToolResult> {
  const limit = Math.min(Math.max(Math.trunc(num(args.limit)) || 5, 1), 15);

  const { data, error } = await ctx.supabase
    .from("v_ordine_marginalita")
    .select(
      "id, order_code, description, cliente_nome, preventivo_contratto, preventivo_totale, costo_acquisti, costo_errori, consuntivo, margine, margine_perc",
    )
    .eq("company_id", ctx.company_id)
    .order("created_at", { ascending: false })
    .limit(FETCH_LIMIT);

  if (error) return errResult("db_error", "Non riesco a leggere la marginalità delle commesse.");

  const all: Commessa[] = ((data ?? []) as VistaRow[])
    .map((r) => {
      const preventivo = num(r.preventivo_totale) || num(r.preventivo_contratto);
      const consuntivo = num(r.consuntivo);
      const margine = num(r.margine);
      const costoErrori = num(r.costo_errori);
      const incidenzaCosti = preventivo > 0 ? consuntivo / preventivo : 0;
      return {
        id: r.id,
        orderCode: r.order_code ?? null,
        description: (r.description ?? "").trim() || "Commessa",
        preventivo,
        consuntivo,
        costoErrori,
        incidenzaCosti,
        margine,
        marginePerc: num(r.margine_perc),
        isInPerdita: margine < 0,
        cause: analizzaCause({ preventivo, consuntivo, costoErrori, margine, incidenzaCosti }),
      };
    })
    .filter((c) => c.preventivo > 0);

  if (all.length === 0) {
    return okResult(
      { nCommesse: 0 },
      "Non ho trovato commesse con un preventivo associato da analizzare.",
    );
  }

  // Ordina dal più a rischio: in perdita → margine % crescente → consuntivo decrescente.
  all.sort((a, b) => {
    if (a.isInPerdita !== b.isInPerdita) return a.isInPerdita ? -1 : 1;
    if (a.marginePerc !== b.marginePerc) return a.marginePerc - b.marginePerc;
    return b.consuntivo - a.consuntivo;
  });

  const conCosti = all.filter((c) => c.consuntivo > 0);
  const preventivoTotale = all.reduce((s, c) => s + c.preventivo, 0);
  const consuntivoTotale = all.reduce((s, c) => s + c.consuntivo, 0);
  const margineTotale = all.reduce((s, c) => s + c.margine, 0);
  const margineMedioPerc = preventivoTotale > 0 ? (margineTotale / preventivoTotale) * 100 : 0;
  const nInPerdita = all.filter((c) => c.isInPerdita).length;
  const nSottoSoglia = conCosti.filter(
    (c) => !c.isInPerdita && c.marginePerc < SOGLIA_VERDE_PERC,
  ).length;
  const nConErrori = all.filter((c) => c.cause.some((s) => s.tipo === "errori")).length;
  const nConSforamento = all.filter((c) => c.cause.some((s) => s.tipo === "sforamento")).length;

  const soloInPerdita = args.solo_in_perdita === true;
  const elenco = (soloInPerdita ? all.filter((c) => c.isInPerdita) : all).slice(0, limit);

  if (soloInPerdita && elenco.length === 0) {
    return okResult(
      { nCommesse: all.length, nInPerdita: 0 },
      `✅ Nessuna commessa in perdita su ${all.length} analizzate. Margine medio ${margineMedioPerc.toFixed(1)}%.`,
    );
  }

  const head = [
    "📊 *Marginalità commesse*",
    "",
    `Preventivo: ${fmtEur(preventivoTotale)}`,
    `Consuntivo: ${fmtEur(consuntivoTotale)}`,
    `Margine: ${fmtEur(margineTotale)} (${margineMedioPerc.toFixed(1)}%)`,
  ];
  if (nInPerdita > 0) {
    head.push(`🔴 ${nInPerdita} in perdita · 🟡 ${nSottoSoglia} sotto soglia`);
  } else if (nSottoSoglia > 0) {
    head.push(`🟡 ${nSottoSoglia} sotto soglia (< ${SOGLIA_VERDE_PERC}%)`);
  } else {
    head.push("✅ Nessuna commessa in perdita");
  }
  const noteCause: string[] = [];
  if (nConSforamento > 0) noteCause.push(`📈 ${nConSforamento} con sforamento costi`);
  if (nConErrori > 0) noteCause.push(`⚠️ ${nConErrori} con errori/rilavorazioni`);
  if (noteCause.length) head.push(noteCause.join(" · "));

  const lines = elenco.map((c) => {
    const nome = c.orderCode ? `#${c.orderCode}` : c.description.slice(0, 28);
    const emoji = semaforoEmoji(c.marginePerc, c.consuntivo > 0);
    const base = `${emoji} ${nome} — ${fmtEur(c.margine)} (${c.marginePerc.toFixed(1)}%)`;
    // Causa principale (più grave) sotto la riga, se presente.
    return c.cause[0] ? `${base}\n   ↳ ${c.cause[0].label}` : base;
  });

  const titoloElenco = soloInPerdita ? "In perdita:" : "Più a rischio:";
  const msg = [...head, "", titoloElenco, ...lines].join("\n");

  return okResult(
    {
      nCommesse: all.length,
      nConCosti: conCosti.length,
      nInPerdita,
      nSottoSoglia,
      nConErrori,
      nConSforamento,
      preventivoTotale,
      consuntivoTotale,
      margineTotale,
      margineMedioPerc,
      commesse: elenco,
    },
    msg,
  );
}
