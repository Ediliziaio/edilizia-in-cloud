import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, ClipboardList, HardHat, Clock, Package, Receipt, TrendingUp } from "lucide-react";

const steps = [
  {
    id: "preventivo", title: "Il preventivo", subtitle: "Definisci cosa vendi", icon: ClipboardList,
    heading: "Un’offerta chiara, pronta a diventare lavoro.",
    description: "Descrivi le lavorazioni e distingui i materiali da acquistare. Quantità, unità di misura e importi restano leggibili, senza trasformare ogni riga in un prodotto da ordinare.",
    points: ["Nome e descrizione della lavorazione", "Quantità, unità e importo della voce", "Materiali distinti dalle attività da eseguire"],
    example: "Preventivo accettato", value: "20.000 €", note: "Venduto netto della commessa: non è l’incassato.",
    href: "/funzionalita/preventivi-edilizia/", link: "Esplora i preventivi",
  },
  {
    id: "fasi", title: "Fasi e squadre", subtitle: "Organizza chi fa cosa", icon: HardHat,
    heading: "Dal lavoro venduto a un cantiere organizzato.",
    description: "Porta le lavorazioni nella commessa e organizza fasi e sottofasi. Pianifica date, assegna persone o squadre e indica i costi previsti, mantenendo separati i materiali.",
    points: ["Fasi e sottofasi con date", "Persone e squadre assegnate", "Venduto e budget della fase distinti"],
    example: "Pianificazione", value: "Fasi, date e responsabili", note: "La struttura dei lavori segue la commessa, senza un secondo elenco da ricopiare.",
    href: "/funzionalita/gestione-commesse/", link: "Esplora le commesse",
  },
  {
    id: "ore", title: "Ore e rapportini", subtitle: "Registra il lavoro svolto", icon: Clock,
    heading: "Il lavoro di ogni giorno trova il suo cantiere.",
    description: "Raccogli ore e rapportini sulla commessa corretta. L’ufficio verifica i dati del campo e legge il costo della manodopera, distinguendo le ore pianificate da quelle effettivamente registrate.",
    points: ["Ore giornaliere per persona e commessa", "Rapportini e informazioni dal campo", "Previsto e consuntivo separati"],
    example: "Manodopera registrata", value: "3.500 €", note: "Costo ipotetico nell’esempio, non una tariffa del software.",
    href: "/funzionalita/rapportini-cantiere/", link: "Esplora i rapportini",
  },
  {
    id: "materiali", title: "Materiali e bolle", subtitle: "Segui cosa arriva", icon: Package,
    heading: "Sai cosa serve, cosa hai comprato e cosa è arrivato.",
    description: "Tieni gli acquisti separati dalle lavorazioni. Collega materiali e bolle alla commessa: una consegna può essere registrata anche quando il prezzo definitivo non è ancora disponibile.",
    points: ["Articoli da acquistare distinti dai lavori", "DDT collegati alla commessa", "Prezzi mancanti riconoscibili, non trattati come zero"],
    example: "Consegna registrata", value: "DDT collegato", note: "Se manca il prezzo, il costo resta da completare: la bolla non dimostra un costo nullo.",
    href: "/funzionalita/magazzino-cantiere/", link: "Esplora materiali e magazzino",
  },
  {
    id: "fatture", title: "Fatture e costi", subtitle: "Collega i documenti", icon: Receipt,
    heading: "La fattura completa il costo, senza contarlo due volte.",
    description: "Collega le fatture fornitori ai documenti e alle commesse interessate. Verifica la ripartizione dei costi e distingui il costo registrato dal pagamento: una fattura e il suo DDT non sono due acquisti diversi.",
    points: ["Documenti del fornitore collegati", "Ripartizioni sulle commesse da verificare", "Costi, pagamenti e consegne distinti"],
    example: "Materiali fatturati e attribuiti", value: "2.500 €", note: "Nell’esempio completano il costo dei materiali; non si sommano una seconda volta alla stessa consegna.",
    href: "/funzionalita/fatturazione-elettronica/", link: "Esplora la fatturazione",
  },
  {
    id: "margine", title: "Margine e cassa", subtitle: "Decidi con i dati", icon: TrendingUp,
    heading: "Quanto resta a fine lavoro? E quando entrano i soldi?",
    description: "Leggi insieme venduto, costi già registrati e costi ancora previsti. Il margine atteso a fine lavoro e gli incassi rispondono a domande diverse: puoi controllare entrambi senza confonderli.",
    points: ["Costi reali e costi residui previsti", "Margine a finire basato sui dati disponibili", "Incassi e scadenze separati dall’utile"],
    example: "Margine previsto a fine lavoro", value: "5.500 € · 27,5%", note: "20.000 € venduti − 6.000 € di costi registrati − 8.500 € ancora previsti. Non è un risultato garantito.",
    href: "/funzionalita/margini-cantiere/", link: "Esplora il controllo dei margini",
  },
] as const;

