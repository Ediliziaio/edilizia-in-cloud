import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";
import { JsonLd } from "@/components/seo/JsonLd";
import { HubSeoSchema } from "@/components/seo/HubSeoSchema";
import { SITE_URL, useSEO } from "@/hooks/useSEO";
import { marketingMessages } from "@/lib/marketing/messages";
import { comparisonSources, demoChecklist, softwareComparisons, pillarComparisonFocus } from "@/lib/marketing/softwareComparisons";

const description = "Confronta i gestionali per imprese edili: Edilizia in Cloud, Pillar, TeamSystem Construction, PriMus e PlanRadar. Differenze, fonti e prova su una commessa.";
const faqs = [
  { q: "Qual è il miglior gestionale per un'impresa edile?", a: "Quello che copre i tuoi processi e viene usato da ufficio e squadra. Se devi collegare preventivo, fasi, ore e costi, valuta un gestionale di commessa come Edilizia in Cloud. Se il bisogno principale è computo e contabilità lavori, approfondisci PriMus; per BIM e un perimetro articolato considera i prodotti TeamSystem Construction. Fai eseguire lo stesso caso reale ai fornitori." },
  { q: "TeamSystem Construction è soltanto un ERP generico?", a: "No. La famiglia Construction è dedicata alle costruzioni e comprende CPM AI, TSE Costruzioni AI e Cantieri App. CPM AI dichiara cloud, BIM, controllo dei margini e funzioni AI: occorre confrontare il prodotto e i moduli effettivamente proposti." },
  { q: "PriMus è un'alternativa a un gestionale di commessa?", a: "Dipende dal bisogno. PriMus è dedicato a computo e contabilità lavori ed è presentato da ACCA come desktop e online. Un gestionale di commessa organizza anche l'operatività: fasi, squadre e costi effettivi. Prima di sostituire un prodotto tecnico, verifica quali elaborati devi continuare a produrre." },
  { q: "Come confrontare Pillar e PlanRadar con Edilizia in Cloud?", a: "Pillar dichiara preventivi, DDT, acquisti, SDI, SAL, commesse e AI: non va ridotto alla sola gestione documentale. PlanRadar presenta documenti, report, BIM e pianificazione. Usa una commessa per verificare i flussi che ti servono, compreso il controllo economico e gli adempimenti dell'ufficio." },
  { q: "Posso partire da Excel senza trasferire tutto lo storico?", a: "Prima definisci i dati necessari per partire e controlla qualità e formato dei file. Può essere utile iniziare dalle commesse aperte, concordando un punto di partenza per costi e avanzamento; la scelta va verificata sui dati della tua impresa." },
];
const scenarios = [
  { id: "commessa", title: "Devo controllare costi e margine", text: "Collega preventivo, ore e materiali alla commessa. Leggi separatamente costi previsti e reali per capire dove si forma il margine.", to: "/funzionalita/gestione-commesse/", link: "Il flusso di Edilizia in Cloud" },
  { id: "computo", title: "Devo produrre computi ed elaborati", text: "Computi ed elaborati tecnici descrivono il lavoro. La gestione della commessa aggiunge persone, materiali e costi effettivi durante l’esecuzione.", to: "/confronto/vs-primus/", link: "Confronto con PriMus ACCA" },
  { id: "erp", title: "Mi servono BIM e integrazioni", text: "Identifica prodotti, moduli e sistemi già presenti. TeamSystem Construction offre soluzioni specifiche per l'edilizia: approfondisci il perimetro corretto.", to: "/confronto/vs-teamsystem/", link: "Confronto con TeamSystem Construction" },
  { id: "excel", title: "Uso ancora Excel e messaggi", text: "Raccogli ore, documenti e attività attorno alla commessa, invece di ricostruire ogni giornata tra fogli e conversazioni.", to: "/confronto/vs-excel/", link: "Quando superare i fogli di calcolo" },
];

