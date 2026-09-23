/**
 * I dati della pagina /offerta-2-mesi-gratis (19/09/2026).
 *
 * In un file a parte perché li leggono anche i test: controllano che le
 * domande della pagina siano le stesse dei dati strutturati (FAQPage) e che
 * la pagina non torni a promettere l'annuale.
 */

/** La promo «1 mese gratis» vale solo per questo numero di aziende (Florin, 19/09). */
export const POSTI_PROMO = 8;

/** Per chi è, nella riga in cima all'hero. Su telefono si vedono i primi tre. */
export const SETTORI = ["aziende edili", "serramentisti", "fotovoltaico", "impiantisti", "ristrutturazioni"] as const;

export const DOMANDE_OFFERTA = [
  {
    q: "Cosa vuol dire «1 mese gratis»?",
    a: `Che il primo mese di Edilizia in Cloud non lo paghi. La promo è riservata a ${POSTI_PROMO} aziende: quando i posti sono presi, si chiude.`,
  },
  {
    q: `Perché solo ${POSTI_PROMO} aziende?`,
    a: "Perché l'avvio lo seguiamo noi, azienda per azienda: carichiamo cantieri, anagrafiche e listini e formiamo la squadra. Di più, insieme, non li seguiremmo bene.",
  },
  {
    q: "Va bene per il mio settore?",
    a: "È fatto per chi lavora in cantiere: aziende edili, serramentisti, fotovoltaico, impiantisti, ristrutturazioni. In demo lo vediamo sul tuo modo di lavorare, non su un esempio preconfezionato.",
  },
  {
    q: "Quanto ci vuole per partire?",
    a: "Trenta giorni dal via, garantiti: se al trentesimo giorno non sei operativo per causa nostra, il canone non parte finché non lo sei.",
  },
  {
    q: "Devo caricare io tutti i dati?",
    a: "No. Nell'Avvio Guidato cantieri, anagrafiche e listini li carichiamo noi. A te chiediamo i file e tre sessioni con la squadra.",
  },
  {
    q: "E se mi accorgo che non fa per me?",
    a: "Lo disdici quando vuoi dal pannello, senza penali. I tuoi dati li esporti in Excel e PDF, e dopo la disdetta hai novanta giorni per scaricare tutto.",
  },
  {
    q: "La demo mi impegna a qualcosa?",
    a: "No. Trenta minuti in videochiamata, senza carta di credito e senza obbligo di acquisto. Alla fine decidi tu.",
  },
] as const;
