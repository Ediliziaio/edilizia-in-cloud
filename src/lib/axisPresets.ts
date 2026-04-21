/**
 * Preset di assi (serramenti / porte / oscuranti) — dati pronti all'uso che
 * l'utente può applicare con un click invece di configurare manualmente ogni
 * asse + valore.
 *
 * Le maggiorazioni sono ordini di grandezza tipici del mercato IT 2026:
 *  - Colore: 0% bianco standard, +8-15% colorazioni speciali
 *  - Vetro: €/mq per triplo vetro / satinato / antieffrazione
 *    (ma per linee "entry" a configurazione fissa si usa €/pz)
 *  - Apertura: % per complessità meccanica (anta-ribalta, scorrevole)
 *  - Ferramenta: €/pz per maniglie premium / meccanismi di sicurezza
 *  - Classe antieffrazione porta: €/pz (range 3→5 importanti)
 *
 * I valori sono modificabili dopo l'applicazione — il preset è un BOOTSTRAP,
 * non una prescrizione. L'utente può eliminare/rinominare/ricalibrare tutto
 * ciò che vuole dopo averlo generato.
 *
 * Note progettuali:
 *  - Gli ACCESSORI a sé stanti (zanzariere, tende, tapparelle NON installate,
 *    davanzali come componente separato) vanno gestiti come ARTICOLI A PARTE
 *    nel catalogo, non come valori di asse. L'asse ha senso solo per varianti
 *    che "ereditano" il prezzo base del serramento (colore, vetro, apertura).
 *  - Alcune famiglie necessitano value-set ridotti rispetto al preset
 *    globale (es. Wasistas classica ha solo 2 tipologie di apertura, non 5).
 *    Per questo esistono preset "hidden" specifici usati solo dentro un pack.
 */

import type { MaggiorazioneTipo } from "@/types/articleFamily";

/** Un singolo valore all'interno di un preset. */
export interface PresetAxisValue {
  label: string;
  valore: string;
  is_default?: boolean;
  maggiorazione_tipo: MaggiorazioneTipo;
  maggiorazione_valore: number;
  /** Delta del prezzo di acquisto. Se omesso = stesso valore della vendita. */
  maggiorazione_acquisto?: number;
  descrizione?: string;
}

/** Un asse pre-configurato con i suoi valori. */
export interface PresetAxis {
  id: string; // identificatore cliente-side per selezione
  nome: string;
  codice: string;
  obbligatorio: boolean;
  descrizione?: string;
  /** Icona emoji per il picker (accessibilità: nome è sempre il fallback). */
  icona: string;
  /** Sintesi per tooltip e recap nel picker. */
  sintesi: string;
  /**
   * Se true, non compare nella sezione "Singoli assi" del dialog: è un asse
   * specializzato (es. Wasistas-only) usato solo come parte di un pack.
   */
  hidden?: boolean;
  values: PresetAxisValue[];
}

/** Categoria di preset per il tab picker. */
export type PresetCategoria =
  | "serramenti"
  | "porte"
  | "oscuranti"
  | "altro";

export const PRESET_CATEGORIE: Array<{
  id: PresetCategoria;
  label: string;
  icona: string;
  descrizione: string;
}> = [
  {
    id: "serramenti",
    label: "Serramenti",
    icona: "🪟",
    descrizione: "Finestre, porte-finestre, vetrate: colore · vetro · apertura · ferramenta",
  },
  {
    id: "porte",
    label: "Porte",
    icona: "🚪",
    descrizione: "Porte interne, porte blindate: materiale · finitura · chiusura",
  },
  {
    id: "oscuranti",
    label: "Oscuranti",
    icona: "🛡️",
    descrizione: "Persiane, scuri, tapparelle: materiale · colore · meccanismo",
  },
];

/** Pack logico di assi correlati (es. "Serramento classico"). */
export interface PresetPack {
  id: string;
  nome: string;
  descrizione: string;
  icona: string;
  categoria: PresetCategoria;
  assiIds: string[];
}

// ─── SERRAMENTI — Assi generici ────────────────────────────────────────────

