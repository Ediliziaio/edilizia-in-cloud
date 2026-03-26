import { Wrench, Calendar, Package, Smartphone, BarChart3, Users } from "lucide-react";
import PerTipoPageTemplate, { PerTipoConfig } from "@/components/landing/PerTipoPageTemplate";

const config: PerTipoConfig = {
  seoTitle: "Software Gestionale per Impiantisti — Idraulici, Elettricisti, Termoidraulici | Edilizia in Cloud",
  seoDescription: "Il gestionale per impiantisti con AI: gestisci interventi, magazzino, tecnici e fatturazione da smartphone. Ideale per idraulici, elettricisti e imprese termoidrauliche. Prova gratis.",
  seoKeywords: "software gestionale impiantisti, gestionale idraulici, software elettricisti, gestionale termoidraulico, software interventi impianti, gestione tecnici campo, software manutenzione impianti, gestionale impiantistico",
  seoCanonical: "/per/impiantisti",
  badge: "Impiantisti — Idraulici & Elettricisti",
  heroTitle: (
    <>
      <span className="text-white">I tuoi tecnici in campo.</span>{" "}
      <span className="text-[#F97415]">Tu in controllo totale.</span>
    </>
  ),
  heroSubtitle: "Gestisci interventi, ricambi, appuntamenti e fatture da un unico posto. I tuoi tecnici usano l'app dal cantiere — tu vedi tutto in tempo reale senza telefonate continue.",
  problemsTitle: "Cosa blocca ogni giorno le imprese impiantistiche",
  problems: [
    { n: "01", title: "I tecnici chiamano sempre per sapere cosa fare", desc: "Ogni mattina dieci telefonate: dove vado, cosa porto, che lavoro devo fare. Senza un sistema organizzato, sei tu il collo di bottiglia." },
    { n: "02", title: "Ricambi e materiali sempre introvabili", desc: "Il magazzino è un mistero. Parti due volte per lo stesso intervento perché mancava un pezzo. Scorte non tracciate, ordini duplicati, sprechi continui." },
    { n: "03", title: "Le ore dei tecnici non vengono imputate al cliente", desc: "Ore di viaggio, straordinari, trasferte: chi le traccia? Spesso vengono assorbite come costo aziendale invece di essere fatturate." },
    { n: "04", title: "Fatture emesse in ritardo o dimenticate", desc: "Finito l'intervento, la fattura arriva dopo settimane. Nel mentre il cliente ha dimenticato, la cassa è ferma e tu insegui i pagamenti." },
  ],
  stats: [
    { value: "+34%", label: "Interventi al giorno", sublabel: "grazie a pianificazione ottimizzata" },
    { value: "-60%", label: "Chiamate interne", sublabel: "tra tecnici e ufficio" },
    { value: "48h", label: "Fatture emesse", sublabel: "automaticamente dopo intervento" },
  ],
  modulesTitle: "I moduli pensati per impiantisti",
  modules: [
    { icon: Calendar, name: "Planning Interventi", desc: "Assegna interventi ai tecnici con drag & drop. Vedono l'agenda aggiornata sull'app mobile in tempo reale.", saving: "+2 interventi/giorno" },
    { icon: Smartphone, name: "App Tecnico Mobile", desc: "Il tecnico apre l'app, vede l'intervento, scatta foto, firma il cliente e chiude il ticket. Zero carta.", saving: "Chiusura istantanea" },
    { icon: Package, name: "Magazzino Ricambi", desc: "Traccia ogni pezzo in magazzino e in furgone. Alert automatici quando una scorta è sotto il minimo.", saving: "Zero uscite a vuoto" },
    { icon: Users, name: "Gestione Tecnici e Timbrature", desc: "Presenze, ore lavorate, trasferte e straordinari per ogni tecnico. Tutto imputato alla commessa giusta.", saving: "0 ore perse" },
    { icon: BarChart3, name: "Fatturazione Automatica", desc: "Dopo ogni intervento, la fattura viene generata automaticamente con materiali e manodopera. Invia in un click.", saving: "Incassi +40% rapidi" },
    { icon: Wrench, name: "Contratti di Manutenzione", desc: "Gestisci contratti ricorrenti con scadenze, canoni, interventi programmati e rinnovi automatici.", saving: "Entrate ricorrenti garantite" },
  ],
  caseStudy: {
    company: "Termo Impianti Rossi",
    city: "Verona",
    sector: "Impianti termici e idraulici",
    revenue: "780K €",
    person: "Alberto Rossi",
    role: "Titolare",
    initials: "AR",
    quote: "Prima avevo 4 tecnici e non sapevo mai dove fossero o cosa stessero facendo. Adesso apro il telefono e vedo in tempo reale tutti gli interventi aperti, chiusi e in attesa. Ho smesso di essere io il centralino della mia stessa azienda.",
    beforeLabel: "Interventi chiusi/giorno",
    beforeValue: "6 (con 4 tecnici)",
    afterLabel: "Con pianificazione automatica",
    afterValue: "9 interventi/giorno",
  },
  faq: [
    { q: "Funziona anche per manutenzioni programmate ricorrenti?", a: "Sì. Gestisci contratti di manutenzione con scadenze automatiche, notifiche al cliente e fatturazione ricorrente. Tutto senza intervento manuale." },
    { q: "I miei tecnici devono essere esperti di tecnologia?", a: "No. L'app mobile è pensata per essere usata con i guanti. Apertura ticket, foto, firma cliente e chiusura in meno di 2 minuti." },
    { q: "Posso tracciare il magazzino del furgone di ogni tecnico?", a: "Sì. Ogni tecnico ha il suo 'magazzino mobile'. Quando usa un pezzo, lo scala automaticamente e si aggiorna il magazzino centrale." },
    { q: "Come funziona la fatturazione dopo un intervento?", a: "Il sistema genera automaticamente la bozza fattura con i materiali usati e le ore lavorate. Tu approvi e invii in un click, anche da smartphone." },
  ],
  ctaTitle: <><span className="text-white">I tuoi tecnici in campo.</span> <span className="text-[#F97415]">I tuoi soldi in cassa.</span></>,
  ctaSubtitle: "Demo gratuita di 30 minuti: vedi come funziona l'app tecnico mobile e il planning automatico.",
  schemaFaq: [
    { q: "Qual è il miglior software gestionale per impiantisti?", a: "Edilizia in Cloud è il gestionale per impiantisti con AI più completo in Italia: pianifica interventi, gestisce magazzino ricambi, app tecnico mobile e fatturazione automatica post-intervento." },
    { q: "Come gestire i tecnici in campo con un software?", a: "Con l'app mobile i tecnici vedono i propri interventi, aggiornano lo stato, registrano materiali usati e fanno firmare il cliente. L'ufficio vede tutto in tempo reale." },
  ],
};

export default function Impiantisti() {
  return <PerTipoPageTemplate config={config} />;
}
