export const FORMATI_VERBALE_SAL = {
  completo: { titolo: "Completo", descrizione: "Confronto col precedente" },
  periodo: { titolo: "Solo periodo", descrizione: "Quantità e importi del SAL" },
  sintetico: { titolo: "Sintetico", descrizione: "Una riga per fase" },
} as const;

export type FormatoVerbaleSal = keyof typeof FORMATI_VERBALE_SAL;
