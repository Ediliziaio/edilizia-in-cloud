/** Stessa categoria e stesso ingombro del simbolo. Cambia il modello visibile nel 3D e nel render. */
export interface ModelloArredo {
  id: string;
  nome: string;
  descrizione: string;
  render: string;
  misure?: { larghezza: number; profondita: number; altezza: number };
}

export const MISURE_MODEL_3_HIGHLAND = { larghezza: 208.9, profondita: 472, altezza: 144 };
export const CREDITO_MODEL_3_HIGHLAND = {
  titolo: "2024 Tesla Model 3",
  autore: "RBLXSupercars",
  attribuzione: "RBLXSupercars, distribuito da brandonleong28, CC BY 4.0",
  fonte: "https://github.com/erictfree/Carbon-Footprint-AI-Visualizer/blob/af4bef33ca371b24c1f043486f09a13571f4919b/models/tesla-model-3-2024/CREDITS.md",
  licenza: "https://creativecommons.org/licenses/by/4.0/",
};

const CUCINE: readonly ModelloArredo[] = [
  { id: "attrezzata", nome: "Lavello e induzione", descrizione: "Lavello in inox, miscelatore, piano a induzione e forno dove entra.", render: "dimensioned cabinetry with the modeled stainless sink, mixer, induction hob and oven" },
  { id: "pensili", nome: "Attrezzata con pensili", descrizione: "Lavello, induzione e pensili con gole e sottopensile.", render: "the source sink and induction kitchen with overhead cabinetry in its modeled positions" },
  { id: "basi", nome: "Basi e piano libero", descrizione: "Mobile a moduli con piano continuo.", render: "dimensioned base cabinetry with an uninterrupted worktop" },
];

const LETTI: readonly ModelloArredo[] = [
  { id: "imbottita", nome: "Testiera imbottita", descrizione: "Testiera a pannello rivestita in tessuto.", render: "bed with the modeled upholstered headboard and its original footprint" },
  { id: "testiera_rovere", nome: "Testiera in rovere", descrizione: "Pannello in legno con venatura visibile.", render: "bed with a natural oak headboard, at the existing footprint and height" },
];

