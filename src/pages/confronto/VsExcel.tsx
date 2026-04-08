import { useSEO } from "@/hooks/useSEO";
import { JsonLd } from "@/components/seo/JsonLd";
import { Link } from "react-router-dom";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";
import { CheckCircle2, XCircle, AlertCircle, ArrowRight } from "lucide-react";
import { blogPosts } from "@/data/blogPosts";

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
  { feature: "Accesso da smartphone in cantiere", eic: { type: "check" }, competitor: { type: "partial", text: "Solo con file condiviso" } },
  { feature: "Collaborazione multi-utente", eic: { type: "check" }, competitor: { type: "partial", text: "Conflitti di versione" } },
  { feature: "Margini per cantiere automatici", eic: { type: "check" }, competitor: { type: "cross", text: "Calcoli manuali" } },
  { feature: "Fatturazione elettronica SDI", eic: { type: "check" }, competitor: { type: "cross" } },
  { feature: "Tracciamento presenze operai", eic: { type: "check" }, competitor: { type: "cross" } },
  { feature: "Preventivi con prezzari", eic: { type: "check" }, competitor: { type: "cross" } },
  { feature: "Alert margini a rischio", eic: { type: "check" }, competitor: { type: "cross" } },
  { feature: "Backup automatico", eic: { type: "check" }, competitor: { type: "cross", text: "File locale" } },
  { feature: "Zero errori di formula", eic: { type: "check" }, competitor: { type: "cross", text: "Errori frequenti" } },
  { feature: "Storico modifiche", eic: { type: "check" }, competitor: { type: "partial", text: "Solo con versioning manuale" } },
  { feature: "Supporto dedicato", eic: { type: "check" }, competitor: { type: "cross" } },
  {
    feature: "Costo mensile",
    eic: { type: "text", text: "da €79/mese" },
    competitor: { type: "text", text: "€0 (ma costo reale: ~€2000/mese in ore perse)" },
  },
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

const vsRelatedSlugs = ["alternativa-excel-cantieri", "ridurre-costi-cantieri-edili", "gestione-cantieri-digitale"];
const vsRelatedPosts = blogPosts.filter((p) => vsRelatedSlugs.includes(p.slug)).slice(0, 3);

