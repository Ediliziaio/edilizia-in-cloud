/**
 * Planimetrie — quantità per il computo metrico.
 *
 * Ogni quantità ha una CHIAVE STABILE che il computo salva nelle righe di misura
 * (`computo_voci_misure.planimetria_chiavi`) e rilegge quando la pianta cambia:
 *
 *   <ambito>:<soggetto>.<misura>
 *   ambito   = fatto | progetto:<id proposta>
 *   soggetto = locale:<id> | destinazione:<destinazione> | pianta | muro:<id>
 *            | demolizioni | costruzioni | aperture:<stato>:<tipo>[:<L>x<H>]
 *
 * Elenco completo e regole in docs/planimetrie/modello.md. Non cambiare il nome di
 * una chiave esistente: i computi già salvati la cercano.
 *
 * Regole di misura (prassi del computo, configurabili dove indicato):
 * - superfici e lunghezze dei locali al filo interno delle pareti;
 * - pareti lorde = perimetro × altezza del locale;
 * - pareti nette = lorde meno i vuoti di superficie SUPERIORE alla soglia (4 mq),
 *   per intero («vuoto per pieno» sotto soglia). Del vuoto conta solo la parte che
 *   cade nella superficie misurata (fino all'altezza del locale o del rivestimento).
 *   `deduzione: "eccedenza"` detrae solo la parte oltre la soglia;
 * - battiscopa = perimetro meno la larghezza delle aperture a filo pavimento
 *   (davanzale 0: porte, portefinestre, varchi);
 * - pareti (muri) misurate sull'asse: lunghezza × altezza, meno i vuoti oltre soglia;
 *   volume = superficie × spessore;
 * - valori arrotondati a 4 decimali (come le righe di misura del computo).
 * Ogni quantità porta l'origine peggiore delle misure usate: se ne usa una stimata,
 * è stimata.
 */
import {
  ambitiDi,
  originePeggiore,
  origineMisura,
  statoDelLivello,
  type Ambito,
  type Apertura,
  type Locale,
  type Muro,
  type Origine,
  type Planimetria,
  type StatoPianta,
} from "./modello.ts";
import { TOLLERANZA_LOCALE_CM, apertureDelLocale, areaPoligono, lunghezzaMuro, perimetroPoligono } from "./geometria.ts";

export type UnitaQuantita = "mq" | "ml" | "mc" | "n";

export interface Quantita {
  chiave: string;
  valore: number;
  unita: UnitaQuantita;
  origine: Origine;
  /** Pronta per la descrizione della riga di misura: «Pavimento — Bagno». */
  descrizione: string;
  ambito: string;
  livelloId?: string;
  /** Locale o parete a cui si riferisce, se è di un oggetto solo. */
  oggettoId?: string;
}

export type MappaQuantita = Record<string, Quantita>;

export interface OpzioniQuantita {
  /** Vuoti fino a questa superficie (mq) non si detraggono. Default 4. */
  sogliaDeduzioneMq?: number;
  /** «intera»: oltre soglia si detrae tutto il vuoto (default); «eccedenza»: solo la parte oltre soglia. */
  deduzione?: "intera" | "eccedenza";
  /** Distanza massima fra il lato di un'apertura e il contorno del locale, in cm. */
  tolleranzaCm?: number;
}

export const OPZIONI_QUANTITA_PREDEFINITE: Required<OpzioniQuantita> = {
  sogliaDeduzioneMq: 4,
  deduzione: "intera",
  tolleranzaCm: TOLLERANZA_LOCALE_CM,
};

export type MisuraLocale =
  | "pavimento_mq"
  | "perimetro_ml"
  | "pareti_lorde_mq"
  | "pareti_nette_mq"
  | "soffitto_mq"
  | "volume_mc"
  | "battiscopa_ml"
  | "rivestimento_mq";

export const ETICHETTE_MISURE_LOCALE: Record<MisuraLocale, string> = {
  pavimento_mq: "Pavimento",
  perimetro_ml: "Perimetro",
  pareti_lorde_mq: "Pareti (lorde)",
  pareti_nette_mq: "Pareti al netto delle aperture",
  soffitto_mq: "Soffitto",
  volume_mc: "Volume",
  battiscopa_ml: "Battiscopa",
  rivestimento_mq: "Rivestimento",
};

const ORDINE_MISURE = Object.keys(ETICHETTE_MISURE_LOCALE) as MisuraLocale[];
const unitaDi = (misura: string): UnitaQuantita =>
  misura.endsWith("_mq") ? "mq" : misura.endsWith("_mc") ? "mc" : misura.endsWith("_ml") ? "ml" : "n";

export const arrotonda = (v: number) => Math.round(v * 10_000) / 10_000 + 0;

