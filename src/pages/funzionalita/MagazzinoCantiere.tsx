import { Link } from "react-router-dom";
import { ArrowRight, Check, HardHat, BriefcaseBusiness, PackageCheck, Receipt, AlertCircle } from "lucide-react";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";
import WarehouseFlow from "@/components/landing/WarehouseFlow";
import { JsonLd } from "@/components/seo/JsonLd";
import { useSEO } from "@/hooks/useSEO";
import { marketingMessages } from "@/lib/marketing/messages";

const questions = [
  { question: "La bolla non ha il prezzo: cosa registro?", answer: "Registra fornitore, numero e data del documento, materiali, quantità, unità e commessa. Se il prezzo non è disponibile, resta da completare. L’ufficio verifica la fattura quando arriva: il dato mancante non dimostra un costo di zero euro." },
  { question: "Arrivano solo 60 dei 100 sacchi ordinati?", answer: "Tieni distinta la quantità ordinata da quella effettivamente ricevuta: nell’esempio sono 100 ordinati, 60 arrivati e 40 ancora da ricevere. Collega la bolla della consegna e verifica la parte mancante. La presenza di una consegna parziale non dimostra che tutto l’ordine sia arrivato." },
  { question: "Una fattura contiene bolle di più cantieri?", answer: "L’ufficio controlla fornitore, riferimenti delle bolle e righe della fattura, poi verifica i collegamenti e le quote delle commesse. Nell’esempio 1.200 € di Roma e 2.400 € di Milano compongono una fattura netta da 3.600 €. Non promettiamo un abbinamento automatico senza controllo." },
  { question: "L’operaio ha già pagato il materiale?", answer: "L’acquisto al banco distingue pagato da me, conto azienda e ritiro di un ordine già fatto. Il documento e la modalità vanno verificati dall’ufficio. Il rimborso al dipendente, il debito al fornitore e il costo della commessa non sono la stessa informazione." },
  { question: "Come gestisco un reso o una nota di credito?", answer: "Il materiale restituito e l’eventuale nota di credito vanno collegati e verificati: quantità restituite, costo e movimento di denaro non cambiano necessariamente nello stesso momento. Il caso di reso va verificato in demo sul tuo flusso: questa anteprima non simula uno storno automatico." },
  { question: "Le cifre e gli stati dell’esempio sono dati veri?", answer: "No. È una spiegazione interattiva con dati ipotetici, non una schermata operativa del gestionale. Le etichette riassumono controlli diversi: ordine, consegna, prezzo e attribuzione del costo. Nulla viene caricato o salvato nell’azienda." },
];

