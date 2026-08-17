import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Menu,
  X,
  ChevronDown,
  HardHat,
  ClipboardList,
  TrendingDown,
  BookOpenCheck,
  Camera,
  ShieldCheck,
  CalendarDays,
  Smartphone,
  Receipt,
  Inbox,
  Archive,
  BookOpen,
  FileSpreadsheet,
  Calculator,
  Truck,
  BarChart3,
  Wallet,
  Banknote,
  CalendarClock,
  Users,
  FileSignature as FileSignatureIcon,
  Clock,
  CalendarHeart,
  Building2,
  Globe,
  PenTool,
  UsersRound,
  Sparkles,
  Bot,
  MessageCircle,
  TrendingUp,
  LayoutDashboard,
  Bath,
  Home,
  Layers,
  Brush,
  Mountain,
  Waves,
  Briefcase,
  Wrench,
  Hammer,
  SunMedium,
  Frame,
  Building,
  Newspaper,
  GraduationCap,
  BookMarked,
  Plug,
  MapPin,
  Trophy,
  ArrowRight,
  MessageSquare,
  PanelsTopLeft,
  PencilRuler,
  FileSearch,
} from "lucide-react";
// Logo navbar: versione 360w (8.5KB) invece di 1871w (103KB).
// PageSpeed flaggava 98.6KB di savings stimati sull'asset originale.
import logo from "@/assets/edilizia-in-cloud-logo-small.webp";
import { getSubdomainUrl } from "@/utils/subdomainNav";

// ───────────────────── Types ─────────────────────
type MenuItem = {
  to: string;
  label: string;
  desc?: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
};

type MenuColumn = {
  heading: string;
  items: MenuItem[];
};

// ───────────── Piattaforma — 4 columns × ~7 items ─────────────
const piattaformaColumns: MenuColumn[] = [
  {
    heading: "CANTIERI & OPERAZIONI",
    items: [
      { to: "/funzionalita/gestione-cantieri", label: "Gestione Cantieri", desc: "Avanzamento lavori in tempo reale", icon: HardHat },
      { to: "/funzionalita/preventivi-edilizia", label: "Preventivi Edilizia", desc: "Computo metrico e prezzari", icon: ClipboardList },
      { to: "/funzionalita/margini-cantiere", label: "Margini Cantiere", desc: "Preventivo vs consuntivo live", icon: TrendingDown },
      { to: "/funzionalita/giornale-lavori", label: "Giornale Lavori", desc: "Conforme D.M. 49/2018", icon: BookOpenCheck },
      { to: "/funzionalita/foto-cantiere", label: "Foto Cantiere", desc: "Geolocalizzate con timestamp", icon: Camera },
      { to: "/funzionalita/sicurezza-cantiere", label: "Sicurezza Cantiere", desc: "POS digitali D.Lgs 81/2008", icon: ShieldCheck },
      { to: "/funzionalita/calendario-lavori", label: "Calendario Lavori", desc: "Gantt multi-cantiere", icon: CalendarDays },
      { to: "/funzionalita/app-cantiere-mobile", label: "App Cantiere Mobile", desc: "iOS/Android offline-first", icon: Smartphone },
    ],
  },
  {
    heading: "FATTURAZIONE & FISCALE",
    items: [
      { to: "/funzionalita/fatturazione-elettronica", label: "Fatturazione SDI", desc: "B2B, PA, split payment", icon: Receipt },
      { to: "/funzionalita/cassetto-sdi", label: "Cassetto Fiscale SDI", desc: "Sync Agenzia Entrate", icon: Inbox },
      { to: "/funzionalita/conserva-digitale", label: "Conservazione Digitale", desc: "Decennale CAD AgID", icon: Archive },
      { to: "/funzionalita/prima-nota", label: "Prima Nota", desc: "Cassa/banca PSD2 + AI", icon: BookOpen },
      { to: "/funzionalita/registro-iva", label: "Registri IVA", desc: "LIPE automatica", icon: FileSpreadsheet },
      { to: "/funzionalita/contabilita-fiscale", label: "Contabilità Fiscale", desc: "Bilancio CEE + XBRL", icon: Calculator },
      { to: "/funzionalita/ddt-digitali", label: "DDT Digitali", desc: "Firma autista mobile", icon: Truck },
      { to: "/funzionalita/report-fatturazione", label: "Report Fatturazione", desc: "Dashboard mensile", icon: BarChart3 },
    ],
  },
  {
    heading: "CASSA & HR",
    items: [
      { to: "/funzionalita/cassa-cantiere", label: "Cassa Cantiere", desc: "Cash flow PSD2 30/60/90 gg", icon: Wallet },
      { to: "/funzionalita/tesoreria", label: "Tesoreria", desc: "Multi-banca consolidata", icon: Banknote },
      { to: "/funzionalita/scadenzario", label: "Scadenzario", desc: "Solleciti automatici", icon: CalendarClock },
      { to: "/funzionalita/hr-personale", label: "HR Personale", desc: "CCNL Edilizia integrato", icon: Users },
      { to: "/funzionalita/cedolini-paga", label: "Cedolini Paga", desc: "Cassa Edile + F24", icon: FileSignatureIcon },
      { to: "/funzionalita/timbrature-gps", label: "Timbrature GPS", desc: "Geofence cantiere", icon: Clock },
      { to: "/funzionalita/ferie-permessi", label: "Ferie & Permessi", desc: "Self-service operaio", icon: CalendarHeart },
      { to: "/funzionalita/gestione-subappalti", label: "Subappalti", desc: "Ritenuta 4% INPS + DURC", icon: Building2 },
    ],
  },
  {
    heading: "CLIENTE & MARKETING",
    items: [
      { to: "/funzionalita/portale-clienti", label: "Portale Clienti", desc: "Area cliente brandizzata", icon: Globe },
      { to: "/funzionalita/firma-elettronica", label: "Firma Elettronica", desc: "eIDAS in 30 secondi", icon: PenTool },
      { to: "/funzionalita/crm-edilizia", label: "CRM Edilizia", desc: "Pipeline preventivi", icon: UsersRound },
      { to: "/funzionalita/quote-builder-ai", label: "Quote Builder AI", desc: "Preventivo in 5 minuti", icon: Sparkles, badge: "AI" },
      { to: "/funzionalita/agenti-ai", label: "Agenti AI", desc: "Chatbot GDPR-first", icon: Bot, badge: "AI" },
      { to: "/funzionalita/whatsapp-marketing", label: "WhatsApp Marketing", desc: "Business API + broadcast", icon: MessageCircle },
      { to: "/funzionalita/pipeline-vendite", label: "Pipeline Vendite", desc: "Drag&drop fasi", icon: TrendingUp },
      { to: "/funzionalita/cruscotto-aziendale", label: "Cruscotto Aziendale", desc: "KPI real-time", icon: LayoutDashboard },
    ],
  },
];

