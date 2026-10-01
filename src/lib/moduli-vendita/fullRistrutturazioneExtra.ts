/**
 * Ristrutturazioni, cinque interventi in più (Lotto 4): cucina, mansarda e
 * sottotetto, aperture nei muri portanti, parti comuni del condominio, montascale
 * e piattaforme. Stessa area «Ristrutturazioni», stesso motore. Ogni costante è
 * dati a sé (regola d'oro del piano). Nessuna affermazione strutturale a memoria:
 * calcoli e pratiche sono di un tecnico incaricato, separati dalla fornitura.
 */
import type { TetEditorialContent } from "./fullTettiFactory";

export const cucinaContent: TetEditorialContent = {
  title: "La cucina che vivi.\nRifatta come si deve.",
  subtitle: "Impianti, rivestimenti e predisposizioni per la nuova cucina: cosa si rifà e cosa resta, definito prima.",
  eyebrow: "RIFACIMENTO CUCINA",
  cover: "/pdf-stock/ristrutturazione/storia-ciclo-lavori.jpg",
  closingPhoto: "/pdf-stock/comune/pulizia-consegna.jpg",
  images: [
    { url: "/pdf-stock/ristrutturazione/cantiere.jpg", name: "Lavori in corso, riferimento illustrativo" },
    { url: "/pdf-stock/comune/controllo-finale.jpg", name: "Controllo finale, se previsto" },
  ],
  needs: [
    ["Partire dal nuovo layout", "Dove vanno lavello, piano cottura, frigo e forno decide gli scarichi, l'acqua, il gas o l'induzione e le prese."],
    ["Predisporre gli impianti prima", "Punti acqua e scarico, potenza elettrica per l'induzione, cappa e areazione vanno portati dove serve, prima delle finiture."],
    ["Rifare le superfici giuste", "Pavimento, rivestimento dietro il piano di lavoro (paraschizzi) e tinteggiatura: si indica cosa è compreso."],
  ],
  solution: [
    ["Impianti sul progetto", "Scarichi, acqua, prese e linea dell'induzione portati nei punti del nuovo layout, non dove capita."],
    ["Superfici coordinate", "Rivestimento del paraschizzi, pavimento e tinteggiatura scelti e computati per la stanza reale."],
    ["Predisposizioni per la cucina", "Attacchi per gli elettrodomestici e per la cappa lasciati pronti per il montaggio dei mobili."],
  ],
  usp: [
    ["Impianti al posto giusto", "Il layout della cucina decide acqua, scarico e prese: si predispongono prima delle finiture."],
    ["Superfici curate", "Paraschizzi, pavimento e tinteggiatura coordinati, con un perimetro scritto."],
    ["Pronta per i mobili", "Attacchi e predisposizioni lasciati pronti per la posa della cucina."],
  ],
  journey: [
    ["01 · Progettare", "Nuovo layout, punti acqua, scarico ed elettrici."],
    ["02 · Confermare", "Impianti, rivestimenti, pavimento e predisposizioni."],
    ["03 · Realizzare", "Impianti, massetti e rivestimenti nelle zone concordate."],
    ["04 · Consegnare", "Verifiche, predisposizioni pronte e pulizia."],
  ],
  guarantees: [
    ["Impianti a regola d'arte", "A fine lavori rilasciamo le dichiarazioni previste per le opere eseguite."],
    ["Perimetro scritto", "Cosa si rifà e cosa resta è distinto nel computo."],
    ["Predisposizioni verificate", "Attacchi e prese lasciati pronti sono riscontrati alla consegna."],
    ["Assistenza pertinente", "Documenti e contatti restano a te per la posa dei mobili."],
  ],
  schedule: [
    ["Rilievo", "Layout, impianti esistenti e stato delle superfici."],
    ["Impianti", "Nuovi punti acqua, scarico ed elettrici della cucina."],
    ["Finiture", "Massetti, rivestimenti e tinteggiatura previsti."],
    ["Consegna", "Predisposizioni pronte, verifiche e pulizia."],
  ],
  faq: [
    ["Rifate anche gli impianti o solo le finiture?", "Dipende dal computo: se il layout cambia, acqua, scarico e prese vanno spostati e sono compresi solo se elencati. Le predisposizioni per la nuova cucina si lasciano pronte."],
    ["Posso passare dal gas all'induzione?", "Sì, ma serve la potenza elettrica adeguata e spesso l'adeguamento del quadro: si verifica prima. Chiudere il gas e portare la linea dedicata sono lavorazioni indicate nel computo."],
    ["Chi monta la cucina?", "Di solito il mobiliere. Noi lasciamo attacchi e predisposizioni pronti; il montaggio dei mobili è compreso solo se espressamente previsto."],
    ["Il pavimento va sotto o intorno alla cucina?", "Si concorda: posarlo su tutta la stanza dà continuità ma costa di più; fermarlo alla cucina fa risparmiare ma vincola futuri spostamenti. La scelta è nel computo."],
    ["Serve rifare il paraschizzi?", "Il rivestimento dietro il piano di lavoro protegge il muro da acqua e grasso. È compreso se elencato; materiale e altezza si scelgono con te."],
    ["Quanto resto senza cucina?", "I tempi dipendono da impianti, massetti e asciugatura. Si concorda un calendario e, se serve, una sistemazione provvisoria: non si promette una data sul nome del modulo."],
    ["Sposto una finestra o un muro?", "Sono opere a sé, con verifiche e pratiche proprie: se previste, entrano nel computo con perimetro e tempi dedicati."],
    ["Le foto mostrano la mia cucina?", "No, sono illustrative. Impianti, superfici e finiture reali sono quelli del computo confermato."],
  ],
  blocks: {
    comeFunziona: { title: "Prima gli impianti. *Poi le finiture*.", intro: "Una cucina si rifà dal layout: acqua, scarico e prese vanno portati dove serve, poi le superfici.", photo: "/pdf-stock/ristrutturazione/storia-ciclo-lavori.jpg", items: [
      ["Layout", "Posizione di lavello, cottura, frigo e forno."],
      ["Impianti", "Punti acqua, scarico, prese e linea induzione."],
      ["Superfici", "Pavimento, paraschizzi e tinteggiatura compresi."],
      ["Predisposizioni", "Attacchi per elettrodomestici e cappa."],
    ] },
    compreso: { title: "Il prezzo riguarda *queste opere*.", intro: "Questa sintesi accompagna le voci. Quantità e descrizioni confermate prevalgono sulle immagini.", items: [
      ["Impianti", "Nuovi punti previsti nel computo."],
      ["Finiture", "Pavimento, rivestimento e tinteggiatura elencati."],
      ["Predisposizioni", "Attacchi lasciati pronti per la cucina."],
      ["Pulizia", "Pulizia finale delle aree lavorate."],
    ], excluded: [
      ["Mobili ed elettrodomestici", "La cucina, il montaggio dei mobili e gli elettrodomestici sono esclusi se non elencati."],
      ["Opere non previste", "Spostare finestre o muri richiede verifiche e una valutazione separata."],
    ] },
    protezione: { title: "Aprire la stanza. *Proteggere il resto*.", intro: "Le protezioni si scelgono sulla casa reale. La foto è un esempio.", photo: "/pdf-stock/ristrutturazione/protezione-scale.jpg", items: [
      ["Percorsi", "Passaggi per materiali e rimozioni verso la cucina."],
      ["Superfici mantenute", "Proteggere pavimenti e parti adiacenti conservate."],
      ["Utenze", "Concordare le interruzioni di acqua, gas e luce."],
      ["Polvere", "Contenere la polvere di demolizioni e tracce."],
    ] },
    controlli: { title: "Impianti a norma. *Superfici finite*.", intro: "I riscontri riguardano le opere eseguite e le predisposizioni concordate.", photo: "/pdf-stock/comune/controllo-finale.jpg", items: [
      ["Impianti", "Verificare tenuta degli scarichi e prese collegate."],
      ["Superfici", "Controllare posa del pavimento e del rivestimento."],
      ["Predisposizioni", "Riscontrare attacchi pronti per la cucina."],
      ["Consegna", "Giro finale con te e pulizia."],
    ] },
    documenti: { title: "Le opere eseguite. *I riferimenti*.", intro: "La documentazione rende riconoscibili impianti e predisposizioni, utili al montaggio dei mobili.", items: [
      ["Perimetro", "Riepilogo di impianti e superfici comprese."],
      ["Predisposizioni", "Posizione di attacchi e prese lasciati pronti."],
      ["Dichiarazioni", "Documenti previsti per le opere eseguite."],
      ["Assistenza", "Contatti e indicazioni per la posa della cucina."],
    ] },
    diario: { title: "Cucina vecchia. *Cuore di casa*.", intro: "Quando concordato, il diario usa foto reali. Le immagini del modello restano illustrative.", items: [
      ["Prima", "La cucina da rifare e gli impianti esistenti."],
      ["Durante", "Impianti, massetti e rivestimenti."],
      ["Dopo", "Stanza finita, pronta per i mobili."],
    ] },
  },
};

