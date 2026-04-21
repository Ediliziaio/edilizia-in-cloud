/**
 * Preset di assi per serramentisti italiani — dati pronti all'uso che
 * l'utente può applicare con un click invece di configurare manualmente
 * ogni asse + valore.
 *
 * Le maggiorazioni sono ordini di grandezza tipici del mercato IT 2026:
 *  - Colore: 0% bianco standard, +8-15% colorazioni speciali
 *  - Vetro: €/mq per triplo vetro / satinato / antieffrazione
 *  - Apertura: % per complessità meccanica (anta-ribalta, scorrevole)
 *  - Ferramenta: €/pz per maniglie premium / meccanismi di sicurezza
 *  - Posa: €/pz standard per tipologia intervento
 *
 * I valori sono modificabili dopo l'applicazione — il preset è un
 * BOOTSTRAP, non una prescrizione. L'utente può eliminare/rinominare/
 * ricalibrare tutto ciò che vuole dopo averlo generato.
 *
 * Per eventuali maggiorazioni negative (sconto su apertura "fisso" vs
 * "anta-ribalta") NON le supportiamo via applyMarkup (clamp a 0). Il
 * pattern corretto è impostare "fisso" come base (0%) e le altre
 * tipologie come maggiorazioni positive.
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
  values: PresetAxisValue[];
}

/** Pack logico di assi correlati (es. "Serramento classico"). */
export interface PresetPack {
  id: string;
  nome: string;
  descrizione: string;
  icona: string;
  assiIds: string[];
}

// ─── Assi singoli ──────────────────────────────────────────────────────────

export const PRESET_COLORE: PresetAxis = {
  id: "colore",
  nome: "Colore",
  codice: "colore",
  obbligatorio: true,
  icona: "🎨",
  sintesi: "Bianco standard · antracite · effetto legno · RAL custom",
  descrizione:
    "Finitura esterna del profilo. Il bianco è la base di listino; le altre colorazioni sono ricarichi percentuali.",
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
    "Tipologia di vetro montata nel telaio. Maggiorazioni al m² perché il costo scala con la superficie del vetro, non del pezzo.",
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

export const PRESET_ZANZARIERA: PresetAxis = {
  id: "zanzariera",
  nome: "Zanzariera",
  codice: "zanzariera",
  obbligatorio: false,
  icona: "🦟",
  sintesi: "Senza · a rullo verticale · plissettata · scorrevole",
  descrizione:
    "Accessorio zanzariera integrato. Maggiorazione al pezzo (l'ingombro non cresce proporzionalmente al mq).",
  values: [
    {
      label: "Senza zanzariera",
      valore: "none",
      is_default: true,
      maggiorazione_tipo: "none",
      maggiorazione_valore: 0,
    },
    {
      label: "A rullo verticale",
      valore: "rullo_vert",
      maggiorazione_tipo: "fisso_pz",
      maggiorazione_valore: 75,
      maggiorazione_acquisto: 48,
    },
    {
      label: "Plissettata",
      valore: "plisse",
      maggiorazione_tipo: "fisso_pz",
      maggiorazione_valore: 120,
      maggiorazione_acquisto: 75,
    },
    {
      label: "Scorrevole laterale",
      valore: "scorrevole",
      maggiorazione_tipo: "fisso_pz",
      maggiorazione_valore: 95,
      maggiorazione_acquisto: 60,
    },
  ],
};

export const PRESET_DAVANZALE: PresetAxis = {
  id: "davanzale",
  nome: "Davanzale",
  codice: "davanzale",
  obbligatorio: false,
  icona: "📐",
  sintesi: "Nessuno · marmo · alluminio · PVC",
  descrizione:
    "Davanzale di finitura esterna. Costo al metro lineare di larghezza finestra.",
  values: [
    {
      label: "Nessuno",
      valore: "none",
      is_default: true,
      maggiorazione_tipo: "none",
      maggiorazione_valore: 0,
    },
    {
      label: "Marmo travertino",
      valore: "marmo",
      maggiorazione_tipo: "fisso_ml",
      maggiorazione_valore: 85,
      maggiorazione_acquisto: 55,
    },
    {
      label: "Alluminio verniciato",
      valore: "alluminio",
      maggiorazione_tipo: "fisso_ml",
      maggiorazione_valore: 45,
      maggiorazione_acquisto: 28,
    },
    {
      label: "PVC coprifilo",
      valore: "pvc",
      maggiorazione_tipo: "fisso_ml",
      maggiorazione_valore: 20,
      maggiorazione_acquisto: 12,
    },
  ],
};

// ─── Lista completa ─────────────────────────────────────────────────────────

export const ALL_PRESET_AXES: PresetAxis[] = [
  PRESET_COLORE,
  PRESET_VETRO,
  PRESET_APERTURA,
  PRESET_FERRAMENTA,
  PRESET_ZANZARIERA,
  PRESET_DAVANZALE,
];

// ─── Pack predefiniti ───────────────────────────────────────────────────────

export const PRESET_PACKS: PresetPack[] = [
  {
    id: "wasistas_classico",
    nome: "Finestra Wasistas/Anta-ribalta",
    descrizione:
      "Configurazione standard per finestre Wasistas o anta-ribalta: colore, vetro, apertura, ferramenta.",
    icona: "🪟",
    assiIds: ["colore", "vetro", "apertura", "ferramenta"],
  },
  {
    id: "serramento_completo",
    nome: "Serramento completo",
    descrizione:
      "Tutto: colore, vetro, apertura, ferramenta, zanzariera, davanzale. Use case: configuratore esaustivo.",
    icona: "🏗️",
    assiIds: [
      "colore",
      "vetro",
      "apertura",
      "ferramenta",
      "zanzariera",
      "davanzale",
    ],
  },
  {
    id: "minimo_essenziale",
    nome: "Essenziale",
    descrizione:
      "Solo ciò che fa la differenza di prezzo: colore + vetro. Adatto a preventivatori rapidi.",
    icona: "⚡",
    assiIds: ["colore", "vetro"],
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