// Bonus column / sidebar for Piattaforma — Render AI verticale
const piattaformaSidebar: MenuColumn = {
  heading: "RENDER AI",
  items: [
    { to: "/funzionalita/render-infissi", label: "Render Infissi", icon: Frame, badge: "AI" },
    { to: "/funzionalita/render-bagni", label: "Render Bagni", icon: Bath, badge: "AI" },
    { to: "/funzionalita/render-tetti", label: "Render Tetti", icon: Mountain, badge: "AI" },
    { to: "/funzionalita/render-pavimenti", label: "Render Pavimenti", icon: Layers, badge: "AI" },
    { to: "/funzionalita/render-ristrutturazioni", label: "Render Ristrutturazioni", icon: Brush, badge: "AI" },
    { to: "/funzionalita/render-stanza", label: "Render Stanza", icon: Home, badge: "AI" },
    { to: "/funzionalita/render-piscine", label: "Render Piscine", icon: Waves, badge: "AI" },
  ],
};

// ───────────── Per chi — 2 columns + partnership sidebar ─────────────
const perChiColumns: MenuColumn[] = [
  {
    heading: "DIMENSIONE AZIENDA",
    items: [
      { to: "/per/piccole-imprese", label: "Piccole Imprese", desc: "Fino a 10 dipendenti", icon: Briefcase },
      { to: "/per/medie-imprese", label: "Medie Imprese", desc: "10-50 dipendenti, multi-cantiere", icon: Building },
      { to: "/per/grandi-imprese", label: "Grandi Imprese", desc: "Oltre 50 dipendenti, general contractor", icon: Building2 },
    ],
  },
  {
    heading: "SETTORE",
    items: [
      { to: "/per/imprese-edili", label: "Imprese di Costruzione", desc: "General contractor edili", icon: HardHat },
      { to: "/per/impiantisti", label: "Impiantisti", desc: "Idraulici, elettricisti, termici", icon: Wrench },
      { to: "/per/ristrutturatori", label: "Ristrutturatori", desc: "Ristrutturazione residenziale", icon: Hammer },
      { to: "/per/fotovoltaico", label: "Fotovoltaico", desc: "Installatori e EPC", icon: SunMedium },
      { to: "/per/serramentisti", label: "Serramentisti", desc: "Infissi e facciate", icon: Frame },
    ],
  },
];

