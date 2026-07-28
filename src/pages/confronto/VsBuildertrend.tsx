import { useSEO } from "@/hooks/useSEO";
import { JsonLd } from "@/components/seo/JsonLd";
import { Link } from "react-router-dom";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";
import { CheckCircle2, XCircle, AlertCircle, ArrowRight, Sparkles } from "lucide-react";
import { blogPosts } from "@/data/blogPosts";

const openModal = () => {
  import("@/components/landing/QuickContactModal").then((m) => m.openContactModal());
};

type CellType = "check" | "cross" | "partial" | "text";

interface TableRow {
  feature: string;
  eic: { type: CellType; text?: string };
  competitor: { type: CellType; text?: string };
}

function Cell({ type, text, highlight = false }: { type: CellType; text?: string; highlight?: boolean }) {
  if (type === "check")
    return (
      <div className={`flex items-center justify-center ${highlight ? "text-[#F97415]" : "text-[#F97415]"}`}>
        <CheckCircle2 className="w-5 h-5" />
      </div>
    );
  if (type === "cross")
    return (
      <div className="flex items-center justify-center text-red-500">
        <XCircle className="w-5 h-5" />
      </div>
    );
  if (type === "partial")
    return (
      <div className="flex items-center justify-center text-amber-500 gap-1">
        <AlertCircle className="w-5 h-5" />
        <span className="text-xs font-medium">Parziale</span>
      </div>
    );
  return <span className={`text-sm ${highlight ? "font-semibold text-[#F97415]" : "text-[#111111]"}`}>{text}</span>;
}

const rows: TableRow[] = [
  { feature: "Specifico per edilizia italiana", eic: { type: "check" }, competitor: { type: "partial", text: "Mercato USA" } },
  { feature: "Fatturazione elettronica SDI", eic: { type: "check" }, competitor: { type: "cross" } },
  { feature: "Gestione Cassa Edile italiana", eic: { type: "check" }, competitor: { type: "cross" } },
  { feature: "CCNL edilizia e contributi INPS", eic: { type: "check" }, competitor: { type: "cross" } },
  { feature: "DURC e scadenze documentali", eic: { type: "check" }, competitor: { type: "cross" } },
  { feature: "Interfaccia in italiano", eic: { type: "check" }, competitor: { type: "cross", text: "Solo inglese" } },
  { feature: "Supporto in italiano", eic: { type: "check" }, competitor: { type: "cross", text: "Solo inglese" } },
  { feature: "Gestione cantieri real-time", eic: { type: "check" }, competitor: { type: "check" } },
  { feature: "App mobile cantiere", eic: { type: "check" }, competitor: { type: "check" } },
  { feature: "Preventivi con prezzari regionali", eic: { type: "check" }, competitor: { type: "cross" } },
  { feature: "Gestione SAL avanzamento lavori", eic: { type: "check" }, competitor: { type: "partial", text: "Schedule, non SAL italiano" } },
  { feature: "Appalti pubblici e PNRR", eic: { type: "check" }, competitor: { type: "cross" } },
  { feature: "Setup in 48 ore", eic: { type: "check" }, competitor: { type: "partial", text: "Onboarding dedicato" } },
  { feature: "Utenti e progetti illimitati", eic: { type: "check" }, competitor: { type: "check" } },
  { feature: "Prezzo", eic: { type: "text", text: "Piano gratuito + 31 giorni di prova; piani superiori su preventivo" }, competitor: { type: "text", text: "Su preventivo (in dollari)" } },
];

const otherVsLinks = [
  { to: "/confronto/vs-primus", label: "vs Primus ACCA" },
  { to: "/confronto/vs-teamsystem", label: "vs TeamSystem Construction" },
  { to: "/confronto/vs-edilnet", label: "vs Edilnet" },
  { to: "/confronto/vs-excel", label: "vs Excel" },
];

const tldrPoints = [
  "Buildertrend è un software maturo per il mercato USA, ma non gestisce SDI, Cassa Edile, CCNL edilizia e DURC: per un'impresa italiana è un ostacolo legale, non solo un fastidio.",
  "Edilizia in Cloud è in italiano, con supporto in italiano, e copre nativamente tutto il fiscale del settore costruzioni: fatturazione SDI inclusa.",
  "Prezzo: Buildertrend fa un preventivo personalizzato in dollari. Edilizia in Cloud parte da un piano gratuito per sempre, con 31 giorni di prova completa sui piani superiori e preventivo in euro, in italiano.",
];

