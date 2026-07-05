/**
 * baseArticleTemplates — Libreria "Base Edilizia": articoli NEUTRI, senza
 * fornitore, che qualsiasi azienda può importare nel proprio listino come
 * punto di partenza (poi personalizza nomi/prezzi/varianti).
 *
 * Differenza da wndArticleTemplates.ts (che è la libreria di UN fornitore,
 * WnD, solo serramenti): qui i prodotti sono generici e cross-mestiere.
 *
 * Categorie PILOTA (fase 1): Piastrelle (pavimenti/rivestimenti, prezzo al mq)
 * e Porte (interne + ingresso, prezzo a pezzo). Ampliabile con le altre
 * macro-categorie (sanitari, elettrico, idraulica, pitture, cappotto, …).
 *
 * I prezzi_base sono INDICATIVI (mercato IT medio, IVA ordinaria 22%): servono
 * solo come default; ogni azienda li ritocca. Le maggiorazioni delle varianti
 * sono coerenti col tipo prezzo (fisso_mq per il mq, fisso_pz per il pezzo).
 *
 * La forma degli oggetti rispecchia le colonne di `article_family_templates`
 * (vedi migrazione 20270513130000): l'import in AdminArticleTemplates li
 * inserisce così come sono, taggati "Base" + categoria.
 */

export interface BaseAxisValue {
  valore: string;
  label: string;
  is_default?: boolean;
  maggiorazione_tipo?:
    | "none"
    | "percentuale"
    | "fisso_pz"
    | "fisso_mq"
    | "fisso_ml"
    | "fisso_mc";
  maggiorazione_valore?: number;
  sort_order?: number;
}

export interface BaseAxis {
  nome: string;
  codice: string;
  descrizione?: string;
  tipo?: "discrete" | "boolean";
  obbligatorio?: boolean;
  sort_order?: number;
  values: BaseAxisValue[];
}

export interface BaseArticleTemplateSeed {
  nome: string;
  descrizione: string;
  vertical_slug: string;
  categoria_slug: string;
  tipologia: string | null;
  materiale: string | null;
  tags: string[];
  modalita_prezzo_base: "pz" | "mq" | "griglia" | "misura_libera";
  prezzo_base_vendita: number;
  vat_rate: number;
  unit_of_measure: string;
  griglia_asse_x_label: string | null;
  griglia_asse_y_label: string | null;
  griglia_unita: string | null;
  griglia_default: null;
  assi_default: BaseAxis[];
  image_url: string | null;
  is_active: boolean;
  sort_order: number;
}

/** Helper: default comune per articoli a mq o a pezzo (niente griglia L×H). */
const noGrid = {
  griglia_asse_x_label: null,
  griglia_asse_y_label: null,
  griglia_unita: null,
  griglia_default: null as null,
  image_url: null,
  is_active: true,
} as const;

