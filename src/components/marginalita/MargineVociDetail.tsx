import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/formatters";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowUpRight, Euro, TrendingUp, Package, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface MarginalitaRow {
  id: string;
  order_code: string | null;
  description: string;
  preventivo_totale: number;
  costo_acquisti: number;
  costo_errori: number;
  consuntivo: number;
  margine: number;
  margine_perc: number;
  cliente_nome: string;
  variazioni_approvate: number;
  preventivo_contratto: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  row: MarginalitaRow | null;
}

function safeNumber(value: number | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function BreakdownBar({
  label,
  value,
  total,
  colorClass,
}: {
  label: string;
  value: number;
  total: number;
  colorClass: string;
}) {
  const cleanValue = safeNumber(value);
  const cleanTotal = safeNumber(total);
  const pct = cleanTotal > 0 ? Math.min((cleanValue / cleanTotal) * 100, 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{formatCurrency(cleanValue)} ({pct.toFixed(1)}%)</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", colorClass)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function MargineVociDetail({ open, onClose, row }: Props) {
  // Fetch order items with costs
  const { data: items = [], isLoading: itemsLoading, error: itemsError, refetch: refetchItems } = useQuery({
    queryKey: ["margine-voci-detail", row?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("id, name, quantity, unit_price, purchase_price, standard_cost, status, position")
        .eq("order_id", row!.id)
        .order("position");
      if (error) throw error;
      return (data || []) as {
        id: string;
        name: string;
        quantity: number;
        unit_price: number | null;
        purchase_price: number | null;
        standard_cost: number | null;
        status: string;
        position: number;
      }[];
    },
    enabled: !!row?.id && open,
    staleTime: 2 * 60 * 1000,
  });

  if (!row) return null;

  const preventivoTotale = safeNumber(row.preventivo_totale);
  const variazioniApprovate = safeNumber(row.variazioni_approvate);
  const costoAcquisti = safeNumber(row.costo_acquisti);
  const costoErrori = safeNumber(row.costo_errori);
  const consuntivo = safeNumber(row.consuntivo);
  const margine = safeNumber(row.margine);
  const marginePerc = safeNumber(row.margine_perc);
  const margineColor =
    marginePerc >= 25 ? "bg-green-500" : marginePerc >= 10 ? "bg-amber-500" : "bg-red-500";
  const margineTextColor =
    marginePerc >= 25 ? "text-green-600" : marginePerc >= 10 ? "text-amber-600" : "text-red-600";

  // Per-voce computed values
  const vociWithMargin = items.map((item) => {
    const quantity = safeNumber(item.quantity) || 1;
    const ricavo = safeNumber(item.unit_price) * quantity;
    const costo = (safeNumber(item.purchase_price) || safeNumber(item.standard_cost)) * quantity;
    const margineVoce = ricavo - costo;
    const margineVocePerc = ricavo > 0 ? (margineVoce / ricavo) * 100 : 0;
    return { ...item, ricavo, costo, margineVoce, margineVocePerc };
  });

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="pb-4 border-b">
          <SheetTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-5 w-5 text-primary" aria-hidden="true" />
            <span>Marginalità per voce</span>
            <Link
              to={`/azienda/ordini/${row.id}`}
              className="flex items-center gap-1 text-sm text-primary hover:underline ml-1"
              onClick={onClose}
            >
              {row.order_code ? `#${row.order_code}` : "Ordine"}
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </SheetTitle>
          {row.description && (
            <p className="text-sm text-muted-foreground">{row.description}</p>
          )}
          {row.cliente_nome && (
            <p className="text-xs text-muted-foreground">Cliente: {row.cliente_nome}</p>
          )}
        </SheetHeader>

        <div className="space-y-5 py-4">
          {/* Global summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border p-3 space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Preventivo</p>
              <p className="text-lg font-bold text-primary">{formatCurrency(preventivoTotale)}</p>
              {variazioniApprovate > 0 && (
                <p className="text-xs text-muted-foreground">+{formatCurrency(variazioniApprovate)} varianti</p>
              )}
            </div>
            <div className="rounded-lg border p-3 space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Consuntivo</p>
              <p className="text-lg font-bold">{formatCurrency(consuntivo)}</p>
            </div>
            <div className="rounded-lg border p-3 space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Margine</p>
              <p className={cn("text-lg font-bold", margineTextColor)}>{formatCurrency(margine)}</p>
              <Badge className={cn("text-xs border-0",
                marginePerc >= 25 ? "bg-green-100 text-green-800" :
                marginePerc >= 10 ? "bg-amber-100 text-amber-800" :
                "bg-red-100 text-red-800"
              )}>
                {marginePerc.toFixed(1)}%
              </Badge>
            </div>
          </div>

          {/* Cost breakdown bars */}
          <div className="space-y-3 p-4 rounded-lg bg-muted/30 border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Breakdown costi</p>
            <BreakdownBar
              label="Costi acquisti materiali"
              value={costoAcquisti}
              total={preventivoTotale}
              colorClass="bg-blue-500"
            />
            {costoErrori > 0 && (
              <BreakdownBar
                label="Costi errori / rilavorazioni"
                value={costoErrori}
                total={preventivoTotale}
                colorClass="bg-red-500"
              />
            )}
            <BreakdownBar
              label="Margine lordo"
              value={Math.max(margine, 0)}
              total={preventivoTotale}
              colorClass={margineColor}
            />
          </div>

          {/* Per-voce table */}
          <div>
            <div className="flex items-center gap-1.5 mb-3">
              <Package className="h-4 w-4 text-primary" aria-hidden="true" />
              <h3 className="text-sm font-semibold">Voci d'ordine ({items.length})</h3>
            </div>

            {itemsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : itemsError ? (
              <div className="flex flex-col items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-5 text-center">
                <p className="text-sm text-red-700">Impossibile caricare le voci d'ordine.</p>
                <Button variant="outline" size="sm" onClick={() => refetchItems()}>
                  Riprova
                </Button>
              </div>
            ) : vociWithMargin.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Nessuna voce d'ordine trovata
              </p>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Voce</TableHead>
                      <TableHead className="text-right">Qta</TableHead>
                      <TableHead className="text-right hidden sm:table-cell">Ricavo</TableHead>
                      <TableHead className="text-right hidden sm:table-cell">Costo</TableHead>
                      <TableHead className="text-right">Margine</TableHead>
                      <TableHead className="text-right">%</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vociWithMargin.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <p className="text-sm font-medium">{item.name}</p>
                        </TableCell>
                        <TableCell className="text-right text-sm">{item.quantity}</TableCell>
                        <TableCell className="text-right text-sm hidden sm:table-cell">
                          {item.ricavo > 0 ? formatCurrency(item.ricavo) : "—"}
                        </TableCell>
                        <TableCell className="text-right text-sm hidden sm:table-cell">
                          {item.costo > 0 ? formatCurrency(item.costo) : "—"}
                        </TableCell>
                        <TableCell className={cn("text-right text-sm font-semibold",
                          item.margineVoce > 0 ? "text-green-600" : item.margineVoce < 0 ? "text-red-600" : "text-muted-foreground"
                        )}>
                          {item.ricavo > 0 ? formatCurrency(item.margineVoce) : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {item.ricavo > 0 ? (
                            <div className="flex flex-col items-end gap-1">
                              <span className={cn("text-xs font-medium",
                                item.margineVocePerc >= 25 ? "text-green-600" :
                                item.margineVocePerc >= 10 ? "text-amber-600" : "text-red-600"
                              )}>
                                {item.margineVocePerc.toFixed(1)}%
                              </span>
                              <Progress
                                value={Math.max(Math.min(item.margineVocePerc, 100), 0)}
                                className="h-1 w-16"
                                aria-label={`Margine ${item.margineVocePerc.toFixed(1)}%`}
                              />
                            </div>
                          ) : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          {/* Warnings */}
          {(costoErrori > 0 || marginePerc < 10) && (
            <div className="space-y-2">
              {costoErrori > 0 && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm">
                  <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" aria-hidden="true" />
                  <div>
                    <p className="font-medium text-red-800">Costi da errori: {formatCurrency(costoErrori)}</p>
                    <p className="text-xs text-red-700">Analizza le cause per prevenire futuri errori su questo tipo di cantiere.</p>
                  </div>
                </div>
              )}
              {marginePerc < 10 && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm">
                  <Euro className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" aria-hidden="true" />
                  <div>
                    <p className="font-medium text-amber-800">Margine sotto soglia ({marginePerc.toFixed(1)}%)</p>
                    <p className="text-xs text-amber-700">Il margine è inferiore al 10%. Verifica i costi delle voci principali.</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
