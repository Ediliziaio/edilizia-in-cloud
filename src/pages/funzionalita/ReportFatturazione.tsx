import {
  AlertTriangle,
  BarChart3,
  Briefcase,
  Clock,
  Crosshair,
  Download,
  FileSpreadsheet,
  Filter,
  Globe,
  HardHat,
  LineChart,
  PieChart,
  Receipt,
  Search,
  Sparkles,
  Target,
  TrendingUp,
  Wallet,
} from "lucide-react";
import FunzionalitaPageTemplate from "./_template/FunzionalitaPageTemplate";
import type { FunzionalitaPageConfig } from "./_template/types";

const config: FunzionalitaPageConfig = {
  slug: "report-fatturazione",
  vertical: "Report Fatturazione",
  productName: "Modulo Report Fatturazione Edilizia in Cloud",
  audience:
    "Imprese edili, ristrutturatori e general contractor che vogliono dashboard mensile fatturato/incassato/scaduto, reportistica per cliente/cantiere/agente/periodo, KPI commerciali, target vs actual con esportazione PDF/Excel",
  audienceShort: "imprese edili e ristrutturatori",

  seo: {
    title:
      "Report Fatturazione Edilizia",
    description:
      "Reportistica fatturazione per imprese edili: dashboard mensile fatturato/incassato/scaduto, report per cliente/cantiere/agente/periodo, KPI commerciali,…",
    keywords:
      "report fatturazione edilizia, dashboard fatturato impresa edile, KPI commerciali edilizia, report cantieri fatturato, target vs actual edilizia, esportazione excel fatturato, scaduti edilizia, monitoraggio incassi edilizia",
    ogImage: "https://www.ediliziaincloud.com/og/og-default.png",
  },

  heroBadge: "Funzionalità · Report Fatturazione",
  heroH1Lead: "Vedi fatturato, incassato e scaduto",
  heroH1Highlight: "in dashboard live",
  heroH1Tail: "non in 4 fogli Excel",
  heroSubheadline:
    "Modulo Report Fatturazione con dashboard mensile fatturato/incassato/scaduto, drill-down per cliente, cantiere, agente, periodo. KPI commerciali (ticket medio, ciclo incasso, conversione preventivi), target vs actual mensile, esportazione PDF/Excel per consigli di amministrazione e banche. Stop alle 4 ore di Excel del lunedì mattina.",
  heroPrimaryCta: "Prova gratis 31 giorni",
  heroSecondaryCta: "Tutte le funzionalità",
  heroSecondaryCtaTo: "/funzionalita",

  reassurancePoints: [
    "Dashboard fatturato real time",
    "Drill-down per cliente/cantiere",
    "Esportazione PDF e Excel",
  ],
  proofPoints: [
    "KPI commerciali pronti",
    "Target vs actual mensile",
    "Filtri agente, periodo, area",
  ],

  objectiveRow: [
    ["Obiettivo", "Vedere fatturato/incassato/scaduto in 30 secondi, non in 4 ore di Excel"],
    ["Momento chiave", "Lunedì mattina prima della riunione commerciale settimanale"],
    ["Risultato", "Decisioni commerciali informate, scaduti recuperati, target raggiunti"],
  ],

  betaH2:
    "Più di 260 imprese edili italiane monitorano fatturato, incassato e KPI commerciali con il modulo Report di Edilizia in Cloud.",
  betaBody:
    "Il modulo Report Fatturazione è attivo in 48 ore: importiamo le fatture degli ultimi 3 anni, configuriamo dashboard personalizzate per ruolo (titolare, commerciale, amministrazione), settiamo target mensili per cliente/cantiere/agente, attiviamo notifiche scaduti. Quattro sessioni 1-a-1 ti accompagnano fino al primo report mensile in PDF firmato e inviato alla banca.",

  speedH2: "Il lunedì mattina passi 4 ore in Excel per sapere se questo mese sei in target.",
  speedSubheadline:
    "Le imprese edili italiane producono report di fatturazione assemblando manualmente Excel da gestionale, home banking, file commercialista. Il risultato è 4 ore di lunedì del titolare e amministrazione, dati incoerenti tra fonti, decisioni commerciali rinviate, scaduti scoperti tardi. Il modulo Report fa lo stesso lavoro in 30 secondi.",
  speedStats: [
    { value: 70, prefix: "-", suffix: "%", label: "tempo creazione report fatturazione" },
    { value: 30, suffix: " s", label: "secondi per dashboard mensile" },
    { value: 100, suffix: "%", label: "coerenza tra fatture, incassi e scaduti" },
  ],

  familyH2: "Report collegati a fatturazione, tesoreria, cantieri e CRM.",
  familySubheadline:
    "Il report non è un Excel da assemblare: vive collegato a fatture SDI, movimenti bancari, marginalità cantieri, pipeline commerciale CRM. Tutto in tempo reale, niente disallineamenti, niente sorprese.",
  familyItems: [
    {
      icon: Receipt,
      title: "Fatturazione Elettronica",
      text: "Tutte le fatture emesse alimentano in tempo reale la dashboard fatturato.",
      to: "/funzionalita/fatturazione-elettronica",
    },
    {
      icon: Wallet,
      title: "Tesoreria",
      text: "Movimenti bancari riconciliati determinano fatture incassate e scaduto reale.",
      to: "/funzionalita/tesoreria",
    },
    {
      icon: HardHat,
      title: "Margini Cantiere",
      text: "Fatturato per cantiere collegato a costi e marginalità reale per commessa.",
      to: "/funzionalita/margini-cantiere",
    },
    {
      icon: Briefcase,
      title: "CRM Edilizia",
      text: "Pipeline commerciale collegata al fatturato per analisi conversione preventivi.",
      to: "/funzionalita/crm-edilizia",
    },
    {
      icon: PieChart,
      title: "Cruscotto Aziendale",
      text: "Dashboard direzionale con KPI cross-aziendali oltre il solo fatturato.",
      to: "/funzionalita/cruscotto-aziendale",
    },
    {
      icon: Globe,
      title: "Portale Clienti",
      text: "Cliente vede sul portale stato fatture e scadenze del proprio cantiere.",
      to: "/funzionalita/portale-clienti",
    },
  ],
  familyBonusTitle: "Una sola piattaforma. Da fatture a report a banca senza assemblare Excel.",
  familyBonusText:
    "Quando una fattura viene emessa via SDI, entra nel report fatturato, alimenta il KPI mensile per cliente/cantiere/agente, contribuisce al target vs actual. Quando la banca registra incasso, la fattura passa da 'scaduta' a 'incassata', il report si aggiorna, la dashboard direzionale rispecchia la nuova realtà finanziaria. Tutto in tempo reale.",

  painKicker: "Il problema vero",
  painH2: "Per sapere quanto hai fatturato a giugno, apri 4 file Excel e li sommi a mano.",
  painSubheadline:
    "Anche con SDI obbligatorio e gestionali moderni, la maggior parte delle imprese edili italiane produce report fatturazione assemblando manualmente fonti diverse. Il titolare passa il lunedì mattina a costruire un quadro che dovrebbe essere disponibile in 30 secondi. Risultato: decisioni commerciali rinviate, scaduti scoperti tardi, target rincorsi.",
  painPoints: [
    {
      icon: FileSpreadsheet,
      title: "4 ore di Excel ogni lunedì mattina",
      text: "Esporti fatture dal gestionale, scarichi estratto conto banca, controlli scaduti dal commercialista, sommi a mano in Excel. 4 ore ogni lunedì del titolare o dell'amministrazione, €120-300 di costo settimanale solo per produrre numeri che dovrebbero esserci.",
    },
    {
      icon: AlertTriangle,
      title: "Scaduti scoperti dopo 60-90 giorni",
      text: "Fattura emessa a febbraio, scadenza a maggio, controllo manuale a fine mese. Se sfugge, scopri lo scaduto a luglio: 60 giorni di ritardo recupero, cliente forse fallito, denaro irrecuperabile. Cassa aziendale in sofferenza per ritardo monitoraggio.",
    },
    {
      icon: Crosshair,
      title: "Target commerciali rincorsi, mai pianificati",
      text: "A fine mese scopri di essere a -30% del target. Troppo tardi per recuperare. Senza dashboard target vs actual settimanale, la pianificazione commerciale è reattiva, non proattiva. Anno chiuso sotto budget perché lo hai capito troppo tardi.",
    },
    {
      icon: Search,
      title: "Domande direzionali senza risposta rapida",
      text: "Banca chiede 'fatturato per cantiere ultimi 12 mesi'. Consiglio amministrazione chiede 'top 10 clienti per margine'. Tu impieghi 2 giorni a costruire il quadro. Decisioni rinviate, finanziamenti rallentati, opportunità perse.",
    },
  ],

  baKicker: "Prima e dopo Edilizia in Cloud",
  baH2: "Stesse fatture, stessi clienti, stessa banca. Cambia chi assembla il quadro.",
  baSubheadline:
    "Il modulo Report non sostituisce la tua intelligenza commerciale: la libera dal lavoro meccanico di assemblaggio Excel e ti dà un quadro pronto in 30 secondi su cui ragionare. Tu prendi decisioni vere, il sistema fa la fatica dei numeri.",
  baAreas: [
    {
      title: "Report mensile fatturato/incassato",
      before:
        "Lunedì mattina: 4 ore di Excel per assemblare fatturato emesso, fatturato incassato, scaduto, suddiviso per cliente/cantiere. Numeri pronti alle 13:00 ma riferiti alla settimana scorsa.",
      after:
        "Apri il modulo, dashboard mensile pronta in 30 secondi: fatturato emesso/incassato/scaduto, drill-down per cliente/cantiere/agente, confronto con mese/anno precedente. Sempre aggiornato.",
    },
    {
      title: "Monitoraggio scaduti",
      before:
        "Controllo manuale settimanale di un foglio Excel, ricostruzione scaduti da estratti conto, telefonate di sollecito reattive a 60-90 giorni di ritardo. €40-80k di scaduti medi non recuperati per impresa media.",
      after:
        "Dashboard scaduti in tempo reale: fatture in scadenza nei prossimi 7 giorni, scadute 1-30 gg, scadute 31-60 gg, scadute 60+ gg. Solleciti automatici via email/WhatsApp, recupero crediti proattivo.",
    },
    {
      title: "Target vs actual commerciale",
      before:
        "Target annuale di 1,5M€, controlli a fine giugno, sei a 600k€, devi recuperare 900k€ in 6 mesi. Pianificazione reattiva, ansia, decisioni dell'ultimo minuto, anno chiuso a 1,2M€.",
      after:
        "Target mensile e settimanale per cliente/cantiere/agente, dashboard mostra +15%/-10% in tempo reale, decisioni proattive ogni lunedì, azioni correttive rapide, anno chiuso in target o sopra.",
    },
    {
      title: "Documentazione per banca/CdA",
      before:
        "Banca chiede report fatturato 12 mesi per fido, CdA chiede top clienti per riunione. 2 giorni di lavoro a estrarre dati, costruire grafici, scrivere commenti. Decisioni rinviate per documentazione tarda.",
      after:
        "Report PDF firmato digitalmente generato in 1 click: fatturato 12 mesi per cliente/cantiere, KPI, trend, commenti automatici. Inviato alla banca in 5 minuti, fido approvato in tempi standard.",
    },
  ],

  mechanismKicker: "Come funziona",
  mechanismH2: "Tre passaggi. Dashboard live, drill-down, esportazione professionale.",
  mechanismSubheadline:
    "Il modulo Report Fatturazione è progettato per il titolare e per l'amministrazione: dashboard pronta al primo accesso, drill-down con un click, esportazione PDF/Excel pronta per banca o consiglio di amministrazione.",
  mechanismSteps: [
    {
      icon: BarChart3,
      title: "Dashboard mensile sempre pronta",
      text: "Apri il modulo: vedi fatturato emesso, fatturato incassato, scaduto totale, ticket medio, top 10 clienti, top 10 cantieri, confronto mese/anno precedente, target vs actual con scarto.",
    },
    {
      icon: Filter,
      title: "Drill-down per cliente, cantiere, agente",
      text: "Filtri rapidi per cliente, cantiere, agente, periodo, area geografica, tipo lavoro. Apri qualsiasi voce e vedi il dettaglio fattura per fattura, scadenza per scadenza, sollecito per sollecito.",
    },
    {
      icon: Download,
      title: "Esportazione PDF/Excel professionale",
      text: "Genera report PDF firmato digitalmente per banca, CdA, commercialista, con grafici, commenti automatici, KPI evidenziati. Esportazione Excel grezza per analisi avanzate. Tutto in 30 secondi.",
    },
  ],
  mechanismCta: "Apri la dashboard di prova",

  commercialKicker: "Perché conviene davvero",
  commercialH2: "Dashboard live = decisioni in tempo reale + scaduti recuperati + target raggiunti.",
  commercialBody:
    "Le imprese edili che hanno attivato il modulo Report Fatturazione recuperano in media il 70% del tempo dedicato all'assemblaggio Excel, riducono lo scaduto medio del 35% grazie al monitoraggio in tempo reale, e raggiungono il target annuale di fatturato con maggiore frequenza.",
  commercialLevers: [
    {
      icon: Clock,
      title: "-70% tempo Excel del lunedì",
      text: "Da 4 ore a 30 secondi per la dashboard mensile. Su un anno sono 200 ore di titolare/amministrazione a €30-60/h: €6.000-12.000 di costo recuperato.",
    },
    {
      icon: TrendingUp,
      title: "-35% scaduto medio aziendale",
      text: "Monitoraggio scaduti in tempo reale, solleciti automatici, recupero crediti proattivo. Cassa aziendale più sana, niente più sorprese a 90 giorni di ritardo.",
    },
    {
      icon: Target,
      title: "Target raggiunti più frequentemente",
      text: "Target vs actual visibile ogni lunedì, decisioni correttive proattive ogni settimana invece che reattive ogni 6 mesi. Tasso di raggiungimento target dal 60% all'85%.",
    },
    {
      icon: Sparkles,
      title: "Banche e CdA documentati professionalmente",
      text: "Report PDF firmati con grafici, KPI, trend, commenti automatici. Banche concedono fidi più rapidamente, CdA prendono decisioni informate, soci e investitori più sereni.",
    },
  ],

  resultsKicker: "Risultati con Edilizia in Cloud",
  resultsH2: "Niente più 4 ore di Excel del lunedì. Solo decisioni commerciali su dati live.",
  resultsBody:
    "Quando i report di fatturazione si generano in tempo reale dai dati di SDI, tesoreria, cantieri e CRM, il titolare smette di essere assemblatore di Excel e torna a essere stratega commerciale. Le decisioni si prendono ogni lunedì, non ogni 6 mesi.",
  integrationPillars: [
    {
      icon: BarChart3,
      title: "Dashboard mensile multidimensionale",
      text: "Fatturato, incassato, scaduto, ticket medio, conversione preventivi, ciclo incasso medio. Confronto mese/anno precedente, trend 12 mesi, target vs actual.",
    },
    {
      icon: Filter,
      title: "Drill-down per qualsiasi dimensione",
      text: "Filtri per cliente, cantiere, agente, periodo, area geografica, tipo lavoro, regime IVA. Apri qualsiasi voce e vedi dettaglio fattura, sollecito, incasso.",
    },
    {
      icon: LineChart,
      title: "KPI commerciali pronti",
      text: "Ticket medio, top 10 clienti, top 10 cantieri, ciclo incasso DSO, scaduto per fascia (1-30/31-60/60+), tasso conversione preventivi, fatturato per agente.",
    },
    {
      icon: Download,
      title: "Esportazione PDF e Excel",
      text: "Report PDF firmato digitalmente con marca temporale per banca/CdA, esportazione Excel grezza per analisi avanzate, programmazione invio automatico mensile.",
    },
  ],
  resultStats: [
    { value: 70, prefix: "-", suffix: "%", label: "tempo creazione report fatturazione" },
    { value: 35, prefix: "-", suffix: "%", label: "scaduto medio aziendale dopo 6 mesi" },
    { value: 85, prefix: "+", suffix: "%", label: "tasso raggiungimento target annuale" },
  ],
  resultsCta: "Apri il modulo report fatturazione",

  roiKicker: "Calcola il tuo ROI",
  roiH2: "Quanto recuperi se il report del lunedì si fa in 30 secondi invece di 4 ore?",
  roiSubheadline:
    "Sposta i cursori sulla tua realtà: numero di fatture mensili e ore settimanali dedicate alla reportistica. La stima parte dal 70% di tempo recuperato grazie alla dashboard live e all'esportazione PDF/Excel automatica.",
  roi: {
    input1Label: "Fatture al mese",
    input1Default: 80,
    input1Min: 10,
    input1Max: 1000,
    input1Step: 10,
    input2Label: "Ore reportistica/sett",
    input2Default: 5,
    input2Min: 1,
    input2Max: 10,
    input2Step: 1,
    input2Suffix: " h",
    outputLabel: "Risparmio annuo stimato",
    computeOutput: (a, b) => Math.round(a * 52 * b * 0.7 * 30),
    computeSecondary: (a, b) => [
      { label: "Ore reportistica recuperate/anno", value: `${Math.round(a * 52 * b * 0.7)} h` },
      { label: "Riduzione tempo report", value: "70%" },
      { label: "Riduzione scaduto medio", value: "35%" },
    ],
    closingPitch:
      "Stima prudenziale basata sul 70% di tempo report recuperato a €30/h. Aggiungi gli scaduti recuperati grazie al monitoraggio in tempo reale e i target raggiunti grazie a decisioni proattive settimanali.",
  },

  salesKicker: "Impatto operativo",
  salesH2: "Non un Excel più carino. Una dashboard direzionale per imprese edili.",
  salesBody:
    "Excel e Power BI generici richiedono ore di costruzione e manutenzione. Il modulo Report Fatturazione di Edilizia in Cloud nasce con KPI edili preconfigurati e si alimenta automaticamente da SDI, tesoreria e cantieri.",
  salesImpact: [
    {
      title: "Decisioni commerciali ogni lunedì",
      text: "Riunione commerciale settimanale basata su dashboard live invece che Excel obsoleto. Azioni correttive rapide, target rincorsi proattivamente, anno chiuso in linea con il budget.",
    },
    {
      title: "Scaduti monitorati in tempo reale",
      text: "Fatture in scadenza nei prossimi 7 giorni, scadute 1-30/31-60/60+ gg sempre visibili. Solleciti automatici, recupero crediti proattivo, cassa aziendale più sana.",
    },
    {
      title: "Top 10 clienti e cantieri sotto controllo",
      text: "Sai sempre chi sono i top 10 clienti per fatturato, marginalità, scaduto. Sai quali cantieri stanno generando margine e quali drenando cassa. Decisioni informate.",
    },
    {
      title: "Banche e CdA documentati",
      text: "Report PDF firmati per pratica fido o riunione consiglio amministrazione pronti in 5 minuti. Tempi di approvazione finanziamenti dimezzati, CdA più reattivi.",
    },
  ],

  featureKicker: "Cosa ottieni davvero",
  featureH2: "Un elenco concreto di quello che attiviamo in 48 ore.",
  featureRows: [
    {
      label: "Dashboard mensile pronta al primo accesso",
      value: "Fatturato emesso/incassato/scaduto, ticket medio, top 10 clienti, top 10 cantieri, confronto mese/anno precedente, target vs actual con scarto percentuale.",
    },
    {
      label: "Drill-down multi-dimensionale",
      value: "Filtri per cliente, cantiere, agente, periodo, area geografica, tipo lavoro, regime IVA. Apri qualsiasi voce per vedere dettaglio fattura/sollecito/incasso.",
    },
    {
      label: "KPI commerciali edilizia preconfigurati",
      value: "Ticket medio, ciclo incasso medio (DSO), conversione preventivi, fatturato per agente, marginalità per cantiere, scaduto per fascia.",
    },
    {
      label: "Target vs actual settimanale",
      value: "Target mensile e annuale per cliente/cantiere/agente con visualizzazione settimanale dello scarto. Notifiche automatiche se scarto supera soglia configurabile.",
    },
    {
      label: "Monitoraggio scaduti automatico",
      value: "Fatture in scadenza prossimi 7 gg, scadute 1-30/31-60/60+ gg sempre aggiornate. Solleciti automatici via email/WhatsApp, escalation per cliente cronico.",
    },
    {
      label: "Esportazione PDF firmato digitalmente",
      value: "Report PDF con grafici, KPI, trend, commenti automatici, firma digitale e marca temporale eIDAS. Pronto per banca, CdA, commercialista, soci.",
    },
    {
      label: "Esportazione Excel e CSV per analisi",
      value: "Esportazione grezza per analisi avanzate in Excel/Power BI, formato CSV per import in tool terzi, programmazione invio automatico mensile via email.",
    },
  ],

  scenarioKicker: "Tre casi reali sul campo",
  scenarioH2: "Tre situazioni in cui Report Fatturazione cambia la giornata.",
  scenarios: [
    {
      title: "Lunedì mattina riunione commerciale",
      text: "Apri dashboard alle 8:30: -12% target mensile su area Nord, top cliente con scaduto 60+ gg, agente Mario sopra target +18%. Riunione 9:00 con decisioni pronte: sollecitare top cliente, premiare Mario, supportare area Nord. 30 secondi al posto di 4 ore.",
    },
    {
      title: "Banca chiede report 12 mesi",
      text: "Banca chiede fatturato e marginalità per cantiere ultimi 12 mesi per fido 300.000€. Apri il modulo, generi report PDF firmato in 2 minuti con grafici, top clienti, trend, commenti. Banca riceve documentazione il giorno stesso, fido approvato in 5 giorni.",
    },
    {
      title: "Scaduto cronico recuperato a 30 gg",
      text: "Cliente storico con scaduto 30 gg notificato dalla dashboard. Sollecito automatico via email il giorno della scadenza, secondo sollecito a 7 gg, telefonata personale a 14 gg. Pagamento ricevuto a 21 gg invece dei 60 gg di ritardo medio precedente.",
    },
  ],

  testimonialQuote:
    "Passavo ogni lunedì 4 ore in Excel per sapere quanto avevo fatturato e incassato. Ora apro la dashboard alle 8:30, vedo tutto in 30 secondi, e alle 9 sono già in riunione commerciale con decisioni pronte. Lo scaduto è sceso del 40% perché lo monitoro in tempo reale e i solleciti partono automatici. È il modulo che mi ha fatto recuperare il lunedì.",
  testimonialAuthor: "Francesco D.",
  testimonialRole: "Edilcasa D. SpA, Roma",

  faqKicker: "Domande frequenti",
  faqH2: "Quello che un titolare di impresa edile vuole sapere prima di passare alla dashboard live.",
  faqs: [
    {
      q: "Come si alimenta la dashboard rispetto al gestionale che ho già?",
      a: "La dashboard si alimenta in tempo reale dai moduli Edilizia in Cloud: fatturazione SDI per fatturato emesso, tesoreria per incassi e scaduti, cantieri per marginalità, CRM per pipeline. Se hai gestionale terzo, importiamo storico in onboarding e configuriamo connessione via API o CSV.",
    },
    {
      q: "Posso configurare KPI personalizzati per la mia azienda?",
      a: "Sì. Oltre ai KPI preconfigurati (ticket medio, DSO, top clienti, scaduto per fascia) puoi configurare KPI custom basati su qualsiasi campo (cantiere/cliente/agente/area). Formula personalizzabile, target settabile, dashboard riorganizzabile per ruolo (titolare, commerciale, amministrazione).",
    },
    {
      q: "I report PDF sono accettati dalle banche per pratiche di finanziamento?",
      a: "Sì. I report PDF generati sono firmati digitalmente con marca temporale eIDAS qualificata, includono grafici, KPI, trend, commenti automatici. Banche italiane li accettano per pratiche di fido, finanziamento, cessione crediti. Esportazione XBRL/AdE disponibile per esigenze formali specifiche.",
    },
    {
      q: "Si possono inviare report automatici mensili a soci o CdA?",
      a: "Sì. Programmi invio automatico mensile o settimanale a indirizzi email configurati (titolare, soci, CdA, banche di riferimento, commercialista). Report PDF firmato con commento automatico sui trend principali. Niente più 'ti mando il report quando ho tempo'.",
    },
    {
      q: "Come funziona il monitoraggio scaduti automatico?",
      a: "Sistema monitora le scadenze fatture e i movimenti bancari riconciliati. 7 gg prima della scadenza invia reminder al cliente, alla scadenza primo sollecito automatico, a 7 gg secondo sollecito, a 14 gg notifica al titolare per telefonata personale. Tracciato tutto, escalation per recidivi.",
    },
    {
      q: "Quanto costa il modulo e ci sono limiti di report o utenti?",
      a: "Il modulo Report Fatturazione è incluso nei piani Professional e Business di Edilizia in Cloud con utenti illimitati, report illimitati, esportazione PDF firmati inclusa. Setup in 48 ore con import storico 3 anni, dashboard personalizzate, formazione 1-a-1, cancelli quando vuoi.",
    },
  ],

  internalLinksKicker: "Esplora la piattaforma",
  internalLinksH2: "Report Fatturazione è la cabina di regia commerciale dell'azienda edile.",
  internalLinksBody:
    "Il modulo collega fatturazione SDI, tesoreria, cantieri, CRM e cruscotto direzionale in un'unica vista commerciale e finanziaria.",
  internalLinks: [
    { to: "/funzionalita/fatturazione-elettronica", title: "Fatturazione Elettronica", text: "Fatture SDI alimentano la dashboard fatturato in tempo reale." },
    { to: "/funzionalita/tesoreria", title: "Tesoreria", text: "Movimenti bancari determinano fatture incassate e scaduto." },
    { to: "/funzionalita/margini-cantiere", title: "Margini Cantiere", text: "Fatturato per cantiere collegato a marginalità reale." },
    { to: "/funzionalita/crm-edilizia", title: "CRM Edilizia", text: "Pipeline commerciale collegata a conversione preventivi." },
    { to: "/funzionalita/cruscotto-aziendale", title: "Cruscotto Aziendale", text: "Dashboard direzionale con KPI cross-aziendali." },
    { to: "/funzionalita/scadenzario", title: "Scadenzario", text: "Scadenze fatture e versamenti nel calendario aziendale." },
    { to: "/funzionalita/portale-clienti", title: "Portale Clienti", text: "Cliente vede stato fatture e scadenze del proprio cantiere." },
    { to: "/per/imprese-costruzione", title: "Software per Imprese di Costruzione", text: "Tutta la piattaforma orientata alle imprese edili italiane." },
    { to: "/prezzi", title: "Prezzi e Piani", text: "Report Fatturazione incluso nei piani Professional e Business." },
  ],

  finalCtaH2: "Smetti di passare il lunedì in Excel. Inizia con una dashboard che vive.",
  finalCtaBody:
    "31 giorni gratuiti per portare la reportistica fatturazione su una dashboard live multi-dimensionale. KPI commerciali, target vs actual, monitoraggio scaduti automatico, esportazione PDF firmato. Onboarding 1-a-1 con import storico 3 anni, cancelli quando vuoi.",
  finalCtaButton: "Prova gratis 31 giorni",
  finalCtaMicrocopy: "Setup in 48 ore · Dashboard live · Cancelli quando vuoi",

  stickyCtaLabel: "Prova gratis Report Fatturazione",
  stickyCtaMicrocopy: "Setup 48h · Dashboard live",

  applicationSubCategory: "Construction Billing Reporting Software",

  relatedBlogSlugs: ["come-fare-preventivo-edilizia", "alternativa-excel-cantieri"],
};

export default function ReportFatturazione() {
  return <FunzionalitaPageTemplate config={config} />;
}
