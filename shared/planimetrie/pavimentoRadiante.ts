import { areaPoligono, contornoIncrociato } from "./geometria.ts";
import { eAmbienteInterno, PASSO_RADIANTE_CM, type Punto, type ZonaRadiante } from "./modello.ts";

interface LocaleRadiante {
  id: string;
  destinazione: string;
  aperto?: boolean;
  contorno: Punto[];
}

export const COLORE_RADIANTE = "#be3455";

export function superficiePerRadiante(locale: LocaleRadiante): number {
  if (!eAmbienteInterno(locale) || locale.contorno.length < 3 || contornoIncrociato(locale.contorno)) return 0;
  return areaPoligono(locale.contorno) / 10_000;
}

/** Sviluppo geometrico senza i collegamenti al collettore e senza sfrido. */
export function misuraZonaRadiante(locale: LocaleRadiante, zona: ZonaRadiante) {
  const superficieLocaleMq = superficiePerRadiante(locale);
  const superficieMq = Math.max(0, superficieLocaleMq - zona.superficieEsclusaMq);
  const tuboM = superficieMq / (zona.passoCm / 100);
  return { superficieLocaleMq, superficieMq, tuboM };
}

export function zoneRadianti<L extends LocaleRadiante>(stato: {
  locali: L[];
  pavimentoRadiante?: ZonaRadiante[];
}) {
  if (!stato.pavimentoRadiante?.length) return [];
  const locali = new Map(stato.locali.map(l => [l.id, l]));
  return stato.pavimentoRadiante.flatMap(zona => {
    const locale = locali.get(zona.localeId);
    if (!locale || !Number.isFinite(zona.passoCm) || zona.passoCm < PASSO_RADIANTE_CM.min ||
      zona.passoCm > PASSO_RADIANTE_CM.max || !Number.isFinite(zona.superficieEsclusaMq) || zona.superficieEsclusaMq < 0) return [];
    const misure = misuraZonaRadiante(locale, zona);
    return misure.superficieMq > 0 ? [{ zona, locale, ...misure }] : [];
  });
}

/** Tratteggio della zona in pianta, senza attribuire alle fasce la posizione delle tubazioni. */
export function fasceRadianti(contorno: Punto[], passoCm: number): Array<[Punto, Punto]> {
  if (contorno.length < 3 || !Number.isFinite(passoCm) || passoCm <= 0) return [];
  const ordinate = contorno.map(p => p.y);
  const minimo = Math.min(...ordinate), altezza = Math.max(...ordinate) - minimo;
  if (!Number.isFinite(altezza) || altezza <= 0) return [];
  const numero = Math.min(36, Math.max(1, Math.floor(altezza / passoCm)));
  const distanza = numero === 1 ? altezza : Math.max(passoCm, altezza / 36);
  const inizio = minimo + (altezza - distanza * (numero - 1)) / 2;
  const fasce: Array<[Punto, Punto]> = [];
  for (let i = 0; i < numero; i++) {
    const y = inizio + i * distanza;
    const x: number[] = [];
    for (let j = 0; j < contorno.length; j++) {
      const a = contorno[j], b = contorno[(j + 1) % contorno.length];
      if ((a.y > y) !== (b.y > y)) x.push(a.x + (y - a.y) * (b.x - a.x) / (b.y - a.y));
    }
    x.sort((a, b) => a - b);
    for (let j = 1; j < x.length; j += 2) {
      const rientro = Math.min(3, (x[j] - x[j - 1]) / 8);
      if (rientro > 0) fasce.push([{ x: x[j - 1] + rientro, y }, { x: x[j] - rientro, y }]);
    }
  }
  return fasce;
}