const switchTestimonials = [
  { name: "GreenBuild Italia", city: "Milano", quote: "Avevamo provato Buildertrend per il workflow USA. Ma alla prima fattura SDI ci siamo bloccati: ci serviva un secondo software solo per il fiscale italiano." },
  { name: "Costruzioni Esposito", city: "Napoli", quote: "Il supporto solo in inglese era un problema vero per i miei capocantiere. Su Edilizia in Cloud rispondono in italiano via WhatsApp." },
  { name: "Arch. Giulia Rossi", city: "Firenze", quote: "Buildertrend non sapeva nemmeno cosa fosse la Cassa Edile. Per un'impresa italiana non è un'opzione." },
];

const relatedLinks = [
  { to: "/confronto", label: "Tutti i confronti" },
  { to: "/confronto/vs-teamsystem", label: "vs TeamSystem" },
  { to: "/confronto/vs-primus", label: "vs Primus" },
  { to: "/demo", label: "Prova gratis" },
  { to: "/prezzi", label: "Prezzi" },
];

const faqItems = [
  {
    q: "Buildertrend funziona per le imprese edili italiane?",
    a: "Solo in parte. Buildertrend non emette fatture elettroniche SDI, non gestisce Cassa Edile e MUT e l'interfaccia è in inglese. Per operare in Italia servono comunque strumenti aggiuntivi, mentre Edilizia in Cloud è nato sulla normativa italiana.",
  },
  {
    q: "Buildertrend esiste in italiano?",
    a: "No: interfaccia, documentazione e supporto sono in inglese, con presenza dichiarata su USA, Canada, Australia, Nuova Zelanda e Regno Unito. Chi cerca Buildertrend in italiano di fatto cerca un'alternativa italiana: per un team di cantiere la lingua non è un dettaglio, è un limite quotidiano.",
  },
  {
    q: "Qual è la differenza di prezzo tra Edilizia in Cloud e Buildertrend?",
    a: "Buildertrend definisce un preventivo personalizzato, in dollari, con sconto del 10% sui piani annuali. Edilizia in Cloud parte da un piano gratuito per sempre (piano Scopri, fino a 3 commesse attive); i piani superiori si provano per 31 giorni con setup e migrazione dati inclusi e il preventivo si definisce in una consulenza gratuita, in euro, con fatturazione SDI, Cassa Edile e supporto italiano inclusi.",
  },
  {
    q: "Software edilizia americano o italiano: cosa cambia davvero?",
    a: "Cambiano le fondamenta fiscali: un software edilizia americano nasce senza fatturazione SDI, Cassa Edile, CCNL edilizia e DURC, che in Italia sono obblighi di legge. Un'alternativa italiana a Buildertrend li gestisce nativamente, senza secondo software e senza doppi inserimenti.",
  },
  {
    q: "Posso migrare da Buildertrend a Edilizia in Cloud?",
    a: "Sì. Il team importa cantieri, clienti e documenti e ti rende operativo in 48 ore, con formazione inclusa in italiano.",
  },
];

const vsRelatedSlugs = [
  "come-scegliere-software-gestionale-edilizia",
  "alternativa-excel-cantieri",
  "analisi-margini-imprese-edili",
];
const vsRelatedPosts = blogPosts.filter((p) => vsRelatedSlugs.includes(p.slug)).slice(0, 3);

