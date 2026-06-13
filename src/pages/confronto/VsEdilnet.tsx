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
  { feature: "Contabilità integrata", eic: { type: "partial", text: "Via commercialista" }, competitor: { type: "check" } },
  { feature: "Cloud nativo", eic: { type: "check" }, competitor: { type: "cross" } },
  { feature: "App mobile moderna", eic: { type: "check" }, competitor: { type: "cross" } },
  {
    feature: "Costo setup",
    eic: { type: "text", text: "€0 — incluso nel piano" },
    competitor: { type: "text", text: "€2.000 – €5.000" },
  },
  { feature: "Tempo di implementazione", eic: { type: "text", text: "48 ore" }, competitor: { type: "text", text: "4-12 settimane" } },
  { feature: "Gestione cantieri real-time", eic: { type: "check" }, competitor: { type: "partial" } },
  { feature: "Margini commessa real-time", eic: { type: "check" }, competitor: { type: "partial" } },
  { feature: "Fatturazione elettronica SDI", eic: { type: "check" }, competitor: { type: "partial" } },
  { feature: "WhatsApp e Email marketing", eic: { type: "check" }, competitor: { type: "cross" } },
  { feature: "Timbrature GPS operai", eic: { type: "check" }, competitor: { type: "partial" } },
  { feature: "Previsione liquidità", eic: { type: "check" }, competitor: { type: "partial" } },
  { feature: "Canone mensile", eic: { type: "text", text: "Da €127/mese (€99 annuale)" }, competitor: { type: "text", text: "Da €150-200/mese (+€2.000-5.000 setup)" } },
  { feature: "Supporto italiano", eic: { type: "check" }, competitor: { type: "check" } },
  { feature: "Aggiornamenti inclusi", eic: { type: "check" }, competitor: { type: "partial" } },
];

const relatedLinks = [
  { to: "/confronto/vs-primus", label: "vs Primus ACCA" },
  { to: "/funzionalita/gestione-cantieri", label: "Gestione Cantieri" },
  { to: "/funzionalita/margini-cantiere", label: "Margini Cantiere" },
];

const otherVsLinks = [
  { to: "/confronto/vs-primus", label: "vs Primus ACCA" },
  { to: "/confronto/vs-teamsystem", label: "vs TeamSystem Construction" },
  { to: "/confronto/vs-excel", label: "vs Excel" },
  { to: "/confronto/vs-buildertrend", label: "vs Buildertrend" },
];

const tldrPoints = [
  "Edilnet è un gestionale on-premise tradizionale: setup €2.000-5.000 e 4-12 settimane prima di essere operativi.",
  "Edilizia in Cloud è SaaS, da €127/mese all-inclusive senza costi di setup, attivo in 48 ore.",
  "App mobile nativa, AI per i margini e WhatsApp marketing inclusi: su Edilnet sono moduli a parte o assenti.",
];

const switchTestimonials = [
  { name: "Edili Mariotti SNC", city: "Pesaro", quote: "Edilnet ci aveva chiesto €4.500 di setup e 2 mesi di formazione. Edilizia in Cloud era operativo dopo 48 ore senza un euro di setup." },
  { name: "Costruzioni Fontana", city: "Padova", quote: "Su Edilnet i dati stavano sul server in ufficio: in cantiere lavoravamo a memoria. Ora ho tutto sul telefono." },
  { name: "Geom. Paolo Greco", city: "Catania", quote: "Eravamo bloccati su versioni vecchie di Edilnet perché aggiornare costava. Con Edilizia in Cloud gli aggiornamenti arrivano da soli ogni mese." },
];

const vsRelatedSlugs = ["alternativa-excel-cantieri", "gestione-cantieri-digitale", "preventivi-edilizia-guida"];
const vsRelatedPosts = blogPosts.filter((p) => vsRelatedSlugs.includes(p.slug)).slice(0, 3);

