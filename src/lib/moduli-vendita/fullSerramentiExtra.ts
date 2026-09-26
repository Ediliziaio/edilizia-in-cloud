/**
 * Serramenti, due modelli in più (Lotto 9): portoni per garage e grate/inferriate.
 * Contenuto editoriale per completeSerramentiEdition. Ogni costante è dati a sé
 * (regola d'oro). Le copertine sono placeholder finché non arrivano le immagini
 * dedicate (vedi docs/prompt-immagini-modelli.md). Nessuna norma affermata a
 * memoria: sicurezza del movimento e classi antieffrazione si rimandano alle
 * regole in vigore e alla documentazione del prodotto.
 */
import type { SrEditorialContent } from "./fullSerramentiFactory";

export const portoniGarageContent: SrEditorialContent = {
  id: "portoni-garage", cover: "/pdf-stock/serramenti/installazione.jpg",
  hero: "Il garage.\nAperto con un gesto.", subtitle: "Portone sezionale, basculante o scorrevole scelto sul vano reale: motore, sicurezze e coibentazione definiti prima.", eyebrow: "PORTONI GARAGE",
  needs: [
    ["Scegliere il tipo giusto", "Sezionale, basculante, a libro o scorrevole si scelgono sul vano, sullo spazio interno e su come si usa il garage. Non sono intercambiabili."],
    ["Motorizzare in sicurezza", "L'automazione richiede sicurezze contro schiacciamento e un'alimentazione dedicata: si prevedono, non si aggiungono dopo."],
    ["Coibentazione e tenuta", "Se il garage è riscaldato o abitabile, pannelli coibentati e guarnizioni contano. Il livello si concorda sull'uso reale."],
  ],
  solution: [
    ["Un portone identificato", "Tipo, misure, pannelli, colore e finitura sono riportati nella configurazione approvata, non dedotti dall'immagine."],
    ["Motore e sicurezze definiti", "Motore, telecomandi, fotocellule, bordo sensibile e sblocco manuale sono specificati; le protezioni seguono le regole in vigore."],
    ["Posa coerente col vano", "Guide, controtelaio, fissaggi e spazio di rotazione si verificano prima di confermare lavorazioni e finiture."],
  ],
  usp: ["Tipo e sicurezze scelti sul vano reale", "Fornitura e opere accessorie separate", "Consegna con prova di apertura e sblocco manuale"],
  phases: [
    ["Rilievo", ["Vano e spazio interno", "Alimentazione disponibile", "Uso del garage"]],
    ["Scelta", ["Tipo e pannelli", "Motore e sicurezze", "Colore e coibentazione"]],
    ["Conferma", ["Scheda del portone", "Opere e condizioni", "Tempi di intervento"]],
    ["Consegna", ["Posa e regolazione", "Prova delle sicurezze", "Sblocco manuale e istruzioni"]],
  ],
  guarantees: [
    ["Sicurezze del movimento", "Fotocellule, bordo sensibile e segnalazioni si prevedono secondo le regole in vigore, non come optional."],
    ["Componenti documentati", "Motore, pannelli e accessori seguono le condizioni e le caratteristiche dichiarate dal produttore."],
    ["Verifica della posa", "La consegna riscontra guide, movimento, finecorsa e sblocco manuale della configurazione fornita."],
    ["Assistenza definita", "Referente, ricambi e servizi successivi seguono le condizioni applicabili dell'offerta."],
  ],
  faq: [
    ["Quale tipo di portone mi conviene?", "Dipende da vano, spazio interno (il sezionale libera la parete, il basculante ha bisogno di rotazione esterna/interna) e uso. Si sceglie sul garage reale, dopo il rilievo."],
    ["È compresa la motorizzazione?", "Solo se elencata. Motore, telecomandi, fotocellule e collegamento elettrico si specificano e si quotano; non sono automaticamente inclusi."],
    ["Cosa succede se manca la corrente?", "Lo sblocco manuale permette di aprire il portone; una batteria tampone, se prevista, mantiene alcune manovre. Si concorda nella configurazione."],
    ["Le sicurezze sono obbligatorie?", "Le protezioni contro schiacciamento e cesoiamento vanno previste secondo le regole in vigore: fanno parte dell'installazione motorizzata."],
    ["Il portone è coibentato?", "Solo se il modello e i pannelli scelti lo sono. Il livello di coibentazione e le guarnizioni si concordano in base all'uso del garage."],
    ["Servono opere murarie?", "Controtelaio, adattamenti del vano e ripristini sono inclusi solo se descritti. Il vano reale si verifica prima di confermare."],
    ["Posso comandarlo dal telefono?", "Solo con dispositivi e servizi compatibili, se questa funzione è inclusa e l'alimentazione lo consente."],
    ["Le immagini mostrano il prodotto definitivo?", "No, sono illustrative. Fanno fede la scheda, i pannelli e il colore approvati nell'offerta."],
  ],
  blocks: {
    comeFunziona: { title: "Il portone è *tipo, motore e sicurezze*.", intro: "Non conta solo l'estetica: tipo di apertura, spazio disponibile e protezioni definiscono la soluzione. La proposta lo dice.", photo: "/module-art/serramenti-porte-ingresso-dettaglio-v1.jpg", items: [
      ["Tipo di apertura", "Sezionale, basculante, a libro o scorrevole: si sceglie su vano, spazio interno e uso."],
      ["Pannelli e coibentazione", "Materiale, finitura e livello di coibentazione dei pannelli si definiscono in scheda."],
      ["Motore e comandi", "Motore, telecomandi e sblocco manuale sono specificati, con l'alimentazione necessaria."],
      ["Sicurezze", "Fotocellule, bordo sensibile e segnalazioni seguono le regole in vigore sul movimento."],
    ] },
    protezione: { title: "Organizzare la posa, *proteggere l'accesso*.", intro: "La sostituzione del portone richiede una sequenza concordata e attenzione allo spazio del garage.", items: [
      ["Accessi e spazio", "Concordare manovra, deposito e gestione dei mezzi durante la rimozione e la posa."],
      ["Alimentazione", "Pianificare la linea elettrica per il motore e le eventuali predisposizioni."],
      ["Rimozioni", "Definire la gestione del vecchio portone e dei materiali rimossi, quando inclusa."],
      ["Ripristini", "Precisare controtelaio, adattamenti del vano e finiture; gli imprevisti richiedono varianti concordate."],
    ] },
    controlli: { title: "Una consegna verificabile, *anche in sicurezza*.", intro: "I riscontri riguardano il portone installato e le sicurezze previste, senza attribuire funzioni non documentate.", items: [
      ["Configurazione", "Verifica di tipo, misure, pannelli, colore e accessori rispetto alla scheda approvata."],
      ["Movimento", "Prova di apertura e chiusura complete, finecorsa e regolazione."],
      ["Sicurezze", "Prova di fotocellule, bordo sensibile e segnalazioni sul movimento reale."],
      ["Sblocco manuale", "Prova dello sblocco in mancanza di corrente e consegna delle istruzioni e dei telecomandi."],
    ] },
    documenti: { title: "Sapere cosa hai scelto, *anche domani*.", intro: "I riferimenti della fornitura aiutano a usare il portone e a richiedere assistenza sul prodotto corretto.", items: [
      ["Scheda del portone", "Tipo, misure, pannelli, motore e accessori della fornitura approvata."],
      ["Documentazione prodotto", "Documenti disponibili e applicabili con le caratteristiche dichiarate."],
      ["Uso e sicurezze", "Istruzioni per uso, sblocco manuale, telecomandi e verifiche periodiche delle sicurezze."],
      ["Condizioni e contatti", "Riepilogo delle lavorazioni, eventuali riserve e riferimenti per assistenza."],
    ] },
    diario: { title: "Il garage, *prima e dopo*.", intro: "Se previste, le foto tracciano i passaggi utili del lavoro. La copertina illustrativa non documenta un'installazione aziendale.", items: [
      ["Prima", "Vano, guide e portone esistenti, con le criticità rilevate nel sopralluogo."],
      ["Durante", "Guide, controtelaio e motore in posa, prima delle finiture."],
      ["Dopo", "Portone finito, con prova di apertura, sicurezze e sblocco manuale."],
    ] },
  },
};

