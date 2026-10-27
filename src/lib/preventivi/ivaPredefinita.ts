/**
 * L'IVA di riserva dei preventivi (27/10/2026): quella che vale quando il preventivo, il modello dell'azienda
 * o il progetto non ne indicano una. In edilizia la maggior parte dei lavori è al 10%, quindi è questo il valore
 * per tutti i preventivatori (edili, serramenti, fotovoltaico, classico). Non è un limite: ogni azienda
 * cambia l'aliquota nel proprio modello e ogni preventivo la cambia per sé (0%, 4%, 10%, 22%, o mista dove
 * il modulo la prevede).
 */
export const IVA_PREDEFINITA_PCT = 10;

/** Le aliquote che si propongono come scelta rapida; il campo accetta comunque qualunque valore da 0 a 99. */
export const ALIQUOTE_IVA_COMUNI = [0, 4, 10, 22] as const;
