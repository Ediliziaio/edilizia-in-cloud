import type { TetEditorialContent } from "./fullTettiFactory";
export const bagnoCompletoContent: TetEditorialContent = {
  title: "Il tuo nuovo bagno.\nOgni scelta, al suo posto.",
  subtitle: "Rimozioni, impianti, superfici e dotazioni: un progetto coordinato, con lavorazioni e forniture riconoscibili.",
  eyebrow: "RIFACIMENTO COMPLETO DEL BAGNO", cover: "/module-art/bagni.jpg", closingPhoto: null,
  images: [
    { url: "/pdf-stock/bagni/installazione.jpg", name: "Lavorazioni della zona umida" },
    { url: "/pdf-stock/bagni/protezione.jpg", name: "Separazione del bagno e protezione dei passaggi" },
  ],
  needs: [
    ["Un bagno adatto a te", "Confermare disposizione, ingombri e dotazioni in base allo spazio disponibile e alle esigenze quotidiane."],
    ["Sapere cosa cambia", "Distinguere rimozioni, impianti interessati, supporti e finiture dalle parti che rimangono."],
    ["Affrontare i lavori con chiarezza", "Conoscere le scelte da confermare, le interruzioni previste e il perimetro del prezzo."],
  ],
  solution: [
    ["Configurazione condivisa", "Posizioni, materiali e prodotti vengono identificati prima delle lavorazioni che ne dipendono."],
    ["Opere collegate", "Impianti, preparazioni e finiture sono descritti come fasi coordinate del bagno, non dell'intera abitazione."],
    ["Consegna riconoscibile", "Riscontri, indicazioni d'uso e documenti riguardano le opere e le forniture effettivamente comprese."],
  ],
  usp: [
    ["Scelte prima delle opere", "Misure, configurazione e compatibilità si confermano sul bagno reale."],
    ["Ambito leggibile", "Computo, dotazioni ed esclusioni rendono riconoscibile ciò che viene offerto."],
    ["Fasi concordate", "Accessi, utilizzo delle utenze e disponibilità delle forniture guidano il calendario."],
  ],
  journey: [
    ["01 · Rilevare", "Spazi, esigenze, attacchi e condizioni accessibili."],
    ["02 · Scegliere", "Disposizione, materiali, dotazioni e perimetro."],
    ["03 · Realizzare", "Rimozioni, predisposizioni, supporti e finiture previste."],
    ["04 · Consegnare", "Riscontri, istruzioni e attività residue concordate."],
  ],
  guarantees: [
    ["Scelte definite", "Materiali e prodotti sono quelli identificati nella proposta confermata."],
    ["Ambito scritto", "Il rifacimento riguarda il bagno e le opere collegate espressamente comprese."],
    ["Varianti concordate", "Condizioni emerse e nuove scelte si valutano con costi e tempi prima della conferma."],
    ["Consegna documentata", "Indicazioni e riscontri si riferiscono alle opere effettivamente realizzate."],
  ],
  schedule: [
    ["Rilievo e scelte", "Conferma della configurazione e delle forniture."],
    ["Rimozioni e predisposizioni", "Protezioni, rimozioni e impianti delle zone previste."],
    ["Supporti e finiture", "Preparazioni, protezione dall'acqua e posa secondo il sistema scelto."],
    ["Montaggi e consegna", "Installazioni, riscontri e istruzioni pertinenti."],
  ],
  faq: [
    ["Che cosa comprende il rifacimento completo?", "Le opere e le forniture elencate nella proposta: il nome del modulo non include automaticamente ogni prodotto o intervento. Sanitari, rubinetteria, doccia, arredi e accessori devono essere riconoscibili nel computo."],
    ["Posso spostare sanitari e doccia?", "La disposizione va verificata sulle condizioni reali, sugli attacchi e sulle interferenze. La foto è illustrativa e non dimostra che una determinata soluzione sia realizzabile nel tuo bagno."],
    ["Vengono rifatti tutti gli impianti della casa?", "No. Il preventivo deve identificare i tratti e i punti interessati dal bagno. Montanti, reti comuni e impianti esterni al perimetro sono compresi soltanto se descritti."],
    ["Sono incluse le protezioni dall'acqua?", "Supporti, raccordi e trattamento delle zone umide devono essere descritti in funzione della configurazione e dei materiali scelti. Le immagini non sostituiscono la definizione del sistema da realizzare."],
    ["Quanto tempo resterò senza bagno?", "Dipende dalle opere, dalle condizioni emerse, dalle forniture e dai tempi tecnici dei materiali. Fasi e interruzioni si concordano prima dell'avvio; il modello non promette una durata standard."],
    ["Posso fornire io sanitari o rivestimenti?", "Va concordato prima: misure, compatibilità, consegna, posa e responsabilità devono essere chiariti. La sola consegna di un prodotto non ne rende automaticamente inclusa l'installazione."],
    ["Cosa succede se durante le rimozioni emerge un problema?", "La condizione viene descritta e valutata. Eventuali opere aggiuntive, costi e variazioni del calendario devono essere concordati, senza considerare compreso qualsiasi imprevisto."],
    ["Quali documenti riceverò?", "Quelli pertinenti alle opere e alle forniture effettivamente incluse, secondo gli incarichi previsti. Progettazioni, pratiche e attestazioni non elencate richiedono una definizione separata."],
  ],
  blocks: {
    comeFunziona: { title: "Il bagno, dall'interno. *Non solo nuove superfici*.", intro: "Le scelte visibili dipendono da supporti e predisposizioni. Il computo collega ogni fase alla configurazione concordata, senza attribuire alle immagini valore di progetto.", photo: "/pdf-stock/bagni/installazione.jpg", items: [
      ["Configurazione", "Posizioni, dimensioni e dotazioni da confermare sul rilievo."],
      ["Predisposizioni", "Impianti e attacchi interessati dalle opere descritte."],
      ["Supporti e acqua", "Preparazioni e raccordi delle zone umide previsti dal sistema scelto."],
      ["Finiture e montaggi", "Rivestimenti, sanitari e dotazioni identificati nella proposta."],
    ] },
    compreso: { title: "Il nuovo bagno. *Il perimetro della proposta*.", intro: "Le quantità e le specifiche confermate definiscono l'offerta. Arredi e accessori presenti nelle fotografie non sono forniture automatiche.", items: [
      ["Preparazioni e rimozioni", "Protezioni, rimozioni e movimentazioni indicate nel computo."],
      ["Opere e impianti", "Supporti e interventi sui tratti del bagno espressamente individuati."],
      ["Superfici", "Materiali e posa entro quantità e caratteristiche concordate."],
      ["Dotazioni", "Prodotti, montaggi e riscontri elencati nella proposta."],
    ], excluded: [
      ["Parti esterne al bagno", "Reti comuni, altri ambienti e lavorazioni non descritte restano esclusi."],
      ["Forniture e incarichi ulteriori", "Arredi, accessori, progettazioni e pratiche non elencati vanno definiti separatamente."],
    ] },
    protezione: { title: "Lavorare nel bagno. *Rispettare il resto della casa*.", intro: "Percorsi, parti conservate e interruzioni vanno organizzati sulle condizioni reali dell'abitazione. La fotografia è un esempio illustrativo.", photo: "/pdf-stock/bagni/protezione.jpg", items: [
      ["Separazione", "Individuare le zone di lavoro e gli ambienti conservati."],
      ["Percorsi", "Concordare accessi, transito e movimentazione dei materiali."],
      ["Utenze", "Definire le interruzioni e le limitazioni d'uso previste."],
      ["Oggetti e arredi", "Concordare sgombero e protezione delle parti mantenute."],
    ] },
    controlli: { title: "Prima della consegna. *Riscontri sul tuo bagno*.", intro: "Le verifiche riguardano le opere comprese e i criteri concordati. Non attestano automaticamente le parti dell'immobile rimaste escluse.", items: [
      ["Configurazione", "Confrontare montaggi e dotazioni con le scelte confermate."],
      ["Collegamenti", "Riscontrare le installazioni e i tratti interessati dall'intervento."],
      ["Finiture", "Controllare raccordi, superfici e completamenti compresi."],
      ["Consegna", "Registrare osservazioni, istruzioni e attività residue."],
    ] },
    documenti: { title: "Il bagno consegnato. *Le informazioni che restano*.", intro: "La documentazione deve corrispondere a ciò che è stato eseguito e fornito, senza promettere incarichi non compresi.", items: [
      ["Opere concordate", "Proposta e varianti con il perimetro finale confermato."],
      ["Prodotti", "Schede e istruzioni delle dotazioni installate, quando pertinenti."],
      ["Impianti", "Documenti previsti per le lavorazioni effettivamente realizzate."],
      ["Manutenzione", "Indicazioni dei materiali e riepilogo dei riscontri finali."],
    ] },
    diario: { title: "Le fasi del bagno. *Documentate sul posto*.", intro: "Quando previsto, le fotografie reali seguono l'intervento. Non si usa un confronto prima/dopo inventato con immagini illustrative.", items: [
      ["Prima", "Condizioni accessibili e parti da conservare prima delle rimozioni."],
      ["Durante", "Predisposizioni e raccordi utili da documentare prima delle chiusure."],
      ["Dopo", "Configurazione consegnata e dettagli collegati alle osservazioni."],
    ] },
  },
};
