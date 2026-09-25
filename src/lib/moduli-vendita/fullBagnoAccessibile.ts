import type { TetEditorialContent } from "./fullTettiFactory";
import { BGN_ACCESSIBILITY_CHECK_IMAGE, BGN_ACCESSIBILITY_CLOSING_IMAGE } from "./bgnEditorialPhotography";

export const bagnoAccessibileContent: TetEditorialContent = {
  title: "Il bagno, vicino a te.\nSpazio ai tuoi gesti.",
  subtitle: "Un adattamento costruito sulle esigenze di utilizzo: spazi, dotazioni e opere da definire sul bagno reale, con scelte e verifiche esplicite.",
  eyebrow: "BAGNO ACCESSIBILE", cover: "/module-art/bagni-accessibilita-cover.jpg", closingPhoto: BGN_ACCESSIBILITY_CLOSING_IMAGE,
  images: [
    { url: BGN_ACCESSIBILITY_CHECK_IMAGE, name: "Riscontro dei fissaggi di un supporto · illustrazione AI" },
    { url: "/pdf-stock/bagni/protezione.jpg", name: "Protezione delle parti conservate" },
  ],
  needs: [
    ["Partire dalle abitudini", "Capire gesti, preferenze e necessità di chi usa il bagno, senza raccogliere informazioni cliniche non necessarie."],
    ["Leggere lo spazio reale", "Valutare accessi, ingombri, passaggi, dotazioni e zone di utilizzo con il rilievo e gli incarichi concordati."],
    ["Chiarire le priorità", "Distinguere gli adattamenti desiderati dalle opere realizzabili e dalle verifiche ancora necessarie."],
  ],
  solution: [
    ["Configurazione condivisa", "Posizioni e modalità di utilizzo vengono definite per la persona e per gli spazi disponibili."],
    ["Dotazioni riconoscibili", "Supporti, sanitari, comandi e accessori sono descritti per caratteristiche e montaggio previsto."],
    ["Opere con un confine", "Supporti, collegamenti e ripristini interessati sono separati dalle parti da conservare."],
  ],
  usp: [
    ["Scelte personali", "Non esiste una configurazione standard adatta automaticamente a ogni esigenza."],
    ["Verifiche esplicite", "Rilievo, fattibilità e valutazioni specialistiche non vengono sostituiti da una fotografia."],
    ["Proposta leggibile", "Forniture, posa, esclusioni e decisioni aperte restano riconoscibili."],
  ],
  journey: [
    ["01 · Ascoltare", "Individuare modalità di utilizzo e priorità dell'intervento."],
    ["02 · Definire", "Confrontare rilievo, configurazione e dotazioni proposte."],
    ["03 · Adattare", "Realizzare le opere confermate e i montaggi previsti."],
    ["04 · Consegnare", "Riscontrare l'intervento e illustrare i prodotti installati."],
  ],
  guarantees: [
    ["Ambito condiviso", "Le opere comprese sono identificate prima della conferma."],
    ["Prodotti definiti", "Caratteristiche e istruzioni appartengono ai prodotti realmente forniti."],
    ["Varianti concordate", "Limiti dei supporti o delle quote vengono valutati prima di estendere le opere."],
    ["Consegna documentata", "Si raccolgono i riscontri e i documenti pertinenti all'intervento eseguito."],
  ],
  schedule: [
    ["Esigenze e rilievo", "Raccolta delle priorità d'uso e verifica degli spazi interessati."],
    ["Configurazione e conferma", "Definizione di opere, dotazioni e incarichi necessari."],
    ["Adattamenti e montaggi", "Preparazione delle parti interessate e posa concordata."],
    ["Riscontri e consegna", "Verifiche previste, istruzioni e documentazione pertinente."],
  ],
  faq: [
    ["Il modello certifica che il bagno sarà accessibile?", "No. Il modello organizza una proposta commerciale. Accessibilità, fruibilità e conformità devono essere valutate sul caso reale da figure competenti, con gli incarichi e le verifiche necessari."],
    ["Basta aggiungere maniglioni o un sedile?", "Non necessariamente. Dotazioni isolate non dimostrano che accessi, spazi, posizioni e modalità d'uso siano adatti alla persona. La configurazione va valutata nel suo insieme."],
    ["La doccia a filo pavimento è sempre possibile?", "No. Quote, scarichi, supporti e spessori disponibili richiedono una verifica. Il preventivo non include automaticamente una doccia a filo o il rifacimento della zona doccia."],
    ["Posizione e portata dei supporti sono standard?", "No. Modello, posizione, supporto murario e fissaggio vanno definiti in funzione dell'uso e delle istruzioni del prodotto. Il modello non assegna portate o dimensioni universali."],
    ["Sono comprese modifiche a porte e impianti?", "Solo le opere espressamente elencate. Allargamenti, spostamenti, strutture e ripristini aggiuntivi devono essere verificati e descritti prima di confermarli."],
    ["Posso scegliere prodotti diversi o fornirli io?", "Sì, se concordato. Vanno verificati compatibilità, accessori, disponibilità e montaggi, chiarendo quali forniture e responsabilità restano a carico delle parti."],
    ["Agevolazioni e pratiche sono incluse?", "Non automaticamente. Eventuali benefici, requisiti, documentazione e incarichi devono essere verificati sul caso specifico. Il modello non applica detrazioni o contributi presunti."],
    ["Che cosa ricevo alla consegna?", "Il riepilogo delle opere, le istruzioni dei prodotti e i documenti pertinenti concordati. Eventuali valutazioni o attestazioni specialistiche richiedono un incarico e non derivano dal solo preventivo."],
  ],
  blocks: {
    comeFunziona: { title: "Partire dai gesti. *Definire le scelte*.", intro: "Il percorso comincia dall'uso quotidiano e dal bagno reale. Spazi, comandi e dotazioni si valutano insieme, chiarendo quali adattamenti sono compresi e quali verifiche devono precederli.", photo: BGN_ACCESSIBILITY_CHECK_IMAGE, items: [
      ["Ascolto", "Condividere priorità e modalità di utilizzo, senza presumere esigenze uguali per tutti."],
      ["Rilievo", "Riconoscere passaggi, ingombri e condizioni delle parti interessate."],
      ["Configurazione", "Confermare posizioni, caratteristiche e opere della proposta."],
      ["Consegna", "Illustrare i prodotti installati e registrare i riscontri previsti."],
    ] },
    compreso: { title: "Un adattamento definito. *Voce per voce*.", intro: "Sono compresi soltanto prodotti e lavorazioni descritti. Le immagini illustrano una categoria di intervento: non sono un progetto approvato né ampliano la fornitura.", items: [
      ["Dotazioni concordate", "Prodotti identificati per quantità, caratteristiche e accessori previsti."],
      ["Opere interessate", "Preparazioni, collegamenti e ripristini indicati nel computo."],
      ["Montaggi previsti", "Installazione delle dotazioni nei punti verificati e concordati."],
      ["Consegna", "Riscontri, istruzioni e documenti pertinenti alle opere eseguite."],
    ], excluded: [
      ["Opere non elencate", "Porte, strutture, impianti e zona doccia non si intendono rinnovati automaticamente."],
      ["Incarichi e benefici", "Progettazioni, attestazioni, pratiche e agevolazioni richiedono accordi e verifiche dedicati."],
    ] },
    protezione: { title: "Adattare gli spazi. *Organizzare la casa*.", intro: "Accessi, disponibilità del bagno e interruzioni si concordano prima dei lavori, considerando le abitudini di chi abita la casa. Le soluzioni temporanee non si presumono comprese.", photo: "/pdf-stock/bagni/protezione.jpg", items: [
      ["Parti conservate", "Individuare superfici e dotazioni esterne all'intervento."],
      ["Percorsi", "Concordare passaggi dei materiali e organizzazione delle aree."],
      ["Interruzioni", "Chiarire quando bagno, acqua e servizi saranno indisponibili."],
      ["Organizzazione", "Definire tempi, referenti ed eventuali esigenze temporanee."],
    ] },
    controlli: { title: "Riscontri concreti. *Sul bagno reale*.", intro: "Le verifiche riguardano la configurazione e le opere concordate. Non equivalgono automaticamente a una certificazione generale di accessibilità o di idoneità per ogni persona.", items: [
      ["Configurazione", "Confrontare posizioni e dotazioni realizzate con quanto confermato."],
      ["Supporti", "Verificare le condizioni e i fissaggi secondo il prodotto e l'incarico previsto."],
      ["Collegamenti", "Eseguire i riscontri pertinenti alle parti modificate."],
      ["Uso e manutenzione", "Illustrare comandi, limiti e istruzioni delle dotazioni fornite."],
    ] },
    documenti: { title: "Scelte e istruzioni. *Da conservare*.", intro: "Il fascicolo distingue le opere eseguite dalle valutazioni specialistiche. Schede e istruzioni si riferiscono alle dotazioni effettive, non ai prodotti raffigurati nelle foto illustrative.", items: [
      ["Configurazione finale", "Riepilogo di prodotti, posizioni e varianti concordate."],
      ["Schede e istruzioni", "Documentazione pertinente ai modelli installati."],
      ["Opere realizzate", "Documenti previsti per le lavorazioni comprese."],
      ["Incarichi dedicati", "Eventuali elaborati e attestazioni previsti da accordi specifici."],
    ] },
    diario: { title: "L'adattamento, documentato. *Con discrezione*.", intro: "Quando concordato, le fotografie mostrano spazi e lavorazioni senza persone o informazioni personali non necessarie. Le immagini di esempio non sono lavori aziendali.", photo: BGN_ACCESSIBILITY_CHECK_IMAGE, items: [
      ["Prima", "Spazi e parti interessate, senza dati personali superflui."],
      ["Durante", "Supporti e passaggi delle sole lavorazioni concordate."],
      ["Dopo", "Dotazioni installate e dettagli utili alla consegna."],
    ] },
  },
};
