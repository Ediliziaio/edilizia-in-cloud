import { useRecordedCashFlow } from '@/hooks/controlloGestione/useRecordedCashFlow';
import { ErrorBlock } from '@/components/controllo-gestione/ui/ErrorBlock';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/lib/formatters';

const months = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
export function RecordedCashFlow({ anno }: { anno: number }) {
  const query = useRecordedCashFlow(anno);
  if (query.isLoading) return <Skeleton className="h-64 w-full" />;
  if (query.isError) return <ErrorBlock onRetry={() => query.refetch()} />;
  if (!query.data) return null;
  const data = query.data;
  return <div className="space-y-4">
    <div className="flex items-center justify-between gap-2">
      <p className="text-sm text-muted-foreground">Movimenti registrati nel {anno} · {data.count} registrazioni</p>
      <Button size="sm" variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>Aggiorna</Button>
    </div>
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
      {[
        ['Entrate registrate', data.income, 'text-blue-800'],
        ['Uscite registrate', data.expense, 'text-orange-700'],
        ['Flusso netto', data.net, data.net < 0 ? 'text-red-700' : 'text-green-700'],
      ].map(([label, value, tone]) => <div key={String(label)} className="flex items-center justify-between gap-3 rounded-xl border bg-white p-3 sm:block">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`whitespace-nowrap text-base font-semibold tabular-nums sm:mt-1 ${tone}`}>{formatCurrency(Number(value))}</p>
      </div>)}
    </div>
    <p className="rounded-lg border bg-blue-50/50 p-3 text-xs text-slate-600">
      <span className="sm:hidden">Movimenti di prima nota. Il flusso netto non è il saldo bancario.</span>
      <span className="max-sm:hidden">Prima nota alla data del pagamento. Non sommo copie bancarie, fatture o cedolini agli stessi movimenti. Il flusso netto non è il saldo bancario: un saldo storico richiede un saldo iniziale verificato.</span>
    </p>
    {data.invalid > 0 && <p role="alert" className="text-sm text-amber-700">{data.invalid} movimenti con importo o data da verificare, esclusi dai totali.</p>}
    {data.count === 0 ? <p className="rounded-xl border p-4 text-sm text-muted-foreground">Nessun movimento registrato per questo anno. I costi stimati non diventano pagamenti automaticamente.</p>
      : <>
        <div className="divide-y rounded-xl border bg-white sm:hidden">
          {data.months.map(m => <div key={m.month} className="p-3 text-xs tabular-nums">
            <div className="flex items-center justify-between gap-2 font-medium">
              <span>{months[m.month - 1]}</span>
              <span className={m.net < 0 ? 'text-red-700' : 'text-green-700'}>Netto {formatCurrency(m.net)}</span>
            </div>
            <div className="mt-1 grid grid-cols-2 gap-2 text-muted-foreground">
              <span>Entrate {formatCurrency(m.income)}</span><span className="text-right">Uscite {formatCurrency(m.expense)}</span>
            </div>
          </div>)}
        </div>
        <div className="overflow-x-auto rounded-xl border bg-white max-sm:hidden">
        <table className="w-full text-sm tabular-nums">
          <caption className="sr-only">Entrate e uscite mensili di prima nota, anno {anno}</caption>
          <thead className="bg-muted/50 text-xs text-muted-foreground"><tr>
            <th scope="col" className="p-3 text-left">Mese</th>
            <th scope="col" className="p-3 text-right">Entrate</th>
            <th scope="col" className="p-3 text-right">Uscite</th>
            <th scope="col" className="p-3 text-right">Netto</th>
          </tr></thead>
          <tbody>{data.months.map(m => <tr key={m.month} className="border-t">
            <th scope="row" className="px-3 py-2 text-left font-medium">{months[m.month - 1]}</th>
            <td className="px-3 py-2 text-right text-blue-800">{formatCurrency(m.income)}</td>
            <td className="px-3 py-2 text-right text-orange-700">{formatCurrency(m.expense)}</td>
            <td className={`px-3 py-2 text-right font-medium ${m.net < 0 ? 'text-red-700' : 'text-green-700'}`}>{formatCurrency(m.net)}</td>
          </tr>)}</tbody>
        </table>
      </div></>}
  </div>;
}
