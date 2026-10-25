import { emptyQuoteTax, type QuoteTaxSettings, type quoteTaxTotals } from '@/lib/preventivi/quoteTax';
import { formatCurrency } from '@/lib/formatters';
export function QuoteTaxPanel({ settings = emptyQuoteTax(), total, rows, onChange, disabled, singleRate = false }: {
  settings?: QuoteTaxSettings; total: ReturnType<typeof quoteTaxTotals>; rows: Array<{ id: string; title: string; rate: number | null }>;
  onChange: (next: QuoteTaxSettings) => void; disabled?: boolean; singleRate?: boolean;
}) {
  const input = 'rounded-lg border border-blue-100 bg-white px-2 py-2 text-sm';
  const rowRate = (row: { id: string; rate: number | null }) => { const explicit = settings.lineRates.find(r => r.id === row.id); return (explicit ? explicit.rate : row.rate ?? settings.defaultRate) ?? ''; };
  return <section className="my-3 rounded-xl border border-blue-100 bg-white p-4 text-sm" aria-label="IVA e totale del preventivo">
    <strong>Prezzi e IVA</strong><p className="my-2 text-xs text-slate-500">I prezzi delle voci restano netti. IVA compresa/esclusa indica come leggere il budget; non stabilisce l’aliquota fiscale.</p>
    <fieldset disabled={disabled} className="flex flex-wrap items-end gap-3">
      <label className="grid gap-1 text-xs">Aliquota IVA predefinita %<input className={input} aria-label="Aliquota IVA predefinita" type="number" min="0" max="100" step="0.01" placeholder="Da confermare" value={settings.defaultRate ?? ''} onChange={e => { const n = e.target.value === '' ? null : Number(e.target.value); if (n === null || Number.isFinite(n) && n >= 0 && n <= 100) onChange({ ...settings, defaultRate: n }); }} /></label>
      <label className="grid gap-1 text-xs">Mostra importi<select className={input} aria-label="Presentazione importi IVA" value={settings.display} onChange={e => onChange({ ...settings, display: e.target.value as 'net' | 'gross' })}><option value="net">Netto + IVA</option><option value="gross">Totale IVA compresa</option></select></label>
      {!singleRate && !!rows.length && <details className="w-full"><summary className="cursor-pointer text-blue-800">Aliquote per voce · IVA mista</summary><p className="my-2 text-xs text-slate-500">La scelta predefinita vale solo sulle righe senza aliquota. Non calcolo automaticamente agevolazioni, beni significativi o regimi speciali.</p><div className="mt-2 grid gap-2">{rows.map(row => <label className="flex items-center justify-between gap-3 text-xs" key={row.id}><span>{row.title}</span><input className={`${input} w-24`} aria-label={`IVA voce ${row.id}`} type="number" min="0" max="100" step="0.01" value={rowRate(row)} placeholder="Da definire" onChange={e => { const rate = e.target.value === '' ? null : Number(e.target.value); if (rate === null || Number.isFinite(rate) && rate >= 0 && rate <= 100) onChange({ ...settings, lineRates: [...settings.lineRates.filter(r => r.id !== row.id), { id: row.id, rate }] }); }} /></label>)}</div></details>}
      {singleRate && <p className="w-full text-xs text-slate-500">Il modulo Bagni usa l’aliquota unica del suo computo; non converto silenziosamente un’IVA mista in aliquota unica.</p>}
    </fieldset>
    <dl className="mt-3 flex flex-wrap gap-5"><div><dt>Imponibile netto</dt><dd className="font-semibold">{formatCurrency(total.net)}</dd></div><div><dt>IVA</dt><dd>{total.tax == null ? 'Da definire' : formatCurrency(total.tax)}</dd></div><div><dt>Totale IVA compresa</dt><dd className="font-semibold">{total.gross == null ? 'Non ancora calcolabile' : formatCurrency(total.gross)}</dd></div></dl>
    {total.pending.length > 0 && <p role="status" className="mt-2 text-xs text-orange-800">{total.pending.length} voci incluse senza aliquota: il netto non viene presentato come totale IVA compresa.</p>}
    <p className="mt-2 text-xs text-slate-500">Aliquote dichiarate dall’utente, requisiti fiscali da verificare. Nessuna aliquota scelta dall’AI. Lo 0% richiede di verificare anche il regime e gli altri dati fiscali prima dell’emissione.</p>
  </section>;
}
