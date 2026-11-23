import { pedateCad } from "../../../../shared/planimetrie/geometria.ts";
import { eAmbienteInterno } from "../../../../shared/planimetrie/modello.ts";
import type { PianoPer3D } from "./edificio";
import { modelloElemento } from "./elementi";
import { aperturaPercorribile, muroPresente } from "./scena";
import { localeAllaPosizione, passoLibero, vistaDentroLocale } from "./telecamera";
import type { ElementoPer3D, Mesh3D, PiantaPer3D, Scena3D, Telecamera3D, V3, Vista3D } from "./tipi";

type Appoggio = { a: V3; b: V3; c: V3; sx: number; dx: number; dietro: number; avanti: number; det: number };
type PianoVisita = { id: string; nome: string; quota: number; pianta: PiantaPer3D; appoggi: Appoggio[] };
export type PosizioneVisita = { pianoId: string; piedi: V3 };
export type TappaVisita = { id: string; nome: string; posizione: PosizioneVisita; vista: Telecamera3D; transito?: true; localeId?: string };
export type PassaggioVisita = {
  id: string; tipo: "sali" | "scendi" | "esci" | "entra"; nome: string;
  da: PosizioneVisita; a: PosizioneVisita; punti: V3[];
};
export type MappaVisita = { piani: PianoVisita[]; partenza: TappaVisita[]; passaggi: PassaggioVisita[]; vista: Vista3D };

const SCALE = new Set(["scala", "scala_u", "scala_chiocciola"]);
export const OCCHI_VISITA = 1.6;
const GRADINO_MASSIMO = .28;
const ESTERNO = "Esterno";
const distanza = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const nomeTappa = (nome: string, piano: PianoVisita) => piano.nome ? `${piano.nome} · ${nome}` : nome;

function facceCalpestabili(mesh: Mesh3D): Appoggio[] {
  const p = mesh.posizioni;
  const punto = (i: number): V3 => [p[i * 3], p[i * 3 + 1], p[i * 3 + 2]];
  const out: Appoggio[] = [];
  for (let i = 0; i < mesh.indici.length; i += 3) {
    const [ia, ib, ic] = [mesh.indici[i], mesh.indici[i + 1], mesh.indici[i + 2]];
    if (mesh.normali[ia * 3 + 1] < .75) continue;
    const a = punto(ia), b = punto(ib), c = punto(ic);
    const det = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
    if (Math.abs(det) < 1e-9) continue;
    out.push({ a, b, c, det, sx: Math.min(a[0], b[0], c[0]), dx: Math.max(a[0], b[0], c[0]),
      dietro: Math.min(a[2], b[2], c[2]), avanti: Math.max(a[2], b[2], c[2]) });
  }
  return out;
}

function appoggio(piano: PianoVisita, x: number, z: number, altezza: number, tolleranza = GRADINO_MASSIMO): number | null {
  const eps = .00001;
  let migliore: number | null = null;
  for (const f of piano.appoggi) {
    if (x < f.sx - eps || x > f.dx + eps || z < f.dietro - eps || z > f.avanti + eps) continue;
    const { a, b, c, det } = f;
    const u = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / det;
    const v = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / det;
    if (u < -eps || v < -eps || u + v > 1 + eps) continue;
    const y = a[1] * u + b[1] * v + c[1] * (1 - u - v);
    if (Math.abs(y - altezza) > tolleranza || (migliore !== null && y <= migliore)) continue;
    migliore = y;
  }
  return migliore;
}

function passo(piano: PianoVisita, vista: Vista3D, da: V3, x: number, z: number): V3 | null {
  const y = appoggio(piano, x, z, da[1]);
  if (y === null) return null;
  const a: V3 = [x, y, z];
  return passoLibero(piano.pianta, vista, da, a, true) ? a : null;
}

export function spostaVisita(mappa: MappaVisita, da: PosizioneVisita, dx: number, dz: number): PosizioneVisita | null {
  const piano = mappa.piani.find(p => p.id === da.pianoId);
  if (!piano) return null;
  const [x, , z] = da.piedi;
  const piedi = passo(piano, mappa.vista, da.piedi, x + dx, z + dz) ??
    (Math.abs(dx) > .005 ? passo(piano, mappa.vista, da.piedi, x + dx, z) : null) ??
    (Math.abs(dz) > .005 ? passo(piano, mappa.vista, da.piedi, x, z + dz) : null);
  return piedi ? { pianoId: piano.id, piedi } : null;
}

