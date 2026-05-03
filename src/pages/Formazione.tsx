import React from "react";
import { useSEO } from "@/hooks/useSEO";
import { JsonLd } from "@/components/seo/JsonLd";
import { HubSeoSchema } from "@/components/seo/HubSeoSchema";
import { Link } from "react-router-dom";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";
import StickyBottomBar from "@/components/landing/StickyBottomBar";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { BookOpen, Play, MessageCircle, HelpCircle, TrendingUp, Users, ArrowRight, Clock, ChevronDown } from "lucide-react";


const guides = [
  {
    category: "Avvio Rapido",
    title: "Da zero a operativo in 48 ore",
    desc: "Il percorso completo per chi inizia: configurazione account, import dati da Excel, apertura primo cantiere, impostazione budget commessa. Segui questa guida e sei operativo domani.",
    readTime: "8 min",
    level: "Principiante",
    result: "Operativo in 48h",
  },
  {
    category: "Cantieri & Margini",
    title: "Controllo margini reali per commessa — guida pratica",
    desc: "Come impostare il budget di cantiere, registrare i costi in corso d'opera e leggere il SAL aggiornato in tempo reale. Smetti di scoprire le perdite a lavori finiti.",
    readTime: "12 min",
    level: "Intermedio",
    result: "Margini visibili dal giorno 1",
  },
  {
    category: "Finanza",
    title: "Previsione di cassa a 90 giorni",
    desc: "Come configurare il forecast automatico, leggere le previsioni e intervenire prima che la cassa si esaurisca. La funzionalità che i nostri clienti usano di più — e quasi nessuno conosce.",
    readTime: "10 min",
    level: "Intermedio",
    result: "Zero sorprese di cassa",
  },
  {
    category: "HR & Presenze",
    title: "Gestione presenze cantiere",
    desc: "Come configurare le timbrature dal telefono, impostare il costo orario per ruolo e imputare le ore alle commesse giuste. Scopri quanto costa davvero ogni squadra per ogni cantiere.",
    readTime: "9 min",
    level: "Intermedio",
    result: "Costo manodopera sotto controllo",
  },
  {
    category: "Fatturazione",
    title: "Fattura elettronica SDI senza errori",
    desc: "Come emettere, ricevere e riconciliare fatture elettroniche SDI direttamente dalla piattaforma. Integrazione Aruba, gestione note di credito, archivio automatico.",
    readTime: "11 min",
    level: "Principiante",
    result: "Fatturazione SDI in 3 minuti",
  },
  {
    category: "App Mobile",
    title: "App cantiere per operai e capocantiere",
    desc: "Come configurare l'app per i tuoi operai, impostare i cantieri visibili, gestire le timbrature offline e raccogliere foto e rapportini giornalieri dal telefono.",
    readTime: "7 min",
    level: "Principiante",
    result: "Team operativo in 1 ora",
  },
];

const videos = [
  { title: "Tour completo — dalla home al cantiere in 15 minuti", duration: "15:32", category: "Overview", result: "Panoramica completa" },
  { title: "Aprire il primo cantiere e impostare il budget", duration: "8:14", category: "Cantieri", result: "Primo cantiere live" },
  { title: "Preventivo professionale in 10 minuti", duration: "9:45", category: "Preventivi", result: "Preventivo firmato digitalmente" },
  { title: "App mobile per il capocantiere — timbrature e rapportini", duration: "6:22", category: "Mobile", result: "Team operativo" },
  { title: "Dashboard margini: come leggere i dati in tempo reale", duration: "7:18", category: "Margini", result: "Controllo margini live" },
  { title: "Fattura elettronica SDI", duration: "5:40", category: "Fatturazione", result: "Prima fattura SDI inviata" },
];

