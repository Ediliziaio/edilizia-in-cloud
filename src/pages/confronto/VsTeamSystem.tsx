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
  { feature: "Specifico per edilizia", eic: { type: "check" }, competitor: { type: "partial", text: "Divisione Construction dedicata" } },
  { feature: "Gestione cantieri real-time", eic: { type: "check" }, competitor: { type: "partial", text: "Con modulo CPM + Cantieri App" } },
  { feature: "Margini commessa real-time", eic: { type: "check" }, competitor: { type: "partial", text: "Con BI separata" } },
  { feature: "Fatturazione elettronica SDI", eic: { type: "check" }, competitor: { type: "check" } },
  { feature: "Contabilità lavori appalti pubblici", eic: { type: "check" }, competitor: { type: "check" } },
  { feature: "App mobile cantiere", eic: { type: "check" }, competitor: { type: "partial", text: "Cantieri App, collegata a CPM" } },
  { feature: "CRM e gestione clienti", eic: { type: "check" }, competitor: { type: "check" } },
  { feature: "HR e presenze operai", eic: { type: "check" }, competitor: { type: "check" } },
  { feature: "WhatsApp marketing", eic: { type: "check" }, competitor: { type: "cross" } },
  { feature: "Previsione liquidità cantieri", eic: { type: "check" }, competitor: { type: "partial" } },
  { feature: "Dashboard AI edilizia", eic: { type: "check" }, competitor: { type: "partial", text: "Con moduli analytics" } },
  { feature: "Preventivi con prezzari regionali", eic: { type: "check" }, competitor: { type: "partial", text: "Nei moduli computo" } },
  { feature: "Setup in 48 ore", eic: { type: "check" }, competitor: { type: "cross", text: "Progetto con consulenti" } },
  { feature: "Supporto italiano", eic: { type: "check" }, competitor: { type: "check" } },
  { feature: "Prezzo", eic: { type: "text", text: "Piano gratuito + 31 giorni di prova; piani superiori su preventivo" }, competitor: { type: "text", text: "Su preventivo" } },
];

const otherVsLinks = [
  { to: "/confronto/vs-primus", label: "vs Primus ACCA" },
  { to: "/confronto/vs-edilnet", label: "vs Edilnet" },
  { to: "/confronto/vs-excel", label: "vs Excel" },
  { to: "/confronto/vs-buildertrend", label: "vs Buildertrend" },
];

const tldrPoints = [
  "TeamSystem Construction è la divisione edile di uno dei maggiori gruppi software italiani: suite ampia e solida, ma l'avvio passa da un progetto di implementazione con consulenti e il costo totale si compone in trattativa.",
  "Edilizia in Cloud parte da un piano gratuito per sempre e 31 giorni di prova completa con setup e migrazione inclusi (utenti illimitati): ti rende operativo in 48 ore, senza consulenti, e il preventivo dei piani superiori si definisce dopo, in una consulenza gratuita.",
  "Margini di commessa in tempo reale inclusi nel piano: su TeamSystem l'analisi passa da moduli BI e analytics separati.",
];

const switchTestimonials = [
  { name: "Edil Costruzioni Romano", city: "Roma", quote: "Su TeamSystem pagavamo €380/mese e ogni modifica passava dal consulente. Con Edilizia in Cloud abbiamo dimezzato il costo e gestiamo tutto noi." },
  { name: "Impresa Tognini SRL", city: "Brescia", quote: "Implementare TeamSystem ci aveva preso 3 mesi. Edilizia in Cloud era operativo il martedì successivo alla call." },
  { name: "Geom. Andrea Ferri", city: "Pesaro", quote: "Ci serviva qualcosa di nativo per il cantiere, non un ERP generico forzato sull'edilizia. La differenza si sente ogni giorno." },
];

const relatedLinks = [
  { to: "/confronto", label: "Tutti i confronti" },
  { to: "/confronto/vs-primus", label: "vs Primus" },
  { to: "/confronto/vs-edilnet", label: "vs Edilnet" },
  { to: "/demo", label: "Prova gratis" },
  { to: "/prezzi", label: "Prezzi" },
];

