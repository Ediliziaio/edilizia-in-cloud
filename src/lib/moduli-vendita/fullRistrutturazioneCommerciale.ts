import type { TetEditorialContent } from "./fullTettiFactory";

export const ristrutturazioneCommercialeContent: TetEditorialContent = {
  title: "Spazi che lavorano.\nUn progetto per la tua attività.",
  subtitle: "Opere e finiture per negozi e uffici, con layout, accessi e fasi da concordare prima dell'avvio.",
  eyebrow: "NEGOZI E UFFICI",
  cover: "/module-art/ristrutturazioni-commerciale-cover.jpg",
  closingPhoto: null,
  images: [
    { url: "/module-art/ristrutturazioni-commerciale-cantiere.jpg", name: "Organizzazione di un cantiere interno commerciale" },
    { url: "/pdf-stock/ristrutturazione/controllo-planarita.jpg", name: "Riscontro del supporto nelle zone interessate" },
  ],
  needs: [
    ["Spazi per l'attività", "Riconoscere accoglienza, vendita, lavoro e servizio, con esigenze e dotazioni descritte per ciascuna zona."],
    ["Fasi compatibili", "Definire accessi, consegne, orari e possibili interruzioni prima di fissare il calendario dell'intervento."],
    ["Un'offerta leggibile", "Separare opere edili, impianti, allestimento e incarichi esterni, senza confondere ciò che è previsto con ciò che è illustrato."],
  ],
  solution: [
    ["Layout condiviso", "Le lavorazioni seguono la distribuzione concordata e le esigenze d'uso raccolte. Modifiche e dotazioni vengono identificate nel computo."],
    ["Sequenza concordata", "Aree disponibili, forniture e interferenze guidano le fasi. L'eventuale apertura durante i lavori richiede una valutazione specifica."],
    ["Consegna per ambiti", "Opere, verifiche e documenti si riepilogano per le parti effettivamente comprese, distinguendo gli adempimenti esterni all'offerta."],
  ],
  usp: [
    ["Funzioni prima delle finiture", "Scelte collegate a percorsi, postazioni e modalità di utilizzo del locale."],
    ["Interferenze esplicite", "Accessi, utenze e indisponibilità da concordare senza promesse generiche di zero fermo."],
    ["Forniture riconoscibili", "Opere, arredi e attrezzature separati, con responsabilità e limiti scritti."],
  ],
  journey: [
    ["01 · Ascoltare", "Attività, zone, dotazioni e vincoli da considerare."],
    ["02 · Definire", "Layout, materiali, ambito e condizioni dell'offerta."],
    ["03 · Coordinare", "Fasi, accessi, forniture e interferenze concordate."],
    ["04 · Consegnare", "Riscontri delle opere e riepilogo delle attività residue."],
  ],
  guarantees: [
    ["Ambito scritto", "L'offerta distingue lavorazioni comprese, forniture del cliente e incarichi separati."],
    ["Varianti riconoscibili", "Le modifiche si descrivono con impatto su prezzo e calendario prima della conferma."],
    ["Verifiche pertinenti", "I riscontri riguardano le opere e gli impianti effettivamente interessati."],
    ["Riferimenti alla consegna", "Documenti e assistenza sono riferiti alle forniture eseguite e alle condizioni applicabili."],
  ],
  schedule: [
    ["Rilievo e layout", "Esigenze operative, condizioni accessibili e scelte da confermare."],
    ["Preparazione del locale", "Disponibilità delle aree, protezioni e programmazione delle consegne."],
    ["Opere e finiture", "Sequenza delle lavorazioni e coordinamento delle forniture comprese."],
    ["Riscontri e consegna", "Verifiche concordate, documenti pertinenti ed eventuali attività residue."],
  ],
  faq: [
    ["Il modulo va bene sia per un negozio sia per un ufficio?", "Sì, come struttura di proposta. Layout, dotazioni, impianti e condizioni vanno adattati all'attività e al locale specifici; il titolo non rende identici i due interventi."],
    ["Posso mantenere aperta l'attività durante i lavori?", "Non è automatico. Accessi, polvere, rumore, utenze e interferenze devono essere valutati. Aree utilizzabili, eventuali chiusure e orari si concordano prima dell'avvio."],
    ["Sono inclusi banconi, scrivanie e attrezzature?", "Solo se identificati nelle voci dell'offerta. Gli elementi nelle immagini sono illustrativi e non definiscono la fornitura; allestimento e attrezzature possono restare a carico del cliente."],
    ["La proposta comprende tutte le pratiche per l'apertura?", "Non automaticamente. Incarichi tecnici, verifiche e pratiche devono essere elencati con responsabili e limiti. La consegna delle opere non equivale da sola all'autorizzazione all'esercizio."],
    ["Gli impianti esistenti vengono rifatti completamente?", "Soltanto quando previsto nel computo. Occorre distinguere parti mantenute, modifiche e nuove dotazioni; eventuali necessità emerse si valutano separatamente."],
    ["Sono compresi lavori serali o nel fine settimana?", "Solo se concordati e riportati nella proposta. Orari particolari possono incidere su disponibilità, costi e calendario, e non sono presunti dal tipo di attività."],
    ["La data di riapertura è garantita?", "Il programma dipende da scelte, disponibilità del locale, forniture, lavorazioni e attività esterne. Le date e le relative condizioni si confermano sul caso concreto."],
    ["Come vengono gestite le modifiche al layout?", "La modifica si descrive e si valuta rispetto alle opere già eseguite, agli ordini e alle fasi successive. Prezzo, tempi e responsabilità vengono confermati prima dell'esecuzione."],
  ],
  blocks: {
    comeFunziona: { title: "Dal layout alle opere. *Scelte collegate*.", intro: "Il locale viene letto per funzioni e zone. La proposta traduce le decisioni condivise in lavorazioni e forniture riconoscibili.", photo: "/module-art/ristrutturazioni-commerciale-cantiere.jpg", items: [
      ["Funzioni", "Accoglienza, vendita, postazioni e servizio da definire sul locale."],
      ["Distribuzione", "Pareti, passaggi e aperture riferiti al layout concordato."],
      ["Dotazioni", "Impianti e predisposizioni identificati per le zone interessate."],
      ["Finiture", "Materiali e dettagli scelti in relazione all'uso previsto."],
    ] },
    compreso: { title: "Il tuo investimento. *Il suo perimetro*.", intro: "La sintesi si legge insieme al computo. Descrizioni e quantità confermate definiscono la fornitura, non le immagini di ambientazione.", items: [
      ["Preparazioni", "Protezioni, accessi e rimozioni nelle sole zone indicate."],
      ["Opere interne", "Partizioni, supporti e lavorazioni descritti nel computo."],
      ["Impianti previsti", "Interventi e predisposizioni espressamente identificati."],
      ["Finiture e consegna", "Materiali, ripristini e riscontri compresi nella proposta."],
    ], excluded: [
      ["Allestimento e attrezzature", "Arredi, insegne, dispositivi e forniture non elencati restano fuori dall'offerta."],
      ["Incarichi e attività esterne", "Pratiche, progettazioni, verifiche specialistiche e opere non descritte richiedono un ambito separato."],
    ] },
    protezione: { title: "Organizzare il cantiere. *Conoscere le interferenze*.", intro: "La foto illustra un locale non operativo durante i lavori. Protezioni, separazioni e accessi devono essere definiti per le condizioni reali, senza presumere la continuità dell'attività.", photo: "/module-art/ristrutturazioni-commerciale-cantiere.jpg", items: [
      ["Zone di lavoro", "Definire aree disponibili e parti da mantenere separate."],
      ["Accessi e consegne", "Concordare passaggi, carico e scarico, deposito e orari."],
      ["Beni conservati", "Individuare arredi e apparecchiature da spostare o proteggere."],
      ["Interruzioni", "Programmare indisponibilità delle utenze e limitazioni d'uso."],
    ] },
    controlli: { title: "Verificare le opere. *Raccogliere i riscontri*.", intro: "I controlli si riferiscono al perimetro eseguito e alle verifiche concordate. Il modello non attesta l'idoneità dell'intero locale per una specifica attività.", photo: "/pdf-stock/ristrutturazione/controllo-planarita.jpg", items: [
      ["Layout eseguito", "Riscontro delle posizioni e delle parti previste dal progetto."],
      ["Supporti e finiture", "Controlli pertinenti alle superfici e ai materiali posati."],
      ["Dotazioni interessate", "Verifiche concordate sui soli interventi impiantistici compresi."],
      ["Attività residue", "Registrare riserve, completamenti e responsabilità alla consegna."],
    ] },
    documenti: { title: "Una consegna leggibile. *Ruoli distinti*.", intro: "Documenti delle opere e adempimenti dell'attività non sono la stessa cosa. Ogni voce deve indicare che cosa viene consegnato e da chi. La foto illustra la consultazione di elaborati in un cantiere generico, non il locale o i documenti consegnati al cliente.", photo: "/pdf-stock/ristrutturazione/cantiere.jpg", items: [
      ["Ambito finale", "Lavorazioni eseguite, varianti e parti rimaste escluse."],
      ["Forniture", "Schede e indicazioni disponibili per i materiali installati."],
      ["Impianti", "Documentazione applicabile ai soli interventi realizzati."],
      ["Incarichi separati", "Elenco delle attività esterne ancora necessarie o da verificare."],
    ] },
    diario: { title: "Seguire le fasi. *Documentare le scelte*.", intro: "Quando concordato, il diario raccoglie foto reali delle zone interessate. Le immagini illustrative del modello non documentano il tuo locale.", items: [
      ["Prima dei lavori", "Stato delle aree accessibili e parti da conservare."],
      ["Durante le fasi", "Passaggi utili, predisposizioni e varianti concordate."],
      ["Alla consegna", "Opere terminate e dettagli collegati alle eventuali riserve."],
    ] },
  },
};
