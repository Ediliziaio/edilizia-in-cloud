/**
 * Sanitari e arredi come blocchi semplici: pochi parallelepipedi per oggetto, quanto
 * basta a riconoscerli e a dare all'AI dei render le proporzioni giuste.
 *
 * Ogni modello è descritto nel suo sistema: x lungo la larghezza, z lungo la
 * profondità, il retro a z = -profondità/2 (contro il muro), misure in metri.
 */
import { CostruttoreMesh } from "./costruttore";
import { CAMPI, definizioneCampo, disegnoCampo, eCampo } from "../campiSport";
import type { V3 } from "./tipi";

export interface Blocco {
  materiale: string;
  /** Rotazione del blocco attorno al suo centro (radianti), prima di quella dell'elemento. */
  girata?: number;
  /** Centro della base del blocco, rispetto al centro dell'ingombro. */
  x: number;
  z: number;
  y: number;
  l: number;
  p: number;
  h: number;
}

interface ModelloElemento {
  nome: string;
  misure: { l: number; p: number; h: number };
  blocchi: (l: number, p: number, h: number, opz?: { senzaCabina?: boolean; interpiano?: number }) => Blocco[];
}

const b = (materiale: string, x: number, z: number, y: number, l: number, p: number, h: number): Blocco => ({ materiale, x, z, y, l, p, h });
const bordoVasca = (l: number, p: number, y: number, h: number, z = 0): Blocco[] => {
  const s = Math.min(.055, l / 6, p / 6);
  return [b("ceramica", -l / 2 + s / 2, z, y, s, p, h), b("ceramica", l / 2 - s / 2, z, y, s, p, h), b("ceramica", 0, z - p / 2 + s / 2, y, l - 2 * s, s, h), b("ceramica", 0, z + p / 2 - s / 2, y, l - 2 * s, s, h)];
};
const basiCucina = (l: number, p: number, h: number): Blocco[] => {
  const n = Math.max(1, Math.round(l / .6)), sp = Math.min(.025, p / 6);
  return [b("laccato", 0, -.02, .1, l, p - .04, h - .14), b("piano_cucina", 0, 0, h - .04, l, p, .04), b("laccato", 0, 0, 0, l * .96, p * .85, .1),
    ...Array.from({ length: n }, (_, i) => {
      const x = -l / 2 + (i + .5) * l / n;
      return [b("laccato", x, p / 2 - sp / 2, .1, l / n - .006, sp, h - .14), b("metallo", x, p / 2 - .008, h * .7, Math.min(.14, l / n * .5), .012, .012)];
    }).flat()];
};

