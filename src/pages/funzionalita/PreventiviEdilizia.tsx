import { useSEO } from "@/hooks/useSEO";
import { JsonLd } from "@/components/seo/JsonLd";
import { Link } from "react-router-dom";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";
import { blogPosts } from "@/data/blogPosts";

const RELATED_SLUGS = [
  "come-fare-preventivo-edilizia",
  "computo-metrico-estimativo-guida",
  "alternativa-excel-cantieri",
  "ccnl-edilizia-guida",
];
const relatedPosts = blogPosts.filter((p) => RELATED_SLUGS.includes(p.slug)).slice(0, 3);
import { ArrowRight } from "lucide-react";

const painPoints = [
  {
    emoji: "📋",
    title: "Preventivi su Excel fatti a sensazione",
    desc: "Senza un computo metrico strutturato, ogni preventivo è un'approssimazione. Il rischio di sbagliare margine è altissimo.",
  },
  {
    emoji: "⏳",
    title: "Ore perse a cercare i prezzi sul prezzario",
    desc: "Aprire il PDF del prezzario regionale, cercare la voce giusta, copiarla su Excel — per ogni lavorazione. Ogni preventivo richiede mezza giornata.",
  },
  {
    emoji: "📞",
    title: "Follow-up clienti non sistematico",
    desc: "Mandi il preventivo e aspetti. Se non richiami, niente. Un sistema di follow-up automatico potrebbe chiudere molte più trattative.",
  },
  {
    emoji: "📉",
    title: "Tasso di chiusura basso senza una causa chiara",
    desc: "Non sai quanti preventivi hai mandato, quanti hai vinto, quanti perso e perché. Senza dati, non puoi migliorare.",
  },
];

const features = [
  {
    emoji: "📐",
    title: "Computo metrico con prezzari regionali",
    desc: "Cerca la voce di lavorazione, inserisci la quantità e il prezzo si compila automaticamente dal prezzario regionale aggiornato.",
  },
  {
    emoji: "📄",
    title: "Template professionali",
    desc: "Preventivi con il tuo logo, colori aziendali e layout professionale. Il cliente riceve un documento che ispira fiducia.",
  },
  {
    emoji: "✍️",
    title: "Firma digitale del cliente",
    desc: "Il cliente firma il preventivo online dal telefono. Nessuna stampa, nessuna scansione, nessun viaggio in ufficio.",
  },
  {
    emoji: "🔔",
    title: "Follow-up automatico",
    desc: "Dopo 3, 7 e 14 giorni senza risposta, il cliente riceve un promemoria automatico. Tu non devi ricordartelo.",
  },
  {
    emoji: "📊",
    title: "Analisi tasso di conversione",
    desc: "Dashboard con preventivi inviati, vinti, persi e in attesa. Scopri quali tipologie di lavori chiudi di più e dove perdi.",
  },
  {
    emoji: "⚡",
    title: "Da preventivo a commessa in 1 click",
    desc: "Il preventivo accettato diventa automaticamente una commessa aperta, con tutti i dati già inseriti. Zero doppie imputazioni.",
  },
];

const stats = [
  { value: "+34%", label: "tasso di chiusura preventivi" },
  { value: "-60%", label: "tempo di compilazione" },
  { value: "48h", label: "tempo medio risposta cliente" },
  { value: "1-click", label: "da preventivo a commessa" },
];

const relatedLinks = [
  { to: "/funzionalita/gestione-cantieri", label: "Gestione Cantieri" },
  { to: "/funzionalita/fatturazione-elettronica", label: "Fatturazione Elettronica" },
  { to: "/funzionalita/margini-cantiere", label: "Margini Cantiere" },
];

