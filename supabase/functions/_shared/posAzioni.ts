/** Le azioni di genera-pos e quali di esse scrivono (o consumano credito) e quindi non spettano a chi è in sola lettura. */
export const AZIONI_POS = [
  "apri_originale_addetto", "apri_documento_mezzo", "crea", "dati_app", "lavorazioni_ai", "approva",
  "salva_modello", "archivia_modello", "emetti", "scarica_emissione", "anteprima_pdf",
] as const;
export type AzionePos = typeof AZIONI_POS[number];

/**
 * Scrivono nel database o consumano credito AI. Aprire un PDF già emesso (scarica_emissione), l'anteprima o gli
 * originali è lettura: prima le prime due erano trattate come scritture e chi era in sola lettura riceveva 403 anche
 * davanti al PDF di un POS già emesso, mentre lavorazioni_ai (credito AI) passava.
 */
const SCRIVONO: ReadonlySet<AzionePos> = new Set<AzionePos>(["crea", "approva", "emetti", "salva_modello", "archivia_modello", "lavorazioni_ai"]);
export const scriveAzionePos = (azione: AzionePos): boolean => SCRIVONO.has(azione);
