import { formatCurrency } from '@/lib/formatters';

export function ExpensePaymentSummary({ totale, pagato, residuo }: { totale: number; pagato: number; residuo: number }) {
  return <dl aria-label="Situazione dei pagamenti" className="commessa-payment-summary grid grid-cols-3 gap-2">
    {([['Dovuto', totale], ['Pagato', pagato], ['Residuo', residuo]] as const).map(([label, value]) =>
      <div key={label} data-pagamento={label} className="min-w-0 rounded-lg border p-3">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="mt-1 break-words font-semibold tabular-nums">{formatCurrency(value)}</dd>
      </div>)}
  </dl>;
}
