import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { NODE_KIND_STYLES, getCatalogItem } from "@/lib/flow-node-catalog";
import { Play } from "lucide-react";

function ActionNodeComponent({ data, selected }: NodeProps) {
  const kind = (data.nodeType === "delay" ? "delay" : data.nodeType === "goal" ? "goal" : "action") as keyof typeof NODE_KIND_STYLES;
  const style = NODE_KIND_STYLES[kind] ?? NODE_KIND_STYLES.action;
  const catalog = getCatalogItem(data.itemId as string);

  return (
    <div
      className={`min-w-[200px] max-w-[260px] rounded-xl border-2 px-4 py-3 shadow-md transition-shadow ${style.bg} ${style.border} ${selected ? "ring-2 ring-primary shadow-lg" : ""}`}
    >
      <Handle type="target" position={Position.Top} className="!bg-indigo-500 !w-3 !h-3 !border-2 !border-background" />
      <div className="flex items-center gap-2">
        <div className={`rounded-lg p-1.5 ${style.accent}`}>
          <Play className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {style.label}
          </p>
          <p className="truncate text-sm font-medium">
            {(data.label as string) || catalog?.label || "Azione"}
          </p>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-indigo-500 !w-3 !h-3 !border-2 !border-background" />
    </div>
  );
}

export const ActionNode = memo(ActionNodeComponent);
