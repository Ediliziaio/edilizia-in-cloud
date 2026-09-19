/**
 * I numeri e le domande della pagina /offerta-2-mesi-gratis (19/09/2026).
 *
 * In un file a parte perché li leggono anche i test: controllano che i numeri
 * tornino tra loro e che le domande della pagina siano le stesse dei dati
 * strutturati (FAQPage).
 */

// Dal «cheat sheet del prezzo» del manuale della rete vendita. Prezzi IVA esclusa.
export const PIANI_OFFERTA = [
  {
    nome: "Gestionale",
    perChi: "Imprese fino a 500K € di fatturato",
    mensile: "127 €",
    avvio: "490 €",
    primoAnnoMensile: "2.014 €",
    annuale: "1.270 €",
    avvioAnnuale: "Avvio Guidato incluso",
    risparmio: "744 €",
    consigliato: false,
  },
  {
    nome: "Professionista",
    perChi: "Imprese da 500K a 2M € di fatturato",
    mensile: "247 €",
    avvio: "890 €",
    primoAnnoMensile: "3.854 €",
    annuale: "2.470 €",
    avvioAnnuale: "Avvio Guidato incluso",
    risparmio: "1.384 €",
    consigliato: true,
  },
  {
    nome: "Impresa AI",
    perChi: "Oltre 2M € o più sedi",
    mensile: "da 547 €",
    avvio: "2.900 €",
    primoAnnoMensile: "9.464 €",
    annuale: "5.470 €",
    avvioAnnuale: "Avvio Guidato a metà prezzo: 1.450 €",
    risparmio: "2.544 €",
    consigliato: false,
  },
] as const;

export const DOMANDE_OFFERTA = [
  {
    q: "Cosa vuol dire «2 mesi gratis»?",
    a: "Con l'annuale paghi 10 mensilità e usi Edilizia in Cloud per 12 mesi. In più l'Avvio Guidato è incluso: sul mensile si paga a parte.",
  },
  {
    q: "E se dopo qualche settimana mi accorgo che non fa per me?",
    a: "Sull'annuale hai sessanta giorni: se non funziona ti restituiamo i mesi che non hai usato. Il mensile invece lo disdici quando vuoi dal pannello, senza penali.",
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
    q: "I miei dati restano miei?",
    a: "Sì. Li esporti quando vuoi in Excel e PDF, e dopo un'eventuale disdetta hai novanta giorni per scaricare tutto.",
  },
  {
    q: "La demo mi impegna a qualcosa?",
    a: "No. Trenta minuti in videochiamata, senza carta di credito e senza obbligo di acquisto. Alla fine decidi tu.",
  },
  {
    q: "Il prezzo aumenterà?",
    a: "Il canone che firmi non aumenta più finché resti cliente, anche se il listino sale. Vale per i primi cento clienti.",
  },
] as const;
