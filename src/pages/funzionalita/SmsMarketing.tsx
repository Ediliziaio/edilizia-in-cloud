import {
  AlertTriangle,
  Bell,
  Clock,
  Filter,
  HardHat,
  MessageSquare,
  Phone,
  Receipt,
  Send,
  ShieldCheck,
  Smartphone,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import FunzionalitaPageTemplate from "./_template/FunzionalitaPageTemplate";
import type { FunzionalitaPageConfig } from "./_template/types";

const config: FunzionalitaPageConfig = {
  slug: "sms-marketing",
  vertical: "SMS Marketing",
  productName: "SMS Marketing & Notifiche Edilizia in Cloud",
  audience:
    "Imprese edili, ristrutturatori e general contractor che vogliono notifiche SMS transazionali al cliente, promemoria sopralluogo, alert SAL/fattura e campagne marketing con deliverability 99% Italia",
  audienceShort: "imprese edili e ristrutturatori",

  seo: {
    title:
      "SMS Marketing e Notifiche per Edilizia",
    description:
      "SMS transazionali e marketing per imprese edili: notifiche cantiere automatiche, promemoria sopralluogo, alert SAL/fattura, campagne riattivazione.",
    keywords:
      "SMS marketing edilizia, notifiche SMS cantiere, promemoria sopralluogo edilizia, alert SAL SMS, sms transazionali edilizia, mittente personalizzato edilizia, GDPR SMS marketing, software SMS edili",
    ogImage: "https://www.ediliziaincloud.com/og/og-default.png",
  },

  heroBadge: "Funzionalità · SMS Marketing",
  heroH1Lead: "SMS che il cliente legge",
  heroH1Highlight: "in 3 secondi",
  heroH1Tail: "non in 3 giorni",
  heroSubheadline:
    "SMS transazionali e marketing per imprese edili: promemoria sopralluogo, alert SAL/fattura, notifiche cantiere automatiche, campagne riattivazione clienti. Deliverability 99% Italia, mittente personalizzato (nome impresa visibile), GDPR compliant, integrato con CRM e scadenzario. L'SMS si legge sempre, l'email no.",
  heroPrimaryCta: "Prova gratis 31 giorni",
  heroSecondaryCta: "Tutte le funzionalità",
  heroSecondaryCtaTo: "/funzionalita",

  reassurancePoints: [
    "Setup in 48 ore",
    "Deliverability 99% Italia",
    "Mittente personalizzato",
  ],
  proofPoints: [
    "SMS transazionali automatici",
    "Campagne marketing GDPR",
    "Tracking aperture e clic",
  ],

  objectiveRow: [
    ["Obiettivo", "Notifiche immediate al cliente lette nel 99% dei casi"],
    ["Momento chiave", "Sopralluogo, SAL, fattura, riattivazione cliente"],
    ["Risultato", "ROI medio 12% del fatturato attivato via SMS"],
  ],

  betaH2:
    "Più di 300 imprese italiane usano SMS Marketing per notifiche cantiere e campagne riattivazione clienti.",
  betaBody:
    "L'SMS Marketing lo attiviamo in 48 ore: configuriamo il mittente personalizzato (nome impresa che appare sul telefono cliente), importiamo l'anagrafica clienti con consensi GDPR, configuriamo template transazionali (sopralluogo, SAL, fattura) e ti accompagniamo in 4 sessioni 1-a-1 fino al primo invio.",

  speedH2:
    "L'SMS si legge nel 99% dei casi entro 3 minuti. L'email nel 25% dei casi entro 24 ore. Differenza enorme.",
  speedSubheadline:
    "Per le notifiche urgenti dell'impresa edile (sopralluogo confermato, SAL pronto da firmare, fattura emessa, ritardo cantiere), l'email è troppo lenta e WhatsApp non è sempre disponibile. L'SMS è il canale residuo più affidabile per messaggi che devono essere letti.",
  speedStats: [
    { value: 99, suffix: "%", label: "deliverability su numeri italiani" },
    { value: 3, suffix: " min", label: "tempo medio di lettura SMS" },
    { value: 12, prefix: "+", suffix: "%", label: "fatturato medio attivato via SMS marketing" },
  ],

  familyH2: "L'SMS Marketing collegato a CRM, scadenzario e gestione cantieri.",
  familySubheadline:
    "Ogni evento del gestionale può attivare un SMS automatico: sopralluogo confermato, SAL pronto, fattura emessa, scadenza pagamento, ritardo cantiere, anniversario cliente. Notifiche puntuali senza data entry.",
  familyItems: [
    {
      icon: Users,
      title: "CRM Edilizia",
      text: "Anagrafica clienti con consensi GDPR e segmentazione per campagne SMS.",
      to: "/funzionalita/crm-edilizia",
    },
    {
      icon: HardHat,
      title: "Gestione Cantieri",
      text: "SMS automatici al cliente per milestone cantiere (inizio, 50%, 100%).",
      to: "/funzionalita/gestione-cantieri",
    },
    {
      icon: Clock,
      title: "Scadenzario",
      text: "SMS sollecito pagamento integrato nelle sequenze multi-canale.",
      to: "/funzionalita/scadenzario",
    },
    {
      icon: MessageSquare,
      title: "WhatsApp Marketing",
      text: "Strategia multi-canale: WhatsApp + SMS per massimizzare deliverability.",
      to: "/funzionalita/whatsapp-marketing",
    },
    {
      icon: Receipt,
      title: "Fatturazione Elettronica SDI",
      text: "SMS automatico al cliente con link fattura e stato pagamento.",
      to: "/funzionalita/fatturazione-elettronica",
    },
    {
      icon: Zap,
      title: "Automazioni",
      text: "Trigger automatici per inviare SMS basati su eventi cantiere o cliente.",
      to: "/funzionalita/automazioni",
    },
  ],
  familyBonusTitle: "Una sola anagrafica clienti. Una sola gestione consensi. Notifiche multi-canale coordinate.",
  familyBonusText:
    "Quando devi notificare il cliente di un sopralluogo confermato, il sistema verifica i consensi GDPR, sceglie il canale ottimale (WhatsApp se ha il consenso e l'app, SMS altrimenti), invia il messaggio personalizzato con link/conferma. Tu non scegli il canale, il sistema sa.",

  painKicker: "Il problema vero",
  painH2:
    "Email che non vengono lette. WhatsApp che il cliente non vede subito. Sopralluoghi mancati per dimenticanze.",
  painSubheadline:
    "Le imprese edili oggi comunicano con i clienti via email (lette nel 25% dei casi), WhatsApp (richiede app e consenso commerciale), telefonate (rispondono nel 30% dei casi). Risultato: notifiche urgenti che non arrivano, sopralluoghi mancati, SAL non firmati in tempo.",
  painPoints: [
    {
      icon: AlertTriangle,
      title: "Email che non vengono lette",
      text: "Notifica email 'sopralluogo domani alle 15' finisce in promozioni o spam. Cliente non la vede, non si presenta, capocantiere aspetta 1 ora invano. Tempo perso, irritazione reciproca.",
    },
    {
      icon: Clock,
      title: "WhatsApp dipende dal consenso commerciale",
      text: "WhatsApp Business richiede consenso commerciale specifico nel contratto. Per clienti vecchi senza consenso non puoi inviare promo né notifiche commerciali. Canale limitato.",
    },
    {
      icon: Phone,
      title: "Telefonate che nessuno risponde",
      text: "Numero sconosciuto dal centralino impresa: cliente non risponde nel 70% dei casi. Devi richiamare, lasciare segreteria, sperare che richiami. Tempo bruciato.",
    },
    {
      icon: Filter,
      title: "Notifiche manuali a cliente per cliente",
      text: "Segretaria invia manualmente conferme sopralluogo, alert SAL, ricordi pagamento. Su 50 clienti attivi, 100+ notifiche al mese. Lavoro a basso valore, errori frequenti.",
    },
  ],

  baKicker: "Prima e dopo Edilizia in Cloud",
  baH2: "Stessi clienti, stessi messaggi, stesso contenuto. Cambia il tasso di lettura e l'efficacia.",
  baSubheadline:
    "L'SMS Marketing non sostituisce email o WhatsApp: integra una strategia multi-canale dove ogni messaggio arriva sul canale che il cliente legge. Per le notifiche urgenti, l'SMS è il canale residuo più affidabile.",
  baAreas: [
    {
      title: "Conferma sopralluogo cliente",
      before:
        "Email di conferma 24h prima, lettura 25% entro l'ora. Cliente non vede, non si presenta. Capocantiere arriva, aspetta 1 ora, telefonate, sopralluogo riprogrammato.",
      after:
        "SMS automatico 24h prima + 2h prima del sopralluogo: 'Mario, oggi alle 15:00 sopralluogo cantiere Via Roma. Risponde SI per confermare'. Conferma cliente 95%, sopralluogo confermato.",
    },
    {
      title: "Notifica SAL pronto da firmare",
      before:
        "Email a cliente 'SAL del 12 marzo da firmare', lettura 25% entro 3 giorni. Pagamenti fornitori in ritardo perché SAL non firmato.",
      after:
        "SMS automatico al cliente con link diretto firma elettronica: 'SAL Cantiere X disponibile, firma in 30 secondi'. Firma media in 4 ore, pagamenti fornitori puntuali.",
    },
    {
      title: "Sollecito pagamento gentile",
      before:
        "Email sollecito a +3 giorni dalla scadenza, vista 25% in 24h. Cliente paga al +30 perché 'non avevo visto'. DSO alto, liquidità in affanno.",
      after:
        "Sequenza multi-canale: email -3 gg, WhatsApp se consensi ok, SMS al +1 'gentile reminder fattura X scaduta'. Cliente paga al +5 nel 70% dei casi.",
    },
    {
      title: "Campagna riattivazione clienti dormienti",
      before:
        "Email DEM a 500 clienti vecchi: aperture 5%, click 0,5%, nessuna risposta. Database morto, fatturato non riattivato.",
      after:
        "Campagna SMS a 500 clienti consenzienti: '6 mesi senza vederci, sopralluogo gratis fino al 30/4'. Risposte 4-6%, fatturato riattivato 12% medio.",
    },
  ],

  mechanismKicker: "Come funziona",
  mechanismH2: "Tre passaggi per portare l'SMS dentro la tua comunicazione cliente.",
  mechanismSubheadline:
    "L'SMS Marketing funziona come un livello aggiuntivo della comunicazione: si attiva automaticamente per eventi specifici, integrato con email e WhatsApp per multi-canale coordinato. Niente formazione utente, niente complessità.",
  mechanismSteps: [
    {
      icon: Smartphone,
      title: "Mittente personalizzato impresa",
      text: "Configuriamo il mittente SMS con il nome della tua impresa (es. 'EdilRomano'). Il cliente vede subito che è un messaggio della tua azienda, non un numero sconosciuto. Apre con fiducia.",
    },
    {
      icon: Bell,
      title: "Trigger automatici da eventi",
      text: "Configuri trigger: sopralluogo confermato → SMS al cliente. SAL emesso → SMS con link firma. Fattura inviata → SMS conferma. Pagamento ricevuto → SMS ringraziamento. Niente azione manuale.",
    },
    {
      icon: Send,
      title: "Campagne marketing segmentate",
      text: "Per clienti dormienti (>6 mesi): campagne SMS riattivazione segmentate per ticket medio, area geografica, tipologia lavori. Tracking aperture, click, conversioni cliente per cliente.",
    },
  ],
  mechanismCta: "Apri la demo SMS Marketing",

  commercialKicker: "Perché conviene davvero",
  commercialH2: "Deliverability 99%. Lettura 99%. ROI medio 12% del fatturato attivato.",
  commercialBody:
    "L'SMS Marketing non sostituisce email o WhatsApp: integra una strategia multi-canale dove l'SMS è il canale residuo più affidabile per notifiche urgenti. Le imprese edili che lo attivano vedono campagne riattivazione clienti generare 12% di fatturato medio sull'audience contattata.",
  commercialLevers: [
    {
      icon: TrendingUp,
      title: "Fatturato riattivato con SMS",
      text: "Campagne segmentate a clienti dormienti: ROI medio 12% sull'audience contattata. Per impresa con 500 clienti contattabili = 60-100k di fatturato riattivato l'anno.",
    },
    {
      icon: ShieldCheck,
      title: "Deliverability 99% Italia",
      text: "SMS classe A operatori italiani, mittente personalizzato registrato. Niente spam folder, niente bounce. Il messaggio arriva e viene letto in 3 minuti medi.",
    },
    {
      icon: Sparkles,
      title: "Sopralluoghi confermati al 95%",
      text: "Promemoria SMS 24h e 2h prima del sopralluogo: tasso di conferma cliente passa dal 60% (email) al 95% (SMS). Capocantiere non aspetta più invano.",
    },
    {
      icon: Wallet,
      title: "DSO ridotto con sollecito SMS",
      text: "Sequenza sollecito multi-canale con SMS al +1: cliente paga al +5 nel 70% dei casi. DSO medio ridotto di 15 giorni, liquidità che torna disponibile prima.",
    },
  ],

  resultsKicker: "Risultati con Edilizia in Cloud",
  resultsH2: "L'SMS smette di essere il canale dimenticato. Diventa il canale che converte di più.",
  resultsBody:
    "Quando l'SMS è integrato con CRM, cantieri e scadenzario, smette di essere strumento marketing isolato e diventa parte di un sistema di comunicazione multi-canale. Le imprese che attivano SMS Marketing vedono cambiare 4 dimensioni operative concrete.",
  integrationPillars: [
    {
      icon: Smartphone,
      title: "Mittente personalizzato impresa",
      text: "Nome impresa visibile sul telefono cliente. Riconoscibilità immediata, apertura con fiducia, brand awareness rinforzata ad ogni messaggio.",
    },
    {
      icon: Bell,
      title: "Trigger transazionali automatici",
      text: "Sopralluogo, SAL, fattura, pagamento, milestone cantiere. Eventi del gestionale generano SMS automatici al cliente, niente data entry segreteria.",
    },
    {
      icon: Send,
      title: "Campagne marketing segmentate",
      text: "Audience segmentata per ticket, area, tipologia lavori, ultimo contatto. Campagne A/B test, tracking aperture, click, conversioni. ROI misurabile.",
    },
    {
      icon: ShieldCheck,
      title: "GDPR compliant by design",
      text: "Gestione consensi cliente per cliente, opt-out automatico in ogni messaggio, log invii completo, audit trail. Conformità GDPR garantita.",
    },
  ],
  resultStats: [
    { value: 99, suffix: "%", label: "deliverability su numeri italiani" },
    { value: 12, prefix: "+", suffix: "%", label: "fatturato medio attivato da campagne SMS" },
    { value: 95, suffix: "%", label: "tasso conferma sopralluoghi via SMS" },
  ],
  resultsCta: "Apri la demo SMS Marketing",

  roiKicker: "Calcola il tuo ROI",
  roiH2: "Quanto vale riattivare il 3% di clienti dormienti via SMS?",
  roiSubheadline:
    "Sposta i cursori sulla tua realtà: numero di contatti SMS in audience e ticket medio per cliente edilizia. La stima parte dal 3% di tasso di conversione e 12% di ROI medio osservato sui clienti riattivati.",
  roi: {
    input1Label: "Contatti SMS audience",
    input1Default: 800,
    input1Min: 100,
    input1Max: 10000,
    input1Step: 50,
    input2Label: "Ticket medio cliente (€)",
    input2Default: 5500,
    input2Min: 500,
    input2Max: 50000,
    input2Step: 100,
    input2Suffix: " €",
    outputLabel: "Fatturato riattivato annuo stimato",
    computeOutput: (a, b) => Math.round(a * 0.03 * b * 0.12),
    computeSecondary: (a, b) => [
      { label: "Clienti riattivati stimati", value: `${Math.round(a * 0.03)}` },
      { label: "Tasso conversione SMS", value: "3%" },
      { label: "Deliverability garantita", value: "99% Italia" },
    ],
    closingPitch:
      "Stima prudenziale basata sul 3% di tasso conversione e 12% ROI medio sulle campagne riattivazione (audience clienti dormienti). Aggiungi il valore delle notifiche transazionali (sopralluoghi confermati, SAL firmati in tempo, DSO ridotto).",
  },

  salesKicker: "Impatto operativo",
  salesH2: "Non solo marketing. Un canale di comunicazione che lavora 24/7.",
  salesBody:
    "L'SMS Marketing Edilizia in Cloud non è solo strumento per campagne: è canale di comunicazione operativa con il cliente. Le imprese che lo attivano vedono cambiare 4 dimensioni operative concrete.",
  salesImpact: [
    {
      title: "Sopralluoghi confermati al 95%",
      text: "Capocantiere non aspetta più invano: SMS 24h e 2h prima del sopralluogo, conferma cliente del 95%. Tempo capocantiere recuperato, organizzazione cantieri migliorata.",
    },
    {
      title: "SAL firmati in tempo per fornitori",
      text: "SMS al cliente con link firma SAL. Tempo medio firma da 5 giorni (email) a 4 ore (SMS). Pagamenti fornitori puntuali, niente più ritardi a cascata.",
    },
    {
      title: "DSO ridotto con solleciti SMS",
      text: "Sequenza multi-canale con SMS al +1: cliente paga al +5 nel 70% dei casi. DSO medio ridotto di 15 giorni, liquidità che torna disponibile prima.",
    },
    {
      title: "Database clienti riattivato",
      text: "Campagne SMS a clienti dormienti generano 12% di fatturato medio sull'audience contattata. Database vecchio diventa fonte di nuovi cantieri.",
    },
  ],

  featureKicker: "Cosa ottieni davvero",
  featureH2: "Non promesse generiche. Un elenco concreto di cosa attiviamo in 48 ore.",
  featureRows: [
    {
      label: "Mittente personalizzato registrato",
      value:
        "Configurazione nome impresa come mittente SMS (max 11 caratteri). Cliente vede subito chi scrive, apertura con fiducia. Registrazione operatori italiani inclusa.",
    },
    {
      label: "Deliverability 99% Italia",
      value:
        "SMS classe A operatori italiani (TIM, Vodafone, WindTre, Iliad). Niente spam folder, niente bounce, conferma di consegna per ogni messaggio.",
    },
    {
      label: "Trigger transazionali automatici",
      value:
        "Sopralluogo confermato, SAL emesso, fattura inviata, pagamento ricevuto, milestone cantiere. Eventi del gestionale generano SMS al cliente automaticamente.",
    },
    {
      label: "Campagne marketing segmentate",
      value:
        "Audience segmentata per ticket medio, area geografica, tipologia lavori, ultimo contatto. A/B test integrato, tracking aperture/click, ROI misurabile.",
    },
    {
      label: "Personalizzazione dinamica",
      value:
        "Variabili dinamiche nel messaggio: nome cliente, cantiere, importo, link diretto firma/pagamento/conferma. Ogni SMS sembra scritto su misura.",
    },
    {
      label: "GDPR compliant by design",
      value:
        "Gestione consensi cliente per cliente, opt-out automatico (parola STOP) in ogni messaggio, log invii completo, audit trail per controlli Garante Privacy.",
    },
    {
      label: "Tracking aperture, click, conversioni",
      value:
        "Per ogni campagna: tassi consegna, lettura, click su link, conversioni (firma SAL, pagamento, prenotazione sopralluogo). Dashboard analytics completa.",
    },
  ],

  scenarioKicker: "Tre casi reali sul campo",
  scenarioH2: "Tre situazioni in cui SMS Marketing cambia la giornata.",
  scenarios: [
    {
      title: "Sopralluogo confermato al 95%",
      text: "Hai 8 sopralluoghi domani. Sistema invia SMS a tutti i clienti 24h e 2h prima: 'Sig. Rossi, oggi alle 15:00 sopralluogo cantiere Via Roma. Risponde SI per confermare'. 7 confermano, 1 chiede di spostare. Capocantiere parte sicuro, niente attese inutili.",
    },
    {
      title: "SAL del venerdì firmato per pagare lunedì",
      text: "Venerdì 14:00 emetti SAL da 28k al cliente. Sistema invia SMS con link firma elettronica diretta. Cliente firma alle 17:30. Lunedì mattina paghi i fornitori puntualmente, niente ritardi a cascata.",
    },
    {
      title: "Campagna riattivazione clienti dormienti",
      text: "Hai 600 clienti senza contatto da >6 mesi. Lanci campagna SMS: 'Sig. Bianchi, è da un po' che non ci sentiamo. Sopralluogo gratis se prenota entro il 30 aprile'. Risposte 24, conversioni 18, fatturato attivato 92.000€.",
    },
  ],

  testimonialQuote:
    "Avevo perso 3 sopralluoghi in 2 settimane perché i clienti non avevano visto l'email. Ho attivato SMS Marketing: dal mese successivo, sopralluoghi confermati al 95%, capocantiere mai più ad aspettare invano. Ho fatto anche una campagna riattivazione su 450 clienti dormienti: 14 nuovi cantieri firmati in 3 mesi, 76.000€ di fatturato che era congelato.",
  testimonialAuthor: "Roberto D.",
  testimonialRole: "Costruzioni De Luca Srl, Palermo",

  faqKicker: "Domande frequenti",
  faqH2: "Quello che un titolare di impresa edile vuole sapere prima di decidere.",
  faqs: [
    {
      q: "L'SMS Marketing è ancora efficace o è obsoleto?",
      a: "Per il settore edile è più efficace che mai. I tassi di lettura SMS sono al 99% in 3 minuti, contro email al 25% in 24h e WhatsApp limitato dai consensi commerciali. Per notifiche urgenti (sopralluogo, SAL, scadenza), l'SMS è il canale residuo più affidabile.",
    },
    {
      q: "Quanto costa un SMS? È sostenibile per campagne grandi?",
      a: "Costo medio 0,038-0,055€ per SMS classe A Italia (mittente personalizzato registrato). Per impresa media con 500-1000 SMS/mese: 20-55€/mese, ROI tipico 12% su campagne riattivazione = 60-100x sull'investimento. SMS transazionali integrati hanno costo ammortizzato.",
    },
    {
      q: "GDPR: posso inviare SMS a clienti vecchi senza consenso esplicito?",
      a: "SMS transazionali (conferma sopralluogo, SAL emesso, fattura inviata) sono comunicazioni di servizio: legittimi senza consenso commerciale specifico. SMS marketing (campagne riattivazione, promo) richiedono consenso esplicito tracciato. Sistema gestisce automaticamente la differenza.",
    },
    {
      q: "Il mittente personalizzato funziona davvero per tutti gli operatori?",
      a: "Sì per TIM, Vodafone, WindTre, Iliad e MVNO italiani. Registrazione mittente alfanumerico (max 11 caratteri, es. 'EdilRomano') inclusa nel servizio. Per Iliad fallback automatico a numero short code se mittente alfanumerico non supportato.",
    },
    {
      q: "Posso integrare SMS Marketing con il mio CRM esistente?",
      a: "Sì se è il CRM Edilizia in Cloud (consigliato). Per CRM esterni, API REST disponibili nel piano Business per integrazione bidirezionale (anagrafica clienti, consensi, eventi trigger). Sistema gestisce sync automatico.",
    },
    {
      q: "Quanto costa il modulo? Ci sono limiti?",
      a: "SMS Marketing è incluso nei piani Professional e Business di Edilizia in Cloud. Setup mittente personalizzato e onboarding inclusi. SMS a consumo trasparente (0,038-0,055€/SMS) senza minimi mensili o vincoli. Cancelli quando vuoi.",
    },
  ],

  internalLinksKicker: "Esplora la piattaforma",
  internalLinksH2: "L'SMS Marketing è il canale residuo che chiude le notifiche cliente.",
  internalLinksBody:
    "SMS, email e WhatsApp coordinati per ogni evento cliente: sopralluoghi, SAL, fatture, riattivazioni. Una sola gestione consensi, una sola dashboard.",
  internalLinks: [
    { to: "/funzionalita/crm-edilizia", title: "CRM Edilizia", text: "Anagrafica clienti con consensi GDPR per campagne SMS." },
    { to: "/funzionalita/whatsapp-marketing", title: "WhatsApp Marketing", text: "Strategia multi-canale: WhatsApp + SMS coordinati." },
    { to: "/funzionalita/email-marketing", title: "Email Marketing", text: "Email per contenuti lunghi, SMS per notifiche urgenti." },
    { to: "/funzionalita/automazioni", title: "Automazioni", text: "Trigger automatici per inviare SMS basati su eventi." },
    { to: "/funzionalita/scadenzario", title: "Scadenzario", text: "SMS sollecito pagamento integrato nelle sequenze multi-canale." },
    { to: "/funzionalita/gestione-cantieri", title: "Gestione Cantieri", text: "SMS automatici al cliente per milestone cantiere." },
    { to: "/funzionalita/portale-clienti", title: "Portale Clienti", text: "Notifiche SMS link diretto al portale clienti." },
    { to: "/per/imprese-costruzione", title: "Software per Imprese di Costruzione", text: "Tutta la piattaforma orientata alle imprese edili italiane." },
    { to: "/prezzi", title: "Prezzi e Piani", text: "SMS Marketing incluso nei piani Professional e Business." },
  ],

  finalCtaH2: "Smetti di mandare email che nessuno legge. Inizia a far arrivare i messaggi.",
  finalCtaBody:
    "31 giorni gratuiti per portare l'SMS Marketing dentro la tua impresa edile. Setup in 48 ore, mittente personalizzato registrato, trigger transazionali e campagne marketing segmentate inclusi. Onboarding 1-a-1, cancelli quando vuoi.",
  finalCtaButton: "Prova gratis 31 giorni",
  finalCtaMicrocopy: "Setup in 48 ore · Mittente personalizzato · Cancelli quando vuoi",

  stickyCtaLabel: "Prova gratis SMS Marketing",
  stickyCtaMicrocopy: "Setup 48h · Deliverability 99% Italia",

  applicationSubCategory: "Construction SMS Marketing Software",

  relatedBlogSlugs: ["come-fare-preventivo-edilizia", "alternativa-excel-cantieri"],
};

export default function SmsMarketing() {
  return <FunzionalitaPageTemplate config={config} />;
}
