import { useSEO } from "@/hooks/useSEO";
import { JsonLd } from "@/components/seo/JsonLd";
import { Link } from "react-router-dom";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";
import { blogPosts } from "@/data/blogPosts";

const RELATED_SLUGS = [
  "analisi-margini-imprese-edili",
  "ridurre-costi-cantieri-edili",
  "software-gestionale-vs-excel",
];
const relatedPosts = blogPosts.filter((p) => RELATED_SLUGS.includes(p.slug)).slice(0, 3);
import { ArrowRight } from "lucide-react";

const painPoints = [
  {
    emoji: "📉",
    title: "I margini li scopri solo a consuntivo",
    desc: "Finito il cantiere, fai i conti e scopri che hai guadagnato meno del previsto. A quel punto non puoi più fare nulla per recuperare.",
  },
  {
    emoji: "🔀",
    title: "Costi non imputati alla commessa giusta",
    desc: "Un materiale comprato per il cantiere A finisce in contabilità generale. Il margine del cantiere A appare migliore di quello reale.",
  },
  {
    emoji: "🗂️",
    title: "Nessuna vista consolidata su tutti i cantieri",
    desc: "Hai 8 cantieri aperti. Quale sta andando bene? Quale sta bruciando margine? Senza una dashboard, non lo sai.",
  },
  {
    emoji: "🎲",
    title: "Previsione finale inaffidabile",
    desc: "A metà cantiere, non riesci a stimare quanto guadagnerai a fine lavori. Ogni decisione diventa un'intuizione.",
  },
];

const features = [
  {
    emoji: "📊",
    title: "Dashboard margini real-time",
    desc: "Tutti i tuoi cantieri aperti con margine attuale, trend e stato di salute. Un colpo d'occhio e sai dove guardare.",
  },
  {
    emoji: "⚖️",
    title: "Scostamento budget vs consuntivo",
    desc: "Confronto automatico tra preventivato e costi reali per ogni voce di spesa. Vedi dove stai sforando e di quanto.",
  },
  {
    emoji: "🏗️",
    title: "Costi per categoria",
    desc: "Margine scomposto per manodopera, materiali e subappalti. Sai esattamente quale categoria sta erodendo il profitto.",
  },
  {
    emoji: "🚨",
    title: "Alert margine sotto soglia",
    desc: "Se il margine di una commessa scende sotto la soglia che hai impostato, ricevi un alert immediato. Puoi intervenire in tempo.",
  },
  {
    emoji: "🔮",
    title: "Previsione finale automatica",
    desc: "Proiezione del margine a fine cantiere basata sull'andamento reale. Sai oggi quanto guadagnerai fra tre mesi.",
  },
  {
    emoji: "📑",
    title: "Report per commessa PDF/Excel",
    desc: "Report completo per ogni cantiere, pronto per il commercialista o per la riunione con i soci. In un click.",
  },
];

const stats = [
  { value: "78%", label: "imprese scopre perdite solo a cantiere chiuso (senza EIC)" },
  { value: "+22%", label: "margine medio nel 1° anno" },
  { value: "-68%", label: "sorprese negative su commesse" },
  { value: "4.9/5", label: "soddisfazione dei titolari" },
];

const relatedLinks = [
  { to: "/funzionalita/gestione-cantieri", label: "Gestione Cantieri" },
  { to: "/funzionalita/fatturazione-elettronica", label: "Fatturazione Elettronica" },
  { to: "/funzionalita/preventivi-edilizia", label: "Preventivi Edilizia" },
];

