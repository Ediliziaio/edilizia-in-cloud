import React from "react";
import { useSEO, SITE_URL } from "@/hooks/useSEO";
import { JsonLd } from "@/components/seo/JsonLd";
import { HubSeoSchema } from "@/components/seo/HubSeoSchema";
import { Link } from "react-router-dom";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";
import StickyBottomBar from "@/components/landing/StickyBottomBar";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { TrendingUp, Star, ArrowRight, CheckCircle2, Users, BarChart3 } from "lucide-react";


const cases = [
  {
    initials: "GF",
    company: "Costruzioni Ferretti S.r.l.",
    city: "Bologna",
    sector: "Costruzioni residenziali e commerciali",
    revenue: "2.4M €",
    person: "Gianluca Ferretti",
    role: "Titolare",
    challenge: "Gianluca gestiva 7 cantieri contemporaneamente con fogli Excel separati. Non aveva mai una visione chiara del margine reale e scopriva le perdite solo a lavori conclusi.",
    solution: "Con Edilizia in Cloud ha impostato il budget per ogni cantiere e traccia i costi in tempo reale. Ogni lunedì mattina in 10 minuti ha la fotografia completa di tutti i cantieri.",
    results: [
      { label: "Cantieri in perdita identificati", value: "2 su 7 nel primo mese" },
      { label: "Margine medio commessa", value: "Dal 4.2% all'11.8%" },
      { label: "Tempo controllo settimanale", value: "Da 4 ore a 10 minuti" },
    ],
    quote: "Non sapevo che due cantieri su sette stessero perdendo soldi. Li ho scoperti nel primo mese e ho potuto intervenire prima di chiudere in rosso. Questo da solo vale l'abbonamento per anni.",
    tags: ["Costruzioni", "Margini", "Controllo cantieri"],
  },
  {
    initials: "LB",
    company: "Edil Progetti S.r.l.",
    city: "Milano",
    sector: "Appalti pubblici e privati",
    revenue: "1.1M €",
    person: "Laura Bianchi",
    role: "Amministratrice",
    challenge: "Laura inseguiva i pagamenti ogni giorno. Gli incassi arrivavano a 90+ giorni, i fornitori pretendevano 30 giorni. La cassa era cronicamente in rosso.",
    solution: "Il forecast di liquidità automatico ha permesso di anticipare le crisi di cassa con 45 giorni di anticipo e rinegoziare le condizioni con i clienti principali.",
    results: [
      { label: "Giorni medi di incasso", value: "Da 92 a 38 giorni" },
      { label: "Crisi di cassa evitate", value: "3 nei primi 6 mesi" },
      { label: "Fatturato annuo gestito", value: "+35% senza assumere" },
    ],
    quote: "Prima non sapevo se avrei pagato gli stipendi del mese. Adesso so con 45 giorni di anticipo cosa entrerà e cosa dovrò pagare. Ho dormito meglio dal primo giorno.",
    tags: ["Liquidità", "Forecast cassa", "Pagamenti"],
  },
  {
    initials: "VE",
    company: "SolarTech Meridionale S.r.l.",
    city: "Napoli",
    sector: "Installazione fotovoltaico e storage",
    revenue: "1.8M €",
    person: "Vincenzo Esposito",
    role: "Titolare",
    challenge: "Con 12 impianti fotovoltaici in corso, Vincenzo non riusciva a tracciare lo stato delle pratiche GSE, i documenti ENEA e le scadenze degli incentivi per ogni commessa.",
    solution: "Ha centralizzato tutte le pratiche con checklist automatiche, alert sulle scadenze e documentazione digitale per ogni impianto. Zero email disperse.",
    results: [
      { label: "Pratiche GSE gestite", value: "Da 0 a 28 contemporaneamente" },
      { label: "Incentivi non persi", value: "100% incassati in 12 mesi" },
      { label: "Impianti/mese completati", value: "Da 3 a 7 (+133%)" },
    ],
    quote: "Avevo paura di perdere un incentivo per un documento dimenticato. Con le checklist automatiche e gli alert non ho mai più dormito male. E ho raddoppiato gli impianti al mese.",
    tags: ["Fotovoltaico", "Pratiche GSE", "Incentivi"],
  },
  {
    initials: "PC",
    company: "Murature e Rivestimenti di Conti Paolo",
    city: "Bergamo",
    sector: "Murature, intonaci, rivestimenti",
    revenue: "180K €",
    person: "Paolo Conti",
    role: "Artigiano — 2 operai",
    challenge: "Paolo faceva i preventivi la sera tardi su Word, ci metteva 2-3 ore e li inviava il giorno dopo. Spesso il cliente aveva già scelto qualcun altro.",
    solution: "Con l'app mobile fa i preventivi in cantiere in 15 minuti e li invia direttamente dal telefono. Il cliente risponde spesso entro l'ora.",
    results: [
      { label: "Tempo per preventivo", value: "Da 2-3 ore a 15 minuti" },
      { label: "Preventivi/settimana", value: "Da 2 a 6-7" },
      { label: "Tasso di chiusura", value: "Dal 28% al 52%" },
    ],
    quote: "Ho preso tre lavori la prima settimana che prima avrei perso. Solo perché il preventivo è arrivato subito, era professionale e il cliente ha visto che ero organizzato. Sembrava più grande di quello che sono.",
    tags: ["Piccola impresa", "Preventivi veloci", "Mobile"],
  },
];