const MODELLI: Readonly<Record<string, readonly ModelloArredo[]>> = {
  cucina: CUCINE,
  cucina_angolare: CUCINE,
  letto: LETTI,
  letto_singolo: LETTI,
  letto_matrimoniale: LETTI,
  auto: [
    { id: "highland", nome: "Tesla Model 3 Highland", descrizione: "4,72 m di lunghezza, 2,09 m tra i retrovisori e 1,44 m di altezza.",
      render: "the modeled 2024 Tesla Model 3 Highland, with the same wheelbase, placement and orientation as the 3D reference",
      misure: MISURE_MODEL_3_HIGHLAND },
    { id: "compatta", nome: "Compatta", descrizione: "Utilitaria con portellone, cerchi e fanali dettagliati.", render: "compact hatchback placed and sized exactly as shown in the 3D reference" },
    { id: "berlina", nome: "Berlina", descrizione: "Quattro porte, cofano allungato e bagagliaio separato.", render: "generic saloon car with the same parking footprint" },
    { id: "suv", nome: "SUV", descrizione: "Crossover con passaruota e barre sul tetto.", render: "generic SUV with the same parking footprint" },
  ],
  piscina: [
    { id: "turchese", nome: "Travertino e acqua turchese", descrizione: "Bordo in travertino beige con acqua luminosa.", render: "pool with a beige travertine coping and turquoise water, matching the original basin geometry" },
    { id: "ardesia", nome: "Ardesia e acqua blu", descrizione: "Bordo grigio antracite e tonalità blu profonda.", render: "pool with dark slate coping and deep blue water, preserving the exact basin geometry" },
  ],
  wc: [
    { id: "sospeso", nome: "WC sospeso", descrizione: "Ceramica sospesa e cassetta incassata.", render: "wall-hung ceramic WC with visible floor clearance below the bowl and a concealed cistern" },
    { id: "filo_muro", nome: "WC a terra con cassetta incassata", descrizione: "Base a pavimento e profilo a filo muro.", render: "floor-mounted back-to-wall ceramic WC with a full ground contact and concealed cistern" },
    { id: "cassetta_vista", nome: "WC con cassetta a vista", descrizione: "Base a pavimento e cassetta in ceramica.", render: "floor-mounted ceramic toilet with an exposed close-coupled cistern" },
  ],
  bidet: [
    { id: "sospeso", nome: "Bidet sospeso", descrizione: "Vasca arrotondata con pavimento libero sotto.", render: "wall-hung ceramic bidet, visible clearance above the floor and a small mixer tap" },
    { id: "filo_muro", nome: "Bidet a terra", descrizione: "Base continua a filo muro.", render: "floor-mounted back-to-wall ceramic bidet with an integrated pedestal" },
  ],
  lavabo: [
    { id: "incasso", nome: "Lavabo a incasso", descrizione: "Vasca integrata a filo del piano.", render: "washbasin recessed into the vanity countertop, basin rim flush with the counter surface" },
    { id: "appoggio", nome: "Lavabo da appoggio", descrizione: "Bacinella in ceramica sopra il piano.", render: "rounded ceramic vessel washbasin sitting visibly above the countertop" },
    { id: "sospeso", nome: "Lavabo sospeso", descrizione: "Ceramica a parete con spazio libero sotto.", render: "wall-hung ceramic washbasin without a cabinet or pedestal beneath it" },
  ],
  vasca: [
    { id: "incasso", nome: "Vasca a incasso", descrizione: "Bordo rettangolare, fronte rivestito e vasca interna.", render: "rectangular built-in bathtub with a solid apron and a recessed bathing well" },
    { id: "freestanding", nome: "Vasca freestanding", descrizione: "Profilo ovale autoportante.", render: "freestanding oval bathtub with a continuous curved ceramic shell and open space around it" },
  ],
  divano: [
    { id: "morbido", nome: "Divano morbido", descrizione: "Braccioli e cuscini bombati in tessuto.", render: "upholstered sofa with rounded arms, soft separate seat cushions and a low plush silhouette" },
    { id: "modulare", nome: "Divano modulare", descrizione: "Elementi separati, sedute basse e linee pulite.", render: "low upholstered modular sofa made of distinct joined modules with visible seat seams" },
  ],
  mobile_tv: [
    { id: "sospeso", nome: "Mobile TV sospeso", descrizione: "Mobile con pavimento libero sotto e schermo.", render: "floating low media cabinet, open floor clearance beneath it, with its source TV screen in place" },
    { id: "a_terra", nome: "Mobile TV a terra", descrizione: "Consolle bassa in legno con piedini e schermo.", render: "low floor-standing media cabinet raised on short feet with its source TV screen in place" },
    { id: "boiserie", nome: "Parete TV in legno", descrizione: "Pannelli verticali, base contenitore e TV.", render: "full-height timber media wall with vertical panel seams, low storage cabinets and inset television", misure: { larghezza: 280, profondita: 42, altezza: 224 } },
  ],
  tavolino: [
    { id: "marmo_tondo", nome: "Tavolino tondo in marmo", descrizione: "Piano a disco con bordo levigato e tre sostegni cilindrici.", render: "round marble coffee table with a polished thick edge and three matching cylindrical supports", misure: { larghezza: 92, profondita: 92, altezza: 38 } },
  ],
  armadio: [
    { id: "battente", nome: "Ante battenti", descrizione: "Ante distinte con maniglie verticali e zoccolo rientrante.", render: "a wardrobe with separate hinged doors and vertical pulls" },
    { id: "scorrevole", nome: "Ante scorrevoli", descrizione: "Pannelli sovrapposti sui binari, con fasce in rovere.", render: "a sliding-door wardrobe with overlapping panels, graphite rails and oak accents" },
  ],
  tavolo: [
    { id: "apparecchiato", nome: "Tavolo apparecchiato", descrizione: "Piano in legno con tessile da tavola e stoviglie.", render: "the dining table with its existing runner and ceramic place settings" },
  ],
};

