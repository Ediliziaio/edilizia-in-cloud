import { useEffect, useRef } from "react";
import {
  ArrowRight,
  Banknote,
  Bot,
  BrainCircuit,
  Building2,
  Check,
  Clock3,
  FileText,
  LineChart,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  X,
} from "lucide-react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useSEO, SITE_URL } from "@/hooks/useSEO";
import { trackEvent } from "@/lib/track";
import { cn } from "@/lib/utils";
import { AgentiAziendali } from "@/app/landing/ai-imprenditore-edile/components/AgentiAziendali";
import { AziendaBrain } from "@/app/landing/ai-imprenditore-edile/components/AziendaBrain";
import { FadeUp } from "@/app/landing/ai-imprenditore-edile/components/FadeUp";
import { LandingFooter } from "@/app/landing/ai-imprenditore-edile/components/LandingFooter";

gsap.registerPlugin(useGSAP, ScrollTrigger);

const ctaHref = "/demo";

const painScenes = [
  {
    title: "Sabato mattina, ore 8.",
    text: "Sei in ufficio a rifare preventivi e conti di cantiere. Gli altri sono gia' fuori con la famiglia. Tu stai cercando di capire dove e' sparito il margine.",
  },
  {
    title: "Fatturato record. Utile ridicolo.",
    text: "Hai chiuso l'anno a 1.300.000 euro. A marzo il commercialista ti dice che l'utile e' 32.000 euro. Hai lavorato come un titolare, ma ti sei pagato meno di un dipendente.",
  },
  {
    title: "Quattro cantieri aperti. Un buco invisibile.",
    text: "Via Roma sembra andare bene. Poi scopri troppo tardi che materiali, ore extra e varianti hanno mangiato tutto. Il problema non era il lavoro: era non vederlo in tempo.",
  },
  {
    title: "Cassa stretta, testa piena.",
    text: "Domani devi pagare fornitori e stipendi. Le fatture in entrata forse arrivano a fine mese. Apri il conto e inizi a ragionare con l'ansia, non con i numeri.",
  },
  {
    title: "Il cantiere preso per fatturare.",
    text: "Hai detto si' a un lavoro da 180.000 euro per non lasciare ferma la squadra. Ora non sai piu' se stai guadagnando o se stai pagando per lavorare.",
  },
];

const aiActions = [
  { icon: FileText, title: "Legge fatture e DDT", text: "Imputa costi, materiali e documenti al cantiere giusto senza farti inseguire fogli e allegati." },
  { icon: LineChart, title: "Calcola il margine reale", text: "Ti mostra ogni giorno se una commessa sta creando utile o sta drenando cassa." },
  { icon: Clock3, title: "Prevede la cassa", text: "Ti avvisa prima che un buco diventi emergenza: incassi, fornitori, stipendi e scadenze." },
  { icon: Target, title: "Ti dice cosa fare", text: "Non solo dati: priorita', azioni, clienti da seguire, lavori da rifiutare, preventivi da correggere." },
  { icon: Bot, title: "Scrive bozze operative", text: "Preventivi, solleciti, email ai clienti e promemoria interni. Tu controlli e approvi." },
];

const resultDays = [
  {
    when: "Lunedi, 7:15",
    title: "Apri il telefono prima del caffe'.",
    text: "Vedi quattro cantieri: 28%, 31%, 19% e -3%. Quello rosso ha gia' tre azioni consigliate da Silvio. Alle 8 sei in cantiere, non a rincorrere Excel.",
  },
  {
    when: "Venerdi, 18:00",
    title: "Chiudi via Manzoni sapendo cosa hai guadagnato.",
    text: "Non aspetti marzo. Sai oggi se hai portato a casa 23.400 euro netti o se devi correggere il prossimo preventivo.",
  },
  {
    when: "Sabato",
    title: "Il Sistema lavora anche quando tu stacchi.",
    text: "Se arriva una fattura, una richiesta cliente o un rischio di cassa, Silvio lo collega al punto giusto e ti avvisa solo se serve davvero.",
  },
];

const modules = [
  ["Margini cantieri", "Sai quale cantiere ti fa guadagnare e quale sta bruciando soldi."],
  ["Cassa 30/60/90", "Vedi prima il buco di liquidita', non quando sei gia' in banca."],
  ["Preventivi AI", "Prepari offerte piu' veloci, con costi e margini sotto controllo."],
  ["DDT e magazzino", "Materiali, arrivi, lotti e uscite collegati alle commesse."],
  ["Giornale lavori", "Foto, rapportini e SAL dal campo, aggiornati senza carta."],
  ["CRM edilizia", "Lead, clienti, follow-up e opportunita' senza perdere richieste."],
  ["Squadre e HR", "Presenze, ferie, attivita' e responsabilita' operative chiare."],
  ["Documenti", "Contratti, fatture, POS, DURC e allegati sempre recuperabili."],
  ["Agenti AI", "19 specialisti coordinati da Silvio per leggere la tua azienda."],
];