export default function VsEdilnet() {
  useSEO({
    title: "Edilizia in Cloud vs Edilnet",
    description:
      "Confronto tra Edilizia in Cloud e Edilnet: funzionalità, prezzi, supporto e facilità di migrazione. Scopri le differenze e scegli il gestionale edilizia giusto.",
    canonical: "/confronto/vs-edilnet",
    keywords:
      "edilizia in cloud vs edilnet, alternativa edilnet, edilnet confronto, gestionale edilizia alternativa edilnet, software cantieri edilnet",
  });

  return (
    <div className="min-h-screen bg-white text-[#111111] overflow-x-hidden">
      <JsonLd
        id="jsonld-breadcrumb-vs-edilnet"
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: "https://www.ediliziaincloud.com/" },
            { "@type": "ListItem", position: 2, name: "Confronto", item: "https://www.ediliziaincloud.com/confronto" },
            {
              "@type": "ListItem",
              position: 3,
              name: "vs Edilnet",
              item: "https://www.ediliziaincloud.com/confronto/vs-edilnet",
            },
          ],
        }}
      />
      <JsonLd
        id="jsonld-software-vs-edilnet"
        data={{
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "Edilizia in Cloud",
          applicationCategory: "BusinessApplication",
          operatingSystem: "Web, iOS, Android",
          offers: {
            "@type": "Offer",
            price: "127",
            priceCurrency: "EUR",
            priceValidUntil: "2026-12-31",
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
              author: { "@type": "Person", name: "Paolo Greco" },
              reviewRating: { "@type": "Rating", ratingValue: "5", bestRating: "5" },
              reviewBody:
                "Su Edilnet aggiornare era un costo. Su Edilizia in Cloud arriva tutto incluso ogni mese.",
            },
            {
              "@type": "Review",
              author: { "@type": "Person", name: "Costruzioni Fontana" },
              reviewRating: { "@type": "Rating", ratingValue: "5", bestRating: "5" },
              reviewBody:
                "App mobile vera, dati sul telefono in cantiere. Su Edilnet eravamo legati al server in ufficio.",
            },
            {
              "@type": "Review",
              author: { "@type": "Person", name: "Mariotti Edili" },
              reviewRating: { "@type": "Rating", ratingValue: "4", bestRating: "5" },
              reviewBody:
                "Niente setup, niente 2 mesi di formazione. In 48 ore eravamo operativi.",
            },
          ],
        }}
      />
      <JsonLd
        id="jsonld-webpage-vs-edilnet"
        data={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "Edilizia in Cloud vs Edilnet — Confronto Gestionale Edilizia 2026",
          description:
            "Confronto tra Edilizia in Cloud e Edilnet: funzionalità, prezzi, supporto e facilità di migrazione.",
          url: "https://www.ediliziaincloud.com/confronto/vs-edilnet",
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
            Edilizia in Cloud vs Edilnet —{" "}
            <span className="text-[#F97415]">Confronto 2026</span>
          </h1>
          <p className="text-lg text-white/70 mb-10 max-w-2xl mx-auto">
            Edilnet è un gestionale ERP tradizionale, on-premise, con costi di implementazione elevati. Edilizia in
            Cloud è la scelta moderna per le PMI edili: cloud nativo, app mobile, operativo in 48 ore.
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
            Confronto diretto basato sulle funzionalità documentate dei due software.
          </p>
          <div className="overflow-x-auto rounded-2xl border border-gray-100 shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#111111]">
                  <th className="text-left px-6 py-4 text-white/70 font-semibold w-1/2">Funzionalità</th>
                  <th className="text-center px-6 py-4 text-[#F97415] font-bold">Edilizia in Cloud</th>
                  <th className="text-center px-6 py-4 text-white/70 font-semibold">Edilnet</th>
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
            <h3 className="text-xl font-extrabold text-[#111111] mb-4">Quando scegliere Edilnet</h3>
            <p className="text-gray-600 leading-relaxed">
              Edilnet è adatto a imprese molto grandi con reparto IT dedicato, che hanno bisogno di contabilità
              generale completamente integrata e sono già abituate a software desktop con lunghi cicli di implementazione.
            </p>
            <ul className="mt-4 space-y-2">
              {[
              "Imprese con +100 dipendenti e reparto IT",
                "Necessità di contabilità generale integrata",
                "Budget IT elevato (€2.000-5.000+ setup)",
                "Processi già strutturati su software desktop",
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
            <h3 className="text-xl font-extrabold text-white mb-4">Quando scegliere Edilizia in Cloud</h3>
            <p className="text-white/70 leading-relaxed">
              PMI edili da 2 a 100 dipendenti che vogliono essere operative in 48 ore senza investimenti iniziali e con
              un software che si usa dal telefono, ovunque ci sia una connessione.
            </p>
            <ul className="mt-4 space-y-2">
              {[
                "PMI edile da 2 a 100 dipendenti",
                "Vuoi essere operativo in 48 ore",
                "Zero costi di setup, nessun reparto IT",
                "Gestisci cantieri dal telefono in mobilità",
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
            <h3 className="text-xl font-extrabold text-[#111111] mb-3">Vieni da Edilnet?</h3>
            <p className="text-gray-600 leading-relaxed mb-6">
              Migriamo gratuitamente i tuoi cantieri, clienti e fornitori in 48 ore. Il nostro team gestisce tutto,
              senza interruzione operativa per la tua impresa.
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

      {/* ── TRUST BLOCK ── */}
      <section className="bg-white py-16 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-extrabold text-[#111111] mb-2">
              Imprese che hanno lasciato Edilnet per Edilizia in Cloud
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
      <section className="bg-white py-10 px-4 border-t border-gray-100">
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
            Operativo in 48 ore, senza costi di setup
          </h2>
          <p className="text-white/70 mb-8 text-lg">
            31 giorni gratis. Migrazione gratuita dai tuoi dati esistenti. Cancella quando vuoi.
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