export default function Confronto() {
  useSEO({ title: "Confronto gestionali per imprese edili: quale scegliere", description, canonical: "/confronto/" });
  return <div className="min-h-screen bg-white text-[#111111]">
    <LandingNavbar />
    <HubSeoSchema pageName="Confronto gestionali per imprese edili" pagePath="/confronto/" pageDescription={description} breadcrumbs={[{ name: "Home", url: "/" }, { name: "Confronti", url: "/confronto/" }]} />
    <JsonLd id="jsonld-itemlist-confronto" data={{ "@context": "https://schema.org", "@type": "ItemList", name: "Confronti con Edilizia in Cloud", url: `${SITE_URL}/confronto/`, numberOfItems: softwareComparisons.length, itemListElement: softwareComparisons.map((guide, index) => ({ "@type": "ListItem", position: index + 1, name: `Edilizia in Cloud vs ${guide.name}`, url: `${SITE_URL}${guide.path}` })) }} />
    <JsonLd id="jsonld-faq-confronto" data={{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqs.map((faq) => ({ "@type": "Question", name: faq.q, acceptedAnswer: { "@type": "Answer", text: faq.a } })) }} />
    <header className="bg-[#111111] text-white pt-28 pb-12 md:pt-36 md:pb-16 px-6">
      <div className="max-w-5xl mx-auto">
        <p className="text-sm text-orange-300">Scegli sul lavoro che devi fare ogni giorno</p>
        <h1 className="mt-4 text-3xl md:text-5xl leading-tight tracking-tight font-bold max-w-3xl">Confronto gestionali per imprese edili: quale scegliere?</h1>
        <p className="mt-6 text-base md:text-lg text-white/80 leading-relaxed max-w-3xl">Edilizia in Cloud collega preventivo, cantiere e controllo dei costi. Qui trovi le differenze con Pillar, TeamSystem Construction, PriMus ACCA e altre alternative, partendo dai processi della tua impresa.</p>
        <p className="mt-4 text-sm text-white/65">{marketingMessages.companies} · {marketingMessages.activation}</p>
        <nav aria-label="Percorsi di confronto" className="mt-8 flex flex-wrap gap-3"><Link to={pillarComparisonFocus.path} className="rounded-full bg-white text-[#111111] px-5 py-3 text-sm font-semibold">Edilizia in Cloud vs Pillar</Link><a href="#esigenze" className="rounded-full border border-white/30 px-5 py-3 text-sm font-semibold">Parti dalla tua esigenza</a><a href="#concorrenti" className="rounded-full border border-white/30 px-5 py-3 text-sm font-semibold">Scegli il software da confrontare</a></nav>
      </div>
    </header>
    <main className="max-w-6xl mx-auto px-6 py-12 md:py-16 space-y-16">
      <section id="confronto-pillar" className="scroll-mt-24 rounded-3xl border border-orange-200 bg-orange-50/50 p-6 md:p-8" aria-labelledby="pillar-heading">
        <p className="text-xs font-semibold uppercase tracking-wide text-orange-700">In evidenza · Confronto con Pillar</p>
        <h2 id="pillar-heading" className="mt-3 text-2xl md:text-3xl font-bold max-w-3xl">{pillarComparisonFocus.title}</h2>
        <p className="mt-4 text-gray-700 leading-relaxed max-w-3xl">{pillarComparisonFocus.description}</p>
        <div className="mt-6 grid md:grid-cols-3 gap-5">{pillarComparisonFocus.strengths.map((strength) => <div key={strength.path} className="rounded-2xl bg-white border border-orange-100 p-5"><h3 className="font-bold text-lg">{strength.title}</h3><p className="mt-3 text-sm text-gray-600 leading-relaxed">{strength.text}</p><Link className="inline-flex items-center gap-2 mt-4 font-semibold text-orange-700 text-sm" to={strength.path}>Esplora il flusso<ArrowRight size={16} /></Link></div>)}</div>
        <div className="mt-6 flex flex-wrap items-center gap-4"><Link to={pillarComparisonFocus.path} className="inline-flex items-center gap-2 rounded-full bg-[#111111] text-white px-5 py-3 font-semibold">Leggi il confronto con Pillar<ArrowRight size={16} /></Link><p className="text-sm text-gray-600">Vendita, preventivi, organizzazione del cantiere e controllo dei costi.</p></div>
      </section>
      <section id="esigenze" className="scroll-mt-24">
        <h2 className="text-2xl md:text-3xl font-bold">Prima il problema, poi il software</h2>
        <p className="mt-3 text-gray-600 max-w-3xl leading-relaxed">Computo metrico, documentazione, amministrazione e controllo di commessa sono esigenze diverse. Confrontare solo il numero di funzioni può nascondere i passaggi che contano per il tuo lavoro.</p>
        <div className="mt-7 grid md:grid-cols-2 gap-5">{scenarios.map((scenario) => <article id={scenario.id} key={scenario.id} className="scroll-mt-24 rounded-2xl border border-gray-200 p-6"><h3 className="font-bold text-lg">{scenario.title}</h3><p className="mt-3 text-gray-600 leading-relaxed">{scenario.text}</p><Link to={scenario.to} className="inline-flex items-center gap-2 mt-5 text-orange-700 font-semibold">{scenario.link}<ArrowRight size={16} /></Link></article>)}</div>
      </section>
      <section id="concorrenti" className="scroll-mt-24">
        <h2 className="text-2xl md:text-3xl font-bold">Edilizia in Cloud e le alternative</h2>
        <p className="mt-3 text-gray-600 leading-relaxed">Trova il software che usi o che stai valutando: ogni scheda mette a fuoco i processi da gestire e il ruolo di Edilizia in Cloud nel lavoro della tua impresa.</p>
        <div className="mt-7 grid sm:grid-cols-2 gap-5">{softwareComparisons.map((guide) => <article key={guide.path} className="rounded-2xl border border-gray-200 p-6 flex flex-col"><h3 className="mt-3 text-xl font-bold">Edilizia in Cloud vs {guide.name}</h3><p className="mt-3 text-gray-600 leading-relaxed flex-1">{guide.summary}</p><Link to={guide.path} className="inline-flex items-center gap-2 mt-5 font-semibold text-orange-700">Leggi il confronto<ArrowRight size={16} /></Link></article>)}</div>
      </section>
      <section className="rounded-2xl bg-orange-50 border border-orange-100 p-6 md:p-8">
        <h2 className="text-2xl font-bold">Vuoi prima una panoramica del mercato?</h2>
        <p className="mt-3 max-w-3xl leading-relaxed text-gray-700">La guida ai gestionali distingue soluzioni di commessa, suite d'impresa e strumenti specializzati. La guida alla scelta ti aiuta invece a preparare una valutazione sulla tua azienda.</p>
        <div className="mt-5 flex flex-wrap gap-x-6 gap-y-3"><Link className="font-semibold underline underline-offset-4" to="/blog/migliori-software-gestionali-edilizia-confronto/">I gestionali per l'edilizia a confronto</Link><Link className="font-semibold underline underline-offset-4" to="/blog/come-scegliere-software-gestionale-edilizia/">Come scegliere il gestionale</Link></div>
      </section>
      <section id="prova-pratica" className="scroll-mt-24"><h2 className="text-2xl md:text-3xl font-bold">Chiedi di vedere una tua commessa</h2><p className="mt-3 text-gray-600">Usa la stessa prova con tutti i fornitori. Annota passaggi manuali, dati mancanti e chi dovrà completare ogni attività.</p><ol className="mt-6 space-y-4 list-decimal pl-5 text-gray-700 leading-relaxed">{demoChecklist.map((step) => <li key={step}>{step}</li>)}</ol><Link to="/demo/" className="inline-flex items-center gap-2 mt-7 rounded-full bg-[#111111] text-white px-5 py-3 font-semibold">Prova il flusso di Edilizia in Cloud<ArrowRight size={16} /></Link></section>
      <section id="commercialista" className="scroll-mt-24 border-t border-gray-200 pt-8"><h2 className="text-2xl font-bold">Gestionale e commercialista: due ruoli collegati</h2><p className="mt-3 text-gray-700 leading-relaxed max-w-3xl">Il gestionale raccoglie i dati operativi; il professionista segue gli adempimenti e le attività concordate. In demo verifica come condividere documenti e dati, senza presumere che il software sostituisca la consulenza.</p></section>
      <section><h2 className="text-2xl font-bold mb-5">Domande sulla scelta del gestionale</h2><div className="divide-y divide-gray-200">{faqs.map((faq) => <details key={faq.q} className="py-4"><summary className="font-semibold cursor-pointer">{faq.q}</summary><p className="mt-3 text-gray-700 leading-relaxed">{faq.a}</p></details>)}</div></section>
      <section id="fonti" className="scroll-mt-24 border-t border-gray-200 pt-8 text-sm text-gray-600"><h2 className="font-bold text-xl text-[#111111]">Fonti e criteri del confronto</h2><p className="mt-3 leading-relaxed">Siamo Edilizia in Cloud e siamo parte del confronto. Il riepilogo dei prodotti si basa sulle pagine ufficiali consultate il 21 ottobre 2026. Una funzione non descritta non viene trattata come assente. Gli approfondimenti collegati riportano le rispettive date di aggiornamento. Funzioni e integrazioni dipendono dalle versioni e dai servizi scelti.</p><ul className="mt-4 grid md:grid-cols-2 gap-3">{Object.values(comparisonSources).map((source) => <li key={source.url}><a href={source.url} className="underline underline-offset-4" target="_blank" rel="noopener noreferrer">{source.name} ↗</a></li>)}</ul></section>
    </main>
    <LandingFooter />
  </div>;
}
