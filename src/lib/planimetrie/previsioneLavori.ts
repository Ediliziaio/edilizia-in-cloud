/**
 * Previsione dei lavori di una variante (23/11/2026): quanto costa, quanto dura e quali
 * costi in più porta con sé, a partire dalle lavorazioni già quotate della pianta.
 *
 * Tutto a regole dichiarate, senza AI: rese di posa tipiche per una squadra di due
 * persone, incidenza della manodopera tipica per lavorazione, costi extra che si
 * accendono e si spengono. Sono ordini di grandezza per decidere, non un consuntivo:
 * ogni numero dice da dove viene e l'intervallo si allarga dove i prezzi sono indicativi.
 */
import { ePrezzoProposto, FONTE_INDICATIVA, tipoLavorazione, type TipoLavorazione } from "./prezziProposti";
import type { RigaStudio } from "./studioImmobiliare";

interface RegolaPosa {
  /** Quantità al giorno per una squadra di due persone (nell'unità della voce). */
  resa: number;
  /** Quota di manodopera sul prezzo, 0..1. */
  manodopera: number;
  fase: FasePrevisione;
}

export type FasePrevisione = "Demolizioni" | "Murature" | "Serramenti" | "Intonaci" | "Pavimenti e rivestimenti" | "Tinteggiature";
export const FASI_PREVISIONE: readonly FasePrevisione[] = ["Demolizioni", "Murature", "Serramenti", "Intonaci", "Pavimenti e rivestimenti", "Tinteggiature"];

export const REGOLE_POSA: Record<TipoLavorazione, RegolaPosa> = {
  demolizione_tramezzo: { resa: 20, manodopera: 0.85, fase: "Demolizioni" },
  demolizione_muratura: { resa: 6, manodopera: 0.8, fase: "Demolizioni" },
  rimozione_serramento: { resa: 8, manodopera: 0.9, fase: "Demolizioni" },
  macerie: { resa: 2, manodopera: 0.4, fase: "Demolizioni" },
  nuovo_tramezzo: { resa: 12, manodopera: 0.55, fase: "Murature" },
  nuova_muratura: { resa: 6, manodopera: 0.5, fase: "Murature" },
  chiusura_vano: { resa: 6, manodopera: 0.6, fase: "Murature" },
  varco: { resa: 2, manodopera: 0.7, fase: "Murature" },
  porta: { resa: 3, manodopera: 0.2, fase: "Serramenti" },
  finestra: { resa: 3, manodopera: 0.15, fase: "Serramenti" },
  portafinestra: { resa: 2, manodopera: 0.15, fase: "Serramenti" },
  intonaco: { resa: 25, manodopera: 0.7, fase: "Intonaci" },
  ripristino: { resa: 8, manodopera: 0.6, fase: "Pavimenti e rivestimenti" },
  pavimento: { resa: 18, manodopera: 0.4, fase: "Pavimenti e rivestimenti" },
  rivestimento: { resa: 12, manodopera: 0.45, fase: "Pavimenti e rivestimenti" },
  battiscopa: { resa: 40, manodopera: 0.5, fase: "Pavimenti e rivestimenti" },
  tinteggiatura: { resa: 60, manodopera: 0.75, fase: "Tinteggiature" },
};

/** Giorni di attesa obbligata prima che parta la fase: l'intonaco deve asciugare prima della pittura. */
export const ATTESE: Partial<Record<FasePrevisione, { dopo: FasePrevisione; giorni: number; perche: string }>> = {
  Tinteggiature: { dopo: "Intonaci", giorni: 14, perche: "asciugatura dell'intonaco prima della pittura" },
};

export type RegolaExtra = { tipo: "a_corpo"; importo: number } | { tipo: "percentuale"; percento: number };
export interface CostoExtra {
  id: string;
  nome: string;
  regola: RegolaExtra;
  /** Si accende da solo solo quando serve (pratica edilizia: se si toccano le pareti). */
  quando?: "pareti";
  perche: string;
}

export const COSTI_EXTRA: readonly CostoExtra[] = [
  { id: "cantiere", nome: "Allestimento del cantiere e protezioni", regola: { tipo: "a_corpo", importo: 450 }, perche: "Teli, protezione di pavimenti e parti comuni, quadro di cantiere" },
  { id: "pratica", nome: "Pratica edilizia (CILA) e direzione lavori", regola: { tipo: "a_corpo", importo: 1500 }, quando: "pareti", perche: "Spostare o demolire pareti cambia la distribuzione: serve un tecnico" },
  { id: "sicurezza", nome: "Oneri della sicurezza", regola: { tipo: "percentuale", percento: 3 }, perche: "Dispositivi, apprestamenti e coordinamento" },
  { id: "pulizia", nome: "Pulizia di fine cantiere", regola: { tipo: "a_corpo", importo: 250 }, perche: "Pulizia fine e sgombero prima della consegna" },
  { id: "imprevisti", nome: "Imprevisti", regola: { tipo: "percentuale", percento: 8 }, perche: "Impianti nelle pareti, sottofondi da rifare, misure diverse dal rilievo" },
];

export interface FaseStimata {
  fase: FasePrevisione;
  importo: number;
  manodopera: number;
  materiali: number;
  /** Giorni di lavoro della squadra, arrotondati al mezzo giorno. */
  giorni: number;
  /** Giorni di attesa obbligata prima di questa fase. */
  attesa: number;
  perche?: string;
  voci: number;
}

