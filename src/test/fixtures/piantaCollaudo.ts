/**
 * Progetto di collaudo con misure note (23/11/2026): cinque locali, un tramezzo di 4,00 m
 * con una porta 0,90 × 2,10, una parete obliqua. Le misure attese sono scritte a mano in
 * `planimetrieCollaudo.test.ts`: se un calcolo cambia, il test dice quale e di quanto.
 *
 *   y=720 ┌────────┬─────────┬╲
 *         │ Bagno  │ Disimp. │  ╲  Studio (trapezio)
 *   y=410 ├────────┴─────────┼─────────┤
 *         │   Soggiorno      │ Camera  │
 *   y=0   └──────────────────┴─────────┘
 *         x=0              500/510    910
 *
 * `variante()` aggiunge la proposta A: si demolisce il tramezzo fra soggiorno e camera
 * e se ne costruisce uno nuovo 40 cm più in là, con una porta nuova.
 */
import type { Planimetria } from "../../../shared/planimetrie/modello";

const H = 270;
const muro = (id: string, x1: number, y1: number, x2: number, y2: number, tipo: string, spessore: number, stato = "esistente") =>
  ({ id, p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 }, tipo, spessore, altezza: H, stato, origine: "rilevata" });
const apertura = (id: string, tipo: string, muroId: string, offset: number, larghezza: number, stato = "esistente") =>
  ({ id, tipo, muroId, offset, larghezza, altezza: tipo === "finestra" ? 140 : 210, davanzale: tipo === "finestra" ? 90 : 0, manovra: "battente", stato, origine: "rilevata" });
const locale = (id: string, nome: string, destinazione: string, contorno: [number, number][]) =>
  ({ id, nome, destinazione, altezza: H, origine: "rilevata", contorno: contorno.map(([x, y]) => ({ x, y })) });

const fatto = () => ({
  muri: [
    muro("e1", -15, -15, 925, -15, "esterno", 30),
    muro("e2", 925, -15, 925, 617, "esterno", 30),
    muro("e3", 925, 617, 505, 722, "esterno", 30),
    muro("e4", 505, 735, -15, 735, "esterno", 30),
    muro("e5", -15, 735, -15, -15, "esterno", 30),
    muro("t1", 505, 0, 505, 400, "tramezzo", 10),
    muro("t2", 0, 405, 910, 405, "tramezzo", 10),
    muro("t3", 245, 410, 245, 720, "tramezzo", 10),
    muro("t4", 505, 410, 505, 720, "tramezzo", 10),
  ],
  aperture: [
    apertura("p1", "porta", "t1", 155, 90),
    apertura("p2", "porta", "t2", 300, 80),
    apertura("p3", "porta", "t3", 100, 70),
    apertura("p4", "porta", "t4", 60, 80),
    apertura("p5", "porta", "e5", 400, 90),
    apertura("f1", "finestra", "e1", 180, 140),
    apertura("f2", "finestra", "e1", 660, 120),
  ],
  locali: [
    locale("l1", "Soggiorno", "soggiorno", [[0, 0], [500, 0], [500, 400], [0, 400]]),
    locale("l2", "Camera", "camera", [[510, 0], [910, 0], [910, 400], [510, 400]]),
    locale("l3", "Bagno", "bagno", [[0, 410], [240, 410], [240, 720], [0, 720]]),
    locale("l4", "Disimpegno", "disimpegno", [[250, 410], [500, 410], [500, 720], [250, 720]]),
    locale("l5", "Studio", "studio", [[510, 410], [910, 410], [910, 610], [510, 710]]),
  ],
  elementi: [] as unknown[], quote: [] as unknown[], testi: [] as unknown[],
});

export const piantaCollaudo = (): Planimetria => ({
  schema: 1, titolo: "Progetto di collaudo", unita: "cm",
  livelli: [{ id: "pt", nome: "Piano terra", quota: 0, proposte: [], fatto: fatto() }],
}) as unknown as Planimetria;

/** Proposta A: tramezzo t1 demolito, nuovo tramezzo n1 a x = 545 con porta nuova. */
export const piantaCollaudoConVariante = (): Planimetria => {
  const p = piantaCollaudo() as unknown as { livelli: { proposte: unknown[]; fatto: ReturnType<typeof fatto> }[] };
  const f = fatto();
  p.livelli[0].proposte = [{
    ...f, id: "A", nome: "Variante A",
    muri: [...f.muri.map((m) => (m.id === "t1" ? { ...m, stato: "da_demolire" } : m)), muro("n1", 545, 0, 545, 400, "tramezzo", 10, "nuovo")],
    aperture: [...f.aperture.map((a) => (a.id === "p1" ? { ...a, stato: "da_demolire" } : a)), apertura("pn", "porta", "n1", 155, 90, "nuovo")],
    locali: [
      locale("l1", "Soggiorno", "soggiorno", [[0, 0], [540, 0], [540, 400], [0, 400]]),
      locale("l2", "Camera", "camera", [[550, 0], [910, 0], [910, 400], [550, 400]]),
      ...f.locali.slice(2),
    ],
  }];
  return p as unknown as Planimetria;
};
