import React from "react";
import { useSEO } from "@/hooks/useSEO";
import { JsonLd } from "@/components/seo/JsonLd";
import { Link } from "react-router-dom";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";
import StickyBottomBar from "@/components/landing/StickyBottomBar";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { BookOpen, Play, MessageCircle, HelpCircle, TrendingUp, Users, ArrowRight, Clock } from "lucide-react";


const guides = [
  {
    category: "Iniziare",
    title: "Come avviare Edilizia in Cloud in 48h",
    desc: "Guida passo-passo per configurare il tuo account, importare dati e aprire il primo cantiere in meno di 2 giorni.",
    readTime: "8 min",
    level: "Principiante",
  },
  {
    category: "Cantieri",
    title: "Controllo margini reali per commessa",
    desc: "Come impostare il budget di cantiere, tracciare i costi reali e leggere il margine aggiornato al minuto.",
    readTime: "12 min",
    level: "Intermedio",
  },
  {
    category: "Finanza",
    title: "Previsione liquidità a 90 giorni",
    desc: "Come configurare il forecast di cassa automatico e interpretare le previsioni per evitare sorprese.",
    readTime: "10 min",
    level: "Intermedio",
  },
  {
    category: "Marketing",
    title: "Campagne WhatsApp per imprese edili",
    desc: "Come creare e inviare campagne WhatsApp ai tuoi clienti per generare lavori ricorrenti e referral.",
    readTime: "7 min",
    level: "Principiante",
  },
  {
    category: "HR",
    title: "Gestione presenze e costi manodopera",
    desc: "Configurare timbrature cantiere, calcolare il costo orario reale e imputare le ore alle commesse giuste.",
    readTime: "9 min",
    level: "Intermedio",
  },
  {
    category: "Fatturazione",
    title: "Fatturazione elettronica SDI: guida completa",
    desc: "Come emettere, ricevere e gestire fatture elettroniche SDI direttamente dalla piattaforma senza errori.",
    readTime: "11 min",
    level: "Principiante",
  },
];

const videos = [
  { title: "Tour completo della piattaforma — 15 min", duration: "15:32", category: "Overview" },
  { title: "Aprire il primo cantiere da zero", duration: "8:14", category: "Cantieri" },
  { title: "Fare un preventivo professionale in 10 minuti", duration: "9:45", category: "Preventivi" },
  { title: "App mobile per il capocantiere", duration: "6:22", category: "Mobile" },
  { title: "Dashboard AI: leggere gli insights", duration: "7:18", category: "AI" },
  { title: "Emettere la prima fattura elettronica", duration: "5:40", category: "Fatturazione" },
];

const faqs = [
  { q: "Quanto tempo ci vuole per imparare a usare il gestionale?", a: "La maggior parte degli utenti è operativa in 1-2 giorni. Il nostro team di onboarding ti accompagna passo-passo nelle prime 48 ore, con una chiamata dedicata e materiali personalizzati per la tua tipologia di impresa." },
  { q: "C'è un manuale utente scaricabile?", a: "Sì. Hai accesso a guide PDF scaricabili per ogni modulo, aggiornate ad ogni release. Trovi tutto nell'area Help del tuo account." },
  { q: "Posso ricevere formazione personalizzata per la mia squadra?", a: "Sì. Offriamo sessioni di formazione online personalizzate per team di 2-10 persone. Il costo è incluso nel piano Professional e Enterprise." },
  { q: "Le guide sono disponibili in italiano?", a: "Sì, tutto il materiale formativo è in italiano: guide, video, FAQ e supporto. Non troverai mai una risposta in inglese." },
];

