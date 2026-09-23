import type { ReactElement } from "react";
import { useSEO } from "@/hooks/useSEO";
import { JsonLd } from "@/components/seo/JsonLd";
import { Link } from "react-router-dom";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";
import StickyBottomBar from "@/components/landing/StickyBottomBar";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import {
  CheckCircle2, ArrowRight, Star, TrendingUp, Clock, Shield,
  ChevronDown, ChevronUp, XCircle, Zap,
} from "lucide-react";
import { useState, useEffect } from "react";
import type { LucideIcon } from "lucide-react";
import { blogPosts } from "@/data/blogPosts";
import { BlogCover } from "@/components/blog/BlogCover";
import type { JSX } from "react";

// ── Catalogo settori per cross-linking ──────────────────────────────────────
const ALL_SECTORS = [
  { slug: "/per/imprese-edili",        label: "Imprese di Costruzione", emoji: "🏗️" },
  { slug: "/per/impiantisti",          label: "Impiantisti",            emoji: "⚡" },
  { slug: "/per/ristrutturatori",      label: "Ristrutturatori",        emoji: "🔨" },
  { slug: "/per/fotovoltaico",         label: "Fotovoltaico",           emoji: "☀️" },
  { slug: "/per/serramentisti",        label: "Serramentisti",          emoji: "🪟" },
  { slug: "/per/piccole-imprese",      label: "Piccole Imprese",        emoji: "🧱" },
  { slug: "/per/medie-imprese",        label: "Medie Imprese",          emoji: "🏢" },
  { slug: "/per/grandi-imprese",       label: "Grandi Imprese",         emoji: "🏭" },
  { slug: "/per/commercialista-edilizia", label: "Commercialisti",      emoji: "📊" },
];

// Mappa seoCanonical → categorie blog pertinenti per "Leggi anche"
const SECTOR_BLOG_CATEGORIES: Record<string, string[]> = {
  "/per/imprese-edili": ["Gestione Cantieri", "Finanza"],
  "/per/impiantisti":          ["Gestione Cantieri", "HR & Personale"],
  "/per/ristrutturatori":      ["Gestione Cantieri", "Commerciale"],
  "/per/fotovoltaico":         ["Finanza", "Gestione Cantieri"],
  "/per/serramentisti":        ["Commerciale", "Gestione Cantieri"],
  "/per/piccole-imprese":      ["Digitalizzazione", "Finanza"],
  "/per/medie-imprese":        ["Gestione Cantieri", "Finanza"],
  "/per/grandi-imprese":       ["Gestione Cantieri", "Digitalizzazione"],
  "/per/commercialista-edilizia": ["Finanza", "Digitalizzazione"],
};


export interface ModuleItem {
  icon: LucideIcon;
  name: string;
  desc: string;
  saving: string;
}

export interface ProblemItem {
  emoji: string;
  title: string;
  desc: string;
}

export interface CaseStudy {
  company: string;
  city: string;
  sector: string;
  revenue: string;
  person: string;
  role: string;
  initials: string;
  gradient: string;
  quote: string;
  metrics: Array<{ label: string; before: string; after: string }>;
  image?: string;
}

export interface FaqItem {
  q: string;
  a: string;
}

export interface VerticalFeature {
  icon: LucideIcon;
  problem: string;
  solution: string;
  economicBenefit: string;
  benefitLabel: string;
}

export interface RoiData {
  lossValue: string;
  lossLabel: string;
  wasteValue: string;
  wasteLabel: string;
  errorValue: string;
  errorLabel: string;
  totalLoss: string;
  softwareCost: string;
  roiX: string;
}

export interface PerTipoConfig {
  // SEO
  seoTitle: string;
  seoDescription: string;
  seoKeywords: string;
  seoCanonical: string;
  // Hero
  badge: string;
  heroTitle: ReactElement;
  heroSubtitle: string;
  heroImage: string;
  // Social proof strip
  socialProof: Array<{ initials: string; name: string; city: string; months: number; gradient: string }>;
  // Problems
  problemsTitle: string;
  problemsSubtitle: string;
  problems: ProblemItem[];
  // ROI calculator
  roi: RoiData;
  // Transformation before/after
  transformation: {
    title: string;
    subtitle: string;
    fromTitle: string;
    fromItems: string[];
    toTitle: string;
    toItems: string[];
  };
  // Stats
  stats: Array<{ value: string; label: string; sublabel: string }>;
  // Modules
  modulesTitle: string;
  modulesSubtitle: string;
  modules: ModuleItem[];
  // Case study
  caseStudy: CaseStudy;
  // FAQ
  faq: FaqItem[];
  // CTA
  ctaTitle: ReactElement;
  ctaSubtitle: string;
  // Vertical features — required on all pages
  verticalFeatures: VerticalFeature[];
  verticalFeaturesTitle?: string;
  verticalFeaturesSubtitle?: string;
  // CTA customization
  demoLabel?: string;
  // Sezione AI (opzionale): Silvio declinato sul verticale — cosa fa
  // l'AI da sola per questo tipo di azienda. Render solo se presente.
  aiShowcase?: {
    title: string;
    subtitle: string;
    actions: Array<{ icon: LucideIcon; title: string; desc: string; tag: string }>;
    note?: string;
  };
  // Sezione ampiezza piattaforma (opzionale): "non è solo X" — tutti gli
  // altri moduli inclusi che il verticale dà per scontati.
  platformExtra?: {
    title: string;
    subtitle: string;
    items: Array<{ icon: LucideIcon; name: string; desc: string }>;
  };
  // Schema
  schemaFaq: Array<{ q: string; a: string }>;
}

function FaqAccordion({ item }: { item: FaqItem }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-gray-200 rounded-2xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-6 py-5 text-left hover:bg-gray-50 transition-colors"
        onClick={() => setOpen(!open)}
      >
        <span className="font-semibold text-[#111111] text-sm md:text-base pr-4">{item.q}</span>
        {open
          ? <ChevronUp className="w-5 h-5 text-[#F97415] shrink-0" />
          : <ChevronDown className="w-5 h-5 text-[#F97415] shrink-0" />}
      </button>
      {open && (
        <div className="px-6 pb-5 border-t border-gray-100">
          <p className="text-gray-600 text-sm leading-relaxed pt-4">{item.a}</p>
        </div>
      )}
    </div>
  );
}

