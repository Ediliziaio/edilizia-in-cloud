export const cta = {
  primaryHref: "/demo",
  secondaryHref: "/prezzi",
  whatsappHref: "https://wa.me/3902xxxxxxxx", // TODO: inserire numero WhatsApp ufficio definitivo.
  primaryLabel: "Prenota Consulenza Gratuita 30 min",
};

export const nav = {
  label: "Gestionale edilizia con AI per imprese che vogliono controllo operativo.",
  links: [
    { label: "Home", href: "/" },
    { label: "Funzionalità", href: "/funzionalita" },
    { label: "AI", href: "/landing/ai-imprenditore-edile" },
    { label: "Prezzi", href: "/prezzi" },
    { label: "Casi Studio", href: "/casi-studio" },
    { label: "Chi Siamo", href: "/chi-siamo" },
  ],
  cta: "Parla con Silvio →",
};

export const hero = {
  headlineLine1: "Smetti di perdere soldi nei cantieri. Riprendi controllo con l'AI.",
  headlineLine2: "Vendite, margini e cassa sotto controllo senza assumere un'altra persona in ufficio.",
  subheadline: [
    "EdiliziaInCloud unisce CRM, preventivi, ordini, cantieri, incassi, documenti e report in un unico sistema. L'AI non inventa numeri: legge i tuoi dati e ti segnala quali offerte chiudere, dove stai perdendo margine, cosa incassare e quali cantieri controllare prima.",
    "Diventa una delle prime imprese edili a usare l'AI dentro la gestione reale dell'azienda: dati collegati, decisioni più veloci e un vantaggio competitivo concreto prima che il mercato diventi troppo affollato.",
  ],
  cta: "Prenota la tua Consulenza Gratuita",
  ctaNote: "30 min con un consulente, non un commerciale.",
  trust: [
    "31 giorni di prova senza rischio",
    "Setup in 48 ore",
    "150+ imprese edili italiane",
    "4,9/5 da oltre 100 recensioni",
  ],
  quote: "La demo ha senso solo se ti mostra almeno 2-3 punti concreti dove recuperare controllo. Altrimenti non è una demo: è intrattenimento.",
  quoteAuthor: "Metodo EdiliziaInCloud",
};

export const aiExamples = {
  eyebrow: "AI in azione",
  title: "Esempi concreti: cosa fa l'AI quando i dati sono finalmente collegati.",
  subtitle:
    "Non è una chat generica. L'AI legge CRM, preventivi, ordini, calendario, incassi, costi e documenti. Poi trasforma i segnali deboli in azioni operative.",
  cases: [
    {
      id: "margine",
      label: "Margine cantiere",
      title: "Una commessa sembra sana, ma sta iniziando a perdere margine.",
      input: "Ordine da 48.000€, posa al 62%, materiali +1.870€, ore squadra +18%, saldo cliente non ancora programmato.",
      finds: [
        "Ore di posa sopra stima: rischio extra costo di 2.400€.",
        "Fornitore con prezzo diverso dal preventivo: +1.870€ da verificare.",
        "Margine previsto scende sotto il target prima della chiusura lavori.",
      ],
      action: "Apri controllo costi, blocca nuove ore non approvate e richiedi conferma fornitore prima del prossimo SAL.",
      outcome: "Problema visto mentre puoi ancora intervenire, non a cantiere chiuso.",
      metric: "−4.270€ rischio individuato",
    },
    {
      id: "cassa",
      label: "Cassa e incassi",
      title: "Il fatturato c'è, ma la cassa dei prossimi 30 giorni è fragile.",
      input: "5 fatture emesse, 3 saldi in ritardo, 2 fornitori in scadenza, acconto nuovo ordine previsto la prossima settimana.",
      finds: [
        "Incassi attesi troppo concentrati su due clienti.",
        "Scadenze fornitori prima dei saldi clienti: tensione di cassa probabile.",
        "Un acconto può coprire il picco, ma va richiesto entro 48 ore.",
      ],
      action: "Prioritizza sollecito saldo, genera promemoria al cliente e sposta pagamento fornitore non critico.",
      outcome: "Vedi la cassa prima che diventi emergenza.",
      metric: "21 giorni coperti",
    },
    {
      id: "vendite",
      label: "Preventivi e vendite",
      title: "Un preventivo fermo non è perso: va richiamato nel momento giusto.",
      input: "Preventivo aperto 4 volte, cliente entrato da Meta, sopralluogo fatto, nessun follow-up negli ultimi 6 giorni.",
      finds: [
        "Interesse alto: molte aperture e nessuna obiezione registrata.",
        "Ritardo commerciale: il cliente non è stato seguito dopo il sopralluogo.",
        "Margine preventivo buono: offerta da proteggere prima dello sconto.",
      ],
      action: "Crea task al venditore, suggerisci messaggio WhatsApp e prepara variante senza abbassare il margine.",
      outcome: "La pipeline diventa lavoro operativo, non una lista dimenticata.",
      metric: "Priorità alta",
    },
  ],
};