function avvicinamento(piano: PianoVisita, vista: Vista3D, da: V3, a: V3): V3[] | null {
  const n = Math.max(1, Math.ceil(distanza(da, a) / .16));
  let p = da;
  const punti: V3[] = [];
  for (let i = 1; i <= n; i++) {
    const s = i / n;
    const prossimo = passo(piano, vista, p, da[0] + (a[0] - da[0]) * s, da[2] + (a[2] - da[2]) * s);
    if (!prossimo) return null;
    punti.push(prossimo);
    p = prossimo;
  }
  return punti;
}

function gradiniScala(e: ElementoPer3D, quota: number, altezza: number): V3[] {
  const modello = modelloElemento(e.tipo);
  const l = e.larghezza === undefined ? modello.misure.l : e.larghezza / 100;
  const p = e.profondita === undefined ? modello.misure.p : e.profondita / 100;
  if (l < .42 || p < .65) return [];
  const a = e.rotazione * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  const punto = (x: number, z: number, y: number): V3 =>
    [e.centro.x / 100 + x * c - z * s, quota + y, e.centro.y / 100 + x * s + z * c];
  if (e.tipo === "scala" && e.alzateCad?.length) {
    const pedate = pedateCad(e.alzateCad, l, p);
    return pedate.map((ps, i) => punto(ps.reduce((t, p) => t + p.x / ps.length, 0), ps.reduce((t, p) => t + p.y / ps.length, 0), altezza * (i + 1) / pedate.length));
  }
  return modello.blocchi(l, p, altezza).filter(b => b.materiale === "legno").map(b => punto(b.x, b.z, b.y + b.h));
}

function pianerottolo(piano: PianoVisita, vista: Vista3D, estremo: V3, seguente: V3): V3 | null {
  const angolo = Math.atan2(estremo[2] - seguente[2], estremo[0] - seguente[0]);
  for (const correzione of [0, .44, -.44, .87, -.87, 1.32, -1.32]) {
    const direzione = angolo + correzione;
    for (const d of [.30, .45, .60, .78, 1, 1.24]) {
      const x = estremo[0] + d * Math.cos(direzione), z = estremo[2] + d * Math.sin(direzione);
      const y = appoggio(piano, x, z, piano.quota, .19);
      if (y === null) continue;
      const arrivo: V3 = [x, y, z];
      if (passoLibero(piano.pianta, vista, estremo, arrivo, true)) return arrivo;
    }
  }
  return null;
}

function collegaScale(piano: PianoVisita, sopra: PianoVisita, vista: Vista3D): PassaggioVisita[] {
  const altezza = sopra.quota - piano.quota;
  if (altezza < 1.65 || altezza > 6) return [];
  return piano.pianta.elementi.filter(e => SCALE.has(e.tipo)).flatMap(e => {
    const gradini = gradiniScala(e, piano.quota, altezza);
    if (gradini.length < 3) return [];
    const [basso, secondo] = gradini;
    const alto = gradini[gradini.length - 1], primaDellUltimo = gradini[gradini.length - 2];
    // Fra due piani serve il foro effettivamente costruito nel pavimento, oltre a una rampa disegnata.
    const aMezzaQuota = gradini.filter(p => p[1] > sopra.quota - OCCHI_VISITA + .13 && p[1] < sopra.quota - .25);
    if (!aMezzaQuota.length || aMezzaQuota.some(p => appoggio(sopra, p[0], p[2], sopra.quota, .07) !== null)) return [];
    const inizio = pianerottolo(piano, vista, basso, secondo), fine = pianerottolo(sopra, vista, alto, primaDellUltimo);
    if (!inizio || !fine || gradini.some((p, i) => {
      const da = gradini[i - 1] ?? inizio;
      return !passoLibero(piano.pianta, vista, da, p, true) ||
        (p[1] >= sopra.quota - .25 && !passoLibero(sopra.pianta, vista, da, p, true));
    })) return [];
    const punti = [inizio, ...gradini, fine];
    const da = { pianoId: piano.id, piedi: inizio }, a = { pianoId: sopra.id, piedi: fine };
    return [
      { id: `${piano.id}/${e.id}/sali`, tipo: "sali", nome: `Sali · ${sopra.nome}`, da, a, punti },
      { id: `${piano.id}/${e.id}/scendi`, tipo: "scendi", nome: `Scendi · ${piano.nome}`, da: a, a: da, punti: [...punti].reverse() },
    ];
  });
}

