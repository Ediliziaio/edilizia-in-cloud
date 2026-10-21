/**
 * AnalisiAcquisti — da chi compri, quanto, e se paghi lo stesso articolo a
 * prezzi diversi. Tutti gli importi senza IVA, tranne le rate da pagare.
 * I conti stanno in `@/lib/procurement/spendAnalysis` (testati).
 */

import { useProcurementAnalysis } from "@/hooks/useProcurementAnalysis";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiCard } from "@/components/costi/KpiCard";
import { formatCurrency, formatDateIt } from "@/lib/formatters";
import { formatVariazione, periodoDaScelta, variazione } from "@/lib/procurement/spendAnalysis";
import { AlertTriangle, CalendarClock, PiggyBank, Receipt, RefreshCw, ShoppingCart, TrendingDown } from "lucide-react";

const eur0 = (v: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" }).format(v);

function Errore({ onRiprova }: { onRiprova: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
      <AlertTriangle className="h-4 w-4 text-destructive" />
      <span>Non sono riuscito a leggere i dati. Controlla la connessione e riprova.</span>
      <Button size="sm" variant="outline" onClick={onRiprova}>
        <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Riprova
      </Button>
    </div>
  );
}

export default function AnalisiAcquisti() {
  const periodo = periodoDaScelta("12mesi");
  const { analisiQuery, prezziQuery, firmaQuery } = useProcurementAnalysis(periodo);
  const a = analisiQuery.data?.analisi;
  const t = a?.totali;
  const benchmarks = prezziQuery.data?.benchmarks ?? [];
  const firma = firmaQuery.data ?? null;

  return (
    <div className="space-y-6 max-sm:space-y-3">
      <PageHeader title="Analisi Acquisti" />

      {analisiQuery.isError ? (
        <Errore onRiprova={() => analisiQuery.refetch()} />
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-5">
          {analisiQuery.isLoading || !t ? (
            Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
          ) : (
            <>
              <KpiCard label="Ordinato" value={eur0(t.ordinato)} sub={formatVariazione(variazione(t.ordinato, t.annoPrima.ordinato)) ?? "senza IVA"} icon={ShoppingCart} accent="bg-orange-500" />
              <KpiCard label="Fatturato" value={eur0(t.fatturato)} sub={formatVariazione(variazione(t.fatturato, t.annoPrima.fatturato)) ?? "senza IVA"} icon={Receipt} accent="bg-blue-500" />
              <KpiCard label="Scaduto" value={eur0(t.scaduto)} sub={`${t.scadutoConteggio} rate, IVA compresa`} icon={AlertTriangle} accent={t.scaduto > 0 ? "bg-red-500" : "bg-emerald-500"} />
              <KpiCard label="In scadenza 30 giorni" value={eur0(t.inScadenza30)} sub={`${t.inScadenza30Conteggio} rate, IVA compresa`} icon={CalendarClock} accent="bg-amber-500" />
              <KpiCard
                label="Risparmio potenziale"
                value={prezziQuery.isLoading ? "…" : eur0(prezziQuery.data?.totalSaving ?? 0)}
                sub="se avessi pagato il prezzo migliore degli ultimi 12 mesi"
                icon={PiggyBank}
                accent="bg-emerald-500"
              />
            </>
          )}
        </div>
      )}

      {firma && (
        <p className="text-sm text-muted-foreground">
          {firma.base === "firma" ? "Dalla firma del preventivo" : "Dalla creazione della commessa"} al primo ordine d'acquisto passano in media{" "}
          <strong className={firma.mediaGiorni > 7 ? "text-orange-700" : "text-foreground"}>{firma.mediaGiorni} giorni</strong> (su {firma.commesse} commesse degli ultimi 12 mesi).
        </p>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Spesa per fornitore (senza IVA)</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {analisiQuery.isError ? (
            <Errore onRiprova={() => analisiQuery.refetch()} />
          ) : analisiQuery.isLoading || !a ? (
            <Skeleton className="h-48 w-full" />
          ) : a.fornitori.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nessun acquisto nel periodo. Crea un ordine d'acquisto o importa le fatture ricevute.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fornitore</TableHead>
                  <TableHead className="text-right">Ordinato</TableHead>
                  <TableHead className="text-right">Fatturato</TableHead>
                  <TableHead className="text-right">Ordinato non fatturato</TableHead>
                  <TableHead className="text-right">Scaduto</TableHead>
                  <TableHead className="text-right">Ultimo acquisto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {a.fornitori.map((r) => (
                  <TableRow key={r.chiave}>
                    <TableCell className="font-medium">{r.nome}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(r.ordinato)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(r.fatturato)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(r.ordinatoNonFatturato)}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.scaduto > 0 ? formatCurrency(r.scaduto) : "—"}</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">{r.ultimoAcquisto ? formatDateIt(r.ultimoAcquisto) : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingDown className="h-4 w-4" /> Confronto prezzi dello stesso articolo
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {prezziQuery.isError ? (
            <Errore onRiprova={() => prezziQuery.refetch()} />
          ) : prezziQuery.isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : benchmarks.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nessun articolo comprato a prezzi diversi negli ultimi 12 mesi. Le voci «a corpo» e le righe generiche non entrano nel confronto.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Articolo</TableHead>
                  <TableHead className="text-right">Acquisti</TableHead>
                  <TableHead className="text-right">Migliore</TableHead>
                  <TableHead className="text-right">Medio</TableHead>
                  <TableHead className="text-right">Più alto</TableHead>
                  <TableHead className="text-right">Risparmio</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {benchmarks.map((b) => (
                  <TableRow key={b.key}>
                    <TableCell className="max-w-[280px]">
                      <span className="block truncate font-medium" title={b.label}>{b.label}</span>
                      <span className="block text-[11px] text-muted-foreground">
                        {b.supplierCount} fornitor{b.supplierCount === 1 ? "e" : "i"}
                        {b.bestSupplierName ? ` · migliore: ${b.bestSupplierName}` : ""}
                        {b.unitOfMeasure ? ` · al ${b.unitOfMeasure}` : ""}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{b.purchaseCount}</TableCell>
                    <TableCell className="text-right tabular-nums text-green-600">{formatCurrency(b.minPrice)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(b.avgPrice)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(b.maxPrice)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums text-green-600">{formatCurrency(b.potentialSaving)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
