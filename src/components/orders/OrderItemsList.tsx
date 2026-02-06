import { useState } from "react";
import { Plus, Trash2, Pencil, Package } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { ArticleCombobox } from "./ArticleCombobox";
import { SupplierSelect } from "./SupplierSelect";
import { formatCurrency } from "@/lib/formatters";

export type OrderItemStatus = 'da_ordinare' | 'ordinato' | 'in_magazzino' | 'installato';

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
  attachments?: OrderItemAttachment[];
}

interface OrderItemsListProps {
  items: OrderItem[];
  onItemsChange: (items: OrderItem[]) => void;
  editable?: boolean;
  showStatusControls?: boolean;
  onAttachmentsRefresh?: () => void;
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
}

export function OrderItemsList({
  items,
  onItemsChange,
  editable = true,
  showStatusControls = false,
  onAttachmentsRefresh,
}: OrderItemsListProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [itemName, setItemName] = useState("");
  const [itemDescription, setItemDescription] = useState("");
  const [itemQuantity, setItemQuantity] = useState("1");
  const [itemSupplierId, setItemSupplierId] = useState<string | undefined>();
  const [itemPurchasePrice, setItemPurchasePrice] = useState("");
  const [itemStatus, setItemStatus] = useState<OrderItemStatus>("da_ordinare");

  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  // Fetch suppliers to display names
  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, name")
        .eq("company_id", companyId!);
      if (error) throw error;
      return data as Supplier[];
    },
    enabled: !!companyId,
  });

  const getSupplierName = (supplierId?: string) => {
    if (!supplierId) return null;
    return suppliers.find(s => s.id === supplierId)?.name || null;
  };

  const resetForm = () => {
    setItemName("");
    setItemDescription("");
    setItemQuantity("1");
    setItemSupplierId(undefined);
    setItemPurchasePrice("");
    setItemStatus("da_ordinare");
    setEditingIndex(null);
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
    setItemStatus(item.status);
    setEditingIndex(index);
    setDialogOpen(true);
  };

  const handleSaveItem = () => {
    if (!itemName.trim()) return;

    const quantity = parseInt(itemQuantity) || 1;
    const purchasePrice = parseFloat(itemPurchasePrice) || 0;
    
    if (editingIndex !== null) {
      // Edit existing item
      const newItems = [...items];
      newItems[editingIndex] = {
        ...newItems[editingIndex],
        name: itemName.trim(),
        description: itemDescription.trim() || undefined,
        quantity,
        supplier_id: itemSupplierId,
        purchase_price: purchasePrice,
        status: itemStatus,
      };
      onItemsChange(newItems);
    } else {
      // Add new item
      const newItem: OrderItem = {
        name: itemName.trim(),
        description: itemDescription.trim() || undefined,
        quantity,
        status: itemStatus,
        position: items.length,
        supplier_id: itemSupplierId,
        purchase_price: purchasePrice,
      };
      onItemsChange([...items, newItem]);
    }

    setDialogOpen(false);
    resetForm();
  };

  const handleDeleteItem = (index: number) => {
    const newItems = items.filter((_, i) => i !== index);
    // Update positions
    newItems.forEach((item, i) => {
      item.position = i;
    });
    onItemsChange(newItems);
  };

  const handleStatusChange = (index: number, status: OrderItemStatus) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], status };
    onItemsChange(newItems);
  };

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
        {items.length === 0 ? (
          <p className="text-muted-foreground text-center py-6">
            Nessun articolo aggiunto. {editable && "Clicca su 'Aggiungi' per inserire articoli."}
          </p>
        ) : (
          <div className="space-y-3">
            {items.map((item, index) => (
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
                    </div>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1 flex-wrap">
                      {(item.supplier_id || item.supplier_name) && (
                        <span>Fornitore: {item.supplier_name || getSupplierName(item.supplier_id) || "—"}</span>
                      )}
                      {item.purchase_price && item.purchase_price > 0 && (
                        <span>Costo: {formatCurrency(item.purchase_price * item.quantity)}</span>
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
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(index)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteItem(index)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {/* Attachments section - only show if item has an id (saved to DB) */}
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
            ))}
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

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="item-name">Nome Articolo *</Label>
                <ArticleCombobox
                  value={itemName}
                  onValueChange={setItemName}
                  placeholder="Seleziona o digita nome articolo..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="item-description">Descrizione</Label>
                <Input
                  id="item-description"
                  value={itemDescription}
                  onChange={(e) => setItemDescription(e.target.value)}
                  placeholder="Dettagli aggiuntivi..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="item-quantity">Quantità</Label>
                  <Input
                    id="item-quantity"
                    type="number"
                    min="1"
                    value={itemQuantity}
                    onChange={(e) => setItemQuantity(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="item-price">Costo Acquisto</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">€</span>
                    <Input
                      id="item-price"
                      type="number"
                      min="0"
                      step="0.01"
                      value={itemPurchasePrice}
                      onChange={(e) => setItemPurchasePrice(e.target.value)}
                      className="pl-8"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Stato Articolo</Label>
                <Select value={itemStatus} onValueChange={(v: OrderItemStatus) => setItemStatus(v)}>
                  <SelectTrigger>
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
              </div>

              <div className="space-y-2">
                <Label>Fornitore</Label>
                <SupplierSelect
                  value={itemSupplierId}
                  onValueChange={setItemSupplierId}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Annulla
              </Button>
              <Button onClick={handleSaveItem} disabled={!itemName.trim()}>
                {editingIndex !== null ? "Salva" : "Aggiungi"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
