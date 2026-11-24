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
import { tipoCostruzione } from "./nuovaCostruzione";

/**
 * Quando cambiano rese, quote di manodopera, attese o extra, cambia questa data: le previsioni
 * salvate con la commessa (commessa_previsioni_lavori) dicono con quali regole sono nate, e il
 * confronto col consuntivo non mescola regole diverse.
 */
export const VERSIONE_REGOLE_PREVISIONE = "2026-11-24";

interface RegolaPosa {
  /** Quantità al giorno per una squadra di due persone (nell'unità della voce). */
  resa: number;
  /** Quota di manodopera sul prezzo, 0..1. */
  manodopera: number;
  fase: FasePrevisione;
}

export type FasePrevisione = "Demolizioni" | "Opere provvisionali" | "Scavi" | "Fondazioni" | "Strutture" | "Solai e copertura"
  | "Murature" | "Isolamenti e facciate" | "Serramenti" | "Impianti" | "Intonaci" | "Pavimento radiante" | "Massetti"
  | "Pavimenti e rivestimenti" | "Tinteggiature" | "Esterni";
/** L'ordine del cantiere: le fasi di una nuova costruzione stanno prima e dopo quelle di sempre. */
export const FASI_PREVISIONE: readonly FasePrevisione[] = ["Demolizioni", "Opere provvisionali", "Scavi", "Fondazioni", "Strutture", "Solai e copertura",
  "Murature", "Isolamenti e facciate", "Serramenti", "Impianti", "Intonaci", "Pavimento radiante", "Massetti", "Pavimenti e rivestimenti", "Tinteggiature", "Esterni"];

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
  radiante_pannelli: { resa: 40, manodopera: 0.35, fase: "Pavimento radiante" },
  radiante_tubo: { resa: 250, manodopera: 0.4, fase: "Pavimento radiante" },
  radiante_collettore: { resa: 1, manodopera: 0.3, fase: "Pavimento radiante" },
  ripristino: { resa: 8, manodopera: 0.6, fase: "Pavimenti e rivestimenti" },
  pavimento: { resa: 18, manodopera: 0.4, fase: "Pavimenti e rivestimenti" },
  rivestimento: { resa: 12, manodopera: 0.45, fase: "Pavimenti e rivestimenti" },
  battiscopa: { resa: 40, manodopera: 0.5, fase: "Pavimenti e rivestimenti" },
  tinteggiatura: { resa: 60, manodopera: 0.75, fase: "Tinteggiature" },
  // Nuova costruzione: rese di una squadra di due persone, con i mezzi dove servono (escavatore, autopompa).
  ponteggio: { resa: 120, manodopera: 0.6, fase: "Opere provvisionali" },
  svuotamento: { resa: 20, manodopera: 0.75, fase: "Demolizioni" },
  rimozione_copertura: { resa: 30, manodopera: 0.7, fase: "Demolizioni" },
  micropali: { resa: 40, manodopera: 0.4, fase: "Fondazioni" },
  adeguamento_sismico: { resa: 8, manodopera: 0.55, fase: "Strutture" },
  scavo: { resa: 80, manodopera: 0.35, fase: "Scavi" },
  rinterro: { resa: 80, manodopera: 0.35, fase: "Scavi" },
  trasporto_terre: { resa: 100, manodopera: 0.3, fase: "Scavi" },
  magrone: { resa: 60, manodopera: 0.4, fase: "Fondazioni" },
  fondazioni_ca: { resa: 6, manodopera: 0.45, fase: "Fondazioni" },
  muri_controterra: { resa: 4, manodopera: 0.45, fase: "Fondazioni" },
  impermeabilizzazione_controterra: { resa: 30, manodopera: 0.5, fase: "Fondazioni" },
  vespaio: { resa: 40, manodopera: 0.35, fase: "Fondazioni" },
  struttura_ca: { resa: 2.5, manodopera: 0.5, fase: "Strutture" },
  cordoli_ca: { resa: 3, manodopera: 0.5, fase: "Strutture" },
  struttura_legno: { resa: 4, manodopera: 0.35, fase: "Strutture" },
  solaio_laterocemento: { resa: 25, manodopera: 0.45, fase: "Solai e copertura" },
  solaio_predalles: { resa: 35, manodopera: 0.4, fase: "Solai e copertura" },
  solaio_legno: { resa: 25, manodopera: 0.4, fase: "Solai e copertura" },
  copertura: { resa: 15, manodopera: 0.45, fase: "Solai e copertura" },
  terrazzo: { resa: 15, manodopera: 0.45, fase: "Solai e copertura" },
  scala: { resa: 0.25, manodopera: 0.55, fase: "Solai e copertura" },
  tamponatura: { resa: 12, manodopera: 0.5, fase: "Murature" },
  cappotto: { resa: 15, manodopera: 0.55, fase: "Isolamenti e facciate" },
  intonaco_esterno: { resa: 25, manodopera: 0.7, fase: "Isolamenti e facciate" },
  isolamento_pavimento: { resa: 80, manodopera: 0.35, fase: "Massetti" },
  massetto: { resa: 70, manodopera: 0.45, fase: "Massetti" },
  impianto_elettrico: { resa: 20, manodopera: 0.55, fase: "Impianti" },
  bagno_completo: { resa: 0.35, manodopera: 0.5, fase: "Impianti" },
  attacchi_cucina: { resa: 1.5, manodopera: 0.55, fase: "Impianti" },
  riscaldamento_radiante: { resa: 40, manodopera: 0.35, fase: "Pavimento radiante" },
  riscaldamento_radiatori: { resa: 25, manodopera: 0.45, fase: "Impianti" },
  pompa_di_calore: { resa: 0.5, manodopera: 0.3, fase: "Impianti" },
  caldaia: { resa: 1, manodopera: 0.3, fase: "Impianti" },
  portoncino: { resa: 2, manodopera: 0.15, fase: "Serramenti" },
  marciapiede: { resa: 15, manodopera: 0.5, fase: "Esterni" },
  allacciamenti: { resa: 0.3, manodopera: 0.5, fase: "Esterni" },
};

