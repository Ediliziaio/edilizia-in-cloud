import { useSEO } from "@/hooks/useSEO";
import { JsonLd } from "@/components/seo/JsonLd";
import { Link } from "react-router-dom";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";
import { ArrowRight } from "lucide-react";

const painPoints = [
  {
    emoji: "🐢",
    title: "Emissione fattura: un processo lento e manuale",
    desc: "Compilare una fattura elettronica da zero dopo ogni SAL richiede tempo, dati sparsi e mille controlli. Poi devi inviarla manualmente allo SDI.",
  },
  {
    emoji: "❌",
    title: "Errori sul codice destinatario e sul formato XML",
    desc: "Un codice fiscale sbagliato, un codice SDI errato, un campo mancante — e la fattura viene rifiutata. Devi ripartire da zero.",
  },
  {
    emoji: "📁",
    title: "Conservazione sostitutiva non a norma",
    desc: "Le fatture elettroniche vanno conservate per 10 anni in modo conforme. Salvarle in una cartella condivisa non basta: rischi sanzioni.",
  },
  {
    emoji: "🔀",
    title: "Riconciliazione manuale SAL → fattura",
    desc: "Ogni volta devi ricopiare i dati dal SAL alla fattura. Errori, discrepanze e ore perse in un processo che dovrebbe essere automatico.",
  },
];

const features = [
  {
    emoji: "📄",
    title: "Emissione FE da SAL",
    desc: "Genera la fattura elettronica direttamente dal SAL approvato. Tutti i dati compilati automaticamente, zero ricopiature.",
  },
  {
    emoji: "📡",
    title: "Invio SDI automatico",
    desc: "La fattura viene trasmessa allo SDI senza intervento manuale. Ricevi la notifica di consegna e accettazione in dashboard.",
  },
  {
    emoji: "🏛️",
    title: "Fattura PA con CIG/CUP",
    desc: "Lavori con pubbliche amministrazioni? Gestione nativa di CIG, CUP e split payment, conforme alle norme vigenti.",
  },
  {
    emoji: "🗄️",
    title: "Conservazione sostitutiva 10 anni",
    desc: "Archivio digitale a norma di legge, integrato nel piano. Nessun servizio esterno, nessun costo aggiuntivo.",
  },
  {
    emoji: "📅",
    title: "Scadenzario incassi",
    desc: "Tieni traccia di ogni fattura emessa, della data di scadenza e del pagamento ricevuto. Alert automatici per i ritardi.",
  },
  {
    emoji: "📊",
    title: "Export per commercialista",
    desc: "Report mensili e annuali pronti in PDF ed Excel. Invia tutto al commercialista con un clic, senza cercare nulla.",
  },
];

const stats = [
  { value: "-4h", label: "a settimana emissione fatture" },
  { value: "0", label: "errori SDI" },
  { value: "100%", label: "conformità normativa" },
  { value: "10 anni", label: "conservazione sostitutiva inclusa" },
];

const relatedLinks = [
  { to: "/funzionalita/margini-cantiere", label: "Margini Cantiere" },
  { to: "/funzionalita/gestione-cantieri", label: "Gestione Cantieri" },
  { to: "/funzionalita/preventivi-edilizia", label: "Preventivi Edilizia" },
];

export default function FatturazioneElettronica() {
  useSEO({
    title: "Fatturazione Elettronica Edilizia — SDI, SAL e Conservazione Sostitutiva | Edilizia in Cloud",
    description:
      "Emetti fatture elettroniche direttamente dai SAL di cantiere. Invio SDI automatico, conservazione sostitutiva a norma, ricevute di consegna e integrazione con il commercialista.",
    canonical: "/funzionalita/fatturazione-elettronica",
    keywords:
      "fatturazione elettronica edilizia, fattura elettronica SDI costruzioni, SAL fattura elettronica, conservazione sostitutiva edilizia, fattura elettronica impresa edile, software fatturazione cantiere",
  });

  return (
    <div className="min-h-screen bg-white text-[#111111] overflow-x-hidden">
      <JsonLd
        id="jsonld-breadcrumb-fatturazione"
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: "https://ediliziaincloud.com/" },
            { "@type": "ListItem", position: 2, name: "Funzionalità", item: "https://ediliziaincloud.com/funzionalita" },
            {
              "@type": "ListItem",
              position: 3,
              name: "Fatturazione Elettronica",
              item: "https://ediliziaincloud.com/funzionalita/fatturazione-elettronica",
            },
          ],
        }}
      />
      <JsonLd
        id="jsonld-webpage-fatturazione"
        data={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "Fatturazione Elettronica Edilizia — SDI, SAL e Conservazione Sostitutiva",
          description:
            "Emetti fatture elettroniche direttamente dai SAL di cantiere. Invio SDI automatico, conservazione sostitutiva a norma.",
          url: "https://ediliziaincloud.com/funzionalita/fatturazione-elettronica",
          isPartOf: { "@type": "WebSite", url: "https://ediliziaincloud.com/funzionalita" },
          about: { "@type": "SoftwareApplication", name: "Edilizia in Cloud" },
        }}
      />

      <LandingNavbar />

      {/* ── HERO ── */}
      <section className="bg-[#111111] pt-36 pb-24 px-4 text-center">
        <div className="max-w-3xl mx-auto">
          <span className="inline-block bg-[#F97415]/20 text-[#F97415] text-xs font-bold tracking-widest uppercase px-4 py-1.5 rounded-full mb-6 border border-[#F97415]/30">
            FUNZIONALITÀ — FATTURAZIONE ELETTRONICA
          </span>
          <h1 className="text-3xl md:text-5xl font-extrabold text-white leading-tight mb-6">
            Dalla commessa alla fattura SDI{" "}
            <span className="text-[#F97415]">in 3 click</span>
          </h1>
          <p className="text-lg text-white/70 mb-10 max-w-2xl mx-auto">
            Genera fatture elettroniche dai SAL di cantiere, inviale allo SDI in automatico e archivia tutto a norma.
            Senza ricopiare un dato, senza errori.
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
            Quattro problemi che rallentano ogni impresa edile
          </h2>
          <p className="text-center text-gray-500 mb-12 max-w-xl mx-auto">
            La fatturazione elettronica dovrebbe essere semplice. Senza il sistema giusto, non lo è.
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
            Fatturazione completa, integrata nel gestionale
          </h2>
          <p className="text-center text-gray-500 mb-12 max-w-xl mx-auto">
            Dal SAL alla conservazione sostitutiva: tutto in un'unica piattaforma, senza moduli aggiuntivi.
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
            Meno tempo, zero errori, piena conformità
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
            Fattura in modo professionale dal primo giorno
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

      <LandingFooter />
    </div>
  );
}
