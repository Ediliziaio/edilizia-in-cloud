import { useState } from "react";
import { Plus, Trash2, Pencil, Package, Warehouse, CheckCircle, Clock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OrderItemAttachments, OrderItemAttachment } from "./OrderItemAttachments";
import { ArticleCombobox, ArticleTemplateData } from "./ArticleCombobox";
import { SupplierSelect } from "./SupplierSelect";
import { formatCurrency } from "@/lib/formatters";
import { VAT_RATES } from "@/lib/vatUtils";
import type { StockItem } from "@/types/warehouse";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { cn } from "@/lib/utils";

export type OrderItemStatus = 'da_ordinare' | 'ordinato' | 'in_magazzino' | 'installato';

export const PAYMENT_METHODS = [
  { value: "bonifico_unico", label: "Bonifico unico" },
  { value: "50_50", label: "50% acconto + 50% saldo" },
  { value: "30_70", label: "30% acconto + 70% saldo" },
  { value: "riba", label: "RIBA" },
  { value: "contanti", label: "Contanti" },
  { value: "altro", label: "Altro" },
] as const;

export interface OrderItem {
  id?: string;
  name: string;
  description?: string;
  quantity: number;
  status: OrderItemStatus;
  position: number;
  supplier_id?: string;
  supplier_name?: string;
  purchase_price?: number;
  vat_rate?: number;
  stock_item_id?: string;
  attachments?: OrderItemAttachment[];
  is_paid?: boolean;
  paid_date?: string;
  payment_method?: string;
  // Legacy fields kept for backwards compat
  unit_price?: number;
  discount_percent?: number;
  standard_cost?: number;
}

interface OrderItemsListProps {
  items: OrderItem[];
  onItemsChange: (items: OrderItem[]) => void;
  editable?: boolean;
  showStatusControls?: boolean;
  onAttachmentsRefresh?: () => void;
  onStockPick?: (stockItemId: string, quantity: number) => void;
}

const STATUS_CONFIG: Record<OrderItemStatus, { label: string; badgeColor: string; borderColor: string }> = {
  da_ordinare: { 
    label: "Da Ordinare", 
    badgeColor: "bg-amber-500 text-white hover:bg-amber-500",
    borderColor: "border-l-4 border-l-amber-500 bg-amber-50 dark:bg-amber-950/20"
  },
  ordinato: { 
    label: "Ordinato", 
    badgeColor: "bg-blue-500 text-white hover:bg-blue-500",
    borderColor: "border-l-4 border-l-blue-500 bg-blue-50 dark:bg-blue-950/20"
  },
  in_magazzino: { 
    label: "In Magazzino", 
    badgeColor: "bg-emerald-500 text-white hover:bg-emerald-500",
    borderColor: "border-l-4 border-l-emerald-500 bg-emerald-50 dark:bg-emerald-950/20"
  },
  installato: { 
    label: "Installato", 
    badgeColor: "bg-purple-500 text-white hover:bg-purple-500",
    borderColor: "border-l-4 border-l-purple-500 bg-purple-50 dark:bg-purple-950/20"
  },
};

interface Supplier {
  id: string;
  name: string;
  vat_rate: number;
}