export default function Formazione() {
  const heroAnim = useScrollAnimation();
  const guidesAnim = useScrollAnimation();
  const videosAnim = useScrollAnimation();
  const faqAnim = useScrollAnimation();

  useSEO({
    title: "Formazione e Guide — Edilizia in Cloud per Imprese Edili",
    description: "Guide pratiche, video tutorial e FAQ per imparare a usare il gestionale edilizia con AI. Tutto in italiano, pensato per imprenditori edili. Setup in 48h garantito.",
    canonical: "/formazione",
    keywords: "formazione software edilizia, guide gestionale edilizia, tutorial edilizia in cloud, come usare software edilizia, onboarding gestionale cantieri, video tutorial software impresa edile",
  });

  return (
    <div className="min-h-screen bg-white text-[#111111] pb-24 overflow-x-hidden">
      <JsonLd id="jsonld-breadcrumb-formazione" data={{
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://ediliziaincloud.com/home" },
          { "@type": "ListItem", "position": 2, "name": "Formazione", "item": "https://ediliziaincloud.com/formazione" }
        ]
      }} />
      <JsonLd id="jsonld-faq-formazione" data={{
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": faqs.map(({ q, a }) => ({ "@type": "Question", "name": q, "acceptedAnswer": { "@type": "Answer", "text": a } }))
      }} />

      <LandingNavbar />

      {/* Hero */}
      <section className="relative overflow-hidden pt-20 md:pt-32 pb-16 bg-[#111111]">
        <div className="absolute top-0 left-0 right-0 h-px" style={{ background: "linear-gradient(90deg, transparent 0%, rgba(249,116,21,0.8) 40%, rgba(249,116,21,1) 50%, transparent 100%)" }} />
        <div className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full blur-[150px]" style={{ background: "radial-gradient(circle, rgba(249,116,21,0.18) 0%, transparent 65%)" }} />
        <div ref={heroAnim.ref as React.RefObject<HTMLDivElement>} className="relative z-10 max-w-4xl mx-auto px-6 text-center">
          <div className={`transition-all duration-700 ${heroAnim.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
            <span className="inline-flex items-center gap-2 mb-6 px-4 py-2 rounded-full border border-[#F97415]/40 bg-[#F97415]/10 text-[#F97415] text-xs font-bold uppercase tracking-widest">
              <BookOpen size={12} /> Formazione & Guide
            </span>
            <h1 className="text-3xl sm:text-5xl font-extrabold text-white mb-4">
              Impara a usarlo. <span className="text-[#F97415]">Inizia a guadagnare.</span>
            </h1>
            <p className="text-white/60 text-lg max-w-2xl mx-auto mb-8">
              Guide pratiche, video tutorial e supporto dedicato. Tutto in italiano, tutto pensato per imprenditori edili. Nessun gergo tecnico.
            </p>
            <div className="flex flex-wrap justify-center gap-6">
              {[{ Icon: BookOpen, label: "6+ Guide scritte" }, { Icon: Play, label: "6 Video tutorial" }, { Icon: Users, label: "Supporto 1:1" }].map(({ Icon, label }, i) => (
                <span key={i} className="flex items-center gap-2 text-white/60 text-sm"><Icon size={14} className="text-[#F97415]" />{label}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Guide scritte */}
      <section className="py-16 md:py-24 bg-white">
        <div ref={guidesAnim.ref as React.RefObject<HTMLDivElement>} className="max-w-6xl mx-auto px-6">
          <div className={`text-center mb-12 transition-all duration-700 ${guidesAnim.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
            <span className="inline-block mb-3 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest text-[#F97415] bg-[#F97415]/10 border border-[#F97415]/20">Guide Pratiche</span>
            <h2 className="text-2xl md:text-4xl font-extrabold text-[#111111]">Leggi e applica subito</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {guides.map((g, i) => (
              <div key={i}
                className={`p-6 rounded-2xl border border-gray-200 hover:border-[#F97415]/40 hover:shadow-md transition-all duration-500 group cursor-pointer ${guidesAnim.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
                style={{ transitionDelay: `${100 + i * 80}ms` }}>
                <span className="inline-block mb-3 px-2 py-0.5 bg-[#F97415]/10 text-[#F97415] text-xs font-bold rounded">{g.category}</span>
                <h3 className="font-bold text-[#111111] text-base mb-2 group-hover:text-[#F97415] transition-colors">{g.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed mb-4">{g.desc}</p>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-gray-400 text-xs"><Clock size={12} />{g.readTime}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${g.level === "Principiante" ? "bg-green-50 text-green-700" : "bg-blue-50 text-blue-700"}`}>{g.level}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Video tutorial */}
      <section className="py-16 md:py-24 bg-[#f8f9fa]">
        <div ref={videosAnim.ref as React.RefObject<HTMLDivElement>} className="max-w-6xl mx-auto px-6">
          <div className={`text-center mb-12 transition-all duration-700 ${videosAnim.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
            <span className="inline-block mb-3 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest text-[#F97415] bg-[#F97415]/10 border border-[#F97415]/20">Video Tutorial</span>
            <h2 className="text-2xl md:text-4xl font-extrabold text-[#111111]">Guarda e impara in minuti</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {videos.map((v, i) => (
              <Link key={i} to="/demo"
                className={`group block rounded-2xl overflow-hidden border border-gray-200 hover:border-[#F97415]/40 hover:shadow-md transition-all duration-500 ${videosAnim.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
                style={{ transitionDelay: `${100 + i * 80}ms` }}>
                <div className="relative bg-[#111111] h-36 flex items-center justify-center">
                  <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-[#F97415] transition-colors">
                    <Play size={20} className="text-white ml-1" fill="currentColor" />
                  </div>
                  <span className="absolute bottom-3 right-3 px-2 py-0.5 bg-black/60 text-white text-xs rounded">{v.duration}</span>
                  <span className="absolute top-3 left-3 px-2 py-0.5 bg-[#F97415]/80 text-white text-xs font-bold rounded">{v.category}</span>
                </div>
                <div className="p-4 bg-white">
                  <p className="font-semibold text-[#111111] text-sm group-hover:text-[#F97415] transition-colors">{v.title}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Supporto */}
      <section className="py-16 md:py-20 bg-[#111111] relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-px" style={{ background: "linear-gradient(90deg, transparent 0%, rgba(249,116,21,0.8) 40%, rgba(249,116,21,1) 50%, transparent 100%)" }} />
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 70% 50% at 50% 50%, rgba(249,116,21,0.09) 0%, transparent 100%)" }} />
        <div className="relative z-10 max-w-5xl mx-auto px-6">
          <h2 className="text-2xl md:text-4xl font-extrabold text-white text-center mb-12">Hai bisogno di più?</h2>
          <div className="grid sm:grid-cols-3 gap-6">
            {[
              { Icon: MessageCircle, title: "Chat Live", desc: "Risposta in meno di 2 ore durante l'orario lavorativo. In italiano, da persone reali." },
              { Icon: Users, title: "Onboarding 1:1", desc: "Sessione dedicata di 2 ore con il nostro team per configurare tutto insieme." },
              { Icon: TrendingUp, title: "Consulenza Margini", desc: "Sessione con un consulente per impostare il controllo di gestione sulla tua tipologia di impresa." },
            ].map(({ Icon, title, desc }, i) => (
              <div key={i} className="p-6 rounded-2xl bg-white/[0.05] border border-white/10 hover:border-[#F97415]/40 transition-all">
                <div className="w-12 h-12 rounded-xl bg-[#F97415]/15 flex items-center justify-center mb-4">
                  <Icon className="w-6 h-6 text-[#F97415]" />
                </div>
                <h3 className="text-white font-bold mb-2">{title}</h3>
                <p className="text-white/50 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 md:py-24 bg-white">
        <div ref={faqAnim.ref as React.RefObject<HTMLDivElement>} className="max-w-3xl mx-auto px-6">
          <h2 className={`text-2xl md:text-4xl font-extrabold text-center mb-12 transition-all duration-700 ${faqAnim.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>Domande sulla Formazione</h2>
          <div className="space-y-4">
            {faqs.map((f, i) => (
              <div key={i} className="border border-gray-200 rounded-xl p-6">
                <div className="flex gap-3">
                  <HelpCircle className="w-5 h-5 text-[#F97415] shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-[#111111] mb-2">{f.q}</p>
                    <p className="text-gray-500 text-sm leading-relaxed">{f.a}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-[#F97415]">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-2xl md:text-4xl font-extrabold text-white mb-4">Pronto a iniziare?</h2>
          <p className="text-white/80 mb-8">Setup in 48h con il nostro team. 30 giorni gratis. Nessun impegno.</p>
          <Link to="/demo" className="inline-flex items-center gap-2 px-8 py-4 bg-white text-[#F97415] font-bold text-lg rounded-xl hover:scale-105 transition-all shadow-lg">
            Richiedi la tua Demo Gratuita <ArrowRight size={18} />
          </Link>
        </div>
      </section>

      <LandingFooter />
      <StickyBottomBar />
    </div>
  );
}
