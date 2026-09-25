import type { TetEditorialContent } from "./fullTettiFactory";

export const ristrutturazioneSpaziContent: TetEditorialContent = {
  title: "Nuovi spazi.\nLa stessa casa, ripensata.",
  subtitle: "Una nuova disposizione degli ambienti, con pareti, passaggi, impianti interessati e ripristini descritti nel progetto.",
  eyebrow: "REDISTRIBUZIONE DEGLI SPAZI",
  cover: "/module-art/ristrutturazioni-spazi-cover.jpg",
  closingPhoto: null,
  images: [
    { url: "/pdf-stock/ristrutturazione/cantiere-ordinato.jpg", name: "Ambiente in lavorazione, esempio di organizzazione" },
    { url: "/pdf-stock/ristrutturazione/protezione-scale.jpg", name: "Protezione dei percorsi conservati" },
  ],
  needs: [
    ["Una disposizione più adatta", "Collegare stanze, passaggi e funzioni alle esigenze reali, prima di scegliere quali pareti modificare."],
    ["Capire le interferenze", "Individuare gli elementi interessati e le verifiche necessarie, senza dedurre da una foto che una parete sia rimovibile."],
    ["Conoscere le opere connesse", "Rendere visibili spostamenti, raccordi e ripristini che accompagnano la nuova distribuzione."],
  ],
  solution: [
    ["Un layout riconoscibile", "Ambienti, pareti e aperture sono identificati negli elaborati condivisi e richiamati nelle lavorazioni."],
    ["Un perimetro verificato", "Le opere si definiscono dopo i riscontri sul caso concreto e la conferma degli incarichi tecnici necessari."],
    ["Raccordi descritti", "Impianti interessati, pavimenti, soffitti e finiture vengono elencati con limiti e quantità, non lasciati impliciti."],
  ],
  usp: [
    ["Prima lo spazio", "Le scelte nascono dall'uso degli ambienti e dalle condizioni effettive dell'immobile."],
    ["Confini tecnici chiari", "Il preventivo non sostituisce le verifiche e non presume la natura delle pareti."],
    ["Opere connesse visibili", "Rimozioni, nuove parti, modifiche impiantistiche e ripristini si leggono separatamente."],
  ],
  journey: [
    ["01 · Rilevare", "Stato attuale, esigenze, parti conservate e interferenze."],
    ["02 · Definire", "Layout, verifiche, incarichi e perimetro dell'offerta."],
    ["03 · Realizzare", "Sequenza concordata di rimozioni, nuove parti e raccordi."],
    ["04 · Riconsegnare", "Riscontri delle opere, documenti pertinenti e attività residue."],
  ],
  guarantees: [
    ["Layout condiviso", "Le lavorazioni fanno riferimento alla disposizione e alle scelte confermate."],
    ["Ambito riconoscibile", "Pareti, aperture e impianti interessati vengono distinti dalle parti conservate."],
    ["Varianti concordate", "Nuove esigenze o condizioni emerse si valutano con prezzo e tempi prima della conferma."],
    ["Consegna documentata", "Riscontri e documenti riguardano le opere eseguite e gli incarichi effettivamente previsti."],
  ],
  schedule: [
    ["Rilievo e definizione", "Layout, verifiche e incarichi da confermare prima delle opere."],
    ["Preparazioni e rimozioni", "Disponibilità degli ambienti, protezioni e rimozioni previste."],
    ["Nuove parti e raccordi", "Pareti, aperture e modifiche impiantistiche comprese."],
    ["Ripristini e consegna", "Finiture, riscontri, documenti e riepilogo finale."],
  ],
  faq: [
    ["Posso eliminare qualsiasi parete?", "Non si può presumere dal modello o dalle fotografie. Natura delle pareti, condizioni dell'edificio e interferenze vanno valutate sul caso concreto prima di definire le opere."],
    ["Il preventivo comprende il progetto e le pratiche?", "Solo se elencati con ambito, responsabili e condizioni. La proposta economica non sostituisce gli elaborati e le verifiche necessari per l'intervento."],
    ["Le immagini rappresentano la nuova disposizione della mia casa?", "No: sono esempi illustrativi. Il layout effettivo deve essere riconoscibile negli elaborati condivisi; arredi e divisori fotografati non sono forniture incluse automaticamente."],
    ["Lo spostamento di una parete comprende anche gli impianti?", "Solo per gli interventi descritti nel computo. Prese, linee, tubazioni e altri elementi interessati devono essere individuati e valutati, senza presumere un rifacimento completo."],
    ["Sono inclusi pavimenti, soffitti e tinteggiature?", "Soltanto entro le superfici e le lavorazioni indicate. Raccordi locali e rifacimenti integrali sono ambiti diversi, da confermare prima dell'esecuzione."],
    ["Le nuove finiture saranno uguali a quelle esistenti?", "Disponibilità, usura e lotti possono creare differenze. Materiali, soglie e modalità di raccordo si scelgono prima della posa e si descrivono nella proposta."],
    ["Posso abitare la casa durante i lavori?", "Dipende da accessi, polvere, rumore, utenze e fasi. Aree utilizzabili ed eventuali interruzioni si concordano in base alle condizioni reali, senza automatismi."],
    ["Che cosa succede se cambio il layout dopo la conferma?", "La variante viene valutata rispetto alle opere già eseguite e alle forniture ordinate. Nuovo perimetro, costi e calendario devono essere confermati prima di procedere."],
  ],
  blocks: {
    comeFunziona: { title: "Una nuova disposizione. *Ogni opera al suo posto*.", intro: "Gli elaborati distinguono stato attuale e proposta. Il computo collega le scelte alle opere necessarie, senza attribuire alle immagini un valore di progetto.", photo: "/pdf-stock/ristrutturazione/cantiere-ordinato.jpg", items: [
      ["Pareti e aperture", "Elementi da mantenere, modificare o realizzare, identificati nel progetto."],
      ["Impianti interessati", "Spostamenti e predisposizioni previsti per la nuova configurazione."],
      ["Raccordi", "Punti di incontro con pavimenti, soffitti e parti conservate."],
      ["Finiture", "Superfici e materiali compresi, con limiti riconoscibili."],
    ] },
    compreso: { title: "Le opere del progetto. *Il perimetro del prezzo*.", intro: "Descrizioni e quantità confermate definiscono la proposta. La redistribuzione non comprende automaticamente il rinnovo dell'intera abitazione.", items: [
      ["Preparazione", "Protezioni e organizzazione degli accessi nelle zone previste."],
      ["Rimozioni e nuove parti", "Pareti, aperture e lavorazioni espressamente identificate."],
      ["Modifiche connesse", "Interventi sugli impianti solo dove descritti nel computo."],
      ["Ripristini", "Raccordi e finiture entro le superfici e le quantità concordate."],
    ], excluded: [
      ["Opere e incarichi non descritti", "Interventi strutturali, progettazioni e pratiche non elencati richiedono un ambito distinto."],
      ["Rinnovi e forniture ulteriori", "Rifacimenti integrali, arredi e dotazioni non identificati restano fuori dalla proposta."],
    ] },
    protezione: { title: "Cambiare gli ambienti. *Custodire ciò che resta*.", intro: "Protezioni, passaggi e zone disponibili devono essere definiti in funzione delle lavorazioni. La foto è un esempio, non il piano del tuo cantiere.", photo: "/pdf-stock/ristrutturazione/protezione-scale.jpg", items: [
      ["Parti conservate", "Individuare porte, finiture e superfici che rimangono in opera."],
      ["Percorsi", "Concordare accessi, transito e movimentazione dei materiali."],
      ["Arredi e oggetti", "Definire sgombero, protezione e responsabilità di custodia."],
      ["Utenze e utilizzo", "Concordare interruzioni e limitazioni durante le fasi."],
    ] },
    controlli: { title: "Dal disegno agli ambienti. *Riscontri puntuali*.", intro: "Le verifiche riguardano le opere effettivamente comprese. Non costituiscono un'attestazione automatica delle parti dell'immobile rimaste escluse.", items: [
      ["Posizioni", "Confrontare le nuove parti con il layout e le scelte confermate."],
      ["Passaggi", "Riscontrare aperture e ingombri previsti per le zone interessate."],
      ["Raccordi", "Controllare finiture e collegamenti compresi nella proposta."],
      ["Consegna", "Registrare esiti, riserve ed eventuali completamenti."],
    ] },
    documenti: { title: "La nuova disposizione. *I suoi riferimenti*.", intro: "La documentazione deve chiarire che cosa è stato eseguito e quali incarichi sono compresi. Gli elaborati non vengono sostituiti dalle foto del modello.", items: [
      ["Elaborati condivisi", "Riferimenti del layout e delle revisioni confermate."],
      ["Varianti", "Modifiche concordate con il relativo ambito finale."],
      ["Opere e impianti", "Documenti pertinenti alle sole lavorazioni realizzate."],
      ["Attività esterne", "Incarichi separati e adempimenti ancora da verificare."],
    ] },
    diario: { title: "Prima, durante, dopo. *Nelle stesse zone*.", intro: "Quando previsto, il diario raccoglie fotografie reali riferite agli ambienti interessati. Non è un confronto inventato tra immagini illustrative.", items: [
      ["Stato iniziale", "Condizioni accessibili e parti individuate prima dei lavori."],
      ["Fasi intermedie", "Predisposizioni e raccordi utili da documentare prima delle finiture."],
      ["Stato finale", "Zone consegnate e dettagli collegati alle eventuali riserve."],
    ] },
  },
};
