import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { formatCurrency } from '@/lib/formatters';
import { Truck, AlertTriangle } from 'lucide-react';
import { differenceInDays, format, isValid, parseISO, startOfDay } from 'date-fns';
import { EmptyRow } from './EmptyRow';
import { useSupplierPaymentNames, useSupplierPayments } from '@/hooks/useSupplierPayments';
import { supplierPaymentSummary, type SupplierBudgetItem } from '@/lib/orders/supplierPaymentSummary';

interface SupplierPaymentsCardProps {
  items: SupplierBudgetItem[];
  companyId: string;
  orderId?: string;
}

export function SupplierPaymentsCard({ items, companyId, orderId }: SupplierPaymentsCardProps) {
  const documents = useSupplierPayments(companyId, orderId);
  const ids = useMemo(() => [...new Set([
    ...items.map(i => i.supplier_id),
    ...(documents.data?.orders ?? []).map(o => o.supplier_id),
    ...(documents.data?.entries ?? []).map(e => e.supplier_id),
  ].filter((id): id is string => !!id))].sort(), [items, documents.data]);
  const names = useSupplierPaymentNames(companyId, ids);
  const groups = useMemo(() => supplierPaymentSummary({ items, names: names.data ?? {},
    orders: documents.data?.orders ?? [], invoices: documents.data?.invoices ?? [],
    entries: documents.data?.entries ?? [], dues: documents.data?.dues ?? [],
    ambiguousCostIds: documents.data?.ambiguousCostIds ?? [],
  }), [items, documents.data, names.data]);
  const loading = !!orderId && documents.isLoading;
  const error = documents.isError || names.isError;
  const invoiced = groups.reduce((s, g) => s + g.invoiced, 0);
  const paid = groups.reduce((s, g) => s + g.paid, 0);
  const unpaid = groups.reduce((s, g) => s + g.unpaid, 0);

  return <Card>
    <CardHeader className="pb-3">
      <CardTitle className="flex items-center gap-2 text-base">
        <Truck className="h-5 w-5 text-primary" />Pagamenti fornitori
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-4">
      {loading ? <p role="status" className="text-sm text-muted-foreground">Leggo OdA, fatture e pagamenti…</p>
        : error ? <div role="alert" className="flex flex-wrap items-center gap-2 text-sm">
          <AlertTriangle className="h-4 w-4 text-amber-600" />Non riesco a verificare i pagamenti fornitori.
          <Button size="sm" variant="outline" onClick={() => { void documents.refetch(); void names.refetch(); }}>Riprova</Button>
        </div> : groups.length === 0 ? <EmptyRow icon={Truck}>Nessun fornitore associato a questa commessa</EmptyRow>
        : <>
          {invoiced > 0 && <div className="grid grid-cols-1 gap-2 border-b pb-3 text-sm min-[360px]:grid-cols-3">
            <Money label="Fatturato" value={invoiced} />
            <Money label="Pagato" value={paid} className="text-green-700" />
            <Money label="Da pagare" value={unpaid} className="text-amber-700" />
          </div>}
          <p className="text-xs text-muted-foreground">Fatture IVA inclusa e pagamenti registrati. Il budget articoli non è un debito.</p>
          <div className="divide-y">
            {groups.map(group => <div key={group.key} className="space-y-2 py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 break-words text-sm font-medium">{group.name}</span>
                <Badge variant="outline" className={group.reviewCount ? 'text-amber-700' : group.invoiced > 0 && group.unpaid === 0 ? 'text-green-700' : ''}>
                  {group.reviewCount ? 'Da verificare' : group.invoiced > 0 ? group.unpaid === 0 ? 'Pagato' : group.paid > 0 ? 'Parziale' : 'Da pagare'
                    : group.ordered > 0 ? 'In attesa di fattura' : 'Solo budget'}
                </Badge>
              </div>
              {group.invoiced > 0 && <>
                <div className="flex flex-wrap justify-between gap-1 text-xs tabular-nums">
                  <span>Pagato {formatCurrency(group.paid)} su {formatCurrency(group.invoiced)}</span>
                  <span className="text-muted-foreground">Residuo {formatCurrency(group.unpaid)}</span>
                </div>
                <Progress value={100 * group.paid / group.invoiced} className="h-1.5" />
              </>}
              {group.nextDeadline && group.unpaid > 0 && <Deadline value={group.nextDeadline} />}
              {group.reviewCount > 0 && <p className="text-xs text-amber-700">Collegamenti, note di credito o pagamenti da verificare: {formatCurrency(group.review)}. Esclusi dai totali verificati.</p>}
              {group.ordered > 0 && <p className="text-xs text-muted-foreground">Ordinato {formatCurrency(group.ordered)} · {group.invoiceCount} fatture collegate</p>}
              {group.estimated > 0 && group.invoiced === 0 && <p className="text-xs text-muted-foreground">Budget articoli: {formatCurrency(group.estimated)} (stima, non pagamento)</p>}
              {group.orders.map(order => <Link key={order.id} to={`/azienda/ordini-acquisto/${order.id}`}
                className="flex min-h-9 flex-wrap items-center justify-between gap-1 rounded px-1 text-xs text-primary hover:bg-muted focus-visible:outline focus-visible:outline-2">
                <span>OdA #{order.oda_number} · {order.status}</span><span className="tabular-nums">{formatCurrency(Number(order.total) || 0)}</span>
              </Link>)}
            </div>)}
          </div>
        </>}
    </CardContent>
  </Card>;
}

function Money({ label, value, className = '' }: { label: string; value: number; className?: string }) {
  return <div><div className="text-xs text-muted-foreground">{label}</div><div className={`font-semibold tabular-nums ${className}`}>{formatCurrency(value)}</div></div>;
}
function Deadline({ value }: { value: string }) {
  const date = parseISO(value);
  if (!isValid(date)) return <p className="text-xs text-amber-700">Data scadenza da verificare</p>;
  const expired = differenceInDays(startOfDay(date), startOfDay(new Date())) < 0;
  return <p className={`text-xs ${expired ? 'text-red-600' : 'text-muted-foreground'}`}>
    Scadenza: {format(date, 'dd/MM/yyyy')}{expired ? ' · scaduta' : ''}
  </p>;
}
