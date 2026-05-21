import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { SupplierSelect } from "@/components/orders/SupplierSelect";
import { VAT_RATES } from "@/lib/vatUtils";
import type { StockItem } from "@/types/warehouse";
import { format } from "date-fns";

import { COST_CATEGORIES } from "@/types/warehouse";
import { useWarehouseSections } from "@/hooks/useWarehouseSections";
import { EntityCustomFieldsSection } from "@/components/shared/EntityCustomFieldsSection";

interface StockItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: {
    name: string;
    description?: string;
    quantity: number;
    unit_cost: number;
    vat_rate: number;
    supplier_id?: string;
    section_id?: string;
    min_stock_level: number;
    // ── QR system (MP1 P0) ──────────────────────────────
    barcode?: string | null;
    internal_code?: string | null;
    tracking_mode?: "fungible" | "serialized";
    requires_warranty?: boolean;
    default_warranty_months?: number | null;
    // ── Cost registration ────────────────────────────────
    registerCost?: boolean;
    costPaidDate?: string;
    costCategory?: string;
  }) => void;
  editingItem?: StockItem | null;
  isPending?: boolean;
  /** Pre-compila il barcode (es. quando si crea articolo da una scansione no-match). */
  prefillBarcode?: string;
  /** Pre-compila il fornitore (utile dal flow scan). */
  prefillSupplierId?: string;
  /** v8.6.111 — Lista di seriali (es. da QR pallet multi-seriale). Quando
   *  fornita: tracking_mode = serialized di default, quantity = lista.length,
   *  e onSave include i seriali per creazione stock_units. */
  prefillSerials?: string[];
}

