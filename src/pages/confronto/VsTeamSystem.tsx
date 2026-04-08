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
  { feature: "Specifico per edilizia", eic: { type: "check" }, competitor: { type: "cross" } },
  { feature: "Gestione cantieri real-time", eic: { type: "check" }, competitor: { type: "partial", text: "Modulo aggiuntivo €€€" } },
  { feature: "Margini commessa real-time", eic: { type: "check" }, competitor: { type: "partial", text: "Con BI separata" } },
  { feature: "Fatturazione elettronica SDI", eic: { type: "check" }, competitor: { type: "check" } },
  { feature: "App mobile cantiere", eic: { type: "check" }, competitor: { type: "partial", text: "App generica" } },
  { feature: "CRM e gestione clienti", eic: { type: "check" }, competitor: { type: "check" } },
  { feature: "HR e presenze operai", eic: { type: "check" }, competitor: { type: "check" } },
  { feature: "WhatsApp marketing", eic: { type: "check" }, competitor: { type: "cross" } },
  { feature: "Previsione liquidità cantieri", eic: { type: "check" }, competitor: { type: "partial" } },
  { feature: "Dashboard AI edilizia", eic: { type: "check" }, competitor: { type: "cross" } },
  { feature: "Preventivi con prezzari regionali", eic: { type: "check" }, competitor: { type: "cross" } },
  { feature: "Setup in 48 ore", eic: { type: "check" }, competitor: { type: "cross", text: "4-8 settimane" } },
  { feature: "Supporto italiano", eic: { type: "check" }, competitor: { type: "check" } },
  { feature: "Prezzo mensile", eic: { type: "text", text: "da €79/mese" }, competitor: { type: "text", text: "da €400/mese" } },
];

const relatedLinks = [
  { to: "/confronto", label: "Tutti i confronti" },
  { to: "/confronto/vs-primus", label: "vs Primus" },
  { to: "/confronto/vs-edilnet", label: "vs Edilnet" },
  { to: "/demo", label: "Prova gratis" },
  { to: "/prezzi", label: "Prezzi" },
];

const vsRelatedSlugs = ["software-gestionale-vs-excel", "analisi-margini-imprese-edili", "appalti-pubblici-edilizia-guida"];
const vsRelatedPosts = blogPosts.filter((p) => vsRelatedSlugs.includes(p.slug)).slice(0, 3);

export default function VsTeamSystem() {
  useSEO({
    title: "Edilizia in Cloud vs TeamSystem: Confronto 2026 | Alternativa",
    description:
      "Confronto completo Edilizia in Cloud vs TeamSystem per imprese edili. Prezzo, funzionalità, semplicità d'uso e assistenza a confronto.",
    canonical: "/confronto/vs-teamsystem",
  });

  return (
    <div className="min-h-screen bg-white text-[#111111] overflow-x-hidden">
      <JsonLd
        id="jsonld-article-vs-teamsystem"
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: "Edilizia in Cloud vs TeamSystem: quale scegliere per la tua impresa edile?",
          description:
            "Confronto completo Edilizia in Cloud vs TeamSystem per imprese edili. Prezzo, funzionalità, semplicità d'uso e assistenza a confronto.",
          url: "https://ediliziaincloud.com/confronto/vs-teamsystem",
          datePublished: "2026-01-01",
          dateModified: "2026-04-08",
          author: { "@type": "Organization", name: "Edilizia in Cloud" },
          publisher: { "@type": "Organization", name: "Edilizia in Cloud" },
        }}
      />
      <JsonLd
        id="jsonld-breadcrumb-vs-teamsystem"
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: "https://ediliziaincloud.com/" },
            { "@type": "ListItem", position: 2, name: "Confronto", item: "https://ediliziaincloud.com/confronto" },
            {
              "@type": "ListItem",
              position: 3,
              name: "vs TeamSystem",
              item: "https://ediliziaincloud.com/confronto/vs-teamsystem",
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
            Edilizia in Cloud vs TeamSystem: quale scegliere per la tua impresa edile?
          </h1>
          <p className="text-lg text-white/70 mb-10 max-w-2xl mx-auto">
            TeamSystem è un ERP generalista potente ma costoso e complesso. Edilizia in Cloud è nato per le imprese
            edili: più semplice, più economico e con funzionalità specifiche che TeamSystem non ha. Ecco il confronto
            completo.
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
            Un confronto diretto, senza sconti. I dati sono basati sulle funzionalità pubblicamente documentate dai due
            software.
          </p>
          <div className="overflow-x-auto rounded-2xl border border-gray-100 shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#111111]">
                  <th className="text-left px-6 py-4 text-white/70 font-semibold w-1/2">Funzionalità</th>
                  <th className="text-center px-6 py-4 text-[#F97415] font-bold">Edilizia in Cloud</th>
                  <th className="text-center px-6 py-4 text-white/70 font-semibold">TeamSystem</th>
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

      {/* ── QUANDO SCEGLIERE ── */}
      <section className="bg-[#f8f9fa] py-20 px-4">
        <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-8">
          <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm">
            <div className="text-2xl mb-3">🔵</div>
            <h3 className="text-xl font-extrabold text-[#111111] mb-4">Scegli TeamSystem se...</h3>
            <ul className="mt-4 space-y-2">
              {[
                "Sei un'impresa con più di 100 dipendenti con ERP già integrato",
                "Hai già un reparto IT dedicato all'implementazione e manutenzione",
                "Hai un budget superiore a €500/mese per un gestionale generico",
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
                "Hai un'impresa edile con 1-50 dipendenti",
                "Vuoi essere operativo in 48 ore senza mesi di implementazione",
                "Vuoi una soluzione nativa per l'edilizia senza moduli extra a pagamento",
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
            <h3 className="text-xl font-extrabold text-[#111111] mb-3">Usi già TeamSystem?</h3>
            <p className="text-gray-600 leading-relaxed mb-6">
              Migriamo i tuoi dati da TeamSystem a Edilizia in Cloud in 48 ore, gratuitamente. Cantieri, clienti,
              fornitori e storico: zero perdita di informazioni. Il nostro team gestisce tutto.
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
      <section className="bg-[#f8f9fa] py-16 px-4">
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
            Pronto a passare a un gestionale nato per l'edilizia?
          </h2>
          <p className="text-white/70 mb-8 text-lg">
            31 giorni gratis, senza carta di credito. Migrazione gratuita dai tuoi dati esistenti.
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