interface Attesa { dopo: FasePrevisione; giorni: number; perche: string }
/**
 * Giorni di attesa obbligata prima che parta la fase: l'intonaco deve asciugare prima della pittura.
 * Con più possibilità vale la prima la cui fase precedente c'è.
 */
export const ATTESE: Partial<Record<FasePrevisione, Attesa | readonly Attesa[]>> = {
  Tinteggiature: { dopo: "Intonaci", giorni: 14, perche: "asciugatura dell'intonaco prima della pittura" },
  "Pavimenti e rivestimenti": [
    { dopo: "Pavimento radiante", giorni: 21, perche: "maturazione del massetto sopra il radiante prima di posare" },
    { dopo: "Massetti", giorni: 21, perche: "maturazione del massetto prima di posare" },
  ],
  Strutture: { dopo: "Fondazioni", giorni: 7, perche: "maturazione del calcestruzzo delle fondazioni prima di caricarle" },
  Murature: { dopo: "Solai e copertura", giorni: 28, perche: "disarmo e maturazione dei solai prima delle murature" },
};

/** L'attesa che vale davanti a questa fase, date le fasi presenti. */
export function attesaPer(fase: FasePrevisione, presenti: { has(f: FasePrevisione): boolean }): Attesa | undefined {
  const regola = ATTESE[fase];
  const candidate = !regola ? [] : Array.isArray(regola) ? regola : [regola as Attesa];
  return candidate.find((a) => presenti.has(a.dopo));
}

/**
 * Squadre in parallelo per fase in una nuova costruzione: murature, impianti e finiture li fanno
 * più squadre (spesso ditte diverse) insieme. Nelle ristrutturazioni resta una squadra.
 */
export const SQUADRE_COSTRUZIONE: Partial<Record<FasePrevisione, number>> = {
  Murature: 3, "Isolamenti e facciate": 2, Impianti: 3, Intonaci: 3, "Pavimenti e rivestimenti": 2, Tinteggiature: 2,
};

export type RegolaExtra = { tipo: "a_corpo"; importo: number } | { tipo: "percentuale"; percento: number };
export interface CostoExtra {
  id: string;
  nome: string;
  regola: RegolaExtra;
  /**
   * Si accende da solo solo quando serve: «pareti» se si toccano le pareti (pratica edilizia),
   * «costruzione» per una nuova costruzione, «ristrutturazione» per tutto il resto.
   */
  quando?: "pareti" | "costruzione" | "ristrutturazione";
  perche: string;
}