// ════════════════════════════════════════════════════════════════════════════
// PIASTRELLE & RIVESTIMENTI — prezzo al m²  (vertical: pavimenti)
// ════════════════════════════════════════════════════════════════════════════
export const BASE_PIASTRELLE_TEMPLATES: BaseArticleTemplateSeed[] = [
  {
    ...noGrid,
    nome: "Gres porcellanato effetto legno",
    descrizione:
      "Pavimento in gres porcellanato effetto legno, adatto a interni; versione strutturata antiscivolo per esterni.",
    vertical_slug: "pavimenti",
    categoria_slug: "piastrelle",
    tipologia: "gres_effetto_legno",
    materiale: "gres_porcellanato",
    tags: ["Base", "Piastrelle", "effetto-legno"],
    modalita_prezzo_base: "mq",
    prezzo_base_vendita: 26,
    vat_rate: 22,
    unit_of_measure: "mq",
    sort_order: 10,
    assi_default: [
      {
        nome: "Formato",
        codice: "formato",
        tipo: "discrete",
        obbligatorio: true,
        sort_order: 0,
        values: [
          { valore: "20x120", label: "20×120 cm", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "20x90", label: "20×90 cm", maggiorazione_tipo: "fisso_mq", maggiorazione_valore: -2 },
          { valore: "15x90", label: "15×90 cm", maggiorazione_tipo: "fisso_mq", maggiorazione_valore: -3 },
        ],
      },
      {
        nome: "Tonalità",
        codice: "tonalita",
        tipo: "discrete",
        obbligatorio: true,
        sort_order: 1,
        values: [
          { valore: "rovere_naturale", label: "Rovere naturale", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "noce", label: "Noce", maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "sbiancato", label: "Sbiancato", maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "grigio", label: "Grigio", maggiorazione_tipo: "none", maggiorazione_valore: 0 },
        ],
      },
      {
        nome: "Finitura",
        codice: "finitura",
        tipo: "discrete",
        obbligatorio: true,
        sort_order: 2,
        values: [
          { valore: "naturale", label: "Naturale (interni)", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "strutturata_r11", label: "Strutturata R11 (esterni)", maggiorazione_tipo: "fisso_mq", maggiorazione_valore: 3 },
        ],
      },
    ],
  },
  {
    ...noGrid,
    nome: "Gres porcellanato effetto marmo",
    descrizione: "Gres effetto marmo lucido/lappato per pavimenti e rivestimenti eleganti.",
    vertical_slug: "pavimenti",
    categoria_slug: "piastrelle",
    tipologia: "gres_effetto_marmo",
    materiale: "gres_porcellanato",
    tags: ["Base", "Piastrelle", "effetto-marmo"],
    modalita_prezzo_base: "mq",
    prezzo_base_vendita: 32,
    vat_rate: 22,
    unit_of_measure: "mq",
    sort_order: 20,
    assi_default: [
      {
        nome: "Formato",
        codice: "formato",
        tipo: "discrete",
        obbligatorio: true,
        sort_order: 0,
        values: [
          { valore: "60x60", label: "60×60 cm", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "60x120", label: "60×120 cm", maggiorazione_tipo: "fisso_mq", maggiorazione_valore: 6 },
          { valore: "80x80", label: "80×80 cm", maggiorazione_tipo: "fisso_mq", maggiorazione_valore: 8 },
        ],
      },
      {
        nome: "Venatura",
        codice: "venatura",
        tipo: "discrete",
        obbligatorio: true,
        sort_order: 1,
        values: [
          { valore: "calacatta", label: "Calacatta", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "statuario", label: "Statuario", maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "marquina", label: "Nero Marquina", maggiorazione_tipo: "fisso_mq", maggiorazione_valore: 2 },
        ],
      },
      {
        nome: "Finitura",
        codice: "finitura",
        tipo: "discrete",
        obbligatorio: true,
        sort_order: 2,
        values: [
          { valore: "matt", label: "Matt", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "lappato", label: "Lappato", maggiorazione_tipo: "fisso_mq", maggiorazione_valore: 5 },
          { valore: "lucido", label: "Lucido", maggiorazione_tipo: "fisso_mq", maggiorazione_valore: 7 },
        ],
      },
    ],
  },
  {
    ...noGrid,
    nome: "Gres porcellanato effetto pietra",
    descrizione: "Gres effetto pietra naturale per interni ed esterni, ottima resa antiscivolo.",
    vertical_slug: "pavimenti",
    categoria_slug: "piastrelle",
    tipologia: "gres_effetto_pietra",
    materiale: "gres_porcellanato",
    tags: ["Base", "Piastrelle", "effetto-pietra"],
    modalita_prezzo_base: "mq",
    prezzo_base_vendita: 28,
    vat_rate: 22,
    unit_of_measure: "mq",
    sort_order: 30,
    assi_default: [
      {
        nome: "Formato",
        codice: "formato",
        tipo: "discrete",
        obbligatorio: true,
        sort_order: 0,
        values: [
          { valore: "60x60", label: "60×60 cm", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "60x120", label: "60×120 cm", maggiorazione_tipo: "fisso_mq", maggiorazione_valore: 6 },
        ],
      },
      {
        nome: "Colore",
        codice: "colore",
        tipo: "discrete",
        obbligatorio: true,
        sort_order: 1,
        values: [
          { valore: "grigio", label: "Grigio", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "beige", label: "Beige", maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "antracite", label: "Antracite", maggiorazione_tipo: "none", maggiorazione_valore: 0 },
        ],
      },
      {
        nome: "Finitura",
        codice: "finitura",
        tipo: "discrete",
        obbligatorio: true,
        sort_order: 2,
        values: [
          { valore: "naturale", label: "Naturale (interni)", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "strutturata_r11", label: "Strutturata R11 (esterni)", maggiorazione_tipo: "fisso_mq", maggiorazione_valore: 3 },
        ],
      },
    ],
  },
  {
    ...noGrid,
    nome: "Gres porcellanato effetto cemento/resina",
    descrizione: "Gres effetto cemento/resina, look contemporaneo per ambienti moderni.",
    vertical_slug: "pavimenti",
    categoria_slug: "piastrelle",
    tipologia: "gres_effetto_cemento",
    materiale: "gres_porcellanato",
    tags: ["Base", "Piastrelle", "effetto-cemento"],
    modalita_prezzo_base: "mq",
    prezzo_base_vendita: 27,
    vat_rate: 22,
    unit_of_measure: "mq",
    sort_order: 40,
    assi_default: [
      {
        nome: "Formato",
        codice: "formato",
        tipo: "discrete",
        obbligatorio: true,
        sort_order: 0,
        values: [
          { valore: "60x60", label: "60×60 cm", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "80x80", label: "80×80 cm", maggiorazione_tipo: "fisso_mq", maggiorazione_valore: 5 },
          { valore: "60x120", label: "60×120 cm", maggiorazione_tipo: "fisso_mq", maggiorazione_valore: 6 },
        ],
      },
      {
        nome: "Colore",
        codice: "colore",
        tipo: "discrete",
        obbligatorio: true,
        sort_order: 1,
        values: [
          { valore: "grigio_chiaro", label: "Grigio chiaro", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "grigio_scuro", label: "Grigio scuro", maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "tortora", label: "Tortora", maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "sabbia", label: "Sabbia", maggiorazione_tipo: "none", maggiorazione_valore: 0 },
        ],
      },
    ],
  },
  {
    ...noGrid,
    nome: "Rivestimento monoporosa da parete",
    descrizione: "Piastrella in monoporosa (pasta bianca) per rivestimenti interni di bagno e cucina.",
    vertical_slug: "pavimenti",
    categoria_slug: "rivestimenti",
    tipologia: "monoporosa",
    materiale: "ceramica",
    tags: ["Base", "Piastrelle", "rivestimento", "parete"],
    modalita_prezzo_base: "mq",
    prezzo_base_vendita: 18,
    vat_rate: 22,
    unit_of_measure: "mq",
    sort_order: 50,
    assi_default: [
      {
        nome: "Formato",
        codice: "formato",
        tipo: "discrete",
        obbligatorio: true,
        sort_order: 0,
        values: [
          { valore: "20x50", label: "20×50 cm", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "25x75", label: "25×75 cm", maggiorazione_tipo: "fisso_mq", maggiorazione_valore: 3 },
          { valore: "30x60", label: "30×60 cm", maggiorazione_tipo: "fisso_mq", maggiorazione_valore: 2 },
        ],
      },
      {
        nome: "Colore",
        codice: "colore",
        tipo: "discrete",
        obbligatorio: true,
        sort_order: 1,
        values: [
          { valore: "bianco", label: "Bianco", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "grigio", label: "Grigio", maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "salvia", label: "Verde salvia", maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "greige", label: "Greige", maggiorazione_tipo: "none", maggiorazione_valore: 0 },
        ],
      },
      {
        nome: "Finitura",
        codice: "finitura",
        tipo: "discrete",
        obbligatorio: true,
        sort_order: 2,
        values: [
          { valore: "opaco", label: "Opaco", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "lucido", label: "Lucido", maggiorazione_tipo: "fisso_mq", maggiorazione_valore: 2 },
        ],
      },
    ],
  },
  {
    ...noGrid,
    nome: "Mosaico su rete",
    descrizione: "Mosaico su rete (30×30 cm) in gres o vetro, per fasce decorative, docce e piscine.",
    vertical_slug: "pavimenti",
    categoria_slug: "rivestimenti",
    tipologia: "mosaico",
    materiale: "misto",
    tags: ["Base", "Piastrelle", "mosaico", "decoro"],
    modalita_prezzo_base: "mq",
    prezzo_base_vendita: 42,
    vat_rate: 22,
    unit_of_measure: "mq",
    sort_order: 60,
    assi_default: [
      {
        nome: "Materiale",
        codice: "materiale",
        tipo: "discrete",
        obbligatorio: true,
        sort_order: 0,
        values: [
          { valore: "vetro", label: "Vetro", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "gres", label: "Gres", maggiorazione_tipo: "fisso_mq", maggiorazione_valore: -4 },
          { valore: "pietra", label: "Pietra naturale", maggiorazione_tipo: "fisso_mq", maggiorazione_valore: 10 },
        ],
      },
      {
        nome: "Colore",
        codice: "colore",
        tipo: "discrete",
        obbligatorio: true,
        sort_order: 1,
        values: [
          { valore: "bianco_grigio", label: "Bianco/Grigio", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "mix_blu", label: "Mix blu", maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "oro_beige", label: "Oro/Beige", maggiorazione_tipo: "fisso_mq", maggiorazione_valore: 6 },
        ],
      },
    ],
  },
  {
    ...noGrid,
    nome: "Cementina decorata 20×20",
    descrizione: "Piastrella tipo cementina (20×20 cm) a decoro, per cucine, bagni e dettagli vintage.",
    vertical_slug: "pavimenti",
    categoria_slug: "piastrelle",
    tipologia: "cementina",
    materiale: "gres_porcellanato",
    tags: ["Base", "Piastrelle", "decoro", "cementine"],
    modalita_prezzo_base: "mq",
    prezzo_base_vendita: 38,
    vat_rate: 22,
    unit_of_measure: "mq",
    sort_order: 70,
    assi_default: [
      {
        nome: "Stile",
        codice: "stile",
        tipo: "discrete",
        obbligatorio: true,
        sort_order: 0,
        values: [
          { valore: "geometrico", label: "Geometrico", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "floreale", label: "Floreale", maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "tinta_unita", label: "Tinta unita", maggiorazione_tipo: "fisso_mq", maggiorazione_valore: -6 },
        ],
      },
      {
        nome: "Palette",
        codice: "palette",
        tipo: "discrete",
        obbligatorio: true,
        sort_order: 1,
        values: [
          { valore: "bianco_nero", label: "Bianco/Nero", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "multicolor", label: "Multicolor", maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "terracotta", label: "Terracotta", maggiorazione_tipo: "none", maggiorazione_valore: 0 },
        ],
      },
    ],
  },
  {
    ...noGrid,
    nome: "Klinker per esterni e scale",
    descrizione: "Piastrella in klinker antiscivolo per esterni, scale e bordi piscina; disponibile pezzo gradino.",
    vertical_slug: "pavimenti",
    categoria_slug: "piastrelle",
    tipologia: "klinker",
    materiale: "klinker",
    tags: ["Base", "Piastrelle", "esterni", "klinker"],
    modalita_prezzo_base: "mq",
    prezzo_base_vendita: 24,
    vat_rate: 22,
    unit_of_measure: "mq",
    sort_order: 80,
    assi_default: [
      {
        nome: "Colore",
        codice: "colore",
        tipo: "discrete",
        obbligatorio: true,
        sort_order: 0,
        values: [
          { valore: "rosso", label: "Rosso", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "grigio", label: "Grigio", maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "sabbia", label: "Sabbia", maggiorazione_tipo: "none", maggiorazione_valore: 0 },
        ],
      },
      {
        nome: "Pezzo",
        codice: "pezzo",
        tipo: "discrete",
        obbligatorio: true,
        sort_order: 1,
        values: [
          { valore: "piano", label: "Piastrella piana", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "gradino", label: "Gradino costa retta", maggiorazione_tipo: "fisso_mq", maggiorazione_valore: 14 },
        ],
      },
    ],
  },
  {
    ...noGrid,
    nome: "Gres tecnico grande formato",
    descrizione: "Lastra in gres tecnico grande formato per pavimenti continui e piani; spessore 20mm per esterni.",
    vertical_slug: "pavimenti",
    categoria_slug: "piastrelle",
    tipologia: "gres_grande_formato",
    materiale: "gres_porcellanato",
    tags: ["Base", "Piastrelle", "grande-formato"],
    modalita_prezzo_base: "mq",
    prezzo_base_vendita: 45,
    vat_rate: 22,
    unit_of_measure: "mq",
    sort_order: 90,
    assi_default: [
      {
        nome: "Formato",
        codice: "formato",
        tipo: "discrete",
        obbligatorio: true,
        sort_order: 0,
        values: [
          { valore: "120x120", label: "120×120 cm", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "100x100", label: "100×100 cm", maggiorazione_tipo: "fisso_mq", maggiorazione_valore: -4 },
          { valore: "120x240", label: "120×240 cm", maggiorazione_tipo: "fisso_mq", maggiorazione_valore: 15 },
        ],
      },
      {
        nome: "Spessore",
        codice: "spessore",
        tipo: "discrete",
        obbligatorio: true,
        sort_order: 1,
        values: [
          { valore: "6mm", label: "6 mm (interni)", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "20mm", label: "20 mm (esterni carrabili)", maggiorazione_tipo: "fisso_mq", maggiorazione_valore: 20 },
        ],
      },
    ],
  },
  {
    ...noGrid,
    nome: "Battiscopa in gres abbinato",
    descrizione: "Battiscopa in gres porcellanato coordinato al pavimento; prezzo al metro lineare.",
    vertical_slug: "pavimenti",
    categoria_slug: "accessori_posa",
    tipologia: "battiscopa",
    materiale: "gres_porcellanato",
    tags: ["Base", "Piastrelle", "battiscopa", "accessorio"],
    modalita_prezzo_base: "misura_libera",
    prezzo_base_vendita: 4.5,
    vat_rate: 22,
    unit_of_measure: "ml",
    sort_order: 100,
    assi_default: [
      {
        nome: "Altezza",
        codice: "altezza",
        tipo: "discrete",
        obbligatorio: true,
        sort_order: 0,
        values: [
          { valore: "h7", label: "H 7 cm", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "h10", label: "H 10 cm", maggiorazione_tipo: "fisso_ml", maggiorazione_valore: 1.5 },
        ],
      },
    ],
  },
];

