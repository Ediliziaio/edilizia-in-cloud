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
import { MapPin, StickyNote, PackageCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { STATUS_CONFIG } from "@/types/warehouse";
import type { OrderItemStatus, WarehouseItem } from "@/types/warehouse";

interface WarehouseSection {
  id: string;
  name: string;
}

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
  // M9 — dropdown sezione mobile
  sections?: WarehouseSection[];
  onSectionChange?: (itemId: string, sectionId: string | null) => void;
  readOnly?: boolean;
}

function ItemNotePopover({
  item,
  onUpdateNotes,
}: {
  item: WarehouseItem;
  onUpdateNotes?: (itemId: string, notes: string | null) => void;
}) {
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
  sections = [],
  onSectionChange,
  readOnly = false,
}: WarehouseItemRowProps) {
  const statusConfig = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.da_ordinare;

  return (
    <div
      className={cn(
        "flex flex-col gap-2 p-2.5 rounded bg-background border cursor-pointer hover:bg-muted/40 transition-colors sm:flex-row sm:items-center sm:justify-between",
        isSelected && "ring-1 ring-primary"
      )}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest('[role="checkbox"]') || target.closest('[role="combobox"]') || target.closest('[data-radix-collection-item]')) return;
        onSelectItem(item);
      }}
    >
      <div className="flex items-start gap-2 min-w-0 flex-1 sm:items-center sm:gap-3">
        {!readOnly && (
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => onToggleSelection(item.id)}
            className="mt-0.5 sm:mt-0"
          />
        )}
        <Badge variant="secondary" className="font-mono text-xs shrink-0">
          {item.quantity || 1}x
        </Badge>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="min-w-0 flex-1 text-sm font-semibold leading-snug text-foreground">
              {item.name}
            </p>
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
                ? `${item.order.order_code || "Ordine"} - ${item.order.customer?.first_name ?? ""} ${item.order.customer?.last_name ?? ""}`.trim()
                : supplierName}
            </p>
          )}
          {/* M9/B7 — dropdown sezione visibile solo su mobile (la mappa è hidden su mobile) */}
          {!readOnly && onSectionChange && sections.length > 0 && (
            <div className="flex sm:hidden items-center gap-1.5 mt-1" onClick={e => e.stopPropagation()}>
              <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
              <Select
                value={item.section_id || "__none__"}
                onValueChange={(val) => onSectionChange(item.id, val === "__none__" ? null : val)}
              >
                <SelectTrigger className="h-6 text-xs flex-1 border-dashed">
                  <span className="truncate">Zona...</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nessuna zona</SelectItem>
                  {sections.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>

      <div className="flex w-full items-center justify-between gap-2 pl-8 sm:w-auto sm:justify-end sm:pl-0 sm:shrink-0" onClick={(e) => e.stopPropagation()}>
        {!readOnly && <ItemNotePopover item={item} onUpdateNotes={onUpdateNotes} />}
        {readOnly ? (
          <Badge
            variant="outline"
            className={cn(
              "min-w-[132px] justify-center border text-xs font-semibold",
              statusConfig.bgColor,
              statusConfig.color,
            )}
          >
            {statusConfig.label}
          </Badge>
        ) : (
          <Select
            value={item.status}
            onValueChange={(value) => onStatusChange(item.id, value as OrderItemStatus)}
            disabled={isUpdating}
          >
            <SelectTrigger
              className={cn(
                "h-8 min-w-[150px] flex-1 border text-xs font-semibold sm:w-[156px] sm:flex-none [&>span]:line-clamp-1",
                statusConfig.bgColor,
                statusConfig.color
              )}
            >
              <span className="truncate">{statusConfig.label}</span>
            </SelectTrigger>
            <SelectContent>
              {Object.entries(STATUS_CONFIG).map(([status, config]) => (
                <SelectItem key={status} value={status}>
                  {config.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  );
});

export default WarehouseItemRow;
