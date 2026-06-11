import { useState, useMemo } from "react";
import { useSEO, SITE_URL } from "@/hooks/useSEO";
import { JsonLd } from "@/components/seo/JsonLd";
import { HubSeoSchema } from "@/components/seo/HubSeoSchema";
import { Link } from "react-router-dom";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";
import {
  // Cantieri & Operazioni
  HardHat, ClipboardList, TrendingDown, BookOpenCheck, Camera, ShieldCheck,
  CalendarDays, Smartphone,
  // Fatturazione & Fiscale
  Receipt, Inbox, Archive, BookOpen, FileSpreadsheet, Calculator, Truck, BarChart3,
  // Cassa & HR
  Wallet, Banknote, CalendarClock, Users, FileSignature, Clock, CalendarHeart, Building2,
  // Cliente & Marketing
  Globe, PenTool, UsersRound, Sparkles, Bot, MessageCircle, TrendingUp, LayoutDashboard,
  // Render AI
  Frame, Bath, Mountain, Layers, Brush, Home, Waves,
  // UI
  Search, ArrowRight, CheckCircle2, Zap, Headphones, LayoutGrid,
  type LucideIcon,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// DATA — Le 4 categorie + Render AI specchiano la navbar (mega-menu Piattaforma)
// ─────────────────────────────────────────────────────────────────────────────

interface FeatureLink {
  slug: string;            // path completo es. /funzionalita/gestione-cantieri
  label: string;
  desc: string;
  icon: LucideIcon;
  badge?: "AI" | "NEW";
}

interface FeatureCategory {
  id: string;
  label: string;
  description: string;
  items: FeatureLink[];
}

const CATEGORIES: FeatureCategory[] = [
  {
    id: "cantieri",
    label: "Cantieri & Operazioni",
    description: "Avanzamento lavori, sicurezza, foto geolocalizzate, mobile offline-first.",
    items: [
      { slug: "/funzionalita/gestione-cantieri", label: "Gestione Cantieri", desc: "Avanzamento lavori in tempo reale", icon: HardHat },
      { slug: "/funzionalita/preventivi-edilizia", label: "Preventivi Edilizia", desc: "Computo metrico e prezzari ufficiali", icon: ClipboardList },
      { slug: "/funzionalita/margini-cantiere", label: "Margini Cantiere", desc: "Preventivo vs consuntivo live", icon: TrendingDown },
      { slug: "/funzionalita/giornale-lavori", label: "Giornale Lavori", desc: "Conforme D.M. 49/2018", icon: BookOpenCheck },
      { slug: "/funzionalita/foto-cantiere", label: "Foto Cantiere", desc: "Geolocalizzate con timestamp", icon: Camera },
      { slug: "/funzionalita/sicurezza-cantiere", label: "Sicurezza Cantiere", desc: "POS digitali D.Lgs 81/2008", icon: ShieldCheck },
      { slug: "/funzionalita/calendario-lavori", label: "Calendario Lavori", desc: "Gantt multi-cantiere", icon: CalendarDays },
      { slug: "/funzionalita/app-cantiere-mobile", label: "App Cantiere Mobile", desc: "iOS/Android offline-first", icon: Smartphone },
    ],
  },
  {
    id: "fatturazione",
    label: "Fatturazione & Fiscale",
    description: "SDI, cassetto fiscale, conservazione AgID, prima nota AI, contabilità CEE+XBRL.",
    items: [
      { slug: "/funzionalita/fatturazione-elettronica", label: "Fatturazione SDI", desc: "B2B, PA, split payment", icon: Receipt },
      { slug: "/funzionalita/cassetto-sdi", label: "Cassetto Fiscale SDI", desc: "Sync Agenzia Entrate", icon: Inbox },
      { slug: "/funzionalita/conserva-digitale", label: "Conservazione Digitale", desc: "Decennale CAD AgID", icon: Archive },
      { slug: "/funzionalita/prima-nota", label: "Prima Nota", desc: "Cassa/banca PSD2 + AI", icon: BookOpen },
      { slug: "/funzionalita/registro-iva", label: "Registri IVA", desc: "LIPE automatica", icon: FileSpreadsheet },
      { slug: "/funzionalita/contabilita-fiscale", label: "Contabilità Fiscale", desc: "Bilancio CEE + XBRL", icon: Calculator },
      { slug: "/funzionalita/ddt-digitali", label: "DDT Digitali", desc: "Firma autista mobile", icon: Truck },
      { slug: "/funzionalita/report-fatturazione", label: "Report Fatturazione", desc: "Dashboard mensile", icon: BarChart3 },
    ],
  },
  {
    id: "cassa-hr",
    label: "Cassa & HR",
    description: "Cash flow PSD2, cedolini Cassa Edile, GPS cantiere, subappalti DURC.",
    items: [
      { slug: "/funzionalita/cassa-cantiere", label: "Cassa Cantiere", desc: "Cash flow PSD2 30/60/90 gg", icon: Wallet },
      { slug: "/funzionalita/tesoreria", label: "Tesoreria", desc: "Multi-banca consolidata", icon: Banknote },
      { slug: "/funzionalita/scadenzario", label: "Scadenzario", desc: "Solleciti automatici", icon: CalendarClock },
      { slug: "/funzionalita/hr-personale", label: "HR Personale", desc: "CCNL Edilizia integrato", icon: Users },
      { slug: "/funzionalita/cedolini-paga", label: "Cedolini Paga", desc: "Cassa Edile + F24", icon: FileSignature },
      { slug: "/funzionalita/timbrature-gps", label: "Timbrature GPS", desc: "Geofence cantiere", icon: Clock },
      { slug: "/funzionalita/ferie-permessi", label: "Ferie & Permessi", desc: "Self-service operaio", icon: CalendarHeart },
      { slug: "/funzionalita/gestione-subappalti", label: "Subappalti", desc: "Ritenuta 4% INPS + DURC", icon: Building2 },
    ],
  },
  {
    id: "cliente-marketing",
    label: "Cliente & Marketing",
    description: "Portale clienti, firma elettronica eIDAS, CRM, AI quote builder, WhatsApp.",
    items: [
      { slug: "/funzionalita/portale-clienti", label: "Portale Clienti", desc: "Area cliente brandizzata", icon: Globe },
      { slug: "/funzionalita/firma-elettronica", label: "Firma Elettronica", desc: "eIDAS in 30 secondi", icon: PenTool },
      { slug: "/funzionalita/crm-edilizia", label: "CRM Edilizia", desc: "Pipeline preventivi", icon: UsersRound },
      { slug: "/funzionalita/quote-builder-ai", label: "Quote Builder AI", desc: "Preventivo in 5 minuti", icon: Sparkles, badge: "AI" },
      { slug: "/funzionalita/agenti-ai", label: "Agenti AI", desc: "Chatbot GDPR-first", icon: Bot, badge: "AI" },
      { slug: "/funzionalita/whatsapp-marketing", label: "WhatsApp Marketing", desc: "Business API + broadcast", icon: MessageCircle },
      { slug: "/funzionalita/pipeline-vendite", label: "Pipeline Vendite", desc: "Drag & drop fasi", icon: TrendingUp },
      { slug: "/funzionalita/cruscotto-aziendale", label: "Cruscotto Aziendale", desc: "KPI real-time", icon: LayoutDashboard },
    ],
  },
];

const RENDER_AI: FeatureLink[] = [
  { slug: "/funzionalita/render-infissi", label: "Render Infissi", desc: "Visualizza nuovi infissi sulla foto del cliente", icon: Frame, badge: "AI" },
  { slug: "/funzionalita/render-bagni", label: "Render Bagni", desc: "Ristrutturazione bagno fotorealistica AI", icon: Bath, badge: "AI" },
  { slug: "/funzionalita/render-tetti", label: "Render Tetti", desc: "Coperture, pannelli, manti — anteprima AI", icon: Mountain, badge: "AI" },
  { slug: "/funzionalita/render-pavimenti", label: "Render Pavimenti", desc: "Parquet, gres, cementine sulla foto reale", icon: Layers, badge: "AI" },
  { slug: "/funzionalita/render-ristrutturazioni", label: "Render Ristrutturazioni", desc: "Prima/dopo intera stanza", icon: Brush, badge: "AI" },
  { slug: "/funzionalita/render-stanza", label: "Render Stanza", desc: "Restyling completo arredo + finiture", icon: Home, badge: "AI" },
  { slug: "/funzionalita/render-piscine", label: "Render Piscine", desc: "Anteprima piscina nel giardino del cliente", icon: Waves, badge: "AI" },
];

const ALL_FEATURES: FeatureLink[] = [...CATEGORIES.flatMap((c) => c.items), ...RENDER_AI];
const TOTAL_COUNT = ALL_FEATURES.length; // 39 + 7 = 46

// ─────────────────────────────────────────────────────────────────────────────
// PAGE COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

type FilterId = "tutti" | "cantieri" | "fatturazione" | "cassa-hr" | "cliente-marketing" | "render-ai";

export default function Funzionalita() {
  const [activeFilter, setActiveFilter] = useState<FilterId>("tutti");
  const [query, setQuery] = useState("");

  useSEO({
    title: `${TOTAL_COUNT}+ Funzionalità — Software Edilizia All-in-One`,
    description: `Le ${TOTAL_COUNT} funzionalità di Edilizia in Cloud: cantieri real-time, fatturazione SDI, cassa edile, CRM, render AI. Una piattaforma, zero integrazioni.`,
    canonical: "/funzionalita",
    keywords:
      "funzionalità gestionale edilizia, moduli software edilizia, gestione cantieri real-time, fatturazione elettronica SDI edilizia, render AI edilizia, CRM imprese edili, cassa edile software, software all-in-one edilizia, app cantiere mobile, preventivi edilizia computo metrico",
    ogImage: "https://www.ediliziaincloud.com/og/funzionalita-og.jpg",
  });

  // Filtered list according to active filter + search query
  const filteredCategories = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matchesQuery = (f: FeatureLink) =>
      !q || f.label.toLowerCase().includes(q) || f.desc.toLowerCase().includes(q);

    const cats = CATEGORIES.map((cat) => ({
      ...cat,
      items: cat.items.filter(matchesQuery),
    }));

    const renderItems = RENDER_AI.filter(matchesQuery);

    if (activeFilter === "tutti") return { cats: cats.filter((c) => c.items.length > 0), renderItems };
    if (activeFilter === "render-ai") return { cats: [], renderItems };
    return { cats: cats.filter((c) => c.id === activeFilter && c.items.length > 0), renderItems: [] };
  }, [activeFilter, query]);

  // ────── ItemList JSON-LD per indicizzazione completa delle 46 funzionalità ─
  const itemListLd = useMemo(
    () => ({
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: `Funzionalità di Edilizia in Cloud — ${TOTAL_COUNT} moduli`,
      itemListOrder: "https://schema.org/ItemListOrderAscending",
      numberOfItems: ALL_FEATURES.length,
      itemListElement: ALL_FEATURES.map((f, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `${SITE_URL}${f.slug}`,
        name: f.label,
        description: f.desc,
      })),
    }),
    []
  );

  // SoftwareApplication JSON-LD con featureList per Google Knowledge Graph
  const softwareLd = useMemo(
    () => ({
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      "@id": `${SITE_URL}/#software`,
      name: "Edilizia in Cloud",
      url: SITE_URL,
      applicationCategory: "BusinessApplication",
      applicationSubCategory: "Construction Management Software",
      operatingSystem: "Web, iOS, Android",
      description: `Software gestionale all-in-one per imprese edili italiane: ${TOTAL_COUNT} funzionalità integrate per cantieri, fatturazione SDI, HR Cassa Edile, CRM e Render AI.`,
      offers: {
        "@type": "Offer",
        priceCurrency: "EUR",
        price: "127.00",
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          price: "127.00",
          priceCurrency: "EUR",
          unitText: "MONTH",
        },
      },
      featureList: ALL_FEATURES.map((f) => f.label),
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: "4.9",
        reviewCount: "187",
        bestRating: "5",
      },
      inLanguage: "it-IT",
    }),
    []
  );

  return (
    <div className="min-h-screen bg-white text-[#111111]">
      {/* SEO injection */}
      <HubSeoSchema
        pageName="Funzionalità"
        pagePath="/funzionalita"
        pageDescription={`Tutte le ${TOTAL_COUNT} funzionalità di Edilizia in Cloud: gestione cantieri, fatturazione SDI, HR Cassa Edile, CRM, render AI.`}
        breadcrumbs={[
          { name: "Home", url: "/" },
          { name: "Funzionalità", url: "/funzionalita" },
        ]}
      />
      <JsonLd id="jsonld-funzionalita-itemlist" data={itemListLd} />
      <JsonLd id="jsonld-funzionalita-software" data={softwareLd} />

      <LandingNavbar />

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="relative pt-32 md:pt-36 pb-16 md:pb-20 px-6 bg-white border-b border-gray-100 overflow-hidden">
        {/* Soft brand glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 -right-40 w-[520px] h-[520px] rounded-full opacity-[0.08]"
          style={{ background: "radial-gradient(circle, #F97415 0%, transparent 70%)" }}
        />

        <div className="max-w-6xl mx-auto relative">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 bg-[#F97415]/10 text-[#F97415] text-[11px] font-bold tracking-widest uppercase px-4 py-1.5 rounded-full mb-6 border border-[#F97415]/30">
              <Sparkles className="w-3 h-3" />
              Piattaforma all-in-one
            </span>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-[#111111] leading-[1.05] tracking-tight mb-6">
              Una piattaforma.{" "}
              <span className="text-[#F97415]">{TOTAL_COUNT} funzionalità.</span>
              <br />
              Zero integrazioni esterne.
            </h1>

            <p className="text-base md:text-lg text-[#111111]/65 leading-relaxed mb-10 max-w-2xl">
              Cantieri, fatturazione SDI, Cassa Edile, CRM, marketing, AI e Render —
              integrati e sincronizzati in tempo reale. Tutto incluso, qualunque piano scegli.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl">
              {[
                { value: `${TOTAL_COUNT}+`, label: "Funzionalità incluse" },
                { value: "Zero", label: "Add-on a pagamento" },
                { value: "48h", label: "Setup completo" },
                { value: "100%", label: "Made for edilizia" },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-xl px-4 py-3 border border-gray-200 bg-gray-50/60"
                >
                  <p className="text-2xl font-extrabold text-[#F97415] leading-tight">{stat.value}</p>
                  <p className="text-xs text-[#111111]/55 mt-0.5 leading-tight">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── STICKY FILTERS + SEARCH ──────────────────────────────────────── */}
      <div className="sticky top-[68px] z-30 bg-white/95 backdrop-blur border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-3 flex flex-col md:flex-row md:items-center gap-3">
          <div className="flex items-center gap-2 overflow-x-auto md:overflow-visible scrollbar-hide -mx-1 px-1">
            <FilterChip active={activeFilter === "tutti"} onClick={() => setActiveFilter("tutti")} icon={LayoutGrid} label="Tutti" count={TOTAL_COUNT} />
            {CATEGORIES.map((c) => (
              <FilterChip
                key={c.id}
                active={activeFilter === c.id}
                onClick={() => setActiveFilter(c.id as FilterId)}
                label={c.label}
                count={c.items.length}
              />
            ))}
            <FilterChip
              active={activeFilter === "render-ai"}
              onClick={() => setActiveFilter("render-ai")}
              label="Render AI"
              count={RENDER_AI.length}
              accent
            />
          </div>

          <div className="md:ml-auto flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-full px-3.5 py-2 md:min-w-[260px]">
            <Search className="w-4 h-4 text-[#111111]/40 shrink-0" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cerca una funzionalità…"
              aria-label="Cerca tra le funzionalità"
              className="bg-transparent text-sm w-full focus:outline-none placeholder:text-[#111111]/35"
            />
          </div>
        </div>
      </div>

      {/* ── CATEGORIES (filtered) ───────────────────────────────────────── */}
      <section className="py-14 md:py-16 px-6 bg-white">
        <div className="max-w-6xl mx-auto space-y-14">
          {filteredCategories.cats.length === 0 && filteredCategories.renderItems.length === 0 && (
            <div className="text-center py-20 text-[#111111]/55">
              Nessuna funzionalità trovata per "<span className="font-semibold text-[#111111]">{query}</span>".
              <button
                className="block mx-auto mt-4 text-sm font-bold text-[#F97415] hover:underline"
                onClick={() => { setQuery(""); setActiveFilter("tutti"); }}
              >
                Mostra tutto
              </button>
            </div>
          )}

          {filteredCategories.cats.map((cat) => (
            <div key={cat.id} id={cat.id}>
              <header className="mb-7 flex items-baseline justify-between flex-wrap gap-2">
                <div>
                  <h2 className="text-2xl md:text-3xl font-extrabold text-[#111111] tracking-tight">
                    {cat.label}
                  </h2>
                  <p className="text-sm text-[#111111]/60 mt-1.5 max-w-2xl">{cat.description}</p>
                </div>
                <span className="text-xs font-bold tracking-widest uppercase text-[#F97415]/80">
                  {cat.items.length} moduli
                </span>
              </header>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {cat.items.map((f) => (
                  <FeatureCard key={f.slug} feature={f} />
                ))}
              </div>
            </div>
          ))}

          {filteredCategories.renderItems.length > 0 && (
            <div id="render-ai" className="rounded-3xl bg-gradient-to-br from-[#F97415]/8 via-white to-white p-6 md:p-10 border border-[#F97415]/20">
              <header className="mb-7 flex items-baseline justify-between flex-wrap gap-2">
                <div>
                  <span className="inline-flex items-center gap-1.5 bg-[#F97415] text-white text-[10px] font-black tracking-widest uppercase px-2.5 py-1 rounded-full mb-3">
                    <Sparkles className="w-3 h-3" /> AI Generativa
                  </span>
                  <h2 className="text-2xl md:text-3xl font-extrabold text-[#111111] tracking-tight">
                    Render AI per l'edilizia
                  </h2>
                  <p className="text-sm text-[#111111]/65 mt-1.5 max-w-2xl">
                    Mostra al cliente <strong>come sarà il lavoro finito</strong> partendo dalla foto reale.
                    Genera anteprime fotorealistiche in 30 secondi e chiudi il preventivo prima.
                  </p>
                </div>
                <span className="text-xs font-bold tracking-widest uppercase text-[#F97415]/80">
                  {filteredCategories.renderItems.length} verticali
                </span>
              </header>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {filteredCategories.renderItems.map((f) => (
                  <FeatureCard key={f.slug} feature={f} variant="render" />
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── INCLUSO IN OGNI PIANO ───────────────────────────────────────── */}
      <section className="py-16 px-6 bg-gray-50 border-y border-gray-200">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl md:text-3xl font-extrabold text-[#111111] mb-3">
              Tutto incluso, <span className="text-[#F97415]">senza add-on a pagamento</span>
            </h2>
            <p className="text-[#111111]/60 text-sm md:text-base max-w-xl mx-auto">
              Le {TOTAL_COUNT} funzionalità sono incluse in ogni piano. Nessun modulo a parte, nessun upgrade nascosto.
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-3 mb-10">
            {[
              { icon: CheckCircle2, label: "Aggiornamenti mensili gratuiti" },
              { icon: CheckCircle2, label: "Nessun costo per moduli aggiuntivi" },
              { icon: Zap, label: "Setup in 48 ore" },
              { icon: Headphones, label: "Supporto WhatsApp dedicato" },
              { icon: ShieldCheck, label: "GDPR Compliant · Made in Italy" },
            ].map((b) => (
              <span
                key={b.label}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold border border-[#F97415]/25 bg-[#F97415]/5 text-[#C94F06]"
              >
                <b.icon className="w-3.5 h-3.5" />
                {b.label}
              </span>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/demo/"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-[#F97415] hover:bg-[#C94F06] text-white font-bold text-base transition-colors shadow-lg shadow-[#F97415]/20"
            >
              Richiedi una Demo Gratuita
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              to="/prezzi/"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl border-2 border-[#111111]/15 hover:border-[#F97415] text-[#111111] hover:text-[#F97415] font-bold text-base transition-colors"
            >
              Vedi i prezzi
            </Link>
          </div>
        </div>
      </section>

      {/* ── GUIDE BLOG CORRELATE ────────────────────────────────────────── */}
      <section className="py-14 md:py-16 px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-xl md:text-2xl font-extrabold text-[#111111] mb-2">
            Guide pratiche per imprese edili
          </h2>
          <p className="text-[#111111]/55 text-sm mb-8">
            Approfondisci con le nostre guide gratuite — niente registrazione richiesta.
          </p>
          <div className="grid md:grid-cols-3 gap-4">
            {[
              { slug: "sal-cantiere-come-funziona", label: "SAL Cantiere: cos'è e come funziona" },
              { slug: "computo-metrico-estimativo-guida", label: "Computo metrico: guida pratica" },
              { slug: "analisi-margini-imprese-edili", label: "Analisi dei margini per imprese edili" },
              { slug: "come-fare-preventivo-edilizia", label: "Come fare un preventivo professionale" },
              { slug: "durc-edilizia-guida-completa", label: "DURC in edilizia: guida completa" },
              { slug: "appalti-pubblici-edilizia-guida", label: "Appalti pubblici: come partecipare" },
            ].map((post) => (
              <Link
                key={post.slug}
                to={`/blog/${post.slug}`}
                className="flex items-center gap-3 p-4 rounded-xl border border-gray-200 bg-white hover:border-[#F97415]/40 hover:bg-[#F97415]/5 transition-all group"
              >
                <span className="flex-1 text-sm font-semibold text-[#111111] group-hover:text-[#F97415] transition-colors leading-snug">
                  {post.label}
                </span>
                <ArrowRight className="w-4 h-4 text-[#F97415] flex-shrink-0" />
              </Link>
            ))}
          </div>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

function FilterChip({
  active,
  onClick,
  icon: Icon,
  label,
  count,
  accent = false,
}: {
  active: boolean;
  onClick: () => void;
  icon?: LucideIcon;
  label: string;
  count: number;
  accent?: boolean;
}) {
  const base =
    "shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-semibold transition-colors border whitespace-nowrap";
  const off = accent
    ? "border-[#F97415]/30 text-[#F97415] bg-[#F97415]/5 hover:bg-[#F97415]/10"
    : "border-gray-200 text-[#111111]/70 bg-white hover:border-[#111111]/30 hover:text-[#111111]";
  const on = "bg-[#111111] border-[#111111] text-white";
  return (
    <button onClick={onClick} className={`${base} ${active ? on : off}`}>
      {Icon && <Icon className="w-3.5 h-3.5" />}
      {label}
      <span className={`ml-1 text-[10px] font-bold ${active ? "text-white/70" : "text-[#111111]/40"}`}>
        {count}
      </span>
    </button>
  );
}

function FeatureCard({
  feature,
  variant = "default",
}: {
  feature: FeatureLink;
  variant?: "default" | "render";
}) {
  const Icon = feature.icon;
  const isRender = variant === "render";
  return (
    <Link
      to={feature.slug}
      className={`group relative flex flex-col gap-2 rounded-2xl border p-4 md:p-5 transition-all hover:-translate-y-0.5 hover:shadow-md ${
        isRender
          ? "border-[#F97415]/25 bg-white hover:border-[#F97415]"
          : "border-gray-200 bg-white hover:border-[#F97415]/50"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
            isRender
              ? "bg-[#F97415]/10 text-[#F97415]"
              : "bg-gray-100 text-[#111111] group-hover:bg-[#F97415]/10 group-hover:text-[#F97415]"
          } transition-colors`}
        >
          <Icon className="w-4.5 h-4.5" />
        </span>
        {feature.badge && (
          <span className="text-[9px] font-black tracking-widest uppercase px-1.5 py-0.5 rounded-md bg-[#F97415] text-white">
            {feature.badge}
          </span>
        )}
      </div>
      <h3 className="font-bold text-[#111111] text-sm leading-tight group-hover:text-[#F97415] transition-colors">
        {feature.label}
      </h3>
      <p className="text-xs text-[#111111]/55 leading-relaxed">{feature.desc}</p>
      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#F97415] mt-auto pt-2 group-hover:gap-1.5 transition-all">
        Scopri di più
        <ArrowRight className="w-3 h-3" />
      </span>
    </Link>
  );
}
