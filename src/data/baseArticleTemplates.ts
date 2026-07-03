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
];

/** Ritorna il seed di una collezione base per chiave. */
export function getBaseCollection(key: string): BaseArticleTemplateSeed[] {
  switch (key) {
    case "piastrelle":
      return BASE_PIASTRELLE_TEMPLATES;
    case "porte":
      return BASE_PORTE_TEMPLATES;
    default:
      return [];
  }
}
