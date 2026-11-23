/**
 * Tubazioni e cavi in 3D, dai simboli degli impianti già nella pianta.
 *
 * Usa le STESSE stime del disegno 2D e del computo (shared/planimetrie/impianti.ts): dal quadro a ogni
 * presa, dal collettore a ogni punto acqua, dai sanitari alla colonna di scarico, dagli split all'unità
 * esterna. Il tratto orizzontale corre a segmenti ortogonali (instradamento: meno muri bucati, vicino ai muri), ogni linea alla sua altezza per non
 * sovrapporsi; le calate in verticale arrivano alla quota del simbolo (presa a 30 cm, quadro a 1,60 m…).
 * Sono percorsi STIMATI, non un progetto: servono a vedere dove passeranno e a quantificare i metri.
 */
import { metriConSfrido, percorsiDaElementi, puntiPercorso, quotaPunto, type LineaImpianto, type PartenzaMancante } from "../../../../shared/planimetrie/impianti.ts";
import { COLORE_RADIANTE, fasceRadianti, zoneRadianti } from "../../../../shared/planimetrie/pavimentoRadiante.ts";
import { quoteCollettoreRadiante } from "../../../../shared/planimetrie/circuitiRadianti.ts";
import { CostruttoreMesh } from "./costruttore";
import { instradaTubo } from "./instradamento";
import { MATERIALI } from "./materiali";
import type { Mesh3D, PiantaPer3D, Punto2, Scena3D } from "./tipi";

const CM = 0.01;

function tubiRadianti(rete: NonNullable<PiantaPer3D["reteRadiante"]>): Mesh3D[] {
  const { x, y } = rete.collettore.posizione;
  const quote = quoteCollettoreRadiante(rete.collettore.quotaCm);
  const mandata = new CostruttoreMesh(), ritorno = new CostruttoreMesh(), attivi = new CostruttoreMesh();
  const tubi = (c: CostruttoreMesh, punti: Punto2[], quota: number, t: number) => {
    for (let i = 1; i < punti.length; i++) {
      const a = punti[i - 1], b = punti[i];
      const centimetri = Math.hypot(b.x - a.x, b.y - a.y);
      if (centimetri > 0.1) c.scatola((a.x + b.x) * CM / 2, (a.y + b.y) * CM / 2, quota, centimetri * CM, t, t, Math.atan2(b.y - a.y, b.x - a.x));
    }
  };
  for (const c of rete.circuiti) {
    tubi(mandata, c.mandata, .018, .025);
    tubi(ritorno, c.ritorno, .023, .020);
    tubi(attivi, c.serpentina, .012, .017);
  }
  mandata.scatola(x * CM, y * CM, quote.mandata * CM, .34, .055, .044, 0);
  ritorno.scatola(x * CM, y * CM, quote.ritorno * CM, .34, .055, .044, 0);
  if (rete.circuiti.length) {
    mandata.scatola(x * CM, y * CM, .018, .034, .034, quote.mandata * CM - .018, 0);
    ritorno.scatola(x * CM + .04, y * CM, .023, .028, .028, quote.ritorno * CM - .023, 0);
    ritorno.scatola(x * CM + .02, y * CM, .023, .04, .02, .02, 0);
  }
  return [
    { c: mandata, id: "mandata", nome: "Collettore e mandata radiante", materiale: "impianto_radiante_mandata" },
    { c: ritorno, id: "ritorno", nome: "Collettore e ritorno radiante", materiale: "impianto_radiante_ritorno" },
    { c: attivi, id: "circuiti", nome: "Serpentine radianti", materiale: "impianto_radiante" },
  ].filter(({ c }) => !c.vuoto()).map(({ c, id, nome, materiale }) => c.mesh({
    id: `impianto:radiante:${id}`, nome, materiale, riferimento: "impianto:radiante", genere: "elemento", stratoEsploso: "impianti",
  }));
}


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

export function meshCanaliAria(canali: NonNullable<PiantaPer3D["canaliAria"]>): Mesh3D[] {
  return canali.flatMap((canale) => {
    const { da, a, larghezza, altezza, quota, id, rete } = canale;
    const c = new CostruttoreMesh();
    const l = Math.hypot(a.x - da.x, a.y - da.y) * CM;
    if (l < 0.005) return [];
    const h = (altezza ?? 10) * CM;
    c.scatola((da.x + a.x) * CM / 2, (da.y + a.y) * CM / 2, quota * CM - h / 2,
      l, (larghezza ?? 14) * CM, h, Math.atan2(a.y - da.y, a.x - da.x));
    return [c.mesh({
      id: `canale:${id}`, nome: `${rete === "mandata" ? "Mandata" : "Ripresa"} · ${larghezza && altezza ? `${larghezza * 10} × ${altezza * 10} mm` : "asse da verificare"}`,
      materiale: `canale_${rete}${larghezza && altezza ? "" : "_asse"}`, riferimento: id, genere: "elemento", stratoEsploso: "impianti",
    })];
  });
}

export function meshImpianti(pianta: PiantaPer3D): Impianti3D {
  const elementi = pianta.elementi.map((e) => ({ id: e.id, tipo: e.tipo, posizione: e.centro }));
  const { percorsi, mancano } = percorsiDaElementi(elementi, pianta.locali, pianta.tracciatiImpianti);
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
    const punti = p.vertici ? puntiPercorso(p) : instradaTubo(p.da, p.a, pianta.muri.filter((m) => m.stato !== "demolire"));
    for (let i = 0; i < punti.length - 1; i++) {
      const ax = punti[i].x * CM, az = punti[i].y * CM, bx = punti[i + 1].x * CM, bz = punti[i + 1].y * CM;
      const lunghezza = Math.hypot(bx - ax, bz - az);
      if (lunghezza > 0.005) c.scatola((ax + bx) / 2, (az + bz) / 2, base, lunghezza + t, t, t, Math.atan2(bz - az, bx - ax));
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
  const radianti = zoneRadianti(pianta);
  const rete = pianta.reteRadiante;
  if (rete) mesh.push(...tubiRadianti(rete));
  if (radianti.length) {
    const fasce = new CostruttoreMesh();
    let metri = 0, superficieMq = 0;
    for (const { locale, zona, tuboM, superficieMq: mq } of radianti) {
      for (const [a, b] of rete?.circuiti.some(c => c.localeId === locale.id) ? [] : fasceRadianti(locale.contorno, zona.passoCm)) {
        fasce.scatola((a.x + b.x) * CM / 2, a.y * CM, 0.012, (b.x - a.x) * CM, 0.022, 0.009, 0);
      }
      metri += tuboM;
      superficieMq += mq;
    }
    if (!fasce.vuoto()) mesh.push(fasce.mesh({
      id: "impianto:radiante", nome: "Pavimento radiante · zona indicativa", genere: "elemento",
      materiale: "impianto_radiante", riferimento: "impianto:radiante", stratoEsploso: "impianti",
    }));
    metri += rete?.circuiti.reduce((s, c) => s + c.mandataM + c.ritornoM, 0) ?? 0;
    impianti.push({ linea: "radiante", nome: "Pavimento radiante", colore: COLORE_RADIANTE, metri, superficieMq, ...(rete ? { circuiti: rete.circuiti } : {}) });
  }
  return { mesh, impianti, avvisi };
}
