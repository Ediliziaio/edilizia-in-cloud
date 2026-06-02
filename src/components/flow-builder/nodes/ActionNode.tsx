import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { getCatalogItem } from "@/lib/flow-node-catalog";
import { getActionIcon } from "./nodeIcons";
import { getNodeColors } from "./nodeStyles";
import { AlertTriangle } from "lucide-react";

function ActionNodeComponent({ data, selected }: NodeProps) {
  const catalog = getCatalogItem(data.itemId as string);
  const Icon = getActionIcon(data.itemId as string);
  const colors = getNodeColors(catalog?.category);

  return (
    <div
      className={`min-w-[260px] max-w-[300px] rounded-xl border-2 bg-card shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md ${colors.border} ${selected ? "ring-2 ring-primary ring-offset-1 shadow-lg" : ""} ${data.hasError ? "!border-destructive ring-1 ring-destructive" : ""}`}
    >
      <Handle type="target" position={Position.Top} className="!bg-indigo-500 !w-3 !h-3 !border-2 !border-background" />

      {/* Header bar colorata per categoria (coerente con TriggerNode) */}
      <div className={`flex items-center gap-2 rounded-t-[10px] px-4 py-2.5 ${colors.bg}`}>
        <div className={`rounded-lg p-1.5 ${colors.iconBg} ${colors.text}`}>
          <Icon className="h-4 w-4" />
        </div>
        <span className={`text-[10px] font-semibold uppercase tracking-wide ${colors.text}`}>
          {catalog?.categoryLabel || "Azione"}
        </span>
        {data.hasError && (
          <AlertTriangle className="ml-auto h-4 w-4 shrink-0 text-destructive" />
        )}
      </div>

      {/* Corpo */}
      <div className="px-4 py-3">
        <p className="truncate text-sm font-medium text-foreground">
          {(data.label as string) || catalog?.label || "Azione"}
        </p>
        {(data.configPreview as string) && (
          <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground line-clamp-2">
            {data.configPreview as string}
          </p>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-indigo-500 !w-3 !h-3 !border-2 !border-background" />
    </div>
  );
}

export const ActionNode = memo(ActionNodeComponent);