export default function MarginiCantiere() {
  useSEO({
    title: "Controllo Margini Cantiere in Tempo Reale — Redditività per Commessa | Edilizia in Cloud",
    description:
      "Vedi il margine reale di ogni cantiere in tempo reale: costi effettivi vs budget, scostamenti, ore imputate e previsione finale. Non scoprire le perdite solo a lavori finiti.",
    canonical: "/funzionalita/margini-cantiere",
    keywords:
      "margini cantiere controllo, redditività commessa edilizia, controllo costi cantiere real time, margine di commessa software, analisi margini impresa edile, dashboard margini edilizia",
  });

  return (
    <div className="min-h-screen bg-white text-[#111111] overflow-x-hidden">
      <JsonLd
        id="jsonld-breadcrumb-margini"
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: "https://ediliziaincloud.com/" },
            { "@type": "ListItem", position: 2, name: "Funzionalità", item: "https://ediliziaincloud.com/funzionalita" },
            {
              "@type": "ListItem",
              position: 3,
              name: "Margini Cantiere",
              item: "https://ediliziaincloud.com/funzionalita/margini-cantiere",
            },
          ],
        }}
      />
      <JsonLd
        id="jsonld-webpage-margini"
        data={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "Controllo Margini Cantiere in Tempo Reale — Redditività per Commessa",
          description:
            "Vedi il margine reale di ogni cantiere in tempo reale: costi effettivi vs budget, scostamenti, ore imputate e previsione finale.",
          url: "https://ediliziaincloud.com/funzionalita/margini-cantiere",
          isPartOf: { "@type": "WebSite", url: "https://ediliziaincloud.com/funzionalita" },
          about: { "@type": "SoftwareApplication", name: "Edilizia in Cloud" },
        }}
      />

      <LandingNavbar />

      {/* ── HERO ── */}
      <section className="bg-[#111111] pt-36 pb-24 px-4 text-center">
        <div className="max-w-3xl mx-auto">
          <span className="inline-block bg-[#F97415]/20 text-[#F97415] text-xs font-bold tracking-widest uppercase px-4 py-1.5 rounded-full mb-6 border border-[#F97415]/30">
            FUNZIONALITÀ — MARGINI CANTIERE
          </span>
          <h1 className="text-3xl md:text-5xl font-extrabold text-white leading-tight mb-6">
            Sai davvero quanto stai guadagnando{" "}
            <span className="text-[#F97415]">su ogni cantiere aperto?</span>
          </h1>
          <p className="text-lg text-white/70 mb-10 max-w-2xl mx-auto">
            Costi effettivi vs budget, scostamenti per categoria, alert automatici e previsione finale — aggiornati in
            tempo reale. Non aspettare la fine del cantiere per scoprire se sei in perdita.
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
            Perché tanti titolari scoprono le perdite troppo tardi
          </h2>
          <p className="text-center text-gray-500 mb-12 max-w-xl mx-auto">
            Non è colpa tua — è colpa degli strumenti sbagliati.
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
            Il controllo di gestione che ogni impresa edile merita
          </h2>
          <p className="text-center text-gray-500 mb-12 max-w-xl mx-auto">
            Strumenti da controller finanziario, accessibili dal telefono da qualsiasi cantiere.
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
              "Prima controllavo i margini a fine cantiere quando non si poteva fare nulla. Ora li vedo ogni settimana e
              posso agire subito quando qualcosa non va."
            </p>
            <div className="flex items-center justify-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#F97415]/20 flex items-center justify-center font-bold text-[#F97415]">
                L
              </div>
              <div className="text-left">
                <div className="font-bold text-[#111111] text-sm">Luca M.</div>
                <div className="text-gray-400 text-xs">Costruzioni Martinelli, Roma</div>
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
            Inizia a controllare i tuoi margini oggi
          </h2>
          <p className="text-white/70 mb-8 text-lg">
            31 giorni gratis, senza carta di credito. Operativo in 48 ore.
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
        id="jsonld-faq-margini"
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: [
            {
              "@type": "Question",
              name: "Come viene calcolato il margine di un cantiere?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Il margine viene calcolato sottraendo al valore del contratto tutti i costi imputati alla commessa: manodopera (con costo orario per operaio), materiali acquistati, subappalti e costi generali ripartiti. Il sistema aggiorna il margine in tempo reale ad ogni nuova spesa registrata.",
              },
            },
            {
              "@type": "Question",
              name: "Posso vedere il confronto preventivo vs consuntivo durante i lavori?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Sì. Il modulo Margini mostra affiancati il budget preventivato e i costi consuntivati, per ogni voce di costo e per il totale. Vedi subito dove stai scostando dal preventivo e puoi intervenire prima che il problema peggiori.",
              },
            },
            {
              "@type": "Question",
              name: "Ricevo un alert se un cantiere va in perdita?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Sì. Edilizia in Cloud invia notifiche automatiche quando il margine di un cantiere scende sotto la soglia che hai impostato (es. margine < 15%). L'alert arriva via app mobile e via email.",
              },
            },
            {
              "@type": "Question",
              name: "Posso analizzare i margini per tipo di lavoro o per cliente?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Sì. La dashboard margini permette di raggruppare le commesse per categoria di lavoro, per cliente, per zona geografica o per periodo. Puoi identificare quali tipi di cantiere sono più profittevoli per la tua impresa.",
              },
            },
          ],
        }}
      />
      <section className="py-16 px-6 bg-gray-50">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-extrabold text-[#111111] mb-8 text-center">
            Domande frequenti sul Controllo Margini
          </h2>
          <div className="divide-y divide-gray-200">
            {[
              {
                q: "Come viene calcolato il margine di un cantiere?",
                a: "Il margine viene calcolato sottraendo al valore del contratto tutti i costi imputati: manodopera, materiali, subappalti e costi generali. Il sistema aggiorna il margine in tempo reale ad ogni nuova spesa registrata.",
              },
              {
                q: "Posso vedere il confronto preventivo vs consuntivo durante i lavori?",
                a: "Sì. Il modulo Margini mostra affiancati budget preventivato e costi consuntivati per ogni voce. Vedi subito dove stai scostando dal preventivo e puoi intervenire prima che il problema peggiori.",
              },
              {
                q: "Ricevo un alert se un cantiere va in perdita?",
                a: "Sì. Il sistema invia notifiche automatiche quando il margine scende sotto la soglia impostata (es. < 15%). L'alert arriva via app mobile e via email.",
              },
              {
                q: "Posso analizzare i margini per tipo di lavoro o per cliente?",
                a: "Sì. La dashboard raggruppa le commesse per categoria di lavoro, cliente, zona geografica o periodo. Identifica quali tipi di cantiere sono più profittevoli per la tua impresa.",
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