export const PRESET_COLORE: PresetAxis = {
  id: "colore",
  nome: "Colore",
  codice: "colore",
  obbligatorio: true,
  icona: "🎨",
  sintesi: "Bianco standard · antracite · marrone · effetto legno · RAL custom",
  descrizione:
    "Finitura esterna del profilo. Il bianco è la base di listino; le altre colorazioni sono ricarichi percentuali sul prezzo base.",
  values: [
    {
      label: "Bianco RAL 9010",
      valore: "bianco",
      is_default: true,
      maggiorazione_tipo: "none",
      maggiorazione_valore: 0,
    },
    {
      label: "Antracite RAL 7016",
      valore: "antracite",
      maggiorazione_tipo: "percentuale",
      maggiorazione_valore: 8,
      maggiorazione_acquisto: 5,
    },
    {
      label: "Marrone RAL 8014",
      valore: "marrone",
      maggiorazione_tipo: "percentuale",
      maggiorazione_valore: 8,
      maggiorazione_acquisto: 5,
    },
    {
      label: "Noce finto legno",
      valore: "noce_legno",
      maggiorazione_tipo: "percentuale",
      maggiorazione_valore: 15,
      maggiorazione_acquisto: 10,
    },
    {
      label: "RAL a campione",
      valore: "ral_custom",
      maggiorazione_tipo: "percentuale",
      maggiorazione_valore: 20,
      maggiorazione_acquisto: 14,
      descrizione:
        "Qualsiasi codice RAL su richiesta: sovrapprezzo per verniciatura dedicata.",
    },
  ],
};

export const PRESET_VETRO: PresetAxis = {
  id: "vetro",
  nome: "Vetro",
  codice: "vetro",
  obbligatorio: true,
  icona: "🪟",
  sintesi: "Doppio 4-15-4 · triplo · satinato · antieffrazione P4A",
  descrizione:
    "Tipologia di vetro montata nel telaio. Maggiorazioni al m² perché il costo del vetro scala con la superficie, non col numero di pezzi.",
  values: [
    {
      label: "Doppio 4-15-4 basso emissivo",
      valore: "doppio_4154_be",
      is_default: true,
      maggiorazione_tipo: "none",
      maggiorazione_valore: 0,
    },
    {
      label: "Triplo 4-12-4-12-4",
      valore: "triplo_412412",
      maggiorazione_tipo: "fisso_mq",
      maggiorazione_valore: 60,
      maggiorazione_acquisto: 35,
    },
    {
      label: "Satinato/opaco",
      valore: "satinato",
      maggiorazione_tipo: "fisso_mq",
      maggiorazione_valore: 25,
      maggiorazione_acquisto: 15,
    },
    {
      label: "Stratificato antieffrazione P4A",
      valore: "strat_p4a",
      maggiorazione_tipo: "fisso_mq",
      maggiorazione_valore: 120,
      maggiorazione_acquisto: 70,
    },
    {
      label: "Stratificato acustico",
      valore: "acustico",
      maggiorazione_tipo: "fisso_mq",
      maggiorazione_valore: 45,
      maggiorazione_acquisto: 28,
    },
  ],
};

export const PRESET_APERTURA: PresetAxis = {
  id: "apertura",
  nome: "Tipo apertura",
  codice: "apertura",
  obbligatorio: true,
  icona: "↔️",
  sintesi: "Fisso · anta-ribalta · wasistas · scorrevole · doppia anta",
  descrizione:
    "Meccanismo di apertura. Fisso è base (0%); le altre tipologie costano di più per maggiore complessità di ferramenta e profilo.",
  values: [
    {
      label: "Fisso (non apribile)",
      valore: "fisso",
      is_default: true,
      maggiorazione_tipo: "none",
      maggiorazione_valore: 0,
    },
    {
      label: "Anta-ribalta",
      valore: "anta_ribalta",
      maggiorazione_tipo: "percentuale",
      maggiorazione_valore: 18,
      maggiorazione_acquisto: 12,
    },
    {
      label: "Wasistas (ribalta sola)",
      valore: "wasistas",
      maggiorazione_tipo: "percentuale",
      maggiorazione_valore: 10,
      maggiorazione_acquisto: 7,
    },
    {
      label: "Scorrevole a 1 anta",
      valore: "scorrevole_1a",
      maggiorazione_tipo: "percentuale",
      maggiorazione_valore: 25,
      maggiorazione_acquisto: 18,
    },
    {
      label: "Doppia anta anta-ribalta",
      valore: "doppia_anta_ar",
      maggiorazione_tipo: "percentuale",
      maggiorazione_valore: 30,
      maggiorazione_acquisto: 22,
    },
  ],
};

