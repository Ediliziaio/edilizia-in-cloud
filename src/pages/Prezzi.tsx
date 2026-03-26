import { useState, useEffect } from "react";
import { useSEO } from "@/hooks/useSEO";
import { JsonLd } from "@/components/seo/JsonLd";
import { Link } from "react-router-dom";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";
import {
  Check,
  X,
  Shield,
  Zap,
  RefreshCw,
  FileText,
  Headphones,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Star,
  Users,
  BarChart3,
  MessageSquare,
  Bot,
  Globe,
  Webhook,
  Quote,
} from "lucide-react";

function PromoBanner() {
  return (
    <div className="fixed top-0 left-0 right-0 z-[60] bg-[#0fa68c] text-white py-2 text-center overflow-hidden">
      <span
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.12) 50%, transparent 100%)",
          backgroundSize: "200% 100%",
        }}
      />
      <span className="relative flex items-center justify-center gap-2 text-xs md:text-sm font-bold tracking-wide">
        SE NON TI FA GUADAGNARE, IL PROGRAMMA È GRATIS PER SEMPRE
      </span>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

const fmtNum = (n: number) =>
  new Intl.NumberFormat("it-IT", { maximumFractionDigits: 0 }).format(n);

// ── Feature check / cross cells ───────────────────────────────────────────────

function CheckIcon() {
  return <Check className="w-5 h-5 text-[#0fa68c] mx-auto" strokeWidth={2.5} />;
}
function CrossIcon() {
  return <X className="w-5 h-5 text-gray-300 mx-auto" strokeWidth={2} />;
}

// ── Comparison table rows definition ─────────────────────────────────────────

type Cell = string | "check" | "cross";

interface TableRow {
  label: string;
  starter: Cell;
  professional: Cell;
  enterprise: Cell;
  category?: string;
}

const tableRows: TableRow[] = [
  // Cantieri
  { label: "Commesse attive", starter: "50", professional: "Illimitate", enterprise: "Illimitate", category: "Cantieri" },
  { label: "Marginalità per commessa", starter: "check", professional: "check", enterprise: "check" },
  { label: "Marginalità avanzata comparata", starter: "cross", professional: "check", enterprise: "check" },
  { label: "Avanzamento cantieri", starter: "check", professional: "check", enterprise: "check" },
  { label: "Giornale dei lavori", starter: "cross", professional: "check", enterprise: "check" },
  { label: "Ordini di acquisto", starter: "cross", professional: "check", enterprise: "check" },
  { label: "Sicurezza cantiere", starter: "cross", professional: "check", enterprise: "check" },
  { label: "Documenti allegati", starter: "check", professional: "check", enterprise: "check" },
  // Finanziario
  { label: "Previsionale di cassa", starter: "30 giorni", professional: "90 giorni", enterprise: "90+ giorni", category: "Finanziario" },
  { label: "Tesoreria", starter: "cross", professional: "check", enterprise: "check" },
  { label: "Scadenzario completo", starter: "cross", professional: "check", enterprise: "check" },
  { label: "Prima nota", starter: "check", professional: "check", enterprise: "check" },
  { label: "Fatturazione elettronica SDI", starter: "cross", professional: "cross", enterprise: "check" },
  { label: "Integrazione contabilità esterna", starter: "cross", professional: "cross", enterprise: "check" },
  // Marketing & CRM
  { label: "CRM contatti", starter: "cross", professional: "Illimitati", enterprise: "Illimitati", category: "Marketing & CRM" },
  { label: "Pipeline opportunità", starter: "cross", professional: "check", enterprise: "check" },
  { label: "Preventivi digitali con firma online", starter: "cross", professional: "check", enterprise: "check" },
  { label: "Email marketing", starter: "cross", professional: "Fino a 5.000", enterprise: "Illimitati" },
  { label: "WhatsApp marketing", starter: "cross", professional: "Base", enterprise: "Avanzato + automazioni" },
  { label: "Portale clienti branded", starter: "cross", professional: "cross", enterprise: "check" },
  // HR & Personale
  { label: "Gestione personale", starter: "cross", professional: "check", enterprise: "check", category: "HR & Personale" },
  { label: "Timbrature kiosk", starter: "cross", professional: "check", enterprise: "check" },
  { label: "Costi manodopera per cantiere", starter: "cross", professional: "check", enterprise: "check" },
  // Magazzino
  { label: "Gestione materiali", starter: "cross", professional: "check", enterprise: "check", category: "Magazzino" },
  { label: "Tracking ordini acquisto", starter: "cross", professional: "check", enterprise: "check" },
  // AI & Automazioni
  { label: "Agenti AI", starter: "cross", professional: "cross", enterprise: "check", category: "AI & Automazioni" },
  { label: "Automazioni avanzate", starter: "cross", professional: "cross", enterprise: "check" },
  // Integrazioni
  { label: "API access", starter: "cross", professional: "cross", enterprise: "check", category: "Integrazioni" },
  { label: "Webhook personalizzati", starter: "cross", professional: "cross", enterprise: "check" },
  { label: "Report e dashboard custom", starter: "cross", professional: "cross", enterprise: "check" },
  // Team
  { label: "Utenti inclusi", starter: "3", professional: "10", enterprise: "Illimitati", category: "Team" },
  { label: "Ruoli e permessi", starter: "Base", professional: "Avanzati", enterprise: "Avanzati" },
  // Supporto
  { label: "Supporto", starter: "Email 24h", professional: "Tel/WhatsApp 2h", enterprise: "Dedicato 1h H12", category: "Supporto" },
  { label: "Consulente del Controllo", starter: "cross", professional: "1 call/mese", enterprise: "2 call/mese" },
  { label: "Onboarding", starter: "self-service", professional: "Dedicato", enterprise: "Premium 3 sessioni" },
  { label: "SLA uptime garantito", starter: "cross", professional: "cross", enterprise: "99.9%" },
];

