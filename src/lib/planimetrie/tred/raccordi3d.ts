import { CostruttoreMesh } from "./costruttore";
import { meshCanaliAria } from "./impianti3d";
import type { Mesh3D, PiantaPer3D, Punto2, RaccordoAria3D, V3 } from "./tipi";

const CM = .01;
type Canale = NonNullable<PiantaPer3D["canaliAria"]>[number];
const lunghezza = (a: Punto2, b: Punto2) => Math.hypot(b.x - a.x, b.y - a.y);
const somma = (p: Punto2, v: Punto2, r: number): Punto2 => ({ x: p.x + v.x * r, y: p.y + v.y * r });
const misura = (c: Canale) => ({ w: c.larghezza ?? 14, h: c.altezza ?? 10 });

function meshCurva(c: CostruttoreMesh, p: Punto2, u: Punto2, v: Punto2, r: number, quote: Canale, altro: Canale) {
  const centro = somma(somma(p, u, r), v, r);
  const a = misura(quote), b = misura(altro);
  const y = quote.quota * CM;
  const anelli = Array.from({ length: 13 }, (_, i) => {
    const t = i / 12, angolo = t * Math.PI / 2;
    const dx = -v.x * Math.cos(angolo) - u.x * Math.sin(angolo);
    const dz = -v.y * Math.cos(angolo) - u.y * Math.sin(angolo);
    const w = (a.w + (b.w - a.w) * t) / 2;
    const h = (a.h + (b.h - a.h) * t) * CM / 2;
    const punto = (lato: number, su: number): V3 => [(centro.x + dx * (r + lato * w)) * CM, y + h * su, (centro.y + dz * (r + lato * w)) * CM];
    return { basso: punto(1, -1), alto: punto(1, 1), dentroBasso: punto(-1, -1), dentroAlto: punto(-1, 1), dx, dz };
  });
  for (let i = 1; i < anelli.length; i++) {
    const a = anelli[i - 1], b = anelli[i];
    const x = a.dx + b.dx, z = a.dz + b.dz;
    c.quad(a.basso, b.basso, b.alto, a.alto, [x, 0, z]);
    c.quad(a.dentroBasso, b.dentroBasso, b.dentroAlto, a.dentroAlto, [-x, 0, -z]);
    c.quad(a.alto, b.alto, b.dentroAlto, a.dentroAlto, [0, 1, 0]);
    c.quad(a.basso, b.basso, b.dentroBasso, a.dentroBasso, [0, -1, 0]);
  }
  const a0 = anelli[0], a1 = anelli[anelli.length - 1];
  c.quad(a0.basso, a0.alto, a0.dentroAlto, a0.dentroBasso, [u.x, 0, u.y]);
  c.quad(a1.basso, a1.alto, a1.dentroAlto, a1.dentroBasso, [v.x, 0, v.y]);
}

function direzione(r: RaccordoAria3D["rami"][number]) {
  return r.asse === "x" ? { x: r.verso, y: 0 } : { x: 0, y: r.verso };
}

export function meshSchemaCanali(pianta: PiantaPer3D): Mesh3D[] {
  const tratti = new Map((pianta.canaliAria ?? []).map(t => [t.id, t]));
  const raccordi: Mesh3D[] = [];
  for (const r of pianta.raccordiAria ?? []) {
    const rami = r.rami.flatMap(ramo => {
      const tratto = tratti.get(ramo.trattoId);
      return tratto ? [{ tratto, verso: direzione(ramo) }] : [];
    });
    if (rami.length !== r.rami.length || rami.length < 2) continue;
    const c = new CostruttoreMesh();
    const p = r.punto;
    const [a, b] = rami;
    if (r.tipo === "curva") {
      const larghezza = Math.max(misura(a.tratto).w, misura(b.tratto).w);
      const raggio = Math.min(Math.max(23, larghezza * .8), ...rami.map(({ tratto }) =>
        Math.max(lunghezza(tratto.da, p), lunghezza(tratto.a, p)) * .37));
      if (raggio <= larghezza / 2 + 1) continue;
      meshCurva(c, p, a.verso, b.verso, raggio, a.tratto, b.tratto);
      for (const { tratto, verso } of rami) {
        const tangente = somma(p, verso, raggio);
        const usaDa = lunghezza(tratto.da, p) < lunghezza(tratto.a, p);
        const estremo = usaDa ? tratto.da : tratto.a;
        const distanzaLungo = (estremo.x - p.x) * verso.x + (estremo.y - p.y) * verso.y;
        if (distanzaLungo <= raggio + 1) {
          tratti.set(tratto.id, usaDa ? { ...tratto, da: tangente } : { ...tratto, a: tangente });
        } else if (r.coperto) {
          // Breve raccordo visivo fra il tratto interrotto in pianta e la curva.
          const id = `${r.id}-${tratto.id}`;
          tratti.set(id, { ...tratto, id, da: tangente, a: estremo, larghezza: undefined, altezza: undefined });
        }
      }
    } else {
      for (const { tratto, verso } of rami) {
        const { w, h } = misura(tratto);
        const l = Math.max(18, (w + 20) / 2);
        const centro = somma(p, verso, l * .24);
        c.scatola(centro.x * CM, centro.y * CM, (tratto.quota - h / 2 - 1) * CM, l * CM, (w + 2) * CM, (h + 2) * CM,
          Math.atan2(verso.y, verso.x));
      }
    }
    raccordi.push(c.mesh({ id: r.id, riferimento: r.id, genere: "elemento", stratoEsploso: "impianti",
      nome: `${r.tipo === "curva" ? "Curva" : "Derivazione"} · ${r.rete} · ${r.coperto ? "tracciato coperto da confermare" : "geometria indicativa"}`,
      materiale: r.selezionato ? "nodo_canali_evidenza" : `raccordo_${r.rete}${r.coperto ? "_coperto" : ""}`,
    }));
  }
  const incroci = (pianta.incrociAria ?? []).map(i => {
    const c = new CostruttoreMesh();
    const [bassa, alta] = i.quoteCm.map(q => q * CM);
    const { x, y } = i.punto;
    const s = i.selezionato ? .33 : .21;
    // Due cornici e una verticale tratteggiata. Nessun collegamento fisico nel modello.
    const frame = (q: number) => {
      for (const lato of [-1, 1]) {
        c.scatola(x * CM + lato * s, y * CM, q, .028, s * 2, .019, 0);
        c.scatola(x * CM, y * CM + lato * s, q, s * 2, .028, .019, 0);
      }
    };
    frame(bassa);
    if (alta - bassa > .01) {
      frame(alta);
      for (let q = bassa + .085; q < alta - .05; q += .145) c.scatola(x * CM, y * CM, q, .033, .033, .058, 0);
    }
    return c.mesh({ id: i.id, riferimento: i.id, nome: "Incrocio in pianta da verificare", genere: "elemento",
      stratoEsploso: "impianti", materiale: "nodo_canali_evidenza" });
  });
  return [...meshCanaliAria([...tratti.values()]), ...raccordi, ...incroci];
}
