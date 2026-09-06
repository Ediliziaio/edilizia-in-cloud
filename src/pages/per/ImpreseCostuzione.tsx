import {
  Building2, BarChart3, Users, FileText, TrendingUp, Smartphone, Shield,
  TrendingDown, Send, Camera, Sparkles, Receipt, Wallet, Warehouse, FolderOpen,
} from "lucide-react";
import PerTipoPageTemplate, { PerTipoConfig } from "@/components/landing/PerTipoPageTemplate";

const config: PerTipoConfig = {
  seoTitle: "Gestionale per Imprese di Costruzione | Più Margini",
  seoDescription: "Il gestionale per imprese di costruzione con AI: controlla margini reali su ogni commessa, gestisci SAL, subappaltatori, forecast di cassa a 90 giorni e computi metrici.",
  seoKeywords: "gestionale impresa costruzione, software impresa edile, software general contractor, gestione appalti edili, software commesse costruzione, gestionale cantieri multipli, software margini costruzione, SAL software, ERP impresa costruzione italiana",
  // SEO fix 2026-05-26: canonical aggiornato a /per/imprese-edili/ (keyword più
  // cercata + footer linka questa URL). Il vecchio /per/imprese-costruzione viene
  // 301 redirettato in public/_redirects per evitare 404 su GSC.
  seoCanonical: "/per/imprese-edili",

  badge: "Imprese di Costruzione & General Contractor",

  heroTitle: (
    <>
      <span className="text-white">Aumenta i margini. Blinda la cassa.</span>{" "}
      <span className="text-[#F97415]">Controlla ogni cantiere in tempo reale.</span>
    </>
  ),
  heroSubtitle:
    "Il 78% delle imprese edili scopre le perdite solo a cantiere chiuso. Con Edilizia in Cloud è il sistema a governare tutta l'azienda: margine reale di ogni commessa mentre lavori (+8,4% recuperato nei primi 90 giorni), SAL aggiornati, forecast di cassa a 90 giorni e ore di ogni squadra in tempo reale — ogni settimana, non solo a fine lavori.",
  heroImage: "/hero/stock/cantiere-1541888946425-1400.webp",

  socialProof: [
    { initials: "CF", name: "Costruzioni Ferretti", city: "Bologna", months: 14, gradient: "from-[#F97415] to-[#e8650e]" },
    { initials: "BG", name: "Bianchi & Grassi Edil", city: "Firenze", months: 9, gradient: "from-[#1a1a2e] to-[#16213e]" },
    { initials: "TM", name: "Tirelli Manufatti", city: "Brescia", months: 22, gradient: "from-[#0f3460] to-[#533483]" },
    { initials: "RE", name: "Romano Edilizia", city: "Napoli", months: 7, gradient: "from-[#2d6a4f] to-[#1b4332]" },
  ],

  problemsTitle: "I problemi che conosce ogni imprenditore edile",
  problemsSubtitle:
    "Se gestisci cantieri multipli con subappaltatori e non hai controllo sui margini in tempo reale, stai lavorando alla cieca.",

  roi: {
    lossValue: "€ 28.000",
    lossLabel: "persi in margini non tracciati su commesse",
    wasteValue: "€ 15.600",
    wasteLabel: "ore perse su report, Excel e telefonate capocantiere",
    errorValue: "€ 11.000",
    errorLabel: "in errori di preventivo e varianti non gestite",
    totalLoss: "€ 54.600",
    softwareCost: "€ 2.388",
    roiX: "23x",
  },

  problems: [
    {
      emoji: "🏗️",
      title: "Scopri le perdite solo a cantiere chiuso",
      desc: "Il preventivo era giusto, ma a fine lavori i costi reali erano il 30% in più. Materiali fuori controllo, ore extra non imputate alla commessa, subappaltatori che sforano il contratto. A quel punto non puoi fare nulla.",
    },
    {
      emoji: "📊",
      title: "5 cantieri, 5 Excel diversi, 0 visione d'insieme",
      desc: "Ogni capocantiere ha il suo file, il suo sistema, il suo modo di aggiornare i dati. Tu ogni settimana passi ore a consolidare fogli per avere una fotografia che è già vecchia di 3 giorni.",
    },
    {
      emoji: "💸",
      title: "SAL in ritardo, cassa sempre tesa",
      desc: "I SAL non vengono emessi in tempo, i clienti pagano lentamente e intanto devi pagare subappaltatori e fornitori. Il cash flow diventa un'emergenza mensile invece di un dato sotto controllo.",
    },
    {
      emoji: "📋",
      title: "Computi metrici fatti a sensazione",
      desc: "Prezziario aggiornato a mano, voci di costo stimate, margine calcolato a occhio nel preventivo. Poi arrivano le varianti, le riserve della DL e il margine reale è già evaporato.",
    },
  ],

  transformation: {
    title: "Come cambia il tuo lavoro dal primo mese",
    subtitle: "Non è ottimizzazione. È la differenza tra un'azienda che cresce e una che lavora tanto per guadagnare poco.",
    fromTitle: "Senza Edilizia in Cloud",
    fromItems: [
      "Excel caotico per ogni cantiere — dati sempre in ritardo",
      "Scopri le perdite a lavori finiti, quando non si può rimediare",
      "SAL emessi in ritardo perché nessuno sa quando scattano",
      "Cassa tesa: paghi i subappaltatori prima di incassare",
      "Il capocantiere ti chiama per aggiornarti — o peggio, non ti chiama",
      "Preventivo fatto a sensazione, poi stressato dai costi che salgono",
    ],
    toTitle: "Con Edilizia in Cloud",
    toItems: [
      "Margine reale di ogni commessa aggiornato in tempo reale",
      "Allarmi preventivi quando una commessa sta andando in perdita",
      "SAL generati automaticamente in base all'avanzamento lavori",
      "Forecast di cassa a 90 giorni — liquidità sempre sotto controllo",
      "Il capocantiere aggiorna dall'app: tu vedi tutto senza telefonate",
      "Preventivi da prezziario DEI/regionale con margine protetto",
    ],
  },

  stats: [
    { value: "+8.4%", label: "Margine medio recuperato", sublabel: "su commesse già in corso nei primi 90 giorni" },
    { value: "12h", label: "Risparmiate a settimana", sublabel: "su report, consolidamento dati e riunioni" },
    { value: "87%", label: "Vede le perdite in anticipo", sublabel: "prima che la commessa sia chiusa" },
  ],

  modulesTitle: "I moduli che fanno la differenza su ogni cantiere",
  modulesSubtitle:
    "Non un gestionale generico. Strumenti costruiti per come lavora davvero un'impresa edile italiana.",

  modules: [
    {
      icon: BarChart3,
      name: "Controllo Margini Commessa",
      desc: "Vedi il margine reale di ogni cantiere aggiornato al minuto: costi materiali, manodopera diretta, subappalti e overhead allocato. Allarme automatico se scendi sotto soglia.",
      saving: "Evita perdite medie del 8%",
    },
    {
      icon: FileText,
      name: "SAL & Fatturazione Avanzamento",
      desc: "Genera SAL automatici dall'avanzamento lavori registrato in cantiere. Calcola ritenute di garanzia, residui e scadenze. Zero fogli Excel, zero dimenticanze.",
      saving: "Incassi più veloci di 3 settimane",
    },
    {
      icon: Users,
      name: "Gestione Subappaltatori",
      desc: "Registro completo per ogni subappaltatore: ordini, bolle, fatture ricevute, ritenute di garanzia e stato pagamenti. Nessuna sorpresa a fine lavori.",
      saving: "Zero contenziosi irrisolti",
    },
    {
      icon: TrendingUp,
      name: "Forecast Cassa 90gg",
      desc: "Proiezione automatica di liquidità basata su SAL emessi, scadenze fornitori, costi fissi e rate subappalti. Sai oggi se avrai un problema tra 30 giorni.",
      saving: "Liquidità sempre positiva",
    },
    {
      icon: Building2,
      name: "Computi Metrici & Preventivi",
      desc: "Crea preventivi professionali partendo dal prezziario DEI/regionale o dal tuo listino personalizzato. Converti in commessa attiva in un click.",
      saving: "−3h per ogni preventivo",
    },
    {
      icon: Smartphone,
      name: "App Mobile Cantiere",
      desc: "Il capocantiere aggiorna SAL, carica foto, registra bolle di consegna e timbra le presenze dal telefono. Tutto sincronizzato in tempo reale senza tornare in ufficio.",
      saving: "−80% burocrazia in cantiere",
    },
  ],

  aiShowcase: {
    title: "L'AI che lavora per te, anche quando hai sei cantieri aperti",
    subtitle:
      "Silvio coordina 19 persone AI specializzate che leggono i dati della tua azienda e agiscono. Per un'impresa di costruzione significa questo:",
    actions: [
      {
        icon: TrendingDown,
        tag: "Margini",
        title: "Ti avvisa quando una commessa va in perdita",
        desc: "Costi materiali oltre il budget, ore extra non imputate, un subappaltatore che sfora il contratto: se il margine della commessa scende sotto la tua soglia, Silvio ti avvisa subito — non a cantiere chiuso, quando non puoi più rimediare.",
      },
      {
        icon: Send,
        tag: "Cassa",
        title: "Prepara SAL e solleciti d'incasso",
        desc: "In base all'avanzamento lavori registrato in cantiere, Silvio ti prepara il SAL da emettere. Cliente in ritardo su un pagamento? Mette in firma il sollecito con il tono giusto — email o PEC. Tu approvi, lui invia e tiene traccia.",
      },
      {
        icon: Camera,
        tag: "Campo",
        title: "Trasforma foto e vocali del capocantiere in rapportini",
        desc: "Il capocantiere carica le foto e una nota vocale dal cantiere: Silvio genera il rapportino, aggiorna l'avanzamento della commessa e collega tutto al cantiere giusto — con timestamp che valgono in caso di contestazione.",
      },
      {
        icon: Sparkles,
        tag: "Vendita",
        title: "Rinforza preventivi, gare e varianti",
        desc: "Prepara preventivi da prezziario con margine protetto, riscrive le proposte di gara puntando sui tuoi punti di forza e formalizza le varianti in corso d'opera — prima che diventino lavoro extra non fatturato.",
      },
    ],
    note: "Non una chat generica: ogni risposta nasce dai dati reali della tua azienda — commesse, costi, SAL, subappaltatori, incassi, squadre.",
  },

  platformExtra: {
    title: "E tutto il resto dell'azienda? Già incluso.",
    subtitle:
      "Non devi incollare cinque software diversi: dentro Edilizia in Cloud c'è tutto quello che serve a un'impresa di costruzione, collegato nello stesso posto.",
    items: [
      {
        icon: Receipt,
        name: "Fatturazione elettronica",
        desc: "Fatture SDI attive e passive, SAL, acconti e ritenute collegati alla commessa, bozze pronte da approvare.",
      },
      {
        icon: Wallet,
        name: "Cassa e scadenzario",
        desc: "Incassi attesi, pagamenti fornitori e subappaltatori: la cassa prevista a 30, 60 e 90 giorni, commessa per commessa.",
      },
      {
        icon: Users,
        name: "CRM e gare d'appalto",
        desc: "Richieste, sopralluoghi, preventivi e gare in un'unica pipeline: sai sempre cosa rilanciare e quando.",
      },
      {
        icon: Warehouse,
        name: "Magazzino e DDT",
        desc: "Materiali e noli con scorte tracciate, DDT di entrata e uscita collegati a ordini fornitori e cantieri.",
      },
      {
        icon: FolderOpen,
        name: "Documenti e qualifiche",
        desc: "DURC, SOA, certificazioni, PSC e contratti archiviati per commessa: trovi tutto in 5 secondi, anche in caso di ispezione.",
      },
      {
        icon: BarChart3,
        name: "Report direzionali",
        desc: "Fatturato, margini per commessa e per tipo di lavoro, forecast: i numeri dell'azienda in una schermata.",
      },
    ],
  },

  caseStudy: {
    company: "Costruzioni Ferretti S.r.l.",
    city: "Bologna",
    sector: "Costruzioni residenziali e commerciali",
    revenue: "2.4M €",
    person: "Gianluca Ferretti",
    role: "Titolare",
    initials: "GF",
    gradient: "from-[#F97415] to-[#e8650e]",
    quote:
      "In sei mesi ho scoperto che 2 cantieri su 7 erano in perdita. Uno lo sospettavo. L'altro mi ha gelato. Adesso ogni lunedì mattina apro il gestionale e in 10 minuti so esattamente come stanno andando tutti i cantieri — margini, SAL aperti, subappaltatori da pagare. Prima impiegavo mezza giornata per avere la metà delle informazioni.",
    metrics: [
      { label: "Margine medio per commessa", before: "4.2%", after: "11.8%" },
      { label: "Ore settimana su reportistica", before: "14h", after: "2h" },
      { label: "Commesse monitorate in tempo reale", before: "0", after: "7" },
    ],
    image: "/hero/stock/cantiere-1504307651254-768.webp",
  },

  faq: [
    {
      q: "Funziona con SAL a percentuale di avanzamento lavori?",
      a: "Sì, gestisce SAL a percentuale, a misura e misti. Il sistema calcola automaticamente gli importi fatturabili, le ritenute di garanzia da applicare e il residuo a fine lavori. Tutto conforme alla normativa appalti italiana.",
    },
    {
      q: "Come gestisco più subappaltatori sullo stesso cantiere?",
      a: "Ogni subappaltatore ha la sua scheda commessa con contratto, SAL ricevuti, fatture, ritenute di garanzia accumulate e stato pagamenti. Puoi vedere in un colpo solo quanto devi a ciascuno e quando scadono le ritenute.",
    },
    {
      q: "Posso importare i computi metrici che faccio già con PriMus o Excel?",
      a: "Sì. Importiamo computi in formato Excel/CSV e file standard PriMus. Il nostro team ti affianca durante il setup nelle prime 48h: nessun dato va perso e nessun preventivo va riscritto da zero.",
    },
    {
      q: "Il capocantiere deve saper usare il computer?",
      a: "No. L'app mobile è progettata per chi usa il telefono solo per WhatsApp. Foto, bolle, timbrature e aggiornamento SAL si fanno in 3 tocchi. Abbiamo clienti con capicantiere over 55 che la usano senza problemi dal primo giorno.",
    },
  ],

  verticalFeatures: [
    {
      icon: BarChart3,
      problem: "Non sai se stai guadagnando — finché non finisci il cantiere",
      solution: "Il SAL Avanzamento Lavori si aggiorna in tempo reale: ogni costo registrato (materiali, subappaltatori, ore operai) scala automaticamente sul budget di commessa. Vedi il margine residuo ogni giorno, non a consuntivo.",
      economicBenefit: "€ 28.000",
      benefitLabel: "margine recuperato in media nel 1° anno",
    },
    {
      icon: Users,
      problem: "I tuoi operai e subappaltatori: dove sono, cosa fanno, quanto costano",
      solution: "Ogni squadra timbra entrata e uscita dal cantiere via app — con geolocalizzazione opzionale. Il timesheet è automatico. I costi di manodopera si imputano alla commessa giusta. Zero fogli firma cartacei.",
      economicBenefit: "−4h/sett",
      benefitLabel: "in recupero dati presenze e inserimento manuale",
    },
    {
      icon: FileText,
      problem: "Varianti in corso d'opera mai formalizzate — il cliente non le riconosce a fine lavori",
      solution: "Ogni variante viene creata nel sistema, firmata digitalmente dal cliente via app o link SMS, archiviata sulla commessa. Nessuna contestazione possibile. Nessuna perdita di lavoro extra non fatturato.",
      economicBenefit: "+ 15%",
      benefitLabel: "di lavori extra recuperati e fatturati",
    },
    {
      icon: Shield,
      problem: "Sicurezza cantiere: cartelli, DVR, PSC, DPI — tutto su carta o su WhatsApp",
      solution: "Il modulo sicurezza gestisce cartelli digitali, consegna DPI con firma operaio, scadenze visite mediche, PSC allegato alla commessa. In caso di ispezione, hai tutto in 30 secondi dal telefono.",
      economicBenefit: "€ 0",
      benefitLabel: "sanzioni per documentazione sicurezza mancante",
    },
  ],
  verticalFeaturesTitle: "Il gestionale costruito per chi fa cantieri veri",
  verticalFeaturesSubtitle: "Non uno strumento per ufficio. Un sistema che va in cantiere con te e con le tue squadre — e ti dice ogni giorno se stai guadagnando o perdendo.",
  demoLabel: "Vedi come un general contractor gestisce 6 cantieri da un'unica dashboard — senza un call ogni mattina",

  ctaTitle: (
    <>
      <span className="text-white">I margini di ogni cantiere.</span>{" "}
      <span className="text-[#F97415]">Visibili. In tempo reale.</span>
    </>
  ),
  ctaSubtitle:
    "30 minuti di demo: ti mostriamo i margini reali su un cantiere tipo, con i tuoi numeri. Nessun impegno. Cancella quando vuoi.",

  schemaFaq: [
    {
      q: "Qual è il miglior gestionale per imprese di costruzione?",
      a: "Edilizia in Cloud è il gestionale per imprese di costruzione più usato in Italia: controlla margini reali per commessa, gestisce SAL automatici, subappaltatori con ritenute di garanzia e previsione cassa a 90 giorni.",
    },
    {
      q: "Come si gestiscono i SAL con un software per costruzioni?",
      a: "Il software genera automaticamente i SAL sulla base dell'avanzamento lavori registrato dal capocantiere in app. Calcola importi, applica le ritenute di garanzia e traccia i residui fino al saldo finale.",
    },
  ],
};

export default function ImpreseCostuzione() {
  return <PerTipoPageTemplate config={config} />;
}
