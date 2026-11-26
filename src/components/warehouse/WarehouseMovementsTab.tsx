/**
 * WarehouseMovementsTab — registro globale dei movimenti di magazzino.
 *
 * Vista d'insieme di tutti i carichi/scarichi (warehouse_movements) della company
 * nel periodo selezionato, con filtri tipo/periodo/ricerca, riepilogo e export CSV.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { format, subDays } from "date-fns";
import { it } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ArrowDownToLine, ArrowUpFromLine, Search, Download, RefreshCw, AlertTriangle, History, Loader2,
} from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { exportToCSV, type CsvColumn } from "@/lib/csvExport";
import { usePermissions } from "@/hooks/usePermissions";
import { formattaQuantitaMovimento } from "@/lib/magazzino/quantitaMovimento";
import { leggiMovimentiMagazzino } from "@/lib/magazzino/registroMovimenti";
import { queryKeys } from "@/lib/queryKeys";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import { BOTTONE_SECONDARIO, RICERCA_BARRA } from "@/components/orders/TestataScheda";
import { ArticoloMagazzinoDialog } from "./ArticoloMagazzinoDialog";

interface Props {
  companyId: string;
  warehouseFilter: string | null;
}

type PeriodKey = "7" | "30" | "90" | "all";

const PERIOD_LABEL: Record<PeriodKey, string> = {
  "7": "Ultimi 7 giorni",
  "30": "Ultimi 30 giorni",
  "90": "Ultimi 90 giorni",
  all: "Tutto lo storico",
};

export default function WarehouseMovementsTab({ companyId, warehouseFilter }: Props) {
  const t = useT();
  const permissions = usePermissions();
  const canViewCosts = !permissions.isLoading && permissions.canViewCosts;
  // 26/11/2026: si parte dagli ultimi 90 giorni (a 30 la pagina era spesso vuota).
  const [period, setPeriod] = useState<PeriodKey>("90");
  const [articoloAperto, setArticoloAperto] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<"all" | "carico" | "scarico">("all");
  const [query, setQuery] = useState("");
  // a schermo a blocchi: diciottomila righe in una tabella bloccano il browser
  const [mostrate, setMostrate] = useState(300);

  const sinceISO = useMemo(() => {
    if (period === "all") return null;
    return subDays(new Date(), Number(period)).toISOString();
  }, [period]);

  const { data: rows = [], isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: [...queryKeys.warehouse.movementsRegistry(companyId), warehouseFilter, sinceISO, canViewCosts],
    enabled: !!companyId,
    staleTime: 1000 * 60 * 2,
    queryFn: ({ signal }) => leggiMovimentiMagazzino(companyId, { warehouseId: warehouseFilter, since: sinceISO, canViewCosts }, signal),
  });

  const filtered = useMemo(() => {
    const norm = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (typeFilter !== "all" && r.movement_type !== typeFilter) return false;
      if (!norm) return true;
      return (
        r.itemName.toLowerCase().includes(norm) ||
        (r.notes?.toLowerCase().includes(norm) ?? false) ||
        (r.lot_number?.toLowerCase().includes(norm) ?? false) ||
        (r.orderCode?.toLowerCase().includes(norm) ?? false) ||
        (r.performerName?.toLowerCase().includes(norm) ?? false)
      );
    });
  }, [rows, typeFilter, query]);

  const summary = useMemo(() => {
    let carichi = 0, scarichi = 0, valore = 0;
    for (const r of filtered) {
      const qty = Number(r.quantity) || 0;
      if (r.movement_type === "carico") carichi += 1;
      else scarichi += 1;
      valore += qty * Number(r.unit_cost ?? 0);
    }
    return { count: filtered.length, carichi, scarichi, valore };
  }, [filtered]);

  const handleExport = () => {
    const columns: CsvColumn[] = [
      { key: "data", label: "Data" },
      { key: "tipo", label: "Tipo" },
      { key: "articolo", label: "Articolo" },
      { key: "quantita", label: "Quantità" },
      { key: "unita", label: "Unità" },
      ...(canViewCosts ? [{ key: "costo_unitario", label: "Costo unitario" }, { key: "valore", label: "Valore" }] : []),
      { key: "lotto", label: "Lotto" },
      { key: "commessa", label: "Commessa" },
      { key: "operatore", label: "Operatore" },
      { key: "note", label: "Note" },
    ];
    const data = filtered.map((r) => ({
      data: format(new Date(r.created_at), "dd/MM/yyyy HH:mm", { locale: it }),
      tipo: r.rientro_commessa ? "Reso da cantiere" : r.movement_type === "carico" ? "Carico" : "Scarico",
      articolo: r.itemName,
      quantita: `${r.movement_type === "carico" ? "+" : "-"}${r.quantity}`,
      unita: r.unit ?? "",
      ...(canViewCosts ? { costo_unitario: r.unit_cost != null ? String(r.unit_cost) : "", valore: r.unit_cost != null ? String(Number(r.quantity) * Number(r.unit_cost)) : "" } : {}),
      lotto: r.lot_number ?? "",
      commessa: r.orderCode ?? "",
      operatore: r.performerName ?? "",
      note: r.notes ?? "",
    }));
    exportToCSV(data, columns, `magazzino_movimenti_${format(new Date(), "yyyy-MM-dd")}.csv`);
  };

  return (
    <div className="space-y-2">
      {/* 26/11/2026: barra senza riquadro e numeri su una fascia sola, come le altre schede
          (prima riquadro alto 88px e quattro riquadri da 150px anche con zero movimenti). */}
      <div className="flex flex-wrap items-center gap-2">
        <div className={RICERCA_BARRA}>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label={t("Cerca nei movimenti")}
            placeholder={t("Cerca articolo, commessa, operatore…")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}>
          <SelectTrigger className="h-8 w-full text-xs sm:w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("Tutti i tipi")}</SelectItem>
            <SelectItem value="carico">{t("Solo carichi")}</SelectItem>
            <SelectItem value="scarico">{t("Solo scarichi")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={period} onValueChange={(v) => setPeriod(v as PeriodKey)}>
          <SelectTrigger className="h-8 w-full text-xs sm:w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(PERIOD_LABEL) as PeriodKey[]).map((k) => (
              <SelectItem key={k} value={k}>{t(PERIOD_LABEL[k])}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground" aria-label={t("Riepilogo")}>
          <SummaryCard label={t("Movimenti")} value={String(summary.count)} icon={History} tone="slate" />
          <SummaryCard label={t("Carichi e resi · movimenti")} value={String(summary.carichi)} icon={ArrowDownToLine} tone="emerald" />
          <SummaryCard label={t("Scarichi · movimenti")} value={String(summary.scarichi)} icon={ArrowUpFromLine} tone="red" />
          {canViewCosts && <SummaryCard label={t("Valore movimentato")} value={formatCurrency(summary.valore)} icon={Download} tone="blue" />}
        </div>
        <div className="flex items-center gap-1.5 sm:ml-auto">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className={BOTTONE_SECONDARIO} title={t("Aggiorna")}>
            {isFetching ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            <span className="sr-only">{t("Aggiorna")}</span>
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={filtered.length === 0} className={BOTTONE_SECONDARIO}>
            <Download />
            CSV
          </Button>
        </div>
      </div>

      {isError ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{t("Errore di caricamento")}</AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span>{t("Impossibile caricare i movimenti.")}</span>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="ml-4">
              <RefreshCw className="h-4 w-4 mr-2" /> {t("Riprova")}
            </Button>
          </AlertDescription>
        </Alert>
      ) : isLoading ? (
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground" role="status" aria-live="polite">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="text-sm">{t("Caricamento movimenti…")}</span>
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-8 text-center">
            <History className="h-8 w-8 text-muted-foreground/40" />
            <div>
              <p className="text-sm font-medium text-foreground">{t("Nessun movimento nel periodo")}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t("I carichi (arrivi merce) e gli scarichi (uscite verso cantiere) compariranno qui.")}
              </p>
              {period !== "all" && (
                <Button variant="outline" size="sm" className="mt-2 h-8 px-2.5 text-xs" onClick={() => setPeriod("all")}>
                  {t("Tutto lo storico")}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap max-sm:px-2">{t("Data")}</TableHead>
                    <TableHead className="max-sm:px-2">{t("Tipo")}</TableHead>
                    <TableHead className="max-sm:px-2">{t("Articolo")}</TableHead>
                    <TableHead className="text-right max-sm:px-2 sm:text-center">{t("Qtà")}</TableHead>
                    <TableHead className="hidden md:table-cell">{t("Lotto")}</TableHead>
                    <TableHead className="hidden lg:table-cell">{t("Commessa")}</TableHead>
                    <TableHead className="hidden lg:table-cell">{t("Operatore")}</TableHead>
                    <TableHead className="hidden sm:table-cell">{t("Note")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.slice(0, mostrate).map((m) => (
                    // 26/11/2026: un movimento per riga (da 640px niente va a capo) e il clic apre l'articolo.
                    <TableRow key={m.id} className="cursor-pointer sm:[&>td]:whitespace-nowrap sm:[&>td]:py-1.5"
                      onClick={(e) => { if (!(e.target as HTMLElement).closest("a, button")) setArticoloAperto(m.stock_item_id); }}>
                      <TableCell className="text-sm text-muted-foreground max-sm:px-2 sm:whitespace-nowrap">
                        <time dateTime={m.created_at} className="max-sm:text-xs">{format(new Date(m.created_at), "dd/MM/yy HH:mm")}</time>
                      </TableCell>
                      <TableCell className="max-sm:px-2">
                        <Badge
                          variant={m.movement_type === "carico" ? "default" : "destructive"}
                          className={m.movement_type === "carico"
                            ? "gap-1 bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-400 max-sm:px-1"
                            : "gap-1 border-transparent bg-red-50 text-red-700 hover:bg-red-50 max-sm:px-1"}
                        >
                          {m.movement_type === "carico"
                            ? <ArrowDownToLine aria-hidden className="hidden h-3 w-3 sm:block" />
                            : <ArrowUpFromLine aria-hidden className="hidden h-3 w-3 sm:block" />}
                          {m.rientro_commessa ? t("Reso da cantiere") : m.movement_type === "carico" ? t("Carico") : t("Scarico")}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[260px] text-sm font-medium max-sm:px-2">
                        <div className="break-words sm:truncate" title={m.itemName}>{m.itemName}</div>
                        <div className="space-y-0.5 text-xs font-normal text-muted-foreground lg:hidden">
                          {m.order_id && m.orderCode && (
                            <Link to={`/azienda/ordini/${m.order_id}`} className="block break-words font-medium text-primary hover:underline">{m.orderCode}</Link>
                          )}
                          {m.performerName && <p className="break-words">{m.performerName}</p>}
                        </div>
                      </TableCell>
                      <TableCell className={`text-right text-sm font-semibold tabular-nums max-sm:px-2 sm:text-center ${m.movement_type === "carico" ? "text-emerald-600" : "text-red-600"}`}>
                        {m.movement_type === "carico" ? "+" : "−"}{formattaQuantitaMovimento(Number(m.quantity))}{m.unit ? ` ${m.unit}` : ""}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{m.lot_number || "—"}</TableCell>
                      <TableCell className="hidden lg:table-cell text-sm">
                        {m.order_id && m.orderCode ? (
                          <Link to={`/azienda/ordini/${m.order_id}`} className="font-medium text-primary hover:underline">{m.orderCode}</Link>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">{m.performerName || "—"}</TableCell>
                      <TableCell className="hidden sm:table-cell max-w-[240px] truncate text-sm text-muted-foreground" title={m.notes || undefined}>{m.notes || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {filtered.length > mostrate && (
              <div className="border-t px-3 py-2 text-center">
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setMostrate((n) => n + 300)}>{t("Mostra altri {valore} di {n}", { valore: Math.min(300, filtered.length - mostrate), n: filtered.length - mostrate })}</Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
      {articoloAperto && <ArticoloMagazzinoDialog stockItemId={articoloAperto} onClose={() => setArticoloAperto(null)} />}
    </div>
  );
}

/** Un numero del riepilogo: icona, etichetta e valore su una riga. */
function SummaryCard({
  label, value, icon: Icon, tone,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  tone: "slate" | "emerald" | "red" | "blue";
}) {
  const toneCls: Record<string, string> = {
    slate: "text-slate-500",
    emerald: "text-emerald-600",
    red: "text-red-600",
    blue: "text-blue-600",
  };
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <Icon className={`h-3.5 w-3.5 shrink-0 ${toneCls[tone]}`} aria-hidden />
      <span>{label}</span>
      <b className="tabular-nums text-foreground">{value}</b>
    </span>
  );
}
