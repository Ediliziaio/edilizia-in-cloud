import type { TetEditorialContent } from "./fullTettiFactory";

export const rinnovoBagnoContent: TetEditorialContent = {
  title: "Il tuo bagno, un nuovo tono.\nSenza cambiare tutto.",
  subtitle: "Colori, finiture e dettagli coordinati per rinnovare l'aspetto del bagno. Superfici, prodotti e parti da conservare in una proposta chiara.",
  eyebrow: "RINNOVO ESTETICO DEL BAGNO", cover: "/module-art/bagni-rinnovo-cover.jpg", closingPhoto: null,
  images: [
    { url: "/module-art/bagni-rubinetteria-banner.jpg", name: "Finiture e dettagli · esempio di categoria" },
    { url: "/pdf-stock/bagni/protezione.jpg", name: "Protezione delle parti conservate" },
  ],
  needs: [
    ["Cambiare atmosfera", "Coordinare colori, arredi e dettagli senza presumere il rifacimento completo del bagno."],
    ["Capire cosa mantenere", "Individuare superfici, sanitari, impianti e dotazioni che restano invariati."],
    ["Scegliere su basi concrete", "Verificare supporti e compatibilità prima di definire trattamenti e nuove finiture."],
  ],
  solution: [
    ["Palette condivisa", "Colori, campioni e finiture vengono confermati prima dell'esecuzione."],
    ["Opere mirate", "Preparazioni, decorazioni e montaggi riguardano solo le parti indicate nel computo."],
    ["Dettagli coordinati", "Prodotti e accessori sono selezionati con quantità e caratteristiche riconoscibili."],
  ],
  usp: [
    ["Identità coerente", "Una direzione estetica comune guida le scelte previste."],
    ["Parti conservate esplicite", "Il nuovo aspetto non nasconde quali impianti e superfici restano esistenti."],
    ["Campioni prima della conferma", "La scelta finale non dipende soltanto dalla resa di una fotografia."],
  ],
  journey: [
    ["01 · Osservare", "Rilevare superfici, condizioni visibili e parti da conservare."],
    ["02 · Coordinare", "Confermare colori, prodotti e lavorazioni incluse."],
    ["03 · Rinnovare", "Preparare e rifinire le sole parti concordate."],
    ["04 · Consegnare", "Riscontrare finiture e montaggi, chiarendo cura e utilizzo."],
  ],
  guarantees: [
    ["Finiture definite", "Materiali e colori si riferiscono alle scelte confermate."],
    ["Preparazioni descritte", "I trattamenti previsti non sostituiscono interventi sulle cause di anomalie."],
    ["Varianti condivise", "Problemi dei supporti o adattamenti ulteriori vengono valutati prima di procedere."],
    ["Indicazioni di cura", "Uso, pulizia e tempi di utilizzo seguono i prodotti effettivi."],
  ],
  schedule: [
    ["Rilievo e direzione estetica", "Definizione delle parti interessate e delle preferenze."],
    ["Campioni e conferma", "Scelta di colori, prodotti, preparazioni e accessori."],
    ["Preparazione e finiture", "Esecuzione delle lavorazioni e dei montaggi indicati."],
    ["Riscontri e consegna", "Controllo delle parti rinnovate e istruzioni di cura."],
  ],
  faq: [
    ["È una ristrutturazione completa del bagno?", "No. Il rinnovo estetico riguarda le superfici, le finiture e le dotazioni espressamente elencate. Impianti, distribuzione e parti non descritte restano invariati."],
    ["Si possono rivestire o verniciare tutte le piastrelle?", "Non automaticamente. Supporto, adesione, umidità, uso della superficie e sistema scelto richiedono una verifica. Un trattamento su piastrelle deve comparire nelle voci dell'offerta, con preparazione e limiti pertinenti."],
    ["Il rinnovo risolve infiltrazioni o muffe?", "No, non per il solo fatto di cambiare finitura. Cause di umidità, infiltrazione o degrado richiedono una valutazione e, se necessario, interventi distinti prima delle opere estetiche."],
    ["Sono inclusi mobile, specchio e accessori?", "Solo se identificati nella proposta per quantità, caratteristiche e montaggio. Gli elementi presenti nelle immagini non sono automaticamente compresi."],
    ["Il colore sarà identico alla fotografia?", "La fotografia è illustrativa e gli schermi alterano la percezione. La scelta va confermata con riferimenti e campioni concordati, considerando luce, supporto e finitura."],
    ["Si lavora senza demolizioni e senza interruzioni?", "Dipende dalle opere previste. Rimozioni, preparazioni, polvere e indisponibilità temporanea vanno chiariti. Il modello non promette un intervento senza disagi o completato in una giornata."],
    ["Sono compresi nuovi punti luce o spostamenti degli attacchi?", "Solo se esplicitamente descritti e verificati. Un nuovo arredo o specchio non include automaticamente modifiche agli impianti, ai supporti o alla distribuzione del bagno."],
    ["Quando posso usare e pulire le superfici?", "Tempi di asciugatura, messa in uso, pulizia e manutenzione dipendono dal sistema effettivamente applicato e dalle condizioni del luogo. Le indicazioni pertinenti vengono chiarite alla consegna."],
  ],
  blocks: {
    comeFunziona: { title: "Una nuova atmosfera. *Scelte coordinate*.", intro: "Si definiscono colori e dettagli partendo dal bagno esistente. Campioni, prodotti e preparazioni rendono concreta la direzione estetica, senza trasformarla implicitamente in un rifacimento completo.", photo: "/module-art/bagni-rubinetteria-banner.jpg", items: [
      ["Stato esistente", "Riconoscere le superfici da rinnovare e quelle da conservare."],
      ["Abbinamenti", "Condividere palette, materiali e accessori della proposta."],
      ["Preparazioni", "Definire i trattamenti compatibili con i supporti verificati."],
      ["Finiture", "Realizzare colori e montaggi effettivamente concordati."],
    ] },
    compreso: { title: "Il cambiamento visibile. *L'ambito in chiaro*.", intro: "La proposta elenca superfici, sistemi e prodotti compresi. Fotografie, arredi e accessori d'ambientazione non ampliano il prezzo o le lavorazioni concordate.", items: [
      ["Preparazioni", "Protezioni e trattamenti delle sole superfici indicate."],
      ["Finiture", "Materiali, colori e applicazioni identificati nel computo."],
      ["Dotazioni", "Arredi e accessori espressamente previsti, con montaggi descritti."],
      ["Consegna", "Riscontri sulle parti rinnovate e indicazioni di cura."],
    ], excluded: [
      ["Rifacimenti non descritti", "Impianti, sanitari, doccia e distribuzione non si intendono sostituiti."],
      ["Anomalie del supporto", "Cause di infiltrazione, umidità e degrado richiedono valutazioni e opere dedicate."],
    ] },
    protezione: { title: "Rinnovare una parte. *Aver cura del resto*.", intro: "Le superfici mantenute guidano l'organizzazione del lavoro. Si concordano accessi, rimozioni e disponibilità del bagno, considerando preparazione e asciugatura dei prodotti scelti.", photo: "/pdf-stock/bagni/protezione.jpg", items: [
      ["Superfici conservate", "Individuare rivestimenti, sanitari e arredi da proteggere."],
      ["Accessori", "Concordare eventuali smontaggi e rimontaggi necessari."],
      ["Organizzazione", "Programmare passaggi, materiali e pulizia prevista."],
      ["Disponibilità", "Chiarire interruzioni e tempi di utilizzo delle parti rinnovate."],
    ] },
    controlli: { title: "Dettagli da guardare. *Scelte da riscontrare*.", intro: "I riscontri riguardano superfici e montaggi compresi. Una nuova finitura non attesta il rinnovo degli impianti o la risoluzione di problemi nascosti.", items: [
      ["Riferimenti", "Confrontare materiali e colori con quelli confermati."],
      ["Superfici", "Riscontrare finiture e raccordi nell'ambito concordato."],
      ["Montaggi", "Verificare le dotazioni e gli accessori installati."],
      ["Cura", "Illustrare uso, pulizia e manutenzione dei prodotti effettivi."],
    ] },
    documenti: { title: "Colori e prodotti. *I riferimenti utili*.", intro: "Il riepilogo permette di riconoscere le scelte realizzate e di prendersene cura. Le informazioni riguardano il sistema applicato, non una prestazione generica del bagno.", items: [
      ["Palette finale", "Riferimenti dei colori e delle finiture concordate."],
      ["Prodotti", "Schede e istruzioni pertinenti ai materiali utilizzati."],
      ["Dotazioni", "Elenco e indicazioni degli arredi o accessori forniti."],
      ["Varianti", "Modifiche confermate e parti mantenute riconoscibili."],
    ] },
    diario: { title: "Un nuovo aspetto. *Un confronto reale*.", intro: "Quando previsto, foto del bagno reale documentano il cambiamento. Le immagini illustrative del modello non costituiscono un prima/dopo aziendale o una promessa di risultato identico.", items: [
      ["Prima", "Superfici e dettagli interessati dal rinnovo."],
      ["Durante", "Preparazioni e finiture delle parti concordate."],
      ["Dopo", "Aspetto consegnato e prodotti effettivamente installati."],
    ] },
  },
};