export const PRESET_FERRAMENTA: PresetAxis = {
  id: "ferramenta",
  nome: "Ferramenta & maniglia",
  codice: "ferramenta",
  obbligatorio: false,
  icona: "🔧",
  sintesi: "Standard · cremonese · chiave di sicurezza · motorizzata",
  descrizione:
    "Livello di ferramenta e tipologia di maniglia. Supplementi al pezzo indipendenti dalla taglia del serramento.",
  values: [
    {
      label: "Maniglia standard",
      valore: "standard",
      is_default: true,
      maggiorazione_tipo: "none",
      maggiorazione_valore: 0,
    },
    {
      label: "Cremonese (doppia maniglia)",
      valore: "cremonese",
      maggiorazione_tipo: "fisso_pz",
      maggiorazione_valore: 45,
      maggiorazione_acquisto: 28,
    },
    {
      label: "Maniglia con chiave di sicurezza",
      valore: "con_chiave",
      maggiorazione_tipo: "fisso_pz",
      maggiorazione_valore: 35,
      maggiorazione_acquisto: 20,
    },
    {
      label: "Ferramenta antieffrazione RC2",
      valore: "rc2",
      maggiorazione_tipo: "fisso_pz",
      maggiorazione_valore: 180,
      maggiorazione_acquisto: 110,
    },
    {
      label: "Motorizzazione elettrica",
      valore: "motorizzata",
      maggiorazione_tipo: "fisso_pz",
      maggiorazione_valore: 450,
      maggiorazione_acquisto: 280,
    },
  ],
};

// ─── SERRAMENTI — Wasistas essenziale (hidden, solo dentro il pack) ────────
//
// Variante ridotta: famiglia Wasistas non ha varianti piene (niente scorrevole,
// niente RAL speciale). Value set allineato a un preventivatore entry-level:
//
//  Colore     Bianco (0%) · Antracite (+8%) · Noce finto legno (+15%)
//  Vetro      Doppio standard (0€) · Triplo basso-emissivo (+80€/pz)
//             · Antieffrazione (+150€/pz)
//  Apertura   Wasistas classica (0%) · Doppia anta (+22%)
//
// NOTA vetro: per una famiglia Wasistas con MQ quasi standard si usano €/pz
// invece di €/mq — semplifica i preventivi al volo.

export const PRESET_WASISTAS_COLORE: PresetAxis = {
  id: "wasistas_colore",
  nome: "Colore",
  codice: "colore",
  obbligatorio: true,
  icona: "🎨",
  hidden: true,
  sintesi: "Bianco · antracite · noce finto legno",
  descrizione:
    "Finitura ridotta per linea Wasistas standard. Per altri RAL usa il preset serramenti completo.",
  values: [
    {
      label: "Bianco",
      valore: "bianco",
      is_default: true,
      maggiorazione_tipo: "none",
      maggiorazione_valore: 0,
    },
    {
      label: "Antracite",
      valore: "antracite",
      maggiorazione_tipo: "percentuale",
      maggiorazione_valore: 8,
      maggiorazione_acquisto: 5,
    },
    {
      label: "Noce finto legno",
      valore: "noce_legno",
      maggiorazione_tipo: "percentuale",
      maggiorazione_valore: 15,
      maggiorazione_acquisto: 10,
    },
  ],
};

export const PRESET_WASISTAS_VETRO: PresetAxis = {
  id: "wasistas_vetro",
  nome: "Vetro",
  codice: "vetro",
  obbligatorio: true,
  icona: "🪟",
  hidden: true,
  sintesi: "Doppio standard · triplo basso-emissivo · antieffrazione (€/pz)",
  descrizione:
    "Per la linea Wasistas i vetri si listinano a pezzo (non al m²) perché le taglie sono standardizzate.",
  values: [
    {
      label: "Doppio standard",
      valore: "doppio_standard",
      is_default: true,
      maggiorazione_tipo: "none",
      maggiorazione_valore: 0,
    },
    {
      label: "Triplo basso-emissivo",
      valore: "triplo_be",
      maggiorazione_tipo: "fisso_pz",
      maggiorazione_valore: 80,
      maggiorazione_acquisto: 50,
    },
    {
      label: "Antieffrazione",
      valore: "antieffrazione",
      maggiorazione_tipo: "fisso_pz",
      maggiorazione_valore: 150,
      maggiorazione_acquisto: 95,
    },
  ],
};

