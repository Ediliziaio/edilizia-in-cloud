import { meno, per, piu, scalare, v2, type V2 } from "./geometria2d";
import type { EstremiMuro, MuroCalc, VanoMuro } from "./muri";

export interface AttaccoDoccia3D {
  lato: "retro" | "sinistra" | "fronte" | "destra";
  scarto: number;
  distanza: number;
  pendenza: number;
}

/** Cerca muratura piena alle quote dei raccordi e della staffa. */
export function attaccoDoccia3D(
  centro: V2, rotazione: number, l: number, p: number, h: number,
  muri: MuroCalc[], estremi: ReadonlyMap<string, EstremiMuro>, vani: ReadonlyMap<string, VanoMuro[]>,
): AttaccoDoccia3D | null {
  if (l < .31 || p < .31 || h < .42) return null;
  const localeX = v2(Math.cos(rotazione), Math.sin(rotazione));
  const localeZ = v2(-localeX.y, localeX.x);
  const lati = [
    { lato: "retro", asse: localeX, interno: localeZ, ampiezza: l, profondita: p },
    { lato: "sinistra", asse: localeZ, interno: localeX, ampiezza: p, profondita: l },
    { lato: "fronte", asse: localeX, interno: per(localeZ, -1), ampiezza: l, profondita: p },
    { lato: "destra", asse: localeZ, interno: per(localeX, -1), ampiezza: p, profondita: l },
  ] as const;
  const quotaBassa = h * .487 - .035, quotaAlta = h * .80 + .035;
  let scelto: AttaccoDoccia3D | null = null, punteggio = Infinity;
  for (const { lato, asse, interno, ampiezza, profondita } of lati) {
    const bordo = piu(centro, per(interno, -profondita / 2));
    const margine = ampiezza * .13 + .035;
    for (const muro of muri) {
      const allineamento = scalare(interno, muro.n);
      if (muro.altezza < quotaAlta || Math.abs(allineamento) < .999) continue;
      const e = estremi.get(muro.id);
      if (!e) continue;
      const latoMuro = Math.sign(allineamento);
      const faccia = piu(muro.a, per(muro.n, latoMuro * muro.spessore / 2));
      const pendenza = -scalare(asse, muro.n) / allineamento;
      for (const scarto of [0, -.19 * ampiezza, .19 * ampiezza]) {
        const punto = piu(bordo, per(asse, scarto));
        const distanza = scalare(meno(punto, faccia), muro.n) / allineamento;
        if (distanza < -.012 || distanza > .15) continue;
        const suMuro = scalare(meno(piu(punto, per(interno, -distanza)), muro.a), muro.d);
        const da = latoMuro > 0 ? e.piu0 : e.meno0;
        const a = latoMuro > 0 ? e.piu1 : e.meno1;
        if (suMuro - margine < da || suMuro + margine > a) continue;
        if (vani.get(muro.id)?.some(v => v.s0 < suMuro + margine && v.s1 > suMuro - margine && v.z0 < quotaAlta && v.z1 > quotaBassa)) continue;
        const costo = Math.abs(distanza) + Math.abs(scarto) * .55 + (lato === "fronte" || lato === "destra" ? .015 : 0);
        if (costo < punteggio) {
          scelto = { lato, scarto, distanza, pendenza };
          punteggio = costo;
        }
      }
    }
  }
  return scelto;
}
