import { useSEO } from "@/hooks/useSEO";
import { JsonLd } from "@/components/seo/JsonLd";
import { Link } from "react-router-dom";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";
import { blogPosts } from "@/data/blogPosts";
import { ArrowRight } from "lucide-react";

const RELATED_SLUGS = [
  "gestione-subappaltatori-impresa-edile",
  "subappalto-edilizia-guida",
  "durc-edilizia-guida-completa",
  "appalti-pubblici-edilizia-guida",
];
const relatedPosts = blogPosts.filter((p) => RELATED_SLUGS.includes(p.slug)).slice(0, 3);

const painPoints = [
  {
    emoji: "📂",
    title: "Il DURC del subappaltatore scade e non te ne accorgi",
    desc: "La stazione appaltante blocca il pagamento del SAL perché un tuo subappaltatore ha il DURC scaduto. Succede più spesso di quanto pensi.",
  },
  {
    emoji: "⚖️",
    title: "Rischi la responsabilità solidale senza saperlo",
    desc: "Se il tuo subappaltatore non paga i contributi dei suoi operai, l'INPS può rivalersi su di te. La tutela è verificare il DURC prima di ogni pagamento.",
  },
  {
    emoji: "📋",
    title: "I contratti di subappalto sono in ordine sparso",
    desc: "Contratti, POS, polizze e autorizzazioni dei subappaltatori conservate in cartelle diverse, PC diversi, email diverse. Quando servono, non si trovano.",
  },
  {
    emoji: "💰",
    title: "Non sai quanto stai pagando in totale a ogni subappaltatore",
    desc: "Con più cantieri aperti e più subappaltatori, perdere il filo dei pagamenti è facile. Rischi di pagare due volte o di perdere scadenze contrattuali.",
  },
];

const features = [
  {
    emoji: "🗂️",
    title: "Registro digitale subappaltatori",
    desc: "Anagrafica completa di ogni subappaltatore: PIVA, DURC, SOA, polizza RC, referente, cantieri assegnati. Tutto in un unico posto sempre aggiornato.",
  },
  {
    emoji: "🔔",
    title: "Alert automatici scadenze DURC e polizze",
    desc: "Ricevi notifiche 60, 30 e 15 giorni prima della scadenza di DURC, polizze assicurative e attestazioni SOA. Zero sorprese, zero blocchi.",
  },
  {
    emoji: "📄",
    title: "Contratti digitali e documentazione cantiere",
    desc: "Carica e archivia contratti di subappalto, POS, autorizzazioni e verbali direttamente nel profilo del subappaltatore, collegato al cantiere.",
  },
  {
    emoji: "💳",
    title: "Tracciamento pagamenti con verifica DURC",
    desc: "Ogni pagamento al subappaltatore viene registrato con verifica automatica della regolarità DURC al momento del pagamento. Sei protetto dalla responsabilità solidale.",
  },
  {
    emoji: "🏛️",
    title: "Documentazione per appalti pubblici",
    desc: "Genera automaticamente la documentazione per l'autorizzazione dei subappaltatori negli appalti PNRR e pubblici: dichiarazioni, DURC, iscrizione CCIAA.",
  },
  {
    emoji: "📊",
    title: "Report costi subappalto per cantiere",
    desc: "Riepilogo di tutti i costi subappalto per commessa, con confronto rispetto al preventivo. I costi di subappalto entrano nel calcolo del margine reale.",
  },
];

const stats = [
  { value: "0", label: "blocchi SAL per DURC subappaltatori scaduti" },
  { value: "-100%", label: "rischio responsabilità solidale non gestita" },
  { value: "45gg", label: "di anticipo sulle scadenze documentali" },
  { value: "4.9/5", label: "soddisfazione imprese con 5+ subappaltatori" },
];

const relatedLinks = [
  { to: "/funzionalita/gestione-cantieri", label: "Gestione Cantieri" },
  { to: "/funzionalita/hr-personale", label: "HR & Personale" },
  { to: "/funzionalita/margini-cantiere", label: "Margini Cantiere" },
];