export const PRESET_WASISTAS_APERTURA: PresetAxis = {
  id: "wasistas_apertura",
  nome: "Tipo apertura",
  codice: "apertura",
  obbligatorio: true,
  icona: "↔️",
  hidden: true,
  sintesi: "Wasistas classica · doppia anta",
  descrizione:
    "Solo le due tipologie pertinenti alla linea Wasistas. Per scorrevoli/anta-ribalta usa il preset apertura completo.",
  values: [
    {
      label: "Wasistas classica",
      valore: "wasistas_classica",
      is_default: true,
      maggiorazione_tipo: "none",
      maggiorazione_valore: 0,
    },
    {
      label: "Doppia anta",
      valore: "doppia_anta",
      maggiorazione_tipo: "percentuale",
      maggiorazione_valore: 22,
      maggiorazione_acquisto: 15,
    },
  ],
};

// ─── PORTE INTERNE ────────────────────────────────────────────────────────

export const PRESET_PORTA_MATERIALE: PresetAxis = {
  id: "porta_materiale",
  nome: "Materiale",
  codice: "materiale",
  obbligatorio: true,
  icona: "🪵",
  sintesi: "Tamburato · listellare · massello · melaminico · pantografato",
  descrizione:
    "Struttura del pannello porta. Il tamburato è la base economica; massello e laccato pantografato sono premium.",
  values: [
    {
      label: "Tamburato laccato",
      valore: "tamburato",
      is_default: true,
      maggiorazione_tipo: "none",
      maggiorazione_valore: 0,
    },
    {
      label: "Listellare",
      valore: "listellare",
      maggiorazione_tipo: "percentuale",
      maggiorazione_valore: 12,
      maggiorazione_acquisto: 8,
    },
    {
      label: "Massello rovere",
      valore: "massello_rovere",
      maggiorazione_tipo: "percentuale",
      maggiorazione_valore: 45,
      maggiorazione_acquisto: 30,
    },
    {
      label: "Melaminico",
      valore: "melaminico",
      maggiorazione_tipo: "percentuale",
      maggiorazione_valore: -5,
      maggiorazione_acquisto: -3,
      descrizione:
        "Alternativa entry-level al tamburato (risparmio lieve). Se la cascata applica clamp a 0, metti 'tamburato' come default e rimuovi questo valore.",
    },
    {
      label: "Laccato pantografato",
      valore: "pantografato",
      maggiorazione_tipo: "percentuale",
      maggiorazione_valore: 35,
      maggiorazione_acquisto: 22,
    },
  ],
};

export const PRESET_PORTA_FINITURA: PresetAxis = {
  id: "porta_finitura",
  nome: "Finitura",
  codice: "finitura",
  obbligatorio: true,
  icona: "🎨",
  sintesi: "Bianco · noce · rovere · wengé",
  descrizione:
    "Colore/essenza di rivestimento visibile. Ricarichi percentuali sul pannello base.",
  values: [
    {
      label: "Bianco",
      valore: "bianco",
      is_default: true,
      maggiorazione_tipo: "none",
      maggiorazione_valore: 0,
    },
    {
      label: "Noce",
      valore: "noce",
      maggiorazione_tipo: "percentuale",
      maggiorazione_valore: 8,
      maggiorazione_acquisto: 5,
    },
    {
      label: "Rovere sbiancato",
      valore: "rovere",
      maggiorazione_tipo: "percentuale",
      maggiorazione_valore: 10,
      maggiorazione_acquisto: 6,
    },
    {
      label: "Wengé",
      valore: "wenge",
      maggiorazione_tipo: "percentuale",
      maggiorazione_valore: 12,
      maggiorazione_acquisto: 8,
    },
  ],
};