const cases = [
  {
    company: "Brambilla Serramenti S.r.l.",
    person: "Maurizio Brambilla, Lecco",
    quote: "Ho scoperto che 3 cantieri mi stavano costando soldi. Li ho chiusi, ho rifatto i prezzi e ho smesso di accettare lavori sotto margine.",
    before: "Utile 38.000 euro su 1,4M",
    after: "Utile 318.000 euro dopo 12 mesi",
  },
  {
    company: "Costruzioni Marchesin & Figli",
    person: "Renato Marchesin, Treviso",
    quote: "Mio padre faceva i conti a memoria. Dopo 4 mesi mi ha chiesto come entrare nel Sistema. Ora guarda i margini dal telefono.",
    before: "Ritardi medi 35 giorni",
    after: "Ritardi medi 4 giorni",
  },
  {
    company: "Termoidraulica Cilento S.r.l.",
    person: "Antonio Cilento, Salerno",
    quote: "L'AI mi prepara i preventivi, io controllo e invio. Ho assunto un capocantiere e finalmente delego davvero.",
    before: "16 ore al giorno",
    after: "5 ore in meno al giorno",
  },
];

const plans = [
  { name: "Gestionale", price: "99 euro/mese", text: "Per imprese da 400K a 800K che vogliono vedere margini reali e cantieri sotto controllo." },
  { name: "Professionista", price: "197 euro/mese", text: "Per imprese da 800K a 2M con cassa, CRM, HR, commesse e controllo direzionale.", highlight: true },
  { name: "Impresa AI", price: "437 euro/mese", text: "Per aziende 2M+ che vogliono Silvio e gli agenti AI al lavoro sui dati aziendali." },
];

const faqs = [
  {
    q: "Come funziona davvero l'AI di Edilizia in Cloud?",
    a: "Legge fatture e documenti, collega costi e commesse, calcola margini, prevede la cassa e prepara bozze di preventivi, email e solleciti. Non sostituisce il titolare: gli toglie il lavoro ripetitivo.",
  },
  {
    q: "Serve cambiare commercialista?",
    a: "No. Il commercialista puo' avere accesso in sola lettura ai dati utili. Tu smetti di perdere ore a cercare documenti e lui lavora su informazioni ordinate.",
  },
  {
    q: "Quanto tempo richiede?",
    a: "Setup guidato in 48 ore e poi 2-3 ore al mese per leggere i numeri importanti. Il resto deve lavorare il Sistema, non tu.",
  },
  {
    q: "Cosa succede se non continuo dopo la prova?",
    a: "Nessun rinnovo automatico, nessuna carta richiesta. I dati restano tuoi e puoi esportarli.",
  },
];

const proofMetrics = [
  { value: "31 giorni", label: "per capire se il Sistema recupera piu' di quanto costa" },
  { value: "90 giorni", label: "di visione cassa, cantieri, margini e scadenze" },
  { value: "19 AI", label: "persone operative coordinate da Silvio sui tuoi dati" },
  { value: "0 Excel", label: "per leggere margini, DDT, fatture e priorita' reali" },
];

function CTAButton({ children, dark = false }: { children: string; dark?: boolean }) {
  return (
    <a
      href={ctaHref}
      className={cn(
        "group inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-md px-5 py-4 text-sm font-black shadow-xl transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-eic-orange sm:w-auto sm:px-6 sm:text-base",
        dark ? "bg-white text-eic-navy shadow-black/18 hover:bg-white/92" : "bg-eic-orange text-white shadow-eic-orange/25 hover:bg-orange-600",
      )}
    >
      {children}
      <ArrowRight className="h-5 w-5 transition group-hover:translate-x-1" strokeWidth={1.8} />
    </a>
  );
}

function JsonLd() {
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Edilizia in Cloud AI",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description: "Sistema con AI per imprese edili: margini reali, cassa a 90 giorni, cantieri, preventivi e documenti.",
      offers: { "@type": "Offer", price: "99", priceCurrency: "EUR" },
      aggregateRating: { "@type": "AggregateRating", ratingValue: "4.9", ratingCount: "100" },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqs.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Edilizia in Cloud",
      legalName: "Domus Group S.r.l.",
      vatID: "IT13132010961",
      url: SITE_URL,
    },
  ];
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />;
}