export default function GestioneSubappalti() {
  useSEO({
    title: "Gestione Subappalti Edilizia — Software per Subappaltatori | Edilizia in Cloud",
    description:
      "Registro subappaltatori digitale, DURC con alert automatici, contratti di subappalto, tracciamento pagamenti e responsabilità solidale. Tutto sotto controllo con Edilizia in Cloud.",
    canonical: "/funzionalita/gestione-subappalti",
    keywords:
      "gestione subappaltatori edilizia, DURC subappaltatori alert, contratto subappalto digitale, responsabilità solidale subappalto, software subappalti cantiere, registro subappaltatori",
  });

  return (
    <div className="min-h-screen bg-white text-[#111111] overflow-x-hidden">
      <JsonLd
        id="jsonld-breadcrumb-subappalti"
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: "https://www.ediliziaincloud.com/" },
            { "@type": "ListItem", position: 2, name: "Funzionalità", item: "https://www.ediliziaincloud.com/funzionalita" },
            {
              "@type": "ListItem",
              position: 3,
              name: "Gestione Subappalti",
              item: "https://www.ediliziaincloud.com/funzionalita/gestione-subappalti",
            },
          ],
        }}
      />
      <JsonLd
        id="jsonld-webpage-subappalti"
        data={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "Gestione Subappalti Edilizia — Software per Subappaltatori",
          description:
            "Registro subappaltatori digitale, DURC con alert automatici, contratti e tracciamento pagamenti per imprese edili.",
          url: "https://www.ediliziaincloud.com/funzionalita/gestione-subappalti",
          isPartOf: { "@type": "WebSite", url: "https://www.ediliziaincloud.com/funzionalita" },
          about: { "@type": "SoftwareApplication", name: "Edilizia in Cloud" },
        }}
      />
      <JsonLd
        id="jsonld-article-subappalti"
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: "Gestione Subappalti Edilizia — Software per Subappaltatori",
          description:
            "Registro subappaltatori, DURC alert automatici, contratti digitali, pagamenti e responsabilità solidale.",
          author: { "@type": "Organization", name: "Edilizia in Cloud" },
          publisher: { "@type": "Organization", name: "Edilizia in Cloud", url: "https://www.ediliziaincloud.com" },
          datePublished: "2026-04-08",
          url: "https://www.ediliziaincloud.com/funzionalita/gestione-subappalti",
        }}
      />

      <LandingNavbar />

      {/* ── HERO ── */}
      <section className="bg-[#111111] pt-36 pb-24 px-4 text-center">
        <div className="max-w-3xl mx-auto">
          <span className="inline-block bg-[#F97415]/20 text-[#F97415] text-xs font-bold tracking-widest uppercase px-4 py-1.5 rounded-full mb-6 border border-[#F97415]/30">
            FUNZIONALITÀ — GESTIONE SUBAPPALTI
          </span>
          <h1 className="text-3xl md:text-5xl font-extrabold text-white leading-tight mb-6">
            Subappaltatori sotto controllo:{" "}
            <span className="text-[#F97415]">DURC, contratti e pagamenti in un unico posto.</span>
          </h1>
          <p className="text-lg text-white/70 mb-10 max-w-2xl mx-auto">
            Registro digitale, alert automatici prima delle scadenze, verifica DURC ad ogni pagamento. Proteggi la tua impresa dalla responsabilità solidale e dai blocchi SAL.
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
            I rischi nascosti nella gestione dei subappaltatori
          </h2>
          <p className="text-center text-gray-500 mb-12 max-w-xl mx-auto">
            Ogni subappaltatore è una responsabilità che puoi gestire bene o ignorare. Ignorarla costa caro.
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
            Gestione subappaltatori professionale e senza rischi
          </h2>
          <p className="text-center text-gray-500 mb-12 max-w-xl mx-auto">
            Tutto ciò che serve per lavorare con subappaltatori in modo sicuro, organizzato e conforme.
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
              "Con 12 subappaltatori attivi su 5 cantieri, non riuscivo più a tenere traccia di chi aveva il DURC scaduto o la polizza da rinnovare. Ora Edilizia in Cloud mi manda un alert 45 giorni prima di ogni scadenza. Non ho mai più avuto problemi con le stazioni appaltanti."
            </p>
            <div className="flex items-center justify-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#F97415]/20 flex items-center justify-center font-bold text-[#F97415]">
                D
              </div>
              <div className="text-left">
                <div className="font-bold text-[#111111] text-sm">Davide S.</div>
                <div className="text-gray-400 text-xs">Impresa edile, Milano</div>
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
            Gestisci i tuoi subappaltatori senza rischi
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
        id="jsonld-faq-subappalti"
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: [
            {
              "@type": "Question",
              name: "Come funziona il monitoraggio del DURC dei subappaltatori?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Edilizia in Cloud monitora la scadenza del DURC di ogni subappaltatore registrato e invia alert automatici 60, 30 e 15 giorni prima della scadenza. Prima di ogni pagamento registrato, il sistema verifica e segnala eventuali irregolarità contributive.",
              },
            },
            {
              "@type": "Question",
              name: "Cosa si intende per responsabilità solidale nel subappalto?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "La responsabilità solidale significa che se il tuo subappaltatore non paga stipendi o contributi ai suoi operai, tu come appaltatore principale puoi essere chiamato a rispondere di questi debiti. La principale tutela è verificare la regolarità DURC del subappaltatore prima di ogni pagamento.",
              },
            },
            {
              "@type": "Question",
              name: "Il software gestisce i subappalti negli appalti pubblici PNRR?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Sì. Edilizia in Cloud supporta la gestione documentale richiesta per l'autorizzazione dei subappaltatori negli appalti pubblici e PNRR: dichiarazioni, DURC, iscrizione CCIAA, SOA e polizze. Tutta la documentazione è archiviata e consultabile per ogni controllo.",
              },
            },
            {
              "@type": "Question",
              name: "Posso tracciare i pagamenti effettuati a ogni subappaltatore?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Sì. Ogni pagamento viene registrato con data, importo, cantiere di riferimento e verifica DURC al momento del pagamento. Hai sempre il riepilogo aggiornato di quanto hai pagato a ogni subappaltatore e per quale commessa.",
              },
            },
          ],
        }}
      />
      <section className="py-16 px-6 bg-gray-50">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-extrabold text-[#111111] mb-8 text-center">
            Domande frequenti sulla Gestione Subappalti
          </h2>
          <div className="divide-y divide-gray-200">
            {[
              {
                q: "Come funziona il monitoraggio del DURC dei subappaltatori?",
                a: "Edilizia in Cloud monitora la scadenza del DURC di ogni subappaltatore e invia alert 60, 30 e 15 giorni prima. Prima di ogni pagamento registrato, il sistema verifica e segnala eventuali irregolarità.",
              },
              {
                q: "Cosa si intende per responsabilità solidale nel subappalto?",
                a: "Se il tuo subappaltatore non paga contributi o stipendi ai suoi operai, tu come appaltatore principale puoi essere chiamato a rispondere. La tutela è verificare la regolarità DURC prima di ogni pagamento.",
              },
              {
                q: "Il software gestisce i subappalti negli appalti pubblici e PNRR?",
                a: "Sì. Edilizia in Cloud supporta la documentazione per l'autorizzazione dei subappaltatori negli appalti pubblici e PNRR: DURC, CCIAA, SOA, polizze e dichiarazioni. Tutto archiviato e consultabile.",
              },
              {
                q: "Posso tracciare i pagamenti a ogni subappaltatore?",
                a: "Sì. Ogni pagamento viene registrato con data, importo, cantiere e verifica DURC al momento del pagamento. Hai sempre il riepilogo aggiornato per ogni subappaltatore e commessa.",
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