export const PRESET_PORTA_VERSO: PresetAxis = {
  id: "porta_verso",
  nome: "Verso apertura",
  codice: "verso_apertura",
  obbligatorio: true,
  icona: "↩️",
  sintesi: "Destra · sinistra · reversibile",
  descrizione:
    "Mano di apertura della porta, vista dal lato in cui ci si trova entrando. Il reversibile ha un piccolo sovrapprezzo per la ferramenta ambidestra.",
  values: [
    {
      label: "Destra (DX)",
      valore: "dx",
      is_default: true,
      maggiorazione_tipo: "none",
      maggiorazione_valore: 0,
    },
    {
      label: "Sinistra (SX)",
      valore: "sx",
      maggiorazione_tipo: "none",
      maggiorazione_valore: 0,
    },
    {
      label: "Reversibile",
      valore: "reversibile",
      maggiorazione_tipo: "fisso_pz",
      maggiorazione_valore: 25,
      maggiorazione_acquisto: 15,
    },
  ],
};

// ─── PORTE BLINDATE ───────────────────────────────────────────────────────

export const PRESET_BLINDATA_CLASSE: PresetAxis = {
  id: "blindata_classe",
  nome: "Classe antieffrazione",
  codice: "classe_antieffrazione",
  obbligatorio: true,
  icona: "🛡️",
  sintesi: "Classe 3 · Classe 4 · Classe 5 · Classe 6",
  descrizione:
    "Livello di resistenza all'effrazione (UNI EN 1627). Classe 3 è lo standard residenziale; 4-5-6 per esposizioni progressivamente più critiche.",
  values: [
    {
      label: "Classe 3",
      valore: "classe_3",
      is_default: true,
      maggiorazione_tipo: "none",
      maggiorazione_valore: 0,
    },
    {
      label: "Classe 4",
      valore: "classe_4",
      maggiorazione_tipo: "fisso_pz",
      maggiorazione_valore: 280,
      maggiorazione_acquisto: 180,
    },
    {
      label: "Classe 5",
      valore: "classe_5",
      maggiorazione_tipo: "fisso_pz",
      maggiorazione_valore: 550,
      maggiorazione_acquisto: 360,
    },
    {
      label: "Classe 6",
      valore: "classe_6",
      maggiorazione_tipo: "fisso_pz",
      maggiorazione_valore: 1100,
      maggiorazione_acquisto: 720,
    },
  ],
};

export const PRESET_BLINDATA_FINITURA: PresetAxis = {
  id: "blindata_finitura",
  nome: "Finitura pannello",
  codice: "finitura_pannello",
  obbligatorio: true,
  icona: "🪵",
  sintesi: "Noce · rovere · laccato · laminato custom",
  descrizione:
    "Pannello esterno e/o interno della blindata. Il laminato custom abilita stampe dedicate con tempi di consegna più lunghi.",
  values: [
    {
      label: "Noce nazionale",
      valore: "noce",
      is_default: true,
      maggiorazione_tipo: "none",
      maggiorazione_valore: 0,
    },
    {
      label: "Rovere sbiancato",
      valore: "rovere",
      maggiorazione_tipo: "percentuale",
      maggiorazione_valore: 10,
      maggiorazione_acquisto: 6,
    },
    {
      label: "Laccato bianco",
      valore: "laccato_bianco",
      maggiorazione_tipo: "percentuale",
      maggiorazione_valore: 15,
      maggiorazione_acquisto: 9,
    },
    {
      label: "Laminato custom",
      valore: "laminato_custom",
      maggiorazione_tipo: "percentuale",
      maggiorazione_valore: 28,
      maggiorazione_acquisto: 18,
    },
  ],
};

export const PRESET_BLINDATA_CHIUSURA: PresetAxis = {
  id: "blindata_chiusura",
  nome: "Cilindro di chiusura",
  codice: "chiusura",
  obbligatorio: true,
  icona: "🔐",
  sintesi: "Europeo · defender magnetico · doppio cilindro smart",
  descrizione:
    "Tipologia del meccanismo di chiusura. Il defender magnetico neutralizza le tecniche di manipolazione passive.",
  values: [
    {
      label: "Cilindro europeo",
      valore: "cilindro_europeo",
      is_default: true,
      maggiorazione_tipo: "none",
      maggiorazione_valore: 0,
    },
    {
      label: "Defender magnetico",
      valore: "defender_magnetico",
      maggiorazione_tipo: "fisso_pz",
      maggiorazione_valore: 80,
      maggiorazione_acquisto: 50,
    },
    {
      label: "Doppio cilindro smart",
      valore: "smart_doppio",
      maggiorazione_tipo: "fisso_pz",
      maggiorazione_valore: 250,
      maggiorazione_acquisto: 160,
    },
  ],
};