export function StockItemDialog({
  open,
  onOpenChange,
  onSave,
  editingItem,
  isPending,
  prefillBarcode,
  prefillSupplierId,
  prefillSerials,
}: StockItemDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("0");
  const [unitCost, setUnitCost] = useState("0");
  const [vatRate, setVatRate] = useState<number>(22);
  const [supplierId, setSupplierId] = useState<string | undefined>();
  const [minStockLevel, setMinStockLevel] = useState("0");
  const [sectionId, setSectionId] = useState<string | undefined>();
  const [registerCost, setRegisterCost] = useState(false);
  const [costPaidDate, setCostPaidDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [costCategory, setCostCategory] = useState("Magazzino");

  // ── QR system (MP1 P0) ──────────────────────────────
  const [barcode, setBarcode] = useState("");
  const [internalCode, setInternalCode] = useState("");
  const [trackingMode, setTrackingMode] = useState<"fungible" | "serialized">("fungible");
  const [requiresWarranty, setRequiresWarranty] = useState(false);
  const [defaultWarrantyMonths, setDefaultWarrantyMonths] = useState("");

  const { sections } = useWarehouseSections();

  useEffect(() => {
    if (editingItem) {
      setName(editingItem.name);
      setDescription(editingItem.description || "");
      setQuantity(editingItem.quantity.toString());
      setUnitCost(editingItem.unit_cost.toString());
      setVatRate(editingItem.vat_rate ?? 22);
      setSupplierId(editingItem.supplier_id || undefined);
      setSectionId(editingItem.section_id || undefined);
      setMinStockLevel(editingItem.min_stock_level.toString());
      setRegisterCost(false);
      setBarcode(editingItem.barcode ?? "");
      setInternalCode(editingItem.internal_code ?? "");
      setTrackingMode(editingItem.tracking_mode ?? "fungible");
      setRequiresWarranty(!!editingItem.requires_warranty);
      setDefaultWarrantyMonths(
        editingItem.default_warranty_months != null
          ? String(editingItem.default_warranty_months)
          : "",
      );
    } else {
      setName("");
      setDescription("");
      // v8.6.111 — Se ci sono prefillSerials (es. QR pallet con 36 codici),
      // pre-popolo quantity con il count e tracking_mode='serialized'.
      const hasMultiSerials = (prefillSerials?.length ?? 0) >= 2;
      setQuantity(hasMultiSerials ? String(prefillSerials!.length) : "0");
      setUnitCost("0");
      setVatRate(22);
      setSupplierId(prefillSupplierId);
      setSectionId(undefined);
      setMinStockLevel("0");
      setRegisterCost(false);
      setCostPaidDate(format(new Date(), "yyyy-MM-dd"));
      setCostCategory("Magazzino");
      setBarcode(prefillBarcode ?? "");
      setInternalCode("");
      setTrackingMode(hasMultiSerials ? "serialized" : "fungible");
      setRequiresWarranty(false);
      setDefaultWarrantyMonths("");
    }
  }, [editingItem, open, prefillBarcode, prefillSupplierId, prefillSerials]);

  // Coerenza: garanzia obbligatoria → forza serialized (un singolo pezzo
  // deve poter essere tracciato per associare la garanzia al seriale).
  useEffect(() => {
    if (requiresWarranty && trackingMode === "fungible") {
      setTrackingMode("serialized");
    }
  }, [requiresWarranty, trackingMode]);

  const handleSave = () => {
    if (!name.trim()) return;
    const warrantyMonthsNum = defaultWarrantyMonths.trim()
      ? parseInt(defaultWarrantyMonths, 10)
      : null;
    onSave({
      name: name.trim(),
      description: description.trim() || undefined,
      quantity: parseInt(quantity) || 0,
      unit_cost: parseFloat(unitCost) || 0,
      vat_rate: vatRate,
      supplier_id: supplierId,
      section_id: sectionId,
      min_stock_level: parseInt(minStockLevel) || 0,
      barcode: barcode.trim() || null,
      internal_code: internalCode.trim() || null,
      tracking_mode: trackingMode,
      requires_warranty: requiresWarranty,
      default_warranty_months: Number.isFinite(warrantyMonthsNum as number) ? warrantyMonthsNum : null,
      ...(registerCost && !editingItem
        ? { registerCost: true, costPaidDate, costCategory }
        : {}),
    });
  };

  const isCreating = !editingItem;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editingItem ? "Modifica Articolo" : "Nuovo Articolo in Giacenza"}
          </DialogTitle>
          <DialogDescription>
            {editingItem
              ? "Modifica i dettagli dell'articolo in magazzino"
              : "Aggiungi un articolo al magazzino"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* v8.6.111 — Banner per QR multi-seriale: N codici gia scansionati,
              verranno collegati come stock_units di questo articolo. */}
          {!editingItem && (prefillSerials?.length ?? 0) >= 2 && (
            <div className="rounded-lg border-2 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-700 p-3 space-y-2">
              <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
                {prefillSerials!.length} seriali rilevati dal QR pallet
              </p>
              <p className="text-xs text-emerald-800 dark:text-emerald-200">
                Quantità precompilata. Tracking impostato su <strong>serialized</strong>.
                Ogni seriale verrà creato come unità separata sotto questo articolo.
              </p>
              <details className="text-xs">
                <summary className="cursor-pointer text-emerald-700 dark:text-emerald-300 hover:underline">
                  Vedi i {prefillSerials!.length} seriali
                </summary>
                <div className="mt-1.5 max-h-32 overflow-y-auto bg-white dark:bg-emerald-950/60 rounded p-1.5 font-mono text-[10px] text-emerald-900 dark:text-emerald-200 space-y-0.5">
                  {prefillSerials!.map((s, i) => (
                    <div key={i}>{i + 1}. {s}</div>
                  ))}
                </div>
              </details>
            </div>
          )}

          <div className="space-y-2">
            <Label>Nome Articolo *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Es: Motore tapparella"
            />
          </div>

          <div className="space-y-2">
            <Label>Descrizione</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Dettagli aggiuntivi..."
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Quantità</Label>
              <Input
                type="number"
                min="0"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Costo Unitario (€)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">€</span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={unitCost}
                  onChange={(e) => setUnitCost(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>IVA</Label>
              <Select
                value={vatRate.toString()}
                onValueChange={(v) => setVatRate(parseInt(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VAT_RATES.map((rate) => (
                    <SelectItem key={rate.value} value={rate.value.toString()}>
                      {rate.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Soglia Minima</Label>
              <Input
                type="number"
                min="0"
                value={minStockLevel}
                onChange={(e) => setMinStockLevel(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Fornitore</Label>
            <SupplierSelect
              value={supplierId}
              onValueChange={(id, vr) => {
                setSupplierId(id);
                if (vr !== undefined) setVatRate(vr);
              }}
            />
          </div>

          {sections.length > 0 && (
            <div className="space-y-2">
              <Label>Zona Magazzino</Label>
              <Select
                value={sectionId || "__none__"}
                onValueChange={(v) => setSectionId(v === "__none__" ? undefined : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Nessuna zona" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nessuna zona</SelectItem>
                  {sections.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                        {s.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* ── QR & Tracking (MP1 P0) ───────────────────────── */}
          <Accordion type="single" collapsible className="border rounded-lg">
            <AccordionItem value="qr-tracking" className="border-0">
              <AccordionTrigger className="px-3 py-2 hover:no-underline">
                <div className="flex flex-col items-start text-left">
                  <span className="text-sm font-medium">QR & Tracking</span>
                  <span className="text-xs text-muted-foreground">
                    {trackingMode === "serialized" ? "Seriali per pezzo" : "Articolo identico"}
                    {barcode ? ` · barcode: ${barcode.slice(0, 16)}${barcode.length > 16 ? "…" : ""}` : ""}
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-3 pb-3 space-y-3">
                <div className="space-y-2">
                  <Label className="text-xs">Barcode / QR fornitore</Label>
                  <Input
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    placeholder="Es. 8001234567890 o GTIN"
                    autoComplete="off"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Codice stampato dal fornitore. Lasciato vuoto = nessun match QR su questo articolo.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Codice interno</Label>
                  <Input
                    value={internalCode}
                    onChange={(e) => setInternalCode(e.target.value)}
                    placeholder="Es. EIC-MOTOR-A12"
                    autoComplete="off"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Codice interno su etichette stampate da te (alternativo al QR fornitore).
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Modalità tracking</Label>
                  <Select
                    value={trackingMode}
                    onValueChange={(v) => setTrackingMode(v as "fungible" | "serialized")}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fungible">
                        <span className="font-medium">Fungibile</span>{" "}
                        <span className="text-muted-foreground">— articoli identici (viti, tubi)</span>
                      </SelectItem>
                      <SelectItem value="serialized">
                        <span className="font-medium">Serializzato</span>{" "}
                        <span className="text-muted-foreground">— ogni pezzo ha seriale univoco</span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-start gap-2 pt-1">
                  <Checkbox
                    id="requires-warranty"
                    checked={requiresWarranty}
                    onCheckedChange={(checked) => setRequiresWarranty(checked === true)}
                  />
                  <div className="flex-1">
                    <Label htmlFor="requires-warranty" className="text-sm font-medium cursor-pointer">
                      Garanzia obbligatoria
                    </Label>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Forza tracking serializzato per associare ogni garanzia al seriale.
                    </p>
                  </div>
                </div>

                {(requiresWarranty || trackingMode === "serialized") && (
                  <div className="space-y-2">
                    <Label className="text-xs">Mesi garanzia di default</Label>
                    <Input
                      type="number"
                      min="0"
                      value={defaultWarrantyMonths}
                      onChange={(e) => setDefaultWarrantyMonths(e.target.value)}
                      placeholder="Es. 24"
                    />
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          {/* Cost registration toggle - only for new items */}
          {isCreating && (
            <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="register-cost"
                  checked={registerCost}
                  onCheckedChange={(checked) => setRegisterCost(checked === true)}
                />
                <Label htmlFor="register-cost" className="text-sm font-medium cursor-pointer">
                  Registra costo acquisto nei Costi Aziendali
                </Label>
              </div>
              {registerCost && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Data pagamento</Label>
                    <Input
                      type="date"
                      value={costPaidDate}
                      onChange={(e) => setCostPaidDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Categoria</Label>
                    <Select value={costCategory} onValueChange={setCostCategory}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {COST_CATEGORIES.map((cat) => (
                          <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* v8.6.113 — Custom fields per articoli magazzino (object_type='warehouse').
              Visibile solo in editing mode (serve un id per linkare i valori).
              Configura i campi in Impostazioni -> Campi personalizzati. */}
          {editingItem?.id && (
            <div className="pt-3 border-t">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Campi personalizzati
              </p>
              <EntityCustomFieldsSection entityType="warehouse" entityId={editingItem.id} />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || isPending}>
            {isPending ? "Salvataggio..." : editingItem ? "Salva" : "Aggiungi"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
