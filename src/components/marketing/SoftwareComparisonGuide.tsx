import MarketingVisual from "@/components/marketing/MarketingVisual";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";
import { JsonLd } from "@/components/seo/JsonLd";
import { useSEO, SITE_URL } from "@/hooks/useSEO";
import { demoChecklist, type ComparisonGuide } from "@/lib/marketing/softwareComparisons";

export default function SoftwareComparisonGuide({ guide }: { guide: ComparisonGuide }) {
  const path = `/confronto/${guide.slug}/`;
  useSEO({ title: guide.title, description: guide.description, canonical: path });
  return <div className="min-h-screen bg-white text-[#111111]">
    <LandingNavbar />
    <JsonLd id="jsonld-comparison-guide" data={{ "@context": "https://schema.org", "@type": "WebPage", "@id": `${SITE_URL}${path}#webpage`, url: `${SITE_URL}${path}`, name: guide.title, description: guide.description, dateModified: "2026-10-21", inLanguage: "it-IT", publisher: { "@id": `${SITE_URL}/#organization` }, citation: guide.sources.map((source) => source.url) }} />
    <JsonLd id="jsonld-comparison-breadcrumb" data={{ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: "Confronti", item: `${SITE_URL}/confronto/` },
      { "@type": "ListItem", position: 3, name: guide.title, item: `${SITE_URL}${path}` },
    ] }} />
    <JsonLd id="jsonld-comparison-faq" data={{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: guide.faqs.map((faq) => ({ "@type": "Question", name: faq.q, acceptedAnswer: { "@type": "Answer", text: faq.a } })) }} />
    <header className="bg-[#111111] text-white px-6 pt-28 pb-12 md:pt-36 md:pb-16">
      <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-8 lg:gap-12 items-center lg:text-left">
<div className="min-w-0">
        <Link to="/confronto/" className="text-sm text-white/70 hover:text-white">← Tutti i confronti</Link>
        <p className="mt-8 text-sm text-orange-300">Preventivi, cantiere e controllo economico</p>
        <h1 className="mt-3 max-w-4xl text-3xl md:text-5xl font-bold tracking-tight leading-tight">{guide.title}</h1>
        <p className="mt-6 max-w-3xl text-base md:text-lg leading-relaxed text-white/80">{guide.answer}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a href="#differenze" className="rounded-full bg-white text-[#111111] px-5 py-3 text-sm font-semibold">Vedi le differenze</a>
          <a href="#prova-pratica" className="rounded-full border border-white/30 px-5 py-3 text-sm font-semibold">Guarda il flusso della commessa</a>
        </div>
      </div>
<MarketingVisual theme="operations" priority tone="dark" caption="Illustrazione editoriale · Edilizia in Cloud" />
</div>
    </header>
    <main className="max-w-6xl mx-auto px-6 py-12 md:py-16 space-y-14">
      <section aria-labelledby="quando-scegliere">
        <h2 id="quando-scegliere" className="text-2xl md:text-3xl font-bold mb-6">Quando valutare l'uno o l'altro</h2>
        <div className="grid md:grid-cols-2 gap-5">
          <div className="rounded-2xl border border-orange-200 bg-orange-50/60 p-6"><h3 className="font-bold text-lg mb-3">Edilizia in Cloud</h3><p className="leading-relaxed text-gray-700">{guide.eicFit}</p><Link className="inline-flex items-center gap-2 mt-5 font-semibold text-orange-700" to="/funzionalita/gestione-commesse/">Esplora la gestione commesse <ArrowRight size={16} /></Link></div>
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6"><h3 className="font-bold text-lg mb-3">{guide.competitor}</h3><p className="leading-relaxed text-gray-700">{guide.otherFit}</p></div>
        </div>
      </section>
      <section id="differenze" className="scroll-mt-24" aria-labelledby="titolo-differenze">
        <h2 id="titolo-differenze" className="text-2xl md:text-3xl font-bold">Come cambia il lavoro quotidiano</h2>
        <p className="mt-3 mb-6 text-gray-600">Dal preventivo al cantiere: funzioni, ambiti di utilizzo e conseguenze pratiche per la tua impresa.</p>
        <div className="space-y-5">{guide.rows.map((row) => <article key={row.topic} className="rounded-2xl border border-gray-200 overflow-hidden">
          <h3 className="px-5 py-4 bg-gray-50 font-bold">{row.topic}</h3>
          <div className="grid md:grid-cols-2 gap-5 p-5"><div><p className="text-xs uppercase tracking-wide font-semibold text-orange-700 mb-2">Edilizia in Cloud</p><p className="leading-relaxed text-gray-700">{row.eic}</p></div><div><p className="text-xs uppercase tracking-wide font-semibold text-gray-500 mb-2">{guide.competitor}</p><p className="leading-relaxed text-gray-700">{row.other}</p></div></div>
          <p className="px-5 pb-5 text-sm text-gray-600"><strong>Nel lavoro quotidiano:</strong> {row.impact}</p>
        </article>)}</div>
      </section>
      <section id="prova-pratica" className="scroll-mt-24 rounded-2xl bg-[#f7f8fa] p-6 md:p-8">
        <h2 className="text-2xl font-bold">La prova che conta: una tua commessa</h2>
        <ol className="mt-5 space-y-4 list-decimal pl-5 text-gray-700 leading-relaxed">{demoChecklist.map((step) => <li key={step}>{step}</li>)}</ol>
        <Link to="/demo/" className="inline-flex items-center gap-2 rounded-full mt-7 px-5 py-3 bg-[#111111] text-white font-semibold">Scopri Edilizia in Cloud in demo <ArrowRight size={16} /></Link>
      </section>
      <section><h2 className="text-2xl font-bold mb-5">Domande frequenti</h2><div className="divide-y divide-gray-200">{guide.faqs.map((faq) => <details key={faq.q} className="py-4"><summary className="cursor-pointer font-semibold">{faq.q}</summary><p className="mt-3 leading-relaxed text-gray-700">{faq.a}</p></details>)}</div></section>
      <section id="fonti" className="border-t border-gray-200 pt-8 text-sm text-gray-600">
        <h2 className="font-bold text-lg text-[#111111]">Fonti e metodo</h2>
        <p className="mt-3 leading-relaxed">Confronto a cura di Edilizia in Cloud, parte interessata, basato sulle fonti ufficiali consultate il 21 ottobre 2026. Le descrizioni non sono un benchmark indipendente. Disponibilità delle funzioni, importazioni e integrazioni dipendono dalla versione e dai servizi scelti; una funzione non citata non è considerata assente.</p>
        <ul className="mt-4 space-y-2">{guide.sources.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">{source.name} ↗</a></li>)}</ul>
        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3"><Link to="/blog/migliori-software-gestionali-edilizia-confronto/" className="underline">Confronto generale dei gestionali</Link><Link to="/blog/come-scegliere-software-gestionale-edilizia/" className="underline">Guida alla scelta</Link><Link to="/confronto/" className="underline">Tutte le alternative</Link></div>
      </section>
    </main>
    <LandingFooter />
  </div>;
}
