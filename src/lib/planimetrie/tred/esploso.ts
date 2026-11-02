/**
 * Vista esplosa a strati, come nei disegni CAD: la casa si apre in fette staccate lungo l'altezza,
 * dal basso: platea · pavimenti · pareti con porte, finestre e arredi · soffitti · tetto.
 * Non cambia nulla della pianta: sposta in alto le mesh di ogni strato di un multiplo della distanza,
 * così si vede cosa sta dentro e come è fatto ogni strato.
 *
 * Con più piani ogni piano ha i suoi strati, uno sopra l'altro (la distanza fra strati resta la stessa).
 * Le aree esterne e il terreno non si muovono.
 */
import { CostruttoreMesh } from "./costruttore";
import { limitiDi } from "./scena";
import type { Mesh3D, Scena3D } from "./tipi";

/** Strati dal basso: -1 platea, 0 pavimenti, 1 pareti e arredi, 2 soffitti, 3 tetto. `null` = non si muove. */
export function stratoDi(m: Pick<Mesh3D, "id" | "riferimento" | "genere">): number | null {
  const base = m.id.includes("/") ? m.id.slice(m.id.lastIndexOf("/") + 1) : m.id;
  if (base === "terreno" || base.startsWith("area:")) return null;
  if (base === "edificio-sotto" || base === "platea") return -1;
  if (m.riferimento === "tetto" || base.startsWith("tetto")) return 3;
  if (base.startsWith("soffitto:")) return 2;
  if (base.startsWith("pavimento:")) return 0;
  return 1;
}

/** Il soffitto è una superficie sola, visibile solo da sotto: nella vista esplosa si guarda anche da sopra, quindi si aggiunge la faccia opposta. */
function aDoppiaFaccia(m: Mesh3D): Mesh3D {
  const n = m.posizioni.length / 3;
  const indici = m.indici.slice();
  for (let i = 0; i + 2 < m.indici.length; i += 3) indici.push(m.indici[i] + n, m.indici[i + 2] + n, m.indici[i + 1] + n);
  return { ...m, posizioni: m.posizioni.concat(m.posizioni), normali: m.normali.concat(m.normali.map((x) => -x)), indici };
}

const MATERIALE_PLATEA = { nome: "Platea di fondazione", colore: "#9c978d", opacita: 1, ruvidita: 0.95 };

const prefissoPiano = (id: string) => (id.includes("/") ? id.slice(0, id.lastIndexOf("/")) : "");

export function esplodiInStrati(scena: Scena3D, distanza: number): Scena3D {
  if (!(distanza > 0) || !scena.mesh.length) return scena;
  // i piani dal più basso: prima del loro prefisso, in ordine di altezza reale
  const minPiano = new Map<string, number>();
  for (const m of scena.mesh) {
    const p = prefissoPiano(m.id);
    let y = Infinity;
    for (let i = 1; i < m.posizioni.length; i += 3) y = Math.min(y, m.posizioni[i]);
    minPiano.set(p, Math.min(minPiano.get(p) ?? Infinity, y));
  }
  const ordine = [...minPiano.entries()].sort((a, b) => a[1] - b[1]).map(([p]) => p);
  const mesh: Mesh3D[] = scena.mesh.map((m) => {
    const strato = stratoDi(m);
    if (strato === null) return m;
    const dy = (ordine.indexOf(prefissoPiano(m.id)) * 4 + strato) * distanza;
    if (dy === 0 && strato !== 2) return m;
    const sorgente = strato === 2 ? aDoppiaFaccia(m) : m;
    const posizioni = sorgente.posizioni.slice();
    for (let k = 1; k < posizioni.length; k += 3) posizioni[k] += dy;
    return { ...sorgente, posizioni };
  });
  const materiali = { ...scena.materiali };
  // la platea: la lastra di fondazione sotto tutta la casa, un po' più larga dei muri
  const l = limitiDi(scena.mesh, (g) => g === "muro");
  if (Number.isFinite(l.min[0]) && l.max[0] > l.min[0] && !scena.mesh.some((m) => stratoDi(m) === -1)) {
    const c = new CostruttoreMesh();
    const margine = 0.4;
    c.scatola((l.min[0] + l.max[0]) / 2, (l.min[2] + l.max[2]) / 2, -0.3, l.max[0] - l.min[0] + 2 * margine, l.max[2] - l.min[2] + 2 * margine, 0.3, 0);
    const platea = c.mesh({ id: "platea", nome: "Platea di fondazione", genere: "pavimento", materiale: "platea", riferimento: "platea" });
    const posizioni = platea.posizioni.slice();
    for (let k = 1; k < posizioni.length; k += 3) posizioni[k] -= distanza;
    mesh.push({ ...platea, posizioni });
    materiali.platea = MATERIALE_PLATEA;
  }
  return { ...scena, mesh, materiali, limiti: limitiDi(mesh) };
}
