/**
 * Tubazioni e cavi in 3D, dai simboli degli impianti già nella pianta.
 *
 * Usa le STESSE stime del disegno 2D e del computo (shared/planimetrie/impianti.ts): dal quadro a ogni
 * presa, dal collettore a ogni punto acqua, dai sanitari alla colonna di scarico, dagli split all'unità
 * esterna. Il tratto orizzontale corre a segmenti ortogonali (instradamento: meno muri bucati, vicino ai muri), ogni linea alla sua altezza per non
 * sovrapporsi; le calate in verticale arrivano alla quota del simbolo (presa a 30 cm, quadro a 1,60 m…).
 * Sono percorsi STIMATI, non un progetto: servono a vedere dove passeranno e a quantificare i metri.
 */
import { metriConSfrido, percorsiDaElementi, quotaPunto, type LineaImpianto, type PartenzaMancante } from "../../../../shared/planimetrie/impianti.ts";
import { CostruttoreMesh } from "./costruttore";
import { instradaTubo } from "./instradamento";
import { MATERIALI } from "./materiali";
import type { Mesh3D, PiantaPer3D, Scena3D } from "./tipi";

const CM = 0.01;

/** Quota (m) a cui corre il tratto orizzontale di ogni linea, e spessore del tubo (m). */
const STILE: Record<LineaImpianto, { quota: number; spessore: number }> = {
  scarico: { quota: 0.07, spessore: 0.07 },
  acqua: { quota: 0.16, spessore: 0.045 },
  riscaldamento: { quota: 0.23, spessore: 0.045 },
  elettrica: { quota: 0.30, spessore: 0.035 },
  condensa: { quota: 0.37, spessore: 0.035 },
  frigorifera: { quota: 0.44, spessore: 0.04 },
};

export const NOMI_LINEE_3D: Record<LineaImpianto, string> = {
  elettrica: "Elettrico",
  acqua: "Acqua",
  scarico: "Scarichi",
  frigorifera: "Rame clima",
  condensa: "Condensa",
  riscaldamento: "Riscaldamento",
};

export const FRASE_MANCA: Record<PartenzaMancante, string> = {
  quadro_elettrico: "il quadro elettrico",
  collettore: "il collettore (o la caldaia)",
  colonna_scarico: "la colonna di scarico",
  unita_esterna: "l'unità esterna del clima",
  generatore: "la caldaia o la pompa di calore",
};

export interface Impianti3D {
  mesh: Mesh3D[];
  impianti: NonNullable<Scena3D["impianti"]>;
  avvisi: string[];
}

export function meshImpianti(pianta: PiantaPer3D): Impianti3D {
  const elementi = pianta.elementi.map((e) => ({ id: e.id, tipo: e.tipo, posizione: e.centro }));
  const { percorsi, mancano } = percorsiDaElementi(elementi, pianta.locali.map((l) => l.contorno));
  const tipoDi = new Map(elementi.map((e) => [e.id, e.tipo]));
  const costruttori = new Map<LineaImpianto, CostruttoreMesh>();
  const cm = new Map<LineaImpianto, number>();
  for (const p of percorsi) {
    const { quota, spessore: t } = STILE[p.linea];
    let c = costruttori.get(p.linea);
    if (!c) { c = new CostruttoreMesh(); costruttori.set(p.linea, c); }
    cm.set(p.linea, (cm.get(p.linea) ?? 0) + p.lunghezzaCm);
    const x0 = p.da.x * CM, z0 = p.da.y * CM, x1 = p.a.x * CM, z1 = p.a.y * CM;
    const base = quota - t / 2;
    // orizzontale a segmenti ortogonali, scelti per bucare meno muri e stare vicino ai muri
    const punti = instradaTubo(p.da, p.a, pianta.muri.filter((m) => m.stato !== "demolire"));
    for (let i = 0; i < punti.length - 1; i++) {
      const ax = punti[i].x * CM, az = punti[i].y * CM, bx = punti[i + 1].x * CM, bz = punti[i + 1].y * CM;
      if (Math.abs(bx - ax) > 0.005) c.scatola((ax + bx) / 2, az, base, Math.abs(bx - ax) + t, t, t, 0);
      if (Math.abs(bz - az) > 0.005) c.scatola(bx, (az + bz) / 2, base, t, Math.abs(bz - az) + t, t, 0);
    }
    // calate: dal tubo orizzontale alla quota del simbolo, alle due estremità
    const risale = (x: number, z: number, h: number) => {
      const da = Math.min(quota, h), a = Math.max(quota, h);
      if (a - da > 0.01) c!.scatola(x, z, da, t, t, a - da, 0);
    };
    risale(x0, z0, quotaPunto(tipoDi.get(p.daId) ?? "") * CM);
    risale(x1, z1, quotaPunto(tipoDi.get(p.aId) ?? "") * CM);
  }
  const mesh: Mesh3D[] = [];
  const impianti: Impianti3D["impianti"] = [];
  for (const [linea, c] of costruttori) {
    if (c.vuoto()) continue;
    mesh.push(c.mesh({ id: `impianto:${linea}`, nome: `Impianto · ${NOMI_LINEE_3D[linea]}`, genere: "elemento", materiale: `impianto_${linea}`, riferimento: `impianto:${linea}` }));
    impianti.push({ linea, nome: NOMI_LINEE_3D[linea], colore: MATERIALI[`impianto_${linea}`].colore, metri: metriConSfrido(cm.get(linea) ?? 0) });
  }
  const avvisi = mancano.map((m) => `Impianti: manca ${FRASE_MANCA[m]} (Arredi → Impianti): senza, quella linea non si disegna.`);
  return { mesh, impianti, avvisi };
}
