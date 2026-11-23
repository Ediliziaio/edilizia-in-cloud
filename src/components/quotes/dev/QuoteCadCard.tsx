import type { QuoteCadState } from '@/lib/preventivi/quoteCad';
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";
export function QuoteCadCard({ cad, disabled, onAction }: { cad: QuoteCadState; disabled: boolean; onAction: (text: string) => void }) {
  const tr = useT();
  const r = cad.reading;
  return <section className="mx-4 my-3 rounded-xl border border-blue-100 bg-blue-50/40 p-4 text-sm" aria-label={tr("Disegno DWG del progetto")}>
    <div className="flex items-center justify-between gap-3"><strong className="truncate text-blue-950">{r.name}</strong><span className="shrink-0 rounded-full bg-orange-50 px-2 py-1 text-xs text-orange-800">{tr("Misure da verificare")}</span></div>
    <details className="mt-2"><summary className="cursor-pointer text-blue-800">{tr("Cosa contiene il disegno")}</summary>
      <p className="my-2 text-slate-600">{r.processedBy === 'service' ? tr("Testi e layer letti sul convertitore server dedicato. L’originale non viene inviato all’AI; ai turni successivi uso solo un estratto.") : tr("Testi e layer letti sul computer. L’originale non viene inviato all’AI; ai turni successivi uso solo un estratto.")}</p>
      <p className="my-2">{tr("{entita} entità grafiche · {testi} testi · {layer} layer riportati. Non sono quantità da fatturare.", { entita: r.entities.toLocaleString(intlCampo()), testi: r.totalTexts, layer: r.layers.length })}</p>
      {r.pdfImported && <p>{tr("Grafica probabilmente importata da PDF: unità e scala richiedono calibrazione.")}</p>}
      {r.mixedStates && <p>{tr("Presenti stato di fatto e di progetto: scegliere lo stato non separa automaticamente le geometrie.")}</p>}
      {!!r.externalReferences && <p>{tr("Riferimenti esterni non caricati: {riferimenti}. Il disegno può essere incompleto.", { riferimenti: r.externalReferences })}</p>}
      {(r.partial || r.omittedTexts > 0) && <p>{tr("Estratto parziale: {n} testi non riportati; non è un rilievo completo.", { n: r.omittedTexts })}</p>}
      <ul className="mt-2 max-h-40 list-disc overflow-auto pl-5">{r.texts.slice(0, 18).map((t, i) => <li key={`${t.handle}:${i}`}>{t.text} <small className="text-slate-500">H{t.handle}</small></li>)}</ul>
    </details>
    <p className="mb-2 mt-3 font-medium">{cad.selectedState === 'unknown' ? tr("Da quale stato partiamo?") : tr("Stato di riferimento · porzione e misure da verificare")}</p>
    <div className="flex flex-wrap gap-2">{[['Usa stato di fatto del DWG', 'Stato attuale'], ['Usa stato di progetto del DWG', 'Progetto']].map(([action, label]) => { const selected = cad.selectedState === (label === 'Progetto' ? 'project' : 'existing'); return <button type="button" className={`rounded-full border px-3 py-2 disabled:opacity-50 ${selected ? 'border-blue-700 bg-blue-700 text-white' : 'border-blue-200 bg-white text-blue-900'}`} key={action} disabled={disabled} aria-pressed={selected} onClick={() => onAction(action)}>{tr(label)}</button>; })}
      <button type="button" disabled={disabled} className="rounded-full border border-orange-200 bg-orange-50 px-3 py-2 text-orange-900 disabled:opacity-50" onClick={() => onAction('Analizza gli interventi leggibili nel DWG, distingui annotazioni e ipotesi, poi guidami con le domande necessarie senza inventare quantità o prezzi.')}>{tr("Guidami negli interventi")}</button>
    </div>
  </section>;
}
