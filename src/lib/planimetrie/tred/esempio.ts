/**
 * Bilocale d'esempio scritto a mano (centimetri), per la pagina di prova e i test.
 *
 *   x →   0          500        730   900
 * y 0    ┌───f1──────┬────f3─────────┐
 *        │ Soggiorno │   Camera      │
 *        pf1         p2              │
 *  380   ├──m8──┐    │               │      m8 = tramezzo da demolire (giallo)
 *  400   │      f2   ├──p5───┬─p4────┤      p5 = porta da chiudere, p4 = porta nuova
 *        f2          p3 Bagno│ Rip.  │      m7 = tramezzo nuovo (rosso)
 *  650   └────a1─────┴──f4───┴───────┘
 *
 * Muri esterni 30 cm, tramezzi 10 cm, altezza 2,70 m.
 */
import type { PlanimetriaProvvisoria } from "./adattatore";

export const BILOCALE_ESEMPIO: PlanimetriaProvvisoria = {
  unita: "cm",
  livelli: [
    {
      id: "pt",
      nome: "Piano terra",
      muri: [
        { id: "m1", p1: { x: 0, y: 0 }, p2: { x: 900, y: 0 }, spessore: 30, altezza: 270, tipo: "portante" },
        { id: "m2", p1: { x: 900, y: 0 }, p2: { x: 900, y: 650 }, spessore: 30, altezza: 270, tipo: "portante" },
        { id: "m3", p1: { x: 900, y: 650 }, p2: { x: 0, y: 650 }, spessore: 30, altezza: 270, tipo: "portante" },
        { id: "m4", p1: { x: 0, y: 650 }, p2: { x: 0, y: 0 }, spessore: 30, altezza: 270, tipo: "portante" },
        { id: "m5", p1: { x: 500, y: 0 }, p2: { x: 500, y: 650 }, spessore: 10, altezza: 270, tipo: "tramezzo" },
        { id: "m6", p1: { x: 500, y: 400 }, p2: { x: 900, y: 400 }, spessore: 10, altezza: 270, tipo: "tramezzo" },
        { id: "m7", p1: { x: 730, y: 400 }, p2: { x: 730, y: 650 }, spessore: 10, altezza: 270, tipo: "tramezzo", stato: "nuovo" },
        { id: "m8", p1: { x: 0, y: 380 }, p2: { x: 280, y: 380 }, spessore: 10, altezza: 270, tipo: "tramezzo", stato: "demolire" },
      ],
      aperture: [
        { id: "a1", muroId: "m3", tipo: "porta", posizione: 550, larghezza: 90, altezza: 215 },
        { id: "f1", muroId: "m1", tipo: "finestra", posizione: 180, larghezza: 140, altezza: 140, davanzale: 100 },
        { id: "pf1", muroId: "m4", tipo: "portafinestra", posizione: 450, larghezza: 120, altezza: 240 },
        { id: "f2", muroId: "m4", tipo: "finestra", posizione: 130, larghezza: 100, altezza: 120, davanzale: 110 },
        { id: "f3", muroId: "m1", tipo: "finestra", posizione: 700, larghezza: 120, altezza: 140, davanzale: 100 },
        { id: "f4", muroId: "m3", tipo: "finestra", posizione: 285, larghezza: 60, altezza: 100, davanzale: 120 },
        { id: "p2", muroId: "m5", tipo: "porta", posizione: 330, larghezza: 80, altezza: 210 },
        { id: "p3", muroId: "m5", tipo: "porta", posizione: 520, larghezza: 70, altezza: 210 },
        { id: "p4", muroId: "m6", tipo: "porta", posizione: 315, larghezza: 70, altezza: 210, stato: "nuovo" },
        { id: "p5", muroId: "m6", tipo: "porta", posizione: 170, larghezza: 70, altezza: 210, stato: "demolire" },
      ],
      locali: [
        { id: "l1", nome: "Soggiorno", destinazione: "soggiorno con angolo cottura", altezza: 270, contorno: [{ x: 15, y: 15 }, { x: 495, y: 15 }, { x: 495, y: 635 }, { x: 15, y: 635 }] },
        { id: "l2", nome: "Camera", destinazione: "camera da letto", altezza: 270, contorno: [{ x: 505, y: 15 }, { x: 885, y: 15 }, { x: 885, y: 395 }, { x: 505, y: 395 }] },
        { id: "l3", nome: "Bagno", destinazione: "bagno", altezza: 270, contorno: [{ x: 505, y: 405 }, { x: 725, y: 405 }, { x: 725, y: 635 }, { x: 505, y: 635 }] },
        { id: "l4", nome: "Ripostiglio", destinazione: "ripostiglio", altezza: 270, contorno: [{ x: 735, y: 405 }, { x: 885, y: 405 }, { x: 885, y: 635 }, { x: 735, y: 635 }] },
      ],
      elementi: [
        { id: "e1", tipo: "wc", posizione: { x: 560, y: 607 }, rotazione: 180, localeId: "l3" },
        { id: "e2", tipo: "bidet", posizione: { x: 620, y: 609 }, rotazione: 180, localeId: "l3" },
        { id: "e3", tipo: "lavabo", posizione: { x: 560, y: 428 }, rotazione: 0, localeId: "l3" },
        { id: "e4", tipo: "doccia", posizione: { x: 685, y: 595 }, rotazione: 0, localeId: "l3" },
        { id: "e5", tipo: "letto", posizione: { x: 695, y: 115 }, rotazione: 0, localeId: "l2" },
        { id: "e6", tipo: "comodino", posizione: { x: 592, y: 35 }, rotazione: 0, localeId: "l2" },
        { id: "e7", tipo: "comodino", posizione: { x: 798, y: 35 }, rotazione: 0, localeId: "l2" },
        { id: "e8", tipo: "armadio", posizione: { x: 855, y: 290 }, rotazione: 90, localeId: "l2" },
        { id: "e9", tipo: "cucina", posizione: { x: 45, y: 480 }, rotazione: -90, larghezza: 180, localeId: "l1" },
        { id: "e10", tipo: "frigorifero", posizione: { x: 48, y: 602 }, rotazione: -90, localeId: "l1" },
        { id: "e11", tipo: "tavolo", posizione: { x: 230, y: 500 }, rotazione: 0, localeId: "l1" },
        { id: "e12", tipo: "divano", posizione: { x: 250, y: 90 }, rotazione: 0, localeId: "l1" },
        { id: "e13", tipo: "caldaia", posizione: { x: 860, y: 420 }, rotazione: 0, localeId: "l4" },
      ],
    },
  ],
};