export const sottotettoContent: TetEditorialContent = {
  title: "Il tetto sopra la testa.\nDiventa una stanza.",
  subtitle: "Mansarda e sottotetto abitabili: isolamento, altezze, luce e impianti, con i requisiti da verificare prima.",
  eyebrow: "MANSARDA E SOTTOTETTO",
  cover: "/pdf-stock/tetti/sottotetto.jpg",
  closingPhoto: "/pdf-stock/comune/pulizia-consegna.jpg",
  images: [
    { url: "/pdf-stock/tetti/isolamento.jpg", name: "Isolamento della falda, riferimento illustrativo" },
    { url: "/pdf-stock/comune/controllo-finale.jpg", name: "Controllo finale, se previsto" },
  ],
  needs: [
    ["Verificare abitabilità", "Altezze minime, rapporti aria-luce e requisiti dipendono dalle regole del Comune: si controllano prima di progettare."],
    ["Isolare la falda", "Sotto il tetto il caldo e il freddo passano più che altrove: l'isolamento decide il comfort e i consumi."],
    ["Portare luce e impianti", "Finestre da tetto, elettrico, riscaldamento e, dove serve, acqua vanno previsti per rendere lo spazio vivibile."],
  ],
  solution: [
    ["Requisiti chiariti", "Si distingue un recupero abitabile da un semplice ripostiglio, con le verifiche e le pratiche che ne derivano."],
    ["Involucro isolato", "Coibentazione della falda e correzione dei ponti termici per il comfort estivo e invernale."],
    ["Spazio vivibile", "Finestre da tetto per luce e aria, impianti e finiture dimensionati sull'uso previsto."],
  ],
  usp: [
    ["Metri quadri recuperati", "Uno spazio inutilizzato diventa una stanza, senza ampliare la casa."],
    ["Comfort sotto il tetto", "L'isolamento della falda toglie il caldo d'estate e il freddo d'inverno."],
    ["Onestà sui requisiti", "Diciamo prima se e come è abitabile, senza promettere ciò che le regole non consentono."],
  ],
  journey: [
    ["01 · Verificare", "Altezze, requisiti di abitabilità e stato del tetto."],
    ["02 · Progettare", "Isolamento, finestre, impianti e finiture."],
    ["03 · Realizzare", "Coibentazione, aperture, impianti e finiture."],
    ["04 · Consegnare", "Verifiche, documenti e pulizia."],
  ],
  guarantees: [
    ["Requisiti dichiarati", "Ciò che rende lo spazio abitabile o meno è indicato, non taciuto."],
    ["Involucro a regola d'arte", "Isolamento e opere eseguite con le dichiarazioni previste."],
    ["Perimetro scritto", "Opere comprese ed escluse distinte nel computo."],
    ["Documenti conservati", "Schede e certificazioni restano a te."],
  ],
  schedule: [
    ["Verifica e rilievo", "Altezze, requisiti, stato del tetto e impianti."],
    ["Involucro", "Isolamento della falda e correzione dei ponti termici."],
    ["Impianti e aperture", "Finestre da tetto, elettrico e riscaldamento."],
    ["Finiture e consegna", "Pareti, pavimento, documenti e pulizia."],
  ],
  faq: [
    ["Posso rendere abitabile il sottotetto?", "Dipende dalle altezze minime, dai rapporti aria-luce e dalle regole del Comune: alcuni sottotetti si recuperano, altri restano ripostigli o richiedono opere. Si verifica prima, sul caso concreto."],
    ["Serve una pratica edilizia?", "Il recupero di un sottotetto quasi sempre richiede una pratica e un tecnico incaricato. Noi indichiamo cosa serve; l'incarico tecnico è separato dalla fornitura."],
    ["Come si toglie il caldo d'estate?", "Con l'isolamento della falda e, dove serve, la ventilazione e schermature alle finestre da tetto. Sotto il tetto è la voce che incide di più sul comfort."],
    ["Le finestre da tetto sono comprese?", "Solo se elencate. Numero, dimensione e posizione dipendono dalla luce voluta e dai rapporti aria-luce da rispettare."],
    ["Ci posso mettere un bagno?", "Se ci sono lo spazio, le altezze e la possibilità di portare acqua e scarico, sì. È un'opera a sé, con impianti e pratiche proprie, indicata nel computo se prevista."],
    ["Quanto abbasso il soffitto con l'isolamento?", "L'isolamento interno ruba qualche centimetro all'altezza: dove le altezze sono al limite, incide sull'abitabilità. Si valuta insieme alla verifica dei requisiti."],
    ["Il pavimento regge come stanza?", "Il solaio va verificato per i carichi di un uso abitativo: è una verifica tecnica, separata dalla fornitura, che indichiamo se necessaria."],
    ["Le foto mostrano il mio sottotetto?", "No, sono illustrative. Opere, isolamento e finiture reali sono quelli del computo confermato."],
  ],
  blocks: {
    comeFunziona: { title: "Prima i requisiti. *Poi la stanza*.", intro: "Un sottotetto diventa vivibile se le altezze e la luce lo consentono, e se si isola bene. La proposta parte da lì.", photo: "/pdf-stock/tetti/sottotetto.jpg", items: [
      ["Requisiti", "Altezze, aria-luce e abitabilità verificate."],
      ["Isolamento", "Coibentazione della falda e ponti termici."],
      ["Luce e aria", "Finestre da tetto dimensionate."],
      ["Impianti", "Elettrico, riscaldamento e, dove serve, acqua."],
    ] },
    compreso: { title: "Il prezzo riguarda *queste opere*.", intro: "Questa sintesi accompagna le voci. Quantità e descrizioni confermate prevalgono sulle immagini.", items: [
      ["Isolamento", "Coibentazione della falda prevista nel computo."],
      ["Aperture", "Finestre da tetto elencate."],
      ["Impianti", "Elettrico e riscaldamento delle zone indicate."],
      ["Finiture", "Pareti, pavimento e tinteggiatura compresi."],
    ], excluded: [
      ["Pratiche e verifiche", "Incarico tecnico, calcoli sui carichi e autorizzazioni sono a parte se non elencati."],
      ["Opere non previste", "Nuovi bagni o modifiche del tetto richiedono una valutazione separata."],
    ] },
    protezione: { title: "Lavorare in alto. *Proteggere sotto*.", intro: "Accessi e protezioni si scelgono sul posto reale. La foto è un esempio.", photo: "/pdf-stock/ristrutturazione/protezione-scale.jpg", items: [
      ["Accessi", "Percorso per materiali fino al sottotetto."],
      ["Superfici", "Proteggere scale e piani sottostanti."],
      ["Utenze", "Concordare interruzioni durante gli impianti."],
      ["Polvere", "Contenere la polvere delle lavorazioni."],
    ] },
    controlli: { title: "Involucro continuo. *Spazio vivibile*.", intro: "I riscontri riguardano le opere eseguite e i requisiti concordati.", photo: "/pdf-stock/comune/controllo-finale.jpg", items: [
      ["Isolamento", "Verificare continuità della coibentazione."],
      ["Aperture", "Controllare tenuta e apertura delle finestre da tetto."],
      ["Impianti", "Riscontrare prese e riscaldamento collegati."],
      ["Consegna", "Giro finale con te e documenti."],
    ] },
    documenti: { title: "Le opere eseguite. *I requisiti*.", intro: "La documentazione rende riconoscibili opere, isolamento e ciò che è stato verificato.", items: [
      ["Perimetro", "Riepilogo delle opere comprese."],
      ["Involucro", "Materiali e stratigrafia dell'isolamento."],
      ["Requisiti", "Cosa è stato verificato sull'abitabilità."],
      ["Assistenza", "Documenti e contatti."],
    ] },
    diario: { title: "Sottotetto grezzo. *Stanza in più*.", intro: "Quando concordato, il diario usa foto reali. Le immagini del modello restano illustrative.", items: [
      ["Prima", "Lo spazio sotto il tetto da recuperare."],
      ["Durante", "Isolamento, aperture e impianti."],
      ["Dopo", "Mansarda finita e vivibile."],
    ] },
  },
};

