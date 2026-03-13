import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { NODE_KIND_STYLES, getCatalogItem } from "@/lib/flow-node-catalog";
import { Zap } from "lucide-react";

function TriggerNodeComponent({ data, selected }: NodeProps) {
  const style = NODE_KIND_STYLES.trigger;
  const catalog = getCatalogItem(data.itemId as string);

  return (
    <div
      className={`min-w-[200px] max-w-[260px] rounded-xl border-2 px-4 py-3 shadow-md transition-shadow ${style.bg} ${style.border} ${selected ? "ring-2 ring-primary shadow-lg" : ""}`}
    >
      <div className="flex items-center gap-2">
        <div className={`rounded-lg p-1.5 ${style.bg} ${style.accent}`}>
          <Zap className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Trigger
          </p>
          <p className="truncate text-sm font-medium">
            {(data.label as string) || catalog?.label || "Trigger"}
          </p>
        </div>
      </div>
      {catalog?.description && (
        <p className="mt-1.5 text-[11px] leading-tight text-muted-foreground line-clamp-2">
          {catalog.description}
        </p>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-emerald-500 !w-3 !h-3 !border-2 !border-background" />
    </div>
  );
}

export const TriggerNode = memo(TriggerNodeComponent);
