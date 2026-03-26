import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  TRIGGERS_BY_CATEGORY,
  TRIGGER_CATALOG,
  type CatalogItem,
} from "@/lib/flow-node-catalog";
import { getCategoryColor } from "@/components/flow-builder/nodes/nodeStyles";
import { getTriggerIcon } from "@/components/flow-builder/nodes/nodeIcons";
import { CatalogItemRow } from "./CatalogItemRow";

const COMPANY_CATEGORY_ORDER = ["crm", "marketing", "ordini", "fatturazione", "preventivi", "assistenza", "magazzino", "hr", "cantieri", "task", "generale"];
const ADMIN_CATEGORY_ORDER = ["crm", "marketing", "comunicazione", "task", "generale", "piattaforma"];
const CATEGORY_LABELS: Record<string, string> = {
  crm: "CRM & Vendite",
  marketing: "Marketing",
  ordini: "Ordini",
  fatturazione: "Fatturazione",
  preventivi: "Preventivi",
  assistenza: "Assistenza",
  magazzino: "Magazzino",
  hr: "HR & Personale",
  cantieri: "Cantieri",
  task: "Task & Attività",
  comunicazione: "Comunicazione",
  generale: "Generale",
  piattaforma: "Piattaforma",
};

interface TriggerCatalogListProps {
  search: string;
  onSelect: (item: CatalogItem) => void;
  onDragStart: (item: CatalogItem) => void;
  isAdmin?: boolean;
}

export function TriggerCatalogList({ search, onSelect, onDragStart, isAdmin = false }: TriggerCatalogListProps) {
  const CATEGORY_ORDER = isAdmin ? ADMIN_CATEGORY_ORDER : COMPANY_CATEGORY_ORDER;
  const [expanded, setExpanded] = useState<Set<string>>(new Set(isAdmin ? ["piattaforma"] : ["crm"]));
  const [recents] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("flow_recent_triggers") || "[]").slice(0, 5);
    } catch { return []; }
  });

  const filteredByCategory = useMemo(() => {
    const q = search.toLowerCase().trim();
    const result: { category: string; items: CatalogItem[] }[] = [];

    for (const cat of CATEGORY_ORDER) {
      const triggers = TRIGGERS_BY_CATEGORY[cat];
      if (!triggers) continue;
      const items = triggers
        .filter(t => !q || t.label.toLowerCase().includes(q) || t.description.toLowerCase().includes(q))
        .map(t => ({
          id: t.id, label: t.label, description: t.description, icon: t.icon,
          category: t.categoria, categoryLabel: CATEGORY_LABELS[t.categoria] ?? t.categoria,
          kind: "trigger" as const, configSchema: t.configSchema, outputVariables: t.outputVariables,
        }));
      if (items.length > 0) result.push({ category: cat, items });
    }
    return result;
  }, [search]);

  const recentItems = useMemo(() => {
    if (search) return [];
    return recents
      .map(id => TRIGGER_CATALOG.find(t => t.id === id))
      .filter(Boolean)
      .map(t => ({
        id: t!.id, label: t!.label, description: t!.description, icon: t!.icon,
        category: t!.categoria, categoryLabel: CATEGORY_LABELS[t!.categoria] ?? t!.categoria,
        kind: "trigger" as const, configSchema: t!.configSchema, outputVariables: t!.outputVariables,
      }));
  }, [recents, search]);

  const toggle = (cat: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  };

  const handleSelect = (item: CatalogItem) => {
    // Save to recents
    try {
      const curr = JSON.parse(localStorage.getItem("flow_recent_triggers") || "[]");
      const updated = [item.id, ...curr.filter((id: string) => id !== item.id)].slice(0, 5);
      localStorage.setItem("flow_recent_triggers", JSON.stringify(updated));
    } catch {}
    onSelect(item);
  };

  return (
    <div className="py-1">
      {/* Recenti */}
      {recentItems.length > 0 && (
        <div className="mb-1">
          <p className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Recenti
          </p>
          {recentItems.map(item => (
            <CatalogItemRow key={item.id} item={item} onSelect={handleSelect} onDragStart={onDragStart} />
          ))}
          <div className="mx-3 my-1 border-b" />
        </div>
      )}

      {/* Categories */}
      {filteredByCategory.map(({ category, items }) => {
        const isOpen = search || expanded.has(category);
        const colors = getCategoryColor(category);
        const CatIcon = getTriggerIcon(items[0]?.id ?? "");

        return (
          <div key={category}>
            <button
              onClick={() => toggle(category)}
              className="w-full flex items-center gap-2 px-4 py-2 hover:bg-accent/30 transition-colors"
            >
              <div className={`w-5 h-5 rounded flex items-center justify-center ${colors.iconBg}`}>
                <CatIcon className={`h-3 w-3 ${colors.text}`} />
              </div>
              <span className="text-xs font-medium text-foreground flex-1 text-left">
                {CATEGORY_LABELS[category] ?? category}
              </span>
              <span className="text-[10px] text-muted-foreground mr-1">{items.length}</span>
              {isOpen
                ? <ChevronDown className="h-3 w-3 text-muted-foreground" />
                : <ChevronRight className="h-3 w-3 text-muted-foreground" />
              }
            </button>
            {isOpen && items.map(item => (
              <CatalogItemRow key={item.id} item={item} onSelect={handleSelect} onDragStart={onDragStart} />
            ))}
          </div>
        );
      })}

      {filteredByCategory.length === 0 && (
        <p className="py-8 text-center text-xs text-muted-foreground">Nessun risultato</p>
      )}
    </div>
  );
}
