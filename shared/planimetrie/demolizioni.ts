import {
  areaPoligono, assiDelMuro, contornoIncrociato, distanza, interniSovrapposti, lunghezzaMuro, puntoNelPoligono, segmentiSiIncrociano,
} from "./geometria.ts";
import { eAmbienteInterno, type Locale, type Muro, type Punto } from "./modello.ts";

interface LatoSulTramezzo {
  locale: Locale;
  indice: number;
  inizio: number;
  fine: number;
  distanza: number;
}

/** Unisce la fascia di pavimento liberata ai due contorni rilevati, quando il giunto è univoco. */
export function unisciLocaliDopoDemolizione(locali: Locale[], muro: Muro, muri: readonly Muro[]): Locale[] | null {
  if (muro.tipo !== "tramezzo" || muro.stato !== "da_demolire") return null;
  const lunghezza = lunghezzaMuro(muro);
  const { dir, normale } = assiDelMuro(muro);
  const punto = (t: number, s: number): Punto => ({
    x: muro.p1.x + dir.x * t + normale.x * s, y: muro.p1.y + dir.y * t + normale.y * s,
  });
  const proietta = (p: Punto, asse: Punto) => (p.x - muro.p1.x) * asse.x + (p.y - muro.p1.y) * asse.y;
  const lati = locali.filter(eAmbienteInterno).flatMap(locale => locale.contorno.flatMap((p, indice): LatoSulTramezzo[] => {
    const q = locale.contorno[(indice + 1) % locale.contorno.length];
    const d = proietta(p, normale);
    if (Math.abs(proietta(q, normale) - d) > .1 || Math.abs(Math.abs(d) - muro.spessore / 2) > .5) return [];
    const inizio = proietta(p, dir), fine = proietta(q, dir);
    const da = Math.max(0, Math.min(inizio, fine)), a = Math.min(lunghezza, Math.max(inizio, fine));
    if (a - da <= 2 || !puntoNelPoligono(punto((da + a) / 2, d + Math.sign(d)), locale.contorno)) return [];
    return [{ locale, indice, inizio, fine, distanza: d }];
  }));
  const [primo, secondo] = lati;
  if (lati.length !== 2 || primo.locale.id === secondo.locale.id || primo.distanza * secondo.distanza >= 0) return null;
  const a = primo.locale, b = secondo.locale;
  if (!a.unita?.trim() || a.unita.trim() !== b.unita?.trim() || Math.abs(a.altezza - b.altezza) > .1 ||
    JSON.stringify(a.finiture ?? {}) !== JSON.stringify(b.finiture ?? {})) return null;

  const inizio = Math.max(0, Math.min(primo.inizio, primo.fine), Math.min(secondo.inizio, secondo.fine));
  const fine = Math.min(lunghezza, Math.max(primo.inizio, primo.fine), Math.max(secondo.inizio, secondo.fine));
  const rientro = muro.spessore + 1;
  const sulGiunto = (p: Punto) => Math.abs(proietta(p, normale)) <= .1 && proietta(p, dir) > inizio + .1 && proietta(p, dir) < fine - .1;
  if (fine <= inizio || inizio > rientro || lunghezza - fine > rientro ||
    muri.some(m => m.id !== muro.id && m.stato !== "da_demolire" &&
      (segmentiSiIncrociano(punto(inizio, 0), punto(fine, 0), m.p1, m.p2) || sulGiunto(m.p1) || sulGiunto(m.p2)))) return null;

  function bordoEsterno(lato: LatoSulTramezzo) {
    const { contorno } = lato.locale;
    const verso = lato.inizio < lato.fine;
    const resto = contorno.slice(lato.indice + 1).concat(contorno.slice(0, lato.indice + 1));
    return [punto(verso ? fine : inizio, lato.distanza), ...resto, punto(verso ? inizio : fine, lato.distanza)];
  }
  const bordo1 = bordoEsterno(primo), bordo2 = bordoEsterno(secondo);
  if ((primo.inizio < primo.fine) === (secondo.inizio < secondo.fine)) bordo2.reverse();
  const vertici = [...bordo1, ...bordo2].map(p => ({ x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 }));
  const contorno = vertici.filter((p, i) => distanza(p, vertici[(i + vertici.length - 1) % vertici.length]) > .01);
  const areaA = areaPoligono(a.contorno), areaB = areaPoligono(b.contorno);
  const areaAttesa = areaA + areaB + (fine - inizio) * Math.abs(primo.distanza - secondo.distanza);
  const altri = locali.filter(l => l.id !== a.id && l.id !== b.id);
  if (contorno.length < 3 || contornoIncrociato(contorno) || Math.abs(areaPoligono(contorno) - areaAttesa) > Math.max(1, areaAttesa * .0001) ||
    altri.some(l => interniSovrapposti(contorno, l.contorno))) return null;

  const principale = areaA >= areaB ? a : b;
  const unito: Locale = { ...principale, contorno, superficieDichiarataMq: undefined, origine: "stimata",
    origineMisure: { ...principale.origineMisure, contorno: "stimata" } };
  return locali.flatMap(l => l.id === principale.id ? [unito] : l.id === a.id || l.id === b.id ? [] : [l]);
}