export const grateContent: SrEditorialContent = {
  id: "grate", cover: "/pdf-stock/serramenti/risultato.jpg",
  hero: "Più sicurezza.\nSenza rinunciare alla luce.", subtitle: "Grate e inferriate fisse o apribili, fissate sul supporto giusto: sicurezza, via di fuga e finitura definite prima.", eyebrow: "GRATE E INFERRIATE",
  needs: [
    ["Proteggere le aperture", "Finestre, portefinestre e accessi al piano terra o su ballatoi vogliono una barriera solida. Il livello di protezione va commisurato al caso reale."],
    ["Non chiudersi dentro", "Su una via di fuga la grata deve poter essere aperta dall'interno senza chiave: è una scelta di sicurezza, non un dettaglio."],
    ["Fissare su supporto solido", "Una grata vale quanto il suo ancoraggio: muratura e supporto si verificano prima, non a lavoro iniziato."],
  ],
  solution: [
    ["Una grata identificata", "Fissa o apribile, misure, disegno, materiale e finitura sono riportati nella configurazione approvata."],
    ["Apertura e chiusura definite", "Battente, scorrevole o a scomparsa, serratura e sblocco interno sono specificati secondo l'uso del vano."],
    ["Ancoraggio verificato", "Zanche, tasselli e punti di fissaggio si scelgono dopo la verifica del muro e delle condizioni reali."],
  ],
  usp: ["Sicurezza commisurata al vano reale", "Via di fuga apribile dall'interno dove serve", "Consegna con prova di apertura e chiusura"],
  phases: [
    ["Rilievo", ["Vani e accessi", "Supporto e muratura", "Vie di fuga"]],
    ["Scelta", ["Fissa o apribile", "Disegno e materiale", "Serratura e sblocco"]],
    ["Conferma", ["Scheda della grata", "Opere e condizioni", "Tempi di intervento"]],
    ["Consegna", ["Posa e ancoraggi", "Prova di apertura", "Chiavi e istruzioni"]],
  ],
  guarantees: [
    ["Ancoraggio verificato", "I fissaggi si scelgono dopo la verifica del supporto: una grata protegge quanto regge il suo ancoraggio."],
    ["Sicurezza d'uscita", "Sulle vie di fuga si prevede l'apertura dall'interno senza chiave, secondo l'uso dei locali."],
    ["Materiali documentati", "Ferro, acciaio o altro materiale e la finitura seguono le caratteristiche dichiarate; nessuna classe antieffrazione è presunta."],
    ["Verifica della posa", "La consegna riscontra ancoraggi, apertura, chiusura e finitura della configurazione fornita."],
  ],
  faq: [
    ["Le grate sono antieffrazione certificate?", "La sola presenza non basta: una classe certificata va documentata per il prodotto e la posa scelti. L'offerta indica materiale e caratteristiche, senza promesse generiche."],
    ["Posso aprirle dall'interno in caso di emergenza?", "Sulle vie di fuga la grata deve poter essere aperta dall'interno senza chiave. È una scelta di sicurezza da definire per ogni vano."],
    ["Fisse o apribili?", "Le fisse costano meno ma non permettono di uscire o pulire il vetro; le apribili (battente, scorrevoli, a scomparsa) sì. Si sceglie sull'uso reale della finestra."],
    ["Si fissano su qualsiasi muro?", "No: il supporto va verificato. Muratura debole o cappotto esterno richiedono ancoraggi dedicati, da definire prima della posa."],
    ["Tolgono luce o aria?", "Il disegno incide: maglie e sezioni si scelgono per unire sicurezza e visione. Una grata ben progettata protegge senza chiudere l'ambiente."],
    ["Posso scegliere il disegno e il colore?", "Sì, tra le soluzioni compatibili: disegno, materiale e finitura si concordano su campione prima dell'ordine."],
    ["Sono comprese le opere murarie?", "Solo quelle descritte. Ripristini attorno agli ancoraggi e finiture vanno distinti dalle attività escluse."],
    ["Le immagini mostrano il prodotto definitivo?", "No, sono illustrative. Fanno fede la scheda, il disegno e la finitura approvati nell'offerta."],
  ],
  blocks: {
    comeFunziona: { title: "La grata è *sicurezza, uscita e ancoraggio*.", intro: "Non conta solo il disegno: apertura dall'interno, supporto e fissaggi definiscono la protezione reale. La proposta lo dice.", photo: "/pdf-stock/serramenti/dettaglio.jpg", items: [
      ["Fissa o apribile", "A battente, scorrevole o a scomparsa: si sceglie su uso del vano e via di fuga."],
      ["Disegno e materiale", "Maglie, sezioni, materiale e finitura uniscono sicurezza, luce e aspetto."],
      ["Serratura e sblocco", "Sulle vie di fuga l'apertura interna senza chiave è specificata, non sottintesa."],
      ["Ancoraggio", "Zanche, tasselli e punti di fissaggio si definiscono sul supporto reale."],
    ] },
    protezione: { title: "Organizzare la posa, *preservare gli spazi*.", intro: "L'installazione delle grate richiede attenzione al supporto e alle superfici della casa.", items: [
      ["Accessi e supporto", "Verificare muratura, cappotto e punti di fissaggio prima della posa."],
      ["Protezioni", "Individuare davanzali, finiture e pavimenti da proteggere durante le lavorazioni."],
      ["Polvere e forature", "Delimitare l'area delle forature e gestire polveri e materiali rimossi."],
      ["Ripristini", "Precisare stuccature e finiture attorno agli ancoraggi incluse nell'offerta."],
    ] },
    controlli: { title: "Una consegna verificabile, *vano per vano*.", intro: "I riscontri riguardano le grate installate e gli ancoraggi previsti, senza attribuire classi non documentate.", items: [
      ["Configurazione", "Verifica di misure, disegno, materiale e finitura rispetto alla scheda approvata."],
      ["Ancoraggi", "Controllo di zanche, tasselli e tenuta sul supporto reale."],
      ["Apertura e uscita", "Prova di apertura, chiusura e, sulle vie di fuga, dello sblocco interno."],
      ["Finiture", "Riscontro delle finiture e dei ripristini previsti attorno ai fissaggi."],
    ] },
    documenti: { title: "Sapere cosa hai scelto, *anche domani*.", intro: "I riferimenti della fornitura aiutano a usare le grate e a richiedere assistenza sul prodotto corretto.", items: [
      ["Scheda delle grate", "Misure, disegno, materiale, finitura e accessori della fornitura approvata."],
      ["Documentazione prodotto", "Caratteristiche dichiarate ed eventuali certificazioni applicabili alla configurazione."],
      ["Uso e chiavi", "Istruzioni per apertura, sblocco interno e gestione delle chiavi."],
      ["Condizioni e contatti", "Riepilogo delle lavorazioni, eventuali riserve e riferimenti per assistenza."],
    ] },
    diario: { title: "Le aperture, *prima e dopo*.", intro: "Se previste, le foto tracciano i passaggi utili del lavoro. La copertina illustrativa non documenta un'installazione aziendale.", items: [
      ["Prima", "Vani e supporti esistenti, con le criticità rilevate nel sopralluogo."],
      ["Durante", "Ancoraggi e fissaggi in posa, prima delle finiture."],
      ["Dopo", "Grate finite, con prova di apertura, chiusura e sblocco interno dove previsto."],
    ] },
  },
};