/** Scompone una chiave; null se non è una chiave di quantità. */
export function leggiChiave(chiave: string): { ambito: string; propostaId: string | null; soggetto: string; misura: string } | null {
  const m = /^(fatto|progetto:([A-Za-z0-9_-]+)):(.+)\.([a-z_]+)$/.exec(chiave);
  if (!m) return null;
  return { ambito: m[1], propostaId: m[2] ?? null, soggetto: m[3], misura: m[4] };
}

interface Accumulo { valore: number; origini: Origine[] }

/** Tutte le quantità della pianta, per il fatto e per ogni proposta. */
export function calcolaQuantita(p: Planimetria, opzioni: OpzioniQuantita = {}): MappaQuantita {
  const opz = { ...OPZIONI_QUANTITA_PREDEFINITE, ...opzioni };
  const out: MappaQuantita = {};
  for (const ambito of ambitiDi(p)) calcolaAmbito(p, ambito, opz, out);
  return out;
}

function calcolaAmbito(p: Planimetria, ambito: Ambito, opz: Required<OpzioniQuantita>, out: MappaQuantita) {
  const suffisso = ambito.propostaId ? ` (${ambito.nome})` : "";
  const metti = (soggetto: string, misura: string, acc: Accumulo, descrizione: string, extra: Partial<Quantita> = {}) => {
    const chiave = `${ambito.chiave}:${soggetto}.${misura}`;
    out[chiave] = {
      chiave, valore: arrotonda(acc.valore), unita: unitaDi(misura), origine: originePeggiore(...acc.origini),
      descrizione: descrizione + suffisso, ambito: ambito.chiave, ...extra,
    };
  };
  const somma = (mappa: Map<string, Accumulo>, chiave: string, acc: Accumulo) => {
    const prec = mappa.get(chiave) ?? { valore: 0, origini: [] };
    mappa.set(chiave, { valore: prec.valore + acc.valore, origini: [...prec.origini, ...acc.origini] });
  };

  const totaliPianta = new Map<string, Accumulo>();
  const totaliDestinazione = new Map<string, Map<string, Accumulo>>();
  const demolizioni = new Map<string, Accumulo>();
  const costruzioni = new Map<string, Accumulo>();
  const aperture = new Map<string, { acc: Accumulo; descrizione: string }>();

  for (const livello of p.livelli) {
    const stato = statoDelLivello(livello, ambito);
    if (!stato) continue;

    // ─── Locali ───
    for (const l of stato.locali) {
      const misure = misureLocale(l, stato, opz);
      for (const misura of ORDINE_MISURE) {
        const acc = misure[misura];
        if (!acc) continue;
        metti(`locale:${l.id}`, misura, acc, `${ETICHETTE_MISURE_LOCALE[misura]} — ${l.nome}`, { livelloId: livello.id, oggettoId: l.id });
        somma(totaliPianta, misura, acc);
        const perDest = totaliDestinazione.get(l.destinazione) ?? new Map<string, Accumulo>();
        somma(perDest, misura, acc);
        totaliDestinazione.set(l.destinazione, perDest);
      }
    }

    // ─── Pareti ───
    for (const m of stato.muri) {
      const misure = misureMuro(m, stato, opz);
      metti(`muro:${m.id}`, "lunghezza_ml", misure.lunghezza, "Lunghezza parete", { livelloId: livello.id, oggettoId: m.id });
      metti(`muro:${m.id}`, "superficie_mq", misure.superficie, "Superficie parete", { livelloId: livello.id, oggettoId: m.id });
      metti(`muro:${m.id}`, "volume_mc", misure.volume, "Volume parete", { livelloId: livello.id, oggettoId: m.id });
      if (ambito.propostaId === null || m.stato === "esistente") continue;
      const dest = m.stato === "da_demolire" ? demolizioni : costruzioni;
      somma(dest, "muri_ml", misure.lunghezza);
      somma(dest, "muri_mq", misure.superficie);
      somma(dest, "muri_mc", misure.volume);
    }

    // ─── Aperture ───
    for (const a of stato.aperture) {
      const origini = [origineMisura(a, "larghezza"), origineMisura(a, "altezza")];
      const nomeTipo = { porta: "Porte", finestra: "Finestre", portafinestra: "Portefinestre", varco: "Varchi" }[a.tipo];
      const nomeStato = { esistente: "esistenti", da_demolire: "da demolire", nuovo: "nuove" }[a.stato];
      const misura = `${Math.round(a.larghezza)}x${Math.round(a.altezza)}`;
      for (const [soggetto, descrizione] of [
        [`aperture:${a.stato}:${a.tipo}`, `${nomeTipo} ${nomeStato}`],
        [`aperture:${a.stato}:${a.tipo}:${misura}`, `${nomeTipo} ${nomeStato} ${misura.replace("x", "×")} cm`],
      ]) {
        const prec = aperture.get(soggetto)?.acc ?? { valore: 0, origini: [] };
        aperture.set(soggetto, { acc: { valore: prec.valore + 1, origini: [...prec.origini, ...origini] }, descrizione });
      }
    }
  }

  for (const [misura, acc] of totaliPianta) metti("pianta", misura, acc, `${ETICHETTE_MISURE_LOCALE[misura as MisuraLocale]} — tutti i locali`);
  for (const [dest, mappa] of totaliDestinazione) {
    for (const [misura, acc] of mappa) metti(`destinazione:${dest}`, misura, acc, `${ETICHETTE_MISURE_LOCALE[misura as MisuraLocale]} — locali «${dest}»`);
  }
  const nomiMuri: Record<string, string> = { muri_ml: "lunghezza", muri_mq: "superficie", muri_mc: "volume" };
  for (const [misura, acc] of demolizioni) metti("demolizioni", misura, acc, `Pareti da demolire (${nomiMuri[misura]})`);
  for (const [misura, acc] of costruzioni) metti("costruzioni", misura, acc, `Pareti nuove (${nomiMuri[misura]})`);
  for (const [soggetto, { acc, descrizione }] of aperture) metti(soggetto, "numero", acc, descrizione);
}

