import { useSEO } from "@/hooks/useSEO";
import { JsonLd } from "@/components/seo/JsonLd";
import { Link } from "react-router-dom";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";
import { blogPosts } from "@/data/blogPosts";
import { ArrowRight } from "lucide-react";

const RELATED_SLUGS = [
  "gestione-operai-cantiere-presenze-ore",
  "ccnl-edilizia-guida",
  "cassa-edile-come-funziona",
  "sicurezza-cantieri-dlgs-81",
];
const relatedPosts = blogPosts.filter((p) => RELATED_SLUGS.includes(p.slug)).slice(0, 3);

const painPoints = [
  {
    emoji: "📋",
    title: "Le presenze le gestisci ancora su carta",
    desc: "Foglio presenze cartaceo in cantiere, poi trascrizione manuale in ufficio. Ore perse ogni giorno e rischio di errori sul cedolino.",
  },
  {
    emoji: "🏗️",
    title: "Non sai quante ore ha lavorato ogni operaio su quale cantiere",
    desc: "A fine mese non riesci a imputare il costo della manodopera alla commessa giusta. Il margine del cantiere è distorto da subito.",
  },
  {
    emoji: "📅",
    title: "Le scadenze Cassa Edile le perdi di vista",
    desc: "La contribuzione Cassa Edile ha scadenze mensili. Un ritardo o un errore nei dati dichiarati costa sanzioni e blocca il DURC.",
  },
  {
    emoji: "🔄",
    title: "Nessuna integrazione con l'ufficio paghe",
    desc: "I dati delle presenze li riscrivi due volte: una volta per il gestionale e una per il commercialista. Doppio lavoro, doppio rischio di errore.",
  },
];

const features = [
  {
    emoji: "📱",
    title: "Timbratura GPS da cantiere",
    desc: "L'operaio timbra entrata e uscita dall'app mobile, con geolocalizzazione automatica. Addio ai cartellini cartacei e alle presenze inventate.",
  },
  {
    emoji: "📊",
    title: "Presenze per cantiere in tempo reale",
    desc: "Il titolare vede in ogni momento chi è in cantiere, quante ore ha fatto ogni operaio e su quale commessa. Dati aggiornati in tempo reale.",
  },
  {
    emoji: "🏦",
    title: "Cassa Edile integrata",
    desc: "Calcolo automatico delle contribuzioni Cassa Edile per ogni operaio, con export nel formato richiesto dall'ente territoriale. Zero errori, nessun ritardo.",
  },
  {
    emoji: "📤",
    title: "Export buste paga per il commercialista",
    desc: "Riepilogo mensile ore per operaio, per cantiere e per categoria di livello CCNL, pronto per l'ufficio paghe. Un click, nessun doppio inserimento.",
  },
  {
    emoji: "⚠️",
    title: "Alert scadenze contratti e formazione",
    desc: "Notifiche automatiche prima della scadenza dei contratti a termine, dei certificati di idoneità alla mansione e dei corsi di sicurezza obbligatori.",
  },
  {
    emoji: "📋",
    title: "Gestione livelli CCNL edilizia",
    desc: "Configurazione del costo orario per ogni livello CCNL (operaio comune, qualificato, specializzato, capocantiere). Calcolo automatico del costo reale.",
  },
];

const stats = [
  { value: "2h/gg", label: "risparmiate dall'ufficio per gestione presenze" },
  { value: "-94%", label: "errori su cedolini e Cassa Edile" },
  { value: "100%", label: "presenze imputate alla commessa corretta" },
  { value: "4.9/5", label: "soddisfazione imprese edili utenti HR" },
];

const relatedLinks = [
  { to: "/funzionalita/gestione-cantieri", label: "Gestione Cantieri" },
  { to: "/funzionalita/margini-cantiere", label: "Margini Cantiere" },
  { to: "/funzionalita/gestione-subappalti", label: "Gestione Subappalti" },
];

