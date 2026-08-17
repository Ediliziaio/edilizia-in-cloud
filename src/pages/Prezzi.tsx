import { useState, useEffect, Fragment } from "react";
import { useSEO } from "@/hooks/useSEO";
import { JsonLd } from "@/components/seo/JsonLd";
import { HubSeoSchema } from "@/components/seo/HubSeoSchema";
import { Link, useSearchParams } from "react-router-dom";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";
import { trackPixel } from "@/lib/meta/fbcTracker";
import {
  Check,
  X,
  Shield,
  ArrowRight,
  Zap,
  RefreshCw,
  FileText,
  Headphones,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Quote,
  Lock,
  Server,
  Award,
  Archive,
  CreditCard,
  HelpCircle,
  Star,
  Copy,
  Check as CheckBadge,
} from "lucide-react";
import { getTimeLeft, MESI } from "@/lib/urgencyUtils";


// ── Helpers ────────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

const fmtNum = (n: number) =>
  new Intl.NumberFormat("it-IT", { maximumFractionDigits: 0 }).format(n);

// ── Feature check / cross cells ───────────────────────────────────────────────

function CheckIcon() {
  return <Check className="w-5 h-5 text-[#F97415] mx-auto" strokeWidth={2.5} />;
}
function CrossIcon() {
  return <X className="w-5 h-5 text-gray-300 mx-auto" strokeWidth={2} />;
}

// ── Comparison table rows definition ─────────────────────────────────────────

type Cell = string | "check" | "cross";

interface TableRow {
  label: string;
  scopri: Cell;
  starter: Cell;
  professional: Cell;
  enterprise: Cell;
  category?: string;
}

const tableRows: TableRow[] = [
  { label: "Commesse attive", scopri: "3", starter: "Illimitate", professional: "Illimitate", enterprise: "Illimitate", category: "Cantieri" },
  { label: "SAL + Marginalit\u00e0 commessa", scopri: "check", starter: "check", professional: "check", enterprise: "check" },
  { label: "Giornale Lavori + ODA + D.Lgs 81", scopri: "cross", starter: "cross", professional: "check", enterprise: "check" },
  { label: "Subappalti + Gantt + Ritenute", scopri: "cross", starter: "cross", professional: "check", enterprise: "check" },
  { label: "Multi-sede", scopri: "cross", starter: "cross", professional: "cross", enterprise: "check" },
  { label: "Fatturazione SDI + DDT + NC + Proforma", scopri: "cross", starter: "check", professional: "check", enterprise: "check", category: "Finanza" },
  { label: "Preventivi personalizzabili", scopri: "1", starter: "cross", professional: "check", enterprise: "check" },
  { label: "Fatture personalizzabili", scopri: "cross", starter: "cross", professional: "check", enterprise: "check" },
  { label: "Scadenzario + Tesoreria + IVA", scopri: "cross", starter: "cross", professional: "check", enterprise: "check" },
  { label: "Banca PSD2", scopri: "cross", starter: "cross", professional: "1 conto", enterprise: "3 conti" },
  { label: "Previsionale cassa", scopri: "cross", starter: "60 giorni", professional: "90 giorni", enterprise: "365 giorni" },
  { label: "Export XBRL \u00B7 Archiviazione 10 anni", scopri: "cross", starter: "cross", professional: "cross", enterprise: "check" },
  { label: "CRM + Pipeline opportunit\u00e0", scopri: "cross", starter: "cross", professional: "check", enterprise: "check", category: "Marketing & CRM" },
  { label: "Email marketing incluse", scopri: "cross", starter: "cross", professional: "5.000/mese", enterprise: "20.000/mese" },
  { label: "Computo Metrico AI", scopri: "cross", starter: "cross", professional: "check", enterprise: "check" },
  { label: "Portale cliente", scopri: "cross", starter: "cross", professional: "Standard", enterprise: "Branded WL" },
  { label: "AI Preventivo (Claude API)", scopri: "cross", starter: "Add-on", professional: "Add-on", enterprise: "Add-on" },
  { label: "App operai GPS + rapportino", scopri: "2 operai", starter: "check", professional: "check", enterprise: "check", category: "HR & Campo" },
  { label: "HR + Cedolini strutturati", scopri: "cross", starter: "cross", professional: "check", enterprise: "check" },
  { label: "Employees Area (4 aree)", scopri: "cross", starter: "cross", professional: "check", enterprise: "check" },
  { label: "GPS FleetTrack + Magazzino", scopri: "cross", starter: "cross", professional: "check", enterprise: "check" },
  { label: "Render AI", scopri: "cross", starter: "Add-on", professional: "Add-on", enterprise: "20/mese inclusi", category: "AI & Automazioni" },
  { label: "Verifica OdA AI", scopri: "cross", starter: "cross", professional: "cross", enterprise: "check" },
  { label: "Agente Vocale AI", scopri: "cross", starter: "Add-on", professional: "Add-on", enterprise: "200 min inclusi" },
  { label: "WhatsApp Bot AI", scopri: "cross", starter: "cross", professional: "Add-on", enterprise: "Incluso" },
  { label: "Agenti AI personalizzati", scopri: "cross", starter: "cross", professional: "cross", enterprise: "check" },
  { label: "Utenti inclusi", scopri: "Illimitati", starter: "Illimitati", professional: "Illimitati", enterprise: "Illimitati", category: "Infrastruttura" },
  { label: "Storage incluso", scopri: "1 GB", starter: "10 GB", professional: "30 GB", enterprise: "100 GB" },
  { label: "API REST + Webhook", scopri: "cross", starter: "cross", professional: "cross", enterprise: "check" },
  { label: "SLA uptime", scopri: "cross", starter: "99.5%", professional: "99.7%", enterprise: "99.9%" },
  { label: "Supporto", scopri: "Community", starter: "Email 24h", professional: "Tel/WA 4h", enterprise: "Dedicato 1h" },
  { label: "Call consulente mensile", scopri: "cross", starter: "cross", professional: "1/mese", enterprise: "2/mese" },
];

