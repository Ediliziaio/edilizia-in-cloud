import type { TetEditorialContent } from "./fullTettiFactory";
const cover = "/module-art/tetti-impermeabilizzazione-cover.jpg";
export const impermeabilizzazioneContent: TetEditorialContent = {
  title: "La protezione continua.\nAnche nei dettagli.",
  subtitle: "Superfici, risvolti e scarichi: una proposta chiara per la tua copertura piana o il tuo terrazzo.",
  eyebrow: "COPERTURE PIANE E TERRAZZI", cover,
  journeyPhoto: "/pdf-stock/comune/domande.jpg",
  closingPhoto: "/module-art/tetti-terrazzo-finitura.jpg",
  // The sector fallback depicts pitched tiles, not the flat-roof work described here.
  timelinePhoto: null,
  images: [{ url: "/module-art/tetti-terrazzo-finitura.jpg", name: "Esempio di finitura, solo se prevista nel computo" }],
  needs: [
    ["Capire il supporto", "Conoscere stato e caratteristiche degli strati accessibili prima di scegliere tra recupero, preparazione e rimozione."],
    ["Definire l'uso della superficie", "Distinguere copertura tecnica, terrazzo praticabile e finiture previste: impermeabilizzare non significa sempre rendere calpestabile."],
    ["Considerare tutti i raccordi", "Riconoscere bordi, soglie, attraversamenti e punti di scarico interessati, oltre ai metri quadrati della superficie."],
  ],
  solution: [
    ["Un perimetro rilevato", "La proposta identifica la superficie, i dettagli accessibili e gli approfondimenti ancora necessari sul supporto."],
    ["Un sistema coerente", "Preparazione, strati e finiture sono quelli della soluzione confermata; non si presume che qualsiasi prodotto sia adatto al supporto esistente."],
    ["Una consegna tracciabile", "Controlli, documenti e indicazioni d'uso vengono riferiti ai materiali e alle lavorazioni effettivamente previsti."],
  ],
  usp: [
    ["Oltre la superficie", "Il computo distingue le lavorazioni sul piano dai dettagli che richiedono voci specifiche."],
    ["Uso e finiture espliciti", "Protezione, pavimentazione e accessibilità non vengono lasciate implicite nella parola impermeabilizzazione."],
    ["Varianti riconoscibili", "Se emergono strati o difetti non verificabili prima, soluzione, prezzo e tempi aggiuntivi vengono concordati."],
  ],
  journey: [
    ["01 · Rilievo", "Superfici, supporti, dettagli e uso previsto della copertura."],
    ["02 · Soluzione", "Sistema, preparazioni e quantità da confermare nell'offerta."],
    ["03 · Lavorazioni", "Fasi, condizioni di posa e protezioni dell'area organizzate."],
    ["04 · Consegna", "Riscontri previsti, documentazione e indicazioni d'uso."],
  ],
  guarantees: [
    ["Sistema identificato", "Prodotti e strati previsti vengono descritti nella soluzione e nella documentazione disponibile."],
    ["Ambito verificabile", "Il riepilogo distingue la superficie trattata dai dettagli e dalle parti non interessate dalle opere."],
    ["Condizioni esplicite", "Garanzie e assistenza sono quelle dei documenti applicabili, senza durate o coperture aggiuntive presunte."],
    ["Uso consapevole", "Accessi, pulizia e successive lavorazioni devono rispettare le indicazioni del sistema effettivamente realizzato."],
  ],
  schedule: [
    ["Definizione", "Rilievo, scelta del sistema e verifica degli approfondimenti necessari."],
    ["Preparazione", "Rimozioni e preparazioni del supporto comprese nel computo."],
    ["Realizzazione", "Posa e raccordi secondo la soluzione confermata e condizioni compatibili."],
    ["Consegna", "Controlli previsti e disponibilità all'uso secondo materiali e finiture scelti."],
  ],
  faq: [
    ["Si può lavorare sopra la superficie esistente?", "Va valutato sul supporto reale e sul sistema scelto. Il modello non presume che sovrapporre un nuovo strato sia sempre possibile o opportuno."],
    ["La nuova impermeabilizzazione comprende il pavimento?", "Solo se elencato. Rimozione, massetti, protezioni, pavimentazione e finiture devono essere riconoscibili nelle voci dell'offerta."],
    ["Sono compresi scarichi e soglie?", "Solo quelli identificati nel computo. Occorre distinguere i raccordi alla superficie dalle sostituzioni di componenti o dalle modifiche delle quote."],
    ["Il terrazzo sarà subito utilizzabile?", "Tempi e limiti dipendono da sistema, condizioni di posa e finiture. La data di accesso va concordata, non dedotta dall'aspetto della superficie."],
    ["Si risolvono automaticamente i ristagni?", "Non con la sola dicitura impermeabilizzazione. Valutazione delle pendenze, eventuali correzioni e modifiche degli scarichi richiedono opere definite."],
    ["È inclusa una prova di tenuta?", "Soltanto se specificata e adatta al caso. Modalità, ambito e limiti della verifica vanno concordati con i soggetti competenti."],
    ["Quanto dura la garanzia?", "Si fa riferimento ai documenti applicabili alla fornitura e alla posa concordate. Il modello non assegna una durata standard a sistemi diversi."],
    ["Le foto mostrano la soluzione esatta?", "Le immagini illustrative aiutano a riconoscere il tipo di intervento. Prodotti, strati, dettagli e finiture validi per la tua proposta sono quelli descritti e confermati."],
  ],
  blocks: {
    comeFunziona: { title: "Una superficie. *Tanti punti da definire*.", intro: "Il piano impermeabile comprende dettagli da valutare insieme al supporto. La foto è illustrativa: non prescrive strati, altezze o prodotti per il tuo immobile.", photo: cover, items: [
      ["Supporto", "Stato delle parti accessibili e preparazioni previste dalla soluzione scelta."],
      ["Superficie", "Sistema, quantità e strati descritti per la zona oggetto della proposta."],
      ["Raccordi", "Bordi, attraversamenti, soglie e scarichi identificati nel computo."],
      ["Uso finale", "Protezioni e finiture coerenti con la destinazione confermata."],
    ] },
    compreso: { title: "Superficie e dettagli. *Voce per voce*.", intro: "Questa pagina orienta la lettura. Solo le lavorazioni e quantità elencate nel computo definiscono il prezzo.", items: [
      ["Preparazione", "Sole rimozioni, pulizie e preparazioni del supporto indicate nell'offerta."],
      ["Sistema", "Prodotti e strati impermeabili della soluzione confermata."],
      ["Dettagli", "Raccordi perimetrali e componenti di scarico espressamente individuati."],
      ["Finiture", "Protezioni e superfici finali soltanto dove previste dalle voci."],
    ], excluded: [
      ["Opere ulteriori", "Correzioni strutturali, nuove pendenze e sostituzioni non elencate richiedono valutazione e prezzo separati."],
      ["Danni e finiture interne", "Asciugatura, pitture e ripristini degli ambienti sottostanti non sono inclusi senza voci dedicate."],
    ] },
    protezione: { photo: "/module-art/tetti-terrazzo-protezioni-v1.jpg", title: "Organizzare l'area. *Proteggere le fasi*.", intro: "Accessi, aree sottostanti e superfici temporaneamente aperte vanno considerati prima dell'avvio, secondo le condizioni reali del cantiere.", items: [
      ["Accessi", "Spazi disponibili, movimentazione e percorsi interessati dalle attività."],
      ["Utilizzo", "Limitazioni temporanee per persone, arredi e impianti presenti nell'area."],
      ["Fasi e meteo", "Programmazione delle lavorazioni e protezioni temporanee previste."],
      ["Materiali rimossi", "Gestione dei materiali e dei ripristini compresi nel perimetro dell'offerta."],
    ] },
    controlli: { photo: "/module-art/tetti-terrazzo-raccordi-v1.jpg", title: "Controllare il piano. *E i raccordi*.", intro: "I riscontri riguardano la soluzione realizzata e le parti accessibili. Eventuali prove specialistiche devono essere previste espressamente.", items: [
      ["Supporto", "Registrare le condizioni riscontrate e le preparazioni effettivamente svolte."],
      ["Continuità", "Riscontrare superficie e raccordi secondo il sistema e l'ambito confermati."],
      ["Scarichi", "Verificare i punti interessati dalle opere e annotare i limiti del controllo."],
      ["Consegna", "Raccogliere esiti, riserve e indicazioni per le attività o verifiche successive."],
    ] },
    documenti: { title: "Conoscere il sistema. *Anche dopo la posa*.", intro: "La documentazione deve collegare le superfici lavorate ai materiali utilizzati e alle relative indicazioni applicabili.", items: [
      ["Perimetro", "Superfici e dettagli realizzati, con le eventuali varianti concordate."],
      ["Materiali", "Riferimenti e schede disponibili dei prodotti effettivamente utilizzati."],
      ["Riscontri", "Controlli e prove concordate, con esiti e limitazioni registrati."],
      ["Uso e assistenza", "Indicazioni pertinenti per accessi, manutenzione e contatti successivi."],
    ] },
    diario: { title: "I passaggi che *restano sotto le finiture*.", intro: "Quando previste, le fotografie reali documentano le fasi prima che vengano coperte. Le illustrazioni del modello non sono prove del cantiere.", photo: cover, items: [
      ["Prima", "Supporto, superficie e dettagli accessibili prima delle lavorazioni."],
      ["Durante", "Preparazioni e raccordi significativi prima della chiusura o delle finiture."],
      ["Dopo", "Ambito ultimato, punti di riferimento e condizioni alla consegna."],
    ] },
  },
};
