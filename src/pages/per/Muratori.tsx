import {
  Calculator, TrendingUp, Smartphone, Wallet, Clock, FileText,
  TrendingDown, Send, Camera, Sparkles, Receipt, Users, Warehouse, FolderOpen, BarChart3,
} from "lucide-react";
import PerTipoPageTemplate, { PerTipoConfig } from "@/components/landing/PerTipoPageTemplate";

const config: PerTipoConfig = {
  // SEO
  seoTitle: "Gestionale per Muratori | Preventivi, Ore e Fatture Facili",
  seoDescription: "Gestionale per muratori: preventivi veloci, ore della squadra con timbrature GPS, margini per cantiere e fatture SDI. Prova gratis 31 giorni.",
  seoKeywords: "gestionale per muratori, software impresa di muratura, preventivi muratore, ore squadra cantiere, fatturazione elettronica muratori, gestione cantieri piccola impresa, rapportini cantiere, timbrature GPS edilizia",
  seoCanonical: "/per/muratori",

  // Hero
  badge: "Per Piccole Imprese di Muratura",
  heroTitle: (
    <>
      <span className="text-white">Gestionale per muratori: il preventivo non si fa più la sera al tavolo.</span>{" "}
      <span className="text-[#F97415]">Ore, cantieri e fatture in ordine, dal telefono.</span>
    </>
  ),
  heroSubtitle:
    "Di giorno posi, la sera fai i conti: così il margine non lo vedi mai. Edilizia in Cloud è il gestionale per la piccola impresa di muratura: fai il preventivo in pochi minuti invece che la sera al tavolo, registri le ore della squadra con le timbrature GPS dal telefono, vedi il margine di ogni cantiere mentre lavori e mandi le fatture elettroniche da solo, senza aspettare il commercialista ogni volta.",
  heroImage: "/hero/stock/cantiere-1504307651254-1400.webp",

  // Social proof
  socialProof: [
    { initials: "FE", name: "F.lli Esposito Costruzioni", city: "Caserta", months: 12, gradient: "from-[#111111] to-[#F97415]" },
    { initials: "MR", name: "Muratura Rinaldi", city: "Perugia", months: 7, gradient: "from-[#0d8f79] to-[#111111]" },
    { initials: "EB", name: "Edile Barbieri", city: "Cremona", months: 15, gradient: "from-[#F97415] to-[#c45a0c]" },
    { initials: "CV", name: "Costruzioni Vitale", city: "Foggia", months: 9, gradient: "from-[#1a1a2e] to-[#0d8f79]" },
  ],

  // Problems
  problemsTitle: "Il lavoro in cantiere lo sai fare. È tutto il resto che ti frega.",
  problemsSubtitle:
    "Preventivi la sera, ore su foglietti, fatture in ritardo, acconti persi di vista. Non serve un impiegato in più: serve smettere di fare tutto a mano.",
  problems: [
    {
      emoji: "🌙",
      title: "I preventivi li fai la sera, al tavolo della cucina",
      desc: "Dopo dieci ore di cantiere ti metti a fare i conti: materiale, ore, ponteggio, ricarico. Due ore a preventivo, e se il cliente non risponde è tempo buttato. Intanto quelli che rispondono in giornata ti portano via i lavori.",
    },
    {
      emoji: "📝",
      title: "Le ore della squadra finiscono su foglietti che si perdono",
      desc: "Chi c'era lunedì al cantiere di via Roma? Quante ore ha fatto il manovale la settimana scorsa? Se le ore stanno su foglietti e messaggi WhatsApp, a fine mese qualcuna sparisce — e la paghi tu, non il cliente.",
    },
    {
      emoji: "🧾",
      title: "Per ogni fattura devi passare dal commercialista",
      desc: "Il lavoro è finito da due settimane ma la fattura non è ancora partita perché 'la manda il commercialista'. Intanto tu hai già pagato materiale e stipendi. La cassa soffre non perché manca il lavoro, ma perché fatturi tardi.",
    },
    {
      emoji: "💶",
      title: "Acconti e saldi si perdono per strada",
      desc: "L'acconto di un cliente, il saldo di un altro, i lavori extra fatti a voce e mai messi in conto: senza uno scadenzario, qualcosa resta sempre indietro. E ricordarsi tutto a memoria funziona finché i cantieri sono due.",
    },
    {
      emoji: "📸",
      title: "Lavori extra fatti, mai dimostrati, mai pagati",
      desc: "Il cliente cambia idea in corso d'opera, tu fai il lavoro in più a fiducia. A fine cantiere: 'questo non era compreso?'. Senza foto e senza carta firmata, l'extra lo regali. Ogni volta.",
    },
  ],

  // ROI
  roi: {
    lossValue: "€ 12.000",
    lossLabel: "tra lavori extra mai fatturati e preventivi persi per lentezza",
    wasteValue: "€ 8.400",
    wasteLabel: "in serate su preventivi, conteggio ore e carte per il commercialista",
    errorValue: "€ 5.200",
    errorLabel: "in ore non registrate, acconti dimenticati e fatture in ritardo",
    totalLoss: "€ 25.600",
    softwareCost: "€ 2.388",
    roiX: "10x",
  },

  // Transformation
  transformation: {
    title: "Com'è la settimana prima e dopo Edilizia in Cloud",
    subtitle:
      "Stessa squadra, stessi cantieri. Quello che cambia è che la sera torni a casa e hai finito davvero.",
    fromTitle: "Prima: cantiere di giorno, ufficio di notte",
    fromItems: [
      "Preventivi fatti la sera con calcolatrice e blocco note: due ore l'uno",
      "Ore della squadra su foglietti e WhatsApp, ricostruite a fine mese",
      "Fatture ferme in attesa del commercialista: incassi settimane dopo",
      "Acconti e saldi tenuti a memoria — qualcuno si perde sempre",
      "Lavori extra fatti a voce, contestati a fine cantiere, spesso regalati",
      "Foto dei lavori sparse sul telefono, mai trovate quando servono",
    ],
    toTitle: "Dopo: la sera hai finito davvero",
    toItems: [
      "Preventivo dal listino in pochi minuti, PDF pronto da mandare al cliente",
      "Timbrature GPS dal telefono: le ore di ogni operaio finiscono sul cantiere giusto",
      "Fattura elettronica SDI in un click, appena il lavoro è finito — il commercialista la trova già fatta",
      "Scadenzario con acconti e saldi: vedi chi deve pagare e quando",
      "Ogni extra registrato con foto e nota sulla commessa: a fine cantiere lo fatturi, non lo discuti",
      "Rapportini con foto dal cantiere: la storia di ogni lavoro è scritta e datata",
    ],
  },

  // Stats
  stats: [
    {
      value: "10 min",
      label: "Per fare un preventivo",
      sublabel: "Dal listino, con ricarico tuo — non due ore la sera",
    },
    {
      value: "100%",
      label: "Delle ore registrate",
      sublabel: "Timbrature GPS dal telefono di ogni operaio",
    },
    {
      value: "+8%",
      label: "Margine medio per cantiere",
      sublabel: "Quando extra e ore si contano tutti, il margine si vede",
    },
  ],

  // Modules
  modulesTitle: "Gli strumenti giusti per una squadra di muratori",
  modulesSubtitle:
    "Niente moduli da grande impresa che non userai mai. Solo quello che ti serve per preventivare, lavorare, farti pagare.",
  modules: [
    {
      icon: Calculator,
      name: "Preventivi Veloci",
      desc: "Costruisci il preventivo dalle tue voci: demolizioni, murature, intonaci, massetti. Prezzi e ricarichi tuoi, quantità del lavoro, PDF impaginato pronto da mandare. In pochi minuti, anche dal telefono.",
      saving: "Da 2 ore a 10 minuti",
    },
    {
      icon: TrendingUp,
      name: "Commesse con Margini",
      desc: "Ogni cantiere ha il suo conto: preventivato, materiale comprato, ore della squadra, extra. Vedi quanto ci stai guadagnando mentre il cantiere è aperto — non a fine anno dal commercialista.",
      saving: "Margine visibile cantiere per cantiere",
    },
    {
      icon: Clock,
      name: "Timbrature GPS",
      desc: "Ogni operaio timbra dal suo telefono: entrata, uscita, cantiere. Tu vedi chi è dove e le ore finiscono in automatico sul costo della commessa giusta. Fine dei foglietti e delle ore ricostruite a memoria.",
      saving: "Zero ore perse per strada",
    },
    {
      icon: Camera,
      name: "Rapportini con Foto",
      desc: "A fine giornata la squadra carica due foto e due righe dall'app: cosa è stato fatto, cosa serve domani. Ogni lavoro extra viene fotografato e registrato — così a fine cantiere lo fatturi invece di regalarlo.",
      saving: "Extra fatturati, non regalati",
    },
    {
      icon: Receipt,
      name: "Fatturazione Elettronica SDI",
      desc: "Fai la fattura da solo in un click: acconto, SAL o saldo, già collegata al cantiere. Parte via SDI senza passare dal commercialista ogni volta — lui trova tutto in ordine quando serve.",
      saving: "Fatturi il giorno stesso, incassi prima",
    },
    {
      icon: Smartphone,
      name: "App Mobile",
      desc: "Preventivi, cantieri, foto, timbrature e fatture dal telefono. Funziona anche dove il segnale va e viene: registri in cantiere, sincronizza quando torna la linea.",
      saving: "L'ufficio sta in tasca",
    },
  ],

  // AI showcase
  aiShowcase: {
    title: "L'AI che lavora per te, mentre tu stai sul ponteggio",
    subtitle:
      "Silvio coordina 19 persone AI specializzate che leggono i dati della tua impresa e agiscono. Per una squadra di muratori significa questo:",
    actions: [
      {
        icon: TrendingDown,
        tag: "Margini",
        title: "Ti avvisa quando un cantiere perde",
        desc: "Troppe ore rispetto al preventivo, materiale oltre il previsto, extra non messi in conto: se il margine del cantiere scende sotto la tua soglia, Silvio ti avvisa subito — non quando il lavoro è chiuso.",
      },
      {
        icon: Send,
        tag: "Cassa",
        title: "Prepara fatture e solleciti",
        desc: "Lavoro finito? Silvio ti mette in firma la bozza di fattura. Saldo che non arriva? Prepara il sollecito con il tono giusto — email o WhatsApp. Tu approvi, lui manda e tiene traccia.",
      },
      {
        icon: Camera,
        tag: "Cantiere",
        title: "Trasforma foto e vocali in rapportini",
        desc: "Il capocantiere manda due foto e un vocale: Silvio scrive il rapportino, aggiorna il diario lavori e attacca tutto al cantiere giusto. Nessuno deve sedersi a scrivere.",
      },
      {
        icon: Sparkles,
        tag: "Preventivi",
        title: "Rinforza preventivi e richiama i clienti",
        desc: "Sistema il preventivo perché si capisca cosa è compreso e cosa no, e ti ricorda i clienti che non hanno ancora risposto — con il messaggio di follow-up già pronto.",
      },
    ],
    note: "Non una chat generica: ogni risposta nasce dai dati reali della tua impresa — cantieri, ore, materiali, incassi.",
  },

  // Platform extra
  platformExtra: {
    title: "E tutto il resto? Già incluso.",
    subtitle:
      "Non devi incollare cinque programmi diversi: dentro Edilizia in Cloud c'è tutto quello che serve a una piccola impresa edile, collegato nello stesso posto.",
    items: [
      {
        icon: Wallet,
        name: "Cassa e scadenzario",
        desc: "Acconti da chiedere, saldi da incassare, fornitori da pagare: la cassa prevista a 30, 60 e 90 giorni.",
      },
      {
        icon: Users,
        name: "CRM semplice",
        desc: "Richieste, sopralluoghi e preventivi in fila: sai sempre chi richiamare e quando.",
      },
      {
        icon: Warehouse,
        name: "Magazzino e DDT",
        desc: "Materiale in deposito e in cantiere, DDT di entrata e uscita collegati alle commesse.",
      },
      {
        icon: FolderOpen,
        name: "Documenti in ordine",
        desc: "Contratti, foto e carte di ogni cantiere archiviati sulla commessa: trovi tutto in 5 secondi.",
      },
      {
        icon: FileText,
        name: "Carte per il commercialista",
        desc: "Fatture e prima nota già in ordine: il commercialista scarica quello che gli serve da solo.",
      },
      {
        icon: BarChart3,
        name: "Report per decidere",
        desc: "Quanto hai fatturato, quanto hai margine, quanto devi incassare: i numeri in una schermata.",
      },
    ],
  },

  // Case Study
  caseStudy: {
    company: "F.lli Esposito Costruzioni",
    city: "Caserta",
    sector: "Muratura e ristrutturazioni",
    revenue: "410.000 €",
    person: "Antonio Esposito",
    role: "Titolare",
    initials: "AE",
    gradient: "from-[#111111] to-[#F97415]",
    quote:
      "Io e mio fratello abbiamo 5 operai. Prima facevo i preventivi la sera e le ore le raccoglievo dai foglietti il sabato mattina. Le fatture partivano quando il commercialista aveva tempo, e i lavori extra li regalavamo perché non c'era mai niente di scritto. Adesso il preventivo lo faccio in dieci minuti dal furgone, gli operai timbrano dal telefono e la fattura parte appena chiudiamo il cantiere. Solo di extra recuperati, quest'anno ci abbiamo pagato il software dieci volte.",
    metrics: [
      { label: "Tempo per un preventivo", before: "2 ore la sera", after: "10 minuti" },
      { label: "Ore squadra registrate", before: "foglietti e memoria", after: "timbrature GPS, tutte" },
      { label: "Giorni per emettere fattura", before: "15-20", after: "il giorno stesso" },
      { label: "Lavori extra fatturati", before: "quasi nessuno", after: "tutti, con foto" },
    ],
    image: "/hero/stock/cantiere-1541888946425-768.webp",
  },

  // FAQ
  faq: [
    {
      q: "Sono un muratore, non sono pratico di computer: quanto ci metto a imparare?",
      a: "Il gestionale è fatto per chi lavora in cantiere, non per chi sta in ufficio. Le cose di ogni giorno — preventivo, timbratura, foto, fattura — si fanno dal telefono in pochi tocchi. La maggior parte dei titolari è operativa in una settimana, e nei 31 giorni di prova gratuita hai l'onboarding incluso per partire con i tuoi dati veri.",
    },
    {
      q: "Posso fare le fatture da solo senza passare ogni volta dal commercialista?",
      a: "Sì. La fattura elettronica la fai tu in un click — acconto, SAL o saldo — e parte direttamente via SDI. Il commercialista non serve per ogni fattura: trova tutto già in ordine nel gestionale quando fa i conti di fine periodo. Tu fatturi il giorno che finisci il lavoro, e incassi prima.",
    },
    {
      q: "Come funzionano le timbrature GPS per la mia squadra?",
      a: "Ogni operaio ha l'app sul suo telefono: quando arriva in cantiere timbra l'entrata, quando finisce timbra l'uscita. La timbratura registra orario e posizione, e le ore finiscono in automatico sul costo del cantiere giusto. A fine mese non ricostruisci niente: le ore ci sono già, tutte.",
    },
    {
      q: "Come faccio a farmi pagare i lavori extra che il cliente chiede in corso d'opera?",
      a: "Quando il cliente chiede una modifica, la registri sulla commessa con due foto e una riga di descrizione, direttamente dal telefono. A fine cantiere hai l'elenco di tutti gli extra, documentati e datati: li metti in fattura e se il cliente contesta gli mostri foto e date. Quello che prima regalavi, ora lo incassi.",
    },
    {
      q: "Vedo quanto sto guadagnando davvero su ogni cantiere?",
      a: "Sì. Ogni cantiere ha il suo conto: quanto hai preventivato, quanto hai speso di materiale, quante ore ci ha messo la squadra, che extra sono usciti. Il margine si aggiorna mentre lavori. Così scopri quali lavori ti fanno guadagnare e quali ti tengono solo occupato — e il prossimo preventivo lo fai con i numeri giusti.",
    },
  ],

  verticalFeatures: [
    {
      icon: Calculator,
      problem: "Preventivi fatti la sera con calcolatrice e blocco note: due ore l'uno, e i clienti non aspettano",
      solution: "Il preventivo si costruisce dalle tue voci con i tuoi prezzi: demolizioni, murature, intonaci, massetti. Metti le quantità, il ricarico è già impostato, il PDF esce impaginato. Rispondi al cliente in giornata, non a fine settimana.",
      economicBenefit: "10 min",
      benefitLabel: "per un preventivo pronto da mandare",
    },
    {
      icon: Clock,
      problem: "Ore della squadra su foglietti: a fine mese qualcuna sparisce sempre, e la paghi tu",
      solution: "Ogni operaio timbra dal telefono con GPS: entrata, uscita, cantiere. Le ore finiscono in automatico sul costo della commessa. Niente più foglietti, niente più sabato mattina a ricostruire la settimana.",
      economicBenefit: "100%",
      benefitLabel: "delle ore registrate sul cantiere giusto",
    },
    {
      icon: Receipt,
      problem: "Fatture ferme in attesa del commercialista: il lavoro è finito, i soldi non arrivano",
      solution: "La fattura elettronica la fai tu, in un click, già collegata al cantiere: parte via SDI il giorno stesso che chiudi il lavoro. Il commercialista trova tutto in ordine quando serve. Incassi settimane prima.",
      economicBenefit: "−15 gg",
      benefitLabel: "di attesa media per incassare",
    },
    {
      icon: Camera,
      problem: "Lavori extra fatti a voce: a fine cantiere il cliente dice 'era compreso' — e tu regali",
      solution: "Ogni modifica in corso d'opera si registra sulla commessa con foto e data, dal telefono, in un minuto. A fine cantiere gli extra sono documentati: li fatturi tutti, e le contestazioni si chiudono mostrando le foto.",
      economicBenefit: "€ 0",
      benefitLabel: "di lavori extra regalati",
    },
    {
      icon: TrendingUp,
      problem: "Quanto guadagni su un cantiere lo scopri a fine anno, dal commercialista",
      solution: "Ogni cantiere ha il suo conto: preventivato, materiale, ore squadra, extra. Il margine si vede mentre il cantiere è aperto. Se un lavoro sta andando male lo sai subito — e il preventivo dopo lo fai più giusto.",
      economicBenefit: "+8%",
      benefitLabel: "margine medio sui cantieri monitorati",
    },
  ],
  verticalFeaturesTitle: "Preventivi veloci, ore contate, fatture subito: il conto torna",
  verticalFeaturesSubtitle: "Le cinque cose che fanno perdere soldi a una piccola impresa di muratura, sistemate una per una. Tutto collegato. Tutto dal telefono.",
  demoLabel: "Vedi come una squadra di 5 muratori gestisce preventivi, ore e fatture senza una sera in ufficio",

  // CTA
  ctaTitle: (
    <>
      <span className="text-white">Il cantiere lo sai fare.</span>{" "}
      <span className="text-[#F97415]">Al resto pensa il gestionale.</span>
    </>
  ),
  ctaSubtitle:
    "Prova Edilizia in Cloud gratis per 31 giorni, oppure prenota 30 minuti di demo: facciamo insieme un tuo preventivo vero e ti mostriamo come la squadra timbra e come parte una fattura. Se non ti fa risparmiare tempo, non paghi nulla.",

  // Schema FAQ
  schemaFaq: [
    {
      q: "Qual è il miglior gestionale per una piccola impresa di muratori?",
      a: "Edilizia in Cloud è il gestionale per piccole imprese di muratura: preventivi in 10 minuti, timbrature GPS della squadra, margini per cantiere, rapportini con foto e fatturazione elettronica SDI senza passare ogni volta dal commercialista.",
    },
    {
      q: "Un muratore può fare le fatture elettroniche da solo?",
      a: "Sì. Con Edilizia in Cloud la fattura si crea in un click, collegata al cantiere, e parte direttamente via SDI. Il commercialista trova i documenti già in ordine per gli adempimenti di periodo.",
    },
    {
      q: "Come si registrano le ore della squadra in cantiere?",
      a: "Ogni operaio timbra entrata e uscita dal telefono con GPS. Le ore finiscono in automatico sul costo del cantiere giusto, senza foglietti né ricostruzioni a fine mese.",
    },
  ],
};

export default function Muratori() {
  return <PerTipoPageTemplate config={config} />;
}
