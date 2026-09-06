import {
  Wrench, Package, Clock, TrendingUp, Smartphone, Wallet,
  TrendingDown, Send, Camera, Sparkles, Receipt, Users, Warehouse, FolderOpen, BarChart3,
} from "lucide-react";
import PerTipoPageTemplate, { PerTipoConfig } from "@/components/landing/PerTipoPageTemplate";

const config: PerTipoConfig = {
  // SEO
  seoTitle: "Gestionale per Installatori | Rapportini e Fattura Subito",
  seoDescription: "Gestionale per installatori: rapportini con foto dal telefono, magazzino furgone tracciato e fattura SDI dopo l'intervento. Prova gratis 31 giorni.",
  seoKeywords: "gestionale per installatori, software installatori, rapportini intervento, magazzino furgone, fattura dopo intervento, app installatori, gestione interventi rapidi, software assistenza tecnica, fatturazione elettronica installatori",
  seoCanonical: "/per/installatori",

  // Hero
  badge: "Per Installatori e Tecnici in Campo",
  heroTitle: (
    <>
      <span className="text-white">Gestionale per installatori: dieci interventi al giorno, zero fogli in furgone.</span>{" "}
      <span className="text-[#F97415]">Rapportino, materiale e fattura chiusi sul posto.</span>
    </>
  ),
  heroSubtitle:
    "L'intervento è finito da ore, ma il rapportino e la fattura sono ancora da fare. Edilizia in Cloud è il gestionale per installatori che fanno tanti interventi brevi: il rapportino con le foto si compila dal telefono in due minuti, il materiale usato si scala dal magazzino del furgone, e la fattura elettronica parte subito dopo l'intervento — non tre settimane dopo. Meno carta, meno giri a vuoto, incassi più veloci.",
  heroImage: "/hero/stock/cantiere-1581578731548-1400.webp",

  // Social proof
  socialProof: [
    { initials: "IR", name: "Installazioni Riva", city: "Monza", months: 10, gradient: "from-[#111111] to-[#F97415]" },
    { initials: "TG", name: "Tecno Impianti Galli", city: "Torino", months: 14, gradient: "from-[#0d8f79] to-[#111111]" },
    { initials: "SA", name: "Sicurezza & Antenne", city: "Firenze", months: 7, gradient: "from-[#F97415] to-[#c45a0c]" },
    { initials: "CD", name: "Clima Due", city: "Bari", months: 19, gradient: "from-[#1a1a2e] to-[#0d8f79]" },
  ],

  // Problems
  problemsTitle: "Dieci interventi al giorno, e il guadagno si perde nei dettagli",
  problemsSubtitle:
    "Il problema non è lavorare: di chiamate ne hai anche troppe. Il problema è quello che succede intorno a ogni intervento — rapportini a fine giornata, pezzi che mancano, fatture che partono settimane dopo. È lì che se ne vanno margine e cassa.",
  problems: [
    {
      emoji: "📄",
      title: "I rapportini si accumulano e si fanno 'poi'",
      desc: "Cinque interventi al giorno, i fogli di lavoro si compilano la sera o il venerdì — a memoria. Quello che non ricordi non lo scrivi, quello che non scrivi non lo fatturi. E se il cliente contesta, non hai niente in mano.",
    },
    {
      emoji: "🚚",
      title: "Il furgone è un magazzino di cui nessuno sa niente",
      desc: "Arrivi dal cliente e ti manca il pezzo. Torni in sede, perdi due ore, il cliente si scoccia. Quello che c'è sul furgone non lo sa nessuno con certezza, e i pezzi usati non vengono mai scalati — così a fine mese l'inventario non torna mai.",
    },
    {
      emoji: "🧾",
      title: "La fattura parte settimane dopo l'intervento",
      desc: "L'intervento è chiuso, ma tra foglio di lavoro da ritrovare e fattura da preparare passano due o tre settimane. Intanto i pezzi li hai già pagati tu. Su decine di interventi al mese, la cassa balla sempre.",
    },
    {
      emoji: "⏱️",
      title: "Ore e uscite non tracciate, margine invisibile",
      desc: "Trasferta, attesa, secondo viaggio per il pezzo mancante: chi le conta? Se non le registri, ogni intervento sembra andato bene — ma a fine mese il conto in banca dice altro. Senza numeri per intervento, non sai quali chiamate rendono e quali ti costano.",
    },
    {
      emoji: "🗓️",
      title: "La giornata si pianifica al telefono, ogni mattina",
      desc: "Chi va dove? Con che priorità? Il cliente di ieri ha richiamato? Ogni mattina mezz'ora di telefonate per organizzare il giro. E basta un imprevisto per far saltare la fila e lasciare un cliente ad aspettare.",
    },
  ],

  // ROI
  roi: {
    lossValue: "€ 14.500",
    lossLabel: "tra materiali non fatturati, ore non conteggiate e interventi sotto margine",
    wasteValue: "€ 8.800",
    wasteLabel: "in rapportini rifatti a memoria, fatture in ritardo e giri di telefonate",
    errorValue: "€ 6.200",
    errorLabel: "in viaggi a vuoto, pezzi mancanti sul furgone e secondi viaggi",
    totalLoss: "€ 29.500",
    softwareCost: "€ 2.388",
    roiX: "12x",
  },

  // Transformation
  transformation: {
    title: "Com'è la giornata di un installatore prima e dopo Edilizia in Cloud",
    subtitle:
      "Stessi interventi, stesso furgone. Cambia che ogni intervento si chiude davvero sul posto: rapportino, materiale, firma, fattura.",
    fromTitle: "Prima: il lavoro doppio",
    fromItems: [
      "Fogli di lavoro compilati la sera o il venerdì, a memoria",
      "Furgone rifornito a occhio: il pezzo giusto non c'è mai",
      "Fattura preparata settimane dopo, quando si ritrova il foglio",
      "Trasferte e secondi viaggi mai conteggiati: margine sconosciuto",
      "Giro del giorno organizzato ogni mattina al telefono",
      "Foto degli impianti sparse nel rullino del telefono",
    ],
    toTitle: "Dopo: chiuso sul posto",
    toItems: [
      "Rapportino con foto compilato dall'app in 2 minuti, firmato dal cliente sul posto",
      "Magazzino furgone tracciato: i pezzi usati si scalano dall'intervento, le scorte si vedono",
      "Fattura elettronica generata dall'intervento chiuso: parte in giornata via SDI",
      "Ore, trasferte e materiali imputati all'intervento: margine reale per ogni chiamata",
      "Interventi assegnati sull'app: ogni tecnico vede il suo giro senza telefonate",
      "Foto e storico di ogni impianto archiviati sul cliente: le ritrovi al prossimo intervento",
    ],
  },

  // Stats
  stats: [
    {
      value: "2 min",
      label: "Per chiudere un rapportino",
      sublabel: "Foto, materiali, firma del cliente: tutto dall'app sul posto",
    },
    {
      value: "−21gg",
      label: "Sul tempo di incasso",
      sublabel: "La fattura parte il giorno dell'intervento, non tre settimane dopo",
    },
    {
      value: "0",
      label: "Viaggi a vuoto per pezzi mancanti",
      sublabel: "Il magazzino furgone è tracciato e le scorte minime avvisano prima",
    },
  ],

  // Modules
  modulesTitle: "Gli strumenti per chi vive di interventi, non di scrivania",
  modulesSubtitle:
    "Rapportini, magazzino furgone, fattura immediata, margini per intervento: ogni modulo è pensato per essere usato col telefono in una mano e la borsa degli attrezzi nell'altra.",
  modules: [
    {
      icon: Camera,
      name: "Rapportini con Foto e Firma",
      desc: "Chiudi l'intervento sul posto: due foto, materiali usati, note, firma del cliente sullo schermo. Il rapportino è fatto, datato e archiviato sul cliente giusto. Niente più fogli da ricopiare la sera.",
      saving: "Rapportino chiuso in 2 minuti",
    },
    {
      icon: Package,
      name: "Magazzino Furgone",
      desc: "Ogni furgone ha il suo magazzino: sai cosa c'è a bordo, cosa è stato usato e dove. I pezzi si scalano dall'intervento e quando scendi sotto la scorta minima arriva l'avviso — prima di partire senza il pezzo giusto.",
      saving: "Zero uscite a vuoto",
    },
    {
      icon: Receipt,
      name: "Fattura Subito dopo l'Intervento",
      desc: "Dall'intervento chiuso nasce la bozza di fattura: manodopera, materiali, uscita. Controlli e invii via SDI in un click, anche dal telefono, prima di ripartire. Incassi settimane prima.",
      saving: "Fattura in giornata, non a fine mese",
    },
    {
      icon: TrendingUp,
      name: "Margine per Intervento",
      desc: "Ore, trasferta, materiali dal furgone: ogni costo finisce sull'intervento. Vedi quali chiamate rendono e quali ti costano — e aggiusti i prezzi con i numeri in mano, non a sensazione.",
      saving: "+10% margine medio per intervento",
    },
    {
      icon: Wrench,
      name: "Interventi Assegnati sull'App",
      desc: "Assegni gli interventi ai tecnici con indirizzo, storico del cliente e note. Ognuno vede il suo giro sull'app la mattina, con tutto quello che serve. Le telefonate di coordinamento crollano.",
      saving: "−80% telefonate di coordinamento",
    },
    {
      icon: Smartphone,
      name: "App Mobile Offline",
      desc: "Cantine, garage, locali tecnici: l'app funziona anche senza segnale. Compili il rapportino offline e si sincronizza appena torni in zona coperta. Nessun intervento resta a metà.",
      saving: "Funziona anche dove non c'è campo",
    },
  ],

  // AI showcase
  aiShowcase: {
    title: "L'AI che lavora per te, tra un intervento e l'altro",
    subtitle:
      "Silvio coordina 19 persone AI specializzate che leggono i dati della tua attività e agiscono. Per un installatore significa questo:",
    actions: [
      {
        icon: TrendingDown,
        tag: "Margini",
        title: "Ti avvisa quando un intervento non rende",
        desc: "Troppe ore, troppi km, secondo viaggio per il pezzo mancante: se il margine dell'intervento scende sotto la tua soglia, Silvio ti avvisa subito — così il prossimo preventivo lo fai giusto.",
      },
      {
        icon: Send,
        tag: "Cassa",
        title: "Prepara fatture e solleciti d'incasso",
        desc: "Intervento chiuso? Silvio ti mette in firma la bozza di fattura. Incasso in ritardo? Prepara il sollecito con il tono giusto — email o WhatsApp. Tu approvi, lui invia e tiene traccia.",
      },
      {
        icon: Camera,
        tag: "Campo",
        title: "Trasforma foto e vocali in rapportini",
        desc: "Due foto e un vocale a fine intervento: Silvio scrive il rapportino, registra i materiali citati e collega tutto al cliente giusto — pronto da far firmare.",
      },
      {
        icon: Sparkles,
        tag: "Clienti",
        title: "Non fa scappare i clienti fermi",
        desc: "Preventivi senza risposta, clienti che non richiamano da mesi, manutenzioni che sarebbero da rifare: Silvio te li segnala e prepara il messaggio per riagganciarli.",
      },
    ],
    note: "Non una chat generica: ogni risposta nasce dai dati reali della tua attività — interventi, furgoni, materiali, incassi.",
  },

  // Platform extra
  platformExtra: {
    title: "E tutto il resto? Già incluso.",
    subtitle:
      "Non devi incollare cinque software diversi: dentro Edilizia in Cloud c'è tutto quello che serve a chi fa installazioni, collegato nello stesso posto.",
    items: [
      {
        icon: Wallet,
        name: "Cassa e scadenzario",
        desc: "Incassi attesi e pagamenti ai fornitori di materiale: la cassa prevista a 30, 60 e 90 giorni.",
      },
      {
        icon: Users,
        name: "CRM e preventivi",
        desc: "Richieste, sopralluoghi e preventivi in un'unica fila: sai sempre chi richiamare e quando.",
      },
      {
        icon: Warehouse,
        name: "Magazzino centrale e DDT",
        desc: "Scorte in sede e sui furgoni, DDT di entrata e uscita collegati a interventi e commesse.",
      },
      {
        icon: Clock,
        name: "Timbrature GPS",
        desc: "Entrata e uscita dal telefono con posizione: le ore dei tecnici finiscono sull'intervento giusto.",
      },
      {
        icon: FolderOpen,
        name: "Storico impianti e documenti",
        desc: "Foto, rapportini e documenti di ogni impianto archiviati sul cliente: li ritrovi al prossimo giro.",
      },
      {
        icon: BarChart3,
        name: "Report per decidere",
        desc: "Fatturato, margini per tecnico e per tipo di intervento: i numeri dell'attività in una schermata.",
      },
    ],
  },

  // Case Study
  caseStudy: {
    company: "Installazioni Riva",
    city: "Monza",
    sector: "Installazione climatizzatori e impianti",
    revenue: "520.000 €",
    person: "Stefano Riva",
    role: "Titolare",
    initials: "SR",
    gradient: "from-[#111111] to-[#F97415]",
    quote:
      "Con tre tecnici facevamo dodici interventi al giorno e la sera io stavo un'ora a rimettere insieme i fogli di lavoro. Le fatture partivano a fine mese, quando andava bene. Adesso ogni tecnico chiude l'intervento sul posto: foto, pezzi usati, firma del cliente — e la fattura parte in giornata. Il furgone non parte più senza i pezzi giusti perché le scorte le vediamo, e io la sera vado a casa. La cassa è un'altra cosa: incassiamo tre settimane prima di prima.",
    metrics: [
      { label: "Rapportini compilati", before: "la sera, a memoria", after: "sul posto, con foto e firma" },
      { label: "Giorni per emettere fattura", before: "20-30", after: "in giornata" },
      { label: "Viaggi a vuoto per pezzi mancanti", before: "3-4 a settimana", after: "quasi zero" },
      { label: "Interventi al giorno", before: "12", after: "15, stessi tecnici" },
    ],
    image: "/hero/stock/cantiere-1581578731548-768.webp",
  },

  // FAQ
  faq: [
    {
      q: "Come funziona il rapportino d'intervento dall'app?",
      a: "A fine intervento il tecnico apre l'app, scatta due foto, spunta i materiali usati, scrive due righe di note e fa firmare il cliente direttamente sullo schermo. Il rapportino si archivia sul cliente con data e ora, e da lì può partire subito la fattura. In tutto: due minuti, sul posto, prima di risalire sul furgone.",
    },
    {
      q: "Posso fatturare subito dopo l'intervento, anche dal telefono?",
      a: "Sì. Dall'intervento chiuso il sistema prepara la bozza di fattura con manodopera, materiali e uscita. La controlli e la invii via SDI in un click, anche dal cellulare in macchina. I nostri clienti installatori passano da 2-3 settimane di attesa a fatturare in giornata — e la cassa si sente.",
    },
    {
      q: "Come funziona il magazzino del furgone?",
      a: "Ogni furgone è un magazzino tracciato: sai cosa c'è a bordo di ognuno. Quando il tecnico usa un pezzo, lo spunta sul rapportino e la scorta si scala da sola. Sotto la scorta minima arriva un avviso, così ricarichi il furgone prima di partire — non dopo il viaggio a vuoto dal cliente.",
    },
    {
      q: "L'app funziona anche senza segnale, tipo in cantina o nei locali tecnici?",
      a: "Sì. L'app funziona offline: compili rapportino, foto e materiali anche senza connessione, e tutto si sincronizza da solo appena torni in zona coperta. Per chi lavora in scantinati, garage e vani tecnici è la differenza tra chiudere l'intervento sul posto e doverselo ricordare dopo.",
    },
    {
      q: "Come faccio a sapere quali interventi mi fanno guadagnare e quali no?",
      a: "Ogni intervento raccoglie i suoi costi: ore del tecnico, trasferta, materiali scalati dal furgone. Il sistema li confronta con quanto fatturi e ti mostra il margine per intervento e per tipo di lavoro. Così scopri, numeri alla mano, quali chiamate rendono e su quali stai rimettendo — e correggi i prezzi.",
    },
  ],

  verticalFeatures: [
    {
      icon: Camera,
      problem: "Rapportini compilati la sera a memoria: materiali dimenticati, niente in mano se il cliente contesta",
      solution: "Il rapportino si chiude sul posto dall'app: foto, materiali, note e firma del cliente sullo schermo. Datato e archiviato sul cliente giusto. Quello che è successo nell'intervento è scritto — e si fattura tutto.",
      economicBenefit: "2 min",
      benefitLabel: "per chiudere un rapportino completo",
    },
    {
      icon: Receipt,
      problem: "Fatture emesse settimane dopo l'intervento: i pezzi li hai già pagati, i soldi non arrivano",
      solution: "Dall'intervento chiuso nasce la bozza di fattura con ore, materiali e uscita. Un click e parte via SDI, anche dal telefono. Su decine di interventi al mese, incassare tre settimane prima cambia la cassa.",
      economicBenefit: "−21 gg",
      benefitLabel: "sul tempo medio di incasso",
    },
    {
      icon: Package,
      problem: "Arrivi dal cliente e manca il pezzo: torni in sede, perdi due ore, il cliente si scoccia",
      solution: "Il magazzino di ogni furgone è tracciato: cosa c'è a bordo, cosa è stato usato, cosa sta finendo. I pezzi si scalano dai rapportini e l'avviso di scorta minima arriva prima di partire — non dopo il viaggio a vuoto.",
      economicBenefit: "€ 6.200",
      benefitLabel: "l'anno risparmiati in viaggi a vuoto",
    },
    {
      icon: TrendingUp,
      problem: "Interventi che sembrano andati bene ma a fine mese il conto non torna",
      solution: "Ore, trasferte e materiali finiscono sull'intervento. Vedi il margine di ogni chiamata e di ogni tipo di lavoro: installazioni, sostituzioni, urgenze. Dove il numero è rosso, aggiusti prezzo o modo di lavorare.",
      economicBenefit: "+10%",
      benefitLabel: "margine medio per intervento",
    },
    {
      icon: Wrench,
      problem: "Ogni mattina mezz'ora di telefonate per decidere chi va dove",
      solution: "Gli interventi si assegnano dall'ufficio con indirizzo, storico cliente e note. Ogni tecnico apre l'app e vede il suo giro. Cambia un imprevisto? Aggiorni l'assegnazione e il tecnico lo vede subito, senza chiamate.",
      economicBenefit: "−80%",
      benefitLabel: "telefonate di coordinamento",
    },
  ],
  verticalFeaturesTitle: "Intervento chiuso sul posto: rapportino, materiale, firma, fattura",
  verticalFeaturesSubtitle: "Le cinque perdite tipiche di chi fa interventi rapidi — rapportini a memoria, fatture in ritardo, furgone a sorpresa, margini invisibili, telefonate infinite — sistemate una per una.",
  demoLabel: "Vedi un intervento chiudersi dal telefono in 2 minuti: foto, materiali, firma e fattura che parte",

  // CTA
  ctaTitle: (
    <>
      <span className="text-white">Chiudi l'intervento sul posto.</span>{" "}
      <span className="text-[#F97415]">Fattura prima di risalire sul furgone.</span>
    </>
  ),
  ctaSubtitle:
    "Prova Edilizia in Cloud gratis per 31 giorni, oppure prenota 30 minuti di demo: simuliamo un tuo intervento vero — rapportino, materiali dal furgone, firma e fattura — e vedi quanto tempo e cassa recuperi da subito.",

  // Schema FAQ
  schemaFaq: [
    {
      q: "Qual è il miglior gestionale per installatori?",
      a: "Edilizia in Cloud è il gestionale per installatori con interventi rapidi: rapportini con foto e firma dal telefono, magazzino furgone tracciato, fattura elettronica SDI subito dopo l'intervento e margine reale per ogni chiamata.",
    },
    {
      q: "Come si fattura subito dopo un intervento?",
      a: "Alla chiusura del rapportino il sistema genera la bozza di fattura con manodopera, materiali e uscita. Si controlla e si invia via SDI in un click, anche dal telefono, il giorno stesso dell'intervento.",
    },
    {
      q: "Come si gestisce il magazzino del furgone?",
      a: "Ogni furgone ha il suo magazzino tracciato: i pezzi usati si scalano dai rapportini e un avviso segnala quando le scorte scendono sotto il minimo, così si ricarica il furgone prima di partire.",
    },
  ],
};

export default function Installatori() {
  return <PerTipoPageTemplate config={config} />;
}
