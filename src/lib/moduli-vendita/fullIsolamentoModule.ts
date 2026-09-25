import type { TetEditorialContent } from "./fullTettiFactory";
const insulation = "/pdf-stock/tetti/isolamento.jpg";
export const isolamentoContent: TetEditorialContent = {
  title: "Il comfort comincia\ndalle scelte giuste.",
  subtitle: "Isolamento della copertura o del sottotetto: superfici, materiali e dettagli definiti per il tuo edificio.",
  eyebrow: "ISOLAMENTO TETTO E SOTTOTETTO", cover: insulation,
  journeyPhoto: "/pdf-stock/tetti/sottotetto.jpg",
  closingPhoto: "/module-art/tetti.jpg",
  images: [{ url: "/pdf-stock/tetti/sottotetto.jpg", name: "Ambiente sottotetto" }, { url: "/module-art/tetti.jpg", name: "Contesto della copertura" }],
  needs: [
    ["Definire dove isolare", "Distinguere falde, solaio del sottotetto e altre superfici secondo uso degli ambienti e soluzione progettata."],
    ["Scegliere un sistema compatibile", "Valutare supporto, spazi disponibili, materiali e raccordi senza ridurre la scelta al solo spessore del pannello."],
    ["Conoscere opere e risultati attesi", "Separare lavorazioni incluse, finiture e prestazioni documentate dalle ipotesi ancora da verificare."],
  ],
  solution: [
    ["Superfici identificate", "La proposta riporta dove si interviene, quali parti restano invariate e le condizioni del supporto da verificare."],
    ["Materiali e dettagli definiti", "Prodotti, spessori, raccordi e altri strati previsti si collegano alla soluzione progettata."],
    ["Un computo comprensibile", "Preparazioni, posa, dettagli e finiture hanno voci riconoscibili, con esclusioni e varianti esplicite."],
  ],
  usp: [
    ["Scelte motivate", "La soluzione viene descritta rispetto alla superficie e all'uso previsto, senza considerare equivalenti interventi diversi."],
    ["Dettagli riconoscibili", "Bordi, attraversamenti e discontinuità individuati nel progetto si ritrovano nelle lavorazioni e nei controlli."],
    ["Aspettative verificabili", "Prestazioni e stime si riferiscono ai documenti del caso; il modello non assegna percentuali di risparmio automatiche."],
  ],
  journey: [
    ["01 · Rilievo e uso", "Superfici, accessibilità, supporti e utilizzo del sottotetto."],
    ["02 · Soluzione e offerta", "Materiali, spessori, dettagli, opere comprese e finiture da confermare."],
    ["03 · Preparazione e posa", "Attività secondo progetto, con riscontro dei punti che saranno coperti."],
    ["04 · Verifica e consegna", "Corrispondenza delle opere, documenti applicabili e indicazioni di cura."],
  ],
  guarantees: [
    ["Prodotti identificati", "Materiale e caratteristiche sono quelli riportati nella documentazione della fornitura confermata."],
    ["Ambito documentato", "Superfici e dettagli realizzati sono distinti dalle parti dell'edificio non interessate dall'intervento."],
    ["Prestazioni riferite al progetto", "Non si attribuiscono all'edificio risultati ricavati dal solo pannello o da una fotografia."],
    ["Condizioni conoscibili", "Assistenza, coperture e manutenzione sono quelle dei documenti applicabili, senza durate aggiuntive presunte."],
  ],
  schedule: [
    ["Definizione", "Rilievo delle superfici e conferma della soluzione tecnica."],
    ["Preparazione", "Materiali, accessi, supporti e interferenze da risolvere prima della posa."],
    ["Posa e dettagli", "Isolante e strati previsti, raccordi, attraversamenti e finiture incluse."],
    ["Consegna", "Riscontro delle opere e documentazione. Date definite secondo disponibilità e condizioni del cantiere."],
  ],
  faq: [
    ["Si isola il tetto o il pavimento del sottotetto?", "Dipende dalla soluzione progettata e dall'uso degli ambienti. L'offerta deve identificare le superfici: le due lavorazioni non sono intercambiabili in modo automatico."],
    ["Quanto risparmierò sui consumi?", "Non viene assegnata una percentuale standard. Eventuali stime devono riferirsi alla valutazione dell'edificio, degli impianti e delle condizioni d'uso."],
    ["Più spessore significa sempre una soluzione migliore?", "Lo spessore è solo una delle caratteristiche da definire. Materiali, supporto, raccordi e compatibilità dell'insieme si valutano nella soluzione tecnica."],
    ["Il sottotetto diventa abitabile?", "Questo modulo non lo presume. Un intervento isolante non equivale da solo alla trasformazione d'uso o al completamento degli altri requisiti e delle opere necessarie."],
    ["Posso camminare sopra l'isolamento?", "Solo dove il sistema e le finiture sono previsti per quell'uso. Percorsi, protezioni e superfici utilizzabili devono risultare dalla soluzione confermata."],
    ["Sono compresi membrane e controllo del vapore?", "Solo gli strati specificati nel progetto e nel computo. Non si aggiungono membrane o barriere per il solo fatto che una foto le rappresenta."],
    ["Occorre rimuovere tutte le tegole?", "Dipende da posizione dell'intervento e soluzione scelta. Rimozioni e ripristino del manto sono inclusi soltanto se elencati."],
    ["Come si controlla il lavoro prima delle finiture?", "Si concordano i riscontri sui materiali e sui punti accessibili prima della chiusura. Prove aggiuntive e documentazione fotografica devono essere definite nell'offerta."],
  ],
  blocks: {
    comeFunziona: { title: "Non solo un pannello. *Una soluzione d'insieme*.", intro: "Il progetto definisce la posizione dell'isolante e gli strati necessari. L'immagine mostra un materiale a titolo illustrativo, non la stratigrafia da eseguire.", photo: insulation, items: [
      ["Superficie", "Falda, solaio o altra parte dell'involucro individuata nella proposta."],
      ["Materiale", "Prodotto e spessore identificati nella soluzione approvata."],
      ["Continuità", "Raccordi e discontinuità da trattare secondo i dettagli previsti."],
      ["Uso e finitura", "Strati di protezione, accessibilità e superfici utilizzabili da definire prima della posa."],
    ] },
    compreso: { title: "Superfici, dettagli e *finiture comprese*.", intro: "Le quantità e le lavorazioni del computo definiscono il perimetro del prezzo, non le immagini illustrative.", items: [
      ["Supporto", "Preparazioni e rimozioni espressamente indicate per la superficie interessata."],
      ["Isolante", "Materiale, spessore e posa previsti sulle quantità concordate."],
      ["Raccordi", "Trattamento dei bordi, attraversamenti e altre discontinuità elencate."],
      ["Finiture", "Protezioni, percorsi e strati finali solo dove descritti."],
    ], excluded: [
      ["Altre parti dell'edificio", "Rifacimento del manto, impianti e opere strutturali restano esclusi salvo voci specifiche."],
      ["Trasformazioni e prestazioni", "Cambio d'uso, finiture non elencate e risultati energetici non documentati non si presumono compresi."],
    ] },
    protezione: { title: "Preparare gli spazi. *Coordinare la posa*.", intro: "L'organizzazione varia fra intervento dall'esterno e lavoro nel sottotetto. Accessi e protezioni si definiscono per il caso reale.", items: [
      ["Accessi", "Concordare ingresso, movimentazione dei materiali e spazi disponibili."],
      ["Ambienti", "Individuare arredi, impianti e superfici vicine interessate dalle attività."],
      ["Interferenze", "Coordinare gli altri lavori e le predisposizioni che devono precedere l'isolamento."],
      ["Materiali e fasi", "Organizzare deposito e sequenza della posa in base alle condizioni effettive."],
    ] },
    controlli: { title: "I punti da vedere *prima di chiudere*.", intro: "La verifica riguarda la soluzione approvata e le lavorazioni concordate, non una promessa generica di risparmio.", items: [
      ["Materiale", "Confrontare prodotto e spessore forniti con quelli previsti."],
      ["Superfici", "Riscontrare le aree trattate e i limiti dell'intervento."],
      ["Dettagli", "Controllare i raccordi e gli attraversamenti previsti nei punti accessibili."],
      ["Finiture", "Registrare protezioni, percorsi e completamenti ancora necessari."],
    ] },
    documenti: { title: "Le caratteristiche della *soluzione scelta*.", intro: "I documenti devono collegare la superficie isolata ai materiali e alle opere ricevute.", items: [
      ["Perimetro", "Superfici e lavorazioni, con eventuali varianti approvate."],
      ["Prodotti", "Schede disponibili e applicabili dei materiali effettivamente utilizzati."],
      ["Riscontri", "Controlli concordati ed eventuali parti non verificabili dopo la chiusura."],
      ["Uso e assistenza", "Indicazioni applicabili per protezioni, accessi e manutenzione, con i contatti di riferimento."],
    ] },
    diario: { title: "L'isolamento, *prima delle finiture*.", intro: "Le fotografie reali, quando concordate, mostrano i punti che saranno nascosti. Le immagini del modello non documentano il tuo edificio.", items: [
      ["Prima", "Superficie, supporto e interferenze individuate nel rilievo."],
      ["Durante", "Materiali, raccordi e dettagli della posa prima della copertura."],
      ["Dopo", "Ambito ultimato e finiture previste, con le eventuali riserve annotate."],
    ] },
  },
};
