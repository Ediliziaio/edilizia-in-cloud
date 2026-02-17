import { format, addDays } from "date-fns";
import { it } from "date-fns/locale";
import { Link } from "react-router-dom";
import {
  Plus, Check, Pencil, Trash2, Receipt, Repeat,
  Package, ExternalLink, Undo2, CheckSquare,
  MoreHorizontal, X, Copy, AlertCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/formatters";
import type { UnifiedCost } from "@/hooks/useCompanyCostsData";

const RECURRENCE_LABELS: Record<string, string> = {
  once: "Una tantum",
  monthly: "Mensile",
  quarterly: "Trimestrale",
  yearly: "Annuale",
};

interface CostsTableProps {
  items: UnifiedCost[];
  type: string;
  selectedIds: Set<string>;
  costNameCounts: Map<string, number>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: (selectableIds: string[]) => void;
  onClearSelection: () => void;
  onOpenCreate: (type: string) => void;
  onOpenEdit: (cost: UnifiedCost) => void;
  onOpenDuplicate: (cost: UnifiedCost) => void;
  onDelete: (id: string) => void;
  onDeleteGroup: (name: string) => void;
  onBulkDelete: () => void;
  onBulkMarkPaid: (ids: string[]) => void;
  onBulkMarkUnpaid: (ids: string[]) => void;
  onMarkPaid: (id: string) => void;
  onMarkUnpaid: (id: string) => void;
  onMarkOrderItemUnpaid: (cost: UnifiedCost) => void;
  onOpenTasks: (id: string) => void;
  bulkMarkPaidPending: boolean;
  bulkMarkUnpaidPending: boolean;
}

export function CostsTable({
  items,
  type,
  selectedIds,
  costNameCounts,
  onToggleSelect,
  onToggleSelectAll,
  onClearSelection,
  onOpenCreate,
  onOpenEdit,
  onOpenDuplicate,
  onDelete,
  onDeleteGroup,
  onBulkDelete,
  onBulkMarkPaid,
  onBulkMarkUnpaid,
  onMarkPaid,
  onMarkUnpaid,
  onMarkOrderItemUnpaid,
  onOpenTasks,
  bulkMarkPaidPending,
  bulkMarkUnpaidPending,
}: CostsTableProps) {
  const now = new Date();
  const soon = addDays(now, 7);

  const selectableItems = items.filter(c => !c.isFromOrder);
  const allSelectableIds = selectableItems.map(c => c.id);
  const allSelected = allSelectableIds.length > 0 && allSelectableIds.every(id => selectedIds.has(id));
  const someSelected = selectedIds.size > 0;

  const getStatusBadge = (cost: UnifiedCost) => {
    if (cost.isFromOrder) {
      if (cost.is_paid) {
        const paidLabel = cost.paid_date ? `Pagato il ${format(new Date(cost.paid_date), "dd/MM/yyyy", { locale: it })}` : "Pagato";
        return <Badge className="bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400">{paidLabel}</Badge>;
      }
      if (cost.orderItemStatus === "ordinato") return <Badge className="bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400">Ordinato</Badge>;
      return <Badge className="bg-red-50 text-red-600 border-red-200 dark:bg-red-900/20 dark:text-red-400">Da pagare</Badge>;
    }
    if (cost.is_paid) {
      const paidLabel = cost.paid_date ? `Pagato il ${format(new Date(cost.paid_date), "dd/MM/yyyy", { locale: it })}` : "Pagato";
      return <Badge className="bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400">{paidLabel}</Badge>;
    }
    const dueDate = new Date(cost.due_date);
    if (dueDate <= soon && dueDate >= now) return <Badge className="bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/30 dark:text-orange-400">In scadenza</Badge>;
    if (dueDate < now) return <Badge className="bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400">Scaduto</Badge>;
    return <Badge className="bg-red-50 text-red-600 border-red-200 dark:bg-red-900/20 dark:text-red-400">Da pagare</Badge>;
  };

  return (
    <div className="space-y-4">
      {type !== "all" && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => onOpenCreate(type === "variable" ? "variable" : "fixed")} className="gap-1">
            <Plus className="h-4 w-4" />
            Aggiungi {type === "fixed" ? "Costo Fisso" : "Costo Variabile"}
          </Button>
        </div>
      )}

      {someSelected && (
        <div className="flex items-center gap-2 flex-wrap p-3 rounded-lg bg-muted border">
          <span className="text-sm font-medium">{selectedIds.size} costi selezionati</span>
          <div className="flex items-center gap-1.5 ml-auto">
            <Button
              size="sm" variant="outline"
              className="gap-1 border-green-300 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-900/20"
              onClick={() => onBulkMarkPaid(Array.from(selectedIds))}
              disabled={bulkMarkPaidPending}
            >
              <Check className="h-3.5 w-3.5" /> Segna pagati
            </Button>
            <Button
              size="sm" variant="outline"
              className="gap-1 border-orange-300 text-orange-700 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-400 dark:hover:bg-orange-900/20"
              onClick={() => onBulkMarkUnpaid(Array.from(selectedIds))}
              disabled={bulkMarkUnpaidPending}
            >
              <Undo2 className="h-3.5 w-3.5" /> Segna non pagati
            </Button>
            <Button size="sm" variant="destructive" className="gap-1" onClick={onBulkDelete}>
              <Trash2 className="h-3.5 w-3.5" /> Elimina
            </Button>
            <Button size="sm" variant="ghost" className="gap-1" onClick={onClearSelection}>
              <X className="h-3.5 w-3.5" /> Deseleziona
            </Button>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Receipt className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p>Nessun costo trovato</p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox checked={allSelected} onCheckedChange={() => onToggleSelectAll(allSelectableIds)} aria-label="Seleziona tutti" />
                </TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Origine</TableHead>
                {type === "all" && <TableHead>Tipo</TableHead>}
                <TableHead>Fornitore</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead className="text-right">Imponibile</TableHead>
                <TableHead>IVA</TableHead>
                <TableHead>Ricorrenza</TableHead>
                <TableHead>Scadenza</TableHead>
                <TableHead>Stato</TableHead>
                {(type === "variable" || type === "all") && <TableHead>Ordine</TableHead>}
                <TableHead className="text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((cost) => {
                const vatRate = Number((cost as any).vat_rate) || 0;
                const vatAmount = cost.amount * (vatRate / 100);
                const grossAmount = cost.amount + vatAmount;
                const isSelected = selectedIds.has(cost.id);
                return (
                  <TableRow key={cost.id} className={`${cost.isFromOrder ? "bg-orange-50/50 dark:bg-orange-900/5" : ""} ${isSelected ? "bg-muted/50" : ""}`}>
                    <TableCell>
                      {!cost.isFromOrder ? (
                        <Checkbox checked={isSelected} onCheckedChange={() => onToggleSelect(cost.id)} aria-label={`Seleziona ${cost.name}`} />
                      ) : (
                        <span className="block w-4" />
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{cost.name}</TableCell>
                    <TableCell>
                      {cost.isFromOrder ? (
                        <Badge className="bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/30 dark:text-orange-400 gap-1 text-[10px] px-1.5">
                          <Package className="h-3 w-3" /> Da Ordine
                        </Badge>
                      ) : (
                        <Badge className="bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400 gap-1 text-[10px] px-1.5">
                          <Pencil className="h-3 w-3" /> Manuale
                        </Badge>
                      )}
                    </TableCell>
                    {type === "all" && (
                      <TableCell>
                        <Badge variant="outline" className={cost.cost_type === "fixed" ? "border-red-400 text-red-600" : "border-amber-400 text-amber-600"}>
                          {cost.cost_type === "fixed" ? "Fisso" : "Variabile"}
                        </Badge>
                      </TableCell>
                    )}
                    <TableCell>
                      {(cost as any).supplier?.name || cost.supplierName || (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell>{cost.category || "—"}</TableCell>
                    <TableCell className="text-right">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="font-medium cursor-help">{formatCurrency(cost.amount)}</span>
                        </TooltipTrigger>
                        {vatRate > 0 && (
                          <TooltipContent>
                            <div className="text-xs space-y-0.5">
                              <p>Imponibile: {formatCurrency(cost.amount)}</p>
                              <p>IVA ({vatRate}%): {formatCurrency(vatAmount)}</p>
                              <Separator className="my-1" />
                              <p className="font-semibold">Totale: {formatCurrency(grossAmount)}</p>
                            </div>
                          </TooltipContent>
                        )}
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      {vatRate > 0 ? (
                        <Badge variant="outline" className="text-xs border-violet-300 text-violet-600 dark:text-violet-400">
                          {vatRate}%
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">Esente</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        <Repeat className="h-3 w-3 mr-1" />
                        {RECURRENCE_LABELS[cost.recurrence] || cost.recurrence}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {cost.due_date ? format(new Date(cost.due_date), "dd/MM/yyyy", { locale: it }) : "—"}
                    </TableCell>
                    <TableCell>{getStatusBadge(cost)}</TableCell>
                    {(type === "variable" || type === "all") && (
                      <TableCell>
                        {cost.order ? (
                          <Link to={`/azienda/ordini/${cost.order.id}`} className="text-primary hover:underline text-sm flex items-center gap-1">
                            {cost.order.order_code || "Ordine"}
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                    )}
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {!cost.isFromOrder && (
                          <>
                            {!cost.is_paid ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onMarkPaid(cost.id)}>
                                    <CheckSquare className="h-3.5 w-3.5 text-green-600" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Segna come pagato</TooltipContent>
                              </Tooltip>
                            ) : (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onMarkUnpaid(cost.id)}>
                                    <Undo2 className="h-3.5 w-3.5 text-orange-600" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Riporta a non pagato</TooltipContent>
                              </Tooltip>
                            )}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onOpenTasks(cost.id)}>
                                  <AlertCircle className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Task collegate</TooltipContent>
                            </Tooltip>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onOpenEdit(cost)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7">
                                  <MoreHorizontal className="h-3.5 w-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => onOpenDuplicate(cost)}>
                                  <Copy className="h-4 w-4 mr-2" /> Duplica (+1 mese)
                                </DropdownMenuItem>
                                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onDelete(cost.id)}>
                                  <Trash2 className="h-4 w-4 mr-2" /> Elimina
                                </DropdownMenuItem>
                                {(costNameCounts.get(cost.name) || 0) > 1 && (
                                  <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onDeleteGroup(cost.name)}>
                                    <Trash2 className="h-4 w-4 mr-2" /> Elimina tutti "{cost.name}" ({costNameCounts.get(cost.name)})
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </>
                        )}
                        {cost.isFromOrder && (
                          <>
                            {!cost.is_paid ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onMarkPaid(cost.id)}>
                                    <CheckSquare className="h-3.5 w-3.5 text-green-600" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Segna come pagato</TooltipContent>
                              </Tooltip>
                            ) : (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onMarkOrderItemUnpaid(cost)}>
                                    <Undo2 className="h-3.5 w-3.5 text-orange-600" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Riporta a non pagato</TooltipContent>
                              </Tooltip>
                            )}
                            {cost.order && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                                    <Link to={`/azienda/ordini/${cost.order.id}`}>
                                      <ExternalLink className="h-3.5 w-3.5" />
                                    </Link>
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Vai all'ordine</TooltipContent>
                              </Tooltip>
                            )}
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
