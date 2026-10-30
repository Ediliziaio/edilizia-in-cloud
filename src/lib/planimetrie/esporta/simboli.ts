/**
 * Sanitari e arredi come disegno vettoriale.
 *
 * Ogni simbolo nasce in coordinate proprie, centrato, con l'attacco al muro (lo
 * scarico del wc, lo schienale del divano, la testata del letto) in alto, cioè
 * verso y negativo; poi si ruota e si sposta dove sta nella pianta. Nel disegno
 * tecnico sono linee sottili su fondo bianco, nella presentazione prendono colore.
 */
import { ellisse, rettangoloArrotondato, ruota, somma } from "./geometria";
import type { Primitiva, Tratto } from "./scena";
import type { ElementoVista, Punto, StileDisegno } from "./tipi";

interface Pennello {
  presentazione: boolean;
  tratto: Tratto;
  sottile: Tratto;
}

type Forma = { punti: Punto[]; chiuso: boolean; riempimento?: string; sottile?: boolean };

const rett = (x0: number, y0: number, x1: number, y1: number, riempimento?: string, r = 0): Forma => ({
  punti: r > 0 ? rettangoloArrotondato(x0, y0, x1, y1, r) : [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }],
  chiuso: true,
  riempimento,
});
const ell = (cx: number, cy: number, rx: number, ry: number, riempimento?: string): Forma => ({
  punti: ellisse({ x: cx, y: cy }, rx, ry, 32), chiuso: true, riempimento,
});
const linea = (x0: number, y0: number, x1: number, y1: number): Forma => ({
  punti: [{ x: x0, y: y0 }, { x: x1, y: y1 }], chiuso: false, sottile: true,
});

/** I colori della presentazione; nel tecnico tutto bianco. */
const C = {
  ceramica: "#FFFFFF",
  acqua: "#D6ECF5",
  legno: "#C9A47E",
  legnoChiaro: "#E2CBAE",
  tessuto: "#8E9CAD",
  tessutoChiaro: "#B4C0CD",
  lenzuolo: "#F6F2EA",
  piano: "#D8D3CB",
  metallo: "#EEF0F2",
  scuro: "#3F3F46",
};

