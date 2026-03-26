import { useSEO } from "@/hooks/useSEO";
import { JsonLd } from "@/components/seo/JsonLd";
import { Link } from "react-router-dom";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";
import StickyBottomBar from "@/components/landing/StickyBottomBar";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { CheckCircle2, ArrowRight, Star, TrendingUp, Clock, Shield, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import type { LucideIcon } from "lucide-react";

function PromoBanner() {
  return (
    <div className="fixed top-0 left-0 right-0 z-[60] bg-[#F97415] text-white py-2 text-center overflow-hidden">
      <span className="absolute inset-0" style={{ backgroundImage: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.12) 50%, transparent 100%)", backgroundSize: "200% 100%" }} />
      <span className="relative flex items-center justify-center gap-2 text-xs md:text-sm font-bold tracking-wide">
        SE NON TI FA GUADAGNARE, IL PROGRAMMA È GRATIS PER SEMPRE
      </span>
    </div>
  );
}

export interface ModuleItem {
  icon: LucideIcon;
  name: string;
  desc: string;
  saving: string;
}

export interface ProblemItem {
  n: string;
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
  quote: string;
  beforeLabel: string;
  beforeValue: string;
  afterLabel: string;
  afterValue: string;
}

export interface FaqItem {
  q: string;
  a: string;
}

export interface PerTipoConfig {
  // SEO
  seoTitle: string;
  seoDescription: string;
  seoKeywords: string;
  seoCanonical: string;
  // Hero
  badge: string;
  heroTitle: JSX.Element;
  heroSubtitle: string;
  // Problems section
  problemsTitle: string;
  problems: ProblemItem[];
  // Modules
  modulesTitle: string;
  modules: ModuleItem[];
  // Case study
  caseStudy: CaseStudy;
  // Stats
  stats: Array<{ value: string; label: string; sublabel: string }>;
  // FAQ
  faq: FaqItem[];
  // CTA
  ctaTitle: JSX.Element;
  ctaSubtitle: string;
  // Schema
  schemaFaq: Array<{ q: string; a: string }>;
}

function FaqItem({ item }: { item: FaqItem }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50 transition-colors"
        onClick={() => setOpen(!open)}
      >
        <span className="font-semibold text-[#111111] text-sm md:text-base pr-4">{item.q}</span>
        {open ? <ChevronUp className="w-5 h-5 text-[#F97415] shrink-0" /> : <ChevronDown className="w-5 h-5 text-[#F97415] shrink-0" />}
      </button>
      {open && (
        <div className="px-6 pb-4">
          <p className="text-gray-600 text-sm leading-relaxed">{item.a}</p>
        </div>
      )}
    </div>
  );
}

