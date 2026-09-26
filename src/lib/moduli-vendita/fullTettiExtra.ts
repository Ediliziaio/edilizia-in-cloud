/**
 * Tetti, tre interventi in più (Lotto 5): bonifica amianto, linea vita, lucernari
 * e finestre da tetto. Contenuto editoriale per completeTettiEdition. Ogni
 * costante è dati a sé (regola d'oro del piano). Le norme non si affermano a
 * memoria: si rimanda alla normativa in vigore e alle autorità competenti.
 */
import type { TetEditorialContent } from "./fullTettiFactory";

export const amiantoContent: TetEditorialContent = {
  title: "L'amianto via.\nIn sicurezza, con le carte.",
  subtitle: "Rimozione o incapsulamento di coperture in cemento-amianto: ditta abilitata, piano di lavoro e smaltimento tracciato.",
  eyebrow: "BONIFICA AMIANTO",
  cover: "/pdf-stock/tetti/protezione.jpg",
  closingPhoto: "/pdf-stock/comune/giro-consegna.jpg",
  images: [
    { url: "/pdf-stock/tetti/squadra.jpg", name: "Squadra abilitata al lavoro, riferimento illustrativo" },
    { url: "/pdf-stock/comune/controllo-finale.jpg", name: "Verifica finale, se prevista" },
  ],
  needs: [
    ["Valutare lo stato del materiale", "Le lastre in cemento-amianto (eternit) integre o friabili si affrontano diversamente: prima si valuta lo stato di conservazione."],
    ["Scegliere tra rimozione e incapsulamento", "Rimuovere e smaltire, oppure incapsulare o sovracoprire: la scelta dipende dallo stato, dall'accesso e dai vincoli."],
    ["Rispettare la procedura", "La bonifica la esegue una ditta abilitata, con un piano di lavoro presentato all'ASL prima di iniziare e lo smaltimento in discarica autorizzata."],
  ],
  solution: [
    ["Ditta abilitata e piano di lavoro", "La rimozione è affidata a chi è iscritto all'albo dei gestori ambientali, con il piano di lavoro trasmesso all'ASL nei tempi previsti."],
    ["Rimozione o incapsulamento", "Si sceglie la soluzione adatta allo stato del materiale: rimozione con smaltimento, oppure incapsulamento o sovracopertura dove consentito."],
    ["Smaltimento tracciato", "Il materiale rimosso, imballato e sigillato, va in discarica autorizzata con il formulario che ne segue il percorso."],
  ],
  usp: [
    ["Procedura rispettata", "Ditta abilitata, piano di lavoro all'ASL e smaltimento tracciato: la sicurezza viene prima della rapidità."],
    ["La soluzione giusta", "Rimozione o incapsulamento in base allo stato reale del materiale e all'accesso."],
    ["Documenti in ordine", "Piano di lavoro, formulario e certificazione di avvenuto smaltimento restano a te."],
  ],
  journey: [
    ["01 · Valutare", "Stato del materiale, accesso e soluzione adatta."],
    ["02 · Autorizzare", "Piano di lavoro all'ASL e attesa dei tempi previsti."],
    ["03 · Bonificare", "Rimozione o incapsulamento in sicurezza, con i DPI e le protezioni."],
    ["04 · Smaltire", "Imballaggio, trasporto in discarica autorizzata e formulario."],
  ],
  guarantees: [
    ["Ditta abilitata", "L'intervento è eseguito da chi è iscritto all'albo dei gestori ambientali."],
    ["Procedura documentata", "Piano di lavoro e comunicazioni previste sono seguiti prima e durante."],
    ["Smaltimento certificato", "La certificazione di avvenuto smaltimento e il formulario restano a te."],
    ["Nuova copertura definita", "Il rifacimento o la sovracopertura successiva è indicato a parte, se previsto."],
  ],
  schedule: [
    ["Sopralluogo e valutazione", "Stato del materiale, accesso e soluzione."],
    ["Piano di lavoro", "Trasmissione all'ASL e attesa dei tempi previsti."],
    ["Bonifica", "Rimozione o incapsulamento in sicurezza."],
    ["Smaltimento e documenti", "Discarica autorizzata, formulario e certificazione."],
  ],
  faq: [
    ["Posso rimuoverlo da solo?", "No, se non nei casi molto limitati previsti dalla normativa: la bonifica di una copertura la esegue una ditta abilitata, con un piano di lavoro all'ASL. È una tutela per la salute, non una formalità."],
    ["Meglio rimuovere o incapsulare?", "Dipende dallo stato: se le lastre sono integre, l'incapsulamento o la sovracopertura possono bastare e costano meno; se sono degradate, si rimuove. La scelta si fa sul materiale reale, non a priori."],
    ["Quanto tempo prima serve avvisare l'ASL?", "Il piano di lavoro va presentato prima dell'inizio e c'è un periodo di attesa previsto dalla normativa. I tempi esatti si verificano con l'ASL competente: sono parte del calendario, non un imprevisto."],
    ["Dove finisce il materiale rimosso?", "In una discarica autorizzata a riceverlo, imballato e sigillato, con un formulario che ne traccia il percorso. La certificazione di avvenuto smaltimento resta a te."],
    ["Ci sono incentivi?", "La rimozione dell'amianto può rientrare in agevolazioni o bandi, che cambiano nel tempo. Le regole in vigore si verificano prima: noi indichiamo cosa serve, la pratica la segue chi di competenza."],
    ["Dopo la rimozione, il tetto resta scoperto?", "No: si concorda la nuova copertura o la sovracopertura, indicata a parte nel computo. Bonifica e rifacimento si programmano insieme per non lasciare il tetto aperto."],
    ["È pericoloso per i vicini durante i lavori?", "Con le procedure corrette (bagnatura, imballo, delimitazione) il rischio è controllato. Il piano di lavoro descrive proprio le misure per la sicurezza di chi lavora e di chi sta intorno."],
    ["Le foto mostrano il mio tetto?", "No, sono illustrative. Soluzione, opere e documenti reali sono quelli del computo e delle procedure seguite."],
  ],
  blocks: {
    comeFunziona: { title: "Prima le carte. *Poi la bonifica*.", intro: "L'amianto si tratta con una procedura: ditta abilitata, piano di lavoro e smaltimento tracciato. La proposta lo dice.", photo: "/pdf-stock/tetti/protezione.jpg", items: [
      ["Valutazione", "Stato del materiale e soluzione adatta."],
      ["Piano di lavoro", "Trasmesso all'ASL prima di iniziare."],
      ["Bonifica", "Rimozione o incapsulamento in sicurezza."],
      ["Smaltimento", "Discarica autorizzata con formulario."],
    ] },
    compreso: { title: "Il prezzo riguarda *questa bonifica*.", intro: "Questa sintesi accompagna le voci. Superfici e soluzione confermate prevalgono sulle immagini.", items: [
      ["Procedura", "Piano di lavoro e comunicazioni previste."],
      ["Bonifica", "Rimozione o incapsulamento delle superfici indicate."],
      ["Smaltimento", "Trasporto in discarica autorizzata e formulario."],
      ["Documenti", "Certificazione di avvenuto smaltimento."],
    ], excluded: [
      ["Nuova copertura", "Rifacimento o sovracopertura successiva è a parte se non elencata."],
      ["Pratiche per incentivi", "Verifiche e domande per agevolazioni sono a parte."],
    ] },
    protezione: { title: "Bonificare. *Proteggere tutti*.", intro: "Le misure di sicurezza seguono il piano di lavoro e il posto reale. La foto è un esempio.", photo: "/pdf-stock/tetti/squadra.jpg", items: [
      ["Delimitazione", "Confinare l'area e gli accessi durante la bonifica."],
      ["Contenimento", "Bagnatura e imballo per non disperdere fibre."],
      ["DPI", "Dispositivi di protezione per chi lavora."],
      ["Percorsi", "Movimentazione sicura del materiale imballato."],
    ] },
    controlli: { title: "Superficie liberata. *Percorso tracciato*.", intro: "I riscontri riguardano la bonifica eseguita e i documenti previsti.", photo: "/pdf-stock/comune/controllo-finale.jpg", items: [
      ["Bonifica", "Verificare la rimozione o l'incapsulamento delle superfici."],
      ["Imballo", "Controllare sigillatura e trasporto del materiale."],
      ["Documenti", "Riscontrare formulario e certificazione."],
      ["Consegna", "Giro finale con te e documenti."],
    ] },
    documenti: { title: "La bonifica eseguita. *Le certificazioni*.", intro: "La documentazione rende tracciabile l'intero percorso, dal piano di lavoro allo smaltimento.", items: [
      ["Piano di lavoro", "Copia del piano trasmesso all'ASL."],
      ["Formulario", "Documento che segue il materiale in discarica."],
      ["Certificazione", "Attestazione di avvenuto smaltimento."],
      ["Assistenza", "Contatti e riferimenti."],
    ] },
    diario: { title: "Tetto pericoloso. *Copertura sicura*.", intro: "Quando concordato, il diario usa foto reali. Le immagini del modello restano illustrative.", items: [
      ["Prima", "La copertura in cemento-amianto da bonificare."],
      ["Durante", "Delimitazione, bonifica e imballo."],
      ["Dopo", "Superficie liberata e documenti."],
    ] },
  },
};

