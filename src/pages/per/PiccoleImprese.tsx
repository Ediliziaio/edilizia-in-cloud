import {
  FileText, Calculator, Clock, Smartphone, BarChart3, Users,
  TrendingDown, Send, Camera, Sparkles, Receipt, Wallet, Warehouse, FolderOpen,
} from "lucide-react";
import PerTipoPageTemplate, { PerTipoConfig } from "@/components/landing/PerTipoPageTemplate";

const config: PerTipoConfig = {
  // SEO
  seoTitle: "Software per Piccole Imprese Edili | Margini Chiari",
  seoDescription: "Il gestionale per piccole imprese edili e artigiani con 1-10 dipendenti: fattura elettronica, preventivi in 10 minuti, SAL e F24 senza stress.",
  seoKeywords: "software piccole imprese edili, gestionale artigiani edili, software muratori, fattura elettronica edilizia, preventivo a forfait, SAL semplificato, F24 edilizia, INAIL INPS edile, software imbianchino",
  seoCanonical: "/per/piccole-imprese",

  // Hero
  badge: "Per Piccole Imprese Edili e Artigiani",
  heroTitle: (
    <>
      <span className="text-white">Anche tu fai le fatture</span>{" "}
      <span className="text-[#F97415]">la domenica sera?</span>
    </>
  ),
  heroSubtitle:
    "Sei in 3-4 persone. Il cantiere lo gestisci tu. Le fatture le fai tu. I preventivi li scrivi a mano. La domenica sera finisci con Excel e la pila di scontrini davanti. Con Edilizia in Cloud la burocrazia si fa in 30 minuti al giorno — e tu torni a essere un imprenditore, non un impiegato.",
  heroImage: "/hero/stock/cantiere-1504307651254-1400.webp",

  // Social proof
  socialProof: [
    { initials: "LC", name: "Conti Murature", city: "Bergamo", months: 16, gradient: "from-[#F97415] to-[#0d8f79]" },
    { initials: "MR", name: "Rossi Imbianchino", city: "Milano", months: 8, gradient: "from-[#111111] to-[#F97415]" },
    { initials: "EF", name: "Edil Fontana", city: "Brescia", months: 12, gradient: "from-[#0d8f79] to-[#111111]" },
    { initials: "GT", name: "Grandi Tinteggiature", city: "Torino", months: 6, gradient: "from-[#1a1a2e] to-[#F97415]" },
  ],

  // Problems
  problemsTitle: "Sai davvero quanto hai guadagnato questo mese?",
  problemsSubtitle:
    "Se ci devi pensare su, il problema è già lì. Questi sono i quattro problemi che ci raccontano quasi tutti gli artigiani edili che incontriamo.",
  problems: [
    {
      emoji: "⏰",
      title: "La burocrazia ti ruba ore di cantiere ogni giorno",
      desc: "Fatture elettroniche SDI, DDT, F24, buste paga, INAIL, INPS edile: ogni documento richiede tempo che non hai. Finisci in cantiere alle 18, e devi ancora fare l'ufficio. La domenica sera è diventata il tuo secondo turno.",
    },
    {
      emoji: "💰",
      title: "Non sai mai quanto hai guadagnato davvero",
      desc: "Sai quanto hai incassato. Ma i costi dei materiali, il subappalto, il carburante, i contributi INPS edile? Il guadagno netto reale lo scopri solo quando arriva il commercialista — e spesso non è quello che speravi.",
    },
    {
      emoji: "📝",
      title: "I preventivi lenti ti fanno perdere lavori buoni",
      desc: "Il cliente ti chiama, vuole un preventivo a forfait entro domani. Tu ci metti tre giorni perché lo fai a mano su Word. Nel frattempo ha già chiamato qualcun altro. I preventivi veloci e professionali fanno la differenza tra prendere o perdere il lavoro.",
    },
    {
      emoji: "😰",
      title: "I clienti pagano quando vogliono — e la cassa è sempre corta",
      desc: "Paghi i materiali prima di iniziare. Emetti SAL a metà lavoro e aspetti. Il saldo arriva dopo 60-90 giorni. In mezzo ci sono buste paga, F24 e spese fisse. Spesso non sai se ce la fai ad arrivare a fine mese.",
    },
  ],

  // ROI
  roi: {
    lossValue: "€ 8.000",
    lossLabel: "in lavori persi per preventivi lenti o non inviati",
    wasteValue: "€ 7.800",
    wasteLabel: "ore su burocrazia, F24, fatture, scadenze fiscali",
    errorValue: "€ 4.200",
    errorLabel: "in errori di fatturazione e pagamenti non riscossi",
    totalLoss: "€ 20.000",
    softwareCost: "€ 1.188",
    roiX: "17x",
  },

  // Transformation
  transformation: {
    title: "Prima e dopo: la differenza è concreta",
    subtitle:
      "Non ti chiediamo di cambiare il modo di lavorare. Ti chiediamo solo di non perdere più tempo su cose che può fare un software.",
    fromTitle: "Prima: il solito stress",
    fromItems: [
      "Fatture elettroniche fatte la domenica sera quando si è già stanchi morti",
      "F24 dimenticati con relative sanzioni — il commercialista che chiama arrabbiato",
      "Preventivi scritti a mano su Word o su un foglio, inviati dopo 3 giorni",
      "Guadagno netto reale: mistero assoluto fino alla chiusura annuale",
      "DDT e bolle cartacee da archiviare in una scatola che non trovi mai",
      "Scadenze INAIL e INPS edile che saltano perché nessuno le ricorda",
    ],
    toTitle: "Dopo: testa libera",
    toItems: [
      "Fatturazione elettronica SDI automatica: emetti la fattura in 2 click dal telefono, anche dal cantiere",
      "Scadenze F24, INAIL e INPS edile notificate in anticipo — mai più sanzioni",
      "Preventivo a forfait in 10 minuti dallo smartphone, con prezziario DEI integrato",
      "Sai ogni giorno quanto hai guadagnato su ogni lavoro, in tempo reale",
      "DDT digitali allegati automaticamente alla commessa — archivio sempre in ordine",
      "Il commercialista riceve tutto in un export pulito — zero telefonate di panico",
    ],
  },

  // Stats
  stats: [
    {
      value: "−3h",
      label: "Al giorno di burocrazia in meno",
      sublabel: "Tempo che torna al cantiere o alla famiglia",
    },
    {
      value: "+2",
      label: "Lavori a settimana accettati in più",
      sublabel: "Perché i preventivi escono in 10 minuti, non in 3 giorni",
    },
    {
      value: "Sempre",
      label: "Sai quanto guadagni davvero",
      sublabel: "Guadagno netto in tempo reale, non a fine anno",
    },
  ],

  // Modules
  modulesTitle: "Solo quello che ti serve — niente di inutile",
  modulesSubtitle:
    "Abbiamo parlato con centinaia di artigiani edili. Questi sono i moduli che usano ogni giorno e che fanno davvero la differenza.",
  modules: [
    {
      icon: FileText,
      name: "Fatturazione Elettronica SDI",
      desc: "Emetti fatture elettroniche conformi SDI direttamente dal telefono in cantiere. Ciclo attivo e passivo, split payment, ritenuta d'acconto: tutto gestito. Il commercialista riceve l'export pronto.",
      saving: "Fattura in 2 click dal cantiere",
    },
    {
      icon: Calculator,
      name: "Preventivi a Forfait in 10 Minuti",
      desc: "Prezziario DEI integrato e aggiornato. Scegli le voci di lavoro, inserisci le quantità, applica la tua percentuale e il preventivo è pronto in PDF da inviare via WhatsApp. Anche dal telefono.",
      saving: "Da 3 giorni a 10 minuti",
    },
    {
      icon: Clock,
      name: "Scadenze Fiscali Notificate",
      desc: "F24, INAIL, INPS edile, DURC, scadenze contributive: il sistema le conosce tutte e ti avvisa in anticipo con notifica push. Mai più sanzioni per dimenticanza.",
      saving: "Zero sanzioni per ritardo",
    },
    {
      icon: Smartphone,
      name: "Tutto dal Telefono",
      desc: "Preventivi, fatture, DDT, foto cantiere, note di spesa: tutto dall'app mobile. Funziona anche offline in cantiere. Quando torni in zona con segnale, si sincronizza da solo.",
      saving: "Ufficio in tasca, sempre",
    },
    {
      icon: BarChart3,
      name: "SAL e Controllo Commessa",
      desc: "Apri una commessa, registra i costi (materiali, subappalto, operai) man mano che avanzano i lavori. Emetti il SAL in un click. Vedi il margine netto in tempo reale su ogni cantiere.",
      saving: "Sai sempre se stai guadagnando",
    },
    {
      icon: Users,
      name: "Gestione Operai e Presenze",
      desc: "Registra le presenze dei tuoi operai dal cantiere, assegna le giornate per commessa e genera i dati pronti per il consulente del lavoro. Addio foglietti e chiamate dell'ultimo momento.",
      saving: "Buste paga senza impazzire",
    },
  ],

  // Sezione AI: cosa fa Silvio per un piccolo artigiano edile.
  aiShowcase: {
    title: "L'AI che ti fa l'ufficio mentre tu sei in cantiere",
    subtitle:
      "Silvio coordina 19 persone AI specializzate che leggono i dati della tua azienda e agiscono. Per un piccolo artigiano edile significa questo:",
    actions: [
      {
        icon: TrendingDown,
        tag: "Margini",
        title: "Ti dice subito se un lavoro sta rendendo",
        desc: "Registri i costi man mano (materiali, ore, subappalto) e Silvio ti avvisa se un cantiere sta scendendo sotto il margine che ti eri messo in tasca col preventivo — mentre puoi ancora rimediare, non a saldo.",
      },
      {
        icon: Send,
        tag: "Cassa",
        title: "Prepara i solleciti per chi non paga",
        desc: "SAL emesso e saldo che non arriva? Silvio prepara il sollecito con il tono giusto — WhatsApp o email — e te lo mette in firma. Tu approvi, lui invia. La cassa la rincorri molto meno.",
      },
      {
        icon: Camera,
        tag: "Campo",
        title: "Foto e nota vocale → preventivo o rapportino",
        desc: "Fai una foto al lavoro da fare e detti due parole: Silvio ti prepara la bozza di preventivo o il rapportino di giornata, pronti da rivedere. Niente più Word la domenica sera.",
      },
      {
        icon: Sparkles,
        tag: "Scadenze",
        title: "Ti ricorda F24, DURC e contributi",
        desc: "Silvio tiene d'occhio il calendario fiscale e ti avvisa prima che scada F24, DURC, INAIL o INPS edile — così non prendi più sanzioni per dimenticanza e il commercialista non ti chiama arrabbiato.",
      },
    ],
    note: "Non una chat generica: ogni risposta nasce dai dati reali della tua azienda — lavori, costi, incassi, scadenze.",
  },

  // Ampiezza piattaforma: tutto il resto, già incluso.
  platformExtra: {
    title: "E tutto il resto? Già incluso.",
    subtitle:
      "Non devi comprare cinque programmi diversi: dentro Edilizia in Cloud c'è tutto quello che serve a un piccolo artigiano edile, nello stesso posto e dallo stesso telefono.",
    items: [
      {
        icon: Receipt,
        name: "Fatturazione elettronica",
        desc: "Fatture SDI attive e passive, note di credito, split payment e ritenuta: emetti dal telefono, l'export per il commercialista è pronto.",
      },
      {
        icon: Wallet,
        name: "Cassa e scadenzario",
        desc: "Incassi attesi e spese fisse in un colpo d'occhio: sai in anticipo se questo mese la cassa tiene o serve sollecitare.",
      },
      {
        icon: Users,
        name: "Clienti e preventivi",
        desc: "Rubrica clienti, storico lavori e preventivi a forfait con prezziario DEI: sai sempre chi richiamare e cosa hai già quotato.",
      },
      {
        icon: Warehouse,
        name: "Materiali e DDT",
        desc: "Tieni traccia di materiali e DDT collegati al lavoro: niente più scontrini sparsi nel cruscotto del furgone.",
      },
      {
        icon: FolderOpen,
        name: "Documenti e scadenze",
        desc: "DURC, certificazioni, contratti e garanzie archiviati per lavoro: li trovi in 5 secondi quando il cliente li chiede.",
      },
      {
        icon: BarChart3,
        name: "Report semplici",
        desc: "Quanto hai fatturato, quanto hai guadagnato, cosa devi incassare: i numeri che contano, senza Excel.",
      },
    ],
  },

  // Case Study
  caseStudy: {
    company: "Murature e Rivestimenti Conti",
    city: "Bergamo",
    sector: "Piccola impresa edile — murature, intonaci, rivestimenti",
    revenue: "180.000 €",
    person: "Luca Conti",
    role: "Titolare e artigiano",
    initials: "LC",
    gradient: "from-[#F97415] to-[#0d8f79]",
    quote:
      "Ero uno di quelli che faceva le fatture la domenica sera. Ci perdevo 2-3 ore, sbagliavo, rifacevo. Ora le faccio dal telefono mentre sono ancora in macchina davanti al cantiere. Ma la cosa che mi ha cambiato di più è sapere ogni giorno quanto ho guadagnato davvero su ogni lavoro — prima non lo sapevo mai.",
    metrics: [
      { label: "Preventivi evasi a settimana", before: "2 (fatti la sera su Word)", after: "6-7 dal telefono" },
      { label: "Tempo su burocrazia al giorno", before: "3 ore", after: "meno di 30 minuti" },
      { label: "Sanzioni per scadenze dimenticate", before: "2-3 all'anno", after: "0" },
      { label: "Fatturato annuo", before: "130.000 €", after: "180.000 €" },
    ],
  },

  // FAQ
  faq: [
    {
      q: "È complicato da usare per chi non è esperto di computer?",
      a: "No. Se sai usare WhatsApp, sai usare Edilizia in Cloud. L'app è pensata per chi lavora in cantiere con le mani, non per gli informatici. Il nostro team ti configura tutto in 48 ore e ti fa una demo guidata senza termini tecnici. Hai sempre un numero diretto a cui chiamare.",
    },
    {
      q: "Gestisce davvero la fatturazione elettronica SDI?",
      a: "Sì, completamente. Emetti fatture elettroniche B2B e B2C conformi SDI direttamente dall'app. Gestisce ciclo attivo, ciclo passivo (fatture fornitori), note di credito, split payment e ritenuta d'acconto. L'export per il commercialista è pronto con un click.",
    },
    {
      q: "Posso usarlo anche per gestire preventivi a forfait e lavori in economia?",
      a: "Sì. Puoi creare preventivi a forfait con voci fisse oppure preventivi a consuntivo per lavori in economia, con le ore e i materiali registrati man mano. Il prezziario DEI è integrato e aggiornato. Mandi il preventivo in PDF via WhatsApp direttamente dall'app.",
    },
    {
      q: "Mi notifica le scadenze F24, INAIL e INPS edile?",
      a: "Sì. Il sistema conosce il calendario fiscale completo: F24, INAIL, INPS edile, DURC e versamenti contributivi. Ti manda una notifica push sul telefono con qualche giorno di anticipo, così non dimentichi mai nulla e non prendi sanzioni.",
    },
    {
      q: "Posso integrarlo con il mio commercialista?",
      a: "Sì. Il commercialista può accedere in sola lettura con le sue credenziali e scaricare l'export contabile in formato compatibile con i principali software di contabilità (Zucchetti, TeamSystem, ecc.). Zero telefonate di panico a fine trimestre.",
    },
    {
      q: "Costa troppo per una piccola impresa con 2-3 operai?",
      a: "Il piano per piccole imprese parte da 79 euro al mese. Se ti fa risparmiare anche solo 2-3 ore di burocrazia a settimana, si ripaga da solo. E se non ti fa guadagnare di più entro il primo anno, il programma è gratis per sempre — è la nostra garanzia.",
    },
  ],

  verticalFeatures: [
    {
      icon: FileText,
      problem: "Fattura elettronica SDI: ogni mese è una sofferenza tra XML, codici e rigetti",
      solution: "Con Edilizia in Cloud crei la fattura elettronica in 3 clic: cliente, importo, IVA. Il sistema genera l'XML FatturaPA 1.2 e la invia automaticamente all'SDI tramite Aruba. Ricevi la ricevuta direttamente nella dashboard. Nessun software di terze parti. Nessun commercialista per le fatture ordinarie.",
      economicBenefit: "−3h/mese",
      benefitLabel: "di tempo su fatturazione elettronica e riconciliazioni",
    },
    {
      icon: Calculator,
      problem: "Preventivi scritti a mano: sbagliati, lenti, e il cliente li confronta con altri",
      solution: "Il preventivo si crea in 10 minuti: seleziona le lavorazioni dal listino personalizzato, inserisci le quantità, il sistema calcola tutto. Il PDF professionale viene inviato via link al cliente — che lo legge, approva e firma digitalmente dal telefono. Senza carta.",
      economicBenefit: "×2,5 preventivi",
      benefitLabel: "mandati nella stessa settimana rispetto a prima",
    },
    {
      icon: BarChart3,
      problem: "Non sai quanto hai guadagnato questo mese — lo scopri quando chiami il commercialista",
      solution: "Il cruscotto semplificato mostra: fatturato del mese, spese registrate, margine stimato, fatture da incassare. Aggiornato ogni volta che inserisci un costo o emetti una fattura. Nessun Excel. Nessuna telefonata al commercialista per sapere 'come stiamo'.",
      economicBenefit: "€ 1.200",
      benefitLabel: "risparmiati l'anno in consulenze commercialista evitabili",
    },
    {
      icon: Smartphone,
      problem: "Devi essere sempre reperibile — anche in cantiere, anche il sabato",
      solution: "L'app mobile ti permette di emettere una fattura, inviare un preventivo, o controllare un incasso direttamente dal telefono — anche offline. Sei in cantiere? Fai una foto, aggiungi il costo materiali, salva. Ci vogliono 60 secondi. La domenica puoi stare con la famiglia.",
      economicBenefit: "−8h/sett",
      benefitLabel: "di burocrazia fatta fuori orario di lavoro",
    },
  ],
  verticalFeaturesTitle: "Fatture, preventivi, cantieri: tutto in 30 minuti al giorno",
  verticalFeaturesSubtitle: "Pensato per chi lavora da solo o con pochi dipendenti. Semplice abbastanza da usare dal telefono. Completo abbastanza da tenerti fuori dai guai con il fisco.",
  demoLabel: "Vedi come un artigiano edile con 3 dipendenti azzera la burocrazia del weekend e torna a fare l'imprenditore",

  // CTA
  ctaTitle: (
    <>
      <span className="text-white">La domenica sera</span>{" "}
      <span className="text-[#F97415]">torna tua.</span>
    </>
  ),
  ctaSubtitle:
    "30 minuti di demo: ti mostriamo come gestire fatture, preventivi e cantieri in meno di 30 minuti al giorno. Nessun contratto. Cancella quando vuoi.",

  // Schema FAQ
  schemaFaq: [
    {
      q: "Qual è il miglior software per piccole imprese edili e artigiani?",
      a: "Edilizia in Cloud è il gestionale più semplice per piccole imprese edili e artigiani: fatturazione elettronica SDI da smartphone, preventivi in 10 minuti, scadenze fiscali notificate, SAL semplificato e controllo margini in tempo reale.",
    },
    {
      q: "Un artigiano edile ha bisogno di un gestionale?",
      a: "Sì. Un gestionale semplice come Edilizia in Cloud permette a un artigiano edile di fare preventivi veloci, emettere fatture elettroniche SDI dal telefono, non dimenticare mai F24 e INAIL e sapere ogni giorno quanto ha guadagnato davvero — senza aspettare il commercialista.",
    },
    {
      q: "Come gestisce le scadenze fiscali per artigiani edili?",
      a: "Edilizia in Cloud conosce tutte le scadenze: F24, INAIL, INPS edile, DURC. Ti notifica in anticipo sul telefono così non dimentichi mai nulla e non prendi sanzioni.",
    },
  ],
};

export default function PiccoleImprese() {
  return <PerTipoPageTemplate config={config} />;
}