export const MODELLI: Record<string, ModelloElemento> = {
  wc: {
    nome: "WC",
    misure: { l: 0.38, p: 0.55, h: 0.4 },
    blocchi: (l, p, h) => [b("ceramica", 0, .05 * p, 0, l * .6, p * .65, h * .65), ...bordoVasca(l * .9, p * .75, h * .65, h * .35, .1 * p), b("ceramica", 0, -p / 2 + .08, h, l, .16, .38)],
  },
  bidet: {
    nome: "Bidet",
    misure: { l: 0.38, p: 0.52, h: 0.4 },
    blocchi: (l, p, h) => [b("ceramica", 0, 0, 0, l * .65, p * .7, h * .65), ...bordoVasca(l * .9, p, h * .65, h * .35), b("metallo", 0, -p * .38, h, .035, .035, .1)],
  },
  lavabo: {
    nome: "Lavabo",
    misure: { l: 0.6, p: 0.45, h: 0.85 },
    blocchi: (l, p, h) => [b("laccato", 0, -.02, 0, l * .9, p * .85, h - .15), b("ceramica", 0, 0, h - .15, l, p, .025), ...bordoVasca(l, p, h - .125, .125)],
  },
  doccia: {
    nome: "Doccia",
    misure: { l: 0.8, p: 0.8, h: 2.0 },
    blocchi: (l, p, h) => {
      const s = Math.min(.025, l / 10, p / 10);
      return [b("ceramica", 0, 0, 0, l, p, .04), ...bordoVasca(l, p, .04, .025),
        b("metallo", 0, 0, .041, Math.min(.09, l / 4), Math.min(.09, p / 4), .006),
        b("vetro", l / 2 - s / 2, 0, .065, s, p, h - .065), b("vetro", 0, p / 2 - s / 2, .065, l, s, h - .065),
        ...[-1, 1].map((z) => b("metallo", l / 2 - s / 2, z * (p / 2 - s / 2), .065, s, s, h - .065)),
        b("metallo", -l / 2 + s / 2, p / 2 - s / 2, .065, s, s, h - .065),
        b("metallo", l / 2 - s / 2, 0, h - s, s, p, s), b("metallo", 0, p / 2 - s / 2, h - s, l, s, s)];
    },
  },
  vasca: {
    nome: "Vasca",
    misure: { l: 1.7, p: 0.7, h: 0.55 },
    blocchi: (l, p, h) => [b("ceramica", 0, 0, 0, l, p, h)],
  },
  letto: {
    nome: "Letto",
    misure: { l: 1.6, p: 2.0, h: 0.5 },
    blocchi: (l, p, h) => {
      const cuscini = l >= 1.3 ? 2 : 1;
      return [b("legno", 0, 0, .06, l, p, h * .42), b("lenzuola", 0, .02 * p, h * .48, l * .96, p * .94, h * .38),
        b("lenzuola", 0, p * .18, h * .86, l * .97, p * .58, h * .08),
        ...Array.from({ length: cuscini }, (_, i) => b("lenzuola", (i - (cuscini - 1) / 2) * l / cuscini, -p * .32, h * .86, l * .8 / cuscini, p * .19, h * .14)),
        b("legno", 0, -p / 2 + .04, 0, l, .08, Math.max(h, 1)),
        ...[-1, 1].flatMap((x) => [-1, 1].map((z) => b("legno", x * l * .42, z * p * .42, 0, .06, .06, .06)))];
    },
  },
  comodino: {
    nome: "Comodino",
    misure: { l: 0.45, p: 0.4, h: 0.5 },
    blocchi: (l, p, h) => [b("legno", 0, 0, 0, l, p, h), b("metallo", 0, p / 2 - .008, h * .7, l * .25, .012, .012), b("metallo", 0, p / 2 - .008, h * .32, l * .25, .012, .012)],
  },
  armadio: {
    nome: "Armadio",
    misure: { l: 2.0, p: 0.6, h: 2.3 },
    blocchi: (l, p, h) => {
      const ante = Math.max(2, Math.round(l / .6)), s = Math.min(.025, p / 5);
      return [b("laccato", 0, -s / 2, 0, l, p - s, h), ...Array.from({ length: ante }, (_, i) => {
        const x = -l / 2 + l / ante * (i + .5);
        return [b("laccato", x, p / 2 - s / 2, .02, l / ante - .006, s, h - .04), b("metallo", x + l / ante * .34, p / 2 - .008, h * .42, .012, .012, Math.min(.18, h * .12))];
      }).flat()];
    },
  },
  divano: {
    nome: "Divano",
    misure: { l: 2.2, p: 0.9, h: 0.85 },
    blocchi: (l, p, h) => {
      const posti = Math.max(2, Math.round(l / .75)), braccio = Math.min(.16, l * .1), seduta = h * .5;
      return [b("tessuto", 0, 0, .08, l, p, seduta * .65), b("tessuto", 0, -p / 2 + p * .11, seduta * .65, l, p * .22, h - seduta * .65),
        ...Array.from({ length: posti }, (_, i) => b("tessuto", -(l - 2 * braccio) / 2 + (i + .5) * (l - 2 * braccio) / posti, p * .1, seduta * .65, (l - 2 * braccio) / posti - .012, p * .76, seduta * .35)),
        ...[-1, 1].map((x) => b("tessuto", x * (l / 2 - braccio / 2), 0, .08, braccio, p, Math.min(h * .7, h - .08))),
        ...[-1, 1].flatMap((x) => [-1, 1].map((z) => b("legno", x * l * .42, z * p * .38, 0, .06, .06, .08)))];
    },
  },
  tavolo: {
    nome: "Tavolo",
    misure: { l: 1.4, p: 0.8, h: 0.75 },
    blocchi: (l, p, h) => {
      const g = 0.06;
      const gambe = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => b("legno", sx * (l / 2 - g), sz * (p / 2 - g), 0, g, g, h - 0.04)));
      return [b("legno", 0, 0, h - 0.04, l, p, 0.04), ...gambe];
    },
  },
  scrivania: {
    nome: "Scrivania",
    misure: { l: 1.2, p: 0.6, h: 0.75 },
    blocchi: (l, p, h) => {
      const g = Math.min(.05, l / 8, p / 8), piano = Math.min(.04, h / 5);
      return [b("laccato", 0, 0, h - piano, l, p, piano), ...[-1, 1].flatMap((x) => [-1, 1].map((z) => b("laccato", x * (l / 2 - g), z * (p / 2 - g), 0, g, g, h - piano)))];
    },
  },
  sedia: {
    nome: "Sedia",
    misure: { l: 0.45, p: 0.5, h: 0.9 },
    blocchi: (l, p, h) => {
      const seduta = h * .47, g = Math.min(.045, l / 8, p / 8);
      return [b("legno", 0, 0, seduta, l, p, .04), b("legno", 0, -p / 2 + .02, seduta + .04, l, .04, Math.max(.01, h - seduta - .04)), ...[-1, 1].flatMap((x) => [-1, 1].map((z) => b("legno", x * (l / 2 - g), z * (p / 2 - g), 0, g, g, seduta)))];
    },
  },
  cucina: {
    nome: "Cucina",
    misure: { l: 2.4, p: 0.6, h: 0.9 },
    blocchi: (l, p, h) => basiCucina(l, p, h),
  },
  frigorifero: {
    nome: "Frigorifero",
    misure: { l: 0.6, p: 0.65, h: 1.85 },
    blocchi: (l, p, h) => [b("metallo", 0, 0, 0, l, p, h), b("piano_cucina", 0, p / 2 - .003, h * .27, l * .94, .006, .008), b("metallo", l * .35, p / 2 - .005, h * .46, .018, .01, h * .18)],
  },
  lavatrice: {
    nome: "Lavatrice",
    misure: { l: .6, p: .6, h: .85 },
    blocchi: (l, p, h) => [b("laccato", 0, 0, 0, l, p, h), b("metallo", 0, p / 2 + .002, h * .87, l * .9, .008, h * .08), b("vetro", 0, p / 2 + .004, h * .25, l * .65, .012, h * .45)],
  },
  // ─── nuovi arredi ───
  divano_angolare: {
    nome: "Divano angolare",
    misure: { l: 2.8, p: 1.7, h: 0.85 },
    blocchi: (l, p, h) => {
      const pen = Math.min(l * 0.38, 0.95);
      return [
        b("tessuto", 0, -p / 2 + 0.11, 0, l, 0.22, h),
        b("tessuto", -pen / 2 + 0.04, -p / 2 + 0.22 + 0.35, 0, l - pen - 0.08, 0.7, 0.42),
        b("tessuto", l / 2 - pen / 2, 0.11, 0, pen, p - 0.22, 0.42),
        b("tessuto", -l / 2 + 0.08, -p / 2 + 0.57, 0, 0.16, 0.7, 0.6),
      ];
    },
  },
  poltrona: {
    nome: "Poltrona",
    misure: { l: 0.85, p: 0.85, h: 0.9 },
    blocchi: (l, p, h) => [b("tessuto", 0, 0.05, 0, l - 0.2, p - 0.15, 0.42), b("tessuto", 0, -p / 2 + 0.1, 0, l, 0.2, h), b("tessuto", -l / 2 + 0.08, 0.05, 0, 0.16, p - 0.15, 0.62), b("tessuto", l / 2 - 0.08, 0.05, 0, 0.16, p - 0.15, 0.62)],
  },
  mobile_tv: {
    nome: "Mobile TV",
    misure: { l: 1.8, p: 0.45, h: 0.5 },
    blocchi: (l, p, h) => [b("laccato", 0, 0, .05, l, p, h - .05), b("metallo", 0, 0, h, .22, .18, .06), b("schermo", 0, 0, h + .06, Math.min(l * .72, 1.3), .035, .75)],
  },
  libreria: {
    nome: "Libreria",
    misure: { l: 1.6, p: 0.35, h: 2.0 },
    blocchi: (l, p, h) => {
      const s = Math.min(.025, l / 10, p / 5, h / 10), ripiani = Math.max(2, Math.round(h / .4));
      return [b("legno", -l / 2 + s / 2, 0, 0, s, p, h), b("legno", l / 2 - s / 2, 0, 0, s, p, h), ...Array.from({ length: ripiani + 1 }, (_, i) => b("legno", 0, 0, (h - s) * i / ripiani, l - 2 * s, p, s))];
    },
  },
  tavolo_rotondo: {
    nome: "Tavolo rotondo",
    misure: { l: 1.1, p: 1.1, h: 0.75 },
    blocchi: (l, p, h) => [b("legno", 0, 0, h - 0.04, l * 0.9, p * 0.9, 0.04), b("legno", 0, 0, 0, 0.12, 0.12, h - 0.04)],
  },
  cucina_angolare: {
    nome: "Cucina ad angolo",
    misure: { l: 3.0, p: 2.4, h: 0.9 },
    blocchi: (l, p, h) => {
      const pr = Math.min(p, 0.62);
      return [
        ...basiCucina(l, pr, h).map((v) => ({ ...v, z: v.z - p / 2 + pr / 2 })),
        ...basiCucina(p - pr, pr, h).map((v) => ({ ...v, x: -l / 2 + pr / 2 + v.z, z: pr / 2 - v.x, girata: -Math.PI / 2 })),
        b("laccato", 0, -p / 2 + 0.18, 1.45, l, 0.35, 0.7),
      ];
    },
  },
  isola_cucina: {
    nome: "Isola",
    misure: { l: 1.8, p: 0.9, h: 0.9 },
    blocchi: (l, p, h) => [b("laccato", 0, 0, 0.1, l, p - 0.1, h - 0.14), b("piano_cucina", 0, 0.1, h - 0.04, l, p + 0.2, 0.04)],
  },
  lavastoviglie: { nome: "Lavastoviglie", misure: { l: 0.6, p: 0.6, h: 0.85 }, blocchi: (l, p, h) => [b("metallo", 0, 0, 0, l, p, h)] },
  auto: {
    nome: "Auto",
    misure: { l: 1.8, p: 4.5, h: 1.5 },
    blocchi: (l, p, h) => [
      b("metallo", 0, 0, 0.18, l, p, h * 0.45),
      b("metallo", 0, 0.05 * p, 0.18 + h * 0.45, l * 0.86, p * 0.5, h * 0.4),
      ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => b("piano_cucina", sx * (l / 2 - 0.08), sz * p * 0.31, 0, 0.18, 0.62, 0.62))),
    ],
  },
  scaffale: { nome: "Scaffalatura", misure: { l: 3.0, p: 1.0, h: 4.0 }, blocchi: (l, p, h) => [0, 1, 2, 3].map((k) => b("metallo", 0, 0, (h / 4) * k + 0.1, l, p, 0.06)).concat([-1, 1].map((sx) => b("metallo", sx * (l / 2 - 0.04), 0, 0, 0.08, p, h))) },
  banco_lavoro: { nome: "Banco da lavoro", misure: { l: 2.0, p: 0.8, h: 0.9 }, blocchi: (l, p, h) => [b("legno", 0, 0, h - 0.06, l, p, 0.06), b("metallo", 0, 0, 0, l - 0.1, p - 0.1, h - 0.06)] },
  // ─── struttura ───
  pilastro: { nome: "Pilastro", misure: { l: 0.3, p: 0.3, h: 3.0 }, blocchi: (l, p, h) => [b("calcestruzzo", 0, 0, 0, l, p, h)] },
  // Muro di contenimento a mensola (sezione a «T rovescia»): suola sottoterra con punta davanti e tallone dietro,
  // fusto rastremato (lo spessore cala verso l'alto, la faccia davanti resta verticale) e il terreno trattenuto sul retro.
  muro_contenimento: {
    nome: "Muro di contenimento",
    misure: { l: 6.0, p: 2.2, h: 3.0 },
    blocchi: (l, p, h) => {
      const suola = Math.min(0.5, Math.max(0.3, h / 8)), punta = p * 0.3, base = Math.min(0.7, Math.max(0.3, h / 9)), cima = 0.3;
      const zf = p / 2 - punta, fette = 8, alza = h / fette;
      return [
        b("calcestruzzo", 0, 0, -suola, l, p, suola),
        ...Array.from({ length: fette }, (_, i) => {
          const t = base - ((base - cima) * (i + 0.5)) / fette;
          return b("calcestruzzo", 0, zf - t / 2, i * alza, l, t, alza);
        }),
        ...Array.from({ length: fette }, (_, i) => {
          const t = base - ((base - cima) * (i + 0.5)) / fette, prof = zf - t + p / 2;
          return b("terra", 0, -p / 2 + prof / 2, i * alza, l, prof, alza * 0.98);
        }),
      ];
    },
  },
  // Trave e solaio in c.a.: stanno sotto il pavimento del piano sopra (h = altezza della trave o spessore del solaio).
  trave: { nome: "Trave", misure: { l: 4.0, p: 0.3, h: 0.5 }, blocchi: (l, p, h, opz) => [b("calcestruzzo", 0, 0, (opz?.interpiano ?? 3.0) - h, l, p, h)] },
  solaio: { nome: "Solaio", misure: { l: 8.0, p: 6.0, h: 0.25 }, blocchi: (l, p, h, opz) => [b("calcestruzzo", 0, 0, (opz?.interpiano ?? 3.0) - h, l, p, h)] },
  // Vano ascensore: quattro pareti piene fino al piano sopra (l'altezza la decide l'edificio) e, sul davanti
  // (+p/2), l'apertura con la porta di piano in metallo. Su ogni piano ce n'è uno, uno sopra l'altro: fanno un vano unico.
  // Scala a U: due rampe affiancate e un pianerottolo in fondo. Alzata ≈ 17,5 cm, pedata dalla lunghezza che resta (≈ 25 cm).
  // Si sale dal davanti (+p/2): la prima rampa arriva al pianerottolo a metà altezza, la seconda torna indietro.
  scala_u: {
    nome: "Scala a U",
    misure: { l: 2.0, p: 3.6, h: 2.8 },
    blocchi: (l, p, h) => {
      const n = Math.max(4, Math.round(h / 0.175)), meta = Math.floor(n / 2), alza = h / n;
      const pian = Math.min(1.0, p * 0.35), lungo = p - pian, pedata = lungo / meta, rampa = (l - 0.2) / 2;
      const xA = -(0.1 + rampa / 2), xB = 0.1 + rampa / 2;
      return [
        ...Array.from({ length: meta }, (_, i) => b("legno", xA, p / 2 - pedata * (i + 0.5), 0, rampa, pedata, alza * (i + 1))),
        b("legno", 0, -p / 2 + pian / 2, 0, l, pian, alza * meta),
        ...Array.from({ length: n - meta }, (_, j) => b("legno", xB, -p / 2 + pian + pedata * (j + 0.5), 0, rampa, pedata, alza * (meta + j + 1))),
      ];
    },
  },
  // Scala a chiocciola: palo centrale e gradini a ventaglio, un giro completo dal piano al piano sopra.
  scala_chiocciola: {
    nome: "Scala a chiocciola",
    misure: { l: 1.6, p: 1.6, h: 2.8 },
    blocchi: (l, p, h) => {
      const R = Math.min(l, p) / 2, palo = 0.1, n = Math.max(10, Math.round(h / 0.175)), alza = h / n;
      const raggio = R - palo, centro = palo + raggio / 2, largo = Math.max(0.2, ((2 * Math.PI * centro) / n) * 0.98);
      return [
        b("metallo", 0, 0, 0, palo * 2, palo * 2, h),
        ...Array.from({ length: n }, (_, i) => {
          const a = ((i + 0.5) / n) * 2 * Math.PI;
          return { ...b("legno", Math.cos(a) * centro, Math.sin(a) * centro, alza * (i + 1) - 0.05, raggio, largo, 0.05), girata: a };
        }),
      ];
    },
  },
  ascensore: {
    nome: "Ascensore",
    misure: { l: 1.5, p: 1.5, h: 2.8 },
    blocchi: (l, p, h, opz) => {
      const s = 0.12, porta = Math.min(0.9, l - 0.4), alta = Math.min(2.1, h), lato = (l - porta) / 2;
      // la cabina, dove l'ascensore si ferma: pianale, tre pareti e le due ante della porta socchiuse
      const cl = l - 2 * s - 0.16, cp = p - 2 * s - 0.2, cz = -p / 2 + s + 0.04 + cp / 2, ch = Math.min(2.2, h - 0.1), t = 0.04;
      const cabina = opz?.senzaCabina ? [] : [
        b("metallo", 0, cz, 0.02, cl, cp, 0.04),
        b("metallo", 0, cz - cp / 2 + t / 2, 0.04, cl, t, ch),
        b("metallo", -cl / 2 + t / 2, cz, 0.04, t, cp - 2 * t, ch),
        b("metallo", cl / 2 - t / 2, cz, 0.04, t, cp - 2 * t, ch),
        b("laccato", 0, cz + cp / 2 - t / 2, ch + 0.04, cl, cp, 0.04),
        b("laccato", -cl / 4 - 0.1, cz + cp / 2 - t / 2, 0.04, cl / 2 - 0.2, t, Math.min(2.0, ch)),
        b("laccato", cl / 4 + 0.1, cz + cp / 2 - t / 2, 0.04, cl / 2 - 0.2, t, Math.min(2.0, ch)),
      ];
      return [
        ...cabina,
        b("muro", 0, -p / 2 + s / 2, 0, l, s, h),
        b("muro", -l / 2 + s / 2, 0, 0, s, p - 2 * s, h),
        b("muro", l / 2 - s / 2, 0, 0, s, p - 2 * s, h),
        b("muro", -(porta + lato) / 2, p / 2 - s / 2, 0, lato, s, h),
        b("muro", (porta + lato) / 2, p / 2 - s / 2, 0, lato, s, h),
        ...(h > alta ? [b("muro", 0, p / 2 - s / 2, alta, porta, s, h - alta)] : []),
        ...(opz?.senzaCabina ? [b("metallo", 0, p / 2 - s / 2, 0, porta, 0.04, alta)] : []),
      ];
    },
  },
  scala: {
    nome: "Scala",
    misure: { l: 1.0, p: 4.5, h: 2.8 },
    blocchi: (l, p, h) => {
      // si sale verso il «retro» (in alto sulla pianta): gradini da circa 28 × 17,5 cm
      const n = Math.max(3, Math.round(h / 0.175));
      const pedata = p / n;
      return Array.from({ length: n }, (_, i) => b("legno", 0, p / 2 - pedata * (i + 0.5), 0, l, pedata, (h / n) * (i + 1)));
    },
  },
  // ─── impianti: piccoli e alla loro quota (h = altezza da terra), non scatole sul pavimento ───
  presa: { nome: "Presa", misure: { l: 0.08, p: 0.02, h: 0.3 }, blocchi: (_l, p, h) => [b("ceramica", 0, -p / 2, h - 0.04, 0.08, 0.015, 0.08)] },
  interruttore: { nome: "Interruttore", misure: { l: 0.08, p: 0.02, h: 1.1 }, blocchi: (_l, p, h) => [b("ceramica", 0, -p / 2, h - 0.04, 0.08, 0.015, 0.08)] },
  punto_luce: { nome: "Punto luce", misure: { l: 0.3, p: 0.3, h: 2.7 }, blocchi: (l, p, h) => [b("ceramica", 0, 0, Math.max(h - 0.06, 2.2), Math.min(l, 0.35), Math.min(p, 0.35), 0.05)] },
  split: { nome: "Split", misure: { l: 0.9, p: 0.25, h: 2.2 }, blocchi: (l, p, h) => [b("ceramica", 0, 0, Math.max(h - 0.3, 1.8), l, Math.min(p, 0.25), 0.3)] },
  termosifone: { nome: "Termosifone", misure: { l: 0.8, p: 0.12, h: 0.6 }, blocchi: (l, p, h) => [b("ceramica", 0, 0, 0.12, l, Math.min(p, 0.12), Math.min(h, 0.8))] },
  quadro_elettrico: { nome: "Quadro elettrico", misure: { l: 0.4, p: 0.12, h: 1.6 }, blocchi: (l, p, h) => [b("laccato", 0, -p / 2 + 0.05, Math.max(h - 0.3, 1.2), l, 0.1, 0.5)] },
  unita_esterna: { nome: "Unità esterna", misure: { l: 0.8, p: 0.3, h: 0.3 }, blocchi: (l, p) => [b("laccato", 0, 0, 0.1, l, p, 0.6)] },
  collettore: { nome: "Collettore", misure: { l: 0.5, p: 0.12, h: 0.4 }, blocchi: (l, p, h) => [b("laccato", 0, -p / 2 + 0.05, h, l, 0.1, 0.6)] },
  // ─── giardino e piscina ───
  piscina: {
    nome: "Piscina",
    misure: { l: 8, p: 4, h: 0 },
    // interrata: il bordo in pietra a filo terreno e l'acqua appena sotto
    blocchi: (l, p) => { const s = Math.min(0.3, l * 0.08, p * 0.08); return [b("pietra", 0, -p / 2 + s / 2, 0, l, s, 0.04), b("pietra", 0, p / 2 - s / 2, 0, l, s, 0.04), b("pietra", -l / 2 + s / 2, 0, 0, s, p - 2 * s, 0.04), b("pietra", l / 2 - s / 2, 0, 0, s, p - 2 * s, 0.04), b("acqua", 0, 0, 0, l - 2 * s, p - 2 * s, 0.015)]; },
  },
  idromassaggio: { nome: "Minipiscina", misure: { l: 2.2, p: 2.2, h: 0 }, blocchi: (l, p) => [b("laccato", 0, 0, 0, l, p, 0.8), b("acqua", 0, 0, 0.8, l - 0.2, p - 0.2, 0.01)] },
  pergola: {
    nome: "Pergola",
    misure: { l: 4, p: 3, h: 2.5 },
    blocchi: (l, p, h) => {
      const hh = Math.max(h, 2.3);
      const pilastri = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => b("legno", sx * (l / 2 - 0.06), sz * (p / 2 - 0.06), 0, 0.12, 0.12, hh)));
      const n = Math.max(3, Math.round(p / 0.4));
      const lamelle = Array.from({ length: n }, (_, i) => b("legno", 0, -p / 2 + (p * (i + 0.5)) / n, hh, l + 0.2, 0.08, 0.14));
      return [...pilastri, b("legno", 0, -p / 2 + 0.06, hh - 0.18, l, 0.12, 0.18), b("legno", 0, p / 2 - 0.06, hh - 0.18, l, 0.12, 0.18), ...lamelle];
    },
  },
  albero: { nome: "Albero", misure: { l: 3, p: 3, h: 0 }, blocchi: (l, p) => [b("legno", 0, 0, 0, 0.3, 0.3, 2.2), b("fogliame", 0, 0, 2.0, l, p, Math.max(l, p) * 0.8), b("fogliame", 0, 0, 2.0 + Math.max(l, p) * 0.8, l * 0.6, p * 0.6, Math.max(l, p) * 0.4)] },
  siepe: { nome: "Siepe", misure: { l: 3, p: 0.6, h: 1.2 }, blocchi: (l, p, h) => [b("fogliame", 0, 0, 0, l, p, Math.max(h, 0.6))] },
  aiuola: { nome: "Aiuola", misure: { l: 2, p: 1, h: 0 }, blocchi: (l, p) => [b("pietra", 0, 0, 0, l, p, 0.2), b("fogliame", 0, 0, 0.2, l - 0.1, p - 0.1, 0.35)] },
  ombrellone: { nome: "Ombrellone", misure: { l: 3, p: 3, h: 0 }, blocchi: (l, p) => [b("metallo", 0, 0, 0, 0.05, 0.05, 2.3), b("lenzuola", 0, 0, 2.2, l, p, 0.12)] },
  lettino: { nome: "Lettino", misure: { l: 0.7, p: 1.9, h: 0 }, blocchi: (l, p) => [b("legno", 0, 0, 0.25, l, p, 0.08), b("lenzuola", 0, -p * 0.35, 0.33, l - 0.06, p * 0.3, 0.25)] },
  tavolo_esterno: { nome: "Tavolo da esterno", misure: { l: 2, p: 1, h: 0 }, blocchi: (l, p) => [b("legno", 0, 0, 0.72, l, p, 0.04), ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => b("legno", sx * (l / 2 - 0.08), sz * (p / 2 - 0.08), 0, 0.06, 0.06, 0.72)))] },
  barbecue: { nome: "Barbecue", misure: { l: 1.5, p: 0.6, h: 0 }, blocchi: (l, p) => [b("pietra", 0, 0, 0, l, p, 0.9), b("piano_cucina", 0, 0, 0.9, l * 0.45, p * 0.8, 0.05), b("pietra", 0, -p / 2 + 0.15, 0.9, l * 0.4, 0.3, 1.1)] },
  cancello_pedonale: { nome: "Cancello pedonale", misure: { l: 1.1, p: 0.12, h: 1.5 }, blocchi: (l, p, h) => [b("metallo", -l / 2 + 0.05, 0, 0, 0.1, 0.1, h + 0.1), b("metallo", l / 2 - 0.05, 0, 0, 0.1, 0.1, h + 0.1), b("recinzione", 0, 0, 0.05, l - 0.12, 0.03, h)] },
  cancello_carrabile: { nome: "Cancello carrabile", misure: { l: 4, p: 0.12, h: 1.5 }, blocchi: (l, p, h) => [b("muro", -l / 2 - 0.15, 0, 0, 0.3, 0.3, h + 0.3), b("muro", l / 2 + 0.15, 0, 0, 0.3, 0.3, h + 0.3), b("recinzione", 0, 0, 0.05, l, 0.04, h)] },
  lampione: { nome: "Lampione", misure: { l: 0.3, p: 0.3, h: 3 }, blocchi: (l, p, h) => [b("metallo", 0, 0, 0, 0.08, 0.08, Math.max(h, 2.5) - 0.3), b("lenzuola", 0, 0, Math.max(h, 2.5) - 0.35, l, p, 0.35)] },
  faretto_giardino: { nome: "Faretto", misure: { l: 0.15, p: 0.15, h: 0 }, blocchi: (l, p) => [b("metallo", 0, 0, 0, l, p, 0.4)] },
  irrigatore: { nome: "Irrigatore", misure: { l: 0.2, p: 0.2, h: 0 }, blocchi: (l, p) => [b("piano_cucina", 0, 0, 0, l * 0.4, p * 0.4, 0.1)] },
  pozzetto: { nome: "Pozzetto", misure: { l: 0.4, p: 0.4, h: 0 }, blocchi: (l, p) => [b("piano_cucina", 0, 0, 0, l, p, 0.02)] },
  pompa_calore: { nome: "Pompa di calore", misure: { l: 1.0, p: 0.4, h: 0 }, blocchi: (l, p) => [b("metallo", 0, 0, 0.1, l, p, 0.85)] },
  bollitore: { nome: "Bollitore", misure: { l: 0.6, p: 0.6, h: 0 }, blocchi: (l, p) => [b("ceramica", 0, 0, 0, l, p, 1.6)] },
  inverter: { nome: "Inverter", misure: { l: 0.5, p: 0.2, h: 1.4 }, blocchi: (l, p, h) => [b("ceramica", 0, -p / 2 + 0.1, Math.max(h - 0.25, 0.8), l, 0.2, 0.5)] },
  batteria_accumulo: { nome: "Batteria", misure: { l: 0.6, p: 0.25, h: 0 }, blocchi: (l, p) => [b("ceramica", 0, 0, 0, l, p, 1.1)] },
  wallbox: { nome: "Wallbox", misure: { l: 0.3, p: 0.15, h: 1.2 }, blocchi: (l, p, h) => [b("piano_cucina", 0, -p / 2 + 0.06, Math.max(h - 0.2, 0.8), l, 0.12, 0.4)] },
  termostato: { nome: "Termostato", misure: { l: 0.12, p: 0.03, h: 1.5 }, blocchi: (_l, p, h) => [b("ceramica", 0, -p / 2, h - 0.05, 0.12, 0.02, 0.1)] },
  // punto quotato: un picchetto alla quota del terreno (h = quota, la passa la scena)
  quota_terreno: { nome: "Punto quotato", misure: { l: 0.06, p: 0.06, h: 0 }, blocchi: (_l, _p, h) => [b("legno", 0, 0, h, 0.05, 0.05, 0.45), b("laccato", 0, 0, h + 0.4, 0.12, 0.02, 0.08)] },
  // lucernario: il vetro sulla falda (in mansarda la scena lo porta alla quota del tetto)
  lucernario: { nome: "Lucernario", misure: { l: 0.78, p: 1.18, h: 2.2 }, blocchi: (l, p, h) => [b("vetro", 0, 0, Math.max(h - 0.04, 0.5), l, p, 0.04), b("metallo", 0, -p / 2 + 0.03, Math.max(h - 0.07, 0.5), l, 0.06, 0.07)] },
  vmc: { nome: "VMC", misure: { l: 0.6, p: 0.45, h: 2.6 }, blocchi: (l, p, h) => [b("metallo", 0, 0, Math.max(h - 0.3, 2.0), l, p, 0.3)] },
  // a filo pavimento o nel muro: nel 3D non si vedono
  punto_acqua: { nome: "Punto acqua", misure: { l: 0.05, p: 0.05, h: 0.5 }, blocchi: () => [] },
  scarico: { nome: "Scarico", misure: { l: 0.05, p: 0.05, h: 0 }, blocchi: () => [] },
  colonna_scarico: { nome: "Colonna di scarico", misure: { l: 0.16, p: 0.16, h: 0 }, blocchi: () => [] },
  caldaia: {
    nome: "Caldaia",
    misure: { l: 0.4, p: 0.3, h: 0.7 },
    blocchi: (l, p, h) => [b("laccato", 0, 0, 1.3, l, p, h)],
  },
};

