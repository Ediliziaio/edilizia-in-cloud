import { useMemo, useState, useCallback, useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import { format } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import {
  Plus, Check, Clock, Calculator, Filter, Info, Repeat, Trash2,
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
import { EVENTI_USCITA, termineLeggibile } from "@/lib/costi/uscitaEventi";
import {
  calculatePeriodsFromDates,
  getNextDate,
  parseCostDecimal,
  validateCostFormData,
} from "@/hooks/useCompanyCostsMutations";
import type { UnifiedCost } from "@/hooks/useCompanyCostsData";
import { AnnullaCostoDialog } from "@/components/costi/AnnullaCostoDialog";
import { costoAnnullato, importoOriginale, type CostoForseAnnullato } from "@/lib/costi/annulloCosto";
import { useT, dateFnsCampo } from "@/lib/campo/lingua/LinguaCampo";

interface CostFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formData: CostFormData;
  setFormData: Dispatch<SetStateAction<CostFormData>>;
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
  const t = useT();
  const [categoryPopoverOpen, setCategoryPopoverOpen] = useState(false);
  const [annulloAperto, setAnnulloAperto] = useState(false);
  // «Annulla costo» vale per i costi veri (non le voci che vengono da ordini o stipendi).
  const costoVero = !!editingCost && !editingCost.isFromOrder && /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(editingCost.id);
  const annullato = costoVero && costoAnnullato(editingCost as unknown as CostoForseAnnullato);
  const [categorySearch, setCategorySearch] = useState("");
  const [orderSearch, setOrderSearch] = useState("");
  const [allocations, setAllocations] = useState<Array<{ order_id: string; pct: number }>>(
    formData.allocations || []
  );

  // Sync allocations to formData — usa callback per evitare stale closure su formData
  useEffect(() => {
    setFormData(prev => ({ ...prev, allocations }));
  }, [allocations, setFormData]);

  // Load allocations from editingCost
  useEffect(() => {
    if (editingCost) {
      const raw = (editingCost as any).allocations;
      if (raw) {
        try {
          setAllocations(typeof raw === "string" ? JSON.parse(raw) : raw);
        } catch {
          setAllocations([]);
        }
      }
    } else {
      setAllocations([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingCost?.id]);

  const addAlloc = () => setAllocations(prev => [...prev, { order_id: "", pct: 0 }]);
  const removeAlloc = (i: number) => setAllocations(prev => prev.filter((_, idx) => idx !== i));
  const updateAlloc = (i: number, field: "order_id" | "pct", value: string | number) =>
    setAllocations(prev => prev.map((a, idx) => idx === i ? { ...a, [field]: value } : a));
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
    const parsedAmount = parseCostDecimal(formData.amount);
    const parsedVatRate = parseCostDecimal(formData.vat_rate);
    const inputAmount = Number.isFinite(parsedAmount) ? parsedAmount : 0;
    const vatRate = Number.isFinite(parsedVatRate) ? parsedVatRate : 0;
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
      from: format(baseDate, "MMM yyyy", { locale: dateFnsCampo() }),
      to: format(lastDate, "MMM yyyy", { locale: dateFnsCampo() }),
    };
  }, [formData.recurrence, formData.due_date, formData.end_date]);

  const handleSubmit = () => {
    try {
      validateCostFormData(formData);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("Dati costo non validi"));
      return;
    }
    onSave(formData);
  };
  // Termine scelto: decide se ha senso chiedere i giorni di dilazione e se la
  // data scritta a mano è solo una previsione.
  const defEvento = EVENTI_USCITA.find((e) => e.value === (formData.trigger_evento || "data_fissa"));
  const aTermine = (formData.trigger_evento || "data_fissa") !== "data_fissa";


  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); onOpenChange(o); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingCost ? t("Modifica Costo") : t("Nuovo Costo")}</DialogTitle>
          <DialogDescription className="max-sm:sr-only">
            {editingCost ? t("Aggiorna i dettagli del costo") : t("Inserisci i dettagli del nuovo costo aziendale")}
          </DialogDescription>
        </DialogHeader>
        {/* Mobile: via titoletti di sezione, anteprima IVA, termini di
            pagamento, generazione automatica, note e allocazione a commesse
            (restano i valori predefiniti). */}
        {annullato && (
          <div role="status" className="rounded-md border border-amber-300 bg-amber-50/70 p-3 text-sm dark:bg-amber-950/20">
            <p className="font-medium">{t("Costo annullato · era {valore}", { valore: formatCurrency(importoOriginale(editingCost as unknown as CostoForseAnnullato)) })}</p>
            <p className="text-muted-foreground">{(editingCost as unknown as CostoForseAnnullato).annullato_motivo ?? ""} {t("Non conta in controllo di gestione, commesse e cassa. Per cambiarlo, prima ripristinalo.")}</p>
          </div>
        )}
        <div className="space-y-5 max-sm:space-y-3">
          {/* Basic Info */}
          <div className="space-y-3">
            <div>
              <Label>{t("Nome *")}</Label>
              <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder={t("es. Affitto ufficio")} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t("Tipo")}</Label>
                <Select value={formData.cost_type} onValueChange={(v) => setFormData({ ...formData, cost_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">{t("Costo Fisso")}</SelectItem>
                    <SelectItem value="variable">{t("Costo Variabile")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("Categoria")}</Label>
                <Popover open={categoryPopoverOpen} onOpenChange={setCategoryPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                      {formData.category || t("Seleziona...")}
                      <Filter className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[250px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder={t("Cerca o crea categoria...")} value={categorySearch} onValueChange={setCategorySearch} />
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
                                  const { error: catErr } = await supabase.from("cost_categories").upsert(
                                    { company_id: effectiveCompany.id, name: catName },
                                    { onConflict: "company_id,name" }
                                  );
                                  if (catErr) {
                                    toast.error(t("Categoria non salvata"), { description: catErr.message });
                                  } else {
                                    queryClient.invalidateQueries({ queryKey: queryKeys.costs.categories(effectiveCompany?.id) });
                                  }
                                }
                              }}
                            >
                              <Plus className="h-3 w-3 inline mr-1" /> {t("Crea \"{nome}\"", { nome: categorySearch.trim() })}
                            </button>
                          ) : (
                            <span className="text-muted-foreground text-xs">{t("Nessuna categoria")}</span>
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

          <Separator className="max-sm:hidden" />

          {/* Fiscal Section */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground max-sm:hidden">
              <Calculator className="h-4 w-4" /> {t("Dati Fiscali")}
            </h4>
            <div>
              <Label>{t("Fornitore (opzionale)")}</Label>
              <Select value={formData.supplier_id || "none"} onValueChange={handleSupplierChange}>
                <SelectTrigger><SelectValue placeholder={t("Nessun fornitore")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("Nessun fornitore")}</SelectItem>
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
                <Label>{t("Aliquota IVA")}</Label>
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
                <Label>{t("Importo (€) *")}</Label>
                <Input type="number" inputMode="decimal" step="0.01" value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })} placeholder="0.00" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={formData.is_gross} onCheckedChange={(v) => setFormData({ ...formData, is_gross: v })} />
              <Label className="text-sm cursor-pointer" onClick={() => setFormData({ ...formData, is_gross: !formData.is_gross })}>
                {formData.is_gross ? t("Importo Ivato (lordo)") : t("Importo Imponibile (netto)")}
              </Label>
            </div>
            {formData.amount && formVatPreview.grossAmount > 0 && (
              <div className="p-3 rounded-lg bg-violet-50 dark:bg-violet-900/10 border border-violet-200 dark:border-violet-800 text-sm space-y-1 max-sm:hidden">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("Imponibile")}</span>
                  <span className="font-medium">{formatCurrency(formVatPreview.netAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("IVA ({vat_rate}%)", { vat_rate: String(formData.vat_rate ?? "") })}</span>
                  <span className="font-medium text-violet-600">{formatCurrency(formVatPreview.vatAmount)}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-semibold">
                  <span>{t("Totale")}</span>
                  <span>{formatCurrency(formVatPreview.grossAmount)}</span>
                </div>
                {formData.is_gross && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-1 cursor-help">
                          <Info className="h-3 w-3" /> {t("Verrà salvato l'imponibile di {importo}", { importo: formatCurrency(formVatPreview.netAmount) })}
                        </p>
                      </TooltipTrigger>
                      <TooltipContent>{t("L'importo lordo viene scorporato e salvato come imponibile netto")}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            )}
          </div>

          <Separator className="max-sm:hidden" />

          {/* Planning Section */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground max-sm:hidden">
              <Clock className="h-4 w-4" /> {t("Pianificazione")}
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t("Ricorrenza")}</Label>
                <Select
                  value={formData.recurrence}
                  onValueChange={(v) => {
                    // 15/11/2026: passando a una ricorrenza senza data di fine, la generazione
                    // automatica parte accesa: altrimenti resta una riga sola che si dice «mensile».
                    setFormData({
                      ...formData,
                      recurrence: v,
                      ...(v === "once" ? { end_date: "" } : {}),
                      ...(v !== "once" && formData.recurrence === "once" && !formData.end_date ? { recurrence_auto: true } : {}),
                    });
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="once">{t("Una tantum")}</SelectItem>
                    <SelectItem value="monthly">{t("Mensile")}</SelectItem>
                    <SelectItem value="quarterly">{t("Trimestrale")}</SelectItem>
                    <SelectItem value="yearly">{t("Annuale")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{aTermine ? t("Data prevista") : t("Data scadenza *")}</Label>
                <Input type="date" value={formData.due_date || ""} onChange={(e) => setFormData({ ...formData, due_date: e.target.value })} />
              </div>
            </div>

            {/* Termini di pagamento come si dicono davvero: "30 gg data fattura",
                "60 gg fine mese". Scritti così la scadenza si ricalcola quando la
                fattura del fornitore arriva, invece di restare quella digitata. */}
            <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-2.5 max-sm:hidden">
              <span className="text-xs text-muted-foreground">{t("Si paga")}</span>
              <Select
                value={formData.trigger_evento || "data_fissa"}
                onValueChange={(v) => setFormData({ ...formData, trigger_evento: v })}
              >
                <SelectTrigger className="h-8 w-auto min-w-[190px] text-xs" aria-label={t("Da cosa si conta la scadenza")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EVENTI_USCITA.map((e) => (
                    <SelectItem key={e.value} value={e.value}>{t(e.label)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {defEvento?.conGiorni && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  +
                  <Input
                    type="number"
                    min={0}
                    max={365}
                    value={formData.giorni_dilazione ?? 0}
                    onChange={(e) => setFormData({ ...formData, giorni_dilazione: Math.max(0, Math.min(365, Number(e.target.value) || 0)) })}
                    className="h-8 w-16 px-2 text-xs"
                    aria-label={t("Giorni di dilazione")}
                  />
                  {t("giorni")}
                </span>
              )}

              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                {t("· avvisami")}
                <Input
                  type="number"
                  min={0}
                  max={90}
                  value={formData.giorni_preavviso ?? 7}
                  onChange={(e) => setFormData({ ...formData, giorni_preavviso: Math.max(0, Math.min(90, Number(e.target.value) || 0)) })}
                  className="h-8 w-14 px-2 text-xs"
                  aria-label={t("Giorni di preavviso")}
                />
                {t("giorni prima")}
              </span>

              {aTermine && (
                <span className="w-full text-[11px] text-muted-foreground">
                  {formData.trigger_evento?.includes("fattura")
                    ? t("{termine} — la scadenza si calcola da sola quando arriva la fattura del fornitore.", { termine: termineLeggibile(formData.trigger_evento, formData.giorni_dilazione) })
                    : t("{termine} — la scadenza si calcola da sola dall'evento dell'ordine.", { termine: termineLeggibile(formData.trigger_evento, formData.giorni_dilazione) })}
                </span>
              )}
            </div>

            {formData.recurrence !== "once" && (
              <div className="space-y-2">
                <Label>{t("Data fine contratto *")}</Label>
                <Input
                  type="date"
                  value={formData.end_date || ""}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                  min={formData.due_date || undefined}
                />
                {periodsPreview ? (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Repeat className="h-3 w-3" /> {editingCost ? t("Verranno creati {count} nuovi costi aggiuntivi", { count: String(periodsPreview.count ?? "") }) : t("Verranno creati {count} costi da {from} a {to}", { count: String(periodsPreview.count ?? ""), from: String(periodsPreview.from ?? ""), to: String(periodsPreview.to ?? "") })}
                  </p>
                ) : formData.due_date && !formData.end_date && !formData.recurrence_auto ? (
                  <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <Info className="h-3 w-3" /> {t("Senza data fine verrà salvata solo questa scadenza ricorrente")}
                  </p>
                ) : null}

                {/* Auto-generation toggle */}
                <div className="flex items-center gap-3 pt-1 max-sm:hidden">
                  <Switch
                    checked={formData.recurrence_auto || false}
                    onCheckedChange={(v) => setFormData({ ...formData, recurrence_auto: v })}
                  />
                  <Label className="text-sm cursor-pointer" onClick={() => setFormData({ ...formData, recurrence_auto: !formData.recurrence_auto })}>
                    {t("Auto-generazione ricorrente")}
                  </Label>
                </div>
                {formData.recurrence_auto && (
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1 max-sm:hidden">
                    <Repeat className="h-3 w-3" /> {t("I costi futuri verranno generati automaticamente in base alla ricorrenza")}
                  </p>
                )}
              </div>
            )}

            {formData.cost_type === "variable" && (
              <div>
                <Label>{t("Collega a ordine (opzionale)")}</Label>
                <Select value={formData.order_id || "none"} onValueChange={(v) => setFormData({ ...formData, order_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder={t("Nessun ordine")} /></SelectTrigger>
                  <SelectContent>
                    <div className="p-2">
                      <Input
                        placeholder={t("Cerca ordine...")}
                        value={orderSearch}
                        onChange={e => setOrderSearch(e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                    <SelectItem value="none">{t("Nessuno")}</SelectItem>
                    {orders
                      .filter(o =>
                        orderSearch === "" ||
                        (o.order_code || "").toLowerCase().includes(orderSearch.toLowerCase()) ||
                        (o.description || "").toLowerCase().includes(orderSearch.toLowerCase())
                      )
                      .slice(0, 100)
                      .map((o: any) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.order_code}{o.description ? ` — ${o.description.slice(0, 40)}` : ""}
                        </SelectItem>
                      ))
                    }
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="max-sm:hidden">
            <Label>{t("Note")}</Label>
            <Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder={t("Note aggiuntive...")} rows={2} maxLength={200} />
            {formData.notes && (
              <p className="text-[10px] text-muted-foreground text-right">{formData.notes.length}/200</p>
            )}
          </div>

          {/* Centro di Costo — Allocazioni per commessa (solo costi fissi) */}
          {formData.cost_type === "fixed" && (
            <div className="space-y-2 max-sm:hidden">
              <div className="flex items-center justify-between">
                <Label className="text-sm">{t("Alloca a commesse (opzionale)")}</Label>
                <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={addAlloc}>
                  <Plus className="h-3 w-3" /> {t("Aggiungi")}
                </Button>
              </div>
              {allocations.length === 0 ? (
                <p className="text-[10px] text-muted-foreground">{t("Nessuna allocazione — il costo è considerato generale.")}</p>
              ) : (
                <div className="space-y-2">
                  {allocations.map((alloc, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Select value={alloc.order_id || "none"} onValueChange={(v) => updateAlloc(i, "order_id", v === "none" ? "" : v)}>
                        <SelectTrigger className="flex-1 h-8 text-xs"><SelectValue placeholder={t("Ordine...")} /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{t("Nessuno")}</SelectItem>
                          {orders.slice(0, 50).map((o: any) => (
                            <SelectItem key={o.id} value={o.id}>{o.order_code || o.id.substring(0, 8)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number" min={0} max={100} step={1}
                        value={alloc.pct}
                        onChange={(e) => updateAlloc(i, "pct", Number(e.target.value))}
                        className="w-20 h-8 text-sm"
                        placeholder="%"
                      />
                      <span className="text-xs text-muted-foreground">%</span>
                      <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeAlloc(i)}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  ))}
                  <p className="text-[10px] text-muted-foreground">
                    {t("Totale allocato: {pct}%", { pct: allocations.reduce((s, a) => s + a.pct, 0) })}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          {costoVero && (
            <Button variant="ghost" className="text-destructive sm:mr-auto" onClick={() => setAnnulloAperto(true)}>
              {annullato ? t("Ripristina costo") : t("Annulla costo")}
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} className="max-sm:hidden">{t("Chiudi")}</Button>
          <Button
            onClick={handleSubmit}
            disabled={annullato || !formData.name.trim() || !formData.amount || (!formData.due_date && !aTermine) || isSaving}
          >
            {isSaving ? t("Salvataggio...") : editingCost ? t("Aggiorna") : periodsPreview ? t("Crea {count} costi", { count: String(periodsPreview.count ?? "") }) : t("Aggiungi")}
          </Button>
        </DialogFooter>
        {costoVero && (
          <AnnullaCostoDialog
            costId={editingCost!.id}
            nome={editingCost!.name}
            open={annulloAperto}
            onOpenChange={setAnnulloAperto}
            onFatto={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
