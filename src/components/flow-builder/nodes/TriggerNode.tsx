import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { getCatalogItem } from "@/lib/flow-node-catalog";
import { getTriggerIcon } from "./nodeIcons";
import { Plus, Zap } from "lucide-react";

function TriggerNodeComponent({ data, selected }: NodeProps) {
  const catalog = getCatalogItem(data.itemId as string);
  const isEmpty = !data.itemId;

  // Empty state — dashed card
  if (isEmpty) {
    return (
      <div
        onClick={() => (data as any).onOpenCatalog?.()}
        className={`min-w-[220px] max-w-[260px] rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 px-4 py-4 cursor-pointer transition-all hover:border-primary/70 hover:bg-primary/10 ${selected ? "ring-2 ring-primary shadow-lg" : ""}`}
      >
        <div className="flex flex-col items-center gap-2 text-primary/60">
          <div className="rounded-full bg-primary/10 p-2">
            <Plus className="h-5 w-5" />
          </div>
          <p className="text-xs font-medium">Aggiungi nuovo trigger</p>
        </div>
        <Handle type="source" position={Position.Bottom} className="!bg-primary !w-3 !h-3 !border-2 !border-background" />
      </div>
    );
  }

  // Populated state
  const Icon = getTriggerIcon(data.itemId as string);

  return (
    <div
      className={`min-w-[220px] max-w-[260px] rounded-xl border-2 bg-card shadow-sm transition-all hover:shadow-md border-emerald-400 dark:border-emerald-600 ${selected ? "ring-2 ring-primary ring-offset-1 shadow-lg" : ""}`}
    >
      {/* Colored header bar */}
      <div className="flex items-center gap-2 rounded-t-[10px] bg-emerald-50 dark:bg-emerald-950/40 px-3 py-2">
        <div className="rounded-lg bg-emerald-100 dark:bg-emerald-900/60 p-1.5 text-emerald-600 dark:text-emerald-400">
          <Icon className="h-4 w-4" />
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
          Trigger
        </span>
      </div>
      {/* Body */}
      <div className="px-3 py-2">
        <p className="truncate text-sm font-medium text-foreground">
          {(data.label as string) || catalog?.label || "Trigger"}
        </p>
        {catalog?.description && (
          <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground line-clamp-2">
            {catalog.description}
          </p>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-emerald-500 !w-3 !h-3 !border-2 !border-background" />
    </div>
  );
}

export const TriggerNode = memo(TriggerNodeComponent);