const GENERICO: ModelloElemento = {
  nome: "Elemento",
  misure: { l: 0.6, p: 0.6, h: 0.8 },
  blocchi: (l, p, h) => [b("laccato", 0, 0, 0, l, p, h)],
};

/** Il modello del tipo; per i tipi composti («letto_matrimoniale», «piatto_doccia») vale la prima parola che si conosce. */
// I campi sportivi: misure di partenza dal regolamento; il 3D lo fa costruisciCampo.
for (const c of CAMPI) MODELLI[c.tipo] = { nome: c.nome, misure: { l: c.ingombro[0] / 100, p: c.ingombro[1] / 100, h: 0 }, blocchi: () => [] };

/** Altezza della rete (cm): dal suolo fino a… (pallavolo: rete alta, staccata da terra). */
const RETI: Record<string, { da: number; a: number; pali: number }> = {
  campo_tennis: { da: 0, a: 107, pali: 107 }, campo_padel: { da: 0, a: 88, pali: 92 },
  campo_pallavolo: { da: 143, a: 243, pali: 255 }, campo_beach_volley: { da: 143, a: 243, pali: 255 },
  campo_pickleball: { da: 0, a: 91, pali: 91 },
};
const TRAVERSA: Record<string, number> = { campo_calcio5: 200, campo_calcio7: 200, campo_calcio11: 244 };