function localeIn(piano: PianoVisita, piedi: V3) {
  const id = localeAllaPosizione(piano.pianta, piedi);
  return piano.pianta.locali.find(l => l.id === id);
}

function collegaEsterni(piano: PianoVisita, vista: Vista3D): PassaggioVisita[] {
  const muri = new Map(piano.pianta.muri.filter(m => muroPresente(m.stato, vista)).map(m => [m.id, m]));
  return piano.pianta.aperture.filter(a => aperturaPercorribile(a, vista)).flatMap(a => {
    const m = muri.get(a.muroId);
    if (!m) return [];
    const dx = m.b.x - m.a.x, dz = m.b.y - m.a.y;
    const l = Math.hypot(dx, dz);
    if (l < 1) return [];
    const x = (m.a.x + dx / l * a.posizione) / 100;
    const z = (m.a.y + dz / l * a.posizione) / 100;
    const d = m.spessore / 200 + .40;
    const lati = [-d, d].map((d): V3 => [x - d * dz / l, piano.quota, z + d * dx / l]);
    const puoEntrare = lati.map(p => {
      const locale = localeIn(piano, p);
      return !!locale && eAmbienteInterno(locale);
    });
    if (puoEntrare[0] === puoEntrare[1]) return [];
    const [p0, p1] = puoEntrare[0] ? lati : lati.reverse();
    const y0 = appoggio(piano, p0[0], p0[2], piano.quota), y1 = appoggio(piano, p1[0], p1[2], piano.quota);
    if (y0 === null || y1 === null) return [];
    p0[1] = y0;
    p1[1] = y1;
    const percorso = avvicinamento(piano, vista, p0, p1);
    if (!percorso) return [];
    const da = { pianoId: piano.id, piedi: p0 }, fuori = { pianoId: piano.id, piedi: p1 };
    const esterno = localeIn(piano, p1)?.nome;
    return [
      { id: `${piano.id}/${a.id}/esci`, tipo: "esci", nome: esterno ? `Esci verso ${esterno}` : "Esci all’esterno", da, a: fuori, punti: [p0, ...percorso] },
      { id: `${piano.id}/${a.id}/entra`, tipo: "entra", nome: "Rientra nell’edificio", da: fuori, a: da, punti: [p0, ...percorso].reverse() },
    ];
  });
}

export function mappaVisita(piani: PianoPer3D[], vista: Vista3D, scena: Scena3D): MappaVisita {
  const visibili = [...piani].sort((a, b) => a.quota - b.quota);
  const terra = visibili.find(p => Math.abs(p.quota) <= 25)?.id;
  const appoggiPerPiano = new Map<string, Appoggio[]>();
  for (const mesh of scena.mesh) {
    if (mesh.genere !== "pavimento") continue;
    const id = mesh.id === "terreno" ? terra : mesh.id.split("/")[0];
    if (!id) continue;
    const appoggi = appoggiPerPiano.get(id) ?? [];
    for (const f of facceCalpestabili(mesh)) appoggi.push(f);
    appoggiPerPiano.set(id, appoggi);
  }
  const descritti = visibili.map((p): PianoVisita => ({ id: p.id, nome: p.nome, quota: p.quota / 100,
    pianta: vista === "fatto" ? p.piante.fatto : p.piante.progetto, appoggi: appoggiPerPiano.get(p.id) ?? [] }));
  const passaggi = descritti.flatMap((piano, i) => [
    ...(descritti[i + 1] ? collegaScale(piano, descritti[i + 1], vista) : []), ...collegaEsterni(piano, vista),
  ]);
  const partenza = descritti.flatMap((piano): TappaVisita[] => {
    const locali = [...piano.pianta.locali].sort((a, b) => Number(b.destinazione === "ingresso") - Number(a.destinazione === "ingresso"));
    const ambienti = locali.flatMap(l => {
      const camera = vistaDentroLocale(l, 66);
      const [x,, z] = camera.posizione;
      const y = appoggio(piano, x, z, piano.quota);
      if (y === null) return [];
      const dy = y + OCCHI_VISITA - camera.posizione[1];
      const occhi: V3 = [x, y + OCCHI_VISITA, z];
      return [{ id: `${piano.id}/stanza/${l.id}`, nome: nomeTappa(l.nome, piano), localeId: l.id, posizione: { pianoId: piano.id, piedi: [x, y, z] as V3 },
        vista: { ...camera, posizione: occhi, guarda: [camera.guarda[0], camera.guarda[1] + dy, camera.guarda[2]] as V3 } }];
    });
    const transiti = passaggi.filter(p => p.da.pianoId === piano.id).map(p => {
      const [x, y, z] = p.da.piedi, verso = p.punti[1] ?? p.a.piedi;
      const nome = p.tipo === "sali" ? "Ai piedi della scala" : p.tipo === "scendi" ? "Al pianerottolo" :
        p.tipo === "esci" ? "Davanti all’uscita" : "Fuori dall’ingresso";
      return { id: p.id, nome: nomeTappa(nome, piano), posizione: p.da,
        vista: { posizione: [x, y + OCCHI_VISITA, z] as V3, guarda: [verso[0], y + OCCHI_VISITA, verso[2]] as V3, fov: 68 }, transito: true as const };
    });
    const tappe: TappaVisita[] = [...ambienti, ...transiti];
    if (!tappe.length && piano.id === terra && piano.appoggi.length) {
      const x = (scena.limiti.max[0] + scena.limiti.min[0]) / 2, z = scena.limiti.max[2] + 1;
      const y = appoggio(piano, x, z, piano.quota, .6);
      if (y !== null) tappe.push({ id: piano.id + "/esterno", nome: nomeTappa(ESTERNO, piano), posizione: { pianoId: piano.id, piedi: [x, y, z] },
        vista: { posizione: [x, y + OCCHI_VISITA, z], guarda: [x, y + OCCHI_VISITA, z - 1], fov: 68 } });
    }
    const occorrenze = new Map<string, number>();
    return tappe.map(t => {
      const n = (occorrenze.get(t.nome) ?? 0) + 1;
      occorrenze.set(t.nome, n);
      return n > 1 ? { ...t, nome: `${t.nome} (${n})` } : t;
    });
  });
  return { piani: descritti, partenza, passaggi, vista };
}