const learningPaths = [
  {
    icon: "🚀",
    title: "Avvio Rapido",
    subtitle: "Per chi inizia da zero",
    duration: "2 ore totali",
    steps: [
      "Configurazione account e import dati da Excel",
      "Apertura primo cantiere con budget e squadra",
      "Prima fattura elettronica SDI",
      "App mobile configurata per il team",
    ],
    result: "Sei operativo in 48 ore",
    level: "Principiante",
    levelColor: "bg-green-100 text-green-700",
    cta: "Inizia dal percorso base",
  },
  {
    icon: "📊",
    title: "Controllo di Gestione",
    subtitle: "Per chi vuole i margini reali",
    duration: "4 ore totali",
    steps: [
      "Budget commessa e SAL in tempo reale",
      "Costo manodopera per cantiere (timbrature + costo orario)",
      "Previsionale di cassa a 90 giorni",
      "Report margini settimanale automatico",
    ],
    result: "Sai ogni settimana se guadagni o perdi",
    level: "Intermedio",
    levelColor: "bg-blue-100 text-blue-700",
    cta: "Approfondisci il controllo gestione",
  },
  {
    icon: "⚡",
    title: "Impresa Avanzata",
    subtitle: "Per chi ha già la base e vuole scalare",
    duration: "6 ore totali",
    steps: [
      "CRM clienti + pipeline commerciale",
      "Gestione subappaltatori e contratti",
      "Modulo HR: contratti, buste paga, DPI",
      "AI insights: anomalie, previsioni, alert automatici",
    ],
    result: "Gestisci 2x i cantieri con lo stesso team",
    level: "Avanzato",
    levelColor: "bg-purple-100 text-purple-700",
    cta: "Attiva il percorso avanzato",
  },
];

const masterclasses = [
  {
    title: "Controllo Margini Live — con Florin Andriciuc",
    desc: "60 minuti in diretta: come impostare il controllo di gestione sulla tua impresa edile, leggere i margini reali e intervenire prima che sia troppo tardi. Q&A finale con casi reali.",
    date: "Ogni primo martedì del mese",
    duration: "60 min",
    spots: "Max 20 partecipanti",
    level: "Tutti i livelli",
    free: true,
  },
  {
    title: "Fatturazione Elettronica SDI: guida avanzata",
    desc: "Dalla fattura attiva alla passiva, note di credito, pro-forma, gestione SDI, integrazione contabile. Tutto quello che non trovi nei tutorial base.",
    date: "Ogni terzo mercoledì del mese",
    duration: "45 min",
    spots: "Max 30 partecipanti",
    level: "Intermedio",
    free: true,
  },
  {
    title: "Workshop: Primo Cantiere da Zero",
    desc: "Sessione pratica 1:1 con il nostro team: apriamo insieme il tuo primo cantiere reale su EiC, configuriamo budget, squadre e SAL. Esci con il sistema operativo.",
    date: "Su prenotazione — entro 48h",
    duration: "90 min",
    spots: "1:1 — illimitato",
    level: "Principiante",
    free: true,
  },
];

const faqs = [
  {
    q: "Quanto tempo ci vuole per imparare a usare il gestionale?",
    a: "Per le funzioni base (cantieri, preventivi, fatture) la maggior parte dei titolari edili è operativa in 1-2 giorni. Per il controllo di gestione avanzato (margini per commessa, previsionale di cassa, HR) di solito bastano 1-2 settimane di utilizzo regolare. Il nostro team di onboarding ti accompagna nelle prime 48 ore.",
  },
  {
    q: "Devo essere esperto di informatica?",
    a: "No. Edilizia in Cloud è stato progettato per imprenditori edili, non per informatici. L'interfaccia usa il linguaggio del cantiere. Se sai usare WhatsApp, sai usare l'app mobile di EiC. Il 94% dei nostri clienti non aveva mai usato un gestionale prima.",
  },
  {
    q: "Le guide sono aggiornate alle ultime versioni del software?",
    a: "Sì. Ogni guida viene aggiornata entro 48 ore da ogni rilascio di nuove funzionalità. Se trovi una discrepanza, segnalala via chat — la correggiamo in giornata.",
  },
  {
    q: "Posso ricevere formazione personalizzata per la mia squadra?",
    a: "Sì. Offriamo sessioni di formazione online personalizzate per team da 2 a 10 persone. Il costo è incluso nel piano Professionista e Impresa AI. Per il piano Gestionale è disponibile come add-on.",
  },
  {
    q: "Le masterclass sono davvero gratis?",
    a: "Sì, completamente. Le masterclass mensili sono aperte a tutti — clienti attivi, in prova o anche solo curiosi. Non vendiamo nulla durante la sessione. L'obiettivo è che tu esca con qualcosa di applicabile subito nella tua impresa.",
  },
];

