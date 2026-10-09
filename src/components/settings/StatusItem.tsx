import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2, LifeBuoy, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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

  const isSupportPhase = status.is_support_phase === true;
  // Lo stato Assistenza non è eliminabile mai.
  const deleteEnabled = canDelete && !isSupportPhase;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 p-3 rounded-lg border bg-card",
        isDragging && "shadow-lg opacity-90 z-50",
        isSupportPhase && "border-amber-400/60 bg-amber-50/50 dark:bg-amber-950/20"
      )}
    >
      {/* Drag handle */}
      <button
        type="button"
        aria-label="Trascina per riordinare"
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
        {(status.position ?? 0) + 1}
      </div>

      {/* Status name input */}
      <Input
        value={status.name}
        onChange={(e) => onUpdate(status.id, { name: e.target.value })}
        className="min-w-[8rem] flex-1 basis-40"
        placeholder="Nome stato"
        aria-label={`Nome dello stato ${(status.position ?? 0) + 1}`}
        maxLength={50}
      />

      {isSupportPhase && (
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                variant="outline"
                className="gap-1 border-amber-400 bg-amber-100/80 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100"
              >
                <LifeBuoy className="h-3 w-3" />
                Stato Assistenza
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              Quando apri un ticket di assistenza per una commessa, la commessa passa da sola a questo stato. Puoi rinominarlo, non eliminarlo.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {/* Icon picker */}
      <IconPicker
        value={status.icon ?? "Circle"}
        onChange={(icon) => onUpdate(status.id, { icon })}
        color={status.color}
      />

      {/* Color picker */}
      <ColorPicker
        value={status.color}
        onChange={(color) => onUpdate(status.id, { color })}
      />

      {/* Delete button */}
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => deleteEnabled && onDelete(status.id)}
                disabled={!deleteEnabled}
                aria-label={isSupportPhase ? "Lo stato Assistenza non si può eliminare" : `Elimina lo stato ${status.name}`}
                className={cn(
                  "text-muted-foreground hover:text-destructive",
                  !deleteEnabled && "opacity-50 cursor-not-allowed"
                )}
              >
                {isSupportPhase ? <Lock className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
              </Button>
            </span>
          </TooltipTrigger>
          {!deleteEnabled && (
            <TooltipContent side="top">
              {isSupportPhase
                ? "Lo stato Assistenza è obbligatorio e non si può eliminare"
                : "Servono almeno 2 stati"}
            </TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
