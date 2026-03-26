import { Sun, FileText, TrendingUp, BarChart3, Calendar, Smartphone } from "lucide-react";
import PerTipoPageTemplate, { PerTipoConfig } from "@/components/landing/PerTipoPageTemplate";

const config: PerTipoConfig = {
  seoTitle: "Software Gestionale per Installatori Fotovoltaico — Energie Rinnovabili | Edilizia in Cloud",
  seoDescription: "Il gestionale per installatori fotovoltaico con AI: gestisci pratiche GSE, SAL, incentivi, magazzino pannelli e squadre. Software specifico per imprese di energie rinnovabili in Italia.",
  seoKeywords: "software gestionale fotovoltaico, gestionale installatori pannelli solari, software pratiche GSE, gestionale energie rinnovabili, software impianti fotovoltaici, gestionale SAL fotovoltaico, software incentivi fotovoltaico, ERP impresa fotovoltaico",
  seoCanonical: "/per/fotovoltaico",
  badge: "Imprese Fotovoltaico & Rinnovabili",
  heroTitle: (
    <>
      <span className="text-white">Installi il futuro.</span>{" "}
      <span className="text-[#F97415]">Gestiscilo come si deve.</span>
    </>
  ),
  heroSubtitle: "Pratiche GSE, incentivi, SAL, squadre di installazione e magazzino pannelli: tutto sotto controllo in un'unica piattaforma. Smetti di perdere tempo in burocrazia e inizia a scalare.",
  problemsTitle: "Le sfide reali di chi installa fotovoltaico",
  problems: [
    { n: "01", title: "Le pratiche GSE sono un labirinto burocratico", desc: "Conto Energia, Scambio sul Posto, Superbonus: ogni pratica ha documenti diversi, scadenze diverse, enti diversi. Perdersi è facilissimo." },
    { n: "02", title: "Squadre da coordinare su più cantieri contemporaneamente", desc: "Chi installa dove? Quanti pannelli portano? Il magazzino è aggiornato? Senza un sistema, ogni mattina è chaos." },
    { n: "03", title: "I margini si erodono con i rincari dei pannelli", desc: "Il prezziario che hai usato per il preventivo è già vecchio. I costi dei moduli cambiano ogni mese e tu scopri l'erosione del margine solo a fine installazione." },
    { n: "04", title: "SAL e collaudi: documenti sparsi ovunque", desc: "Verbali di collaudo, schede tecniche, dichiarazioni di conformità, foto degli impianti: ogni cliente ha la sua cartella diversa, spesso incompleta." },
  ],
  stats: [
    { value: "4x", label: "Impianti/mese", sublabel: "con squadre coordinate" },
    { value: "-40%", label: "Tempo pratiche", sublabel: "GSE e incentivi automatizzati" },
    { value: "+15%", label: "Margine medio", sublabel: "grazie al controllo costi real-time" },
  ],
  modulesTitle: "Moduli specifici per il fotovoltaico",
  modules: [
    { icon: FileText, name: "Pratiche e Incentivi", desc: "Gestisci pratiche GSE, ENEA, Superbonus e Scambio sul Posto con checklist documenti, scadenze e stato pratica per ogni impianto.", saving: "Zero pratiche perse" },
    { icon: Calendar, name: "Planning Squadre Installazione", desc: "Assegna squadre ai cantieri con materiali, attrezzature e tempi previsti. Visualizzazione Gantt per settimane.", saving: "+30% produttività" },
    { icon: Sun, name: "Magazzino Pannelli e Inverter", desc: "Traccia l'inventario di moduli, inverter, cablaggi e accessori. Alert automatici sul minimo di scorta.", saving: "Zero fermi cantiere" },
    { icon: BarChart3, name: "Analisi Margini per kWp", desc: "Vedi il costo per kWp installato vs preventivo per ogni commessa. Identifica dove il margine si erode.", saving: "Margine sempre visibile" },
    { icon: TrendingUp, name: "SAL e Collaudi Digitali", desc: "Genera verbali di collaudo, schede tecniche e documentazione GSE direttamente dalla piattaforma con firma digitale.", saving: "-70% tempo documentazione" },
    { icon: Smartphone, name: "App Cantiere Fotovoltaico", desc: "Il tecnico foto-documenta l'installazione, registra le misure e chiude il collaudo dall'app. Tutto sincronizzato.", saving: "Collaudo in 15 minuti" },
  ],
  caseStudy: {
    company: "SolarTech Meridionale S.r.l.",
    city: "Napoli",
    sector: "Installazione impianti fotovoltaici e storage",
    revenue: "1.8M €",
    person: "Vincenzo Esposito",
    role: "Titolare",
    initials: "VE",
    quote: "Prima ogni pratica GSE era una storia a sé: documenti in email, scadenze su Post-it, status sconosciuto. Adesso ogni impianto ha la sua scheda con tutto: pratiche, documenti, SAL, collaudo. Ho smesso di dormire male per paura di aver dimenticato qualcosa.",
    beforeLabel: "Pratiche GSE gestite",
    beforeValue: "Su email e cartelle sparse",
    afterLabel: "Tutto centralizzato",
    afterValue: "0 pratiche scadute in 12 mesi",
  },
  faq: [
    { q: "Gestisce le pratiche GSE e ENEA specifiche per il fotovoltaico?", a: "Sì. Il sistema ha template specifici per Conto Energia, Scambio sul Posto, Superbonus e pratiche ENEA. Ogni pratica ha la sua checklist documenti e le scadenze monitorate." },
    { q: "Posso tracciare magazzino per più tipi di pannelli e inverter?", a: "Sì. Il magazzino è organizzato per codice prodotto, watt di picco, marca e tipo. Tieni traccia di ogni singolo modulo dal ricevimento all'installazione." },
    { q: "Come gestisco più squadre di installazione contemporaneamente?", a: "Il planning visivo ti mostra tutti i cantieri attivi, le squadre assegnate e i materiali previsti. Puoi spostare risorse in tempo reale in caso di imprevisti." },
    { q: "Posso generare i verbali di collaudo direttamente dalla piattaforma?", a: "Sì. Generi verbali di collaudo, dichiarazioni di conformità e schede tecniche in formato PDF con un click, personalizzati con il tuo logo." },
  ],
  ctaTitle: <><span className="text-white">Più impianti.</span> <span className="text-[#F97415]">Meno burocrazia.</span></>,
  ctaSubtitle: "30 minuti di demo per vedere come gestire pratiche, squadre e margini nel fotovoltaico.",
  schemaFaq: [
    { q: "Qual è il miglior software gestionale per imprese fotovoltaico?", a: "Edilizia in Cloud è il gestionale per installatori fotovoltaico con AI: gestisce pratiche GSE, magazzino pannelli, planning squadre, SAL e collaudi digitali in un'unica piattaforma." },
    { q: "Come si gestiscono le pratiche GSE con un software?", a: "Il software ha template specifici per ogni tipo di pratica GSE con checklist documenti, scadenze automatiche e stato avanzamento pratica per ogni impianto installato." },
  ],
};

export default function Fotovoltaico() {
  return <PerTipoPageTemplate config={config} />;
}