export const aperturePortantiContent: TetEditorialContent = {
  title: "Aprire un muro.\nCon la testa, non a caso.",
  subtitle: "Nuove aperture nei muri portanti con rinforzo (cerchiatura): calcoli e pratiche del tecnico, opere nostre.",
  eyebrow: "APERTURE NEI MURI PORTANTI",
  cover: "/pdf-stock/ristrutturazione/tavola-percorso-lavori.jpg",
  closingPhoto: "/pdf-stock/comune/pulizia-consegna.jpg",
  images: [
    { url: "/pdf-stock/ristrutturazione/cantiere.jpg", name: "Lavori strutturali in corso, riferimento illustrativo" },
    { url: "/pdf-stock/ristrutturazione/controllo-elettrico.jpg", name: "Verifiche in cantiere, se previste" },
  ],
  needs: [
    ["Distinguere il muro giusto", "Un muro portante regge la casa: aprirlo senza rinforzo è pericoloso. Prima si capisce se è portante."],
    ["Progetto e calcoli del tecnico", "L'apertura in un portante richiede calcoli, un progetto strutturale e le pratiche: le fa un tecnico incaricato."],
    ["Eseguire il rinforzo a regola", "Il telaio o la trave di rinforzo (cerchiatura) si realizza come da progetto, con puntellazioni e sequenza corretta."],
  ],
  solution: [
    ["Verifica prima di tutto", "Si individua se il muro è portante e si coinvolge il tecnico per progetto, calcoli e pratica."],
    ["Rinforzo come da progetto", "Telaio metallico o trave, puntellazioni e sequenza di lavoro seguono il progetto strutturale approvato."],
    ["Ripristini coordinati", "Chiusura, intonaci, soglie e finiture attorno alla nuova apertura, come descritti."],
  ],
  usp: [
    ["Sicurezza prima di tutto", "Nessuna apertura senza verifica e progetto: il portante non si tocca a occhio."],
    ["Tecnico e impresa insieme", "Il tecnico fa calcoli e pratica, noi eseguiamo il rinforzo come da progetto."],
    ["Ripristini curati", "Intorno all'apertura, intonaci e finiture rientrano nel perimetro concordato."],
  ],
  journey: [
    ["01 · Verificare", "Se il muro è portante e cosa serve al tecnico."],
    ["02 · Progettare", "Calcoli, progetto strutturale e pratica (tecnico)."],
    ["03 · Rinforzare", "Puntellazioni, taglio e telaio di rinforzo come da progetto."],
    ["04 · Ripristinare", "Chiusure, intonaci e finiture attorno all'apertura."],
  ],
  guarantees: [
    ["Rinforzo come da progetto", "Il telaio è realizzato secondo il progetto strutturale del tecnico."],
    ["Ruoli chiari", "Calcoli e pratica sono del tecnico; l'esecuzione è nostra, come da computo."],
    ["Opere a regola d'arte", "A fine lavori rilasciamo le dichiarazioni previste per le opere eseguite."],
    ["Documenti conservati", "Progetto e dichiarazioni restano a te."],
  ],
  schedule: [
    ["Verifica", "Individuare il portante e il perimetro dell'apertura."],
    ["Progetto (tecnico)", "Calcoli, progetto strutturale e deposito della pratica."],
    ["Esecuzione", "Puntellazioni, taglio e telaio di rinforzo."],
    ["Ripristini", "Chiusure, intonaci e finiture, con pulizia."],
  ],
  faq: [
    ["Come si sa se un muro è portante?", "Da spessore, posizione, materiale e da come è fatta la casa. Nel dubbio si verifica: un muro portante regge solai e tetto, e aprirlo senza rinforzo è pericoloso. La verifica precede tutto."],
    ["Chi fa i calcoli e la pratica?", "Un tecnico incaricato (ingegnere o architetto): progetto strutturale, calcoli della cerchiatura e deposito della pratica. È un incarico separato dalla nostra esecuzione, ma indispensabile."],
    ["Cos'è la cerchiatura?", "È il rinforzo (di solito un telaio metallico o una trave con montanti) che sostituisce la funzione portante del muro che si apre. Si realizza esattamente come dice il progetto."],
    ["Posso aprire dove voglio?", "No: posizione e dimensione dell'apertura dipendono dalla struttura e dai calcoli. A volte il punto voluto non è possibile e il tecnico propone l'alternativa più vicina."],
    ["Quanto dura il lavoro?", "Oltre all'esecuzione ci sono i tempi del progetto e della pratica. Il calendario si concorda sul caso; non si promette una data sul nome del modulo."],
    ["Serve anche per un muro non portante?", "No: un tramezzo leggero si apre senza cerchiatura, con la sola verifica che non sia portante. In quel caso è un'opera più semplice, indicata a parte."],
    ["Fate anche la porta o l'infisso nell'apertura?", "L'infisso, la porta scorrevole o il vetro sono forniture a sé: rientrano se elencate nel computo, dopo il rinforzo e i ripristini."],
    ["Le foto mostrano il mio lavoro?", "No, sono illustrative. Rinforzo, opere e finiture reali seguono il progetto e il computo confermato."],
  ],
  blocks: {
    comeFunziona: { title: "Verifica, progetto, *rinforzo*.", intro: "Aprire un portante è un lavoro strutturale: prima la verifica e il progetto del tecnico, poi la cerchiatura.", photo: "/pdf-stock/ristrutturazione/tavola-percorso-lavori.jpg", items: [
      ["Verifica", "Capire se il muro è portante."],
      ["Progetto", "Calcoli e pratica del tecnico incaricato."],
      ["Rinforzo", "Telaio di cerchiatura come da progetto."],
      ["Ripristini", "Intonaci e finiture attorno all'apertura."],
    ] },
    compreso: { title: "Il prezzo riguarda *queste opere*.", intro: "Questa sintesi accompagna le voci. Quantità e descrizioni confermate prevalgono sulle immagini.", items: [
      ["Rinforzo", "Realizzazione della cerchiatura come da progetto."],
      ["Taglio e puntelli", "Puntellazioni e apertura in sicurezza."],
      ["Ripristini", "Chiusure, intonaci e soglie previsti."],
      ["Pulizia", "Pulizia finale e gestione dei materiali."],
    ], excluded: [
      ["Progetto e pratica", "Calcoli, progetto strutturale e pratica del tecnico sono a parte."],
      ["Infissi e finiture", "Porte, vetri e finiture nell'apertura sono esclusi se non elencati."],
    ] },
    protezione: { title: "Aprire in sicurezza. *Sostenere la casa*.", intro: "Puntellazioni e protezioni seguono il progetto e il posto reale. La foto è un esempio.", photo: "/pdf-stock/ristrutturazione/protezione-scale.jpg", items: [
      ["Puntellazioni", "Sostegni provvisori prima del taglio, come da progetto."],
      ["Percorsi", "Passaggi per rimozioni e materiali."],
      ["Superfici", "Proteggere pavimenti e parti adiacenti."],
      ["Polvere", "Contenere la polvere del taglio."],
    ] },
    controlli: { title: "Rinforzo saldo. *Apertura sicura*.", intro: "I riscontri riguardano le opere eseguite secondo il progetto del tecnico.", photo: "/pdf-stock/comune/controllo-finale.jpg", items: [
      ["Rinforzo", "Verificare la posa del telaio come da progetto."],
      ["Chiusure", "Controllare intonaci e ripristini attorno all'apertura."],
      ["Finiture", "Riscontrare soglie e bordi previsti."],
      ["Consegna", "Giro finale con te e documenti."],
    ] },
    documenti: { title: "Le opere eseguite. *Il progetto*.", intro: "La documentazione lega l'esecuzione al progetto del tecnico, con le dichiarazioni previste.", items: [
      ["Esecuzione", "Riepilogo delle opere comprese."],
      ["Rinforzo", "Riferimento al progetto strutturale seguito."],
      ["Dichiarazioni", "Documenti previsti per le opere eseguite."],
      ["Assistenza", "Contatti e riferimenti."],
    ] },
    diario: { title: "Due stanze. *Un solo spazio*.", intro: "Quando concordato, il diario usa foto reali. Le immagini del modello restano illustrative.", items: [
      ["Prima", "Il muro da aprire e le puntellazioni."],
      ["Durante", "Taglio e posa del rinforzo."],
      ["Dopo", "Apertura finita e ripristinata."],
    ] },
  },
};

