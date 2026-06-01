/**
 * AnalisiAcquisti — Analisi della spesa fornitori & benchmark prezzi (P2).
 *
 * Pagina di sola lettura che sfrutta dati GIÀ esistenti (vista
 * `supplier_procurement_report`, `purchase_order_items`, `fatture_ricevute`)
 * per rispondere a tre domande:
 *   1. Quanto e da chi sto comprando? (spesa per fornitore + concentrazione)
 *   2. Sto pagando lo stesso articolo a prezzi diversi? (benchmark + risparmio)
 *   3. Quanto pesano le fatture passive per fornitore? (spesa da fatture)
 *
 * Nessuna migration né edge function: tutta l'aggregazione è client-side e
 * delegata alle funzioni pure testate in `@/lib/procurement/spendAnalysis`.
 */

import { useProcurementAnalysis } from "@/hooks/useProcurementAnalysis";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatDateIt } from "@/lib/formatters";
import { formatShare } from "@/lib/procurement/spendAnalysis";
import {
  AlertTriangle,
  BarChart3,
  Building2,
  PiggyBank,
  Receipt,
  ShoppingCart,
  TrendingDown,
} from "lucide-react";

function Kpi({
  label,
  value,
  hint,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: "default" | "green" | "amber";
}) {
  const valueColor =
    accent === "green"
      ? "text-green-600"
      : accent === "amber"
        ? "text-amber-600"
        : "text-foreground";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <p className={`mt-1 text-xl font-semibold tracking-tight ${valueColor}`}>{value}</p>
        {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function EmptyState({ icon: Icon, title, hint }: { icon: React.ComponentType<{ className?: string }>; title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-10 text-center">
      <Icon className="h-8 w-8 text-muted-foreground/60" />
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="max-w-md text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

export default function AnalisiAcquisti() {
  const { supplierSpend, benchmark, invoiceSpend, isLoading } = useProcurementAnalysis();

  const ranked = supplierSpend?.ranked ?? [];
  const benchmarks = benchmark?.benchmarks ?? [];
  const totalSaving = benchmark?.totalSaving ?? 0;
  const invoiceRanked = invoiceSpend?.ranked ?? [];
  const hasInvoices = (invoiceSpend?.invoiceCount ?? 0) > 0;

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-6">
      <PageHeader
        title="Analisi Acquisti"
        description="Spesa per fornitore, concentrazione e benchmark dei prezzi per individuare opportunità di risparmio."
        badge={<Badge variant="secondary" className="font-normal">Sola lettura</Badge>}
      />

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[88px] w-full rounded-xl" />)
        ) : (
          <>
            <Kpi
              label="Spesa ordini d'acquisto"
              value={formatCurrency(supplierSpend?.totalSpend ?? 0)}
              hint={`${supplierSpend?.totalOrders ?? 0} ordini`}
              icon={ShoppingCart}
            />
            <Kpi
              label="Fornitori attivi"
              value={String(supplierSpend?.supplierCount ?? 0)}
              hint={
                supplierSpend?.topSupplier
                  ? `Top: ${supplierSpend.topSupplier.name} (${formatShare(supplierSpend.topSupplier.share)})`
                  : undefined
              }
              icon={Building2}
            />
            <Kpi
              label="Valore medio ordine"
              value={formatCurrency(supplierSpend?.avgOrderValue ?? 0)}
              icon={BarChart3}
            />
            <Kpi
              label="Scaduto aperto"
              value={formatCurrency(supplierSpend?.totalOpenDue ?? 0)}
              hint="Da scadenze pagamento fornitore"
              icon={AlertTriangle}
              accent={supplierSpend && supplierSpend.totalOpenDue > 0 ? "amber" : "default"}
            />
            <Kpi
              label="Risparmio potenziale"
              value={formatCurrency(totalSaving)}
              hint={benchmarks.length > 0 ? `${benchmarks.length} articoli con varianza` : "Serve dettaglio righe"}
              icon={PiggyBank}
              accent={totalSaving > 0 ? "green" : "default"}
            />
          </>
        )}
      </div>

      {/* Spesa per fornitore */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4" /> Spesa per fornitore
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : ranked.length === 0 ? (
            <EmptyState
              icon={ShoppingCart}
              title="Nessuna spesa registrata"
              hint="Crea ordini d'acquisto verso i fornitori per vedere qui la spesa aggregata e la concentrazione."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fornitore</TableHead>
                  <TableHead className="text-right">Ordini</TableHead>
                  <TableHead className="text-right">Spesa</TableHead>
                  <TableHead className="w-[180px]">Quota</TableHead>
                  <TableHead className="text-right">Scaduto</TableHead>
                  <TableHead className="text-right">Ultimo ordine</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ranked.map((r) => (
                  <TableRow key={r.supplierId}>
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-2">
                        <span className="truncate">{r.name}</span>
                        {r.isForeign && <Badge variant="outline" className="text-[10px]">Estero</Badge>}
                        {!r.isActive && <Badge variant="outline" className="text-[10px]">Inattivo</Badge>}
                      </span>
                      {r.productCategory && (
                        <span className="block text-[11px] text-muted-foreground">{r.productCategory}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.orderCount}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatCurrency(r.total)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={Math.min(100, r.share * 100)} className="h-1.5" />
                        <span className="w-12 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                          {formatShare(r.share)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.openDueAmount > 0 ? (
                        <span className="text-amber-600">{formatCurrency(r.openDueAmount)}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {r.lastOrderDate ? formatDateIt(r.lastOrderDate) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Benchmark prezzi */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingDown className="h-4 w-4" /> Benchmark prezzi — opportunità di risparmio
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : benchmarks.length === 0 ? (
            <EmptyState
              icon={TrendingDown}
              title="Nessun confronto prezzi disponibile"
              hint="Servono righe d'ordine dettagliate (stesso articolo acquistato almeno due volte) per confrontare i prezzi unitari e stimare il risparmio."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Articolo</TableHead>
                  <TableHead className="text-right">Acquisti</TableHead>
                  <TableHead className="text-right">Min</TableHead>
                  <TableHead className="text-right">Medio</TableHead>
                  <TableHead className="text-right">Max</TableHead>
                  <TableHead className="text-right">Ultimo</TableHead>
                  <TableHead className="text-right">Risparmio</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {benchmarks.map((b) => (
                  <TableRow key={b.key}>
                    <TableCell className="max-w-[260px]">
                      <span className="block truncate font-medium" title={b.label}>{b.label}</span>
                      <span className="block text-[11px] text-muted-foreground">
                        {b.supplierCount} fornitor{b.supplierCount === 1 ? "e" : "i"}
                        {b.bestSupplierName ? ` · migliore: ${b.bestSupplierName}` : ""}
                        {b.unitOfMeasure ? ` · ${b.unitOfMeasure}` : ""}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{b.purchaseCount}</TableCell>
                    <TableCell className="text-right tabular-nums text-green-600">{formatCurrency(b.minPrice)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(b.avgPrice)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{formatCurrency(b.maxPrice)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(b.lastPrice)}</TableCell>
                    <TableCell className="text-right">
                      {b.potentialSaving > 0 ? (
                        <span className="font-medium text-green-600">{formatCurrency(b.potentialSaving)}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Spesa da fatture ricevute — mostrata solo se esistono fatture passive */}
      {hasInvoices && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Receipt className="h-4 w-4" /> Spesa da fatture ricevute
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fornitore</TableHead>
                  <TableHead className="text-right">Fatture</TableHead>
                  <TableHead className="text-right">Imponibile</TableHead>
                  <TableHead className="w-[160px]">Quota</TableHead>
                  <TableHead className="text-right">Ultima fattura</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoiceRanked.map((r) => (
                  <TableRow key={r.key}>
                    <TableCell className="font-medium">
                      <span className="truncate">{r.name}</span>
                      {r.piva && <span className="block text-[11px] text-muted-foreground">P.IVA {r.piva}</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.invoiceCount}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatCurrency(r.totalImponibile)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={Math.min(100, r.share * 100)} className="h-1.5" />
                        <span className="w-12 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                          {formatShare(r.share)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {r.lastInvoiceDate ? formatDateIt(r.lastInvoiceDate) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