export const lineaVitaContent: TetEditorialContent = {
  title: "Salire in sicurezza.\nOgni volta.",
  subtitle: "Sistemi anticaduta (linea vita) per la copertura: ancoraggi, percorsi e certificazione secondo la normativa.",
  eyebrow: "LINEA VITA",
  cover: "/pdf-stock/tetti/squadra.jpg",
  closingPhoto: "/pdf-stock/comune/giro-consegna.jpg",
  images: [
    { url: "/pdf-stock/tetti/installazione.jpg", name: "Posa degli ancoraggi, riferimento illustrativo" },
    { url: "/pdf-stock/comune/controllo-finale.jpg", name: "Verifica finale, se prevista" },
  ],
  needs: [
    ["Rendere il tetto raggiungibile in sicurezza", "Chi sale a fare manutenzione (spazzacamino, antennista, manutentore) deve potersi ancorare: la linea vita serve a questo."],
    ["Progettare i percorsi e gli ancoraggi", "Punti di ancoraggio, linee flessibili e percorsi si progettano sulla forma del tetto e sui punti da raggiungere."],
    ["Fissare sulla struttura giusta", "Gli ancoraggi vanno fissati a elementi che reggono la trattenuta di una caduta: il supporto si verifica prima."],
  ],
  solution: [
    ["Progetto del sistema", "Un tecnico abilitato definisce tipo, posizione e numero degli ancoraggi e i percorsi di accesso e transito."],
    ["Ancoraggi certificati", "Componenti certificati, fissati alla struttura portante secondo le indicazioni del produttore e del progetto."],
    ["Documenti per chi salirà", "Elaborato tecnico e istruzioni d'uso restano sul posto, per chi userà il sistema in futuro."],
  ],
  usp: [
    ["Sicurezza a norma", "Il sistema si progetta e si certifica secondo la normativa, non si improvvisa."],
    ["Percorsi pensati", "Ancoraggi e linee dove servono davvero, per raggiungere camino, antenna e impianti."],
    ["Documenti pronti", "Elaborato e libretto d'uso restano per ogni futuro intervento sul tetto."],
  ],
  journey: [
    ["01 · Progettare", "Percorsi, ancoraggi e struttura di fissaggio (tecnico)."],
    ["02 · Confermare", "Tipo e posizione degli ancoraggi e delle linee."],
    ["03 · Installare", "Posa degli ancoraggi sulla struttura portante."],
    ["04 · Certificare", "Verifiche, elaborato e istruzioni d'uso."],
  ],
  guarantees: [
    ["Progetto tecnico", "Il sistema segue l'elaborato di un tecnico abilitato."],
    ["Componenti certificati", "Ancoraggi e linee certificati, posati come da progetto."],
    ["Documenti conservati", "Elaborato tecnico e libretto d'uso restano sul posto."],
    ["Fissaggi verificati", "Gli ancoraggi sono fissati a elementi portanti verificati."],
  ],
  schedule: [
    ["Sopralluogo e progetto", "Percorsi, ancoraggi e struttura (tecnico)."],
    ["Conferma", "Tipo, posizione e quantità degli ancoraggi."],
    ["Installazione", "Posa degli ancoraggi e delle linee."],
    ["Certificazione", "Verifiche, elaborato e istruzioni d'uso."],
  ],
  faq: [
    ["La linea vita è obbligatoria?", "In molte situazioni è richiesta per poter accedere in sicurezza alla copertura, e alcune regioni la chiedono per gli interventi sul tetto. Le regole in vigore, che variano sul territorio, si verificano prima."],
    ["Chi la progetta?", "Un tecnico abilitato redige l'elaborato: posizione e tipo di ancoraggi, percorsi e verifica dei fissaggi. È un incarico tecnico, distinto dall'installazione ma indispensabile."],
    ["Su cosa si fissano gli ancoraggi?", "Su elementi che reggono la forza di trattenuta di una caduta: travi, cordoli, strutture portanti. Fissarli su un supporto debole li rende inutili: il supporto si verifica prima."],
    ["Serve manutenzione?", "Sì: gli ancoraggi e le linee vanno verificati periodicamente, con le scadenze indicate dal produttore e dall'elaborato. Le verifiche successive sono un servizio a parte."],
    ["Chi può usarla?", "Chi sale con l'imbracatura e i dispositivi corretti, avendo letto le istruzioni. La linea vita è un sistema di sicurezza, non un semplice gancio: l'uso corretto è parte della sua efficacia."],
    ["Danneggia il tetto?", "No, se posata a regola d'arte con i giusti raccordi impermeabili sui punti di attraversamento del manto. La tenuta all'acqua degli ancoraggi è parte del lavoro."],
    ["Vale per il condominio?", "Sì: sulle coperture comuni la decide il condominio, spesso per consentire manutenzioni in sicurezza. È una decisione dell'assemblea; noi forniamo progetto e installazione."],
    ["Le foto mostrano il mio impianto?", "No, sono illustrative. Percorsi, ancoraggi e documenti reali sono quelli dell'elaborato e del computo."],
  ],
  blocks: {
    comeFunziona: { title: "Ancoraggi giusti. *Percorsi sicuri*.", intro: "Una linea vita si progetta: dove ancorarsi, come muoversi, su quale struttura fissare. La proposta lo dice.", photo: "/pdf-stock/tetti/squadra.jpg", items: [
      ["Progetto", "Elaborato tecnico di ancoraggi e percorsi."],
      ["Ancoraggi", "Componenti certificati nei punti previsti."],
      ["Struttura", "Fissaggio su elementi portanti verificati."],
      ["Documenti", "Elaborato e istruzioni d'uso."],
    ] },
    compreso: { title: "Il prezzo riguarda *questo sistema*.", intro: "Questa sintesi accompagna le voci. Progetto e componenti confermati prevalgono sulle immagini.", items: [
      ["Fornitura", "Ancoraggi e linee certificati previsti."],
      ["Installazione", "Posa e raccordi impermeabili sui fissaggi."],
      ["Certificazione", "Verifiche e documenti del sistema."],
      ["Istruzioni", "Libretto d'uso lasciato sul posto."],
    ], excluded: [
      ["Progetto tecnico", "L'elaborato del tecnico abilitato è a parte se non elencato."],
      ["Manutenzioni future", "Le verifiche periodiche successive sono un servizio a parte."],
    ] },
    protezione: { title: "Installare in quota. *In sicurezza*.", intro: "Accessi e protezioni si scelgono sul tetto reale. La foto è un esempio.", photo: "/pdf-stock/tetti/protezione.jpg", items: [
      ["Accesso", "Salita e delimitazione delle zone di lavoro."],
      ["Sicurezza", "Protezioni provvisorie durante la posa."],
      ["Manto", "Raccordi impermeabili sui punti di fissaggio."],
      ["Meteo", "Gestione delle fasi con la copertura aperta."],
    ] },
    controlli: { title: "Ancoraggi saldi. *Sistema certificato*.", intro: "I riscontri riguardano il sistema installato e l'elaborato concordato.", photo: "/pdf-stock/comune/controllo-finale.jpg", items: [
      ["Ancoraggi", "Verificare fissaggi e tenuta sulla struttura."],
      ["Raccordi", "Controllare l'impermeabilità sui punti di attraversamento."],
      ["Documenti", "Riscontrare elaborato e certificazione."],
      ["Consegna", "Istruzioni d'uso e giro finale con te."],
    ] },
    documenti: { title: "Il sistema installato. *Per chi salirà*.", intro: "La documentazione resta sul posto: chi userà il tetto in futuro deve sapere dove e come ancorarsi.", items: [
      ["Elaborato", "Progetto degli ancoraggi e dei percorsi."],
      ["Certificazione", "Attestazione dell'installazione a norma."],
      ["Uso", "Istruzioni per usare il sistema in sicurezza."],
      ["Manutenzione", "Scadenze delle verifiche periodiche."],
    ] },
    diario: { title: "Tetto rischioso. *Accesso sicuro*.", intro: "Quando concordato, il diario usa foto reali. Le immagini del modello restano illustrative.", items: [
      ["Prima", "La copertura da rendere accessibile in sicurezza."],
      ["Durante", "Posa degli ancoraggi e dei raccordi."],
      ["Dopo", "Sistema installato e certificato."],
    ] },
  },
};

