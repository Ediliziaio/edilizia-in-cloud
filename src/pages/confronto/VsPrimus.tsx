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
  { feature: "Computo metrico", eic: { type: "check" }, competitor: { type: "text", text: "Eccellente" } },
  { feature: "Gestione cantieri real-time", eic: { type: "check" }, competitor: { type: "cross" } },
  { feature: "Margini commessa real-time", eic: { type: "check" }, competitor: { type: "partial" } },
  {
    feature: "Fatturazione elettronica SDI",
    eic: { type: "check" },
    competitor: { type: "partial", text: "Solo con modulo aggiuntivo" },
  },
  { feature: "App mobile cantiere", eic: { type: "check" }, competitor: { type: "cross" } },
  { feature: "CRM e gestione clienti", eic: { type: "check" }, competitor: { type: "cross" } },
  { feature: "HR e presenze operai", eic: { type: "check" }, competitor: { type: "cross" } },
  { feature: "WhatsApp marketing", eic: { type: "check" }, competitor: { type: "cross" } },
  { feature: "Previsione liquidità", eic: { type: "check" }, competitor: { type: "cross" } },
  { feature: "Dashboard AI", eic: { type: "check" }, competitor: { type: "cross" } },
  { feature: "Prezzari regionali integrati", eic: { type: "check" }, competitor: { type: "text", text: "Eccellente" } },
  {
    feature: "Aggiornamento prezzi",
    eic: { type: "text", text: "Automatico (Cloud)" },
    competitor: { type: "partial", text: "Manuale" },
  },
  { feature: "Supporto italiano", eic: { type: "check" }, competitor: { type: "check" } },
  {
    feature: "Prezzo base",
    eic: { type: "text", text: "Da €127/mese (€99 annuale)" },
    competitor: { type: "text", text: "Da ~€85-95/mese (modulare)" },
  },
];

const relatedLinks = [
  { to: "/confronto/vs-edilnet", label: "vs Edilnet" },
  { to: "/funzionalita/gestione-cantieri", label: "Gestione Cantieri" },
  { to: "/funzionalita/margini-cantiere", label: "Margini Cantiere" },
];

const otherVsLinks = [
  { to: "/confronto/vs-teamsystem", label: "vs TeamSystem Construction" },
  { to: "/confronto/vs-edilnet", label: "vs Edilnet" },
  { to: "/confronto/vs-excel", label: "vs Excel" },
  { to: "/confronto/vs-buildertrend", label: "vs Buildertrend" },
];

const tldrPoints = [
  "Primus ACCA è imbattibile sul computo metrico, ma copre solo la fase tecnica: niente cantieri real-time, niente margini live, niente CRM/HR.",
  "Edilizia in Cloud copre l'intero ciclo della commessa con AI per i margini in tempo reale e setup garantito in 48 ore.",
  "Prezzo Primus modulare ~€85-95/mese (solo computo); Edilizia in Cloud da €127/mese all-inclusive.",
];

const switchTestimonials = [
  { name: "Ing. Marco Vitali", city: "Bologna", quote: "Con Primus facevamo solo i computi. Quando il cantiere partiva, tornavamo su Excel. Edilizia in Cloud unisce le due cose: preventivo e cantiere parlano da soli." },
  { name: "Costruzioni Russo SRL", city: "Salerno", quote: "Tenevamo Primus per le gare pubbliche e nient'altro. Oggi gestiamo SAL, fatture e operai dalla stessa piattaforma — abbiamo recuperato 6 ore a settimana." },
  { name: "Geom. Laura Bianchi", city: "Verona", quote: "Il punto non è che Primus sia peggio: è che da solo non basta. Volevo i margini di commessa aggiornati, non un PDF a fine lavori." },
];

const vsRelatedSlugs = ["alternativa-excel-cantieri", "software-gestionale-vs-excel", "come-fare-preventivo-edilizia"];
const vsRelatedPosts = blogPosts.filter((p) => vsRelatedSlugs.includes(p.slug)).slice(0, 3);

