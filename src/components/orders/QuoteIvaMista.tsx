import {useId} from "react";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Button} from "@/components/ui/button";
import {formatCurrency} from "@/lib/formatters";
import {formatDecimalIT} from "@/lib/parseDecimalIT";
import {calcolaQuoteIva, leggiImportoQuota, type QuoteIvaMista as Draft} from "@/lib/orders/ivaMista";

export function QuoteIvaMista({value, onChange, readOnly, error, onUseTotal}: {value: Draft; onChange: (value: Draft) => void; readOnly?: boolean; error?: string | null; onUseTotal?: () => void}) {
  const id = useId(); const summary = calcolaQuoteIva(value);
  return <section aria-label="Ripartizione IVA mista" className="rounded-xl border border-blue-200 bg-blue-50/30 p-3 sm:p-4 space-y-3 dark:border-blue-900 dark:bg-blue-950/20">
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold text-sm">Ripartizione IVA · 10% e 22%</p><span className="rounded-full border border-blue-200 bg-white px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-950 dark:text-blue-100">{value.mode === "net" ? "IVA esclusa" : "IVA inclusa"}</span></div><p className="text-xs text-muted-foreground">Indica quanto va al 10% e quanto al 22%. Il riepilogo si aggiorna mentre scrivi.</p>
    {!readOnly && <div className="grid items-end gap-3 sm:grid-cols-2">{([10,22] as const).map(rate => {
      const key = rate === 10 ? "amount10" : "amount22";
      return <div key={rate} className="space-y-1"><Label className="block text-sm leading-5" htmlFor={`${id}-${rate}`}>Quota al {rate}%</Label><Input aria-label={`Quota al ${rate}% · ${value.mode === "net" ? "IVA esclusa" : "IVA inclusa"}`} id={`${id}-${rate}`} inputMode="decimal" value={value[key]} onChange={event => onChange({...value,[key]:event.target.value})} onBlur={() => { const amount = leggiImportoQuota(value[key]); if (!amount.error) onChange({...value, [key]: formatDecimalIT(amount.value)}); }} placeholder="0,00" disabled={readOnly} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} className="h-11 text-base tabular-nums" /></div>;
    })}</div>}
    <div className="overflow-x-auto rounded-lg border border-blue-100 bg-white/70 px-2 dark:border-blue-900 dark:bg-slate-950/30"><table className="w-full text-xs tabular-nums"><caption className="sr-only">Calcolo delle due aliquote del contratto</caption><thead><tr className="text-muted-foreground"><th className="text-left font-medium">Aliquota</th><th className="text-right font-medium">Imponibile</th><th className="text-right font-medium">IVA</th><th className="text-right font-medium">Totale</th></tr></thead><tbody>{summary.rows.map(row=><tr key={row.rate}><th className="py-2 text-left font-medium">{row.rate}%</th><td className="text-right">{formatCurrency(row.net)}</td><td className="text-right">{formatCurrency(row.vat)}</td><td className="text-right">{formatCurrency(row.gross)}</td></tr>)}</tbody></table></div>
    {summary.rounding !== 0 && <p className="text-xs text-muted-foreground">Arrotondamento compreso nel totale: {formatCurrency(summary.rounding)}.</p>}
    {error && <p id={`${id}-error`} role="alert" className="text-sm text-destructive">{error}</p>}
    {!error && !summary.error && <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">✓ Ripartizione completa · totale {formatCurrency(summary.gross)} IVA inclusa</p>}
    {onUseTotal && error && !summary.error && <Button type="button" variant="outline" disabled={readOnly} onClick={onUseTotal} className="h-auto min-h-9 w-full whitespace-normal py-2 text-xs">Usa la somma delle quote come totale contratto ({formatCurrency(value.mode === "net" ? summary.net : summary.gross)})</Button>}
  </section>;
}