const perChiSidebar: MenuColumn = {
  heading: "PARTNERSHIP",
  items: [
    { to: "/diventa-partner", label: "Diventa Partner", desc: "Programma referral imprese edili", icon: Trophy },
    { to: "/casi-studio", label: "Casi Studio", desc: "Storie di clienti reali", icon: BookMarked },
  ],
};

// ───────────── Risorse — 3 columns + newsletter sidebar ─────────────
const risorseColumns: MenuColumn[] = [
  {
    heading: "APPROFONDISCI",
    items: [
      { to: "/blog", label: "Blog", desc: "Articoli e guide settoriali", icon: Newspaper },
      { to: "/casi-studio", label: "Casi Studio", desc: "Storie di clienti reali", icon: BookMarked },
      { to: "/formazione", label: "Formazione", desc: "Webinar e corsi gratuiti", icon: GraduationCap },
      { to: "/glossario-edilizia", label: "Glossario Edilizia", desc: "Termini tecnici spiegati", icon: BookOpen },
    ],
  },
  {
    heading: "STRUMENTI & CONFRONTI",
    items: [
      { to: "/strumenti", label: "Calcolatori Gratuiti", desc: "Congruità, costo orario, margine", icon: Calculator },
      { to: "/confronto", label: "Confronto Software", desc: "vs Primus, Edilnet, TeamSystem", icon: PanelsTopLeft },
      { to: "/integrazioni", label: "Integrazioni", desc: "API, SDI, banche, CRM", icon: Plug },
      { to: "/software-gestionale-edilizia", label: "Software per Città", desc: "Soluzioni per area geografica", icon: MapPin },
      { to: "/funzionalita", label: "Tutte le Funzionalità", desc: "Mappa completa della piattaforma", icon: PencilRuler },
    ],
  },
  {
    heading: "PASSA A EDILIZIA IN CLOUD",
    items: [
      { to: "/demo", label: "Richiedi una Demo", desc: "30 minuti con un esperto", icon: MessageSquare },
      { to: "/prezzi", label: "Inizia Ora", desc: "31 giorni gratuiti", icon: ArrowRight },
      { to: "/chi-siamo", label: "Chi Siamo", desc: "Il team e la storia", icon: Users },
    ],
  },
];

// ───────────── Confronto sidebar ─────────────
const confrontoColumns: MenuColumn[] = [
  {
    heading: "CONFRONTA EDILIZIA IN CLOUD",
    items: [
      { to: "/confronto/vs-primus", label: "vs Primus", desc: "ACCA Software", icon: FileSearch },
      { to: "/confronto/vs-edilnet", label: "vs Edilnet", desc: "TeamSystem Edilizia", icon: FileSearch },
      { to: "/confronto/vs-teamsystem", label: "vs TeamSystem", desc: "Studio commercialista", icon: FileSearch },
      { to: "/confronto/vs-excel", label: "vs Excel", desc: "Fogli di calcolo", icon: FileSpreadsheet },
      { to: "/confronto/vs-buildertrend", label: "vs Buildertrend", desc: "Software USA", icon: FileSearch },
    ],
  },
];

// ─────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────
type DropdownKey = "piattaforma" | "perChi" | "risorse" | "confronto" | null;

