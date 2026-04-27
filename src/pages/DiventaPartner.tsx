import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Loader2,
  Send,
  CheckCircle,
  Calculator,
  TrendingUp,
  Users,
  Briefcase,
  Building2,
  Megaphone,
  HandCoins,
  ShieldCheck,
  Sparkles,
  Trophy,
  Star,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Repeat,
  HeartHandshake,
  GraduationCap,
  Headphones,
  FileSignature,
  ChevronDown,
  Award,
  Medal,
} from "lucide-react";
import { useSEO, SITE_URL } from "@/hooks/useSEO";
import { JsonLd } from "@/components/seo/JsonLd";
import { HubSeoSchema } from "@/components/seo/HubSeoSchema";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";

/* ------------------------------------------------------------------ */
/*  TARGET PERSONAS — esempi realistici basati sui tier reali          */
/* ------------------------------------------------------------------ */
const personas = [
  {
    icon: Briefcase,
    title: "Dottore Commercialista",
    subtitle: "Studi e professionisti fiscali",
    bullets: [
      "Hai imprese edili tra i tuoi clienti",
      "Vuoi offrirgli uno strumento che li fa guadagnare di più",
      "Lead già pre-qualificato: il dolore della fatturazione lo conosci",
    ],
    earnExample: "12 clienti × 247€ × 20% (Silver) = 592€/mese ricorrenti",
  },
  {
    icon: Megaphone,
    title: "Agenzia di Marketing",
    subtitle: "Web agency, consulenti digital",
    bullets: [
      "Lavori già con clienti del settore edile",
      "Aggiungi un prodotto al tuo stack di soluzioni",
      "Monetizzi il network senza vendere ore",
    ],
    earnExample: "8 clienti × 247€ × 20% (Silver) = 395€/mese ricorrenti",
  },
  {
    icon: Users,
    title: "Commerciale / Agente",
    subtitle: "Liberi professionisti, agenti vendite",
    bullets: [
      "Hai contatti diretti con imprenditori edili",
      "Vuoi un prodotto facile da spiegare",
      "Cerchi una rendita oltre alle commissioni una tantum",
    ],
    earnExample: "20 clienti × 247€ × 25% (Gold) = 1.235€/mese ricorrenti",
  },
  {
    icon: Building2,
    title: "Aziende del settore edile",
    subtitle: "Fornitori, consorzi, associazioni",
    bullets: [
      "Già operi con imprese di costruzione",
      "Hai un network consolidato da monetizzare",
      "Rafforzi la relazione con i tuoi clienti",
    ],
    earnExample: "10 clienti × 247€ × 20% (Silver) = 494€/mese ricorrenti",
  },
];

/* ------------------------------------------------------------------ */
/*  BENEFITS — solo quelli reali da business plan                     */
/* ------------------------------------------------------------------ */
const benefits = [
  {
    icon: HandCoins,
    title: "Fino al 30% ricorrente",
    description:
      "Si parte dal 15% e si sale automaticamente fino al 30% raggiungendo i 31 clienti attivi. Commissione per tutta la vita del cliente.",
  },
  {
    icon: Repeat,
    title: "Pagamento solo su risultato",
    description:
      "La commissione matura il giorno in cui il cliente paga la fattura. Liquidazione mensile via bonifico entro il 15 del mese successivo. Soglia minima 50€ — sotto soglia si accumula.",
  },
  {
    icon: GraduationCap,
    title: "Formazione 60 minuti all'attivazione",
    description:
      "Cosa è EiC, come pitcharlo in 3 minuti, obiezioni standard, gestione del follow-up. Più kit marketing completo (brochure, video 3min, presentazione 10 slide, copy email).",
  },
  {
    icon: Headphones,
    title: "Account manager (da Tier Silver)",
    description:
      "Una persona reale che ti aiuta a chiudere le trattative, prepara demo guidate per i tuoi prospect e gestisce l'onboarding tecnico dei clienti.",
  },
  {
    icon: FileSignature,
    title: "Trasparenza totale in dashboard",
    description:
      "Vedi in tempo reale quanto stai maturando per ogni cliente attivo. Nessuna clausola nascosta, nessun clawback opaco. Cookie window first-touch di 90 giorni.",
  },
  {
    icon: ShieldCheck,
    title: "Niente concorrenza interna",
    description:
      "Il primo partner che porta un lead lo \"ferma\" per 90 giorni con first-touch attribution. Niente race-to-the-bottom tra partner sullo stesso prospect.",
  },
];