export default function Formazione() {
  const heroAnim = useScrollAnimation();
  const guidesAnim = useScrollAnimation();
  const videosAnim = useScrollAnimation();
  const faqAnim = useScrollAnimation();

  useSEO({
    title: "EiC Academy — Formazione e Guide per Imprese Edili",
    description: "Guide pratiche, video tutorial, masterclass dal vivo e supporto 1:1 per imparare a usare il gestionale edilizia. Chi padroneggia EiC guadagna il 23% in…",
    canonical: "/formazione",
    keywords: "formazione software edilizia, guide gestionale edilizia, tutorial edilizia in cloud, come usare software edilizia, onboarding gestionale cantieri, video tutorial software impresa edile, masterclass edilizia, academy gestionale cantieri",
  });

  return (
    <div className="min-h-screen bg-white text-[#111111] pb-24 overflow-x-hidden">
      <HubSeoSchema
        pageName="Formazione"
        pagePath="/formazione"
        pageDescription="Webinar, corsi e tutorial gratuiti per imprese edili: come gestire cantieri, fatturazione elettronica e HR cassa edile."
        breadcrumbs={[
          { name: "Home", url: "/" },
          { name: "Formazione", url: "/formazione" },
        ]}
      />
      <JsonLd id="jsonld-breadcrumb-formazione" data={{
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.ediliziaincloud.com/" },
          { "@type": "ListItem", "position": 2, "name": "Formazione", "item": "https://www.ediliziaincloud.com/formazione" }
        ]
      }} />

      <LandingNavbar />

      {/* ── HERO ── */}
      <section className="relative overflow-hidden pt-20 md:pt-32 pb-16 bg-[#111111]">
        <div className="absolute top-0 left-0 right-0 h-px" style={{ background: "linear-gradient(90deg, transparent 0%, rgba(249,116,21,0.8) 40%, rgba(249,116,21,1) 50%, transparent 100%)" }} />
        <div className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full blur-[150px] pointer-events-none" style={{ background: "radial-gradient(circle, rgba(249,116,21,0.18) 0%, transparent 65%)" }} />
        <div ref={heroAnim.ref as React.RefObject<HTMLDivElement>} className="relative z-10 max-w-4xl mx-auto px-6 text-center">
          <div className={`transition-all duration-700 ${heroAnim.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
            <span className="inline-flex items-center gap-2 mb-6 px-4 py-2 rounded-full border border-[#F97415]/40 bg-[#F97415]/10 text-[#F97415] text-xs font-bold uppercase tracking-widest">
              <BookOpen size={12} /> EiC Academy
            </span>
            <h1 className="text-3xl sm:text-5xl font-extrabold text-white mb-4 leading-tight">
              Impara a usarlo.<br />
              <span className="text-[#F97415]">Inizia a guadagnare di più.</span>
            </h1>
            <p className="text-white/60 text-lg max-w-2xl mx-auto mb-8">
              Chi padroneggia il gestionale guadagna in media il 23% in più per cantiere.
              Guide pratiche, video, masterclass dal vivo e supporto 1:1 — tutto in italiano.
            </p>
            <div className="flex flex-wrap justify-center gap-6 mb-6">
              {[
                { Icon: BookOpen, label: "6 Guide pratiche" },
                { Icon: Play, label: "6 Video tutorial" },
                { Icon: Users, label: "Masterclass mensili" },
                { Icon: MessageCircle, label: "Supporto 1:1" },
              ].map(({ Icon, label }, i) => (
                <span key={i} className="flex items-center gap-2 text-white/60 text-sm">
                  <Icon size={14} className="text-[#F97415]" />{label}
                </span>
              ))}
            </div>
            <p className="text-[#F97415] text-sm font-bold">
              ✓ Tutto incluso nel tuo piano — nessun costo aggiuntivo
            </p>
          </div>
        </div>
      </section>

      {/* ── PERCORSI DI APPRENDIMENTO ── */}
      <section className="py-16 md:py-24 bg-white">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12">
            <span className="inline-block mb-3 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest text-[#F97415] bg-[#F97415]/10 border border-[#F97415]/20">
              Da dove vuoi partire?
            </span>
            <h2 className="text-2xl md:text-4xl font-extrabold text-[#111111] mb-3">Scegli il tuo percorso</h2>
            <p className="text-gray-500 text-lg max-w-2xl mx-auto">
              Non tutti partono dallo stesso punto. Scegli il percorso giusto per la tua situazione — poi avanza al prossimo livello quando sei pronto.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {learningPaths.map((path, i) => (
              <div key={i} className="rounded-2xl border-2 border-gray-200 hover:border-[#F97415]/40 hover:shadow-lg transition-all duration-300 overflow-hidden group">
                <div className="bg-[#f8f9fa] p-6 border-b border-gray-200">
                  <div className="text-4xl mb-3">{path.icon}</div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${path.levelColor}`}>{path.level}</span>
                    <span className="text-gray-400 text-xs flex items-center gap-1"><Clock size={11} />{path.duration}</span>
                  </div>
                  <h3 className="font-extrabold text-[#111111] text-xl">{path.title}</h3>
                  <p className="text-gray-500 text-sm mt-1">{path.subtitle}</p>
                </div>
                <div className="p-6 bg-white flex flex-col flex-1">
                  <ul className="space-y-2 mb-5">
                    {path.steps.map((step, j) => (
                      <li key={j} className="flex items-start gap-2 text-sm text-gray-600">
                        <span className="text-[#F97415] mt-0.5 flex-shrink-0">✓</span>
                        {step}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-auto pt-4 border-t border-gray-100">
                    <p className="text-[#111111] font-bold text-sm mb-3">🎯 {path.result}</p>
                    <Link to="/demo" className="block text-center px-4 py-2.5 rounded-xl bg-[#111111] text-white text-sm font-bold hover:bg-[#F97415] transition-colors">
                      {path.cta}
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── GUIDE SCRITTE ── */}
      <section className="py-16 md:py-24 bg-[#f8f9fa]">
        <div ref={guidesAnim.ref as React.RefObject<HTMLDivElement>} className="max-w-6xl mx-auto px-6">
          <div className={`text-center mb-12 transition-all duration-700 ${guidesAnim.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
            <span className="inline-block mb-3 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest text-[#F97415] bg-[#F97415]/10 border border-[#F97415]/20">Guide Pratiche</span>
            <h2 className="text-2xl md:text-4xl font-extrabold text-[#111111]">Leggi. Applica subito. Vedi i risultati.</h2>
            <p className="text-gray-500 text-lg mt-2">Ogni guida finisce con qualcosa che puoi fare entro 30 minuti.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {guides.map((g, i) => (
              <div key={i}
                className={`p-6 rounded-2xl border border-gray-200 bg-white hover:border-[#F97415]/40 hover:shadow-md transition-all duration-500 group cursor-pointer flex flex-col ${guidesAnim.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
                style={{ transitionDelay: `${100 + i * 80}ms` }}>
                <span className="inline-block mb-3 px-2 py-0.5 bg-[#F97415]/10 text-[#F97415] text-xs font-bold rounded">{g.category}</span>
                <h3 className="font-bold text-[#111111] text-base mb-2 group-hover:text-[#F97415] transition-colors flex-1">{g.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed mb-4">{g.desc}</p>
                <div className="pt-4 border-t border-gray-100">
                  <div className="flex items-center justify-between mb-2">
                    <span className="flex items-center gap-1.5 text-gray-400 text-xs"><Clock size={12} />{g.readTime}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${g.level === "Principiante" ? "bg-green-50 text-green-700" : "bg-blue-50 text-blue-700"}`}>{g.level}</span>
                  </div>
                  <p className="text-[#F97415] text-xs font-bold">🎯 {g.result}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── VIDEO TUTORIAL ── */}
      <section className="py-16 md:py-24 bg-white">
        <div ref={videosAnim.ref as React.RefObject<HTMLDivElement>} className="max-w-6xl mx-auto px-6">
          <div className={`text-center mb-12 transition-all duration-700 ${videosAnim.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
            <span className="inline-block mb-3 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest text-[#F97415] bg-[#F97415]/10 border border-[#F97415]/20">Video Tutorial</span>
            <h2 className="text-2xl md:text-4xl font-extrabold text-[#111111]">Guarda. Replica subito.</h2>
            <p className="text-gray-500 text-lg mt-2">Niente teoria. Solo schermo condiviso — vedi esattamente cosa fare, clic per clic.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {videos.map((v, i) => (
              <Link key={i} to="/demo"
                className={`group block rounded-2xl overflow-hidden border border-gray-200 hover:border-[#F97415]/40 hover:shadow-md transition-all duration-500 ${videosAnim.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
                style={{ transitionDelay: `${100 + i * 80}ms` }}>
                <div className="relative bg-[#111111] h-36 flex items-center justify-center">
                  <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-[#F97415] group-hover:scale-110 transition-all duration-300">
                    <Play size={20} className="text-white ml-1" fill="currentColor" />
                  </div>
                  <span className="absolute bottom-3 right-3 px-2 py-0.5 bg-black/60 text-white text-xs rounded">{v.duration}</span>
                  <span className="absolute top-3 left-3 px-2 py-0.5 bg-[#F97415]/80 text-white text-xs font-bold rounded">{v.category}</span>
                </div>
                <div className="p-4 bg-white">
                  <p className="font-semibold text-[#111111] text-sm group-hover:text-[#F97415] transition-colors mb-1">{v.title}</p>
                  <p className="text-[#F97415] text-xs font-bold">🎯 {v.result}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── MASTERCLASS DAL VIVO ── */}
      <section className="py-16 md:py-24 bg-[#111111] relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-px" style={{ background: "linear-gradient(90deg, transparent 0%, rgba(249,116,21,0.8) 40%, rgba(249,116,21,1) 50%, transparent 100%)" }} />
        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 70% 50% at 50% 50%, rgba(249,116,21,0.09) 0%, transparent 100%)" }} />
        <div className="relative z-10 max-w-5xl mx-auto px-6">
          <div className="text-center mb-12">
            <span className="inline-flex items-center gap-2 mb-4 px-4 py-2 rounded-full border border-[#F97415]/40 bg-[#F97415]/10 text-[#F97415] text-xs font-bold uppercase tracking-widest">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-ping" />
              Masterclass dal Vivo — Gratis
            </span>
            <h2 className="text-2xl md:text-4xl font-extrabold text-white mb-3">
              Impara dai migliori. <span className="text-[#F97415]">Gratis.</span>
            </h2>
            <p className="text-white/60 text-lg max-w-2xl mx-auto">
              Sessioni live mensili con Florin Andriciuc e il team EiC. Casi reali, Q&A, problemi concreti.
              Esci ogni volta con qualcosa di applicabile entro 24 ore.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {masterclasses.map((m, i) => (
              <div key={i} className="rounded-2xl bg-white/[0.05] border border-white/10 hover:border-[#F97415]/40 p-6 transition-all duration-300">
                <div className="flex items-center justify-between mb-4">
                  <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs font-bold rounded-full">
                    {m.free ? "GRATUITO" : "A pagamento"}
                  </span>
                  <span className="text-white/40 text-xs">{m.level}</span>
                </div>
                <h3 className="text-white font-bold text-base mb-2 leading-snug">{m.title}</h3>
                <p className="text-white/50 text-sm leading-relaxed mb-5">{m.desc}</p>
                <div className="space-y-1.5 pt-4 border-t border-white/10">
                  {[
                    { label: "📅 Data", value: m.date },
                    { label: "⏱ Durata", value: m.duration },
                    { label: "👥 Posti", value: m.spots },
                  ].map((item, j) => (
                    <p key={j} className="text-white/40 text-xs">
                      <span className="font-semibold text-white/60">{item.label}:</span> {item.value}
                    </p>
                  ))}
                </div>
                <Link to="/demo" className="block text-center mt-5 px-4 py-2.5 rounded-xl bg-[#F97415] text-white text-sm font-bold hover:bg-[#e8650e] transition-colors">
                  Prenota il tuo posto
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SUPPORTO ── */}
      <section className="py-16 md:py-20 bg-white">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-2xl md:text-4xl font-extrabold text-[#111111] text-center mb-4">Hai bisogno di più aiuto?</h2>
          <p className="text-gray-500 text-lg text-center mb-12 max-w-2xl mx-auto">
            Non ti lasciamo da solo. Mai. Il supporto è incluso nel tuo piano — non è un extra.
          </p>
          <div className="grid sm:grid-cols-3 gap-6">
            {[
              {
                Icon: MessageCircle,
                title: "Chat Live",
                desc: "Risposta entro 2 ore in orario lavorativo. In italiano. Da persone reali — non da bot.",
                badge: "Incluso in tutti i piani",
              },
              {
                Icon: Users,
                title: "Onboarding 1:1",
                desc: "Sessione dedicata di 90 minuti con il nostro team: configuriamo insieme cantieri, squadre, budget e prima fattura.",
                badge: "Incluso — entro 48h dall'attivazione",
              },
              {
                Icon: TrendingUp,
                title: "Consulenza Margini",
                desc: "Sessione con un consulente per impostare il controllo di gestione sulla tua tipologia di impresa. Con i tuoi numeri reali.",
                badge: "Incluso nel piano Professionista",
              },
            ].map(({ Icon, title, desc, badge }, i) => (
              <div key={i} className="p-6 rounded-2xl border-2 border-gray-200 hover:border-[#F97415]/40 hover:shadow-md transition-all duration-300">
                <div className="w-12 h-12 rounded-xl bg-[#F97415]/10 flex items-center justify-center mb-4">
                  <Icon className="w-6 h-6 text-[#F97415]" />
                </div>
                <h3 className="text-[#111111] font-bold mb-2">{title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed mb-4">{desc}</p>
                <span className="inline-block px-3 py-1 bg-green-50 text-green-700 text-xs font-bold rounded-full border border-green-100">
                  ✓ {badge}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── GARANZIE ── */}

      {/* ── FAQ ── */}
      <section className="py-16 md:py-24 bg-white">
        <div ref={faqAnim.ref as React.RefObject<HTMLDivElement>} className="max-w-3xl mx-auto px-6">
          <h2 className={`text-2xl md:text-4xl font-extrabold text-center mb-12 transition-all duration-700 ${faqAnim.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
            Domande sulla Formazione
          </h2>
          <div className="space-y-4">
            {faqs.map((f, i) => (
              <div key={i} className="border border-gray-200 rounded-xl p-6 hover:border-[#F97415]/30 transition-colors">
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

      {/* ── CTA FINALE ── */}
      <section className="py-16 bg-[#111111] relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-px" style={{ background: "linear-gradient(90deg, transparent 0%, rgba(249,116,21,0.8) 40%, rgba(249,116,21,1) 50%, transparent 100%)" }} />
        <div className="relative z-10 max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-2xl md:text-4xl font-extrabold text-white mb-4">
            La formazione non serve a niente<br />
            <span className="text-[#F97415]">finché non inizi a usarlo.</span>
          </h2>
          <p className="text-white/60 mb-8">
            31 giorni gratis. Onboarding 1:1 incluso. Setup in 48 ore.
          </p>
          <Link to="/demo" className="inline-flex items-center gap-2 px-8 py-4 bg-[#F97415] text-white font-bold text-lg rounded-xl hover:scale-105 transition-all shadow-lg shadow-[#F97415]/30">
            Inizia la prova gratuita <ArrowRight size={18} />
          </Link>
          <p className="text-white/25 text-xs mt-4">Cancella quando vuoi. Nessun obbligo.</p>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <JsonLd id="jsonld-faq-formazione" data={{
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
          {
            "@type": "Question",
            "name": "La formazione è inclusa nel costo dell'abbonamento?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Sì, per tutti i piani è incluso l'onboarding guidato con il nostro team, accesso all'academy con video tutorial e documentazione scritta. Il piano Impresa AI include sessioni live personalizzate illimitate con il proprio Customer Success Manager dedicato."
            }
          },
          {
            "@type": "Question",
            "name": "Quanto tempo ci vuole per formare il team sull'uso del gestionale?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Il titolare o il responsabile amministrativo diventa operativo in 4-8 ore. Gli operai e i capicantierie imparano le funzioni mobile in 1-2 ore. Offriamo sessioni di formazione sul campo, direttamente in cantiere o in ufficio, per accelerare l'adozione del team."
            }
          },
          {
            "@type": "Question",
            "name": "La formazione è disponibile in presenza o solo online?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Offriamo formazione sia online (video call, webinar registrati, academy on-demand) sia in presenza per i clienti Impresa AI che lo richiedono. Le sessioni online sono registrate e disponibili in replay per il team."
            }
          },
          {
            "@type": "Question",
            "name": "Cosa succede se cambia il personale e devo formare nuovi dipendenti?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "L'accesso all'academy e ai video tutorial è permanente per tutta la durata dell'abbonamento. I nuovi dipendenti possono formarsi autonomamente con i materiali esistenti. Per i piani Professionista e Impresa AI è possibile richiedere sessioni di re-onboarding aggiuntive."
            }
          }
        ]
      }} />

      <section className="py-16 bg-gray-50">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-[#111111] mb-8 text-center">Domande frequenti sulla formazione</h2>
          <div className="space-y-3">
            {[
              {
                q: "La formazione è inclusa nel costo dell'abbonamento?",
                a: "Sì, per tutti i piani è incluso l'onboarding guidato, l'academy con video tutorial e documentazione scritta. Il piano Impresa AI include sessioni live personalizzate con il proprio Customer Success Manager."
              },
              {
                q: "Quanto tempo ci vuole per formare il team?",
                a: "Il titolare diventa operativo in 4-8 ore. Gli operai e i capicantierie imparano le funzioni mobile in 1-2 ore. Offriamo sessioni di formazione sul campo, direttamente in cantiere o in ufficio."
              },
              {
                q: "La formazione è disponibile in presenza o solo online?",
                a: "Offriamo formazione sia online (video call, webinar registrati, academy on-demand) sia in presenza per i clienti Enterprise. Le sessioni online sono registrate e disponibili in replay."
              },
              {
                q: "Cosa succede se cambia il personale e devo formare nuovi dipendenti?",
                a: "L'accesso all'academy e ai video tutorial è permanente per tutta la durata dell'abbonamento. I nuovi dipendenti si formano autonomamente con i materiali esistenti, o su richiesta con sessioni aggiuntive."
              },
            ].map(({ q, a }) => (
              <details key={q} className="bg-white rounded-xl border border-gray-200 group">
                <summary className="flex items-center justify-between px-5 py-4 cursor-pointer font-medium text-[#111111] list-none gap-4">
                  <span>{q}</span>
                  <ChevronDown className="w-5 h-5 text-[#F97415] flex-shrink-0 group-open:rotate-180 transition-transform" />
                </summary>
                <p className="px-5 pb-4 text-[#111111]/70 text-sm leading-relaxed">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <LandingFooter />
      <StickyBottomBar />
    </div>
  );
}
