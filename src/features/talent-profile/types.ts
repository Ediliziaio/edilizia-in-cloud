export type TraitCode =
  | "ORG"
  | "AUT"
  | "GP"
  | "ADS"
  | "DET"
  | "VEN"
  | "HRM"
  | "LDR"
  | "PRO"
  | "COM"
  | "ESP"
  | "RC"
  | "FIN"
  | "SUC"
  | "PRI"
  | "CTRL";

export const TRAIT_LABELS: Record<TraitCode, string> = {
  ORG: "Organizzazione",
  AUT: "Automotivazione",
  GP: "Gestione Pressioni",
  ADS: "Autodisciplina",
  DET: "Determinazione",
  VEN: "Attitudine Vendita",
  HRM: "HR Management",
  LDR: "Leadership Naturale",
  PRO: "Proattività",
  COM: "Comprensione",
  ESP: "Espansività",
  RC: "Resistenza al Cambiamento",
  FIN: "Finanze",
  SUC: "Successo",
  PRI: "Principi",
  CTRL: "Controllo",
};

export type MacroAreaCode = "ESSERE" | "FARE" | "AVERE";

export const MACRO_AREA_LABELS: Record<MacroAreaCode, string> = {
  ESSERE: "Essere (Concentrazione sugli obiettivi)",
  FARE: "Fare (Azioni concrete)",
  AVERE: "Avere (Relazioni che stabilizzano il valore)",
};

export const MACRO_AREA_TRAITS: Record<MacroAreaCode, TraitCode[]> = {
  ESSERE: ["ORG", "AUT", "GP"],
  FARE: ["ADS", "DET", "VEN", "HRM"],
  AVERE: ["LDR", "PRO", "COM", "ESP"],
};

export const INDICATOR_TRAITS: TraitCode[] = ["RC", "FIN", "SUC", "PRI"];

export type ReliabilityIndex = "YES" | "CAUTION" | "NO" | "ZERO" | "FORCED";
export type SyndromeSeverity = "RED" | "ORANGE" | "YELLOW";
export type RispostaValueV5 = "A" | "B" | "C" | "D";
export type PolaritaV5 = "+" | "-" | "S" | "C";

export type ProfiloTipoV5 =
  | "LEADER"
  | "STRATEGIST"
  | "EXECUTOR"
  | "SPECIALIST"
  | "GROWTH_POTENTIAL"
  | "IN_TRANSIZIONE"
  | "CRITICAL";

export type ScalaCode = "SV" | "MO" | "CF" | "EF" | "EC" | "QN" | "QR" | "SP" | "PA" | "SC" | "ST" | "LE";

export const SCALE_LABELS: Record<ScalaCode, string> = {
  SV: "Stile di Vita",
  MO: "Motivazione",
  CF: "Capacità di Fronteggiare",
  EF: "Efficienza",
  EC: "Efficacia",
  QN: "Quantità Responsabilità",
  QR: "Qualità Responsabilità",
  SP: "Spazio Vitale",
  PA: "Partecipazione",
  SC: "Schematicità",
  ST: "Stress",
  LE: "Leadership",
};

export type ProfiloTipo =
  | "LEADER_NATURALE"
  | "ESECUTORE_AFFIDABILE"
  | "CREATIVO_DESTABILIZZANTE"
  | "TECNICO_SPECIALISTA"
  | "COMMERCIALE_NATURALE"
  | "AMMINISTRATIVO_METODICO"
  | "COLLABORATORE_CRESCITA"
  | "PROFESSIONISTA_AUTONOMO"
  | "SUPPORTO_OPERATIVO"
  | "IN_TRANSIZIONE";

export type MacroCategoria = "ALTA_PERFORMANCE" | "CRESCITA" | "ATTENZIONE";

export interface TalentProfileQuestion {
  id: number;
  testo: string;
  scala_primaria: TraitCode;
  polarita: PolaritaV5;
  blocco_tematico: number;
  ordine: number;
  risposte_custom?: { a: string; b: string; c: string };
}
