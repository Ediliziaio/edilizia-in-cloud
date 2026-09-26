import {
  AlertTriangle,
  Bell,
  Calendar,
  ClipboardList,
  Euro,
  FileText,
  Layers,
  Phone,
  Receipt,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Sun,
  TrendingUp,
  Wrench,
} from "lucide-react";
import FunzionalitaPageTemplate from "./_template/FunzionalitaPageTemplate";
import type { FunzionalitaPageConfig } from "./_template/types";

const config: FunzionalitaPageConfig = {
  slug: "manutenzione-impianti",
  definizione:
    "Manutenzione Impianti di Edilizia in Cloud è il gestionale per imprese di manutenzione di impianti idraulici, elettrici, di climatizzazione, fotovoltaici e antincendio: parco impianti georeferenziato, scadenzario automatico secondo il DPR 74/2013, libretti d'impianto e interventi programmati o a chiamata.",
  vertical: "Manutenzione Impianti",
  productName: "Modulo Manutenzione Impianti Edilizia in Cloud",
  audience:
    "Imprese di manutenzione impianti idraulici, elettrici, climatizzazione, fotovoltaici, antincendio e facility management che gestiscono manutenzione programmata e correttiva con scadenze normative DPR 74/2013, libretti di impianto e tecnici in mobilità",
  audienceShort: "imprese manutenzione e facility",

  seo: {
    title:
      "Software Manutenzione Impianti",
    description:
      "Manutenzione programmata e correttiva di impianti idraulici, elettrici, clima e fotovoltaico, con libretti d'impianto digitali e scadenze DPR 74/2013.",
    keywords:
      "software manutenzione impianti, gestionale manutenzione termoidraulica, app tecnici manutenzione, software DPR 74/2013, libretto impianto digitale, manutenzione programmata software, gestione climatizzazione, manutenzione caldaie software, facility management software, gestionale impiantisti",
    ogImage: "https://www.ediliziaincloud.com/og/og-default.png",
  },

  heroBadge: "Funzionalità · Manutenzione Impianti",
  heroH1Lead: "Manutenzione programmata e correttiva",
  heroH1Highlight: "senza dimenticare scadenze",
  heroH1Tail: "DPR 74/2013",
  heroSubheadline:
    "Una piattaforma per imprese di manutenzione impianti idraulici, elettrici, climatizzazione, fotovoltaici e antincendio: parco impianti georeferenziato, scadenzario automatico DPR 74/2013, libretti di impianto digitali, app tecnico in mobilità con firma cliente, contratti di manutenzione ricorrenti e fatturazione automatica.",
  heroPrimaryCta: "Prova gratis 31 giorni",
  heroSecondaryCta: "Tutte le funzionalità",
  heroSecondaryCtaTo: "/funzionalita",

  reassurancePoints: [
    "Setup in 48 ore con import parco impianti",
    "Scadenze DPR 74/2013 precaricate",
    "App tecnico iOS/Android offline-first",
  ],
  proofPoints: [
    "Libretti di impianto digitali conformi",
    "Notifiche automatiche scadenze normative",
    "Firma cliente in mobilità su intervento",
  ],

  objectiveRow: [
    ["Obiettivo", "Zero scadenze normative perse e tecnici in mobilità produttivi"],
    ["Momento chiave", "Pianificazione, intervento, libretto, fatturazione contratto"],
    ["Risultato", "Più impianti gestiti, contratti rinnovati, multe DPR azzerate"],
  ],

  betaH2:
    "Più di 240 imprese di manutenzione in Italia gestiscono il loro parco impianti con Edilizia in Cloud.",
  betaBody:
    "Attiviamo il modulo Manutenzione in 48 ore: importiamo il tuo parco impianti (climatizzazione, idraulici, elettrici, FV, antincendio), configuriamo le scadenze DPR 74/2013, i template libretto di impianto, i contratti di manutenzione ricorrenti e l'app tecnico in mobilità. 4 sessioni 1-a-1 fino al primo intervento chiuso end-to-end con firma cliente.",

  speedH2:
    "Ogni intervento di manutenzione perso o ritardato è un libretto incompleto, una multa potenziale, un contratto a rischio rinnovo.",
  speedSubheadline:
    "L'impresa di manutenzione media segue 200-1.500 impianti tra utenze residenziali, condomìni, aziende. Senza un sistema unico, le scadenze (controllo fumi, RAEE, FGAS, DPR 74/2013, manutenzione ordinaria) si perdono in agende cartacee. Edilizia in Cloud trasforma ogni intervento in un dato strutturato e ogni scadenza in una notifica automatica.",
  speedStats: [
    { value: 30, suffix: " min", label: "tempo medio risparmiato per intervento" },
    { value: 100, suffix: "%", label: "scadenze DPR 74/2013 tracciate" },
    { value: 4, prefix: "+", suffix: "", label: "interventi/giorno per tecnico in più" },
  ],

  familyH2: "Manutenzione vive collegata a contratti, fatture, magazzino e clienti.",
  familySubheadline:
    "Un intervento di manutenzione non è solo un foglio di carta firmato dal cliente: è un libretto da aggiornare, un contratto da fatturare, un ricambio da scaricare dal magazzino, una scadenza successiva da pianificare. Edilizia in Cloud collega tutto in un unico flusso senza data entry duplicato.",
  familyItems: [
    {
      icon: Wrench,
      title: "Manutenzione Impianti",
      text: "Programmata, correttiva, libretti digitali, scadenze DPR 74/2013, app tecnico mobile.",
      to: "/funzionalita/manutenzione-impianti",
    },
    {
      icon: Smartphone,
      title: "App Cantiere Mobile",
      text: "App iOS/Android per tecnici in mobilità con firma cliente e foto intervento.",
      to: "/funzionalita/app-cantiere-mobile",
    },
    {
      icon: Calendar,
      title: "Scadenzario",
      text: "Scadenze normative DPR 74/2013, FGAS, antincendio, contratti manutenzione.",
      to: "/funzionalita/scadenzario",
    },
    {
      icon: Receipt,
      title: "Fatturazione Elettronica SDI",
      text: "Fatturazione automatica contratti manutenzione ricorrenti, canoni periodici.",
      to: "/funzionalita/fatturazione-elettronica",
    },
    {
      icon: Layers,
      title: "Magazzino Cantiere",
      text: "Scarico ricambi su intervento, riordino automatico, valorizzazione magazzino.",
      to: "/funzionalita/magazzino-cantiere",
    },
    {
      icon: Sun,
      title: "Cantieri Fotovoltaico",
      text: "Manutenzione decennale impianti FV con monitoraggio produzione integrato.",
      to: "/funzionalita/fotovoltaico",
    },
  ],
  familyBonusTitle: "Una piattaforma. Dal contratto annuale al libretto firmato.",
  familyBonusText:
    "Quando un cliente firma un contratto di manutenzione, il sistema crea automaticamente le scadenze annuali, pianifica gli interventi, fattura i canoni periodici via SDI. Quando il tecnico chiude l'intervento da app, il libretto si aggiorna, il magazzino scarica il ricambio, il cliente firma e riceve PDF. Zero passaggi manuali.",

  painKicker: "Il problema vero",
  painH2:
    "Agenda cartacea del titolare, file Excel del tecnico, cartella ricambi del magazziniere. Tre verità diverse, una sola realtà persa.",
  painSubheadline:
    "Le imprese di manutenzione lavorano oggi con 3 sistemi paralleli: l'agenda del titolare per gli appuntamenti, l'Excel del tecnico per gli interventi, la cartella del magazzino per i ricambi. Nessuno parla con gli altri. Risultato: interventi non fatturati, scadenze normative perse, ricambi smarriti.",
  painPoints: [
    {
      icon: AlertTriangle,
      title: "Scadenza DPR 74/2013 dimenticata = sanzione cliente",
      text: "Controllo fumi caldaia ogni 1-2-4 anni a seconda della potenza. Se il cliente riceve sanzione perché tu hai dimenticato l'intervento, contestazione legale e contratto perso. Su 800 impianti gestiti, basta 1% di scadenze perse per generare disastri.",
    },
    {
      icon: FileText,
      title: "Libretto impianto compilato (male) a posteriori",
      text: "Tecnico chiude intervento, scrive su carta, torna in ufficio, segretaria trascrive su libretto cartaceo. 70% dei libretti incompleti, 30% con errori di trascrizione. Cliente che chiede storico interventi: 2 giorni di ricerca tra archivi.",
    },
    {
      icon: Phone,
      title: "Tecnico chiama l'ufficio 5 volte al giorno",
      text: "'Quale è il prossimo cliente?', 'Che ricambio serve?', 'Il cliente ha pagato?', 'Posso fare lo sconto?'. Tecnico fermo in macchina al telefono. Ufficio bloccato a rispondere. Ore produttive volatilizzate ogni giorno.",
    },
    {
      icon: Euro,
      title: "Contratti manutenzione non fatturati per dimenticanza",
      text: "Contratto annuale 600€, fatturazione semestrale 300€. Senza scadenzario automatico la fattura del 2° semestre non parte: il cliente non sollecita, l'impresa scopre a fine anno. Su 200 contratti perdere il 5% = 6.000€ all'anno.",
    },
  ],

  baKicker: "Prima e dopo Edilizia in Cloud",
  baH2: "Stessi tecnici, stessi impianti, stessa zona. Cambia il numero di interventi chiusi e la qualità del libretto.",
  baSubheadline:
    "Edilizia in Cloud non sostituisce il tecnico: gli toglie il peso della carta. Risultato: 4 interventi/giorno in più per tecnico, libretti completi al 100%, zero scadenze normative perse, contratti fatturati al millimetro.",
  baAreas: [
    {
      title: "Pianificazione interventi giornalieri",
      before:
        "Titolare pianifica la sera prima su agenda cartacea, manda WhatsApp ai tecnici, ogni mattina 30 minuti di telefonate per riordinare. Tecnici partono incerti, tornano in ufficio per chiarimenti.",
      after:
        "Calendario condiviso ottimizzato per zona geografica e priorità scadenze. Tecnico apre app, vede 6-8 interventi del giorno con indirizzo, contatto, ricambi necessari, storico cliente. Parte e va.",
    },
    {
      title: "Compilazione libretto di impianto",
      before:
        "Tecnico scrive su libretto cartaceo, fotografa, torna in ufficio, segretaria trascrive sul gestionale. 15 minuti per intervento + errori di trascrizione + libretti incompleti.",
      after:
        "Tecnico compila libretto digitale da app durante l'intervento, firma cliente sul telefono, PDF generato e inviato via email/SMS. Libretto archiviato su cloud, conforme DPR 74/2013.",
    },
    {
      title: "Scadenze normative DPR 74/2013",
      before:
        "Scadenze tracciate su Excel. Segreteria controlla a mano ogni mese quali interventi attivare. Buchi inevitabili: clienti che ricevono sanzione, contestazioni, contratti persi.",
      after:
        "Scadenze precaricate per ogni impianto in base a potenza/tipo. Notifica automatica 60-30-15 giorni prima al titolare e tecnico. Pianificazione automatica nel calendario. Zero scadenze perse.",
    },
    {
      title: "Fatturazione contratti ricorrenti",
      before:
        "Contratti annuali fatturati a memoria. Alcuni dimenticati, altri fatturati 2 volte. Recupero crediti caotico. A fine anno scopri di aver perso 3-7% di canoni.",
      after:
        "Contratti annuali con fatturazione automatica via SDI alle scadenze configurate (mensile, trimestrale, semestrale). Canoni emessi al millisecondo. Recupero crediti sotto controllo.",
    },
  ],

  mechanismKicker: "Come funziona",
  mechanismH2: "Tre passaggi dal contratto annuale al libretto firmato.",
  mechanismSubheadline:
    "Il modulo Manutenzione è progettato per imprese che gestiscono 100-2.000 impianti: pianificazione automatica, app tecnico offline-first, libretti conformi DPR 74/2013, fatturazione contratti ricorrenti. Tutto integrato senza data entry duplicato.",
  mechanismSteps: [
    {
      icon: ClipboardList,
      title: "Anagrafica impianto + contratto + scadenze",
      text: "Per ogni cliente registri impianti (caldaia, climatizzatore, FV, antincendio) con dati tecnici, potenza, fluido, gas refrigerante. Il sistema genera scadenze DPR 74/2013, FGAS, controllo fumi automaticamente.",
    },
    {
      icon: Smartphone,
      title: "Tecnico riceve interventi e chiude da app",
      text: "Calendario quotidiano sul telefono del tecnico: indirizzi, ricambi, storico cliente. Compila libretto digitale durante l'intervento, scarica ricambio dal magazzino, fa firmare cliente, foto allegate.",
    },
    {
      icon: Bell,
      title: "Sistema fattura, archivia, pianifica successivo",
      text: "Intervento chiuso → contratto fatturato via SDI o intervento extra contratto generato. Libretto archiviato cloud, prossima scadenza pianificata automaticamente, notifica cliente con PDF e ringraziamento.",
    },
  ],
  mechanismCta: "Apri la dashboard Manutenzione",

  commercialKicker: "Perché conviene davvero",
  commercialH2: "Più interventi chiusi, contratti rinnovati al 95%, multe DPR azzerate.",
  commercialBody:
    "Le imprese di manutenzione che usano Edilizia in Cloud chiudono in media 4 interventi/giorno in più per tecnico, rinnovano il 95% dei contratti annuali (vs 70-80% con gestione cartacea) e azzerano le contestazioni per scadenze DPR 74/2013 perse. Il valore del parco impianti gestito cresce strutturalmente.",
  commercialLevers: [
    {
      icon: TrendingUp,
      title: "+4 interventi/giorno per tecnico",
      text: "Tecnico non torna in ufficio per consegnare carta, non chiama 5 volte per chiarimenti, non aspetta ricambi. Tempo libero produttivo aumenta del 30%, equivalente a 4-5 interventi extra al giorno per tecnico.",
    },
    {
      icon: ShieldCheck,
      title: "Zero scadenze DPR 74/2013 perse",
      text: "Notifiche automatiche, pianificazione automatica, tracciamento conferme. Cliente non riceve mai sanzione perché tu non sei intervenuto in tempo. Reputazione costruita sulla precisione normativa.",
    },
    {
      icon: Euro,
      title: "Contratti annuali rinnovati al 95%",
      text: "Cliente che riceve libretti puntuali, scadenze rispettate, fatture al millisecondo, rinnova senza pensarci. Tasso di rinnovo cresce dal 70% al 95% nei primi 12 mesi di adozione.",
    },
    {
      icon: Sparkles,
      title: "Brand di impresa professionale",
      text: "Cliente percepisce subito 'questa è un'impresa strutturata'. Libretto digitale firmato, PDF via email, scadenze rispettate, fattura al millisecondo. Posizionamento commerciale superiore.",
    },
  ],

  resultsKicker: "Risultati con Edilizia in Cloud",
  resultsH2: "Tecnici produttivi, scadenze tracciate, contratti rinnovati. La macchina gira da sola.",
  resultsBody:
    "Quando ogni impianto ha un libretto digitale, ogni scadenza ha una notifica, ogni contratto ha una fatturazione automatica, l'impresa di manutenzione torna a essere quello che doveva essere: macchina operativa che gestisce parchi impianti grandi senza esplodere.",
  integrationPillars: [
    {
      icon: Calendar,
      title: "Scadenzario normativo automatico",
      text: "DPR 74/2013, FGAS regolamento UE 517/2014, antincendio DM 10/03/1998, scariche atmosferiche CEI 81-10. Pre-caricato per ogni tipologia impianto.",
    },
    {
      icon: Smartphone,
      title: "App tecnico offline-first",
      text: "Funziona anche senza connessione: tecnico in cantine, sottotetti, zone industriali isolate compila e firma. Sync automatica al rientro online.",
    },
    {
      icon: FileText,
      title: "Libretti impianto digitali conformi",
      text: "Modelli ufficiali Regioni e DPR aggiornati. Compilazione guidata per ogni intervento, firma cliente eIDAS, archivio cloud immutabile.",
    },
    {
      icon: Receipt,
      title: "Fatturazione contratti ricorrenti SDI",
      text: "Canoni mensili, trimestrali, semestrali, annuali emessi automaticamente via SDI. Stato pagamento tracciato, solleciti automatici.",
    },
  ],
  resultStats: [
    { value: 30, prefix: "+", suffix: "%", label: "produttività tecnici sul campo" },
    { value: 95, suffix: "%", label: "tasso rinnovo contratti annuali" },
    { value: 100, suffix: "%", label: "scadenze normative tracciate" },
  ],
  resultsCta: "Apri la dashboard Manutenzione",

  roiKicker: "Calcola il tuo ROI",
  roiH2: "Quanto vale risparmiare 30 minuti per ogni intervento × tutti gli impianti gestiti?",
  roiSubheadline:
    "Sposta i cursori sulla tua realtà: numero impianti gestiti e costo orario tecnico. La stima parte da 4 interventi/anno per impianto e 30 minuti risparmiati per intervento (compilazione, ricerca dati, telefonate ufficio).",
  roi: {
    input1Label: "Impianti gestiti totali",
    input1Default: 250,
    input1Min: 10,
    input1Max: 1000,
    input1Step: 5,
    input2Label: "Costo orario tecnico (€)",
    input2Default: 35,
    input2Min: 20,
    input2Max: 60,
    input2Step: 1,
    input2Suffix: " €",
    outputLabel: "Risparmio annuo stimato",
    computeOutput: (a, b) => Math.round(a * 4 * b * 0.5),
    computeSecondary: (a, b) => [
      { label: "Interventi/anno gestiti", value: `${a * 4}` },
      { label: "Ore tecnico recuperate/anno", value: `${a * 4 * 0.5} h` },
      { label: "Interventi extra fattibili/anno", value: `${Math.round(a * 4 * 0.3)}` },
    ],
    closingPitch:
      "Stima conservativa basata su 4 interventi/anno per impianto e 30 minuti risparmiati ciascuno. Aggiungi le scadenze DPR salvate e il rinnovo contratti al 95%: il ROI reale è doppio.",
  },

  salesKicker: "Impatto operativo",
  salesH2: "Non un'app generica. Un sistema costruito per chi vive di interventi e libretti.",
  salesBody:
    "Edilizia in Cloud parla la lingua della manutenzione: DPR 74/2013, FGAS, libretto, controllo fumi, contratto annuale, canone trimestrale. Le 4 dimensioni operative che cambiano dal primo mese.",
  salesImpact: [
    {
      title: "Tecnici sul campo, non al telefono",
      text: "App offline-first con tutto ciò che serve: indirizzi, contatti, ricambi, storico cliente. Tecnico smette di chiamare l'ufficio 5 volte al giorno, fa 4 interventi in più.",
    },
    {
      title: "Libretti digitali firmati al 100%",
      text: "Compilazione guidata durante l'intervento, firma cliente eIDAS sul telefono. PDF generato e inviato. Zero libretti incompleti, zero contestazioni post-intervento.",
    },
    {
      title: "Scadenze normative come asset commerciale",
      text: "Notifichi al cliente '60 giorni alla scadenza controllo fumi'. Cliente percepisce attenzione, rinnova contratto, racconta agli amici. La compliance diventa marketing.",
    },
    {
      title: "Fatturazione automatica canoni",
      text: "Ogni contratto annuale fattura automaticamente alle scadenze configurate. Niente dimenticanze, niente fatture doppie, niente recupero crediti caotico. Cassa prevedibile.",
    },
  ],

  featureKicker: "Cosa ottieni davvero",
  featureH2: "Funzioni concrete per chi gestisce parchi impianti, non slogan da brochure.",
  featureRows: [
    {
      label: "Anagrafica impianti georeferenziata",
      value:
        "Caldaie, climatizzatori, pompe di calore, FV, antincendio, idrici. Ogni impianto con dati tecnici, potenza, marca, modello, matricole, ubicazione GPS, foto, schede tecniche.",
    },
    {
      label: "Scadenzario DPR 74/2013 automatico",
      value:
        "Controllo fumi 1-2-4 anni in base a potenza, FGAS regolamento UE 517/2014, antincendio, scariche atmosferiche, scadenze regionali specifiche. Pre-caricato per ogni impianto.",
    },
    {
      label: "App tecnico iOS/Android offline-first",
      value:
        "Calendario interventi, indirizzi GPS, ricambi, storico cliente, libretto digitale, foto, firma cliente eIDAS. Funziona senza connessione, sync automatica al rientro.",
    },
    {
      label: "Contratti manutenzione ricorrenti",
      value:
        "Canoni mensili, trimestrali, semestrali, annuali. Fatturazione automatica via SDI alle scadenze. Tasso rinnovo monitorato, alert su contratti in scadenza.",
    },
    {
      label: "Libretto impianto digitale conforme",
      value:
        "Modelli ufficiali Regioni aggiornati. Compilazione guidata per ogni tipologia intervento (ordinario, straordinario, controllo fumi). Firma cliente, archivio cloud immutabile.",
    },
    {
      label: "Magazzino ricambi integrato",
      value:
        "Scarico ricambi su intervento dall'app tecnico, riordino automatico sotto soglia, valorizzazione magazzino, fornitori abituali con codici materiali.",
    },
    {
      label: "Pronto intervento e reperibilità H24",
      value:
        "Gestione chiamate urgenti, distribuzione automatica al tecnico più vicino (GPS), tracking SLA contrattuali, fatturazione interventi extra contratto in tempo reale.",
    },
  ],

  scenarioKicker: "Tre casi reali sul campo",
  scenarioH2: "Tre situazioni in cui il modulo Manutenzione cambia la giornata.",
  scenarios: [
    {
      title: "Pronto intervento sabato sera",
      text:
        "Cliente chiama alle 21 per caldaia in blocco. Sistema mostra al titolare quale tecnico reperibile è più vicino (GPS), apre intervento, ricambi tipici precaricati. Tecnico chiude in 90 minuti, libretto firmato, fattura emessa lunedì.",
    },
    {
      title: "Scadenza FGAS in 30 giorni",
      text:
        "Sistema notifica titolare e tecnico: 80 impianti climatizzazione con scadenza FGAS nei prossimi 30 giorni. Pianificazione automatica per zona geografica, contatto cliente con SMS+email, conferma appuntamento sul portale.",
    },
    {
      title: "Cliente chiede storico interventi 2024",
      text:
        "Condominio chiede storico interventi caldaia per assemblea. Apri impianto, vedi 6 interventi 2024 con foto, libretti firmati, ricambi sostituiti, fatture. Esporti PDF in 30 secondi e mandi al cliente.",
    },
  ],

  testimonialQuote:
    "Gestivo 600 impianti con 4 tecnici e un caos di Excel. Avevamo 3-4 contestazioni al mese per scadenze DPR perse e 2 contratti annuali su 10 non venivano fatturati. Con Edilizia in Cloud sono salito a 950 impianti con gli stessi tecnici, tasso rinnovo 96%, zero contestazioni in 18 mesi. Il libretto digitale è la cosa che i clienti commentano di più.",
  testimonialAuthor: "Stefano R.",
  testimonialRole: "Termoidraulica RB Srl, Bologna",

  faqKicker: "Domande frequenti",
  faqH2: "Quello che un titolare di impresa di manutenzione vuole sapere prima di decidere.",
  faqs: [
    {
      q: "L'app tecnico funziona davvero offline in cantine e zone senza segnale?",
      a: "Sì. L'app è offline-first: il tecnico scarica al mattino tutti gli interventi del giorno con anagrafiche, ricambi, storico. Compila e firma anche senza connessione. Quando rientra in zona coperta, la sync è automatica e silente. Testato in cantine, sottotetti, zone industriali isolate.",
    },
    {
      q: "Le scadenze DPR 74/2013 sono pre-caricate per ogni potenza di caldaia?",
      a: "Sì. Il sistema applica automaticamente la cadenza corretta in base a potenza, tipo di combustibile e regione: 1 anno per caldaie >100 kW gasolio, 2 anni per gas fino a 100 kW, 4 anni per gas <35 kW residenziali. Aggiornamenti normativi inclusi senza costi extra.",
    },
    {
      q: "Posso fatturare canoni di contratti ricorrenti automaticamente via SDI?",
      a: "Sì. Per ogni contratto configuri cadenza (mensile, trimestrale, semestrale, annuale), importo, scadenze. Il sistema emette fattura SDI alla data prevista, traccia stato pagamento, manda solleciti automatici. Cassa prevedibile e niente fatture dimenticate.",
    },
    {
      q: "Il libretto di impianto digitale è conforme a tutte le Regioni?",
      a: "Sì. Modelli ufficiali pre-caricati per Lombardia, Piemonte, Veneto, Emilia-Romagna, Toscana, Lazio e tutte le altre Regioni con normative locali specifiche. Quando una Regione cambia il modulo, viene aggiornato automaticamente sulla piattaforma.",
    },
    {
      q: "Gestisce anche manutenzione antincendio e impianti fotovoltaici?",
      a: "Sì. Antincendio con scadenze DM 10/03/1998 (estintori, idranti, rilevatori), impianti FV con manutenzione decennale obbligatoria GSE, impianti elettrici con verifiche periodiche. Stesso flusso: anagrafica, scadenza, intervento, libretto, fatturazione.",
    },
    {
      q: "Quanto costa? È compreso o è add-on?",
      a: "Il modulo Manutenzione Impianti è incluso nei piani Professionista e Impresa AI di Edilizia in Cloud. Numero di impianti illimitato, app tecnico illimitata, fatturazione SDI illimitata. Cancelli quando vuoi senza vincoli pluriennali.",
    },
  ],

  internalLinksKicker: "Esplora la piattaforma",
  internalLinksH2: "La manutenzione vive collegata a tutta la piattaforma.",
  internalLinksBody:
    "Il modulo Manutenzione è alimentato da App Mobile, Scadenzario, Magazzino, Fatturazione e Cantieri Fotovoltaico. Ecco i moduli collegati.",
  internalLinks: [
    {
      to: "/funzionalita/app-cantiere-mobile",
      title: "App Cantiere Mobile",
      text: "App tecnico iOS/Android offline-first per interventi in mobilità.",
    },
    {
      to: "/funzionalita/scadenzario",
      title: "Scadenzario",
      text: "Scadenze DPR 74/2013, FGAS, antincendio, contratti.",
    },
    {
      to: "/funzionalita/magazzino-cantiere",
      title: "Magazzino Cantiere",
      text: "Scarico ricambi su intervento, riordino automatico, valorizzazione.",
    },
    {
      to: "/funzionalita/fatturazione-elettronica",
      title: "Fatturazione Elettronica SDI",
      text: "Fatturazione automatica canoni manutenzione ricorrenti.",
    },
    {
      to: "/funzionalita/fotovoltaico",
      title: "Cantieri Fotovoltaico",
      text: "Manutenzione decennale impianti FV con monitoraggio produzione.",
    },
    {
      to: "/funzionalita/firma-elettronica",
      title: "Firma Elettronica",
      text: "Firma cliente eIDAS sul libretto di impianto digitale.",
    },
    {
      to: "/funzionalita/portale-clienti",
      title: "Portale Clienti",
      text: "Cliente vede libretti, scadenze, storico interventi.",
    },
    {
      to: "/per/imprese-edili",
      title: "Software per Imprese di Costruzione",
      text: "Tutta la piattaforma per imprese edili e manutenzione.",
    },
    {
      to: "/prezzi",
      title: "Prezzi e Piani",
      text: "Modulo Manutenzione incluso nei piani Professionista e Impresa AI.",
    },
  ],

  finalCtaH2: "Smetti di perdere scadenze DPR e contratti annuali. Inizia a far girare la macchina.",
  finalCtaBody:
    "31 giorni gratuiti per portare il modulo Manutenzione Impianti dentro la tua impresa: setup in 48 ore, parco impianti importato, scadenze DPR 74/2013 pre-caricate, app tecnico iOS/Android. Onboarding 1-a-1 incluso. Cancelli quando vuoi.",
  finalCtaButton: "Prova gratis 31 giorni",
  finalCtaMicrocopy: "Setup 48 ore · App tecnico inclusa · Cancelli quando vuoi",

  stickyCtaLabel: "Prova gratis Manutenzione",
  stickyCtaMicrocopy: "Setup 48h · App tecnico inclusa",

  applicationSubCategory: "Facility Maintenance Software",

  relatedBlogSlugs: [
    "gestire-piu-cantieri-contemporaneamente",
    "recupero-crediti-impresa-edile-fatture-scadute",
    "come-trovare-clienti-fotovoltaico",
  ],
};

export default function ManutenzioneImpianti() {
  return <FunzionalitaPageTemplate config={config} />;
}