/** Un campo sportivo: fondo, campo di gioco, linee, rete, porte, canestri, pareti del padel. */
function costruisciCampo(tipo: string, centro: { x: number; z: number }, rotazione: number, l: number, p: number, costruttore: (materiale: string) => CostruttoreMesh): void {
  const d = definizioneCampo(tipo), g = disegnoCampo(tipo, l * 100, p * 100);
  if (!d || !g) return;
  const m = (v: number) => v / 100;
  const sc = (mat: string, x: number, z: number, y: number, ll: number, pp: number, h: number, girata = 0) => costruttore(mat).scatola(centro.x, centro.z, y, ll, pp, h, rotazione, x, z, girata);
  // tre livelli ben staccati (fondo 3 cm, campo 8, linee 11): da lontano superfici quasi
  // sovrapposte tremolano, e i campi grandi si guardano da 100 metri
  // le facce sotto finiscono sotto il terreno (che le copre), altrimenti lottano con quelle sopra
  sc(d.materiale.fuori, 0, 0, -0.2, l, p, 0.23);
  const gi = g.gioco;
  sc(d.materiale.gioco, m((gi.x0 + gi.x1) / 2), m((gi.y0 + gi.y1) / 2), -0.2, m(gi.x1 - gi.x0), m(gi.y1 - gi.y0), 0.28);
  // linee: un listello sottile per ogni tratto, girato come il tratto
  const lineaMat = tipo === "campo_beach_volley" ? "linee_blu" : "linee";
  const tratto = (a: { x: number; y: number }, b: { x: number; y: number }, mat: string, y: number, spessore: number, alto: number) => {
    const lungo = Math.hypot(b.x - a.x, b.y - a.y);
    if (lungo < 1) return;
    sc(mat, m((a.x + b.x) / 2), m((a.y + b.y) / 2), y, m(lungo) + spessore, spessore, alto, Math.atan2(b.y - a.y, b.x - a.x));
  };
  for (const linea of g.linee) for (let i = 0; i + 1 < linea.length; i++) tratto(linea[i], linea[i + 1], lineaMat, 0, 0.06, 0.11);
  // rete e pali
  const r = RETI[tipo];
  if (g.rete && r) {
    const [a, b] = g.rete;
    const lungo = Math.hypot(b.x - a.x, b.y - a.y);
    sc("rete", m((a.x + b.x) / 2), m((a.y + b.y) / 2), m(r.da), 0.02, m(lungo), m(r.a - r.da));
    for (const q of g.pali) sc("metallo", m(q.x), m(q.y), 0, 0.08, 0.08, m(r.pali));
  }
  // porte da calcio: due pali sulla linea di fondo e la traversa
  const traversa = TRAVERSA[tipo];
  if (traversa) for (const po of g.porte) {
    const xl = Math.abs(po.x0) < Math.abs(po.x1) ? po.x0 : po.x1;
    for (const y of [po.y0, po.y1]) sc("linee", m(xl), m(y), 0, 0.12, 0.12, m(traversa));
    sc("linee", m(xl), m((po.y0 + po.y1) / 2), m(traversa) - 0.12, 0.12, m(po.y1 - po.y0) + 0.12, 0.12);
    sc("rete", m((po.x0 + po.x1) / 2), m((po.y0 + po.y1) / 2), 0, m(po.x1 - po.x0), m(po.y1 - po.y0), m(traversa) * 0.9);
  }
  // canestri: palo dietro la linea di fondo, tabellone, ferro a 3,05 m
  for (const c of g.canestri) {
    const verso = c.x > 0 ? 1 : -1;
    sc("metallo", m(c.x + verso * 280), 0, 0, 0.2, 0.2, 3.0);
    sc("metallo", m(c.x + verso * 140), 0, 2.9, m(280), 0.12, 0.12);
    sc("vetro", m(c.x + verso * 40), 0, 2.9, 0.05, 1.8, 1.05);
    sc("arancio", m(c.x), 0, 3.03, 0.45, 0.45, 0.03);
  }
  // padel: pareti di vetro e rete metallica
  for (const pr of g.pareti) tratto(pr.a, pr.b, pr.vetro ? "vetro" : "recinzione", 0, 0.05, m(pr.altezza));
}