export const companyAgents = {
  eyebrow: "Architettura AI reale",
  title: "Silvio coordina 19 specialisti AI dentro la tua impresa edile.",
  subtitle:
    "Non è una chat generica. È una regia operativa: Silvio ascolta la domanda del titolare, legge commesse, incassi, cantieri e documenti, poi attiva lo specialista AI giusto per dare una risposta utile e verificabile.",
  proof: "Schema reale del prodotto: 1 regia centrale + 18 personas specialistiche collegate ai dati aziendali.",
  center: {
    label: "Silvio",
    role: "regia del titolare",
    body: "Coordina i reparti AI, sintetizza le priorità e porta al titolare solo ciò che richiede una decisione.",
  },
  flow: [
    {
      label: "Chiedi",
      text: "\"Perché la commessa di via Roma perde margine?\"",
    },
    {
      label: "Silvio collega",
      text: "Controller, PM cantiere, Acquisti e Amministrazione leggono solo i dati utili.",
    },
    {
      label: "Decidi",
      text: "Ricevi causa, impatto economico e prossima azione senza aprire 19 schermate.",
    },
  ],
  bullets: [
    "Ogni persona AI ha un ruolo preciso e lavora su dati reali.",
    "Le risposte nascono da commesse, documenti, incassi, cantieri e permessi.",
    "Il titolare riceve una sintesi unica, non altre chat da inseguire.",
  ],
  groups: [
    {
      label: "Direzione",
      summary: "priorità, strategia e memoria aziendale",
      agents: ["Silvio", "Assistente imprenditore", "Brain sistema"],
    },
    {
      label: "Finanza",
      summary: "cassa, margini, scadenze e numeri",
      agents: ["CFO", "Controller", "Amministrazione", "Commercialista"],
    },
    {
      label: "Cantieri",
      summary: "lavori, squadre, tecnica e acquisti",
      agents: ["PM cantiere", "Capocantiere", "Tecnico/RSPP", "Acquisti"],
    },
    {
      label: "Vendite e clienti",
      summary: "pipeline, preventivi, follow-up e assistenza",
      agents: ["Direttore vendite", "Sales", "Cliente tutor", "Assistente cliente"],
    },
    {
      label: "Crescita e regole",
      summary: "marketing, HR, compliance e legale",
      agents: ["Direttore marketing", "HR", "Compliance", "Legale"],
    },
  ],
  agents: [
    { key: "silvio", name: "Silvio", role: "Regia imprenditore", group: "Direzione", detail: "Ascolta il titolare, capisce la domanda e decide quali specialisti AI coinvolgere." },
    { key: "cfo", name: "CFO", role: "Cassa e finanza", group: "Finanza", detail: "Controlla liquidità, incassi, DSO, scadenze e sostenibilità delle decisioni." },
    { key: "commercialista", name: "Commercialista", role: "Fisco e F24", group: "Finanza", detail: "Legge IVA, F24, adempimenti fiscali e documenti contabili collegati." },
    { key: "controller", name: "Controller", role: "Margini e costi", group: "Finanza", detail: "Confronta preventivo, consuntivo, ore, materiali e marginalità per commessa." },
    { key: "legale", name: "Legale", role: "Contratti e rischi", group: "Regole", detail: "Aiuta a leggere contratti, riserve, clausole, controversie e rischi documentali." },
    { key: "tecnico", name: "Tecnico/RSPP", role: "Pratiche e sicurezza", group: "Cantieri", detail: "Supporta pratiche tecniche, sicurezza, POS, documenti e conformità di cantiere." },
    { key: "assistente_imprenditore", name: "Assistente titolare", role: "Brief e priorità", group: "Direzione", detail: "Prepara briefing, riunioni, decisioni pendenti e sintesi operative per il titolare." },
    { key: "pm_cantiere", name: "PM cantiere", role: "Piani e ritardi", group: "Cantieri", detail: "Tiene insieme pianificazione, avanzamento lavori, ritardi, squadre e recovery plan." },
    { key: "hr", name: "HR", role: "Squadre e presenze", group: "Persone", detail: "Controlla presenze, competenze, formazione, DPI, scadenze e disponibilità del personale." },
    { key: "sales", name: "Sales", role: "Follow-up offerte", group: "Vendite", detail: "Segue preventivi aperti, lead caldi, follow-up, messaggi e opportunità da chiudere." },
    { key: "direttore_vendite", name: "Direttore vendite", role: "Pipeline e forecast", group: "Vendite", detail: "Guarda pipeline, probabilità di chiusura, venditori, forecast e deal a rischio." },
    { key: "direttore_marketing", name: "Marketing", role: "Lead e campagne", group: "Crescita", detail: "Analizza campagne, contenuti, lead, segmenti e opportunità commerciali ricorrenti." },
    { key: "amministrazione", name: "Amministrazione", role: "Fatture e DDT", group: "Finanza", detail: "Riconcilia fatture, DDT, scadenze, incassi, solleciti e documenti amministrativi." },
    { key: "acquisti", name: "Acquisti", role: "Fornitori e ODA", group: "Cantieri", detail: "Controlla fornitori, ordini d'acquisto, prezzi, DDT in arrivo e materiali mancanti." },
    { key: "compliance", name: "Compliance", role: "DURC e controlli", group: "Regole", detail: "Verifica DURC, subappaltatori, documenti obbligatori, rischi e scadenze normative." },
    { key: "cliente_tutor", name: "Cliente tutor", role: "Stato committenti", group: "Clienti", detail: "Sintetizza cosa vede il cliente: stato lavori, ticket, richieste, comunicazioni e SAL." },
    { key: "capocantiere", name: "Capocantiere", role: "Rapportini e foto", group: "Cantieri", detail: "Legge rapportini, foto, materiali consegnati, attività giornaliere e note dal campo." },
    { key: "assistente_cliente", name: "Assistente cliente", role: "Messaggi e richieste", group: "Clienti", detail: "Prepara risposte chiare per clienti, richieste di modifica, spiegazioni e riepiloghi." },
    { key: "brain", name: "Brain sistema", role: "Ricerca documenti", group: "Direzione", detail: "Cerca nei documenti aziendali, contratti, fatture, storico messaggi e conoscenza interna." },
  ],
};