export default function VsPrimus() {
  useSEO({
    title: "Edilizia in Cloud vs Primus ACCA",
    description:
      "Confronto dettagliato tra Edilizia in Cloud e Primus ACCA Software: funzionalità, prezzi, facilità d'uso e supporto. Scopri quale gestionale edilizia fa per te.",
    canonical: "/confronto/vs-primus",
    keywords:
      "edilizia in cloud vs primus, alternativa primus software edilizia, primus acca software confronto, gestionale edilizia alternativa primus, software edilizia cloud vs desktop",
  });

  return (
    <div className="min-h-screen bg-white text-[#111111] overflow-x-hidden">
      <JsonLd
        id="jsonld-breadcrumb-vs-primus"
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: "https://www.ediliziaincloud.com/" },
            { "@type": "ListItem", position: 2, name: "Confronto", item: "https://www.ediliziaincloud.com/confronto" },
            {
              "@type": "ListItem",
              position: 3,
              name: "vs Primus",
              item: "https://www.ediliziaincloud.com/confronto/vs-primus",
            },
          ],
        }}
      />
      <JsonLd
        id="jsonld-webpage-vs-primus"
        data={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "Edilizia in Cloud vs Primus ACCA — Confronto Gestionale Edilizia 2026",
          description:
            "Confronto dettagliato tra Edilizia in Cloud e Primus ACCA Software: funzionalità, prezzi, facilità d'uso e supporto.",
          url: "https://www.ediliziaincloud.com/confronto/vs-primus",
        }}
      />
      <JsonLd
        id="jsonld-software-vs-primus"
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
            ratingValue: "4.9",
            reviewCount: "127",
            bestRating: "5",
            worstRating: "1",
          },
          review: [
            {
              "@type": "Review",
              author: { "@type": "Person", name: "Marco Vitali" },
              reviewRating: { "@type": "Rating", ratingValue: "5", bestRating: "5" },
              reviewBody:
                "Veniamo da Primus: il computo metrico era ottimo ma per il cantiere tornavamo su Excel. Con Edilizia in Cloud preventivo e cantiere parlano insieme.",
            },
            {
              "@type": "Review",
              author: { "@type": "Person", name: "Laura Bianchi" },
              reviewRating: { "@type": "Rating", ratingValue: "5", bestRating: "5" },
              reviewBody:
                "Margini di commessa aggiornati ogni giorno, non un PDF a fine lavori. È il salto che cercavamo dopo Primus.",
            },
            {
              "@type": "Review",
              author: { "@type": "Person", name: "Davide Russo" },
              reviewRating: { "@type": "Rating", ratingValue: "4", bestRating: "5" },
              reviewBody:
                "Setup in 48 ore reale. Su Primus avevamo speso settimane di formazione, qui in due giorni eravamo operativi.",
            },
          ],
        }}
      />
      <JsonLd
        id="jsonld-faq-vs-primus"
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: [
            {
              "@type": "Question",
              name: "Edilizia in Cloud può sostituire Primus?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Dipende da cosa ti serve. Per il solo computo metrico avanzato, Primus resta un ottimo strumento di preventivazione. Se però devi gestire l'impresa — cantieri in tempo reale, fatturazione elettronica SDI, margini di commessa, presenze e HR — Edilizia in Cloud copre l'intero flusso operativo in cloud, con computo e prezzari regionali integrati.",
              },
            },
            {
              "@type": "Question",
              name: "Posso migrare i dati da Primus a Edilizia in Cloud?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Sì. Il team di Edilizia in Cloud importa listini, anagrafiche e cantieri: di solito bastano 48 ore per essere operativi, senza costi di setup.",
              },
            },
            {
              "@type": "Question",
              name: "Quanto costa Edilizia in Cloud rispetto a Primus?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Edilizia in Cloud parte da 127€/mese (99€ con piano annuale) con utenti illimitati e tutto incluso. Primus parte da circa 85-95€/mese ma è modulare: aggiungendo i moduli il totale sale, e resta un software di preventivazione, non un gestionale operativo d'impresa.",
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
            Edilizia in Cloud vs Primus —{" "}
            <span className="text-[#F97415]">Confronto 2026</span>
          </h1>
          <p className="text-lg text-white/70 mb-10 max-w-2xl mx-auto">
            Primus ACCA è un ottimo software per computi metrici e preventivi. Edilizia in Cloud è qualcosa di diverso:
            un gestionale completo per tutto il ciclo di vita della commessa, dalla trattativa al saldo finale.
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
            software.
          </p>
          <div className="overflow-x-auto rounded-2xl border border-gray-100 shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#111111]">
                  <th className="text-left px-6 py-4 text-white/70 font-semibold w-1/2">Funzionalità</th>
                  <th className="text-center px-6 py-4 text-[#F97415] font-bold">Edilizia in Cloud</th>
                  <th className="text-center px-6 py-4 text-white/70 font-semibold">Primus ACCA</th>
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
            <h3 className="text-xl font-extrabold text-[#111111] mb-4">Quando scegliere Primus ACCA</h3>
            <p className="text-gray-600 leading-relaxed">
              Se il tuo lavoro è principalmente fare computi metrici e preventivi per gare d'appalto pubbliche, Primus
              ACCA è specializzato e potente. Ha prezzari regionali eccellenti e strumenti di calcolo molto precisi.
            </p>
            <ul className="mt-4 space-y-2">
              {[
                "Principalmente computi metrici per appalti pubblici",
                "Studi di progettazione o ingegneria",
                "Preventivazione tecnica ad alto dettaglio",
                "Nessuna necessità di gestire cantieri in real-time",
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
              Se hai cantieri attivi e vuoi controllare i margini in tempo reale, gestire il personale, emettere
              SAL/fatture e avere tutto in un'unica piattaforma cloud accessibile dal telefono.
            </p>
            <ul className="mt-4 space-y-2">
              {[
                "Impresa edile con cantieri attivi da gestire",
                "Vuoi i margini in tempo reale, non a consuntivo",
                "Hai operai da gestire con timbrature e presenze",
                "Vuoi fatturare i SAL direttamente dal gestionale",
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
            <h3 className="text-xl font-extrabold text-[#111111] mb-3">Usi già Primus?</h3>
            <p className="text-gray-600 leading-relaxed mb-6">
              Importiamo i tuoi computi metrici in Edilizia in Cloud in formato XMK/XPW in 24 ore. Zero perdita di dati.
              Il nostro team gestisce la migrazione gratuitamente.
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
            {[
              {
                q: "Edilizia in Cloud può sostituire Primus?",
                a: "Dipende da cosa ti serve. Per il solo computo metrico avanzato, Primus resta un ottimo strumento di preventivazione. Se però devi gestire l'impresa — cantieri in tempo reale, fatturazione elettronica SDI, margini di commessa, presenze e HR — Edilizia in Cloud copre l'intero flusso operativo in cloud, con computo e prezzari regionali integrati.",
              },
              {
                q: "Posso migrare i dati da Primus a Edilizia in Cloud?",
                a: "Sì. Il team di Edilizia in Cloud importa listini, anagrafiche e cantieri: di solito bastano 48 ore per essere operativi, senza costi di setup.",
              },
              {
                q: "Quanto costa Edilizia in Cloud rispetto a Primus?",
                a: "Edilizia in Cloud parte da 127€/mese (99€ con piano annuale) con utenti illimitati e tutto incluso. Primus parte da circa 85-95€/mese ma è modulare: aggiungendo i moduli il totale sale, e resta un software di preventivazione, non un gestionale operativo d'impresa.",
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

      {/* ── TRUST BLOCK: Imprese che hanno lasciato Primus ── */}
      <section className="bg-white py-16 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-extrabold text-[#111111] mb-2">
              Imprese che hanno lasciato Primus per Edilizia in Cloud
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
            Pronto a passare a un gestionale completo?
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