export default function PreventiviEdilizia() {
  useSEO({
    title: "Preventivi Edilizia Digitali — Computo Metrico e Firma Elettronica | Edilizia in Cloud",
    description:
      "Crea preventivi professionali con computo metrico integrato. Prezzari regionali aggiornati, firma digitale del cliente, follow-up automatico e analisi tasso di conversione.",
    canonical: "/funzionalita/preventivi-edilizia",
    keywords:
      "preventivi edilizia digitali, computo metrico software, preventivo impresa edile, firma elettronica preventivo, prezzari regionali software, CRM preventivi edilizia",
  });

  return (
    <div className="min-h-screen bg-white text-[#111111] overflow-x-hidden">
      <JsonLd
        id="jsonld-breadcrumb-preventivi"
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: "https://ediliziaincloud.com/" },
            { "@type": "ListItem", position: 2, name: "Funzionalità", item: "https://ediliziaincloud.com/funzionalita" },
            {
              "@type": "ListItem",
              position: 3,
              name: "Preventivi Edilizia",
              item: "https://ediliziaincloud.com/funzionalita/preventivi-edilizia",
            },
          ],
        }}
      />
      <JsonLd
        id="jsonld-webpage-preventivi"
        data={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "Preventivi Edilizia Digitali — Computo Metrico e Firma Elettronica",
          description:
            "Crea preventivi professionali con computo metrico integrato. Prezzari regionali aggiornati, firma digitale del cliente.",
          url: "https://ediliziaincloud.com/funzionalita/preventivi-edilizia",
          isPartOf: { "@type": "WebSite", url: "https://ediliziaincloud.com/funzionalita" },
          about: { "@type": "SoftwareApplication", name: "Edilizia in Cloud" },
        }}
      />

      <LandingNavbar />

      {/* ── HERO ── */}
      <section className="bg-[#111111] pt-36 pb-24 px-4 text-center">
        <div className="max-w-3xl mx-auto">
          <span className="inline-block bg-[#F97415]/20 text-[#F97415] text-xs font-bold tracking-widest uppercase px-4 py-1.5 rounded-full mb-6 border border-[#F97415]/30">
            FUNZIONALITÀ — PREVENTIVI EDILIZIA
          </span>
          <h1 className="text-3xl md:text-5xl font-extrabold text-white leading-tight mb-6">
            Preventivi professionali che si firmano{" "}
            <span className="text-[#F97415]">online in 24 ore</span>
          </h1>
          <p className="text-lg text-white/70 mb-10 max-w-2xl mx-auto">
            Computo metrico con prezzari regionali integrati, firma digitale del cliente e follow-up automatico. Chiudi
            più trattative senza perdere ore a compilare fogli Excel.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/demo"
              className="inline-flex items-center gap-2 bg-[#F97415] hover:bg-[#e8650e] text-white font-bold px-8 py-4 rounded-2xl transition-colors text-lg"
            >
              Prova gratis 31 giorni <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              to="/funzionalita"
              className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-semibold px-8 py-4 rounded-2xl transition-colors text-lg border border-white/20"
            >
              Tutte le funzionalità
            </Link>
          </div>
        </div>
      </section>

      {/* ── PAIN SECTION ── */}
      <section className="bg-[#f8f9fa] py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl md:text-4xl font-extrabold text-center text-[#111111] mb-4">
            Perché molti preventivi finiscono nel cassetto del cliente
          </h2>
          <p className="text-center text-gray-500 mb-12 max-w-xl mx-auto">
            Non è solo questione di prezzo. Spesso il problema è nel processo.
          </p>
          <div className="grid md:grid-cols-2 gap-6">
            {painPoints.map((p) => (
              <div key={p.title} className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                <div className="text-3xl mb-3">{p.emoji}</div>
                <h3 className="font-bold text-lg text-[#111111] mb-2">{p.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="bg-white py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl md:text-4xl font-extrabold text-center text-[#111111] mb-4">
            Dal computo metrico alla firma in pochi minuti
          </h2>
          <p className="text-center text-gray-500 mb-12 max-w-xl mx-auto">
            Strumenti pensati per le imprese edili, non per gli studi di consulenza.
          </p>
          <div className="grid md:grid-cols-2 gap-6">
            {features.map((f) => (
              <div
                key={f.title}
                className="flex gap-4 items-start bg-[#f8f9fa] rounded-2xl p-6 border border-gray-100"
              >
                <div className="text-3xl flex-shrink-0">{f.emoji}</div>
                <div>
                  <h3 className="font-bold text-[#111111] mb-1">{f.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── STATS ── */}
      <section className="bg-[#111111] py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-4xl font-extrabold text-center text-white mb-12">
            Più trattative chiuse, meno tempo perso
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {stats.map((s) => (
              <div key={s.label} className="text-center">
                <div className="text-4xl font-extrabold text-[#F97415] mb-2">{s.value}</div>
                <div className="text-white/70 text-sm">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── RELATED FEATURES ── */}
      <section className="bg-[#f8f9fa] py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-xl font-extrabold text-center text-[#111111] mb-8">Esplora altre funzionalità</h2>
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
            Inizia a mandare preventivi che si firmano
          </h2>
          <p className="text-white/70 mb-8 text-lg">
            31 giorni gratis. Operativo in 48 ore. Cancella quando vuoi.
          </p>
          <Link
            to="/demo"
            className="inline-flex items-center gap-2 bg-[#F97415] hover:bg-[#e8650e] text-white font-bold px-10 py-5 rounded-2xl transition-colors text-lg"
          >
            Prova gratis 31 giorni <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* ── LEGGI ANCHE ── */}
      {relatedPosts.length > 0 && (
        <section className="py-14 px-6 bg-white border-t border-gray-100">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-lg font-bold text-[#111111] mb-6">Leggi anche</h2>
            <div className="grid sm:grid-cols-3 gap-4">
              {relatedPosts.map((p) => (
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

      {/* ── FAQ ── */}
      <JsonLd
        id="jsonld-faq-preventivi"
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: [
            {
              "@type": "Question",
              name: "I prezziari regionali sono aggiornati automaticamente?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Sì. Edilizia in Cloud include i prezziari di tutte le regioni italiane, aggiornati automaticamente con le revisioni ufficiali. Non devi scaricare o importare nulla manualmente.",
              },
            },
            {
              "@type": "Question",
              name: "Il cliente può firmare il preventivo digitalmente?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Sì. Ogni preventivo può essere inviato con un link di accettazione online: il cliente firma digitalmente dal browser o dal telefono, senza installare app. La firma ha valore legale.",
              },
            },
            {
              "@type": "Question",
              name: "Posso convertire un preventivo in contratto e poi in fattura?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Sì. Il flusso preventivo → contratto → SAL → fattura è completamente automatizzato in Edilizia in Cloud. I dati vengono trasferiti senza dover reinserire nulla.",
              },
            },
            {
              "@type": "Question",
              name: "Quanto tempo ci vuole per fare un preventivo professionale?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Con i template e i prezziari preimpostati, un preventivo standard può essere preparato in 15-30 minuti invece delle 2-3 ore necessarie con Excel o Word.",
              },
            },
          ],
        }}
      />
      <section className="py-16 px-6 bg-gray-50">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-extrabold text-[#111111] mb-8 text-center">
            Domande frequenti sui Preventivi Edilizia
          </h2>
          <div className="divide-y divide-gray-200">
            {[
              {
                q: "I prezziari regionali sono aggiornati automaticamente?",
                a: "Sì. Edilizia in Cloud include i prezziari di tutte le regioni italiane, aggiornati automaticamente con le revisioni ufficiali. Non devi scaricare nulla manualmente.",
              },
              {
                q: "Il cliente può firmare il preventivo digitalmente?",
                a: "Sì. Ogni preventivo può essere inviato con un link di accettazione online: il cliente firma dal browser, senza installare app. La firma ha valore legale.",
              },
              {
                q: "Posso convertire un preventivo in contratto e poi in fattura?",
                a: "Sì. Il flusso preventivo → contratto → SAL → fattura è completamente automatizzato. I dati vengono trasferiti senza reinserire nulla.",
              },
              {
                q: "Quanto tempo ci vuole per fare un preventivo professionale?",
                a: "Con template e prezziari preimpostati, un preventivo standard si fa in 15-30 minuti invece delle 2-3 ore necessarie con Excel o Word.",
              },
            ].map((item, i) => (
              <details key={i} className="py-5 group">
                <summary className="flex justify-between items-center cursor-pointer list-none font-semibold text-[#111111] text-sm">
                  {item.q}
                  <span className="text-[#F97415] text-lg font-light ml-4">+</span>
                </summary>
                <p className="mt-3 text-sm text-[#111111]/70 leading-relaxed">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