export function chiaveModelloElemento(tipo: string): string | null {
  const t = tipo.toLowerCase();
  return MODELLI[t] ? t : t.split(/[_\s-]+/).find((p) => MODELLI[p]) ?? null;
}

export function modelloElemento(tipo: string): ModelloElemento {
  const chiave = chiaveModelloElemento(tipo);
  return chiave ? MODELLI[chiave] : GENERICO;
}

/** Vaschetta e piedistallo distinguibili da un mobile, negli stessi ingombri del simbolo. */
function costruisciSanitario(tipo: "wc" | "bidet", centro: { x: number; z: number }, r: number, l: number, p: number, h: number, costruttore: (materiale: string) => CostruttoreMesh) {
  const c = costruttore("ceramica"), cos = Math.cos(r), sin = Math.sin(r), zc = tipo === "wc" ? p * .06 : 0;
  const mondo = (x: number, z: number, y: number): V3 => [centro.x + x * cos - z * sin, y, centro.z + x * sin + z * cos];
  const normale = (x: number, z: number): V3 => [x * cos - z * sin, 0, x * sin + z * cos];
  const anello = (rx: number, rz: number, y: number) => Array.from({ length: 20 }, (_, i) => mondo(rx * Math.cos(i * Math.PI / 10), zc + rz * Math.sin(i * Math.PI / 10), y));
  const base = anello(l * .28, p * .29, 0), esterno = anello(l * (tipo === "wc" ? .45 : .5), p * (tipo === "wc" ? .44 : .5), h), interno = anello(l * .32, p * .29, h), fondo = anello(l * .21, p * .20, h * .52);
  for (let i = 0; i < 20; i++) {
    const j = (i + 1) % 20, angolo = (i + .5) * Math.PI / 10, nx = Math.cos(angolo), nz = Math.sin(angolo);
    c.poligono([base[i], base[j], esterno[j], esterno[i]], normale(nx, nz));
    c.poligono([esterno[i], esterno[j], interno[j], interno[i]], [0, 1, 0]);
    c.poligono([interno[i], interno[j], fondo[j], fondo[i]], normale(-nx, -nz));
  }
  c.poligono(fondo, [0, 1, 0]);
  if (tipo === "wc") c.scatola(centro.x, centro.z, h, l, .16, .38, r, 0, -p / 2 + .08);
  else costruttore("metallo").scatola(centro.x, centro.z, h, .035, .035, .1, r, 0, -p * .38);
}

