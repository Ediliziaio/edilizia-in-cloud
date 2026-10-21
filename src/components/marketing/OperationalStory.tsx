import { ArrowDown } from "lucide-react";
import type { MarketingVisualTheme } from "@/lib/marketing/visuals";

const stories: Record<MarketingVisualTheme, { kicker: string; title: string; steps: string[]; closing: string }> = {
  operations: { kicker: "Organizzare il lavoro", title: "Ogni attività deve trovare il suo posto.", steps: ["La lavorazione descrive il lavoro da eseguire.", "La fase organizza date e persone.", "Il materiale identifica ciò che serve acquistare."], closing: "Una commessa leggibile parte da distinzioni chiare." },
  finance: { kicker: "Costi e margini", title: "Hai fatturato. Quanto ti resta?", steps: ["Il venduto è il valore del lavoro acquisito.", "Il costo previsto è il budget di partenza.", "Il costo reale nasce dalle registrazioni effettive."], closing: "Leggi separatamente ricavi, costi e pagamenti." },
  people: { kicker: "Ore e squadre", title: "Le ore si segnano il giorno stesso.", steps: ["Registra la persona e la giornata.", "Attribuisci le ore al cantiere e alla fase.", "Leggi il costo nel contesto della commessa."], closing: "Meno ricostruzioni a memoria a fine settimana." },
  sales: { kicker: "Clienti e vendita", title: "«Ti richiamo». Il cliente aspetta.", steps: ["Raccogli richiesta e informazioni del cliente.", "Definisci la prossima attività e chi la segue.", "Prepara il preventivo con il contesto del lavoro."], closing: "Un prossimo passo chiaro tiene in movimento la trattativa." },
  automation: { kicker: "AI e automazioni", title: "L’AI propone. Tu decidi.", steps: ["Parti da una richiesta o da un documento.", "Controlla i dati e la proposta elaborata.", "Completa l’attività con le informazioni corrette."], closing: "La velocità è utile quando resta comprensibile il risultato." },
  documents: { kicker: "Documenti e commesse", title: "Il documento deve ritrovare il suo cantiere.", steps: ["Identifica documento, data e fornitore.", "Collega le voci al lavoro corretto.", "Distingui quantità, importi presenti e dati mancanti."], closing: "Conservare un documento è il primo passo. Attribuirlo lo rende utile." },
};

/** Editorial explainer: no fictitious product dashboard, customer or performance result. */
export default function OperationalStory({ theme }: { theme: MarketingVisualTheme }) {
  const story = stories[theme];
  return <aside className="rounded-3xl overflow-hidden bg-[#102c46] text-white border border-white/10">
    <div className="p-6 sm:p-8"><p className="text-[11px] uppercase tracking-[0.16em] font-bold text-orange-300">{story.kicker}</p><h3 className="mt-4 text-2xl sm:text-3xl font-bold tracking-tight leading-tight">{story.title}</h3>
      <ol className="mt-6 space-y-3">{story.steps.map((step,index) => <li key={step}><div className="flex gap-3 items-start"><span className="shrink-0 text-orange-300 font-semibold text-sm">0{index+1}</span><p className="text-sm leading-relaxed text-white/85">{step}</p></div>{index<story.steps.length-1&&<ArrowDown size={14} aria-hidden="true" className="ml-1 mt-3 text-white/30" />}</li>)}</ol>
    </div><p className="px-6 py-4 sm:px-8 border-t border-white/10 text-sm leading-relaxed bg-white/5 text-white/75">{story.closing}</p>
  </aside>;
}