const faqItems = [
  {
    q: "C'è un periodo di prova gratuita?",
    a: "Sì, offriamo una demo gratuita personalizzata con il nostro team + 14 giorni di accesso completo al piano Professional. Nessuna carta di credito richiesta per iniziare.",
  },
  {
    q: "Posso cambiare piano in qualsiasi momento?",
    a: "Sì. L'upgrade è immediato: le nuove funzionalità sono disponibili subito. Il downgrade viene applicato a fine periodo di fatturazione corrente.",
  },
  {
    q: "Cosa succede se supero i limiti del piano Starter?",
    a: "Ti avvisiamo in anticipo — nessun blocco improvviso. Il nostro team ti contatterà per aiutarti a valutare l'upgrade nel momento giusto per la tua crescita.",
  },
  {
    q: "Il prezzo include IVA?",
    a: "No, i prezzi indicati sono IVA esclusa. L'IVA verrà applicata in fattura secondo la normativa vigente (22% per soggetti IVA italiani).",
  },
  {
    q: "Come funziona la garanzia soddisfatti o rimborsati?",
    a: "Se entro 30 giorni dall'attivazione non sei soddisfatto per qualsiasi motivo, ti rimborsiamo l'intero importo pagato. Nessuna domanda, nessuna burocrazia.",
  },
  {
    q: "Posso pagare con carta, bonifico o fattura?",
    a: "Tutti i metodi di pagamento sono accettati: carta di credito/debito, PayPal, e bonifico bancario. Per i piani annuali è possibile pagare con bonifico e ricevere regolare fattura elettronica.",
  },
  {
    q: "Il Consulente del Controllo è una persona reale?",
    a: "Sì, è una persona del nostro team specializzata in controllo di gestione per imprese edili. Non è un chatbot, non è un'AI. Conosce il tuo settore e i tuoi numeri.",
  },
  {
    q: "Se disdico, perdo i dati?",
    a: "No. Puoi esportare tutti i tuoi dati in qualsiasi momento, anche dopo la disdetta. I dati rimangono accessibili per 90 giorni dalla cancellazione.",
  },
];

// ── Main component ─────────────────────────────────────────────────────────────

