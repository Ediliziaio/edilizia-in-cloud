import {
  AlertTriangle,
  ArrowUpRight,
  BookOpen,
  Clock,
  FileSignature,
  Globe,
  HardHat,
  Headphones,
  History,
  MessageSquare,
  Phone,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Star,
  Ticket,
  TrendingUp,
  Wrench,
} from "lucide-react";
import FunzionalitaPageTemplate from "./_template/FunzionalitaPageTemplate";
import type { FunzionalitaPageConfig } from "./_template/types";

const config: FunzionalitaPageConfig = {
  slug: "ticket-assistenza",
  definizione:
    "Ticket Assistenza di Edilizia in Cloud è il sistema di assistenza post-cantiere dell'impresa edile: ogni richiesta del cliente ha numero, priorità, tempi di risposta, tecnico assegnato, foto e soluzione tracciata, così la garanzia decennale ex art. 1669 c.c. ha un dossier completo.",
  vertical: "Ticket Assistenza",
  productName: "Modulo Ticket Assistenza Edilizia in Cloud",
  audience:
    "Imprese edili, ristrutturatori, general contractor e installatori che gestiscono garanzia decennale art. 1669 c.c. e vogliono un sistema di ticketing post-cantiere per tracciare richieste cliente, SLA, escalation e knowledge base senza perdere chiamate o WhatsApp",
  audienceShort: "imprese edili e installatori",

  seo: {
    title:
      "Ticket Assistenza Edilizia",
    description:
      "Ticket post-cantiere per imprese edili: garanzia decennale (art. 1669 c.c.) tracciata, SLA per priorità, escalation automatica e app mobile per il tecnico.",
    keywords:
      "ticket assistenza edilizia, garanzia decennale 1669 cc, software ticket impresa edile, post vendita cantiere, SLA edilizia, knowledge base impresa edile, app tecnico mobile, helpdesk costruzioni",
    ogImage: "https://www.ediliziaincloud.com/og/og-default.png",
  },

  heroBadge: "Funzionalità · Ticket Assistenza",
  heroH1Lead: "La garanzia decennale gestita",
  heroH1Highlight: "come un helpdesk professionale",
  heroH1Tail: "non come WhatsApp",
  heroSubheadline:
    "Sistema ticket post-cantiere per imprese edili: ogni richiesta cliente ha numero, priorità, SLA, tecnico assegnato, log foto, soluzione tracciata. Garanzia decennale art. 1669 c.c. con dossier completo per ogni cantiere, app tecnico mobile, knowledge base interna, integrazione portale cliente. Niente più 'mi avevano detto' e 'ricordavo che'.",
  heroPrimaryCta: "Prova gratis 31 giorni",
  heroSecondaryCta: "Tutte le funzionalità",
  heroSecondaryCtaTo: "/funzionalita",

  reassurancePoints: [
    "Garanzia decennale tracciata",
    "SLA per priorità ticket",
    "App tecnico con foto e firma",
  ],
  proofPoints: [
    "Knowledge base interna",
    "Escalation automatica",
    "Dossier 1669 c.c. esportabile",
  ],

  objectiveRow: [
    ["Obiettivo", "Trasformare il post-vendita edile da WhatsApp caotico a helpdesk strutturato"],
    ["Momento chiave", "Quando il cliente chiama 4 anni dopo per un'infiltrazione coperta da garanzia"],
    ["Risultato", "Difesa legale solida, cliente seguito con SLA, tecnici efficienti"],
  ],

  betaH2:
    "Più di 240 imprese edili italiane gestiscono garanzia decennale e assistenza post-cantiere con il sistema ticket Edilizia in Cloud.",
  betaBody:
    "Il modulo Ticket Assistenza è attivo in 48 ore: importiamo i cantieri chiusi degli ultimi 10 anni con date di consegna, configuriamo SLA per tipologia di intervento, attiviamo l'app per i tecnici e il portale di apertura ticket per i clienti. Quattro sessioni 1-a-1 ti accompagnano fino al primo ticket chiuso con dossier completo art. 1669 c.c.",

  speedH2:
    "L'art. 1669 c.c. ti tiene responsabile per 10 anni. Senza tracciabilità ti difendi a memoria.",
  speedSubheadline:
    "L'impresa edile è responsabile per 10 anni dei vizi gravi (rovina, pericolo di rovina, gravi difetti). Significa che dopo 8 anni può arrivare una contestazione. Senza dossier ticket, foto datate, comunicazioni tracciate, la tua difesa legale parte sconfitta. Con un sistema ticket strutturato, hai prove pronte in 5 minuti.",
  speedStats: [
    { value: 90, prefix: "+", suffix: "%", label: "ticket risolti entro SLA dichiarato" },
    { value: 1.5, suffix: " h", label: "ore risparmiate per ticket gestito" },
    { value: 100, suffix: "%", label: "tracciabilità garanzia decennale 1669 c.c." },
  ],

  familyH2: "Ticket collegati al cantiere originale, al portale cliente e ai tecnici in trasferta.",
  familySubheadline:
    "Il ticket non vive in isolamento: nasce dal cantiere consegnato, viaggia sul portale cliente, viene preso in carico da un tecnico via app mobile, viene chiuso con foto e firma cliente, alimenta la knowledge base aziendale per i ticket futuri.",
  familyItems: [
    {
      icon: Globe,
      title: "Portale Clienti",
      text: "Cliente apre ticket dal portale, vede stato avanzamento, riceve notifica di chiusura.",
      to: "/funzionalita/portale-clienti",
    },
    {
      icon: HardHat,
      title: "Gestione Cantieri",
      text: "Cantiere consegnato attiva automaticamente garanzia decennale e finestra ticket.",
      to: "/funzionalita/gestione-cantieri",
    },
    {
      icon: Smartphone,
      title: "App Cantiere Mobile",
      text: "Tecnico riceve ticket sul telefono, scatta foto, registra intervento, fa firmare cliente.",
      to: "/funzionalita/app-cantiere-mobile",
    },
    {
      icon: FileSignature,
      title: "Firma Elettronica",
      text: "Cliente firma chiusura ticket e accettazione intervento con valore eIDAS.",
      to: "/funzionalita/firma-elettronica",
    },
    {
      icon: MessageSquare,
      title: "Chat Interna",
      text: "Discussione interna sul ticket tra tecnici, capocantiere e ufficio post-vendita.",
      to: "/funzionalita/chat-interna",
    },
    {
      icon: Wrench,
      title: "Manutenzione Impianti",
      text: "Ticket di manutenzione programmata e a guasto su impianti consegnati.",
      to: "/funzionalita/manutenzione-impianti",
    },
  ],
  familyBonusTitle: "Una sola piattaforma. Cantiere, ticket, tecnico e cliente allineati.",
  familyBonusText:
    "Quando un cliente apre un ticket dal portale a 4 anni dalla consegna, il sistema riconosce il cantiere originale, recupera contratto, SAL, foto, certificazioni materiali, assegna automaticamente il tecnico più vicino, applica lo SLA giusto. Ogni intervento alimenta la knowledge base per ticket futuri simili.",

  painKicker: "Il problema vero",
  painH2: "Il cliente chiama dopo 5 anni 'c'è un'infiltrazione' e tu cerchi le foto del cantiere.",
  painSubheadline:
    "L'impresa edile media gestisce il post-vendita su WhatsApp del titolare e telefonate al capocantiere che ha fatto il lavoro. Funziona finché ricordi tutto. Ma a 5-7 anni dalla consegna, il capocantiere è cambiato, le foto sono in 4 posti diversi, le contestazioni si moltiplicano e la difesa legale parte già perdente.",
  painPoints: [
    {
      icon: Phone,
      title: "Richieste perse tra WhatsApp e telefonate",
      text: "Cliente chiama, scrive WhatsApp, manda email a 3 indirizzi diversi. Una si perde, altre si dimenticano, una arriva al capocantiere che era in ferie. Cliente arrabbiato chiede 'ma vi siete dimenticati?'. Recensione 1 stella su Google.",
    },
    {
      icon: Search,
      title: "Storia del cantiere introvabile a 5 anni",
      text: "Cliente segnala vizio dopo 5-7 anni. Cerchi capitolato, contratto, SAL, foto, certificazioni materiali. Sono su 4 hard disk, 2 cloud diversi, alcune email perse. Ricostruzione in 3 giorni invece che 5 minuti.",
    },
    {
      icon: AlertTriangle,
      title: "Difesa legale 1669 c.c. impossibile",
      text: "Cliente fa causa per vizi gravi, art. 1669 c.c., 10 anni di responsabilità. Avvocato chiede dossier completo: foto datate, materiali certificati, comunicazioni tracciate. Tu hai WhatsApp e ricordi. Causa persa in primo grado.",
    },
    {
      icon: Clock,
      title: "Tecnici inviati alla cieca senza storia",
      text: "Tecnico va dal cliente per un'infiltrazione. Non sa che l'anno prima era già stato chiamato per un problema simile risolto provvisoriamente. Non sa quale ditta ha installato l'impermeabilizzazione. Si arrangia, perde tempo, sbaglia diagnosi.",
    },
  ],

  baKicker: "Prima e dopo Edilizia in Cloud",
  baH2: "Stesso cliente, stesso vizio, stesso art. 1669 c.c. Cambia chi ha il dossier in mano.",
  baSubheadline:
    "Il sistema ticket non sostituisce le competenze tecniche dei tuoi capocantieri: registra ogni interazione cliente in modo strutturato, costruisce nel tempo un dossier consultabile e alimenta una knowledge base che rende i tecnici più rapidi e gli interventi più efficaci.",
  baAreas: [
    {
      title: "Apertura richiesta cliente",
      before:
        "Cliente sceglie tra 4 canali (telefono titolare, WhatsApp capocantiere, email ufficio, modulo sito) basandosi sul mood. Una si perde, una arriva in ferie, una arriva 3 settimane dopo. Caos totale.",
      after:
        "Cliente apre ticket dal portale (o via WhatsApp che diventa ticket automatico). Numero univoco, priorità calcolata, SLA dichiarato, notifica al cliente e al team. Niente si perde, tutto è tracciato.",
    },
    {
      title: "Assegnazione tecnico",
      before:
        "Titolare a memoria pensa 'mando Mario perché era stato lui all'epoca'. Mario è in ferie. Manda Luigi che non sa nulla, va sul posto senza preparazione, perde 2 ore a capire la storia.",
      after:
        "Sistema assegna automaticamente il tecnico più vicino e disponibile, gli passa il dossier completo del cantiere (contratto, foto, certificazioni, ticket precedenti, soluzioni passate). Tecnico arriva preparato.",
    },
    {
      title: "Risoluzione e firma cliente",
      before:
        "Tecnico risolve, cliente dice 'grazie', tecnico torna in azienda. Nessuna prova dell'intervento, nessuna firma, nessuna foto. Mese dopo cliente dice 'non avete fatto niente, è tornato il problema'.",
      after:
        "Tecnico chiude ticket dall'app: foto pre/post, descrizione intervento, firma elettronica cliente eIDAS. Notifica al cliente e all'ufficio. Knowledge base aggiornata con la soluzione applicata.",
    },
    {
      title: "Dossier garanzia decennale",
      before:
        "Avvocato chiede dossier per causa civile. Recuperi contratto su Dropbox, foto su WhatsApp, capitolato cartaceo in archivio, comunicazioni email sparse. 3 giorni di lavoro, dossier incompleto, rischi di perdere.",
      after:
        "Apri il cantiere nel gestionale, esporti dossier completo PDF: contratto firmato, SAL, capitolato, certificazioni materiali, foto datate, tutti i ticket aperti/chiusi con interventi. Pronto in 5 minuti.",
    },
  ],

  mechanismKicker: "Come funziona",
  mechanismH2: "Tre passaggi. Cliente apre, tecnico chiude, sistema archivia per 10 anni.",
  mechanismSubheadline:
    "Il modulo Ticket Assistenza è progettato per coprire l'intero ciclo di vita art. 1669 c.c.: dal momento della consegna del cantiere fino al decennio di garanzia legale, ogni interazione viene strutturata, archiviata e resa difendibile.",
  mechanismSteps: [
    {
      icon: Ticket,
      title: "Cliente apre ticket dal portale o WhatsApp",
      text: "Inserisce descrizione, allega foto del problema, sistema riconosce il cantiere di riferimento, calcola priorità (urgente/alta/media/bassa) e SLA. Ticket numerato e tracciato.",
    },
    {
      icon: ArrowUpRight,
      title: "Tecnico assegnato riceve dossier completo",
      text: "App mobile mostra al tecnico: ticket attuale, storia cantiere, ticket precedenti, foto archiviate, certificazioni materiali, contatto cliente. Arriva preparato, riduce tempo intervento del 40%.",
    },
    {
      icon: ShieldCheck,
      title: "Chiusura tracciata e dossier 1669 c.c.",
      text: "Tecnico chiude con foto pre/post, descrizione intervento, firma cliente eIDAS. Knowledge base aggiornata. Dossier garanzia decennale aggiornato. Tutto archiviato 10 anni a norma CAD.",
    },
  ],
  mechanismCta: "Apri un ticket di prova come cliente",

  commercialKicker: "Perché conviene davvero",
  commercialH2: "Helpdesk strutturato = clienti più sereni + difesa legale solida + recensioni 5★.",
  commercialBody:
    "Le imprese edili che attivano il sistema ticket assistenza vedono in 6 mesi: tempi di risposta dimezzati, cause civili 1669 c.c. vinte più frequentemente, recensioni Google migliorate, tecnici più produttivi grazie alla knowledge base.",
  commercialLevers: [
    {
      icon: Star,
      title: "Recensioni 5★ post-vendita",
      text: "Cliente seguito con SLA chiari, intervento tracciato, comunicazione professionale. Recensione positiva quasi automatica perché l'esperienza post-vendita è strutturata, non improvvisata.",
    },
    {
      icon: ShieldCheck,
      title: "Difesa legale art. 1669 c.c. solida",
      text: "Dossier completo per ogni cantiere con foto datate, comunicazioni tracciate, interventi firmati. Avvocato vince più cause perché parte da prove documentali, non da memoria.",
    },
    {
      icon: TrendingUp,
      title: "Tecnici più produttivi del 40%",
      text: "Knowledge base con soluzioni passate, dossier cantiere precaricato, app mobile con foto e firma. Tecnico fa 3 interventi al giorno invece di 2, costo orario abbassato.",
    },
    {
      icon: Sparkles,
      title: "Brand percepito come impresa moderna",
      text: "Cliente che riceve numero ticket, SLA, notifiche di stato, foto di chiusura percepisce un servizio premium. Si propone una posizione di prezzo superiore, sconti chiesti meno.",
    },
  ],

  resultsKicker: "Risultati con Edilizia in Cloud",
  resultsH2: "Il post-vendita non è più un mal di testa. È un asset commerciale.",
  resultsBody:
    "Quando il post-vendita ha numero ticket, SLA, dossier consultabile, tecnici preparati e knowledge base, smette di essere un costo nascosto e diventa un differenziatore commerciale: clienti che tornano, recensioni che generano lead, cause vinte invece che perse.",
  integrationPillars: [
    {
      icon: Headphones,
      title: "SLA per priorità e tipologia",
      text: "Urgente (allagamento, no riscaldamento) entro 24h, alta (infiltrazione, crepa visibile) 72h, media (rifinitura) 7gg, bassa (estetica) 21gg. SLA dichiarato al cliente, escalation automatica.",
    },
    {
      icon: Smartphone,
      title: "App tecnico mobile",
      text: "Lista ticket assegnati, mappa interventi, dossier cantiere offline, foto pre/post, firma cliente, registrazione vocale, materiali utilizzati. Tutto in un'app.",
    },
    {
      icon: BookOpen,
      title: "Knowledge base interna",
      text: "Ogni ticket chiuso alimenta archivio soluzioni cercabile per tipo di problema, materiale coinvolto, fornitore. Tecnici junior risolvono come senior consultando soluzioni passate.",
    },
    {
      icon: History,
      title: "Dossier 10 anni esibizione legale",
      text: "Per ogni cantiere: contratto, SAL, capitolato, certificazioni, foto datate, ticket aperti/chiusi, comunicazioni cliente. Esportazione PDF completa in 5 minuti, archiviato 10 anni a norma CAD.",
    },
  ],
  resultStats: [
    { value: 90, prefix: "+", suffix: "%", label: "ticket risolti entro SLA dichiarato" },
    { value: 1.5, suffix: " h", label: "ore risparmiate per ticket gestito" },
    { value: 40, prefix: "+", suffix: "%", label: "produttività tecnici grazie a knowledge base" },
  ],
  resultsCta: "Apri il modulo ticket assistenza",

  roiKicker: "Calcola il tuo ROI",
  roiH2: "Quanto recuperi se ogni ticket si risolve in 1,5 ore in meno?",
  roiSubheadline:
    "Sposta i cursori sulla tua realtà: ticket gestiti al mese e costo orario del tecnico in trasferta. La stima parte da 1,5 ore risparmiate per ticket grazie a dossier precaricato, app mobile e knowledge base.",
  roi: {
    input1Label: "Ticket gestiti al mese",
    input1Default: 30,
    input1Min: 5,
    input1Max: 200,
    input1Step: 1,
    input2Label: "Costo orario tecnico (€)",
    input2Default: 35,
    input2Min: 20,
    input2Max: 60,
    input2Step: 1,
    input2Suffix: " €",
    outputLabel: "Risparmio annuo stimato",
    computeOutput: (a, b) => Math.round(a * 12 * 1.5 * b),
    computeSecondary: (a, b) => [
      { label: "Ore tecnico recuperate/anno", value: `${Math.round(a * 12 * 1.5)} h` },
      { label: "Cause 1669 c.c. evitate stimate/anno", value: `${Math.round(a / 30 + 1)}` },
      { label: "Recensioni 5★ extra/anno", value: `${Math.round(a * 0.3)}` },
    ],
    closingPitch:
      "Stima prudenziale basata su 1,5h/ticket risparmiate grazie a dossier precaricato e knowledge base. Aggiungi le cause 1669 c.c. vinte e le recensioni 5★ generate dal post-vendita strutturato.",
  },

  salesKicker: "Impatto operativo",
  salesH2: "Non un ticketing generico. Un modulo nato per la garanzia decennale edile.",
  salesBody:
    "I sistemi ticket generalisti (Zendesk, Freshdesk) non capiscono il cantiere edile e l'art. 1669 c.c. Il modulo Ticket Assistenza è progettato per il ciclo decennale di responsabilità dell'impresa edile italiana.",
  salesImpact: [
    {
      title: "Post-vendita come differenziatore",
      text: "Clienti che vivono il post-vendita strutturato lasciano recensioni 5★ e portano nuovi clienti. Il post-vendita smette di essere un costo e diventa un canale lead.",
    },
    {
      title: "Difesa legale 1669 c.c. preparata",
      text: "Dossier sempre pronto per ogni cantiere consegnato negli ultimi 10 anni. In caso di causa, l'avvocato parte già con prove documentali solide.",
    },
    {
      title: "Tecnici efficienti come senior",
      text: "Knowledge base e dossier precaricato rendono il tecnico junior produttivo come un senior. Riduci dipendenza dai veterani, scali più facilmente.",
    },
    {
      title: "Trasparenza con il cliente finale",
      text: "Cliente vede stato ticket, SLA dichiarato, tecnico assegnato, ETA intervento. Riduce ansia, riduce chiamate di sollecito, migliora soddisfazione.",
    },
  ],

  featureKicker: "Cosa ottieni davvero",
  featureH2: "Un elenco concreto di quello che attiviamo in 48 ore.",
  featureRows: [
    {
      label: "Ticket numerato con priorità e SLA",
      value: "Numero univoco, priorità urgente/alta/media/bassa, SLA dichiarato al cliente, escalation automatica se SLA a rischio. Notifiche push e email.",
    },
    {
      label: "Apertura ticket multi-canale",
      value: "Portale cliente, WhatsApp aziendale, email dedicata, modulo sito, telefono con trascrizione. Tutti i canali confluiscono nel sistema unico.",
    },
    {
      label: "Dossier cantiere precaricato",
      value: "Tecnico riceve sul telefono: contratto, capitolato, SAL, foto cantiere, certificazioni materiali, fornitori coinvolti, ticket precedenti, soluzioni passate.",
    },
    {
      label: "App tecnico mobile con foto e firma",
      value: "Lista ticket, mappa interventi, foto pre/post, descrizione intervento, materiali usati, firma cliente eIDAS, registrazione vocale opzionale.",
    },
    {
      label: "Knowledge base interna cercabile",
      value: "Archivio soluzioni passate cercabile per tipo problema, materiale, fornitore, gravità. Tecnici junior consultano senior senza bisogno di chiamarli.",
    },
    {
      label: "Dossier garanzia decennale art. 1669 c.c.",
      value: "Per ogni cantiere consegnato, dossier completo PDF con tutti gli interventi, foto datate, comunicazioni. Esibizione legale in 5 minuti, archiviazione 10 anni CAD.",
    },
    {
      label: "Integrazione portale cliente",
      value: "Cliente apre/segue ticket dal portale brandizzato, riceve notifiche stato, scarica report intervento firmato, lascia feedback NPS.",
    },
  ],

  scenarioKicker: "Tre casi reali sul campo",
  scenarioH2: "Tre situazioni in cui Ticket Assistenza cambia il post-vendita.",
  scenarios: [
    {
      title: "Infiltrazione 4 anni dopo la consegna",
      text: "Cliente apre ticket dal portale: foto crepa con infiltrazione. Sistema riconosce il cantiere, recupera certificazione impermeabilizzazione, assegna il tecnico originale. Intervento in 24h sotto garanzia, dossier 1669 c.c. aggiornato.",
    },
    {
      title: "Causa civile per vizi gravi a 7 anni",
      text: "Avvocato cliente fa causa per crepe strutturali. Esporti dossier cantiere completo: contratto, SAL firmati, capitolato, certificazioni cemento e ferro, 47 foto datate dei lavori, 3 ticket precedenti chiusi. Causa vinta in primo grado.",
    },
    {
      title: "Tecnico junior risolve da solo",
      text: "Tecnico al primo anno riceve ticket per termoarredo che non scalda. Knowledge base mostra soluzione passata identica: spurgo aria + valvola termostatica. Risolve in 30 minuti senza chiamare il senior, cliente firma intervento.",
    },
  ],

  testimonialQuote:
    "Avevamo 200 cantieri consegnati negli ultimi 10 anni e il post-vendita su WhatsApp del titolare. Una causa civile ci aveva fatto perdere 30.000€ perché non riuscivamo a documentare. Ora ogni ticket è numerato, ogni intervento è firmato, il dossier per ogni cantiere è esportabile in 5 minuti. La pace mentale vale più del software.",
  testimonialAuthor: "Giorgio M.",
  testimonialRole: "Edilcasa M. Srl, Bologna",

  faqKicker: "Domande frequenti",
  faqH2: "Quello che un titolare di impresa edile vuole sapere prima di passare al ticketing strutturato.",
  faqs: [
    {
      q: "Come si integra con la garanzia decennale art. 1669 c.c.?",
      a: "Ogni cantiere consegnato attiva automaticamente il countdown decennale art. 1669 c.c. Tutti i ticket aperti su quel cantiere alimentano un dossier che include foto datate, certificazioni materiali, interventi tracciati. In caso di contenzioso, il dossier completo PDF si esporta in 5 minuti.",
    },
    {
      q: "Posso importare i cantieri chiusi degli ultimi 10 anni?",
      a: "Sì. In fase di onboarding importiamo l'archivio cantieri storici da Excel, gestionali precedenti, hard disk, cloud. Le foto si caricano massivamente con riconoscimento automatico data EXIF. Dossier 1669 c.c. ricostruito retroattivamente per i cantieri ancora in garanzia.",
    },
    {
      q: "I miei tecnici lavorano in trasferta, l'app funziona offline?",
      a: "Sì. L'app mobile sincronizza il dossier cantiere e i ticket assegnati prima di partire. In trasferta funziona offline: foto, descrizioni, firma cliente vengono salvate localmente e sincronizzate quando torna la connessione. Niente lavoro perso per zone senza segnale.",
    },
    {
      q: "I clienti possono aprire ticket via WhatsApp o devono usare il portale?",
      a: "Entrambi. WhatsApp aziendale è collegato al sistema: ogni messaggio cliente diventa automaticamente ticket numerato con notifica al team. Cliente più tradizionale usa WhatsApp, cliente più strutturato usa il portale, l'output è identico per la tua impresa.",
    },
    {
      q: "Come funziona l'escalation se il tecnico non rispetta lo SLA?",
      a: "Sistema monitora SLA in tempo reale. A 50% del tempo SLA invia reminder al tecnico. A 80% notifica al capocantiere e al titolare. A 100% scaduto, escalation automatica con riassegnazione e comunicazione al cliente. Niente più ticket dimenticati.",
    },
    {
      q: "Quanto costa il modulo e ci sono limiti di ticket?",
      a: "Il modulo Ticket Assistenza è incluso nei piani Professional e Business di Edilizia in Cloud con ticket illimitati e tecnici illimitati. Setup in 48 ore, app tecnico inclusa, formazione 1-a-1, cancelli quando vuoi.",
    },
  ],

  internalLinksKicker: "Esplora la piattaforma",
  internalLinksH2: "Ticket Assistenza è il cuore del post-vendita edile.",
  internalLinksBody:
    "Il modulo collega cantiere consegnato, portale cliente, app tecnico mobile, firma elettronica e knowledge base in un unico ciclo decennale.",
  internalLinks: [
    { to: "/funzionalita/portale-clienti", title: "Portale Clienti", text: "Cliente apre ticket e segue stato dal portale brandizzato." },
    { to: "/funzionalita/gestione-cantieri", title: "Gestione Cantieri", text: "Cantiere consegnato attiva garanzia decennale automatica." },
    { to: "/funzionalita/app-cantiere-mobile", title: "App Cantiere Mobile", text: "Tecnico riceve dossier e chiude ticket con foto e firma." },
    { to: "/funzionalita/firma-elettronica", title: "Firma Elettronica", text: "Cliente firma chiusura ticket con valore eIDAS." },
    { to: "/funzionalita/manutenzione-impianti", title: "Manutenzione Impianti", text: "Ticket di manutenzione programmata e a guasto su impianti consegnati." },
    { to: "/funzionalita/foto-cantiere", title: "Foto Cantiere", text: "Foto datate del cantiere alimentano il dossier 1669 c.c." },
    { to: "/funzionalita/conserva-digitale", title: "Conservazione Digitale", text: "Archivio decennale a norma CAD per dossier garanzia." },
    { to: "/per/imprese-edili", title: "Software per Imprese di Costruzione", text: "Tutta la piattaforma orientata alle imprese edili italiane." },
    { to: "/prezzi", title: "Prezzi e Piani", text: "Ticket Assistenza incluso nei piani Professional e Business." },
  ],

  finalCtaH2: "Smetti di gestire la garanzia decennale a memoria. Inizia a difenderti con un dossier.",
  finalCtaBody:
    "31 giorni gratuiti per portare il post-vendita edile dentro un sistema ticket strutturato. Garanzia decennale art. 1669 c.c., SLA, app tecnico mobile, knowledge base, integrazione portale cliente. Onboarding 1-a-1 incluso, cancelli quando vuoi.",
  finalCtaButton: "Prova gratis 31 giorni",
  finalCtaMicrocopy: "Setup in 48 ore · Garanzia 1669 c.c. tracciata · Cancelli quando vuoi",

  stickyCtaLabel: "Prova gratis Ticket Assistenza",
  stickyCtaMicrocopy: "Setup 48h · Dossier 1669 c.c. incluso",

  applicationSubCategory: "Construction Helpdesk Software",

  relatedBlogSlugs: [
    "gestionale-edilizia-opinioni",
    "delegare-impresa-edile-senza-perdere-controllo",
    "digitalizzare-impresa-edile",
  ],
};

export default function TicketAssistenza() {
  return <FunzionalitaPageTemplate config={config} />;
}