// ════════════════════════════════════════════════════════════════════════════
// PORTE — prezzo a pezzo  (vertical: porte)
// ════════════════════════════════════════════════════════════════════════════
export const BASE_PORTE_TEMPLATES: BaseArticleTemplateSeed[] = [
  {
    ...noGrid,
    nome: "Porta interna battente laccata",
    descrizione: "Porta interna a battente laccata con telaio e coprifili telescopici inclusi.",
    vertical_slug: "porte",
    categoria_slug: "porte_interne",
    tipologia: "battente",
    materiale: "laccato",
    tags: ["Base", "Porte", "interna", "battente"],
    modalita_prezzo_base: "pz",
    prezzo_base_vendita: 190,
    vat_rate: 22,
    unit_of_measure: "pz",
    sort_order: 10,
    assi_default: [
      {
        nome: "Finitura",
        codice: "finitura",
        tipo: "discrete",
        obbligatorio: true,
        sort_order: 0,
        values: [
          { valore: "laccato_bianco", label: "Laccato bianco", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "laccato_colore", label: "Laccato RAL a scelta", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 40 },
          { valore: "rovere", label: "Rovere laminato", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 25 },
          { valore: "noce", label: "Noce", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 30 },
        ],
      },
      {
        nome: "Luce (LxH)",
        codice: "luce",
        tipo: "discrete",
        obbligatorio: true,
        sort_order: 1,
        values: [
          { valore: "60x210", label: "60×210 cm", maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "70x210", label: "70×210 cm", maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "80x210", label: "80×210 cm", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "90x210", label: "90×210 cm", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 15 },
        ],
      },
      {
        nome: "Verso apertura",
        codice: "verso",
        tipo: "discrete",
        obbligatorio: true,
        sort_order: 2,
        values: [
          { valore: "dx", label: "Destra", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "sx", label: "Sinistra", maggiorazione_tipo: "none", maggiorazione_valore: 0 },
        ],
      },
    ],
  },
  {
    ...noGrid,
    nome: "Porta scorrevole esterno muro",
    descrizione: "Porta interna scorrevole a parete (esterno muro) con kit binario a vista incluso.",
    vertical_slug: "porte",
    categoria_slug: "porte_interne",
    tipologia: "scorrevole_esterno_muro",
    materiale: "laccato",
    tags: ["Base", "Porte", "interna", "scorrevole"],
    modalita_prezzo_base: "pz",
    prezzo_base_vendita: 240,
    vat_rate: 22,
    unit_of_measure: "pz",
    sort_order: 20,
    assi_default: [
      {
        nome: "Finitura",
        codice: "finitura",
        tipo: "discrete",
        obbligatorio: true,
        sort_order: 0,
        values: [
          { valore: "laccato_bianco", label: "Laccato bianco", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "rovere", label: "Rovere", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 25 },
          { valore: "noce", label: "Noce", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 30 },
        ],
      },
      {
        nome: "Luce (LxH)",
        codice: "luce",
        tipo: "discrete",
        obbligatorio: true,
        sort_order: 1,
        values: [
          { valore: "70x210", label: "70×210 cm", maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "80x210", label: "80×210 cm", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "90x210", label: "90×210 cm", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 15 },
        ],
      },
    ],
  },
  {
    ...noGrid,
    nome: "Porta scorrevole a scomparsa",
    descrizione: "Porta scorrevole interno muro con controtelaio a scomparsa; ottimizza lo spazio.",
    vertical_slug: "porte",
    categoria_slug: "porte_interne",
    tipologia: "scorrevole_scomparsa",
    materiale: "laccato",
    tags: ["Base", "Porte", "interna", "scomparsa"],
    modalita_prezzo_base: "pz",
    prezzo_base_vendita: 320,
    vat_rate: 22,
    unit_of_measure: "pz",
    sort_order: 30,
    assi_default: [
      {
        nome: "Controtelaio",
        codice: "controtelaio",
        tipo: "discrete",
        obbligatorio: true,
        sort_order: 0,
        values: [
          { valore: "singolo", label: "Anta singola", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "doppio", label: "Doppia anta", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 180 },
        ],
      },
      {
        nome: "Finitura",
        codice: "finitura",
        tipo: "discrete",
        obbligatorio: true,
        sort_order: 1,
        values: [
          { valore: "laccato_bianco", label: "Laccato bianco", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "rovere", label: "Rovere", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 25 },
        ],
      },
    ],
  },
  {
    ...noGrid,
    nome: "Porta a battente in vetro",
    descrizione: "Porta interna a battente con anta in vetro temperato e telaio in alluminio o legno.",
    vertical_slug: "porte",
    categoria_slug: "porte_interne",
    tipologia: "vetro",
    materiale: "vetro",
    tags: ["Base", "Porte", "interna", "vetro"],
    modalita_prezzo_base: "pz",
    prezzo_base_vendita: 350,
    vat_rate: 22,
    unit_of_measure: "pz",
    sort_order: 40,
    assi_default: [
      {
        nome: "Vetro",
        codice: "vetro",
        tipo: "discrete",
        obbligatorio: true,
        sort_order: 0,
        values: [
          { valore: "satinato", label: "Satinato", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "trasparente", label: "Trasparente", maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "fume", label: "Fumé", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 30 },
        ],
      },
      {
        nome: "Telaio",
        codice: "telaio",
        tipo: "discrete",
        obbligatorio: true,
        sort_order: 1,
        values: [
          { valore: "alluminio", label: "Alluminio", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "legno", label: "Legno", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 20 },
        ],
      },
    ],
  },
  {
    ...noGrid,
    nome: "Porta rasomuro (filomuro)",
    descrizione: "Porta a filo muro senza coprifili, allineata alla parete; resa pronta da verniciare.",
    vertical_slug: "porte",
    categoria_slug: "porte_interne",
    tipologia: "rasomuro",
    materiale: "laccato",
    tags: ["Base", "Porte", "interna", "filomuro", "design"],
    modalita_prezzo_base: "pz",
    prezzo_base_vendita: 420,
    vat_rate: 22,
    unit_of_measure: "pz",
    sort_order: 50,
    assi_default: [
      {
        nome: "Apertura",
        codice: "apertura",
        tipo: "discrete",
        obbligatorio: true,
        sort_order: 0,
        values: [
          { valore: "spingere", label: "A spingere", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "tirare", label: "A tirare", maggiorazione_tipo: "none", maggiorazione_valore: 0 },
        ],
      },
      {
        nome: "Finitura",
        codice: "finitura",
        tipo: "discrete",
        obbligatorio: true,
        sort_order: 1,
        values: [
          { valore: "primer", label: "Primer (da verniciare)", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "laccato_bianco", label: "Laccato bianco", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 60 },
        ],
      },
    ],
  },
  {
    ...noGrid,
    nome: "Porta tagliafuoco REI",
    descrizione: "Porta tagliafuoco certificata REI per compartimentazioni; opzione maniglione antipanico.",
    vertical_slug: "porte",
    categoria_slug: "porte_tecniche",
    tipologia: "rei",
    materiale: "metallo",
    tags: ["Base", "Porte", "tagliafuoco", "REI", "sicurezza"],
    modalita_prezzo_base: "pz",
    prezzo_base_vendita: 480,
    vat_rate: 22,
    unit_of_measure: "pz",
    sort_order: 60,
    assi_default: [
      {
        nome: "Classe",
        codice: "classe",
        tipo: "discrete",
        obbligatorio: true,
        sort_order: 0,
        values: [
          { valore: "rei60", label: "REI 60", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "rei120", label: "REI 120", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 120 },
        ],
      },
      {
        nome: "Maniglione antipanico",
        codice: "antipanico",
        tipo: "boolean",
        obbligatorio: false,
        sort_order: 1,
        values: [
          { valore: "no", label: "No", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "si", label: "Sì", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 90 },
        ],
      },
    ],
  },
  {
    ...noGrid,
    nome: "Portoncino blindato d'ingresso",
    descrizione: "Porta blindata per ingresso appartamento, con pannello esterno personalizzabile.",
    vertical_slug: "porte",
    categoria_slug: "porte_ingresso",
    tipologia: "blindato",
    materiale: "metallo",
    tags: ["Base", "Porte", "ingresso", "blindato", "sicurezza"],
    modalita_prezzo_base: "pz",
    prezzo_base_vendita: 890,
    vat_rate: 22,
    unit_of_measure: "pz",
    sort_order: 70,
    assi_default: [
      {
        nome: "Classe antieffrazione",
        codice: "classe_rc",
        tipo: "discrete",
        obbligatorio: true,
        sort_order: 0,
        values: [
          { valore: "rc2", label: "RC2", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "rc3", label: "RC3", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 250 },
        ],
      },
      {
        nome: "Pannello esterno",
        codice: "pannello",
        tipo: "discrete",
        obbligatorio: true,
        sort_order: 1,
        values: [
          { valore: "liscio", label: "Liscio", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "doghe", label: "A doghe", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 60 },
          { valore: "rovere", label: "Effetto rovere", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 90 },
        ],
      },
      {
        nome: "Verso apertura",
        codice: "verso",
        tipo: "discrete",
        obbligatorio: true,
        sort_order: 2,
        values: [
          { valore: "dx", label: "Destra", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "sx", label: "Sinistra", maggiorazione_tipo: "none", maggiorazione_valore: 0 },
        ],
      },
    ],
  },
  {
    ...noGrid,
    nome: "Porta d'ingresso in alluminio",
    descrizione: "Portoncino d'ingresso a taglio termico in alluminio, per abitazioni ed esercizi.",
    vertical_slug: "porte",
    categoria_slug: "porte_ingresso",
    tipologia: "ingresso_alluminio",
    materiale: "alluminio",
    tags: ["Base", "Porte", "ingresso", "alluminio"],
    modalita_prezzo_base: "pz",
    prezzo_base_vendita: 1200,
    vat_rate: 22,
    unit_of_measure: "pz",
    sort_order: 80,
    assi_default: [
      {
        nome: "Vetratura",
        codice: "vetratura",
        tipo: "discrete",
        obbligatorio: true,
        sort_order: 0,
        values: [
          { valore: "cieca", label: "Cieca", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "vetro", label: "Con vetro", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 150 },
        ],
      },
      {
        nome: "Colore",
        codice: "colore",
        tipo: "discrete",
        obbligatorio: true,
        sort_order: 1,
        values: [
          { valore: "bianco", label: "Bianco RAL 9010", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "antracite", label: "Antracite RAL 7016", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 80 },
        ],
      },
    ],
  },
  {
    ...noGrid,
    nome: "Porta tamburata grezza da verniciare",
    descrizione: "Porta interna tamburata economica, grezza, pronta da verniciare in cantiere.",
    vertical_slug: "porte",
    categoria_slug: "porte_interne",
    tipologia: "tamburata_grezza",
    materiale: "legno",
    tags: ["Base", "Porte", "interna", "economica", "grezza"],
    modalita_prezzo_base: "pz",
    prezzo_base_vendita: 120,
    vat_rate: 22,
    unit_of_measure: "pz",
    sort_order: 90,
    assi_default: [
      {
        nome: "Luce (LxH)",
        codice: "luce",
        tipo: "discrete",
        obbligatorio: true,
        sort_order: 0,
        values: [
          { valore: "70x210", label: "70×210 cm", maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "80x210", label: "80×210 cm", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "90x210", label: "90×210 cm", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 10 },
        ],
      },
      {
        nome: "Verso apertura",
        codice: "verso",
        tipo: "discrete",
        obbligatorio: true,
        sort_order: 1,
        values: [
          { valore: "dx", label: "Destra", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "sx", label: "Sinistra", maggiorazione_tipo: "none", maggiorazione_valore: 0 },
        ],
      },
    ],
  },
];