export const modelliArredo = (tipo: string): readonly ModelloArredo[] =>
  Object.hasOwn(MODELLI, tipo) ? MODELLI[tipo] : [];

export function modelloArredo(tipo: string, id: string | undefined): ModelloArredo | undefined {
  return id ? modelliArredo(tipo).find(m => m.id === id) : undefined;
}

/** Quote in centimetri. Altezza del piano di lavoro e della testiera indipendenti. */
export const profonditaBracciCucina = (larghezza: number, profondita: number) => Math.min(62, larghezza, profondita);
export const altezzaPensiliCucina = (piano: number) => Math.max(145, piano + 55);
export const altezzaTestieraLetto = (pianoLetto: number) => Math.max(100, pianoLetto);

export const PROFONDITA_PISCINA_CM = 140;
/** Ingombro in pianta misurato all'esterno del bordo. Tutti i valori sono in centimetri. */
export function quotePiscina(larghezza: number, lunghezza: number, profondita?: number) {
  const vasca = profondita && profondita > 0 ? profondita : PROFONDITA_PISCINA_CM;
  const bordo = Math.min(25, larghezza * .12, lunghezza * .12);
  return { bordo, vasca, livello: Math.min(12, vasca * .25), luce: larghezza - 2 * bordo, lungo: lunghezza - 2 * bordo };
}

/** Quote della seduta in centimetri. La chaise longue occupa il lato destro locale. */
export function quoteDivanoAngolare(larghezza: number, profondita: number) {
  const schienale = Math.min(24, profondita * .28);
  const bracciolo = Math.min(18, larghezza * .17, profondita * .27);
  const penisola = Math.min(95, larghezza * .38);
  const profonditaCorpo = Math.min(profondita, schienale + 70);
  const posti = Math.max(1, Math.min(6, Math.round((larghezza - penisola - bracciolo) / 65)));
  return { schienale, bracciolo, penisola, profonditaCorpo, posti };
}

/** Ingombri in centimetri rispetto al centro, con Y nel verso dello schermo (come il simbolo 2D). */
export function rettangoliIngombroArredo(tipo: string, larghezza: number, profondita: number) {
  if (tipo === "divano_angolare") {
    const { profonditaCorpo, penisola } = quoteDivanoAngolare(larghezza, profondita);
    return profonditaCorpo < profondita ? [
      { x: 0, y: (profonditaCorpo - profondita) / 2, larghezza, profondita: profonditaCorpo },
      { x: (larghezza - penisola) / 2, y: profonditaCorpo / 2, larghezza: penisola, profondita: profondita - profonditaCorpo },
    ] : [{ x: 0, y: 0, larghezza, profondita }];
  }
  if (tipo !== "cucina_angolare") return [{ x: 0, y: 0, larghezza, profondita }];
  const braccio = profonditaBracciCucina(larghezza, profondita);
  if (braccio >= larghezza || braccio >= profondita) return [{ x: 0, y: 0, larghezza, profondita }];
  return [
    { x: 0, y: (braccio - profondita) / 2, larghezza, profondita: braccio },
    { x: (braccio - larghezza) / 2, y: braccio / 2, larghezza: braccio, profondita: profondita - braccio },
  ];
}

/** Quote in centimetri, condivise da simbolo, modello 3D e ingombro. */
export function disposizioneIsola(larghezza: number, profondita: number) {
  const numero = Math.max(1, Math.min(3, Math.floor(larghezza / 52)));
  const diametro = Math.min(34, larghezza / numero * .66, profondita * .35);
  const banco = profondita - diametro - Math.min(4, profondita * .055);
  return { banco, diametro, zSeduta: profondita / 2 - diametro / 2 - Math.min(1.5, profondita * .025),
    sedute: Array.from({ length: numero }, (_, i) => (i + .5) * larghezza / numero - larghezza / 2) };
}
