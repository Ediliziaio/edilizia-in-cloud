/**
 * Il PDF lo disegna il browser (il server ha 2 s di CPU per richiesta): l'HTML dell'anteprima, e le tre fasi di
 * un'emissione. Le gestisce posAzioniBrowser.ts; le vecchie anteprima_pdf, approva ed emetti restano per le app già installate.
 */
export const AZIONI_BROWSER_POS = ["anteprima_html", "prepara_emissione", "completa_emissione", "annulla_emissione"] as const;
export const eAzioneBrowserPos = (a: string): a is (typeof AZIONI_BROWSER_POS)[number] => (AZIONI_BROWSER_POS as readonly string[]).includes(a);

/** Le azioni di genera-pos e quali di esse scrivono (o consumano credito) e quindi non spettano a chi è in sola lettura. */
export const AZIONI_POS = [
  "apri_originale_addetto", "apri_documento_mezzo", "crea", "dati_app", "lavorazioni_ai", "approva",
  "salva_modello", "archivia_modello", "emetti", "scarica_emissione", "anteprima_pdf",
  ...AZIONI_BROWSER_POS,
] as const;
export type AzionePos = typeof AZIONI_POS[number];

/**
 * Scrivono nel database o consumano credito AI. Aprire un PDF già emesso (scarica_emissione), l'anteprima o gli
 * originali è lettura: prima le prime due erano trattate come scritture e chi era in sola lettura riceveva 403 anche
 * davanti al PDF di un POS già emesso, mentre lavorazioni_ai (credito AI) passava.
 */
const SCRIVONO: ReadonlySet<AzionePos> = new Set<AzionePos>(["crea", "approva", "emetti", "salva_modello", "archivia_modello", "lavorazioni_ai",
  "prepara_emissione", "completa_emissione", "annulla_emissione"]);
export const scriveAzionePos = (azione: AzionePos): boolean => SCRIVONO.has(azione);
