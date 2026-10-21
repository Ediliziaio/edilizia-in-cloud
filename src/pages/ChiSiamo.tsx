import { Link } from "react-router-dom";
import { ArrowRight, HardHat, Users, ChartNoAxesCombined } from "lucide-react";
import { useSEO, SITE_URL } from "@/hooks/useSEO";
import { JsonLd } from "@/components/seo/JsonLd";
import { HubSeoSchema } from "@/components/seo/HubSeoSchema";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";
import { marketingMessages } from "@/lib/marketing/messages";

const description = "Conosci Edilizia in Cloud: sviluppiamo software e affianchiamo le imprese edili nell’organizzazione di ufficio, cantieri e controllo dei costi.";
const principles = [
  { icon: HardHat, title: "Il lavoro prima delle funzioni", text: "Una lavorazione da preventivare, una squadra da organizzare, un materiale da acquistare: partiamo dalle attività che l’impresa deve portare a termine ogni giorno." },
  { icon: Users, title: "Ufficio e cantiere collegati", text: "Chi prepara il lavoro e chi lo esegue hanno esigenze diverse. L’obiettivo è condividere le informazioni della commessa, con date, responsabilità e registrazioni leggibili." },
  { icon: ChartNoAxesCombined, title: "Numeri che puoi ricostruire", text: "Venduto, costo previsto e costo reale rispondono a domande diverse. Tenerli distinti aiuta a capire da dove viene il risultato di ogni cantiere." },
];
const paths = [
  { title: "Ascoltiamo come lavori", text: "Partiamo dall’organizzazione dell’impresa: chi prepara i preventivi, chi coordina il cantiere e chi segue i numeri. Il primo incontro serve a mettere a fuoco le tue esigenze.", to: "/demo/", label: "Conosciamoci in demo" },
  { title: "Prepariamo l’avvio insieme", text: "Definiamo le attività con cui partire, la configurazione e i dati da recuperare. Il passaggio viene organizzato sulla situazione di partenza dell’azienda.", to: "/pianifica-migrazione/", label: "Come preparare il passaggio" },
  { title: "Facciamo evolvere il prodotto", text: "I problemi operativi e i riscontri di chi usa la piattaforma orientano i miglioramenti. Le novità raccontano come cambia il prodotto nel tempo.", to: "/novita/", label: "Scopri le novità" },
];
const faqs = [
  { q: "Chi c’è dietro Edilizia in Cloud?", a: "Edilizia in Cloud è un progetto di Domus Group S.r.l., con sede a Milano. Sviluppiamo una piattaforma per le imprese edili e le affianchiamo nell’organizzazione del lavoro tra ufficio e cantiere." },
  { q: "A chi si rivolge la piattaforma?", a: "Alle imprese che vogliono seguire insieme attività commerciali, cantieri e costi. La demo parte dal tuo modo di lavorare, per capire quali flussi utilizzare e quali persone coinvolgere." },
  { q: "Come funziona l’avvio assistito?", a: marketingMessages.activationDetail },
  { q: "Dove trovo le informazioni sulla gestione dei dati?", a: "L’informativa privacy, i termini di servizio e il DPA sono disponibili sul sito. Per una domanda specifica puoi scrivere a privacy@ediliziaincloud.com." },
];

