import { useState } from 'react';
import { PackageCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/formatters';
import { useAuth } from '@/contexts/AuthContext';
import { useOrderMaterialUsage } from '@/hooks/useOrderMaterialUsage';

export function OrderMaterialUsageCard({ orderId, showCosts }: { orderId: string; showCosts: boolean }) {
  const { effectiveCompany } = useAuth();
  const query = useOrderMaterialUsage(effectiveCompany?.id, orderId);
  const [expanded, setExpanded] = useState(false);
  const data = query.data;
  const rows = data?.rows ?? [];
  const number = (n: number) => n.toLocaleString('it-IT', { maximumFractionDigits: 3 });
  return <Card>
    <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base">
      <PackageCheck className="h-5 w-5 text-primary" />Materiali in cantiere
    </CardTitle></CardHeader>
    <CardContent className="space-y-3">
      {query.isLoading ? <p role="status" className="text-sm text-muted-foreground">Verifico consegne e rapportini…</p>
        : query.isError ? <div role="alert" className="text-sm">Non riesco a leggere i consumi.
          <Button variant="outline" size="sm" className="ml-2" onClick={() => void query.refetch()}>Riprova</Button></div>
        : <>
          <p className="text-xs text-muted-foreground">Usato = rapportini approvati. Il residuo è da verificare in cantiere, non una giacenza certificata. Questi valori non aggiungono costi agli OdA.</p>
          {data?.unlinked ? <p className="text-xs text-amber-700">{data.unlinked} voci nei rapportini non collegate a un articolo di magazzino: escluse dal conteggio.</p> : null}
          {!rows.length ? <p className="text-sm text-muted-foreground">Nessun materiale tracciato per questa commessa.</p> : <div>
            <div className="hidden gap-3 border-b pb-2 text-xs text-muted-foreground sm:grid sm:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))]">
              {['Articolo', 'Consegnato', 'Usato', 'Reso', 'Residuo'].map(label => <span key={label}>{label}</span>)}
            </div>
            <div className="divide-y">{(expanded ? rows : rows.slice(0, 6)).map(row => <div key={row.id} className="py-3 sm:grid sm:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))] sm:items-center sm:gap-3">
              <div><div className="flex flex-wrap items-center justify-between gap-1 text-sm"><span className="font-medium break-words">{row.name}</span>
                {row.review && <span className="text-xs text-amber-700">Da verificare</span>}</div>
                {showCosts && row.estimatedUsedValue != null && !row.review && <p className="mt-1 text-xs text-muted-foreground">Usato ≈ {formatCurrency(row.estimatedUsedValue)}</p>}
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs sm:contents">
                {(['Consegnato', 'Usato', 'Reso', 'Residuo'] as const).map((label, i) => <div key={label}>
                  <dt className="text-muted-foreground sm:sr-only">{label}</dt><dd className={`tabular-nums font-medium ${i === 3 && row.remaining !== 0 ? 'text-amber-700' : ''}`}>
                    {number([row.delivered, row.used, row.returned, row.remaining][i])} {row.unit}</dd>
                </div>)}
              </dl>
            </div>)}</div>
            {showCosts && <p className="mt-2 text-xs text-muted-foreground">Valori indicativi al costo medio delle consegne, non nuovi addebiti.</p>}
          </div>}
          {rows.length > 6 && <Button variant="outline" size="sm" onClick={() => setExpanded(!expanded)}>{expanded ? 'Mostra meno' : `Tutti gli articoli (${rows.length})`}</Button>}
        </>}
    </CardContent>
  </Card>;
}
