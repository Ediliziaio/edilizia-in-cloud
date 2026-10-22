import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, FileText, Users } from "lucide-react";
import { warehouseScenarios, warehouseExample, warehouseExampleCost } from "@/lib/marketing/warehouseFlow";

const money = (cents: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: true, maximumFractionDigits: 0 }).format(cents / 100);

export default function WarehouseFlow() {
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const scenario = warehouseScenarios[scenarioIndex];
  const step = scenario.steps[stepIndex];
  const cost = warehouseExampleCost(stepIndex);
  const internal = scenario.id === "magazzino";
  return (
    <section id="flusso-materiali" aria-labelledby="warehouse-flow-title" className="scroll-mt-24 bg-[#111111] px-5 py-16 text-white md:py-20">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 max-w-3xl"><p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-eic-orange">Segui un caso concreto</p><h2 id="warehouse-flow-title" className="text-3xl font-extrabold tracking-tight md:text-4xl">Da dove arriva il materiale?</h2><p className="mt-4 leading-relaxed text-white/60">Tre percorsi diversi, la stessa domanda: a quale commessa appartiene e quale costo è già verificato?</p></div>
        <div role="group" aria-label="Scegli la provenienza del materiale" className="grid gap-3 md:grid-cols-3">
          {warehouseScenarios.map((item, index) => <button key={item.id} type="button" aria-pressed={scenarioIndex === index} aria-controls="warehouse-example" onClick={() => { setScenarioIndex(index); setStepIndex(0); }} className={`rounded-2xl border p-5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-eic-orange motion-reduce:transition-none ${scenarioIndex === index ? "border-eic-orange/60 bg-eic-orange/10" : "border-white/10 bg-white/[0.03] hover:border-white/30"}`}><span className="block text-sm font-bold">{item.name}</span><span className="mt-2 block text-xs leading-relaxed text-white/55">{item.description}</span></button>)}
        </div>
        <div id="warehouse-example" className="mt-6 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-5 py-4 sm:px-7"><p className="text-xs font-semibold uppercase tracking-wider text-white/70">Schema dimostrativo · {scenario.name}</p><span className="text-xs text-white/45">Dati ipotetici · nessuna registrazione reale</span></div>
          <div className="grid lg:grid-cols-[0.85fr_1.4fr]">
            <div role="group" aria-label="Passaggi del percorso" className="grid grid-cols-2 gap-2 border-b border-white/10 p-4 lg:grid-cols-1 lg:border-b-0 lg:border-r lg:p-6">
              {scenario.steps.map((item, index) => <button key={item.title} id={`warehouse-step-${index}`} type="button" aria-controls="warehouse-stage" aria-pressed={stepIndex === index} onClick={() => setStepIndex(index)} className={`flex min-h-14 items-center gap-3 rounded-xl border p-3 text-left text-sm last:col-span-2 lg:last:col-span-1 outline-none focus-visible:ring-2 focus-visible:ring-eic-orange ${stepIndex === index ? "border-eic-orange/40 bg-eic-orange/10 text-white" : "border-transparent text-white/55 hover:bg-white/5"}`}><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${stepIndex === index ? "bg-eic-orange text-[#111111]" : "bg-white/5"}`}>{index + 1}</span><span>{item.title}</span></button>)}
            </div>
            <div id="warehouse-stage" role="region" aria-labelledby={`warehouse-step-${stepIndex}`} className="flex min-h-[430px] flex-col p-5 sm:p-7">
              <div aria-live="polite" aria-atomic="true"><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-white/45">Passaggio {stepIndex + 1} di 5</p><span className="rounded-full border border-eic-orange/25 bg-eic-orange/10 px-3 py-1.5 text-xs font-semibold text-orange-200">{step.status}</span></div><h3 className="text-2xl font-bold sm:text-3xl">{step.title}</h3><p className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-white/50"><Users size={15} aria-hidden="true" />Chi se ne occupa: {step.owner}</p><p className="mt-4 text-sm leading-relaxed text-white/75">{step.detail}</p><div className="mt-5 rounded-2xl border border-white/10 bg-[#111111]/60 p-4"><p className="flex items-center gap-2 text-xs text-white/45"><FileText size={14} aria-hidden="true" />Riferimento nell’esempio</p><p className="mt-2 text-sm font-semibold">{step.document}</p><p className="mt-3 text-xs leading-relaxed text-white/55">{step.note}</p></div></div>
              <div className="mt-auto flex items-center justify-between gap-3 pt-6"><button type="button" disabled={stepIndex === 0} onClick={() => setStepIndex(i => i - 1)} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm text-white/65 outline-none focus-visible:ring-2 focus-visible:ring-eic-orange disabled:opacity-25"><ArrowLeft size={16} aria-hidden="true" />Indietro</button><button type="button" disabled={stepIndex === 4} onClick={() => setStepIndex(i => i + 1)} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-eic-orange px-5 py-2 text-sm font-bold text-[#111111] outline-none hover:bg-orange-300 focus-visible:ring-2 focus-visible:ring-white disabled:bg-white/10 disabled:text-white/35">Avanti<ArrowRight size={16} aria-hidden="true" /></button></div>
            </div>
          </div>
          <div className="border-t border-white/10 bg-eic-orange/[0.04] p-5 sm:p-7"><p className="mb-4 text-xs font-bold uppercase tracking-widest text-white/50">Il conto della stessa fornitura · importi netti IVA</p><dl className="grid grid-cols-2 gap-5 md:grid-cols-4"><div><dt className="text-xs text-white/50">Quantità Roma</dt><dd className="mt-2 text-xl font-bold">100 sacchi</dd></div><div><dt className="text-xs text-white/50">Costo Roma nell’esempio</dt><dd className="mt-2 text-xl font-bold text-orange-200">{cost == null ? "Da completare" : money(cost)}</dd></div><div><dt className="text-xs text-white/50">{internal ? "Nuova fattura" : "Altra commessa · Milano"}</dt><dd className="mt-2 text-xl font-bold">{internal ? "Non prevista" : cost == null ? "Da verificare" : money(warehouseExample.otherSiteCents)}</dd></div><div><dt className="text-xs text-white/50">{internal ? "Costo del prelievo" : "Totale fattura verificata"}</dt><dd className="mt-2 text-xl font-bold">{cost == null ? "Da completare" : money(internal ? cost : warehouseExample.invoiceCents)}</dd></div></dl><p className="mt-5 flex items-start gap-2 text-xs leading-relaxed text-white/55"><Check size={15} className="shrink-0 text-eic-orange" aria-hidden="true" />{cost == null ? "Un prezzo mancante non significa materiale gratuito. La consegna resta distinta dal costo da verificare." : internal ? "Il prelievo attribuisce materiale già posseduto: non simuliamo un secondo acquisto o un nuovo pagamento." : "1.200 € + 2.400 € = 3.600 €. Ordine, bolla e fattura documentano la stessa fornitura: il costo non si moltiplica."}</p></div>
        </div>
        <p className="mt-4 max-w-3xl text-xs leading-relaxed text-white/40">Questa è una spiegazione interattiva del flusso, non la schermata del gestionale. Le etichette riassumono situazioni operative; collegamenti, prezzi e ripartizioni richiedono verifica dell’ufficio.</p>
      </div>
    </section>
  );
}