export default function VsExcel() {
  useSEO({
    title: "Gestionale Edilizia vs Excel: Perché Smettere nel 2026 | Edilizia in Cloud",
    description:
      "Excel per gestire i cantieri? Scopri quanto ti costa davvero e perché le imprese edili stanno passando a Edilizia in Cloud. Confronto completo 2026.",
    canonical: "/confronto/vs-excel",
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
            "Excel per gestire i cantieri? Scopri quanto ti costa davvero e perché le imprese edili stanno passando a Edilizia in Cloud. Confronto completo 2026.",
          url: "https://ediliziaincloud.com/confronto/vs-excel",
          datePublished: "2026-01-01",
          dateModified: "2026-04-08",
          author: { "@type": "Organization", name: "Edilizia in Cloud" },
          publisher: { "@type": "Organization", name: "Edilizia in Cloud" },
        }}
      />
      <JsonLd
        id="jsonld-breadcrumb-vs-excel"
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: "https://ediliziaincloud.com/" },
            { "@type": "ListItem", position: 2, name: "Confronto", item: "https://ediliziaincloud.com/confronto" },
            {
              "@type": "ListItem",
              position: 3,
              name: "vs Excel",
              item: "https://ediliziaincloud.com/confronto/vs-excel",
            },
          ],
        }}
      />
      <JsonLd
        id="jsonld-faq-vs-excel"
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: [
            {
              "@type": "Question",
              name: "Quanto costa davvero usare Excel per gestire i cantieri?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Il costo diretto è zero, ma il costo reale è stimato tra €1.500 e €3.000 al mese per un'impresa con 3-5 cantieri attivi, considerando le ore perse in aggiornamenti manuali, gli errori di calcolo non rilevati e le decisioni prese su dati obsoleti.",
              },
            },
            {
              "@type": "Question",
              name: "Posso migrare i miei dati da Excel a Edilizia in Cloud?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Sì. Il team di Edilizia in Cloud migra gratuitamente tutti i tuoi dati da Excel: cantieri, clienti, fornitori e storico. Di solito bastano 48 ore per essere completamente operativi.",
              },
            },
            {
              "@type": "Question",
              name: "Edilizia in Cloud è difficile da usare rispetto a Excel?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Al contrario: Edilizia in Cloud è progettato per imprenditori edili, non per informatici. L'interfaccia è più semplice di Excel per i task quotidiani del cantiere, e il nostro team ti forma gratuitamente.",
              },
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
            Edilizia in Cloud vs Excel: il vero costo nascosto di gestire i cantieri con i fogli di calcolo
          </h1>
          <p className="text-lg text-white/70 mb-10 max-w-2xl mx-auto">
            Excel sembra gratuito. In realtà ti costa ore di lavoro, margini persi e decisioni sbagliate. Scopri quanto
            stai davvero perdendo e perché 500+ imprese edili hanno smesso di usarlo.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/demo"
              className="inline-flex items-center gap-2 bg-[#F97415] hover:bg-[#e8650e] text-white font-bold px-8 py-4 rounded-2xl transition-colors text-lg"
            >
              Prova gratis 31 giorni <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              to="/confronto"
              className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-semibold px-8 py-4 rounded-2xl transition-colors text-lg border border-white/20"
            >
              Tutti i confronti
            </Link>
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
            Un confronto diretto, senza sconti. Excel è uno strumento potente, ma non è nato per gestire cantieri edili.
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

      {/* ── QUANDO SCEGLIERE ── */}
      <section className="bg-[#f8f9fa] py-20 px-4">
        <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-8">
          <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm">
            <div className="text-2xl mb-3">🔵</div>
            <h3 className="text-xl font-extrabold text-[#111111] mb-4">Quando Excel va ancora bene:</h3>
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
            <h3 className="text-xl font-extrabold text-white mb-4">Quando Edilizia in Cloud è la scelta giusta:</h3>
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
            <Link
              to="/demo"
              className="inline-flex items-center gap-2 bg-[#F97415] hover:bg-[#e8650e] text-white font-bold px-8 py-4 rounded-2xl transition-colors"
            >
              Richiedi migrazione gratuita <ArrowRight className="w-5 h-5" />
            </Link>
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
            {[
              {
                q: "Quanto costa davvero usare Excel per gestire i cantieri?",
                a: "Il costo diretto è zero, ma il costo reale è stimato tra €1.500 e €3.000 al mese per un'impresa con 3-5 cantieri attivi, considerando le ore perse in aggiornamenti manuali, gli errori di calcolo non rilevati e le decisioni prese su dati obsoleti.",
              },
              {
                q: "Posso migrare i miei dati da Excel a Edilizia in Cloud?",
                a: "Sì. Il team di Edilizia in Cloud migra gratuitamente tutti i tuoi dati da Excel: cantieri, clienti, fornitori e storico. Di solito bastano 48 ore per essere completamente operativi.",
              },
              {
                q: "Edilizia in Cloud è difficile da usare rispetto a Excel?",
                a: "Al contrario: Edilizia in Cloud è progettato per imprenditori edili, non per informatici. L'interfaccia è più semplice di Excel per i task quotidiani del cantiere, e il nostro team ti forma gratuitamente.",
              },
            ].map((item) => (
              <div key={item.q} className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                <h3 className="text-base font-extrabold text-[#111111] mb-3">{item.q}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{item.a}</p>
              </div>
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

      {/* ── CTA ── */}
      <section className="bg-[#111111] py-20 px-4 text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl md:text-4xl font-extrabold text-white mb-4">
            Pronto a smettere con i fogli di calcolo?
          </h2>
          <p className="text-white/70 mb-8 text-lg">
            31 giorni gratis, senza carta di credito. Migrazione gratuita da Excel in 48 ore.
          </p>
          <Link
            to="/demo"
            className="inline-flex items-center gap-2 bg-[#F97415] hover:bg-[#e8650e] text-white font-bold px-10 py-5 rounded-2xl transition-colors text-lg"
          >
            Prova gratis 31 giorni <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      {vsRelatedPosts.length > 0 && (
        <section className="py-14 px-6 bg-white border-t border-gray-100">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-lg font-bold text-[#111111] mb-6">Leggi anche</h2>
            <div className="grid sm:grid-cols-3 gap-4">
              {vsRelatedPosts.map((p) => (
                <Link key={p.slug} to={`/blog/${p.slug}`} className="group flex flex-col gap-2 rounded-xl border border-gray-200 hover:border-[#F97415]/40 p-4 transition-all hover:shadow-sm">
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
    </div>
  );
}