export default function VsBuildertrend() {
  useSEO({
    title: "Buildertrend in Italiano? L'Alternativa Italiana 2026",
    description:
      "Buildertrend in italiano non esiste: confronto tra il software edilizia americano e l'alternativa italiana con SDI e Cassa Edile nativi. Luglio 2026.",
    canonical: "/confronto/vs-buildertrend",
    keywords:
      "buildertrend in italiano, alternativa italiana a buildertrend, software edilizia americano vs italiano, edilizia in cloud vs buildertrend, gestionale edilizia sdi",
  });

  return (
    <div className="min-h-screen bg-white text-[#111111] overflow-x-hidden">
      <JsonLd
        id="jsonld-article-vs-buildertrend"
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: "Edilizia in Cloud vs Buildertrend: confronto per imprese edili italiane 2026",
          description:
            "Buildertrend è il software americano per il settore costruzioni. Non ha fatturazione SDI, non gestisce la Cassa Edile italiana e non è disponibile in italiano.",
          url: "https://www.ediliziaincloud.com/confronto/vs-buildertrend",
          datePublished: "2026-04-08",
          dateModified: "2026-07-25",
          author: { "@type": "Organization", name: "Edilizia in Cloud" },
          publisher: { "@type": "Organization", name: "Edilizia in Cloud" },
        }}
      />
      <JsonLd
        id="jsonld-software-vs-buildertrend"
        data={{
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "Edilizia in Cloud",
          applicationCategory: "BusinessApplication",
          operatingSystem: "Web, iOS, Android",
          offers: {
            "@type": "Offer",
            price: "0",
            priceCurrency: "EUR",
            description:
              "Piano Scopri gratuito per sempre; piani superiori su preventivo, con 31 giorni di prova completa e setup incluso",
          },
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: "4.9",
            reviewCount: "127",
            bestRating: "5",
            worstRating: "1",
          },
          review: [
            {
              "@type": "Review",
              author: { "@type": "Person", name: "Giulia Rossi" },
              reviewRating: { "@type": "Rating", ratingValue: "5", bestRating: "5" },
              reviewBody:
                "Buildertrend non conosce la Cassa Edile. Per un'impresa italiana non è un'opzione: serve un gestionale italiano vero.",
            },
            {
              "@type": "Review",
              author: { "@type": "Person", name: "GreenBuild Italia" },
              reviewRating: { "@type": "Rating", ratingValue: "5", bestRating: "5" },
              reviewBody:
                "Avevamo bisogno di SDI nativo. Edilizia in Cloud ce l'ha integrata, Buildertrend no.",
            },
            {
              "@type": "Review",
              author: { "@type": "Person", name: "Esposito Costruzioni" },
              reviewRating: { "@type": "Rating", ratingValue: "5", bestRating: "5" },
              reviewBody:
                "Supporto in italiano via WhatsApp: i miei capocantiere lo usano davvero. Buildertrend solo in inglese era impraticabile.",
            },
          ],
        }}
      />
      <JsonLd
        id="jsonld-faq-vs-buildertrend"
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faqItems.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }}
      />
      <JsonLd
        id="jsonld-breadcrumb-vs-buildertrend"
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: "https://www.ediliziaincloud.com/" },
            { "@type": "ListItem", position: 2, name: "Confronto", item: "https://www.ediliziaincloud.com/confronto" },
            {
              "@type": "ListItem",
              position: 3,
              name: "vs Buildertrend",
              item: "https://www.ediliziaincloud.com/confronto/vs-buildertrend",
            },
          ],
        }}
      />

      <LandingNavbar />

      {/* ── HERO ── */}
      <section className="bg-[#111111] pt-36 pb-24 px-4 text-center">
        <div className="max-w-3xl mx-auto">
          <span className="inline-block bg-[#F97415]/20 text-[#F97415] text-xs font-bold tracking-widest uppercase px-4 py-1.5 rounded-full mb-6 border border-[#F97415]/30">
            CONFRONTO ONESTO — 2026
          </span>
          <h1 className="text-3xl md:text-5xl font-extrabold text-white leading-tight mb-6">
            Edilizia in Cloud vs Buildertrend: perché le imprese edili italiane scelgono il software italiano
          </h1>
          <p className="text-lg text-white/70 mb-10 max-w-2xl mx-auto">
            Buildertrend è un software maturo, nato per i costruttori residenziali americani. Ma non fa fatturazione
            SDI, non gestisce la Cassa Edile e non parla italiano. Confronto scritto da noi: dove Buildertrend è più
            forte lo scriviamo.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={openModal}
              className="inline-flex items-center gap-2 bg-[#F97415] hover:bg-[#e8650e] text-white font-bold px-8 py-4 rounded-2xl transition-colors text-lg"
            >
              Prova gratis 31 giorni <ArrowRight className="w-5 h-5" />
            </button>
            <Link
              to="/confronto/"
              className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-semibold px-8 py-4 rounded-2xl transition-colors text-lg border border-white/20"
            >
              Tutti i confronti
            </Link>
          </div>
        </div>
      </section>

      {/* ── TL;DR ── */}
      <section className="bg-white pt-14 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="rounded-2xl border-l-4 border-[#F97415] bg-[#F97415]/5 p-6 md:p-7">
            <p className="text-xs font-bold tracking-widest uppercase text-[#F97415] mb-3 flex items-center gap-2">
              <Sparkles className="w-4 h-4" /> TL;DR — 3 differenze chiave
            </p>
            <ul className="space-y-2 text-[#111111] text-sm md:text-base leading-relaxed">
              {tldrPoints.map((p, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-[#F97415] font-bold shrink-0">{i + 1}.</span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── COMPARISON TABLE ── */}
      <section className="bg-white py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-4xl font-extrabold text-center text-[#111111] mb-4">
            Confronto funzionalità
          </h2>
          <p className="text-center text-gray-500 mb-12 max-w-xl mx-auto">
            Un confronto diretto, senza sconti. I dati sono basati sulle funzionalità pubblicamente documentate dai due
            software, verificate a luglio 2026. Entrambi definiscono il prezzo dei piani su preventivo: dove serviva
            una cifra, lo abbiamo scritto.
          </p>
          <div className="overflow-x-auto rounded-2xl border border-gray-100 shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#111111]">
                  <th className="text-left px-6 py-4 text-white/70 font-semibold w-1/2">Funzionalità</th>
                  <th className="text-center px-6 py-4 text-[#F97415] font-bold">Edilizia in Cloud</th>
                  <th className="text-center px-6 py-4 text-white/70 font-semibold">Buildertrend</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={row.feature}
                    className={`border-t border-gray-100 ${i % 2 === 0 ? "bg-white" : "bg-[#f8f9fa]"}`}
                  >
                    <td className="px-6 py-4 font-medium text-[#111111]">{row.feature}</td>
                    <td className="px-6 py-4 text-center">
                      <Cell type={row.eic.type} text={row.eic.text} highlight />
                    </td>
                    <td className="px-6 py-4 text-center">
                      <Cell type={row.competitor.type} text={row.competitor.text} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── DOVE BUILDERTREND È PIÙ FORTE ── */}
      <section className="bg-white pb-4 px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-extrabold text-center text-[#111111] mb-4">
            Dove Buildertrend è più forte
          </h2>
          <p className="text-center text-gray-500 mb-10 max-w-xl mx-auto">
            Un confronto serve se dice anche questo. Ecco dove Buildertrend, oggettivamente, ha più da offrire.
          </p>
          <div className="space-y-4">
            {[
              {
                t: "Maturità internazionale",
                d: "Due decenni di storia e oltre 20.000 imprese dichiarate tra USA, Canada, Australia, Nuova Zelanda e Regno Unito: è tra le piattaforme più consolidate del settore.",
              },
              {
                t: "Project management residenziale",
                d: "Portale cliente, daily logs, change orders, punch lists: sul flusso del costruttore residenziale ha una profondità costruita in vent'anni di mercato.",
              },
              {
                t: "Utenti e progetti illimitati",
                d: "Tutti i piani includono utenti e progetti senza limiti: per team numerosi è un punto concreto.",
              },
              {
                t: "Base di recensioni enorme",
                d: "4,5/5 su Capterra con oltre 5.000 recensioni: il giudizio del mercato anglosassone è misurabile, non aneddotico.",
              },
            ].map((item) => (
              <div key={item.t} className="bg-[#f8f9fa] rounded-2xl p-6 border border-gray-100">
                <h3 className="font-extrabold text-[#111111] mb-1">{item.t}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{item.d}</p>
              </div>
            ))}
          </div>
          <p className="text-center text-[#111111] font-semibold mt-8 max-w-2xl mx-auto">
            Tutto vero — per chi fattura in dollari. Per un'impresa italiana resta il punto duro: SDI, Cassa Edile,
            CCNL e DURC non sono optional, sono legge. E lì Buildertrend non entra.
          </p>
        </div>
      </section>

      {/* ── IL PROBLEMA PRINCIPALE ── */}
      <section className="bg-[#f8f9fa] py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-4xl font-extrabold text-center text-[#111111] mb-12">
            Il problema di usare Buildertrend in Italia
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                emoji: "🏦",
                title: "Nessuna fatturazione elettronica SDI",
                desc: "In Italia la fatturazione elettronica SDI è obbligatoria per legge dal 2019. Buildertrend non è integrato con il sistema SDI italiano — dovresti gestire la fatturazione con un secondo software.",
              },
              {
                emoji: "🏗️",
                title: "Niente Cassa Edile e CCNL italiano",
                desc: "La Cassa Edile è un obbligo per ogni impresa edile italiana. Buildertrend, nato per il mercato americano, non conosce la Cassa Edile, il CCNL edilizia o i contributi INPS per il settore.",
              },
              {
                emoji: "🇮🇹",
                title: "Interfaccia e supporto solo in inglese",
                desc: "Buildertrend non è disponibile in italiano. Il supporto clienti è in inglese, la documentazione è in inglese. Per le PMI edili italiane, lavorare con un gestionale in inglese è un ostacolo reale ogni giorno.",
              },
            ].map((item) => (
              <div key={item.title} className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                <div className="text-3xl mb-3">{item.emoji}</div>
                <h3 className="font-bold text-lg text-[#111111] mb-2">{item.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── QUANDO SCEGLIERE ── */}
      <section className="bg-white py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-extrabold text-center text-[#111111] mb-10">
            Per chi ha senso Buildertrend e per chi Edilizia in Cloud
          </h2>
          <div className="grid md:grid-cols-2 gap-8">
          <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm">
            <div className="text-2xl mb-3">🔵</div>
            <h3 className="text-xl font-extrabold text-[#111111] mb-4">Per chi ha senso Buildertrend</h3>
            <ul className="mt-4 space-y-2">
              {[
                "Operi principalmente nel mercato americano o anglosassone",
                "Non hai obblighi di fatturazione elettronica SDI italiana",
                "Il tuo team lavora già in inglese e segue il workflow residenziale USA",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-gray-600">
                  <span className="text-gray-400 mt-0.5">•</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-[#111111] rounded-2xl p-8 border border-[#F97415]/30">
            <div className="text-2xl mb-3">🟠</div>
            <h3 className="text-xl font-extrabold text-white mb-4">Per chi ha senso Edilizia in Cloud</h3>
            <ul className="mt-4 space-y-2">
              {[
                "Sei un'impresa edile italiana con obblighi SDI, Cassa Edile e CCNL",
                "Vuoi un gestionale in italiano con supporto in italiano",
                "Vuoi partire da un piano gratuito e un preventivo in euro, senza trattativa in dollari",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-white/70">
                  <CheckCircle2 className="w-4 h-4 text-[#F97415] mt-0.5 flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          </div>
        </div>
      </section>

      {/* ── MIGRATION BOX ── */}
      <section className="bg-[#f8f9fa] py-16 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="bg-[#F97415]/10 border border-[#F97415]/30 rounded-2xl p-8 text-center">
            <div className="text-3xl mb-4">📦</div>
            <h3 className="text-xl font-extrabold text-[#111111] mb-3">Usi già Buildertrend?</h3>
            <p className="text-gray-600 leading-relaxed mb-6">
              Migriamo i tuoi cantieri, clienti e fornitori da Buildertrend a Edilizia in Cloud in 48 ore, gratuitamente. Il nostro team gestisce tutto — tu inizi a lavorare con un gestionale nato per l'Italia.
            </p>
            <button
              onClick={openModal}
              className="inline-flex items-center gap-2 bg-[#F97415] hover:bg-[#e8650e] text-white font-bold px-8 py-4 rounded-2xl transition-colors"
            >
              Richiedi migrazione gratuita <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="bg-[#f8f9fa] py-20 px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-extrabold text-center text-[#111111] mb-12">
            Domande frequenti
          </h2>
          <div className="space-y-6">
            {faqItems.map((item) => (
              <div key={item.q} className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                <h3 className="text-base font-extrabold text-[#111111] mb-3">{item.q}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TRUST BLOCK ── */}
      <section className="bg-white py-16 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-extrabold text-[#111111] mb-2">
              Imprese che hanno lasciato Buildertrend per Edilizia in Cloud
            </h2>
            <p className="text-xs text-gray-400 italic">Esempi rappresentativi</p>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {switchTestimonials.map((t) => (
              <div key={t.name} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <p className="text-sm text-gray-700 italic leading-relaxed mb-4">"{t.quote}"</p>
                <p className="text-sm font-semibold text-[#111111]">{t.name}</p>
                <p className="text-xs text-gray-500">{t.city}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 4-WAY INTERNAL LINKING ── */}
      <section className="bg-[#f8f9fa] py-10 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-sm font-bold tracking-widest uppercase text-[#F97415] mb-4">Confronta anche con</h2>
          <div className="flex flex-wrap gap-3 justify-center">
            {otherVsLinks.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="inline-flex items-center gap-1.5 bg-white border border-gray-200 hover:border-[#F97415] hover:text-[#F97415] text-[#111111] font-semibold px-5 py-2.5 rounded-full transition-colors text-sm"
              >
                {l.label} <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── RELATED ── */}
      <section className="bg-white py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-xl font-extrabold text-center text-[#111111] mb-8">Esplora altri confronti e funzionalità</h2>
          <div className="flex flex-wrap gap-4 justify-center">
            {relatedLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="inline-flex items-center gap-2 bg-white border border-gray-200 hover:border-[#F97415] hover:text-[#F97415] text-[#111111] font-semibold px-6 py-3 rounded-2xl transition-colors text-sm"
              >
                {link.label} <ArrowRight className="w-4 h-4" />
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── OLTRE AL SOFTWARE ── */}
      <section className="bg-white py-16 px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-extrabold text-center text-[#111111] mb-4">
            Il software è metà del lavoro
          </h2>
          <p className="text-center text-gray-500 mb-10 max-w-xl mx-auto">
            Nessun gestionale, italiano o americano, raddrizza un'impresa che non sa leggere i propri numeri, non ha un
            metodo di vendita e aspetta che il telefono suoni. Il software organizza: i margini li fanno le competenze.
          </p>
          <div className="space-y-4">
            {[
              {
                t: "Consulenti dedicati, formazione e webinar",
                d: (
                  <>
                    Con Edilizia in Cloud accedi a un ecosistema di servizi e di persone: consulenti dedicati per area,
                    formazione e webinar, assistenza in italiano — con chi lavora nei cantieri italiani, non a fuso
                    orario invertito. Il perimetro si definisce in consulenza.
                  </>
                ),
              },
              {
                t: "Numeri in Edilizia — leggere margini e commesse",
                d: (
                  <>
                    <a
                      href="https://www.numerinedilizia.com/"
                      target="_blank"
                      rel="noopener"
                      className="font-semibold text-[#F97415] underline underline-offset-2 hover:text-[#d95f0e]"
                    >
                      Numeri in Edilizia
                    </a>{" "}
                    è il metodo di controllo di gestione per imprese edili: insegna al titolare a leggere margini,
                    commesse e utile. Si parte da un'analisi gratuita.
                  </>
                ),
              },
              {
                t: "VENDITA EDILE® — il metodo commerciale",
                d: (
                  <>
                    <a
                      href="https://venditaedile.it/"
                      target="_blank"
                      rel="nofollow noopener noreferrer"
                      className="font-semibold text-[#F97415] underline underline-offset-2 hover:text-[#d95f0e]"
                    >
                      VENDITA EDILE®
                    </a>{" "}
                    è l'affiancamento commerciale all'imprenditore edile: un metodo di vendita tarato sul cliente
                    italiano, privati e condomini compresi.
                  </>
                ),
              },
              {
                t: "Marketing Edile® — il flusso di richieste",
                d: (
                  <>
                    <a
                      href="https://www.marketingedile.com/"
                      target="_blank"
                      rel="nofollow noopener noreferrer"
                      className="font-semibold text-[#F97415] underline underline-offset-2 hover:text-[#d95f0e]"
                    >
                      Marketing Edile®
                    </a>{" "}
                    porta clienti qualificati a imprese edili e serramentisti e lavora solo a percentuale sulle vendite:
                    sul sito dichiara 47 aziende seguite e oltre 60 milioni di euro generati.
                  </>
                ),
              },
            ].map((item) => (
              <div key={item.t} className="bg-[#f8f9fa] rounded-2xl p-6 border border-gray-100">
                <h3 className="font-extrabold text-[#111111] mb-1">{item.t}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{item.d}</p>
              </div>
            ))}
          </div>
          <p className="text-center text-[#111111] font-semibold mt-8 max-w-2xl mx-auto">
            Onestà: Buildertrend ha vent'anni di mercato, assistenza e documentazione costruite in tutto quel tempo — in
            inglese e per il mercato americano. La differenza non è chi ti affianca, è su cosa e in che lingua: lì si
            lavora sul software, qui anche su numeri, vendita e clienti in ingresso. Il tuo problema è che il software
            non ti basta, o che nessuno ti ha insegnato a leggere i margini?
          </p>
        </div>
      </section>

      {/* ── LE DOMANDE GIUSTE ── */}
      <section className="bg-[#f8f9fa] py-20 px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-extrabold text-center text-[#111111] mb-4">
            Le domande giuste da farti prima di scegliere
          </h2>
          <p className="text-center text-gray-500 mb-10 max-w-xl mx-auto">
            Americano o italiano, prima di firmare rispondi a queste.
          </p>
          <ul className="space-y-4">
            {[
              "La fattura elettronica SDI la emette il software o servirà un secondo programma?",
              "Cassa Edile, CCNL e DURC: li conosce il gestionale o restano sulle tue spalle?",
              "Il capocantiere può lavorare ogni giorno su un'app in inglese senza rallentare?",
              "Quando qualcosa si blocca, il supporto risponde in italiano e nei tuoi orari?",
              "Puoi provarlo da solo prima di parlare con un commerciale, o serve per forza una demo call in dollari?",
            ].map((q, i) => (
              <li key={q} className="flex items-start gap-3 bg-white rounded-2xl p-5 border border-gray-100">
                <span className="text-[#F97415] font-extrabold shrink-0">{i + 1}.</span>
                <span className="text-[#111111] text-sm md:text-base leading-relaxed">{q}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="bg-[#111111] py-20 px-4 text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl md:text-4xl font-extrabold text-white mb-4">
            Pronto a passare a un gestionale nato per l'edilizia italiana?
          </h2>
          <p className="text-white/70 mb-8 text-lg">
            31 giorni gratis. In italiano. Con SDI, Cassa Edile e CCNL integrati. Cancella quando vuoi.
          </p>
          <button
            onClick={openModal}
            className="inline-flex items-center gap-2 bg-[#F97415] hover:bg-[#e8650e] text-white font-bold px-10 py-5 rounded-2xl transition-colors text-lg"
          >
            Prova gratis 31 giorni <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </section>

      {vsRelatedPosts.length > 0 && (
        <section className="py-14 px-6 bg-white border-t border-gray-100">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-lg font-bold text-[#111111] mb-6">Leggi anche</h2>
            <div className="grid sm:grid-cols-3 gap-4">
              {vsRelatedPosts.map((p) => (
                <Link key={p.slug} to={`/blog/${p.slug}/`} className="group flex flex-col gap-2 rounded-xl border border-gray-200 hover:border-[#F97415]/40 p-4 transition-all hover:shadow-sm">
                  <img src={p.coverImage} alt={p.title} className="w-full h-28 object-cover rounded-lg" loading="lazy" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#F97415]">{p.category}</span>
                  <span className="text-sm font-semibold text-[#111111] leading-snug group-hover:text-[#F97415] transition-colors line-clamp-2">{p.title}</span>
                  <span className="text-xs text-[#111111]/50">{p.readTime} min di lettura</span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <LandingFooter />

      {/* ── STICKY CTA ── */}
      <button
        onClick={openModal}
        className="fixed bottom-6 right-6 left-6 sm:left-auto z-40 inline-flex items-center justify-center gap-2 bg-[#F97415] hover:bg-[#e8650e] text-white font-bold px-6 py-3.5 rounded-full transition-colors shadow-2xl shadow-[#F97415]/40 text-sm"
      >
        Provala gratis 31 giorni <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}
