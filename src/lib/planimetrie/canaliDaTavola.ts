import type { PlanText } from "../preventivi/planReading";
import { dentroTavola, scalaRasterHvacDiscordante, sezioneCanaleLetta, type DatiHvac, type ReteAria, type TavolaTecnica } from "./tavolaTecnica";
import type { PuntoTavola } from "../../../shared/planimetrie/letturaAssistita";
import { rilevaRaccordiCanali, type IncrocioCanali, type RaccordoCanale } from "./raccordiCanali";

type Hvac = Extract<TavolaTecnica, { tipo: "hvac" }>;
export type ScalaCanali = { metriPerPixelX: number; metriPerPixelY: number };
type Sezione = { larghezzaMm: number; altezzaMm: number };
export type TrattoCanale = {
  id: string;
  rete: ReteAria;
  da: PuntoTavola;
  a: PuntoTavola;
  sezione?: Sezione;
  lunghezzaM: number | null;
};
export type RicostruzioneCanali = {
  tratti: TrattoCanale[];
  raccordi: RaccordoCanale[];
  incroci: IncrocioCanali[];
  scala: ScalaCanali | null;
  larghezza: number;
  altezza: number;
  area: Hvac["area"];
  dati: DatiHvac;
  scalaDiscordante: boolean;
};

type Intervallo = { inizio: number; fine: number };
type Fascia = { prima: number; ultima: number; corse: Intervallo[] };
type Traccia = Intervallo & { asse: number; spessoreGrafico: number; verticale: boolean; rete: ReteAria };
const estensione = (s: Intervallo) => s.fine - s.inizio;
const comune = (a: Intervallo, b: Intervallo) => Math.min(a.fine, b.fine) - Math.max(a.inizio, b.inizio);
const mediana = (v: number[]) => v.sort((a, b) => a - b)[Math.floor(v.length / 2)];

/** Prende gli assi dei tratti rettilinei visibili, anche attraverso piccole interruzioni di stampa. */
function tracceDaMaschera(tavola: Hvac, codice: number, rete: ReteAria, verticale: boolean): Traccia[] {
  const { larghezza: w, altezza: h } = tavola.raster;
  const colori = tavola.colori!;
  const primoY = Math.ceil(tavola.area.y * h), ultimoY = Math.floor((tavola.area.y + tavola.area.altezza) * h);
  const inizio = verticale ? primoY : 0;
  const fine = verticale ? ultimoY : w;
  const asseInizio = verticale ? 0 : primoY;
  const asseFine = verticale ? w : ultimoY;
  const minimo = Math.round(Math.max(w, h) * (verticale ? 0.030 : 0.039));
  const spessoreMinimo = Math.max(3, Math.round(Math.max(w, h) * 0.0028));
  const interruzione = Math.max(2, Math.round(Math.max(w, h) * 0.0032));
  const fasce: Fascia[] = [];
  let precedenti: Fascia[] = [];
  for (let asse = asseInizio; asse < asseFine; asse++) {
    let da = -1, ultimo = -1;
    const correnti: Fascia[] = [];
    for (let i = inizio; i <= fine; i++) {
      if (i < fine && colori[verticale ? i * w + asse : asse * w + i] === codice) {
        if (da === -1) da = i;
        ultimo = i;
      } else if (da !== -1 && (i === fine || i - ultimo > interruzione)) {
        if (ultimo - da >= minimo) {
          const corsa = { inizio: da, fine: ultimo };
          const esistente = precedenti.find((f) => {
            const ant = f.corse[f.corse.length - 1];
            const margine = Math.max(9, estensione(ant) * 0.13);
            return !correnti.includes(f) && Math.abs(ant.inizio - da) < margine && Math.abs(ant.fine - ultimo) < margine;
          });
          if (esistente) {
            esistente.ultima = asse;
            esistente.corse.push(corsa);
            correnti.push(esistente);
          } else {
            const fascia = { prima: asse, ultima: asse, corse: [corsa] };
            fasce.push(fascia);
            correnti.push(fascia);
          }
        }
        da = -1;
      }
    }
    precedenti = correnti;
  }
  const tracce = fasce.flatMap(({ prima, ultima, corse }): Traccia[] => {
    if (corse.length < spessoreMinimo) return [];
    const inizio = mediana(corse.map((c) => c.inizio));
    const fine = mediana(corse.map((c) => c.fine));
    if (fine - inizio < Math.max(minimo, corse.length * 2.7)) return [];
    return [{ asse: (prima + ultima) / 2, inizio, fine, verticale, rete, spessoreGrafico: corse.length }];
  }).sort((a, b) => estensione(b) - estensione(a));
  const pixelColorato = (asse: number, lungo: number) => colori[verticale ? lungo * w + asse : asse * w + lungo] === codice;
  const stessaFascia = (a: Traccia, b: Traccia) => {
    if (comune(a, b) < 0.52 * Math.min(estensione(a), estensione(b))) return false;
    const distacco = Math.abs(a.asse - b.asse);
    if (distacco <= (a.spessoreGrafico + b.spessoreGrafico) / 2 + interruzione) return true;
    if (distacco > Math.max(w, h) * 0.024) return false;
    const da = Math.max(a.inizio, b.inizio), aFine = Math.min(a.fine, b.fine);
    // Una scritta sulla campitura può dividere la scansione in due bordi. Un
    // filare bianco intero indica invece due linee distinte.
    for (let asse = Math.ceil(Math.min(a.asse, b.asse)); asse <= Math.floor(Math.max(a.asse, b.asse)); asse++) {
      let marcati = 0, campioni = 0;
      for (let lungo = da; lungo <= aFine; lungo += 3) {
        campioni++;
        if (pixelColorato(asse, lungo)) marcati++;
      }
      if (marcati / campioni < 0.52) return false;
    }
    return true;
  };
  const scelte: Traccia[] = [];
  for (const traccia of tracce) {
    const indice = scelte.findIndex((t) => stessaFascia(t, traccia));
    if (indice < 0) scelte.push(traccia);
    else {
      const prima = scelte[indice];
      const minimo = Math.min(prima.asse - prima.spessoreGrafico / 2, traccia.asse - traccia.spessoreGrafico / 2);
      const massimo = Math.max(prima.asse + prima.spessoreGrafico / 2, traccia.asse + traccia.spessoreGrafico / 2);
      scelte[indice] = { ...prima, asse: (minimo + massimo) / 2, spessoreGrafico: massimo - minimo,
        inizio: Math.min(prima.inizio, traccia.inizio), fine: Math.max(prima.fine, traccia.fine) };
    }
  }
  return scelte;
}