export const numberWall = {
  eyebrow: "Capitolo 1 — Lo scenario.",
  title: "Il problema non è vendere. È non sapere cosa succede dopo che hai venduto.",
  items: [
    {
      value: 30,
      prefix: "+",
      suffix: "%",
      title: "Margini che si perdono tra preventivo e consuntivo",
      punch: "Il preventivo sembra corretto. Poi arrivano ore extra, materiali, errori, subappalti e sconti non controllati.",
      body: "Se non vedi il margine mentre il cantiere è aperto, lo scopri quando è già troppo tardi per correggere.",
    },
    {
      value: 63,
      prefix: "−",
      suffix: "%",
      title: "Lavoro amministrativo che non crea margine",
      punch: "DDT, fatture, scadenze, incassi, solleciti e documenti assorbono ore ogni settimana.",
      body: "L'AI non sostituisce il controllo umano: toglie il lavoro ripetitivo e porta in evidenza solo ciò che richiede una decisione.",
    },
    {
      label: "24h",
      title: "Risposte commerciali più rapide e tracciate",
      punch: "Un preventivo fermo per giorni è spesso una vendita persa.",
      body: "Quando CRM, preventivo, follow-up e firma sono collegati, sai entro un giorno chi ha aperto l'offerta, chi va richiamato e quale opportunità sta diventando ordine.",
    },
    {
      label: "1 su 4",
      title: "Decisioni prese senza dati operativi aggiornati",
      punch: "Il titolare vede il problema quando il cliente chiama, il fornitore sollecita o il conto si svuota.",
      body: "Il salto non è avere più schermate. È avere meno sorprese: margini, cassa, ordini, lavori e scadenze nello stesso cruscotto.",
    },
  ],
  ctaLead: "Voglio vedere dove sto perdendo controllo.",
  cta: "Prenota la consulenza gratuita →",
};

