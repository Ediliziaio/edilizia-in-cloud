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
  { feature: "Aggiornamento dati real-time", eic: { type: "check" }, competitor: { type: "cross" } },
  { feature: "Accesso da smartphone in cantiere", eic: { type: "check" }, competitor: { type: "partial", text: "App Excel mobile, scomoda in cantiere" } },
  { feature: "Collaborazione multi-utente", eic: { type: "check" }, competitor: { type: "partial", text: "Co-authoring su 365, senza ruoli" } },
  { feature: "Margini per cantiere automatici", eic: { type: "check" }, competitor: { type: "cross", text: "Calcoli manuali" } },
  { feature: "Fatturazione elettronica SDI", eic: { type: "check" }, competitor: { type: "cross" } },
  { feature: "Tracciamento presenze operai", eic: { type: "check" }, competitor: { type: "cross" } },
  { feature: "Preventivi con prezzari", eic: { type: "check" }, competitor: { type: "cross" } },
  { feature: "Alert margini a rischio", eic: { type: "check" }, competitor: { type: "cross" } },
  { feature: "Backup automatico", eic: { type: "check" }, competitor: { type: "partial", text: "Con OneDrive/365" } },
  { feature: "Zero errori di formula", eic: { type: "check" }, competitor: { type: "cross", text: "Errori frequenti" } },
  { feature: "Storico modifiche", eic: { type: "check" }, competitor: { type: "partial", text: "Cronologia versioni su 365" } },
  { feature: "Supporto dedicato", eic: { type: "check" }, competitor: { type: "cross" } },
  {
    feature: "Costo",
    eic: { type: "text", text: "Piano gratuito + 31 giorni di prova; piani superiori su preventivo" },
    competitor: { type: "text", text: "€0 di licenza (con Microsoft 365)" },
  },
];

const otherVsLinks = [
  { to: "/confronto/vs-primus", label: "vs Primus ACCA" },
  { to: "/confronto/vs-teamsystem", label: "vs TeamSystem Construction" },
  { to: "/confronto/vs-edilnet", label: "vs Edilnet" },
  { to: "/confronto/vs-buildertrend", label: "vs Buildertrend" },
];

const tldrPoints = [
  "Excel è gratis solo in apparenza: il costo nascosto stimato è ~€2.000/mese in ore amministrative perse e decisioni su dati obsoleti.",
  "Edilizia in Cloud elimina formule sbagliate, file in 12 versioni e calcoli manuali con dati real-time e alert margini: si parte da un piano gratuito per sempre.",
  "Migrazione gratuita da Excel in 48 ore, AI per analisi margini in tempo reale e SDI nativo: tutto incluso.",
];

const switchTestimonials = [
  { name: "Costruzioni Lombardi", city: "Como", quote: "Avevamo 14 fogli Excel collegati. Una formula sbagliata e perdevamo 2 giorni a capire dove. Su Edilizia in Cloud zero formule, zero versioni." },
  { name: "Edil Service Sud", city: "Bari", quote: "Mio figlio aggiornava i fogli la sera. Adesso i dati arrivano dal cantiere in automatico — abbiamo recuperato 8 ore a settimana." },
  { name: "Geom. Sara Conti", city: "Pisa", quote: "Su Excel scoprivo i cantieri in perdita a fine lavori. Ora ricevo l'alert quando il margine scende sotto soglia." },
];

interface StatBox {
  number: string;
  label: string;
  sub?: string;
}

const costStats: StatBox[] = [
  {
    number: "8 ore/sett",
    label: "perse in aggiornamenti manuali",
    sub: "€400/mese al costo di un impiegato",
  },
  {
    number: "3 su 10",
    label: "cantieri vanno in perdita senza che il titolare lo sappia",
  },
  {
    number: "1 su 100",
    label: "celle contiene un errore di formula",
    sub: "fonte: ricerca EuSpRIG",
  },
  {
    number: "0",
    label: "visibilità sui margini in tempo reale",
  },
  {
    number: "12 versioni",
    label: "dello stesso file in circolazione contemporaneamente",
  },
];

const relatedLinks = [
  { to: "/confronto", label: "Tutti i confronti" },
  { to: "/confronto/vs-primus", label: "vs Primus" },
  { to: "/confronto/vs-teamsystem", label: "vs TeamSystem" },
  { to: "/demo", label: "Prova gratis" },
  { to: "/prezzi", label: "Prezzi" },
  { to: "/blog/alternativa-excel-cantieri", label: "Alternativa a Excel" },
];