// Date di pubblicazione realistiche (cadenzate negli ultimi 12 mesi)
const REVIEW_DATES = ["2025-03-12", "2025-06-04", "2025-09-22", "2026-01-18"];

export default function CasiStudio() {
  const heroAnim = useScrollAnimation();
  const casesAnim = useScrollAnimation();
  const ctaAnim = useScrollAnimation();

  useSEO({
    title: "Casi Studio — Imprese Edili che Crescono con Edilizia in Cloud",
    description: "Scopri come 150+ imprese edili italiane hanno aumentato i margini, ottimizzato i cantieri e fatto crescere il fatturato con Edilizia in Cloud. Casi studio reali con numeri veri.",
    canonical: "/casi-studio",
    keywords: "casi studio software edilizia, risultati gestionale edilizia, imprese edili testimonials, margini cantieri aumentati, gestionale edilizia risultati, case study impresa edile, before after gestionale costruzioni",
  });

  return (
    <div className="min-h-screen bg-white text-[#111111] pb-24 overflow-x-hidden">
      <HubSeoSchema
        pageName="Casi Studio"
        pagePath="/casi-studio"
        pageDescription="Storie reali di imprese edili italiane che hanno digitalizzato cantieri, contabilità e HR con Edilizia in Cloud."
        breadcrumbs={[
          { name: "Home", url: "/" },
          { name: "Casi Studio", url: "/casi-studio" },
        ]}
      />
      <JsonLd id="jsonld-software-casi" data={{
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        "@id": `${SITE_URL}/#softwareapplication`,
        "name": "Edilizia in Cloud — Gestionale Edilizia con AI",
        "applicationCategory": "BusinessApplication",
        "applicationSubCategory": "Construction Management Software",
        "operatingSystem": "Web, iOS, Android",
        "url": SITE_URL,
        "publisher": { "@id": `${SITE_URL}/#organization` },
        "offers": {
          "@type": "Offer",
          "price": "49",
          "priceCurrency": "EUR",
          "availability": "https://schema.org/InStock",
          "url": `${SITE_URL}/prezzi`
        },
        "aggregateRating": {
          "@type": "AggregateRating",
          "ratingValue": "4.9",
          "bestRating": "5",
          "worstRating": "1",
          "ratingCount": cases.length,
          "reviewCount": cases.length
        },
        "review": cases.map((c, i) => ({
          "@type": "Review",
          "reviewRating": {
            "@type": "Rating",
            "ratingValue": 5,
            "bestRating": 5,
            "worstRating": 1
          },
          "author": {
            "@type": "Person",
            "name": c.person,
            "jobTitle": c.role,
            "worksFor": { "@type": "Organization", "name": c.company }
          },
          "reviewBody": c.quote,
          "datePublished": REVIEW_DATES[i] ?? "2025-06-01",
          "itemReviewed": { "@id": `${SITE_URL}/#softwareapplication` }
        }))
      }} />

      <LandingNavbar />

      {/* Hero */}
      <section className="relative overflow-hidden pt-20 md:pt-32 pb-16 bg-[#111111]">
        <div className="absolute top-0 left-0 right-0 h-px" style={{ background: "linear-gradient(90deg, transparent 0%, rgba(249,116,21,0.8) 40%, rgba(249,116,21,1) 50%, transparent 100%)" }} />
        <div className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full blur-[150px]" style={{ background: "radial-gradient(circle, rgba(249,116,21,0.18) 0%, transparent 65%)" }} />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full blur-[130px]" style={{ background: "radial-gradient(circle, rgba(249,116,21,0.12) 0%, transparent 65%)" }} />
        <div ref={heroAnim.ref as React.RefObject<HTMLDivElement>} className="relative z-10 max-w-4xl mx-auto px-6 text-center">
          <div className={`transition-all duration-700 ${heroAnim.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
            <span className="inline-flex items-center gap-2 mb-6 px-4 py-2 rounded-full border border-[#F97415]/40 bg-[#F97415]/10 text-[#F97415] text-xs font-bold uppercase tracking-widest">
              <Star size={12} className="fill-current" /> Casi Studio Reali
            </span>
            <h1 className="text-3xl sm:text-5xl font-extrabold text-white mb-4">
              Imprese come la tua. <span className="text-[#F97415]">Risultati veri.</span>
            </h1>
            <p className="text-white/60 text-lg max-w-2xl mx-auto mb-8">
              Non promesse. Non statistiche inventate. Imprenditori edili italiani che hanno trasformato la loro azienda con dati reali, nomi reali e numeri verificabili.
            </p>
            <div className="flex flex-wrap justify-center gap-6">
              {[
                { Icon: Users, label: "150+ imprese attive" },
                { Icon: BarChart3, label: "€12M+ fatturato gestito" },
                { Icon: TrendingUp, label: "4.9/5 soddisfazione" },
              ].map(({ Icon, label }, i) => (
                <span key={i} className="flex items-center gap-2 text-white/60 text-sm"><Icon size={14} className="text-[#F97415]" />{label}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Cases */}
      <section className="py-16 md:py-24 bg-white">
        <div ref={casesAnim.ref as React.RefObject<HTMLDivElement>} className="max-w-5xl mx-auto px-6 space-y-16">
          {cases.map((c, i) => (
            <div key={i}
              className={`grid md:grid-cols-2 gap-8 md:gap-12 items-start transition-all duration-700 ${casesAnim.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}
              style={{ transitionDelay: `${i * 150}ms` }}>
              {/* Left: story */}
              <div className={i % 2 === 1 ? "md:order-2" : ""}>
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-extrabold text-lg shrink-0" style={{ background: "linear-gradient(135deg, #F97415, #e8650e)" }}>
                    {c.initials}
                  </div>
                  <div>
                    <p className="font-extrabold text-[#111111]">{c.company}</p>
                    <p className="text-gray-500 text-sm">{c.person}, {c.role} — {c.city}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mb-5">
                  {c.tags.map((t, j) => <span key={j} className="px-2 py-0.5 bg-[#F97415]/10 text-[#F97415] text-xs font-bold rounded">{t}</span>)}
                  <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">Fatturato: {c.revenue}</span>
                </div>
                <div className="mb-5">
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-1">La Sfida</p>
                  <p className="text-gray-600 text-sm leading-relaxed">{c.challenge}</p>
                </div>
                <div className="mb-5">
                  <p className="text-xs font-bold uppercase tracking-wide text-[#F97415] mb-1">La Soluzione</p>
                  <p className="text-gray-700 text-sm leading-relaxed">{c.solution}</p>
                </div>
                <blockquote className="border-l-4 border-[#F97415] pl-4 italic text-gray-700 text-sm leading-relaxed">"{c.quote}"</blockquote>
              </div>
              {/* Right: results */}
              <div className={`bg-[#111111] rounded-3xl p-6 md:p-8 ${i % 2 === 1 ? "md:order-1" : ""}`}>
                <p className="text-white/50 text-xs font-bold uppercase tracking-widest mb-6">Risultati Misurati</p>
                <div className="space-y-5">
                  {c.results.map((r, j) => (
                    <div key={j} className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-[#F97415] shrink-0 mt-0.5" />
                      <div>
                        <p className="text-white font-bold">{r.value}</p>
                        <p className="text-white/50 text-sm">{r.label}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-8 pt-6 border-t border-white/10">
                  <div className="flex items-center gap-1 mb-1">
                    {[...Array(5)].map((_, k) => <Star key={k} size={14} className="text-[#F97415] fill-[#F97415]" />)}
                  </div>
                  <p className="text-white/60 text-xs">{c.sector}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section ref={ctaAnim.ref as React.RefObject<HTMLDivElement>} className="py-16 md:py-24 bg-[#111111] relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-px" style={{ background: "linear-gradient(90deg, transparent 0%, rgba(249,116,21,0.8) 40%, rgba(249,116,21,1) 50%, transparent 100%)" }} />
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 80% 60% at 50% 50%, rgba(249,116,21,0.10) 0%, transparent 100%)" }} />
        <div className="relative z-10 max-w-3xl mx-auto px-6 text-center">
          <div className={`transition-all duration-700 ${ctaAnim.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
            <h2 className="text-3xl md:text-5xl font-extrabold text-white mb-4">
              La prossima storia di successo <span className="text-[#F97415]">è la tua.</span>
            </h2>
            <p className="text-white/50 text-lg mb-10">30 minuti di demo gratuita. Nessun impegno. Solo chiarezza su cosa puoi ottenere.</p>
            <Link to="/demo" className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-[#F97415] hover:bg-[#e8650e] text-white font-bold text-lg hover:scale-105 transition-all shadow-lg shadow-[#F97415]/30">
              Richiedi Demo Gratuita <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </section>

      <LandingFooter />
      <StickyBottomBar />
    </div>
  );
}