export const COSTI_EXTRA: readonly CostoExtra[] = [
  { id: "cantiere", nome: "Allestimento del cantiere e protezioni", regola: { tipo: "a_corpo", importo: 450 }, quando: "ristrutturazione", perche: "Teli, protezione di pavimenti e parti comuni, quadro di cantiere" },
  { id: "pratica", nome: "Pratica edilizia (CILA) e direzione lavori", regola: { tipo: "a_corpo", importo: 1500 }, quando: "pareti", perche: "Spostare o demolire pareti cambia la distribuzione: serve un tecnico" },
  { id: "cantiere_costruzione", nome: "Impianto di cantiere: recinzione, baraccamenti, gru e allacci provvisori", regola: { tipo: "percentuale", percento: 2.5 }, quando: "costruzione", perche: "Un edificio nuovo ha bisogno di un cantiere attrezzato per tutta la durata dei lavori" },
  { id: "progetto_costruzione", nome: "Progetto, permesso di costruire e direzione lavori", regola: { tipo: "percentuale", percento: 7 }, quando: "costruzione", perche: "Progetto architettonico, pratica comunale e direzione dei lavori" },
  { id: "strutturale", nome: "Calcoli strutturali, deposito sismico e collaudo statico", regola: { tipo: "percentuale", percento: 2.5 }, quando: "costruzione", perche: "Obbligatori per strutture nuove; sostituiscono anche le stime parametriche della struttura" },
  { id: "oneri_comunali", nome: "Oneri di urbanizzazione e costo di costruzione", regola: { tipo: "percentuale", percento: 3 }, quando: "costruzione", perche: "Ordine di grandezza: li calcola il Comune sulla superficie e sulla zona" },
  { id: "sicurezza", nome: "Oneri della sicurezza", regola: { tipo: "percentuale", percento: 3 }, perche: "Dispositivi, apprestamenti e coordinamento" },
  { id: "pulizia", nome: "Pulizia di fine cantiere", regola: { tipo: "a_corpo", importo: 250 }, perche: "Pulizia fine e sgombero prima della consegna" },
  { id: "imprevisti", nome: "Imprevisti", regola: { tipo: "percentuale", percento: 8 }, perche: "Impianti nelle pareti, sottofondi da rifare, misure diverse dal rilievo" },
];

export interface FaseStimata {
  fase: FasePrevisione;
  importo: number;
  manodopera: number;
  materiali: number;
  /** Giorni di lavoro della squadra, arrotondati al mezzo giorno (con la correzione dell'azienda, se c'è). */
  giorni: number;
  /** Giorni con le rese tipiche, prima della correzione: è da questi che la correzione impara. */
  giorniBase: number;
  /** Fattore delle rese dell'azienda applicato a questa fase (correzioneRese.ts); assente se nessuno. */
  correzione?: number;
  /** Giorni di attesa obbligata prima di questa fase. */
  attesa: number;
  /** Squadre in parallelo (nuova costruzione); assente se una. */
  squadre?: number;
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
  const costruzione = righe.some((r) => tipoCostruzione(r.id));
  const pareti = !costruzione && righe.some((r) => ["demolizione_tramezzo", "demolizione_muratura", "nuovo_tramezzo", "nuova_muratura", "varco", "chiusura_vano"].includes(tipoLavorazione(r) ?? ""));
  return COSTI_EXTRA.filter((e) => e.quando === undefined || (e.quando === "pareti" && pareti)
    || (e.quando === "costruzione" && costruzione) || (e.quando === "ristrutturazione" && !costruzione)).map((e) => e.id);
}

export function previsioneLavori(
  righe: readonly RigaStudio[],
  extraAccesi: readonly string[] = extraPredefiniti(righe),
  /** Giorni veri / giorni previsti per fase, dalle commesse chiuse dell'azienda (correzioneRese). */
  correzione: Partial<Record<FasePrevisione, number>> = {},
): Previsione {
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
    const f = perFase.get(regola.fase) ?? { fase: regola.fase, importo: 0, manodopera: 0, materiali: 0, giorni: 0, giorniBase: 0, attesa: 0, voci: 0, giorniEsatti: 0 };
    f.importo += importo;
    f.manodopera += importo * regola.manodopera;
    f.giorniEsatti += r.quantita / regola.resa;
    f.voci++;
    perFase.set(regola.fase, f);
  }
  const costruzione = righe.some((r) => tipoCostruzione(r.id));
  const fasi = FASI_PREVISIONE.flatMap((nome) => {
    const f = perFase.get(nome);
    if (!f) return [];
    const attesa = attesaPer(nome, perFase);
    const squadre = costruzione ? SQUADRE_COSTRUZIONE[nome] ?? 1 : 1;
    const { giorniEsatti: giorniUnaSquadra, ...resto } = f;
    const giorniEsatti = giorniUnaSquadra / squadre;
    const k = correzione[nome];
    return [{ ...resto, importo: euro2(f.importo), manodopera: euro2(f.manodopera), materiali: euro2(f.importo - f.manodopera),
      giorni: mezzoGiorno(giorniEsatti * (k ?? 1)), giorniBase: mezzoGiorno(giorniEsatti), ...(k ? { correzione: k } : {}),
      attesa: attesa?.giorni ?? 0, perche: attesa?.perche, ...(squadre > 1 ? { squadre } : {}) }];
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
