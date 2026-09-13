/**
 * Listini d'esempio, uno per ogni modo in cui le aziende hanno costruito il
 * proprio (area → tipologia → linea → prodotti). Servono ai test di lineeListino e all'anteprima di sviluppo
 * /dev/listino, che mostra la pagina senza login. Nomi e prezzi sono
 * inventati sul modello dei listini veri, non copiati: i disegni sono quelli
 * di piattaforma in /templates/serramenti.
 */
import type { AxisValue, FamilyAxis, FamilyWithAxes } from "@/types/articleFamily";
import type { CategoriaListino, MacroListino } from "./lineeListino";

export interface ListinoEsempio {
  chiave: string;
  nome: string;
  descrizione: string;
  famiglie: FamilyWithAxes[];
  macrocategorie: MacroListino[];
  categorie: CategoriaListino[];
}

const DATA = "2026-09-13T00:00:00Z";

function codice(testo: string): string {
  return testo.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export function valoreEsempio(id: string, label: string, extra: Partial<AxisValue> = {}): AxisValue {
  return {
    id,
    axis_id: "",
    company_id: "esempio",
    valore: codice(label),
    label,
    descrizione: null,
    is_default: false,
    maggiorazione_tipo: "none",
    maggiorazione_valore: 0,
    maggiorazione_acquisto: 0,
    codice: null,
    prezzo_vendita: null,
    prezzo_acquisto: null,
    immagine_url: null,
    sort_order: 0,
    attivo: true,
    created_at: DATA,
    ...extra,
  };
}

export function asseEsempio(
  id: string,
  nome: string,
  valori: AxisValue[],
  extra: Partial<FamilyAxis> = {},
): FamilyAxis & { values: AxisValue[] } {
  return {
    id,
    family_id: "",
    company_id: "esempio",
    nome,
    codice: codice(nome),
    descrizione: null,
    tipo: "discrete",
    obbligatorio: false,
    sort_order: 0,
    created_at: DATA,
    ...extra,
    values: valori.map((v) => ({ ...v, axis_id: id })),
  };
}

export function articoloEsempio(id: string, nome: string, extra: Partial<FamilyWithAxes> = {}): FamilyWithAxes {
  const { axes, ...resto } = extra;
  return {
    id,
    company_id: "esempio",
    vertical: "serramenti",
    macrocategoria_id: null,
    categoria_id: null,
    nome,
    codice: null,
    descrizione: null,
    immagine_url: null,
    pdf_scheda_url: null,
    supplier_id: null,
    modalita_prezzo_base: "pz",
    prezzo_base_mode: "vendita",
    prezzo_base_vendita: 0,
    prezzo_base_acquisto: 0,
    markup_tipo: "none",
    markup_valore: 0,
    sconto_fornitore_1: 0,
    sconto_fornitore_2: 0,
    vat_rate: 22,
    vat_rate_acquisto: 22,
    unit_of_measure: "pz",
    posa_tariffa_default_id: null,
    posa_quantita_default: 0,
    manodopera_modalita: "tariffa",
    manodopera_costo_acquisto: 0,
    manodopera_prezzo_vendita: 0,
    manodopera_unita: "pz",
    griglia_asse_x_label: "Larghezza",
    griglia_asse_y_label: "Altezza",
    griglia_unita: "mm",
    attivo: true,
    mostra_preventivo: true,
    sort_order: 0,
    custom_field_values: {},
    deleted_at: null,
    created_at: DATA,
    updated_at: DATA,
    ...resto,
    axes: (axes ?? []).map((a) => ({ ...a, family_id: id })),
  };
}

const DISEGNI = "/templates/serramenti";

/** Le variabili di ogni tipologia a mq: la linea di profilo, il colore, il vetro. */
function assiSerramento(prefisso: string): FamilyWithAxes["axes"] {
  return [
    asseEsempio(
      `${prefisso}-linea`,
      "Linea",
      [
        valoreEsempio(`${prefisso}-sal`, "PVC Salamander 76", { is_default: true, sort_order: 0 }),
        valoreEsempio(`${prefisso}-alu`, "PVC Aluplast Ideal 5000", {
          maggiorazione_tipo: "percentuale",
          maggiorazione_valore: -8,
          maggiorazione_acquisto: -8,
          sort_order: 1,
        }),
        // Linea tolta: resta per i preventivi vecchi, non si deve vedere.
        valoreEsempio(`${prefisso}-base`, "Linea base", { attivo: false, sort_order: 2 }),
      ],
      { sort_order: -1 },
    ),
    asseEsempio(
      `${prefisso}-colore`,
      "Colore",
      [
        valoreEsempio(`${prefisso}-bianco`, "Bianco RAL 9010", { is_default: true }),
        valoreEsempio(`${prefisso}-antracite`, "Antracite RAL 7016", {
          maggiorazione_tipo: "percentuale",
          maggiorazione_valore: 8,
          maggiorazione_acquisto: 8,
          sort_order: 1,
        }),
      ],
      { sort_order: 0 },
    ),
    asseEsempio(
      `${prefisso}-vetro`,
      "Vetro",
      [
        valoreEsempio(`${prefisso}-standard`, "Vetro standard", { is_default: true }),
        valoreEsempio(`${prefisso}-antisf`, "Vetro antisfondamento", {
          maggiorazione_tipo: "percentuale",
          maggiorazione_valore: 15,
          maggiorazione_acquisto: 15,
          sort_order: 1,
        }),
      ],
      { sort_order: 1 },
    ),
  ];
}

function prodotto(
  id: string,
  nome: string,
  macro: string | null,
  vendita: number,
  acquisto: number,
  extra: Partial<FamilyWithAxes> = {},
): FamilyWithAxes {
  return articoloEsempio(id, nome, {
    macrocategoria_id: macro,
    prezzo_base_vendita: vendita,
    prezzo_base_acquisto: acquisto,
    ...extra,
  });
}

/**
 * Il serramentista come lo descrive il titolare: serramenti in più linee
 * (Salamander e Aluplast sull'asse, il legno come linea a sé), tapparelle e
 * zanzariere divise per linea, cassonetti, persiane ancora da riempire,
 * accessori; più un po' di fotovoltaico nella sua area.
 */
export function serramentistaStandard(): ListinoEsempio {
  const tipologie: Array<[string, string]> = [
    ["Finestra 1 Anta", "finestra-1-anta.png"],
    ["Finestra 2 Ante", "finestra-2-ante.png"],
    ["Finestra 3 Ante", "finestra-3-ante.png"],
    ["Finestra Wasistas", "finestra-wasistas.png"],
    ["Fisso nel Telaio", "fisso-nel-telaio.png"],
    ["Fisso nell'Anta", "fisso-nell-anta.png"],
    ["Porta Finestra 1 Anta", "portafinestra-1-anta.png"],
    ["Porta Finestra 2 Ante", "portafinestra-2-ante.png"],
    ["Porta Finestra 3 Ante", "portafinestra-3-ante.png"],
    ["Portoncino 1 Anta", "portoncino-1-anta.png"],
    ["Portoncino 2 Ante", "portoncino-2-ante.png"],
    ["Alzante Scorrevole AS + FA", "alzante-scorrevole-as-fa.png"],
    ["Alzante Scorrevole a Scomparsa", "alzante-scorrevole-scomparsa.png"],
    ["Slide", "slide.png"],
    ["Smart Slide", "smart-slide.png"],
    ["Porta Finestra Traslante Scorrevole 4 Ante", "traslante-scorrevole-4-ante.png"],
  ];
  const serramenti = tipologie.map(([nome, disegno], i) =>
    prodotto(`serr-${i + 1}`, nome, "m-serr", 520, 160, {
      modalita_prezzo_base: "mq",
      immagine_url: `${DISEGNI}/${disegno}`,
      descrizione: "Prezzo al metro quadro, posa inclusa",
      axes: assiSerramento(`serr-${i + 1}`),
    }),
  );
  const mq = { modalita_prezzo_base: "mq" as const };
  return {
    chiave: "serramentista",
    nome: "Serramentista con le tipologie standard",
    descrizione: "Serramenti in tre linee, tapparelle e zanzariere per linea, cassonetti, accessori e un po' di fotovoltaico",
    famiglie: [
      ...serramenti,
      prodotto("legno-1", "Finestra legno 1 anta", "m-serr", 890, 390, {
        vertical: "serramentista",
        categoria_id: "c-legno",
        immagine_url: `${DISEGNI}/finestra-1-anta.png`,
      }),
      prodotto("legno-2", "Finestra legno 2 ante", "m-serr", 1290, 560, {
        vertical: "serramentista",
        categoria_id: "c-legno",
        immagine_url: `${DISEGNI}/finestra-2-ante.png`,
      }),
      prodotto("legno-3", "Porta finestra legno 2 ante", "m-serr", 1680, 730, {
        vertical: "serramentista",
        categoria_id: "c-legno",
        immagine_url: `${DISEGNI}/portafinestra-2-ante.png`,
      }),
      prodotto("serr-griglia", "Porta d'ingresso a 2 ante", "m-serr", 0, 0, {
        modalita_prezzo_base: "griglia",
        mostra_preventivo: false,
      }),
      prodotto("tapp-pvc-1", "Tapparella PVC pesante", "m-tapp", 48, 19, {
        ...mq,
        categoria_id: "c-tapp-pvc",
        immagine_url: `${DISEGNI}/products/tapparella-pvc.svg`,
      }),
      prodotto("tapp-pvc-2", "Tapparella PVC antigrandine", "m-tapp", 62, 25, {
        ...mq,
        categoria_id: "c-tapp-pvc",
        immagine_url: `${DISEGNI}/products/tapparella-pvc.svg`,
      }),
      prodotto("tapp-all-1", "Tapparella alluminio coibentata", "m-tapp", 89, 38, {
        ...mq,
        categoria_id: "c-tapp-all",
        immagine_url: `${DISEGNI}/products/tapparella-alluminio.svg`,
      }),
      prodotto("tapp-all-2", "Tapparella alluminio motorizzata", "m-tapp", 145, 66, {
        ...mq,
        categoria_id: "c-tapp-all",
        immagine_url: `${DISEGNI}/products/tapparella-alluminio.svg`,
      }),
      prodotto("zanz-1", "Zanzariera verticale a molla", "m-zanz", 85, 34, {
        ...mq,
        categoria_id: "c-zanz-molla",
        immagine_url: `${DISEGNI}/products/zanzariera-molla-classica.svg`,
      }),
      prodotto("zanz-2", "Zanzariera laterale a molla", "m-zanz", 110, 46, {
        ...mq,
        categoria_id: "c-zanz-molla",
        immagine_url: `${DISEGNI}/products/zanzariera-laterale.svg`,
      }),
      // Una linea vera con un solo prodotto: non è una categoria nata con l'articolo.
      prodotto("zanz-3", "Zanzariera plissé", "m-zanz", 140, 62, {
        ...mq,
        categoria_id: "c-zanz-plisse",
        immagine_url: `${DISEGNI}/products/zanzariera-laterale.svg`,
        mostra_preventivo: false,
      }),
      prodotto("cass-1", "Cassonetto termoisolato PVC", "m-cass", 95, 38, {
        immagine_url: `${DISEGNI}/products/cassonetto-pvc-isolato.svg`,
      }),
      prodotto("cass-2", "Cassonetto effetto legno", "m-cass", 120, 52, {
        immagine_url: `${DISEGNI}/products/cassonetto-effetto-legno.svg`,
      }),
      prodotto("acc-motore", "Motore tubolare per tapparella", "m-acc", 180, 85),
      prodotto("acc-radio", "Comando radio 1 canale", "m-acc", 65, 28, {
        manodopera_modalita: null as unknown as FamilyWithAxes["manodopera_modalita"],
      }),
      // Senza tipologia: si trova solo con la ricerca.
      prodotto("inferriata", "Inferriata su misura", null, 210, 95, { ...mq, vertical: "serramentista" }),
      prodotto("fv-mod-1", "Modulo 440 Wp", "m-mod", 160, 96, { vertical: "fotovoltaico" }),
      prodotto("fv-mod-2", "Modulo 500 Wp bifacciale", "m-mod", 0, 118, { vertical: "fotovoltaico" }),
      prodotto("fv-inv-1", "Inverter ibrido monofase 5 kW", "m-inv", 1450, 820, { vertical: "fotovoltaico" }),
      // Marcato «generico» ma dentro gli inverter: deve restarci.
      prodotto("fv-inv-2", "Inverter trifase 10 kW", "m-inv", 1890, 1110, { vertical: "generico" }),
      prodotto("fv-bat-1", "Batteria LFP 5 kWh", "m-acm", 2100, 1280, { vertical: "fotovoltaico" }),
      prodotto("fv-wallbox", "Wallbox 7 kW", null, 690, 420, { vertical: "fotovoltaico", attivo: false }),
    ],
    macrocategorie: [
      { id: "m-serr", nome: "Serramenti", sort_order: 0, verticali_abilitati: ["serramentista"], tipologia: "serramenti" },
      { id: "m-tapp", nome: "Tapparelle", sort_order: 1, verticali_abilitati: ["serramentista"] },
      { id: "m-zanz", nome: "Zanzariere", sort_order: 2, verticali_abilitati: ["serramentista"] },
      { id: "m-cass", nome: "Cassonetti", sort_order: 3, verticali_abilitati: ["serramentista"] },
      { id: "m-pers", nome: "Persiane e scuri", sort_order: 4, verticali_abilitati: ["serramentista"] },
      { id: "m-acc", nome: "Accessori", sort_order: 5, verticali_abilitati: ["serramentista"], categoria_tipo: "accessorio" },
      { id: "m-mod", nome: "Moduli fotovoltaici", sort_order: 10, verticali_abilitati: ["fotovoltaico"], fv_categoria: "pannello" },
      { id: "m-inv", nome: "Inverter", sort_order: 11, verticali_abilitati: ["fotovoltaico"], fv_categoria: "inverter" },
      { id: "m-acm", nome: "Sistemi di accumulo", sort_order: 12, verticali_abilitati: ["fotovoltaico"], fv_categoria: "accumulo" },
    ],
    categorie: [
      { id: "c-legno", nome: "Legno Rovere 68", macrocategoria_id: "m-serr", sort_order: 0 },
      { id: "c-tapp-pvc", nome: "PVC", macrocategoria_id: "m-tapp", sort_order: 0 },
      { id: "c-tapp-all", nome: "Alluminio coibentato", macrocategoria_id: "m-tapp", sort_order: 1 },
      { id: "c-zanz-molla", nome: "A molla", macrocategoria_id: "m-zanz", sort_order: 0 },
      { id: "c-zanz-plisse", nome: "Plissé", macrocategoria_id: "m-zanz", sort_order: 1 },
    ],
  };
}

/**
 * Le linee messe al posto delle tipologie (come Best Infissi: Epiq, 4Stars…):
 * macrocategorie senza etichetta d'area, con dentro categorie vere (Finestre,
 * Porte-finestra) e una nata con l'articolo, che non deve diventare linea.
 */
export function lineeComeMacrocategorie(): ListinoEsempio {
  const serr = { vertical: "serramentista" };
  return {
    chiave: "macrocategorie",
    nome: "Linee come macrocategorie",
    descrizione: "Ogni linea è una macrocategoria con i suoi modelli; le tipologie standard mancano",
    famiglie: [
      prodotto("cl-f1", "Finestra 1 anta", "m-classica", 420, 190, { ...serr, categoria_id: "c-cl-fin", immagine_url: `${DISEGNI}/finestra-1-anta.png` }),
      prodotto("cl-f2", "Finestra 2 ante", "m-classica", 610, 275, { ...serr, categoria_id: "c-cl-fin", immagine_url: `${DISEGNI}/finestra-2-ante.png` }),
      prodotto("cl-pf1", "Porta finestra 1 anta", "m-classica", 560, 250, { ...serr, categoria_id: "c-cl-pf", immagine_url: `${DISEGNI}/portafinestra-1-anta.png` }),
      prodotto("cl-pf2", "Porta finestra 2 ante", "m-classica", 790, 355, { ...serr, categoria_id: "c-cl-pf", immagine_url: `${DISEGNI}/portafinestra-2-ante.png` }),
      prodotto("cl-alz", "Alzante scorrevole", "m-classica", 2350, 1060, { ...serr, categoria_id: "c-cl-alz", immagine_url: `${DISEGNI}/alzante-scorrevole-as-fa.png` }),
      prodotto("de-f1", "Finestra 1 anta", "m-design", 525, 236, { ...serr, immagine_url: `${DISEGNI}/finestra-1-anta.png` }),
      prodotto("de-f2", "Finestra 2 ante", "m-design", 760, 342, { ...serr, immagine_url: `${DISEGNI}/finestra-2-ante.png` }),
      prodotto("zanz-molla", "Zanzariera a molla", "m-zanz", 85, 34, { modalita_prezzo_base: "mq", immagine_url: `${DISEGNI}/products/zanzariera-molla-classica.svg` }),
      prodotto("zanz-lat", "Zanzariera laterale", "m-zanz", 110, 46, { modalita_prezzo_base: "mq", immagine_url: `${DISEGNI}/products/zanzariera-laterale.svg` }),
      prodotto("tapp-pvc", "Tapparella PVC", "m-tapp-pvc", 48, 19, { modalita_prezzo_base: "mq", categoria_id: "c-tapp-pvc", immagine_url: `${DISEGNI}/products/tapparella-pvc.svg` }),
    ],
    macrocategorie: [
      { id: "m-classica", nome: "Linea Classica", sort_order: 0, verticali_abilitati: [] },
      { id: "m-design", nome: "Linea Design", sort_order: 1, verticali_abilitati: [] },
      { id: "m-zanz", nome: "Zanzariere", sort_order: 3, verticali_abilitati: [] },
      { id: "m-tapp-pvc", nome: "Tapparelle PVC", sort_order: 4, verticali_abilitati: [] },
    ],
    categorie: [
      { id: "c-cl-fin", nome: "Finestre", macrocategoria_id: "m-classica", sort_order: 0 },
      { id: "c-cl-pf", nome: "Porte-finestra", macrocategoria_id: "m-classica", sort_order: 1 },
      { id: "c-cl-alz", nome: "Alzante scorrevole", macrocategoria_id: "m-classica", sort_order: 2 },
      { id: "c-tapp-pvc", nome: "Tapparelle PVC", macrocategoria_id: "m-tapp-pvc", sort_order: 0 },
    ],
  };
}

/** Categorie create in automatico, una per articolo col suo nome (come Ser Style e Ke Bei). */
export function categorieDaUnArticolo(): ListinoEsempio {
  const serr = { vertical: "serramentista" };
  return {
    chiave: "una-per-articolo",
    nome: "Categorie da un articolo",
    descrizione: "Ogni articolo nella sua categoria omonima: niente linee",
    famiglie: [
      prodotto("club-1", "Finestra persiana 1 anta", "m-club", 310, 140, { ...serr, categoria_id: "c-club-1" }),
      prodotto("club-2", "Finestra persiana 2 ante", "m-club", 460, 207, { ...serr, categoria_id: "c-club-2" }),
      prodotto("club-3", "Porta persiana 1 anta", "m-club", 520, 234, serr),
    ],
    macrocategorie: [{ id: "m-club", nome: "Club", sort_order: 0, verticali_abilitati: [] }],
    categorie: [
      { id: "c-club-1", nome: "finestra persiana 1 anta", macrocategoria_id: "m-club", sort_order: 0 },
      { id: "c-club-2", nome: "finestra persiana 2 ante", macrocategoria_id: "m-club", sort_order: 1 },
      // Vuota, col nome di un articolo che c'è: anche questa è un resto.
      { id: "c-club-3", nome: "Porta persiana 1 anta", macrocategoria_id: "m-club", sort_order: 2 },
    ],
  };
}

/** L'esempio del titolare: vasche divise in linee, ognuna coi suoi modelli. */
export function bagni(): ListinoEsempio {
  const bagno = { vertical: "bagno" };
  return {
    chiave: "bagni",
    nome: "Bagni per linee",
    descrizione: "Vasche in due linee, box doccia e rubinetteria",
    famiglie: [
      prodotto("v1-ovale", "Vasca ovale 170×75", "m-vasche", 890, 410, { ...bagno, categoria_id: "c-vasca1" }),
      prodotto("v1-quadrata", "Vasca quadrata 140×140", "m-vasche", 960, 450, { ...bagno, categoria_id: "c-vasca1" }),
      prodotto("v2-ovale", "Vasca ovale freestanding", "m-vasche", 1650, 820, { ...bagno, categoria_id: "c-vasca2" }),
      prodotto("v2-rettangolare", "Vasca rettangolare da incasso", "m-vasche", 740, 330, { ...bagno, categoria_id: "c-vasca2" }),
      prodotto("box-80", "Box doccia 80×80 cristallo", "m-box", 520, 240, bagno),
      prodotto("box-100", "Box doccia 100×80 scorrevole", "m-box", 690, 318, bagno),
      prodotto("rub-termostatico", "Miscelatore termostatico", "m-rubinetti", 280, 120, { ...bagno, mostra_preventivo: false }),
    ],
    macrocategorie: [
      { id: "m-vasche", nome: "Vasche", sort_order: 0, verticali_abilitati: ["bagno"] },
      { id: "m-box", nome: "Box doccia", sort_order: 1, verticali_abilitati: ["bagno"] },
      { id: "m-rubinetti", nome: "Rubinetteria", sort_order: 2, verticali_abilitati: ["bagno"] },
    ],
    categorie: [
      { id: "c-vasca1", nome: "Linea vasca Tipo 1", macrocategoria_id: "m-vasche", sort_order: 0 },
      { id: "c-vasca2", nome: "Linea vasca Tipo 2", macrocategoria_id: "m-vasche", sort_order: 1 },
    ],
  };
}

/** Fotovoltaico per componente (come Suntech e Green Energy), con orfani e una macrocategoria vuota di prova. */
export function fotovoltaicoPerComponente(): ListinoEsempio {
  const fv = { vertical: "fotovoltaico" };
  return {
    chiave: "fotovoltaico",
    nome: "Fotovoltaico per componente",
    descrizione: "Inverter, accumulo, moduli e caldaie; un inverter marcato generico; articoli senza tipologia",
    famiglie: [
      prodotto("inv-3", "Inverter monofase 3 kW", "m-inverter", 980, 560, fv),
      prodotto("inv-6", "Inverter monofase 6 kW", "m-inverter", 1290, 740, fv),
      prodotto("inv-10", "Inverter trifase 10 kW", "m-inverter", 1890, 1110, { vertical: "generico" }),
      prodotto("acc-5", "Batteria 5 kWh", "m-accumulo", 2100, 1280, fv),
      prodotto("acc-10", "Batteria 10 kWh", "m-accumulo", 3900, 2410, fv),
      prodotto("mod-440", "Modulo 440 Wp", "m-moduli", 160, 96, fv),
      prodotto("cal-24", "Caldaia a condensazione 24 kW", "m-caldaie", 1850, 1020, fv),
      prodotto("cavo", "Cavo solare 6 mm²", null, 2, 1, fv),
      prodotto("quadro", "Quadro di campo", null, 240, 130, fv),
      prodotto("staffa", "Staffa per tetto a falda", null, 18, 8, fv),
    ],
    macrocategorie: [
      { id: "m-inverter", nome: "Inverter", sort_order: 0, verticali_abilitati: [], tipologia: "fotovoltaico", fv_categoria: "inverter" },
      { id: "m-accumulo", nome: "Sistemi di accumulo", sort_order: 1, verticali_abilitati: [], tipologia: "fotovoltaico", fv_categoria: "accumulo" },
      { id: "m-moduli", nome: "Moduli fotovoltaici", sort_order: 2, verticali_abilitati: [], tipologia: "fotovoltaico", fv_categoria: "pannello" },
      { id: "m-caldaie", nome: "Caldaie", sort_order: 3, verticali_abilitati: [] },
      { id: "m-prova", nome: "Finestre", sort_order: 900, verticali_abilitati: [] },
    ],
    categorie: [],
  };
}

/** Nessuna macrocategoria: le categorie fanno da tipologie (come Infissi e Living). */
export function categorieSenzaMacrocategoria(): ListinoEsempio {
  const serr = { vertical: "serramentista" };
  return {
    chiave: "categorie",
    nome: "Solo categorie",
    descrizione: "Nessuna macrocategoria: finestre, persiane e zanzariere sono categorie",
    famiglie: [
      prodotto("c-fin-1", "Finestra PVC 1 anta", null, 380, 170, { ...serr, categoria_id: "c-finestre" }),
      prodotto("c-fin-2", "Finestra PVC 2 ante", null, 560, 250, { ...serr, categoria_id: "c-finestre" }),
      prodotto("c-pers-1", "Persiana alluminio 2 ante", null, 640, 300, { ...serr, categoria_id: "c-persiane" }),
      prodotto("c-pers-2", "Persiana scorrevole", null, 890, 410, { ...serr, categoria_id: "c-persiane" }),
      prodotto("c-zanz", "Zanzariera plissé", null, 150, 60, { ...serr, categoria_id: "c-zanzariere" }),
    ],
    macrocategorie: [],
    categorie: [
      { id: "c-finestre", nome: "Finestre", macrocategoria_id: null, sort_order: 0 },
      { id: "c-persiane", nome: "Persiane", macrocategoria_id: null, sort_order: 1 },
      { id: "c-zanzariere", nome: "Zanzariere", macrocategoria_id: null, sort_order: 2 },
    ],
  };
}

/** Tre linee sull'asse in una tipologia etichettata «serramenti» invece di «serramentista» (come Demo 2). */
export function lineeSullAsse(): ListinoEsempio {
  const linea = (prefisso: string, valori: AxisValue[]) => [asseEsempio(`${prefisso}-linea`, "Linea", valori, { sort_order: -1 })];
  return {
    chiave: "asse",
    nome: "Linee sull'asse",
    descrizione: "Salamander, Rehau +18% e alluminio +35% sulle stesse tipologie",
    famiglie: [
      prodotto("dg-1", "Finestra 1 anta", "m-standard", 500, 150, {
        modalita_prezzo_base: "mq",
        immagine_url: `${DISEGNI}/finestra-1-anta.png`,
        axes: linea("dg-1", [
          valoreEsempio("dg-1-sal", "PVC Salamander 76", { is_default: true, sort_order: 0 }),
          valoreEsempio("dg-1-all", "Alluminio a taglio termico", {
            maggiorazione_tipo: "percentuale",
            maggiorazione_valore: 35,
            maggiorazione_acquisto: 35,
            sort_order: 2,
          }),
          valoreEsempio("dg-1-reh", "Rehau Synego", {
            maggiorazione_tipo: "percentuale",
            maggiorazione_valore: 18,
            maggiorazione_acquisto: 18,
            sort_order: 3,
          }),
          valoreEsempio("dg-1-base", "Linea base", { attivo: false, sort_order: 0 }),
        ]),
      }),
      prodotto("dg-2", "Finestra 2 ante", "m-standard", 500, 150, {
        modalita_prezzo_base: "mq",
        immagine_url: `${DISEGNI}/finestra-2-ante.png`,
        axes: linea("dg-2", [
          valoreEsempio("dg-2-reh", "Rehau Synego", {
            is_default: true,
            maggiorazione_tipo: "percentuale",
            maggiorazione_valore: 18,
            maggiorazione_acquisto: 18,
            sort_order: 0,
          }),
        ]),
      }),
      prodotto("dg-3", "Cassonetto", "m-standard", 90, 40),
    ],
    macrocategorie: [
      { id: "m-standard", nome: "SERRAMENTI STANDARD", sort_order: 10, verticali_abilitati: ["serramenti"], tipologia: "serramenti" },
      { id: "m-acc", nome: "Accessori Serramenti", sort_order: 0, verticali_abilitati: ["serramentista"] },
    ],
    categorie: [],
  };
}

export const ESEMPI_LISTINO: Array<() => ListinoEsempio> = [
  serramentistaStandard,
  lineeComeMacrocategorie,
  bagni,
  fotovoltaicoPerComponente,
  categorieSenzaMacrocategoria,
  categorieDaUnArticolo,
  lineeSullAsse,
];
