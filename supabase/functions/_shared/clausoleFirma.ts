/**
 * Le clausole che chi firma approva con una seconda firma (art. 1341 c.c.).
 *
 * Prima valevano solo per i privati e solo se l'azienda le aveva scritte in
 * `fea_configurazione`: quasi nessuna lo aveva fatto, e il server non
 * controllava nemmeno che fossero approvate. Ora ogni contratto (preventivo dei
 * moduli, fotovoltaico, preventivo generico) le porta, per privati e aziende:
 *  1. le clausole scritte dall'azienda in `fea_configurazione`, se ci sono;
 *  2. altrimenti quelle delle condizioni standard del settore, le stesse
 *     elencate sotto «Clausole da approvare specificamente» nel documento.
 * Ordini di lavoro, verbali e documenti di cantiere non sono contratti: niente
 * clausole (salvo quelle che l'azienda ha scritto per i privati, come prima).
 *
 * Le usano fea-documento-pubblico (le mostra) e fea-completa-firma (le pretende).
 */
import {
  clausoleDaApprovare, condizioniStandard, righeDelleCondizioni, type SettoreCondizioni,
} from "./condizioniStandard.ts";

export interface ClausolaFirma {
  id: string;
  testo: string;
}

/** Chiave del ponte dei moduli (quotes.source = modulo:<chiave>:<id>) → settore delle condizioni. */
const SETTORE_DEL_MODULO: Record<string, SettoreCondizioni> = {
  rst: "ristrutturazione", bagni: "bagni", tetti: "tetti", clm: "climatizzazione",
  ele: "elettrico", idr: "termoidraulico", pav: "pavimenti", pis: "piscine", sr: "serramenti",
};

interface RichiestaFirma {
  company_id: string;
  tipo_documento: string | null;
  tipo_firmatario: string | null;
  quote_id?: string | null;
  fv_progetto_id?: string | null;
}

// deno-lint-ignore no-explicit-any
export async function clausoleDellaFirma(sb: any, r: RichiestaFirma): Promise<ClausolaFirma[]> {
  const eContratto = r.tipo_documento === "quote" || r.tipo_documento === "fv";

  // Quelle scritte dall'azienda.
  const { data: config } = await sb
    .from("fea_configurazione")
    .select("clausole_vess")
    .eq("company_id", r.company_id)
    .maybeSingle();
  const scritte: ClausolaFirma[] = (Array.isArray(config?.clausole_vess) ? config.clausole_vess : [])
    .filter((c: { id?: unknown; testo?: unknown }) => typeof c?.id === "string" && c.id.trim() !== "" && typeof c?.testo === "string" && c.testo.trim())
    .map((c: { id: string; testo: string }) => ({ id: c.id, testo: c.testo }));
  if (scritte.length && (eContratto || r.tipo_firmatario === "b2c")) return scritte;
  if (!eContratto) return [];

  // Le condizioni standard del settore.
  let settore: SettoreCondizioni = "generico";
  if (r.tipo_documento === "fv") {
    settore = "fotovoltaico";
  } else if (r.quote_id) {
    const { data: q } = await sb.from("quotes").select("source").eq("id", r.quote_id).maybeSingle();
    const m = /^modulo:([a-z]+):/.exec(String(q?.source ?? ""));
    if (m && SETTORE_DEL_MODULO[m[1]]) settore = SETTORE_DEL_MODULO[m[1]];
  }
  return clausoleDaApprovare(righeDelleCondizioni(condizioniStandard(settore)))
    .map((testo, i) => ({ id: `std-${i + 1}`, testo }));
}
