import { limitiDi } from "./scena";
import type { Mesh3D, Scena3D, StratoEsploso3D } from "./tipi";

export const STRATI_ESPLOSO: readonly { id: StratoEsploso3D; nome: string }[] = [
  { id: "fondazioni", nome: "Fondazioni schematiche" },
  { id: "pavimenti", nome: "Pavimenti" },
  { id: "impianti", nome: "Impianti" },
  { id: "pareti", nome: "Pareti e serramenti" },
  { id: "arredi", nome: "Arredi e sanitari" },
  { id: "soffitti", nome: "Soffitti" },
  { id: "copertura", nome: "Copertura" },
];

const ordineStrati = new Map(STRATI_ESPLOSO.map(({ id }, index) => [id, index]));
const prefissoPiano = (id: string) => id.includes("/") ? id.slice(0, id.lastIndexOf("/")) : "";
const chiaveStrato = (piano: string, strato: StratoEsploso3D) => `${piano}/${strato}`;

export function stratoDi(m: Pick<Mesh3D, "id" | "riferimento" | "genere" | "stratoEsploso">): StratoEsploso3D | null {
  if (m.stratoEsploso !== undefined) return m.stratoEsploso;
  const base = m.id.slice(m.id.lastIndexOf("/") + 1);
  if (base === "terreno" || base === "marciapiede" || base === "edificio-sotto" || base.startsWith("area:")) return null;
  if (base === "fondazioni" || base === "platea") return "fondazioni";
  if (m.riferimento === "tetto" || base.startsWith("tetto")) return "copertura";
  if (base.startsWith("soffitto:")) return "soffitti";
  if (base.startsWith("pavimento:")) return "pavimenti";
  if (base.startsWith("impianto:")) return "impianti";
  if (base.startsWith("elemento:")) return "arredi";
  return "pareti";
}

/** Il soffitto è una superficie sola, visibile da sotto nella scena ordinaria. */
function aDoppiaFaccia(m: Mesh3D): Mesh3D {
  const n = m.posizioni.length / 3;
  const indici = m.indici.slice();
  for (let i = 0; i + 2 < m.indici.length; i += 3) indici.push(m.indici[i] + n, m.indici[i + 2] + n, m.indici[i + 1] + n);
  return { ...m, posizioni: m.posizioni.concat(m.posizioni), normali: m.normali.concat(m.normali.map(x => -x)), indici };
}

interface Gruppo {
  piano: string;
  strato: StratoEsploso3D;
  min: number;
  max: number;
}

/** Separa i gruppi usando il loro ingombro verticale, conservando geometria, X/Y della pianta e contesto esterno. */
export function esplodiInStrati(scena: Scena3D, distanza: number): Scena3D {
  if (!Number.isFinite(distanza) || distanza <= 0 || !scena.mesh.length) return scena;
  const gruppi = new Map<string, Gruppo>(), quotePiani = new Map<string, number>();
  for (const m of scena.mesh) {
    const strato = stratoDi(m);
    if (!strato || m.posizioni.length < 3) continue;
    const piano = prefissoPiano(m.id);
    const chiave = chiaveStrato(piano, strato);
    const g = gruppi.get(chiave) ?? { piano, strato, min: Infinity, max: -Infinity };
    for (let i = 1; i < m.posizioni.length; i += 3) {
      g.min = Math.min(g.min, m.posizioni[i]);
      g.max = Math.max(g.max, m.posizioni[i]);
    }
    gruppi.set(chiave, g);
    quotePiani.set(piano, Math.min(quotePiani.get(piano) ?? Infinity, g.min));
  }
  const ordinati = [...gruppi.entries()].sort(([, a], [, b]) =>
    quotePiani.get(a.piano)! - quotePiani.get(b.piano)! || a.piano.localeCompare(b.piano) ||
    ordineStrati.get(a.strato)! - ordineStrati.get(b.strato)!);
  const spostamenti = new Map<string, number>();
  let precedente = -Infinity;
  for (const [chiave, g] of ordinati) {
    const base = Math.max(g.min, precedente + distanza);
    spostamenti.set(chiave, base - g.min);
    precedente = base + g.max - g.min;
  }
  const mesh = scena.mesh.map((m): Mesh3D => {
    const strato = stratoDi(m);
    if (!strato) return m;
    const dy = spostamenti.get(chiaveStrato(prefissoPiano(m.id), strato)) ?? 0;
    if (!dy && strato !== "soffitti") return m;
    const sorgente = strato === "soffitti" ? aDoppiaFaccia(m) : m;
    const posizioni = sorgente.posizioni.slice();
    for (let k = 1; k < posizioni.length; k += 3) posizioni[k] += dy;
    const { auto, arredoCatalogo } = sorgente;
    return { ...sorgente, posizioni, ...(auto ? { auto: { ...auto, centro: [auto.centro[0], auto.centro[1] + dy, auto.centro[2]] } } : {}),
      ...(arredoCatalogo ? { arredoCatalogo: { ...arredoCatalogo,
        centro: [arredoCatalogo.centro[0], arredoCatalogo.centro[1] + dy, arredoCatalogo.centro[2]] } } : {}) };
  });
  return { ...scena, mesh, limiti: limitiDi(mesh) };
}
