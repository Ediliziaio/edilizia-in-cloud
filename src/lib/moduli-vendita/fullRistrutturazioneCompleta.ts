import type { TetEditorialContent } from "./fullTettiFactory";

export const ristrutturazioneCompletaContent: TetEditorialContent = {
  title: "La tua casa, ripensata.\nUn progetto leggibile.",
  subtitle: "Ambienti, impianti e finiture: tutte le scelte e le lavorazioni della tua proposta, in ordine.",
  eyebrow: "RISTRUTTURAZIONE COMPLETA", cover: "/module-art/ristrutturazioni.jpg",
  journeyPhoto: "/pdf-stock/ristrutturazione/risultato.jpg", closingPhoto: null,
  images: [
    { url: "/pdf-stock/ristrutturazione/cantiere-ordinato.jpg", name: "Organizzazione del cantiere" },
    { url: "/pdf-stock/ristrutturazione/risultato.jpg", name: "Ambiente finito, arredi non inclusi salvo computo" },
  ],
  needs: [
    ["Ripensare gli ambienti", "Tradurre abitudini e priorità in un perimetro di lavori, distinguendo ciò che cambia da ciò che viene conservato."],
    ["Coordinare le scelte", "Definire opere, impianti e finiture con le relative dipendenze, senza lasciare decisioni importanti implicite nel prezzo."],
    ["Conoscere l'investimento", "Leggere quantità, forniture, esclusioni e condizioni, con un metodo chiaro per gestire gli eventuali imprevisti."],
  ],
  solution: [
    ["Una proposta per ambienti e opere", "Il computo descrive le lavorazioni previste e permette di riconoscere l'ambito della ristrutturazione."],
    ["Scelte confermate prima delle fasi", "Materiali, configurazioni e finiture vengono definiti con i riferimenti necessari prima degli ordini e delle lavorazioni collegate."],
    ["Passaggi e consegna riconoscibili", "Il percorso distingue preparazioni, realizzazione, riscontri e documenti finali, secondo il perimetro concordato."],
  ],
  usp: [
    ["Un quadro leggibile", "Opere edili, impianti e finiture restano distinguibili nel riepilogo e nel computo."],
    ["Decisioni tracciate", "Scelte e varianti hanno riferimenti condivisi, insieme agli eventuali effetti su prezzo e calendario."],
    ["Consegna organizzata", "Documenti, riscontri ed eventuali attività residue vengono raccolti in un riepilogo finale."],
  ],
  journey: [
    ["01 · Esigenze e rilievo", "Ambienti, priorità, stato accessibile e perimetro della proposta."],
    ["02 · Scelte e conferma", "Soluzione, materiali, computo e condizioni da approvare."],
    ["03 · Cantiere", "Fasi coordinate e aggiornamento sulle decisioni o varianti necessarie."],
    ["04 · Consegna", "Riscontri previsti, documentazione e attività residue concordate."],
  ],
  guarantees: [
    ["Ambito riconoscibile", "Il riepilogo distingue le opere comprese dalle parti conservate o escluse."],
    ["Forniture definite", "Materiali e componenti sono identificati secondo la configurazione confermata."],
    ["Condizioni esplicite", "Garanzie e assistenza sono quelle dei documenti applicabili, senza durate aggiuntive presunte."],
    ["Documenti pertinenti", "La consegna comprende i documenti previsti per le lavorazioni realmente eseguite."],
  ],
  schedule: [
    ["Definizione", "Rilievi, progetto applicabile, scelte e conferma del perimetro."],
    ["Preparazione", "Accessi, protezioni, disponibilità materiali e rimozioni previste."],
    ["Realizzazione", "Opere edili, impianti e finiture secondo le dipendenze del cantiere."],
    ["Consegna", "Riscontri, documenti e definizione delle eventuali attività residue."],
  ],
  faq: [
    ["Completa significa che è compreso tutto?", "Significa che la proposta coordina più ambiti, non che includa qualunque lavoro. Sono le voci, le quantità e le condizioni a definire la fornitura."],
    ["Progetto e pratiche sono inclusi?", "Soltanto gli incarichi e le attività espressamente descritti. Verifiche, progettazione, pratiche e opere devono avere responsabilità e perimetri riconoscibili."],
    ["Come vengono scelti i materiali?", "Modelli, finiture e configurazioni si confermano prima degli ordini. Scelte diverse da quelle previste possono modificare prezzo, disponibilità e tempi."],
    ["Posso abitare in casa durante i lavori?", "Va valutato sul caso concreto. Accessi, spazi utilizzabili, utenze e interferenze devono essere concordati prima dell'avvio, senza presumere la permanenza nell'immobile."],
    ["Cosa succede se emerge un problema nascosto?", "Si descrive quanto riscontrato e si concordano soluzione, eventuale prezzo e tempi aggiuntivi prima di procedere con opere non previste."],
    ["Il calendario è già definitivo?", "Le date vengono confermate in base a scelte, disponibilità, condizioni del cantiere e attività necessarie. Il modello non assegna una durata standard a interventi diversi."],
    ["Arredi ed elettrodomestici delle foto sono inclusi?", "No, salvo voci dedicate. Le immagini illustrative mostrano un possibile ambiente e non definiscono la dotazione della tua offerta."],
    ["L'offerta comprende un incentivo fiscale?", "Il modello non presume detrazioni o requisiti del cliente. Eventuali benefici devono essere verificati per lo specifico intervento prima di inserirli nella proposta."],
  ],
  blocks: {
    comeFunziona: { title: "Un insieme di lavori. *Una sequenza chiara*.", intro: "La ristrutturazione coordina ambiti diversi. Il computo e le scelte confermate definiscono cosa viene realizzato; le immagini non aggiungono forniture.", photo: "/pdf-stock/ristrutturazione/cantiere-ordinato.jpg", items: [
      ["Ambienti", "Perimetro delle stanze e delle superfici interessate dalle opere."],
      ["Opere", "Rimozioni, costruzioni e preparazioni descritte nella proposta."],
      ["Impianti", "Configurazioni e lavorazioni previste, con gli incarichi applicabili."],
      ["Finiture", "Materiali, modelli e superfici confermati prima della realizzazione."],
    ] },
    compreso: { title: "La proposta, *senza sottintesi*.", intro: "Questa sintesi aiuta a leggere il computo. Le sole voci e quantità confermate definiscono ciò che è compreso nel prezzo.", items: [
      ["Preparazioni", "Accessi, protezioni e rimozioni soltanto dove elencati."],
      ["Opere edili", "Lavorazioni, superfici e ripristini individuati nella proposta."],
      ["Impianti", "Forniture e attività specificate per ciascun impianto interessato."],
      ["Finiture e consegna", "Posa, materiali, riscontri e pulizie espressamente previsti."],
    ], excluded: [
      ["Attività non elencate", "Interventi strutturali, bonifiche, incarichi tecnici e altre opere non descritte richiedono valutazione separata."],
      ["Forniture del cliente", "Arredi, elettrodomestici e componenti scelti o forniti separatamente non sono inclusi senza voci dedicate."],
    ] },
    protezione: { title: "La casa cambia. *Il cantiere si organizza*.", intro: "Fasi, accessi e aree condivise vanno definiti per le condizioni reali dell'immobile, con i soggetti competenti e le attività previste.", items: [
      ["Spazi e passaggi", "Individuare aree operative, parti conservate e percorsi di accesso."],
      ["Utenze", "Concordare disponibilità e interruzioni necessarie per le lavorazioni."],
      ["Materiali", "Definire consegne, depositi e gestione dei materiali rimossi compresi."],
      ["Interferenze", "Organizzare rapporti con altre attività e vincoli dell'edificio."],
    ] },
    controlli: { title: "Verificare le fasi. *Prima di chiuderle*.", intro: "I riscontri riguardano le opere e i controlli concordati, senza sostituire le verifiche professionali richieste per lo specifico intervento.", items: [
      ["Prima delle finiture", "Riscontrare le lavorazioni che saranno successivamente coperte."],
      ["Forniture", "Confrontare materiali e componenti con le scelte confermate."],
      ["Ambienti", "Verificare le opere previste e registrare eventuali riserve."],
      ["Consegna", "Riepilogare controlli eseguiti, documenti e attività ancora da definire."],
    ] },
    documenti: { title: "La casa rinnovata. *I riferimenti da conservare*.", intro: "La documentazione segue la fornitura reale. Ogni documento va riferito all'ambito e al soggetto che lo rilascia.", items: [
      ["Opere e varianti", "Riepilogo delle lavorazioni e delle modifiche approvate."],
      ["Prodotti", "Schede e indicazioni disponibili dei materiali e componenti forniti."],
      ["Impianti e verifiche", "Documenti applicabili alle opere eseguite e riscontri previsti."],
      ["Uso e assistenza", "Istruzioni pertinenti, condizioni applicabili e contatti di riferimento."],
    ] },
    diario: { title: "Il percorso della casa. *Fase per fase*.", intro: "Quando concordate, le fotografie reali mantengono riferimenti riconoscibili degli ambienti. Le illustrazioni non sono lavori già eseguiti dall'azienda.", photo: "/pdf-stock/comune/lavorazioni-nascoste.jpg", items: [
      ["Prima", "Stato accessibile e parti interessate prima delle lavorazioni."],
      ["Durante", "Passaggi significativi e lavorazioni prima della copertura."],
      ["Dopo", "Ambienti ultimati e riserve eventualmente annotate alla consegna."],
    ] },
  },
};
