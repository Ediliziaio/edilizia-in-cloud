/**
 * Dal modello della pianta alla vista che le esportazioni disegnano.
 *
 * PROVVISORIO. Il modello vero è della fase 1 (`shared/planimetrie/`, branch
 * `planimetrie-fase1-modello`) e qui non c'è ancora: finché non arriva, questo
 * file tiene una forma del modello presa dal piano (stato di fatto + proposte,
 * ognuno con i suoi muri, aperture, locali) e una pianta d'esempio scritta a
 * mano. Quando la fase 1 è pronta si cambiano solo i tipi qui sotto e
 * `vistaDaPlanimetria`: i disegnatori leggono `VistaPianta` e non se ne accorgono.
 */
import { areaPoligono, perimetroPoligono } from "./geometria";
import type {
  AperturaVista, ElementoVista, LocaleVista, MuroVista, OrigineMisura, Pavimento,
  QuotaVista, StatoCostruttivo, TestoVista, VistaPianta,
} from "./tipi";

type SenzaStato<T> = Omit<T, "stato">;

/** Una disposizione: i muri, le aperture e i locali di uno stato (fatto o proposta). */
export interface DisposizioneProvvisoria {
  muri: SenzaStato<MuroVista>[];
  aperture: SenzaStato<AperturaVista>[];
  locali: Omit<LocaleVista, "superficieMq" | "perimetroM">[];
  elementi: Omit<ElementoVista, "stato">[];
  quote?: QuotaVista[];
  testi?: TestoVista[];
}

export interface LivelloProvvisorio {
  id: string;
  nome: string;
  fatto: DisposizioneProvvisoria;
  proposte: { id: string; nome: string; disposizione: DisposizioneProvvisoria }[];
}

export interface PlanimetriaProvvisoria {
  id: string;
  titolo: string;
  versione: number;
  unita: "cm";
  nord?: number;
  livelli: LivelloProvvisorio[];
}

/**
 * Cosa disegnare:
 * - `fatto`: lo stato di fatto, tutto esistente;
 * - `progetto`: la proposta com'è, tutto esistente (la pianta «finita»);
 * - `confronto`: fatto e proposta sovrapposti, giallo ciò che si demolisce,
 *   rosso ciò che si costruisce. Muri e aperture si riconoscono per `id`.
 */
export type ModoVista = "fatto" | "progetto" | "confronto";

export interface SceltaVista {
  livelloId?: string;
  propostaId?: string;
  modo: ModoVista;
}

const conStato = <T extends object>(voci: T[], stato: StatoCostruttivo) =>
  voci.map((v) => ({ ...v, stato }));

function confronta<T extends { id: string }>(fatto: T[], progetto: T[]): (T & { stato: StatoCostruttivo })[] {
  const inProgetto = new Set(progetto.map((v) => v.id));
  const inFatto = new Set(fatto.map((v) => v.id));
  return [
    ...fatto.map((v) => ({ ...v, stato: (inProgetto.has(v.id) ? "esistente" : "da_demolire") as StatoCostruttivo })),
    ...progetto.filter((v) => !inFatto.has(v.id)).map((v) => ({ ...v, stato: "nuovo" as StatoCostruttivo })),
  ];
}

function conSuperfici(locali: DisposizioneProvvisoria["locali"]): LocaleVista[] {
  return locali.map((l) => ({
    ...l,
    superficieMq: areaPoligono(l.contorno) / 10_000,
    perimetroM: perimetroPoligono(l.contorno) / 100,
  }));
}

const NOMI_MODO: Record<ModoVista, string> = {
  fatto: "Stato di fatto",
  progetto: "Stato di progetto",
  confronto: "Stato comparativo",
};

export function vistaDaPlanimetria(p: PlanimetriaProvvisoria, scelta: SceltaVista = { modo: "progetto" }): VistaPianta {
  const livello = p.livelli.find((l) => l.id === scelta.livelloId) ?? p.livelli[0];
  if (!livello) throw new Error("La pianta non ha livelli da disegnare.");
  const proposta = livello.proposte.find((x) => x.id === scelta.propostaId) ?? livello.proposte[0];
  const progetto = proposta?.disposizione ?? livello.fatto;
  const modo = proposta ? scelta.modo : "fatto";

  const base = modo === "fatto" ? livello.fatto : progetto;
  const muri = modo === "confronto" ? confronta(livello.fatto.muri, progetto.muri) : conStato(base.muri, "esistente");
  const aperture = modo === "confronto"
    ? confronta(livello.fatto.aperture, progetto.aperture)
    : conStato(base.aperture, "esistente");

  const titoloProposta = modo !== "fatto" && proposta && livello.proposte.length > 1 ? ` — ${proposta.nome}` : "";
  return {
    titolo: p.titolo,
    livello: `${livello.nome} · ${NOMI_MODO[modo]}${titoloProposta}`,
    muri,
    aperture,
    locali: conSuperfici(base.locali),
    elementi: base.elementi.map((e) => ({ ...e, stato: "esistente" as StatoCostruttivo })),
    quote: base.quote ?? [],
    testi: base.testi ?? [],
    nord: p.nord,
  };
}

