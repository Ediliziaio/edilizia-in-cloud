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
import { risolviTestiLegali, CONSENSO, type ClausolaAziendale } from "./quoteLegal.ts";

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
/** Le clausole del contratto di subappalto da approvare a parte (stessi articoli del testo stampato). */
export const CLAUSOLE_SUBAPPALTO: ClausolaFirma[] = [
  { id: "sub-pagamenti", testo: "Stati di avanzamento e pagamenti: i pagamenti sono subordinati alla verifica del SAL e alla regolarità contributiva (DURC)." },
  { id: "sub-ritenuta", testo: "Ritenuta di garanzia: su ogni SAL è trattenuta la percentuale pattuita, svincolata alla fine del periodo di garanzia." },
  { id: "sub-responsabilita", testo: "Personale e responsabilità: il committente può sospendere i pagamenti fino alla prova del pagamento di retribuzioni e contributi (art. 29 D.Lgs. 276/2003)." },
  { id: "sub-penali", testo: "Penali per il ritardo sul termine di fine lavori." },
  { id: "sub-divieto", testo: "Divieto di subappaltare i lavori senza autorizzazione scritta del committente." },
  { id: "sub-risoluzione", testo: "Risoluzione di diritto (art. 1456 c.c.) per gravi violazioni della sicurezza, DURC irregolare non sanato o subappalto non autorizzato." },
  { id: "sub-foro", testo: "Foro competente: quello della sede del committente." },
];

export async function clausoleDellaFirma(sb: any, r: RichiestaFirma): Promise<ClausolaFirma[]> {
  // Contratto di subappalto: le clausole che il testo del contratto chiede di
  // approvare specificamente (artt. 1341-1342 c.c.), una per una.
  if (r.tipo_documento === "subappalto") return CLAUSOLE_SUBAPPALTO;
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

/**
 * L'informativa privacy da accettare alla firma di un contratto (21/10/2026).
 * La firma con link del preventivo generico la chiedeva già; quella dei moduli
 * (Ristrutturazione, Bagni…) e del fotovoltaico no. Il testo è quello che
 * l'azienda ha scritto in Impostazioni → Condizioni e firma, altrimenti il
 * nostro. Per ordini di lavoro, verbali e documenti di cantiere: niente.
 */
// deno-lint-ignore no-explicit-any
export async function informativaPrivacyDellaFirma(sb: any, r: RichiestaFirma): Promise<string | null> {
  if (r.tipo_documento !== "quote" && r.tipo_documento !== "fv") return null;
  const { data } = await sb
    .from("quote_clause_templates")
    .select("id, category, title, content, active, sort_order, applicable_to")
    .eq("company_id", r.company_id)
    .eq("active", true);
  return risolviTestiLegali((data ?? []) as ClausolaAziendale[])[CONSENSO.PRIVACY] ?? null;
}