/* ------------------------------------------------------------------ */
/*  4 TIERS — esattamente come da business plan                        */
/* ------------------------------------------------------------------ */
const tiers = [
  {
    name: "Partner",
    label: "Tier 1",
    icon: Sparkles,
    range: "1 – 5 clienti attivi",
    rate: "15%",
    perks: [
      "Codice referral personale",
      "Dashboard partner",
      "Materiali marketing base",
      "Pagamento mensile",
    ],
  },
  {
    name: "Silver",
    label: "Tier 2",
    icon: Medal,
    range: "6 – 15 clienti attivi",
    rate: "20%",
    perks: [
      "Tutto Tier Partner",
      "Account manager dedicato",
      "Co-branding email/landing",
      "Demo guidate per i tuoi clienti",
    ],
  },
  {
    name: "Gold",
    label: "Tier 3",
    icon: Award,
    range: "16 – 30 clienti attivi",
    rate: "25%",
    perks: [
      "Tutto Tier Silver",
      "Webinar mensile per i tuoi clienti",
      "Accesso roadmap prodotto",
      "Spiff bonus su nuovi acquisti",
    ],
    highlight: true,
  },
  {
    name: "Platinum",
    label: "Tier 4",
    icon: Trophy,
    range: "31+ clienti attivi",
    rate: "30%",
    perks: [
      "Tutto Tier Gold",
      "Co-marketing budget annuale",
      "Logo nella pagina \"Partner\"",
      "Quote contrattuali custom",
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  COSA SI COMMISSIONA — da business plan                             */
/* ------------------------------------------------------------------ */
const commissionRules = {
  yes: [
    "Canone mensile piano Starter (127€)",
    "Canone mensile piano Pro (247€)",
    "Canone mensile piano Premium (547€)",
    "Eventuali upgrade di piano (sul nuovo importo)",
    "Rinnovi annuali (sull'intero importo)",
  ],
  no: [
    "Crediti AI / token / consumo voice agent",
    "SMS marketing (pass-through provider)",
    "WhatsApp Business API (consumo)",
    "Setup fee, onboarding, migrazione dati",
    "Formazione, consulenza, custom development",
    "Integrazioni custom (PSD2 banca, ERP esterni)",
    "Hardware / dispositivi (timbrature, GPS)",
  ],
};

/* ------------------------------------------------------------------ */
/*  FAQ — allineate al business plan reale                             */
/* ------------------------------------------------------------------ */
const faqs = [
  {
    q: "Devo essere un commerciale o avere esperienza nelle vendite?",
    a: "No. Il programma è aperto a chiunque abbia accesso e fiducia con imprese edili: commercialisti, agenzie marketing, consulenti, fornitori del settore, geometri/architetti/ingegneri. Il tuo lavoro non è \"vendere\", è raccomandare. Ti diamo 60 minuti di formazione all'attivazione + kit marketing completo.",
  },
  {
    q: "Quando vengo pagato e come?",
    a: "La commissione matura il giorno in cui il cliente paga la fattura del mese. Il 15 del mese successivo liquidiamo tutto il maturato. Soglia minima per il pagamento: 50€ (sotto soglia si accumula). Partner con P.IVA → fattura elettronica e bonifico a 30 giorni. Partner senza P.IVA → ricevuta per prestazione occasionale con ritenuta d'acconto 20% (DPR 600/73 art. 25) — il netto in bonifico è quindi l'80% del lordo (max 5.000€ lordi/anno per legge italiana, art. 67 TUIR).",
  },
  {
    q: "La commissione è per sempre o si esaurisce?",
    a: "È ricorrente per tutta la vita del cliente, finché: (1) il cliente è attivo e in regola con i pagamenti; (2) tu mantieni attivo il tuo account partner (login almeno una volta ogni 6 mesi). Se il cliente si perde per oltre 90 giorni e poi torna da un altro canale, l'attribuzione passa al nuovo canale — ma niente clawback retroattivo su quello che hai già maturato.",
  },
  {
    q: "Come traccia il sistema chi ha portato un cliente?",
    a: "First-touch con cookie window di 90 giorni. Hai un link univoco (ediliziaincloud.com/?ref=tuonome) e un codice promo nominativo. Il primo touch (link cliccato o codice usato) ferma l'attribuzione per 90 giorni. I lead inseriti manualmente da te in CRM (con email + ragione sociale) hanno priorità sul cookie per 30 giorni — protegge chi fa outbound puro.",
  },
  {
    q: "Cosa si commissiona esattamente? E cosa no?",
    a: "Si commissiona SOLO il canone mensile del piano (Starter 127€, Pro 247€, Premium 547€), gli upgrade di piano e i rinnovi annuali. NON si commissionano: crediti AI/voice agent, SMS, WhatsApp Business, setup fee, onboarding, formazione, custom development, integrazioni PSD2 banca, hardware. Questo protegge la sostenibilità del programma anche al 30%.",
  },
  {
    q: "Come si sale di tier?",
    a: "Automaticamente. La promozione di tier avviene il 1° del mese successivo al raggiungimento della soglia (es. raggiungi il 6° cliente attivo a settembre → da ottobre sei Silver al 20%). Il tier raggiunto è \"sticky\": si mantiene anche se temporaneamente scendi sotto la soglia per churn (massimo 60 giorni, poi step-down automatico).",
  },
  {
    q: "C'è un obiettivo minimo, una fee di ingresso o un'esclusiva?",
    a: "No. Niente fee di ingresso, niente \"membership annuali\", niente livelli pagati — il livello lo fa il risultato. Nessun obiettivo minimo, nessuna penale, nessun vincolo di esclusiva. Puoi essere già partner di altri software gestionali.",
  },
  {
    q: "Quali sono le regole anti-gaming che devo conoscere?",
    a: "Per proteggere la qualità del canale: (1) self-referral vietato — non puoi registrare la tua azienda né aziende correlate; (2) no bid sul brand — niente Google/Meta Ads sui termini \"Edilizia in Cloud\", \"EiC\" e varianti; (3) no dumping prezzi non autorizzati; (4) no spam/cold email massive non profilate; (5) clawback in caso di chargeback o frode del cliente. Violazione = sospensione immediata.",
  },
  {
    q: "Quanto tempo passa dalla candidatura alla prima commissione?",
    a: "Dalla candidatura all'attivazione: 48 ore (verifica P.IVA + due diligence light). Dall'attivazione alla prima commissione: tempo medio 30-60 giorni dal primo lead alla prima conversione. Obiettivo programma: prima commissione maturata entro il mese 3.",
  },
];

/* ------------------------------------------------------------------ */
/*  CALCOLATORE — 4 tier reali (15/20/25/30%)                          */
/* ------------------------------------------------------------------ */
function CommissionCalculator() {
  const [clienti, setClienti] = useState(8);
  const [pianoMedio, setPianoMedio] = useState<"starter" | "professional" | "enterprise">("professional");

  const prezzoPiano = { starter: 127, professional: 247, enterprise: 547 }[pianoMedio];

  // 4 tiers reali da business plan
  const rate = clienti >= 31 ? 0.3 : clienti >= 16 ? 0.25 : clienti >= 6 ? 0.2 : 0.15;
  const rateLabel =
    clienti >= 31
      ? "Platinum 30%"
      : clienti >= 16
        ? "Gold 25%"
        : clienti >= 6
          ? "Silver 20%"
          : "Partner 15%";

  const mensile = Math.round(clienti * prezzoPiano * rate);
  const annuale = mensile * 12;

  return (
    <div className="bg-white rounded-3xl p-6 md:p-10 shadow-2xl border border-[#F97415]/10 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-48 h-48 bg-[#F97415]/5 rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" />

      <div className="relative z-10">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-[#F97415] flex items-center justify-center">
            <Calculator className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="text-xl md:text-2xl font-extrabold text-[#111111]">
              Calcola le tue commissioni
            </h3>
            <p className="text-sm text-gray-500">
              Stima basata sui 4 tier reali del programma
            </p>
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-semibold text-[#111111] mb-2">
              Clienti edili attivi che pensi di portare:{" "}
              <span className="text-[#F97415] font-extrabold">{clienti}</span>
            </label>
            <input
              type="range"
              min="1"
              max="50"
              value={clienti}
              onChange={(e) => setClienti(parseInt(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#F97415]"
            />
            <div className="grid grid-cols-4 text-[10px] text-gray-400 mt-1">
              <span className="text-left">1-5 Partner</span>
              <span className="text-center">6-15 Silver</span>
              <span className="text-center">16-30 Gold</span>
              <span className="text-right">31+ Platinum</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-[#111111] mb-2">
              Piano medio dei tuoi clienti:
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(["starter", "professional", "enterprise"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPianoMedio(p)}
                  className={`py-3 px-2 rounded-xl text-xs md:text-sm font-bold transition-all ${
                    pianoMedio === p
                      ? "bg-[#F97415] text-white shadow-lg"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  <div>
                    {p === "starter"
                      ? "Starter"
                      : p === "professional"
                        ? "Pro"
                        : "Premium"}
                  </div>
                  <div className="opacity-70 text-[10px] mt-0.5">
                    {p === "starter" ? "127€" : p === "professional" ? "247€" : "547€"}/m
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="bg-gradient-to-br from-[#F97415] to-[#C94F06] rounded-2xl p-6 text-white">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-widest opacity-90">
                Il tuo livello
              </span>
              <span className="px-3 py-1 bg-white/20 rounded-full text-xs font-bold">
                {rateLabel}
              </span>
            </div>
            <div className="space-y-3 mt-4">
              <div>
                <p className="text-xs opacity-80 mb-1">Commissioni mensili ricorrenti</p>
                <p className="text-3xl md:text-4xl font-extrabold">
                  {mensile.toLocaleString("it-IT")}€
                  <span className="text-base font-normal opacity-80">/mese</span>
                </p>
              </div>
              <div className="h-px bg-white/20" />
              <div>
                <p className="text-xs opacity-80 mb-1">Stima annuale</p>
                <p className="text-2xl md:text-3xl font-extrabold">
                  {annuale.toLocaleString("it-IT")}€
                  <span className="text-base font-normal opacity-80">/anno</span>
                </p>
              </div>
            </div>
            <p className="text-[11px] opacity-80 mt-4 leading-relaxed">
              Calcolo: {clienti} clienti × {prezzoPiano}€ × {Math.round(rate * 100)}% di
              commissione ricorrente. Maturazione il giorno in cui il cliente paga la
              fattura. Liquidazione il 15 del mese successivo. Soglia minima 50€.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  PAGE                                                               */
/* ------------------------------------------------------------------ */
export default function DiventaPartner() {
  useSEO({
    title:
      "Diventa Partner — Fino al 30% di retrocessione ricorrente | Edilizia in Cloud",
    description:
      "Programma partner Edilizia in Cloud: 4 tier dal 15% al 30% di commissione ricorrente per commercialisti, agenzie marketing, commerciali e aziende del settore edile. Pagamento solo su risultato, niente fee di ingresso, niente esclusiva.",
    canonical: "/diventa-partner",
    keywords:
      "programma partner edilizia, partner software gestionale, affiliazione edilizia in cloud, commissioni ricorrenti software edile, partner commercialista, partner agenzia marketing, rivenditore software edile",
  });

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    partner_type: "professional",
    network_size: "",
    notes: "",
    privacy_consent: false,
    marketing_consent: false,
  });
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const formRef = useRef<HTMLDivElement>(null);

  const scrollToForm = () => {
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email) {
      toast.error("Nome ed email sono obbligatori");
      return;
    }
    if (!form.privacy_consent) {
      toast.error("Devi accettare la Privacy Policy per inviare la candidatura");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.from("partner_applications").insert({
        name: form.name,
        email: form.email.toLowerCase(),
        phone: form.phone || null,
        partner_type: form.partner_type,
        network_size: parseInt(form.network_size) || null,
        notes: form.company
          ? `Azienda/Studio: ${form.company}\n\n${form.notes || ""}`
          : form.notes || null,
        status: "pending",
      });
      if (error) throw error;
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err: any) {
      toast.error("Errore invio", { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  if (submitted)
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-6">
        <div className="text-center max-w-lg space-y-6">
          <div className="w-20 h-20 mx-auto rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle className="h-12 w-12 text-green-600" />
          </div>
          <h2 className="text-3xl md:text-4xl font-extrabold text-[#111111]">
            Candidatura ricevuta!
          </h2>
          <p className="text-gray-600 text-lg">
            Grazie {form.name.split(" ")[0]}. Verifichiamo la tua candidatura entro{" "}
            <strong className="text-[#111111]">48 ore</strong> (controllo P.IVA + due
            diligence light) e poi ti programmiamo la call di onboarding di 60 minuti.
          </p>
          <div className="bg-[#F97415]/5 border border-[#F97415]/20 rounded-2xl p-6 text-left">
            <p className="text-sm font-bold text-[#111111] mb-2">Cosa succede ora:</p>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#F97415] mt-0.5 flex-shrink-0" />
                <span>
                  Ti inviamo via email il kit partner di benvenuto e il documento
                  termini & condizioni
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#F97415] mt-0.5 flex-shrink-0" />
                <span>
                  Generiamo il tuo codice partner univoco e il link di tracciamento
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#F97415] mt-0.5 flex-shrink-0" />
                <span>
                  Programmiamo la call di onboarding 60 minuti: prodotto, ICP, pitch in
                  3 minuti, gestione obiezioni
                </span>
              </li>
            </ul>
          </div>
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-[#F97415] hover:text-[#C94F06] font-semibold"
          >
            ← Torna alla home
          </Link>
        </div>
      </div>
    );

  return (
    <div className="min-h-screen bg-white text-[#111111] overflow-x-hidden">
      <LandingNavbar />

      <HubSeoSchema
        pageName="Diventa Partner"
        pagePath="/diventa-partner"
        pageDescription="Programma Partner Edilizia in Cloud: commissioni ricorrenti dal 15% al 30% per commercialisti, agenzie marketing e consulenti del settore edile. Pagamento solo su risultato verificato."
        breadcrumbs={[
          { name: "Home", url: "/" },
          { name: "Diventa Partner", url: "/diventa-partner" },
        ]}
      />

      <JsonLd
        id="jsonld-service-partner"
        data={{
          "@context": "https://schema.org",
          "@type": "Service",
          "@id": `${SITE_URL}/diventa-partner#service`,
          name: "Programma Partner Edilizia in Cloud",
          provider: { "@id": `${SITE_URL}/#organization` },
          serviceType: "Partner Affiliate Program",
          areaServed: { "@type": "Country", name: "Italy" },
          description:
            "Programma di affiliazione a 4 tier con commissioni ricorrenti dal 15% al 30% per commercialisti, agenzie marketing, commerciali e aziende del settore edile. Pagamento solo su risultato verificato.",
          offers: {
            "@type": "Offer",
            description:
              "Commissioni ricorrenti dal 15% (Tier Partner) al 30% (Tier Platinum) sul fatturato dei clienti referenziati. Maturazione su pagamento verificato.",
            priceCurrency: "EUR",
            eligibleRegion: { "@type": "Country", name: "Italy" },
            url: `${SITE_URL}/diventa-partner`,
          },
        }}
      />

      <JsonLd
        id="jsonld-faq-partner"
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          "@id": `${SITE_URL}/diventa-partner#faq`,
          mainEntity: faqs.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }}
      />

      {/* HERO */}
      <section className="relative pt-24 sm:pt-28 md:pt-36 pb-12 sm:pb-16 md:pb-24 overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at top right, rgba(249,116,21,0.08), transparent 60%), linear-gradient(180deg, #FFF8F2 0%, #FFFFFF 100%)",
          }}
        />
        <div className="relative max-w-6xl mx-auto px-5 sm:px-6">
          <div className="grid md:grid-cols-2 gap-8 sm:gap-10 items-center">
            <div>
              <span className="inline-flex items-center gap-2 mb-4 sm:mb-5 px-3 sm:px-4 py-1.5 rounded-full bg-[#F97415]/10 border border-[#F97415]/30 text-[#F97415] text-[10px] sm:text-xs font-bold tracking-widest uppercase">
                <Sparkles className="w-3.5 h-3.5" />
                Partner Program 2026
              </span>

              <h1 className="text-[28px] leading-[1.15] sm:text-4xl md:text-6xl font-extrabold sm:leading-[1.05] tracking-tight mb-5 sm:mb-6">
                Fino al{" "}
                <span className="relative inline-block">
                  <span className="relative z-10 text-[#F97415]">30% ricorrente</span>
                  <span
                    className="absolute bottom-1 left-0 right-0 h-3 bg-[#F97415]/15 -z-0"
                    aria-hidden
                  />
                </span>{" "}
                portando imprese edili su Edilizia in Cloud
              </h1>

              <p className="text-base sm:text-lg md:text-xl text-gray-600 mb-7 sm:mb-8 leading-relaxed">
                Sei un <strong className="text-[#111111]">commercialista</strong>, un'
                <strong className="text-[#111111]">agenzia di marketing</strong>, un
                <strong className="text-[#111111]"> commerciale</strong> o un'
                <strong className="text-[#111111]">azienda del settore edile</strong>?
                Trasforma il tuo network in una rendita mensile ricorrente.
                <strong className="text-[#111111]"> Pagamento solo su risultato</strong>:
                la commissione matura quando il cliente paga.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 mb-7 sm:mb-8">
                <button
                  type="button"
                  onClick={scrollToForm}
                  className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-6 sm:px-8 py-4 rounded-full bg-[#F97415] hover:bg-[#C94F06] text-white font-bold text-base transition-all hover:scale-105 shadow-lg shadow-[#F97415]/30"
                >
                  Candidati ora — è gratis
                  <ArrowRight className="w-5 h-5" />
                </button>
                <a
                  href="#calcolatore"
                  className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-6 sm:px-8 py-4 rounded-full border-2 border-[#111111]/15 text-[#111111] font-bold text-base hover:bg-[#111111]/5 transition-all"
                >
                  <Calculator className="w-5 h-5" />
                  Calcola il guadagno
                </a>
              </div>

              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-500">
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  Niente fee di ingresso
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  Niente vincolo di esclusiva
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  Risposta in 48 ore
                </span>
              </div>
            </div>

            {/* Stats card — esempio realistico Silver/Gold */}
            <div className="relative">
              <div className="bg-white rounded-3xl p-6 md:p-8 shadow-xl border border-gray-100 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-[#F97415]/5 rounded-full -translate-y-1/2 translate-x-1/2" />

                <div className="relative z-10 space-y-5">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#F97415] to-[#C94F06] flex items-center justify-center">
                      <HeartHandshake className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-widest text-gray-500 font-bold">
                        Esempio realistico Tier Silver
                      </p>
                      <p className="text-sm text-gray-700">
                        Commercialista (mese 12)
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3 border-t border-b border-gray-100 py-5">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Clienti attivi</span>
                      <span className="font-extrabold text-[#111111]">12</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Piano medio (Pro)</span>
                      <span className="font-extrabold text-[#111111]">247€/mese</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Tier raggiunto</span>
                      <span className="font-extrabold text-[#F97415]">Silver — 20%</span>
                    </div>
                  </div>

                  <div className="text-center bg-[#F97415]/5 rounded-2xl py-4">
                    <p className="text-xs text-gray-500 mb-1">Rendita mensile ricorrente</p>
                    <p className="text-3xl md:text-4xl font-extrabold text-[#F97415]">
                      592€
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      ≈ 7.104€ all'anno, ricorrenti
                    </p>
                  </div>

                  <p className="text-[11px] text-gray-400 italic text-center leading-relaxed">
                    Esempio rappresentativo. Risultati individuali variabili in base al
                    network e al tier raggiunto. La commissione matura solo su pagamento
                    verificato del cliente.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* TARGET PERSONAS */}
      <section className="py-14 sm:py-20 md:py-28 bg-white">
        <div className="max-w-6xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-14 md:mb-16">
            <span className="inline-block mb-4 px-4 py-1.5 rounded-full bg-[#F97415]/10 border border-[#F97415]/30 text-[#F97415] text-xs font-bold tracking-widest uppercase">
              Per chi è il programma
            </span>
            <h2 className="text-3xl md:text-5xl font-extrabold mb-4 leading-tight">
              Se il tuo lavoro ti porta a contatto con{" "}
              <span className="text-[#F97415]">imprese edili</span>, sei nel posto giusto
            </h2>
            <p className="text-gray-600 text-lg max-w-2xl mx-auto">
              Il programma è pensato per professionisti che hanno{" "}
              <strong>già fiducia e contesto</strong> con le imprese edili italiane.
              Il tuo lavoro non è "vendere", è raccomandare.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            {personas.map((p) => (
              <div
                key={p.title}
                className="group bg-white rounded-2xl p-7 border border-gray-100 hover:border-[#F97415]/30 hover:shadow-xl transition-all duration-300"
              >
                <div className="flex items-start gap-4 mb-5">
                  <div className="w-14 h-14 rounded-2xl bg-[#F97415]/10 flex items-center justify-center flex-shrink-0 group-hover:bg-[#F97415] group-hover:scale-110 transition-all">
                    <p.icon className="w-7 h-7 text-[#F97415] group-hover:text-white transition-colors" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-extrabold text-[#111111] mb-1">
                      {p.title}
                    </h3>
                    <p className="text-sm text-gray-500">{p.subtitle}</p>
                  </div>
                </div>

                <ul className="space-y-2.5 mb-5">
                  {p.bullets.map((b, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-2 text-sm text-gray-700"
                    >
                      <CheckCircle2 className="w-4 h-4 text-[#F97415] mt-0.5 flex-shrink-0" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>

                <div className="bg-[#F97415]/5 border-l-4 border-[#F97415] rounded-r-lg p-3.5">
                  <p className="text-[11px] uppercase tracking-widest text-[#F97415] font-bold mb-1">
                    Esempio guadagno
                  </p>
                  <p className="text-sm font-semibold text-[#111111] leading-snug">
                    {p.earnExample}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <p className="text-center text-sm text-gray-500 mt-10 max-w-2xl mx-auto">
            <strong>Volutamente fuori target</strong>: influencer generalisti, affiliate
            marketer professionali e partner senza nessuna relazione con il settore
            edile. Il programma non è ottimizzato per loro.
          </p>
        </div>
      </section>

      {/* HOW IT WORKS / TIMELINE */}
      <section
        className="py-20 md:py-28"
        style={{ backgroundColor: "#f8fafb" }}
      >
        <div className="max-w-6xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-14 md:mb-16">
            <span className="inline-block mb-4 px-4 py-1.5 rounded-full bg-[#F97415]/10 border border-[#F97415]/30 text-[#F97415] text-xs font-bold tracking-widest uppercase">
              Il viaggio del partner
            </span>
            <h2 className="text-3xl md:text-5xl font-extrabold mb-4">
              Dai primi <span className="text-[#F97415]">7 giorni</span> al primo Platinum
            </h2>
            <p className="text-gray-600 text-lg max-w-xl mx-auto">
              Niente burocrazia, niente formazione di 3 mesi. Si parte subito.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 md:gap-8">
            {[
              {
                n: "Giorno 0",
                title: "Application",
                desc: "Compili il form. Verifica automatica P.IVA + due diligence light. Risposta entro 48 ore.",
                icon: FileSignature,
              },
              {
                n: "Giorno 1–7",
                title: "Onboarding",
                desc: "Codice partner generato, link tracciato attivo, kit materiali consegnato. Call onboarding 60 minuti: prodotto, ICP, pitch in 3 minuti, gestione obiezioni.",
                icon: GraduationCap,
              },
              {
                n: "Mese 1–3",
                title: "Primo cliente",
                desc: "Tempo medio dal primo lead alla prima conversione: 30-60 giorni. Supporto attivo del nostro team commerciale per chiudere il primo cliente.",
                icon: HandCoins,
              },
              {
                n: "Mese 4–9",
                title: "Promozione Silver",
                desc: "Raggiunti 6 clienti attivi → upgrade automatico al Tier 2 (20%). Account manager dedicato, demo guidate, materiali co-brandati.",
                icon: Medal,
              },
              {
                n: "Mese 12–18",
                title: "Promozione Gold",
                desc: "16+ clienti attivi → Tier 3 (25%). Stai generando 600-1.000€/mese di commissione ricorrente. Diventa una linea di business reale.",
                icon: Award,
              },
              {
                n: "Mese 24+",
                title: "Platinum",
                desc: "31+ clienti attivi → Tier 4 (30%). 2.000+ €/mese ricorrenti, co-marketing, quote custom. Top 5-10% dei partner.",
                icon: Trophy,
              },
            ].map((s, i) => (
              <div key={i} className="relative">
                <div className="bg-white rounded-3xl p-6 md:p-7 shadow-sm border border-gray-100 h-full hover:shadow-lg transition-all">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 rounded-2xl bg-[#F97415]/10 flex items-center justify-center">
                      <s.icon className="w-6 h-6 text-[#F97415]" />
                    </div>
                    <span className="text-[10px] font-mono font-bold tracking-widest text-[#F97415] uppercase">
                      {s.n}
                    </span>
                  </div>
                  <h3 className="text-lg md:text-xl font-extrabold text-[#111111] mb-2">
                    {s.title}
                  </h3>
                  <p className="text-sm text-gray-600 leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TIERS — 4 livelli */}
      <section className="py-14 sm:py-20 md:py-28 bg-white">
        <div className="max-w-6xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-14 md:mb-16">
            <span className="inline-block mb-4 px-4 py-1.5 rounded-full bg-[#F97415]/10 border border-[#F97415]/30 text-[#F97415] text-xs font-bold tracking-widest uppercase">
              4 tier meritocratici
            </span>
            <h2 className="text-3xl md:text-5xl font-extrabold mb-4">
              Sale di livello <span className="text-[#F97415]">chi performa</span>
            </h2>
            <p className="text-gray-600 text-lg max-w-2xl mx-auto">
              Niente fee di ingresso, niente membership annuali, niente livelli pagati.
              Il livello lo fa il risultato. La promozione di tier avviene il 1° del mese
              successivo al raggiungimento della soglia.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
            {tiers.map((t) => (
              <div
                key={t.name}
                className={`relative rounded-3xl p-6 md:p-7 transition-all ${
                  t.highlight
                    ? "bg-[#111111] text-white shadow-2xl border-2 border-[#F97415]"
                    : "bg-white text-[#111111] shadow-sm border border-gray-100"
                }`}
              >
                {t.highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-[#F97415] text-white text-xs font-bold rounded-full uppercase tracking-widest whitespace-nowrap">
                    Sweet spot
                  </span>
                )}

                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p
                      className={`text-[10px] font-mono font-bold tracking-widest uppercase mb-1 ${
                        t.highlight ? "text-white/50" : "text-gray-400"
                      }`}
                    >
                      {t.label}
                    </p>
                    <h3 className="text-2xl font-extrabold">{t.name}</h3>
                  </div>
                  <div
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                      t.highlight ? "bg-[#F97415]" : "bg-[#F97415]/10"
                    }`}
                  >
                    <t.icon
                      className={`w-6 h-6 ${
                        t.highlight ? "text-white" : "text-[#F97415]"
                      }`}
                    />
                  </div>
                </div>

                <p
                  className={`text-xs mb-4 ${
                    t.highlight ? "text-white/70" : "text-gray-500"
                  }`}
                >
                  {t.range}
                </p>

                <div className="mb-5">
                  <span className="text-4xl md:text-5xl font-extrabold text-[#F97415]">
                    {t.rate}
                  </span>
                  <span
                    className={`text-xs ml-1 ${
                      t.highlight ? "text-white/70" : "text-gray-500"
                    }`}
                  >
                    ricorrente
                  </span>
                </div>

                <ul className="space-y-2">
                  {t.perks.map((perk, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-xs">
                      <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-[#F97415]" />
                      <span
                        className={t.highlight ? "text-white/90" : "text-gray-700"}
                      >
                        {perk}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <p className="text-center text-sm text-gray-500 mt-10 max-w-2xl mx-auto">
            Il tier raggiunto è <strong>"sticky"</strong>: si mantiene anche se
            temporaneamente scendi sotto la soglia per churn (max 60 giorni, poi
            step-down automatico).
          </p>
        </div>
      </section>

      {/* COSA SI COMMISSIONA / COSA NO */}
      <section className="py-14 sm:py-20 md:py-28" style={{ backgroundColor: "#f8fafb" }}>
        <div className="max-w-5xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-12">
            <span className="inline-block mb-4 px-4 py-1.5 rounded-full bg-[#F97415]/10 border border-[#F97415]/30 text-[#F97415] text-xs font-bold tracking-widest uppercase">
              Trasparenza totale
            </span>
            <h2 className="text-3xl md:text-5xl font-extrabold mb-4">
              Cosa si commissiona, <span className="text-[#F97415]">cosa no</span>
            </h2>
            <p className="text-gray-600 text-lg max-w-2xl mx-auto">
              La regola d'oro: si commissiona solo il canone mensile del piano.
              Tutto ciò che è add-on, consumo o servizio una tantum è escluso.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            <div className="bg-white rounded-2xl p-6 md:p-8 border-t-4 border-green-600 shadow-sm">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                </div>
                <h3 className="text-xl font-extrabold text-[#111111]">Si commissiona</h3>
              </div>
              <ul className="space-y-3">
                {commissionRules.yes.map((r, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2.5 text-sm text-gray-700 pb-3 border-b border-gray-100 last:border-0 last:pb-0"
                  >
                    <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-white rounded-2xl p-6 md:p-8 border-t-4 border-red-500 shadow-sm">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                  <XCircle className="w-5 h-5 text-red-500" />
                </div>
                <h3 className="text-xl font-extrabold text-[#111111]">
                  Non si commissiona
                </h3>
              </div>
              <ul className="space-y-3">
                {commissionRules.no.map((r, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2.5 text-sm text-gray-700 pb-3 border-b border-gray-100 last:border-0 last:pb-0"
                  >
                    <XCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-8 bg-[#111111] rounded-2xl p-6 md:p-8 text-white">
            <p className="text-xs font-mono font-bold tracking-widest text-[#F97415] uppercase mb-3">
              Pagamenti & fatturazione
            </p>
            <div className="grid md:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="font-bold mb-1">Maturazione</p>
                <p className="text-white/70 leading-relaxed">
                  Il giorno in cui il cliente paga la fattura del mese. Se è in ritardo,
                  la commissione resta in stato "pending".
                </p>
              </div>
              <div>
                <p className="font-bold mb-1">Liquidazione</p>
                <p className="text-white/70 leading-relaxed">
                  Il 15 del mese successivo. Soglia minima 50€ — sotto soglia si
                  accumula al mese successivo.
                </p>
              </div>
              <div>
                <p className="font-bold mb-1">Con P.IVA</p>
                <p className="text-white/70 leading-relaxed">
                  Fattura elettronica verso Domus Group + bonifico a 30 giorni. IVA
                  standard 22%.
                </p>
              </div>
              <div>
                <p className="font-bold mb-1">Senza P.IVA</p>
                <p className="text-white/70 leading-relaxed">
                  Ricevuta per prestazione occasionale (max 5.000€/anno per legge
                  italiana).
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CALCULATOR */}
      <section
        id="calcolatore"
        className="py-20 md:py-28"
        style={{
          background: "linear-gradient(180deg, #FFF8F2 0%, #FFFFFF 100%)",
        }}
      >
        <div className="max-w-4xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-12">
            <span className="inline-block mb-4 px-4 py-1.5 rounded-full bg-[#F97415]/10 border border-[#F97415]/30 text-[#F97415] text-xs font-bold tracking-widest uppercase">
              Calcolatore guadagno
            </span>
            <h2 className="text-3xl md:text-5xl font-extrabold mb-4">
              Quanto puoi guadagnare con il <span className="text-[#F97415]">tuo network</span>?
            </h2>
            <p className="text-gray-600 text-lg max-w-xl mx-auto">
              Sposta lo slider e cambia il piano per vedere il tuo tier e la rendita
              ricorrente mensile.
            </p>
          </div>

          <CommissionCalculator />
        </div>
      </section>

      {/* BENEFITS */}
      <section className="py-14 sm:py-20 md:py-28 bg-white">
        <div className="max-w-6xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-14 md:mb-16">
            <span className="inline-block mb-4 px-4 py-1.5 rounded-full bg-[#F97415]/10 border border-[#F97415]/30 text-[#F97415] text-xs font-bold tracking-widest uppercase">
              Cosa ricevi
            </span>
            <h2 className="text-3xl md:text-5xl font-extrabold mb-4">
              Tutto quello che ti serve per <span className="text-[#F97415]">raccomandare bene</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-5 md:gap-6">
            {benefits.map((b) => (
              <div
                key={b.title}
                className="bg-white rounded-2xl p-6 border border-gray-100 hover:border-[#F97415]/30 hover:shadow-lg transition-all"
              >
                <div className="w-12 h-12 rounded-2xl bg-[#F97415]/10 flex items-center justify-center mb-4">
                  <b.icon className="w-6 h-6 text-[#F97415]" />
                </div>
                <h3 className="text-lg font-extrabold text-[#111111] mb-2">{b.title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{b.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TESTIMONIAL */}
      <section className="py-14 sm:py-20 md:py-24" style={{ backgroundColor: "#111111" }}>
        <div className="max-w-4xl mx-auto px-5 sm:px-6 text-center">
          <div className="flex items-center justify-center gap-1 mb-6">
            {[...Array(5)].map((_, i) => (
              <Star key={i} className="w-5 h-5 fill-[#F97415] text-[#F97415]" />
            ))}
          </div>
          <blockquote className="text-2xl md:text-3xl font-bold text-white leading-snug mb-8">
            "La struttura a tier non serve a 'incentivare di più chi vende di più'.
            Serve a <span className="text-[#F97415]">premiare chi costruisce un pezzo
            di azienda con noi</span>. Il Platinum non è un partner — è un socio
            commerciale."
          </blockquote>
          <div className="flex items-center justify-center gap-4">
            <div className="w-14 h-14 rounded-full bg-[#F97415] flex items-center justify-center">
              <span className="text-white text-xl font-bold">F</span>
            </div>
            <div className="text-left">
              <p className="text-white font-bold">Florin Andriciuc</p>
              <p className="text-white/60 text-sm">Fondatore Edilizia in Cloud</p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-14 sm:py-20 md:py-28 bg-white">
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-12">
            <span className="inline-block mb-4 px-4 py-1.5 rounded-full bg-[#F97415]/10 border border-[#F97415]/30 text-[#F97415] text-xs font-bold tracking-widest uppercase">
              Domande frequenti
            </span>
            <h2 className="text-3xl md:text-5xl font-extrabold mb-4">
              Risposte dirette, <span className="text-[#F97415]">senza zone grigie</span>
            </h2>
          </div>

          <div className="space-y-3">
            {faqs.map((faq, i) => {
              const isOpen = openFaq === i;
              return (
                <div
                  key={i}
                  className={`rounded-2xl overflow-hidden border transition-all ${
                    isOpen
                      ? "border-[#F97415]/30 shadow-lg shadow-[#F97415]/5"
                      : "border-gray-100"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaq(isOpen ? null : i)}
                    className="w-full flex items-center justify-between gap-4 p-5 md:p-6 text-left bg-white hover:bg-gray-50 transition-colors"
                    aria-expanded={isOpen}
                  >
                    <span
                      className={`font-bold text-sm md:text-base ${
                        isOpen ? "text-[#F97415]" : "text-[#111111]"
                      }`}
                    >
                      {faq.q}
                    </span>
                    <ChevronDown
                      className={`w-5 h-5 flex-shrink-0 transition-transform ${
                        isOpen ? "rotate-180 text-[#F97415]" : "text-gray-400"
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-5 md:px-6 pb-5 md:pb-6 text-gray-600 text-sm md:text-base leading-relaxed bg-white">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* APPLICATION FORM */}
      <section
        ref={formRef}
        id="candidatura"
        className="py-20 md:py-28"
        style={{
          background: "linear-gradient(180deg, #FFFFFF 0%, #FFF8F2 100%)",
        }}
      >
        <div className="max-w-3xl mx-auto px-5 sm:px-6">
          <div className="text-center mb-12">
            <span className="inline-block mb-4 px-4 py-1.5 rounded-full bg-[#F97415]/10 border border-[#F97415]/30 text-[#F97415] text-xs font-bold tracking-widest uppercase">
              Candidatura partner
            </span>
            <h2 className="text-3xl md:text-5xl font-extrabold mb-4">
              Pronto a <span className="text-[#F97415]">candidarti</span>?
            </h2>
            <p className="text-gray-600 text-lg max-w-xl mx-auto">
              Compila il form. Verifica P.IVA + due diligence light entro 48 ore. Poi
              call di onboarding di 60 minuti.
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="bg-white rounded-3xl p-6 md:p-10 shadow-2xl border border-[#F97415]/10 space-y-5"
          >
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-[#111111] mb-1.5">
                  Nome e cognome *
                </label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#F97415] focus:ring-2 focus:ring-[#F97415]/20 outline-none transition-all text-sm"
                  placeholder="Mario Rossi"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-[#111111] mb-1.5">
                  Email *
                </label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#F97415] focus:ring-2 focus:ring-[#F97415]/20 outline-none transition-all text-sm"
                  placeholder="mario@esempio.it"
                />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-[#111111] mb-1.5">
                  Telefono
                </label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#F97415] focus:ring-2 focus:ring-[#F97415]/20 outline-none transition-all text-sm"
                  placeholder="+39 333 1234567"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-[#111111] mb-1.5">
                  Azienda / Studio (con P.IVA)
                </label>
                <input
                  type="text"
                  value={form.company}
                  onChange={(e) => setForm({ ...form, company: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#F97415] focus:ring-2 focus:ring-[#F97415]/20 outline-none transition-all text-sm"
                  placeholder="Studio Rossi & Associati"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-[#111111] mb-2">
                Sei un...
              </label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {[
                  { v: "commercialista", l: "Commercialista", icon: Briefcase },
                  { v: "agency", l: "Agenzia Marketing", icon: Megaphone },
                  { v: "professional", l: "Commerciale", icon: Users },
                  { v: "company", l: "Azienda settore edile", icon: Building2 },
                ].map((opt) => {
                  const active = form.partner_type === opt.v;
                  return (
                    <button
                      key={opt.v}
                      type="button"
                      onClick={() => setForm({ ...form, partner_type: opt.v })}
                      className={`flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border-2 transition-all text-xs font-semibold ${
                        active
                          ? "border-[#F97415] bg-[#F97415]/5 text-[#F97415]"
                          : "border-gray-200 text-gray-600 hover:border-gray-300"
                      }`}
                    >
                      <opt.icon className="w-5 h-5" />
                      <span className="text-center leading-tight">{opt.l}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-[#111111] mb-1.5">
                Quante imprese edili pensi di poter portare nei primi 12 mesi?
              </label>
              <input
                type="number"
                min="1"
                value={form.network_size}
                onChange={(e) => setForm({ ...form, network_size: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#F97415] focus:ring-2 focus:ring-[#F97415]/20 outline-none transition-all text-sm"
                placeholder="es. 8"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-[#111111] mb-1.5">
                Raccontaci di te{" "}
                <span className="text-gray-400 font-normal">(opzionale)</span>
              </label>
              <textarea
                rows={4}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#F97415] focus:ring-2 focus:ring-[#F97415]/20 outline-none transition-all text-sm resize-none"
                placeholder="Chi sei, settore di attività, come conosci le imprese edili, perché vuoi entrare nel programma..."
              />
            </div>

            {/* GDPR Consents */}
            <div className="pt-4 border-t border-gray-100 space-y-3">
              <p className="text-[10px] font-bold tracking-widest uppercase text-gray-500">
                Consensi privacy <span className="text-[#F97415]">(art. 13 GDPR)</span>
              </p>

              <label className="flex items-start gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={form.privacy_consent}
                  onChange={(e) =>
                    setForm({ ...form, privacy_consent: e.target.checked })
                  }
                  className="mt-0.5 w-4 h-4 rounded border-2 border-gray-300 cursor-pointer accent-[#F97415] flex-shrink-0"
                />
                <span className="text-xs text-gray-600 leading-relaxed">
                  <strong className="text-[#F97415]">*</strong> Ho letto e accetto la{" "}
                  <Link
                    to="/privacy-policy"
                    target="_blank"
                    rel="noopener"
                    className="text-[#F97415] hover:text-[#C94F06] underline font-semibold"
                  >
                    Privacy Policy
                  </Link>{" "}
                  e acconsento al trattamento dei miei dati per la valutazione della
                  candidatura partner (art. 6.1.b GDPR).{" "}
                  <span className="text-red-500 font-semibold">Obbligatorio</span>
                </span>
              </label>

              <label className="flex items-start gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={form.marketing_consent}
                  onChange={(e) =>
                    setForm({ ...form, marketing_consent: e.target.checked })
                  }
                  className="mt-0.5 w-4 h-4 rounded border-2 border-gray-300 cursor-pointer accent-[#F97415] flex-shrink-0"
                />
                <span className="text-xs text-gray-600 leading-relaxed">
                  Acconsento a ricevere comunicazioni commerciali, materiale formativo e
                  aggiornamenti sul programma partner via email (art. 6.1.a GDPR).{" "}
                  <span className="opacity-70">
                    Facoltativo — revocabile in ogni momento.
                  </span>
                </span>
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full bg-[#F97415] hover:bg-[#C94F06] text-white font-bold text-base transition-all hover:scale-[1.02] shadow-lg shadow-[#F97415]/30 disabled:opacity-60 disabled:hover:scale-100"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" /> Invio in corso...
                </>
              ) : (
                <>
                  Invia candidatura partner
                  <Send className="w-5 h-5" />
                </>
              )}
            </button>

            <p className="text-center text-xs text-gray-500">
              Risposta entro 48 ore · Niente fee di ingresso · Domus Group S.r.l. P.IVA
              IT13132010961
            </p>
          </form>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
