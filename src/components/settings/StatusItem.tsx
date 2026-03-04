import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2, icons } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IconPicker } from "./IconPicker";
import { ColorPicker } from "./ColorPicker";
import type { OrderStatus } from "@/components/orders/OrderProgressTracker";

interface StatusItemProps {
  status: OrderStatus;
  onUpdate: (id: string, updates: Partial<OrderStatus>) => void;
  onDelete: (id: string) => void;
  canDelete: boolean;
}

export function StatusItem({ status, onUpdate, onDelete, canDelete }: StatusItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: status.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const IconComponent = icons[status.icon as keyof typeof icons] || icons.Circle;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-3 p-3 rounded-lg border bg-card",
        isDragging && "shadow-lg opacity-90 z-50"
      )}
    >
      {/* Drag handle */}
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-5 w-5" />
      </button>

      {/* Position badge */}
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium shrink-0"
        style={{ backgroundColor: status.color }}
      >
        {status.position + 1}
      </div>

      {/* Status name input */}
      <Input
        value={status.name}
        onChange={(e) => onUpdate(status.id, { name: e.target.value })}
        className="flex-1"
        placeholder="Nome stato"
        maxLength={50}
      />

      {/* Icon picker */}
      <IconPicker
        value={status.icon}
        onChange={(icon) => onUpdate(status.id, { icon })}
        color={status.color}
      />

      {/* Color picker */}
      <ColorPicker
        value={status.color}
        onChange={(color) => onUpdate(status.id, { color })}
      />

      {/* Delete button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onDelete(status.id)}
        disabled={!canDelete}
        className={cn(
          "text-muted-foreground hover:text-destructive",
          !canDelete && "opacity-50 cursor-not-allowed"
        )}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
