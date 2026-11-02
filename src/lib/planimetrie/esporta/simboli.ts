/**
 * Sanitari e arredi come disegno vettoriale.
 *
 * Ogni simbolo nasce in coordinate proprie, centrato, con l'attacco al muro (lo
 * scarico del wc, lo schienale del divano, la testata del letto) in alto, cioè
 * verso y negativo; poi si ruota e si sposta dove sta nella pianta. Nel disegno
 * tecnico sono linee sottili su fondo bianco, nella presentazione prendono colore.
 */
import { ellisse, rettangoloArrotondato, ruota, somma } from "./geometria";
import { definizioneCampo, disegnoCampo, eCampo } from "../campiSport";
import type { Primitiva, Tratto } from "./scena";
import type { ElementoVista, Punto, StileDisegno } from "./tipi";

interface Pennello {
  presentazione: boolean;
  tratto: Tratto;
  sottile: Tratto;
}

export type Forma = {
  punti: Punto[]; chiuso: boolean; riempimento?: string; sottile?: boolean;
  /** Campito scuro anche nel disegno tecnico (pilastri, simboli pieni). */ pieno?: boolean;
  /** Colore della linea nella presentazione e nell'editor (le linee bianche dei campi). */ colore?: string;
  /** Il riempimento resta anche nell'editor (i campi sportivi hanno il loro colore). */ colorato?: boolean;
};

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
  piscina: "#9FD3EA",
  verde: "#B9D7A0",
  verdeScuro: "#8DBA72",
  pietra: "#E7E1D6",
};

/**
 * Uovo: la forma delle tazze di WC e bidet. Centro (cx, cy), mezza larghezza rx, raggio verso
 * il muro `su` e verso la stanza `giu` (la parte davanti è più lunga e più stretta).
 */
function uovo(cx: number, cy: number, rx: number, su: number, giu: number, riempimento?: string, n = 40): Forma {
  const punti: Punto[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const sin = Math.sin(t);
    const verso = sin >= 0 ? giu : su;
    // davanti si stringe un po': la tazza è a uovo, non a ellisse
    const stringi = sin > 0 ? 1 - 0.18 * sin * sin : 1;
    punti.push({ x: cx + rx * Math.cos(t) * stringi, y: cy + verso * sin });
  }
  return { punti, chiuso: true, riempimento };
}
const cerchio = (cx: number, cy: number, r: number, riempimento?: string): Forma => ell(cx, cy, r, r, riempimento);
/** Rubinetto visto dall'alto: un tondino sulla piastra e la canna verso la vasca. */
const rubinetto = (cx: number, cy: number, canna: number): Forma[] => [cerchio(cx, cy, 2.2, C.metallo), linea(cx, cy + 2.2, cx, cy + canna)];

/** Le forme di un simbolo, nel suo riferimento (cm, attacco al muro in alto). Serve anche all'editor. */
/** Campo sportivo: fascia esterna, campo di gioco, linee bianche, rete, porte, canestri, pareti. */
function formeCampo(tipo: string, L: number, P: number): Forma[] {
  const d = definizioneCampo(tipo), g = disegnoCampo(tipo, L, P);
  if (!d || !g) return [];
  const w = L / 2, h = P / 2;
  const out: Forma[] = [
    { ...rett(-w, -h, w, h, d.colori.fuori), colorato: true },
    { ...rett(g.gioco.x0, g.gioco.y0, g.gioco.x1, g.gioco.y1, d.colori.gioco), colorato: true, colore: d.colori.linee },
    ...g.linee.map((l): Forma => ({ punti: l, chiuso: false, colore: d.colori.linee })),
  ];
  for (const p of g.porte) out.push({ ...rett(p.x0, p.y0, p.x1, p.y1, "#FFFFFF"), colore: "#334155" });
  for (const pr of g.pareti) out.push({ punti: [pr.a, pr.b], chiuso: false, colore: pr.vetro ? "#7DD3FC" : "#475569" });
  if (g.rete) out.push({ punti: g.rete, chiuso: false, colore: "#1F2937" });
  for (const c of g.canestri) out.push({ ...cerchio(c.x, c.y, 23, "#F97316"), colorato: true, colore: "#9A3412" });
  for (const p of g.pali) out.push({ ...cerchio(p.x, p.y, 8, "#1F2937"), pieno: true });
  return out;
}

