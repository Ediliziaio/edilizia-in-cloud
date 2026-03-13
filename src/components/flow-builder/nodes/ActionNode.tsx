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
      className={`min-w-[220px] max-w-[260px] rounded-xl border-2 shadow-sm transition-all hover:shadow-md ${colors.bg} ${colors.border} ${selected ? "ring-2 ring-primary ring-offset-1 shadow-lg" : ""} ${data.hasError ? "!border-destructive ring-1 ring-destructive" : ""}`}
    >
      <Handle type="target" position={Position.Top} className="!bg-indigo-500 !w-3 !h-3 !border-2 !border-background" />

      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div className={`rounded-lg p-1.5 ${colors.iconBg} ${colors.text}`}>
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {catalog?.categoryLabel || "Azione"}
            </p>
            <p className="truncate text-sm font-medium text-foreground">
              {(data.label as string) || catalog?.label || "Azione"}
            </p>
          </div>
          {data.hasError && (
            <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
          )}
        </div>
        {(data.configPreview as string) && (
          <p className="mt-1.5 text-[11px] leading-tight text-muted-foreground line-clamp-2">
            {data.configPreview as string}
          </p>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-indigo-500 !w-3 !h-3 !border-2 !border-background" />
    </div>
  );
}

export const ActionNode = memo(ActionNodeComponent);