function forme(tipo: ElementoVista["tipo"], L: number, P: number): Forma[] {
  const w = L / 2, h = P / 2;
  switch (tipo) {
    case "wc":
      return [
        rett(-w, -h, w, -h + P * 0.28, C.ceramica, 3),
        ell(0, -h + P * 0.28 + P * 0.36, w * 0.92, P * 0.37, C.ceramica),
        ell(0, -h + P * 0.28 + P * 0.38, w * 0.55, P * 0.24, C.acqua),
      ];
    case "bidet":
      return [
        ell(0, 0.04 * P, w * 0.95, h * 0.95, C.ceramica),
        ell(0, 0.1 * P, w * 0.55, h * 0.55, C.acqua),
        ell(0, -h + P * 0.12, L * 0.06, L * 0.06, C.metallo),
      ];
    case "lavabo":
      return [
        rett(-w, -h, w, h, C.ceramica, 4),
        ell(0, P * 0.08, w * 0.72, h * 0.62, C.acqua),
        ell(0, -h + P * 0.14, L * 0.04, L * 0.04, C.metallo),
      ];
    case "doccia":
      return [
        rett(-w, -h, w, h, C.acqua),
        linea(-w, -h, w, h),
        linea(w, -h, -w, h),
        ell(0, 0, Math.min(L, P) * 0.05, Math.min(L, P) * 0.05, C.metallo),
      ];
    case "vasca":
      return [
        rett(-w, -h, w, h, C.ceramica, 6),
        rett(-w + 6, -h + 6, w - 6, h - 6, C.acqua, Math.min(L, P) * 0.3),
        ell(-w + L * 0.14, 0, 2.5, 2.5, C.metallo),
      ];
    case "cucina": {
      const fuochi = [-1, 1].flatMap((sx) => [-1, 1].map((sy) => ell(w * 0.45 + sx * 11, sy * P * 0.18, 7, 7, C.scuro)));
      return [
        rett(-w, -h, w, h, C.piano),
        rett(-w * 0.55, -h + 8, -w * 0.05, h - 8, C.metallo, 4),
        ...fuochi,
      ];
    }
    case "frigorifero":
      return [rett(-w, -h, w, h, C.metallo), linea(-w, h - 5, w, h - 5), linea(-w, -h, w, h - 5)];
    case "lavatrice":
      return [rett(-w, -h, w, h, C.metallo, 3), linea(-w, -h + P * 0.2, w, -h + P * 0.2), ell(0, P * 0.1, L * 0.3, L * 0.3, C.acqua)];
    case "caldaia":
      return [rett(-w, -h, w, h, C.metallo, 2), ell(0, 0, Math.min(w, h) * 0.45, Math.min(w, h) * 0.45, C.scuro)];
    case "letto_matrimoniale":
    case "letto_singolo": {
      const cuscini = tipo === "letto_matrimoniale"
        ? [rett(-w + 8, -h + 6, -4, -h + 32, C.ceramica, 6), rett(4, -h + 6, w - 8, -h + 32, C.ceramica, 6)]
        : [rett(-w + 8, -h + 6, w - 8, -h + 32, C.ceramica, 6)];
      return [
        rett(-w, -h, w, h, C.legnoChiaro, 3),
        rett(-w + 3, -h + 3, w - 3, h - 3, C.lenzuolo, 3),
        ...cuscini,
        rett(-w + 3, -h + P * 0.32, w - 3, h - 3, C.tessutoChiaro, 3),
        linea(-w + 3, -h + P * 0.4, w - 3, -h + P * 0.4),
      ];
    }
    case "divano": {
      const bracciolo = L * 0.1, schienale = P * 0.25;
      const seduta = (L - 2 * bracciolo) / 3;
      return [
        rett(-w, -h, w, h, C.tessuto, 6),
        rett(-w + bracciolo, -h + schienale, w - bracciolo, h, C.tessutoChiaro, 3),
        ...[1, 2].map((i) => linea(-w + bracciolo + seduta * i, -h + schienale, -w + bracciolo + seduta * i, h)),
      ];
    }
    case "tavolo": {
      const sedie: Forma[] = [];
      const sedia = (cx: number, cy: number, giu: boolean) => {
        const s = 21;
        sedie.push(rett(cx - s, cy - s, cx + s, cy + s, C.legno, 3));
        sedie.push(linea(cx - s, giu ? cy + s - 5 : cy - s + 5, cx + s, giu ? cy + s - 5 : cy - s + 5));
      };
      const perLato = L >= 150 ? 2 : 1;
      for (let i = 0; i < perLato; i++) {
        const cx = perLato === 1 ? 0 : -w / 2 + i * w;
        sedia(cx, -h - 16, false);
        sedia(cx, h + 16, true);
      }
      return [...sedie, rett(-w, -h, w, h, C.legnoChiaro, 2)];
    }
    case "sedia":
      return [rett(-w, -h, w, h, C.legno, 3), linea(-w, -h + 5, w, -h + 5)];
    case "armadio":
      return [rett(-w, -h, w, h, C.legnoChiaro), linea(-w, 0, w, 0), linea(0, -h, 0, h)];
    case "comodino":
      return [rett(-w, -h, w, h, C.legno, 2), ell(0, 0, Math.min(w, h) * 0.45, Math.min(w, h) * 0.45, C.lenzuolo)];
    case "scrivania":
      return [rett(-w, -h, w, h, C.legnoChiaro, 2)];
    default:
      return [rett(-w, -h, w, h, C.piano), linea(-w, -h, w, h)];
  }
}

export function simboloElemento(e: ElementoVista, stile: StileDisegno): Primitiva[] {
  const presentazione = stile === "presentazione";
  const p: Pennello = {
    presentazione,
    tratto: { colore: presentazione ? "#6B7280" : "#333333", spessoreMm: 0.18 },
    sottile: { colore: presentazione ? "#6B7280" : "#555555", spessoreMm: 0.1 },
  };
  const mondo = (q: Punto) => somma(ruota(q, e.rotazione ?? 0), e.posizione);
  return forme(e.tipo, e.larghezza, e.profondita).map((f) => ({
    tipo: "poligono" as const,
    layer: "ARREDI" as const,
    punti: f.punti.map(mondo),
    chiuso: f.chiuso,
    riempimento: f.chiuso ? (p.presentazione ? f.riempimento : "#FFFFFF") : undefined,
    tratto: f.sottile ? p.sottile : p.tratto,
  }));
}
