import { Home, FileText, Users, TrendingUp, BarChart3, Smartphone } from "lucide-react";
import PerTipoPageTemplate, { PerTipoConfig } from "@/components/landing/PerTipoPageTemplate";

const config: PerTipoConfig = {
  seoTitle: "Gestionale per Imprese di Ristrutturazione — Software con AI | Edilizia in Cloud",
  seoDescription: "Il gestionale per ristrutturatori con AI: gestisci preventivi, cantieri, bonus fiscali (Superbonus, Ecobonus), clienti e margini. Tutto in un'unica piattaforma. Prova gratis.",
  seoKeywords: "software gestionale ristrutturazione, gestionale impresa ristrutturazioni, software preventivi ristrutturazione, gestionale bonus edilizi, software superbonus 110, gestionale ecobonus, software ristrutturatori edili, CRM impresa ristrutturazione",
  seoCanonical: "/per/ristrutturatori",
  badge: "Imprese di Ristrutturazione",
  heroTitle: (
    <>
      <span className="text-white">Ogni ristrutturazione è unica.</span>{" "}
      <span className="text-[#F97415]">Il controllo deve essere lo stesso.</span>
    </>
  ),
  heroSubtitle: "Gestisci clienti privati, preventivi personalizzati, bonus fiscali e cantieri sovrapposti — tutto da un unico gestionale. Smetti di rincorrere email, WhatsApp e fogli Excel.",
  problemsTitle: "Le sfide quotidiane di chi fa ristrutturazioni",
  problems: [
    { n: "01", title: "Preventivi diversi per ogni cliente, impossibili da gestire", desc: "Ogni cliente vuole qualcosa di diverso. Modifiche continue, varianti in corso d'opera, richieste last minute. Tenere tutto aggiornato su Excel è un incubo." },
    { n: "02", title: "I bonus fiscali creano confusione documentale", desc: "Superbonus, Ecobonus, Bonus Ristrutturazione: ogni pratica ha i suoi documenti, le sue scadenze, i suoi requisiti. Chi li traccia nella tua azienda?" },
    { n: "03", title: "Clienti che cambiano idea durante i lavori e costi che esplodono", desc: "Varianti in corso d'opera non documentate, extra non fatturati, materiali ordinati in eccesso. Il margine finale è sempre meno di quello preventivato." },
    { n: "04", title: "Comunicazione caotica con clienti e fornitori", desc: "WhatsApp, email, telefonate, messaggi vocali. Nessuna traccia scritta, nessun accordo formalizzato. Poi a fine lavori arrivano le contestazioni." },
  ],
  stats: [
    { value: "3x", label: "Preventivi più veloci", sublabel: "con template intelligenti" },
    { value: "+22%", label: "Margine medio", sublabel: "per commessa ristrutturazione" },
    { value: "€0", label: "Extra non fatturati", sublabel: "grazie al tracciamento varianti" },
  ],
  modulesTitle: "Strumenti pensati per chi fa ristrutturazioni",
  modules: [
    { icon: FileText, name: "Preventivi con Varianti", desc: "Crea preventivi dettagliati con immagini, capitolati e prezziario. Gestisci varianti in corso d'opera con approvazione cliente digitale.", saving: "Zero contestazioni" },
    { icon: Home, name: "Gestione Bonus Fiscali", desc: "Traccia pratiche Superbonus, Ecobonus, Sismabonus con documenti, scadenze e requisiti ENEA per ogni cantiere.", saving: "Conformità garantita" },
    { icon: Users, name: "CRM Clienti Privati", desc: "Scheda cliente con storico lavori, documenti firmati, preferenze e comunicazioni. Tutto in un posto.", saving: "+60% clienti fedeli" },
    { icon: Smartphone, name: "Aggiornamenti Cantiere Live", desc: "Foto avanzamento lavori geolocalizzate, DL digitale e aggiornamenti condivisi con il cliente via link.", saving: "Zero lamentele" },
    { icon: BarChart3, name: "Analisi Margini Reali", desc: "Confronta preventivo vs costi reali in ogni momento. Blocca la perdita prima che accada.", saving: "Margine sempre positivo" },
    { icon: TrendingUp, name: "Marketing e Referral", desc: "Invia email e WhatsApp automatici a fine lavori per chiedere recensioni e referral. Trasforma clienti in promotori.", saving: "+40% clienti da passaparola" },
  ],
  caseStudy: {
    company: "RestauroCase di Martini Marco",
    city: "Firenze",
    sector: "Ristrutturazioni residenziali con bonus fiscali",
    revenue: "950K €",
    person: "Marco Martini",
    role: "Titolare",
    initials: "MM",
    quote: "Avevo perso il conto di quante pratiche Superbonus erano aperte, quali documenti mancavano e quando scadevano. Con Edilizia in Cloud ogni pratica ha la sua scheda con documenti, scadenze e checklist. Non ho più paura di perdere un'agevolazione per un documento mancante.",
    beforeLabel: "Pratiche bonus gestite",
    beforeValue: "Su fogli Excel separati",
    afterLabel: "Tutto in un'unica piattaforma",
    afterValue: "Zero pratiche perse",
  },
  faq: [
    { q: "Gestisce il Superbonus e gli altri bonus edilizi?", a: "Sì. Tracci pratiche Superbonus 90%, Ecobonus, Bonus Ristrutturazione e Sismabonus con documenti ENEA, SAL, scadenze e requisiti specifici per ogni incentivo." },
    { q: "Posso gestire le varianti in corso d'opera senza perdere il controllo?", a: "Sì. Ogni variante viene documentata, quotata e approvata digitalmente dal cliente. Il sistema aggiorna automaticamente il preventivo e il margine residuo." },
    { q: "Come condivido gli aggiornamenti con i clienti privati?", a: "Con un link sicuro il cliente vede foto dei lavori, stato avanzamento e documenti. Nessun account necessario da parte sua." },
    { q: "Posso usarlo anche per preventivi con prezziario regionale?", a: "Sì. Il sistema include i principali prezziari regionali italiani aggiornati e permette di creare voci personalizzate." },
  ],
  ctaTitle: <><span className="text-white">Ogni variante documentata.</span> <span className="text-[#F97415]">Ogni bonus incassato.</span></>,
  ctaSubtitle: "Vedi in 30 minuti come gestire ristrutturazioni, bonus fiscali e clienti privati — tutto da un unico posto.",
  schemaFaq: [
    { q: "Qual è il miglior software per imprese di ristrutturazione?", a: "Edilizia in Cloud è il gestionale per ristrutturatori più completo: gestisce preventivi con varianti, bonus fiscali (Superbonus, Ecobonus), CRM clienti e analisi margini in tempo reale." },
    { q: "Come si gestisce il Superbonus con un software gestionale?", a: "Il software traccia ogni pratica con documenti ENEA, SAL, scadenze e requisiti. Alert automatici per documenti in scadenza e checklist per ogni tipo di incentivo." },
  ],
};

export default function Ristrutturatori() {
  return <PerTipoPageTemplate config={config} />;
}
