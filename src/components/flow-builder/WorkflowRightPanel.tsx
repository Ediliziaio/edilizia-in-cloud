import { useState, useMemo } from "react";
import { X, Search, Zap, AppWindow, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  TRIGGER_CATALOG_ITEMS,
  ACTION_CATALOG_ITEMS,
  CONDITION_CATALOG_ITEMS,
  NOTE_CATALOG_ITEM,
  type CatalogItem,
} from "@/lib/flow-node-catalog";
import { FlowBuilderConfigPanel } from "./FlowBuilderConfigPanel";
import type { Node } from "@xyflow/react";

type PanelMode = "catalog" | "config";
type CatalogTab = "trigger" | "action" | "condition";

interface WorkflowRightPanelProps {
  mode: PanelMode;
  catalogTab: CatalogTab;
  onCatalogTabChange: (tab: CatalogTab) => void;
  selectedNode: Node | null;
  onUpdateData: (nodeId: string, data: Record<string, any>) => void;
  onDelete: (nodeId: string) => void;
  onClose: () => void;
  onDragStart: (item: CatalogItem) => void;
}

const CATALOG_TABS: { key: CatalogTab; label: string }[] = [
  { key: "trigger", label: "Trigger" },
  { key: "action", label: "Azioni" },
  { key: "condition", label: "Condizioni" },
];

export function WorkflowRightPanel({
  mode,
  catalogTab,
  onCatalogTabChange,
  selectedNode,
  onUpdateData,
  onDelete,
  onClose,
  onDragStart,
}: WorkflowRightPanelProps) {
  // Config mode — reuse existing panel
  if (mode === "config" && selectedNode) {
    return (
      <FlowBuilderConfigPanel
        selectedNode={selectedNode}
        onUpdateData={onUpdateData}
        onDelete={onDelete}
        onClose={onClose}
      />
    );
  }

  // Catalog mode
  return <CatalogPanel catalogTab={catalogTab} onCatalogTabChange={onCatalogTabChange} onClose={onClose} onDragStart={onDragStart} />;
}

function CatalogPanel({
  catalogTab,
  onCatalogTabChange,
  onClose,
  onDragStart,
}: {
  catalogTab: CatalogTab;
  onCatalogTabChange: (tab: CatalogTab) => void;
  onClose: () => void;
  onDragStart: (item: CatalogItem) => void;
}) {
  const [search, setSearch] = useState("");
  const [subTab, setSubTab] = useState<"native" | "app">("native");

  const items = useMemo(() => {
    let source: CatalogItem[];
    switch (catalogTab) {
      case "trigger":
        source = TRIGGER_CATALOG_ITEMS;
        break;
      case "action":
        source = [...ACTION_CATALOG_ITEMS, NOTE_CATALOG_ITEM];
        break;
      case "condition":
        source = CONDITION_CATALOG_ITEMS;
        break;
    }
    if (!search.trim()) return source;
    const q = search.toLowerCase();
    return source.filter(
      (i) =>
        i.label.toLowerCase().includes(q) ||
        i.categoryLabel.toLowerCase().includes(q) ||
        i.description?.toLowerCase().includes(q)
    );
  }, [catalogTab, search]);

  // Group by category
  const grouped = useMemo(() => {
    const map = new Map<string, CatalogItem[]>();
    items.forEach((i) => {
      if (!map.has(i.categoryLabel)) map.set(i.categoryLabel, []);
      map.get(i.categoryLabel)!.push(i);
    });
    return map;
  }, [items]);

  return (
    <div className="flex h-full w-[300px] flex-col border-l bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">
            {catalogTab === "trigger" ? "Aggiungi Trigger" : catalogTab === "action" ? "Aggiungi Azione" : "Aggiungi Condizione"}
          </span>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Search */}
      <div className="p-3 pb-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Cerca..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 pl-8 text-xs"
          />
        </div>
      </div>

      {/* Catalog type tabs */}
      <div className="flex border-b">
        {CATALOG_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => onCatalogTabChange(tab.key)}
            className={cn(
              "flex-1 py-2 text-xs font-semibold transition-colors",
              catalogTab === tab.key
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Sub-tabs: Nativi / App */}
      <div className="flex border-b">
        <button
          onClick={() => setSubTab("native")}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors",
            subTab === "native" ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Zap className="h-3 w-3" />
          Nativi
        </button>
        <button
          onClick={() => setSubTab("app")}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors",
            subTab === "app" ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <AppWindow className="h-3 w-3" />
          App
        </button>
      </div>

      {/* Items */}
      <ScrollArea className="flex-1">
        {subTab === "native" ? (
          <div className="space-y-4 p-3">
            {[...grouped.entries()].map(([category, catItems]) => (
              <div key={category}>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {category}
                </p>
                <div className="space-y-1">
                  {catItems.map((item) => (
                    <div
                      key={item.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("application/flow-node", JSON.stringify(item));
                        e.dataTransfer.effectAllowed = "move";
                        onDragStart(item);
                      }}
                      className="flex cursor-grab items-center gap-2 rounded-lg border bg-card px-2.5 py-2 text-xs transition-colors hover:bg-accent active:cursor-grabbing"
                    >
                      <GripVertical className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{item.label}</p>
                        {item.description && (
                          <p className="truncate text-[10px] text-muted-foreground">{item.description}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {items.length === 0 && (
              <p className="py-8 text-center text-xs text-muted-foreground">Nessun risultato</p>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 px-4">
            <AppWindow className="h-8 w-8 text-muted-foreground/40 mb-3" />
            <p className="text-xs text-muted-foreground text-center">
              Le integrazioni app saranno disponibili a breve.
            </p>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