export const lettera = {
  eyebrow: "Capitolo Zero — La verità operativa.",
  title: "Se gestisci cantieri con strumenti scollegati, non stai controllando l'impresa. La stai inseguendo.",
  opening: "Questa pagina è per te se...",
  paragraphs: [
    "Hai più cantieri aperti, offerte da seguire, clienti da richiamare, fornitori da pagare, materiali da controllare e incassi da inseguire.\nOgni reparto ha un pezzo della verità: WhatsApp, Excel, gestionale di fatturazione, cartelle documenti, calendario, note vocali, email.",
    "Quando qualcosa non torna, non hai un dato unico. Hai una caccia al colpevole.",
    "Fermati.",
    "Il punto non è aggiungere un altro programma. Il punto è creare un sistema unico dove ogni commessa collega preventivo, ordine, calendario lavori, documenti, materiali, incassi, costi e margine.",
    "L'AI serve a questo: non a fare spettacolo, ma a leggere i dati che già produci ogni giorno e trasformarli in decisioni semplici.",
    "Ti deve dire quale cantiere sta andando fuori margine, quale cliente va richiamato, quale incasso è in ritardo, quale materiale manca, quale preventivo ha più probabilità di chiudere.",
    "Questo è il controllo che manca alla maggior parte delle imprese edili: non sapere tutto, ma sapere prima cosa richiede attenzione.",
    "Se vuoi solo un software in più, questa pagina non fa per te.",
    "Se invece vuoi una regia unica per vendite, cantieri, cassa e margini, allora ha senso guardare come funziona EdiliziaInCloud.",
  ],
  signatureName: "Team EdiliziaInCloud",
  signatureRole: "Controllo gestione, cantieri e AI per imprese edili",
};

export const cruscotto = {
  eyebrow: "Capitolo 2 — Il cruscotto della tua impresa, dopo.",
  title: "La differenza non è avere più dati. È sapere cosa fare prima.",
  subtitle: "Il risultato atteso: meno lavoro ripetitivo, più controllo operativo, margini visibili mentre puoi ancora correggere.",
  tiles: [
    { value: 22, prefix: "+", suffix: "%", label: "Margine potenziale da proteggere", note: "Non promette fatturato in più: evidenzia dove il margine rischia di uscire dalla commessa." },
    { value: 12, prefix: "−", suffix: " ore", label: "A settimana di lavoro ripetitivo", note: "Meno copia-incolla tra fatture, DDT, documenti, Excel, agenda e messaggi." },
    { value: 1.5, prefix: "−", suffix: "", label: "Assunzioni operative evitate", note: "Quando il sistema collega i dati, l'ufficio segue più cantieri senza moltiplicare le persone." },
    { value: 70, suffix: "%", label: "Processi amministrativi automatizzabili", note: "Fatture, scadenze, solleciti e documenti restano tracciati nello stesso flusso." },
    { value: 48, suffix: "h", label: "Per vedere i primi dati", note: "Parti dai cantieri e dai clienti reali, poi completi il sistema senza fermare l'operatività." },
    { value: 3, suffix: "x", label: "Controlli prima dell'invio", note: "Prezzo, margine e condizioni vengono riletti prima che un'offerta diventi un problema." },
  ],
  disclaimer: "Dati medi su 150+ imprese edili italiane attive su EdiliziaInCloud. Casi studio nominali disponibili su richiesta in consulenza.",
};

