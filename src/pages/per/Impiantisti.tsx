import { Wrench, Package, Clock, FileText, BarChart3, Smartphone } from "lucide-react";
import PerTipoPageTemplate, { PerTipoConfig } from "@/components/landing/PerTipoPageTemplate";

const config: PerTipoConfig = {
  seoTitle: "Software Gestionale per Impiantisti — Idraulici, Elettricisti, HVAC | Edilizia in Cloud",
  seoDescription: "Il gestionale per impiantisti con AI: gestisci ordini di lavoro, magazzino ricambi, tecnici in campo e fatturazione da smartphone. Meno burocrazia, più interventi al giorno. Prova gratis.",
  seoKeywords: "software gestionale impiantisti, gestionale idraulici, software elettricisti, gestionale termoidraulico, software interventi impianti, gestione tecnici campo, magazzino ricambi impiantisti, ordine di lavoro digitale, software manutenzione impianti",
  seoCanonical: "/per/impiantisti",

  badge: "Impiantisti — Idraulici, Elettricisti & HVAC",

  heroTitle: (
    <>
      <span className="text-white">Meno telefonate, meno carta,</span>{" "}
      <span className="text-[#F97415]">più interventi che rendono.</span>
    </>
  ),
  heroSubtitle:
    "I tuoi tecnici passano metà della giornata ad aspettare istruzioni o a tornare in magazzino per un pezzo mancante. Con Edilizia in Cloud ogni tecnico sa dove andare, cosa portare e cosa fare — senza chiamarti ogni cinque minuti.",
  heroImage:
    "https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=1400&q=80",

  socialProof: [
    { initials: "TT", name: "TernoTecnica SRL", city: "Verona", months: 11, gradient: "from-[#111111] to-[#243566]" },
    { initials: "IM", name: "Impianti Marini", city: "Padova", months: 18, gradient: "from-[#1a1a2e] to-[#0f3460]" },
    { initials: "EF", name: "Elettrica Fabbri", city: "Bologna", months: 6, gradient: "from-[#2d6a4f] to-[#1b4332]" },
    { initials: "CS", name: "Clima & Servizi", city: "Milano", months: 24, gradient: "from-[#6b21a8] to-[#4c1d95]" },
  ],

  problemsTitle: "Cosa blocca ogni giorno le imprese impiantistiche",
  problemsSubtitle:
    "Se i tuoi tecnici ti chiamano tre volte al giorno e il magazzino ricambi è sempre sbagliato, non è colpa loro — è un problema di sistema.",

  roi: {
    lossValue: "€ 18.000",
    lossLabel: "in ore tecnico non fatturate e margini persi",
    wasteValue: "€ 9.360",
    wasteLabel: "ore admin su ordini, burocrazia e coordinamento",
    errorValue: "€ 6.500",
    errorLabel: "in ricambi sbagliati, magazzino fuori controllo",
    totalLoss: "€ 33.860",
    softwareCost: "€ 2.388",
    roiX: "14x",
  },

  problems: [
    {
      emoji: "🔧",
      title: "I tecnici chiamano ogni cinque minuti",
      desc: "Dove vado dopo? Che pezzo serve? Come metto a norma questo impianto? Sei tu il collo di bottiglia della tua azienda. Ogni telefonata ti interrompe e rallenta i lavori in corso.",
    },
    {
      emoji: "📦",
      title: "Magazzino ricambi sempre sbagliato",
      desc: "Il tecnico arriva dal cliente senza il pressostato giusto. Torna in magazzino, perde due ore, il cliente è scocciato e tu hai perso un pomeriggio di lavoro fatturabile. Le scorte non vengono mai aggiornate in tempo reale.",
    },
    {
      emoji: "⏱️",
      title: "Ore lavorate non tracciate, non fatturate",
      desc: "Trasferte, straordinari, ore di collaudo, attese in cantiere: chi le registra? Di solito nessuno. Quelle ore diventano costo d'azienda invece di riga in fattura — e nessuno se ne accorge fino a fine mese.",
    },
    {
      emoji: "📱",
      title: "Ordini di lavoro su carta o su WhatsApp",
      desc: "Le istruzioni per l'intervento viaggiano su WhatsApp, i fogli di lavoro tornano in ufficio a fine giornata, le certificazioni di collaudo vengono archiviate in cartelle fisiche. Ricostruire uno storico è un'odissea.",
    },
  ],

  transformation: {
    title: "Come cambia la giornata dei tuoi tecnici — e la tua",
    subtitle: "Non stiamo parlando di automazione futuristica. Stiamo parlando di non fare due volte le stesse cose.",
    fromTitle: "Senza Edilizia in Cloud",
    fromItems: [
      "I tecnici chiamano ogni mattina per sapere dove andare",
      "Magazzino gestito 'a occhio' — parti sempre senza il pezzo giusto",
      "Ore lavorate non tracciate, trasferte assorbite come costo",
      "Ordini di lavoro su carta: li perdi, li ritrovi sgualciti, li riscrivi",
      "Fattura emessa 3 settimane dopo l'intervento — se ci ricordi",
      "Le certificazioni di collaudo sono in una cartella fisica da qualche parte",
    ],
    toTitle: "Con Edilizia in Cloud",
    toItems: [
      "Ordine di lavoro digitale sull'app: il tecnico sa già tutto prima di partire",
      "Magazzino aggiornato in real-time — furgone e magazzino centrale sincronizzati",
      "Timesheet automatico: ore, trasferte e materiali imputati alla commessa",
      "Storia completa di ogni intervento: foto, firme cliente, materiali usati",
      "Fattura generata automaticamente dopo la chiusura dell'intervento",
      "Certificazioni e collaudi digitalizzati, archiviati e sempre rintracciabili",
    ],
  },

  stats: [
    { value: "+3", label: "Interventi al giorno", sublabel: "gestiti con lo stesso numero di tecnici" },
    { value: "−60%", label: "Tempo in ufficio", sublabel: "su burocrazia, telefonate e rincorsa carte" },
    { value: "100%", label: "Stock ricambi corretto", sublabel: "zero uscite a vuoto per pezzi mancanti" },
  ],

  modulesTitle: "I moduli pensati per come lavora davvero un'impresa impiantistica",
  modulesSubtitle:
    "Dall'ordine di lavoro al collaudo, dal magazzino furgone alla fattura: tutto in un unico sistema usato dai tuoi tecnici in campo.",

  modules: [
    {
      icon: Wrench,
      name: "Ordini di Lavoro Digitali",
      desc: "Crea e assegna ordini di lavoro con indirizzo, tipo di impianto, storico interventi e materiali previsti. Il tecnico vede tutto sull'app prima di partire dal magazzino.",
      saving: "+2 interventi al giorno",
    },
    {
      icon: Package,
      name: "Magazzino Ricambi & Furgone",
      desc: "Traccia ogni pezzo: magazzino centrale, furgone tecnico 1, furgone tecnico 2. Quando un pezzo viene usato in intervento, si scala automaticamente. Alert quando scendi sotto la scorta minima.",
      saving: "Zero uscite a vuoto",
    },
    {
      icon: Clock,
      name: "Timesheet Automatico",
      desc: "Ore di intervento, trasferta, collaudo e straordinario registrate automaticamente dall'app. Imputate alla commessa giusta. Nessuna perdita di ore fatturabili.",
      saving: "0 ore perse non fatturate",
    },
    {
      icon: FileText,
      name: "Fatturazione Post-Intervento",
      desc: "Alla chiusura dell'ordine di lavoro, il sistema genera automaticamente la bozza fattura con manodopera, materiali e trasferta. Tu approvi e invii in un click.",
      saving: "Incassi 3 settimane prima",
    },
    {
      icon: BarChart3,
      name: "SAL Impianti & Contratti Manutenzione",
      desc: "Gestisci contratti di manutenzione ricorrente con scadenze, canoni, SAL periodici e rinnovi. Entrate ricorrenti pianificate, zero dimenticanze.",
      saving: "Entrate ricorrenti garantite",
    },
    {
      icon: Smartphone,
      name: "App Tecnico Offline",
      desc: "L'app funziona anche senza connessione — fondamentale per cantieri in zona industriale o scantinati. I dati si sincronizzano appena torna il segnale.",
      saving: "Usabile ovunque, sempre",
    },
  ],

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
      "Prima avevo 4 tecnici e non sapevo mai dove fossero o cosa stessero facendo davvero. Ogni mattina era un casino di telefonate. Adesso aprono l'app, vedono gli interventi del giorno con tutto il necessario, e io vedo in tempo reale chi è dove e cosa sta facendo. Siamo passati da 6 a 9 interventi al giorno con le stesse persone — solo organizzandoci meglio.",
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
      q: "Il magazzino ricambi funziona anche per il furgone del singolo tecnico?",
      a: "Sì. Ogni tecnico ha il suo 'magazzino mobile' sul furgone. Quando usa un pezzo in un intervento, lo scala dall'inventario del furgone. Il magazzino centrale si aggiorna automaticamente e ti avvisa quando è il momento di rifornire.",
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

  ctaTitle: (
    <>
      <span className="text-white">I tuoi tecnici in campo.</span>{" "}
      <span className="text-[#F97415]">I tuoi soldi in cassa.</span>
    </>
  ),
  ctaSubtitle:
    "30 minuti di demo gratuita: ti mostriamo come un tuo tecnico userebbe l'app domani mattina e quanti interventi in più puoi gestire già questa settimana.",

  schemaFaq: [
    {
      q: "Qual è il miglior software gestionale per impiantisti?",
      a: "Edilizia in Cloud è il gestionale per impiantisti con AI più completo in Italia: pianifica ordini di lavoro digitali, gestisce magazzino ricambi per furgone, app tecnico offline e fatturazione automatica post-intervento.",
    },
    {
      q: "Come gestire i tecnici in campo con un software per impiantisti?",
      a: "Con l'app mobile i tecnici ricevono gli ordini di lavoro con tutto il necessario, aggiornano lo stato intervento, registrano i materiali usati e fanno firmare il cliente. L'ufficio vede tutto in tempo reale senza telefonate.",
    },
  ],
};

export default function Impiantisti() {
  return <PerTipoPageTemplate config={config} />;
}