export default function PerTipoPageTemplate({ config }: { config: PerTipoConfig }) {
  const heroAnim = useScrollAnimation();
  const statsAnim = useScrollAnimation({ threshold: 0.2 });
  const problemsAnim = useScrollAnimation();
  const modulesAnim = useScrollAnimation();
  const caseAnim = useScrollAnimation();
  const faqAnim = useScrollAnimation();

  useSEO({
    title: config.seoTitle,
    description: config.seoDescription,
    canonical: config.seoCanonical,
    keywords: config.seoKeywords,
  });

  const cs = config.caseStudy;

  return (
    <div className="min-h-screen bg-white text-[#111111] pb-24 overflow-x-hidden">
      <JsonLd id={`jsonld-breadcrumb-${config.seoCanonical.replace(/\//g, "-")}`} data={{
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://ediliziaincloud.com/home" },
          { "@type": "ListItem", "position": 2, "name": "Dedicato a", "item": "https://ediliziaincloud.com/home" },
          { "@type": "ListItem", "position": 3, "name": config.badge, "item": `https://ediliziaincloud.com${config.seoCanonical}` }
        ]
      }} />
      <JsonLd id={`jsonld-faq-${config.seoCanonical.replace(/\//g, "-")}`} data={{
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": config.schemaFaq.map(({ q, a }) => ({
          "@type": "Question",
          "name": q,
          "acceptedAnswer": { "@type": "Answer", "text": a }
        }))
      }} />

      <PromoBanner />
      <LandingNavbar />

      {/* ── HERO ── */}
      <section className="relative overflow-hidden pt-20 md:pt-32 pb-16 md:pb-24 bg-[#111111]">
        <div className="absolute top-0 left-0 right-0 h-px" style={{ background: "linear-gradient(90deg, transparent 0%, rgba(249,116,21,0.8) 40%, rgba(249,116,21,1) 50%, rgba(249,116,21,0.8) 60%, transparent 100%)" }} />
        <div className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full blur-[160px] pointer-events-none" style={{ background: "radial-gradient(circle, rgba(249,116,21,0.18) 0%, transparent 65%)" }} />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full blur-[130px] pointer-events-none" style={{ background: "radial-gradient(circle, rgba(249,116,21,0.12) 0%, transparent 65%)" }} />

        <div ref={heroAnim.ref as React.RefObject<HTMLDivElement>} className="relative z-10 max-w-4xl mx-auto px-6 text-center">
          <div className={`transition-all duration-700 ${heroAnim.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
            <span className="inline-flex items-center gap-2 mb-6 px-4 py-2 rounded-full border border-[#F97415]/40 bg-[#F97415]/10 text-[#F97415] text-xs font-bold uppercase tracking-widest">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-ping" />
              {config.badge}
            </span>
          </div>
          <div className={`transition-all duration-700 delay-100 ${heroAnim.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
            <h1 className="text-3xl sm:text-4xl md:text-6xl font-extrabold text-white leading-tight mb-6">
              {config.heroTitle}
            </h1>
          </div>
          <div className={`transition-all duration-700 delay-200 ${heroAnim.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
            <p className="text-white/60 text-base md:text-xl max-w-2xl mx-auto mb-10">
              {config.heroSubtitle}
            </p>
          </div>
          <div className={`flex flex-col sm:flex-row items-center justify-center gap-4 transition-all duration-700 delay-300 ${heroAnim.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
            <Link to="/demo" className="w-full sm:w-auto px-8 py-4 rounded-full bg-[#F97415] text-white font-bold text-lg hover:bg-[#e8650e] hover:scale-105 transition-all shadow-lg shadow-[#F97415]/30">
              Prova Gratis 30 Giorni →
            </Link>
            <Link to="/prezzi" className="w-full sm:w-auto px-8 py-4 rounded-full border border-white/20 text-white font-semibold hover:bg-white/5 hover:border-white/40 transition-all">
              Vedi i Prezzi
            </Link>
          </div>
          <div className={`flex flex-wrap items-center justify-center gap-6 mt-8 transition-all duration-700 delay-400 ${heroAnim.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
            {[
              { Icon: Shield, label: "Dati in Europa" },
              { Icon: Clock, label: "Setup in 48h" },
              { Icon: Star, label: "4.9/5 stelle" },
            ].map(({ Icon, label }, i) => (
              <span key={i} className="flex items-center gap-2 text-white/50 text-sm">
                <Icon size={14} className="text-[#F97415]" />
                {label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── STATS ── */}
      <section ref={statsAnim.ref as React.RefObject<HTMLDivElement>} className="py-12 md:py-16 bg-white border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-8 text-center">
            {config.stats.map((s, i) => (
              <div key={i} className={`transition-all duration-700 ${statsAnim.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`} style={{ transitionDelay: `${i * 120}ms` }}>
                <p className="text-3xl md:text-4xl font-extrabold text-[#F97415] mb-1">{s.value}</p>
                <p className="text-[#111111] font-semibold text-sm mb-0.5">{s.label}</p>
                <p className="text-gray-400 text-xs">{s.sublabel}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PROBLEMS ── */}
      <section className="py-16 md:py-24 bg-[#f8f9fa]">
        <div ref={problemsAnim.ref as React.RefObject<HTMLDivElement>} className="max-w-4xl mx-auto px-6">
          <h2 className={`text-2xl md:text-4xl font-extrabold text-[#111111] text-center mb-4 transition-all duration-700 ${problemsAnim.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
            {config.problemsTitle}
          </h2>
          <p className={`text-gray-500 text-center mb-12 transition-all duration-700 delay-100 ${problemsAnim.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
            Riconosci almeno uno di questi problemi? Allora sai già perché sei qui.
          </p>
          <div className="space-y-4">
            {config.problems.map((p, i) => (
              <div key={i}
                className={`flex gap-5 p-5 md:p-6 rounded-2xl bg-white border border-gray-200 hover:border-[#F97415]/40 transition-all duration-500 group ${problemsAnim.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
                style={{ transitionDelay: `${150 + i * 100}ms` }}>
                <span className="text-3xl md:text-4xl font-extrabold flex-shrink-0 bg-gradient-to-b from-[#F97415] to-[#F97415]/30 bg-clip-text text-transparent">{p.n}</span>
                <div>
                  <h3 className="text-[#111111] font-bold text-base md:text-lg mb-1">{p.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{p.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CASE STUDY ── */}
      <section className="py-16 md:py-24 bg-[#111111] relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-px" style={{ background: "linear-gradient(90deg, transparent 0%, rgba(249,116,21,0.8) 40%, rgba(249,116,21,1) 50%, transparent 100%)" }} />
        <div className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full blur-[150px]" style={{ background: "radial-gradient(circle, rgba(249,116,21,0.18) 0%, transparent 65%)" }} />
        <div ref={caseAnim.ref as React.RefObject<HTMLDivElement>} className="max-w-4xl mx-auto px-6 relative z-10">
          <div className={`text-center mb-12 transition-all duration-700 ${caseAnim.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
            <span className="inline-block mb-4 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest text-[#F97415] bg-[#F97415]/10 border border-[#F97415]/20">Caso Studio Reale</span>
            <h2 className="text-2xl md:text-4xl font-extrabold text-white">Risultati concreti. <span className="text-[#F97415]">Numeri veri.</span></h2>
          </div>
          <div className={`bg-white/[0.05] border border-white/10 rounded-3xl p-6 md:p-10 transition-all duration-700 delay-200 ${caseAnim.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
            <div className="flex flex-col md:flex-row gap-8 items-start">
              <div className="flex-shrink-0">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-white font-extrabold text-xl" style={{ background: "linear-gradient(135deg, #F97415, #e8650e)" }}>
                  {cs.initials}
                </div>
              </div>
              <div className="flex-1">
                <div className="flex flex-wrap gap-2 mb-4">
                  <span className="px-3 py-1 rounded-full bg-white/10 text-white/60 text-xs">{cs.sector}</span>
                  <span className="px-3 py-1 rounded-full bg-white/10 text-white/60 text-xs">{cs.city}</span>
                  <span className="px-3 py-1 rounded-full bg-[#F97415]/20 text-[#F97415] text-xs font-bold">Fatturato: {cs.revenue}</span>
                </div>
                <blockquote className="text-white text-base md:text-lg italic font-medium leading-relaxed mb-6">
                  "{cs.quote}"
                </blockquote>
                <div className="flex flex-col sm:flex-row gap-4 mb-6">
                  <div className="flex-1 bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                    <p className="text-red-400 text-xs font-bold uppercase tracking-wide mb-1">Prima</p>
                    <p className="text-white font-bold">{cs.beforeValue}</p>
                    <p className="text-white/50 text-xs">{cs.beforeLabel}</p>
                  </div>
                  <div className="flex items-center justify-center text-[#F97415] font-black text-2xl">→</div>
                  <div className="flex-1 bg-green-500/10 border border-green-500/20 rounded-xl p-4">
                    <p className="text-green-400 text-xs font-bold uppercase tracking-wide mb-1">Dopo</p>
                    <p className="text-white font-bold">{cs.afterValue}</p>
                    <p className="text-white/50 text-xs">{cs.afterLabel}</p>
                  </div>
                </div>
                <p className="text-white/50 text-sm"><strong className="text-white">{cs.person}</strong>, {cs.role} — {cs.company}</p>
              </div>
            </div>
          </div>
          <div className={`text-center mt-8 transition-all duration-700 delay-400 ${caseAnim.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
            <Link to="/casi-studio" className="inline-flex items-center gap-2 text-[#F97415] font-bold hover:underline">
              Leggi tutti i casi studio <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* ── MODULES ── */}
      <section className="py-16 md:py-24 bg-white">
        <div ref={modulesAnim.ref as React.RefObject<HTMLDivElement>} className="max-w-5xl mx-auto px-6">
          <h2 className={`text-2xl md:text-4xl font-extrabold text-[#111111] text-center mb-4 transition-all duration-700 ${modulesAnim.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
            {config.modulesTitle}
          </h2>
          <p className={`text-gray-500 text-center mb-12 transition-all duration-700 delay-100 ${modulesAnim.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
            I moduli più usati da imprese come la tua. Attivi dal giorno 1.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {config.modules.map((m, i) => (
              <div key={i}
                className={`p-6 rounded-2xl border border-gray-200 hover:border-[#F97415]/40 hover:shadow-lg transition-all duration-500 group ${modulesAnim.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
                style={{ transitionDelay: `${150 + i * 80}ms` }}>
                <div className="w-11 h-11 rounded-xl bg-[#F97415]/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <m.icon className="w-5 h-5 text-[#F97415]" />
                </div>
                <h3 className="font-bold text-[#111111] mb-2">{m.name}</h3>
                <p className="text-gray-500 text-sm leading-relaxed mb-3">{m.desc}</p>
                <span className="inline-block px-2 py-1 bg-green-50 text-green-700 text-xs font-bold rounded-full">{m.saving}</span>
              </div>
            ))}
          </div>
          <div className={`text-center mt-10 transition-all duration-700 ${modulesAnim.isVisible ? "opacity-100" : "opacity-0"}`}>
            <Link to="/funzionalita" className="inline-flex items-center gap-2 text-[#F97415] font-bold hover:underline">
              Vedi tutti i 26 moduli <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="py-16 md:py-24 bg-[#f8f9fa]">
        <div ref={faqAnim.ref as React.RefObject<HTMLDivElement>} className="max-w-3xl mx-auto px-6">
          <h2 className={`text-2xl md:text-4xl font-extrabold text-[#111111] text-center mb-12 transition-all duration-700 ${faqAnim.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
            Domande Frequenti
          </h2>
          <div className="space-y-3">
            {config.faq.map((item, i) => (
              <FaqItem key={i} item={item} />
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA FINALE ── */}
      <section className="py-16 md:py-24 bg-[#111111] relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-px" style={{ background: "linear-gradient(90deg, transparent 0%, rgba(249,116,21,0.8) 40%, rgba(249,116,21,1) 50%, transparent 100%)" }} />
        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 80% 60% at 50% 50%, rgba(249,116,21,0.10) 0%, transparent 100%)" }} />
        <div className="relative z-10 max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-5xl font-extrabold text-white mb-4">{config.ctaTitle}</h2>
          <p className="text-white/50 text-lg mb-10">{config.ctaSubtitle}</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
            <Link to="/demo" className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-[#F97415] hover:bg-[#e8650e] text-white font-bold text-lg hover:scale-105 transition-all shadow-lg shadow-[#F97415]/30">
              Richiedi Demo Gratuita <ArrowRight size={18} />
            </Link>
            <Link to="/prezzi" className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl border border-white/20 text-white font-bold hover:border-white/40 hover:bg-white/5 transition-all">
              Vedi i Prezzi
            </Link>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-5 text-white/40 text-sm">
            <span className="flex items-center gap-2"><Shield size={14} className="text-[#F97415]" />Dati al sicuro</span>
            <span className="hidden sm:block w-1 h-1 rounded-full bg-white/20" />
            <span className="flex items-center gap-2"><Clock size={14} className="text-[#F97415]" />Setup in 48h</span>
            <span className="hidden sm:block w-1 h-1 rounded-full bg-white/20" />
            <span className="flex items-center gap-2"><TrendingUp size={14} className="text-[#F97415]" />ROI medio 10x</span>
          </div>
        </div>
      </section>

      <LandingFooter />
      <StickyBottomBar />
    </div>
  );
}