export interface Previsione {
  fasi: FaseStimata[];
  lavori: number;
  manodopera: number;
  materiali: number;
  extra: { id: string; nome: string; importo: number; regola: string; perche: string }[];
  totaleExtra: number;
  totale: number;
  /** Ottimista, probabile, prudente: si allarga dove i prezzi sono indicativi. */
  intervallo: { minimo: number; probabile: number; massimo: number; incertezzaPct: number };
  giorniLavoro: number;
  giorniAttesa: number;
  /** Giorni di calendario: cinque giorni lavorativi a settimana, più le attese. */
  giorniCalendario: number;
  /** Voci fuori dalla previsione: senza prezzo, senza quantità o di un genere che non so stimare. */
  fuori: { senzaPrezzo: number; senzaQuantita: number; nonStimate: number };
  indicativi: number;
}

const euro2 = (n: number) => Math.round(n * 100) / 100;
const mezzoGiorno = (g: number) => Math.max(0.5, Math.ceil(g * 2) / 2);

/** Gli extra accesi in partenza per queste lavorazioni. */
export function extraPredefiniti(righe: readonly Pick<RigaStudio, "id" | "descrizione">[]): string[] {
  const pareti = righe.some((r) => ["demolizione_tramezzo", "demolizione_muratura", "nuovo_tramezzo", "nuova_muratura", "varco", "chiusura_vano"].includes(tipoLavorazione(r) ?? ""));
  return COSTI_EXTRA.filter((e) => e.quando !== "pareti" || pareti).map((e) => e.id);
}

export function previsioneLavori(righe: readonly RigaStudio[], extraAccesi: readonly string[] = extraPredefiniti(righe)): Previsione {
  const perFase = new Map<FasePrevisione, FaseStimata & { giorniEsatti: number }>();
  const fuori = { senzaPrezzo: 0, senzaQuantita: 0, nonStimate: 0 };
  let indicativi = 0, importoIndicativo = 0, importoProposto = 0, altriLavori = 0;
  for (const r of righe) {
    if (r.quantita === null) { fuori.senzaQuantita++; continue; }
    if (!r.prezzo || r.prezzo.unita !== r.unita) { fuori.senzaPrezzo++; continue; }
    const importo = euro2(r.quantita * r.prezzo.importo);
    if (r.prezzo.fonte === FONTE_INDICATIVA) { indicativi++; importoIndicativo += importo; }
    else if (ePrezzoProposto(r.prezzo)) importoProposto += importo;
    const tipo = tipoLavorazione(r);
    if (!tipo) { fuori.nonStimate++; altriLavori += importo; continue; }
    const regola = REGOLE_POSA[tipo];
    const f = perFase.get(regola.fase) ?? { fase: regola.fase, importo: 0, manodopera: 0, materiali: 0, giorni: 0, attesa: 0, voci: 0, giorniEsatti: 0 };
    f.importo += importo;
    f.manodopera += importo * regola.manodopera;
    f.giorniEsatti += r.quantita / regola.resa;
    f.voci++;
    perFase.set(regola.fase, f);
  }
  const fasi = FASI_PREVISIONE.flatMap((nome) => {
    const f = perFase.get(nome);
    if (!f) return [];
    const attesa = ATTESE[nome];
    const { giorniEsatti, ...resto } = f;
    return [{ ...resto, importo: euro2(f.importo), manodopera: euro2(f.manodopera), materiali: euro2(f.importo - f.manodopera), giorni: mezzoGiorno(giorniEsatti),
      attesa: attesa && perFase.has(attesa.dopo) ? attesa.giorni : 0, perche: attesa && perFase.has(attesa.dopo) ? attesa.perche : undefined }];
  });
  const stimati = fasi.reduce((s, f) => s + f.importo, 0);
  const lavori = euro2(stimati + altriLavori);
  const manodopera = euro2(fasi.reduce((s, f) => s + f.manodopera, 0));
  const extra = COSTI_EXTRA.filter((e) => extraAccesi.includes(e.id) && lavori > 0).map((e) => ({
    id: e.id, nome: e.nome, perche: e.perche,
    importo: e.regola.tipo === "a_corpo" ? e.regola.importo : euro2(lavori * e.regola.percento / 100),
    regola: e.regola.tipo === "a_corpo" ? "a corpo" : `${e.regola.percento}% dei lavori`,
  }));
  const totaleExtra = euro2(extra.reduce((s, e) => s + e.importo, 0));
  const totale = euro2(lavori + totaleExtra);
  // Un prezzo dal listino dell'azienda oscilla poco, uno indicativo molto: l'incertezza è la media pesata sugli importi.
  const incertezza = lavori > 0 ? (importoIndicativo * 0.25 + importoProposto * 0.08 + (lavori - importoIndicativo - importoProposto) * 0.05) / lavori : 0;
  const imprevisti = extra.find((e) => e.id === "imprevisti")?.importo ?? 0;
  const giorniLavoro = fasi.reduce((s, f) => s + f.giorni, 0);
  const giorniAttesa = fasi.reduce((s, f) => s + f.attesa, 0);
  return {
    fasi, lavori, manodopera, materiali: euro2(stimati - manodopera), extra, totaleExtra, totale,
    intervallo: { minimo: euro2(totale - imprevisti - lavori * incertezza), probabile: totale, massimo: euro2(totale + lavori * incertezza), incertezzaPct: Math.round(incertezza * 100) },
    giorniLavoro, giorniAttesa, giorniCalendario: giorniLavoro ? Math.ceil(giorniLavoro * 7 / 5) + giorniAttesa : 0,
    fuori, indicativi,
  };
}