/** Parte del vano che cade fra quota 0 e `fino` (cm), in cm². */
function vuotoFino(a: Apertura, fino: number): number {
  const h = Math.max(0, Math.min(a.davanzale + a.altezza, fino) - a.davanzale);
  return a.larghezza * h;
}

/** Quanto si detrae di un vuoto (mq) secondo soglia e modo. */
function detrazione(vuotoMq: number, opz: Required<OpzioniQuantita>): number {
  if (vuotoMq <= opz.sogliaDeduzioneMq + 1e-9) return 0;
  return opz.deduzione === "intera" ? vuotoMq : vuotoMq - opz.sogliaDeduzioneMq;
}

const originiApertura = (a: Apertura) => [origineMisura(a, "larghezza"), origineMisura(a, "altezza"), origineMisura(a, "davanzale")];

function misureLocale(l: Locale, stato: StatoPianta, opz: Required<OpzioniQuantita>): Partial<Record<MisuraLocale, Accumulo>> {
  const oContorno = origineMisura(l, "contorno");
  const oAltezza = origineMisura(l, "altezza");
  const areaMq = areaPoligono(l.contorno) / 10_000;
  const perimetroM = perimetroPoligono(l.contorno) / 100;
  const altezzaM = l.altezza / 100;
  const vani = apertureDelLocale(l, stato, opz.tolleranzaCm);
  const oVani = vani.flatMap(originiApertura);

  const lorde = perimetroM * altezzaM;
  const detratto = vani.reduce((s, a) => s + detrazione(vuotoFino(a, l.altezza) / 10_000, opz), 0);
  const aTerra = vani.filter(a => a.davanzale <= 0);

  const misure: Partial<Record<MisuraLocale, Accumulo>> = {
    pavimento_mq: { valore: areaMq, origini: [oContorno] },
    perimetro_ml: { valore: perimetroM, origini: [oContorno] },
    pareti_lorde_mq: { valore: lorde, origini: [oContorno, oAltezza] },
    pareti_nette_mq: { valore: Math.max(0, lorde - detratto), origini: [oContorno, oAltezza, ...oVani] },
    soffitto_mq: { valore: areaMq, origini: [oContorno] },
    volume_mc: { valore: areaMq * altezzaM, origini: [oContorno, oAltezza] },
    battiscopa_ml: {
      valore: Math.max(0, perimetroM - aTerra.reduce((s, a) => s + a.larghezza, 0) / 100),
      origini: [oContorno, ...aTerra.map(a => origineMisura(a, "larghezza"))],
    },
  };
  const riv = l.finiture?.rivestimento;
  if (riv) {
    const lordo = perimetroM * (riv.altezza / 100);
    const det = vani.reduce((s, a) => s + detrazione(vuotoFino(a, riv.altezza) / 10_000, opz), 0);
    misure.rivestimento_mq = { valore: Math.max(0, lordo - det), origini: [oContorno, l.origine, ...oVani] };
  }
  return misure;
}

function misureMuro(m: Muro, stato: StatoPianta, opz: Required<OpzioniQuantita>) {
  const lunghezzaM = lunghezzaMuro(m) / 100;
  const oBase = [origineMisura(m, "lunghezza"), origineMisura(m, "altezza")];
  const vani = stato.aperture.filter(a => a.muroId === m.id);
  const lorda = lunghezzaM * (m.altezza / 100);
  const det = vani.reduce((s, a) => s + detrazione(vuotoFino(a, m.altezza) / 10_000, opz), 0);
  const origini = [...oBase, ...vani.flatMap(originiApertura)];
  const superficie = Math.max(0, lorda - det);
  return {
    lunghezza: { valore: lunghezzaM, origini: [origineMisura(m, "lunghezza")] },
    superficie: { valore: superficie, origini },
    volume: { valore: superficie * (m.spessore / 100), origini: [...origini, origineMisura(m, "spessore")] },
  };
}