export default function LandingNavbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<DropdownKey>(null);
  const [mobileSection, setMobileSection] = useState<DropdownKey>(null);
  const closeTimer = useRef<number | null>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const isHome = location.pathname === "/home" || location.pathname === "/";

  // Scroll background
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close dropdown when route changes
  useEffect(() => {
    setActiveDropdown(null);
    setMobileOpen(false);
    setMobileSection(null);
  }, [location.pathname]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setActiveDropdown(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ESC closes dropdowns
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setActiveDropdown(null);
        setMobileOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Hover with intent delay (avoid flicker)
  const openWithIntent = useCallback((key: Exclude<DropdownKey, null>) => {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setActiveDropdown(key);
  }, []);

  const scheduleClose = useCallback(() => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setActiveDropdown(null), 150);
  }, []);

  const cancelClose = useCallback(() => {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const isWhiteBg = scrolled || !isHome || activeDropdown !== null;

  const triggerClass = (key: Exclude<DropdownKey, null>) =>
    `flex items-center gap-1 text-sm font-medium transition-colors ${
      isWhiteBg ? "text-[#111111]/70 hover:text-[#111111]" : "text-white/80 hover:text-white"
    } ${activeDropdown === key ? "!text-[#F97415]" : ""}`;

  const linkClass = (active: boolean) =>
    `text-sm font-medium transition-colors ${
      isWhiteBg ? "text-[#111111]/70 hover:text-[#111111]" : "text-white/80 hover:text-white"
    } ${active ? "!text-[#F97415]" : ""}`;

  return (
    <>
      <nav
        ref={navRef}
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          isWhiteBg ? "bg-white/95 backdrop-blur-md shadow-sm" : "bg-transparent"
        }`}
      >
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          {/* Logo */}
          {isHome ? (
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            >
              <img
                src={logo}
                alt="Edilizia in Cloud"
                width={144}
                height={36}
                className={`h-9 w-auto transition-all duration-300 ${isWhiteBg ? "" : "brightness-0 invert"}`}
              />
            </a>
          ) : (
            <Link to="/">
              <img src={logo} alt="Edilizia in Cloud" width={144} height={36} className="h-9 w-auto" />
            </Link>
          )}

          {/* Desktop nav */}
          <div className="hidden lg:flex items-center gap-7">
            {/* PIATTAFORMA */}
            <button
              type="button"
              onMouseEnter={() => openWithIntent("piattaforma")}
              onMouseLeave={scheduleClose}
              onClick={() => setActiveDropdown(activeDropdown === "piattaforma" ? null : "piattaforma")}
              aria-expanded={activeDropdown === "piattaforma"}
              aria-haspopup="menu"
              className={triggerClass("piattaforma")}
            >
              Piattaforma
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform duration-200 ${
                  activeDropdown === "piattaforma" ? "rotate-180" : ""
                }`}
              />
            </button>

            {/* PER CHI */}
            <button
              type="button"
              onMouseEnter={() => openWithIntent("perChi")}
              onMouseLeave={scheduleClose}
              onClick={() => setActiveDropdown(activeDropdown === "perChi" ? null : "perChi")}
              aria-expanded={activeDropdown === "perChi"}
              aria-haspopup="menu"
              className={triggerClass("perChi")}
            >
              Per chi
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform duration-200 ${
                  activeDropdown === "perChi" ? "rotate-180" : ""
                }`}
              />
            </button>

            {/* RISORSE */}
            <button
              type="button"
              onMouseEnter={() => openWithIntent("risorse")}
              onMouseLeave={scheduleClose}
              onClick={() => setActiveDropdown(activeDropdown === "risorse" ? null : "risorse")}
              aria-expanded={activeDropdown === "risorse"}
              aria-haspopup="menu"
              className={triggerClass("risorse")}
            >
              Risorse
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform duration-200 ${
                  activeDropdown === "risorse" ? "rotate-180" : ""
                }`}
              />
            </button>

            {/* CONFRONTO */}
            <button
              type="button"
              onMouseEnter={() => openWithIntent("confronto")}
              onMouseLeave={scheduleClose}
              onClick={() => setActiveDropdown(activeDropdown === "confronto" ? null : "confronto")}
              aria-expanded={activeDropdown === "confronto"}
              aria-haspopup="menu"
              className={triggerClass("confronto")}
            >
              Confronto
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform duration-200 ${
                  activeDropdown === "confronto" ? "rotate-180" : ""
                }`}
              />
            </button>

            {/* PREZZI (single link) */}
            <Link to="/prezzi/" className={linkClass(location.pathname === "/prezzi")}>
              Piani
            </Link>
          </div>

          {/* Right side CTAs */}
          <div className="hidden lg:flex items-center gap-3">
            <a
              href={getSubdomainUrl("/login", "app")}
              className={`px-5 py-2 rounded-full text-sm font-medium transition-colors border ${
                isWhiteBg
                  ? "border-[#111111]/15 text-[#111111] hover:border-[#111111]/40"
                  : "border-white/40 text-white hover:border-white"
              }`}
            >
              Accedi
            </a>
            <Link
              to="/demo/"
              className="px-5 py-2.5 rounded-full bg-[#F97415] text-white text-sm font-bold hover:bg-[#C94F06] transition-colors shadow-lg shadow-[#F97415]/20"
            >
              Richiedi una demo
            </Link>
          </div>

          {/* Mobile toggle */}
          <button
            type="button"
            className={`lg:hidden ${isWhiteBg ? "text-[#111111]" : "text-white"}`}
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label={mobileOpen ? "Chiudi menu di navigazione" : "Apri menu di navigazione"}
            aria-expanded={mobileOpen}
            aria-controls="landing-mobile-menu"
          >
            {mobileOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* ─────────────────── DESKTOP MEGA-MENU PANELS ─────────────────── */}
        {/* Piattaforma — 4 cols + Render AI sidebar */}
        {activeDropdown === "piattaforma" && (
          <div
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
            className="hidden lg:block absolute top-full left-0 right-0 bg-white border-t border-gray-100 shadow-2xl"
            role="menu"
          >
            <div className="max-w-7xl mx-auto px-6 py-8">
              <div className="grid grid-cols-12 gap-8">
                {/* 4 main columns */}
                {piattaformaColumns.map((col) => (
                  <div key={col.heading} className="col-span-2">
                    <p className="text-[10px] font-bold tracking-widest text-[#111111]/50 mb-4">
                      {col.heading}
                    </p>
                    <ul className="space-y-1">
                      {col.items.map((item) => (
                        <li key={`${col.heading}-${item.label}`}>
                          <Link
                            to={item.to}
                            className="group flex items-start gap-2.5 rounded-lg px-2 py-2 -mx-2 hover:bg-[#F97415]/5 transition-colors"
                          >
                            <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-md bg-gray-50 text-[#111111] group-hover:bg-[#F97415]/10 group-hover:text-[#F97415] transition-colors">
                              <item.icon className="h-3.5 w-3.5" />
                            </span>
                            <span className="flex-1 min-w-0">
                              <span className="flex items-center gap-1.5">
                                <span className="text-[13px] font-semibold text-[#111111] leading-tight">
                                  {item.label}
                                </span>
                                {item.badge && (
                                  <span className="text-[9px] font-bold bg-[#F97415] text-white px-1.5 py-0.5 rounded-full leading-none">
                                    {item.badge}
                                  </span>
                                )}
                              </span>
                              {item.desc && (
                                <span className="block text-[11px] text-[#111111]/55 mt-0.5 leading-tight">
                                  {item.desc}
                                </span>
                              )}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}

                {/* Render AI sidebar */}
                <div className="col-span-4 bg-gradient-to-br from-[#F97415]/5 to-[#F97415]/10 rounded-2xl p-5 border border-[#F97415]/10">
                  <p className="text-[10px] font-bold tracking-widest text-[#F97415] mb-4 flex items-center gap-1.5">
                    <Sparkles className="h-3 w-3" />
                    {piattaformaSidebar.heading}
                  </p>
                  <p className="text-[12px] text-[#111111]/70 mb-4 leading-snug">
                    Trasforma la foto del cliente in un prima/dopo realistico. Vendi di più, anche a distanza.
                  </p>
                  <ul className="grid grid-cols-2 gap-1">
                    {piattaformaSidebar.items.map((item) => (
                      <li key={item.label}>
                        <Link
                          to={item.to}
                          className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white transition-colors"
                        >
                          <item.icon className="h-3.5 w-3.5 text-[#F97415] flex-shrink-0" />
                          <span className="text-[12px] font-medium text-[#111111] truncate">
                            {item.label}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Bottom CTA strip */}
              <div className="mt-7 pt-5 border-t border-gray-100 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-[#111111]">
                    Tutto il software edilizia in un unico posto.
                  </p>
                  <p className="text-xs text-[#111111]/55">
                    51 funzionalità integrate. Setup in 48 ore. Cancelli quando vuoi.
                  </p>
                </div>
                <Link
                  to="/funzionalita/"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#111111] text-white text-sm font-semibold hover:bg-[#F97415] transition-colors"
                >
                  Tutte le funzionalità
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Per chi — 2 cols + partnership sidebar */}
        {activeDropdown === "perChi" && (
          <div
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
            className="hidden lg:block absolute top-full left-0 right-0 bg-white border-t border-gray-100 shadow-2xl"
            role="menu"
          >
            <div className="max-w-7xl mx-auto px-6 py-8">
              <div className="grid grid-cols-12 gap-8">
                {perChiColumns.map((col, idx) => (
                  <div key={col.heading} className={idx === 0 ? "col-span-3" : "col-span-5"}>
                    <p className="text-[10px] font-bold tracking-widest text-[#111111]/50 mb-4">
                      {col.heading}
                    </p>
                    <ul className="space-y-1">
                      {col.items.map((item) => (
                        <li key={`${col.heading}-${item.label}`}>
                          <Link
                            to={item.to}
                            className="group flex items-start gap-2.5 rounded-lg px-2 py-2 -mx-2 hover:bg-[#F97415]/5 transition-colors"
                          >
                            <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-md bg-gray-50 text-[#111111] group-hover:bg-[#F97415]/10 group-hover:text-[#F97415] transition-colors">
                              <item.icon className="h-4 w-4" />
                            </span>
                            <span className="flex-1 min-w-0">
                              <span className="block text-sm font-semibold text-[#111111] leading-tight">
                                {item.label}
                              </span>
                              {item.desc && (
                                <span className="block text-[12px] text-[#111111]/55 mt-0.5 leading-tight">
                                  {item.desc}
                                </span>
                              )}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}

                {/* Partnership sidebar */}
                <div className="col-span-4 bg-gray-50 rounded-2xl p-5 border border-gray-100">
                  <p className="text-[10px] font-bold tracking-widest text-[#111111]/60 mb-4">
                    {perChiSidebar.heading}
                  </p>
                  <ul className="space-y-2">
                    {perChiSidebar.items.map((item) => (
                      <li key={item.label}>
                        <Link
                          to={item.to}
                          className="group flex items-start gap-2.5 rounded-lg p-2 hover:bg-white transition-colors"
                        >
                          <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-md bg-white text-[#111111] group-hover:text-[#F97415]">
                            <item.icon className="h-4 w-4" />
                          </span>
                          <span className="flex-1">
                            <span className="block text-sm font-semibold text-[#111111] leading-tight">
                              {item.label}
                            </span>
                            {item.desc && (
                              <span className="block text-[12px] text-[#111111]/55 mt-0.5 leading-tight">
                                {item.desc}
                              </span>
                            )}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Bottom CTA strip */}
              <div className="mt-7 pt-5 border-t border-gray-100 flex items-center justify-between">
                <p className="text-sm font-semibold text-[#111111]">
                  Scelto da 150+ imprese edili italiane.
                </p>
                <Link
                  to="/casi-studio/"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#111111] text-white text-sm font-semibold hover:bg-[#F97415] transition-colors"
                >
                  Leggi le storie dei nostri clienti
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Risorse — 3 cols + newsletter sidebar */}
        {activeDropdown === "risorse" && (
          <div
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
            className="hidden lg:block absolute top-full left-0 right-0 bg-white border-t border-gray-100 shadow-2xl"
            role="menu"
          >
            <div className="max-w-7xl mx-auto px-6 py-8">
              <div className="grid grid-cols-12 gap-8">
                {risorseColumns.map((col) => (
                  <div key={col.heading} className="col-span-3">
                    <p className="text-[10px] font-bold tracking-widest text-[#111111]/50 mb-4">
                      {col.heading}
                    </p>
                    <ul className="space-y-1">
                      {col.items.map((item) => (
                        <li key={`${col.heading}-${item.label}`}>
                          <Link
                            to={item.to}
                            className="group flex items-start gap-2.5 rounded-lg px-2 py-2 -mx-2 hover:bg-[#F97415]/5 transition-colors"
                          >
                            <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-md bg-gray-50 text-[#111111] group-hover:bg-[#F97415]/10 group-hover:text-[#F97415] transition-colors">
                              <item.icon className="h-4 w-4" />
                            </span>
                            <span className="flex-1 min-w-0">
                              <span className="block text-sm font-semibold text-[#111111] leading-tight">
                                {item.label}
                              </span>
                              {item.desc && (
                                <span className="block text-[12px] text-[#111111]/55 mt-0.5 leading-tight">
                                  {item.desc}
                                </span>
                              )}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}

                {/* Newsletter card */}
                <div className="col-span-3 bg-[#FFF4EC] rounded-2xl p-5 border border-[#F97415]/15 flex flex-col">
                  <div className="flex-1">
                    <div className="text-3xl font-black text-[#111111] leading-none mb-1">
                      COSE
                    </div>
                    <div className="text-[10px] font-bold tracking-widest text-[#F97415] mb-4">
                      DI EDILIZIA IN CLOUD
                    </div>
                    <p className="text-sm font-bold text-[#111111] mb-2 leading-snug">
                      Cosa fanno le migliori imprese edili in Italia?
                    </p>
                    <p className="text-[12px] text-[#111111]/65 leading-snug mb-4">
                      Ogni 2 settimane riceverai benchmark, casi reali e novità normative dal mondo edilizia.
                    </p>
                  </div>
                  <Link
                    to="/blog/"
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-full bg-white border border-[#111111]/10 text-sm font-semibold text-[#111111] hover:border-[#F97415] hover:text-[#F97415] transition-colors"
                  >
                    Iscriviti
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Confronto — 1 column */}
        {activeDropdown === "confronto" && (
          <div
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
            className="hidden lg:block absolute top-full left-0 right-0 bg-white border-t border-gray-100 shadow-2xl"
            role="menu"
          >
            <div className="max-w-7xl mx-auto px-6 py-8">
              <div className="grid grid-cols-12 gap-8">
                {confrontoColumns.map((col) => (
                  <div key={col.heading} className="col-span-7">
                    <p className="text-[10px] font-bold tracking-widest text-[#111111]/50 mb-4">
                      {col.heading}
                    </p>
                    <ul className="grid grid-cols-2 gap-1">
                      {col.items.map((item) => (
                        <li key={`${col.heading}-${item.label}`}>
                          <Link
                            to={item.to}
                            className="group flex items-start gap-2.5 rounded-lg px-2 py-2 -mx-2 hover:bg-[#F97415]/5 transition-colors"
                          >
                            <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-md bg-gray-50 text-[#111111] group-hover:bg-[#F97415]/10 group-hover:text-[#F97415] transition-colors">
                              <item.icon className="h-4 w-4" />
                            </span>
                            <span className="flex-1 min-w-0">
                              <span className="block text-sm font-semibold text-[#111111] leading-tight">
                                {item.label}
                              </span>
                              {item.desc && (
                                <span className="block text-[12px] text-[#111111]/55 mt-0.5 leading-tight">
                                  {item.desc}
                                </span>
                              )}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}

                <div className="col-span-5 bg-gray-50 rounded-2xl p-5 border border-gray-100 flex flex-col justify-between">
                  <div>
                    <p className="text-sm font-bold text-[#111111] mb-2 leading-snug">
                      Pensi di passare da un altro software?
                    </p>
                    <p className="text-[12px] text-[#111111]/65 leading-snug mb-4">
                      Migrazione gratuita assistita: importiamo cantieri, anagrafiche, fatture e archivio storico. Setup in 48 ore.
                    </p>
                  </div>
                  <Link
                    to="/pianifica-migrazione/"
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-full bg-[#F97415] text-white text-sm font-semibold hover:bg-[#C94F06] transition-colors"
                  >
                    Pianifica la migrazione
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* Backdrop while a dropdown is open */}
      {activeDropdown !== null && (
        <div
          aria-hidden
          className="hidden lg:block fixed inset-0 top-[72px] bg-black/10 z-40"
          onClick={() => setActiveDropdown(null)}
        />
      )}

      {/* ─────────────────── MOBILE MENU ─────────────────── */}
      {mobileOpen && (
        <div
          id="landing-mobile-menu"
          className="lg:hidden fixed inset-0 top-[68px] z-40 bg-white overflow-y-auto"
        >
          <div className="px-6 py-4 space-y-1">
            {/* Piattaforma accordion */}
            <MobileAccordion
              label="Piattaforma"
              isOpen={mobileSection === "piattaforma"}
              onToggle={() =>
                setMobileSection(mobileSection === "piattaforma" ? null : "piattaforma")
              }
            >
              {[...piattaformaColumns, piattaformaSidebar].map((col) => (
                <div key={col.heading} className="mt-3 first:mt-0">
                  <p className="text-[10px] font-bold tracking-widest text-[#111111]/50 mb-2">
                    {col.heading}
                  </p>
                  <ul className="space-y-0.5">
                    {col.items.map((item) => (
                      <li key={`m-${col.heading}-${item.label}`}>
                        <Link
                          to={item.to}
                          onClick={() => setMobileOpen(false)}
                          className="flex items-center gap-2 py-1.5 text-[13px] text-[#111111]/80 hover:text-[#F97415]"
                        >
                          <item.icon className="h-3.5 w-3.5 text-[#111111]/40 flex-shrink-0" />
                          <span>{item.label}</span>
                          {item.badge && (
                            <span className="text-[9px] font-bold bg-[#F97415] text-white px-1.5 py-0.5 rounded-full leading-none">
                              {item.badge}
                            </span>
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <Link
                to="/funzionalita/"
                onClick={() => setMobileOpen(false)}
                className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#F97415]"
              >
                Tutte le funzionalità →
              </Link>
            </MobileAccordion>

            {/* Per chi accordion */}
            <MobileAccordion
              label="Per chi"
              isOpen={mobileSection === "perChi"}
              onToggle={() => setMobileSection(mobileSection === "perChi" ? null : "perChi")}
            >
              {[...perChiColumns, perChiSidebar].map((col) => (
                <div key={col.heading} className="mt-3 first:mt-0">
                  <p className="text-[10px] font-bold tracking-widest text-[#111111]/50 mb-2">
                    {col.heading}
                  </p>
                  <ul className="space-y-0.5">
                    {col.items.map((item) => (
                      <li key={`m-${col.heading}-${item.label}`}>
                        <Link
                          to={item.to}
                          onClick={() => setMobileOpen(false)}
                          className="flex items-center gap-2 py-1.5 text-[13px] text-[#111111]/80 hover:text-[#F97415]"
                        >
                          <item.icon className="h-3.5 w-3.5 text-[#111111]/40 flex-shrink-0" />
                          <span>{item.label}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </MobileAccordion>

            {/* Risorse accordion */}
            <MobileAccordion
              label="Risorse"
              isOpen={mobileSection === "risorse"}
              onToggle={() => setMobileSection(mobileSection === "risorse" ? null : "risorse")}
            >
              {risorseColumns.map((col) => (
                <div key={col.heading} className="mt-3 first:mt-0">
                  <p className="text-[10px] font-bold tracking-widest text-[#111111]/50 mb-2">
                    {col.heading}
                  </p>
                  <ul className="space-y-0.5">
                    {col.items.map((item) => (
                      <li key={`m-${col.heading}-${item.label}`}>
                        <Link
                          to={item.to}
                          onClick={() => setMobileOpen(false)}
                          className="flex items-center gap-2 py-1.5 text-[13px] text-[#111111]/80 hover:text-[#F97415]"
                        >
                          <item.icon className="h-3.5 w-3.5 text-[#111111]/40 flex-shrink-0" />
                          <span>{item.label}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </MobileAccordion>

            {/* Confronto accordion */}
            <MobileAccordion
              label="Confronto"
              isOpen={mobileSection === "confronto"}
              onToggle={() => setMobileSection(mobileSection === "confronto" ? null : "confronto")}
            >
              {confrontoColumns.map((col) => (
                <div key={col.heading} className="mt-3 first:mt-0">
                  <p className="text-[10px] font-bold tracking-widest text-[#111111]/50 mb-2">
                    {col.heading}
                  </p>
                  <ul className="space-y-0.5">
                    {col.items.map((item) => (
                      <li key={`m-${col.heading}-${item.label}`}>
                        <Link
                          to={item.to}
                          onClick={() => setMobileOpen(false)}
                          className="flex items-center gap-2 py-1.5 text-[13px] text-[#111111]/80 hover:text-[#F97415]"
                        >
                          <item.icon className="h-3.5 w-3.5 text-[#111111]/40 flex-shrink-0" />
                          <span>{item.label}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </MobileAccordion>

            {/* Direct links */}
            <Link
              to="/prezzi/"
              onClick={() => setMobileOpen(false)}
              className="block py-3 font-semibold border-b border-gray-100 text-[#111111]"
            >
              Piani
            </Link>

            <div className="pt-4 space-y-2">
              <a
                href={getSubdomainUrl("/login", "app")}
                onClick={() => setMobileOpen(false)}
                className="block py-2.5 text-center text-[#111111] font-medium border border-[#111111]/15 rounded-full"
              >
                Accedi
              </a>
              <Link
                to="/demo/"
                onClick={() => setMobileOpen(false)}
                className="block py-3 text-center text-white font-bold bg-[#F97415] rounded-full shadow-lg shadow-[#F97415]/20"
              >
                Richiedi una demo
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─────────────────── Mobile accordion sub-component ───────────────────
function MobileAccordion({
  label,
  isOpen,
  onToggle,
  children,
}: {
  label: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-gray-100">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="w-full flex items-center justify-between py-3 font-semibold text-[#111111]"
      >
        <span>{label}</span>
        <ChevronDown
          className={`w-4 h-4 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>
      {isOpen && <div className="pb-4 pl-1">{children}</div>}
    </div>
  );
}
