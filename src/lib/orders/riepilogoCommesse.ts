/**
 * Riepilogo commesse: i riquadri in alto nell'elenco Commesse e il grafico «Andamento commesse».
 * Ogni azienda sceglie quali 4 riquadri vedere e cosa mostra il grafico (tabella
 * company_riepilogo_commesse, si salva con riepilogo_commesse_salva).
 *
 * Un riquadro con importi, costi o margini si vede solo con il permesso giusto: chi non ce l'ha
 * vede al suo posto un riquadro operativo (numero di commesse, aperte, in ritardo…), mai la cifra.
 */
import { orderMarginKind, type OrderMarginRow } from "@/lib/orders/listScope";

export type RiquadroRiepilogo =
  | "commesse" | "venduto" | "incassato" | "da_incassare" | "ticket_medio"
  | "costi" | "margine" | "aperte" | "in_ritardo" | "assistenza" | "completate"
  | "fatturato" | "pregresso"
  // Commesse generali — appalti
  | "appalti_valore" | "appalti_da_eseguire" | "appalti_da_incassare" | "appalti_margine"
  // Commesse generali — sviluppo immobiliare e compravendita
  | "unita_vendute" | "unita_libere" | "operazioni_venduto" | "operazioni_incassato"
  | "capitale_impegnato" | "operazioni_margine";

/** Che permesso serve per vedere il riquadro. */
export type PermessoRiquadro = "nessuno" | "importi" | "costi" | "margini" | "fatturazione";
/** A quali commesse si riferisce: le generali compaiono solo se l'azienda ha acceso quel modello. */
export type GruppoRiquadro = "commesse" | "appalti" | "operazioni";

export interface VoceCatalogo {
  id: RiquadroRiepilogo;
  nome: string;
  spiegazione: string;
  permesso: PermessoRiquadro;
  gruppo: GruppoRiquadro;
}

export const CATALOGO_RIQUADRI: readonly VoceCatalogo[] = [
  { id: "commesse", nome: "Commesse dell'anno", spiegazione: "Quante commesse create nel periodo, con la media al mese.", permesso: "nessuno", gruppo: "commesse" },
  { id: "aperte", nome: "Commesse aperte", spiegazione: "Non ancora completate né in assistenza, anche quelle degli anni prima.", permesso: "nessuno", gruppo: "commesse" },
  { id: "in_ritardo", nome: "In ritardo", spiegazione: "Aperte con la data di posa prevista già passata.", permesso: "nessuno", gruppo: "commesse" },
  { id: "assistenza", nome: "In assistenza", spiegazione: "Commesse nella fase di assistenza.", permesso: "nessuno", gruppo: "commesse" },
  { id: "completate", nome: "Completate", spiegazione: "Commesse arrivate all'ultima fase.", permesso: "nessuno", gruppo: "commesse" },
  { id: "pregresso", nome: "Pregresso da gestire", spiegazione: "Commesse degli anni prima ancora aperte, in assistenza o con saldo.", permesso: "nessuno", gruppo: "commesse" },
  { id: "venduto", nome: "Venduto", spiegazione: "Totale venduto sulle commesse del periodo, IVA inclusa.", permesso: "importi", gruppo: "commesse" },
  { id: "incassato", nome: "Incassato", spiegazione: "Quanto riscosso su quelle commesse.", permesso: "importi", gruppo: "commesse" },
  { id: "da_incassare", nome: "Da incassare", spiegazione: "Quanto manca da incassare, con la quota sul venduto.", permesso: "importi", gruppo: "commesse" },
  { id: "ticket_medio", nome: "Valore medio commessa", spiegazione: "Venduto diviso per il numero di commesse.", permesso: "importi", gruppo: "commesse" },
  { id: "fatturato", nome: "Fatturato dell'anno", spiegazione: "Registro vendite dell'anno, imponibile, tutta l'azienda.", permesso: "fatturazione", gruppo: "commesse" },
  { id: "costi", nome: "Costi delle commesse", spiegazione: "Costi registrati sulle commesse del periodo; non include i costi fissi aziendali non attribuiti alle commesse.", permesso: "costi", gruppo: "commesse" },
  { id: "margine", nome: "Margine", spiegazione: "Margine sulle commesse che hanno costi registrati.", permesso: "margini", gruppo: "commesse" },
  { id: "appalti_valore", nome: "Valore appalti in corso", spiegazione: "Contratti con atti e varianti, appalti in corso.", permesso: "importi", gruppo: "appalti" },
  { id: "appalti_da_eseguire", nome: "Lavori da eseguire", spiegazione: "Valore degli appalti meno l'eseguito.", permesso: "importi", gruppo: "appalti" },
  { id: "appalti_da_incassare", nome: "Da incassare sugli appalti", spiegazione: "Fatturato agli appalti non ancora incassato.", permesso: "importi", gruppo: "appalti" },
  { id: "appalti_margine", nome: "Margine a finire appalti", spiegazione: "Stima del margine a lavori finiti, dagli appalti con il piano.", permesso: "margini", gruppo: "appalti" },
  { id: "unita_vendute", nome: "Unità vendute", spiegazione: "Unità con compromesso o rogito, su tutte quelle delle operazioni in corso.", permesso: "nessuno", gruppo: "operazioni" },
  { id: "unita_libere", nome: "Unità libere", spiegazione: "Unità ancora da vendere.", permesso: "nessuno", gruppo: "operazioni" },
  { id: "operazioni_venduto", nome: "Venduto unità", spiegazione: "Prezzo delle unità vendute nelle operazioni in corso.", permesso: "importi", gruppo: "operazioni" },
  { id: "operazioni_incassato", nome: "Incassato unità", spiegazione: "Caparre, acconti e saldi incassati sulle unità.", permesso: "importi", gruppo: "operazioni" },
  { id: "capitale_impegnato", nome: "Capitale impegnato", spiegazione: "Costi registrati meno incassi, a oggi, dalle operazioni con il piano.", permesso: "costi", gruppo: "operazioni" },
  { id: "operazioni_margine", nome: "Margine a finire operazioni", spiegazione: "Stima del margine a operazione finita, da quelle con il piano.", permesso: "margini", gruppo: "operazioni" },
];