const faqItems = [
  {
    q: "Quanto costa davvero usare Excel per gestire i cantieri?",
    a: "Il foglio Excel di contabilità cantiere parte gratis, ma il costo reale è stimato tra €1.500 e €3.000 al mese per un'impresa con 3-5 cantieri attivi, considerando le ore perse in aggiornamenti manuali, gli errori di calcolo non rilevati e le decisioni prese su dati obsoleti.",
  },
  {
    q: "Quali sono i limiti di gestire i cantieri con Excel?",
    a: "I limiti principali della gestione cantieri con Excel: dati aggiornati a mano (quindi già vecchi quando li leggi), nessun collegamento tra preventivo, costi e presenze, errori di formula difficili da scovare, versioni multiple dello stesso file e nessun alert quando un margine scende. Con 2 o più cantieri aperti, questi limiti diventano soldi.",
  },
  {
    q: "Qual è l'alternativa a Excel per un'impresa edile?",
    a: "Un gestionale edile cloud che sostituisce i fogli con dati collegati: il costo registrato in cantiere aggiorna il margine di commessa, le presenze finiscono da sole nel consuntivo e la fattura parte dallo stesso sistema. Edilizia in Cloud fa questo con un piano gratuito per partire e 31 giorni di prova completa sui piani superiori, con migrazione gratuita dei tuoi Excel in 48 ore.",
  },
  {
    q: "Posso migrare i miei dati da Excel a Edilizia in Cloud?",
    a: "Sì. Il team di Edilizia in Cloud migra gratuitamente tutti i tuoi dati da Excel: cantieri, clienti, fornitori e storico. Di solito bastano 48 ore per essere completamente operativi.",
  },
  {
    q: "Edilizia in Cloud è difficile da usare rispetto a Excel?",
    a: "Al contrario: Edilizia in Cloud è progettato per imprenditori edili, non per informatici. L'interfaccia è più semplice di Excel per i task quotidiani del cantiere, e il nostro team ti forma gratuitamente.",
  },
];

const vsRelatedSlugs = ["alternativa-excel-cantieri", "ridurre-costi-cantieri-edili", "computo-metrico-estimativo-guida"];
const vsRelatedPosts = blogPosts.filter((p) => vsRelatedSlugs.includes(p.slug)).slice(0, 3);

