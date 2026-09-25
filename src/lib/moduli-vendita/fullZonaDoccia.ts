import type { TetEditorialContent } from "./fullTettiFactory";

export const zonaDocciaContent: TetEditorialContent = {
  title: "La tua doccia, rinnovata.\nOgni dettaglio conta.",
  subtitle: "Supporti, superfici e dotazioni della doccia esistente: un intervento definito sulle condizioni reali, con attenzione al bagno che rimane.",
  eyebrow: "RIFACIMENTO ZONA DOCCIA", cover: "/module-art/bagni-doccia-cover.jpg", closingPhoto: null,
  images: [
    { url: "/pdf-stock/bagni/installazione.jpg", name: "Preparazione dei supporti della doccia" },
    { url: "/pdf-stock/bagni/controllo-impermeabilizzazione.jpg", name: "Riscontri sulle parti trattate" },
    { url: "/pdf-stock/bagni/protezione.jpg", name: "Protezione del bagno conservato" },
  ],
  needs: [
    ["Rinnovare la doccia esistente", "Individuare piatto, chiusura, rubinetteria e superfici da sostituire o conservare."],
    ["Capire che cosa c'è sotto", "Valutare supporti, raccordi e scarico senza fermarsi alla sola finitura visibile."],
    ["Proteggere il resto del bagno", "Delimitare le opere, i passaggi e i raccordi con le parti che restano."],
  ],
  solution: [
    ["Rilievo e ambito", "Misure, parti accessibili e obiettivi guidano una proposta riferita alla doccia esistente."],
    ["Opere collegate", "Preparazioni, protezioni dall'acqua, finiture e dotazioni sono descritte come parti di un unico intervento."],
    ["Scelte e riscontri", "Prodotti e configurazione si confermano prima dell'ordine; controlli e indicazioni d'uso accompagnano la consegna."],
  ],
  usp: [
    ["Oltre la superficie", "L'offerta distingue finiture e lavorazioni sui supporti interessati."],
    ["Ciò che resta è chiaro", "Parti conservate e raccordi hanno un perimetro riconoscibile."],
    ["Decisioni documentate", "Prodotti, varianti e osservazioni restano leggibili nella proposta."],
  ],
  journey: [
    ["01 · Rilevare", "Doccia esistente, misure, condizioni visibili e obiettivi."],
    ["02 · Concordare", "Opere, prodotti, parti conservate e raccordi."],
    ["03 · Rinnovare", "Rimozioni, preparazioni e montaggio della configurazione scelta."],
    ["04 · Consegnare", "Riscontri concordati e istruzioni per il primo utilizzo."],
  ],
  guarantees: [
    ["Ambito identificato", "Si distinguono doccia interessata, raccordi e parti escluse."],
    ["Materiali riconoscibili", "La proposta identifica prodotti e finiture effettivamente forniti."],
    ["Varianti concordate", "Condizioni nascoste e lavorazioni ulteriori si valutano prima di eseguirle."],
    ["Consegna documentata", "Riscontri e istruzioni riguardano le opere realmente eseguite."],
  ],
  schedule: [
    ["Rilievo e scelte", "Conferma di ambito, prodotti, accessi e interruzioni."],
    ["Rimozioni mirate", "Smontaggi previsti e osservazione dei supporti accessibili."],
    ["Preparazioni e finiture", "Lavorazioni concordate, rispettando i tempi dei materiali."],
    ["Montaggio e consegna", "Dotazioni, riscontri finali e indicazioni per l'utilizzo."],
  ],
  faq: [
    ["È lo stesso intervento della sostituzione vasca?", "No. Si parte da una doccia esistente. Le opere riguardano le sue dotazioni, i supporti e le superfici indicati; la rimozione di una vasca e il rifacimento dell'intero bagno non sono inclusi automaticamente."],
    ["Basta cambiare il piatto o il box?", "Dipende dall'obiettivo e dalle condizioni rilevate. Il solo cambio di una dotazione non implica il rifacimento dei supporti, delle protezioni dall'acqua o degli impianti: queste opere devono essere descritte."],
    ["Il rifacimento risolverà qualsiasi infiltrazione?", "Non si promette una soluzione senza individuare la causa e l'ambito interessato. Una perdita può riguardare anche parti esterne alla doccia o non accessibili; indagini e opere ulteriori vanno definite separatamente."],
    ["Piatto, chiusura e rubinetteria sono tutti nuovi?", "Solo i prodotti identificati come nuove forniture nell'offerta. Gli elementi mantenuti o forniti dal cliente vanno indicati; immagini, accessori e arredi non ampliano quanto compreso."],
    ["La doccia può diventare a filo pavimento?", "Quote, scarico, spessori e prodotti devono essere verificati sul posto. Non è una caratteristica automatica del rifacimento, né una garanzia di accessibilità dell'intero bagno."],
    ["Le nuove piastrelle saranno uguali a quelle esistenti?", "Reperibilità, formati e differenze di tono vanno verificati. Raccordi e finiture si concordano prima: non si presume un ripristino invisibile o l'estensione del rivestimento a tutto il bagno."],
    ["Quando posso tornare a usare la doccia?", "Dipende dalle lavorazioni e dai tempi indicati per adesivi, trattamenti e sigillature impiegati. Calendario e primo utilizzo si concordano; non è prevista una durata standard garantita."],
    ["Che documenti e controlli sono previsti?", "La proposta descrive i riscontri concordati e i documenti pertinenti alle opere e ai prodotti installati. Le verifiche della zona rinnovata non attestano automaticamente tutto l'impianto esistente."],
  ],
  blocks: {
    comeFunziona: { title: "Rinnovare la doccia. *Dalle basi alle finiture*.", intro: "La doccia è fatta di parti collegate: supporti, scarico, superfici e dotazioni. L'offerta chiarisce quali si rinnovano e quali rimangono, senza prescrivere una soluzione prima del rilievo.", photo: "/pdf-stock/bagni/installazione.jpg", items: [
      ["Smontaggi", "Individuare gli elementi e le superfici da rimuovere."],
      ["Supporti", "Valutare le condizioni emerse e le preparazioni necessarie."],
      ["Acqua e raccordi", "Definire scarico, collegamenti e protezioni delle parti interessate."],
      ["Finiture e dotazioni", "Posare e montare quanto previsto dalla configurazione confermata."],
    ] },
    compreso: { title: "Una doccia rinnovata. *Un ambito preciso*.", intro: "La proposta non coincide con una fotografia: forniture, superfici e lavorazioni comprese sono quelle elencate nel computo confermato.", items: [
      ["Preparazioni e rimozioni", "Protezioni e smontaggi riferiti alle parti individuate."],
      ["Supporti e raccordi", "Lavorazioni descritte sulle superfici e sui collegamenti interessati."],
      ["Finiture previste", "Materiali e posa per la zona doccia e i raccordi indicati."],
      ["Dotazioni e riscontri", "Prodotti concordati, montaggio e verifiche dell'intervento."],
    ], excluded: [
      ["Resto del bagno", "Sanitari, impianti e superfici esterni all'ambito descritto non sono compresi."],
      ["Ulteriori indagini e opere", "Cause esterne di infiltrazione, ripristini estesi e accessori non elencati richiedono una valutazione separata."],
    ] },
    protezione: { title: "Rinnovare un'area. *Conservare ciò che la circonda*.", intro: "Percorsi, dotazioni mantenute e interruzioni vengono organizzati sulle condizioni reali. Le protezioni riducono le interferenze, senza promettere assenza di polvere o disagio.", photo: "/pdf-stock/bagni/protezione.jpg", items: [
      ["Parti conservate", "Identificare sanitari, arredi e superfici da mantenere."],
      ["Passaggi", "Concordare accessi e movimentazione dei materiali rimossi."],
      ["Separazioni", "Definire protezioni e zone temporaneamente non utilizzabili."],
      ["Interruzioni", "Programmare disponibilità dell'acqua e limitazioni d'uso."],
    ] },
    controlli: { title: "Prima della consegna. *Controllare le parti rinnovate*.", intro: "I riscontri riguardano l'ambito concordato. L'immagine è illustrativa, non una prova di tenuta o un'attestazione del bagno; modalità e verifiche vanno definite per il caso reale.", photo: "/pdf-stock/bagni/controllo-impermeabilizzazione.jpg", items: [
      ["Supporti e raccordi", "Raccogliere i riscontri previsti prima di coprire le parti interessate."],
      ["Prodotti e montaggio", "Confrontare dotazioni installate e configurazione confermata."],
      ["Uso della doccia", "Riscontrare i collegamenti e il funzionamento delle parti oggetto dei lavori."],
      ["Osservazioni", "Registrare quanto emerso e le indicazioni per il primo utilizzo."],
    ] },
    documenti: { title: "Le scelte restano. *Anche dopo i lavori*.", intro: "Si conserva un riepilogo comprensibile della zona rinnovata e dei prodotti forniti. Documenti e istruzioni non estendono la proposta a parti escluse.", items: [
      ["Configurazione finale", "Offerta e varianti con opere, prodotti e parti mantenute."],
      ["Schede e istruzioni", "Informazioni pertinenti alle dotazioni e ai materiali forniti."],
      ["Opere interessate", "Documenti previsti per gli interventi effettivamente eseguiti."],
      ["Consegna", "Riscontri concordati, osservazioni e indicazioni di manutenzione."],
    ] },
    diario: { title: "Il rinnovo, documentato. *Nelle parti che contano*.", intro: "Se previsto nell'incarico, il diario raccoglie foto reali prima, durante e dopo le opere. Le illustrazioni del modello non sono prove del tuo intervento.", items: [
      ["Prima", "Doccia esistente e parti circostanti da mantenere."],
      ["Durante", "Condizioni emerse e lavorazioni prima delle finiture."],
      ["Dopo", "Zona consegnata, dotazioni installate e raccordi realizzati."],
    ] },
  },
};