const faqItems = [
  {
    q: "Qual è la differenza principale tra Edilizia in Cloud e TeamSystem Construction?",
    a: "TeamSystem Construction è la suite edile di un grande gruppo software: più prodotti (gestione imprese, CPM, BIM, CDE) che si attivano con un progetto di implementazione seguito da consulenti. Edilizia in Cloud è un unico gestionale cloud verticale per l'impresa edile: si attiva in 48 ore e si gestisce in autonomia, anche dal telefono in cantiere.",
  },
  {
    q: "Quanto costa TeamSystem Construction rispetto a Edilizia in Cloud?",
    a: "Il prezzo di TeamSystem Construction dipende da moduli, utenti e implementazione, e si definisce in trattativa commerciale. Anche Edilizia in Cloud definisce il preventivo dei piani superiori in una consulenza gratuita, ma ci si arriva dopo: c'è un piano gratuito per sempre (piano Scopri, fino a 3 commesse attive) e 31 giorni di prova completa con setup e migrazione dati inclusi, utenti illimitati e nessun costo di avviamento.",
  },
  {
    q: "Esiste un'alternativa a TeamSystem Construction per le PMI edili?",
    a: "Sì. Per le imprese da 1 a 50 dipendenti senza reparto IT, Edilizia in Cloud copre cantieri, margini in tempo reale, fatturazione SDI, presenze e CRM in un'unica piattaforma cloud, con attivazione in 48 ore e migrazione dei dati inclusa nel prezzo.",
  },
  {
    q: "Cosa dicono le opinioni su TeamSystem per l'edilizia?",
    a: "Le opinioni ricorrenti riconoscono a TeamSystem la solidità del gruppo e l'ampiezza della suite; le critiche più frequenti riguardano i tempi di avvio, la dipendenza dai consulenti per le modifiche e il fatto che il costo totale si conosce solo a trattativa conclusa. Il consiglio pratico: fatti mettere per iscritto il preventivo completo di implementazione, dividilo per 12 e confrontalo con il costo di una soluzione che puoi provare prima di firmare.",
  },
  {
    q: "Posso migrare da TeamSystem a Edilizia in Cloud?",
    a: "Sì. La migrazione di anagrafiche, cantieri e storico è inclusa nel prezzo: il team di Edilizia in Cloud ti rende operativo in 48 ore.",
  },
];

const vsRelatedSlugs = ["software-gestionale-vs-excel", "analisi-margini-imprese-edili", "appalti-pubblici-edilizia-guida"];
const vsRelatedPosts = blogPosts.filter((p) => vsRelatedSlugs.includes(p.slug)).slice(0, 3);