export default function SolutionSection() {
  const [selected, setSelected] = useState(0);
  const step = steps[selected];
  const Icon = step.icon;

  return (
    <section id="come-funziona" aria-labelledby="commessa-flow-title" className="scroll-mt-20 bg-[#111111] px-5 py-16 text-white md:py-24">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto mb-10 max-w-3xl text-center">
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-eic-orange">Una commessa, dall’inizio alla fine</p>
          <h2 id="commessa-flow-title" className="text-3xl font-extrabold leading-tight tracking-tight md:text-5xl">Dal preventivo <span className="text-eic-orange">al margine del cantiere.</span></h2>
          <p className="mt-5 text-base leading-relaxed text-white/65 md:text-lg">Il lavoro passa dall’ufficio al cantiere. I dati restano collegati: sai cosa è stato venduto, chi lo esegue e quali costi sono già arrivati.</p>
        </div>

        <div className="grid gap-5 lg:grid-cols-[0.85fr_1.45fr] lg:gap-8">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-1" role="group" aria-label="Esplora i passaggi della commessa">
            {steps.map((item, index) => {
              const StepIcon = item.icon;
              const active = selected === index;
              return (
                <button key={item.id} id={`flow-button-${item.id}`} type="button" aria-pressed={active} aria-controls="commessa-flow-detail" onClick={() => setSelected(index)}
                  className={`flex min-h-20 items-center gap-3 rounded-2xl border p-3 text-left outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-eic-orange focus-visible:ring-offset-2 focus-visible:ring-offset-[#111111] motion-reduce:transition-none lg:min-h-16 lg:px-4 ${active ? "border-eic-orange/60 bg-eic-orange/10" : "border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.06]"}`}>
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${active ? "bg-eic-orange text-[#111111]" : "bg-white/5 text-white/55"}`}><StepIcon size={18} aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1"><span className={`block text-sm font-bold ${active ? "text-white" : "text-white/80"}`}><span className="mr-1.5 text-white/40">0{index + 1}</span>{" "}{item.title}</span><span className="mt-0.5 hidden text-xs text-white/50 sm:block">{item.subtitle}</span></span>
                  <ArrowRight size={16} className={`hidden shrink-0 sm:block ${active ? "text-eic-orange" : "text-white/20"}`} aria-hidden="true" />
                </button>
              );
            })}
          </div>

          <div id="commessa-flow-detail" role="region" aria-labelledby={`flow-button-${step.id}`} className="flex flex-col rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.07] to-white/[0.02] p-6 sm:p-8 lg:min-h-[490px]">
            <div aria-live="polite" aria-atomic="true">
              <div className="mb-5 flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-eic-orange/15 text-eic-orange"><Icon size={23} aria-hidden="true" /></span><p className="text-xs font-semibold uppercase tracking-widest text-white/50">Passaggio {selected + 1} di 6</p></div>
              <h3 className="max-w-xl text-2xl font-bold leading-tight tracking-tight sm:text-3xl">{step.heading}</h3>
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/65 sm:text-base">{step.description}</p>
              <ul className="my-6 space-y-3">{step.points.map(point => <li key={point} className="flex items-start gap-2.5 text-sm text-white/85"><Check size={16} className="mt-0.5 shrink-0 text-eic-orange" aria-hidden="true" />{point}</li>)}</ul>
              <div className="rounded-2xl border border-eic-orange/25 bg-eic-orange/[0.06] p-4"><p className="text-[10px] font-bold uppercase tracking-widest text-eic-orange">Esempio illustrativo · {step.example}</p><p className="mt-2 text-xl font-bold sm:text-2xl">{step.value}</p><p className="mt-2 text-xs leading-relaxed text-white/55">{step.note}</p></div>
            </div>
            <Link to={step.href} className="mt-6 inline-flex min-h-11 items-center gap-2 self-start rounded-lg text-sm font-bold text-eic-orange outline-none hover:text-orange-300 focus-visible:ring-2 focus-visible:ring-eic-orange">{step.link}<ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold">La stessa commessa, un unico conto.</p><p className="text-[11px] text-white/45">Dati ipotetici · importi al netto dell’IVA</p></div>
          <dl className="grid grid-cols-2 gap-6 lg:grid-cols-4">
            {[
              {label: "Venduto", value: "20.000 €", note: "Importo accettato dal cliente"},
              {label: "Costi registrati", value: "6.000 €", note: "3.500 € manodopera + 2.500 € materiali"},
              {label: "Costi ancora previsti", value: "8.500 €", note: "Budget residuo, da aggiornare"},
              {label: "Margine previsto a finire", value: "5.500 €", note: "27,5% del venduto, sulla base dell’esempio"},
            ].map(item => <div key={item.label}><dt className="text-xs text-white/55">{item.label}</dt><dd className="mt-2 text-2xl font-bold tabular-nums text-white">{item.value}</dd><dd className="mt-1 text-[11px] leading-relaxed text-white/45">{item.note}</dd></div>)}
          </dl>
          <p className="mt-5 border-t border-white/10 pt-4 text-xs leading-relaxed text-white/50">Il margine previsto non è denaro disponibile in banca. Costi mancanti o stime da completare vanno verificati prima di decidere.</p>
        </div>
        <div className="mt-8 flex flex-col items-center gap-3 text-center sm:flex-row sm:justify-center sm:gap-5"><Link to="/demo/" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-eic-orange px-7 py-3 text-sm font-bold text-[#111111] outline-none transition-colors hover:bg-orange-300 focus-visible:ring-2 focus-visible:ring-white motion-reduce:transition-none">Guarda il flusso in una demo<ArrowRight size={17} aria-hidden="true" /></Link><p className="max-w-sm text-xs leading-relaxed text-white/50">Valutiamo i tuoi processi e le funzioni del piano adatto alla tua impresa.</p></div>
      </div>
    </section>
  );
}
