import type { SrEditorialContent } from "./fullSerramentiFactory";
const detail = "/module-art/serramenti-porte-interne-dettaglio.jpg";

export const porteInterneContent: SrEditorialContent = {
  id: "porte-interne", cover: "/module-art/serramenti-porte-interne-cover.jpg",
  images: [{ url: detail, name: "Maniglia, bordo anta e telaio" }],
  hero: "Ogni stanza,\nla sua apertura.", subtitle: "Porte interne coordinate con i tuoi spazi: aperture, finiture e posa definite vano per vano.", eyebrow: "PORTE INTERNE",
  needs: [
    ["Usare bene lo spazio", "Verificare ingombri, passaggio e posizione degli arredi prima di scegliere tra battente e scorrevole."],
    ["Coordinare le finiture", "Confrontare anta, telaio, coprifili e maniglie con pavimenti e colori degli ambienti."],
    ["Capire il lavoro necessario", "Distinguere la sostituzione della porta dagli interventi su vano, parete e controtelaio."],
  ],
  solution: [
    ["Una scheda per ogni stanza", "Misure, apertura, modello, finitura e accessori sono associati al vano interessato."],
    ["Supporti verificati", "Spessore del muro, stato del vano e quota del pavimento si controllano prima di confermare fornitura e posa."],
    ["Lavorazioni riconoscibili", "Rimozione, telai, coprifili e gli eventuali ripristini sono riportati nelle voci, senza inclusioni implicite."],
  ],
  usp: ["Aperture scelte in base agli spazi reali", "Anta, telaio e maniglia coordinati", "Varianti e ripristini chiariti prima dei lavori"],
  phases: [
    ["Rilievo", ["Misure dei vani", "Pareti e pavimenti", "Passaggi e ingombri"]],
    ["Scelta", ["Battente o scorrevole", "Finiture e campioni", "Maniglie e accessori"]],
    ["Conferma", ["Scheda per ambiente", "Opere comprese", "Prezzo e tempi"]],
    ["Consegna", ["Posa e regolazione", "Prova delle aperture", "Cura e documenti"]],
  ],
  guarantees: [
    ["Fornitura identificata", "Modello, apertura, finitura e accessori sono riconoscibili nella scheda approvata di ogni vano."],
    ["Regolazioni riscontrate", "La consegna verifica movimento, chiusura e maniglie della configurazione installata."],
    ["Cura delle superfici", "Le indicazioni di pulizia e utilizzo seguono i materiali e le istruzioni del produttore."],
    ["Assistenza trasparente", "Condizioni, limitazioni e servizi successivi sono quelli applicabili alla fornitura, senza durate aggiuntive presunte."],
  ],
  faq: [
    ["Battente o scorrevole: cosa cambia nel lavoro?", "La scelta dipende da passaggio e spazio disponibile. Per la scorrevole si distingue il sistema esterno dalla scomparsa nella parete, indicando le opere necessarie."],
    ["Si può conservare il vecchio telaio?", "Solo dopo la verifica di misure, stato e compatibilità con il prodotto proposto. Anta, telaio e coprifili non sono sostituzioni automaticamente equivalenti."],
    ["Le maniglie sono comprese?", "Solo quelle identificate nella fornitura. Modello, finitura e gli eventuali accessori di chiusura devono comparire nella scheda."],
    ["Posso scegliere finiture diverse tra le stanze?", "Se disponibili per il sistema scelto. Ogni vano deve riportare la configurazione approvata; si confrontano campioni e non soltanto fotografie."],
    ["Il controtelaio a scomparsa è incluso?", "Solo se descritto. Controtelaio, modifiche alla parete e ripristini sono voci distinte da anta e accessori."],
    ["Il pavimento deve essere già finito?", "Quota e stato del pavimento si concordano prima del rilievo definitivo. Cambiamenti successivi possono richiedere verifiche e varianti alla fornitura."],
    ["La porta offre prestazioni acustiche o antincendio?", "Non si presumono dal tipo di finitura o dall'aspetto. Le esigenze specifiche si confrontano con la documentazione del prodotto e della configurazione proposta."],
    ["Cosa controlliamo alla consegna?", "Modello, finitura, apertura, movimento, chiusura, maniglie e coprifili previsti. Eventuali regolazioni o ripristini residui vengono annotati."],
  ],
  blocks: {
    comeFunziona: { title: "Una porta, *più elementi da scegliere*.", intro: "La proposta distingue le parti della fornitura e le lavorazioni necessarie nel vano reale.", photo: detail, items: [
      ["Anta e apertura", "Modello, misure, senso di apertura e sistema a battente o scorrevole per ciascun ambiente."],
      ["Telaio e coprifili", "Configurazione coerente con spessore della parete e finiture, con le parti conservate o sostituite indicate."],
      ["Maniglia e chiusura", "Accessori, finitura e utilizzo desiderato vengono confermati insieme alla porta."],
      ["Finitura", "Materiale e campione identificano la scelta; le immagini illustrative non sostituiscono l'approvazione."],
    ] },
    protezione: { title: "Rinnovare le porte, *curare gli ambienti*.", intro: "Accessi e protezioni si concordano in base alle rimozioni e alle lavorazioni previste.", items: [
      ["Spazi di lavoro", "Liberare i vani e concordare aree per la movimentazione e il deposito temporaneo dei componenti."],
      ["Superfici", "Individuare pavimenti, pareti e arredi vicini da proteggere durante le attività concordate."],
      ["Rimozioni", "Precisare gestione delle vecchie porte e dei materiali rimossi, quando il servizio è incluso."],
      ["Ripristini", "Distinguere posa di telai e coprifili dalle eventuali opere sulla parete e dalle tinteggiature."],
    ] },
    controlli: { title: "Ogni stanza, *una verifica finale*.", intro: "La consegna riscontra la configurazione installata e le finiture concordate, registrando eventuali attività residue.", photo: detail, items: [
      ["Corrispondenza", "Confrontare apertura, finitura, modello e accessori con la scheda approvata del vano."],
      ["Movimento", "Provare apertura e chiusura, verificando gli ingombri e le regolazioni previste dal sistema."],
      ["Accessori e finiture", "Riscontrare maniglie, chiusure, telai e coprifili forniti, segnalando le anomalie visibili."],
      ["Consegna", "Condividere le indicazioni di cura e annotare eventuali interventi ancora da completare."],
    ] },
    documenti: { title: "Le tue scelte, *facili da ritrovare*.", intro: "Un riepilogo per ambiente aiuta a riconoscere prodotti, accessori e attività comprese nella fornitura.", items: [
      ["Elenco dei vani", "Ambiente, misure, apertura e configurazione approvata per ciascuna porta."],
      ["Prodotti e campioni", "Riferimenti di anta, telaio, coprifili e maniglie con le finiture concordate."],
      ["Uso e cura", "Documentazione disponibile e applicabile, istruzioni per pulizia e utilizzo del sistema fornito."],
      ["Assistenza", "Condizioni applicabili, lavorazioni eseguite e recapito per le segnalazioni successive."],
    ] },
    diario: { title: "Da una stanza all'altra: *le fasi del lavoro*.", intro: "Le fotografie del cantiere, quando concordate, documentano il lavoro reale. Le immagini del modello sono illustrative.", items: [
      ["Prima", "Vani, pareti, quote dei pavimenti e interferenze individuate nel rilievo."],
      ["Durante", "Supporti e dettagli della posa che risultano meno visibili dopo l'applicazione dei coprifili."],
      ["Dopo", "Porte e finiture per ogni stanza, con eventuali riserve da completare alla consegna."],
    ] },
  },
};