export const NOMI_GRUPPI: Record<GruppoRiquadro, string> = {
  commesse: "Commesse",
  appalti: "Commesse generali · appalti",
  operazioni: "Commesse generali · sviluppo immobiliare e compravendita",
};

export const RIQUADRI_PREDEFINITI: RiquadroRiepilogo[] = ["venduto", "fatturato", "incassato", "costi"];
/** Chi non vede gli importi riempie i posti liberi con questi, nell'ordine. */
const RIQUADRI_DI_RISERVA: RiquadroRiepilogo[] = ["commesse", "aperte", "in_ritardo", "assistenza", "completate"];

export type SerieGrafico = "venduto" | "incassato" | "da_incassare";
export const CATALOGO_SERIE: readonly { id: SerieGrafico; nome: string; colore: string }[] = [
  { id: "venduto", nome: "Venduto", colore: "#2563eb" },
  { id: "incassato", nome: "Incassato", colore: "#f97316" },
  { id: "da_incassare", nome: "Da incassare", colore: "#64748b" },
];

export interface SceltaRiepilogo {
  riquadri: RiquadroRiepilogo[];
  graficoSerie: SerieGrafico[];
  graficoVista: "importi" | "numero";
  graficoForma: "linee" | "barre";
}

export const SCELTA_PREDEFINITA: SceltaRiepilogo = {
  riquadri: RIQUADRI_PREDEFINITI,
  graficoSerie: ["venduto", "incassato"],
  graficoVista: "importi",
  graficoForma: "linee",
};

const idRiquadri = new Set<string>(CATALOGO_RIQUADRI.map((v) => v.id));
const idSerie = new Set<string>(CATALOGO_SERIE.map((s) => s.id));