function estremiSugliAssi(tracce: Traccia[]) {
  return tracce.map((t) => {
    const incroci = tracce.filter((s) => s.rete === t.rete && s.verticale !== t.verticale
      && t.asse >= s.inizio && t.asse <= s.fine && s.asse >= t.inizio && s.asse <= t.fine);
    const vicino = (p: number) => incroci.filter((s) => Math.abs(s.asse - p) <= s.spessoreGrafico / 2 + 3)
      .sort((a, b) => Math.abs(a.asse - p) - Math.abs(b.asse - p))[0]?.asse ?? p;
    const inizio = vicino(t.inizio), fine = vicino(t.fine);
    return fine - inizio >= estensione(t) / 2 ? { ...t, inizio, fine } : t;
  });
}

function daQuoteScritte(dati: DatiHvac, w: number, h: number): ScalaCanali | null {
  const { orizzontale: x, verticale: y } = dati;
  if (!x || !y || Math.min(x.distanzaCentri, y.distanzaCentri) < 0.1) return null;
  function metriPerPixel(q: NonNullable<DatiHvac["orizzontale"]>, lato: number) {
    const mezzeCampate = (q.campateMm[0] + q.campateMm[q.campateMm.length - 1]) / 2;
    return (q.totaleMm - mezzeCampate) / 1000 / (lato * q.distanzaCentri);
  }
  return { metriPerPixelX: metriPerPixel(x, w), metriPerPixelY: metriPerPixel(y, h) };
}

function assegnaSezioni(tracce: Traccia[], testi: readonly PlanText[], tavola: Hvac) {
  const { larghezza: w, altezza: h } = tavola.raster;
  const riscontri = new Map<Traccia, Sezione | null>();
  for (const riga of testi) {
    if (riga.confidence < 0.48 || !dentroTavola(riga, tavola.area)) continue;
    const sezione = sezioneCanaleLetta(riga.text);
    if (!sezione) continue;
    const [x, y, larghezza, altezza] = riga.bbox;
    const verticale = larghezza * w < altezza * h;
    const asse = verticale ? (x + larghezza / 2) * w : (y + altezza / 2) * h;
    const lungo = verticale ? (y + altezza / 2) * h : (x + larghezza / 2) * w;
    const tratto = tracce.filter((t) => t.rete === sezione.rete && t.verticale === verticale
      && lungo > t.inizio && lungo < t.fine && Math.abs(t.asse - asse) <= Math.max(5, t.spessoreGrafico))
      .sort((a, b) => Math.abs(a.asse - asse) - Math.abs(b.asse - asse))[0];
    if (!tratto) continue;
    const precedente = riscontri.get(tratto);
    if (!riscontri.has(tratto)) riscontri.set(tratto, sezione);
    else if (precedente?.larghezzaMm !== sezione.larghezzaMm || precedente?.altezzaMm !== sezione.altezzaMm) riscontri.set(tratto, null);
  }
  return riscontri;
}

export function ricostruisciCanali(tavola: Hvac, testi: readonly PlanText[]): RicostruzioneCanali {
  const { larghezza, altezza } = tavola.raster;
  const scala = daQuoteScritte(tavola.dati, larghezza, altezza);
  const candidate: Traccia[] = [];
  if (tavola.colori && tavola.codiceMandata) {
    for (const [rete, codice] of [["mandata", tavola.codiceMandata], ["ripresa", 3 - tavola.codiceMandata]] as const) {
      for (const verticale of [false, true]) candidate.push(...tracceDaMaschera(tavola, codice, rete, verticale));
    }
  }
  const tracce = estremiSugliAssi(candidate);
  const sezioni = assegnaSezioni(tracce, testi, tavola);
  const tratti = tracce.map((t, indice): TrattoCanale => {
    const punto = (posizione: number): PuntoTavola => t.verticale ? { x: t.asse / larghezza, y: posizione / altezza } : { x: posizione / larghezza, y: t.asse / altezza };
    return {
      id: `${t.rete}-${indice + 1}`, rete: t.rete, da: punto(t.inizio), a: punto(t.fine), sezione: sezioni.get(t) ?? undefined,
      lunghezzaM: scala ? estensione(t) * (t.verticale ? scala.metriPerPixelY : scala.metriPerPixelX) : null,
    };
  });
  const nodi = tavola.colori && tavola.codiceMandata ? rilevaRaccordiCanali(tracce.map((t, i) => ({ ...t, id: tratti[i].id })),
    { colori: tavola.colori, codiceMandata: tavola.codiceMandata, larghezza, altezza }) : { raccordi: [], incroci: [] };
  return { tratti, ...nodi, scala, larghezza, altezza, area: tavola.area, dati: tavola.dati, scalaDiscordante: scalaRasterHvacDiscordante(tavola) };
}
