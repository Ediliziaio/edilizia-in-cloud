import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { getCatalogItem } from "@/lib/flow-node-catalog";
import { AlertTriangle, GitBranch, Check, X } from "lucide-react";

function ConditionNodeComponent({ data, selected }: NodeProps) {
  const catalog = getCatalogItem(data.itemId as string);
  const logica = (data.operatore_logico as string) || "AND";

  return (
    <div
      className={`min-w-[220px] max-w-[280px] rounded-xl border-2 bg-card shadow-sm transition-all hover:shadow-md border-amber-400 dark:border-amber-600 ${selected ? "ring-2 ring-primary ring-offset-1 shadow-lg" : ""} ${data.hasError ? "!border-destructive ring-1 ring-destructive" : data.hasWarning ? "!border-amber-500 ring-1 ring-amber-300" : ""}`}
    >
      <Handle type="target" position={Position.Top} className="!bg-amber-500 !w-3 !h-3 !border-2 !border-background" />

      {/* Header */}
      <div className="flex items-center gap-2 rounded-t-[10px] bg-amber-50 dark:bg-amber-950/40 px-3 py-2">
        <div className="rounded-lg bg-amber-100 dark:bg-amber-900/60 p-1.5 text-amber-600 dark:text-amber-400">
          <GitBranch className="h-4 w-4" />
        </div>
        <span className="flex-1 text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
          Se / Altrimenti
        </span>
        <span className="rounded bg-amber-200 dark:bg-amber-800 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 dark:text-amber-300">
          {logica}
        </span>
        {(data.hasError || data.hasWarning) && (
          <AlertTriangle className={`h-3.5 w-3.5 ${data.hasError ? "text-destructive" : "text-amber-600"}`} />
        )}
      </div>

      {/* Body */}
      <div className="px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Condizione</p>
        <p className="truncate text-sm font-medium text-foreground mt-0.5">
          {(data.label as string) || catalog?.label || "Configura condizione..."}
        </p>
      </div>

      {/* Branch labels */}
      <div className="flex justify-between px-4 pb-2 text-[10px] font-bold">
        <span className="flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
          <Check className="h-3 w-3" /> Si
        </span>
        <span className="flex items-center gap-0.5 text-red-500 dark:text-red-400">
          <X className="h-3 w-3" /> No
        </span>
      </div>

      {/* Two output handles */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="yes"
        className="!bg-emerald-500 !w-3 !h-3 !border-2 !border-background"
        style={{ left: "30%" }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="no"
        className="!bg-red-500 !w-3 !h-3 !border-2 !border-background"
        style={{ left: "70%" }}
      />
    </div>
  );
}

export const ConditionNode = memo(ConditionNodeComponent);