/** Dalla riga del database alla scelta; valori sconosciuti scartati, mancanti = predefiniti. */
export function sceltaDaRiga(riga?: {
  riquadri?: string[] | null; grafico_serie?: string[] | null; grafico_vista?: string | null; grafico_forma?: string | null;
} | null): SceltaRiepilogo {
  if (!riga) return SCELTA_PREDEFINITA;
  const riquadri = [...new Set((riga.riquadri ?? []).filter((r) => idRiquadri.has(r)))].slice(0, 4) as RiquadroRiepilogo[];
  const serie = [...new Set((riga.grafico_serie ?? []).filter((s) => idSerie.has(s)))] as SerieGrafico[];
  return {
    riquadri: riquadri.length ? riquadri : RIQUADRI_PREDEFINITI,
    graficoSerie: serie.length ? serie : SCELTA_PREDEFINITA.graficoSerie,
    graficoVista: riga.grafico_vista === "numero" ? "numero" : "importi",
    graficoForma: riga.grafico_forma === "barre" ? "barre" : "linee",
  };
}

export interface PermessiRiepilogo {
  importi: boolean; costi: boolean; margini: boolean;
  fatturazione?: boolean;
  /** L'azienda ha acceso le commesse generali di tipo appalto / sviluppo o compravendita. */
  appalti?: boolean; operazioni?: boolean;
}

export function puoVedereRiquadro(id: RiquadroRiepilogo, p: PermessiRiepilogo) {
  const voce = CATALOGO_RIQUADRI.find((v) => v.id === id);
  if (!voce) return false;
  if (voce.gruppo === "appalti" && !p.appalti) return false;
  if (voce.gruppo === "operazioni" && !p.operazioni) return false;
  const permesso = voce.permesso;
  return permesso === "nessuno" || (permesso === "importi" && p.importi)
    || (permesso === "costi" && p.costi) || (permesso === "margini" && p.margini)
    || (permesso === "fatturazione" && !!p.fatturazione);
}

/** Servono i numeri delle commesse generali (una chiamata in più) solo se un riquadro scelto li usa. */
export const usaGenerali = (riquadri: readonly RiquadroRiepilogo[]) =>
  riquadri.some((id) => CATALOGO_RIQUADRI.find((v) => v.id === id)?.gruppo !== "commesse");

/**
 * I riquadri da disegnare per chi guarda: quelli scelti che può vedere, nello stesso ordine;
 * i posti lasciati liberi da un riquadro non permesso si riempiono con riquadri operativi.
 * Il numero di riquadri resta quello scelto dall'azienda.
 */
export function riquadriVisibili(scelti: RiquadroRiepilogo[], p: PermessiRiepilogo): RiquadroRiepilogo[] {
  const visti = scelti.filter((id) => puoVedereRiquadro(id, p));
  const riserva = RIQUADRI_DI_RISERVA.filter((id) => !visti.includes(id) && !scelti.includes(id));
  const mancanti = scelti.length - visti.length;
  // I posti liberi prendono il posto di quelli tolti, così l'ordine scelto resta riconoscibile.
  const sostituti = riserva.slice(0, mancanti);
  let i = 0;
  return scelti.flatMap((id) => (puoVedereRiquadro(id, p) ? [id] : i < sostituti.length ? [sostituti[i++]] : []));
}

/** Le serie del grafico che chi guarda può vedere (tutte sono importi). */
export function serieVisibili(serie: SerieGrafico[], p: PermessiRiepilogo): SerieGrafico[] {
  return p.importi ? serie : [];
}

/** Commesse aperte con la data di posa prevista già passata. `oggi` in formato AAAA-MM-GG. */
export function commesseInRitardo(
  righe: readonly { id: string; expected_date?: string | null; current_status_id?: string | null }[],
  chiuse: ReadonlySet<string | null>, oggi: string,
) {
  return righe.filter((r) => !!r.expected_date && r.expected_date.slice(0, 10) < oggi && !chiuse.has(r.current_status_id ?? null)).length;
}

/** Margine sulle sole commesse del periodo con costi registrati: senza costi il margine sarebbe tutto venduto. */
export function margineDelPeriodo(righe: readonly OrderMarginRow[], ids: ReadonlySet<string>) {
  let margine = 0, ricavi = 0, conCosti = 0, senzaCosti = 0;
  for (const r of righe) {
    if (!r.id || !ids.has(r.id)) continue;
    if (orderMarginKind(r) === "missing_costs") { senzaCosti++; continue; }
    conCosti++;
    margine += Number(r.margine ?? 0);
    ricavi += Number(r.preventivo_totale ?? 0);
  }
  return { margine, percentuale: ricavi > 0 ? (margine / ricavi) * 100 : null, conCosti, senzaCosti };
}