export default function MagazzinoCantiere() {
  useSEO({
    title: "Magazzino cantiere, DDT e fatture fornitori",
    description: "Collega materiali, ordini, bolle e fatture alle commesse. Segui consegne, prezzi da completare e costi attribuiti, con verifica dell’ufficio.",
    canonical: "/funzionalita/magazzino-cantiere/",
    keywords: "magazzino cantiere, materiali commessa, bolle DDT cantiere, fatture fornitori commesse, acquisti operai, costo materiali",
  });
  return (
    <div className="min-h-screen bg-white text-[#111111]">
      <LandingNavbar />
      <JsonLd id="jsonld-warehouse-page" data={{"@context":"https://schema.org","@type":"WebPage","@id":"https://www.ediliziaincloud.com/funzionalita/magazzino-cantiere/#webpage",name:"Magazzino cantiere, bolle e costi delle commesse",url:"https://www.ediliziaincloud.com/funzionalita/magazzino-cantiere/",description:"Materiali, ordini, consegne e fatture collegati alle commesse, con verifica dell’ufficio.",isPartOf:{"@id":"https://www.ediliziaincloud.com/#website"}}} />
      <JsonLd id="jsonld-warehouse-breadcrumb" data={{"@context":"https://schema.org","@type":"BreadcrumbList",itemListElement:[{"@type":"ListItem",position:1,name:"Home",item:"https://www.ediliziaincloud.com/"},{"@type":"ListItem",position:2,name:"Funzionalità",item:"https://www.ediliziaincloud.com/funzionalita/"},{"@type":"ListItem",position:3,name:"Magazzino cantiere",item:"https://www.ediliziaincloud.com/funzionalita/magazzino-cantiere/"}]}} />
      <main>
        <section className="bg-[#f8f8f7] px-5 pb-14 pt-28 md:pb-20 md:pt-36">
          <div className="mx-auto max-w-6xl">
            <nav aria-label="Percorso" className="mb-8 flex flex-wrap items-center gap-2 text-xs text-black/45"><Link to="/funzionalita/" className="rounded outline-none hover:text-eic-orange focus-visible:ring-2 focus-visible:ring-eic-orange">Funzionalità</Link><span aria-hidden="true">/</span><span>Magazzino cantiere</span></nav>
            <div className="grid items-start gap-9 lg:grid-cols-[1.4fr_0.8fr]">
              <div><p className="mb-4 text-xs font-bold uppercase tracking-[0.17em] text-eic-orange-deep">Materiali, acquisti e commesse</p><h1 className="max-w-3xl text-4xl font-extrabold leading-[1.08] tracking-tight md:text-6xl">Sai cosa è arrivato.<br /><span className="text-eic-orange-deep">E quanto costa al cantiere.</span></h1><p className="mt-6 max-w-2xl text-base leading-relaxed text-black/60 md:text-lg">Dal prelievo in magazzino alla bolla fotografata dall’operaio, fino alla fattura del fornitore: documenti e materiali trovano la commessa corretta. L’ufficio verifica prezzi e collegamenti.</p><div className="mt-7 flex flex-wrap items-center gap-3"><a href="#flusso-materiali" className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[#111111] px-6 py-3 text-sm font-bold text-white outline-none hover:bg-black/80 focus-visible:ring-2 focus-visible:ring-eic-orange">Segui un esempio<ArrowRight size={16} aria-hidden="true" /></a><Link to="/demo/" className="inline-flex min-h-12 items-center rounded-full border border-black/15 px-6 py-3 text-sm font-semibold outline-none hover:border-eic-orange focus-visible:ring-2 focus-visible:ring-eic-orange">Valuta il tuo caso in demo</Link></div><p className="mt-5 text-xs text-black/45">{marketingMessages.companies} · {marketingMessages.activation}</p></div>
              <aside aria-label="I controlli da tenere distinti" className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm"><PackageCheck className="mb-5 text-eic-orange-deep" size={28} aria-hidden="true" /><h2 className="text-lg font-bold">Una bolla non è una fattura.</h2><p className="mt-3 text-sm leading-relaxed text-black/55">Un ordine dice cosa hai richiesto. La consegna dice cosa è arrivato. La fattura documenta l’importo da verificare. Il pagamento dice quando sono usciti i soldi.</p><ul className="mt-5 space-y-3 text-sm">{["Quantità ordinate e ricevute separate", "Prezzo mancante riconoscibile", "Costo della fornitura contato una volta"].map(text=><li key={text} className="flex items-start gap-2"><Check size={16} className="mt-0.5 shrink-0 text-eic-orange-deep" aria-hidden="true" />{text}</li>)}</ul></aside>
            </div>
          </div>
        </section>

        <WarehouseFlow />

        <section aria-labelledby="warehouse-roles" className="px-5 py-16 md:py-20"><div className="mx-auto max-w-6xl"><p className="mb-3 text-xs font-bold uppercase tracking-widest text-eic-orange-deep">Un compito chiaro per ciascuno</p><h2 id="warehouse-roles" className="text-3xl font-extrabold tracking-tight md:text-4xl">In cantiere raccogli. In ufficio verifichi.</h2><div className="mt-8 grid gap-4 md:grid-cols-2">{[
          {icon:HardHat,title:"Operaio e capocantiere",description:"Scelgono la commessa, caricano il documento e controllano cosa è arrivato.",items:["Foto della bolla o del documento d’acquisto", "Materiali, quantità e unità da controllare", "Modalità d’acquisto: pagato da me, conto azienda o ritiro"]},
          {icon:BriefcaseBusiness,title:"Ufficio",description:"Verifica i dati del campo e completa il collegamento ai costi della commessa.",items:["Fornitore, numero documento e riferimenti", "Prezzi, fatture e quote delle commesse", "Eventuali rimborsi, differenze o documenti mancanti"]},
        ].map(role=><article key={role.title} className="rounded-3xl border border-black/10 bg-[#f8f8f7] p-6 sm:p-7"><role.icon size={26} className="text-eic-orange-deep" aria-hidden="true" /><h3 className="mt-4 text-xl font-bold">{role.title}</h3><p className="mt-3 text-sm leading-relaxed text-black/55">{role.description}</p><ul className="mt-5 space-y-3">{role.items.map(item=><li key={item} className="flex items-start gap-2 text-sm"><Check size={15} className="mt-0.5 shrink-0 text-eic-orange-deep" aria-hidden="true" />{item}</li>)}</ul></article>)}</div><p className="mt-4 text-xs leading-relaxed text-black/45">Le operazioni disponibili dipendono dal ruolo e dalle funzioni del piano. L’esempio non concede accessi o modifica i permessi.</p></div></section>

        <section aria-labelledby="warehouse-status" className="border-y border-black/5 bg-[#f8f8f7] px-5 py-14"><div className="mx-auto max-w-6xl"><h2 id="warehouse-status" className="text-2xl font-extrabold md:text-3xl">Consegnato non significa già fatturato.</h2><p className="mt-3 max-w-2xl text-sm leading-relaxed text-black/55">Controlla separatamente ordine, consegna e costo. Queste situazioni possono coesistere sulla stessa fornitura.</p><div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[
          ["Ordine", "Confermato", "Il fornitore ha confermato l’ordine; verifica cosa è effettivamente arrivato."],
          ["Consegna", "Arrivata in parte", "Una parte resta da ricevere: confronta quantità e documenti."],
          ["Prezzo", "Da completare", "La bolla non basta a conoscere l’importo definitivo."],
          ["Costo", "Da verificare", "L’ufficio controlla fattura, collegamenti e attribuzione alla commessa."],
        ].map(([label,status,note])=><article key={label} className="rounded-2xl border border-black/10 bg-white p-5"><p className="text-xs font-semibold uppercase tracking-wider text-black/40">{label}</p><h3 className="mt-2 text-base font-bold">{status}</h3><p className="mt-3 text-xs leading-relaxed text-black/55">{note}</p></article>)}</div></div></section>

        <section aria-labelledby="warehouse-exceptions" className="px-5 py-16 md:py-20"><div className="mx-auto max-w-3xl"><p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-eic-orange-deep"><AlertCircle size={16} aria-hidden="true" />Anche quando non va tutto in ordine</p><h2 id="warehouse-exceptions" className="text-3xl font-extrabold tracking-tight">I casi da controllare, senza scorciatoie.</h2><div className="mt-7 divide-y divide-black/10">{questions.map(item=><details key={item.question} className="group py-5"><summary className="cursor-pointer rounded text-base font-semibold outline-none focus-visible:ring-2 focus-visible:ring-eic-orange">{item.question}</summary><p className="mt-4 text-sm leading-relaxed text-black/60">{item.answer}</p></details>)}</div></div></section>

        <section className="bg-[#111111] px-5 py-14 text-white"><div className="mx-auto max-w-4xl text-center"><Receipt size={30} className="mx-auto mb-5 text-eic-orange" aria-hidden="true" /><h2 className="text-3xl font-extrabold">Porta in demo una bolla e una fattura.</h2><p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-white/60">Verifichiamo sul tuo caso consegna, costo e commessa. {marketingMessages.activationDetail}</p><Link to="/demo/" className="mt-7 inline-flex min-h-12 items-center gap-2 rounded-full bg-eic-orange px-7 py-3 text-sm font-bold text-[#111111] outline-none hover:bg-orange-300 focus-visible:ring-2 focus-visible:ring-white">Richiedi una demo del flusso<ArrowRight size={16} aria-hidden="true" /></Link><div className="mt-7 flex flex-wrap justify-center gap-x-6 gap-y-3 text-xs text-white/50"><Link to="/funzionalita/ordini-acquisto/" className="underline underline-offset-4">Ordini di acquisto</Link><Link to="/funzionalita/ddt-digitali/" className="underline underline-offset-4">Bolle e DDT</Link><Link to="/funzionalita/margini-cantiere/" className="underline underline-offset-4">Margini di cantiere</Link></div></div></section>
      </main>
      <LandingFooter />
      <JsonLd id="jsonld-warehouse-faq" data={{"@context":"https://schema.org","@type":"FAQPage",mainEntity:questions.map(item=>({"@type":"Question",name:item.question,acceptedAnswer:{"@type":"Answer",text:item.answer}}))}} />
    </div>
  );
}
