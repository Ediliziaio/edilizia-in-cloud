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
  // Testo standard del 31/10/2026 (contratto di Dimora Torino reso generico): stessi titoli di ARTICOLI_APPROVAZIONE_SPECIFICA.
  { id: "sub-pagamenti", testo: "Pagamenti: prezzo pattuito, pagamenti subordinati al DURC regolare, detrazione dei materiali forniti dall'Affidataria e ritenuta di garanzia se pattuita." },
  { id: "sub-penali", testo: "Penali per ritardi e assenze ingiustificate: 200 € al giorno fino al decimo giorno lavorativo, 400 € dall'undicesimo (o quelle scritte nel contratto)." },
  { id: "sub-rifacimento", testo: "Sistemazione e rifacimento: vizi e difformità corretti a proprie spese entro 3 giorni, con penale di 150 € per giorno di ritardo." },
  { id: "sub-modifiche", testo: "Divieto di modifica: le modifiche non autorizzate per iscritto non si contabilizzano; il rifiuto ingiustificato delle varianti chieste consente la risoluzione." },
  { id: "sub-garanzie", testo: "Garanzie dei lavori: vizi eliminati entro 3 giorni anche dopo il collaudo, penale di 150 € al giorno, garanzie degli artt. 1667-1669 c.c." },
  { id: "sub-divieto", testo: "Divieto di subappalto: nessuna cessione o subappalto, anche parziale; la violazione consente la risoluzione immediata." },
  { id: "sub-personale", testo: "Personale non regolarmente assunto: risoluzione immediata e sospensione dei pagamenti (responsabilità solidale, art. 29 D.Lgs. 276/2003)." },
  { id: "sub-risoluzione", testo: "Risoluzione del contratto: casi di risoluzione, pagamento dei soli lavori eseguiti e accettati, liberazione del cantiere entro 3 giorni con penale di 300 € al giorno." },
  { id: "sub-foro", testo: "Mediazione e foro competente: prima la mediazione, poi il foro della sede dell'Affidataria." },
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