// ════════════════════════════════════════════════════════════════════════════
// BAGNO & SANITARI — prezzo a pezzo  (vertical: bagno)
// ════════════════════════════════════════════════════════════════════════════
export const BASE_BAGNO_TEMPLATES: BaseArticleTemplateSeed[] = [
  {
    ...noGrid,
    nome: "Vaso WC sospeso",
    descrizione: "Vaso sospeso in ceramica, tecnologia rimless (senza brida) per igiene e pulizia facilitata.",
    vertical_slug: "bagno",
    categoria_slug: "sanitari",
    tipologia: "wc_sospeso",
    materiale: "ceramica",
    tags: ["Base", "Bagno", "sanitari", "wc"],
    modalita_prezzo_base: "pz",
    prezzo_base_vendita: 120,
    vat_rate: 22,
    unit_of_measure: "pz",
    sort_order: 10,
    assi_default: [
      {
        nome: "Tipo", codice: "tipo", tipo: "discrete", obbligatorio: true, sort_order: 0,
        values: [
          { valore: "sospeso", label: "Sospeso rimless", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "filo_muro", label: "Filo muro (back-to-wall)", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 40 },
        ],
      },
      {
        nome: "Copriwater", codice: "copriwater", tipo: "discrete", obbligatorio: true, sort_order: 1,
        values: [
          { valore: "softclose", label: "Sedile softclose incluso", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "senza", label: "Senza sedile", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: -20 },
        ],
      },
    ],
  },
  {
    ...noGrid,
    nome: "Bidet sospeso",
    descrizione: "Bidet sospeso in ceramica, coordinato al vaso; monoforo per miscelatore.",
    vertical_slug: "bagno",
    categoria_slug: "sanitari",
    tipologia: "bidet_sospeso",
    materiale: "ceramica",
    tags: ["Base", "Bagno", "sanitari", "bidet"],
    modalita_prezzo_base: "pz",
    prezzo_base_vendita: 100,
    vat_rate: 22,
    unit_of_measure: "pz",
    sort_order: 20,
    assi_default: [
      {
        nome: "Tipo", codice: "tipo", tipo: "discrete", obbligatorio: true, sort_order: 0,
        values: [
          { valore: "sospeso", label: "Sospeso", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "filo_pavimento", label: "Filo pavimento", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 15 },
        ],
      },
    ],
  },
  {
    ...noGrid,
    nome: "Lavabo",
    descrizione: "Lavabo in ceramica per bagno, disponibile da appoggio, sospeso o semincasso.",
    vertical_slug: "bagno",
    categoria_slug: "sanitari",
    tipologia: "lavabo",
    materiale: "ceramica",
    tags: ["Base", "Bagno", "sanitari", "lavabo"],
    modalita_prezzo_base: "pz",
    prezzo_base_vendita: 90,
    vat_rate: 22,
    unit_of_measure: "pz",
    sort_order: 30,
    assi_default: [
      {
        nome: "Installazione", codice: "installazione", tipo: "discrete", obbligatorio: true, sort_order: 0,
        values: [
          { valore: "appoggio", label: "Da appoggio", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "sospeso", label: "Sospeso", maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "semincasso", label: "Semincasso", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 20 },
        ],
      },
      {
        nome: "Materiale", codice: "materiale", tipo: "discrete", obbligatorio: true, sort_order: 1,
        values: [
          { valore: "ceramica", label: "Ceramica", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "ceramica_sottile", label: "Ceramica sottile", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 30 },
        ],
      },
    ],
  },
  {
    ...noGrid,
    nome: "Piatto doccia",
    descrizione: "Piatto doccia a filo pavimento, riducibile su misura; materiale a scelta.",
    vertical_slug: "bagno",
    categoria_slug: "docce",
    tipologia: "piatto_doccia",
    materiale: "resina",
    tags: ["Base", "Bagno", "doccia", "piatto"],
    modalita_prezzo_base: "pz",
    prezzo_base_vendita: 150,
    vat_rate: 22,
    unit_of_measure: "pz",
    sort_order: 40,
    assi_default: [
      {
        nome: "Materiale", codice: "materiale", tipo: "discrete", obbligatorio: true, sort_order: 0,
        values: [
          { valore: "acrilico", label: "Acrilico", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "resina", label: "Pietra/resina", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 80 },
          { valore: "gres", label: "Gres effetto pietra", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 120 },
        ],
      },
      {
        nome: "Dimensione", codice: "dimensione", tipo: "discrete", obbligatorio: true, sort_order: 1,
        values: [
          { valore: "70x90", label: "70×90 cm", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "80x120", label: "80×120 cm", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 40 },
          { valore: "90x140", label: "90×140 cm", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 70 },
        ],
      },
    ],
  },
  {
    ...noGrid,
    nome: "Box doccia",
    descrizione: "Box doccia in cristallo temperato, profili in alluminio; varie aperture.",
    vertical_slug: "bagno",
    categoria_slug: "docce",
    tipologia: "box_doccia",
    materiale: "vetro",
    tags: ["Base", "Bagno", "doccia", "box"],
    modalita_prezzo_base: "pz",
    prezzo_base_vendita: 320,
    vat_rate: 22,
    unit_of_measure: "pz",
    sort_order: 50,
    assi_default: [
      {
        nome: "Apertura", codice: "apertura", tipo: "discrete", obbligatorio: true, sort_order: 0,
        values: [
          { valore: "scorrevole", label: "Scorrevole", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "battente", label: "Battente", maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "angolare", label: "Angolare 2 lati", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 120 },
        ],
      },
      {
        nome: "Cristallo", codice: "cristallo", tipo: "discrete", obbligatorio: true, sort_order: 1,
        values: [
          { valore: "6mm", label: "6 mm trasparente", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "8mm", label: "8 mm trasparente", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 90 },
          { valore: "satinato", label: "Satinato", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 40 },
        ],
      },
      {
        nome: "Profilo", codice: "profilo", tipo: "discrete", obbligatorio: true, sort_order: 2,
        values: [
          { valore: "cromo", label: "Cromo", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "nero", label: "Nero opaco", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 60 },
        ],
      },
    ],
  },
  {
    ...noGrid,
    nome: "Miscelatore lavabo",
    descrizione: "Miscelatore monocomando per lavabo, cartuccia ceramica; varie finiture.",
    vertical_slug: "bagno",
    categoria_slug: "rubinetteria",
    tipologia: "miscelatore_lavabo",
    materiale: "ottone",
    tags: ["Base", "Bagno", "rubinetteria", "lavabo"],
    modalita_prezzo_base: "pz",
    prezzo_base_vendita: 60,
    vat_rate: 22,
    unit_of_measure: "pz",
    sort_order: 60,
    assi_default: [
      {
        nome: "Altezza", codice: "altezza", tipo: "discrete", obbligatorio: true, sort_order: 0,
        values: [
          { valore: "standard", label: "Standard", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "alto", label: "Alto (per lavabo d'appoggio)", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 25 },
        ],
      },
      {
        nome: "Finitura", codice: "finitura", tipo: "discrete", obbligatorio: true, sort_order: 1,
        values: [
          { valore: "cromo", label: "Cromo", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "nero", label: "Nero opaco", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 40 },
          { valore: "oro", label: "Oro spazzolato", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 70 },
        ],
      },
    ],
  },
  {
    ...noGrid,
    nome: "Colonna doccia",
    descrizione: "Colonna doccia con soffione e doccetta; versione termostatica per temperatura costante.",
    vertical_slug: "bagno",
    categoria_slug: "rubinetteria",
    tipologia: "colonna_doccia",
    materiale: "ottone",
    tags: ["Base", "Bagno", "rubinetteria", "doccia"],
    modalita_prezzo_base: "pz",
    prezzo_base_vendita: 180,
    vat_rate: 22,
    unit_of_measure: "pz",
    sort_order: 70,
    assi_default: [
      {
        nome: "Tipo", codice: "tipo", tipo: "discrete", obbligatorio: true, sort_order: 0,
        values: [
          { valore: "saliscendi", label: "Saliscendi + soffione", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "termostatica", label: "Termostatica", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 120 },
        ],
      },
      {
        nome: "Finitura", codice: "finitura", tipo: "discrete", obbligatorio: true, sort_order: 1,
        values: [
          { valore: "cromo", label: "Cromo", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "nero", label: "Nero opaco", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 60 },
        ],
      },
    ],
  },
  {
    ...noGrid,
    nome: "Mobile bagno sospeso con lavabo",
    descrizione: "Mobile bagno sospeso con lavabo integrato e cassetti soft-close; varie larghezze e finiture.",
    vertical_slug: "bagno",
    categoria_slug: "mobili_bagno",
    tipologia: "mobile_lavabo",
    materiale: "legno",
    tags: ["Base", "Bagno", "mobili", "lavabo"],
    modalita_prezzo_base: "pz",
    prezzo_base_vendita: 350,
    vat_rate: 22,
    unit_of_measure: "pz",
    sort_order: 80,
    assi_default: [
      {
        nome: "Larghezza", codice: "larghezza", tipo: "discrete", obbligatorio: true, sort_order: 0,
        values: [
          { valore: "60", label: "60 cm", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "80", label: "80 cm", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 80 },
          { valore: "100", label: "100 cm", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 150 },
        ],
      },
      {
        nome: "Finitura", codice: "finitura", tipo: "discrete", obbligatorio: true, sort_order: 1,
        values: [
          { valore: "bianco", label: "Bianco", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "rovere", label: "Rovere", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 60 },
          { valore: "laccato_colore", label: "Laccato colore", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 90 },
        ],
      },
    ],
  },
  {
    ...noGrid,
    nome: "Termoarredo scaldasalviette",
    descrizione: "Radiatore scaldasalviette per bagno; alimentazione idraulica, elettrica o mista.",
    vertical_slug: "bagno",
    categoria_slug: "riscaldamento_bagno",
    tipologia: "scaldasalviette",
    materiale: "acciaio",
    tags: ["Base", "Bagno", "termoarredo", "scaldasalviette"],
    modalita_prezzo_base: "pz",
    prezzo_base_vendita: 130,
    vat_rate: 22,
    unit_of_measure: "pz",
    sort_order: 90,
    assi_default: [
      {
        nome: "Alimentazione", codice: "alimentazione", tipo: "discrete", obbligatorio: true, sort_order: 0,
        values: [
          { valore: "idraulico", label: "Idraulico", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "elettrico", label: "Elettrico", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 50 },
          { valore: "misto", label: "Misto", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 80 },
        ],
      },
      {
        nome: "Colore", codice: "colore", tipo: "discrete", obbligatorio: true, sort_order: 1,
        values: [
          { valore: "bianco", label: "Bianco", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "antracite", label: "Antracite", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 40 },
          { valore: "cromo", label: "Cromo", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 90 },
        ],
      },
    ],
  },
];

