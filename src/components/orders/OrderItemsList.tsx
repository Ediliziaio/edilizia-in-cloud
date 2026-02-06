import { useState } from "react";
import { Plus, Trash2, Pencil, Package } from "lucide-react";
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

export type OrderItemStatus = 'da_ordinare' | 'ordinato' | 'in_produzione' | 'consegnato' | 'installato';

export interface OrderItem {
  id?: string;
  name: string;
  description?: string;
  quantity: number;
  status: OrderItemStatus;
  position: number;
  attachments?: OrderItemAttachment[];
}

interface OrderItemsListProps {
  items: OrderItem[];
  onItemsChange: (items: OrderItem[]) => void;
  editable?: boolean;
  showStatusControls?: boolean;
  onAttachmentsRefresh?: () => void;
}

const STATUS_CONFIG: Record<OrderItemStatus, { label: string; color: string }> = {
  da_ordinare: { label: "Da Ordinare", color: "bg-muted text-muted-foreground" },
  ordinato: { label: "Ordinato", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  in_produzione: { label: "In Produzione", color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200" },
  consegnato: { label: "Consegnato", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  installato: { label: "Installato", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200" },
};

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

  const resetForm = () => {
    setItemName("");
    setItemDescription("");
    setItemQuantity("1");
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
    setEditingIndex(index);
    setDialogOpen(true);
  };

  const handleSaveItem = () => {
    if (!itemName.trim()) return;

    const quantity = parseInt(itemQuantity) || 1;
    
    if (editingIndex !== null) {
      // Edit existing item
      const newItems = [...items];
      newItems[editingIndex] = {
        ...newItems[editingIndex],
        name: itemName.trim(),
        description: itemDescription.trim() || undefined,
        quantity,
      };
      onItemsChange(newItems);
    } else {
      // Add new item
      const newItem: OrderItem = {
        name: itemName.trim(),
        description: itemDescription.trim() || undefined,
        quantity,
        status: 'da_ordinare',
        position: items.length,
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
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Package className="h-5 w-5" />
          Articoli dell'Ordine
        </CardTitle>
        {editable && (
          <Button size="sm" onClick={openAddDialog}>
            <Plus className="h-4 w-4 mr-2" />
            Aggiungi
          </Button>
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
                className="p-3 border rounded-lg bg-card space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{item.name}</span>
                      {item.quantity > 1 && (
                        <span className="text-sm text-muted-foreground">(x{item.quantity})</span>
                      )}
                    </div>
                    {item.description && (
                      <p className="text-sm text-muted-foreground truncate">{item.description}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {showStatusControls ? (
                      <Select
                        value={item.status}
                        onValueChange={(value: OrderItemStatus) => handleStatusChange(index, value)}
                      >
                        <SelectTrigger className="w-40">
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
                      <Badge className={STATUS_CONFIG[item.status].color}>
                        {STATUS_CONFIG[item.status].label}
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
                  : "Aggiungi un articolo all'ordine (es: infissi, tapparelle, porte)"}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="item-name">Nome Articolo *</Label>
                <Input
                  id="item-name"
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  placeholder="Es: Finestre soggiorno"
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
