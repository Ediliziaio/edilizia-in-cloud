import type { TetEditorialContent } from "./fullTettiFactory";

export const sanitariContent: TetEditorialContent = {
  title: "Nuovi gesti quotidiani.\nScelte che si fanno notare.",
  subtitle: "Sanitari e rubinetteria scelti per il tuo bagno: prodotti, compatibilità e montaggio in una proposta chiara, senza rifacimenti impliciti.",
  eyebrow: "SANITARI E RUBINETTERIA", cover: "/module-art/bagni-sanitari-cover.jpg", closingPhoto: null,
  images: [
    { url: "/module-art/bagni-rubinetteria-banner.jpg", name: "Rubinetteria · vista panoramica" },
    { url: "/module-art/bagni-rubinetteria-detail.jpg", name: "Rubinetteria e lavabo · esempio di categoria" },
    { url: "/pdf-stock/bagni/protezione.jpg", name: "Protezione delle parti conservate" },
  ],
  needs: [
    ["Scegliere ciò che serve", "Identificare gli apparecchi da sostituire, quelli da mantenere e le finiture desiderate."],
    ["Verificare la compatibilità", "Misure, attacchi, scarichi e fissaggi devono essere compatibili con i prodotti scelti."],
    ["Conoscere il lavoro incluso", "Distinguere fornitura, smontaggio, montaggio, raccordi e gestione degli elementi rimossi."],
  ],
  solution: [
    ["Scelta su misure reali", "Il rilievo delle parti accessibili guida l'individuazione dei modelli prima dell'ordine."],
    ["Prodotti identificati", "Quantità, caratteristiche, finiture e accessori inclusi vengono indicati nella proposta."],
    ["Sostituzione delimitata", "Collegamenti e montaggi riguardano gli elementi descritti, senza estendere i lavori all'intero bagno."],
  ],
  usp: [
    ["Scelte riconoscibili", "Modelli e finiture concordati restano leggibili nell'offerta."],
    ["Compatibilità prima dell'ordine", "Gli attacchi esistenti non si presumono adatti a ogni prodotto."],
    ["Ambito trasparente", "Nuove forniture, prodotti del cliente e parti conservate sono distinti."],
  ],
  journey: [
    ["01 · Rilevare", "Apparecchi, ingombri e collegamenti accessibili."],
    ["02 · Scegliere", "Prodotti, finiture, accessori e montaggi previsti."],
    ["03 · Sostituire", "Smontaggio e installazione delle sole dotazioni concordate."],
    ["04 · Verificare", "Riscontri sui collegamenti interessati e indicazioni d'uso."],
  ],
  guarantees: [
    ["Forniture definite", "Prodotti e quantità sono quelli confermati nella proposta."],
    ["Parti conservate chiare", "Le sostituzioni non comprendono automaticamente impianti e finiture circostanti."],
    ["Adattamenti concordati", "Incompatibilità e ripristini aggiuntivi vengono valutati prima di procedere."],
    ["Istruzioni alla consegna", "Uso e manutenzione si riferiscono alle dotazioni effettivamente installate."],
  ],
  schedule: [
    ["Rilievo e selezione", "Verifica delle misure accessibili e scelta dei prodotti."],
    ["Conferma e disponibilità", "Ordine, accessori, consegne e appuntamento concordati."],
    ["Smontaggio e montaggio", "Interruzioni programmate e sostituzioni previste."],
    ["Riscontri e consegna", "Controlli dell'ambito interessato e indicazioni di utilizzo."],
  ],
  faq: [
    ["Il modulo comprende tutti i sanitari del bagno?", "No. Comprende solo gli apparecchi e i rubinetti identificati nell'offerta, con quantità, modello o caratteristiche e montaggio. Gli altri elementi restano invariati."],
    ["Posso scegliere qualsiasi sanitario o rubinetto?", "La scelta richiede una verifica di misure, scarico, attacchi, fissaggi e ingombri. Una somiglianza estetica non dimostra la compatibilità; eventuali adattamenti vanno descritti."],
    ["Posso passare da sanitari a terra a sospesi?", "Non è una semplice sostituzione automatica. Supporti, strutture di fissaggio, scarichi e ripristini possono richiedere opere ulteriori, da valutare e preventivare separatamente."],
    ["Posso fornire io i prodotti?", "Sì, se concordato. Vanno chiariti modelli, accessori necessari, compatibilità, disponibilità e responsabilità relative a fornitura e posa. Il prezzo non comprende automaticamente i prodotti del cliente."],
    ["Sono compresi valvole, sifoni, sedili e accessori?", "Solo quelli elencati nella proposta. Componenti di collegamento, sedili, cassette, placche, piletta e accessori possono variare per modello: non si considerano inclusi solo perché presenti nelle immagini."],
    ["Ritiro e smaltimento dei vecchi apparecchi sono inclusi?", "Smontaggio, movimentazione, ritiro e gestione dei materiali rimossi devono essere specificati nelle voci dell'offerta. Non coincidono automaticamente con la sola fornitura del prodotto nuovo."],
    ["Serviranno piastrelle o opere murarie?", "Può emergere la necessità di adattamenti o ripristini. Lavori su pareti, pavimenti, impianti incassati e superfici non descritti non sono compresi; costi e finiture vanno concordati."],
    ["Che cosa viene verificato alla fine?", "Si eseguono i riscontri concordati su montaggio e collegamenti interessati e si consegnano le istruzioni pertinenti. La sostituzione non certifica automaticamente l'intero impianto esistente né garantisce risparmi di consumo."],
  ],
  blocks: {
    comeFunziona: { title: "Una scelta visibile. *Un montaggio da definire*.", intro: "Un sanitario o un rubinetto nuovo deve dialogare con il bagno esistente. Si confermano prodotto, collegamenti e accessori prima dell'ordine, distinguendo fornitura e lavorazioni.", photo: "/module-art/bagni-rubinetteria-banner.jpg", items: [
      ["Rilievo", "Verificare ingombri e collegamenti accessibili degli elementi interessati."],
      ["Selezione", "Identificare modello, quantità, finitura e accessori necessari."],
      ["Sostituzione", "Smontare e installare le dotazioni descritte nella proposta."],
      ["Riscontri", "Controllare quanto concordato e chiarire uso e manutenzione."],
    ] },
    compreso: { title: "Prodotti e montaggio. *Senza sottintesi*.", intro: "La proposta distingue ciò che viene fornito da ciò che viene installato. Fotografie, arredi e accessori illustrativi non ampliano le voci dell'offerta.", items: [
      ["Dotazioni nuove", "Sanitari e rubinetteria identificati per quantità e caratteristiche."],
      ["Smontaggi previsti", "Rimozione e gestione degli elementi espressamente indicati."],
      ["Montaggi e raccordi", "Installazione e componenti di collegamento descritti nel computo."],
      ["Consegna", "Riscontri concordati e istruzioni dei prodotti forniti."],
    ], excluded: [
      ["Rifacimento del bagno", "Superfici, impianti incassati, doccia e arredi non elencati restano esclusi."],
      ["Opere e accessori ulteriori", "Adattamenti murari, strutture per sospesi e componenti non descritti richiedono una proposta dedicata."],
    ] },
    protezione: { title: "Nuove dotazioni. *Il resto si conserva*.", intro: "Si individuano le parti da mantenere e si organizza il passaggio dei materiali. Uso del bagno e interruzioni dell'acqua vanno concordati in base alle sostituzioni previste.", photo: "/pdf-stock/bagni/protezione.jpg", items: [
      ["Superfici", "Identificare pavimento, rivestimenti e arredi da conservare."],
      ["Accessi", "Verificare passaggi e movimentazione degli apparecchi."],
      ["Interruzioni", "Programmare chiusure dell'acqua e disponibilità del bagno."],
      ["Materiali rimossi", "Concordare raccolta e destinazione degli elementi sostituiti."],
    ] },
    controlli: { title: "Nuove dotazioni. *Riscontri mirati*.", intro: "Le verifiche riguardano gli apparecchi e i collegamenti interessati dai lavori. Eventuali anomalie sulle parti conservate vengono segnalate, senza estendere implicitamente l'incarico.", items: [
      ["Identità dei prodotti", "Confrontare modelli, finiture e accessori con la proposta."],
      ["Montaggio", "Riscontrare fissaggi e configurazione delle dotazioni installate."],
      ["Collegamenti", "Eseguire le verifiche concordate sulle parti interessate."],
      ["Utilizzo", "Chiarire funzionamento, pulizia e indicazioni dei produttori."],
    ] },
    documenti: { title: "I prodotti scelti. *Le informazioni da conservare*.", intro: "La documentazione rende riconoscibili fornitura e montaggio. Schede e istruzioni si riferiscono ai prodotti effettivi, non agli esempi fotografici del modello.", items: [
      ["Elenco finale", "Quantità, modelli e finiture concordate, incluse eventuali varianti."],
      ["Schede prodotto", "Informazioni e istruzioni pertinenti alle dotazioni fornite."],
      ["Opere eseguite", "Documenti previsti per le lavorazioni effettivamente comprese."],
      ["Consegna", "Riepilogo delle osservazioni e indicazioni di manutenzione."],
    ] },
    diario: { title: "Dalle vecchie dotazioni alle nuove. *Un riepilogo concreto*.", intro: "Quando previsto, le fotografie reali documentano apparecchi e collegamenti interessati. Le immagini illustrative del modello non costituiscono un prima/dopo aziendale.", items: [
      ["Prima", "Elementi da sostituire e parti circostanti da conservare."],
      ["Durante", "Condizioni accessibili e adattamenti effettivamente concordati."],
      ["Dopo", "Dotazioni consegnate e dettagli delle lavorazioni realizzate."],
    ] },
  },
};
