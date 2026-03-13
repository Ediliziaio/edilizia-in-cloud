import { ChevronRight } from "lucide-react";
import { getNodeIcon } from "@/components/flow-builder/nodes/nodeIcons";
import { getCategoryColor } from "@/components/flow-builder/nodes/nodeStyles";
import type { CatalogItem } from "@/lib/flow-node-catalog";

interface CatalogItemRowProps {
  item: CatalogItem;
  onSelect: (item: CatalogItem) => void;
  onDragStart: (item: CatalogItem) => void;
}

export function CatalogItemRow({ item, onSelect, onDragStart }: CatalogItemRowProps) {
  const Icon = getNodeIcon(item.id, item.kind);
  const colors = getCategoryColor(item.category);

  return (
    <button
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("application/flow-node", JSON.stringify(item));
        e.dataTransfer.effectAllowed = "move";
        onDragStart(item);
      }}
      onClick={() => onSelect(item)}
      className="w-full flex items-center gap-2.5 px-3 pl-4 py-2 hover:bg-accent/50 transition-colors group text-left cursor-grab active:cursor-grabbing"
    >
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${colors.iconBg}`}>
        <Icon className={`h-3.5 w-3.5 ${colors.text}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium truncate text-foreground group-hover:text-primary">
          {item.label}
        </p>
        {item.description && (
          <p className="text-[10px] text-muted-foreground truncate">{item.description}</p>
        )}
      </div>
      <ChevronRight className="h-3 w-3 text-muted-foreground/50 group-hover:text-primary shrink-0" />
    </button>
  );
}