export default function ChiSiamo() {
  useSEO({ title: "Chi siamo: l’azienda dietro Edilizia in Cloud", description, canonical: "/chi-siamo/" });
  return <div className="min-h-screen bg-white text-[#111111]">
    <LandingNavbar />
    <HubSeoSchema pageName="Chi siamo" pagePath="/chi-siamo/" pageDescription={description} breadcrumbs={[{ name: "Home", url: "/" }, { name: "Chi siamo", url: "/chi-siamo/" }]} />
    <JsonLd id="jsonld-aboutpage-chisiamo" data={{ "@context": "https://schema.org", "@type": "AboutPage", "@id": `${SITE_URL}/chi-siamo/#aboutpage`, url: `${SITE_URL}/chi-siamo/`, name: "Chi siamo: Edilizia in Cloud", description, inLanguage: "it-IT", about: { "@id": `${SITE_URL}/#organization` } }} />
    <JsonLd id="jsonld-organization-chisiamo" data={{ "@context": "https://schema.org", "@type": "Organization", "@id": `${SITE_URL}/#organization`, name: "Edilizia in Cloud", legalName: "Domus Group S.r.l.", url: SITE_URL, vatID: "IT13132010961", address: { "@type": "PostalAddress", streetAddress: "Via Aurelio Saffi 29", postalCode: "20123", addressLocality: "Milano", addressCountry: "IT" }, email: "info@ediliziaincloud.com" }} />
    <JsonLd id="jsonld-faq-chisiamo" data={{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqs.map(f => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) }} />
    <main>
      <header className="bg-[#111111] px-5 pt-28 pb-14 sm:px-6 md:pt-36 md:pb-20 text-white">
        <div className="mx-auto max-w-7xl grid lg:grid-cols-[1fr_1.05fr] gap-10 lg:gap-14 items-center">
          <div>
            <p className="text-sm font-semibold text-orange-300">Chi siamo · Edilizia in Cloud</p>
            <h1 className="mt-4 max-w-3xl text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight leading-tight">Al fianco delle imprese che costruiscono.</h1>
            <p className="mt-6 max-w-2xl text-base sm:text-lg text-white/75 leading-relaxed">Crediamo che un’impresa debba poter dedicare più attenzione al lavoro e meno tempo a rincorrere informazioni. Per questo sviluppiamo Edilizia in Cloud e accompagniamo le aziende nel collegare ufficio, cantieri e controllo dei costi.</p>
            <p className="mt-5 text-sm text-white/65">{marketingMessages.companies} · {marketingMessages.activation}</p>
            <div className="mt-8 flex flex-wrap gap-3"><Link to="/demo/" className="inline-flex items-center justify-center gap-2 min-h-12 rounded-full bg-white text-[#111111] px-6 py-3 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-400 active:scale-[0.98]">Incontraci in demo <ArrowRight size={18} /></Link><a href="#come-lavoriamo" className="inline-flex items-center min-h-12 rounded-full border border-white/30 px-6 py-3 font-semibold hover:bg-white/10">Come lavoriamo</a></div>
          </div>
          <figure className="min-w-0">
            <div className="overflow-hidden rounded-[1.75rem] bg-[#e8e2d9] shadow-2xl ring-1 ring-white/10">
              <img src="/images/about/ufficio-cantiere-960.webp" srcSet="/images/about/ufficio-cantiere-640.webp 640w, /images/about/ufficio-cantiere-960.webp 960w, /images/about/ufficio-cantiere-1536.webp 1536w" sizes="(min-width: 1024px) 50vw, 100vw" width={1536} height={1024} fetchPriority="high" alt="Illustrazione di un ufficio collegato a un cantiere da un percorso arancione" className="w-full h-auto" />
            </div>
            <figcaption className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-white/60"><span>Ufficio e cantiere, nello stesso progetto.</span><span>Edilizia in Cloud</span></figcaption>
          </figure>
        </div>
      </header>
      <section id="come-lavoriamo" className="scroll-mt-24 px-5 py-14 md:py-24 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-[0.8fr_1.2fr] gap-6 md:gap-16 items-start">
            <div><p className="text-sm font-semibold text-orange-700">La nostra missione</p><h2 className="mt-3 text-2xl md:text-4xl font-bold tracking-tight leading-tight">Dare più chiarezza a chi gestisce un’impresa edile.</h2></div>
            <div className="text-gray-600 leading-relaxed space-y-4"><p>Una decisione presa in ufficio cambia il lavoro in cantiere. Un materiale consegnato, un’ora lavorata o una variante incidono sui numeri dell’impresa. Quando queste informazioni restano separate, capire come sta andando il lavoro diventa più difficile.</p><p>Il nostro progetto nasce da questa esigenza: collegare le persone e le attività attorno alla commessa. Sviluppiamo la piattaforma con attenzione al lavoro quotidiano e affianchiamo le imprese nel passaggio a un’organizzazione più condivisa.</p></div>
          </div>
          <div className="mt-10 md:mt-14 grid md:grid-cols-3 gap-5">{principles.map(item => <article key={item.title} className="rounded-2xl border border-gray-200 p-6"><item.icon size={24} className="text-orange-600" aria-hidden="true" /><h3 className="mt-5 text-lg font-bold">{item.title}</h3><p className="mt-3 text-sm leading-relaxed text-gray-600">{item.text}</p></article>)}</div>
        </div>
      </section>
      <section className="px-5 pb-14 md:pb-24 sm:px-6">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 rounded-3xl overflow-hidden bg-[#f3f1ed] border border-gray-100">
          <img src="/images/about/progetto-materiali-960.webp" srcSet="/images/about/progetto-materiali-640.webp 640w, /images/about/progetto-materiali-960.webp 960w, /images/about/progetto-materiali-1536.webp 1536w" sizes="(min-width: 768px) 50vw, 100vw" width={1536} height={1024} loading="lazy" decoding="async" alt="Illustrazione di progetto, materiali ed elmetto collegati a uno strumento digitale" className="h-full min-h-64 w-full object-cover" />
          <div className="p-7 sm:p-10 md:p-12 flex flex-col justify-center"><p className="text-sm font-semibold text-orange-700">Il nostro impegno</p><h2 className="mt-3 text-2xl md:text-3xl font-bold tracking-tight">Costruire strumenti utili. Accompagnare chi li usa.</h2><p className="mt-5 text-gray-600 leading-relaxed">Una piattaforma entra nel lavoro di persone con ruoli, abitudini e responsabilità diverse. Per noi l’avvio comincia dall’ascolto: capire la situazione di partenza, scegliere le attività da organizzare e preparare i dati necessari.</p><p className="mt-4 text-gray-600 leading-relaxed">L’obiettivo è un percorso comprensibile, che l’ufficio e la squadra possano riconoscere nel proprio lavoro.</p><Link to="/demo/" className="mt-6 inline-flex items-center gap-2 font-semibold text-orange-700">Parliamo della tua impresa <ArrowRight size={18} /></Link></div>
        </div>
      </section>
      <section className="bg-[#f7f8fa] px-5 py-14 md:py-20 sm:px-6"><div className="max-w-6xl mx-auto"><h2 className="text-2xl md:text-3xl font-bold tracking-tight">Come lavoriamo con la tua impresa</h2><div className="mt-8 grid md:grid-cols-3 gap-5">{paths.map((path,index) => <article key={path.to} className="flex flex-col rounded-2xl bg-white border border-gray-200 p-6"><span className="text-sm font-semibold text-orange-700">0{index+1}</span><h3 className="mt-4 text-lg font-bold">{path.title}</h3><p className="mt-3 text-sm leading-relaxed text-gray-600 flex-1">{path.text}</p><Link to={path.to} className="inline-flex items-center gap-2 mt-5 text-sm font-semibold text-orange-700">{path.label}<ArrowRight size={16} /></Link></article>)}</div></div></section>
      <section className="px-5 py-14 md:py-20 sm:px-6"><div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-8 md:gap-14"><div><p className="text-sm font-semibold text-orange-700">Il primo passo</p><h2 className="mt-3 text-2xl md:text-3xl font-bold tracking-tight">Partiamo dalla tua situazione.</h2><p className="mt-5 text-gray-600 leading-relaxed">In demo vediamo come gestisci oggi preventivi, cantieri e costi. Poi definiamo le attività con cui iniziare, le persone da coinvolgere e i dati utili da recuperare.</p><p className="mt-4 text-gray-600 leading-relaxed">{marketingMessages.activationDetail}</p><Link to="/demo/" className="inline-flex items-center gap-2 mt-6 font-semibold text-orange-700">Richiedi una demo <ArrowRight size={18} /></Link></div><div className="rounded-2xl border border-gray-200 p-6 sm:p-8"><p className="text-sm font-semibold text-orange-700">La nostra azienda</p><h2 id="azienda-heading" className="mt-2 text-xl font-bold">Edilizia in Cloud</h2><address className="not-italic mt-4 text-sm leading-7 text-gray-600">Domus Group S.r.l.<br />Via Aurelio Saffi 29 — 20123 Milano<br />P.IVA 13132010961<br /><a className="underline underline-offset-4 break-all" href="mailto:info@ediliziaincloud.com">info@ediliziaincloud.com</a></address><div className="mt-5 flex flex-wrap gap-x-5 gap-y-3 text-sm font-semibold"><Link className="underline underline-offset-4" to="/privacy-policy/">Privacy</Link><Link className="underline underline-offset-4" to="/termini-e-condizioni/">Termini di servizio</Link><Link className="underline underline-offset-4" to="/dpa/">DPA</Link></div></div></div></section>
      <section className="px-5 pb-16 sm:px-6"><div className="max-w-3xl mx-auto"><h2 className="text-2xl font-bold mb-5">Domande sull’azienda</h2><div className="divide-y divide-gray-200">{faqs.map(f => <details key={f.q} className="py-4"><summary className="font-semibold cursor-pointer">{f.q}</summary><p className="mt-3 text-sm leading-relaxed text-gray-600">{f.a}</p></details>)}</div></div></section>
    </main>
    <LandingFooter />
  </div>;
}
