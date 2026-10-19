// Su quale cantiere va questa bolla / questo rapportino (18/10/2026).
//
// L'operaio non si ricorda il codice della commessa: il bot propone il cantiere
// più probabile e dice perché («hai timbrato lì oggi», «l'indirizzo di consegna
// è quello del cantiere»). Se non c'è un cantiere chiaramente più probabile,
// offre l'elenco dei suoi cantieri aperti da toccare. L'operaio non deve mai
// scrivere un codice.

import type { ToolCtx } from "./types.ts";
import { resolveCantiere, type ResolveCantiereSignals } from "./resolve_cantiere.ts";
import { cantieriInOrdine, cercaCommesseUfficio, commessaAperta, commesseAperte, type CantiereCandidato } from "./cantieriAperti.ts";
import { assignedSiteIds } from "./siteAccess.ts";

export interface SceltaCantiere {
  /** Il cantiere da proporre con un Sì; null se va scelto dall'elenco. */
  proposto: CantiereCandidato | null;
  /** Tutti i cantieri aperti della persona, dal più probabile. */
  candidati: CantiereCandidato[];
}

/** Soglia sotto la quale un segnale non basta a proporre un cantiere da solo. */
const SEGNALE_MINIMO = 40;

function normalizza(testo: unknown): string {
  return String(testo ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

async function candidatoDaId(ctx: ToolCtx, id: string, candidati: CantiereCandidato[]): Promise<CantiereCandidato | null> {
  const noto = candidati.find((c) => c.id === id);
  if (noto) return noto;
  // Ufficio e amministratore: la commessa può essere più vecchia delle 200 recenti.
  if (await assignedSiteIds(ctx)) return null;
  const { data } = await ctx.supabase.from("orders")
    .select("id, order_code, description, client_name, indirizzo_lavori, status")
    .eq("company_id", ctx.company_id).eq("id", id).is("deleted_at", null).maybeSingle();
  if (!data || !commessaAperta(data.status)) return null;
  const indirizzo = data.indirizzo_lavori ? ` — ${data.indirizzo_lavori}` : "";
  return {
    id: data.id,
    titolo: data.order_code || data.description || data.client_name || "Cantiere",
    dettaglio: `${data.description || data.client_name || data.order_code || "Cantiere"}${indirizzo}`,
    punteggio: 0,
    motivo: null,
  };
}

export async function sceltaCantiere(
  ctx: ToolCtx,
  opzioni: { hint?: string | null; signals?: ResolveCantiereSignals } = {},
  adesso = new Date(),
): Promise<SceltaCantiere> {
  const candidati = await cantieriInOrdine(ctx, await commesseAperte(ctx, adesso), adesso);

  // 1. Il documento stesso (ordine citato, indirizzo di consegna).
  const s = opzioni.signals;
  if (s && (s.riferimento_ordine || s.fornitore || s.indirizzo)) {
    const dalDocumento = await resolveCantiere(ctx, undefined, s);
    if ((dalDocumento.source === "oda" || dalDocumento.source === "address") && dalDocumento.cantiere_id) {
      const c = await candidatoDaId(ctx, dalDocumento.cantiere_id, candidati);
      if (c) {
        const motivo = dalDocumento.source === "oda" ? "la bolla cita un ordine di questo cantiere" : "l'indirizzo di consegna è quello del cantiere";
        return { proposto: { ...c, motivo }, candidati };
      }
    }
  }

  // 2. Il nome che ha scritto («Rossi», «via Verdi», il codice).
  const hint = normalizza(opzioni.hint);
  if (hint.length >= 2) {
    let trovati = candidati.filter((c) => normalizza(`${c.titolo} ${c.dettaglio}`).includes(hint));
    // Ufficio e amministratore: si cerca in tutte le commesse aperte dell'azienda,
    // anche per nome del cliente in anagrafica («Rossi»), non solo nelle recenti.
    if (trovati.length === 0 && hint.length >= 3 && !(await assignedSiteIds(ctx))) {
      trovati = await cantieriInOrdine(ctx, await cercaCommesseUfficio(ctx, String(opzioni.hint)), adesso);
    }
    if (trovati.length === 1) return { proposto: { ...trovati[0], motivo: "come mi hai scritto" }, candidati };
    if (trovati.length > 1) return { proposto: null, candidati: trovati };
    if (hint.length >= 3) {
      const simile = await resolveCantiere(ctx, String(opzioni.hint));
      if (simile.cantiere_id) {
        const c = await candidatoDaId(ctx, simile.cantiere_id, candidati);
        if (c) return { proposto: { ...c, motivo: "come mi hai scritto" }, candidati };
      }
    }
  }

  // 3. Dove è oggi.
  if (candidati.length === 1) {
    return { proposto: { ...candidati[0], motivo: candidati[0].motivo ?? "è l'unico tuo cantiere aperto" }, candidati };
  }
  const [primo, secondo] = candidati;
  if (primo?.motivo && primo.punteggio >= SEGNALE_MINIMO && (!secondo || primo.punteggio > secondo.punteggio)) {
    return { proposto: primo, candidati };
  }
  return { proposto: null, candidati };
}

/** «2», «il 2», «Rossi», «ORD-12» → il cantiere dell'elenco, se è uno solo. */
export function cantiereDalTesto(testo: string, candidati: Array<Pick<CantiereCandidato, "id" | "titolo" | "dettaglio">>): string | null {
  const t = normalizza(testo);
  if (!t) return null;
  const numero = t.match(/^(?:il |numero |n )?(\d{1,2})$/);
  if (numero) {
    const i = Number(numero[1]) - 1;
    return candidati[i]?.id ?? null;
  }
  if (t.length < 3) return null;
  const trovati = candidati.filter((c) => normalizza(`${c.titolo} ${c.dettaglio}`).includes(t));
  return trovati.length === 1 ? trovati[0].id : null;
}