export function formeSimbolo(tipo: string, L: number, P: number): Forma[] {
  const w = L / 2, h = P / 2;
  if (eCampo(tipo)) return formeCampo(tipo, L, P);
  switch (tipo) {
    case "wc": {
      // cassetta (o placca) al muro, collo, tazza a uovo con il foro e il sedile
      const cass = Math.min(P * 0.3, 18);
      const ty = -h + cass + (P - cass) * 0.5;
      const ryS = (P - cass) * 0.44, ryG = (P - cass) * 0.52;
      return [
        rett(-w, -h, w, -h + cass, C.ceramica, 3),
        rett(-w * 0.5, -h + cass - 1, w * 0.5, -h + cass + 5, C.ceramica, 2),
        uovo(0, ty, w * 0.92, ryS, ryG, C.ceramica),
        uovo(0, ty + 2, w * 0.6, ryS * 0.62, ryG * 0.7, C.acqua),
        linea(-w * 0.5, -h + cass + 5, w * 0.5, -h + cass + 5),
      ];
    }
    case "bidet": {
      const ty = -h + P * 0.5;
      return [
        uovo(0, ty, w * 0.96, P * 0.42, P * 0.52, C.ceramica),
        uovo(0, ty + 3, w * 0.62, P * 0.27, P * 0.36, C.acqua),
        cerchio(0, ty + P * 0.18, 1.6, C.metallo),
        ...rubinetto(0, -h + P * 0.1, P * 0.08),
      ];
    }
    case "lavabo": {
      // piano col bordo, catino ovale, piletta, miscelatore dietro
      return [
        rett(-w, -h, w, h, C.ceramica, 5),
        ell(0, P * 0.08, w * 0.74, h * 0.66, C.acqua),
        ell(0, P * 0.08, w * 0.66, h * 0.56),
        cerchio(0, P * 0.12, 1.8, C.metallo),
        ...rubinetto(0, -h + P * 0.11, P * 0.12),
      ];
    }
    case "doccia": {
      // piatto con bordo, piletta, linee della pendenza, vetro sul lato aperto
      const m = Math.min(L, P);
      return [
        rett(-w, -h, w, h, C.acqua, 2),
        rett(-w + 4, -h + 4, w - 4, h - 4),
        linea(-w + 4, -h + 4, w - 4, h - 4),
        linea(w - 4, -h + 4, -w + 4, h - 4),
        cerchio(0, 0, m * 0.06, C.metallo),
        cerchio(0, 0, m * 0.03),
        ...rubinetto(0, -h + 6, 6),
        { punti: [{ x: -w, y: h }, { x: w, y: h }], chiuso: false },
      ];
    }
    case "vasca": {
      const m = Math.min(L, P);
      return [
        rett(-w, -h, w, h, C.ceramica, 6),
        // interno più largo alla testa (a destra), piletta ai piedi (a sinistra)
        rett(-w + 7, -h + 7, w - 7, h - 7, C.acqua, m * 0.32),
        cerchio(-w + L * 0.13, 0, 2.6, C.metallo),
        ...[-1, 1].map((k) => cerchio(-w + 4, k * 6, 1.8, C.metallo)),
        rett(w - L * 0.16, -h * 0.35, w - 9, h * 0.35, C.ceramica, 6),
      ];
    }
    case "cucina": {
      // piano di lavoro, lavello con gocciolatoio, piano cottura a 4 fuochi
      const lavL = Math.min(L * 0.36, 80);
      const xl = -w + 8;
      const vasca = rett(xl, -h + P * 0.18, xl + lavL * 0.55, h - P * 0.16, C.metallo, 4);
      const goccia = [0.2, 0.4, 0.6, 0.8].map((k) => linea(xl + lavL * 0.62, -h + P * (0.2 + 0.6 * k), xl + lavL, -h + P * (0.2 + 0.6 * k)));
      const cx = w - Math.min(L * 0.22, 40), r = Math.min(P * 0.12, 8);
      const fuochi = [-1, 1].flatMap((sx) => [-1, 1].flatMap((sy) => [
        cerchio(cx + sx * r * 1.6, sy * r * 1.5, r, C.scuro), cerchio(cx + sx * r * 1.6, sy * r * 1.5, r * 0.45),
      ]));
      return [
        rett(-w, -h, w, h, C.piano),
        linea(-w, h - 3, w, h - 3),
        rett(xl - 2, -h + P * 0.14, xl + lavL + 2, h - P * 0.12, C.metallo, 3),
        vasca,
        cerchio(xl + lavL * 0.27, 0, 2, C.scuro),
        ...goccia,
        ...rubinetto(xl + lavL * 0.27, -h + 5, P * 0.1),
        rett(cx - r * 3.2, -r * 3.1, cx + r * 3.2, r * 3.1, C.scuro, 2),
        ...fuochi,
      ];
    }
    case "divano_angolare": {
      // a L: il lato lungo contro il muro in alto, la penisola (chaise) a destra verso la stanza
      const sch = Math.min(P * 0.28, 24), br = 18, pen = Math.min(L * 0.38, 95);
      const contorno: Punto[] = [{ x: -w, y: -h }, { x: w, y: -h }, { x: w, y: h }, { x: w - pen, y: h }, { x: w - pen, y: -h + sch + 70 }, { x: -w, y: -h + sch + 70 }];
      const seduta: Punto[] = [{ x: -w + br, y: -h + sch }, { x: w - sch, y: -h + sch }, { x: w - sch, y: h - 4 }, { x: w - pen + 4, y: h - 4 }, { x: w - pen + 4, y: -h + sch + 66 }, { x: -w + br, y: -h + sch + 66 }];
      const posti = Math.max(2, Math.round((L - pen - br) / 65));
      const passo = (L - pen - br) / posti;
      return [
        { punti: contorno, chiuso: true, riempimento: C.tessuto },
        { punti: seduta, chiuso: true, riempimento: C.tessutoChiaro },
        ...Array.from({ length: posti }, (_, i) => linea(-w + br + passo * (i + 1), -h + sch + 3, -w + br + passo * (i + 1), -h + sch + 63)),
        linea(w - pen + 4, -h + sch + 70, w - sch, -h + sch + 70),
        rett(-w + 6, -h + sch + 10, -w + 30, -h + sch + 34, C.lenzuolo, 6),
      ];
    }
    case "poltrona":
      return [rett(-w, -h, w, h, C.tessuto, 8), rett(-w + L * 0.18, -h + P * 0.28, w - L * 0.18, h - 3, C.tessutoChiaro, 5)];
    case "mobile_tv":
      return [rett(-w, -h, w, h, C.legnoChiaro, 2), rett(-L * 0.3, h - 4, L * 0.3, h - 1, C.scuro, 1), linea(-w + L / 3, -h, -w + L / 3, h), linea(w - L / 3, -h, w - L / 3, h)];
    case "libreria":
      return [rett(-w, -h, w, h, C.legnoChiaro), ...Array.from({ length: Math.max(1, Math.round(L / 80)) - 1 }, (_, i) => linea(-w + (L * (i + 1)) / Math.max(1, Math.round(L / 80)), -h, -w + (L * (i + 1)) / Math.max(1, Math.round(L / 80)), h)), linea(-w, 0, w, 0)];
    case "tavolo_rotondo": {
      const r = Math.min(w, h);
      const sedie = [0, 1, 2, 3].map((k) => { const a = (k * Math.PI) / 2 + Math.PI / 4; const cx = Math.cos(a) * (r + 14), cy = Math.sin(a) * (r + 14); return ell(cx, cy, 15, 15, C.legno); });
      return [...sedie, ell(0, 0, r, r, C.legnoChiaro), ell(0, 0, r - 4, r - 4)];
    }
    case "cucina_angolare": {
      // a L: il lato lungo contro il muro in alto, il ritorno sul muro di sinistra
      const pr = Math.min(P, 62);
      const contorno: Punto[] = [{ x: -w, y: -h }, { x: w, y: -h }, { x: w, y: -h + pr }, { x: -w + pr, y: -h + pr }, { x: -w + pr, y: h }, { x: -w, y: h }];
      const r = Math.min(pr * 0.12, 8), cx = w - Math.min(L * 0.18, 40), cy = -h + pr / 2;
      const fuochi = [-1, 1].flatMap((sx) => [-1, 1].flatMap((sy) => [cerchio(cx + sx * r * 1.6, cy + sy * r * 1.5, r, C.scuro), cerchio(cx + sx * r * 1.6, cy + sy * r * 1.5, r * 0.45)]));
      const lx = -w + pr + 30;
      return [
        { punti: contorno, chiuso: true, riempimento: C.piano },
        rett(lx, -h + 10, lx + 46, -h + pr - 10, C.metallo, 4),
        ...rubinetto(lx + 23, -h + 4, 6),
        rett(cx - r * 3.2, cy - r * 3.1, cx + r * 3.2, cy + r * 3.1, C.scuro, 2),
        ...fuochi,
        rett(-w + 2, h - Math.min(P * 0.3, 65), -w + pr - 2, h - 2, C.metallo, 2),
      ];
    }
    case "isola_cucina":
      return [rett(-w, -h, w, h, C.piano, 4), rett(-w + 4, -h + 4, w - 4, h - 4), ...[-1, 0, 1].map((k) => ell(k * L * 0.3, h + 18, 16, 16, C.legno))];
    case "lavastoviglie":
      return [rett(-w, -h, w, h, C.metallo, 2), linea(-w, h - 5, w, h - 5), rett(-w * 0.5, h - 4, w * 0.5, h - 2, C.scuro, 1)];
    case "auto": {
      // vista dall'alto: cofano verso il muro (in alto), parabrezza, tetto, lunotto, ruote
      const r = Math.min(w * 0.45, 30);
      return [
        ...[-1, 1].flatMap((sx) => [-1, 1].map((sy): Forma => ({ ...rett(sx * w - 6, sy * h * 0.62 - 18, sx * w + 6, sy * h * 0.62 + 18, undefined, 3), pieno: true, riempimento: C.scuro }))),
        rett(-w + 4, -h, w - 4, h, C.metallo, r),
        { punti: [{ x: -w + 14, y: -h * 0.42 }, { x: w - 14, y: -h * 0.42 }, { x: w - 22, y: -h * 0.18 }, { x: -w + 22, y: -h * 0.18 }], chiuso: true, riempimento: C.acqua },
        rett(-w + 20, -h * 0.18, w - 20, h * 0.42, C.metallo, 8),
        { punti: [{ x: -w + 22, y: h * 0.42 }, { x: w - 22, y: h * 0.42 }, { x: w - 16, y: h * 0.6 }, { x: -w + 16, y: h * 0.6 }], chiuso: true, riempimento: C.acqua },
        linea(-w + 10, -h * 0.75, w - 10, -h * 0.75),
      ];
    }
    case "scaffale":
      return [rett(-w, -h, w, h), linea(-w, 0, w, 0), ...Array.from({ length: Math.max(1, Math.floor(L / 100)) }, (_, i) => linea(-w + (L * (i + 1)) / (Math.floor(L / 100) + 1), -h, -w + (L * (i + 1)) / (Math.floor(L / 100) + 1), h)), linea(-w, -h, w, h)];
    case "banco_lavoro":
      return [rett(-w, -h, w, h, C.legno, 2), rett(-w + 4, -h + 4, w - 4, h - 4), rett(w - L * 0.18, -h + 4, w - 6, -h + P * 0.45, C.metallo, 1)];
    // ─── impianti e struttura (prima solo nell'editor: ora anche in PDF e DXF) ───
    case "presa": { const r = Math.min(w, h); return [cerchio(0, 0, r, C.ceramica), linea(-r, 0, r, 0), linea(0, -r, 0, -r * 1.6)]; }
    case "interruttore": { const r = Math.min(w, h); return [cerchio(0, 0, r * 0.6, C.ceramica), linea(0, 0, r * 1.2, -r * 1.2), linea(r * 1.2, -r * 1.2, r * 1.6, -r * 0.8)]; }
    case "punto_luce": { const r = Math.min(w, h); const k = r * 0.7; return [cerchio(0, 0, r, C.ceramica), linea(-k, -k, k, k), linea(k, -k, -k, k)]; }
    case "punto_acqua": { const r = Math.min(w, h); return [cerchio(0, 0, r, C.ceramica), { punti: [...ellisse({ x: 0, y: 0 }, r, r, 32).filter((q) => q.y >= -0.01)], chiuso: true, pieno: true, riempimento: "#2563EB" }]; }
    case "scarico": { const r = Math.min(w, h); return [cerchio(0, 0, r, C.ceramica), { ...cerchio(0, 0, r * 0.35), pieno: true, riempimento: "#92400E" }]; }
    case "quadro_elettrico": return [rett(-w, -h, w, h, C.ceramica), { punti: [{ x: -w, y: -h }, { x: w, y: -h }, { x: -w, y: h }], chiuso: true, pieno: true, riempimento: "#DC2626" }];
    case "termosifone": { const n = Math.max(2, Math.floor(L / 10)); return [rett(-w, -h, w, h, C.metallo), ...Array.from({ length: n }, (_, i) => linea(-w + ((i + 1) * L) / (n + 1), -h, -w + ((i + 1) * L) / (n + 1), h))]; }
    case "split": return [rett(-w, -h, w, h, C.ceramica, 3), linea(-w + L * 0.08, h - P * 0.3, w - L * 0.08, h - P * 0.3), linea(-w + L * 0.08, h - P * 0.15, w - L * 0.08, h - P * 0.15)];
    case "unita_esterna": return [rett(-w, -h, w, h, C.metallo, 2), cerchio(-w + L * 0.35, 0, Math.min(L * 0.28, P * 0.42)), linea(-w + L * 0.7, -h + P * 0.25, w - L * 0.08, -h + P * 0.25), linea(-w + L * 0.7, h - P * 0.25, w - L * 0.08, h - P * 0.25)];
    case "collettore": return [rett(-w, -h, w, h, C.metallo), ...[0.2, 0.4, 0.6, 0.8].map((k) => ({ ...cerchio(-w + L * k, 0, Math.min(P * 0.3, 4)), pieno: true, riempimento: "#2563EB" }))];
    case "colonna_scarico": { const r = Math.min(w, h); return [cerchio(0, 0, r, C.ceramica), { ...cerchio(0, 0, r * 0.55), pieno: true, riempimento: "#92400E" }]; }
    case "pilastro": return [{ ...rett(-w, -h, w, h), pieno: true, riempimento: "#52525B" }];
    case "scala": {
      const n = Math.max(3, Math.floor(P / 28));
      return [rett(-w, -h, w, h, C.legnoChiaro), ...Array.from({ length: n - 1 }, (_, i) => linea(-w, -h + ((i + 1) * P) / n, w, -h + ((i + 1) * P) / n)), linea(0, h - P * 0.08, 0, -h + P * 0.1), { punti: [{ x: -L * 0.12, y: -h + P * 0.18 }, { x: 0, y: -h + P * 0.08 }, { x: L * 0.12, y: -h + P * 0.18 }], chiuso: false }];
    }
    case "muro_contenimento": {
      // in pianta: suola tratteggiata, fusto pieno vicino al lato davanti, terreno trattenuto con il tratteggio obliquo sul retro
      const zf = h - P * 0.3, t = Math.min(40, P * 0.18);
      const tratti: Forma[] = [];
      for (let x = -w + 20; x < w - 10; x += 40) tratti.push({ ...linea(x, -h + 6, x - 14, zf - t - 4), sottile: true });
      return [{ ...rett(-w, -h, w, h), sottile: true }, ...tratti, { ...rett(-w, zf - t, w, zf), pieno: true, riempimento: "#52525B" }];
    }
    // trave: lati tratteggiati (è sopra di noi); solaio: solo il perimetro, per non coprire il resto
    case "trave": return [{ ...rett(-w, -h, w, h), sottile: true }, linea(-w, 0, w, 0)];
    case "solaio": return [{ ...rett(-w, -h, w, h), sottile: true }, linea(-w, -h, w, h), linea(w, -h, -w, h)];
    case "scala_u": {
      // due rampe affiancate (si sale dal basso), pianerottolo in cima, freccia lungo la rampa di sinistra
      const pian = Math.min(100, P * 0.35), lungo = P - pian, n = Math.max(3, Math.round(lungo / 25));
      return [rett(-w, -h, w, h, C.legnoChiaro), linea(0, h, 0, -h + pian), linea(-w, -h + pian, w, -h + pian),
        ...Array.from({ length: n - 1 }, (_, i) => { const y = -h + pian + ((i + 1) * lungo) / n; return [linea(-w, y, -10, y), linea(10, y, w, y)]; }).flat(),
        linea(-w / 2, h - lungo * 0.08, -w / 2, -h + pian + lungo * 0.1),
        { punti: [{ x: -w / 2 - L * 0.06, y: -h + pian + lungo * 0.2 }, { x: -w / 2, y: -h + pian + lungo * 0.1 }, { x: -w / 2 + L * 0.06, y: -h + pian + lungo * 0.2 }], chiuso: false }];
    }
    case "scala_chiocciola": {
      const r = Math.min(w, h), n = 14;
      return [cerchio(0, 0, r, C.legnoChiaro), { ...cerchio(0, 0, r * 0.12), pieno: true, riempimento: "#52525B" },
        ...Array.from({ length: n }, (_, i) => linea(Math.cos((i * 2 * Math.PI) / n) * r * 0.12, Math.sin((i * 2 * Math.PI) / n) * r * 0.12, Math.cos((i * 2 * Math.PI) / n) * r, Math.sin((i * 2 * Math.PI) / n) * r)),
        { punti: [{ x: r * 0.55, y: r * 0.25 }, { x: r * 0.7, y: -r * 0.05 }, { x: r * 0.42, y: -r * 0.05 }], chiuso: false }];
    }
    case "ascensore": return [rett(-w, -h, w, h, C.metallo), linea(-w, -h, w, h), linea(w, -h, -w, h)];
    // ─── energia ───
    case "piscina": {
      // bordo in pietra, vasca, scaletta all'angolo
      const bordo = Math.min(30, L * 0.08, P * 0.08);
      return [rett(-w, -h, w, h, C.pietra, 4), rett(-w + bordo, -h + bordo, w - bordo, h - bordo, C.piscina, 6),
        linea(-w + bordo + 12, -h + bordo + 10, -w + bordo + 12, -h + bordo + 50), linea(-w + bordo + 32, -h + bordo + 10, -w + bordo + 32, -h + bordo + 50),
        linea(-w + bordo + 12, -h + bordo + 24, -w + bordo + 32, -h + bordo + 24), linea(-w + bordo + 12, -h + bordo + 38, -w + bordo + 32, -h + bordo + 38)];
    }
    case "idromassaggio": {
      const r = Math.min(w, h);
      return [rett(-w, -h, w, h, C.pietra, 10), cerchio(0, 0, r * 0.82, C.piscina), cerchio(0, 0, r * 0.5), ...[0, 1, 2, 3, 4, 5].map((i) => cerchio(Math.cos((i * Math.PI) / 3) * r * 0.66, Math.sin((i * Math.PI) / 3) * r * 0.66, r * 0.05, C.scuro))];
    }
    case "pergola": {
      // quattro pilastri e le lamelle del tetto
      const n = Math.max(3, Math.round(P / 40));
      const p0 = 8;
      return [rett(-w, -h, w, h), ...[-1, 1].flatMap((sx) => [-1, 1].map((sy): Forma => ({ ...rett(sx * w - (sx > 0 ? 2 * p0 : 0), sy * h - (sy > 0 ? 2 * p0 : 0), sx * w + (sx < 0 ? 2 * p0 : 0), sy * h + (sy < 0 ? 2 * p0 : 0)), pieno: true, riempimento: C.scuro }))),
        ...Array.from({ length: n - 1 }, (_, i) => ({ ...linea(-w, -h + (P * (i + 1)) / n, w, -h + (P * (i + 1)) / n), sottile: true }))];
    }
    case "albero": {
      const r = Math.min(w, h);
      const lobi = Array.from({ length: 9 }, (_, i) => ({ x: Math.cos((i * 2 * Math.PI) / 9) * r * 0.62, y: Math.sin((i * 2 * Math.PI) / 9) * r * 0.62 }));
      return [cerchio(0, 0, r, C.verde), ...lobi.map((q) => ({ ...cerchio(q.x, q.y, r * 0.36, C.verdeScuro), sottile: true })), cerchio(0, 0, r * 0.1, C.legno)];
    }
    case "siepe": {
      const n = Math.max(2, Math.round(L / 50));
      return [rett(-w, -h, w, h, C.verde, Math.min(h, 20)), ...Array.from({ length: n }, (_, i) => ({ ...cerchio(-w + (L * (i + 0.5)) / n, 0, Math.min(h * 0.7, L / n / 2), C.verdeScuro), sottile: true }))];
    }
    case "aiuola": return [rett(-w, -h, w, h, C.verde, 6), rett(-w + 6, -h + 6, w - 6, h - 6), ...[-0.5, 0, 0.5].map((k) => ({ ...cerchio(k * w, 0, Math.min(h * 0.4, 25), C.verdeScuro), sottile: true }))];
    case "ombrellone": {
      const r = Math.min(w, h);
      const spicchi = Array.from({ length: 8 }, (_, i) => ({ ...linea(0, 0, Math.cos((i * Math.PI) / 4) * r, Math.sin((i * Math.PI) / 4) * r), sottile: true }));
      return [{ punti: Array.from({ length: 8 }, (_, i) => ({ x: Math.cos((i * Math.PI) / 4) * r, y: Math.sin((i * Math.PI) / 4) * r })), chiuso: true, riempimento: C.lenzuolo }, ...spicchi, cerchio(0, 0, r * 0.06, C.scuro)];
    }
    case "lettino": return [rett(-w, -h, w, h, C.legnoChiaro, 6), rett(-w + 5, -h + 5, w - 5, -h + P * 0.32, C.lenzuolo, 4), linea(-w, -h + P * 0.34, w, -h + P * 0.34), ...[0.5, 0.65, 0.8].map((k) => ({ ...linea(-w + 6, -h + P * k, w - 6, -h + P * k), sottile: true }))];
    case "tavolo_esterno": {
      const sedie = Math.max(2, Math.floor(L / 60));
      return [rett(-w, -h, w, h, C.legno, 4), ...Array.from({ length: sedie }, (_, i) => -w + (L * (i + 0.5)) / sedie).flatMap((x) => [rett(x - 20, -h - 48, x + 20, -h - 8, C.legnoChiaro, 4), rett(x - 20, h + 8, x + 20, h + 48, C.legnoChiaro, 4)])];
    }
    case "barbecue": return [rett(-w, -h, w, h, C.pietra, 2), rett(-w * 0.45, -h * 0.6, w * 0.45, h * 0.6, C.scuro, 2), ...[-0.3, -0.1, 0.1, 0.3].map((k) => ({ ...linea(k * w, -h * 0.5, k * w, h * 0.5), sottile: true })), rett(-w + 6, -h + 6, -w * 0.55, h - 6), rett(w * 0.55, -h + 6, w - 6, h - 6)];
    case "cancello_pedonale":
    case "cancello_carrabile": {
      // anta (o due ante) in pianta con l'arco di apertura verso l'interno
      const due = tipo === "cancello_carrabile";
      const pezzi: Forma[] = [rett(-w, -h, w, h, C.metallo)];
      const ante = due ? [[-w, 1], [w, -1]] as const : [[-w, 1]] as const;
      for (const [x0, verso] of ante) {
        const l = due ? w : L;
        const a0 = verso > 0 ? 0 : Math.PI, a1 = verso > 0 ? Math.PI / 2 : Math.PI / 2;
        const passi = 10;
        pezzi.push({ ...linea(x0, h, x0, h + l), sottile: true });
        pezzi.push({ punti: Array.from({ length: passi + 1 }, (_, i) => { const t = a0 + ((a1 - a0) * i) / passi; return { x: x0 + Math.cos(t) * l, y: h + Math.sin(t) * l }; }), chiuso: false, sottile: true });
      }
      return pezzi;
    }
    case "lampione": { const r = Math.min(w, h); return [cerchio(0, 0, r, C.metallo), cerchio(0, 0, r * 0.4, "#FDE68A"), ...[0, 1, 2, 3].map((i) => ({ ...linea(Math.cos(i * Math.PI / 2) * r * 1.2, Math.sin(i * Math.PI / 2) * r * 1.2, Math.cos(i * Math.PI / 2) * r * 1.7, Math.sin(i * Math.PI / 2) * r * 1.7), sottile: true }))]; }
    case "faretto_giardino": { const r = Math.min(w, h); return [cerchio(0, 0, r, "#FDE68A"), linea(-r * 0.7, -r * 0.7, r * 0.7, r * 0.7), linea(r * 0.7, -r * 0.7, -r * 0.7, r * 0.7)]; }
    case "irrigatore": { const r = Math.min(w, h); return [cerchio(0, 0, r * 0.4, C.piscina), ...[0, 1, 2, 3, 4, 5].map((i) => ({ ...linea(0, 0, Math.cos(i * Math.PI / 3) * r, Math.sin(i * Math.PI / 3) * r), sottile: true }))]; }
    case "pozzetto": return [rett(-w, -h, w, h, C.pietra), rett(-w * 0.7, -h * 0.7, w * 0.7, h * 0.7), linea(-w * 0.7, 0, w * 0.7, 0), linea(0, -h * 0.7, 0, h * 0.7)];
    case "pompa_calore": {
      // unità esterna con due ventilatori
      const r = Math.min(L * 0.2, P * 0.42);
      return [rett(-w, -h, w, h, C.metallo, 2), ...[-1, 1].flatMap((k) => [cerchio(k * L * 0.24, 0, r), cerchio(k * L * 0.24, 0, r * 0.25, C.scuro), linea(k * L * 0.24 - r, 0, k * L * 0.24 + r, 0), linea(k * L * 0.24, -r, k * L * 0.24, r)])];
    }
    case "bollitore": { const r = Math.min(w, h); return [cerchio(0, 0, r, C.metallo), cerchio(0, 0, r * 0.7), linea(-r * 0.5, -r * 0.2, r * 0.5, -r * 0.2), linea(-r * 0.5, r * 0.2, r * 0.5, r * 0.2)]; }
    case "inverter": {
      const onda: Punto[] = Array.from({ length: 13 }, (_, i) => ({ x: -w * 0.6 + (i * w * 1.2) / 12, y: Math.sin((i / 12) * Math.PI * 2) * h * 0.45 }));
      return [rett(-w, -h, w, h, C.ceramica, 2), { punti: onda, chiuso: false, sottile: true }];
    }
    case "batteria_accumulo": return [rett(-w, -h, w, h, C.metallo, 2), rett(-w * 0.6, -h * 0.4, w * 0.6, h * 0.4), linea(-w * 0.3, 0, w * 0.3, 0), linea(w * 0.15, -h * 0.25, w * 0.15, h * 0.25)];
    case "wallbox": return [rett(-w, -h, w, h, C.ceramica, 2), { punti: [{ x: w * 0.15, y: -h * 0.8 }, { x: -w * 0.3, y: h * 0.1 }, { x: w * 0.1, y: h * 0.1 }, { x: -w * 0.15, y: h * 0.8 }], chiuso: false }];
    case "termostato": return [rett(-w, -h, w, h, C.ceramica, 1), cerchio(0, 0, Math.min(w, h) * 0.6)];
    // lucernario: la finestra vista da sopra, a tratto sottile, con la croce dell'anta
    case "lucernario": return [rett(-w, -h, w, h, "#e0f2fe", 1), rett(-w * 0.8, -h * 0.85, w * 0.8, h * 0.85), linea(-w * 0.8, -h * 0.85, w * 0.8, h * 0.85), linea(w * 0.8, -h * 0.85, -w * 0.8, h * 0.85)];
    // punto quotato: cerchio con la croce (la quota la scrive la scena accanto)
    case "quota_terreno": return [cerchio(0, 0, Math.min(w, h) * 0.9), linea(-w, 0, w, 0), linea(0, -h, 0, h)];
    case "vmc": return [rett(-w, -h, w, h, C.metallo, 2), cerchio(0, 0, Math.min(w, h) * 0.6), linea(-w, -h, w, h), linea(w, -h, -w, h)];
    case "frigorifero":
      return [rett(-w, -h, w, h, C.metallo, 2), linea(-w, h - 5, w, h - 5), rett(w - 6, -h * 0.4, w - 3, h * 0.4, C.scuro, 1)];
    case "lavatrice":
      return [rett(-w, -h, w, h, C.metallo, 3), linea(-w, -h + P * 0.18, w, -h + P * 0.18), cerchio(0, P * 0.08, Math.min(L, P) * 0.32, C.acqua), cerchio(0, P * 0.08, Math.min(L, P) * 0.22)];
    case "caldaia":
      return [rett(-w, -h, w, h, C.metallo, 2), cerchio(0, 0, Math.min(w, h) * 0.45, C.scuro), linea(-w * 0.6, h - 4, w * 0.6, h - 4)];
    case "letto_matrimoniale":
    case "letto_singolo": {
      const doppio = tipo === "letto_matrimoniale";
      const cuscini = doppio
        ? [rett(-w + 8, -h + 8, -5, -h + 34, C.ceramica, 7), rett(5, -h + 8, w - 8, -h + 34, C.ceramica, 7)]
        : [rett(-w + 8, -h + 8, w - 8, -h + 34, C.ceramica, 7)];
      const piega = -h + P * 0.36;
      return [
        rett(-w, -h, w, h, C.legnoChiaro, 3),
        rett(-w + 3, -h + 4, w - 3, h - 3, C.lenzuolo, 3),
        ...cuscini,
        // coperta col risvolto a triangolo, come nelle piante arredate
        { punti: [{ x: -w + 3, y: piega }, { x: w - 3, y: piega }, { x: w - 3, y: h - 3 }, { x: -w + 3, y: h - 3 }], chiuso: true, riempimento: C.tessutoChiaro },
        { punti: [{ x: w - 3, y: piega }, { x: w - 3 - Math.min(L * 0.35, 45), y: piega + Math.min(P * 0.16, 30) }, { x: w - 3 - Math.min(L * 0.35, 45), y: piega }], chiuso: true, riempimento: C.lenzuolo },
        linea(-w + 3, piega + 6, w - 3, piega + 6),
      ];
    }
    case "divano": {
      const bracciolo = Math.min(L * 0.11, 22), schienale = P * 0.26;
      const posti = Math.max(2, Math.round((L - 2 * bracciolo) / 65));
      const seduta = (L - 2 * bracciolo) / posti;
      return [
        rett(-w, -h, w, h, C.tessuto, 8),
        rett(-w + bracciolo, -h + schienale, w - bracciolo, h - 2, C.tessutoChiaro, 5),
        ...Array.from({ length: posti - 1 }, (_, i) => linea(-w + bracciolo + seduta * (i + 1), -h + schienale + 3, -w + bracciolo + seduta * (i + 1), h - 4)),
        ...Array.from({ length: posti }, (_, i) => rett(-w + bracciolo + seduta * i + 4, -h + 4, -w + bracciolo + seduta * (i + 1) - 4, -h + schienale - 2, C.tessuto, 6)),
      ];
    }
    case "tavolo":
      // le sedie sono elementi a sé (si mettono, si spostano e si contano una per una)
      return [rett(-w, -h, w, h, C.legnoChiaro, 3), rett(-w + 4, -h + 4, w - 4, h - 4)];
    case "sedia":
      return [rett(-w, -h, w, h, C.legno, 5), rett(-w + 3, -h + 3, w - 3, -h + 9, C.legnoChiaro, 2)];
    case "armadio": {
      // ante e appendiabiti (le grucce viste dall'alto)
      const ante = Math.max(1, Math.round(L / 50));
      const grucce = Math.max(3, Math.floor(L / 12));
      return [
        rett(-w, -h, w, h, C.legnoChiaro),
        linea(-w + 4, 0, w - 4, 0),
        ...Array.from({ length: ante - 1 }, (_, i) => linea(-w + (L * (i + 1)) / ante, h - 4, -w + (L * (i + 1)) / ante, h)),
        ...Array.from({ length: grucce }, (_, i) => linea(-w + 6 + ((L - 12) * (i + 0.5)) / grucce - 3, -h * 0.55, -w + 6 + ((L - 12) * (i + 0.5)) / grucce + 3, h * 0.55)),
        linea(-w, h - 4, w, h - 4),
      ];
    }
    case "comodino":
      return [rett(-w, -h, w, h, C.legno, 2), cerchio(0, 0, Math.min(w, h) * 0.45, C.lenzuolo), cerchio(0, 0, Math.min(w, h) * 0.15)];
    case "scrivania":
      return [rett(-w, -h, w, h, C.legnoChiaro, 2), rett(-w * 0.35, -h + 4, w * 0.35, -h + 8, C.scuro, 1), ell(w * 0.55, h * 0.3, 5, 4)];
    default:
      return [rett(-w, -h, w, h, C.piano), linea(-w, -h, w, h)];
  }
}

