import { useState } from "react";
import { X, Search, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { type CatalogItem } from "@/lib/flow-node-catalog";
import { FlowBuilderConfigPanel } from "./FlowBuilderConfigPanel";
import { TriggerCatalogList } from "./catalog/TriggerCatalogList";
import { ActionCatalogList } from "./catalog/ActionCatalogList";
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
  onSelectItem?: (item: CatalogItem) => void;
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
  onSelectItem,
}: WorkflowRightPanelProps) {
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

  return (
    <CatalogPanel
      catalogTab={catalogTab}
      onCatalogTabChange={onCatalogTabChange}
      onClose={onClose}
      onDragStart={onDragStart}
      onSelectItem={onSelectItem}
    />
  );
}

function CatalogPanel({
  catalogTab,
  onCatalogTabChange,
  onClose,
  onDragStart,
  onSelectItem,
}: {
  catalogTab: CatalogTab;
  onCatalogTabChange: (tab: CatalogTab) => void;
  onClose: () => void;
  onDragStart: (item: CatalogItem) => void;
  onSelectItem?: (item: CatalogItem) => void;
}) {
  const [search, setSearch] = useState("");

  const handleSelect = (item: CatalogItem) => {
    onSelectItem?.(item);
  };

  return (
    <div className="flex h-full w-[340px] flex-col border-l bg-background">
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

      {/* Items */}
      <ScrollArea className="flex-1">
        {catalogTab === "trigger" && (
          <TriggerCatalogList search={search} onSelect={handleSelect} onDragStart={onDragStart} />
        )}
        {(catalogTab === "action" || catalogTab === "condition") && (
          <ActionCatalogList
            search={search}
            onSelect={handleSelect}
            onDragStart={onDragStart}
            includeConditions={catalogTab === "condition" || catalogTab === "action"}
          />
        )}
      </ScrollArea>
    </div>
  );
}
