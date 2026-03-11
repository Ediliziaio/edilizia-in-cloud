import { useMemo, useState, useCallback } from "react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import {
  Plus, Check, Clock, Calculator, Filter, Info, Repeat,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { formatCurrency } from "@/lib/formatters";
import { VAT_RATES, calculateNetFromGross, calculateGrossFromNet } from "@/lib/vatUtils";
import { toast } from "sonner";
import type { CostFormData } from "@/hooks/useCompanyCostsMutations";
import { getNextDate, calculatePeriodsFromDates } from "@/hooks/useCompanyCostsMutations";
import type { UnifiedCost } from "@/hooks/useCompanyCostsData";

interface CostFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formData: CostFormData;
  setFormData: (data: CostFormData) => void;
  editingCost: UnifiedCost | null;
  suppliers: any[];
  orders: any[];
  dynamicCategories: string[];
  onSave: (data: CostFormData) => void;
  isSaving: boolean;
  onClose: () => void;
}

export function CostFormDialog({
  open,
  onOpenChange,
  formData,
  setFormData,
  editingCost,
  suppliers,
  orders,
  dynamicCategories,
  onSave,
  isSaving,
  onClose,
}: CostFormDialogProps) {
  const [categoryPopoverOpen, setCategoryPopoverOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();

  const handleSupplierChange = useCallback((supplierId: string) => {
    if (supplierId === "none") {
      setFormData({ ...formData, supplier_id: "none" });
      return;
    }
    const supplier = suppliers.find((s: any) => s.id === supplierId);
    if (supplier) {
      setFormData({
        ...formData,
        supplier_id: supplierId,
        vat_rate: String(supplier.vat_rate ?? 22),
        category: supplier.product_category || formData.category,
      });
    }
  }, [suppliers, formData, setFormData]);

  const formVatPreview = useMemo(() => {
    const inputAmount = parseFloat(formData.amount) || 0;
    const vatRate = parseFloat(formData.vat_rate) || 0;
    if (formData.is_gross) {
      const { netAmount, vatAmount } = calculateNetFromGross(inputAmount, vatRate);
      return { netAmount, vatAmount, grossAmount: inputAmount };
    } else {
      const { grossAmount, vatAmount } = calculateGrossFromNet(inputAmount, vatRate);
      return { netAmount: inputAmount, vatAmount, grossAmount };
    }
  }, [formData.amount, formData.vat_rate, formData.is_gross]);

  const periodsPreview = useMemo(() => {
    if (formData.recurrence === "once" || !formData.due_date || !formData.end_date) return null;
    const periods = calculatePeriodsFromDates(formData.due_date, formData.end_date, formData.recurrence);
    if (periods <= 0) return null;
    const baseDate = new Date(formData.due_date);
    const lastDate = getNextDate(baseDate, formData.recurrence, periods - 1);
    return {
      count: periods,
      from: format(baseDate, "MMM yyyy", { locale: it }),
      to: format(lastDate, "MMM yyyy", { locale: it }),
    };
  }, [formData.recurrence, formData.due_date, formData.end_date]);

  const handleSubmit = () => {
    const amt = parseFloat(formData.amount);
    if (isNaN(amt) || amt <= 0) {
      toast.error("L'importo deve essere maggiore di zero");
      return;
    }
    onSave(formData);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); onOpenChange(o); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingCost ? "Modifica Costo" : "Nuovo Costo"}</DialogTitle>
          <DialogDescription>
            {editingCost ? "Aggiorna i dettagli del costo" : "Inserisci i dettagli del nuovo costo aziendale"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          {/* Basic Info */}
          <div className="space-y-3">
            <div>
              <Label>Nome *</Label>
              <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="es. Affitto ufficio" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo</Label>
                <Select value={formData.cost_type} onValueChange={(v) => setFormData({ ...formData, cost_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">Costo Fisso</SelectItem>
                    <SelectItem value="variable">Costo Variabile</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Categoria</Label>
                <Popover open={categoryPopoverOpen} onOpenChange={setCategoryPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                      {formData.category || "Seleziona..."}
                      <Filter className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[250px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Cerca o crea categoria..." value={categorySearch} onValueChange={setCategorySearch} />
                      <CommandList>
                        <CommandEmpty>
                          {categorySearch.trim() ? (
                            <button
                              className="w-full text-left px-4 py-2 text-sm hover:bg-accent cursor-pointer"
                             onClick={async () => {
                                const catName = categorySearch.trim();
                                setFormData({ ...formData, category: catName });
                                setCategorySearch("");
                                setCategoryPopoverOpen(false);
                                // Save to cost_categories table
                                if (effectiveCompany?.id) {
                                  await supabase.from("cost_categories").upsert(
                                    { company_id: effectiveCompany.id, name: catName },
                                    { onConflict: "company_id,name" }
                                  );
                                  queryClient.invalidateQueries({ queryKey: queryKeys.costs.categories(effectiveCompany?.id) });
                                }
                              }}
                            >
                              <Plus className="h-3 w-3 inline mr-1" /> Crea "{categorySearch.trim()}"
                            </button>
                          ) : (
                            <span className="text-muted-foreground text-xs">Nessuna categoria</span>
                          )}
                        </CommandEmpty>
                        <CommandGroup>
                          {dynamicCategories.map((cat) => (
                            <CommandItem key={cat} value={cat} onSelect={() => {
                              setFormData({ ...formData, category: cat });
                              setCategorySearch("");
                              setCategoryPopoverOpen(false);
                            }}>
                              {cat}
                              {formData.category === cat && <Check className="ml-auto h-4 w-4" />}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>

          <Separator />

          {/* Fiscal Section */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
              <Calculator className="h-4 w-4" /> Dati Fiscali
            </h4>
            <div>
              <Label>Fornitore (opzionale)</Label>
              <Select value={formData.supplier_id || "none"} onValueChange={handleSupplierChange}>
                <SelectTrigger><SelectValue placeholder="Nessun fornitore" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nessun fornitore</SelectItem>
                  {suppliers.map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} {s.product_category ? `(${s.product_category})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Aliquota IVA</Label>
                <Select value={formData.vat_rate} onValueChange={(v) => setFormData({ ...formData, vat_rate: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {VAT_RATES.map((rate) => (
                      <SelectItem key={rate.value} value={String(rate.value)}>{rate.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Importo (€) *</Label>
                <Input type="number" step="0.01" value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })} placeholder="0.00" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={formData.is_gross} onCheckedChange={(v) => setFormData({ ...formData, is_gross: v })} />
              <Label className="text-sm cursor-pointer" onClick={() => setFormData({ ...formData, is_gross: !formData.is_gross })}>
                {formData.is_gross ? "Importo Ivato (lordo)" : "Importo Imponibile (netto)"}
              </Label>
            </div>
            {formData.amount && parseFloat(formData.vat_rate) > 0 && (
              <div className="p-3 rounded-lg bg-violet-50 dark:bg-violet-900/10 border border-violet-200 dark:border-violet-800 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Imponibile</span>
                  <span className="font-medium">{formatCurrency(formVatPreview.netAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">IVA ({formData.vat_rate}%)</span>
                  <span className="font-medium text-violet-600">{formatCurrency(formVatPreview.vatAmount)}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-semibold">
                  <span>Totale</span>
                  <span>{formatCurrency(formVatPreview.grossAmount)}</span>
                </div>
                {formData.is_gross && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-1 cursor-help">
                          <Info className="h-3 w-3" /> Verrà salvato l'imponibile di {formatCurrency(formVatPreview.netAmount)}
                        </p>
                      </TooltipTrigger>
                      <TooltipContent>L'importo lordo viene scorporato e salvato come imponibile netto</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            )}
          </div>

          <Separator />

          {/* Planning Section */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
              <Clock className="h-4 w-4" /> Pianificazione
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Ricorrenza</Label>
                <Select
                  value={formData.recurrence}
                  onValueChange={(v) => {
                    setFormData({ ...formData, recurrence: v, ...(v === "once" ? { end_date: "" } : {}) });
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="once">Una tantum</SelectItem>
                    <SelectItem value="monthly">Mensile</SelectItem>
                    <SelectItem value="quarterly">Trimestrale</SelectItem>
                    <SelectItem value="yearly">Annuale</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Data scadenza *</Label>
                <Input type="date" value={formData.due_date || ""} onChange={(e) => setFormData({ ...formData, due_date: e.target.value })} />
              </div>
            </div>

            {formData.recurrence !== "once" && (
              <div className="space-y-2">
                <Label>Data fine contratto *</Label>
                <Input
                  type="date"
                  value={formData.end_date || ""}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                  min={formData.due_date || undefined}
                />
                {periodsPreview ? (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Repeat className="h-3 w-3" /> {editingCost ? `Verranno creati ${periodsPreview.count} nuovi costi aggiuntivi` : `Verranno creati ${periodsPreview.count} costi da ${periodsPreview.from} a ${periodsPreview.to}`}
                  </p>
                ) : formData.due_date && !formData.end_date ? (
                  <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <Info className="h-3 w-3" /> Seleziona la data fine contratto per generare i costi ricorrenti
                  </p>
                ) : null}

                {/* Auto-generation toggle */}
                <div className="flex items-center gap-3 pt-1">
                  <Switch
                    checked={formData.recurrence_auto || false}
                    onCheckedChange={(v) => setFormData({ ...formData, recurrence_auto: v })}
                  />
                  <Label className="text-sm cursor-pointer" onClick={() => setFormData({ ...formData, recurrence_auto: !formData.recurrence_auto })}>
                    Auto-generazione ricorrente
                  </Label>
                </div>
                {formData.recurrence_auto && (
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Repeat className="h-3 w-3" /> I costi futuri verranno generati automaticamente in base alla ricorrenza
                  </p>
                )}
              </div>
            )}

            {formData.cost_type === "variable" && (
              <div>
                <Label>Collega a ordine (opzionale)</Label>
                <Select value={formData.order_id || "none"} onValueChange={(v) => setFormData({ ...formData, order_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Nessun ordine" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nessuno</SelectItem>
                    {orders.map((order: any) => (
                      <SelectItem key={order.id} value={order.id}>
                        {order.order_code || order.description?.substring(0, 30) || order.id.substring(0, 8)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div>
            <Label>Note</Label>
            <Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="Note aggiuntive..." rows={2} maxLength={200} />
            {formData.notes && (
              <p className="text-[10px] text-muted-foreground text-right">{formData.notes.length}/200</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button
            onClick={handleSubmit}
            disabled={!formData.name || !formData.amount || !formData.due_date || isSaving || (formData.recurrence !== "once" && !editingCost && !formData.end_date)}
          >
            {isSaving ? "Salvataggio..." : editingCost ? "Aggiorna" : periodsPreview ? `Crea ${periodsPreview.count} costi` : "Aggiungi"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
