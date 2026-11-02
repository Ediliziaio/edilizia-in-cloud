/**
 * Tutto l'edificio in 3D: i piani della pianta uno sopra l'altro, ognuno alla sua quota
 * (interrati sotto zero, sottotetto in cima). Ogni piano si costruisce come da solo e poi si
 * alza; gli id delle mesh prendono il piano davanti, così non si scontrano.
 *
 * «Esploso» stacca i piani di qualche metro per vedere dentro a ognuno; «fino a» toglie
 * quelli sopra, come sollevare il tetto e i solai.
 */
import type { Planimetria } from "../../../../shared/planimetrie/modello.ts";
import { pianteDaPlanimetria } from "./adattatore";
import { costruisciScena, limitiDi, meshTerreno } from "./scena";
import { MATERIALI } from "./materiali";
import { CostruttoreMesh } from "./costruttore";
import type { Mesh3D, OpzioniScena, PiantaPer3D, Scena3D } from "./tipi";

export interface PianoPer3D {
  id: string;
  nome: string;
  /** Quota del pavimento, in cm (negativa per gli interrati). */
  quota: number;
  piante: { fatto: PiantaPer3D; progetto: PiantaPer3D };
}

/** I piani dal più basso al più alto, con la proposta scelta su ognuno (se ce l'ha). */
export function pianiDaPlanimetria(doc: Planimetria, propostaId?: string): PianoPer3D[] {
  return [...doc.livelli]
    .sort((a, b) => a.quota - b.quota)
    .map((l) => {
      const p = pianteDaPlanimetria(doc, { livelloId: l.id, propostaId: l.proposte.some((x) => x.id === propostaId) ? propostaId : undefined });
      return { id: l.id, nome: l.nome, quota: l.quota, piante: { fatto: p.fatto, progetto: p.progetto } };
    });
}

export interface OpzioniEdificio extends OpzioniScena {
  /** Metri in più fra un piano e l'altro (0 = come è davvero). */
  esploso?: number;
  /** Si mostrano i piani fino a questo (compreso); quelli sopra no. */
  finoA?: string;
}

export function scenaEdificio(piani: PianoPer3D[], opzioni: OpzioniEdificio = {}): Scena3D {
  const vista = opzioni.vista ?? "progetto";
  const fino = opzioni.finoA ? piani.findIndex((p) => p.id === opzioni.finoA) : -1;
  const scelti = fino >= 0 ? piani.slice(0, fino + 1) : piani;
  const mesh: Mesh3D[] = [];
  const materiali: Scena3D["materiali"] = {};
  const avvisi: string[] = [];
  scelti.forEach((piano, i) => {
    const base = vista === "fatto" ? piano.piante.fatto : piano.piante.progetto;
    // le pareti arrivano fino al piano sopra (lo spessore del solaio): senza, da fuori fra un
    // piano e l'altro resterebbe una fessura
    const sopra = scelti[i + 1];
    const fino = sopra ? sopra.quota - piano.quota : 0;
    // pareti fino al piano sopra; la scala sale fino al pavimento del piano sopra (non 2,80 fissi)
    const pianta = fino > 0
      ? { ...base, muri: base.muri.map((m) => ({ ...m, altezza: Math.max(m.altezza, fino) })), elementi: base.elementi.map((e) => (e.tipo === "scala" ? { ...e, altezza: fino } : e)) }
      : base;
    // il tetto solo sull'ultimo piano mostrato (con «fino a» si scoperchia)
    const conTetto = i === scelti.length - 1 ? pianta : { ...pianta, tetto: undefined };
    const s = costruisciScena(conTetto, { ...opzioni, terreno: undefined, foroScala: i > 0 });
    // un attico o un duplex ai piani alti: sotto c'è il resto dell'edificio, in grigio
    if (i === 0 && piano.quota > 100) {
      const l = limitiDi(s.mesh, (g) => g === "muro");
      if (Number.isFinite(l.min[0])) {
        const c = new CostruttoreMesh();
        c.scatola((l.min[0] + l.max[0]) / 2, (l.min[2] + l.max[2]) / 2, 0, l.max[0] - l.min[0], l.max[2] - l.min[2], piano.quota / 100, 0);
        mesh.push(c.mesh({ id: "edificio-sotto", nome: "Edificio (piani sotto)", genere: "muro", materiale: "massa", riferimento: "edificio" }));
        materiali.massa = MATERIALI.massa;
      }
    }
    // l'ultimo piano mostrato resta senza soffitto se lo si guarda dall'alto: lo decide `soffitto`
    const dy = piano.quota / 100 + i * (opzioni.esploso ?? 0);
    for (const m of s.mesh) {
      const posizioni = m.posizioni.slice();
      for (let k = 1; k < posizioni.length; k += 3) posizioni[k] += dy;
      mesh.push({ ...m, id: `${piano.id}/${m.id}`, nome: `${piano.nome} · ${m.nome}`, posizioni });
    }
    Object.assign(materiali, s.materiali);
    avvisi.push(...s.avvisi.map((a) => `${piano.nome}: ${a}`));
  });
  const limiti = limitiDi(mesh);
  if (opzioni.terreno && opzioni.terreno > 0 && mesh.length) {
    mesh.push(meshTerreno(limiti, opzioni.terreno));
    materiali.prato = MATERIALI.prato;
  }
  return { mesh, materiali, limiti, avvisi };
}