export default function VsExcel() {
  useSEO({
    title: "Gestione Cantieri con Excel: Limiti e Alternativa 2026",
    description:
      "I limiti di gestire i cantieri con Excel e l'alternativa per imprese edili: cosa costa davvero il foglio di contabilità cantiere.",
    canonical: "/confronto/vs-excel",
    keywords:
      "gestione cantieri con excel limiti, alternativa a excel per imprese edili, foglio excel contabilità cantiere, gestionale edilizia vs excel, software cantieri excel",
  });

  return (
    <div className="min-h-screen bg-white text-[#111111] overflow-x-hidden">
      <JsonLd
        id="jsonld-article-vs-excel"
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline:
            "Edilizia in Cloud vs Excel: il vero costo nascosto di gestire i cantieri con i fogli di calcolo",
          description:
            "I limiti di gestire i cantieri con Excel e l'alternativa per imprese edili: cosa costa davvero il foglio di contabilità cantiere.",
          url: "https://www.ediliziaincloud.com/confronto/vs-excel",
          datePublished: "2026-01-01",
          dateModified: "2026-07-25",
          author: { "@type": "Organization", name: "Edilizia in Cloud" },
          publisher: { "@type": "Organization", name: "Edilizia in Cloud" },
        }}
      />
      <JsonLd
        id="jsonld-software-vs-excel"
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
            ratingValue: "4.8",
            reviewCount: "127",
            bestRating: "5",
            worstRating: "1",
          },
          review: [
            {
              "@type": "Review",
              author: { "@type": "Person", name: "Sara Conti" },
              reviewRating: { "@type": "Rating", ratingValue: "5", bestRating: "5" },
              reviewBody:
                "Su Excel scoprivo le perdite a fine lavori. Ora ricevo l'alert quando il margine scende: salvataggio reale di marginalità.",
            },
            {
              "@type": "Review",
              author: { "@type": "Person", name: "Lombardi Costruzioni" },
              reviewRating: { "@type": "Rating", ratingValue: "5", bestRating: "5" },
              reviewBody:
                "Niente più 14 fogli collegati con formule fragili. Migrazione fatta dal team in 48 ore, gratis.",
            },
            {
              "@type": "Review",
              author: { "@type": "Person", name: "Edil Service Sud" },
              reviewRating: { "@type": "Rating", ratingValue: "5", bestRating: "5" },
              reviewBody:
                "8 ore a settimana recuperate sull'aggiornamento manuale dei fogli. Si ripaga da solo.",
            },
          ],
        }}
      />
      <JsonLd
        id="jsonld-breadcrumb-vs-excel"
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: "https://www.ediliziaincloud.com/" },
            { "@type": "ListItem", position: 2, name: "Confronto", item: "https://www.ediliziaincloud.com/confronto" },
            {
              "@type": "ListItem",
              position: 3,
              name: "vs Excel",
              item: "https://www.ediliziaincloud.com/confronto/vs-excel",
            },
          ],
        }}
      />
      <JsonLd
        id="jsonld-faq-vs-excel"
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

      <LandingNavbar />

      {/* ── HERO ── */}
      <section className="bg-[#111111] pt-36 pb-24 px-4 text-center">
        <div className="max-w-3xl mx-auto">
          <span className="inline-block bg-[#F97415]/20 text-[#F97415] text-xs font-bold tracking-widest uppercase px-4 py-1.5 rounded-full mb-6 border border-[#F97415]/30">
            CONFRONTO ONESTO — 2026
          </span>
          <h1 className="text-3xl md:text-5xl font-extrabold text-white leading-tight mb-6">
            Edilizia in Cloud vs Excel: il vero costo nascosto di gestire i cantieri con i fogli di calcolo
          </h1>
          <p className="text-lg text-white/70 mb-10 max-w-2xl mx-auto">
            Excel sembra gratuito. In realtà ti costa ore di lavoro, margini persi e decisioni sbagliate. Scopri quanto
            stai davvero perdendo e perché 150+ imprese edili hanno smesso di usarlo.
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
            Un confronto diretto, senza sconti, con dati verificati a luglio 2026. Excel è uno strumento potente — e più sotto
            scriviamo dove resta più forte — ma non è nato per gestire cantieri edili.
          </p>
          <div className="overflow-x-auto rounded-2xl border border-gray-100 shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#111111]">
                  <th className="text-left px-6 py-4 text-white/70 font-semibold w-1/2">Funzionalità</th>
                  <th className="text-center px-6 py-4 text-[#F97415] font-bold">Edilizia in Cloud</th>
                  <th className="text-center px-6 py-4 text-white/70 font-semibold">Excel / Fogli</th>
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

      {/* ── IL COSTO REALE DI EXCEL IN 5 NUMERI ── */}
      <section className="bg-[#111111] py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-4xl font-extrabold text-center text-white mb-4">
            Il costo reale di Excel in 5 numeri
          </h2>
          <p className="text-center text-white/60 mb-12 max-w-xl mx-auto">
            Questi non sono dati teorici. Sono la realtà quotidiana di migliaia di imprese edili italiane.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {costStats.map((stat) => (
              <div
                key={stat.number}
                className="bg-white/5 border border-white/10 rounded-2xl p-6 text-center"
              >
                <div className="text-3xl font-extrabold text-[#F97415] mb-2">{stat.number}</div>
                <div className="text-white font-semibold text-sm mb-1">{stat.label}</div>
                {stat.sub && <div className="text-white/50 text-xs">{stat.sub}</div>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── DOVE EXCEL È PIÙ FORTE ── */}
      <section className="bg-white py-20 px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-extrabold text-center text-[#111111] mb-4">
            Dove Excel è più forte
          </h2>
          <p className="text-center text-gray-500 mb-10 max-w-xl mx-auto">
            Confronto scritto da Edilizia in Cloud: dove Excel è più forte lo scriviamo.
          </p>
          <div className="space-y-4">
            {[
              {
                t: "È gratis, o già pagato",
                d: "Nessun canone nuovo: con Microsoft 365 lo hai già in azienda, e per un calcolo una tantum resta imbattibile.",
              },
              {
                t: "Lo conosci già",
                d: "Zero formazione, zero onboarding: tu e il tuo geometra lo usate da vent'anni e nessuno deve imparare niente.",
              },
              {
                t: "Flessibilità totale",
                d: "Qualsiasi calcolo, qualsiasi struttura, qualsiasi analisi estemporanea: nessun gestionale ti lascia altrettanto libero.",
              },
              {
                t: "Lo aprono tutti",
                d: "Commercialista, banca, fornitori: un file .xlsx lo legge chiunque, senza account e senza software particolari.",
              },
            ].map((item) => (
              <div key={item.t} className="bg-[#f8f9fa] rounded-2xl p-6 border border-gray-100">
                <h3 className="font-extrabold text-[#111111] mb-1">{item.t}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{item.d}</p>
              </div>
            ))}
          </div>
          <p className="text-center text-[#111111] font-semibold mt-8 max-w-2xl mx-auto">
            Il problema non è quello che Excel sa fare: è quello che non farà mai da solo — accorgersi di un errore,
            avvisarti di un margine che scende, dire al capocantiere cosa è cambiato. Per quello serve un gestionale.
          </p>
        </div>
      </section>

      {/* ── QUANDO SCEGLIERE ── */}
      <section className="bg-[#f8f9fa] py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-extrabold text-center text-[#111111] mb-10">
            Per chi ha senso Excel e per chi Edilizia in Cloud
          </h2>
          <div className="grid md:grid-cols-2 gap-8">
          <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm">
            <div className="text-2xl mb-3">🔵</div>
            <h3 className="text-xl font-extrabold text-[#111111] mb-4">Per chi ha senso restare su Excel</h3>
            <ul className="mt-4 space-y-2">
              {[
                "Hai 0-1 cantieri aperti in totale",
                "Sei in fase pre-startup e stai valutando il mercato",
                "Fai lavori di importo inferiore a €5.000",
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
                "Hai 2 o più cantieri aperti contemporaneamente",
                "Hai un fatturato superiore a €200.000 annui",
                "Vuoi crescere senza perdere il controllo dei margini",
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
      <section className="bg-white py-16 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="bg-[#F97415]/10 border border-[#F97415]/30 rounded-2xl p-8 text-center">
            <div className="text-3xl mb-4">📦</div>
            <h3 className="text-xl font-extrabold text-[#111111] mb-3">Usi ancora Excel?</h3>
            <p className="text-gray-600 leading-relaxed mb-6">
              Migriamo tutti i tuoi dati da Excel a Edilizia in Cloud gratuitamente: cantieri, clienti, fornitori e
              storico. Di solito bastano 48 ore per essere completamente operativi. Zero stress, zero perdita di dati.
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
              Imprese che hanno lasciato Excel per Edilizia in Cloud
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
          <h2 className="text-xl font-extrabold text-center text-[#111111] mb-8">Esplora altri confronti e risorse</h2>
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
            Uscire da Excel mette ordine, ma non basta. Un file o un gestionale non insegnano a leggere i numeri, non
            danno un metodo di vendita e non fanno entrare richieste. Quelle sono competenze.
          </p>
          <div className="space-y-4">
            {[
              {
                t: "Consulenti dedicati, formazione e webinar",
                d: (
                  <>
                    Con Edilizia in Cloud accedi a un ecosistema di servizi e di persone: consulenti dedicati per area,
                    formazione e webinar, assistenza in italiano. Il perimetro si definisce in consulenza.
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
                    commesse e utile, cioè quello che nessuna formula in un foglio fa al posto tuo. Parte da un'analisi
                    gratuita.
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
                    è il percorso di affiancamento commerciale per imprenditori edili: come si vende un lavoro, non come
                    si formatta un preventivo.
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
            Onestà anche qui: attorno a Excel di gente competente ce n'è ovunque — consulenti che ti costruiscono il
            file su misura, corsi, il tuo commercialista. E i grandi gestionali hanno rivenditori e assistenza sul
            territorio. La differenza è su cosa ti affiancano: sul foglio o sul software, oppure anche su numeri,
            vendita e clienti in ingresso. Il tuo problema è che Excel non ti basta più, o che nessuno ti ha insegnato a
            leggere i margini?
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
            Che tu resti su Excel o passi a un gestionale, prima rispondi a queste.
          </p>
          <ul className="space-y-4">
            {[
              "Quante versioni dello stesso file girano oggi tra ufficio, geometra e cantiere?",
              "Chi si accorgerebbe di una formula sbagliata prima che costi soldi veri?",
              "Quanto conta sapere il margine di un cantiere mentre è aperto, non a fine lavori?",
              "Quante ore a settimana se ne vanno a ricopiare dati da un foglio all'altro?",
              "Il capocantiere può aggiornare i dati dal telefono o li detta per telefono a fine giornata?",
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
            Pronto a smettere con i fogli di calcolo?
          </h2>
          <p className="text-white/70 mb-8 text-lg">
            31 giorni gratis. Migrazione gratuita da Excel in 48 ore. Cancella quando vuoi.
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
