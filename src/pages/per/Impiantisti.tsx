import {
  Wrench, Package, Clock, FileText, BarChart3, Smartphone,
  Wallet, TrendingDown, Send, Camera, Sparkles, Receipt, Users, Warehouse, FolderOpen,
} from "lucide-react";
import PerTipoPageTemplate, { PerTipoConfig } from "@/components/landing/PerTipoPageTemplate";

const config: PerTipoConfig = {
  seoTitle: "Software per Impiantisti | Più Margini, Più Controllo, Zero Caos",
  seoDescription: "Il gestionale per impiantisti con AI: margine reale per intervento, fatturazione lo stesso giorno, magazzino furgone sempre giusto e tecnici in campo coordinati senza telefonate.",
  seoKeywords: "software gestionale impiantisti, gestionale idraulici, software elettricisti, gestionale termoidraulico, software interventi impianti, gestione tecnici campo, magazzino ricambi impiantisti, ordine di lavoro digitale, software manutenzione impianti",
  seoCanonical: "/per/impiantisti",

  badge: "Impiantisti — Idraulici, Elettricisti & HVAC",

  heroTitle: (
    <>
      <span className="text-white">Aumenta i margini. Blinda la cassa.</span>{" "}
      <span className="text-[#F97415]">Il gestionale con AI per chi manda tecnici in campo.</span>
    </>
  ),
  heroSubtitle:
    "Non è solo un'app per i tecnici: è il sistema che governa tutta l'azienda. Il margine reale di ogni intervento lo vedi mentre lavori — ore di trasferta e collaudo comprese (+12% medio) — la fattura parte il giorno stesso (incassi 3 settimane prima), il magazzino furgone è sempre giusto. Con l'AI che ti avvisa prima che un'ora non fatturata diventi margine perso.",
  heroImage:
    "https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=1400&q=80",

  socialProof: [
    { initials: "TT", name: "TernoTecnica SRL", city: "Verona", months: 11, gradient: "from-[#111111] to-[#243566]" },
    { initials: "IM", name: "Impianti Marini", city: "Padova", months: 18, gradient: "from-[#1a1a2e] to-[#0f3460]" },
    { initials: "EF", name: "Elettrica Fabbri", city: "Bologna", months: 6, gradient: "from-[#2d6a4f] to-[#1b4332]" },
    { initials: "CS", name: "Clima & Servizi", city: "Milano", months: 24, gradient: "from-[#6b21a8] to-[#4c1d95]" },
  ],

  problemsTitle: "Il vero problema non è far girare i tecnici — è non perdere margine a ogni intervento.",
  problemsSubtitle:
    "Gli interventi li chiudi. I clienti pagano. Ma a fine mese i conti non tornano come dovrebbero: ore regalate, fatture in ritardo, magazzino fuori controllo. Ecco dove se ne va il margine.",

  roi: {
    lossValue: "€ 18.000",
    lossLabel: "in ore tecnico non fatturate e margini persi per intervento",
    wasteValue: "€ 9.360",
    wasteLabel: "ore admin su ordini, burocrazia e coordinamento tecnici",
    errorValue: "€ 6.500",
    errorLabel: "in ricambi sbagliati, viaggi a vuoto e magazzino fuori controllo",
    totalLoss: "€ 33.860",
    softwareCost: "€ 2.388",
    roiX: "14x",
  },

  problems: [
    {
      emoji: "⏱️",
      title: "Ore lavorate non tracciate, non fatturate",
      desc: "Trasferte, straordinari, ore di collaudo, attese in cantiere: chi le registra? Di solito nessuno. Quelle ore diventano costo d'azienda invece di riga in fattura — e il margine dell'intervento se ne va in silenzio, fino a fine mese quando è troppo tardi.",
    },
    {
      emoji: "🏦",
      title: "Fatturi settimane dopo l'intervento — e la cassa è sempre tesa",
      desc: "Il tecnico chiude l'intervento, il foglio di lavoro torna in ufficio, la fattura si emette 'quando c'è tempo' — tre settimane dopo, se ti ricordi. Intanto hai già pagato i ricambi e gli stipendi. La cassa la rincorri ogni mese invece di tenerla sotto controllo.",
    },
    {
      emoji: "🔧",
      title: "I tecnici chiamano ogni cinque minuti",
      desc: "Dove vado dopo? Che pezzo serve? Come metto a norma questo impianto? Sei tu il collo di bottiglia della tua azienda. Ogni telefonata ti interrompe, rallenta i lavori in corso e ti impedisce di guardare i numeri che contano.",
    },
    {
      emoji: "📦",
      title: "Magazzino ricambi sempre sbagliato",
      desc: "Il tecnico arriva dal cliente senza il pressostato giusto. Torna in magazzino, perde due ore, il cliente è scocciato e tu hai perso un pomeriggio di lavoro fatturabile. Le scorte non vengono mai aggiornate in tempo reale.",
    },
  ],

  transformation: {
    title: "Come cambia la giornata dei tuoi tecnici — e i tuoi conti",
    subtitle: "Non stiamo parlando di automazione futuristica. Stiamo parlando di non regalare ore e di incassare quando hai finito il lavoro.",
    fromTitle: "Senza Edilizia in Cloud",
    fromItems: [
      "Ore lavorate non tracciate, trasferte e collaudi assorbiti come costo",
      "Fattura emessa 3 settimane dopo l'intervento — se ci ricordi",
      "Magazzino gestito 'a occhio' — parti sempre senza il pezzo giusto",
      "I tecnici chiamano ogni mattina per sapere dove andare",
      "Ordini di lavoro su carta: li perdi, li ritrovi sgualciti, li riscrivi",
      "Le certificazioni di collaudo sono in una cartella fisica da qualche parte",
    ],
    toTitle: "Con Edilizia in Cloud",
    toItems: [
      "Timesheet automatico: ore, trasferte e materiali imputati alla commessa — margine reale per intervento",
      "Fattura generata automaticamente alla chiusura: incassi 3 settimane prima",
      "Magazzino aggiornato in real-time — furgone e magazzino centrale sincronizzati",
      "Ordine di lavoro digitale sull'app: il tecnico sa già tutto prima di partire",
      "Storia completa di ogni intervento: foto, firme cliente, materiali usati",
      "Certificazioni e collaudi digitalizzati, archiviati e sempre rintracciabili",
    ],
  },

  stats: [
    { value: "+12%", label: "margine per intervento", sublabel: "ore di trasferta e collaudo finalmente fatturate" },
    { value: "−21gg", label: "tempo di incasso", sublabel: "fattura generata alla chiusura dell'intervento" },
    { value: "+3", label: "interventi al giorno", sublabel: "gestiti con lo stesso numero di tecnici" },
  ],

  modulesTitle: "I moduli pensati per come lavora davvero un'impresa impiantistica",
  modulesSubtitle:
    "Dal margine reale dell'intervento alla cassa, dal magazzino furgone all'app del tecnico: tutto in un unico sistema usato dai tuoi tecnici in campo.",

  modules: [
    {
      icon: BarChart3,
      name: "Margine per Intervento in Tempo Reale",
      desc: "Ogni ora, trasferta, materiale e ricambio viene imputato all'intervento. Vedi il margine reale mentre lavori — non a fine mese. Capisci quali interventi rendono e quali ti costano, e regoli i prezzi di conseguenza.",
      saving: "+12% margine medio per intervento",
    },
    {
      icon: Wallet,
      name: "Cassa e Fatturazione Post-Intervento",
      desc: "Alla chiusura dell'ordine di lavoro il sistema genera la bozza fattura con manodopera, materiali e trasferta. Tu approvi e invii in un click. Lo scadenzario tiene traccia di incassi attesi e contratti di manutenzione a canone: cassa prevista a 30, 60 e 90 giorni.",
      saving: "Incassi 3 settimane prima",
    },
    {
      icon: Clock,
      name: "Timesheet Automatico",
      desc: "Ore di intervento, trasferta, collaudo e straordinario registrate automaticamente dall'app e imputate alla commessa giusta. Nessuna perdita di ore fatturabili, nessun margine regalato.",
      saving: "0 ore perse non fatturate",
    },
    {
      icon: Wrench,
      name: "Ordini di Lavoro Digitali",
      desc: "Crea e assegna ordini di lavoro con indirizzo, tipo di impianto, storico interventi e materiali previsti. Il tecnico vede tutto sull'app prima di partire dal magazzino. Zero telefonate.",
      saving: "+2 interventi al giorno",
    },
    {
      icon: Package,
      name: "Magazzino Ricambi & Furgone",
      desc: "Traccia ogni pezzo: magazzino centrale, furgone tecnico 1, furgone tecnico 2. Quando un pezzo viene usato in intervento, si scala automaticamente. Alert quando scendi sotto la scorta minima.",
      saving: "Zero uscite a vuoto",
    },
    {
      icon: Smartphone,
      name: "App Tecnico Offline + Contratti Manutenzione",
      desc: "L'app funziona anche senza connessione — fondamentale per scantinati e zone industriali. Gestisce anche i contratti di manutenzione ricorrente con scadenze, canoni e rinnovi: entrate ricorrenti pianificate, zero dimenticanze.",
      saving: "Entrate ricorrenti garantite",
    },
  ],

  aiShowcase: {
    title: "L'AI che lavora per te, anche quando hai i tecnici sparsi in città",
    subtitle:
      "Silvio coordina 19 persone AI specializzate che leggono i dati della tua azienda e agiscono. Per un'impresa impiantistica significa questo:",
    actions: [
      {
        icon: TrendingDown,
        tag: "Margini",
        title: "Ti avvisa quando un intervento non rende",
        desc: "Troppe ore rispetto al preventivato, troppi km di trasferta, ricambi sopra il previsto: se il margine dell'intervento scende sotto la tua soglia, Silvio ti avvisa subito — non a fine mese quando il danno è fatto.",
      },
      {
        icon: Send,
        tag: "Cassa",
        title: "Prepara fatture e solleciti d'incasso",
        desc: "Intervento chiuso? Silvio ti mette in firma la bozza di fattura. Incasso in ritardo o canone di manutenzione scaduto? Prepara il sollecito con il tono giusto — email o WhatsApp. Tu approvi, lui invia.",
      },
      {
        icon: Camera,
        tag: "Campo",
        title: "Trasforma foto e vocali in rapportini d'intervento",
        desc: "Il tecnico carica le foto e una nota vocale dal posto: Silvio genera il rapportino, compila la certificazione di collaudo e collega tutto all'intervento giusto — pronto da far firmare al cliente.",
      },
      {
        icon: Sparkles,
        tag: "Vendita",
        title: "Rinforza preventivi e contratti di manutenzione",
        desc: "Riscrive la proposta puntando sul valore del servizio e sulla messa a norma, prepara il follow-up dei preventivi fermi e ti ricorda i contratti di manutenzione da rinnovare — prima che il cliente cambi fornitore.",
      },
    ],
    note: "Non una chat generica: ogni risposta nasce dai dati reali della tua azienda — interventi, tecnici, magazzino, incassi, contratti.",
  },

  platformExtra: {
    title: "E tutto il resto dell'azienda? Già incluso.",
    subtitle:
      "Non devi incollare cinque software diversi: dentro Edilizia in Cloud c'è tutto quello che serve a un'impresa impiantistica, collegato nello stesso posto.",
    items: [
      {
        icon: Receipt,
        name: "Fatturazione elettronica",
        desc: "Fatture SDI attive e passive, fatture intervento e canoni di manutenzione, bozze pronte da approvare.",
      },
      {
        icon: Wallet,
        name: "Cassa e scadenzario",
        desc: "Incassi attesi, pagamenti fornitori di ricambi: la cassa prevista a 30, 60 e 90 giorni.",
      },
      {
        icon: Users,
        name: "CRM e pipeline vendite",
        desc: "Richieste, preventivi e contratti di manutenzione in un'unica pipeline: sai sempre chi richiamare e quando.",
      },
      {
        icon: Warehouse,
        name: "Magazzino e DDT",
        desc: "Ricambi per furgone e magazzino centrale con scorte tracciate, DDT di entrata e uscita collegati agli interventi.",
      },
      {
        icon: FolderOpen,
        name: "Documenti e scadenze",
        desc: "Certificazioni di conformità, collaudi e schede tecniche archiviati per impianto: trovi tutto in 5 secondi.",
      },
      {
        icon: BarChart3,
        name: "Report per decidere",
        desc: "Fatturato, margini per tecnico e per tipo di intervento, previsioni: i numeri dell'azienda in una schermata.",
      },
    ],
  },

  caseStudy: {
    company: "TernoTecnica S.r.l.",
    city: "Verona",
    sector: "Impianti idraulici, termici e HVAC",
    revenue: "780K €",
    person: "Marco Bianchi",
    role: "Titolare",
    initials: "MB",
    gradient: "from-[#111111] to-[#243566]",
    quote:
      "Prima avevo 4 tecnici e non sapevo mai dove fossero o cosa stessero facendo davvero. Ogni mattina era un casino di telefonate, e a fine mese le ore di trasferta sparivano. Adesso aprono l'app, vedono gli interventi del giorno con tutto il necessario, e io vedo in tempo reale chi è dove, il margine di ogni intervento e cosa devo ancora incassare. Siamo passati da 6 a 9 interventi al giorno con le stesse persone — e finalmente le ore le fatturo tutte.",
    metrics: [
      { label: "Interventi chiusi al giorno", before: "6", after: "9" },
      { label: "Telefonate tecnici → ufficio", before: "~18/giorno", after: "~3/giorno" },
      { label: "Ore burocrazia settimanali", before: "14h", after: "5h" },
    ],
    image: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=800&q=80",
  },

  faq: [
    {
      q: "Come funziona la gestione dei tecnici in campo con l'app?",
      a: "Ogni tecnico scarica l'app sul proprio telefono e vede la sua agenda con gli ordini di lavoro assegnati. Per ogni intervento trova indirizzo, tipo di impianto, storico clienti, materiali previsti e istruzioni. Quando finisce, carica le foto, fa firmare il cliente e chiude l'ordine in 2 minuti.",
    },
    {
      q: "Come faccio a sapere se un intervento è andato in perdita?",
      a: "Il sistema imputa a ogni intervento le ore (lavoro, trasferta, collaudo, straordinario), i materiali e i ricambi usati dal furgone. Confronta il tutto con il preventivo e ti mostra il margine reale in tempo reale. Se un intervento scende sotto la soglia che hai impostato, ricevi un avviso — così puoi correggere il tiro sui prezzi prima del prossimo.",
    },
    {
      q: "Come funziona la fatturazione dopo un intervento di pronto intervento?",
      a: "Appena il tecnico chiude l'ordine di lavoro, il sistema genera automaticamente la bozza di fattura con ore, materiali usati e trasferta calcolata. Tu ricevi una notifica, controlli e invii in un click — anche dal cellulare. Mediamente i nostri clienti fatturano entro 24 ore dall'intervento.",
    },
    {
      q: "L'app funziona offline? I miei tecnici lavorano spesso in zone senza segnale.",
      a: "Sì. L'app è progettata per funzionare completamente offline: gli ordini di lavoro vengono scaricati automaticamente al mattino, i tecnici lavorano normalmente senza connessione, e tutto si sincronizza appena tornano in zona con segnale. Fondamentale per chi lavora in capannoni, scantinati o zone industriali.",
    },
  ],

  verticalFeatures: [
    {
      icon: Clock,
      problem: "Ore di trasferta, collaudo, attesa: nessuno le registra — e non vengono fatturate",
      solution: "Il timesheet parte automaticamente quando il tecnico arriva sul posto e si chiude quando firma la fine intervento. Ore, trasferta e straordinario vengono imputati alla commessa. Nessuna ora persa. Nessuna perdita in fattura.",
      economicBenefit: "€ 9.360",
      benefitLabel: "di ore non fatturate recuperate ogni anno",
    },
    {
      icon: BarChart3,
      problem: "Contratti di manutenzione: le scadenze si dimenticano, i rinnovi si perdono, la cassa ricorrente sfuma",
      solution: "Il modulo manutenzioni gestisce i contratti ricorrenti con scadenzario automatico, alert pre-scadenza, SAL periodici e fatturazione automatica a canone. Le entrate ricorrenti sono pianificate. Zero dimenticanze.",
      economicBenefit: "−100%",
      benefitLabel: "contratti manutenzione persi per scadenza dimenticata",
    },
    {
      icon: Wrench,
      problem: "Ordini di lavoro su WhatsApp: il tecnico arriva senza le informazioni giuste",
      solution: "Crea l'ordine di lavoro in 2 minuti: indirizzo, tipo impianto, storico interventi, materiali previsti, note tecniche. Il tecnico lo vede sull'app prima di partire. Alla chiusura carica foto e fa firmare il cliente. Zero telefonate.",
      economicBenefit: "+3 interventi/gg",
      benefitLabel: "con lo stesso numero di tecnici",
    },
    {
      icon: Package,
      problem: "Magazzino ricambi: il tecnico arriva senza il pezzo giusto, torna indietro, perdi 2 ore",
      solution: "Ogni pezzo è tracciato: magazzino centrale + magazzino furgone tecnico. Quando un ricambio viene usato in un intervento, si scala automaticamente. Alert quando scendi sotto la scorta minima. Zero uscite a vuoto.",
      economicBenefit: "€ 6.500",
      benefitLabel: "risparmiati l'anno in viaggi a vuoto e ricambi sbagliati",
    },
  ],
  verticalFeaturesTitle: "Gestionale impiantisti: margine per intervento, cassa incassata, tecnici coordinati",
  verticalFeaturesSubtitle: "Non un CRM. Non un calendario. Un sistema operativo completo costruito attorno ai margini che scappano nelle ore non fatturate, alla cassa che tarda e ai tecnici da coordinare ogni giorno.",
  demoLabel: "Vedi come un'impresa con 8 tecnici in campo fattura ogni ora, incassa prima e aumenta gli interventi del 30%",

  ctaTitle: (
    <>
      <span className="text-white">Ogni ora fatturata. Cassa incassata.</span>{" "}
      <span className="text-[#F97415]">Più interventi che rendono davvero.</span>
    </>
  ),
  ctaSubtitle:
    "30 minuti di demo: ti mostriamo come un tuo tecnico userebbe l'app domani mattina — e quanto margine e cassa recuperi già questa settimana.",

  schemaFaq: [
    {
      q: "Qual è il miglior software gestionale per impiantisti?",
      a: "Edilizia in Cloud è il gestionale per impiantisti con AI più completo in Italia: margine reale per intervento, fatturazione automatica post-intervento con cassa a 90 giorni, magazzino ricambi per furgone, app tecnico offline e contratti di manutenzione ricorrente.",
    },
    {
      q: "Come gestire i tecnici in campo con un software per impiantisti?",
      a: "Con l'app mobile i tecnici ricevono gli ordini di lavoro con tutto il necessario, aggiornano lo stato intervento, registrano le ore e i materiali usati e fanno firmare il cliente. L'ufficio vede in tempo reale margini, incassi e posizione dei tecnici senza telefonate.",
    },
  ],
};

export default function Impiantisti() {
  return <PerTipoPageTemplate config={config} />;
}