function HeroAI() {
  const ref = useRef<HTMLElement>(null);

  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.from(".ai-hero-copy > *", { opacity: 0, y: 26, duration: 0.7, stagger: 0.08, ease: "power3.out" });
      gsap.from(".ai-command-card", { opacity: 0, scale: 0.92, y: 34, duration: 0.8, stagger: 0.1, ease: "power3.out" });
      gsap.fromTo(".ai-scan", { xPercent: -140 }, { xPercent: 230, duration: 3.2, repeat: -1, ease: "none" });
      gsap.to(".ai-data-line", { strokeDashoffset: "-=240", duration: 7, repeat: -1, ease: "none" });
      gsap.to(".ai-orb", { y: (index) => (index % 2 ? 18 : -18), x: (index) => (index % 2 ? -8 : 8), duration: 4, repeat: -1, yoyo: true, ease: "sine.inOut", stagger: 0.2 });
    });
    return () => mm.revert();
  }, { scope: ref });

  return (
    <section ref={ref} id="hero" className="relative overflow-hidden bg-eic-navy px-5 pb-10 pt-14 text-white md:px-8 md:pb-24 md:pt-20 lg:pt-24">
      <div
        className="absolute inset-0 opacity-[0.13]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.12) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.12) 1px, transparent 1px)",
          backgroundSize: "54px 54px",
        }}
      />
      <div className="ai-orb absolute left-[-120px] top-24 h-[380px] w-[380px] rounded-full bg-eic-orange/18 blur-3xl" />
      <div className="ai-orb absolute right-[-90px] bottom-20 h-[420px] w-[420px] rounded-full bg-sky-400/14 blur-3xl" />

      <div className="relative mx-auto grid max-w-7xl gap-9 lg:grid-cols-[1.06fr_0.84fr] lg:items-center">
        <div className="ai-hero-copy">
          <div className="inline-flex max-w-full rounded-full border border-white/12 bg-white/[0.07] px-4 py-2 text-sm font-bold leading-5 text-white/74">
            150+ imprese edili italiane stanno gia' usando il Sistema
          </div>
          <p className="mt-6 text-xs font-black uppercase tracking-[0.18em] text-eic-orange md:text-sm md:tracking-[0.22em]">
            Il primo Sistema con AI per imprenditori edili italiani
          </p>
          <h1 className="mt-4 max-w-5xl text-[clamp(2.75rem,7vw,5.55rem)] font-black leading-[0.94] tracking-[-0.045em] md:tracking-[-0.06em]">
            Smetti di scoprire a marzo dove sono finiti i soldi.
          </h1>
          <p className="mt-5 max-w-2xl text-xl font-bold leading-8 text-white md:text-2xl md:leading-9">
            Finisci di lavorare a sensazione. Inizia a comandare i numeri.
          </p>
          <p className="mt-4 max-w-2xl text-base leading-7 text-white/68 md:text-lg md:leading-8">
            Edilizia in Cloud ti mostra il margine reale di ogni cantiere, la cassa a 90 giorni e dove stai perdendo soldi
            senza accorgertene. In tempo reale. Senza Excel. Senza aspettare il commercialista.
          </p>
          <div className="mt-7 flex flex-col gap-4 sm:flex-row sm:items-center">
            <CTAButton>Voglio vedere i numeri veri</CTAButton>
            <span className="text-sm font-semibold text-white/66">30 minuti con un consulente, gratis. Zero pressione.</span>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {["31 giorni gratis", "Senza carta", "Setup in 48 ore", "Dati in Europa"].map((item) => (
              <div key={item} className="rounded-md border border-white/10 bg-white/[0.055] px-4 py-3 text-sm font-bold text-white/78">
                <Check className="mr-2 inline h-4 w-4 text-eic-orange" strokeWidth={2} />
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="relative min-h-[560px] overflow-hidden rounded-md border border-white/14 bg-[#0b1728]/90 p-4 shadow-2xl shadow-black/30 md:min-h-[540px]">
          <div className="ai-scan pointer-events-none absolute inset-y-0 left-0 z-[2] w-28 bg-gradient-to-r from-transparent via-eic-orange/18 to-transparent mix-blend-screen" />
          <div className="absolute inset-x-4 top-4 z-[3] flex items-center justify-between rounded-md border border-white/10 bg-white/[0.06] px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-white/52 backdrop-blur">
            <span>Cruscotto AI live</span>
            <span className="rounded-full bg-eic-orange/18 px-2 py-1 text-eic-orange">Silvio</span>
          </div>
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <line className="ai-data-line" x1="10" y1="20" x2="90" y2="76" stroke="rgba(249,115,22,.55)" strokeWidth=".35" strokeDasharray="2 3" />
            <line className="ai-data-line" x1="16" y1="78" x2="82" y2="18" stroke="rgba(255,255,255,.20)" strokeWidth=".25" strokeDasharray="1 3" />
            <line className="ai-data-line" x1="50" y1="8" x2="50" y2="92" stroke="rgba(56,189,248,.28)" strokeWidth=".25" strokeDasharray="1.5 3" />
          </svg>

          <div className="ai-command-card absolute left-4 top-20 z-[4] w-[calc(100%-2rem)] rounded-md border border-white/12 bg-white p-4 text-eic-navy shadow-xl md:left-8 md:top-20 md:w-[430px] md:p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-eic-orange">Regia AI</p>
                <h2 className="mt-1 text-xl font-black md:text-2xl">Silvio, priorita' di oggi</h2>
              </div>
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700">Live</span>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-3">
              {[
                ["Margine", "-3%", "Via Roma"],
                ["Cassa 90g", "110K", "previsti"],
                ["Alert", "4", "da fare"],
              ].map(([label, value, sub]) => (
                <div key={label} className="rounded-md bg-eic-navy px-3 py-4 text-white">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/55">{label}</p>
                  <p className="mt-2 text-xl font-black md:text-2xl">{value}</p>
                  <p className="text-xs text-white/58">{sub}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-md border border-red-100 bg-red-50 p-4">
              <div className="flex items-start gap-3">
                <span className="mt-1 h-2.5 w-2.5 rounded-full bg-red-500" />
                <div>
                  <strong className="block">Commessa via Roma sotto target</strong>
                  <p className="mt-1 text-sm text-eic-muted">Materiali + ore extra stanno mangiando 11.800 euro di margine.</p>
                </div>
              </div>
            </div>
          </div>

          {[
            { label: "Fatture", icon: FileText, x: "8%", y: "62%" },
            { label: "Cantieri", icon: Building2, x: "59%", y: "13%" },
            { label: "Cassa", icon: Banknote, x: "61%", y: "76%" },
            { label: "Squadre", icon: Users, x: "15%", y: "86%" },
          ].map((node) => {
            const Icon = node.icon;
            return (
              <div
                key={node.label}
                className="ai-command-card absolute rounded-full border border-eic-orange/35 bg-eic-orange/12 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-eic-orange shadow-[0_0_34px_rgba(249,115,22,.18)] backdrop-blur"
                style={{ left: node.x, top: node.y }}
              >
                <Icon className="mr-2 inline h-4 w-4" strokeWidth={1.6} />
                {node.label}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function ProofStrip() {
  return (
    <section className="relative z-10 -mt-1 bg-eic-navy px-5 pb-10 text-white md:-mt-14 md:px-8">
      <div className="mx-auto grid max-w-7xl gap-3 rounded-md border border-white/12 bg-white/[0.06] p-3 shadow-2xl shadow-black/20 backdrop-blur md:grid-cols-4">
        {proofMetrics.map((metric) => (
          <div key={metric.value} className="ai-metric rounded-md border border-white/10 bg-black/14 p-4">
            <p className="text-2xl font-black text-eic-orange">{metric.value}</p>
            <p className="mt-2 text-sm font-semibold leading-6 text-white/68">{metric.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function PainSection() {
  return (
    <section id="dolore" className="bg-white px-5 py-20 md:px-8 lg:py-28">
      <div className="mx-auto max-w-6xl">
        <FadeUp className="max-w-3xl">
          <p className="text-sm font-black uppercase tracking-[0.22em] text-eic-orange">Ti riconosci?</p>
          <h2 className="mt-4 text-[clamp(2rem,9vw,5rem)] font-black leading-[1.03] tracking-[-0.035em] md:tracking-[-0.045em] text-eic-navy">
            Se si', non sei il problema. E' il metodo.
          </h2>
        </FadeUp>
        <div className="mt-12 divide-y divide-eic-border rounded-md border border-eic-border bg-white shadow-xl shadow-eic-navy/5">
          {painScenes.map((scene, index) => (
            <FadeUp key={scene.title} transition={{ delay: index * 0.035 }}>
              <article className="ai-motion-card grid gap-5 p-6 md:grid-cols-[120px_1fr] md:p-8">
                <span className="text-sm font-black uppercase tracking-[0.18em] text-eic-orange">Scena {String(index + 1).padStart(2, "0")}</span>
                <div>
                  <h3 className="text-2xl font-black text-eic-navy">{scene.title}</h3>
                  <p className="mt-3 max-w-3xl text-lg leading-8 text-eic-muted">{scene.text}</p>
                </div>
              </article>
            </FadeUp>
          ))}
        </div>
        <p className="mt-8 text-center text-xl font-black italic text-eic-navy">Non e' colpa tua. Nessuno ti ha mai dato uno strumento vero.</p>
      </div>
    </section>
  );
}

function SystemSection() {
  return (
    <section id="sistema" className="bg-eic-slate px-5 py-20 md:px-8 lg:py-28">
      <div className="mx-auto max-w-6xl">
        <FadeUp className="mx-auto max-w-4xl text-center">
          <p className="text-sm font-black uppercase tracking-[0.22em] text-eic-orange">La svolta</p>
          <h2 className="mt-4 text-[clamp(2rem,9vw,5.2rem)] font-black leading-[1.03] tracking-[-0.035em] md:tracking-[-0.045em] text-eic-navy">
            Non sei diventato titolare per fare anche il commercialista, l'analista e il direttore HR.
          </h2>
          <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-eic-muted">
            Tutto contemporaneamente. Tutto a mente. Tutto a sensazione. Funziona finche' l'azienda e' piccola. Da 500.000 euro in su, smette di funzionare.
          </p>
        </FadeUp>

        <div className="ai-motion-card mt-12 rounded-md border border-eic-orange/22 bg-white p-6 shadow-2xl shadow-eic-navy/8 md:p-8">
          <div className="grid gap-8 lg:grid-cols-[0.75fr_1fr] lg:items-center">
            <div>
              <span className="inline-flex rounded-full bg-eic-orange/10 px-4 py-2 text-sm font-black uppercase tracking-[0.16em] text-eic-orange">
                Non un gestionale
              </span>
              <h3 className="mt-5 text-3xl md:text-4xl font-black leading-tight text-eic-navy">
                E' un Sistema con AI che lavora 24 ore al giorno.
              </h3>
              <p className="mt-4 text-lg leading-8 text-eic-muted">
                Tu fai l'imprenditore. Il Sistema fa l'amministratore: collega dati, segnala rischi, prepara azioni.
              </p>
            </div>
            <div className="grid gap-3">
              {aiActions.map((action) => {
                const Icon = action.icon;
                return (
                  <div key={action.title} className="ai-flow-card rounded-md border border-eic-border bg-eic-slate p-4">
                    <div className="flex gap-4">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-eic-orange text-white">
                        <Icon className="h-5 w-5" strokeWidth={1.6} />
                      </span>
                      <div>
                        <h4 className="font-black text-eic-navy">{action.title}</h4>
                        <p className="mt-1 text-sm leading-6 text-eic-muted">{action.text}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ResultSection() {
  return (
    <section id="risultato" className="bg-white px-5 py-20 md:px-8 lg:py-28">
      <div className="mx-auto max-w-6xl">
        <FadeUp className="max-w-4xl">
          <p className="text-sm font-black uppercase tracking-[0.22em] text-eic-orange">Dopo 90 giorni</p>
          <h2 className="mt-4 text-[clamp(2rem,9vw,5rem)] font-black leading-[1.03] tracking-[-0.035em] md:tracking-[-0.045em] text-eic-navy">
            La settimana cambia quando i numeri lavorano prima di te.
          </h2>
        </FadeUp>
        <div className="mt-12 grid gap-4 lg:grid-cols-3">
          {resultDays.map((day, index) => (
            <FadeUp key={day.when} transition={{ delay: index * 0.06 }}>
              <article className="ai-motion-card h-full rounded-md border border-eic-border bg-white p-6 shadow-xl shadow-eic-navy/5">
                <span className="text-xs font-black uppercase tracking-[0.18em] text-eic-orange">{day.when}</span>
                <h3 className="mt-4 text-2xl font-black text-eic-navy">{day.title}</h3>
                <p className="mt-4 text-base leading-7 text-eic-muted">{day.text}</p>
              </article>
            </FadeUp>
          ))}
        </div>
        <div className="mt-10 rounded-md bg-eic-navy p-8 text-center text-white">
          <h3 className="text-2xl md:text-3xl font-black">Stesso fatturato. Molto piu' compenso.</h3>
          <p className="mx-auto mt-3 max-w-2xl text-white/68">Non perche' lavori di piu'. Perche' smetti di regalare soldi su cantieri presi male, costi nascosti e cassa gestita tardi.</p>
        </div>
      </div>
    </section>
  );
}

function EconomicsSection() {
  return (
    <section id="fomo" className="bg-eic-navy px-5 py-20 text-white md:px-8 lg:py-28">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <FadeUp>
            <p className="text-sm font-black uppercase tracking-[0.22em] text-eic-orange">Costo del non decidere</p>
            <h2 className="mt-4 text-[clamp(2rem,9vw,5rem)] font-black leading-[1.03] tracking-[-0.035em] md:tracking-[-0.045em]">
              Ogni mese senza Sistema e' un mese che non torna.
            </h2>
            <p className="mt-6 text-lg leading-8 text-white/68">
              Il fatturato che farai quest'anno e' gia' quasi scritto. Quello che porti a casa e' ancora da decidere.
            </p>
            <div className="mt-8">
              <CTAButton>Voglio vedere dove perdo soldi</CTAButton>
            </div>
          </FadeUp>

          <FadeUp transition={{ delay: 0.08 }}>
            <div className="ai-motion-card overflow-hidden rounded-md border border-white/12 bg-white text-eic-navy shadow-2xl shadow-black/25">
              {[
                ["Non conosci il margine reale di ogni cantiere", "5.000 - 30.000 euro"],
                ["Non hai previsionale di cassa", "3.000 - 15.000 euro"],
                ["Non controlli costi variabili", "10-25% di sprechi"],
                ["Accetti lavori in perdita", "margini negativi"],
                ["Ordini e SAL non collegati", "8-15 ore/settimana"],
              ].map(([label, value]) => (
                <div key={label} className="grid grid-cols-[1fr_auto] gap-4 border-b border-eic-border px-5 py-4 last:border-b-0">
                  <span className="font-bold text-eic-navy">{label}</span>
                  <strong className="text-right text-eic-orange">{value}</strong>
                </div>
              ))}
              <div className="bg-eic-orange px-5 py-5 text-white">
                <p className="text-sm font-bold uppercase tracking-[0.14em] text-white/70">Totale stimato</p>
                <p className="mt-1 text-3xl font-black">20.000 - 100.000 euro/anno</p>
              </div>
            </div>
          </FadeUp>
        </div>
      </div>
    </section>
  );
}

function ModulesSection() {
  return (
    <section id="moduli" className="bg-white px-5 py-20 md:px-8 lg:py-28">
      <div className="mx-auto max-w-6xl">
        <FadeUp className="mx-auto max-w-4xl text-center">
          <p className="text-sm font-black uppercase tracking-[0.22em] text-eic-orange">27 strumenti, un solo Sistema</p>
          <h2 className="mt-4 text-[clamp(2rem,9vw,5rem)] font-black leading-[1.03] tracking-[-0.035em] md:tracking-[-0.045em] text-eic-navy">
            Tutto quello che ti serve per smettere di lavorare a sensazione.
          </h2>
        </FadeUp>
        <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {modules.map(([title, text], index) => (
            <FadeUp key={title} transition={{ delay: index * 0.025 }}>
              <article className="ai-motion-card h-full rounded-md border border-eic-border bg-white p-5 shadow-lg shadow-eic-navy/5 transition hover:-translate-y-1 hover:border-eic-orange/40">
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-eic-orange/10 text-eic-orange">
                  <Sparkles className="h-5 w-5" strokeWidth={1.6} />
                </span>
                <h3 className="mt-5 text-xl font-black text-eic-navy">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-eic-muted">{text}</p>
              </article>
            </FadeUp>
          ))}
        </div>
      </div>
    </section>
  );
}

function FounderLetter() {
  return (
    <section id="lettera" className="bg-eic-slate px-5 py-20 md:px-8 lg:py-28">
      <div className="ai-motion-card mx-auto max-w-4xl rounded-md border border-eic-border bg-white p-6 shadow-2xl shadow-eic-navy/8 md:p-10">
        <FadeUp>
          <p className="text-sm font-black uppercase tracking-[0.22em] text-eic-orange">Da imprenditore a imprenditore</p>
          <h2 className="mt-4 text-3xl md:text-4xl font-black text-eic-navy md:text-5xl">Lettera dal fondatore.</h2>
          <div className="mt-8 space-y-5 text-lg leading-8 text-eic-muted">
            <p>Gestisco un'azienda vera, con operai veri, cantieri veri, fornitori che chiamano e clienti che vogliono tutto per ieri.</p>
            <p>Per anni ho fatto quello che fanno tanti titolari: fatturare, fatturare, fatturare. Convinto che il fatturato fosse la risposta.</p>
            <p><strong className="text-eic-navy">Poi ho guardato i numeri veri.</strong> Fatturato record, stress alle stelle, compenso personale troppo basso.</p>
            <p>Non ho trovato un sistema fatto da chi capisce davvero il cantiere. Allora me lo sono costruito. Prima l'ho usato io, con i miei soldi in gioco. Poi l'abbiamo portato ad altre imprese edili.</p>
            <p>Oggi dentro quel Sistema c'e' Silvio: un'AI che legge fatture, collega costi, prevede cassa e ti aiuta a decidere prima che il problema esploda.</p>
          </div>
          <blockquote className="mt-8 rounded-md border-l-4 border-eic-orange bg-eic-orange/8 p-5 text-xl font-black italic text-eic-navy">
            Il fatturato e' vanita'. Il margine e' sanita'. La cassa e' realta'.
          </blockquote>
          <div className="mt-8">
            <CTAButton>Voglio i 30 minuti con un consulente</CTAButton>
          </div>
        </FadeUp>
      </div>
    </section>
  );
}

function CasesSection() {
  return (
    <section id="casi" className="bg-white px-5 py-20 md:px-8 lg:py-28">
      <div className="mx-auto max-w-6xl">
        <FadeUp className="text-center">
          <p className="text-sm font-black uppercase tracking-[0.22em] text-eic-orange">Casi studio</p>
          <h2 className="mt-4 text-[clamp(2rem,9vw,5rem)] font-black leading-[1.03] tracking-[-0.035em] md:tracking-[-0.045em] text-eic-navy">
            Tre imprenditori edili. Tre vite cambiate.
          </h2>
        </FadeUp>
        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {cases.map((item, index) => (
            <FadeUp key={item.company} transition={{ delay: index * 0.05 }}>
              <article className="ai-motion-card h-full rounded-md border border-eic-border bg-white p-6 shadow-xl shadow-eic-navy/6">
                <div className="flex h-14 w-14 items-center justify-center rounded-md bg-eic-navy text-white">
                  <Building2 className="h-7 w-7" strokeWidth={1.5} />
                </div>
                <h3 className="mt-5 text-xl font-black text-eic-navy">{item.company}</h3>
                <p className="mt-1 text-sm font-bold text-eic-muted">{item.person}</p>
                <p className="mt-5 text-base leading-7 text-eic-muted">"{item.quote}"</p>
                <div className="mt-6 grid gap-3">
                  <div className="rounded-md bg-red-50 p-3 text-sm font-bold text-red-700">Prima: {item.before}</div>
                  <div className="rounded-md bg-emerald-50 p-3 text-sm font-bold text-emerald-700">Dopo: {item.after}</div>
                </div>
              </article>
            </FadeUp>
          ))}
        </div>
      </div>
    </section>
  );
}

function FitPricingFaq() {
  return (
    <section id="prezzi" className="bg-eic-slate px-5 py-20 md:px-8 lg:py-28">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-6 lg:grid-cols-2">
          <FadeUp>
            <div id="per-chi" className="ai-motion-card h-full rounded-md border border-eic-border bg-white p-6 shadow-xl shadow-eic-navy/6">
              <h2 className="text-3xl font-black text-eic-navy">Edilizia in Cloud non e' per tutti.</h2>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div>
                  <h3 className="font-black text-emerald-700">E' per te se</h3>
                  {["Fatturi almeno 400.000 euro/anno", "Vuoi decidere su margini e cassa", "Gestisci cantieri operativi", "Vuoi delegare senza perdere controllo"].map((item) => (
                    <p key={item} className="mt-3 flex gap-2 text-sm font-semibold text-eic-muted"><Check className="h-5 w-5 shrink-0 text-emerald-600" />{item}</p>
                  ))}
                </div>
                <div>
                  <h3 className="font-black text-red-700">Non e' per te se</h3>
                  {["Vuoi solo un Excel piu' carino", "Non vuoi guardare i margini", "Cerchi un ERP generico", "Non puoi dedicare 2 ore al mese"].map((item) => (
                    <p key={item} className="mt-3 flex gap-2 text-sm font-semibold text-eic-muted"><X className="h-5 w-5 shrink-0 text-red-600" />{item}</p>
                  ))}
                </div>
              </div>
            </div>
          </FadeUp>

          <FadeUp transition={{ delay: 0.06 }}>
            <div className="ai-motion-card h-full rounded-md border border-eic-border bg-white p-6 shadow-xl shadow-eic-navy/6">
              <h2 className="text-3xl font-black text-eic-navy">Quanto costa il Sistema?</h2>
              <p className="mt-3 text-eic-muted">Tre piani. Uno solo ti servira' davvero: te lo diciamo in consulenza, senza forzare.</p>
              <div className="mt-6 grid gap-3">
                {plans.map((plan) => (
                  <div key={plan.name} className={cn("rounded-md border p-4", plan.highlight ? "border-eic-orange bg-eic-orange/8" : "border-eic-border bg-eic-slate")}>
                    <div className="flex items-center justify-between gap-4">
                      <h3 className="font-black text-eic-navy">{plan.name}</h3>
                      <strong className="text-eic-orange">{plan.price}</strong>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-eic-muted">{plan.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </FadeUp>
        </div>

        <div id="faq" className="mt-10 grid gap-4 lg:grid-cols-2">
          {faqs.map((item, index) => (
            <FadeUp key={item.q} transition={{ delay: index * 0.035 }}>
              <article className="ai-motion-card h-full rounded-md border border-eic-border bg-white p-5">
                <h3 className="font-black text-eic-navy">{item.q}</h3>
                <p className="mt-3 text-sm leading-6 text-eic-muted">{item.a}</p>
              </article>
            </FadeUp>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section id="cta-finale" className="bg-eic-navy px-5 py-20 text-white md:px-8 lg:py-28">
      <div className="ai-motion-card mx-auto max-w-5xl rounded-md border border-white/12 bg-white/[0.06] p-8 text-center shadow-2xl shadow-black/25 md:p-12">
        <ShieldCheck className="mx-auto h-12 w-12 text-eic-orange" strokeWidth={1.5} />
        <h2 className="mt-6 text-[clamp(2rem,9vw,5.4rem)] font-black leading-[1.03] tracking-[-0.035em] md:tracking-[-0.045em]">
          Pronto a vedere i numeri veri della tua impresa?
        </h2>
        <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-white/68">
          30 minuti con un consulente. Apriamo il Sistema con i tuoi numeri davanti. Tu decidi cosa fare dopo.
        </p>
        <div className="mt-8">
          <CTAButton>Prenota la consulenza gratuita</CTAButton>
        </div>
        <p className="mt-5 text-sm font-semibold text-white/56">31 giorni gratis al termine della consulenza · Senza carta di credito · Risposta entro 24h</p>
      </div>
    </section>
  );
}

export default function AiEdiliziaPage() {
  const pageRef = useRef<HTMLElement>(null);
  const sentScroll75 = useRef(false);

  useSEO({
    title: "Sistema con AI per Imprese Edili | Edilizia in Cloud",
    description:
      "Smetti di scoprire a marzo dove sono finiti i soldi. Sistema con AI per margini reali, cassa a 90 giorni, cantieri e sprechi nascosti.",
    canonical: `${SITE_URL}/ai-edilizia`,
    ogImage: `${SITE_URL}/og/landing-ai-imprenditore-edile.png`,
    keywords: "AI edilizia, sistema AI imprese edili, gestionale edilizia AI, margini cantiere, cassa edilizia",
  });

  useEffect(() => {
    trackEvent("landing_ai_edilizia_view");
    const handleScroll = () => {
      if (sentScroll75.current) return;
      const pageHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (pageHeight <= 0) return;
      if (window.scrollY / pageHeight >= 0.75) {
        sentScroll75.current = true;
        trackEvent("landing_ai_edilizia_scroll_75");
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useGSAP(() => {
    const mm = gsap.matchMedia();

    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.utils.toArray<HTMLElement>(".ai-metric").forEach((card, index) => {
        gsap.from(card, {
          scrollTrigger: { trigger: card, start: "top 92%", once: true },
          y: 24,
          scale: 0.96,
          opacity: 0,
          duration: 0.55,
          delay: index * 0.035,
          ease: "power3.out",
        });
      });

      gsap.utils.toArray<HTMLElement>(".ai-motion-card").forEach((card) => {
        gsap.from(card, {
          scrollTrigger: { trigger: card, start: "top 88%", once: true },
          y: 34,
          scale: 0.985,
          opacity: 0,
          duration: 0.62,
          ease: "power3.out",
        });
      });

      gsap.from(".ai-flow-card", {
        scrollTrigger: { trigger: "#sistema", start: "top 70%", once: true },
        x: 28,
        opacity: 0,
        duration: 0.55,
        ease: "power3.out",
        stagger: 0.07,
      });

      gsap.to(".ai-command-card", {
        y: (index) => (index % 2 === 0 ? -6 : 6),
        duration: 3.4,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
        stagger: 0.16,
      });
    });

    return () => mm.revert();
  }, { scope: pageRef });

  return (
    <main ref={pageRef} className="min-h-screen bg-white font-sans text-eic-ink antialiased">
      <JsonLd />
      <HeroAI />
      <ProofStrip />
      <PainSection />
      <SystemSection />
      <AziendaBrain />
      <AgentiAziendali />
      <ResultSection />
      <EconomicsSection />
      <ModulesSection />
      <FounderLetter />
      <CasesSection />
      <FitPricingFaq />
      <FinalCTA />
      <LandingFooter />
    </main>
  );
}
