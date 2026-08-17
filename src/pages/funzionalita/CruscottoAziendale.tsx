import {
  Activity,
  AlertTriangle,
  Gauge,
  HardHat,
  LineChart,
  PieChart,
  Receipt,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Target,
  TrendingUp,
  TrendingDown,
  Users,
  Wallet,
} from "lucide-react";
import FunzionalitaPageTemplate from "./_template/FunzionalitaPageTemplate";
import type { FunzionalitaPageConfig } from "./_template/types";

const config: FunzionalitaPageConfig = {
  slug: "cruscotto-aziendale",
  vertical: "Cruscotto Aziendale",
  productName: "Cruscotto Aziendale Edilizia in Cloud",
  audience:
    "Titolari, amministratori delegati e direzioni di imprese edili che vogliono un dashboard executive con KPI real-time su margini, cassa, fatturato e pipeline, accessibile anche da mobile in cantiere",
  audienceShort: "titolari di imprese edili che decidono in tempo reale",

  seo: {
    title:
      "Cruscotto Aziendale Edilizia",
    description:
      "Dashboard executive per titolari edili con KPI real-time: margine cantieri, cassa a 90 giorni, fatturato e pipeline preventivi, con drill-down per cantiere e commessa.",
    keywords:
      "cruscotto aziendale edilizia, dashboard impresa edile, kpi cantieri real time, business intelligence edilizia, margine cantieri tempo reale, cassa 90 giorni edile, dashboard titolare impresa costruzioni",
    ogImage: "https://www.ediliziaincloud.com/og/og-default.png",
  },

  heroBadge: "Funzionalità · Cruscotto Aziendale",
  heroH1Lead: "Tutto quello che ti serve per decidere",
  heroH1Highlight: "in una schermata",
  heroH1Tail: "anche dal cantiere",
  heroSubheadline:
    "Dashboard executive pensato per il titolare di un'impresa edile: KPI real-time su margine cantieri, cassa a 90 giorni, fatturato, pipeline preventivi. Drill-down per cantiere/cliente, mobile-first per decidere dal telefono in cantiere. Niente fogli Excel mensili, niente report del commercialista in ritardo.",
  heroPrimaryCta: "Prova gratis 31 giorni",
  heroSecondaryCta: "Tutte le funzionalità",
  heroSecondaryCtaTo: "/funzionalita",

  reassurancePoints: [
    "Setup in 48 ore",
    "KPI aggiornati in tempo reale",
    "Mobile-first per il cantiere",
  ],
  proofPoints: [
    "Margine cantiere live",
    "Cassa proiettata 90 giorni",
    "Drill-down per cantiere/cliente",
  ],

  objectiveRow: [
    ["Obiettivo", "Decidere ogni giorno con dati aggiornati, non a sentimento"],
    ["Momento chiave", "Caffè della mattina, decisioni di emergenza, fine mese"],
    ["Risultato", "+3% margine recuperato da decisioni più rapide e informate"],
  ],

  betaH2:
    "Più di 300+ imprese italiane usano il Cruscotto Aziendale per decidere ogni giorno con dati aggiornati.",
  betaBody:
    "Il Cruscotto Aziendale è già pronto: lo attiviamo in 48 ore configurando i KPI critici per la tua impresa (margini, cassa 90gg, fatturato, pipeline), connettendo i moduli Cantieri/Fatturazione/CRM, e ti accompagniamo in 3 sessioni 1-a-1 fino a quando il dashboard mostra i tuoi numeri reali.",

  speedH2:
    "Il commercialista ti dà il bilancio a 60 giorni di distanza. Per decidere serve oggi.",
  speedSubheadline:
    "Il titolare di un'impresa edile prende decisioni ogni giorno: avvio cantiere, sconti, assunzioni, pagamenti fornitori. Decidere senza dati aggiornati significa basarsi sul sentimento e sulle paure. Il Cruscotto Aziendale dà i numeri di oggi, non quelli di 60 giorni fa.",
  speedStats: [
    { value: 3, prefix: "+", suffix: "%", label: "margine extra da decisioni informate" },
    { value: 24, suffix: "/7", label: "accesso al dashboard mobile-first" },
    { value: 90, suffix: " giorni", label: "proiezione cassa visibile in real time" },
  ],

  familyH2: "Cruscotto Aziendale alimentato da tutta la piattaforma Edilizia in Cloud.",
  familySubheadline:
    "Il Cruscotto non inventa dati: aggrega ciò che produce ogni modulo della piattaforma. Cantieri dà margini live, Fatturazione dà cassa proiettata, CRM dà pipeline, HR dà costi del lavoro. Tutto in un'unica vista executive.",
  familyItems: [
    {
      icon: Gauge,
      title: "Cruscotto Aziendale",
      text: "Dashboard KPI real-time, drill-down per cantiere/cliente, mobile-first.",
      to: "/funzionalita/cruscotto-aziendale",
    },
    {
      icon: HardHat,
      title: "Gestione Cantieri",
      text: "Avanzamento e costi cantieri alimentano il KPI margine real-time.",
      to: "/funzionalita/gestione-cantieri",
    },
    {
      icon: TrendingUp,
      title: "Margini Cantiere",
      text: "Calcolo margine real-time per ogni cantiere, drill-down in dashboard.",
      to: "/funzionalita/margini-cantiere",
    },
    {
      icon: Wallet,
      title: "Cassa Cantiere",
      text: "Proiezione cassa 90 giorni alimentata da scadenze fatture e costi previsti.",
      to: "/funzionalita/cassa-cantiere",
    },
    {
      icon: Receipt,
      title: "Fatturazione Elettronica SDI",
      text: "Fatture emesse e scadenze incassi alimentano la proiezione cassa.",
      to: "/funzionalita/fatturazione-elettronica",
    },
    {
      icon: Users,
      title: "CRM Edilizia",
      text: "Pipeline preventivi e tasso conversione visibili nel dashboard executive.",
      to: "/funzionalita/crm-edilizia",
    },
  ],
  familyBonusTitle:
    "Una sola piattaforma. Una sola fonte dati. Una sola dashboard executive.",
  familyBonusText:
    "Niente report Excel costruiti a mano, niente Power BI da configurare, niente esportazioni. Tutti i dati provengono dai moduli che già usi ogni giorno: cantieri, fatturazione, CRM, HR. Il Cruscotto li aggrega in tempo reale, niente lavoro extra di reportistica.",

  painKicker: "Il problema vero",
  painH2:
    "Decidi ogni giorno con i numeri di 60 giorni fa. Risultato: decisioni sbagliate o tardive.",
  painSubheadline:
    "Il titolare di un'impresa edile italiana ha decine di decisioni al giorno: accettare uno sconto, anticipare un fornitore, avviare un cantiere senza acconto. Senza dati aggiornati decide a sentimento. Sbaglia il 30% delle volte. Margine eroso, cassa tirata, opportunità perse.",
  painPoints: [
    {
      icon: AlertTriangle,
      title: "Cassa che scopri in ritardo è già tirata",
      text: "Il commercialista ti manda lo scadenzario una volta al mese. Quando vedi che la cassa a 60 giorni è negativa, è troppo tardi per agire: hai già autorizzato anticipi fornitori, hai già accettato sconti che non potevi permetterti.",
    },
    {
      icon: TrendingDown,
      title: "Margine cantiere capito a fine lavori",
      text: "Calcoli il margine reale del cantiere a fine lavori, su Excel, settimane dopo la chiusura. Quando scopri che il cantiere ha marginato il 4% invece del 18% previsto, è troppo tardi: i prossimi cantieri ripeti gli stessi errori senza accorgertene.",
    },
    {
      icon: PieChart,
      title: "Report Excel mensili sempre vecchi",
      text: "La segreteria ti prepara un report mensile in Excel, costruito a mano da 5 fonti diverse. Lo ricevi il 15 del mese successivo, riguarda dati di 45 giorni prima. Per decisioni operative è inutile, lo guardi in fretta e dimentichi.",
    },
    {
      icon: Smartphone,
      title: "Niente vista mobile dal cantiere",
      text: "Sei in cantiere a 200 km, fornitore ti chiede uno sconto del 4%, devi decidere in 5 minuti. Senza dati a portata di mano accetti per non perdere il fornitore. Ogni anno perdi decine di migliaia di euro così.",
    },
  ],

  baKicker: "Prima e dopo Edilizia in Cloud",
  baH2:
    "Stessi dati. Stesse decisioni. Cambia il timing, cambia la qualità delle decisioni.",
  baSubheadline:
    "Il Cruscotto Aziendale non aggiunge informazioni che non hai: ti dà accesso in tempo reale a quelle che già hai sparpagliate. Decidi con i numeri di oggi, non di 60 giorni fa. Il margine recuperato è enorme.",
  baAreas: [
    {
      title: "Decisioni di cassa",
      before:
        "Scadenzario aggiornato dal commercialista una volta al mese. Decidi anticipi fornitori senza vedere il quadro completo. Cassa scoperta scoperta a posteriori, costi extra di affidamento bancario.",
      after:
        "Cassa proiettata 90 giorni in tempo reale, con scadenze fatture clienti e costi fornitori. Vedi se a 45 giorni sarai sotto soglia, agisci preventivamente con dunning automatico o rinegoziazione fornitori.",
    },
    {
      title: "Margine cantiere",
      before:
        "Margine reale capito a fine lavori, settimane dopo. Errori scoperti tardi, ripetuti su altri cantieri. Imprenditore convinto di lavorare al 18% mentre lavora al 6% reale.",
      after:
        "Margine cantiere live aggiornato a ogni costo registrato. Drill-down per cantiere: vedi subito quale sta erodendo, intervieni con rinegoziazione fornitore, rivedi sconti, riducendo le perdite.",
    },
    {
      title: "Pipeline e fatturato previsto",
      before:
        "Sai quanto fattureranno i prossimi 3 mesi guardando i contratti firmati a memoria. Niente vista pipeline preventivi, niente probabilità di conversione, niente forecast.",
      after:
        "Pipeline preventivi pesata per probabilità conversione, forecast fatturato 30/60/90 giorni. Decisioni assunzioni e investimenti basate su dati, non sul sentimento del trimestre buono.",
    },
    {
      title: "Reportistica e fonti dati",
      before:
        "Segreteria costruisce report in Excel da 5 fonti diverse. Errori di trascrizione, dati incoerenti, ricezione 15 giorni dopo. Report letto in fretta e dimenticato.",
      after:
        "Tutti i KPI in un dashboard unico, aggiornato in tempo reale, accessibile da telefono in 3 secondi. Niente errori di trascrizione, niente lavoro segreteria, dati sempre attuali.",
    },
  ],

  mechanismKicker: "Come funziona",
  mechanismH2:
    "Tre passaggi: KPI configurati, dati aggregati live, drill-down per ogni cifra.",
  mechanismSubheadline:
    "Il Cruscotto Aziendale è progettato per il titolare che ha 30 secondi per capire come va l'impresa. KPI critici in cima, dati aggiornati in tempo reale dai moduli, possibilità di drill-down su ogni numero per capire da dove arriva.",
  mechanismSteps: [
    {
      icon: Target,
      title: "KPI critici configurati durante l'onboarding",
      text: "Mappiamo i 12 KPI più importanti per la tua impresa: margine medio cantieri, cassa 90gg, fatturato MoM, pipeline pesata, DSO, costo del lavoro su fatturato. Ognuno con soglie e colori (verde/giallo/rosso).",
    },
    {
      icon: Activity,
      title: "Dati aggregati in tempo reale dai moduli",
      text: "Cantieri dà margini, Fatturazione dà cassa, CRM dà pipeline, HR dà costi. Niente data entry doppio, niente esportazioni: il dashboard è una vista live sui dati esistenti, aggiornato al secondo.",
    },
    {
      icon: Search,
      title: "Drill-down per ogni cifra",
      text: "Click su 'margine medio 12%' → vedi i 18 cantieri attivi ordinati per margine. Click sul cantiere peggiore → vedi i costi che lo stanno erodendo. Dalla vista executive ai dettagli operativi in 2 click.",
    },
  ],
  mechanismCta: "Apri il dashboard di prova",

  commercialKicker: "Perché conviene davvero",
  commercialH2:
    "Decisioni più rapide e informate = +3% margine recuperato. Su un'impresa da 5M, sono 150.000 €.",
  commercialBody:
    "Il Cruscotto Aziendale non è un report tool: è uno strumento decisionale. Le imprese che lo attivano vedono migliorare il margine medio cantieri del 2-4% nei primi 12 mesi, perché identificano e correggono prima i cantieri sotto target.",
  commercialLevers: [
    {
      icon: TrendingUp,
      title: "+3% margine medio cantieri",
      text: "Vedere il margine cantiere live (invece che a posteriori) permette di intervenire prima: rinegoziare fornitori, rivedere sconti, fermare un cantiere che sta erodendo. La media osservata è +3 punti di margine in 12 mesi.",
    },
    {
      icon: Wallet,
      title: "Cassa proiettata 90 giorni",
      text: "Vedere oggi che a 45 giorni sarai sotto soglia permette di agire: dunning automatico ai clienti morosi, rinegoziazione fornitori, anticipi bancari. Niente più sorprese, niente affidamenti d'emergenza.",
    },
    {
      icon: Smartphone,
      title: "Decisioni dal cantiere via mobile",
      text: "Il fornitore chiede sconto, sei in cantiere, apri il telefono, vedi margine cantiere e cassa. Decidi in 30 secondi con dati alla mano. Niente più 'ti faccio sapere', niente più sì da senso di colpa.",
    },
    {
      icon: Sparkles,
      title: "Posizionamento da impresa strutturata",
      text: "Quando un cliente B2B (general contractor, ente pubblico) ti chiede dati di solidità per gare, gli dai dashboard immediato: margini, cassa, fatturato pipeline. Posizionamento da impresa strutturata.",
    },
  ],

  resultsKicker: "Risultati con Edilizia in Cloud",
  resultsH2:
    "Il titolare smette di decidere a sentimento. L'impresa smette di sorprendere se stessa.",
  resultsBody:
    "Quando i dati sono aggiornati in tempo reale e accessibili dal telefono, le decisioni cambiano qualità. Le imprese che attivano il Cruscotto Aziendale vedono crescere il margine medio del 3%, ridurre la cassa scoperta del 60%, e dimezzare il tempo settimanale di reportistica della segreteria.",
  integrationPillars: [
    {
      icon: Gauge,
      title: "12 KPI critici pre-configurati",
      text: "Margine, cassa 90gg, fatturato MoM, pipeline pesata, DSO, costo lavoro/fatturato, scadenze, top cantieri/clienti. Soglie verde/giallo/rosso, alert automatici quando passi una soglia.",
    },
    {
      icon: LineChart,
      title: "Trend e confronti su periodi",
      text: "Vedi l'andamento degli ultimi 12 mesi, confronti YoY, identificazione stagionalità. Capisci se il calo di marzo è normale o anomalo, se il mese in corso è in linea con il forecast.",
    },
    {
      icon: Smartphone,
      title: "Mobile-first per il cantiere",
      text: "Dashboard ottimizzato per telefono: KPI critici visibili in 3 secondi, drill-down con tap, modalità offline per cantieri senza segnale. Decisioni dal cantiere senza tornare in ufficio.",
    },
    {
      icon: ShieldCheck,
      title: "Permessi e sicurezza",
      text: "Vista completa per il titolare, viste limitate per direttore tecnico/commerciale/amministrazione. Audit log degli accessi. Protezione dati sensibili (margini, costi, fornitori) con permessi granulari.",
    },
  ],
  resultStats: [
    { value: 3, prefix: "+", suffix: "%", label: "margine extra recuperato in 12 mesi" },
    { value: 60, prefix: "-", suffix: "%", label: "episodi di cassa scoperta" },
    { value: 50, prefix: "-", suffix: "%", label: "tempo reportistica segreteria" },
  ],
  resultsCta: "Apri il Cruscotto Aziendale",

  roiKicker: "Calcola il tuo ROI",
  roiH2:
    "Quanto vale recuperare il 3% di margine su tutti i tuoi cantieri attivi?",
  roiSubheadline:
    "Sposta i cursori sulla tua realtà: numero di cantieri attivi e fatturato medio per cantiere. La stima parte dal +3% di margine osservato sulle imprese che attivano dashboard real-time + drill-down per cantiere.",
  roi: {
    input1Label: "Cantieri attivi",
    input1Default: 12,
    input1Min: 1,
    input1Max: 50,
    input1Step: 1,
    input2Label: "Fatturato medio per cantiere (€)",
    input2Default: 80000,
    input2Min: 5000,
    input2Max: 1000000,
    input2Step: 5000,
    input2Suffix: " €",
    outputLabel: "Margine extra annuo stimato",
    computeOutput: (a, b) => Math.round(a * b * 0.03),
    computeSecondary: (a, b) => [
      { label: "Fatturato totale gestito", value: `${(a * b).toLocaleString("it-IT")} €` },
      { label: "Cantieri sotto soglia identificabili/anno", value: `${Math.round(a * 0.4)}` },
      { label: "Riduzione episodi cassa scoperta", value: "60%" },
    ],
    closingPitch:
      "Stima conservativa: 3% di margine extra recuperato su fatturato annuo gestito. Le imprese che usano Cruscotto + Margini Cantiere insieme arrivano fino al 5-6% in 12 mesi.",
  },

  salesKicker: "Impatto operativo",
  salesH2:
    "Il dashboard che fa parlare insieme cantieri, cassa, commerciale, HR.",
  salesBody:
    "Il Cruscotto Aziendale cambia 4 dimensioni operative: come decidi sui cantieri, come gestisci la cassa, come pianifichi assunzioni e investimenti, come comunichi con banche e clienti B2B.",
  salesImpact: [
    {
      title: "Cantieri sotto soglia identificati subito",
      text: "Il dashboard segnala in rosso i cantieri sotto soglia margine. Intervieni in tempo reale: rinegozi fornitori, fermi le varianti gratuite, rivedi tempistiche. Recuperi cantieri prima che chiudano in perdita.",
    },
    {
      title: "Cassa gestita preventivamente",
      text: "Vedi a 45 giorni che sarai sotto soglia. Agisci: dunning automatico, rinegoziazione fornitori, anticipi mirati. Niente più cassa scoperta a sorpresa, niente affidamenti d'emergenza costosi.",
    },
    {
      title: "Decisioni HR e investimenti basate su forecast",
      text: "Pipeline pesata + forecast fatturato 90gg ti dice se puoi assumere un capocantiere o investire in un nuovo mezzo. Niente più decisioni di pancia, ROI calcolato su dati reali.",
    },
    {
      title: "Comunicazione con banche e clienti B2B",
      text: "Banca chiede prove di solidità per affidamento? Cliente B2B chiede dati per gara? Esporti il dashboard in PDF in 30 secondi: margini, cassa, fatturato, pipeline. Posizionamento immediato.",
    },
  ],

  featureKicker: "Cosa ottieni davvero",
  featureH2:
    "Non un dashboard generico. Un cruscotto pensato per il titolare di impresa edile.",
  featureRows: [
    {
      label: "12 KPI critici pre-configurati",
      value:
        "Margine medio cantieri, cassa proiettata 90gg, fatturato MoM, pipeline pesata, DSO, costo lavoro su fatturato, top cantieri per margine, scadenze critiche.",
    },
    {
      label: "Drill-down su ogni cifra",
      value:
        "Click su qualunque KPI per vedere i dettagli operativi: cantieri sotto soglia, fatture in scadenza, lead caldi, costi anomali. Dalla vista executive ai dettagli in 2 click.",
    },
    {
      label: "Mobile-first per il cantiere",
      value:
        "App nativa iOS/Android. KPI critici in 3 secondi, drill-down con tap, modalità offline per cantieri senza segnale. Decisioni dal cantiere senza tornare in ufficio.",
    },
    {
      label: "Trend, confronti, stagionalità",
      value:
        "Andamento ultimi 12 mesi, confronti YoY, identificazione stagionalità. Il calo di marzo è normale o anomalo? Lo capisci a colpo d'occhio.",
    },
    {
      label: "Alert automatici su soglie",
      value:
        "Quando un KPI supera una soglia critica (margine sotto 8%, cassa sotto 30gg, DSO sopra 90gg) ricevi alert via email/WhatsApp. Niente più scoprire i problemi a posteriori.",
    },
    {
      label: "Permessi granulari e audit log",
      value:
        "Vista completa per titolare, viste limitate per ruoli (direttore tecnico/commerciale/amministrazione). Audit log degli accessi. Protezione dati sensibili.",
    },
    {
      label: "Esportazione PDF executive",
      value:
        "Esporti il dashboard in PDF brandizzato in 30 secondi. Per banche, clienti B2B, soci. Documento da impresa strutturata.",
    },
  ],

  scenarioKicker: "Tre casi reali sul campo",
  scenarioH2:
    "Tre situazioni in cui il Cruscotto cambia una decisione e salva margine.",
  scenarios: [
    {
      title: "Sconto al fornitore in cantiere",
      text: "Sei in cantiere, fornitore ti chiede 4% di sconto sul prossimo carico. Apri il dashboard dal telefono: margine cantiere live al 6,2%, sotto soglia. Drill-down: il problema è proprio quel fornitore, troppo caro. Risposta 'no, anzi voglio il listino aggiornato'. Margine recuperato sul cantiere: 8.000 €.",
    },
    {
      title: "Cassa scoperta a 45 giorni intercettata",
      text: "Lunedì mattina apri il dashboard: cassa proiettata a 45 giorni mostra -22.000 €. Drill-down: 3 fatture clienti scadute non ancora incassate per 38.000 € totali. Attivi dunning automatico aggressivo, 2 clienti pagano in settimana, situazione rientra senza affidamento d'emergenza.",
    },
    {
      title: "Decisione assunzione capocantiere",
      text: "Vuoi assumere un secondo capocantiere (60.000 €/anno costo azienda). Apri il dashboard: pipeline pesata 90gg = 480.000 €, fatturato MoM in crescita +18%. Decidi sì, ma con clausola di prova 6 mesi. Mese 4 i numeri confermano, conversione lead salita, decisione validata.",
    },
  ],

  testimonialQuote:
    "Prima decidevo a sentimento o aspettavo il bilancio del commercialista. Da quando ho il Cruscotto Aziendale sul telefono, ogni mattina con il caffè vedo come va l'impresa: margine cantieri, cassa, pipeline. Nei primi 8 mesi ho recuperato 4 punti di margine semplicemente intervenendo prima sui cantieri sotto soglia.",
  testimonialAuthor: "Gianluca B.",
  testimonialRole: "Bertolini Costruzioni Srl, Verona",

  faqKicker: "Domande frequenti",
  faqH2:
    "Quello che un titolare di impresa edile vuole sapere prima di adottare il Cruscotto.",
  faqs: [
    {
      q: "I dati sono davvero aggiornati in tempo reale?",
      a: "Sì. Ogni evento sui moduli (registrazione costo, fattura emessa, milestone cantiere, lead acquisito) aggiorna immediatamente i KPI nel dashboard. Niente sincronizzazioni notturne, niente import/export. Vedi i numeri di adesso.",
    },
    {
      q: "Posso personalizzare i KPI sul mio business?",
      a: "Sì. I 12 KPI di default sono ottimizzati per imprese edili italiane, ma puoi aggiungere/rimuovere/personalizzare. Soglie configurabili, alert su misura, viste personalizzate per ruolo (titolare, direttore tecnico, amministrazione).",
    },
    {
      q: "Come funziona il drill-down?",
      a: "Ogni KPI è cliccabile. Esempio: KPI 'margine medio 12%' → click → lista dei 18 cantieri attivi ordinati per margine, dal peggiore al migliore. Click sul cantiere peggiore → vedi voci di costo che lo stanno erodendo, fornitori coinvolti, possibili interventi.",
    },
    {
      q: "Il dashboard è accessibile da mobile?",
      a: "Sì, app nativa iOS e Android. Dashboard ottimizzato per telefono, KPI critici visibili in 3 secondi, drill-down con tap, modalità offline. Pensato per decisioni dal cantiere, non solo dall'ufficio.",
    },
    {
      q: "Posso dare accesso solo a parte dei dati?",
      a: "Sì, permessi granulari per ruolo. Il direttore tecnico vede cantieri ma non margini commerciali, l'amministrazione vede cassa ma non pipeline, il commerciale vede solo pipeline. Dati sensibili protetti, audit log degli accessi.",
    },
    {
      q: "Il Cruscotto è incluso nei piani Edilizia in Cloud?",
      a: "Il Cruscotto Aziendale è incluso nei piani Professional e Business. Niente costi extra. Setup in 48 ore con onboarding 1-a-1 incluso, configurazione KPI personalizzati durante l'onboarding.",
    },
  ],

  internalLinksKicker: "Esplora la piattaforma",
  internalLinksH2: "Il Cruscotto è alimentato da tutti i moduli operativi.",
  internalLinksBody:
    "Il Cruscotto Aziendale aggrega dati da Cantieri, Fatturazione, Margini, Cassa, CRM, HR. Ecco gli altri moduli che lo rendono potente.",
  internalLinks: [
    { to: "/funzionalita/gestione-cantieri", title: "Gestione Cantieri", text: "Avanzamento e costi cantieri alimentano il margine real-time." },
    { to: "/funzionalita/margini-cantiere", title: "Margini Cantiere", text: "Calcolo margine real-time e drill-down per cantiere." },
    { to: "/funzionalita/cassa-cantiere", title: "Cassa Cantiere", text: "Proiezione cassa 90 giorni alimentata da scadenze." },
    { to: "/funzionalita/fatturazione-elettronica", title: "Fatturazione Elettronica SDI", text: "Fatture e scadenze incassi nel forecast cassa." },
    { to: "/funzionalita/crm-edilizia", title: "CRM Edilizia", text: "Pipeline pesata e forecast fatturato dal CRM." },
    { to: "/funzionalita/hr-personale", title: "HR Personale", text: "Costo del lavoro su fatturato come KPI nel dashboard." },
    { to: "/funzionalita/automazioni", title: "Automazioni", text: "Alert automatici su soglie KPI critici." },
    { to: "/funzionalita/agenti-ai", title: "Agenti AI", text: "AI che interpreta i numeri e suggerisce azioni." },
    { to: "/per/imprese-edili", title: "Software per Imprese di Costruzione", text: "Tutta la piattaforma orientata alle imprese edili italiane." },
  ],

  finalCtaH2:
    "Smetti di decidere a sentimento. Inizia a decidere con i numeri di oggi, non di 60 giorni fa.",
  finalCtaBody:
    "31 giorni gratuiti per portare il Cruscotto Aziendale dentro la tua impresa edile. 12 KPI critici pre-configurati, drill-down per cantiere/cliente, mobile-first e onboarding 1-a-1 inclusi. Cancelli quando vuoi.",
  finalCtaButton: "Prova gratis 31 giorni",
  finalCtaMicrocopy: "Setup 48h · KPI real-time · Mobile-first",

  stickyCtaLabel: "Prova gratis Cruscotto Aziendale",
  stickyCtaMicrocopy: "Setup 48h · KPI real-time mobile",

  applicationSubCategory: "Construction Business Intelligence Software",

  relatedBlogSlugs: ["come-fare-preventivo-edilizia", "alternativa-excel-cantieri"],
};

export default function CruscottoAziendale() {
  return <FunzionalitaPageTemplate config={config} />;
}