function useCountUp(end: number, duration: number, trigger: boolean): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!trigger) return;
    let frame = 0;
    const totalFrames = Math.round(duration / 16);
    const increment = end / totalFrames;
    const timer = setInterval(() => {
      frame++;
      const next = Math.round(increment * frame);
      if (frame >= totalFrames) {
        setCount(end);
        clearInterval(timer);
      } else {
        setCount(next);
      }
    }, 16);
    return () => clearInterval(timer);
  }, [trigger, end, duration]);
  return count;
}

function parseStatValue(value: string): { prefix: string; num: number; suffix: string } {
  const match = value.match(/^([^0-9]*)(\d+(?:\.\d+)?)([^0-9]*)$/);
  if (!match) return { prefix: "", num: 0, suffix: value };
  return { prefix: match[1], num: parseFloat(match[2]), suffix: match[3] };
}

function StatCounter({ value, trigger }: { value: string; trigger: boolean }) {
  const parsed = parseStatValue(value);
  const count = useCountUp(parsed.num, 1800, trigger);
  if (parsed.num === 0) return <>{value}</>;
  return <>{parsed.prefix}{count}{parsed.suffix}</>;
}

export default function PerTipoPageTemplate({ config }: { config: PerTipoConfig }) {
  const heroAnim = useScrollAnimation();
  const socialAnim = useScrollAnimation({ threshold: 0.1 });
  const problemsAnim = useScrollAnimation();
  const featuresAnim = useScrollAnimation();
  const roiAnim = useScrollAnimation();
  const transAnim = useScrollAnimation();
  const statsAnim = useScrollAnimation({ threshold: 0.2 });
  const modulesAnim = useScrollAnimation();
  const aiAnim = useScrollAnimation();
  const extraAnim = useScrollAnimation({ threshold: 0.1 });
  const caseAnim = useScrollAnimation();
  const garantieAnim = useScrollAnimation();
  const faqAnim = useScrollAnimation();

  const [scrollY, setScrollY] = useState(0);
  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useSEO({
    title: config.seoTitle,
    description: config.seoDescription,
    canonical: config.seoCanonical,
    keywords: config.seoKeywords,
  });

  const cs = config.caseStudy;
  const breadcrumbId = `jsonld-breadcrumb-${config.seoCanonical.replace(/\//g, "-")}`;
  const faqId = `jsonld-faq-${config.seoCanonical.replace(/\//g, "-")}`;

  return (
    <div className="min-h-screen bg-white text-[#111111] pb-24 overflow-x-hidden">
      <JsonLd id={breadcrumbId} data={{
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.ediliziaincloud.com/" },
          { "@type": "ListItem", "position": 2, "name": "Dedicato a", "item": "https://www.ediliziaincloud.com/" },
          { "@type": "ListItem", "position": 3, "name": config.badge, "item": `https://www.ediliziaincloud.com${config.seoCanonical}` },
        ]
      }} />
      <JsonLd id={`jsonld-service-${config.seoCanonical.replace(/\//g, "-")}`} data={{
        "@context": "https://schema.org",
        "@type": "Service",
        "@id": `https://www.ediliziaincloud.com${config.seoCanonical}`,
        "name": config.seoTitle,
        "serviceType": "Software Gestionale Edilizia",
        "description": config.seoDescription,
        "url": `https://www.ediliziaincloud.com${config.seoCanonical}`,
        "provider": { "@id": "https://www.ediliziaincloud.com/#organization" },
        "areaServed": { "@type": "Country", "name": "Italia" },
        "hasOfferCatalog": {
          "@type": "OfferCatalog",
          "name": "Piani Edilizia in Cloud",
          "itemListElement": [
            { "@type": "Offer", "name": "Gestionale", "price": 127, "priceCurrency": "EUR", "url": "https://www.ediliziaincloud.com/prezzi" },
            { "@type": "Offer", "name": "Professionista", "price": 247, "priceCurrency": "EUR", "url": "https://www.ediliziaincloud.com/prezzi" },
            { "@type": "Offer", "name": "Impresa AI", "price": 547, "priceCurrency": "EUR", "url": "https://www.ediliziaincloud.com/prezzi" }
          ]
        }
      }} />
      {/* FAQPage schema per snippet "People Also Ask" e citabilità AI Overviews.
          faqId era già declarato ma mai emesso — il blocco JsonLd è stato
          ricostruito dall'array config.faq (domanda/risposta). */}
      {config.faq.length > 0 && (
        <JsonLd id={faqId} data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          "mainEntity": config.faq.map((item) => ({
            "@type": "Question",
            "name": item.q,
            "acceptedAnswer": {
              "@type": "Answer",
              "text": item.a,
            },
          })),
        }} />
      )}

      <LandingNavbar />

      {/* ── HERO ── */}
      <style>{`
        @keyframes float { 0%,100%{transform:translateY(0px)} 50%{transform:translateY(-20px)} }
        @keyframes float2 { 0%,100%{transform:translateY(0px)} 50%{transform:translateY(-14px)} }
        @keyframes float3 { 0%,100%{transform:translateY(0px)} 50%{transform:translateY(-10px)} }
        .hero-particle-1{animation:float 7s ease-in-out infinite}
        .hero-particle-2{animation:float2 5s ease-in-out infinite 1s}
        .hero-particle-3{animation:float3 9s ease-in-out infinite 2s}
      `}</style>
      <section className="relative overflow-hidden pt-20 md:pt-32 pb-16 md:pb-28 bg-[#0d0d0d]">
        {/* Background image with parallax */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-[0.13]"
          style={{ backgroundImage: `url(${config.heroImage})`, transform: `translateY(${scrollY * 0.25}px)` }}
        />
        {/* Gradient overlay */}
        <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(13,13,13,0.3) 0%, rgba(13,13,13,0.8) 60%, rgba(13,13,13,1) 100%)" }} />
        {/* Glow orbs */}
        <div className="absolute top-0 left-0 right-0 h-px" style={{ background: "linear-gradient(90deg, transparent 0%, rgba(249,116,21,0.8) 40%, rgba(249,116,21,1) 50%, rgba(249,116,21,0.8) 60%, transparent 100%)" }} />
        <div className="absolute top-10 right-0 w-[600px] h-[600px] rounded-full blur-[160px] pointer-events-none" style={{ background: "radial-gradient(circle, rgba(249,116,21,0.20) 0%, transparent 65%)" }} />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full blur-[130px] pointer-events-none" style={{ background: "radial-gradient(circle, rgba(249,116,21,0.14) 0%, transparent 65%)" }} />
        {/* Floating particle orbs */}
        <div className="hero-particle-1 absolute top-[15%] left-[8%] w-3 h-3 rounded-full bg-[#F97415]/40 blur-sm pointer-events-none" />
        <div className="hero-particle-2 absolute top-[30%] right-[12%] w-2 h-2 rounded-full bg-[#F97415]/30 blur-sm pointer-events-none" />
        <div className="hero-particle-3 absolute bottom-[20%] left-[20%] w-4 h-4 rounded-full bg-[#F97415]/20 blur-md pointer-events-none" />

        <div ref={heroAnim.ref as React.RefObject<HTMLDivElement>} className="relative z-10 max-w-4xl mx-auto px-6 text-center">
          <div className={`transition-all duration-700 ${heroAnim.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
            <span className="inline-flex items-center gap-2 mb-6 px-4 py-2 rounded-full border border-[#F97415]/40 bg-[#F97415]/10 text-[#C2410C] text-xs font-bold uppercase tracking-widest">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-ping flex-shrink-0" />
              {config.badge}
            </span>
          </div>
          <div className={`transition-all duration-700 delay-100 ${heroAnim.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
            <h1 className="text-3xl sm:text-4xl md:text-6xl font-extrabold text-white leading-tight mb-6">
              {config.heroTitle}
            </h1>
          </div>
          <div className={`transition-all duration-700 delay-200 ${heroAnim.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
            <p className="text-white/65 text-base md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
              {config.heroSubtitle}
            </p>
          </div>
          <div className={`flex flex-col sm:flex-row items-center justify-center gap-4 transition-all duration-700 delay-300 ${heroAnim.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
            <Link to="/demo/" className="w-full sm:w-auto px-8 py-4 rounded-full bg-[#F97415] text-white font-bold text-lg hover:bg-[#e8650e] hover:scale-105 transition-all shadow-lg shadow-[#F97415]/30">
              Prova Gratis 31 Giorni →
            </Link>
            <Link to="/prezzi/" className="w-full sm:w-auto px-8 py-4 rounded-full border border-white/20 text-white font-semibold hover:bg-white/5 hover:border-white/40 transition-all">
              Vedi i Prezzi
            </Link>
          </div>
          <div className={`flex flex-wrap items-center justify-center gap-6 mt-8 transition-all duration-700 delay-400 ${heroAnim.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
            {[
              { Icon: Star, label: "4.9/5 stelle · 150+ imprese" },
              { Icon: Clock, label: "Setup completo in 48h" },
              { Icon: Shield, label: "GDPR" },
            ].map(({ Icon, label }, i) => (
              <span key={i} className="flex items-center gap-2 text-white/45 text-sm">
                <Icon size={14} className="text-[#F97415] flex-shrink-0" />
                {label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── SOCIAL PROOF STRIP ── */}
      <section ref={socialAnim.ref as React.RefObject<HTMLDivElement>} className="py-8 bg-white border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-6">
          <p className={`text-center text-xs font-bold uppercase tracking-widest text-gray-400 mb-5 transition-all duration-700 ${socialAnim.isVisible ? "opacity-100" : "opacity-0"}`}>
            Già scelto da imprese come la tua
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {config.socialProof.map((badge, i) => (
              <div
                key={i}
                className={`flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-xl p-3 transition-all duration-700 ${socialAnim.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
                style={{ transitionDelay: `${i * 80}ms` }}
              >
                <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${badge.gradient} flex items-center justify-center text-white font-bold text-xs flex-shrink-0`}>
                  {badge.initials}
                </div>
                <div className="min-w-0">
                  <p className="text-[#111111] font-semibold text-xs leading-tight line-clamp-2">{badge.name}</p>
                  <p className="text-gray-400 text-[10px]">{badge.city} · {badge.months} mesi</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PROBLEMS "TI RICONOSCI?" ── */}
      <section className="py-16 md:py-24 bg-[#f8f9fa]">
        <div ref={problemsAnim.ref as React.RefObject<HTMLDivElement>} className="max-w-4xl mx-auto px-6">
          <div className={`text-center mb-12 transition-all duration-700 ${problemsAnim.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
            <span className="inline-block mb-3 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest text-[#111111]/60 bg-gray-200">
              Ti riconosci?
            </span>
            <h2 className="text-2xl md:text-4xl font-extrabold text-[#111111] mb-3">{config.problemsTitle}</h2>
            <p className="text-gray-500 text-base md:text-lg">{config.problemsSubtitle}</p>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {config.problems.map((p, i) => (
              <div
                key={i}
                className={`relative flex gap-4 p-5 md:p-6 rounded-2xl bg-white border border-gray-200 hover:border-[#F97415]/30 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 ${problemsAnim.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
                style={{ transitionDelay: `${150 + i * 80}ms` }}
              >
                <span className="absolute top-3 right-4 text-[42px] font-extrabold text-gray-100 leading-none pointer-events-none select-none">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-2xl flex-shrink-0 mt-0.5 relative z-10">{p.emoji}</span>
                <div className="relative z-10">
                  <h3 className="text-[#111111] font-bold text-sm md:text-base mb-1">{p.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{p.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div className={`text-center mt-8 transition-all duration-700 delay-500 ${problemsAnim.isVisible ? "opacity-100" : "opacity-0"}`}>
            <p className="text-gray-400 text-sm">
              Se hai risposto "sì" anche solo a uno, continua a leggere. →
            </p>
          </div>
        </div>
      </section>

      {/* ── FEATURES VERTICALI (optional) ── */}
      {config.verticalFeatures && config.verticalFeatures.length > 0 && (
        <section className="py-16 md:py-28 bg-white">
          <div ref={featuresAnim.ref as React.RefObject<HTMLDivElement>} className="max-w-5xl mx-auto px-6">
            <div className={`text-center mb-14 transition-all duration-700 ${featuresAnim.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
              <span className="inline-block mb-3 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest text-[#C2410C] bg-[#F97415]/10 border border-[#F97415]/20">
                Funzionalità per il tuo settore
              </span>
              <h2 className="text-2xl md:text-4xl font-extrabold text-[#111111] mb-3">
                {config.verticalFeaturesTitle ?? "Non un gestionale generico. Il tuo."}
              </h2>
              <p className="text-gray-500 text-lg max-w-2xl mx-auto">
                {config.verticalFeaturesSubtitle ?? "Ogni funzionalità è stata costruita attorno a come lavora davvero la tua impresa — non attorno a come funziona il software."}
              </p>
            </div>
            <div className="space-y-6">
              {config.verticalFeatures.map((feat, i) => (
                <div
                  key={i}
                  className={`grid md:grid-cols-12 gap-0 rounded-2xl border border-gray-200 overflow-hidden hover:border-[#F97415]/30 hover:shadow-lg transition-all duration-500 ${featuresAnim.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
                  style={{ transitionDelay: `${150 + i * 100}ms` }}
                >
                  {/* Left: icon + problem */}
                  <div className="md:col-span-3 bg-[#f8f9fa] p-6 md:p-8 flex flex-col items-start justify-center gap-4 border-b md:border-b-0 md:border-r border-gray-200">
                    <div className="w-12 h-12 rounded-xl bg-[#F97415]/10 flex items-center justify-center">
                      <feat.icon className="w-6 h-6 text-[#F97415]" />
                    </div>
                    <p className="text-[#111111] font-extrabold text-sm uppercase tracking-wide leading-snug">
                      {feat.problem}
                    </p>
                  </div>
                  {/* Center: solution */}
                  <div className="md:col-span-6 p-6 md:p-8 flex items-center">
                    <p className="text-gray-600 text-sm md:text-base leading-relaxed">{feat.solution}</p>
                  </div>
                  {/* Right: economic benefit */}
                  <div className="md:col-span-3 bg-[#111111] p-6 md:p-8 flex flex-col items-center justify-center text-center gap-2">
                    <p className="text-[#F97415] text-2xl md:text-3xl font-extrabold">{feat.economicBenefit}</p>
                    <p className="text-white/50 text-xs uppercase tracking-widest">{feat.benefitLabel}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── ROI — QUANTO STAI PERDENDO ── */}
      <section className="py-16 md:py-24 bg-[#111111] relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-px" style={{ background: "linear-gradient(90deg, transparent 0%, rgba(249,116,21,0.8) 40%, rgba(249,116,21,1) 50%, rgba(249,116,21,0.8) 60%, transparent 100%)" }} />
        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(249,116,21,0.10) 0%, transparent 100%)" }} />
        <div ref={roiAnim.ref as React.RefObject<HTMLDivElement>} className="max-w-5xl mx-auto px-6 relative z-10">
          <div className={`text-center mb-12 transition-all duration-700 ${roiAnim.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
            <span className="inline-block mb-3 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest text-red-400 bg-red-400/10 border border-red-400/20">
              Hai già calcolato?
            </span>
            <h2 className="text-2xl md:text-4xl font-extrabold text-white mb-3">
              Quanto ti costa <span className="text-red-400">NON avere il controllo</span>
            </h2>
            <p className="text-white/50 text-lg max-w-2xl mx-auto">
              La maggior parte degli imprenditori edili scopre solo a fine anno quanto ha perso. Ecco i numeri medi per un'azienda come la tua.
            </p>
          </div>

          {/* 3 loss cards */}
          <div className="grid md:grid-cols-3 gap-4 mb-8">
            {[
              { value: config.roi.lossValue, label: config.roi.lossLabel, icon: "📉", color: "border-red-500/30 bg-red-500/10" },
              { value: config.roi.wasteValue, label: config.roi.wasteLabel, icon: "⏳", color: "border-orange-500/30 bg-orange-500/10" },
              { value: config.roi.errorValue, label: config.roi.errorLabel, icon: "⚠️", color: "border-yellow-500/30 bg-yellow-500/10" },
            ].map((item, i) => (
              <div
                key={i}
                className={`rounded-2xl border p-6 text-center ${item.color} transition-all duration-700 ${roiAnim.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
                style={{ transitionDelay: `${150 + i * 100}ms` }}
              >
                <div className="text-3xl mb-3">{item.icon}</div>
                <p className="text-3xl font-extrabold text-white mb-2">{item.value}</p>
                <p className="text-white/50 text-sm leading-snug">{item.label}</p>
              </div>
            ))}
          </div>

          {/* Total + comparison */}
          <div className={`rounded-2xl border border-white/10 bg-white/[0.04] p-6 md:p-8 transition-all duration-700 delay-400 ${roiAnim.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="text-center md:text-left">
                <p className="text-white/40 text-xs uppercase tracking-widest mb-1">Totale stimato perso ogni anno</p>
                <p className="text-4xl md:text-5xl font-extrabold text-red-400">{config.roi.totalLoss}</p>
              </div>
              <div className="text-white/30 text-3xl font-thin hidden md:block">vs</div>
              <div className="text-center md:text-left">
                <p className="text-white/40 text-xs uppercase tracking-widest mb-1">Edilizia in Cloud ti costa</p>
                <p className="text-4xl md:text-5xl font-extrabold text-[#F97415]">{config.roi.softwareCost}</p>
                <p className="text-white/30 text-xs mt-1">all'anno (piano Professionista)</p>
              </div>
              <div className="text-center">
                <div className="inline-flex flex-col items-center justify-center w-28 h-28 rounded-full border-2 border-[#F97415]/50 bg-[#F97415]/10">
                  <p className="text-white/40 text-[10px] uppercase tracking-wide">ROI</p>
                  <p className="text-3xl font-extrabold text-[#F97415]">{config.roi.roiX}</p>
                  <p className="text-white/40 text-[10px]">nel 1° anno</p>
                </div>
              </div>
            </div>
            <div className="mt-6 pt-5 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-white/40 text-sm">
                🎯 <span className="text-white/60">31 giorni gratis</span> per verificarlo tu stesso. Se non vedi i risultati, non paghi nulla.
              </p>
              <Link to="/demo/" className="flex-shrink-0 inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[#F97415] text-white font-bold text-sm hover:bg-[#e8650e] hover:scale-105 transition-all shadow-lg shadow-[#F97415]/30">
                Calcola il tuo ROI reale <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── TRANSFORMATION PRIMA / DOPO ── */}
      <section className="py-16 md:py-24 bg-white">
        <div ref={transAnim.ref as React.RefObject<HTMLDivElement>} className="max-w-5xl mx-auto px-6">
          <div className={`text-center mb-12 transition-all duration-700 ${transAnim.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
            <h2 className="text-2xl md:text-4xl font-extrabold text-[#111111] mb-3">{config.transformation.title}</h2>
            <p className="text-gray-500 text-lg">{config.transformation.subtitle}</p>
          </div>
          <div className={`grid md:grid-cols-2 gap-6 transition-all duration-700 delay-200 ${transAnim.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
            {/* Before */}
            <div className="rounded-2xl border-2 border-red-100 bg-red-50/50 p-6 md:p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
                  <XCircle className="w-4 h-4 text-red-500" />
                </div>
                <span className="font-bold text-red-600 text-sm uppercase tracking-wide">{config.transformation.fromTitle}</span>
              </div>
              <ul className="space-y-3">
                {config.transformation.fromItems.map((item, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-gray-700">
                    <span className="text-red-400 mt-0.5 flex-shrink-0">✕</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            {/* After */}
            <div className="rounded-2xl border-2 border-[#F97415]/20 bg-[#F97415]/5 p-6 md:p-8 relative overflow-hidden">
              <div className="absolute top-3 right-3 px-2 py-1 bg-[#F97415] text-white text-[10px] font-bold rounded-full uppercase tracking-wide">
                Con Edilizia in Cloud
              </div>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-8 h-8 rounded-full bg-[#F97415]/20 flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4 text-[#F97415]" />
                </div>
                <span className="font-bold text-[#F97415] text-sm uppercase tracking-wide">{config.transformation.toTitle}</span>
              </div>
              <ul className="space-y-3">
                {config.transformation.toItems.map((item, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-gray-700">
                    <span className="text-[#F97415] mt-0.5 flex-shrink-0">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS ── */}
      <section ref={statsAnim.ref as React.RefObject<HTMLDivElement>} className="py-14 md:py-20 bg-[#111111] relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 80% 60% at 50% 50%, rgba(249,116,21,0.10) 0%, transparent 100%)" }} />
        <div className="relative z-10 max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-8 text-center">
            {config.stats.map((s, i) => (
              <div
                key={i}
                className={`transition-all duration-700 ${statsAnim.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
                style={{ transitionDelay: `${i * 120}ms` }}
              >
                <p className="text-4xl md:text-5xl font-extrabold text-[#F97415] mb-2">
                  <StatCounter value={s.value} trigger={statsAnim.isVisible} />
                </p>
                <p className="text-white font-bold text-sm mb-1">{s.label}</p>
                <p className="text-white/40 text-xs">{s.sublabel}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── MODULES ── */}
      <section className="py-16 md:py-24 bg-white">
        <div ref={modulesAnim.ref as React.RefObject<HTMLDivElement>} className="max-w-5xl mx-auto px-6">
          <div className={`text-center mb-12 transition-all duration-700 ${modulesAnim.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
            <h2 className="text-2xl md:text-4xl font-extrabold text-[#111111] mb-3">{config.modulesTitle}</h2>
            <p className="text-gray-500 text-lg">{config.modulesSubtitle}</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {config.modules.map((m, i) => (
              <div
                key={i}
                className={`p-6 rounded-2xl border border-gray-200 hover:border-[#F97415]/40 hover:shadow-lg transition-all duration-500 group ${modulesAnim.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
                style={{ transitionDelay: `${150 + i * 80}ms` }}
              >
                <div className="w-11 h-11 rounded-xl bg-[#F97415]/10 flex items-center justify-center mb-4 group-hover:scale-110 group-hover:bg-[#F97415]/20 transition-all duration-300">
                  <m.icon className="w-5 h-5 text-[#F97415]" />
                </div>
                <h3 className="font-bold text-[#111111] mb-2">{m.name}</h3>
                <p className="text-gray-500 text-sm leading-relaxed mb-4">{m.desc}</p>
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-50 text-green-700 text-xs font-bold rounded-full border border-green-100">
                  <Zap className="w-3 h-3" /> {m.saving}
                </span>
              </div>
            ))}
          </div>
          <div className={`text-center mt-10 transition-all duration-700 ${modulesAnim.isVisible ? "opacity-100" : "opacity-0"}`}>
            <Link to="/funzionalita/" className="inline-flex items-center gap-2 text-[#F97415] font-bold hover:underline">
              Vedi tutti i 26 moduli <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* ── SILVIO AI (optional) ── */}
      {config.aiShowcase && (
        <section className="py-16 md:py-24 bg-[#111111] relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-px" style={{ background: "linear-gradient(90deg, transparent 0%, rgba(249,116,21,0.8) 40%, rgba(249,116,21,1) 50%, transparent 100%)" }} />
          <div className="absolute top-0 left-1/4 w-[500px] h-[400px] rounded-full blur-[130px] pointer-events-none" style={{ background: "radial-gradient(circle, rgba(249,116,21,0.2) 0%, transparent 65%)" }} />
          <div className="absolute bottom-0 right-1/4 w-[450px] h-[350px] rounded-full blur-[120px] pointer-events-none" style={{ background: "radial-gradient(circle, rgba(249,116,21,0.14) 0%, transparent 65%)" }} />
          <div ref={aiAnim.ref as React.RefObject<HTMLDivElement>} className="max-w-5xl mx-auto px-6 relative z-10">
            <div className={`text-center mb-12 transition-all duration-700 ${aiAnim.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
              <img
                src="/silvio-avatar-orange.png"
                alt="Silvio, la regia AI di Edilizia in Cloud"
                width={72}
                height={72}
                loading="lazy"
                decoding="async"
                className="mx-auto mb-4 h-[72px] w-[72px] rounded-full ring-2 ring-orange-300/60 shadow-[0_0_40px_rgba(249,116,21,0.45)]"
              />
              <span className="inline-block mb-4 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest text-orange-200 bg-[#F97415]/10 border border-[#F97415]/25">
                Silvio · La regia AI
              </span>
              <h2 className="text-2xl md:text-4xl font-extrabold text-white mb-3">{config.aiShowcase.title}</h2>
              <p className="text-white/55 text-lg max-w-2xl mx-auto">{config.aiShowcase.subtitle}</p>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              {config.aiShowcase.actions.map((a, i) => (
                <div
                  key={a.title}
                  className={`rounded-2xl border border-white/10 bg-white/[0.06] p-5 backdrop-blur transition-all duration-500 hover:-translate-y-1 hover:border-orange-300/35 hover:bg-white/[0.09] ${aiAnim.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
                  style={{ transitionDelay: `${150 + i * 90}ms` }}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#F97415]/15 text-[#F97415]">
                      <a.icon className="h-5 w-5" />
                    </div>
                    <span className="rounded-full bg-white/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-white/55">
                      {a.tag}
                    </span>
                  </div>
                  <h3 className="font-bold text-white mb-1.5">{a.title}</h3>
                  <p className="text-white/55 text-sm leading-relaxed">{a.desc}</p>
                </div>
              ))}
            </div>
            {config.aiShowcase.note && (
              <p className={`text-center text-white/45 mt-10 text-sm md:text-base transition-all duration-700 delay-500 ${aiAnim.isVisible ? "opacity-100" : "opacity-0"}`}>
                {config.aiShowcase.note}
              </p>
            )}
          </div>
        </section>
      )}

      {/* ── PIATTAFORMA COMPLETA (optional) ── */}
      {config.platformExtra && (
        <section className="py-16 md:py-24 bg-[#f8f9fa]">
          <div ref={extraAnim.ref as React.RefObject<HTMLDivElement>} className="max-w-5xl mx-auto px-6">
            <div className={`text-center mb-12 transition-all duration-700 ${extraAnim.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
              <h2 className="text-2xl md:text-4xl font-extrabold text-[#111111] mb-3">{config.platformExtra.title}</h2>
              <p className="text-gray-500 text-lg max-w-2xl mx-auto">{config.platformExtra.subtitle}</p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {config.platformExtra.items.map((item, i) => (
                <div
                  key={item.name}
                  className={`flex gap-3.5 rounded-2xl border border-gray-200 bg-white p-5 transition-all duration-500 hover:-translate-y-0.5 hover:border-[#F97415]/40 hover:shadow-lg ${extraAnim.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
                  style={{ transitionDelay: `${100 + i * 60}ms` }}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F97415]/10 text-[#F97415]">
                    <item.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-[#111111] text-sm mb-1">{item.name}</h3>
                    <p className="text-gray-500 text-xs leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── CASE STUDY ── */}
      <section className="py-16 md:py-28 bg-[#111111] relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-px" style={{ background: "linear-gradient(90deg, transparent 0%, rgba(249,116,21,0.8) 40%, rgba(249,116,21,1) 50%, transparent 100%)" }} />
        <div className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full blur-[150px] pointer-events-none" style={{ background: "radial-gradient(circle, rgba(249,116,21,0.18) 0%, transparent 65%)" }} />
        <div ref={caseAnim.ref as React.RefObject<HTMLDivElement>} className="max-w-5xl mx-auto px-6 relative z-10">
          <div className={`text-center mb-12 transition-all duration-700 ${caseAnim.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
            <span className="inline-block mb-4 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest text-[#C2410C] bg-[#F97415]/10 border border-[#F97415]/20">
              Caso Studio Reale
            </span>
            <h2 className="text-2xl md:text-4xl font-extrabold text-white">
              Risultati concreti. <span className="text-[#F97415]">Numeri veri.</span>
            </h2>
          </div>

          <div className={`grid md:grid-cols-5 gap-0 rounded-3xl overflow-hidden border border-white/10 transition-all duration-700 delay-200 ${caseAnim.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
            {/* Left: story */}
            <div className="md:col-span-3 bg-white/[0.05] p-7 md:p-10">
              <div className="flex items-center gap-4 mb-6">
                <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${cs.gradient} flex items-center justify-center text-white font-extrabold text-lg flex-shrink-0`}>
                  {cs.initials}
                </div>
                <div>
                  <p className="text-white font-bold">{cs.company}</p>
                  <p className="text-white/50 text-xs">{cs.city} · {cs.sector}</p>
                  <span className="inline-block mt-1 px-2 py-0.5 bg-[#F97415]/20 text-[#F97415] text-xs font-bold rounded-full">Fatturato {cs.revenue}</span>
                </div>
              </div>
              <div className="flex gap-1 mb-5">
                {[...Array(5)].map((_, s) => (
                  <Star key={s} className="w-4 h-4 fill-amber-400 text-amber-400" />
                ))}
              </div>
              <blockquote className="text-white text-base md:text-lg italic leading-relaxed mb-6">
                "{cs.quote}"
              </blockquote>
              <p className="text-white/50 text-sm">
                — <strong className="text-white/70">{cs.person}</strong>, {cs.role}
              </p>
            </div>
            {/* Right: metrics */}
            <div className="md:col-span-2 bg-[#F97415]/10 border-t border-white/10 md:border-t-0 md:border-l border-white/10 p-7 md:p-8 flex flex-col justify-center gap-6">
              {cs.metrics.map((m, i) => (
                <div key={i}>
                  <p className="text-white/50 text-xs uppercase tracking-wide mb-2">{m.label}</p>
                  <div className="flex items-center gap-3">
                    <span className="text-red-300/70 line-through text-sm">{m.before}</span>
                    <ArrowRight className="w-3 h-3 text-[#F97415] flex-shrink-0" />
                    <span className="text-white font-bold">{m.after}</span>
                  </div>
                </div>
              ))}
              <div className="mt-2 pt-4 border-t border-white/10">
                <Link to="/casi-studio/" className="inline-flex items-center gap-2 text-[#F97415] text-sm font-bold hover:underline">
                  Leggi tutti i casi studio <ArrowRight size={14} />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── GARANZIE ── */}
      <section className="py-16 md:py-24 bg-[#f8f9fa] relative">
        <div className="max-w-5xl mx-auto px-6">
          <div className={`text-center mb-12 transition-all duration-700 ${garantieAnim.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
            <span className="inline-block mb-3 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest text-green-700 bg-green-100 border border-green-200">
              Garanzie — senza asterischi
            </span>
            <h2 className="text-2xl md:text-4xl font-extrabold text-[#111111]">
              Il rischio è nostro. Non tuo.
            </h2>
            <p className="text-gray-500 text-lg mt-3 max-w-2xl mx-auto">
              Puoi provare Edilizia in Cloud senza mettere soldi sul tavolo.<br />
              Se non funziona per te, esci. Punto.
            </p>
          </div>
          <div ref={garantieAnim.ref as React.RefObject<HTMLDivElement>} className="grid md:grid-cols-2 gap-4">
            {/* GARANZIA 1 */}
            <div className={`rounded-2xl border-2 border-green-200 bg-white p-7 md:p-8 transition-all duration-700 ${garantieAnim.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`} style={{ transitionDelay: "0ms" }}>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-xl">🔓</div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-green-700">Garanzia 1</p>
                  <p className="font-extrabold text-[#111111] text-lg leading-tight">Prova 31 Giorni</p>
                </div>
              </div>
              <div className="space-y-2 text-gray-600 text-sm leading-relaxed">
                <p>31 giorni gratis. <strong className="text-[#111111]">Cancella quando vuoi.</strong></p>
                <p>Nessun commerciale che ti chiama.</p>
                <p>Entri, lo usi, decidi tu.</p>
                <p className="mt-3 pt-3 border-t border-gray-100">
                  Se non fa per te — esci.<br />
                  <strong className="text-[#111111]">Nessuno ti chiede perché.</strong>
                </p>
              </div>
            </div>
            {/* GARANZIA 2 */}
            <div className={`rounded-2xl border-2 border-blue-200 bg-white p-7 md:p-8 transition-all duration-700 ${garantieAnim.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`} style={{ transitionDelay: "100ms" }}>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-xl">⚙️</div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-blue-700">Garanzia 2</p>
                  <p className="font-extrabold text-[#111111] text-lg leading-tight">Onboarding Dedicato</p>
                </div>
              </div>
              <div className="space-y-2 text-gray-600 text-sm leading-relaxed">
                <p><strong className="text-[#111111]">Non ti lasciamo da solo davanti a uno schermo.</strong></p>
                <p>Entro 48 ore dall'attivazione, un nostro tecnico configura tutto con te: cantieri, squadre, clienti, fornitori.</p>
                <p className="mt-3 pt-3 border-t border-gray-100">
                  Sei operativo dal primo giorno.<br />
                  <strong className="text-[#111111]">O non ti addebitiamo nulla finché non lo sei.</strong>
                </p>
              </div>
            </div>
            {/* GARANZIA 3 */}
            <div className={`rounded-2xl border-2 border-[#F97415]/30 bg-white p-7 md:p-8 transition-all duration-700 ${garantieAnim.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`} style={{ transitionDelay: "200ms" }}>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-full bg-[#F97415]/10 flex items-center justify-center text-xl">🎯</div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#F97415]">Garanzia 3</p>
                  <p className="font-extrabold text-[#111111] text-lg leading-tight">Risultato 60 Giorni</p>
                </div>
              </div>
              <div className="space-y-1.5 text-gray-600 text-sm leading-relaxed">
                <p className="font-semibold text-[#111111]">Entro 60 giorni sai esattamente:</p>
                <p>→ Quanto hai speso su ogni cantiere aperto</p>
                <p>→ Dove sono le tue squadre e cosa stanno facendo</p>
                <p>→ Quante ore hai pagato e quante erano in cantiere</p>
                <p>→ Cosa devi incassare e da chi — senza aprire Excel</p>
                <p>→ Se stai guadagnando o perdendo su ogni lavoro</p>
                <p className="mt-3 pt-3 border-t border-gray-100">
                  <strong className="text-[#111111]">Se dopo 60 giorni non hai tutto questo —<br />ti rimborsiamo ogni centesimo. Senza discussioni.</strong>
                </p>
              </div>
            </div>
            {/* GARANZIA 4 */}
            <div className={`rounded-2xl border-2 border-purple-200 bg-white p-7 md:p-8 transition-all duration-700 ${garantieAnim.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`} style={{ transitionDelay: "300ms" }}>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-xl">🔄</div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-purple-700">Garanzia 4</p>
                  <p className="font-extrabold text-[#111111] text-lg leading-tight">Rottamazione</p>
                </div>
              </div>
              <div className="space-y-2 text-gray-600 text-sm leading-relaxed">
                <p><strong className="text-[#111111]">Stai già pagando un altro gestionale?</strong></p>
                <p>Mandaci la prova dell'abbonamento attivo.</p>
                <p>Pensiamo noi a tutto — importiamo i tuoi dati, configuriamo insieme, ti mettiamo operativo senza perdere un giorno.</p>
                <p className="mt-3 pt-3 border-t border-gray-100">
                  E per ringraziarti del coraggio di cambiare,<br />
                  <strong className="text-[#111111]">accedi a Edilizia in Cloud con uno sconto dedicato.<br />Cambi. Non perdi niente.</strong>
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="py-16 md:py-24 bg-[#f8f9fa]">
        <div ref={faqAnim.ref as React.RefObject<HTMLDivElement>} className="max-w-3xl mx-auto px-6">
          <h2 className={`text-2xl md:text-4xl font-extrabold text-[#111111] text-center mb-10 transition-all duration-700 ${faqAnim.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
            Domande Frequenti
          </h2>
          <div className="space-y-3">
            {config.faq.map((item, i) => (
              <FaqAccordion key={i} item={item} />
            ))}
          </div>
        </div>
      </section>

      {/* ── LEGGI ANCHE — Blog post correlati (contenuto unico per pagina) ── */}
      {(() => {
        const relCats = SECTOR_BLOG_CATEGORIES[config.seoCanonical] ?? [];
        const relPosts = blogPosts
          .filter((p) => relCats.includes(p.category))
          .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
          .slice(0, 3);
        if (relPosts.length === 0) return null;
        return (
          <section className="py-16 md:py-20 bg-white border-t border-gray-100">
            <div className="max-w-5xl mx-auto px-6">
              <h2 className="text-xl md:text-2xl font-extrabold text-[#111111] mb-8">
                Guide e articoli consigliati per te
              </h2>
              <div className="grid md:grid-cols-3 gap-6">
                {relPosts.map((post) => (
                  <Link
                    key={post.id}
                    to={`/blog/${post.slug}/`}
                    className="group flex flex-col bg-gray-50 rounded-2xl overflow-hidden border border-gray-200 hover:border-[#F97415]/40 hover:shadow-lg transition-all duration-300"
                  >
                    <BlogCover
                      src={post.coverImage}
                      alt={post.title}
                      width={600}
                      height={315}
                      sizes="(max-width: 640px) 100vw, 320px"
                      className="w-full h-36 object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="p-5 flex flex-col flex-1">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-[#F97415] mb-2">
                        {post.category}
                      </span>
                      <p className="text-sm font-semibold text-[#111111] leading-snug group-hover:text-[#F97415] transition-colors line-clamp-2 flex-1">
                        {post.title}
                      </p>
                      <span className="mt-3 inline-flex items-center gap-1 text-xs text-[#F97415] font-semibold group-hover:gap-2 transition-all">
                        Leggi <ArrowRight size={11} />
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        );
      })()}

      {/* ── ESPLORA ALTRI SETTORI — cross-linking interno ── */}
      <section className="py-12 md:py-16 bg-gray-50 border-t border-gray-100">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-center text-xs font-bold uppercase tracking-widest text-gray-400 mb-6">
            Edilizia in Cloud per ogni tipo di impresa
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {ALL_SECTORS.map((s) => {
              const isCurrent = s.slug === config.seoCanonical;
              return (
                <Link
                  key={s.slug}
                  to={s.slug}
                  aria-current={isCurrent ? "page" : undefined}
                  className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all duration-200 ${
                    isCurrent
                      ? "bg-[#F97415] text-white border-[#F97415] shadow-md shadow-[#F97415]/20 cursor-default"
                      : "bg-white text-gray-700 border-gray-200 hover:border-[#F97415]/40 hover:text-[#F97415] hover:bg-[#F97415]/5"
                  }`}
                >
                  <span>{s.emoji}</span> {s.label}
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── CTA FINALE ── */}
      <section className="py-16 md:py-28 bg-[#111111] relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-px" style={{ background: "linear-gradient(90deg, transparent 0%, rgba(249,116,21,0.8) 40%, rgba(249,116,21,1) 50%, transparent 100%)" }} />
        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 80% 60% at 50% 50%, rgba(249,116,21,0.12) 0%, transparent 100%)" }} />
        <div className="relative z-10 max-w-3xl mx-auto px-6 text-center">
          {/* Urgency row */}
          <div className="inline-flex items-center gap-2 mb-6 px-4 py-2 rounded-full border border-[#F97415]/30 bg-[#F97415]/10">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-ping" />
            <p className="text-[#F97415] text-sm font-bold">
              ⏰ 31 giorni gratis + onboarding dedicato incluso — cancella quando vuoi
            </p>
          </div>
          <h2 className="text-3xl md:text-5xl font-extrabold text-white mb-4 leading-tight">{config.ctaTitle}</h2>
          <p className="text-white/50 text-lg mb-10">{config.ctaSubtitle}</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-10">
            <Link to="/demo/" className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-[#F97415] hover:bg-[#e8650e] text-white font-bold text-lg hover:scale-105 transition-all shadow-lg shadow-[#F97415]/30">
              Prova Gratis 31 Giorni <ArrowRight size={18} />
            </Link>
            <Link to="/prezzi/" className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl border border-white/20 text-white font-bold hover:border-white/40 hover:bg-white/5 transition-all">
              Vedi i Prezzi
            </Link>
          </div>
          {/* Trust icons row */}
          <div className="grid grid-cols-3 gap-4 max-w-lg mx-auto mb-6">
            {[
              { Icon: Shield, label: "Dati al sicuro", sub: "GDPR · Cifratura" },
              { Icon: Clock, label: "Setup in 48h", sub: "Il team ti configura tutto" },
              { Icon: TrendingUp, label: "ROI medio 10x", sub: "Nel primo anno" },
            ].map(({ Icon, label, sub }, i) => (
              <div key={i} className="text-center">
                <div className="w-9 h-9 rounded-full bg-[#F97415]/10 flex items-center justify-center mx-auto mb-2">
                  <Icon size={16} className="text-[#F97415]" />
                </div>
                <p className="text-white/70 text-xs font-bold">{label}</p>
                <p className="text-white/30 text-[10px] mt-0.5">{sub}</p>
              </div>
            ))}
          </div>
          {/* Micro-copy garanzia */}
          <p className="text-white/25 text-xs">
            Nessun contratto. Cancella quando vuoi — senza spiegazioni.
          </p>
        </div>
      </section>

      <LandingFooter />
      <StickyBottomBar />
    </div>
  );
}
