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
  {
    feature: "Tipo di prodotto",
    eic: { type: "text", text: "Gestionale edile online" },
    competitor: { type: "text", text: "Portale di richieste di preventivo" },
  },
  { feature: "Trovare nuovi clienti privati", eic: { type: "partial", text: "CRM e marketing, non marketplace" }, competitor: { type: "check" } },
  { feature: "Profilo pubblico con recensioni", eic: { type: "cross" }, competitor: { type: "check" } },
  { feature: "Gestione cantieri e commesse", eic: { type: "check" }, competitor: { type: "cross" } },
  { feature: "Redazione preventivi e computo", eic: { type: "check" }, competitor: { type: "cross", text: "Raccoglie richieste, non li redige" } },
  { feature: "Margini commessa real-time", eic: { type: "check" }, competitor: { type: "cross" } },
  { feature: "Fatturazione elettronica SDI", eic: { type: "check" }, competitor: { type: "cross" } },
  { feature: "Presenze e timbrature operai", eic: { type: "check" }, competitor: { type: "cross" } },
  { feature: "App mobile cantiere", eic: { type: "check" }, competitor: { type: "cross" } },
  { feature: "Previsione liquidità", eic: { type: "check" }, competitor: { type: "cross" } },
  {
    feature: "Costo",
    eic: { type: "text", text: "Piano gratuito + 31 giorni di prova; piani superiori su preventivo" },
    competitor: { type: "text", text: "Gratis per i privati; partnership per le imprese" },
  },
  { feature: "Supporto italiano", eic: { type: "check" }, competitor: { type: "check" } },
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
  "Edilnet non è un gestionale: edilnet.it è un portale che raccoglie richieste di preventivo dai privati e le gira alle imprese registrate. Serve a trovare clienti, non a gestirli.",
  "Edilizia in Cloud è un gestionale edile online: cantieri, margini in tempo reale, fatturazione SDI, presenze e CRM in un'unica piattaforma, con un piano gratuito per partire e 31 giorni di prova completa sui piani superiori.",
  "Non si escludono: puoi ricevere richieste da Edilnet e gestire preventivo, commessa e fattura dentro Edilizia in Cloud. Sono due risposte a due problemi diversi.",
];

const switchTestimonials = [
  { name: "Edili Mariotti SNC", city: "Pesaro", quote: "Le richieste dai portali arrivavano, ma poi preventivi e cantieri li gestivamo su carta e WhatsApp. Con Edilizia in Cloud eravamo operativi in 48 ore." },
  { name: "Costruzioni Fontana", city: "Padova", quote: "Il problema non era trovare i clienti: era gestirli. Ora dal primo contatto alla fattura è tutto sul telefono, anche in cantiere." },
  { name: "Geom. Paolo Greco", city: "Catania", quote: "Prima rincorrevo le richieste di preventivo e perdevo i follow-up. Col CRM ogni richiesta ha una scadenza e nessuna si perde più." },
];

const faqItems = [
  {
    q: "Edilnet è un gestionale per imprese edili?",
    a: "No. Edilnet.it è un portale di richieste di preventivo: mette in contatto privati che cercano un'impresa con aziende registrate nella loro zona. Non gestisce cantieri, fatture, presenze o margini — per quello serve un gestionale edile.",
  },
  {
    q: "Qual è l'alternativa a Edilnet per gestire l'impresa?",
    a: "Se quello che cerchi non è un canale per trovare clienti ma uno strumento per gestirli, l'alternativa è un gestionale edile online come Edilizia in Cloud: preventivi, cantieri, margini in tempo reale, fatturazione SDI e presenze in un'unica piattaforma, con un piano gratuito per partire e 31 giorni di prova completa, operativa in 48 ore.",
  },
  {
    q: "Posso usare Edilnet e Edilizia in Cloud insieme?",
    a: "Sì, e ha senso: Edilnet ti porta la richiesta di preventivo, Edilizia in Cloud la trasforma in preventivo, commessa e fattura. Uno è un canale commerciale, l'altro è il gestionale che governa il lavoro.",
  },
  {
    q: "Come si confrontano i gestionali edili online?",
    a: "Quattro criteri pratici per un confronto tra gestionali edili online: se puoi provarlo da solo prima di firmare o devi passare per forza da una trattativa; quanto passa tra firma e operatività; se il capocantiere può usarlo dal telefono; se margini e liquidità si vedono a cantiere aperto. Edilizia in Cloud: piano gratuito per partire e 31 giorni di prova completa con setup incluso, operativo in 48 ore, app mobile e margini in tempo reale.",
  },
  {
    q: "Posso provare Edilizia in Cloud gratuitamente?",
    a: "Sì, in due modi. C'è un piano gratuito per sempre (piano Scopri, fino a 3 commesse attive) e ci sono 31 giorni di prova con accesso completo al piano, con setup e migrazione dati inclusi, senza carta di credito e senza addebito automatico: puoi verificare tutto mentre continui a lavorare come oggi.",
  },
];