export const manifesto = {
  titleParts: ["Automatizzare", "Marginare", "Scalare."],
  titleItalic: "La nuova legge dell'impresa edile italiana.",
  paragraphs: [
    "Le imprese edili non perdono margine solo perché comprano male o vendono basso. Lo perdono perché le informazioni arrivano tardi, spezzate, non confrontabili.",
    "Nell'edilizia italiana il vantaggio competitivo oggi si traduce in 1 cosa sola:",
  ],
  quote: "Chi collega vendite, cantieri, documenti, incassi e margini in un unico sistema prende decisioni prima. Chi lavora su strumenti separati scopre i problemi quando sono già costati soldi.",
  close: "Non è una moda. È una questione di controllo.\nO hai un sistema che ti avvisa, o continui a scoprire i problemi a consuntivo.",
  ctaLead: "Voglio vedere il sistema.",
  cta: "Prenota la consulenza gratuita →",
};

export const infrastrutture = {
  eyebrow: "Capitolo 3 — Le infrastrutture AI.",
  title: "6 moduli AI. Un'unica regia per vendite, cantieri, cassa e margini.",
  subtitle: [
    "EdiliziaInCloud non aggiunge schermate a caso. Collega i ruoli dell'impresa: titolare, ufficio, venditori, capocantiere, cliente, fornitori e consulenti. Ognuno vede quello che serve, nello stesso flusso dati.",
    "Tu vedi tutto. Loro vedono solo quello che gli serve.",
  ],
  blocks: [
    {
      letter: "L",
      title: "SILVIO",
      subtitle: "L'assistente AI dell'imprenditore",
      tagline: "La regia che trasforma i dati in priorità operative.",
      paragraphs: [
        "Silvio è l'AI dentro EdiliziaInCloud. Gli chiedi: \"Quanto sto guadagnando sul cantiere di via Manzoni?\" e legge commessa, incassi, costi, scadenze e avanzamento lavori.",
        "Non sostituisce chi decide. Ti prepara il quadro: margine stimato, anomalie, incassi in ritardo, attività da seguire, documenti mancanti.",
        "Così la riunione del lunedì non parte da sensazioni, ma da una lista chiara di priorità.",
      ],
      cta: "Vedi come funziona Silvio →",
    },
    {
      letter: "V",
      title: "VENDITORE AI",
      subtitle: "Computo Metrico + Preventivo automatici",
      tagline: "Preventivi più veloci, ma soprattutto più controllati.",
      paragraphs: [
        "Carichi capitolato, foto o richieste del cliente. Il sistema ti aiuta a strutturare voci, prezzi, condizioni e margini prima dell'invio.",
        "Il preventivo resta collegato al CRM: sai chi lo ha ricevuto, chi lo ha aperto, chi va richiamato e quali offerte stanno bloccando la pipeline.",
        "Quando il cliente accetta, ordine, attività operative e documenti nascono dallo stesso dato, senza ricopiare tutto.",
      ],
      cta: "Vedi come funziona il Venditore AI →",
    },
    {
      letter: "B",
      title: "BACK OFFICE AI",
      subtitle: "Fatturazione, scadenzario, riconciliazione",
      tagline: "Meno inseguimenti tra fatture, incassi, DDT e documenti.",
      paragraphs: [
        "Fatture elettroniche, DDT, note, scadenze, incassi e documenti non restano più in posti separati.",
        "Il sistema ti mostra cosa è pagato, cosa è scaduto, cosa manca e quali commesse hanno importi ancora aperti.",
        "L'obiettivo non è togliere controllo all'ufficio: è evitare che l'ufficio perda ore a ricostruire dati già presenti altrove.",
      ],
      cta: "Vedi come funziona il Back Office AI →",
    },
    {
      letter: "K",
      title: "KPI AI",
      subtitle: "Cruscotto cantieri & previsionale cassa",
      tagline: "Sai se quel cantiere sta perdendo. Prima di chiuderlo.",
      paragraphs: [
        "Il SAL lo aggiorna il team operativo. Il sistema confronta preventivo, consuntivo, costi, incassi, anomalie e avanzamento.",
        "Il previsionale di liquidità a 30, 60 e 90 giorni non è un grafico decorativo: ti fa vedere quali incassi e costi stanno influenzando la cassa.",
        "Sai dove intervenire prima che una decisione diventi urgente.",
      ],
      cta: "Vedi come funziona il KPI AI →",
    },
    {
      letter: "M",
      title: "MARKETING AI",
      subtitle: "WhatsApp Bot + Lead da Meta + Email Automation",
      tagline: "Marketing collegato al commerciale, non una lista di contatti ferma.",
      paragraphs: [
        "I lead entrano nel CRM con fonte, tag, sede, interesse e stato. Le opportunità non si perdono tra chat, fogli e note.",
        "Automazioni email, SMS o WhatsApp aiutano a seguire chi ha chiesto informazioni, chi deve ricevere un preventivo e chi va richiamato.",
        "Il punto non è inviare più messaggi. È capire quali contatti meritano attenzione commerciale oggi.",
      ],
      cta: "Vedi come funziona il Marketing AI →",
    },
    {
      letter: "X",
      title: "IMPRESA AI",
      subtitle: "Il piano per chi vuole davvero scalare",
      tagline: "Per aziende che vogliono scalare processi, sedi e controllo.",
      paragraphs: [
        "Multi-sede, banca PSD2, render AI, verifica documenti, agenti AI personalizzati, portale cliente branded, API, webhook e integrazioni operative.",
        "Non è per chi vuole provare un giocattolo. È per chi ha già processi reali e vuole renderli misurabili, delegabili e controllabili.",
      ],
      emphasis: "L'accesso al piano Impresa AI è soggetto a verifica di idoneità in consulenza.",
      cta: "Verifica se sei idoneo →",
      locked: true,
    },
  ],
};

