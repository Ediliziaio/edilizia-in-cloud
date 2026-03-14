import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Clock } from "lucide-react";
import { getCatalogItem } from "@/lib/flow-node-catalog";

function DelayNodeComponent({ data, selected }: NodeProps) {
  const catalog = getCatalogItem(data.itemId as string);

  // Build duration label from config
  const cfg = (data as any);
  let label = (cfg.label as string) || catalog?.label || "Attesa";
  if (cfg.delay_durata && cfg.delay_unita) {
    const unitaMap: Record<string, string> = { minuti: "min", ore: "ore", giorni: "g", settimane: "sett" };
    label = `${cfg.delay_durata} ${unitaMap[cfg.delay_unita] || cfg.delay_unita}`;
  }

  return (
    <div className="flex flex-col items-center">
      <Handle type="target" position={Position.Top} className="!bg-purple-500 !w-3 !h-3 !border-2 !border-background" />

      {/* Horizontal pill style */}
      <div
        className={`flex items-center gap-2 rounded-full border-2 px-4 py-2 shadow-sm transition-all hover:shadow-md bg-purple-50 dark:bg-purple-950/40 border-purple-300 dark:border-purple-600 ${selected ? "ring-2 ring-primary ring-offset-1 shadow-lg" : ""}`}
      >
        <div className="rounded-full bg-purple-100 dark:bg-purple-900/60 p-1 text-purple-600 dark:text-purple-400">
          <Clock className="h-3.5 w-3.5" />
        </div>
        <span className="text-sm font-medium text-purple-700 dark:text-purple-300 whitespace-nowrap">
          {label}
        </span>
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-purple-500 !w-3 !h-3 !border-2 !border-background" />
    </div>
  );
}

export const DelayNode = memo(DelayNodeComponent);