export function luogoVisita(mappa: MappaVisita, posizione: PosizioneVisita) {
  const piano = mappa.piani.find(p => p.id === posizione.pianoId);
  if (!piano) return null;
  const locale = localeIn(piano, posizione.piedi);
  const vano = !locale && mappa.passaggi.some(p => (p.tipo === "sali" || p.tipo === "scendi") &&
    p.da.pianoId === piano.id && distanza(p.da.piedi, posizione.piedi) < .80);
  if (vano) return { pianoId: piano.id, piano: piano.nome, nome: "Vano scala", esterno: false };
  const esterno = locale ? !eAmbienteInterno(locale) : !piano.pianta.muri.length ||
    mappa.passaggi.some(p => p.tipo === "entra" && p.da.pianoId === piano.id && distanza(p.da.piedi, posizione.piedi) < .8) ||
    appoggio(piano, posizione.piedi[0], posizione.piedi[2], posizione.piedi[1], .015) !== piano.quota;
  return { pianoId: piano.id, piano: piano.nome, nome: locale?.nome ?? (esterno ? ESTERNO : "Passaggio"), localeId: locale?.id, esterno };
}

export function percorsoVisita(mappa: MappaVisita, posizione: PosizioneVisita, passaggio: PassaggioVisita): V3[] | null {
  if (posizione.pianoId !== passaggio.da.pianoId || distanza(posizione.piedi, passaggio.da.piedi) > 1.5) return null;
  const piano = mappa.piani.find(p => p.id === posizione.pianoId);
  if (!piano) return null;
  const prima = avvicinamento(piano, mappa.vista, posizione.piedi, passaggio.da.piedi);
  return prima ? [posizione.piedi, ...prima, ...passaggio.punti.slice(1)] : null;
}

export function interpolaPercorso(punti: V3[]) {
  const distanze = [0];
  for (let i = 1; i < punti.length; i++) {
    const a = punti[i - 1], b = punti[i];
    distanze.push(distanze[i - 1] + Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
  }
  const metri = distanze[distanze.length - 1];
  const punto = (s: number): V3 => {
    const d = Math.min(metri, Math.max(0, s));
    const i = distanze.findIndex(a => a > d);
    if (i < 1) return punti[punti.length - 1];
    const a = punti[i - 1], b = punti[i], t = (d - distanze[i - 1]) / (distanze[i] - distanze[i - 1]);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  };
  return { metri, punto };
}
