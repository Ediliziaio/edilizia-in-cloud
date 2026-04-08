import type { TipoApertura } from "./promptBuilder";

export type TrasformazioneRule = {
  from: TipoApertura;
  to: TipoApertura;
  label: string;
  feasibility: "facile" | "media" | "complessa";
  note?: string;
};

export const TRASFORMAZIONI_SUGGERITE: TrasformazioneRule[] = [
  // Da battente 2 ante
  { from: "battente_2_ante", to: "battente_1_anta", label: "2 ante → 1 anta", feasibility: "facile" },
  { from: "battente_2_ante", to: "scorrevole", label: "2 ante → Scorrevole", feasibility: "media" },
  { from: "battente_2_ante", to: "anta_ribalta", label: "2 ante → Anta e Ribalta", feasibility: "facile" },
  { from: "battente_2_ante", to: "vasistas", label: "2 ante → Vasistas", feasibility: "media" },
  { from: "battente_2_ante", to: "fisso", label: "2 ante → Fisso", feasibility: "facile" },
  // Da battente 1 anta
  { from: "battente_1_anta", to: "battente_2_ante", label: "1 anta → 2 ante", feasibility: "facile" },
  { from: "battente_1_anta", to: "anta_ribalta", label: "1 anta → Anta e Ribalta", feasibility: "facile" },
  { from: "battente_1_anta", to: "vasistas", label: "1 anta → Vasistas", feasibility: "facile" },
  { from: "battente_1_anta", to: "fisso", label: "1 anta → Fisso", feasibility: "facile" },
  // Da portafinestra
  { from: "portafinestra", to: "scorrevole_alzante", label: "Porta → Scorrevole Alzante", feasibility: "media", note: "Richiede massetto" },
  { from: "portafinestra", to: "scorrevole", label: "Porta → Scorrevole", feasibility: "media" },
  { from: "portafinestra", to: "battente_2_ante", label: "Porta → 2 ante standard", feasibility: "facile", note: "Riduzione altezza" },
  { from: "portafinestra", to: "battente_1_anta", label: "Porta → 1 anta", feasibility: "facile" },
  // Da battente 3 ante
  { from: "battente_3_ante", to: "battente_2_ante", label: "3 ante → 2 ante", feasibility: "facile" },
  { from: "battente_3_ante", to: "scorrevole", label: "3 ante → Scorrevole", feasibility: "media" },
  // Da scorrevole
  { from: "scorrevole", to: "scorrevole_alzante", label: "Scorrevole → Alzante", feasibility: "media" },
  { from: "scorrevole", to: "battente_2_ante", label: "Scorrevole → 2 ante", feasibility: "media" },
  { from: "scorrevole", to: "fisso", label: "Scorrevole → Fisso", feasibility: "facile" },
  // Da anta_ribalta
  { from: "anta_ribalta", to: "battente_1_anta", label: "Anta-Ribalta → Solo Battente", feasibility: "facile" },
  { from: "anta_ribalta", to: "vasistas", label: "Anta-Ribalta → Solo Vasistas", feasibility: "facile" },
];

export function getTrasformazioniDisponibili(tipoOriginale: TipoApertura): TrasformazioneRule[] {
  return TRASFORMAZIONI_SUGGERITE.filter(t => t.from === tipoOriginale);
}