export const testimonials = {
  title: "Imprese edili che hanno smesso di lavorare a sensazione.",
  items: [
    {
      quote: "Prima facevo tutto su Excel e WhatsApp. Ora so quanto sto guadagnando su ogni cantiere, anche da telefono. L'ufficio lavora meglio senza rincorrere documenti.",
      author: "Marco R.",
      role: "titolare impresa edile — Bergamo",
    },
    {
      quote: "Ho recuperato il costo dell'abbonamento nel primo mese, trovando 3 cantieri che stavano andando in perdita senza che me ne accorgessi.",
      author: "Stefano V.",
      role: "costruzioni — Napoli",
    },
    {
      quote: "Il modulo HR mi ha fatto risparmiare 8 ore a settimana solo nella gestione delle presenze. Mia moglie ha ripreso a fare lavoro vero, non a inseguire fogli.",
      author: "Carla M.",
      role: "serramenti — Torino",
    },
  ],
  stats: "150+ imprese edili attive · 4,9/5 da oltre 100 recensioni · processi collegati tra ufficio e cantiere · primi dati visibili in 48 h",
};

export const demoSilvio = {
  eyebrow: "Capitolo 4 — Vivere il software prima di provarlo.",
  title: "Silvio non è un chatbot. È un assistente operativo che legge i dati della tua impresa.",
  body: [
    "Non limitarti a leggere la pagina.",
    "Scrivigli. Chiedigli dove una commessa rischia di perdere margine.",
    "Chiedigli come funziona la fatturazione SDI in EdiliziaInCloud.",
    "Chiedigli come collegare preventivi, ordini, cantieri, incassi e documenti.",
    "Risponde in modo pratico, in italiano, senza frasi da brochure.",
  ],
  cta: "Scrivi a Silvio su WhatsApp →",
  secondary: "Preferisci una chiamata vera con un consulente umano?",
  secondaryCta: "Prenota la consulenza gratuita di 30 minuti →",
};

