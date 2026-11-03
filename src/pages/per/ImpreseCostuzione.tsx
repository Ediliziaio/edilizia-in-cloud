import { Link } from "react-router-dom";
import { ArrowRight, Check, ClipboardList, Users, Package, BarChart3 } from "lucide-react";
import { useSEO } from "@/hooks/useSEO";
import { JsonLd } from "@/components/seo/JsonLd";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";
import SolutionSection from "@/components/landing/SolutionSection";
import { eicWhatsapp, eicSiAdatta } from "@/lib/marketing/eicPuntiFermi";

export const impreseFaq = [
  { q: "Cosa deve fare un gestionale per imprese edili?", a: "Deve collegare preventivi, commesse, fasi, squadre, ore, materiali e documenti. Il titolare deve poter ricostruire il costo del cantiere e distinguere costi registrati, stime ancora da completare e pagamenti. La prova va fatta su un lavoro simile a quelli della propria impresa." },
  { q: "Posso partire dai cantieri aperti senza importare tutto lo storico?", a: "In demo si concordano i dati da cui partire: anagrafiche, preventivi, commesse aperte, costi già sostenuti e lavorazioni residue. Formati, qualità dei dati e tempi dell'avvio assistito si verificano prima dell'importazione." },
  { q: "La squadra deve usare l'app o può lavorare su WhatsApp?", a: "Può usare l'app; con WhatsApp Business attivo, un servizio aggiuntivo, può inviare anche vocali e foto al numero dell'azienda. Il flusso di conferma e le persone autorizzate si configurano sul lavoro della squadra." },
  { q: "Edilizia in Cloud sostituisce il commercialista?", a: "No. Collega il lavoro di cantiere ai documenti, alla fatturazione e al controllo di gestione. Contabilità ordinaria, bilancio e conservazione digitale a norma restano compiti da verificare con lo studio e i servizi dedicati." },
  { q: "Quanto costa e come posso provarlo?", a: "Sul sito trovi il piano gratuito e la prova di 31 giorni. Il perimetro dei moduli e dei servizi aggiuntivi si definisce in una consulenza: porta un preventivo e un esempio di giornata di cantiere per verificare ciò che serve alla tua impresa." },
];
const steps = [
  { icon: ClipboardList, title: "Dal preventivo alla commessa", body: "Ritrova lavorazioni, importi e fasi nello stesso lavoro. Assegna le responsabilità prima di mandare la squadra in cantiere.", href: "/funzionalita/gestione-commesse/", label: "Gestione delle commesse" },
  { icon: Users, title: "Ore e rapportini dalla squadra", body: "Collega le registrazioni alla commessa e alla fase. Controlla chi deve confermarle e come vengono valorizzate le ore.", href: "/funzionalita/rapportini-cantiere/", label: "Rapportini di cantiere" },
  { icon: Package, title: "Materiali e documenti collegati", body: "Segui consegne, DDT e fatture. Verifica le attribuzioni al cantiere e i documenti mancanti, senza contare due volte lo stesso acquisto.", href: "/funzionalita/ddt-digitali/", label: "DDT e materiali" },
  { icon: BarChart3, title: "Costi, margine e scadenze", body: "Confronta il preventivo con i costi registrati e quelli ancora previsti. Tieni separato il margine atteso dai soldi da incassare.", href: "/funzionalita/margini-cantiere/", label: "Margini per cantiere" },
];
const guides = [
  ["/blog/migliori-software-gestionali-edilizia-confronto/", "Confronta i gestionali per imprese edili", "Otto strumenti, fonti ufficiali e la stessa prova pratica da chiedere a ogni fornitore."],
  ["/blog/chi-gestisce-i-numeri-impresa-edile/", "Quali numeri controllare ogni settimana", "Margine, cassa, ore e scostamenti: la guida con il video di Florin."],
  ["/blog/excel-whatsapp-carta-gestione-impresa-edile/", "Quando Excel, chat e carta non bastano più", "Come tenere insieme le informazioni di ufficio e cantiere."],
];
export default function ImpreseCostuzione() {
  useSEO({ title: "Gestionale per imprese edili: commesse, costi e margini", description: "Collega preventivi, commesse, squadre, ore e materiali. Guarda il gestionale per imprese edili con dati demo e richiedi una prova sul tuo lavoro.", canonical: "/per/imprese-edili/" });
  return <div className="min-h-screen bg-white text-[#111111]">
    <LandingNavbar />
    <JsonLd id="jsonld-service-imprese-edili" data={{ "@context": "https://schema.org", "@type": "Service", name: "Gestionale per imprese edili", url: "https://www.ediliziaincloud.com/per/imprese-edili/", description: "Preventivi, commesse, squadre, ore, materiali e controllo dei costi per imprese edili.", provider: { "@id": "https://www.ediliziaincloud.com/#organization" }, areaServed: { "@type": "Country", name: "Italia" } }} />
    <JsonLd id="jsonld-faq-imprese-edili" data={{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: impreseFaq.map(f => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) }} />
    <JsonLd id="jsonld-breadcrumb-imprese-edili" data={{ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Home", item: "https://www.ediliziaincloud.com/" }, { "@type": "ListItem", position: 2, name: "Gestionale per imprese edili", item: "https://www.ediliziaincloud.com/per/imprese-edili/" }] }} />
    <main>
      <header className="bg-[#101820] px-5 pb-16 pt-32 text-white md:pb-24">
        <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[1fr_1.15fr]">
          <div><p className="mb-5 text-xs font-bold uppercase tracking-[.18em] text-eic-orange">Edilizia in Cloud · Imprese edili</p>
            <h1 className="text-4xl font-extrabold leading-tight tracking-tight md:text-5xl">Il gestionale per imprese edili.<span className="mt-2 block text-eic-orange">Dal preventivo ai costi del cantiere.</span></h1>
            <p className="mt-6 text-lg leading-relaxed text-white/75">Commesse, fasi, squadre, ore, materiali e fatture nello stesso flusso. Guarda da dove nasce il costo di ogni lavoro, cosa manca da registrare e quanto resta da fare.</p>
            <div className="mt-8 flex flex-wrap gap-3"><Link to="/demo/" className="inline-flex min-h-12 items-center gap-2 rounded-full bg-eic-orange px-6 py-3 font-bold text-white hover:bg-orange-600">Porta un tuo preventivo in demo <ArrowRight size={18} /></Link><a href="#prodotto" className="inline-flex min-h-12 items-center rounded-full border border-white/30 px-6 py-3 font-semibold">Guarda il portale</a></div>
            <p className="mt-4 text-sm text-white/60">Prova di 31 giorni · Avvio assistito · Moduli e servizi concordati sui tuoi processi</p>
          </div>
          <figure className="overflow-hidden rounded-2xl border border-white/20 bg-white shadow-xl"><img src="/product/commessa-demo.webp" alt="Schermata reale di una commessa in Edilizia in Cloud, con dati dell’azienda dimostrativa" width={984} height={624} fetchPriority="high" className="h-auto w-full" /><figcaption className="bg-[#192b3d] px-5 py-3 text-xs leading-relaxed text-white/70">Il portale Edilizia in Cloud · Azienda dimostrativa, dati di esempio.</figcaption></figure>
        </div>
      </header>
      <section id="prodotto" className="scroll-mt-24 px-5 py-16 md:py-20"><div className="mx-auto max-w-6xl">
        <div className="max-w-3xl"><p className="text-xs font-bold uppercase tracking-widest text-eic-orange">La prova da fare sul tuo lavoro</p><h2 className="mt-3 text-3xl font-extrabold tracking-tight md:text-4xl">Una commessa. Quattro passaggi da verificare.</h2><p className="mt-5 text-lg leading-relaxed text-gray-600">Se l’ufficio deve ricopiare le ore per sapere quanto costa il cantiere, il collegamento si è interrotto. In demo seguiamo lo stesso lavoro dalla proposta al controllo dei costi.</p></div>
        <div className="mt-10 grid gap-6 md:grid-cols-2">{steps.map(({ icon: Icon, title, body, href, label }, i) => <div key={href} className="rounded-2xl border border-gray-200 p-6"><div className="mb-5 flex items-center gap-3"><Icon className="text-eic-orange" size={25} /><span className="text-xs font-bold text-gray-500">0{i+1}</span></div><h3 className="text-xl font-bold">{title}</h3><p className="my-4 leading-relaxed text-gray-600">{body}</p><Link to={href} className="inline-flex min-h-11 items-center gap-2 font-semibold text-eic-orange underline underline-offset-4">{label}<ArrowRight size={16} /></Link></div>)}</div>
        <figure className="mt-10 overflow-hidden rounded-2xl border border-gray-200"><img src="/product/fasi-commessa-demo.webp" alt="Fasi e pianificazione di una commessa nel portale Edilizia in Cloud con dati dimostrativi" width={944} height={640} loading="lazy" className="h-auto w-full" /><figcaption className="bg-gray-50 px-5 py-4 text-sm text-gray-600">Schermata del portale nell’azienda demo. Importi, nomi e lavorazioni sono esempi, non risultati di un cliente.</figcaption></figure>
      </div></section>
      <SolutionSection />
      <section className="px-5 py-16 md:py-20"><div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-2">{[eicWhatsapp,eicSiAdatta].map(item => <div key={item.heading}><h2 className="text-2xl font-extrabold leading-tight md:text-3xl">{item.heading}</h2>{item.body.split("\n\n").map((p,i)=><p key={i} className="mt-5 leading-relaxed text-gray-600">{p}</p>)}</div>)}</div></section>
      <section className="bg-orange-50 px-5 py-16"><div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-2"><div><h2 className="text-3xl font-extrabold">Cosa portare alla demo</h2><p className="mt-5 leading-relaxed text-gray-700">Un preventivo, una giornata della squadra e un acquisto di materiali. Puoi usare un esempio senza nominativi: confrontiamo i passaggi che ti servono, prima di parlare di configurazione.</p><Link to="/demo/" className="mt-7 inline-flex min-h-12 items-center gap-2 rounded-full bg-eic-orange px-6 py-3 font-bold text-white">Richiedi la demo <ArrowRight size={18}/></Link></div><ul className="space-y-4">{["Come diventano commessa le lavorazioni del preventivo", "Chi registra, chi conferma e cosa vede ogni ruolo", "Come si collegano ore, materiali e documenti", "Quali dati mancano prima di leggere il margine", "Moduli, servizi aggiuntivi e dati da importare"].map(t=><li key={t} className="flex gap-3 leading-relaxed"><Check className="mt-1 shrink-0 text-eic-orange" size={18}/>{t}</li>)}</ul></div></section>
      <section className="px-5 py-16"><div className="mx-auto max-w-6xl"><h2 className="text-3xl font-extrabold">Prima di scegliere il gestionale</h2><div className="mt-8 grid gap-5 md:grid-cols-3">{guides.map(([href,title,body])=><Link key={href} to={href} className="rounded-2xl border border-gray-200 p-6 hover:border-eic-orange"><h3 className="text-lg font-bold">{title}</h3><p className="mt-3 text-sm leading-relaxed text-gray-600">{body}</p><span className="mt-5 inline-flex min-h-11 items-center gap-2 font-semibold text-eic-orange">Leggi la guida <ArrowRight size={16}/></span></Link>)}</div></div></section>
      <section className="bg-gray-50 px-5 py-16"><div className="mx-auto max-w-3xl"><h2 className="mb-8 text-3xl font-extrabold">Domande sul gestionale per imprese edili</h2>{impreseFaq.map(f=><details key={f.q} className="mb-3 rounded-xl border border-gray-200 bg-white p-5"><summary className="cursor-pointer font-bold leading-relaxed">{f.q}</summary><p className="mt-4 leading-relaxed text-gray-600">{f.a}</p></details>)}<p className="mt-8 text-sm leading-relaxed text-gray-600">Il software organizza i dati disponibili. Risultati economici, tempi di adozione e copertura dei processi dipendono dall’uso, dai dati inseriti e dai servizi abilitati. <Link to="/prezzi/" className="font-semibold text-eic-orange underline">Vedi piani e condizioni della prova.</Link></p></div></section>
    </main><LandingFooter />
  </div>;
}
