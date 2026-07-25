import {
  AlertTriangle,
  Bell,
  CalendarClock,
  ClipboardCheck,
  ClipboardList,
  Euro,
  FileText,
  HardHat,
  History,
  Layers,
  MapPin,
  Search,
  ShieldCheck,
  TrendingUp,
  Truck,
  Wrench,
} from "lucide-react";
import FunzionalitaPageTemplate from "./_template/FunzionalitaPageTemplate";
import type { FunzionalitaPageConfig } from "./_template/types";

const config: FunzionalitaPageConfig = {
  slug: "mezzi-attrezzature",
  vertical: "Mezzi e Attrezzature",
  productName: "Gestione Mezzi e Attrezzature Edilizia in Cloud",
  audience:
    "Imprese edili, movimento terra e general contractor con furgoni, escavatori, ponteggi e attrezzature distribuite su più cantieri, che vogliono sapere chi ha cosa, non bucare revisioni e assicurazioni, e tracciare le manutenzioni",
  audienceShort: "imprese edili con mezzi e attrezzature su più cantieri",

  seo: {
    title: "Gestione Mezzi e Attrezzature Cantiere",
    description:
      "Gestione mezzi e attrezzature di cantiere: chi ha cosa, scadenze revisioni e assicurazioni, assegnazioni e manutenzioni. Prova gratis 31 giorni.",
    keywords:
      "gestione mezzi e attrezzature cantiere, gestione parco mezzi edilizia, scadenze revisioni mezzi cantiere, assegnazione attrezzature cantiere, manutenzione mezzi edili, registro attrezzature impresa edile, software parco macchine edilizia, noleggio attrezzature cantiere",
    ogImage: "https://www.ediliziaincloud.com/og/og-default.png",
  },

  heroBadge: "Funzionalità · Mezzi e Attrezzature",
  heroH1Lead: "Ogni mezzo e ogni attrezzo:",
  heroH1Highlight: "sai dov'è, chi ce l'ha",
  heroH1Tail: "e quando scade",
  heroSubheadline:
    "Con Edilizia in Cloud il parco mezzi e attrezzature dell'impresa edile è tutto in un registro solo: ogni mezzo e ogni attrezzatura assegnati a un cantiere o a una persona, scadenze di revisioni e assicurazioni con avvisi automatici, manutenzioni registrate con lo storico completo. Basta cercare il martello demolitore per tre cantieri e basta scoprire la revisione scaduta dal verbale della stradale.",
  heroPrimaryCta: "Prova gratis 31 giorni",
  heroSecondaryCta: "Tutte le funzionalità",
  heroSecondaryCtaTo: "/funzionalita",

  reassurancePoints: [
    "Setup in 48 ore",
    "Avvisi scadenze automatici",
    "Assegnazioni per cantiere e persona",
  ],
  proofPoints: [
    "Registro unico di mezzi e attrezzature",
    "Storico manutenzioni per ogni mezzo",
    "Chi ha cosa, visibile in 5 secondi",
  ],

  objectiveRow: [
    ["Obiettivo", "Mai più mezzi fermi, attrezzi spariti o scadenze bucate"],
    ["Momento chiave", "Ogni assegnazione a cantiere e ogni scadenza in arrivo"],
    ["Risultato", "Parco mezzi sotto controllo, multe e fermi evitati"],
  ],

  betaH2:
    "Più di 300 imprese italiane sanno sempre dove sono i loro mezzi e quando scadono revisioni e polizze.",
  betaBody:
    "La Gestione Mezzi e Attrezzature la attiviamo in 48 ore: censiamo il parco (mezzi, attrezzature, ponteggi), carichiamo scadenze di revisioni, assicurazioni e verifiche, configuriamo gli avvisi automatici e ti accompagniamo in 2 sessioni 1-a-1 fino al primo mese di scadenze gestite senza pensieri. Dal primo giorno, chi cerca un attrezzo lo trova dall'app.",

  speedH2:
    "Un escavatore fermo per revisione scaduta costa più della revisione. Un attrezzo introvabile si ricompra.",
  speedSubheadline:
    "Senza un registro vivo, il parco mezzi si gestisce a memoria: la revisione la ricorda il titolare (finché la ricorda), il flessibile 'era nel furgone di Gigi', il ponteggio è distribuito su tre cantieri e nessuno sa quanti telai restano. Ogni dimenticanza è una multa, un fermo o un riacquisto.",
  speedStats: [
    { value: 0, suffix: "", label: "scadenze bucate con gli avvisi automatici" },
    { value: 5, suffix: " sec", label: "per sapere dov'è un mezzo o un attrezzo" },
    { value: 15, prefix: "-", suffix: "%", label: "riacquisti di attrezzature 'sparite'" },
  ],

  familyH2: "Mezzi e attrezzature collegati a cantieri, rapportini e costi.",
  familySubheadline:
    "Il parco mezzi non vive da solo: i mezzi si assegnano ai cantieri in calendario, l'impiego si registra nei rapportini, i costi di manutenzione pesano sui conti. Tutto si tiene, perché è la stessa piattaforma.",
  familyItems: [
    {
      icon: HardHat,
      title: "Gestione Cantieri",
      text: "Mezzi e attrezzature assegnati ai cantieri dove stanno lavorando.",
      to: "/funzionalita/gestione-cantieri",
    },
    {
      icon: ClipboardList,
      title: "Rapportini Cantiere",
      text: "I mezzi impiegati ogni giornata registrati nel rapportino.",
      to: "/funzionalita/rapportini-cantiere",
    },
    {
      icon: CalendarClock,
      title: "Calendario Lavori",
      text: "La pianificazione delle squadre incrocia la disponibilità dei mezzi.",
      to: "/funzionalita/calendario-lavori",
    },
    {
      icon: TrendingUp,
      title: "Margini Cantiere",
      text: "I costi di mezzi e manutenzioni dentro il quadro economico.",
      to: "/funzionalita/margini-cantiere",
    },
    {
      icon: FileText,
      title: "Giornale Lavori",
      text: "I mezzi operativi del giorno tracciati nel giornale di cantiere.",
      to: "/funzionalita/giornale-lavori",
    },
    {
      icon: Layers,
      title: "Magazzino Cantiere",
      text: "Attrezzature e materiali: due registri, una sola logica di tracciamento.",
      to: "/funzionalita/magazzino-cantiere",
    },
  ],
  familyBonusTitle:
    "Un registro solo per tutto quello che ha le ruote, un motore o un numero di serie.",
  familyBonusText:
    "Furgoni, escavatori, miniescavatori, ponteggi, gruppi elettrogeni, martelli demolitori, laser: ogni bene censito con targa o matricola, documenti, scadenze e assegnazione corrente. Quando serve sapere dov'è, chi ce l'ha, quando scade la revisione o quanto è costato di manutenzione quest'anno, la risposta sta in una schermata, non in tre telefonate.",

  painKicker: "Il problema vero",
  painH2:
    "Attrezzi che spariscono, revisioni scoperte dalla stradale, mezzi che si rompono sempre sul più bello.",
  painSubheadline:
    "Il parco mezzi è uno dei capitali più grossi dell'impresa edile e quasi sempre il meno controllato: nessun registro aggiornato, scadenze a memoria, manutenzioni fatte solo quando qualcosa si rompe. Il conto arriva a rate: multe, fermi macchina, riacquisti.",
  painPoints: [
    {
      icon: Search,
      title: "L'attrezzo che serve è sempre da un'altra parte",
      text: "Il martello demolitore serve a Via Roma, ma 'era nel furgone di Gigi', che oggi è su un altro cantiere. Mezz'ora di telefonate, poi si va a comprarne o noleggiarne un altro. Moltiplicalo per un anno: migliaia di euro tra tempo perso e doppi acquisti.",
    },
    {
      icon: AlertTriangle,
      title: "Revisioni e assicurazioni scoperte troppo tardi",
      text: "La revisione del furgone è scaduta da due mesi: lo scopri dal verbale della stradale, con multa e fermo del veicolo. La polizza del miniescavatore è scaduta e nessuno se n'è accorto finché non è servita. Le scadenze a memoria falliscono sempre nel momento peggiore.",
    },
    {
      icon: Wrench,
      title: "Manutenzione solo quando si rompe",
      text: "Niente tagliandi programmati, niente storico: il mezzo lavora finché si ferma, di solito a metà di un lavoro urgente. Il guasto in cantiere costa il triplo del tagliando: fermo squadra, noleggio sostitutivo, riparazione d'urgenza.",
    },
    {
      icon: Euro,
      title: "Nessuno sa quanto costa davvero il parco mezzi",
      text: "Quanto è costato l'escavatore quest'anno tra gasolio, manutenzioni e assicurazione? Nessuno lo sa. Così i mezzi da sostituire si tengono troppo a lungo e i noleggi si decidono a sensazione, senza confronto coi costi veri di possesso.",
    },
  ],

  baKicker: "Prima e dopo Edilizia in Cloud",
  baH2: "Stesso parco mezzi, stessi cantieri. Cambia il controllo: da memoria a registro.",
  baSubheadline:
    "La Gestione Mezzi e Attrezzature non ti chiede burocrazia in più: censisci il parco una volta, poi ogni assegnazione è un tap e ogni scadenza si avvisa da sola.",
  baAreas: [
    {
      title: "Dove sono mezzi e attrezzature",
      before:
        "Si sa 'più o meno': il grosso a magazzino, il resto sparso tra cantieri e furgoni. Per trovare un attrezzo si telefona; se non salta fuori, si ricompra.",
      after:
        "Ogni bene ha un'assegnazione corrente: cantiere, furgone o persona. Cerchi dall'app e in 5 secondi sai dov'è e chi ce l'ha. I riacquisti da 'sparizione' calano subito.",
    },
    {
      title: "Scadenze revisioni, assicurazioni e verifiche",
      before:
        "Scadenze nella testa del titolare, su post-it o in un Excel mai aggiornato. Ogni tanto una buca: multa, mezzo fermo, polizza scoperta nel momento del sinistro.",
      after:
        "Ogni scadenza caricata sul bene: revisione, assicurazione, bollo, verifiche periodiche. Avvisi automatici in anticipo a chi di dovere. Le scadenze bucate finiscono a zero.",
    },
    {
      title: "Manutenzioni",
      before:
        "Si interviene a guasto avvenuto, in emergenza, a metà lavoro. Nessuno storico: lo stesso mezzo si rompe tre volte per la stessa causa e nessuno collega i puntini.",
      after:
        "Manutenzioni programmate con promemoria e interventi registrati con data, officina e costo. Lo storico per mezzo dice cosa si rompe, quanto spesso e quanto costa: decidi con i numeri se riparare o sostituire.",
    },
    {
      title: "Assegnazione ai cantieri",
      before:
        "I mezzi si spostano a voce: 'porta il miniescavatore da Bianchi'. Due settimane dopo nessuno ricorda dove sia finito il generatore, e il ponteggio è mezzo qui e mezzo là.",
      after:
        "Ogni spostamento è un'assegnazione registrata in un tap: da dove, a dove, quando, chi. Lo storico degli spostamenti resta sul bene: il ponteggio distribuito su tre cantieri torna un numero certo di telai per sito.",
    },
  ],

  mechanismKicker: "Come funziona",
  mechanismH2: "Tre passaggi: censisci il parco, assegna ai cantieri, lascia lavorare gli avvisi.",
  mechanismSubheadline:
    "La Gestione Mezzi e Attrezzature è costruita per la realtà dell'impresa: censimento una volta sola in onboarding, poi ogni movimento è un tap dall'app e ogni scadenza si ricorda da sola.",
  mechanismSteps: [
    {
      icon: ClipboardCheck,
      title: "Censisci mezzi e attrezzature una volta sola",
      text: "In onboarding carichiamo il parco: mezzi con targa, attrezzature con matricola, documenti allegati, scadenze di revisioni, assicurazioni, bolli e verifiche. Da lì il registro è vivo: ogni nuovo acquisto si aggiunge in un minuto.",
    },
    {
      icon: MapPin,
      title: "Assegna a cantiere, furgone o persona",
      text: "Ogni bene ha un'assegnazione corrente: il miniescavatore al cantiere di Via Roma, il demolitore al furgone di Gigi. Lo spostamento si registra in un tap dall'app, e lo storico resta. Chiunque in impresa vede dov'è cosa, senza telefonate.",
    },
    {
      icon: Bell,
      title: "Gli avvisi ti anticipano le scadenze",
      text: "Revisione tra 30 giorni, polizza tra 15, verifica periodica tra 7: gli avvisi automatici arrivano in anticipo a chi gestisce il parco. Le manutenzioni programmate generano promemoria e ogni intervento si registra con costo e officina. Zero scadenze bucate.",
    },
  ],
  mechanismCta: "Vedi il registro mezzi di esempio",

  commercialKicker: "Perché conviene davvero",
  commercialH2:
    "Multe e fermi evitati, attrezzi ritrovati, guasti anticipati, costi del parco finalmente leggibili.",
  commercialBody:
    "Il parco mezzi è capitale immobilizzato che deve lavorare: ogni giorno di fermo, ogni multa e ogni attrezzo ricomprato sono soldi persi in silenzio. Il registro vivo li recupera uno per uno.",
  commercialLevers: [
    {
      icon: ShieldCheck,
      title: "Zero scadenze bucate",
      text: "Revisioni, assicurazioni, bolli e verifiche periodiche con avvisi automatici in anticipo. Una sola multa evitata con fermo del mezzo vale più di un anno di abbonamento; una polizza scoperta al momento sbagliato vale molto di più.",
    },
    {
      icon: Search,
      title: "Attrezzi che si trovano invece di ricomprarsi",
      text: "Quando ogni bene ha un'assegnazione visibile, i riacquisti da 'sparizione' calano subito: si stima un -15% sugli acquisti di piccola attrezzatura il primo anno. E la mezz'ora di telefonate per trovare il demolitore sparisce del tutto.",
    },
    {
      icon: Wrench,
      title: "Guasti anticipati dalla manutenzione programmata",
      text: "Il tagliando fatto a calendario costa un terzo del guasto in cantiere: niente squadra ferma, niente noleggio sostitutivo d'urgenza. Lo storico interventi ti dice quale mezzo sta diventando un pozzo e va sostituito.",
    },
    {
      icon: Euro,
      title: "Decisioni comprare/noleggiare sui numeri",
      text: "Con costi di manutenzione, fermi e scadenze registrati per mezzo, sai quanto costa davvero possedere ogni bene. Il confronto con il noleggio si fa sui numeri veri, non a sensazione: e spesso riserva sorprese in entrambe le direzioni.",
    },
  ],

  resultsKicker: "Risultati con Edilizia in Cloud",
  resultsH2: "Il parco mezzi smette di gestirsi a memoria. E la memoria smette di costarti cara.",
  resultsBody:
    "Quando ogni mezzo ha il suo registro con assegnazione, scadenze e storico manutenzioni, l'impresa smette di perdere soldi in silenzio: niente multe, niente fermi evitabili, niente doppi acquisti, e un capitale che finalmente si legge.",
  integrationPillars: [
    {
      icon: Truck,
      title: "Registro unico del parco",
      text: "Mezzi targati, attrezzature con matricola, ponteggi e beni minori: tutto censito con documenti allegati, foto e valore. La fotografia completa del capitale operativo dell'impresa.",
    },
    {
      icon: MapPin,
      title: "Assegnazioni tracciate",
      text: "Ogni bene assegnato a cantiere, furgone o persona, con storico degli spostamenti. Chi cerca qualcosa lo trova dall'app in 5 secondi, da ufficio o da cantiere.",
    },
    {
      icon: Bell,
      title: "Scadenzario con avvisi automatici",
      text: "Revisioni, assicurazioni, bolli, verifiche periodiche: ogni scadenza caricata sul bene e avvisata in anticipo alle persone giuste. Il calendario delle scadenze del parco, sempre aggiornato.",
    },
    {
      icon: History,
      title: "Storico manutenzioni e costi",
      text: "Ogni intervento registrato: data, officina, descrizione, costo. Lo storico per mezzo alimenta le decisioni ripara/sostituisci e il costo reale del parco anno per anno.",
    },
  ],
  resultStats: [
    { value: 0, suffix: "", label: "revisioni e polizze scadute senza avviso" },
    { value: 15, prefix: "-", suffix: "%", label: "riacquisti di attrezzatura il primo anno" },
    { value: 5, suffix: " sec", label: "per trovare qualsiasi mezzo o attrezzo" },
  ],
  resultsCta: "Apri la demo Mezzi e Attrezzature",

  roiKicker: "Calcola il tuo ROI",
  roiH2: "Quanto ti costa ogni anno il parco mezzi gestito a memoria?",
  roiSubheadline:
    "Sposta i cursori sulla tua realtà: mezzi e attrezzature rilevanti nel parco e spesa annua tra manutenzioni, riacquisti e noleggi tampone. La stima calcola il recupero da scadenze rispettate, attrezzi ritrovati e guasti anticipati.",
  roi: {
    input1Label: "Mezzi e attrezzature nel parco",
    input1Default: 25,
    input1Min: 5,
    input1Max: 200,
    input1Step: 5,
    input2Label: "Spesa annua parco (manutenzioni + riacquisti + noleggi) (€)",
    input2Default: 20000,
    input2Min: 2000,
    input2Max: 200000,
    input2Step: 1000,
    input2Suffix: " €",
    outputLabel: "Recupero annuo stimato",
    computeOutput: (a, b) => Math.round(b * 0.12 + a * 40),
    computeSecondary: (a, b) => [
      { label: "Recupero su spesa parco", value: `€ ${Math.round(b * 0.12).toLocaleString("it-IT")} (12%)` },
      { label: "Tempo ricerca attrezzi recuperato", value: `${a * 2} h/anno` },
      { label: "Beni sotto controllo", value: `${a}` },
    ],
    closingPitch:
      "Stima prudenziale: 12% di recupero sulla spesa annua del parco (doppi acquisti evitati, guasti anticipati, noleggi tampone eliminati) più il tempo di ricerca recuperato. Una sola multa con fermo mezzo evitata, e il conto è già pareggiato.",
  },

  salesKicker: "Impatto operativo",
  salesH2: "Il parco mezzi passa da fonte di sorprese a capitale che lavora.",
  salesBody:
    "La Gestione Mezzi e Attrezzature cambia 4 abitudini concrete: come si cercano gli attrezzi, come si gestiscono le scadenze, come si fanno le manutenzioni, come si decide cosa comprare e cosa noleggiare.",
  salesImpact: [
    {
      title: "La squadra trova, invece di cercare",
      text: "Chi ha bisogno di un attrezzo apre l'app e vede dov'è. Le mezz'ore di telefonate spariscono, e con loro i riacquisti di cose che l'impresa possedeva già ma nessuno trovava.",
    },
    {
      title: "Le scadenze arrivano prima che scadano",
      text: "L'avviso della revisione arriva 30 giorni prima: si prenota con calma, il mezzo si ferma quando fa comodo all'impresa, non quando lo decide un verbale. Bolli e polizze uguale.",
    },
    {
      title: "Le manutenzioni si programmano, i guasti calano",
      text: "Tagliandi a calendario, interventi registrati, storico leggibile. I mezzi si fermano meno, e quando un mezzo inizia a costare troppo lo dice lo storico, non l'ennesima emergenza.",
    },
    {
      title: "Il titolare vede il capitale, non solo i problemi",
      text: "Quanto vale il parco, quanto costa mantenerlo, quali beni rendono e quali no: il registro trasforma il parco mezzi da voce di spesa opaca a capitale gestito con criterio.",
    },
  ],

  featureKicker: "Cosa ottieni davvero",
  featureH2: "Non un elenco su Excel. Un registro vivo collegato ai cantieri.",
  featureRows: [
    {
      label: "Anagrafica mezzi e attrezzature",
      value:
        "Ogni bene con targa o matricola, categoria, foto, documenti allegati (libretti, certificati, polizze), valore e stato. Dal furgone al laser, tutto nel registro.",
    },
    {
      label: "Assegnazione a cantiere e persona",
      value:
        "Assegnazione corrente sempre visibile: cantiere, furgone o operaio. Spostamenti registrati in un tap dall'app, con storico completo per ogni bene.",
    },
    {
      label: "Scadenze con avvisi automatici",
      value:
        "Revisioni, assicurazioni, bolli, verifiche periodiche caricate per bene. Avvisi automatici in anticipo configurabili: chi deve sapere, sa per tempo.",
    },
    {
      label: "Manutenzioni programmate e storico",
      value:
        "Tagliandi e verifiche a calendario con promemoria. Ogni intervento registrato con data, officina, descrizione e costo: lo storico completo per ogni mezzo.",
    },
    {
      label: "Impiego nei rapportini di cantiere",
      value:
        "I mezzi impiegati ogni giornata si registrano nel rapportino: sai quali mezzi lavorano, dove e quanto. L'impiego reale incrocia i costi del parco.",
    },
    {
      label: "Ricerca da app in cantiere",
      value:
        "Capocantiere e squadra cercano un bene dall'app e vedono dov'è e chi ce l'ha. Il registro non è un file in ufficio: è in tasca a chi lavora.",
    },
    {
      label: "Costi del parco leggibili",
      value:
        "Manutenzioni, fermi e scadenze registrati per bene: il costo annuo di ogni mezzo si legge in una schermata. Base concreta per decisioni ripara/sostituisci/noleggia.",
    },
  ],

  scenarioKicker: "Tre casi reali sul campo",
  scenarioH2: "Tre situazioni in cui la Gestione Mezzi e Attrezzature cambia la giornata.",
  scenarios: [
    {
      title: "La revisione del furgone arriva con 30 giorni di anticipo",
      text: "Avviso automatico: revisione del Ducato tra 30 giorni. La segreteria prenota per il sabato mattina, quando il furgone è fermo comunque. Prima funzionava diversamente: revisione scaduta scoperta a un controllo, 173 € di multa e mezzo fermo un giorno lavorativo con la squadra a piedi.",
    },
    {
      title: "Il demolitore che stava per essere ricomprato",
      text: "Serve il martello demolitore grosso al cantiere di Via Trento. Il capocantiere sta per ordinarne uno a noleggio (95 €/giorno), poi cerca nell'app: è al cantiere di Corso Italia, fermo da una settimana. Recuperato in mezz'ora con il furgone. Il registro ha appena pagato il suo mese.",
    },
    {
      title: "Il miniescavatore che costava più di quanto rendesse",
      text: "Lo storico manutenzioni parla chiaro: il miniescavatore vecchio ha accumulato 4.800 € di interventi in un anno, più tre fermi in cantiere. Il titolare confronta con il costo del noleggio a lungo termine e decide la sostituzione con i numeri in mano. Prima la decisione si rimandava a sensazione, un guasto alla volta.",
    },
  ],

  testimonialQuote:
    "Avevamo attrezzature per duecentomila euro gestite col metodo 'chiedi in giro'. Il primo mese col registro abbiamo ritrovato roba che credevamo persa e scoperto due polizze scadute senza che nessuno lo sapesse. Adesso le scadenze arrivano da sole con l'avviso e quando serve un attrezzo si guarda l'app, non si fanno tre telefonate.",
  testimonialAuthor: "Paolo G.",
  testimonialRole: "G. Scavi e Costruzioni Srl, Treviso",

  faqKicker: "Domande frequenti",
  faqH2: "Quello che un titolare di impresa edile vuole sapere prima di mettere ordine nel parco mezzi.",
  faqs: [
    {
      q: "Cosa posso censire nella Gestione Mezzi e Attrezzature?",
      a: "Tutto quello che ha una targa, una matricola o un valore da tracciare: furgoni e autocarri, escavatori e miniescavatori, ponteggi, gruppi elettrogeni, attrezzatura elettrica e da taglio, strumenti di misura. Ogni bene ha la sua scheda con foto, documenti allegati, scadenze, assegnazione corrente e storico di spostamenti e manutenzioni. Il censimento iniziale lo facciamo insieme in onboarding.",
    },
    {
      q: "Come funzionano gli avvisi sulle scadenze di revisioni e assicurazioni?",
      a: "Per ogni bene carichi le scadenze: revisione, assicurazione, bollo, verifiche periodiche. Il sistema invia avvisi automatici in anticipo — ad esempio 30, 15 e 7 giorni prima — alle persone che gestiscono il parco. Così la revisione si prenota quando fa comodo all'impresa e le polizze non restano mai scoperte. Le scadenze bucate, con multe e fermi collegati, finiscono a zero.",
    },
    {
      q: "Come faccio a sapere chi ha un attrezzo in questo momento?",
      a: "Ogni bene ha un'assegnazione corrente: un cantiere, un furgone o una persona. Quando qualcosa si sposta, lo spostamento si registra in un tap dall'app, anche dal cantiere. Chiunque in impresa può cercare il bene e vedere in 5 secondi dov'è e chi ce l'ha, con lo storico completo degli spostamenti precedenti. Le telefonate a catena per trovare il demolitore finiscono.",
    },
    {
      q: "Posso tracciare le manutenzioni e i loro costi?",
      a: "Sì. Le manutenzioni programmate (tagliandi, verifiche) si mettono a calendario con promemoria automatici, e ogni intervento — programmato o a guasto — si registra con data, officina, descrizione e costo. Lo storico per mezzo ti dice quanto costa ogni bene all'anno e quali si stanno trasformando in un pozzo: la decisione tra riparare, sostituire o noleggiare si prende con i numeri.",
    },
    {
      q: "I mezzi si collegano ai cantieri e ai rapportini?",
      a: "Sì. I mezzi e le attrezzature si assegnano ai cantieri dove stanno lavorando, e l'impiego giornaliero si registra nei rapportini di cantiere insieme a ore e materiali. Così sai quali mezzi lavorano dove, l'utilizzo reale del parco si incrocia con i costi, e il giornale lavori riporta i mezzi operativi della giornata senza doppie registrazioni.",
    },
    {
      q: "La Gestione Mezzi e Attrezzature è inclusa nei piani Edilizia in Cloud?",
      a: "Sì, fa parte del gestionale Edilizia in Cloud senza limiti sul numero di mezzi o attrezzature censite. Nella prova gratuita di 31 giorni la usi completa: censimento del parco in onboarding, avvisi scadenze, assegnazioni da app e storico manutenzioni, con setup in 48 ore e sessioni 1-a-1 incluse. Cancelli quando vuoi.",
    },
  ],

  internalLinksKicker: "Esplora la piattaforma",
  internalLinksH2: "I mezzi lavorano nei cantieri. Il registro lavora con tutto il resto.",
  internalLinksBody:
    "Assegnazioni sui cantieri, impiego nei rapportini, mezzi nel giornale lavori, costi nei margini: il parco mezzi vive dentro la stessa piattaforma dell'impresa.",
  internalLinks: [
    { to: "/funzionalita/gestione-cantieri", title: "Gestione Cantieri", text: "Mezzi e attrezzature assegnati ai cantieri attivi." },
    { to: "/funzionalita/rapportini-cantiere", title: "Rapportini Cantiere", text: "I mezzi impiegati registrati in ogni giornata." },
    { to: "/funzionalita/calendario-lavori", title: "Calendario Lavori", text: "Pianificazione squadre e disponibilità mezzi insieme." },
    { to: "/funzionalita/giornale-lavori", title: "Giornale Lavori", text: "I mezzi operativi del giorno nel giornale conforme." },
    { to: "/funzionalita/margini-cantiere", title: "Margini Cantiere", text: "Costi del parco dentro il quadro economico dei cantieri." },
    { to: "/funzionalita/magazzino-cantiere", title: "Magazzino Cantiere", text: "Materiali e attrezzature tracciati con la stessa logica." },
    { to: "/funzionalita/scadenzario", title: "Scadenzario", text: "Tutte le scadenze dell'impresa in un colpo d'occhio." },
    { to: "/funzionalita/app-cantiere-mobile", title: "App Cantiere Mobile", text: "Ricerca e assegnazione mezzi dal telefono in cantiere." },
    { to: "/per/imprese-costruzione", title: "Software per Imprese di Costruzione", text: "Tutta la piattaforma orientata alle imprese edili italiane." },
  ],

  finalCtaH2:
    "Smetti di gestire il parco mezzi a memoria. Inizia a sapere dov'è tutto e quando scade, senza pensarci.",
  finalCtaBody:
    "31 giorni gratuiti per portare la Gestione Mezzi e Attrezzature dentro la tua impresa edile. Censimento del parco, avvisi scadenze automatici, assegnazioni da app, storico manutenzioni, setup in 48 ore e onboarding 1-a-1 inclusi. Cancelli quando vuoi.",
  finalCtaButton: "Prova gratis 31 giorni",
  finalCtaMicrocopy: "Setup 48h · Avvisi scadenze · Chi ha cosa in 5 secondi",

  stickyCtaLabel: "Prova gratis Mezzi e Attrezzature",
  stickyCtaMicrocopy: "Setup 48h · Zero scadenze bucate",

  applicationSubCategory: "Construction Equipment Management Software",

  relatedBlogSlugs: ["come-fare-preventivo-edilizia", "alternativa-excel-cantieri"],
};

export default function MezziAttrezzature() {
  return <FunzionalitaPageTemplate config={config} />;
}