const faqItems = [
  {
    q: "C'è un periodo di prova gratuita?",
    a: "Sì, offriamo una demo gratuita personalizzata con il nostro team + 31 giorni di accesso completo al piano Professionista. Cancella quando vuoi, nessun obbligo.",
  },
  {
    q: "Posso cambiare piano in qualsiasi momento?",
    a: "Sì. L'upgrade è immediato: le nuove funzionalità sono disponibili subito. Il downgrade viene applicato a fine periodo di fatturazione corrente.",
  },
  {
    q: "Cosa succede se ho bisogno di più funzionalità del piano Gestionale?",
    a: "Ti avvisiamo in anticipo — nessun blocco improvviso. Il nostro team ti contatterà per aiutarti a valutare l'upgrade al piano Professionista o Impresa AI nel momento giusto per la tua crescita.",
  },
  {
    q: "I prezzi includono IVA?",
    a: "I prezzi sono sempre IVA esclusa. L'IVA viene applicata in fattura secondo la normativa vigente (22% per soggetti IVA italiani) ed è interamente deducibile come spesa aziendale.",
  },
  {
    q: "Come funziona la garanzia soddisfatti o rimborsati?",
    a: "Se entro 31 giorni dall'attivazione non sei soddisfatto per qualsiasi motivo, ti rimborsiamo l'intero importo pagato. Nessuna domanda, nessuna burocrazia.",
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
  const [searchParams, setSearchParams] = useSearchParams();

  const initBilling = (searchParams.get("billing") === "annual" ? "annual" : "monthly") as
    | "monthly"
    | "annual";
  const [billing, setBilling] = useState<"monthly" | "annual">(initBilling);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // ROI calculator state — leggi i valori iniziali dalla querystring se presenti
  const parseNum = (key: string, fallback: number) => {
    const v = searchParams.get(key);
    if (!v) return fallback;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  const [fatturato, setFatturato] = useState(parseNum("fatturato_medio", 800000));
  const [numeroCantieri, setNumeroCantieri] = useState(parseNum("numero_cantieri", 8));
  const [oreSettimana, setOreSettimana] = useState(parseNum("ore_settimana", 10));
  const [compensoOrario, setCompensoOrario] = useState(parseNum("compenso_orario", 50));
  const [copied, setCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState(getTimeLeft);

  useEffect(() => {
    const id = setInterval(() => setTimeLeft(getTimeLeft()), 1000);
    return () => clearInterval(id);
  }, []);

  // Sincronizza inputs ROI + billing nella URL (senza reload)
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    next.set("billing", billing);
    next.set("fatturato_medio", String(fatturato));
    next.set("numero_cantieri", String(numeroCantieri));
    next.set("ore_settimana", String(oreSettimana));
    next.set("compenso_orario", String(compensoOrario));
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billing, fatturato, numeroCantieri, oreSettimana, compensoOrario]);

  // Derived ROI calculations
  const costoExcel = oreSettimana * compensoOrario * 52;
  const costoPreventivazioneManuale = 3 * 3 * compensoOrario * 12;
  const marginiRecuperabili = fatturato * 0.015;
  const valoreAnnuo = costoExcel + costoPreventivazioneManuale + marginiRecuperabili;
  // Rispetta il toggle: annuale 197*12, mensile 247*12
  const costoProfessionalAnno = (billing === "annual" ? 197 : 247) * 12;
  const roi = Math.round((valoreAnnuo / costoProfessionalAnno) * 100);
  const paybackMesi = costoProfessionalAnno / (valoreAnnuo / 12);
  const paybackLabel = paybackMesi < 1 ? "< 1 mese" : `${paybackMesi.toFixed(1)} mesi`;
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const meseCorrente = MESI[now.getMonth()];
  const annoCorrente = now.getFullYear();
  const countdownUnits = [
    { value: timeLeft.days, label: "giorni", short: "g" },
    { value: timeLeft.hours, label: "ore", short: "h" },
    { value: timeLeft.minutes, label: "min", short: "m" },
    { value: timeLeft.seconds, label: "sec", short: "s" },
  ];

  const copyShareLink = async () => {
    if (typeof window === "undefined") return;
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback silenzioso
    }
  };

  useSEO({
    title: "Piani Edilizia in Cloud — Prova gratis 31 giorni",
    description: "Scopri i piani di Edilizia in Cloud: Scopri (gratis), Gestionale, Professionista e Impresa AI. Prenota una demo gratuita e ricevi un preventivo su misura. 31 giorni di prova.",
    canonical: "/prezzi",
    keywords: "software gestionale edilizia, gestionale cantieri, demo edilizia in cloud, piani gestionale professionista impresa ai, prova gratuita software edilizia",
  });

  const prices = {
    starter: billing === "monthly" ? 127 : 99,
    professional: billing === "monthly" ? 247 : 197,
    enterprise: billing === "monthly" ? 547 : 437,
  };

  const savings = {
    starter: (127 - 99) * 12,
    professional: (247 - 197) * 12,
    enterprise: (547 - 437) * 12,
  };

  // Meta Pixel — InitiateCheckout: intento sul piano al click del CTA (valore =
  // prezzo mensile). No-op fuori dal sito marketing. Segnale per ottimizzare le
  // campagne sui piani più redditizi.
  const trackPlanIntent = (plan: string, value: number) => {
    trackPixel("InitiateCheckout", {
      content_name: plan,
      content_category: "plan",
      value,
      currency: "EUR",
    });
  };

  return (
    <div className="min-h-screen bg-white text-[#111111] overflow-x-hidden">
      <HubSeoSchema
        pageName="Prezzi"
        pagePath="/prezzi"
        pageDescription="Piani e prezzi di Edilizia in Cloud: starter, professional, enterprise. 31 giorni di prova gratuita, supporto italiano dedicato."
        breadcrumbs={[
          { name: "Home", url: "/" },
          { name: "Prezzi", url: "/prezzi" },
        ]}
      />
      <JsonLd id="jsonld-prezzi" data={{
        "@context": "https://schema.org",
        "@type": "Product",
        "@id": "https://www.ediliziaincloud.com/#product",
        "name": "Edilizia in Cloud",
        "description": "Software gestionale completo per imprese edili italiane",
        "image": [
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/7a5d2f3f-4a52-4b31-81c9-fc593d582ee7/id-preview-b70db1cf--c34c07f6-5aea-4505-b4c7-9b00cd75679c.lovable.app-1771279786357.png",
          "https://www.ediliziaincloud.com/icons/icon-512.png"
        ],
        "brand": { "@type": "Brand", "name": "Edilizia in Cloud" },
        "seller": { "@type": "Organization", "name": "Domus Group S.r.l.", "url": "https://www.ediliziaincloud.com" },
        "aggregateRating": { "@type": "AggregateRating", "ratingValue": "4.9", "reviewCount": "127", "bestRating": "5" },
        "review": [
          {
            "@type": "Review",
            "author": { "@type": "Person", "name": "Giuseppe Conti" },
            "datePublished": "2025-11-12",
            "reviewBody": "Pagavamo un ERP costoso che non capiva il cantiere. Con Edilizia in Cloud spendiamo una frazione e finalmente sappiamo quanto guadagniamo su ogni commessa.",
            "reviewRating": { "@type": "Rating", "ratingValue": "5", "bestRating": "5" }
          },
          {
            "@type": "Review",
            "author": { "@type": "Person", "name": "Marco Rossi" },
            "datePublished": "2026-01-08",
            "reviewBody": "Ho calcolato che perdevamo 30.000€/anno in margini che non vedevamo. Edilizia in Cloud si è ripagato in 3 settimane.",
            "reviewRating": { "@type": "Rating", "ratingValue": "5", "bestRating": "5" }
          },
          {
            "@type": "Review",
            "author": { "@type": "Person", "name": "Laura Bianchi" },
            "datePublished": "2026-02-22",
            "reviewBody": "Setup in 48 ore come promesso. Il consulente del controllo ci ha fatto risparmiare ore di lavoro ogni settimana sui SAL.",
            "reviewRating": { "@type": "Rating", "ratingValue": "5", "bestRating": "5" }
          },
          {
            "@type": "Review",
            "author": { "@type": "Person", "name": "Davide Ferrari" },
            "datePublished": "2026-03-14",
            "reviewBody": "Dopo anni di Excel, finalmente abbiamo un controllo cassa serio. Il modulo Banca PSD2 è una rivoluzione per la nostra impresa.",
            "reviewRating": { "@type": "Rating", "ratingValue": "5", "bestRating": "5" }
          }
        ]
      }} />
      <JsonLd id="jsonld-breadcrumb-prezzi" data={{
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.ediliziaincloud.com/" },
          { "@type": "ListItem", "position": 2, "name": "Prezzi", "item": "https://www.ediliziaincloud.com/prezzi" }
        ]
      }} />
      <LandingNavbar />

      {/* ── 1. HERO ─────────────────────────────────────────────────────────── */}
      <section
        className="pt-28 pb-10 px-4 text-center"
        style={{ background: "linear-gradient(160deg, #111111 0%, #111111 100%)" }}
      >
        {/* Badge */}
        <div className="inline-flex items-center gap-2 bg-white/10 text-white border border-white/20 rounded-full px-4 py-1.5 text-xs font-bold tracking-widest mb-6 uppercase">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400"></span>
          </span>
          Consulenza gratuita — Preventivo su misura
        </div>

        <h1 className="text-4xl md:text-6xl font-extrabold text-white leading-tight mb-5 max-w-3xl mx-auto">
          L'investimento che si{" "}
          <span className="text-[#F97415]">ripaga da solo.</span>
        </h1>
        <p className="text-white/70 text-lg md:text-xl max-w-2xl mx-auto mb-10">
          Ogni piano include il Consulente del Controllo dedicato. Setup e migrazione dati gratis. Disdici quando vuoi.
        </p>

        <div className="mx-auto flex max-w-xl flex-col items-center rounded-2xl border border-[#F97415]/30 bg-white/[0.03] px-5 py-5 shadow-[0_0_24px_rgba(249,116,21,0.08)] backdrop-blur-sm">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#F97415]/30 bg-[#F97415]/12 px-4 py-1 text-[11px] font-extrabold uppercase tracking-[0.24em] text-[#F9A15F]">
            🎉 Prova gratuita 31 giorni
          </span>

          <div className="mt-4 flex items-center justify-center gap-2">
            {countdownUnits.map((unit) => (
              <div key={unit.short} className="flex flex-col items-center">
                <span className="inline-block min-w-[46px] rounded-lg border border-white/10 bg-white/[0.08] px-2 py-2 text-center font-mono text-lg font-bold leading-tight text-white md:min-w-[54px] md:text-xl">
                  {String(unit.value).padStart(2, "0")}
                </span>
                <span className="mt-1 hidden text-[10px] text-white/45 md:block">{unit.label}</span>
                <span className="mt-1 text-[10px] text-white/45 md:hidden">{unit.short}</span>
              </div>
            ))}
          </div>

          <p className="mt-4 max-w-lg text-sm leading-relaxed text-white/65">
            La prova gratuita di 31 giorni e l’offerta attiva sono disponibili per chi richiede entro il{" "}
            <strong className="text-white">{lastDay} {meseCorrente} {annoCorrente}</strong>.
          </p>
        </div>
      </section>

      {/* ── FREE TRIAL BANNER ─────────────────────────────────────────────── */}
      <section className="py-8 px-4 bg-[#111111]">
        <div className="max-w-3xl mx-auto">
          <div className="rounded-2xl border-2 border-[#F97415] bg-[#F97415]/10 p-6 md:p-8 text-center relative overflow-hidden">
            <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 80% 60% at 50% 50%, rgba(249,116,21,0.12) 0%, transparent 100%)" }} />
            <div className="relative z-10">
              <span className="inline-block mb-3 px-4 py-1 rounded-full bg-[#F97415] text-white text-xs font-extrabold uppercase tracking-widest">
                🎉 Offerta Attiva
              </span>
              <h2 className="text-3xl md:text-5xl font-extrabold text-white mb-3">
                Prova <span className="text-[#F97415]">GRATUITA</span> di <span className="text-[#F97415]">31 GIORNI</span>
              </h2>
              <p className="text-white/60 text-lg mb-6">
                Accesso completo a tutti i moduli del tuo piano — cancella quando vuoi, senza obbligo, senza vincoli. Se non ti piace, non paghi nulla. Punto.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-4 mb-6 text-sm">
                {[
                  "✓ Cancella quando vuoi",
                  "✓ Accesso completo al piano scelto",
                  "✓ Setup e migrazione dati inclusi",
                  "✓ Cancelli in un click, senza penali",
                ].map((item, i) => (
                  <span key={i} className="text-white/70 font-medium">{item}</span>
                ))}
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  to="/demo/"
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-[#F97415] text-white font-bold text-lg hover:bg-[#e8650e] hover:scale-105 transition-all shadow-lg shadow-[#F97415]/30"
                >
                  Inizia la prova gratuita <ArrowRight className="w-5 h-5" />
                </Link>
                <a
                  href="#piani"
                  className="inline-flex items-center justify-center gap-2 px-6 py-4 rounded-xl border border-white/20 text-white/90 font-semibold hover:border-white/40 hover:bg-white/5 transition-all"
                >
                  Vai ai piani e prezzi ↓
                </a>
              </div>
              <p className="text-white/30 text-xs mt-4">Dopo i 31 giorni scegli il piano o cancelli — nessun addebito automatico</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── GEO CITABLE PARAGRAPH ─────────────────────────────────────────── */}
      <section className="py-10 px-4 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="rounded-3xl border border-[#F97415]/20 bg-gradient-to-br from-[#fff7ed] via-white to-white p-6 md:p-8 shadow-sm">
            <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
              <div>
                <span className="inline-flex items-center rounded-full bg-[#F97415]/10 px-3 py-1 text-xs font-extrabold uppercase tracking-widest text-[#F97415]">
                  Confronto reale dei costi
                </span>
                <h2 className="mt-4 text-2xl md:text-3xl font-extrabold tracking-tight text-[#111111]">
                  Quanto costa davvero un gestionale per imprese edili in Italia?
                </h2>
                <p className="mt-4 text-base md:text-lg leading-relaxed text-gray-700">
                  Una impresa edile strutturata non paga solo “un software”: spesso somma diversi strumenti
                  per fatturazione, magazzino, preventivazione, HR, contabilità, documenti, foto di cantiere,
                  Excel, CRM, calendario, firma e DDT.
                </p>
                <p className="mt-3 text-base leading-relaxed text-gray-700">
                  Il conto vero nasce quando questi sistemi non si parlano: carichi foto due volte, copi dati
                  su Excel, aggiorni cliente, preventivo, magazzino e commessa in punti diversi.
                </p>
                <div className="mt-5 rounded-2xl border border-[#F97415]/20 bg-white/80 p-4">
                  <p className="text-sm font-bold text-[#111111]">Esempio prudente sulla preventivazione</p>
                  <p className="mt-1 text-sm leading-relaxed text-gray-600">
                    3 preventivi/mese × 3 ore cad. × 50€/ora ={" "}
                    <strong className="text-[#111111]">5.400€/anno</strong> di tempo commerciale.
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm md:p-5">
                <div className="overflow-hidden rounded-2xl border border-gray-100">
                  {[
                    {
                      label: "Software separati",
                      value: "~5.000€/anno",
                      note: "Licenze e strumenti scollegati",
                      tone: "red",
                    },
                    {
                      label: "Preventivi manuali",
                      value: "5.400€/anno",
                      note: "3 offerte/mese, 3 ore cad.",
                      tone: "amber",
                    },
                    {
                      label: "Edilizia in Cloud",
                      value: "~0€ netti",
                      note: "Il canone si ripaga col risparmio: un unico flusso operativo",
                      tone: "emerald",
                    },
                  ].map((row) => (
                    <div
                      key={row.label}
                      className="grid grid-cols-[1fr_auto] gap-4 border-b border-gray-100 px-4 py-4 last:border-b-0"
                    >
                      <div>
                        <p
                          className={[
                            "text-xs font-extrabold uppercase tracking-widest",
                            row.tone === "red" ? "text-red-500" : row.tone === "amber" ? "text-amber-600" : "text-emerald-600",
                          ].join(" ")}
                        >
                          {row.label}
                        </p>
                        <p className="mt-1 text-sm text-gray-600">{row.note}</p>
                      </div>
                      <p className="whitespace-nowrap text-right text-2xl font-extrabold tracking-tight text-[#111111]">
                        {row.value}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 grid gap-2 text-sm text-gray-700 sm:grid-cols-2">
                  {[
                    "Foto, DDT e documenti sulla commessa",
                    "Preventivo, ordine e incassi collegati",
                    "Meno copia-incolla tra app ed Excel",
                    "Marginalità visibile nello stesso flusso",
                  ].map((item) => (
                    <div key={item} className="flex items-start gap-2 rounded-xl bg-gray-50 px-3 py-2">
                      <span className="mt-0.5 text-[#F97415]">✓</span>
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── TRUST BADGES ──────────────────────────────────────────────────── */}
      <section className="py-8 px-4 bg-white border-y border-gray-100">
        <div className="max-w-6xl mx-auto">
          <p className="text-center text-xs font-bold uppercase tracking-widest text-gray-500 mb-5">
            Conformità e sicurezza
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { icon: <Lock className="w-5 h-5" />, label: "GDPR Compliant" },
              { icon: <Server className="w-5 h-5" />, label: "Dati cifrati" },
              { icon: <FileText className="w-5 h-5" />, label: "SDI Accreditato" },
              { icon: <Archive className="w-5 h-5" />, label: "Conservazione 10 anni AdE" },
              { icon: <Award className="w-5 h-5" />, label: "ISO 27001 (in corso)" },
              { icon: <CreditCard className="w-5 h-5" />, label: "Pagamenti Stripe sicuri" },
            ].map((b) => (
              <div
                key={b.label}
                className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-gray-200 bg-white hover:border-[#F97415]/50 hover:bg-[#F97415]/5 transition-colors"
              >
                <span className="text-[#F97415] flex-shrink-0">{b.icon}</span>
                <span className="text-xs font-semibold text-[#111111] leading-tight">{b.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 2. PIANI ────────────────────────────────────────────────────────── */}
      <section id="piani" className="scroll-mt-20 py-16 px-4 bg-[#f7f9fc]">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8 max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-widest text-[#F97415] mb-2">Scegli il piano</p>
            <h2 className="text-3xl md:text-4xl font-extrabold text-[#111111]">Il piano giusto per la tua impresa</h2>
            <p className="mt-2 text-gray-500">
              Inizia gratis con Scopri. Per i piani avanzati definiamo insieme il preventivo su misura
              in una consulenza gratuita — paghi solo per ciò che ti serve davvero.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-start">

          {/* ── SCOPRI (FREE) ── */}
          <div className="bg-white rounded-2xl border-2 border-gray-200 shadow-sm p-8 flex flex-col relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <span className="bg-gray-100 text-gray-600 text-xs font-medium px-3 py-1 rounded-full border border-gray-200">
                Inizia gratis
              </span>
            </div>
            <div className="mb-6">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">Scopri</p>
              <p className="text-sm text-gray-500 mb-4">Tocca con mano EiC senza impegno</p>
              <div className="flex items-end gap-1 mb-1">
                <span className="text-5xl font-extrabold text-[#111111]">{"\u20AC"}0</span>
                <span className="text-gray-400 text-base mb-2">{"\u00B7"} per sempre</span>
              </div>
              <p className="text-xs text-gray-400">Nessuna carta richiesta</p>
            </div>
            <Link
              to="/demo/?plan=scopri"
              onClick={() => trackPlanIntent("Scopri", 0)}
              className="block text-center w-full border border-gray-300 text-gray-700 font-semibold py-3 rounded-xl hover:bg-gray-50 transition-colors mb-6"
            >
              Inizia gratis
            </Link>
            <ul className="space-y-2 flex-1">
              {[
                "3 cantieri attivi con marginalit\u00e0 reale",
                "Preventivo con firma online del cliente",
                "App operai: timbratura GPS + rapportino",
                "Dashboard operativa con salute cantieri",
                "Utenti illimitati",
                "1 GB storage",
              ].map(f => (
                <li key={f} className="flex items-start gap-2 text-sm text-gray-600">
                  <span className="text-green-600 font-bold mt-0.5 flex-shrink-0">{"\u2713"}</span>
                  {f}
                </li>
              ))}
            </ul>
            <p className="text-xs text-gray-400 text-center mt-4">
              Aggiorna quando vuoi. I tuoi dati restano sempre al sicuro.
            </p>
          </div>

          {/* ── STARTER ── */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 flex flex-col">
            <div className="mb-6">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">Gestionale</p>
              <p className="text-sm text-gray-500 mb-4">Imprese fino a 500K € di fatturato</p>
              <div className="mb-1">
                <span className="text-3xl font-extrabold text-[#111111]">Su misura</span>
              </div>
              <p className="text-xs text-gray-400">Preventivo in una consulenza gratuita</p>
            </div>
            <Link
              to="/demo/"
              onClick={() => trackPlanIntent("Gestionale", prices.starter)}
              className="block text-center border-2 border-[#111111] text-[#111111] font-bold py-3 rounded-xl hover:bg-[#111111] hover:text-white transition-colors mb-6"
            >
              Prenota una consulenza
            </Link>
            <div className="space-y-5 flex-1">
              <FeatureGroup title="Cantieri">
                <Feature label="Commesse illimitate" />
                <Feature label="SAL + Marginalità commessa" />
              </FeatureGroup>
              <FeatureGroup title="Finanza">
                <Feature label="Fatturazione SDI + DDT + NC + Proforma" />
                <Feature label="Previsionale cassa (60 gg)" />
              </FeatureGroup>
              <FeatureGroup title="HR & Campo">
                <Feature label="App operai GPS + rapportino" />
              </FeatureGroup>
              <FeatureGroup title="Infrastruttura">
                <Feature label="Utenti illimitati" />
                <Feature label="10 GB storage" />
                <Feature label="SLA 99.5%" />
                <Feature label="Supporto email (risposta 24h)" />
              </FeatureGroup>
              <FeatureGroup title="Non incluso" negative>
                <Feature label="Giornale Lavori / ODA / Sicurezza" negative />
                <Feature label="CRM + Pipeline" negative />
                <Feature label="HR + Cedolini" negative />
                <Feature label="Agenti AI" negative />
                <Feature label="API REST" negative />
              </FeatureGroup>
            </div>
          </div>

          {/* ── PROFESSIONAL ── */}
          <div className="bg-white rounded-2xl border-2 border-[#F97415] shadow-xl p-8 flex flex-col scale-[1.02] relative">
            <div className="absolute -top-4 left-1/2 -translate-x-1/2">
              <span className="bg-[#F97415] text-white text-xs font-extrabold px-4 py-1.5 rounded-full tracking-widest uppercase shadow-lg">
                Più Popolare
              </span>
            </div>
            <div className="mb-6 mt-2">
              <p className="text-xs font-bold uppercase tracking-widest text-[#F97415] mb-1">Professionista</p>
              <p className="text-sm text-gray-500 mb-4">Imprese da 500K a 2M € di fatturato</p>
              <div className="mb-1">
                <span className="text-3xl font-extrabold text-[#111111]">Su misura</span>
              </div>
              <p className="text-xs text-gray-400">Preventivo in una consulenza gratuita</p>
            </div>
            <Link
              to="/demo/"
              onClick={() => trackPlanIntent("Professionista", prices.professional)}
              className="block text-center bg-[#F97415] text-white font-bold py-3 rounded-xl hover:bg-[#e8650e] transition-colors mb-6 shadow-md"
            >
              Prenota una demo
            </Link>
            <div className="space-y-5 flex-1">
              <FeatureGroup title="Cantieri">
                <Feature label="Commesse illimitate" />
                <Feature label="SAL + Marginalità commessa" />
                <Feature label="Giornale Lavori + ODA + D.Lgs 81" />
                <Feature label="Subappalti + Gantt + Ritenute" />
              </FeatureGroup>
              <FeatureGroup title="Finanza">
                <Feature label="Fatturazione SDI + DDT + NC + Proforma" />
                <Feature label="Preventivi e fatture personalizzabili" />
                <Feature label="Scadenzario + Tesoreria + IVA" />
                <Feature label="Banca PSD2 (1 conto)" />
                <Feature label="Previsionale cassa (90 gg)" />
              </FeatureGroup>
              <FeatureGroup title="Marketing & CRM">
                <Feature label="CRM + Pipeline opportunità" />
                <Feature label="5.000 email marketing/mese" />
                <Feature label="Computo Metrico AI" />
                <Feature label="Portale cliente standard" />
              </FeatureGroup>
              <FeatureGroup title="HR & Campo">
                <Feature label="App operai GPS + rapportino" />
                <Feature label="HR + Cedolini strutturati" />
                <Feature label="Employees Area (4 aree)" />
                <Feature label="GPS FleetTrack + Magazzino" />
              </FeatureGroup>
              <FeatureGroup title="Infrastruttura">
                <Feature label="Utenti illimitati" />
                <Feature label="30 GB storage" />
                <Feature label="SLA 99.7%" />
                <Feature label="Supporto Tel/WA (risposta 4h)" />
                <Feature label="1 call consulente/mese" />
              </FeatureGroup>
              <FeatureGroup title="Non incluso" negative>
                <Feature label="Multi-sede" negative />
                <Feature label="API REST + Webhook" negative />
                <Feature label="Agenti AI personalizzati" negative />
              </FeatureGroup>
            </div>
          </div>

          {/* ── ENTERPRISE ── */}
          <div className="bg-white rounded-2xl border-2 border-[#111111] shadow-sm p-8 flex flex-col">
            <div className="mb-6">
              <p className="text-xs font-bold uppercase tracking-widest text-[#111111] mb-1">Impresa AI</p>
              <p className="text-sm text-gray-500 mb-4">Imprese oltre 2M € o multi-cantiere</p>
              <div className="mb-1">
                <span className="text-3xl font-extrabold text-[#111111]">Su misura</span>
              </div>
              <p className="text-xs text-gray-400">Preventivo dedicato con un consulente</p>
            </div>
            <button
              type="button"
              onClick={() => {
                trackPlanIntent("Impresa AI", prices.enterprise);
                import("@/components/landing/QuickContactModal").then((m) => m.openContactModal());
              }}
              className="block w-full text-center bg-[#111111] text-white font-bold py-3 rounded-xl hover:bg-[#C94F06] transition-colors mb-6"
            >
              Parla con un consulente Enterprise
            </button>
            <div className="space-y-5 flex-1">
              <p className="text-xs text-gray-500 italic">Tutto di Professionista, più:</p>
              <FeatureGroup title="Extra Impresa AI">
                <Feature label="Multi-sede" />
                <Feature label="Banca PSD2 (3 conti)" />
                <Feature label="Previsionale cassa (365 gg)" />
                <Feature label="Export XBRL + Archiviazione 10 anni" />
                <Feature label="20.000 email marketing/mese" />
                <Feature label="Portale cliente Branded WL" />
                <Feature label="Render AI (20/mese inclusi)" />
                <Feature label="Verifica OdA AI" />
                <Feature label="Agente Vocale AI (200 min inclusi)" />
                <Feature label="WhatsApp Bot AI incluso" />
                <Feature label="Agenti AI personalizzati" />
                <Feature label="100 GB storage" />
                <Feature label="API REST + Webhook" />
                <Feature label="SLA 99.9% uptime" />
                <Feature label="Supporto dedicato (risposta 1h)" />
                <Feature label="2 call consulente/mese" />
              </FeatureGroup>
            </div>
          </div>
        </div>
        </div>
      </section>

      {/* ── 3. INCLUSO IN TUTTI I PIANI ─────────────────────────────────────── */}
      <section className="py-16 px-4 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs font-bold uppercase tracking-widest text-[#F97415] mb-2">Incluso ovunque</p>
            <h2 className="text-3xl md:text-4xl font-extrabold text-[#111111]">
              Cosa è incluso in <span className="text-[#F97415]">tutti i piani</span>
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {[
              { icon: <Shield className="w-6 h-6 text-[#F97415]" />, title: "Dati al sicuro", desc: "Cifratura, backup giornalieri automatici, conforme GDPR" },
              { icon: <Zap className="w-6 h-6 text-[#F97415]" />, title: "Setup incluso", desc: "Il nostro team configura tutto in 48 ore lavorative" },
              { icon: <RefreshCw className="w-6 h-6 text-[#F97415]" />, title: "Aggiornamenti gratuiti", desc: "Nuove feature ogni mese, senza costi aggiuntivi" },
              { icon: <FileText className="w-6 h-6 text-[#F97415]" />, title: "Migrazione dati gratis", desc: "Importiamo i tuoi dati da Excel o altri software" },
              { icon: <Headphones className="w-6 h-6 text-[#F97415]" />, title: "Supporto italiano", desc: "Parli con persone reali, non bot o call center esteri" },
              { icon: <TrendingUp className="w-6 h-6 text-[#F97415]" />, title: "Disdici quando vuoi", desc: "Nessun vincolo contrattuale, nessuna penale" },
            ].map((item, i) => (
              <div key={i} className="flex gap-4 items-start p-5 rounded-xl bg-[#f7f9fc] border border-gray-100">
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-[#F97415]/10 flex items-center justify-center">
                  {item.icon}
                </div>
                <div>
                  <p className="font-bold text-[#111111] text-sm">{item.title}</p>
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
            <p className="text-xs font-bold uppercase tracking-widest text-[#F97415] mb-2">Calcolatore</p>
            <h2 className="text-3xl md:text-4xl font-extrabold text-[#111111] mb-3">
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
                  label="Numero cantieri attivi medi"
                  value={numeroCantieri}
                  min={1}
                  max={50}
                  step={1}
                  onChange={setNumeroCantieri}
                  format={(v) => `${v}`}
                  unit=" cantieri"
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
                <div className="rounded-xl border border-[#F97415]/30 bg-[#F97415]/5 p-6 space-y-3">
                  <p className="text-sm font-bold text-[#111111] mb-2 uppercase tracking-wide">Il tuo calcolo</p>
                  <div className="space-y-2 text-sm">
                    <RoiLine label="Costo ore non ottimizzate" value={`${fmt(costoExcel)}/anno`} />
                    <RoiLine label="Preventivazione manuale" value={`${fmt(costoPreventivazioneManuale)}/anno`} />
                    <RoiLine label="Margini recuperabili (1.5%)" value={`${fmt(marginiRecuperabili)}/anno`} />
                    <div className="border-t border-[#F97415]/30 my-2" />
                    <RoiLine label="Quanto perdi ogni anno senza EiC" value={`${fmt(valoreAnnuo)}/anno`} highlight />
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-3 italic">
                  * Stima conservativa. Nella consulenza gratuita definiamo il piano su misura e il preventivo: la maggior parte dei clienti recupera il valore dell'investimento nelle prime 6 settimane.
                </p>
              </div>
            </div>

            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                to="/demo/"
                className="inline-flex items-center gap-2 bg-[#F97415] text-white font-bold px-8 py-4 rounded-xl hover:bg-[#C94F06] transition-colors text-base shadow-md"
              >
                Inizia la Demo — Vedi i Risultati Reali
              </Link>
              <button
                type="button"
                onClick={copyShareLink}
                className="inline-flex items-center gap-2 border-2 border-[#F97415] text-[#F97415] font-bold px-6 py-4 rounded-xl hover:bg-[#F97415]/10 transition-colors text-base"
              >
                {copied ? (
                  <>
                    <CheckBadge className="w-4 h-4" /> Link copiato!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" /> Copia link risultato
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── 5. TABELLA COMPARATIVA ──────────────────────────────────────────── */}
      <section className="py-16 px-4 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-xs font-bold uppercase tracking-widest text-[#F97415] mb-2">Dettagli</p>
            <h2 className="text-3xl md:text-4xl font-extrabold text-[#111111]">
              Confronto dettagliato
            </h2>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-gray-200 shadow-sm">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="sticky top-0 z-10 bg-[#111111] text-white">
                  <th className="text-left px-5 py-4 font-semibold w-2/5">Funzionalit{"\u00e0"}</th>
                  <th className="text-center px-3 py-4 font-semibold text-gray-400">Scopri</th>
                  <th className="text-center px-3 py-4 font-semibold">Gestionale</th>
                  <th className="text-center px-3 py-4 font-semibold bg-[#F97415]">Professionista</th>
                  <th className="text-center px-3 py-4 font-semibold">Impresa AI</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row, i) => (
                  <Fragment key={`row-${i}`}>
                    {row.category && (
                      <tr className="bg-gray-50">
                        <td
                          colSpan={5}
                          className="px-5 py-2 text-xs font-extrabold uppercase tracking-widest text-[#111111]/50"
                        >
                          {row.category}
                        </td>
                      </tr>
                    )}
                    <tr className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                      <td className="px-5 py-3 text-gray-700">
                        <FeatureLabel label={row.label} />
                      </td>
                      <td className="px-3 py-3 text-center text-gray-400">
                        <TableCell value={row.scopri} />
                      </td>
                      <td className="px-3 py-3 text-center text-gray-600">
                        <TableCell value={row.starter} />
                      </td>
                      <td className="px-3 py-3 text-center bg-[#F97415]/5 font-medium">
                        <TableCell value={row.professional} />
                      </td>
                      <td className="px-3 py-3 text-center text-gray-600">
                        <TableCell value={row.enterprise} />
                      </td>
                    </tr>
                  </Fragment>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td className="px-5 py-4" />
                  <td className="px-3 py-4 text-center">
                    <Link to="/demo/?plan=scopri" className="text-xs border border-gray-300 text-gray-600 font-bold px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors">
                      Gratis
                    </Link>
                  </td>
                  <td className="px-3 py-4 text-center">
                    <Link to="/demo/" className="text-xs border border-[#111111] text-[#111111] font-bold px-3 py-2 rounded-lg hover:bg-[#111111] hover:text-white transition-colors">
                      Gestionale
                    </Link>
                  </td>
                  <td className="px-3 py-4 text-center bg-[#F97415]/5">
                    <Link to="/demo/" className="text-xs bg-[#F97415] text-white font-bold px-3 py-2 rounded-lg hover:bg-[#e8650e] transition-colors shadow">
                      Professionista
                    </Link>
                  </td>
                  <td className="px-3 py-4 text-center">
                    <Link to="/demo/" className="text-xs border border-[#111111] text-[#111111] font-bold px-3 py-2 rounded-lg hover:bg-[#111111] hover:text-white transition-colors">
                      Impresa AI
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
            <p className="text-xs font-bold uppercase tracking-widest text-[#F97415] mb-2">Hai dubbi?</p>
            <h2 className="text-3xl md:text-4xl font-extrabold text-[#111111]">
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
                  <span className="font-semibold text-[#111111] text-sm md:text-base">{item.q}</span>
                  {openFaq === i ? (
                    <ChevronUp className="w-5 h-5 text-[#F97415] flex-shrink-0" />
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
      <section className="py-16 px-4" style={{ background: "#111111" }}>
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs font-bold uppercase tracking-widest text-[#F97415] mb-2">Risultati reali</p>
            <h2 className="text-3xl md:text-4xl font-extrabold text-white">
              Chi ha già scelto di investire
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <TestimonialCard
              quote="Pagavamo un ERP costoso che non capiva il cantiere. Con Edilizia in Cloud spendiamo una frazione e finalmente sappiamo quanto guadagniamo su ogni commessa."
              name="Giuseppe Conti"
              company="Fratelli Conti Costruzioni, Napoli"
            />
            <TestimonialCard
              quote="Ho calcolato che perdevamo €30.000/anno in margini che non vedevamo. Edilizia in Cloud si è ripagato in 3 settimane."
              name="Marco Rossi"
              company="Costruzioni Rossi Srl, Roma"
            />
            <TestimonialCard
              quote="Setup in 48 ore come promesso. Il consulente del controllo ci ha fatto risparmiare ore di lavoro ogni settimana sui SAL."
              name="Laura Bianchi"
              company="Bianchi Edilizia SpA, Milano"
            />
          </div>
        </div>
      </section>


      {/* ── 8. CTA FINALE ───────────────────────────────────────────────────── */}
      <section
        className="py-20 px-4 text-center"
        style={{ background: "linear-gradient(135deg, #F97415 0%, #e8650e 100%)" }}
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
              to="/demo/"
              className="bg-white text-[#F97415] font-extrabold px-8 py-4 rounded-xl hover:bg-gray-50 transition-colors shadow-lg text-base"
            >
              Inizia con il Professionista
            </Link>
            <button
              type="button"
              onClick={() => {
                import("@/components/landing/QuickContactModal").then((m) => m.openContactModal());
              }}
              className="border-2 border-white text-white font-bold px-8 py-4 rounded-xl hover:bg-white/10 transition-colors text-base"
            >
              Hai domande? Scrivici
            </button>
          </div>
          <div className="flex flex-wrap justify-center gap-6 text-white/80 text-sm">
            {["Disdici quando vuoi", "Setup in 48h", "Garanzia 31 giorni"].map((pill) => (
              <span key={pill} className="flex items-center gap-1.5">
                <Check className="w-4 h-4 text-white" />
                {pill}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ────────────────────────────────────────────────────────────── */}
      <JsonLd id="jsonld-faq-prezzi" data={{
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
          {
            "@type": "Question",
            "name": "Posso provare Edilizia in Cloud gratuitamente?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Sì, offriamo una prova gratuita di 31 giorni con accesso completo. Cancella quando vuoi. Puoi testare tutte le funzionalità del piano Professionista senza alcun impegno. Al termine del periodo di prova puoi scegliere il piano più adatto o disdire senza costi."
            }
          },
          {
            "@type": "Question",
            "name": "Cosa succede se ho bisogno di funzionalità più avanzate del piano Gestionale?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Tutti i piani includono commesse illimitate. Se hai bisogno di funzionalità avanzate puoi passare al piano Professionista o Impresa AI in qualsiasi momento. L'upgrade è immediato e paghi solo la differenza pro-rata del mese in corso."
            }
          },
          {
            "@type": "Question",
            "name": "I prezzi includono l'IVA?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "I prezzi sono sempre IVA esclusa (22%). Le fatture vengono emesse da Domus Group S.r.l. con regolare partita IVA italiana. Per le aziende con partita IVA il costo è interamente deducibile come spesa aziendale."
            }
          },
          {
            "@type": "Question",
            "name": "Posso annullare l'abbonamento in qualsiasi momento?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Sì, puoi disdire in qualsiasi momento senza penali. L'abbonamento rimane attivo fino alla fine del periodo già pagato. Offriamo anche una garanzia di rimborso di 31 giorni: se non sei soddisfatto nei primi 31 giorni ti restituiamo l'intero importo pagato, senza domande."
            }
          },
          {
            "@type": "Question",
            "name": "È possibile avere un piano personalizzato per grandi aziende?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Sì, il piano Impresa AI è completamente personalizzabile. Possiamo configurare utenti illimitati, integrazioni custom con i tuoi sistemi esistenti (ERP, contabilità, gestione HR) e un SLA dedicato con tempi di risposta garantiti. Contattaci per un preventivo su misura."
            }
          }
        ]
      }} />

      {/* ── INTERNAL LINKING ────────────────────────────────────────────── */}
      <section className="py-12 px-4 bg-white border-t border-gray-100">
        <div className="max-w-5xl mx-auto">
          <p className="text-center text-xs font-bold uppercase tracking-widest text-[#F97415] mb-2">
            Approfondisci
          </p>
          <h2 className="text-center text-2xl md:text-3xl font-extrabold text-[#111111] mb-8">
            Esplora altre risorse
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* Trailing slash: le versioni senza slash fanno 301 (GSC "Pagina con
                reindirizzamento"). /sicurezza e /moduli/* non esistevano come
                route pubbliche → erano link rotti (soft-404 per Google). */}
            {[
              { to: "/confronto/", label: "Confronta i piani con i competitor" },
              { to: "/casi-studio/", label: "Vedi i casi studio" },
              { to: "/dpa/", label: "Sicurezza dati e GDPR (DPA)" },
              { to: "/integrazioni/", label: "Tutte le integrazioni" },
              { to: "/funzionalita/gestione-cantieri/", label: "Gestione Cantieri" },
              { to: "/funzionalita/cassa-cantiere/", label: "Cassa e Finanza di Cantiere" },
            ].map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="flex items-center justify-between gap-3 px-5 py-4 rounded-xl border border-gray-200 bg-white hover:border-[#F97415] hover:bg-[#F97415]/5 transition-colors group"
              >
                <span className="font-semibold text-[#111111] text-sm">{l.label}</span>
                <ArrowRight className="w-4 h-4 text-[#F97415] group-hover:translate-x-1 transition-transform" />
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── CONFORMITÀ LEGALE FOOTER BLOCK ──────────────────────────────── */}
      <section className="py-10 px-4 bg-gray-50 border-t border-gray-200">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-sm text-gray-600 leading-relaxed">
            <strong className="text-[#111111]">Domus Group S.r.l.</strong> — P.IVA IT13132010961 — Sede legale: Lombardia.
            <br />
            Per condizioni complete:{" "}
            <Link to="/termini-e-condizioni/" className="text-[#F97415] hover:text-[#C94F06] underline font-semibold">
              Termini e Condizioni
            </Link>
            ,{" "}
            <Link to="/privacy-policy/" className="text-[#F97415] hover:text-[#C94F06] underline font-semibold">
              Privacy Policy
            </Link>
            ,{" "}
            <Link to="/dpa/" className="text-[#F97415] hover:text-[#C94F06] underline font-semibold">
              DPA
            </Link>
            .
            <br />
            <span className="text-xs text-gray-500 mt-2 inline-block">
              Rinnovo automatico: i piani si rinnovano alla fine del periodo, disdetta entro 30 giorni dalla scadenza.
            </span>
          </p>
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
      <p className={`text-xs font-bold uppercase tracking-widest mb-2 ${negative ? "text-gray-400" : "text-[#F97415]"}`}>
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
        <Check className="w-4 h-4 text-[#F97415] flex-shrink-0 mt-0.5" strokeWidth={2.5} />
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
      <span className={highlight ? "text-[#F97415] font-extrabold text-base" : bold ? "text-[#111111] font-bold" : "text-[#111111]"}>
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
        <label className="text-sm font-semibold text-[#111111]">{label}</label>
        <span className="text-[#F97415] font-bold text-base">
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
        className="w-full accent-[#F97415] h-2 rounded-full cursor-pointer"
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
      <Quote className="w-8 h-8 text-[#F97415] opacity-60" />
      <div className="flex items-center gap-1" aria-label="Valutazione 5 stelle su 5">
        {[0, 1, 2, 3, 4].map((i) => (
          <Star key={i} className="w-4 h-4" fill="#F97415" stroke="#F97415" />
        ))}
      </div>
      <p className="text-white/90 text-base md:text-lg leading-relaxed italic">"{quote}"</p>
      <div className="mt-auto">
        <p className="font-bold text-white text-sm">{name}</p>
        <p className="text-white/50 text-xs">{company}</p>
        <Link
          to="/casi-studio/"
          className="inline-flex items-center gap-1 mt-3 text-[#F97415] hover:text-white text-xs font-semibold transition-colors"
        >
          Leggi il caso studio completo <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}

// Tooltip helper per termini tecnici (PSD2, XBRL, OdA AI, ecc.)
const tooltipDictionary: Record<string, string> = {
  "PSD2": "Direttiva europea sui pagamenti che permette di leggere automaticamente i movimenti del conto bancario.",
  "XBRL": "Formato standard per il deposito digitale del bilancio alla Camera di Commercio.",
  "OdA AI": "Verifica automatica con AI degli Ordini di Acquisto: controlla coerenza prezzi, fornitori e congruità.",
  "Banca PSD2": "Connessione sicura e automatica al tuo conto bancario tramite la direttiva europea PSD2.",
  "SDI": "Sistema di Interscambio dell'Agenzia delle Entrate per la fatturazione elettronica.",
  "MUT": "Modello Unico Telematico per la Cassa Edile: invio adempimenti operai edili.",
  "DURC": "Documento Unico di Regolarità Contributiva: certifica i versamenti INPS, INAIL, Cassa Edile.",
};

function FeatureLabel({ label }: { label: string }) {
  // Cerca termini tecnici nella label e aggiunge tooltip
  const matched = Object.keys(tooltipDictionary).find((k) =>
    label.toLowerCase().includes(k.toLowerCase())
  );
  if (!matched) return <>{label}</>;
  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      {label}
      <span
        title={tooltipDictionary[matched]}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-200 text-gray-600 text-[10px] font-bold cursor-help hover:bg-[#F97415] hover:text-white transition-colors"
        aria-label={`Cosa significa ${matched}: ${tooltipDictionary[matched]}`}
      >
        <HelpCircle className="w-3 h-3" />
      </span>
    </span>
  );
}
