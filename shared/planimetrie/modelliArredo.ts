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

export const MODELLI_CATALOGO_3D = {
  "tavolo-massello": { titolo: "Wooden Table 02", autore: "Serhii Khromov", fonte: "https://polyhaven.com/a/wooden_table_02", parti: 1, rotazione: 0 },
  "sedia-pelle": { titolo: "Dining Chair 02", autore: "James Ray Cock", fonte: "https://polyhaven.com/a/dining_chair_02", parti: 1, rotazione: 0 },
  "tavolino-intarsio": { titolo: "Modern Coffee Table 01", autore: "Amin", fonte: "https://polyhaven.com/a/modern_coffee_table_01", parti: 1, rotazione: 90 },
  "poltrona-scocca": { titolo: "Modern Arm Chair 01", autore: "Vibrant Nordic", fonte: "https://polyhaven.com/a/modern_arm_chair_01", parti: 2, rotazione: 0 },
  "divano-classico": { titolo: "Sofa 02", autore: "Kirill Sannikov", fonte: "https://polyhaven.com/a/sofa_02", parti: 1, rotazione: 0 },
  "pianta-haworthia": { titolo: "Potted Plant 04", autore: "James Ray Cock", fonte: "https://polyhaven.com/a/potted_plant_04", parti: 1, rotazione: 0 },
} as const;
export type ModelloCatalogo3D = keyof typeof MODELLI_CATALOGO_3D;
export const LICENZA_CC0_CATALOGO = "https://creativecommons.org/publicdomain/zero/1.0/";

/** Stanno sotto, sopra o appesi dietro a un altro mobile: il loro ingombro in pianta può coincidere col suo. */
export const ARREDI_SOVRAPPONIBILI: ReadonlySet<string> = new Set(["tappeto", "quadro", "specchio_parete", "lampada_sospensione"]);

const COMPLEMENTI_CON_ALTEZZA = new Set(["tenda", "quadro", "specchio_parete", "scaldasalviette", "vetrinetta", "pianta_vaso"]);
export const richiedeAltezzaComplemento = (tipo: string) => COMPLEMENTI_CON_ALTEZZA.has(tipo);

const CUCINE: readonly ModelloArredo[] = [
  { id: "attrezzata", nome: "Lavello e induzione", descrizione: "Lavello in inox, miscelatore, piano a induzione e forno dove entra.", render: "dimensioned cabinetry with the modeled stainless sink, mixer, induction hob and oven" },
  { id: "pensili", nome: "Attrezzata con pensili", descrizione: "Lavello, induzione e pensili con gole e sottopensile.", render: "the source sink and induction kitchen with overhead cabinetry in its modeled positions" },
  { id: "pensili_led", nome: "Frontali in legno e sottopensile LED", descrizione: "Venatura del legno e luce calda lungo il piano di lavoro.", render: "the modeled kitchen's timber cabinets and warm under-cabinet light washing the worktop, preserving the appliances and cabinetry layout" },
  { id: "rovere_nicchie", nome: "Rovere e nicchie illuminate", descrizione: "Frontali a gola, pensili con vani aperti e luce calda sullo schienale.", render: "the modeled light-oak handleless fronts, open lit display niches, pale stone worktop and original sink and induction hob" },
  { id: "basi", nome: "Basi e piano libero", descrizione: "Mobile a moduli con piano continuo.", render: "dimensioned base cabinetry with an uninterrupted worktop" },
];

const LETTI: readonly ModelloArredo[] = [
  { id: "imbottita", nome: "Testiera imbottita", descrizione: "Testiera a pannello rivestita in tessuto.", render: "bed with the modeled upholstered headboard and its original footprint" },
  { id: "testiera_rovere", nome: "Testiera in rovere", descrizione: "Pannello in legno con venatura visibile.", render: "bed with a natural oak headboard, at the existing footprint and height" },
  { id: "lino_trapuntato", nome: "Testiera imbottita e lino trapuntato", descrizione: "Testiera a fasce, cuscini separati e copriletto con pieghe.", render: "the modeled bed with channel upholstery, separate pillows and draped linen bedding" },
  { id: "cassettoni", nome: "Letto con cassettoni", descrizione: "Cassettoni su entrambi i lati, testiera a fasce e copriletto in lino.", render: "the modeled storage bed with side pull-out drawers, upholstered headboard and draped linen bedding" },
];

