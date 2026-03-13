import { useState, useMemo } from "react";
import {
  TRIGGER_CATALOG_ITEMS,
  ACTION_CATALOG_ITEMS,
  CONDITION_CATALOG_ITEMS,
  NOTE_CATALOG_ITEM,
  type CatalogItem,
} from "@/lib/flow-node-catalog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

interface FlowBuilderSidebarProps {
  onDragStart: (item: CatalogItem) => void;
}

type TabKey = "trigger" | "action" | "condition";

const TABS: { key: TabKey; label: string }[] = [
  { key: "trigger", label: "Trigger" },
  { key: "action", label: "Azioni" },
  { key: "condition", label: "Condizioni" },
];

const CATEGORY_ICONS: Record<string, string> = {
  'CRM & Vendite': '👥',
  'Marketing': '📣',
  'Ordini': '📦',
  'Fatturazione': '💰',
  'Preventivi': '📋',
  'Assistenza': '🎫',
  'Magazzino': '📦',
  'HR & Personale': '👤',
  'Cantieri': '🏗️',
  'Task & Attività': '✅',
  'Comunicazione': '📨',
  'Generale': '⚙️',
  'Logica': '🔀',
  'Utilità': '🔧',
};

export function FlowBuilderSidebar({ onDragStart }: FlowBuilderSidebarProps) {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("trigger");

  const items = useMemo(() => {
    let source: CatalogItem[];
    switch (activeTab) {
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
  }, [activeTab, search]);

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
    <div className="flex h-full w-[260px] flex-col border-r bg-background">
      {/* Tabs */}
      <div className="flex border-b">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "flex-1 py-2.5 text-xs font-semibold uppercase tracking-wide transition-colors",
              activeTab === tab.key
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="p-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Cerca..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>
      </div>

      {/* Items */}
      <ScrollArea className="flex-1">
        <div className="space-y-4 p-3 pt-0">
          {[...grouped.entries()].map(([category, catItems]) => (
            <div key={category}>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {CATEGORY_ICONS[category] ?? '⚡'} {category}
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
                    <span className="text-sm shrink-0">{item.icon}</span>
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
      </ScrollArea>
    </div>
  );
}
