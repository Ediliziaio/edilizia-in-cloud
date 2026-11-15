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
  | "costi" | "margine" | "aperte" | "in_ritardo" | "assistenza" | "completate";

/** Che permesso serve per vedere il riquadro. */
export type PermessoRiquadro = "nessuno" | "importi" | "costi" | "margini";

export interface VoceCatalogo {
  id: RiquadroRiepilogo;
  nome: string;
  spiegazione: string;
  permesso: PermessoRiquadro;
}

export const CATALOGO_RIQUADRI: readonly VoceCatalogo[] = [
  { id: "commesse", nome: "Commesse dell'anno", spiegazione: "Quante commesse create nel periodo, con la media al mese.", permesso: "nessuno" },
  { id: "aperte", nome: "Commesse aperte", spiegazione: "Non ancora completate né in assistenza, anche quelle degli anni prima.", permesso: "nessuno" },
  { id: "in_ritardo", nome: "In ritardo", spiegazione: "Aperte con la data di posa prevista già passata.", permesso: "nessuno" },
  { id: "assistenza", nome: "In assistenza", spiegazione: "Commesse nella fase di assistenza.", permesso: "nessuno" },
  { id: "completate", nome: "Completate", spiegazione: "Commesse arrivate all'ultima fase.", permesso: "nessuno" },
  { id: "venduto", nome: "Venduto", spiegazione: "Totale venduto sulle commesse del periodo, IVA inclusa.", permesso: "importi" },
  { id: "incassato", nome: "Incassato", spiegazione: "Quanto riscosso su quelle commesse.", permesso: "importi" },
  { id: "da_incassare", nome: "Da incassare", spiegazione: "Quanto manca da incassare, con la quota sul venduto.", permesso: "importi" },
  { id: "ticket_medio", nome: "Valore medio commessa", spiegazione: "Venduto diviso per il numero di commesse.", permesso: "importi" },
  { id: "costi", nome: "Costi sostenuti", spiegazione: "Costi registrati sulle commesse del periodo.", permesso: "costi" },
  { id: "margine", nome: "Margine", spiegazione: "Margine sulle commesse che hanno costi registrati.", permesso: "margini" },
];

export const RIQUADRI_PREDEFINITI: RiquadroRiepilogo[] = ["commesse", "venduto", "incassato", "da_incassare"];
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

export interface PermessiRiepilogo { importi: boolean; costi: boolean; margini: boolean }

export function puoVedereRiquadro(id: RiquadroRiepilogo, p: PermessiRiepilogo) {
  const permesso = CATALOGO_RIQUADRI.find((v) => v.id === id)?.permesso ?? "nessuno";
  return permesso === "nessuno" || (permesso === "importi" && p.importi)
    || (permesso === "costi" && p.costi) || (permesso === "margini" && p.margini);
}

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