// ─── Pianta d'esempio ────────────────────────────────────────────────────────
//
// Un bilocale con assi dei muri esterni di 9,60 × 7,40 m (9,90 × 7,70 al filo
// esterno), muri esterni da 30 cm e
// tramezzi da 10. Nel progetto si apre la cucina sul soggiorno (muro giallo) e
// si ricava una lavanderia dal bagno (muro e porta rossi).

const R = (x0: number, y0: number, x1: number, y1: number) => [
  { x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 },
];

const muriEsterni: SenzaStato<MuroVista>[] = [
  { id: "m-nord", p1: { x: 0, y: 0 }, p2: { x: 960, y: 0 }, spessore: 30, altezza: 270, tipo: "portante" },
  { id: "m-est", p1: { x: 960, y: 0 }, p2: { x: 960, y: 740 }, spessore: 30, altezza: 270, tipo: "portante" },
  { id: "m-sud", p1: { x: 0, y: 740 }, p2: { x: 960, y: 740 }, spessore: 30, altezza: 270, tipo: "portante" },
  { id: "m-ovest", p1: { x: 0, y: 0 }, p2: { x: 0, y: 740 }, spessore: 30, altezza: 270, tipo: "portante" },
];

const muriInterni: SenzaStato<MuroVista>[] = [
  { id: "t-zona-notte", p1: { x: 560, y: 0 }, p2: { x: 560, y: 740 }, spessore: 10, altezza: 270, tipo: "tramezzo" },
  { id: "t-camera", p1: { x: 560, y: 400 }, p2: { x: 960, y: 400 }, spessore: 10, altezza: 270, tipo: "tramezzo" },
  { id: "t-bagno", p1: { x: 680, y: 400 }, p2: { x: 680, y: 740 }, spessore: 10, altezza: 270, tipo: "tramezzo" },
];

const apertureComuni: SenzaStato<AperturaVista>[] = [
  { id: "f-soggiorno", muroId: "m-nord", tipo: "finestra", distanza: 150, larghezza: 140, altezza: 150, davanzale: 90, ante: 2 },
  { id: "f-camera", muroId: "m-nord", tipo: "finestra", distanza: 690, larghezza: 120, altezza: 150, davanzale: 90, ante: 2 },
  { id: "pf-cucina", muroId: "m-ovest", tipo: "portafinestra", distanza: 520, larghezza: 120, altezza: 240, ante: 2 },
  { id: "f-cucina", muroId: "m-sud", tipo: "finestra", distanza: 180, larghezza: 120, altezza: 140, davanzale: 100, ante: 2 },
  { id: "p-ingresso", muroId: "m-sud", tipo: "porta", distanza: 575, larghezza: 90, altezza: 210, cerniera: "inizio", lato: "sinistra" },
  { id: "f-bagno", muroId: "m-est", tipo: "finestra", distanza: 450, larghezza: 70, altezza: 120, davanzale: 110, ante: 1 },
  { id: "p-disimpegno", muroId: "t-zona-notte", tipo: "porta", distanza: 470, larghezza: 80, altezza: 210, cerniera: "fine", lato: "sinistra" },
  { id: "p-camera", muroId: "t-camera", tipo: "porta", distanza: 20, larghezza: 80, altezza: 210, cerniera: "inizio", lato: "sinistra" },
  { id: "p-bagno", muroId: "t-bagno", tipo: "porta", distanza: 30, larghezza: 70, altezza: 210, cerniera: "inizio", lato: "sinistra" },
];

const PAVIMENTI: Record<string, Pavimento> = { soggiorno: "parquet", camera: "parquet", cucina: "gres", bagno: "piastrelle" };