export function OrderItemsList({
  items,
  onItemsChange,
  editable = true,
  showStatusControls = false,
  onAttachmentsRefresh,
  onStockPick,
}: OrderItemsListProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [dialogTab, setDialogTab] = useState<"new" | "stock">("new");
  const [itemName, setItemName] = useState("");
  const [itemDescription, setItemDescription] = useState("");
  const [itemQuantity, setItemQuantity] = useState("1");
  const [itemSupplierId, setItemSupplierId] = useState<string | undefined>();
  const [itemPurchasePrice, setItemPurchasePrice] = useState("");
  const [itemVatRate, setItemVatRate] = useState<number>(22);
  const [itemStatus, setItemStatus] = useState<OrderItemStatus>("da_ordinare");
  const [itemIsPaid, setItemIsPaid] = useState(false);
  const [itemPaidDate, setItemPaidDate] = useState<Date | undefined>();
  const [itemPaymentMethod, setItemPaymentMethod] = useState<string>("");
  // Stock picking state
  const [selectedStockItem, setSelectedStockItem] = useState<string>("");
  const [stockPickQuantity, setStockPickQuantity] = useState("1");

  const [sourceFilter, setSourceFilter] = useState<"all" | "stock" | "supplier">("all");

  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  // Fetch suppliers to display names and get VAT rates
  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, name, vat_rate")
        .eq("company_id", companyId!);
      if (error) throw error;
      return data as Supplier[];
    },
    enabled: !!companyId,
  });

  // Fetch warehouse stock for picking
  const { data: stockItems = [] } = useQuery({
    queryKey: ["warehouse-stock", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouse_stock")
        .select("*")
        .eq("company_id", companyId!)
        .gt("quantity", 0)
        .order("name");
      if (error) throw error;
      return data as StockItem[];
    },
    enabled: !!companyId,
  });

  const getSupplierName = (supplierId?: string) => {
    if (!supplierId) return null;
    return suppliers.find(s => s.id === supplierId)?.name || null;
  };

  const getPaymentMethodLabel = (value?: string) => {
    if (!value) return null;
    return PAYMENT_METHODS.find(m => m.value === value)?.label || value;
  };

  const resetForm = () => {
    setItemName("");
    setItemDescription("");
    setItemQuantity("1");
    setItemSupplierId(undefined);
    setItemPurchasePrice("");
    setItemVatRate(22);
    setItemStatus("da_ordinare");
    setItemIsPaid(false);
    setItemPaidDate(undefined);
    setItemPaymentMethod("");
    setEditingIndex(null);
    setSelectedStockItem("");
    setStockPickQuantity("1");
    setDialogTab("new");
  };

  const openAddDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = (index: number) => {
    const item = items[index];
    setItemName(item.name);
    setItemDescription(item.description || "");
    setItemQuantity(item.quantity.toString());
    setItemSupplierId(item.supplier_id);
    setItemPurchasePrice(item.purchase_price?.toString() || "");
    setItemVatRate(item.vat_rate ?? 22);
    setItemStatus(item.status);
    setItemIsPaid(item.is_paid || false);
    setItemPaidDate(item.paid_date ? new Date(item.paid_date) : undefined);
    setItemPaymentMethod(item.payment_method || "");
    setEditingIndex(index);
    setDialogOpen(true);
  };

  const handleSaveItem = () => {
    if (!itemName.trim()) return;

    const quantity = Math.max(1, Math.round(parseInt(itemQuantity) || 1));
    const purchasePrice = Math.max(0, parseFloat(itemPurchasePrice) || 0);
    
    const commonFields = {
      name: itemName.trim(),
      description: itemDescription.trim() || undefined,
      quantity,
      supplier_id: itemSupplierId,
      purchase_price: purchasePrice,
      vat_rate: itemVatRate,
      status: itemStatus,
      is_paid: itemIsPaid,
      paid_date: itemIsPaid && itemPaidDate ? itemPaidDate.toISOString().split("T")[0] : undefined,
      payment_method: itemPaymentMethod || undefined,
      // Legacy fields zeroed out
      unit_price: 0,
      discount_percent: 0,
      standard_cost: 0,
    };

    if (editingIndex !== null) {
      const newItems = [...items];
      newItems[editingIndex] = {
        ...newItems[editingIndex],
        ...commonFields,
      };
      onItemsChange(newItems);
    } else {
      const newItem: OrderItem = {
        ...commonFields,
        position: items.length,
      };
      onItemsChange([...items, newItem]);
    }

    setDialogOpen(false);
    resetForm();
  };

  const handleArticleSelect = (name: string, templateData?: ArticleTemplateData) => {
    setItemName(name);
    if (templateData) {
      if (templateData.standard_cost > 0) {
        setItemPurchasePrice(templateData.standard_cost.toString());
      }
      if (templateData.vat_rate !== undefined) setItemVatRate(templateData.vat_rate);
      if (templateData.supplier_id) setItemSupplierId(templateData.supplier_id);
      if (templateData.description) setItemDescription(templateData.description);
    }
  };

  const handleSupplierChange = (supplierId: string | undefined, supplierVatRate?: number) => {
    setItemSupplierId(supplierId);
    if (supplierVatRate !== undefined) {
      setItemVatRate(supplierVatRate);
    }
  };

  const handleDeleteItem = (index: number) => {
    const newItems = items.filter((_, i) => i !== index);
    newItems.forEach((item, i) => { item.position = i; });
    onItemsChange(newItems);
  };

  const handleStatusChange = (index: number, status: OrderItemStatus) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], status };
    onItemsChange(newItems);
  };

  const handlePickFromStock = () => {
    const stock = stockItems.find((s) => s.id === selectedStockItem);
    if (!stock) return;
    const qty = parseInt(stockPickQuantity) || 1;
    if (qty <= 0 || qty > stock.quantity) return;

    const newItem: OrderItem = {
      name: stock.name,
      description: stock.description || undefined,
      quantity: qty,
      status: "in_magazzino",
      position: items.length,
      supplier_id: stock.supplier_id || undefined,
      purchase_price: stock.unit_cost,
      vat_rate: stock.vat_rate ?? 22,
      stock_item_id: stock.id,
    };
    onItemsChange([...items, newItem]);
    onStockPick?.(stock.id, qty);
    setDialogOpen(false);
    resetForm();
  };

  const renderNewArticleForm = () => (
    <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
      <div className="space-y-2">
        <Label>Nome Articolo *</Label>
        <ArticleCombobox value={itemName} onValueChange={handleArticleSelect} placeholder="Seleziona o digita nome articolo..." />
      </div>
      <div className="space-y-2">
        <Label>Descrizione</Label>
        <Input value={itemDescription} onChange={(e) => setItemDescription(e.target.value)} placeholder="Dettagli aggiuntivi..." />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Quantità</Label>
          <Input type="number" min="1" value={itemQuantity} onChange={(e) => setItemQuantity(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Costo Acquisto</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">€</span>
            <Input type="number" min="0" step="0.01" value={itemPurchasePrice} onChange={(e) => setItemPurchasePrice(e.target.value)} className="pl-8" placeholder="0.00" />
          </div>
        </div>
      </div>
      <div className="space-y-2">
        <Label>IVA Acquisto</Label>
        <Select value={itemVatRate.toString()} onValueChange={(v) => setItemVatRate(parseInt(v))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {VAT_RATES.map((rate) => (
              <SelectItem key={rate.value} value={rate.value.toString()}>{rate.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Stato Articolo</Label>
        <Select value={itemStatus} onValueChange={(v: OrderItemStatus) => setItemStatus(v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(STATUS_CONFIG).map(([status, config]) => (
              <SelectItem key={status} value={status}>{config.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Fornitore</Label>
        <SupplierSelect value={itemSupplierId} onValueChange={handleSupplierChange} />
      </div>

      {/* Supplier Payment Status Section */}
      <div className="border-t pt-4 space-y-3">
        <Label className="text-sm font-semibold">Stato Pagamento Fornitore</Label>
        <div className="space-y-2">
          <Label>Modalità Pagamento</Label>
          <Select value={itemPaymentMethod} onValueChange={setItemPaymentMethod}>
            <SelectTrigger><SelectValue placeholder="Seleziona modalità..." /></SelectTrigger>
            <SelectContent>
              {PAYMENT_METHODS.map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between">
          <Label>Pagato</Label>
          <Switch checked={itemIsPaid} onCheckedChange={setItemIsPaid} />
        </div>
        {itemIsPaid && (
          <div className="space-y-2">
            <Label>Data Pagamento</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn("w-full justify-start text-left font-normal", !itemPaidDate && "text-muted-foreground")}
                  type="button"
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {itemPaidDate ? format(itemPaidDate, "dd/MM/yyyy", { locale: it }) : "Seleziona data..."}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar mode="single" selected={itemPaidDate} onSelect={setItemPaidDate} locale={it} />
              </PopoverContent>
            </Popover>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Articoli dell'Ordine
          </CardTitle>
          {editable && (
            <Button type="button" size="sm" onClick={openAddDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Aggiungi
            </Button>
          )}
        </div>
        {/* Status summary chips */}
        {items.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {(Object.entries(
              items.reduce((acc, item) => {
                acc[item.status] = (acc[item.status] || 0) + 1;
                return acc;
              }, {} as Record<OrderItemStatus, number>)
            ) as [OrderItemStatus, number][]).map(([status, count]) => (
              <span
                key={status}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_CONFIG[status].badgeColor}`}
              >
                {count} {STATUS_CONFIG[status].label}
              </span>
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent>
        {/* Source filter */}
        {items.length > 0 && (
          <div className="flex items-center gap-2 mb-4">
            <span className="text-sm text-muted-foreground">Filtra:</span>
            <div className="flex gap-1">
              <Button type="button" variant={sourceFilter === "all" ? "default" : "outline"} size="sm" className="h-7 text-xs" onClick={() => setSourceFilter("all")}>Tutti</Button>
              <Button type="button" variant={sourceFilter === "stock" ? "default" : "outline"} size="sm" className="h-7 text-xs gap-1" onClick={() => setSourceFilter("stock")}>
                <Warehouse className="h-3 w-3" />Da Giacenza
              </Button>
              <Button type="button" variant={sourceFilter === "supplier" ? "default" : "outline"} size="sm" className="h-7 text-xs gap-1" onClick={() => setSourceFilter("supplier")}>
                <Package className="h-3 w-3" />Da Fornitore
              </Button>
            </div>
          </div>
        )}
        {items.length === 0 ? (
          <p className="text-muted-foreground text-center py-6">
            Nessun articolo aggiunto. {editable && "Clicca su 'Aggiungi' per inserire articoli."}
          </p>
        ) : (
          <div className="space-y-3">
            {items
              .filter(item => {
                if (sourceFilter === "stock") return !!item.stock_item_id;
                if (sourceFilter === "supplier") return !item.stock_item_id;
                return true;
              })
              .map((item) => {
                const index = items.indexOf(item);
                return (
              <div
                key={item.id || index}
                className={`p-3 rounded-lg space-y-2 ${STATUS_CONFIG[item.status]?.borderColor || STATUS_CONFIG.da_ordinare.borderColor}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{item.name}</span>
                      {item.quantity > 1 && (
                        <span className="text-sm text-muted-foreground">(x{item.quantity})</span>
                      )}
                      {item.stock_item_id ? (
                        <Badge className="text-xs bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-700 gap-1">
                          <Warehouse className="h-3 w-3" />
                          Da Giacenza
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs gap-1">
                          <Package className="h-3 w-3" />
                          Da Fornitore
                        </Badge>
                      )}
                      {/* Payment status badge */}
                      {item.is_paid ? (
                        <Badge className="text-xs bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-700 gap-1">
                          <CheckCircle className="h-3 w-3" />
                          Pagato
                        </Badge>
                      ) : (
                        <Badge className="text-xs bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-700 gap-1">
                          <Clock className="h-3 w-3" />
                          Non pagato
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1 flex-wrap">
                      {(item.supplier_id || item.supplier_name) && (
                        <span>Fornitore: {item.supplier_name || getSupplierName(item.supplier_id) || "—"}</span>
                      )}
                      {item.purchase_price != null && item.purchase_price > 0 && (
                        <>
                          <span>Costo: {formatCurrency(item.purchase_price * item.quantity)}</span>
                          <span className="text-xs">({item.vat_rate ?? 22}% IVA)</span>
                        </>
                      )}
                      {item.payment_method && (
                        <span>Mod.: {getPaymentMethodLabel(item.payment_method)}</span>
                      )}
                    </div>
                    {item.description && (
                      <p className="text-sm text-muted-foreground truncate mt-1">{item.description}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {showStatusControls ? (
                      <Select
                        value={item.status}
                        onValueChange={(value: OrderItemStatus) => handleStatusChange(index, value)}
                      >
                        <SelectTrigger className="w-36">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(STATUS_CONFIG).map(([status, config]) => (
                            <SelectItem key={status} value={status}>
                              {config.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge className={STATUS_CONFIG[item.status]?.badgeColor || STATUS_CONFIG.da_ordinare.badgeColor}>
                        {STATUS_CONFIG[item.status]?.label || "Da Ordinare"}
                      </Badge>
                    )}

                    {editable && (
                      <>
                        <Button variant="ghost" size="icon" onClick={() => openEditDialog(index)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteItem(index)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {/* Attachments section */}
                {item.id && (
                  <div className="pt-2 border-t">
                    <OrderItemAttachments
                      itemId={item.id}
                      itemName={item.name}
                      attachments={item.attachments || []}
                      editable={editable || showStatusControls}
                      onAttachmentsChange={() => onAttachmentsRefresh?.()}
                    />
                  </div>
                )}
              </div>
            );
              })}
          </div>
        )}

        {/* Add/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editingIndex !== null ? "Modifica Articolo" : "Nuovo Articolo"}
              </DialogTitle>
              <DialogDescription>
                {editingIndex !== null
                  ? "Modifica i dettagli dell'articolo"
                  : "Aggiungi un articolo all'ordine"}
              </DialogDescription>
            </DialogHeader>

            {editingIndex === null && stockItems.length > 0 ? (
              <Tabs value={dialogTab} onValueChange={(v) => setDialogTab(v as "new" | "stock")}>
                <TabsList className="w-full">
                  <TabsTrigger value="new" className="flex-1 gap-1">
                    <Plus className="h-3 w-3" />
                    Nuovo Articolo
                  </TabsTrigger>
                  <TabsTrigger value="stock" className="flex-1 gap-1">
                    <Warehouse className="h-3 w-3" />
                    Da Magazzino
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="new">
                  {renderNewArticleForm()}
                  <DialogFooter className="mt-4">
                    <Button variant="outline" onClick={() => setDialogOpen(false)}>Annulla</Button>
                    <Button onClick={handleSaveItem} disabled={!itemName.trim()}>Aggiungi</Button>
                  </DialogFooter>
                </TabsContent>

                <TabsContent value="stock">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Articolo da Magazzino *</Label>
                      <Select value={selectedStockItem} onValueChange={setSelectedStockItem}>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleziona articolo..." />
                        </SelectTrigger>
                        <SelectContent>
                          {stockItems.map((stock) => (
                            <SelectItem key={stock.id} value={stock.id}>
                              {stock.name} — Disp: {stock.quantity} — {formatCurrency(stock.unit_cost)}/pz
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {selectedStockItem && (() => {
                      const stock = stockItems.find((s) => s.id === selectedStockItem);
                      if (!stock) return null;
                      return (
                        <div className="space-y-3">
                          <div className="p-3 rounded-lg bg-muted/50 text-sm space-y-1">
                            <div className="flex justify-between"><span>Costo unitario:</span><span className="font-medium">{formatCurrency(stock.unit_cost)}</span></div>
                            <div className="flex justify-between"><span>Disponibili:</span><span className="font-medium">{stock.quantity}</span></div>
                            {stock.description && <p className="text-muted-foreground">{stock.description}</p>}
                          </div>
                          <div className="space-y-2">
                            <Label>Quantità da prelevare</Label>
                            <Input type="number" min="1" max={stock.quantity} value={stockPickQuantity} onChange={(e) => setStockPickQuantity(e.target.value)} />
                            {parseInt(stockPickQuantity) > stock.quantity && (
                              <p className="text-xs text-destructive">Quantità superiore alla disponibilità</p>
                            )}
                          </div>
                          <div className="p-3 rounded-lg bg-muted/50 text-sm">
                            <div className="flex justify-between font-medium">
                              <span>Costo totale:</span>
                              <span>{formatCurrency(stock.unit_cost * (parseInt(stockPickQuantity) || 0))}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                  <DialogFooter className="mt-4">
                    <Button variant="outline" onClick={() => setDialogOpen(false)}>Annulla</Button>
                    <Button
                      onClick={handlePickFromStock}
                      disabled={!selectedStockItem || !parseInt(stockPickQuantity) || parseInt(stockPickQuantity) > (stockItems.find((s) => s.id === selectedStockItem)?.quantity || 0)}
                    >
                      <Warehouse className="h-4 w-4 mr-2" />
                      Preleva
                    </Button>
                  </DialogFooter>
                </TabsContent>
              </Tabs>
            ) : (
              <>
                {renderNewArticleForm()}
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>Annulla</Button>
                  <Button onClick={handleSaveItem} disabled={!itemName.trim()}>
                    {editingIndex !== null ? "Salva" : "Aggiungi"}
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