export const condominioContent: TetEditorialContent = {
  title: "Le parti di tutti.\nCurate per bene.",
  subtitle: "Androni, scale, facciate interne e parti comuni del condominio: perimetro, fasi e accessi definiti prima.",
  eyebrow: "PARTI COMUNI DEL CONDOMINIO",
  cover: "/pdf-stock/ristrutturazione/storia-prima-durante-dopo.jpg",
  closingPhoto: "/pdf-stock/comune/pulizia-consegna.jpg",
  images: [
    { url: "/pdf-stock/ristrutturazione/cantiere-ordinato.jpg", name: "Cantiere ordinato, riferimento illustrativo" },
    { url: "/pdf-stock/comune/controllo-finale.jpg", name: "Controllo finale, se previsto" },
  ],
  needs: [
    ["Definire cosa è comune", "Androne, vano scale, ballatoi, facciate interne, cantine: si indica quali parti rientrano nell'intervento."],
    ["Lavorare con le persone dentro", "Il condominio è abitato: accessi, sicurezza dei passaggi e fasi vanno concordati con l'amministratore."],
    ["Un referente e un preventivo chiaro", "Con più condòmini serve un perimetro scritto, per non discutere a lavori iniziati."],
  ],
  solution: [
    ["Perimetro condiviso", "Ogni voce dice la parte comune interessata e la lavorazione, così l'assemblea decide su numeri chiari."],
    ["Cantiere tra le persone", "Passaggi protetti e sempre agibili, fasi concordate e comunicazione con l'amministratore."],
    ["Fasi ordinate", "Le lavorazioni si organizzano per non chiudere l'accesso alle abitazioni."],
  ],
  usp: [
    ["Perimetro per l'assemblea", "Un computo chiaro su cosa si fa nelle parti comuni, per decidere senza malintesi."],
    ["Passaggi sempre agibili", "L'ingresso e le scale restano usabili in sicurezza durante i lavori."],
    ["Un referente unico", "Un solo interlocutore per l'amministratore, dal preventivo alla consegna."],
  ],
  journey: [
    ["01 · Rilevare", "Parti comuni interessate, stato e accessi."],
    ["02 · Confermare", "Perimetro, fasi e organizzazione con l'amministratore."],
    ["03 · Eseguire", "Lavorazioni per fasi, con i passaggi agibili."],
    ["04 · Consegnare", "Verifiche, pulizia e documenti."],
  ],
  guarantees: [
    ["Perimetro scritto", "Le parti comuni interessate sono distinte nel computo."],
    ["Passaggi sicuri", "Accessi protetti e agibili durante le lavorazioni."],
    ["Opere a regola d'arte", "Dichiarazioni previste per le opere eseguite."],
    ["Documenti per l'amministratore", "Riepiloghi e documenti restano al condominio."],
  ],
  schedule: [
    ["Sopralluogo", "Parti comuni, stato, accessi e vincoli d'uso."],
    ["Organizzazione", "Perimetro e fasi concordati con l'amministratore."],
    ["Lavorazioni", "Esecuzione per fasi, passaggi sempre agibili."],
    ["Consegna", "Verifiche, pulizia e documenti."],
  ],
  faq: [
    ["Serve la delibera dell'assemblea?", "Le opere sulle parti comuni le decide il condominio con le sue maggioranze. Noi diamo un preventivo chiaro su cui deliberare; la delibera e i suoi tempi sono del condominio."],
    ["Si può usare l'ingresso durante i lavori?", "Sì: i passaggi restano agibili e protetti, con le lavorazioni organizzate per fasi. Le eventuali chiusure brevi si concordano e si comunicano prima."],
    ["Chi è il nostro riferimento?", "L'amministratore, o il referente indicato dal condominio. Da parte nostra c'è un solo interlocutore, dal preventivo alla consegna."],
    ["Rientra la facciata esterna?", "La facciata esterna è un intervento a sé (spesso con ponteggi e pratiche proprie). Qui si trattano androne, scale e parti comuni interne, salvo diversa indicazione nel computo."],
    ["Come si gestiscono i costi tra condòmini?", "La ripartizione tra i condòmini la fa l'amministratore secondo le tabelle millesimali: è cosa del condominio. Noi forniamo l'importo e il dettaglio delle opere."],
    ["Quanto durano i lavori?", "Dipende dalle opere e dal dover lavorare in un edificio abitato. Il calendario e le fasi si concordano; non si promette una data sul nome del modulo."],
    ["Fate anche l'ascensore o gli impianti comuni?", "Impianti comuni (ascensore, elettrico, citofonia) sono lavorazioni specifiche: rientrano se elencate nel computo, spesso con ditte specializzate coordinate."],
    ["Le foto mostrano il mio condominio?", "No, sono illustrative. Parti comuni e opere reali sono quelle del computo confermato."],
  ],
  blocks: {
    comeFunziona: { title: "Parti comuni, *perimetro comune*.", intro: "In un condominio conta la chiarezza: cosa si fa, dove e in che ordine, con le persone che ci abitano.", photo: "/pdf-stock/ristrutturazione/storia-prima-durante-dopo.jpg", items: [
      ["Parti comuni", "Androne, scale, ballatoi e parti indicate."],
      ["Accessi", "Passaggi protetti e sempre agibili."],
      ["Fasi", "Lavorazioni organizzate senza chiudere gli ingressi."],
      ["Referente", "Un interlocutore per l'amministratore."],
    ] },
    compreso: { title: "Il prezzo riguarda *queste parti*.", intro: "Questa sintesi accompagna le voci. Quantità e descrizioni confermate prevalgono sulle immagini.", items: [
      ["Preparazioni", "Protezioni e organizzazione dei passaggi."],
      ["Lavorazioni", "Opere sulle parti comuni elencate."],
      ["Ripristini", "Finiture e pulizie delle aree interessate."],
      ["Coordinamento", "Fasi e comunicazione con l'amministratore."],
    ], excluded: [
      ["Delibere e ripartizioni", "Decisioni dell'assemblea e ripartizione tra condòmini sono del condominio."],
      ["Facciata e impianti", "Facciata esterna, ascensore e impianti comuni sono a parte se non elencati."],
    ] },
    protezione: { title: "Cantiere abitato. *Passaggi sicuri*.", intro: "Le protezioni si scelgono sull'edificio reale. La foto è un esempio.", photo: "/pdf-stock/comune/protezione-ambienti.jpg", items: [
      ["Passaggi", "Percorsi protetti e sempre agibili per i condòmini."],
      ["Segnalazioni", "Avvisi su fasi e brevi chiusure."],
      ["Superfici", "Proteggere scale, corrimano e finiture conservate."],
      ["Sicurezza", "Aree di lavoro delimitate nelle parti comuni."],
    ] },
    controlli: { title: "Opere finite. *Passaggi liberi*.", intro: "I riscontri riguardano le parti comuni interessate e le opere concordate.", photo: "/pdf-stock/comune/controllo-finale.jpg", items: [
      ["Lavorazioni", "Verificare le opere eseguite nelle parti indicate."],
      ["Accessi", "Controllare che i passaggi siano liberi e sicuri."],
      ["Finiture", "Riscontrare ripristini e pulizie."],
      ["Consegna", "Giro finale con l'amministratore e documenti."],
    ] },
    documenti: { title: "Le opere eseguite. *Per il condominio*.", intro: "La documentazione rende riconoscibili parti e opere, utile all'amministratore e all'assemblea.", items: [
      ["Perimetro", "Riepilogo delle parti comuni interessate."],
      ["Opere", "Lavorazioni eseguite e materiali."],
      ["Dichiarazioni", "Documenti previsti per le opere eseguite."],
      ["Assistenza", "Contatti e riferimenti per il condominio."],
    ] },
    diario: { title: "Androne stanco. *Ingresso curato*.", intro: "Quando concordato, il diario usa foto reali. Le immagini del modello restano illustrative.", items: [
      ["Prima", "Le parti comuni da rinnovare."],
      ["Durante", "Lavorazioni per fasi, passaggi agibili."],
      ["Dopo", "Parti comuni finite e pulite."],
    ] },
  },
};

