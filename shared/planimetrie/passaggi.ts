/**
 * I vani da cui si passa (porte, portefinestre, varchi) e le stanze sui due lati.
 * Sta in shared perché lo usano sia il controllo degli accessi dell'app sia il
 * controllore della generazione AI (edge function), 23/11/2026.
 */
import { assiDelMuro, distanzaDalContorno, puntoNelPoligono } from "./geometria.ts";
import type { Apertura, Locale, Muro, Punto, StatoPianta } from "./modello.ts";

const MARGINE_CM = 4;

function latoDelVano(locali: Locale[], p: Punto, interno: Punto): string[] {
  const dentro = locali.filter(l => puntoNelPoligono(interno, l.contorno));
  if (dentro.length) return dentro.map(l => l.id);
  return locali.filter(l => distanzaDalContorno(p, l.contorno) <= MARGINE_CM).map(l => l.id);
}

export type VanoDiPassaggio = { apertura: Apertura; muro: Muro; centro: Punto; lati: [string[], string[]] };

/** Le stanze sui due lati di un'apertura (anche una finestra). */
export function latiApertura(stato: StatoPianta, apertura: Apertura, muro: Muro): { centro: Punto; lati: [string[], string[]] } {
  const { dir, normale } = assiDelMuro(muro);
  const offset = apertura.offset + apertura.larghezza / 2;
  const centro = { x: muro.p1.x + dir.x * offset, y: muro.p1.y + dir.y * offset };
  const lato = (segno: number) => {
    const faccia = { x: centro.x + normale.x * segno * muro.spessore / 2, y: centro.y + normale.y * segno * muro.spessore / 2 };
    const interno = { x: faccia.x + normale.x * segno * MARGINE_CM, y: faccia.y + normale.y * segno * MARGINE_CM };
    return latoDelVano(stato.locali, faccia, interno);
  };
  return { centro, lati: [lato(1), lato(-1)] };
}

export function vaniDiPassaggio(stato: StatoPianta): VanoDiPassaggio[] {
  const attivi = new Map(stato.muri.filter(m => m.stato !== "da_demolire").map(m => [m.id, m]));
  const vani: VanoDiPassaggio[] = [];
  for (const apertura of stato.aperture) {
    if (apertura.stato === "da_demolire" || apertura.tipo === "finestra" || apertura.sistema === "fisso" || !(apertura.larghezza > 0)) continue;
    const muro = attivi.get(apertura.muroId);
    if (!muro) continue;
    vani.push({ apertura, muro, ...latiApertura(stato, apertura, muro) });
  }
  return vani;
}
