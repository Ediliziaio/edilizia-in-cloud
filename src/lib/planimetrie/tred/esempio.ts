/**
 * Bilocale da ristrutturare, d'esempio per la pagina di prova e i test del 3D: stato di
 * fatto + proposta A con un tramezzo da demolire, uno nuovo, una porta da chiudere e
 * una da aprire. Gli esempi comuni a tutte le fasi stanno in shared/planimetrie/esempi.
 *
 * Disegnato qui sotto come si vede sullo schermo (y verso il basso, cm), poi girato
 * nelle coordinate del modello (y verso l'alto).
 *
 *   x →   0          500        730   900
 * y 0    ┌───f1──────┬────f3─────────┐
 *        │ Soggiorno │   Camera      │
 *        pf1         p2              │
 *  380   ├──m8──┐    │               │      m8 = tramezzo da demolire (giallo)
 *  400   │      f2   ├──p5───┬─p4────┤      p5 = porta da chiudere, p4 = porta nuova
 *        f2          p3 Bagno│ Rip.  │      m7 = tramezzo nuovo (rosso)
 *  650   └────a1─────┴──f4───┴───────┘
 */
import type { Apertura, Elemento, Locale, Muro, Planimetria, StatoLavori, StatoPianta } from "../../../../shared/planimetrie/modello.ts";
import { modelloElemento } from "./elementi";

const ALTO = 650;
const su = (x: number, y: number) => ({ x, y: ALTO - y });
const rilevata = { origine: "rilevata" as const };

const muro = (id: string, x1: number, y1: number, x2: number, y2: number, spessore: number, stato: StatoLavori = "esistente"): Muro => ({
  id, p1: su(x1, y1), p2: su(x2, y2), spessore, altezza: 270, tipo: spessore >= 30 ? "esterno" : "tramezzo", stato, ...rilevata,
});

const apertura = (id: string, muroId: string, tipo: Apertura["tipo"], centro: number, larghezza: number, altezza: number, davanzale = 0, stato: StatoLavori = "esistente"): Apertura => ({
  id, muroId, tipo, offset: centro - larghezza / 2, larghezza, altezza, davanzale, manovra: tipo === "varco" ? "nessuna" : "battente", stato, ...rilevata,
});

const locale = (id: string, nome: string, destinazione: Locale["destinazione"], x0: number, y0: number, x1: number, y1: number): Locale => ({
  id, nome, destinazione, altezza: 270, contorno: [su(x0, y0), su(x1, y0), su(x1, y1), su(x0, y1)], ...rilevata,
});

/** `orario` come si vede sullo schermo, retro verso l'alto a 0°. */
const elemento = (id: string, tipo: string, x: number, y: number, orario: number, localeId: string, larghezza?: number): Elemento => {
  const m = modelloElemento(tipo).misure;
  return { id, tipo, posizione: su(x, y), rotazione: (180 - orario + 360) % 360, larghezza: larghezza ?? Math.round(m.l * 100), profondita: Math.round(m.p * 100), localeId, ...rilevata };
};

const muriFatto = [
  muro("m1", 0, 0, 900, 0, 30),
  muro("m2", 900, 0, 900, 650, 30),
  muro("m3", 900, 650, 0, 650, 30),
  muro("m4", 0, 650, 0, 0, 30),
  muro("m5", 500, 0, 500, 650, 10),
  muro("m6", 500, 400, 900, 400, 10),
  muro("m8", 0, 380, 280, 380, 10),
];

const apertureFatto = [
  apertura("a1", "m3", "porta", 550, 90, 215),
  apertura("f1", "m1", "finestra", 180, 140, 140, 100),
  apertura("pf1", "m4", "portafinestra", 450, 120, 240),
  apertura("f2", "m4", "finestra", 130, 100, 120, 110),
  apertura("f3", "m1", "finestra", 700, 120, 140, 100),
  apertura("f4", "m3", "finestra", 285, 60, 100, 120),
  apertura("p2", "m5", "porta", 330, 80, 210),
  apertura("p3", "m5", "porta", 520, 70, 210),
  apertura("p5", "m6", "porta", 170, 70, 210),
];

const elementiComuni = [
  elemento("e1", "wc", 560, 607, 180, "l3"),
  elemento("e2", "bidet", 620, 609, 180, "l3"),
  elemento("e3", "lavabo", 560, 428, 0, "l3"),
  elemento("e4", "doccia", 685, 595, 0, "l3"),
  elemento("e5", "letto_matrimoniale", 695, 115, 0, "l2"),
  elemento("e6", "comodino", 592, 35, 0, "l2"),
  elemento("e7", "comodino", 798, 35, 0, "l2"),
  elemento("e8", "armadio", 855, 290, 90, "l2"),
  elemento("e9", "cucina_lineare", 45, 480, -90, "l1", 180),
  elemento("e10", "frigorifero", 48, 602, -90, "l1"),
  elemento("e11", "tavolo", 230, 500, 0, "l1"),
  elemento("e12", "divano", 250, 90, 0, "l1"),
];

const fatto: StatoPianta = {
  muri: muriFatto,
  aperture: apertureFatto,
  locali: [
    locale("l1", "Soggiorno", "soggiorno", 15, 15, 495, 635),
    locale("l2", "Camera", "camera", 505, 15, 885, 395),
    locale("l3", "Bagno", "bagno", 505, 405, 885, 635),
  ],
  elementi: elementiComuni,
  quote: [],
  testi: [],
};

const progetto: StatoPianta = {
  muri: [...muriFatto.map((m) => (m.id === "m8" ? { ...m, stato: "da_demolire" as const } : m)), muro("m7", 730, 400, 730, 650, 10, "nuovo")],
  aperture: [...apertureFatto.map((a) => (a.id === "p5" ? { ...a, stato: "da_demolire" as const } : a)), apertura("p4", "m6", "porta", 315, 70, 210, 0, "nuovo")],
  locali: [
    locale("l1", "Soggiorno", "soggiorno", 15, 15, 495, 635),
    locale("l2", "Camera", "camera", 505, 15, 885, 395),
    locale("l3", "Bagno", "bagno", 505, 405, 725, 635),
    locale("l4", "Ripostiglio", "ripostiglio", 735, 405, 885, 635),
  ],
  elementi: [...elementiComuni, elemento("e13", "caldaia", 860, 420, 0, "l4")],
  quote: [],
  testi: [],
};

export const BILOCALE_DA_RISTRUTTURARE: Planimetria = {
  schema: 1,
  unita: "cm",
  titolo: "Bilocale da ristrutturare (esempio del 3D)",
  scala: 50,
  livelli: [{ id: "pt", nome: "Piano terra", quota: 0, fatto, proposte: [{ id: "A", nome: "Proposta A", ...progetto }] }],
};
