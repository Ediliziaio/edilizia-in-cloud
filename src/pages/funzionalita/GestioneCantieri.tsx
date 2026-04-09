import { useSEO } from "@/hooks/useSEO";
import { JsonLd } from "@/components/seo/JsonLd";
import { Link } from "react-router-dom";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";
import { ArrowRight } from "lucide-react";
import { blogPosts } from "@/data/blogPosts";

const RELATED_SLUGS = [
  "sal-cantiere-come-funziona",
  "sicurezza-cantieri-dlgs-81",
  "attestazione-soa-imprese-edili",
  "giornale-dei-lavori-cantiere",
  "computo-metrico-estimativo-guida",
  "appalti-pubblici-edilizia-guida",
];
const relatedPosts = blogPosts.filter((p) => RELATED_SLUGS.includes(p.slug)).slice(0, 3);

const painPoints = [
  {
    emoji: "🏗️",
    title: "Scopri i ritardi solo quando è troppo tardi",
    desc: "Senza visibilità in tempo reale, i ritardi di cantiere si scoprono alla riunione settimanale. A quel punto il danno è fatto.",
  },
  {
    emoji: "📱",
    title: "I capocantieri ti chiamano invece di aggiornarti",
    desc: "Ogni telefonata per sapere 'come va il cantiere' è tempo perso. Serve un sistema che mostri lo stato senza chiamate.",
  },
  {
    emoji: "📊",
    title: "Excel per ogni cantiere, dati sempre in ritardo",
    desc: "5 cantieri = 5 file Excel diversi aggiornati da 5 persone diverse. Hai mai una visione consolidata in tempo reale? Mai.",
  },
  {
    emoji: "💸",
    title: "Le ore extra non vengono imputate alla commessa",
    desc: "Il capocantiere lavora 2 ore extra ma non le registra sulla commessa giusta. Il margine reale scende, tu non lo sai.",
  },
];

const features = [
  {
    emoji: "⏱️",
    title: "Avanzamento lavori in tempo reale",
    desc: "Il capocantiere aggiorna dal telefono. Tu vedi tutto dalla dashboard senza fare una telefonata.",
  },
  {
    emoji: "📍",
    title: "Timbrature geolocalizzate",
    desc: "Entrata/uscita in cantiere rilevata automaticamente via GPS. Ore precise su ogni commessa, nessuna frode.",
  },
  {
    emoji: "📋",
    title: "Giornale lavori digitale",
    desc: "Note giornaliere, foto, eventi meteo e lavorazioni eseguite — con firma digitale del DL integrata.",
  },
  {
    emoji: "💬",
    title: "Chat per squadra",
    desc: "Comunicazione diretta con le squadre di cantiere, con storico messaggi e file. Sostituisce WhatsApp caotico.",
  },
  {
    emoji: "🚨",
    title: "Alert automatici su scostamenti",
    desc: "Appena i costi reali superano il budget previsto, ricevi un alert. Prima che la commessa vada in perdita.",
  },
  {
    emoji: "📱",
    title: "App offline per zone senza segnale",
    desc: "L'app funziona anche senza internet. I dati si sincronizzano appena torna la connessione.",
  },
];

const stats = [
  { value: "-68%", label: "tempo dedicato ai report settimanali" },
  { value: "+89%", label: "capocantieri aggiornano in autonomia" },
  { value: "-3h", label: "a settimana di telefonate di aggiornamento" },
  { value: "4.9/5", label: "soddisfazione dei titolari" },
];

const relatedLinks = [
  { to: "/funzionalita/margini-cantiere", label: "Margini Cantiere" },
  { to: "/funzionalita/fatturazione-elettronica", label: "Fatturazione Elettronica" },
  { to: "/funzionalita/preventivi-edilizia", label: "Preventivi Edilizia" },
];