export const garanzie = {
  eyebrow: "Capitolo 5 — Perché smetti di rischiare.",
  title: "Sei garanzie. Una sola firma da fare. La tua.",
  rows: [
    ["1", "Consulenza gratuita 30 min", "Senza impegno. Un consulente, il tuo flusso reale, mezz'ora per capire se c'è margine da recuperare."],
    ["2", "31 giorni di prova senza rischio", "Provi il sistema con dati reali. Se non è adatto alla tua organizzazione, lo capisci prima di investire sul lungo periodo."],
    ["3", "Setup in 48 ore", "Migrazione assistita gratuita da Excel, Primus, EdilNet, TeamSystem, STR Vision o fogli cartacei."],
    ["4", "⭐ Garanzia ROI 90 giorni", "In 90 giorni lavoriamo sui tuoi sprechi ricorrenti: margini, incassi, ore, documenti e costi fuori commessa."],
    ["5", "Disdetta libera", "Nessun vincolo operativo nascosto: se non è il sistema giusto, non ti blocchiamo."],
    ["6", "Onboarding guidato", "Non ti lasciamo davanti a schermate vuote: partiamo dai flussi che ti fanno perdere più tempo e denaro."],
  ],
  emphasis: "⭐ Obiettivo concreto: usare i primi 90 giorni per trovare sprechi misurabili in cantieri, incassi, ore, documenti e marginalità. Numeri, non promesse generiche.",
};

export const faq = {
  title: "So cosa stai pensando.",
  items: [
    {
      q: "Sono troppo vecchio per imparare un software nuovo.",
      a: "L'obiettivo non è farti diventare tecnico. Il primo lavoro lo imposti con un flusso guidato, il team operativo usa il telefono e Silvio ti restituisce risposte in italiano. Se sai usare WhatsApp e leggere una scheda commessa, puoi partire.",
    },
    {
      q: "Ho già Excel e a me funziona.",
      a: "Excel può funzionare per controlli semplici. Il problema nasce quando preventivi, ordini, costi, foto, documenti, DDT, incassi e calendario lavori vivono in file diversi. EdiliziaInCloud non cancella Excel: riduce la dipendenza da fogli che nessuno aggiorna nello stesso modo.",
    },
    {
      q: "Ho già un gestionale (Primus, TeamSystem, EdilNet).",
      a: "Perfetto: allora il tema non è sostituire tutto alla cieca. In consulenza vediamo cosa deve restare, cosa va collegato e dove oggi perdi tempo per mancanza di integrazione tra vendite, cantieri, documenti e incassi.",
    },
    {
      q: "Costa troppo.",
      a: "Il costo va confrontato con ore amministrative ripetute, errori di preventivo, incassi dimenticati, documenti cercati due volte e margini scoperti tardi. Se nella demo non troviamo un caso concreto dove recuperare controllo, non ha senso acquistarlo.",
    },
    {
      q: "L'AI nell'edilizia è una moda.",
      a: "L'AI da sola è una moda. L'AI collegata a dati reali di commesse, incassi, documenti, preventivi e costi è uno strumento di controllo. La differenza è tutta lì: non generare testi, ma leggere segnali operativi.",
    },
    {
      q: "La mia impresa è troppo piccola.",
      a: "EdiliziaInCloud è nato per imprese da 2 a 50 persone. Se hai 5 dipendenti e 3 cantieri, sei esattamente il nostro target. Il piano Free Scopri ti permette di partire a 0€/mese.",
    },
  ],
};

