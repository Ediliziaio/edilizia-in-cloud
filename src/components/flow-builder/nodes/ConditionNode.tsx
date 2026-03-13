import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { NODE_KIND_STYLES, getCatalogItem } from "@/lib/flow-node-catalog";
import { GitBranch } from "lucide-react";

function ConditionNodeComponent({ data, selected }: NodeProps) {
  const style = NODE_KIND_STYLES.condition;
  const catalog = getCatalogItem(data.itemId as string);

  return (
    <div
      className={`min-w-[200px] max-w-[260px] rounded-xl border-2 px-4 py-3 shadow-md transition-shadow ${style.bg} ${style.border} ${selected ? "ring-2 ring-primary shadow-lg" : ""}`}
    >
      <Handle type="target" position={Position.Top} className="!bg-amber-500 !w-3 !h-3 !border-2 !border-background" />
      <div className="flex items-center gap-2">
        <div className={`rounded-lg p-1.5 ${style.accent}`}>
          <GitBranch className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Condizione
          </p>
          <p className="truncate text-sm font-medium">
            {(data.label as string) || catalog?.label || "If / Else"}
          </p>
        </div>
      </div>
      {/* Two output handles: Sì (left) / No (right) */}
      <div className="relative mt-2 flex justify-between px-2 text-[10px] font-semibold">
        <span className="text-emerald-600">Sì</span>
        <span className="text-red-500">No</span>
      </div>
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