export const PIANTA_ESEMPIO: PlanimetriaProvvisoria = {
  id: "esempio-trilocale",
  titolo: "Appartamento via Roma 12",
  versione: 3,
  unita: "cm",
  livelli: [
    {
      id: "pt",
      nome: "Piano primo",
      fatto: {
        muri: [
          ...muriEsterni,
          ...muriInterni,
          { id: "t-cucina", p1: { x: 0, y: 440 }, p2: { x: 560, y: 440 }, spessore: 10, altezza: 270, tipo: "tramezzo" },
        ],
        aperture: [
          ...apertureComuni,
          { id: "p-cucina", muroId: "t-cucina", tipo: "porta", distanza: 380, larghezza: 80, altezza: 210, cerniera: "inizio", lato: "destra" },
        ],
        locali: [
          { id: "l-soggiorno", nome: "Soggiorno", destinazione: "soggiorno", contorno: R(15, 15, 555, 435), altezza: 270, pavimento: PAVIMENTI.soggiorno, origine: "rilevata" },
          { id: "l-cucina", nome: "Cucina", destinazione: "cucina", contorno: R(15, 445, 555, 725), altezza: 270, pavimento: PAVIMENTI.cucina, origine: "rilevata" },
          { id: "l-camera", nome: "Camera", destinazione: "camera", contorno: R(565, 15, 945, 395), altezza: 270, pavimento: PAVIMENTI.camera, origine: "rilevata" },
          { id: "l-disimpegno", nome: "Disimpegno", destinazione: "disimpegno", contorno: R(565, 405, 675, 725), altezza: 270, pavimento: "gres", origine: "rilevata" },
          { id: "l-bagno", nome: "Bagno", destinazione: "bagno", contorno: R(685, 405, 945, 725), altezza: 270, pavimento: PAVIMENTI.bagno, origine: "rilevata" },
        ],
        elementi: [],
      },
      proposte: [
        {
          id: "A",
          nome: "Proposta A",
          disposizione: {
            muri: [
              ...muriEsterni,
              ...muriInterni,
              { id: "t-lavanderia", p1: { x: 680, y: 600 }, p2: { x: 960, y: 600 }, spessore: 10, altezza: 270, tipo: "tramezzo", origine: "stimata" },
            ],
            aperture: [
              ...apertureComuni,
              { id: "p-lavanderia", muroId: "t-bagno", tipo: "porta", distanza: 250, larghezza: 70, altezza: 210, cerniera: "fine", lato: "sinistra" },
              { id: "f-lavanderia", muroId: "m-est", tipo: "finestra", distanza: 640, larghezza: 60, altezza: 100, davanzale: 120, ante: 1 },
            ],
            locali: [
              { id: "l-soggiorno", nome: "Soggiorno con cucina", destinazione: "soggiorno", contorno: R(15, 15, 555, 725), altezza: 270, pavimento: PAVIMENTI.soggiorno, origine: "rilevata" },
              { id: "l-camera", nome: "Camera", destinazione: "camera", contorno: R(565, 15, 945, 395), altezza: 270, pavimento: PAVIMENTI.camera, origine: "rilevata" },
              { id: "l-disimpegno", nome: "Disimpegno", destinazione: "disimpegno", contorno: R(565, 405, 675, 725), altezza: 270, pavimento: "gres", origine: "rilevata" },
              { id: "l-bagno", nome: "Bagno", destinazione: "bagno", contorno: R(685, 405, 945, 595), altezza: 270, pavimento: PAVIMENTI.bagno, origine: "rilevata" },
              { id: "l-lavanderia", nome: "Lavanderia", destinazione: "lavanderia", contorno: R(685, 605, 945, 725), altezza: 270, pavimento: "gres", origine: "stimata" },
            ],
            elementi: [
              // Bagno: sanitari sul tramezzo della camera, doccia nell'angolo
              { id: "e-wc", tipo: "wc", posizione: { x: 800, y: 433 }, larghezza: 38, profondita: 55, rotazione: 0 },
              { id: "e-bidet", tipo: "bidet", posizione: { x: 860, y: 433 }, larghezza: 38, profondita: 55, rotazione: 0 },
              { id: "e-lavabo", tipo: "lavabo", posizione: { x: 760, y: 572 }, larghezza: 60, profondita: 45, rotazione: 180 },
              { id: "e-doccia", tipo: "doccia", posizione: { x: 900, y: 550 }, larghezza: 90, profondita: 90, rotazione: 0 },
              // Lavanderia
              { id: "e-lavatrice", tipo: "lavatrice", posizione: { x: 915, y: 695 }, larghezza: 60, profondita: 60, rotazione: 180 },
              { id: "e-caldaia", tipo: "caldaia", posizione: { x: 830, y: 705 }, larghezza: 45, profondita: 35, rotazione: 180 },
              // Camera
              { id: "e-letto", tipo: "letto_matrimoniale", posizione: { x: 755, y: 117 }, larghezza: 170, profondita: 205, rotazione: 0 },
              { id: "e-comodino-1", tipo: "comodino", posizione: { x: 645, y: 37 }, larghezza: 45, profondita: 40, rotazione: 0 },
              { id: "e-comodino-2", tipo: "comodino", posizione: { x: 865, y: 37 }, larghezza: 45, profondita: 40, rotazione: 0 },
              { id: "e-armadio", tipo: "armadio", posizione: { x: 795, y: 362 }, larghezza: 240, profondita: 60, rotazione: 180 },
              // Soggiorno con cucina
              { id: "e-cucina", tipo: "cucina", posizione: { x: 175, y: 694 }, larghezza: 300, profondita: 62, rotazione: 180 },
              { id: "e-frigo", tipo: "frigorifero", posizione: { x: 360, y: 694 }, larghezza: 65, profondita: 62, rotazione: 180 },
              { id: "e-tavolo", tipo: "tavolo", posizione: { x: 300, y: 545 }, larghezza: 160, profondita: 90, rotazione: 0 },
              { id: "e-divano", tipo: "divano", posizione: { x: 285, y: 110 }, larghezza: 240, profondita: 95, rotazione: 0 },
            ],
          },
        },
      ],
    },
  ],
};

/** Le origini delle misure di una vista: serve al PDF per la nota sulle stimate. */
export function haMisureStimate(v: VistaPianta): boolean {
  const stimata = (o?: OrigineMisura) => o === "stimata";
  return v.muri.some((m) => stimata(m.origine)) || v.locali.some((l) => stimata(l.origine)) || v.quote.some((q) => stimata(q.origine));
}