export const leadMagnet = {
  eyebrow: "Capitolo 6 — Risorsa riservata.",
  title: "\"Imprese Edili & AI: 31 sprechi che spesso restano invisibili.\"",
  body: "Manuale operativo di 64 pagine, costruito partendo dai casi più ricorrenti nelle imprese edili: preventivi non tracciati, costi fuori commessa, documenti dispersi, incassi in ritardo e margini scoperti troppo tardi.",
  bullets: [
    "I 31 punti dove una commessa può perdere margine senza segnali evidenti",
    "Come l'AI aiuta a intercettare errori, ritardi e costi fuori flusso",
    "Una formula semplice per stimare il costo del lavoro amministrativo ripetitivo",
    "Il modello di cruscotto per collegare vendite, cantieri, incassi e marginalità",
  ],
  cta: "Voglio il Manuale Riservato →",
  microTrust: "Riceverai il PDF in email entro 30 secondi. Niente spam. Disiscrizione con un click.",
};

export const ps = {
  title: "Nota finale — Prima di chiudere questa pagina.",
  paragraphs: [
    "EdiliziaInCloud non serve a riempire l'impresa di schermate.",
    "Serve a collegare quello che oggi vive separato: preventivi, ordini, lavori, documenti, materiali, incassi, costi e margini.",
    "Il valore non è \"usare l'AI\". Il valore è sapere quale decisione prendere prima che un problema diventi perdita.",
    "Se in 30 minuti non riusciamo a mostrarti almeno 2-3 punti concreti dove recuperare controllo, la consulenza finisce lì. Nessuna pressione.",
    "Se invece vedi che il sistema parla della tua azienda reale, allora puoi provarlo per 31 giorni con i tuoi dati e decidere sui numeri.",
  ],
  signatureName: "Team EdiliziaInCloud",
  signatureRole: "Consulenza operativa per imprese edili",
};

export const ctaFinale = {
  line1: "Finisci di lavorare a sensazione.",
  line2: "Inizia a guadagnare davvero.",
  sub: "30 minuti. Gratis. Un consulente, i tuoi flussi reali, nessuna carta di credito.",
  button: "Prenota la Consulenza Gratuita →",
  trust: [
    "31 giorni prova senza rischio",
    "Setup in 48 ore",
    "Analisi ROI nei primi 90 giorni",
    "Disdetta libera",
  ],
};

export const footer = {
  brand: [
    "Gestionale edilizia con AI per imprese italiane.",
    "150+ imprese edili italiane.",
    "4,9/5 da oltre 100 recensioni.",
  ],
  product: ["Funzionalità", "Prezzi", "Confronti competitor", "Casi studio", "Migrazione assistita", "Integrazioni"],
  resources: ["Blog", "Glossario edilizia", "Manuale AI riservato", "Newsletter settimanale", "Silvio (chat AI)"],
  contacts: ["+39 02 87198520", "info@ediliziaincloud.com", "Via Aurelio Saffi 29, Milano", "WhatsApp diretto"],
  bottom: "© 2026 EdiliziaInCloud · ediliziaincloud.com · Privacy · Termini",
  social: "Instagram · Facebook · LinkedIn · YouTube",
};

export const metadata = {
  title: "EdiliziaInCloud AI — Margini, cassa e cantieri sotto controllo",
  description:
    "Gestionale per imprese edili che collega CRM, preventivi, ordini, cantieri, incassi e margini. AI operativa, prova 31 giorni e consulenza gratuita.",
  canonical: "/landing/ai-imprenditore-edile",
  ogImage: "/og/landing-ai-imprenditore-edile.png",
};