export default function Prezzi() {
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // ROI calculator state
  const [fatturato, setFatturato] = useState(800000);
  const [oreSettimana, setOreSettimana] = useState(10);
  const [compensoOrario, setCompensoOrario] = useState(50);

  // Derived ROI calculations
  const costoExcel = oreSettimana * compensoOrario * 52;
  const marginiRecuperabili = fatturato * 0.015;
  const valoreAnnuo = costoExcel + marginiRecuperabili;
  const costoProfessionalAnno = 199 * 12;
  const roi = Math.round((valoreAnnuo / costoProfessionalAnno) * 100);
  const paybackMesi = costoProfessionalAnno / (valoreAnnuo / 12);
  const paybackLabel = paybackMesi < 1 ? "< 1 mese" : `${paybackMesi.toFixed(1)} mesi`;

  useSEO({
    title: "Prezzi — Piani e Costi del Software Gestionale per Edilizia",
    description: "Scegli il piano Edilizia in Cloud adatto alla tua impresa. Da €79/mese con 30 giorni gratuiti. Calcolatore ROI incluso per misurare il tuo ritorno sull'investimento.",
    canonical: "/prezzi",
    keywords: "prezzi software edilizia, costo gestionale edilizia, abbonamento software cantieri, piano gestionale impresa edile",
  });

  const prices = {
    starter: billing === "monthly" ? 99 : 79,
    professional: billing === "monthly" ? 199 : 159,
    enterprise: billing === "monthly" ? 399 : 319,
  };

  const savings = {
    starter: (99 - 79) * 12,
    professional: (199 - 159) * 12,
    enterprise: (399 - 319) * 12,
  };

  return (
    <div className="min-h-screen bg-white text-[#1a2744] overflow-x-hidden">
      <JsonLd id="jsonld-prezzi" data={{
        "@context": "https://schema.org",
        "@type": "Product",
        "name": "Edilizia in Cloud",
        "description": "Software gestionale completo per imprese edili italiane",
        "brand": { "@type": "Brand", "name": "Edilizia in Cloud" },
        "offers": [
          { "@type": "Offer", "name": "Starter", "price": "79", "priceCurrency": "EUR", "priceSpecification": { "@type": "UnitPriceSpecification", "unitText": "MONTH" }, "availability": "https://schema.org/InStock" },
          { "@type": "Offer", "name": "Professional", "price": "159", "priceCurrency": "EUR", "priceSpecification": { "@type": "UnitPriceSpecification", "unitText": "MONTH" }, "availability": "https://schema.org/InStock" },
          { "@type": "Offer", "name": "Enterprise", "price": "319", "priceCurrency": "EUR", "priceSpecification": { "@type": "UnitPriceSpecification", "unitText": "MONTH" }, "availability": "https://schema.org/InStock" }
        ],
        "aggregateRating": { "@type": "AggregateRating", "ratingValue": "4.9", "reviewCount": "127", "bestRating": "5" }
      }} />
      <JsonLd id="jsonld-breadcrumb-prezzi" data={{
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://ediliziaincloud.com/home" },
          { "@type": "ListItem", "position": 2, "name": "Prezzi", "item": "https://ediliziaincloud.com/prezzi" }
        ]
      }} />
      <PromoBanner />
      <LandingNavbar />

      {/* ── 1. HERO ─────────────────────────────────────────────────────────── */}
      <section
        className="pt-28 pb-20 px-4 text-center"
        style={{ background: "linear-gradient(160deg, #1a2744 0%, #0f1d35 100%)" }}
      >
        {/* Badge */}
        <div className="inline-flex items-center gap-2 bg-white/10 text-white border border-white/20 rounded-full px-4 py-1.5 text-xs font-bold tracking-widest mb-6 uppercase">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400"></span>
          </span>
          Prezzi Trasparenti — Nessun Costo Nascosto
        </div>

        <h1 className="text-4xl md:text-6xl font-extrabold text-white leading-tight mb-5 max-w-3xl mx-auto">
          L'investimento che si{" "}
          <span className="text-[#0fa68c]">ripaga da solo.</span>
        </h1>
        <p className="text-white/70 text-lg md:text-xl max-w-2xl mx-auto mb-10">
          Ogni piano include il Consulente del Controllo dedicato. Setup e migrazione dati gratis. Disdici quando vuoi.
        </p>

        {/* Toggle */}
        <div className="inline-flex items-center bg-white/10 rounded-full p-1 gap-1 border border-white/20">
          <button
            onClick={() => setBilling("monthly")}
            className={`px-5 py-2 rounded-full text-sm font-semibold transition-all ${
              billing === "monthly"
                ? "bg-white text-[#1a2744] shadow"
                : "text-white/70 hover:text-white"
            }`}
          >
            Mensile
          </button>
          <button
            onClick={() => setBilling("annual")}
            className={`px-5 py-2 rounded-full text-sm font-semibold transition-all flex items-center gap-2 ${
              billing === "annual"
                ? "bg-white text-[#1a2744] shadow"
                : "text-white/70 hover:text-white"
            }`}
          >
            Annuale
            <span className="bg-[#0fa68c] text-white text-xs px-2 py-0.5 rounded-full font-bold">
              -20%
            </span>
          </button>
        </div>
      </section>

      {/* ── 2. PIANI ────────────────────────────────────────────────────────── */}
      <section className="py-16 px-4 bg-[#f7f9fc]">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 items-start">

          {/* ── STARTER ── */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 flex flex-col">
            <div className="mb-6">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">Starter</p>
              <p className="text-sm text-gray-500 mb-4">Imprese fino a 500K € di fatturato</p>
              <div className="flex items-end gap-1 mb-1">
                <span className="text-5xl font-extrabold text-[#1a2744]">€{prices.starter}</span>
                <span className="text-gray-400 text-base mb-2">/mese</span>
              </div>
              {billing === "annual" && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="line-through text-gray-400">€99/mese</span>
                  <span className="bg-[#0fa68c]/10 text-[#0fa68c] font-semibold px-2 py-0.5 rounded-full text-xs">
                    Risparmi €{savings.starter}/anno
                  </span>
                </div>
              )}
              {billing === "annual" && (
                <p className="text-xs text-gray-400 mt-1">Fatturato annualmente (€{prices.starter * 12}/anno)</p>
              )}
            </div>
            <Link
              to="/demo"
              className="block text-center border-2 border-[#1a2744] text-[#1a2744] font-bold py-3 rounded-xl hover:bg-[#1a2744] hover:text-white transition-colors mb-6"
            >
              Inizia con Starter
            </Link>
            <div className="space-y-5 flex-1">
              <FeatureGroup title="Gestione Cantieri">
                <Feature label="Fino a 50 commesse attive" />
                <Feature label="Margine reale per commessa" />
                <Feature label="Avanzamento cantieri" />
                <Feature label="Documenti allegati" />
              </FeatureGroup>
              <FeatureGroup title="Finanziario">
                <Feature label="Previsionale di cassa base (30 gg)" />
                <Feature label="Costi aziendali" />
                <Feature label="Prima nota" />
              </FeatureGroup>
              <FeatureGroup title="Team">
                <Feature label="3 utenti inclusi" />
                <Feature label="Ruoli e permessi base" />
              </FeatureGroup>
              <FeatureGroup title="Supporto">
                <Feature label="Supporto via email (risposta 24h)" />
                <Feature label="Accesso alla knowledge base" />
                <Feature label="Webinar formativi mensili" />
              </FeatureGroup>
              <FeatureGroup title="Non incluso" negative>
                <Feature label="Magazzino avanzato" negative />
                <Feature label="Previsionale 60/90 giorni" negative />
                <Feature label="Marketing & CRM" negative />
                <Feature label="HR & Personale avanzato" negative />
                <Feature label="Fatturazione elettronica SDI" negative />
                <Feature label="Agenti AI" negative />
                <Feature label="API access" negative />
              </FeatureGroup>
            </div>
          </div>

          {/* ── PROFESSIONAL ── */}
          <div className="bg-white rounded-2xl border-2 border-[#0fa68c] shadow-xl p-8 flex flex-col scale-[1.02] relative">
            <div className="absolute -top-4 left-1/2 -translate-x-1/2">
              <span className="bg-[#0fa68c] text-white text-xs font-extrabold px-4 py-1.5 rounded-full tracking-widest uppercase shadow-lg">
                Più Popolare
              </span>
            </div>
            <div className="mb-6 mt-2">
              <p className="text-xs font-bold uppercase tracking-widest text-[#0fa68c] mb-1">Professional</p>
              <p className="text-sm text-gray-500 mb-4">Imprese da 500K a 2M € di fatturato</p>
              <div className="flex items-end gap-1 mb-1">
                <span className="text-5xl font-extrabold text-[#1a2744]">€{prices.professional}</span>
                <span className="text-gray-400 text-base mb-2">/mese</span>
              </div>
              {billing === "annual" && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="line-through text-gray-400">€199/mese</span>
                  <span className="bg-[#0fa68c]/10 text-[#0fa68c] font-semibold px-2 py-0.5 rounded-full text-xs">
                    Risparmi €{savings.professional}/anno
                  </span>
                </div>
              )}
              {billing === "annual" && (
                <p className="text-xs text-gray-400 mt-1">Fatturato annualmente (€{prices.professional * 12}/anno)</p>
              )}
            </div>
            <Link
              to="/demo"
              className="block text-center bg-[#0fa68c] text-white font-bold py-3 rounded-xl hover:bg-[#0d9079] transition-colors mb-6 shadow-md"
            >
              Scegli Professional
            </Link>
            <div className="space-y-5 flex-1">
              <FeatureGroup title="Gestione Cantieri">
                <Feature label="Commesse illimitate" />
                <Feature label="Marginalità avanzata con analisi comparata" />
                <Feature label="Giornale dei lavori" />
                <Feature label="Ordini di acquisto" />
                <Feature label="Sicurezza cantiere" />
              </FeatureGroup>
              <FeatureGroup title="Finanziario">
                <Feature label="Previsionale di cassa completo (90 gg)" />
                <Feature label="Tesoreria" />
                <Feature label="Costi aziendali avanzati" />
                <Feature label="Scadenzario completo" />
                <Feature label="Prima nota" />
              </FeatureGroup>
              <FeatureGroup title="Marketing & CRM">
                <Feature label="CRM contatti illimitati" />
                <Feature label="Pipeline opportunità" />
                <Feature label="Preventivi digitali con firma online" />
                <Feature label="Email marketing (fino a 5.000 contatti)" />
                <Feature label="WhatsApp marketing base" />
              </FeatureGroup>
              <FeatureGroup title="HR & Personale">
                <Feature label="Gestione personale" />
                <Feature label="Timbrature kiosk" />
                <Feature label="Costi manodopera per cantiere" />
              </FeatureGroup>
              <FeatureGroup title="Magazzino">
                <Feature label="Gestione materiali" />
                <Feature label="Tracking ordini acquisto" />
              </FeatureGroup>
              <FeatureGroup title="Team">
                <Feature label="10 utenti inclusi" />
                <Feature label="Ruoli avanzati" />
              </FeatureGroup>
              <FeatureGroup title="Supporto">
                <Feature label="Telefono e WhatsApp (risposta 2h)" />
                <Feature label="Consulente del Controllo dedicato (1 call/mese)" />
                <Feature label="Onboarding dedicato incluso" />
              </FeatureGroup>
              <FeatureGroup title="Non incluso" negative>
                <Feature label="API access" negative />
                <Feature label="Report custom avanzati" negative />
                <Feature label="Email marketing oltre 5.000 contatti" negative />
                <Feature label="Supporto dedicato H24" negative />
              </FeatureGroup>
            </div>
          </div>

          {/* ── ENTERPRISE ── */}
          <div className="bg-white rounded-2xl border-2 border-[#1a2744] shadow-sm p-8 flex flex-col">
            <div className="mb-6">
              <p className="text-xs font-bold uppercase tracking-widest text-[#1a2744] mb-1">Enterprise</p>
              <p className="text-sm text-gray-500 mb-4">Imprese oltre 2M € o multi-cantiere</p>
              <div className="flex items-end gap-1 mb-1">
                <span className="text-5xl font-extrabold text-[#1a2744]">€{prices.enterprise}</span>
                <span className="text-gray-400 text-base mb-2">/mese</span>
              </div>
              {billing === "annual" && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="line-through text-gray-400">€399/mese</span>
                  <span className="bg-[#0fa68c]/10 text-[#0fa68c] font-semibold px-2 py-0.5 rounded-full text-xs">
                    Risparmi €{savings.enterprise}/anno
                  </span>
                </div>
              )}
              {billing === "annual" && (
                <p className="text-xs text-gray-400 mt-1">Fatturato annualmente (€{prices.enterprise * 12}/anno)</p>
              )}
            </div>
            <Link
              to="/demo"
              className="block text-center bg-[#1a2744] text-white font-bold py-3 rounded-xl hover:bg-[#0f1d35] transition-colors mb-6"
            >
              Contattaci
            </Link>
            <div className="space-y-5 flex-1">
              <p className="text-xs text-gray-500 italic">Tutto di Professional, più:</p>
              <FeatureGroup title="Extra Enterprise">
                <Feature label="Utenti illimitati" />
                <Feature label="API access completo" />
                <Feature label="Webhook personalizzati" />
                <Feature label="Report e dashboard custom" />
                <Feature label="Email marketing: contatti illimitati" />
                <Feature label="WhatsApp marketing avanzato con automazioni" />
                <Feature label="Agenti AI personalizzabili" />
                <Feature label="Fatturazione elettronica SDI nativa" />
                <Feature label="Integrazione contabilità esterna" />
                <Feature label="Portale clienti branded (custom domain)" />
                <Feature label="Supporto dedicato (risposta 1h, H12)" />
                <Feature label="Consulente del Controllo: 2 call/mese" />
                <Feature label="Onboarding premium (3 sessioni dedicate)" />
                <Feature label="SLA garantito 99.9% uptime" />
              </FeatureGroup>
            </div>
          </div>
        </div>
      </section>

      {/* ── 3. INCLUSO IN TUTTI I PIANI ─────────────────────────────────────── */}
      <section className="py-16 px-4 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs font-bold uppercase tracking-widest text-[#0fa68c] mb-2">Incluso ovunque</p>
            <h2 className="text-3xl md:text-4xl font-extrabold text-[#1a2744]">
              Cosa è incluso in <span className="text-[#0fa68c]">tutti i piani</span>
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {[
              { icon: <Shield className="w-6 h-6 text-[#0fa68c]" />, title: "Dati al sicuro", desc: "Server europei, GDPR, backup giornalieri automatici" },
              { icon: <Zap className="w-6 h-6 text-[#0fa68c]" />, title: "Setup incluso", desc: "Il nostro team configura tutto in 48 ore lavorative" },
              { icon: <RefreshCw className="w-6 h-6 text-[#0fa68c]" />, title: "Aggiornamenti gratuiti", desc: "Nuove feature ogni mese, senza costi aggiuntivi" },
              { icon: <FileText className="w-6 h-6 text-[#0fa68c]" />, title: "Migrazione dati gratis", desc: "Importiamo i tuoi dati da Excel o altri software" },
              { icon: <Headphones className="w-6 h-6 text-[#0fa68c]" />, title: "Supporto italiano", desc: "Parli con persone reali, non bot o call center esteri" },
              { icon: <TrendingUp className="w-6 h-6 text-[#0fa68c]" />, title: "Disdici quando vuoi", desc: "Nessun vincolo contrattuale, nessuna penale" },
            ].map((item, i) => (
              <div key={i} className="flex gap-4 items-start p-5 rounded-xl bg-[#f7f9fc] border border-gray-100">
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-[#0fa68c]/10 flex items-center justify-center">
                  {item.icon}
                </div>
                <div>
                  <p className="font-bold text-[#1a2744] text-sm">{item.title}</p>
                  <p className="text-gray-500 text-sm mt-0.5">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 4. CALCOLATORE ROI ───────────────────────────────────────────────── */}
      <section className="py-16 px-4 bg-[#f7f9fc]">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-xs font-bold uppercase tracking-widest text-[#0fa68c] mb-2">Calcolatore</p>
            <h2 className="text-3xl md:text-4xl font-extrabold text-[#1a2744] mb-3">
              Calcola il tuo ROI
            </h2>
            <p className="text-gray-500 text-lg max-w-xl mx-auto">
              Scopri in quanto tempo Edilizia in Cloud si ripaga.
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 md:p-10">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              {/* Inputs */}
              <div className="space-y-8">
                <SliderInput
                  label="Il tuo fatturato annuo"
                  value={fatturato}
                  min={200000}
                  max={5000000}
                  step={50000}
                  onChange={setFatturato}
                  format={(v) => fmt(v)}
                  unit=""
                />
                <SliderInput
                  label="Ore/settimana su Excel e report"
                  value={oreSettimana}
                  min={2}
                  max={30}
                  step={1}
                  onChange={setOreSettimana}
                  format={(v) => `${v}`}
                  unit="ore/sett."
                />
                <SliderInput
                  label="Tuo compenso orario stimato"
                  value={compensoOrario}
                  min={20}
                  max={150}
                  step={5}
                  onChange={setCompensoOrario}
                  format={(v) => `€${v}`}
                  unit="/ora"
                />
              </div>

              {/* Output */}
              <div className="flex flex-col justify-center">
                <div className="rounded-xl border border-[#0fa68c]/30 bg-[#0fa68c]/5 p-6 space-y-3">
                  <p className="text-sm font-bold text-[#1a2744] mb-2 uppercase tracking-wide">Il tuo calcolo</p>
                  <div className="space-y-2 text-sm">
                    <RoiLine label="Costo ore non ottimizzate" value={`${fmt(costoExcel)}/anno`} />
                    <RoiLine label="Margini recuperabili (1.5%)" value={`${fmt(marginiRecuperabili)}/anno`} />
                    <div className="border-t border-[#0fa68c]/30 my-2" />
                    <RoiLine label="Valore totale annuo" value={`${fmt(valoreAnnuo)}/anno`} bold />
                    <RoiLine label="Costo Professional/anno" value={fmt(costoProfessionalAnno)} />
                    <div className="border-t border-[#0fa68c]/30 my-2" />
                    <RoiLine label="ROI stimato" value={`${fmtNum(roi)}%`} highlight />
                    <RoiLine label="Si ripaga in" value={paybackLabel} highlight />
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-3 italic">
                  * Stima conservativa. La media dei nostri clienti recupera il valore dell'investimento nelle prime 6 settimane.
                </p>
              </div>
            </div>

            <div className="mt-8 text-center">
              <Link
                to="/demo"
                className="inline-flex items-center gap-2 bg-[#0fa68c] text-white font-bold px-8 py-4 rounded-xl hover:bg-[#0d9079] transition-colors text-base shadow-md"
              >
                Inizia la Demo — Vedi i Risultati Reali
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── 5. TABELLA COMPARATIVA ──────────────────────────────────────────── */}
      <section className="py-16 px-4 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-xs font-bold uppercase tracking-widest text-[#0fa68c] mb-2">Dettagli</p>
            <h2 className="text-3xl md:text-4xl font-extrabold text-[#1a2744]">
              Confronto dettagliato
            </h2>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-gray-200 shadow-sm">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="sticky top-0 z-10 bg-[#1a2744] text-white">
                  <th className="text-left px-5 py-4 font-semibold w-1/2">Funzionalità</th>
                  <th className="text-center px-4 py-4 font-semibold">Starter</th>
                  <th className="text-center px-4 py-4 font-semibold bg-[#0fa68c]">Professional</th>
                  <th className="text-center px-4 py-4 font-semibold">Enterprise</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row, i) => (
                  <>
                    {row.category && (
                      <tr key={`cat-${i}`} className="bg-gray-50">
                        <td
                          colSpan={4}
                          className="px-5 py-2 text-xs font-extrabold uppercase tracking-widest text-[#1a2744]/50"
                        >
                          {row.category}
                        </td>
                      </tr>
                    )}
                    <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                      <td className="px-5 py-3 text-gray-700">{row.label}</td>
                      <td className="px-4 py-3 text-center text-gray-600">
                        <TableCell value={row.starter} />
                      </td>
                      <td className="px-4 py-3 text-center bg-[#0fa68c]/5 font-medium">
                        <TableCell value={row.professional} />
                      </td>
                      <td className="px-4 py-3 text-center text-gray-600">
                        <TableCell value={row.enterprise} />
                      </td>
                    </tr>
                  </>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td className="px-5 py-4" />
                  <td className="px-4 py-4 text-center">
                    <Link to="/demo" className="text-xs border border-[#1a2744] text-[#1a2744] font-bold px-4 py-2 rounded-lg hover:bg-[#1a2744] hover:text-white transition-colors">
                      Starter
                    </Link>
                  </td>
                  <td className="px-4 py-4 text-center bg-[#0fa68c]/5">
                    <Link to="/demo" className="text-xs bg-[#0fa68c] text-white font-bold px-4 py-2 rounded-lg hover:bg-[#0d9079] transition-colors shadow">
                      Professional
                    </Link>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <Link to="/demo" className="text-xs border border-[#1a2744] text-[#1a2744] font-bold px-4 py-2 rounded-lg hover:bg-[#1a2744] hover:text-white transition-colors">
                      Enterprise
                    </Link>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </section>

      {/* ── 6. FAQ ──────────────────────────────────────────────────────────── */}
      <section className="py-16 px-4 bg-white border-t border-gray-100">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-xs font-bold uppercase tracking-widest text-[#0fa68c] mb-2">Hai dubbi?</p>
            <h2 className="text-3xl md:text-4xl font-extrabold text-[#1a2744]">
              Domande sui prezzi
            </h2>
          </div>
          <div className="space-y-3">
            {faqItems.map((item, i) => (
              <div
                key={i}
                className="border border-gray-200 rounded-xl overflow-hidden"
              >
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full text-left px-6 py-4 flex justify-between items-center gap-4 hover:bg-gray-50 transition-colors"
                >
                  <span className="font-semibold text-[#1a2744] text-sm md:text-base">{item.q}</span>
                  {openFaq === i ? (
                    <ChevronUp className="w-5 h-5 text-[#0fa68c] flex-shrink-0" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  )}
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-5 text-gray-600 text-sm leading-relaxed border-t border-gray-100 pt-3">
                    {item.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 7. TESTIMONIANZE ────────────────────────────────────────────────── */}
      <section className="py-16 px-4" style={{ background: "#1a2744" }}>
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs font-bold uppercase tracking-widest text-[#0fa68c] mb-2">Risultati reali</p>
            <h2 className="text-3xl md:text-4xl font-extrabold text-white">
              Chi ha già scelto di investire
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <TestimonialCard
              quote="Pagavamo €800/mese per un ERP che non capiva il cantiere. Con Edilizia in Cloud paghiamo €199/mese e finalmente sappiamo quanto guadagniamo su ogni commessa."
              name="Giuseppe Conti"
              company="Fratelli Conti Costruzioni, Napoli"
            />
            <TestimonialCard
              quote="Ho calcolato che perdevamo €30.000/anno in margini che non vedevamo. Edilizia in Cloud si è ripagato in 3 settimane."
              name="Marco Rossi"
              company="Costruzioni Rossi Srl, Roma"
            />
          </div>
        </div>
      </section>

      {/* ── 8. CTA FINALE ───────────────────────────────────────────────────── */}
      <section
        className="py-20 px-4 text-center"
        style={{ background: "linear-gradient(135deg, #0fa68c 0%, #0d9079 100%)" }}
      >
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl md:text-5xl font-extrabold text-white mb-4 leading-tight">
            Ogni mese senza controllo è un mese di margini persi.
          </h2>
          <p className="text-white/80 text-lg mb-10">
            Unisciti a 150+ imprese che controllano i numeri ogni giorno.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-10">
            <Link
              to="/demo"
              className="bg-white text-[#0fa68c] font-extrabold px-8 py-4 rounded-xl hover:bg-gray-50 transition-colors shadow-lg text-base"
            >
              Inizia con il Professional
            </Link>
            <a
              href="https://wa.me/393000000000"
              target="_blank"
              rel="noopener noreferrer"
              className="border-2 border-white text-white font-bold px-8 py-4 rounded-xl hover:bg-white/10 transition-colors text-base"
            >
              Hai domande? Scrivici
            </a>
          </div>
          <div className="flex flex-wrap justify-center gap-6 text-white/80 text-sm">
            {["Disdici quando vuoi", "Setup in 48h", "Garanzia 30 giorni"].map((pill) => (
              <span key={pill} className="flex items-center gap-1.5">
                <Check className="w-4 h-4 text-white" />
                {pill}
              </span>
            ))}
          </div>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function FeatureGroup({ title, children, negative }: { title: string; children: React.ReactNode; negative?: boolean }) {
  return (
    <div>
      <p className={`text-xs font-bold uppercase tracking-widest mb-2 ${negative ? "text-gray-400" : "text-[#0fa68c]"}`}>
        {title}
      </p>
      <ul className="space-y-1.5">{children}</ul>
    </div>
  );
}

function Feature({ label, negative }: { label: string; negative?: boolean }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      {negative ? (
        <X className="w-4 h-4 text-gray-300 flex-shrink-0 mt-0.5" strokeWidth={2} />
      ) : (
        <Check className="w-4 h-4 text-[#0fa68c] flex-shrink-0 mt-0.5" strokeWidth={2.5} />
      )}
      <span className={negative ? "text-gray-400 line-through" : "text-gray-700"}>{label}</span>
    </li>
  );
}

function TableCell({ value }: { value: Cell }) {
  if (value === "check") return <CheckIcon />;
  if (value === "cross") return <CrossIcon />;
  return <span className="text-sm">{value}</span>;
}

function RoiLine({ label, value, bold, highlight }: { label: string; value: string; bold?: boolean; highlight?: boolean }) {
  return (
    <div className={`flex justify-between items-center gap-2 ${bold ? "font-bold" : ""}`}>
      <span className="text-gray-600">{label}</span>
      <span className={highlight ? "text-[#0fa68c] font-extrabold text-base" : bold ? "text-[#1a2744] font-bold" : "text-[#1a2744]"}>
        {value}
      </span>
    </div>
  );
}

interface SliderInputProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
  unit: string;
}

function SliderInput({ label, value, min, max, step, onChange, format, unit }: SliderInputProps) {
  return (
    <div>
      <div className="flex justify-between items-baseline mb-2">
        <label className="text-sm font-semibold text-[#1a2744]">{label}</label>
        <span className="text-[#0fa68c] font-bold text-base">
          {format(value)}{unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#0fa68c] h-2 rounded-full cursor-pointer"
      />
      <div className="flex justify-between text-xs text-gray-400 mt-1">
        <span>{format(min)}</span>
        <span>{format(max)}</span>
      </div>
    </div>
  );
}

function TestimonialCard({ quote, name, company }: { quote: string; name: string; company: string }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-8 flex flex-col gap-4">
      <Quote className="w-8 h-8 text-[#0fa68c] opacity-60" />
      <p className="text-white/90 text-base md:text-lg leading-relaxed italic">"{quote}"</p>
      <div className="mt-auto">
        <p className="font-bold text-white text-sm">{name}</p>
        <p className="text-white/50 text-xs">{company}</p>
      </div>
    </div>
  );
}
