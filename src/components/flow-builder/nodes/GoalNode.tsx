import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Target } from "lucide-react";
import { getCatalogItem } from "@/lib/flow-node-catalog";

function GoalNodeComponent({ data, selected }: NodeProps) {
  const catalog = getCatalogItem(data.itemId as string);
  const label = (data.label as string) || catalog?.label || "Obiettivo";

  return (
    <div
      className={`min-w-[220px] max-w-[280px] rounded-xl border-2 bg-card shadow-sm transition-all hover:shadow-md border-green-500 dark:border-green-600 ${selected ? "ring-2 ring-primary ring-offset-1 shadow-lg" : ""}`}
    >
      <Handle type="target" position={Position.Top} className="!bg-green-500 !w-3 !h-3 !border-2 !border-background" />

      {/* Header */}
      <div className="flex items-center gap-2 rounded-t-[10px] bg-green-50 dark:bg-green-950/40 px-3 py-2">
        <div className="rounded-lg bg-green-100 dark:bg-green-900/60 p-1.5 text-green-600 dark:text-green-400">
          <Target className="h-4 w-4" />
        </div>
        <span className="flex-1 text-[10px] font-semibold uppercase tracking-wide text-green-600 dark:text-green-400">
          Obiettivo
        </span>
      </div>

      {/* Body */}
      <div className="px-3 py-2">
        <p className="truncate text-sm font-medium text-foreground">
          {label}
        </p>
        {data.valore && (
          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
            {data.variabile} {data.operatore} {data.valore as string}
          </p>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-green-500 !w-3 !h-3 !border-2 !border-background" />
    </div>
  );
}

export const GoalNode = memo(GoalNodeComponent);
