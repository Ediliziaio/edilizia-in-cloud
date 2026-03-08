import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { StickyNote, PackageCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { STATUS_CONFIG } from "@/types/warehouse";
import type { OrderItemStatus, WarehouseItem } from "@/types/warehouse";

interface WarehouseItemRowProps {
  item: WarehouseItem;
  isSelected: boolean;
  onToggleSelection: (itemId: string) => void;
  onStatusChange: (itemId: string, status: OrderItemStatus) => void;
  onUpdateNotes?: (itemId: string, notes: string | null) => void;
  onSelectItem: (item: WarehouseItem) => void;
  supplierName: string | null;
  stockMatch: { id: string; name: string; quantity: number } | null;
  isUpdating: boolean;
  isSupplierGroup: boolean;
}

function ItemNotePopover({ item, onUpdateNotes }: { item: WarehouseItem; onUpdateNotes?: (itemId: string, notes: string | null) => void }) {
  const [noteText, setNoteText] = useState(item.notes || "");
  const [open, setOpen] = useState(false);

  const handleSave = () => {
    onUpdateNotes?.(item.id, noteText.trim() || null);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setNoteText(item.notes || ""); }}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0">
          <StickyNote className={cn("h-3.5 w-3.5", item.notes ? "text-amber-500" : "text-muted-foreground/40")} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="end">
        <Textarea
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          placeholder="Aggiungi nota..."
          className="text-sm min-h-[60px]"
        />
        <div className="flex justify-end gap-2 mt-2">
          {item.notes && (
            <Button variant="ghost" size="sm" onClick={() => { onUpdateNotes?.(item.id, null); setOpen(false); }}>
              Cancella
            </Button>
          )}
          <Button size="sm" onClick={handleSave}>Salva</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

const WarehouseItemRow = React.memo(function WarehouseItemRow({
  item,
  isSelected,
  onToggleSelection,
  onStatusChange,
  onUpdateNotes,
  onSelectItem,
  supplierName,
  stockMatch,
  isUpdating,
  isSupplierGroup,
}: WarehouseItemRowProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between p-2 rounded bg-background border cursor-pointer hover:bg-muted/40 transition-colors",
        isSelected && "ring-1 ring-primary"
      )}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest('[role="checkbox"]') || target.closest('[role="combobox"]') || target.closest('[data-radix-collection-item]')) return;
        onSelectItem(item);
      }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onToggleSelection(item.id)}
        />
        <Badge variant="secondary" className="font-mono text-xs shrink-0">
          {item.quantity || 1}x
        </Badge>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="font-medium text-sm truncate">{item.name}</p>
            {stockMatch && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 text-xs shrink-0 gap-1">
                    <PackageCheck className="h-3 w-3" />
                    {stockMatch.quantity} in stock
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  Disponibile in giacenza: {stockMatch.name} ({stockMatch.quantity} pz)
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          {(supplierName || (isSupplierGroup && item.order.order_code)) && (
            <p className="text-xs text-muted-foreground truncate">
              {isSupplierGroup
                ? `${item.order.order_code || "Ordine"} - ${item.order.customer.first_name} ${item.order.customer.last_name}`
                : supplierName}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1">
        <ItemNotePopover item={item} onUpdateNotes={onUpdateNotes} />
        <Select
          value={item.status}
          onValueChange={(value) => onStatusChange(item.id, value as OrderItemStatus)}
          disabled={isUpdating}
        >
          <SelectTrigger className={cn("w-32 h-8 text-xs border-0 font-medium", (STATUS_CONFIG[item.status] ?? STATUS_CONFIG.da_ordinare).bgColor, (STATUS_CONFIG[item.status] ?? STATUS_CONFIG.da_ordinare).color)}>
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
    </div>
  );
});

export default WarehouseItemRow;
