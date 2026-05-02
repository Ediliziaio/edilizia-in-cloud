import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { AlertTriangle, Shuffle } from "lucide-react";
import { getCatalogItem } from "@/lib/flow-node-catalog";

function SplitNodeComponent({ data, selected }: NodeProps) {
  const catalog = getCatalogItem(data.itemId as string);
  const label = (data.label as string) || catalog?.label || "Split A/B";
  const percentuali = ((data.percentuali as string) || "50,50").split(",").map(s => s.trim());

  return (
    <div
      className={`min-w-[220px] max-w-[280px] rounded-xl border-2 bg-card shadow-sm transition-all hover:shadow-md border-teal-400 dark:border-teal-600 ${selected ? "ring-2 ring-primary ring-offset-1 shadow-lg" : ""} ${data.hasError ? "!border-destructive ring-1 ring-destructive" : data.hasWarning ? "!border-amber-500 ring-1 ring-amber-300" : ""}`}
    >
      <Handle type="target" position={Position.Top} className="!bg-teal-500 !w-3 !h-3 !border-2 !border-background" />

      {/* Header */}
      <div className="flex items-center gap-2 rounded-t-[10px] bg-teal-50 dark:bg-teal-950/40 px-3 py-2">
        <div className="rounded-lg bg-teal-100 dark:bg-teal-900/60 p-1.5 text-teal-600 dark:text-teal-400">
          <Shuffle className="h-4 w-4" />
        </div>
        <span className="flex-1 text-[10px] font-semibold uppercase tracking-wide text-teal-600 dark:text-teal-400">
          Split A/B
        </span>
        {(data.hasError || data.hasWarning) && (
          <AlertTriangle className={`h-3.5 w-3.5 ${data.hasError ? "text-destructive" : "text-amber-600"}`} />
        )}
      </div>

      {/* Body */}
      <div className="px-3 py-2">
        <p className="truncate text-sm font-medium text-foreground">{label}</p>
        <div className="flex gap-1.5 mt-1.5">
          {percentuali.map((p, i) => (
            <span key={i} className="rounded bg-teal-100 dark:bg-teal-900/60 px-1.5 py-0.5 text-[10px] font-bold text-teal-700 dark:text-teal-300">
              {String.fromCharCode(65 + i)}: {p}%
            </span>
          ))}
        </div>
      </div>

      {/* Output handles for each branch */}
      {percentuali.map((_, i) => (
        <Handle
          key={`split-${i}`}
          type="source"
          position={Position.Bottom}
          id={`split_${i}`}
          className="!bg-teal-500 !w-3 !h-3 !border-2 !border-background"
          style={{ left: `${((i + 1) / (percentuali.length + 1)) * 100}%` }}
        />
      ))}
    </div>
  );
}

export const SplitNode = memo(SplitNodeComponent);
