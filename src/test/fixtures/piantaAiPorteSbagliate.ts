/**
 * La pianta che l'AI ha disegnato il 23/11/2026 da «Soggiorno con cucina 5,00 x 4,20 m,
 * camera matrimoniale 3,80 x 3,60, cameretta 3,00 x 2,80, bagno 2,40 x 2,10, disimpegno
 * 3,00 x 1,20»: il bagno e la cameretta hanno la porta che dà fuori, il disimpegno è
 * uscito 5,17 m² invece di 3,60. Serve da caso reale per il controllore.
 */
import type { Planimetria } from "../../../shared/planimetrie/modello";

const muro = (id: string, x1: number, y1: number, x2: number, y2: number, tipo: string, spessore: number) =>
  ({ id, p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 }, tipo, spessore, altezza: 270, stato: "esistente", origine: "stimata" });
const apertura = (id: string, tipo: string, muroId: string, offset: number, larghezza: number) =>
  ({ id, tipo, muroId, offset, larghezza, altezza: tipo === "finestra" ? 140 : 210, davanzale: tipo === "finestra" ? 90 : 0, manovra: "battente", stato: "esistente", origine: "stimata" });
const locale = (id: string, nome: string, destinazione: string, x0: number, y0: number, x1: number, y1: number) =>
  ({ id, nome, destinazione, altezza: 270, origine: "stimata", contorno: [{ x: x0, y: y1 }, { x: x1, y: y1 }, { x: x1, y: y0 }, { x: x0, y: y0 }] });

export const piantaAiPorteSbagliate = (): Planimetria => ({
  versione: 1, titolo: "Pianta da descrizione", unita: "cm",
  livelli: [{ id: "pt", nome: "Piano", quota: 0, proposte: [], fatto: {
    muri: [
      muro("m1", -15, 740, 1035, 740, "esterno", 30),
      muro("m2", 503, 740, 503, 0, "tramezzo", 8),
      muro("m3", -15, 300, 822, 300, "tramezzo", 10),
      muro("m4", -15, 740, -15, 70, "esterno", 30),
      muro("m5", 635, 740, 635, 300, "tramezzo", 10),
      muro("m6", 1035, 740, 1035, 350, "esterno", 30),
      muro("m7", 635, 350, 1035, 350, "esterno", 30),
      muro("m8", 822, 300, 822, 0, "esterno", 30),
      muro("m9", 503, 0, 822, 0, "esterno", 30),
      muro("m10", 255, 300, 255, 70, "esterno", 30),
      muro("m11", -15, 70, 255, 70, "esterno", 30),
    ],
    aperture: [
      apertura("a1", "porta", "m4", 15, 90),
      apertura("a2", "finestra", "m1", 115, 120),
      apertura("a3", "porta", "m2", 135, 80),
      apertura("a4", "porta", "m5", 125, 80),
      apertura("a5", "finestra", "m1", 915, 120),
      apertura("a6", "porta", "m3", 665, 80),
      apertura("a7", "finestra", "m9", 97, 120),
      apertura("a8", "porta", "m10", 95, 80),
    ],
    locali: [
      locale("l1", "Soggiorno con cucina", "soggiorno", 0, 305, 499, 725),
      locale("l2", "Disimpegno", "disimpegno", 507, 305, 630, 725),
      locale("l3", "Camera matrimoniale", "camera", 640, 365, 1020, 725),
      locale("l4", "Cameretta", "camera", 507, 15, 807, 295),
      locale("l5", "Bagno", "bagno", 0, 85, 240, 295),
    ],
    elementi: [], quote: [], testi: [],
  } }],
}) as unknown as Planimetria;
