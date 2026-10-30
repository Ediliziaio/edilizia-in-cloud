/**
 * La pianta d'esempio delle esportazioni, nel formato del modello (fase 1).
 *
 * Un bilocale con gli assi dei muri esterni di 9,60 × 7,40 m (9,90 × 7,70 al
 * filo esterno), muri esterni da 30 cm e tramezzi da 10. Nella proposta A si
 * apre la cucina sul soggiorno (tramezzo giallo), si ricava una lavanderia dal
 * bagno (tramezzo e porta rossi) e si apre una finestra nuova.
 *
 * Le coordinate qui sotto sono scritte come si leggono sul foglio, dall'alto
 * (`f(x, y)`), e girate nella y verso l'alto del modello: così l'esempio si
 * controlla a occhio contro il disegno. Anche le rotazioni degli arredi sono
 * scritte come si vedono (0 = schienale in alto, gradi orari) e passate alla
 * convenzione del modello (antioraria, retro in basso a 0°).
 */
import type { Apertura, Elemento, Locale, Muro, Planimetria, Punto } from "../../../../shared/planimetrie/modello.ts";

const ALTO = 740;
const f = (x: number, y: number): Punto => ({ x, y: ALTO - y });
const R = (x0: number, y0: number, x1: number, y1: number) => [f(x0, y1), f(x1, y1), f(x1, y0), f(x0, y0)];

const muro = (id: string, a: [number, number], b: [number, number], spessore: number, tipo: Muro["tipo"], extra: Partial<Muro> = {}): Muro => ({
  id, p1: f(...a), p2: f(...b), spessore, altezza: 270, tipo, stato: "esistente", origine: "rilevata", ...extra,
});

const apertura = (
  id: string, muroId: string, tipo: Apertura["tipo"], offset: number, larghezza: number, altezza: number,
  extra: Partial<Apertura> = {},
): Apertura => ({
  id, muroId, tipo, offset, larghezza, altezza, davanzale: 0, manovra: tipo === "varco" ? "nessuna" : "battente",
  stato: "esistente", origine: "rilevata", ...extra,
});

const locale = (id: string, nome: string, destinazione: Locale["destinazione"], contorno: Punto[], pavimento: string, extra: Partial<Locale> = {}): Locale => ({
  id, nome, destinazione, contorno, altezza: 270, origine: "rilevata", finiture: { pavimento }, ...extra,
});

const elemento = (id: string, tipo: string, x: number, y: number, larghezza: number, profondita: number, rotazioneFoglio = 0): Elemento => ({
  id, tipo, posizione: f(x, y), larghezza, profondita, rotazione: (180 - rotazioneFoglio + 360) % 360, origine: "rilevata",
});

const muriEsterni = [
  muro("m-nord", [0, 0], [960, 0], 30, "esterno"),
  muro("m-est", [960, 0], [960, 740], 30, "esterno"),
  muro("m-sud", [0, 740], [960, 740], 30, "esterno"),
  muro("m-ovest", [0, 0], [0, 740], 30, "esterno"),
];
const tramezzi = [
  muro("t-zona-notte", [560, 0], [560, 740], 10, "tramezzo"),
  muro("t-camera", [560, 400], [960, 400], 10, "tramezzo"),
  muro("t-bagno", [680, 400], [680, 740], 10, "tramezzo"),
];
const finestra = (id: string, muroId: string, offset: number, larghezza: number, altezza: number, davanzale: number, extra: Partial<Apertura> = {}) =>
  apertura(id, muroId, "finestra", offset, larghezza, altezza, { davanzale, ...extra });

// I versi sono quelli del disegno: «sinistra» guardando da p1 a p2 come si vede sul foglio.
const apertureComuni: Apertura[] = [
  finestra("f-soggiorno", "m-nord", 150, 140, 150, 90),
  finestra("f-camera", "m-nord", 690, 120, 150, 90),
  apertura("pf-cucina", "m-ovest", "portafinestra", 520, 120, 240, { verso: { cardine: "p1", lato: "sinistra" } }),
  finestra("f-cucina", "m-sud", 180, 120, 140, 100),
  apertura("p-ingresso", "m-sud", "porta", 575, 90, 210, { verso: { cardine: "p1", lato: "sinistra" } }),
  finestra("f-bagno", "m-est", 450, 70, 120, 110),
  apertura("p-disimpegno", "t-zona-notte", "porta", 470, 80, 210, { verso: { cardine: "p2", lato: "sinistra" } }),
  apertura("p-camera", "t-camera", "porta", 20, 80, 210, { verso: { cardine: "p1", lato: "sinistra" } }),
  apertura("p-bagno", "t-bagno", "porta", 30, 70, 210, { verso: { cardine: "p1", lato: "sinistra" } }),
];