// ─── OSCURANTI (persiane/scuri) ───────────────────────────────────────────

export const PRESET_OSCURANTE_MATERIALE: PresetAxis = {
  id: "oscurante_materiale",
  nome: "Materiale",
  codice: "materiale",
  obbligatorio: true,
  icona: "🪵",
  sintesi: "Alluminio · PVC · legno",
  descrizione:
    "Struttura portante del pannello oscurante. L'alluminio è ideale per zone costiere; il legno ha il miglior impatto estetico.",
  values: [
    {
      label: "Alluminio verniciato",
      valore: "alluminio",
      is_default: true,
      maggiorazione_tipo: "none",
      maggiorazione_valore: 0,
    },
    {
      label: "PVC",
      valore: "pvc",
      maggiorazione_tipo: "percentuale",
      maggiorazione_valore: -8,
      maggiorazione_acquisto: -5,
      descrizione:
        "Alternativa economica per ambienti non marini. In cascata con clamp a 0 questo sconto viene azzerato: se vuoi forzare lo sconto, metti PVC come default.",
    },
    {
      label: "Legno lamellare",
      valore: "legno",
      maggiorazione_tipo: "percentuale",
      maggiorazione_valore: 35,
      maggiorazione_acquisto: 22,
    },
  ],
};

export const PRESET_OSCURANTE_COLORE: PresetAxis = {
  id: "oscurante_colore",
  nome: "Colore",
  codice: "colore",
  obbligatorio: true,
  icona: "🎨",
  sintesi: "Verde classico · marrone · noce · bianco · RAL",
  descrizione:
    "Colorazione esterna del pannello oscurante. Il verde RAL 6005 è la scelta storica italiana.",
  values: [
    {
      label: "Verde RAL 6005",
      valore: "verde_6005",
      is_default: true,
      maggiorazione_tipo: "none",
      maggiorazione_valore: 0,
    },
    {
      label: "Marrone RAL 8017",
      valore: "marrone",
      maggiorazione_tipo: "none",
      maggiorazione_valore: 0,
    },
    {
      label: "Noce finto legno",
      valore: "noce_legno",
      maggiorazione_tipo: "percentuale",
      maggiorazione_valore: 10,
      maggiorazione_acquisto: 6,
    },
    {
      label: "Bianco RAL 9010",
      valore: "bianco",
      maggiorazione_tipo: "none",
      maggiorazione_valore: 0,
    },
    {
      label: "RAL a campione",
      valore: "ral_custom",
      maggiorazione_tipo: "percentuale",
      maggiorazione_valore: 18,
      maggiorazione_acquisto: 12,
    },
  ],
};

export const PRESET_OSCURANTE_MECCANISMO: PresetAxis = {
  id: "oscurante_meccanismo",
  nome: "Meccanismo",
  codice: "meccanismo",
  obbligatorio: true,
  icona: "⚙️",
  sintesi: "Manuale · motorizzato (cablato) · motorizzato (smart)",
  descrizione:
    "Sistema di movimentazione. Il motorizzato smart integra comando da app + crepuscolare + vento.",
  values: [
    {
      label: "Manuale (cordino/leva)",
      valore: "manuale",
      is_default: true,
      maggiorazione_tipo: "none",
      maggiorazione_valore: 0,
    },
    {
      label: "Motorizzato cablato",
      valore: "motorizzato",
      maggiorazione_tipo: "fisso_pz",
      maggiorazione_valore: 180,
      maggiorazione_acquisto: 115,
    },
    {
      label: "Motorizzato smart (radio)",
      valore: "motorizzato_smart",
      maggiorazione_tipo: "fisso_pz",
      maggiorazione_valore: 290,
      maggiorazione_acquisto: 185,
    },
  ],
};

// ─── Lista completa ─────────────────────────────────────────────────────────