/**
 * Costruisce l'elemento in un costruttore per materiale.
 * Misure in metri; rotazione in radianti (in senso orario sulla pianta, cioè dall'asse x verso z).
 */
export function costruisciElemento(
  tipo: string,
  centro: { x: number; z: number },
  rotazione: number,
  misure: { l?: number; p?: number; h?: number; senzaCabina?: boolean; interpiano?: number },
  costruttore: (materiale: string) => CostruttoreMesh,
): void {
  const modello = modelloElemento(tipo);
  if (eCampo(tipo)) return costruisciCampo(tipo, centro, rotazione, misure.l ?? modello.misure.l, misure.p ?? modello.misure.p, costruttore);
  const l = misure.l ?? modello.misure.l;
  const p = misure.p ?? modello.misure.p;
  const h = misure.h ?? modello.misure.h;
  if (modello === MODELLI.wc || modello === MODELLI.bidet) return costruisciSanitario(modello === MODELLI.wc ? "wc" : "bidet", centro, rotazione, l, p, h, costruttore);
  for (const bl of modello.blocchi(l, p, h, { senzaCabina: misure.senzaCabina, interpiano: misure.interpiano })) {
    costruttore(bl.materiale).scatola(centro.x, centro.z, bl.y, bl.l, bl.p, bl.h, rotazione, bl.x, bl.z, bl.girata ?? 0);
  }
}