// ════════════════════════════════════════════════════════════════════════════
// ELETTRICO — a pezzo (punti, placche, quadri, corpi) o al metro (cavi/tubi)
// ════════════════════════════════════════════════════════════════════════════
export const BASE_ELETTRICO_TEMPLATES: BaseArticleTemplateSeed[] = [
  {
    ...noGrid,
    nome: "Punto luce",
    descrizione: "Punto luce completo (scatola, comando, cablaggio); esclusa manodopera di posa.",
    vertical_slug: "elettrico",
    categoria_slug: "punti",
    tipologia: "punto_luce",
    materiale: null,
    tags: ["Base", "Elettrico", "punto", "luce"],
    modalita_prezzo_base: "pz",
    prezzo_base_vendita: 22,
    vat_rate: 22,
    unit_of_measure: "pz",
    sort_order: 10,
    assi_default: [
      {
        nome: "Comando", codice: "comando", tipo: "discrete", obbligatorio: true, sort_order: 0,
        values: [
          { valore: "interrotto", label: "Interrotto", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "deviato", label: "Deviato", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 6 },
          { valore: "invertito", label: "Invertito", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 12 },
        ],
      },
      {
        nome: "Serie civile", codice: "serie", tipo: "discrete", obbligatorio: true, sort_order: 1,
        values: [
          { valore: "economica", label: "Economica", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "media", label: "Media gamma", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 4 },
          { valore: "design", label: "Top design", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 8 },
        ],
      },
    ],
  },
  {
    ...noGrid,
    nome: "Punto presa",
    descrizione: "Punto presa completo (scatola, presa, cablaggio); esclusa manodopera di posa.",
    vertical_slug: "elettrico",
    categoria_slug: "punti",
    tipologia: "punto_presa",
    materiale: null,
    tags: ["Base", "Elettrico", "punto", "presa"],
    modalita_prezzo_base: "pz",
    prezzo_base_vendita: 20,
    vat_rate: 22,
    unit_of_measure: "pz",
    sort_order: 20,
    assi_default: [
      {
        nome: "Tipo presa", codice: "tipo", tipo: "discrete", obbligatorio: true, sort_order: 0,
        values: [
          { valore: "bivalente", label: "2P+T 16A bivalente", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "schuko", label: "Schuko", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 3 },
          { valore: "usb", label: "Con presa USB", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 12 },
          { valore: "comandata", label: "Comandata", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 6 },
        ],
      },
    ],
  },
  {
    ...noGrid,
    nome: "Placca serie civile",
    descrizione: "Placca di finitura con supporto per serie civile; vari posti e materiali.",
    vertical_slug: "elettrico",
    categoria_slug: "placche",
    tipologia: "placca",
    materiale: null,
    tags: ["Base", "Elettrico", "placca", "serie-civile"],
    modalita_prezzo_base: "pz",
    prezzo_base_vendita: 8,
    vat_rate: 22,
    unit_of_measure: "pz",
    sort_order: 30,
    assi_default: [
      {
        nome: "Posti", codice: "posti", tipo: "discrete", obbligatorio: true, sort_order: 0,
        values: [
          { valore: "3", label: "3 posti", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "4", label: "4 posti", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 2 },
          { valore: "7", label: "7 posti", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 6 },
        ],
      },
      {
        nome: "Materiale", codice: "materiale", tipo: "discrete", obbligatorio: true, sort_order: 1,
        values: [
          { valore: "tecnopolimero", label: "Tecnopolimero", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "metallo", label: "Metallo", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 12 },
          { valore: "vetro", label: "Vetro", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 18 },
        ],
      },
    ],
  },
  {
    ...noGrid,
    nome: "Comando modulare",
    descrizione: "Meccanismo modulare per serie civile: interruttore, deviatore, pulsante o dimmer.",
    vertical_slug: "elettrico",
    categoria_slug: "comandi",
    tipologia: "comando_modulare",
    materiale: null,
    tags: ["Base", "Elettrico", "comando", "modulo"],
    modalita_prezzo_base: "pz",
    prezzo_base_vendita: 6,
    vat_rate: 22,
    unit_of_measure: "pz",
    sort_order: 40,
    assi_default: [
      {
        nome: "Funzione", codice: "funzione", tipo: "discrete", obbligatorio: true, sort_order: 0,
        values: [
          { valore: "interruttore", label: "Interruttore", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "deviatore", label: "Deviatore", maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "pulsante", label: "Pulsante", maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "dimmer", label: "Dimmer", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 18 },
          { valore: "smart", label: "Connesso/Smart", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 25 },
        ],
      },
    ],
  },
  {
    ...noGrid,
    nome: "Quadro elettrico da incasso",
    descrizione: "Centralino da incasso per appartamento; numero moduli a scelta, porta inclusa.",
    vertical_slug: "elettrico",
    categoria_slug: "quadri",
    tipologia: "quadro_incasso",
    materiale: null,
    tags: ["Base", "Elettrico", "quadro", "centralino"],
    modalita_prezzo_base: "pz",
    prezzo_base_vendita: 45,
    vat_rate: 22,
    unit_of_measure: "pz",
    sort_order: 50,
    assi_default: [
      {
        nome: "Moduli", codice: "moduli", tipo: "discrete", obbligatorio: true, sort_order: 0,
        values: [
          { valore: "12", label: "12 moduli (1 fila)", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "24", label: "24 moduli (2 file)", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 30 },
          { valore: "36", label: "36 moduli (3 file)", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 55 },
        ],
      },
    ],
  },
  {
    ...noGrid,
    nome: "Interruttore differenziale magnetotermico (salvavita)",
    descrizione: "Magnetotermico differenziale per protezione linea; sensibilità e curva a norma.",
    vertical_slug: "elettrico",
    categoria_slug: "protezioni",
    tipologia: "salvavita",
    materiale: null,
    tags: ["Base", "Elettrico", "salvavita", "protezione"],
    modalita_prezzo_base: "pz",
    prezzo_base_vendita: 55,
    vat_rate: 22,
    unit_of_measure: "pz",
    sort_order: 60,
    assi_default: [
      {
        nome: "Tipo", codice: "tipo", tipo: "discrete", obbligatorio: true, sort_order: 0,
        values: [
          { valore: "1pn", label: "1P+N 4,5 kA", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "2p", label: "2P 6 kA", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 20 },
        ],
      },
      {
        nome: "Sensibilità", codice: "sensibilita", tipo: "discrete", obbligatorio: true, sort_order: 1,
        values: [
          { valore: "ac", label: "30 mA tipo AC", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "a", label: "30 mA tipo A", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 25 },
        ],
      },
    ],
  },
  {
    ...noGrid,
    nome: "Faretto LED da incasso",
    descrizione: "Faretto LED da incasso per controsoffitto; fisso o orientabile, varie temperature colore.",
    vertical_slug: "elettrico",
    categoria_slug: "illuminazione",
    tipologia: "faretto_led",
    materiale: null,
    tags: ["Base", "Elettrico", "illuminazione", "faretto", "led"],
    modalita_prezzo_base: "pz",
    prezzo_base_vendita: 12,
    vat_rate: 22,
    unit_of_measure: "pz",
    sort_order: 70,
    assi_default: [
      {
        nome: "Orientabilità", codice: "orientabilita", tipo: "discrete", obbligatorio: true, sort_order: 0,
        values: [
          { valore: "fisso", label: "Fisso", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "orientabile", label: "Orientabile", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 4 },
        ],
      },
      {
        nome: "Potenza", codice: "potenza", tipo: "discrete", obbligatorio: true, sort_order: 1,
        values: [
          { valore: "7w", label: "7 W", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "10w", label: "10 W", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 3 },
          { valore: "15w", label: "15 W", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 6 },
        ],
      },
    ],
  },
  {
    ...noGrid,
    nome: "Pannello LED",
    descrizione: "Plafoniera/pannello LED da soffitto; formato tondo o quadro, versione dimmerabile.",
    vertical_slug: "elettrico",
    categoria_slug: "illuminazione",
    tipologia: "pannello_led",
    materiale: null,
    tags: ["Base", "Elettrico", "illuminazione", "pannello", "led"],
    modalita_prezzo_base: "pz",
    prezzo_base_vendita: 28,
    vat_rate: 22,
    unit_of_measure: "pz",
    sort_order: 80,
    assi_default: [
      {
        nome: "Formato", codice: "formato", tipo: "discrete", obbligatorio: true, sort_order: 0,
        values: [
          { valore: "tondo", label: "Tondo Ø30 cm", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "quadro60", label: "Quadro 60×60 cm", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 15 },
        ],
      },
      {
        nome: "Dimmerabile", codice: "dimmerabile", tipo: "boolean", obbligatorio: false, sort_order: 1,
        values: [
          { valore: "no", label: "No", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "si", label: "Sì", maggiorazione_tipo: "fisso_pz", maggiorazione_valore: 12 },
        ],
      },
    ],
  },
  {
    ...noGrid,
    nome: "Cavo elettrico unipolare",
    descrizione: "Cavo unipolare tipo FS17/N07V-K per impianti civili; prezzo al metro lineare.",
    vertical_slug: "elettrico",
    categoria_slug: "cavi",
    tipologia: "cavo_unipolare",
    materiale: "rame",
    tags: ["Base", "Elettrico", "cavo"],
    modalita_prezzo_base: "misura_libera",
    prezzo_base_vendita: 0.8,
    vat_rate: 22,
    unit_of_measure: "ml",
    sort_order: 90,
    assi_default: [
      {
        nome: "Sezione", codice: "sezione", tipo: "discrete", obbligatorio: true, sort_order: 0,
        values: [
          { valore: "1.5", label: "1,5 mm²", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "2.5", label: "2,5 mm²", maggiorazione_tipo: "fisso_ml", maggiorazione_valore: 0.4 },
          { valore: "4", label: "4 mm²", maggiorazione_tipo: "fisso_ml", maggiorazione_valore: 1.1 },
          { valore: "6", label: "6 mm²", maggiorazione_tipo: "fisso_ml", maggiorazione_valore: 2 },
        ],
      },
    ],
  },
  {
    ...noGrid,
    nome: "Tubo/canalina passacavi",
    descrizione: "Tubo corrugato o canalina per protezione cavi; prezzo al metro lineare.",
    vertical_slug: "elettrico",
    categoria_slug: "canalizzazioni",
    tipologia: "tubo_corrugato",
    materiale: "pvc",
    tags: ["Base", "Elettrico", "tubo", "canalina"],
    modalita_prezzo_base: "misura_libera",
    prezzo_base_vendita: 0.6,
    vat_rate: 22,
    unit_of_measure: "ml",
    sort_order: 100,
    assi_default: [
      {
        nome: "Tipo", codice: "tipo", tipo: "discrete", obbligatorio: true, sort_order: 0,
        values: [
          { valore: "corrugato20", label: "Corrugato Ø20", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
          { valore: "corrugato25", label: "Corrugato Ø25", maggiorazione_tipo: "fisso_ml", maggiorazione_valore: 0.2 },
          { valore: "canalina", label: "Canalina 20×20", maggiorazione_tipo: "fisso_ml", maggiorazione_valore: 0.9 },
        ],
      },
    ],
  },
];

/** Metadati delle collezioni "Base Edilizia" per la UI di import (super_admin). */
export interface BaseLibraryCollection {
  key: string;
  label: string;
  descrizione: string;
  count: number;
}

export const BASE_LIBRARY_COLLECTIONS: BaseLibraryCollection[] = [
  {
    key: "piastrelle",
    label: "Base Edilizia · Piastrelle",
    descrizione: "Gres, rivestimenti, mosaici, cementine, klinker, battiscopa — prezzo al m².",
    count: BASE_PIASTRELLE_TEMPLATES.length,
  },
  {
    key: "porte",
    label: "Base Edilizia · Porte",
    descrizione: "Porte interne (battenti, scorrevoli, vetro, filomuro), tagliafuoco, ingresso/blindati — a pezzo.",
    count: BASE_PORTE_TEMPLATES.length,
  },
  {
    key: "bagno",
    label: "Base Edilizia · Bagno & Sanitari",
    descrizione: "Vasi/bidet/lavabi, piatti e box doccia, rubinetteria, mobili, scaldasalviette — a pezzo.",
    count: BASE_BAGNO_TEMPLATES.length,
  },
  {
    key: "elettrico",
    label: "Base Edilizia · Elettrico",
    descrizione: "Punti luce/presa, placche, comandi, quadri, salvavita, illuminazione LED, cavi/tubi (al ml).",
    count: BASE_ELETTRICO_TEMPLATES.length,
  },
];

/** Ritorna il seed di una collezione base per chiave. */
export function getBaseCollection(key: string): BaseArticleTemplateSeed[] {
  switch (key) {
    case "piastrelle":
      return BASE_PIASTRELLE_TEMPLATES;
    case "porte":
      return BASE_PORTE_TEMPLATES;
    case "bagno":
      return BASE_BAGNO_TEMPLATES;
    case "elettrico":
      return BASE_ELETTRICO_TEMPLATES;
    default:
      return [];
  }
}