const camera = locale("l-camera", "Camera", "camera", R(565, 15, 945, 395), "parquet rovere");
const disimpegno = locale("l-disimpegno", "Disimpegno", "disimpegno", R(565, 405, 675, 725), "gres 60x60");

export const PIANTA_ESEMPIO: Planimetria = {
  schema: 1,
  unita: "cm",
  titolo: "Appartamento via Roma 12",
  scala: 50,
  livelli: [
    {
      id: "p1",
      nome: "Piano primo",
      quota: 300,
      fatto: {
        muri: [...muriEsterni, ...tramezzi, muro("t-cucina", [0, 440], [560, 440], 10, "tramezzo")],
        aperture: [
          ...apertureComuni,
          apertura("p-cucina", "t-cucina", "porta", 380, 80, 210, { verso: { cardine: "p1", lato: "destra" } }),
        ],
        locali: [
          locale("l-soggiorno", "Soggiorno", "soggiorno", R(15, 15, 555, 435), "parquet rovere"),
          locale("l-cucina", "Cucina", "cucina", R(15, 445, 555, 725), "gres 60x60"),
          camera,
          disimpegno,
          locale("l-bagno", "Bagno", "bagno", R(685, 405, 945, 725), "piastrelle 20x20", { finiture: { pavimento: "piastrelle 20x20", rivestimento: { altezza: 220 } } }),
        ],
        elementi: [],
        quote: [],
        testi: [],
      },
      proposte: [
        {
          id: "A",
          nome: "Proposta A",
          muri: [
            ...muriEsterni,
            ...tramezzi,
            muro("t-cucina", [0, 440], [560, 440], 10, "tramezzo", { stato: "da_demolire" }),
            muro("t-lavanderia", [680, 600], [960, 600], 10, "tramezzo", { stato: "nuovo", origine: "stimata" }),
          ],
          aperture: [
            ...apertureComuni,
            apertura("p-cucina", "t-cucina", "porta", 380, 80, 210, { verso: { cardine: "p1", lato: "destra" }, stato: "da_demolire" }),
            apertura("p-lavanderia", "t-bagno", "porta", 250, 70, 210, { verso: { cardine: "p2", lato: "sinistra" }, stato: "nuovo" }),
            finestra("f-lavanderia", "m-est", 640, 60, 100, 120, { stato: "nuovo" }),
          ],
          locali: [
            locale("l-soggiorno", "Soggiorno con cucina", "soggiorno", R(15, 15, 555, 725), "parquet rovere"),
            camera,
            disimpegno,
            locale("l-bagno", "Bagno", "bagno", R(685, 405, 945, 595), "piastrelle 20x20", { finiture: { pavimento: "piastrelle 20x20", rivestimento: { altezza: 220 } } }),
            locale("l-lavanderia", "Lavanderia", "lavanderia", R(685, 605, 945, 725), "gres 60x60", { origine: "stimata" }),
          ],
          elementi: [
            // Bagno: sanitari sul tramezzo della camera, doccia nell'angolo
            elemento("e-wc", "wc", 800, 433, 38, 55),
            elemento("e-bidet", "bidet", 860, 433, 38, 55),
            elemento("e-lavabo", "lavabo", 760, 572, 60, 45, 180),
            elemento("e-doccia", "doccia", 900, 550, 90, 90),
            // Lavanderia
            elemento("e-lavatrice", "lavatrice", 915, 695, 60, 60, 180),
            elemento("e-caldaia", "caldaia", 830, 705, 45, 35, 180),
            // Camera
            elemento("e-letto", "letto_matrimoniale", 755, 117, 170, 205),
            elemento("e-comodino-1", "comodino", 645, 37, 45, 40),
            elemento("e-comodino-2", "comodino", 865, 37, 45, 40),
            elemento("e-armadio", "armadio", 795, 362, 240, 60, 180),
            // Soggiorno con cucina
            elemento("e-cucina", "cucina_lineare", 175, 694, 300, 62, 180),
            elemento("e-frigo", "frigorifero", 360, 694, 65, 62, 180),
            elemento("e-tavolo", "tavolo", 300, 545, 160, 90),
            elemento("e-divano", "divano", 285, 110, 240, 95),
          ],
          quote: [],
          testi: [],
        },
      ],
    },
  ],
};
