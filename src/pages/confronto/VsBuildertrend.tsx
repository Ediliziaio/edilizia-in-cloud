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
  { feature: "Setup in 48 ore", eic: { type: "check" }, competitor: { type: "partial", text: "Settimane di onboarding" } },
  { feature: "Prezzo mensile", eic: { type: "text", text: "da €99/mese" }, competitor: { type: "text", text: "da ~€460/mese (Core)" } },
];

const relatedLinks = [
  { to: "/confronto", label: "Tutti i confronti" },
  { to: "/confronto/vs-teamsystem", label: "vs TeamSystem" },
  { to: "/confronto/vs-primus", label: "vs Primus" },
  { to: "/demo", label: "Prova gratis" },
  { to: "/prezzi", label: "Prezzi" },
];

const vsRelatedSlugs = [
  "come-scegliere-software-gestionale-edilizia",
  "alternativa-excel-cantieri",
  "analisi-margini-imprese-edili",
];
const vsRelatedPosts = blogPosts.filter((p) => vsRelatedSlugs.includes(p.slug)).slice(0, 3);

export default function VsBuildertrend() {
  useSEO({
    title: "Edilizia in Cloud vs Buildertrend: Confronto 2026 | Alternativa Italiana",
    description:
      "Confronto Edilizia in Cloud vs Buildertrend per imprese edili italiane. Buildertrend è americano, senza SDI, senza Cassa Edile, senza italiano. Ecco perché le imprese italiane scelgono Edilizia in Cloud.",
    canonical: "/confronto/vs-buildertrend",
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
            "Buildertrend è il software americano per il settore costruzioni. Non ha fatturazione SDI, non gestisce la Cassa Edile italiana e non è disponibile in italiano. Ecco il confronto completo con Edilizia in Cloud.",
          url: "https://ediliziaincloud.com/confronto/vs-buildertrend",
          datePublished: "2026-04-08",
          dateModified: "2026-04-08",
          author: { "@type": "Organization", name: "Edilizia in Cloud" },
          publisher: { "@type": "Organization", name: "Edilizia in Cloud" },
        }}
      />
      <JsonLd
        id="jsonld-breadcrumb-vs-buildertrend"
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: "https://ediliziaincloud.com/" },
            { "@type": "ListItem", position: 2, name: "Confronto", item: "https://ediliziaincloud.com/confronto" },
            {
              "@type": "ListItem",
              position: 3,
              name: "vs Buildertrend",
              item: "https://ediliziaincloud.com/confronto/vs-buildertrend",
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
            Buildertrend è un ottimo software per il mercato americano. Ma non fa fatturazione SDI, non gestisce la Cassa Edile, non parla italiano e costa oltre €460 al mese. Ecco il confronto completo per le imprese edili italiane.
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
            Un confronto diretto, senza sconti. I dati sono basati sulle funzionalità pubblicamente documentate dai due software.
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
        <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-8">
          <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm">
            <div className="text-2xl mb-3">🔵</div>
            <h3 className="text-xl font-extrabold text-[#111111] mb-4">Scegli Buildertrend se...</h3>
            <ul className="mt-4 space-y-2">
              {[
                "Operi principalmente nel mercato americano o internazionale",
                "Non hai obblighi di fatturazione elettronica SDI italiana",
                "Il tuo team lavora già in inglese e hai un budget superiore a €460/mese",
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
            <h3 className="text-xl font-extrabold text-white mb-4">Scegli Edilizia in Cloud se...</h3>
            <ul className="mt-4 space-y-2">
              {[
                "Sei un'impresa edile italiana con obblighi SDI, Cassa Edile e CCNL",
                "Vuoi un gestionale in italiano con supporto in italiano",
                "Vuoi pagare da €99/mese invece di €460+ per un software non localizzato per l'Italia",
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
      <section className="bg-[#f8f9fa] py-16 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="bg-[#F97415]/10 border border-[#F97415]/30 rounded-2xl p-8 text-center">
            <div className="text-3xl mb-4">📦</div>
            <h3 className="text-xl font-extrabold text-[#111111] mb-3">Usi già Buildertrend?</h3>
            <p className="text-gray-600 leading-relaxed mb-6">
              Migriamo i tuoi cantieri, clienti e fornitori da Buildertrend a Edilizia in Cloud in 48 ore, gratuitamente. Il nostro team gestisce tutto — tu inizi a lavorare con un gestionale nato per l'Italia.
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

      {/* ── CTA ── */}
      <section className="bg-[#111111] py-20 px-4 text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl md:text-4xl font-extrabold text-white mb-4">
            Pronto a passare a un gestionale nato per l'edilizia italiana?
          </h2>
          <p className="text-white/70 mb-8 text-lg">
            31 giorni gratis. In italiano. Con SDI, Cassa Edile e CCNL integrati. Cancella quando vuoi.
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