const MODELLI: Readonly<Record<string, readonly ModelloArredo[]>> = {
  cucina: CUCINE,
  cucina_angolare: CUCINE,
  isola_cucina: [
    { id: "travertino_rovere", nome: "Isola in travertino e rovere", descrizione: "Spalle in pietra, frontali in rovere e sgabelli imbottiti.", render: "the modeled travertine waterfall sides, oak fronts and upholstered oak stools with their original spacing and dimensions" },
  ],
  letto: LETTI,
  letto_singolo: LETTI,
  letto_matrimoniale: LETTI,
  auto: [
    { id: "highland", nome: "Tesla Model 3 Highland", descrizione: "4,72 m di lunghezza, 2,09 m tra i retrovisori e 1,44 m di altezza.",
      render: "the modeled 2024 Tesla Model 3 Highland, with the same wheelbase, placement and orientation as the 3D reference",
      misure: MISURE_MODEL_3_HIGHLAND },
    { id: "compatta", nome: "Compatta", descrizione: "Utilitaria di 4 m con portellone, cerchi e fanali dettagliati.",
      render: "compact hatchback placed and sized exactly as shown in the 3D reference", misure: { larghezza: 190, profondita: 400, altezza: 144 } },
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
    { id: "sospeso_soft", nome: "WC sospeso · ceramica satinata", descrizione: "Bordo sottile, sedile separato e placca a parete.", render: "the modeled matte wall-hung compact WC with its thin seat and wall-mounted flush plate" },
  ],
  bidet: [
    { id: "sospeso", nome: "Bidet sospeso", descrizione: "Vasca arrotondata con pavimento libero sotto.", render: "wall-hung ceramic bidet, visible clearance above the floor and a small mixer tap" },
    { id: "filo_muro", nome: "Bidet a terra", descrizione: "Base continua a filo muro.", render: "floor-mounted back-to-wall ceramic bidet with an integrated pedestal" },
    { id: "sospeso_soft", nome: "Bidet sospeso · ceramica satinata", descrizione: "Profilo coordinato al WC e miscelatore in metallo satinato.", render: "the matching matte wall-hung bidet with its sculpted single-lever mixer" },
  ],
  lavabo: [
    { id: "incasso", nome: "Lavabo a incasso", descrizione: "Vasca integrata a filo del piano.", render: "washbasin recessed into the vanity countertop, basin rim flush with the counter surface" },
    { id: "appoggio", nome: "Lavabo da appoggio", descrizione: "Bacinella in ceramica sopra il piano.", render: "rounded ceramic vessel washbasin sitting visibly above the countertop" },
    { id: "sospeso", nome: "Lavabo sospeso", descrizione: "Ceramica a parete con spazio libero sotto.", render: "wall-hung ceramic washbasin without a cabinet or pedestal beneath it" },
    { id: "incasso_rovere", nome: "Lavabo a incasso con mobile in rovere", descrizione: "Top in ceramica, due cassetti in rovere e mobile sospeso.", render: "the integrated ceramic washbasin and the suspended oak vanity below it" },
  ],
  doccia: [
    { id: "walk_in", nome: "Walk-in con cristallo e scarico lineare", descrizione: "Accesso libero a lato del pannello fisso e colonna fissata al muro.", render: "the modeled single-panel walk-in shower, with the original wall-mounted shower pipe and linear drain" },
    { id: "spa", nome: "Doccia spa con seduta", descrizione: "Cristallo fisso, varco laterale, seduta in pietra e luce calda sotto la seduta.", render: "the spacious walk-in shower with a clear entry, one fixed glass panel, a stone bench and wall-mounted brushed fixtures" },
  ],
  albero: [
    { id: "olivo", nome: "Olivo", descrizione: "Tronco ramificato e foglie lanceolate verde argento.", render: "the modeled branching olive tree with its silver-green, narrow leaves" },
  ],
  vasca: [
    { id: "incasso", nome: "Vasca a incasso", descrizione: "Bordo rettangolare, fronte rivestito e vasca interna.", render: "rectangular built-in bathtub with a solid apron and a recessed bathing well" },
    { id: "freestanding", nome: "Vasca freestanding", descrizione: "Profilo ovale autoportante.", render: "freestanding oval bathtub with a continuous curved ceramic shell and open space around it" },
    { id: "spa_freestanding", nome: "Vasca ovale con rubinetto a pavimento", descrizione: "Bordo sottile, troppo pieno e miscelatore completo a pavimento.", render: "the modeled thin-rim oval soaking tub with a floor-mounted mixer and visible overflow" },
  ],
  divano: [
    { id: "morbido", nome: "Divano morbido", descrizione: "Braccioli e cuscini bombati in tessuto.", render: "upholstered sofa with rounded arms, soft separate seat cushions and a low plush silhouette" },
    { id: "modulare", nome: "Divano modulare", descrizione: "Elementi separati, sedute basse e linee pulite.", render: "low upholstered modular sofa made of distinct joined modules with visible seat seams" },
    { id: "lino_base_rovere", nome: "Divano basso in lino e rovere", descrizione: "Sedute imbottite con cuciture, cuscini separati e basamento in rovere.", render: "the original low oak plinth, sculpted linen seat modules with piping and separate loose cushions, within the same modeled footprint" },
    { id: "divano-classico", nome: "Divano classico in pelle", descrizione: "Pelle con cuciture e telaio in legno lavorato. Modello Poly Haven.", render: "the modeled classic tufted leather sofa and carved wooden base" },
    { id: "teak_esterno", nome: "Divano da terrazza in teak", descrizione: "Struttura a doghe e cuscini in tessuto da esterno.", render: "the modeled outdoor slatted teak sofa with thick loose weather-resistant cushions" },
  ],
  divano_angolare: [
    { id: "chaise_lino", nome: "Divano a penisola in lino", descrizione: "Penisola, base bassa in rovere e cuscini chiari.", render: "the modeled L-shaped linen sofa with its existing chaise footprint and low oak plinth" },
  ],
  poltrona: [
    { id: "poltrona-scocca", nome: "Poltrona con scocca in legno", descrizione: "Scocca con venatura e seduta in pelle. Modello Poly Haven.", render: "the modeled timber shell lounge chair with its leather cushion" },
  ],
  sedia: [
    { id: "sedia-pelle", nome: "Sedia da pranzo in pelle", descrizione: "Schienale imbottito e gambe in legno. Modello Poly Haven.", render: "the modeled tufted leather dining chair and wooden legs" },
  ],
  frigorifero: [
    { id: "inox_incassato", nome: "Inox satinato con maniglie a incasso", descrizione: "Due ante, congelatore in basso e maniglie a gola.", render: "the modeled brushed stainless fridge-freezer with recessed handle channels and lower freezer door", misure: { larghezza: 60, profondita: 66, altezza: 203 } },
  ],
  mobile_tv: [
    { id: "sospeso", nome: "Mobile TV sospeso", descrizione: "Mobile con pavimento libero sotto e schermo.", render: "floating low media cabinet, open floor clearance beneath it, with its source TV screen in place" },
    { id: "a_terra", nome: "Mobile TV a terra", descrizione: "Consolle bassa in legno con piedini e schermo.", render: "low floor-standing media cabinet raised on short feet with its source TV screen in place" },
    { id: "boiserie", nome: "Parete TV in legno", descrizione: "Pannelli verticali, base contenitore e TV.", render: "full-height timber media wall with vertical panel seams, low storage cabinets and inset television", misure: { larghezza: 280, profondita: 42, altezza: 224 } },
    { id: "boiserie_led", nome: "Parete TV con luce indiretta", descrizione: "Pannelli in legno e luce calda lineare sopra il televisore.", render: "timber media wall with a warm linear light over the television, in the dimensions already shown in the 3D reference", misure: { larghezza: 280, profondita: 42, altezza: 224 } },
    { id: "oled_55", nome: "Mobile in rovere e TV da 55″", descrizione: "Frontali a doghe, schermo sottile a parete e vano passacavi.", render: "the modeled 55-inch slim television and slatted oak console, preserving their wall mount and dimensions" },
  ],
  tavolino: [
    { id: "marmo_tondo", nome: "Tavolino tondo in marmo", descrizione: "Piano a disco con bordo levigato e tre sostegni cilindrici.", render: "round marble coffee table with a polished thick edge and three matching cylindrical supports", misure: { larghezza: 92, profondita: 92, altezza: 38 } },
    { id: "tavolino-intarsio", nome: "Tavolino intarsiato", descrizione: "Pietra e inserti in legno. Modello Poly Haven.", render: "the modeled low table with inset stone and wood inlay" },
  ],
  scala: [
    { id: "alzatine_legno", nome: "Gradini in legno e ringhiera", descrizione: "Pedate distinte, struttura aperta e corrimano.", render: "open timber stair treads with slim metal balusters, following the modeled direction, rise and landing" },
  ],
  armadio: [
    { id: "battente", nome: "Ante battenti", descrizione: "Ante distinte con maniglie verticali e zoccolo rientrante.", render: "a wardrobe with separate hinged doors and vertical pulls" },
    { id: "scorrevole", nome: "Ante scorrevoli", descrizione: "Pannelli sovrapposti sui binari, con fasce in rovere.", render: "a sliding-door wardrobe with overlapping panels, graphite rails and oak accents" },
    { id: "rovere_gola", nome: "Ante in rovere con presa a gola", descrizione: "Moduli a tutta altezza in rovere, con prese verticali incassate.", render: "the modeled floor-to-ceiling oak wardrobe with recessed vertical grips" },
    { id: "cannettato", nome: "Armadio con ante cannettate", descrizione: "Doghe verticali in rovere e maniglie basse in metallo scuro.", render: "the modeled slim fluted oak wardrobe with vertical graphite pulls" },
  ],
  libreria: [
    { id: "rovere_libri", nome: "Libreria in rovere con libri e vani chiusi", descrizione: "Ripiani con libri e cassetti nella parte bassa.", render: "the modeled oak shelving with closed storage and books of various sizes" },
  ],
  tenda: [
    { id: "lino_aperta", nome: "Lino raccolto ai lati", descrizione: "Due teli con pieghe verticali lasciano libero il centro.", render: "the modeled ceiling-track linen curtains drawn back to both sides of the opening" },
    { id: "lino_chiusa", nome: "Lino disteso", descrizione: "I due teli schermano anche il centro del serramento.", render: "the modeled drawn linen curtain panels with their exact coverage and floor clearance" },
  ],
  quadro: [
    { id: "terra", nome: "Astratto in terracotta", descrizione: "Forme organiche su fondo avorio con cornice sottile.", render: "the large framed abstract print in ivory and terracotta at its existing position" },
    { id: "salvia", nome: "Geometrico salvia", descrizione: "Composizione verde salvia con inserti chiari.", render: "the framed geometric sage green artwork at its existing size and height" },
  ],
  pianta_vaso: [
    { id: "pianta-haworthia", nome: "Haworthia in vaso di ceramica", descrizione: "Foglie striate e ceramica materica. Modello Poly Haven.", render: "the modeled small haworthia succulent in its weathered ceramic planter" },
  ],
  specchio_parete: [
    { id: "retroilluminato", nome: "Specchio con luce perimetrale", descrizione: "Vetro riflettente con diffusore caldo lungo il bordo.", render: "the modeled bathroom mirror with its illuminated perimeter, preserving the mounting position and the sink" },
  ],
  barbecue: [
    { id: "modulo_inox", nome: "Grill inox con banco in pietra", descrizione: "Coperchio, maniglia, comandi separati e vano a doghe.", render: "the modeled stainless outdoor grill with stone worktop and slatted storage", misure: { larghezza: 170, profondita: 65, altezza: 114 } },
  ],
  pergola: [
    { id: "lamelle_led", nome: "Pergola a lamelle con luce calda", descrizione: "Montanti in alluminio, lamelle in legno e luce integrata nelle travi.", render: "the modeled slender pergola with timber roof louvers and concealed warm lighting" },
  ],
  tavolo: [
    { id: "apparecchiato", nome: "Tavolo apparecchiato", descrizione: "Piano in legno con tessile da tavola e stoviglie.", render: "the dining table with its existing runner and ceramic place settings" },
    { id: "tavolo-massello", nome: "Tavolo in massello", descrizione: "Piano in legno con venature e bordi vissuti. Modello Poly Haven.", render: "the modeled solid hardwood dining table, with its original proportions and visible wood grain" },
  ],
};

export const modelliArredo = (tipo: string): readonly ModelloArredo[] =>
  Object.hasOwn(MODELLI, tipo) ? MODELLI[tipo] : [];

export function modelloArredo(tipo: string, id: string | undefined): ModelloArredo | undefined {
  return id ? modelliArredo(tipo).find(m => m.id === id) : undefined;
}

export function modelloCatalogo3D(tipo: string, id: string | undefined): ModelloCatalogo3D | undefined {
  return id && Object.hasOwn(MODELLI_CATALOGO_3D, id) && modelloArredo(tipo, id) ? id as ModelloCatalogo3D : undefined;
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