export default function HrPersonale() {
  useSEO({
    title: "Software HR Presenze Operai Edili — Gestione Personale Cantiere | Edilizia in Cloud",
    description:
      "Gestione presenze operai con timbratura GPS da cantiere, calcolo Cassa Edile automatico, CCNL edilizia e export per buste paga. Elimina i foglietti e i doppi inserimenti.",
    canonical: "/funzionalita/hr-personale",
    keywords:
      "presenze operai edili software, timbratura cantiere GPS, gestione personale edilizia, cassa edile software, CCNL edilizia livelli, HR impresa edile, ore cantiere operai",
  });

  return (
    <div className="min-h-screen bg-white text-[#111111] overflow-x-hidden">
      <JsonLd
        id="jsonld-breadcrumb-hr"
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: "https://www.ediliziaincloud.com/" },
            { "@type": "ListItem", position: 2, name: "Funzionalità", item: "https://www.ediliziaincloud.com/funzionalita" },
            {
              "@type": "ListItem",
              position: 3,
              name: "HR & Personale",
              item: "https://www.ediliziaincloud.com/funzionalita/hr-personale",
            },
          ],
        }}
      />
      <JsonLd
        id="jsonld-webpage-hr"
        data={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "Software HR Presenze Operai Edili — Gestione Personale Cantiere",
          description:
            "Timbratura GPS da cantiere, Cassa Edile integrata, CCNL edilizia e export per buste paga. Gestione HR completa per imprese edili.",
          url: "https://www.ediliziaincloud.com/funzionalita/hr-personale",
          isPartOf: { "@type": "WebSite", url: "https://www.ediliziaincloud.com/funzionalita" },
          about: { "@type": "SoftwareApplication", name: "Edilizia in Cloud" },
        }}
      />
      <JsonLd
        id="jsonld-article-hr"
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: "Software HR Presenze Operai Edili — Gestione Personale Cantiere",
          description:
            "Timbratura GPS da cantiere, Cassa Edile integrata, CCNL edilizia e export per buste paga.",
          author: { "@type": "Organization", name: "Edilizia in Cloud" },
          publisher: { "@type": "Organization", name: "Edilizia in Cloud", url: "https://www.ediliziaincloud.com" },
          datePublished: "2026-04-08",
          url: "https://www.ediliziaincloud.com/funzionalita/hr-personale",
        }}
      />

      <LandingNavbar />

      {/* ── HERO ── */}
      <section className="bg-[#111111] pt-36 pb-24 px-4 text-center">
        <div className="max-w-3xl mx-auto">
          <span className="inline-block bg-[#F97415]/20 text-[#F97415] text-xs font-bold tracking-widest uppercase px-4 py-1.5 rounded-full mb-6 border border-[#F97415]/30">
            FUNZIONALITÀ — HR & PERSONALE
          </span>
          <h1 className="text-3xl md:text-5xl font-extrabold text-white leading-tight mb-6">
            Presenze, Cassa Edile e paghe:{" "}
            <span className="text-[#F97415]">tutto automatico dal cantiere.</span>
          </h1>
          <p className="text-lg text-white/70 mb-10 max-w-2xl mx-auto">
            L'operaio timbra dal telefono con GPS. Il titolare vede le ore in tempo reale. Il commercialista riceve l'export pronto. Addio ai fogli presenze e ai doppi inserimenti.
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
            Quante ore perdi ogni mese per gestire il personale?
          </h2>
          <p className="text-center text-gray-500 mb-12 max-w-xl mx-auto">
            I foglietti cartacei, le telefonate per sapere chi è in cantiere, i dati riscritti tre volte. C'è un modo migliore.
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
            Gestione HR pensata per il cantiere edile
          </h2>
          <p className="text-center text-gray-500 mb-12 max-w-xl mx-auto">
            Dalla timbratura GPS all'export per il commercialista: tutto in un unico flusso digitale.
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
            I numeri parlano chiaro
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
              "Prima raccoglievo i fogli presenze ogni venerdì sera dai cantieri. Adesso ogni operaio timbra dall'app e il lunedì mattina ho già tutto il riepilogo pronto per il commercialista. Ho recuperato un giorno intero alla settimana."
            </p>
            <div className="flex items-center justify-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#F97415]/20 flex items-center justify-center font-bold text-[#F97415]">
                A
              </div>
              <div className="text-left">
                <div className="font-bold text-[#111111] text-sm">Andrea M.</div>
                <div className="text-gray-400 text-xs">Costruzioni Marchetti, Brescia</div>
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
            Digitalizza la gestione del tuo personale oggi
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
        id="jsonld-faq-hr"
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: [
            {
              "@type": "Question",
              name: "Come funziona la timbratura GPS per gli operai edili?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Ogni operaio timbra entrata e uscita dall'app mobile di Edilizia in Cloud. La geolocalizzazione GPS associa automaticamente la timbratura al cantiere dove si trova l'operaio. Il titolare vede le presenze in tempo reale dalla dashboard web.",
              },
            },
            {
              "@type": "Question",
              name: "Il software gestisce la Cassa Edile per tutti i territori italiani?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Sì. Edilizia in Cloud gestisce il calcolo delle contribuzioni Cassa Edile con i parametri aggiornati per ogni territorio. Il sistema genera automaticamente i file di dichiarazione nel formato richiesto dall'ente locale.",
              },
            },
            {
              "@type": "Question",
              name: "Come vengono imputate le ore al cantiere giusto?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Quando l'operaio timbra, il sistema associa automaticamente le ore al cantiere tramite geolocalizzazione. Il capocantiere può anche assegnare manualmente le ore a cantieri specifici. Le ore imputate per cantiere entrano nel calcolo del costo reale della manodopera per commessa.",
              },
            },
            {
              "@type": "Question",
              name: "Come esporto i dati delle presenze per il commercialista?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "A fine mese, con un click generi un riepilogo presenze per operaio con totale ore, livello CCNL, cantieri di appartenenza e costo calcolato. Il file è esportabile in Excel o PDF, pronto per il commercialista o l'ufficio paghe.",
              },
            },
          ],
        }}
      />
      <section className="py-16 px-6 bg-gray-50">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-extrabold text-[#111111] mb-8 text-center">
            Domande frequenti su HR & Personale
          </h2>
          <div className="divide-y divide-gray-200">
            {[
              {
                q: "Come funziona la timbratura GPS per gli operai edili?",
                a: "Ogni operaio timbra entrata e uscita dall'app mobile. La geolocalizzazione GPS associa automaticamente la timbratura al cantiere. Il titolare vede le presenze in tempo reale dalla dashboard web.",
              },
              {
                q: "Il software gestisce la Cassa Edile per tutti i territori?",
                a: "Sì. Edilizia in Cloud calcola le contribuzioni Cassa Edile con i parametri aggiornati per ogni territorio italiano e genera i file di dichiarazione nel formato richiesto dall'ente locale.",
              },
              {
                q: "Come vengono imputate le ore al cantiere giusto?",
                a: "La timbratura GPS associa automaticamente le ore al cantiere. Il capocantiere può anche assegnare manualmente le ore. Tutte le ore entrano nel calcolo del costo reale della manodopera per commessa.",
              },
              {
                q: "Come esporto i dati delle presenze per il commercialista?",
                a: "A fine mese generi in un click il riepilogo presenze per operaio con totale ore, livello CCNL e costo calcolato. Esportabile in Excel o PDF, pronto per l'ufficio paghe.",
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