export const lucernariContent: TetEditorialContent = {
  title: "Luce dall'alto.\nSenza infiltrazioni.",
  subtitle: "Lucernari e finestre da tetto: apertura nel manto, raccordi impermeabili e oscuranti, tenuta prima di tutto.",
  eyebrow: "LUCERNARI E FINESTRE DA TETTO",
  cover: "/pdf-stock/tetti/installazione.jpg",
  closingPhoto: "/pdf-stock/comune/pulizia-consegna.jpg",
  images: [
    { url: "/pdf-stock/tetti/storia-strati.jpg", name: "Raccordi sugli strati del tetto, riferimento illustrativo" },
    { url: "/pdf-stock/comune/controllo-finale.jpg", name: "Verifica finale, se prevista" },
  ],
  needs: [
    ["Portare luce dove manca", "Un sottotetto o una mansarda buia guadagna luce e aria con una finestra da tetto, dove una a parete non arriva."],
    ["Aprire il manto senza infiltrazioni", "L'apertura interrompe il tetto: i raccordi impermeabili (scossaline) sono ciò che tiene fuori l'acqua."],
    ["Scegliere apertura e oscuramento", "Manuale o motorizzata, con sensore pioggia, tende oscuranti o filtranti: si sceglie sull'uso della stanza."],
  ],
  solution: [
    ["Posizione studiata", "Numero, dimensione e posizione delle finestre sull'uso della stanza e sui rapporti aria-luce da rispettare."],
    ["Raccordi a tenuta", "Scossaline e membrane di raccordo adatte al tipo di manto (tegole, coppi, lamiera) per l'impermeabilità."],
    ["Comfort completo", "Apertura scelta e oscuranti per gestire luce, calore e privacy, dove previsti nel computo."],
  ],
  usp: [
    ["Luce vera", "Una finestra da tetto porta molta più luce di una a parete della stessa misura."],
    ["Tenuta all'acqua", "I raccordi impermeabili sul manto sono il cuore del lavoro: niente infiltrazioni."],
    ["Comfort gestito", "Motorizzazione, sensore pioggia e oscuranti per luce e calore, dove previsti."],
  ],
  journey: [
    ["01 · Progettare", "Posizione, dimensione e rapporti aria-luce."],
    ["02 · Scegliere", "Finestra, apertura, oscuranti e accessori."],
    ["03 · Installare", "Apertura del manto, posa e raccordi impermeabili."],
    ["04 · Rifinire", "Sguinci interni, oscuranti e prova di tenuta."],
  ],
  guarantees: [
    ["Raccordi a tenuta", "Le scossaline sono adatte al manto e posate a regola d'arte."],
    ["Garanzia del produttore", "Su finestre e motori vale la garanzia della casa, alle sue condizioni."],
    ["Perimetro scritto", "Opere comprese ed escluse distinte nel computo."],
    ["Documenti conservati", "Schede e istruzioni restano a te."],
  ],
  schedule: [
    ["Sopralluogo", "Posizione, manto, dimensioni e rapporti aria-luce."],
    ["Ordine", "Finestre, apertura e oscuranti confermati."],
    ["Installazione", "Apertura del manto, posa e raccordi impermeabili."],
    ["Finitura", "Sguinci interni, oscuranti e prova di tenuta."],
  ],
  faq: [
    ["Entra più luce di una finestra normale?", "Sì: una finestra da tetto, esposta al cielo, porta molta più luce di una a parete della stessa dimensione. Numero e posizione si scelgono anche sui rapporti aria-luce da rispettare."],
    ["Non farà entrare acqua?", "Non se i raccordi sono fatti bene: le scossaline attorno alla finestra, adatte al tipo di manto, sono ciò che tiene fuori l'acqua. È la parte più importante del lavoro."],
    ["Va bene su ogni tetto?", "Su tegole, coppi, lamiera o guaina esistono i raccordi adatti; la pendenza minima e lo spessore del tetto vanno verificati. La fattibilità si controlla sul manto reale."],
    ["Si può motorizzare?", "Sì, con apertura elettrica e sensore pioggia che chiude da solo. Utile soprattutto per le finestre alte o poco raggiungibili. È un accessorio elencato nel computo."],
    ["D'estate fa troppo caldo?", "Sotto il tetto la finestra può scaldare: le tende oscuranti o le schermature esterne riducono il calore. Si scelgono in base all'esposizione, se previste."],
    ["Serve un permesso?", "Aprire una finestra sul tetto può richiedere una pratica, e nei centri storici o sui vincoli ci sono regole sull'aspetto. Le regole in vigore si verificano prima."],
    ["Rifate anche gli sguinci interni?", "La finitura interna attorno alla finestra (sguinci) è compresa se elencata: dà l'aspetto finito e aiuta a distribuire la luce. Va indicata nel computo."],
    ["Le foto mostrano la mia finestra?", "No, sono illustrative. Finestre, raccordi e finiture reali sono quelli del computo confermato."],
  ],
  blocks: {
    comeFunziona: { title: "Aprire il tetto. *Tenere l'acqua fuori*.", intro: "Una finestra da tetto vale per la luce che porta e per i raccordi che la tengono a tenuta. La proposta lo dice.", photo: "/pdf-stock/tetti/installazione.jpg", items: [
      ["Posizione", "Dimensione e punto sui rapporti aria-luce."],
      ["Apertura", "Taglio del manto e posa della finestra."],
      ["Raccordi", "Scossaline impermeabili adatte al manto."],
      ["Comfort", "Motorizzazione, sensore e oscuranti dove previsti."],
    ] },
    compreso: { title: "Il prezzo riguarda *queste finestre*.", intro: "Questa sintesi accompagna le voci. Quantità e accessori confermati prevalgono sulle immagini.", items: [
      ["Fornitura", "Finestre da tetto nei tipi e nelle misure scelte."],
      ["Installazione", "Apertura del manto, posa e raccordi impermeabili."],
      ["Finitura", "Sguinci interni dove previsti."],
      ["Accessori", "Oscuranti e motorizzazione elencati."],
    ], excluded: [
      ["Opere strutturali", "Modifiche dell'orditura per finestre grandi sono a parte se non elencate."],
      ["Pratiche", "Autorizzazioni e verifiche sui vincoli sono a parte."],
    ] },
    protezione: { title: "Lavorare sul manto. *Senza scoprire*.", intro: "Accessi e protezioni si scelgono sul tetto reale. La foto è un esempio.", photo: "/pdf-stock/tetti/protezione.jpg", items: [
      ["Accesso", "Salita e delimitazione della zona di lavoro."],
      ["Meteo", "Aprire il manto solo con condizioni adatte."],
      ["Interni", "Proteggere la stanza sotto l'apertura."],
      ["Sicurezza", "Protezioni provvisorie durante la posa."],
    ] },
    controlli: { title: "Luce dentro. *Acqua fuori*.", intro: "I riscontri riguardano le finestre installate e i raccordi concordati.", photo: "/pdf-stock/comune/controllo-finale.jpg", items: [
      ["Raccordi", "Verificare la tenuta delle scossaline sul manto."],
      ["Apertura", "Controllare chiusura, oscuranti e sensori."],
      ["Sguinci", "Riscontrare la finitura interna prevista."],
      ["Consegna", "Prova di tenuta e giro finale con te."],
    ] },
    documenti: { title: "Le finestre installate. *Come si usano*.", intro: "La documentazione rende riconoscibili finestre, raccordi e accessori, utili per manutenzione e ricambi.", items: [
      ["Composizione", "Riepilogo di finestre, raccordi e oscuranti."],
      ["Uso", "Apertura, sensori e manutenzione."],
      ["Schede", "Riferimenti dei prodotti per i ricambi."],
      ["Assistenza", "Contatti e riferimenti."],
    ] },
    diario: { title: "Sottotetto buio. *Stanza luminosa*.", intro: "Quando concordato, il diario usa foto reali. Le immagini del modello restano illustrative.", items: [
      ["Prima", "La copertura chiusa e la stanza buia."],
      ["Durante", "Apertura del manto, posa e raccordi."],
      ["Dopo", "Finestre installate e a tenuta."],
    ] },
  },
};
