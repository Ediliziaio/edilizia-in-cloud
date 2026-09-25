import type { TetEditorialContent } from "./fullTettiFactory";
export const vascaDocciaContent: TetEditorialContent = {
  title: "Dalla vasca alla doccia.\nPiù spazio al quotidiano.",
  subtitle: "Una trasformazione mirata: nuova zona doccia, raccordi e finiture definiti, con attenzione alle parti del bagno da conservare.",
  eyebrow: "DA VASCA A DOCCIA", cover: "/module-art/bagni-vasca-doccia-cover.jpg", closingPhoto: null,
  images: [
    { url: "/pdf-stock/bagni/installazione.jpg", name: "Preparazione della zona doccia" },
    { url: "/pdf-stock/bagni/protezione.jpg", name: "Protezione dei percorsi e delle parti conservate" },
  ],
  needs: [
    ["Cambiare l'uso dello spazio", "Sostituire la vasca con una doccia scelta sulle misure disponibili e sulle abitudini quotidiane."],
    ["Conservare il resto del bagno", "Riconoscere superfici, sanitari e impianti che restano, insieme ai raccordi da rifinire."],
    ["Capire prima la configurazione", "Chiarire piatto, chiusura, rubinetteria, quota di ingresso e interventi sugli attacchi."],
  ],
  solution: [
    ["Rilievo dell'area vasca", "Misure, scarico e supporti accessibili guidano la soluzione; la quota del piatto non viene presunta."],
    ["Trasformazione delimitata", "Rimozione, predisposizioni e finiture riguardano la zona descritta, non il rifacimento integrale del bagno."],
    ["Dotazioni riconoscibili", "Prodotti, dimensioni, modalità di apertura e finiture si confermano nella proposta prima dell'ordine."],
  ],
  usp: [
    ["Configurazione prima dell'ordine", "Ingombri e compatibilità si verificano sulle condizioni reali."],
    ["Confini chiari", "L'offerta distingue area trasformata e parti conservate."],
    ["Varianti esplicite", "Condizioni nascoste e ripristini aggiuntivi si valutano prima di procedere."],
  ],
  journey: [
    ["01 · Rilevare", "Misure, accessi, scarico e parti da mantenere."],
    ["02 · Definire", "Piatto, chiusura, rubinetteria e raccordi."],
    ["03 · Trasformare", "Rimozione vasca e opere della zona concordata."],
    ["04 · Verificare", "Riscontri finali e indicazioni di utilizzo."],
  ],
  guarantees: [
    ["Ambito delimitato", "Opere e superfici interessate sono quelle identificate nel computo."],
    ["Prodotti concordati", "Dimensioni e dotazioni corrispondono alla configurazione confermata."],
    ["Nessun imprevisto implicito", "Problemi emersi vengono descritti con eventuali costi e tempi aggiuntivi."],
    ["Consegna comprensibile", "Istruzioni e riscontri si riferiscono alla zona doccia effettivamente realizzata."],
  ],
  schedule: [
    ["Rilievo e conferma", "Definizione di misure, prodotti, accessi e parti conservate."],
    ["Rimozione della vasca", "Protezioni, rimozione e verifica delle condizioni emerse."],
    ["Preparazione e montaggio", "Raccordi, supporti, superfici e installazioni previste."],
    ["Riscontri e utilizzo", "Verifiche concordate e tempi d'uso secondo i materiali impiegati."],
  ],
  faq: [
    ["Devo rifare tutto il bagno?", "Il modulo riguarda la sostituzione della vasca nella zona individuata. Altre superfici, sanitari e impianti non sono inclusi automaticamente: si descrivono le parti mantenute e gli eventuali raccordi necessari."],
    ["La doccia sarà a filo pavimento?", "Non è una condizione automatica. Quota dello scarico, spessori disponibili e prodotto scelto vanno verificati. L'offerta deve indicare la configurazione realizzabile; la fotografia non è un progetto del tuo bagno."],
    ["La nuova doccia sarà accessibile a tutti?", "Sostituire la vasca non equivale a rendere accessibile l'intero bagno. Esigenze personali, spazi, ingresso, apertura e ausili richiedono una valutazione dedicata e prodotti espressamente descritti."],
    ["Si possono mantenere i rivestimenti esistenti?", "Va verificato dopo il rilievo e, per le parti nascoste, dopo la rimozione. Disponibilità di materiali uguali, differenze di colore e raccordi devono essere chiariti; non si promette un ripristino invisibile."],
    ["Quanto dura la trasformazione?", "Dipende da supporti, attacchi, forniture e tempi tecnici dei materiali. Calendario, interruzioni e momento in cui usare la doccia si concordano; non è garantita una conclusione in giornata."],
    ["Piatto, chiusura e rubinetteria sono compresi?", "Soltanto quelli identificati nell'offerta, con quantità, caratteristiche e montaggio. Accessori, sedute e maniglioni presenti nelle immagini o richiesti successivamente non sono inclusi implicitamente."],
    ["Che cosa succede se emerge una perdita o uno scarico non adatto?", "Si descrive la condizione e si valuta la soluzione, distinguendo le opere già comprese dalle aggiunte. Eventuali costi e variazioni dei tempi devono essere concordati prima di eseguire le opere ulteriori."],
    ["Che cosa ricevo alla consegna?", "Indicazioni d'uso e manutenzione dei prodotti forniti, riscontri concordati e documenti pertinenti alle opere eseguite. Non viene attestato automaticamente l'intero impianto esistente o l'accessibilità del bagno."],
  ],
  blocks: {
    comeFunziona: { title: "Una zona cambia. *Il resto si conserva*.", intro: "La trasformazione parte dallo spazio della vasca. La soluzione collega piatto, scarico, superfici e chiusura alle condizioni reali, senza promettere quote o tempi standard.", photo: "/pdf-stock/bagni/installazione.jpg", items: [
      ["Rimozione", "Individuare la vasca e le parti da rimuovere o mantenere."],
      ["Attacchi e quote", "Verificare collegamenti e configurazione del nuovo piatto."],
      ["Supporti e raccordi", "Definire preparazioni, protezioni dall'acqua e finiture locali."],
      ["Nuova doccia", "Installare le dotazioni della configurazione confermata."],
    ] },
    compreso: { title: "La trasformazione. *Con confini riconoscibili*.", intro: "La proposta identifica la zona interessata e le forniture. Una foto di doccia non include automaticamente accessori o rifacimenti delle parti circostanti.", items: [
      ["Vasca esistente", "Protezioni, rimozione e movimentazioni descritte nel computo."],
      ["Predisposizioni locali", "Attacchi e supporti limitati ai tratti individuati."],
      ["Dotazioni scelte", "Piatto, chiusura e rubinetteria espressamente elencati."],
      ["Raccordi e riscontri", "Finiture locali e verifiche previste per la zona trasformata."],
    ], excluded: [
      ["Rifacimento integrale", "Altri sanitari, superfici e impianti non descritti restano esclusi."],
      ["Opere o accessori ulteriori", "Ripristini estesi, ausili, pratiche e prodotti non elencati richiedono una proposta separata."],
    ] },
    protezione: { title: "Intervenire in un punto. *Proteggere ciò che rimane*.", intro: "Si organizzano passaggi, rimozione della vasca e interruzioni sulle condizioni della casa. Protezioni e limitazioni si concordano senza promettere assenza totale di polvere o disagio.", photo: "/pdf-stock/bagni/protezione.jpg", items: [
      ["Parti mantenute", "Identificare sanitari e finiture da conservare attorno alla vasca."],
      ["Movimentazione", "Verificare accessi e percorso di uscita degli elementi rimossi."],
      ["Separazione", "Concordare le protezioni e le zone temporaneamente non utilizzabili."],
      ["Utenze", "Programmare interruzioni dell'acqua e ripristino dell'uso."],
    ] },
    controlli: { title: "Prima di usare la doccia. *I riscontri concordati*.", intro: "Si controllano le opere e le dotazioni installate, non le parti estranee all'intervento. Eventuali osservazioni vengono registrate alla consegna.", items: [
      ["Configurazione", "Confrontare dimensioni e prodotti con la proposta confermata."],
      ["Collegamenti", "Riscontrare gli attacchi e lo scarico interessati dalle opere."],
      ["Chiusura e raccordi", "Controllare apertura, montaggio e finiture realizzate."],
      ["Primo utilizzo", "Chiarire attese, pulizia e manutenzione dei materiali impiegati."],
    ] },
    documenti: { title: "La nuova zona doccia. *Informazioni da conservare*.", intro: "Prodotti installati, ambito e indicazioni d'uso devono restare riconoscibili. La documentazione non estende l'intervento a tutto il bagno.", items: [
      ["Configurazione finale", "Proposta e varianti con le dotazioni effettivamente scelte."],
      ["Schede prodotto", "Istruzioni pertinenti a piatto, chiusura e rubinetteria forniti."],
      ["Opere eseguite", "Documenti previsti per gli interventi effettivamente compresi."],
      ["Uso e manutenzione", "Indicazioni e riepilogo delle osservazioni alla consegna."],
    ] },
    diario: { title: "Dalla vasca alla doccia. *Il tuo intervento documentato*.", intro: "Quando previsto, si raccolgono foto reali delle parti interessate. Le immagini illustrative del modello non vengono presentate come un prima/dopo del tuo bagno.", items: [
      ["Prima", "Vasca, parti conservate e condizioni accessibili rilevate."],
      ["Durante", "Supporti e raccordi emersi prima delle finiture."],
      ["Dopo", "Configurazione consegnata e dettagli delle opere realizzate."],
    ] },
  },
};