export default function GestioneCantieri() {
  useSEO({
    title: "Gestione Cantieri Edili — Software Avanzamento Lavori in Tempo Reale | Edilizia in Cloud",
    description:
      "Controlla l'avanzamento di ogni cantiere in tempo reale dal telefono. Margini per commessa aggiornati, timbrature operai, giornale lavori digitale e alert automatici. Provalo gratis.",
    canonical: "/funzionalita/gestione-cantieri",
    keywords:
      "gestione cantieri software, avanzamento lavori real time, software cantieri edili, controllo cantiere smartphone, timbrature cantiere digitale, giornale lavori digitale",
  });

  return (
    <div className="min-h-screen bg-white text-[#111111] overflow-x-hidden">
      <JsonLd
        id="jsonld-breadcrumb-gestione-cantieri"
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: "https://ediliziaincloud.com/" },
            { "@type": "ListItem", position: 2, name: "Funzionalità", item: "https://ediliziaincloud.com/funzionalita" },
            {
              "@type": "ListItem",
              position: 3,
              name: "Gestione Cantieri",
              item: "https://ediliziaincloud.com/funzionalita/gestione-cantieri",
            },
          ],
        }}
      />
      <JsonLd
        id="jsonld-webpage-gestione-cantieri"
        data={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "Gestione Cantieri — Software Avanzamento Lavori",
          description:
            "Controlla l'avanzamento di ogni cantiere in tempo reale dal telefono. Margini per commessa aggiornati, timbrature operai, giornale lavori digitale e alert automatici.",
          url: "https://ediliziaincloud.com/funzionalita/gestione-cantieri",
          isPartOf: { "@type": "WebSite", url: "https://ediliziaincloud.com/funzionalita" },
          about: { "@type": "SoftwareApplication", name: "Edilizia in Cloud" },
        }}
      />

      <LandingNavbar />

      {/* ── HERO ── */}
      <section className="bg-[#111111] pt-36 pb-24 px-4 text-center">
        <div className="max-w-3xl mx-auto">
          <span className="inline-block bg-[#F97415]/20 text-[#F97415] text-xs font-bold tracking-widest uppercase px-4 py-1.5 rounded-full mb-6 border border-[#F97415]/30">
            FUNZIONALITÀ — GESTIONE CANTIERI
          </span>
          <h1 className="text-3xl md:text-5xl font-extrabold text-white leading-tight mb-6">
            Gestisci ogni cantiere dal telefono,{" "}
            <span className="text-[#F97415]">in tempo reale</span>
          </h1>
          <p className="text-lg text-white/70 mb-10 max-w-2xl mx-auto">
            Avanzamento lavori, timbrature, giornale lavori e costi per commessa — aggiornati in tempo reale dal
            capocantiere direttamente dall'app mobile.
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
            Il problema che conosce ogni titolare d'impresa edile
          </h2>
          <p className="text-center text-gray-500 mb-12 max-w-xl mx-auto">
            Prima di avere uno strumento adeguato, la gestione dei cantieri somiglia a questo.
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
            Tutto il controllo che mancava
          </h2>
          <p className="text-center text-gray-500 mb-12 max-w-xl mx-auto">
            Ogni strumento pensato per il titolare che vuole sapere senza dover chiedere.
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
            I risultati che ottengono le imprese che usano Edilizia in Cloud
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

      {/* ── TESTIMONIAL ── */}
      <section className="bg-white py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <div className="bg-[#f8f9fa] rounded-2xl p-8 border border-gray-100">
            <p className="text-lg text-[#111111] italic leading-relaxed mb-6">
              "Non faccio più riunioni 'come va il cantiere'. Apro l'app e so tutto — avanzamento, ore, costi, note del
              giorno. Il capocantiere aggiorna dal telefono e io dormo meglio la notte."
            </p>
            <div className="flex items-center justify-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#F97415]/20 flex items-center justify-center font-bold text-[#F97415]">
                M
              </div>
              <div className="text-left">
                <div className="font-bold text-[#111111] text-sm">Marco D.</div>
                <div className="text-gray-400 text-xs">Costruzioni Del Vecchio Srl, Torino</div>
              </div>
            </div>
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
            Inizia a controllare i tuoi cantieri oggi
          </h2>
          <p className="text-white/70 mb-8 text-lg">
            31 giorni gratis. Il tuo team operativo in 48 ore. Cancella quando vuoi.
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
                <Link
                  key={p.slug}
                  to={`/blog/${p.slug}`}
                  className="group flex flex-col gap-2 rounded-xl border border-gray-200 hover:border-[#F97415]/40 p-4 transition-all hover:shadow-sm"
                >
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
        id="jsonld-faq-gestione-cantieri"
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: [
            {
              "@type": "Question",
              name: "Quanto tempo ci vuole per impostare la gestione cantieri?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Il setup base è completato in 48 ore. Il nostro team importa i tuoi cantieri aperti, configura le squadre e ti forma. Molti clienti sono operativi già il primo giorno.",
              },
            },
            {
              "@type": "Question",
              name: "L'app funziona anche senza connessione internet in cantiere?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Sì. L'app mobile di Edilizia in Cloud funziona in modalità offline: i capocantiere aggiornano avanzamento lavori, timbrature e materiali anche senza segnale. I dati si sincronizzano appena la connessione è disponibile.",
              },
            },
            {
              "@type": "Question",
              name: "Posso vedere i margini reali di ogni cantiere in tempo reale?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Sì. Il modulo Gestione Cantieri calcola automaticamente i margini per commessa aggregando costi di manodopera, materiali e subappalti. Il titolare vede lo scostamento preventivo/consuntivo in tempo reale, senza aspettare la chiusura del cantiere.",
              },
            },
            {
              "@type": "Question",
              name: "Quanti cantieri posso gestire contemporaneamente?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Non c'è limite al numero di cantieri aperti contemporaneamente. Molti nostri clienti gestiscono 5-20 cantieri in parallelo con dashboard unificata e alert automatici per i cantieri a rischio margine.",
              },
            },
          ],
        }}
      />
      <section className="py-16 px-6 bg-gray-50">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-extrabold text-[#111111] mb-8 text-center">
            Domande frequenti sulla Gestione Cantieri
          </h2>
          <div className="divide-y divide-gray-200">
            {[
              {
                q: "Quanto tempo ci vuole per impostare la gestione cantieri?",
                a: "Il setup base è completato in 48 ore. Il nostro team importa i tuoi cantieri aperti, configura le squadre e ti forma. Molti clienti sono operativi già il primo giorno.",
              },
              {
                q: "L'app funziona anche senza connessione internet in cantiere?",
                a: "Sì. L'app mobile funziona in modalità offline: aggiornamenti, timbrature e materiali anche senza segnale. I dati si sincronizzano appena la connessione è disponibile.",
              },
              {
                q: "Posso vedere i margini reali di ogni cantiere in tempo reale?",
                a: "Sì. Il sistema calcola automaticamente i margini aggregando costi di manodopera, materiali e subappalti. Vedi lo scostamento preventivo/consuntivo in tempo reale.",
              },
              {
                q: "Quanti cantieri posso gestire contemporaneamente?",
                a: "Non c'è limite. Molti nostri clienti gestiscono 5-20 cantieri in parallelo con dashboard unificata e alert automatici per i cantieri a rischio margine.",
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