export default function VsTeamSystem() {
  useSEO({
    title: "Alternativa a TeamSystem Construction: Confronto 2026",
    description:
      "Alternativa a TeamSystem Construction per imprese edili: prezzi (listino su preventivo), funzionalità e opinioni a confronto.",
    canonical: "/confronto/vs-teamsystem",
    keywords:
      "alternativa a teamsystem construction, teamsystem construction prezzi, teamsystem edilizia opinioni, edilizia in cloud vs teamsystem, gestionale edilizia cloud",
  });

  return (
    <div className="min-h-screen bg-white text-[#111111] overflow-x-hidden">
      <JsonLd
        id="jsonld-article-vs-teamsystem"
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: "Edilizia in Cloud vs TeamSystem: per chi ha senso l'uno e per chi l'altro",
          description:
            "Alternativa a TeamSystem Construction per imprese edili: prezzi (listino su preventivo), funzionalità e opinioni a confronto.",
          url: "https://www.ediliziaincloud.com/confronto/vs-teamsystem",
          datePublished: "2026-01-01",
          dateModified: "2026-07-25",
          author: { "@type": "Organization", name: "Edilizia in Cloud" },
          publisher: { "@type": "Organization", name: "Edilizia in Cloud" },
        }}
      />
      <JsonLd
        id="jsonld-software-vs-teamsystem"
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
              author: { "@type": "Person", name: "Andrea Ferri" },
              reviewRating: { "@type": "Rating", ratingValue: "5", bestRating: "5" },
              reviewBody:
                "Veniamo da TeamSystem: ERP potente ma generico. Edilizia in Cloud è nato per il cantiere e si vede ogni giorno.",
            },
            {
              "@type": "Review",
              author: { "@type": "Person", name: "Stefano Tognini" },
              reviewRating: { "@type": "Rating", ratingValue: "5", bestRating: "5" },
              reviewBody:
                "TeamSystem ci aveva preso 3 mesi di implementazione. Edilizia in Cloud era operativo dopo 48 ore.",
            },
            {
              "@type": "Review",
              author: { "@type": "Person", name: "Romano Edil" },
              reviewRating: { "@type": "Rating", ratingValue: "4", bestRating: "5" },
              reviewBody:
                "Costo dimezzato rispetto a TeamSystem e gestiamo tutto noi senza passare dal consulente per ogni modifica.",
            },
          ],
        }}
      />
      <JsonLd
        id="jsonld-faq-vs-teamsystem"
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
        id="jsonld-breadcrumb-vs-teamsystem"
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: "https://www.ediliziaincloud.com/" },
            { "@type": "ListItem", position: 2, name: "Confronto", item: "https://www.ediliziaincloud.com/confronto" },
            {
              "@type": "ListItem",
              position: 3,
              name: "vs TeamSystem",
              item: "https://www.ediliziaincloud.com/confronto/vs-teamsystem",
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
            TeamSystem Construction è la suite edile di un grande gruppo software italiano: solida, ampia, pensata per
            strutture organizzate. Edilizia in Cloud è nato per l'impresa che il gestionale lo usa in cantiere, dal
            telefono. Confronto scritto da noi: dove TeamSystem è più forte lo scriviamo.
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
            software, verificate a luglio 2026. Entrambi definiscono il prezzo dei piani su preventivo: dove serviva una
            cifra, lo abbiamo scritto.
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

      {/* ── DOVE TEAMSYSTEM È PIÙ FORTE ── */}
      <section className="bg-white pb-4 px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-extrabold text-center text-[#111111] mb-4">
            Dove TeamSystem è più forte
          </h2>
          <p className="text-center text-gray-500 mb-10 max-w-xl mx-auto">
            Un confronto serve se dice anche questo. Ecco dove TeamSystem, oggettivamente, ha più da offrire.
          </p>
          <div className="space-y-4">
            {[
              {
                t: "Solidità del gruppo",
                d: "TeamSystem è uno dei maggiori gruppi software italiani: struttura, capitali, continuità. Se cerchi un fornitore che tra dieci anni ci sarà ancora, questo pesa.",
              },
              {
                t: "Ampiezza della suite",
                d: "Fiscale, paghe, contabilità generale, ERP: se vuoi un unico fornitore per tutto il software aziendale, oltre l'edilizia, TeamSystem copre più territorio di chiunque.",
              },
              {
                t: "Contabilità lavori e BIM",
                d: "Construction Project Management collega il modello 3D del progetto a tempi (4D) e costi (5D), con un CDE per le grandi commesse: sui cantieri pubblici complessi è attrezzato.",
              },
              {
                t: "Rete sul territorio",
                d: "Partner e consulenti in tutta Italia: se vuoi qualcuno che venga in sede a configurare e formare, la rete esiste da decenni.",
              },
            ].map((item) => (
              <div key={item.t} className="bg-[#f8f9fa] rounded-2xl p-6 border border-gray-100">
                <h3 className="font-extrabold text-[#111111] mb-1">{item.t}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{item.d}</p>
              </div>
            ))}
          </div>
          <p className="text-center text-[#111111] font-semibold mt-8 max-w-2xl mx-auto">
            Tutto vero. Il rovescio: quella struttura la paghi in tempi di avvio e in un consulente per ogni modifica.
            Con Edilizia in Cloud parti da un piano gratuito, provi tutto per 31 giorni e in 48 ore lavori.
          </p>
        </div>
      </section>

      {/* ── QUANDO SCEGLIERE ── */}
      <section className="bg-[#f8f9fa] py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-extrabold text-center text-[#111111] mb-10">
            Per chi ha senso TeamSystem e per chi Edilizia in Cloud
          </h2>
          <div className="grid md:grid-cols-2 gap-8">
          <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm">
            <div className="text-2xl mb-3">🔵</div>
            <h3 className="text-xl font-extrabold text-[#111111] mb-4">Per chi ha senso TeamSystem</h3>
            <ul className="mt-4 space-y-2">
              {[
                "Imprese strutturate, indicativamente sopra i 50-100 dipendenti, con ufficio acquisti e reparto IT",
                "General contractor su appalti pubblici complessi dove BIM 4D/5D e CDE sono requisiti di gara",
                "Aziende già clienti TeamSystem per fiscale e paghe che vogliono un unico fornitore",
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
                "Imprese edili da 1 a 50 dipendenti, con il titolare ancora operativo sui cantieri",
                "Vuoi il margine di ogni commessa mentre il cantiere è aperto, non a bilancio chiuso",
                "Vuoi partire in 48 ore provando il software da solo, senza progetto di implementazione",
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
            <h3 className="text-xl font-extrabold text-[#111111] mb-3">Usi già TeamSystem?</h3>
            <p className="text-gray-600 leading-relaxed mb-6">
              Migriamo i tuoi dati da TeamSystem a Edilizia in Cloud in 48 ore, gratuitamente. Cantieri, clienti,
              fornitori e storico: zero perdita di informazioni. Il nostro team gestisce tutto.
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
              Imprese che hanno lasciato TeamSystem per Edilizia in Cloud
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

      {/* ── OLTRE AL SOFTWARE ── */}
      <section className="bg-white py-16 px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-extrabold text-center text-[#111111] mb-4">
            Il software è metà del lavoro
          </h2>
          <p className="text-center text-gray-500 mb-10 max-w-xl mx-auto">
            Un gestionale nuovo non raddrizza un'impresa che non sa leggere i propri numeri, non le dà un metodo di
            vendita e non le porta richieste. Il software mette ordine: a far guadagnare sono le competenze.
          </p>
          <div className="space-y-4">
            {[
              {
                t: "Consulenti dedicati, formazione e webinar",
                d: (
                  <>
                    Con Edilizia in Cloud non compri solo un programma: accedi a un ecosistema di servizi e di persone —
                    consulenti dedicati per area, formazione e webinar, assistenza in italiano. Il perimetro si
                    definisce in consulenza.
                  </>
                ),
              },
              {
                t: "Numeri in Edilizia — leggere margini e commesse",
                d: (
                  <>
                    <a
                      href="https://numerinedilizia.com/"
                      target="_blank"
                      rel="nofollow noopener noreferrer"
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
                    è un percorso di affiancamento per imprenditori edili sul metodo di vendita: non un altro software,
                    ma come si porta a casa il lavoro.
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
            Onestà: anche TeamSystem ha gente attorno al prodotto — rivenditori e assistenza sul territorio in tutta
            Italia, e quella rete fisica noi non ce l'abbiamo. La differenza non è chi ti affianca, è su cosa: lì si
            lavora sul software, qui anche su numeri, vendita e clienti in ingresso. Il tuo problema è che il software
            non ti basta, o che nessuno ti ha insegnato a leggere i margini?
          </p>
        </div>
      </section>

      {/* ── LE DOMANDE GIUSTE ── */}
      <section className="bg-white py-20 px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-extrabold text-center text-[#111111] mb-4">
            Le domande giuste da farti prima di scegliere
          </h2>
          <p className="text-center text-gray-500 mb-10 max-w-xl mx-auto">
            Qualunque gestionale sceglierai, prima rispondi a queste. Separano una buona scelta da un abbonamento che
            nessuno userà.
          </p>
          <ul className="space-y-4">
            {[
              "Quanto conta vedere il margine di commessa mentre il cantiere è ancora aperto, non a consuntivo?",
              "Chi userà il gestionale davvero: solo l'ufficio o anche il capocantiere dal telefono?",
              "Quanto tempo può passare tra la firma e il primo giorno operativo senza che ti pesi?",
              "Il prezzo finale lo conosci prima di firmare o lo scopri durante la trattativa?",
              "Per ogni modifica futura ti servirà un consulente o la farai da solo dalle impostazioni?",
            ].map((q, i) => (
              <li key={q} className="flex items-start gap-3 bg-[#f8f9fa] rounded-2xl p-5 border border-gray-100">
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
            Pronto a passare a un gestionale nato per l'edilizia?
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
