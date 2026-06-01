/**
 * Sheet drill-down per i singoli pezzi serializzati (stock_units).
 *
 * Apertura tipica: button "Vedi seriali" su /azienda/magazzino.
 * Permette di:
 *  - cercare per serial_number
 *  - filtrare per status (available/reserved/shipped/installed/...)
 *  - filtrare per lotto
 *  - filtrare per articolo specifico (passato via prop)
 *
 * Layout snello: tabella scorribile con colonne essenziali + badge status.
 */
import { useState, useMemo } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Package, Filter, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useStockUnitsList,
  type StockUnitStatus,
  type StockUnitsListRow,
} from "@/hooks/warehouse/useStockUnits";
import { WarrantyExportDialog, type WarrantyExportItem } from "@/components/warehouse/WarrantyExportDialog";

interface StockUnitsDrilldownSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Se passato, il drill-down è ristretto a quell'articolo. */
  stockItemId?: string;
  /** Lista lotti per popolare il dropdown filtro. */
  lotti?: Array<{ id: string; codice_lotto: string }>;
  /** Titolo override (es. nome articolo quando si arriva da una riga). */
  title?: string;
}

const STATUS_LABELS: Record<StockUnitStatus | "all", string> = {
  all: "Tutti gli stati",
  available: "Disponibile",
  reserved: "Riservato",
  shipped: "Spedito",
  installed: "Installato",
  returned: "Reso",
  defective: "Difettoso",
  scrapped: "Smaltito",
};

const STATUS_BADGE: Record<StockUnitStatus, string> = {
  available: "bg-emerald-50 text-emerald-700 border-emerald-200",
  reserved: "bg-amber-50 text-amber-700 border-amber-200",
  shipped: "bg-blue-50 text-blue-700 border-blue-200",
  installed: "bg-violet-50 text-violet-700 border-violet-200",
  returned: "bg-slate-50 text-slate-700 border-slate-200",
  defective: "bg-rose-50 text-rose-700 border-rose-200",
  scrapped: "bg-zinc-50 text-zinc-700 border-zinc-200",
};

export function StockUnitsDrilldownSheet({
  open,
  onOpenChange,
  stockItemId,
  lotti = [],
  title,
}: StockUnitsDrilldownSheetProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StockUnitStatus | "all">("all");
  const [lottoFilter, setLottoFilter] = useState<string>("all");
  const [exportOpen, setExportOpen] = useState(false);

  const filters = useMemo(
    () => ({
      stockItemId,
      lottoId: lottoFilter !== "all" ? lottoFilter : undefined,
      status: statusFilter,
      search,
      limit: 500,
      // Fetch SOLO quando il Sheet è aperto. Senza, la query partiva al mount
      // di /azienda/magazzino anche con Sheet chiuso → 500 row scaricati per nulla.
      enabled: open,
    }),
    [stockItemId, lottoFilter, statusFilter, search, open],
  );

  const { data: units = [], isLoading } = useStockUnitsList(filters);

  // Aggregato status per badge counter veloce.
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const u of units) {
      counts[u.status] = (counts[u.status] ?? 0) + 1;
    }
    return counts;
  }, [units]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-3xl w-full overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-orange-600" />
            {title ?? "Tutti i seriali"}
          </SheetTitle>
          <SheetDescription>
            {units.length} {units.length === 1 ? "seriale" : "seriali"} trovati
            {Object.keys(statusCounts).length > 0 && (
              <span className="flex flex-wrap gap-1 mt-2">
                {(Object.keys(statusCounts) as StockUnitStatus[]).map((s) => (
                  <Badge
                    key={s}
                    variant="outline"
                    className={STATUS_BADGE[s] ?? ""}
                  >
                    {STATUS_LABELS[s]}: {statusCounts[s]}
                  </Badge>
                ))}
              </span>
            )}
          </SheetDescription>
        </SheetHeader>

        {/* Action bar: export garanzie quando ci sono risultati */}
        {units.length > 0 && (
          <div className="flex justify-end mt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExportOpen(true)}
              title="Esporta lista per registrazione garanzia fornitore"
            >
              <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
              Esporta per garanzia ({units.length})
            </Button>
          </div>
        )}

        {/* Filtri */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
          <div className="space-y-1 sm:col-span-1">
            <Label className="text-xs uppercase">Cerca seriale</Label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground/60" />
              <Input
                placeholder="V02H10007653…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-7 font-mono text-xs"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs uppercase">Stato</Label>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StockUnitStatus | "all")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(STATUS_LABELS) as Array<StockUnitStatus | "all">).map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {lotti.length > 0 && (
            <div className="space-y-1">
              <Label className="text-xs uppercase">Lotto</Label>
              <Select value={lottoFilter} onValueChange={setLottoFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti i lotti</SelectItem>
                  {lotti.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.codice_lotto}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Tabella seriali */}
        <div className="mt-4 border rounded-md overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Caricamento seriali...
            </div>
          ) : units.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              <Filter className="h-8 w-8 mx-auto mb-2 opacity-30" />
              Nessun seriale corrisponde ai filtri.
            </div>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium">Seriale</th>
                  <th className="px-3 py-2 font-medium">Articolo</th>
                  <th className="px-3 py-2 font-medium">Lotto</th>
                  <th className="px-3 py-2 font-medium">Stato</th>
                  <th className="px-3 py-2 font-medium">Garanzia</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {units.map((u) => (
                  <UnitRow key={u.id} u={u} />
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </SheetContent>

      <WarrantyExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        items={units.map<WarrantyExportItem>((u) => ({
          serial_number: u.serial_number,
          articolo: u.stock_item?.name ?? null,
          internal_code: u.stock_item?.internal_code ?? null,
          lotto_codice: u.lotto?.codice_lotto ?? null,
          purchase_date: (u as unknown as { purchase_date?: string | null }).purchase_date ?? null,
          warranty_months: (u as unknown as { warranty_months?: number | null }).warranty_months ?? null,
        }))}
      />
    </Sheet>
  );
}

function UnitRow({ u }: { u: StockUnitsListRow }) {
  const warrantyExpires = (u as unknown as { warranty_expires_at?: string | null }).warranty_expires_at;
  return (
    <tr className="hover:bg-muted/30">
      <td className="px-3 py-2 font-mono">{u.serial_number}</td>
      <td className="px-3 py-2 truncate max-w-[200px]">
        <div className="font-medium">{u.stock_item?.name ?? "—"}</div>
        {u.stock_item?.internal_code && (
          <div className="text-muted-foreground text-[10px] font-mono">
            {u.stock_item.internal_code}
          </div>
        )}
      </td>
      <td className="px-3 py-2">
        {u.lotto?.codice_lotto ? (
          <Badge variant="outline" className="text-[10px] font-mono">
            {u.lotto.codice_lotto}
          </Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-3 py-2">
        <Badge variant="outline" className={STATUS_BADGE[u.status] ?? ""}>
          {STATUS_LABELS[u.status]}
        </Badge>
      </td>
      <td className="px-3 py-2 text-muted-foreground">
        {warrantyExpires ? new Date(warrantyExpires).toLocaleDateString("it-IT") : "—"}
      </td>
    </tr>
  );
}