export const ALL_PRESET_AXES: PresetAxis[] = [
  // Serramenti — generici
  PRESET_COLORE,
  PRESET_VETRO,
  PRESET_APERTURA,
  PRESET_FERRAMENTA,
  // Serramenti — Wasistas (hidden: solo via pack)
  PRESET_WASISTAS_COLORE,
  PRESET_WASISTAS_VETRO,
  PRESET_WASISTAS_APERTURA,
  // Porte interne
  PRESET_PORTA_MATERIALE,
  PRESET_PORTA_FINITURA,
  PRESET_PORTA_VERSO,
  // Porte blindate
  PRESET_BLINDATA_CLASSE,
  PRESET_BLINDATA_FINITURA,
  PRESET_BLINDATA_CHIUSURA,
  // Oscuranti
  PRESET_OSCURANTE_MATERIALE,
  PRESET_OSCURANTE_COLORE,
  PRESET_OSCURANTE_MECCANISMO,
];

// ─── Pack predefiniti ───────────────────────────────────────────────────────

export const PRESET_PACKS: PresetPack[] = [
  // ── Serramenti ───────────────────────────────────────────────────────────
  {
    id: "wasistas_essenziale",
    nome: "Finestra Wasistas (essenziale)",
    descrizione:
      "Setup rapido per linea Wasistas: 3 colori · 3 vetri · 2 aperture. Totale 8 valori pronti all'uso.",
    icona: "🪟",
    categoria: "serramenti",
    assiIds: ["wasistas_colore", "wasistas_vetro", "wasistas_apertura"],
  },
  {
    id: "serramento_completo",
    nome: "Serramento completo",
    descrizione:
      "Configuratore esaustivo: colore · vetro · apertura · ferramenta. Tutte le varianti principali del mercato.",
    icona: "🏗️",
    categoria: "serramenti",
    assiIds: ["colore", "vetro", "apertura", "ferramenta"],
  },
  {
    id: "serramento_essenziale",
    nome: "Serramento essenziale",
    descrizione:
      "Solo ciò che fa la differenza di prezzo: colore + vetro. Adatto a preventivatori rapidi.",
    icona: "⚡",
    categoria: "serramenti",
    assiIds: ["colore", "vetro"],
  },
  // ── Porte ────────────────────────────────────────────────────────────────
  {
    id: "porta_interna",
    nome: "Porta interna",
    descrizione:
      "Configurazione classica porta interna: materiale del pannello + finitura + verso di apertura.",
    icona: "🚪",
    categoria: "porte",
    assiIds: ["porta_materiale", "porta_finitura", "porta_verso"],
  },
  {
    id: "porta_blindata",
    nome: "Porta blindata",
    descrizione:
      "Classe antieffrazione + finitura pannello + cilindro di chiusura. Normativa UNI EN 1627.",
    icona: "🛡️",
    categoria: "porte",
    assiIds: ["blindata_classe", "blindata_finitura", "blindata_chiusura"],
  },
  // ── Oscuranti ────────────────────────────────────────────────────────────
  {
    id: "persiana_scuro",
    nome: "Persiana / Scuro",
    descrizione:
      "Materiale (alluminio/PVC/legno) + colore + meccanismo (manuale o motorizzato).",
    icona: "🪟",
    categoria: "oscuranti",
    assiIds: [
      "oscurante_materiale",
      "oscurante_colore",
      "oscurante_meccanismo",
    ],
  },
];

/** Ritorna l'asse preset dato il suo id, o null se non esiste. */
export function findPresetAxis(id: string): PresetAxis | null {
  return ALL_PRESET_AXES.find((a) => a.id === id) ?? null;
}

/** Ritorna il pack dato il suo id, o null se non esiste. */
export function findPresetPack(id: string): PresetPack | null {
  return PRESET_PACKS.find((p) => p.id === id) ?? null;
}

/** Assi "pubblici" mostrati nella selezione singola del dialog. */
export const PUBLIC_PRESET_AXES: PresetAxis[] = ALL_PRESET_AXES.filter(
  (a) => !a.hidden,
);

/** Pack filtrati per categoria (il dialog organizza via tab). */
export function packsByCategoria(categoria: PresetCategoria): PresetPack[] {
  return PRESET_PACKS.filter((p) => p.categoria === categoria);
}