/** I tipi che hanno un disegno qui (gli altri, come i punti impianto, li disegna l'editor). */
export const TIPI_CON_FORME = new Set([
  "divano_angolare", "poltrona", "mobile_tv", "libreria", "tavolo_rotondo", "cucina_angolare", "isola_cucina", "lavastoviglie", "auto", "scaffale", "banco_lavoro",
  "presa", "interruttore", "punto_luce", "punto_acqua", "scarico", "quadro_elettrico", "termosifone", "split", "unita_esterna", "collettore", "colonna_scarico", "pilastro", "muro_contenimento", "trave", "solaio", "scala", "scala_u", "scala_chiocciola", "ascensore",
  "pompa_calore", "bollitore", "inverter", "batteria_accumulo", "wallbox", "termostato", "vmc", "lucernario", "quota_terreno",
  "piscina", "idromassaggio", "pergola", "albero", "siepe", "aiuola", "ombrellone", "lettino", "tavolo_esterno", "barbecue",
  "cancello_pedonale", "cancello_carrabile", "lampione", "faretto_giardino", "irrigatore", "pozzetto",
  "campo_tennis", "campo_padel", "campo_calcio5", "campo_calcio7", "campo_calcio11", "campo_basket", "campo_pallavolo", "campo_beach_volley", "campo_pickleball", "campo_bocce",
  "wc", "bidet", "lavabo", "doccia", "vasca", "cucina", "frigorifero", "lavatrice", "caldaia", "letto_matrimoniale", "letto_singolo", "divano", "tavolo", "sedia", "armadio", "comodino", "scrivania"]);

export function simboloElemento(e: ElementoVista, stile: StileDisegno): Primitiva[] {
  const presentazione = stile === "presentazione";
  const p: Pennello = {
    presentazione,
    tratto: { colore: presentazione ? "#6B7280" : "#333333", spessoreMm: 0.18 },
    sottile: { colore: presentazione ? "#6B7280" : "#555555", spessoreMm: 0.1 },
  };
  const mondo = (q: Punto) => somma(ruota(q, e.rotazione ?? 0), e.posizione);
  return formeSimbolo(e.tipo, e.larghezza, e.profondita).map((f) => ({
    tipo: "poligono" as const,
    layer: "ARREDI" as const,
    punti: f.punti.map(mondo),
    chiuso: f.chiuso,
    riempimento: f.chiuso ? (f.pieno ? (p.presentazione ? f.riempimento ?? "#3F3F46" : "#333333") : p.presentazione ? f.riempimento : "#FFFFFF") : undefined,
    tratto: f.colore && p.presentazione ? { ...(f.sottile ? p.sottile : p.tratto), colore: f.colore } : f.sottile ? p.sottile : p.tratto,
  }));
}