const vsRelatedSlugs = ["alternativa-excel-cantieri", "gestione-cantieri-digitale", "preventivi-edilizia-guida"];
const vsRelatedPosts = blogPosts.filter((p) => vsRelatedSlugs.includes(p.slug)).slice(0, 3);

export default function VsEdilnet() {
  useSEO({
    title: "Edilnet Alternativa? Gestionale Edile Online a Confronto",
    description:
      "Edilnet è un portale di preventivi, non un gestionale edile online: il confronto onesto con Edilizia in Cloud e quando ha senso usarli insieme. Luglio 2026.",
    canonical: "/confronto/vs-edilnet",
    keywords:
      "edilnet alternativa, gestionale edile online confronto, edilizia in cloud vs edilnet, edilnet gestionale, portale preventivi edilizia, software cantieri edilnet",
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
              author: { "@type": "Person", name: "Paolo Greco" },
              reviewRating: { "@type": "Rating", ratingValue: "5", bestRating: "5" },
              reviewBody:
                "Aggiornamenti inclusi ogni mese, senza costi extra e senza interventi del tecnico.",
            },
            {
              "@type": "Review",
              author: { "@type": "Person", name: "Costruzioni Fontana" },
              reviewRating: { "@type": "Rating", ratingValue: "5", bestRating: "5" },
              reviewBody:
                "App mobile vera: i dati del cantiere sono sul telefono, non solo sul PC dell\u2019ufficio.",
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
        id="jsonld-faq-vs-edilnet"
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
        id="jsonld-webpage-vs-edilnet"
        data={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "Edilizia in Cloud vs Edilnet — Portale Preventivi e Gestionale Edile Online a Confronto 2026",
          description:
            "Edilnet è un portale di richieste di preventivo, non un gestionale edile online: il confronto onesto con Edilizia in Cloud e quando ha senso usarli insieme.",
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
            Chi cerca "Edilnet" di solito vuole una di due cose: trovare clienti o gestire l'impresa. Edilnet.it è un
            portale di richieste di preventivo; Edilizia in Cloud è un gestionale edile online. Confronto scritto da
            noi: cosa fa l'uno, cosa fa l'altro, quando ha senso usarli insieme.
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
            Confronto diretto, con dati dai siti ufficiali verificati a luglio 2026. Attenzione: sono due categorie di
            prodotto diverse — la tabella serve proprio a capire chi fa cosa.
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

      {/* ── DOVE EDILNET È PIÙ FORTE ── */}
      <section className="bg-white pb-4 px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-extrabold text-center text-[#111111] mb-4">
            Dove Edilnet è più forte
          </h2>
          <p className="text-center text-gray-500 mb-10 max-w-xl mx-auto">
            Un confronto serve se dice anche questo. Per quello che fa — portare contatti — Edilnet ha i suoi punti.
          </p>
          <div className="space-y-4">
            {[
              {
                t: "Ti porta richieste di preventivo",
                d: "I privati pubblicano il lavoro, le imprese registrate ricevono il contatto: se il tuo problema è trovare clienti, il portale fa esattamente quello.",
              },
              {
                t: "Visibilità e recensioni",
                d: "Profilo pubblico con recensioni verificate: per un'impresa che lavora col privato è una vetrina in più, senza dover fare marketing da soli.",
              },
              {
                t: "Costo d'ingresso basso",
                d: "Gratuito per i privati e modello a partnership per le imprese: si prova senza l'impegno economico di un gestionale.",
              },
            ].map((item) => (
              <div key={item.t} className="bg-[#f8f9fa] rounded-2xl p-6 border border-gray-100">
                <h3 className="font-extrabold text-[#111111] mb-1">{item.t}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{item.d}</p>
              </div>
            ))}
          </div>
          <p className="text-center text-[#111111] font-semibold mt-8 max-w-2xl mx-auto">
            Poi però la richiesta va trasformata in preventivo, il preventivo in cantiere e il cantiere in margine — e
            quello succede fuori da Edilnet, dentro il gestionale.
          </p>
        </div>
      </section>

      {/* ── QUANDO SCEGLIERE ── */}
      <section className="bg-[#f8f9fa] py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-extrabold text-center text-[#111111] mb-10">
            Per chi ha senso Edilnet e per chi Edilizia in Cloud
          </h2>
          <div className="grid md:grid-cols-2 gap-8">
          <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm">
            <div className="text-2xl mb-3">🔵</div>
            <h3 className="text-xl font-extrabold text-[#111111] mb-4">Per chi ha senso Edilnet</h3>
            <p className="text-gray-600 leading-relaxed">
              Edilnet risolve un problema commerciale: farti trovare da privati che stanno cercando un'impresa nella
              tua zona.
            </p>
            <ul className="mt-4 space-y-2">
              {[
                "Imprese che lavorano col privato e cercano nuovi contatti",
                "Attività in zone dove il passaparola non basta più",
                "Chi vuole una vetrina con recensioni senza fare marketing da solo",
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
            <p className="text-white/70 leading-relaxed">
              Edilizia in Cloud risolve un problema operativo: i clienti li hai, ma preventivi, cantieri, margini e
              fatture sono sparsi tra fogli e WhatsApp.
            </p>
            <ul className="mt-4 space-y-2">
              {[
                "Imprese con cantieri attivi e margini da tenere sotto controllo",
                "Vuoi preventivi, SAL, fatture SDI e presenze in un unico posto",
                "Vuoi che ogni richiesta — da Edilnet o dal passaparola — diventi una commessa tracciata",
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
            <h3 className="text-xl font-extrabold text-[#111111] mb-3">Prendi lavori dai portali?</h3>
            <p className="text-gray-600 leading-relaxed mb-6">
              Le richieste che arrivano da Edilnet o da altri canali finiscono spesso su fogli e chat. Le portiamo
              dentro Edilizia in Cloud — anagrafiche, preventivi, cantieri — gratuitamente: in 48 ore lavori da un
              unico posto.
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

      {/* ── OLTRE AL SOFTWARE ── */}
      <section className="bg-white py-16 px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-extrabold text-center text-[#111111] mb-4">
            Quello che un confronto non misura
          </h2>
          <p className="text-center text-gray-500 mb-10 max-w-xl mx-auto">
            Né un portale né un gestionale sistemano un'impresa che non sa leggere i propri numeri e non ha un metodo
            per vendere. Un contatto è solo un contatto: il software organizza, i margini li fanno le competenze.
          </p>
          <div className="space-y-4">
            {[
              {
                t: "Consulenti dedicati, formazione e webinar",
                d: (
                  <>
                    Attorno a Edilizia in Cloud c'è l'accesso a un ecosistema di servizi e di persone: consulenti
                    dedicati per area, formazione e webinar, assistenza in italiano. Cosa serva a te, e in che forma, si
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
                    è l'affiancamento commerciale all'imprenditore edile: trasformare una richiesta in un lavoro firmato
                    è un metodo, non fortuna.
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
            Detto senza sconti: Edilnet il suo pezzo lo fa, e ti porta richieste; i grandi gestionali hanno rivenditori
            e assistenza in tutta Italia, rete che noi non abbiamo. La differenza è su cosa ti affiancano: sul portale o
            sul software, oppure anche su numeri, vendita e clienti in ingresso. Il tuo problema è che ti mancano i
            contatti, o che nessuno ti ha insegnato a leggere i margini e a chiudere i preventivi?
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
            Prima di spendere in visibilità o in software, rispondi a queste.
          </p>
          <ul className="space-y-4">
            {[
              "Ti mancano i clienti o ti manca il controllo su quelli che hai già?",
              "Quando arriva una richiesta di preventivo, oggi dove finisce: in un sistema o su un foglio?",
              "Quanto conta sapere il margine di ogni cantiere mentre è aperto, non a fine anno?",
              "Chi userà lo strumento ogni giorno: solo tu o anche il capocantiere dal telefono?",
              "Se domani arrivano dieci richieste in una settimana, la tua gestione regge?",
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
