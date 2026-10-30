/**
 * Sanitari e arredi come blocchi semplici: pochi parallelepipedi per oggetto, quanto
 * basta a riconoscerli e a dare all'AI dei render le proporzioni giuste.
 *
 * Ogni modello è descritto nel suo sistema: x lungo la larghezza, z lungo la
 * profondità, il retro a z = -profondità/2 (contro il muro), misure in metri.
 */
import { CostruttoreMesh } from "./costruttore";

export interface Blocco {
  materiale: string;
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
  blocchi: (l: number, p: number, h: number) => Blocco[];
}

const b = (materiale: string, x: number, z: number, y: number, l: number, p: number, h: number): Blocco => ({ materiale, x, z, y, l, p, h });

export const MODELLI: Record<string, ModelloElemento> = {
  wc: {
    nome: "WC",
    misure: { l: 0.38, p: 0.55, h: 0.4 },
    blocchi: (l, p, h) => [b("ceramica", 0, 0.05 * p, 0, l * 0.9, p * 0.9, h), b("ceramica", 0, -p / 2 + 0.08, h, l, 0.16, 0.38)],
  },
  bidet: {
    nome: "Bidet",
    misure: { l: 0.38, p: 0.52, h: 0.4 },
    blocchi: (l, p, h) => [b("ceramica", 0, 0, 0, l * 0.9, p, h)],
  },
  lavabo: {
    nome: "Lavabo",
    misure: { l: 0.6, p: 0.45, h: 0.85 },
    blocchi: (l, p, h) => [b("laccato", 0, -0.02, 0, l * 0.9, p * 0.85, h - 0.15), b("ceramica", 0, 0, h - 0.15, l, p, 0.15)],
  },
  doccia: {
    nome: "Doccia",
    misure: { l: 0.8, p: 0.8, h: 2.0 },
    blocchi: (l, p, h) => [b("ceramica", 0, 0, 0, l, p, 0.05), b("vetro", l / 2 - 0.01, 0, 0.05, 0.02, p, h - 0.05), b("vetro", 0, p / 2 - 0.01, 0.05, l, 0.02, h - 0.05)],
  },
  vasca: {
    nome: "Vasca",
    misure: { l: 1.7, p: 0.7, h: 0.55 },
    blocchi: (l, p, h) => [b("ceramica", 0, 0, 0, l, p, h)],
  },
  letto: {
    nome: "Letto",
    misure: { l: 1.6, p: 2.0, h: 0.5 },
    blocchi: (l, p, h) => [
      b("legno", 0, 0, 0, l, p, h * 0.6),
      b("lenzuola", 0, 0.03, h * 0.6, l * 0.96, p * 0.94, h * 0.4),
      b("legno", 0, -p / 2 + 0.04, 0, l, 0.08, 1.0),
    ],
  },
  comodino: {
    nome: "Comodino",
    misure: { l: 0.45, p: 0.4, h: 0.5 },
    blocchi: (l, p, h) => [b("legno", 0, 0, 0, l, p, h)],
  },
  armadio: {
    nome: "Armadio",
    misure: { l: 2.0, p: 0.6, h: 2.3 },
    blocchi: (l, p, h) => [b("laccato", 0, 0, 0, l, p, h)],
  },
  divano: {
    nome: "Divano",
    misure: { l: 2.2, p: 0.9, h: 0.85 },
    blocchi: (l, p, h) => [
      b("tessuto", 0, 0.05, 0, l - 0.3, p - 0.1, 0.42),
      b("tessuto", 0, -p / 2 + 0.11, 0, l, 0.22, h),
      b("tessuto", -l / 2 + 0.08, 0.05, 0, 0.16, p - 0.1, 0.6),
      b("tessuto", l / 2 - 0.08, 0.05, 0, 0.16, p - 0.1, 0.6),
    ],
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
  sedia: {
    nome: "Sedia",
    misure: { l: 0.45, p: 0.5, h: 0.9 },
    blocchi: (l, p, h) => [b("legno", 0, 0, 0.42, l, p, 0.05), b("legno", 0, -p / 2 + 0.02, 0.47, l, 0.04, h - 0.47), b("legno", 0, 0, 0, l * 0.8, p * 0.8, 0.42)],
  },
  cucina: {
    nome: "Cucina",
    misure: { l: 2.4, p: 0.6, h: 0.9 },
    blocchi: (l, p, h) => [b("laccato", 0, -0.02, 0.1, l, p - 0.04, h - 0.14), b("piano_cucina", 0, 0, h - 0.04, l, p, 0.04)],
  },
  frigorifero: {
    nome: "Frigorifero",
    misure: { l: 0.6, p: 0.65, h: 1.85 },
    blocchi: (l, p, h) => [b("metallo", 0, 0, 0, l, p, h)],
  },
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
export function modelloElemento(tipo: string): ModelloElemento {
  const t = tipo.toLowerCase();
  if (MODELLI[t]) return MODELLI[t];
  const parola = t.split(/[_\s-]+/).find((p) => MODELLI[p]);
  return parola ? MODELLI[parola] : GENERICO;
}

/**
 * Costruisce l'elemento in un costruttore per materiale.
 * Misure in metri; rotazione in radianti (in senso orario sulla pianta, cioè dall'asse x verso z).
 */
export function costruisciElemento(
  tipo: string,
  centro: { x: number; z: number },
  rotazione: number,
  misure: { l?: number; p?: number; h?: number },
  costruttore: (materiale: string) => CostruttoreMesh,
): void {
  const modello = modelloElemento(tipo);
  const l = misure.l ?? modello.misure.l;
  const p = misure.p ?? modello.misure.p;
  const h = misure.h ?? modello.misure.h;
  for (const bl of modello.blocchi(l, p, h)) {
    costruttore(bl.materiale).scatola(centro.x, centro.z, bl.y, bl.l, bl.p, bl.h, rotazione, bl.x, bl.z);
  }
}