export const montascaleContent: TetEditorialContent = {
  title: "Ogni piano.\nSenza fatica.",
  subtitle: "Montascale, servoscala e piattaforme elevatrici: si sceglie sulla scala reale e sulle esigenze d'uso.",
  eyebrow: "MONTASCALE E PIATTAFORME",
  cover: "/pdf-stock/ristrutturazione/tavola-un-unico-progetto.jpg",
  closingPhoto: "/pdf-stock/comune/pulizia-consegna.jpg",
  images: [
    { url: "/pdf-stock/ristrutturazione/controllo-elettrico.jpg", name: "Verifica dei collegamenti, riferimento illustrativo" },
    { url: "/pdf-stock/comune/controllo-finale.jpg", name: "Controllo finale, se previsto" },
  ],
  needs: [
    ["Capire l'esigenza d'uso", "Chi lo usa e come (in piedi, seduto, in carrozzina) decide tra montascale a poltroncina, a pedana o piattaforma."],
    ["Misurare la scala reale", "Larghezza, pendenza, curve e pianerottoli decidono cosa si può installare e su quale lato."],
    ["Portare l'alimentazione", "Il sistema ha bisogno di una linea elettrica dedicata, portata al punto giusto."],
  ],
  solution: [
    ["Soluzione sull'uso", "Poltroncina per chi cammina con difficoltà, pedana o piattaforma per la carrozzina: si sceglie sull'esigenza reale."],
    ["Guida sulla scala", "Binario e stazioni dimensionati su misure, curve e lato, con gli ancoraggi alla struttura."],
    ["Alimentazione dedicata", "Linea elettrica portata al sistema, con l'adeguamento del punto dove serve."],
  ],
  usp: [
    ["Autonomia ritrovata", "Le scale smettono di essere un ostacolo, in casa o nelle parti comuni."],
    ["Su misura della scala", "Guida e stazioni fatte sulle misure, le curve e il lato reali."],
    ["Detrazioni per le barriere", "L'abbattimento delle barriere può rientrare in agevolazioni: le regole in vigore si verificano prima."],
  ],
  journey: [
    ["01 · Ascoltare", "Chi usa il sistema e come, e le esigenze d'uso."],
    ["02 · Misurare", "Scala, pendenza, curve, lato e alimentazione."],
    ["03 · Installare", "Guida, stazioni, ancoraggi e collegamenti."],
    ["04 · Provare", "Collaudo, uso in sicurezza e consegna."],
  ],
  guarantees: [
    ["Soluzione dichiarata", "Tipo di sistema, guida e stazioni sono nel computo."],
    ["Ancoraggi verificati", "Fissaggi alla struttura dimensionati e riscontrati."],
    ["Garanzia del produttore", "Sul montascale vale la garanzia della casa, alle sue condizioni."],
    ["Documenti conservati", "Uso, manutenzione e certificazioni restano a te."],
  ],
  schedule: [
    ["Sopralluogo", "Esigenza d'uso, scala, curve e alimentazione."],
    ["Ordine", "Sistema, guida e stazioni confermati; tempi di consegna."],
    ["Installazione", "Guida, stazioni, ancoraggi e collegamenti."],
    ["Collaudo", "Prova, istruzioni d'uso e consegna."],
  ],
  faq: [
    ["Che differenza c'è tra montascale e piattaforma?", "Il montascale a poltroncina è per chi cammina con difficoltà ma può sedersi; la pedana e la piattaforma elevatrice servono chi usa la carrozzina. La scelta dipende dall'esigenza d'uso reale."],
    ["Ci sta sulla mia scala?", "Dipende da larghezza, pendenza e curve. Molte scale, anche strette o curve, si attrezzano con guide su misura; alcune no. Si verifica al sopralluogo, sulla scala reale."],
    ["Serve un'opera edile?", "Di solito no per il montascale a poltroncina, che si fissa alla scala; le piattaforme possono richiedere una fossa o opere di appoggio. Quello che serve è indicato nel computo."],
    ["Ci sono agevolazioni?", "L'abbattimento delle barriere architettoniche può rientrare in detrazioni o contributi. Le regole in vigore e i requisiti si verificano prima; noi indichiamo cosa serve."],
    ["Funziona se manca la corrente?", "I sistemi hanno batterie che garantiscono alcune corse anche senza rete, per arrivare al piano in sicurezza. L'autonomia dipende dal modello."],
    ["In un condominio si può installare?", "Sulle parti comuni serve il consenso del condominio secondo le sue regole, con attenzione all'ingombro della scala. È una decisione dell'assemblea; noi forniamo il dettaglio tecnico."],
    ["Quanta manutenzione richiede?", "Un controllo periodico del meccanismo e della batteria. Le indicazioni e i contatti per l'assistenza restano nella documentazione."],
    ["Le foto mostrano il mio impianto?", "No, sono illustrative. Sistema, guida e stazioni reali sono quelli del computo confermato."],
  ],
  blocks: {
    comeFunziona: { title: "Il sistema giusto *per la tua scala*.", intro: "Un montascale si sceglie su chi lo usa e sulla scala reale. La proposta dice sistema, guida e alimentazione.", photo: "/pdf-stock/ristrutturazione/tavola-un-unico-progetto.jpg", items: [
      ["Esigenza", "Poltroncina, pedana o piattaforma secondo l'uso."],
      ["Scala", "Misure, pendenza, curve e lato di installazione."],
      ["Guida", "Binario e stazioni su misura, con gli ancoraggi."],
      ["Alimentazione", "Linea elettrica dedicata al sistema."],
    ] },
    compreso: { title: "Il prezzo riguarda *questo sistema*.", intro: "Questa sintesi accompagna le voci. Sistema e misure confermate prevalgono sulle immagini.", items: [
      ["Fornitura", "Montascale o piattaforma del tipo scelto."],
      ["Guida", "Binario e stazioni su misura, con ancoraggi."],
      ["Collegamenti", "Alimentazione dedicata e messa in servizio."],
      ["Collaudo", "Prova e istruzioni d'uso."],
    ], excluded: [
      ["Opere edili", "Fosse, appoggi e adeguamenti murari sono a parte se non elencati."],
      ["Pratiche e agevolazioni", "Verifiche per le detrazioni e consensi condominiali sono a parte."],
    ] },
    protezione: { title: "Installare in casa. *Rispettare i passaggi*.", intro: "Accessi e protezioni si scelgono sul posto reale. La foto è un esempio.", photo: "/pdf-stock/ristrutturazione/protezione-scale.jpg", items: [
      ["Passaggi", "Mantenere la scala usabile durante il montaggio."],
      ["Superfici", "Proteggere gradini, corrimano e pareti."],
      ["Alimentazione", "Individuare il punto elettrico e il percorso."],
      ["Sicurezza", "Aree di lavoro delimitate durante l'installazione."],
    ] },
    controlli: { title: "Corsa fluida. *Fermate sicure*.", intro: "I riscontri riguardano il sistema installato e le esigenze concordate.", photo: "/pdf-stock/comune/controllo-finale.jpg", items: [
      ["Ancoraggi", "Verificare i fissaggi alla struttura."],
      ["Corsa", "Controllare scorrimento, curve e fermate."],
      ["Sicurezze", "Provare cinture, sensori e batteria."],
      ["Consegna", "Istruzioni d'uso e giro finale con te."],
    ] },
    documenti: { title: "Il sistema installato. *Come si usa*.", intro: "La documentazione rende riconoscibili sistema, sicurezze e manutenzione, utili nel tempo.", items: [
      ["Composizione", "Riepilogo di sistema, guida e stazioni."],
      ["Uso", "Come usarlo in sicurezza, batteria compresa."],
      ["Manutenzione", "Controlli periodici e assistenza."],
      ["Documenti", "Certificazioni e contatti."],
    ] },
    diario: { title: "Scala ostacolo. *Ogni piano raggiungibile*.", intro: "Quando concordato, il diario usa foto reali. Le immagini del modello restano illustrative.", items: [
      ["Prima", "La scala da attrezzare."],
      ["Durante", "Guida, stazioni e collegamenti."],
      ["Dopo", "Sistema installato e provato."],
    ] },
  },
};
