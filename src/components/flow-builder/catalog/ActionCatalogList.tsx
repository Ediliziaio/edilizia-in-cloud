import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  ACTIONS_BY_CATEGORY,
  ACTION_CATALOG,
  CONDITION_CATALOG,
  NOTE_CATALOG_ITEM,
  type CatalogItem,
} from "@/lib/flow-node-catalog";
import { getCategoryColor } from "@/components/flow-builder/nodes/nodeStyles";
import { getActionIcon } from "@/components/flow-builder/nodes/nodeIcons";
import { CatalogItemRow } from "./CatalogItemRow";

const CATEGORY_ORDER = ["comunicazione", "crm", "task", "ordini", "fatturazione", "preventivi", "assistenza", "cantieri", "generale"];
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
  logica: "Logica & Flusso",
  utility: "Utilità",
};

function actionKind(id: string): CatalogItem["kind"] {
  if (id === "condition_se" || id === "condition_multi") return "condition";
  if (id === "attendi") return "delay";
  if (id === "goal") return "goal";
  if (id === "split_ab") return "split";
  return "action";
}

interface ActionCatalogListProps {
  search: string;
  onSelect: (item: CatalogItem) => void;
  onDragStart: (item: CatalogItem) => void;
  includeConditions?: boolean;
}

export function ActionCatalogList({ search, onSelect, onDragStart, includeConditions = true }: ActionCatalogListProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["comunicazione", "crm"]));
  const [recents] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("flow_recent_actions") || "[]").slice(0, 5);
    } catch { return []; }
  });

  const filteredByCategory = useMemo(() => {
    const q = search.toLowerCase().trim();
    const result: { category: string; items: CatalogItem[] }[] = [];

    for (const cat of CATEGORY_ORDER) {
      const actions = ACTIONS_BY_CATEGORY[cat];
      if (!actions) continue;
      const items = actions
        .filter(a => !q || a.label.toLowerCase().includes(q) || a.description.toLowerCase().includes(q))
        .map(a => ({
          id: a.id, label: a.label, description: a.description, icon: a.icon,
          category: a.categoria, categoryLabel: CATEGORY_LABELS[a.categoria] ?? a.categoria,
          kind: actionKind(a.id), configSchema: a.configSchema, outputVariables: a.outputVariables,
        }));
      if (items.length > 0) result.push({ category: cat, items });
    }

    // Add conditions as "Logica" category
    if (includeConditions) {
      const condItems: CatalogItem[] = CONDITION_CATALOG
        .filter(c => !q || c.label.toLowerCase().includes(q) || c.description.toLowerCase().includes(q))
        .map(c => ({
          id: c.id, label: c.label, description: c.description, icon: c.icon,
          category: "logica", categoryLabel: "Logica & Flusso",
          kind: "condition" as const, configSchema: c.configSchema,
        }));

      // Add note
      const note = NOTE_CATALOG_ITEM;
      if (!q || note.label.toLowerCase().includes(q)) {
        condItems.push(note);
      }

      if (condItems.length > 0) result.push({ category: "logica", items: condItems });
    }

    return result;
  }, [search, includeConditions]);

  const recentItems = useMemo(() => {
    if (search) return [];
    return recents
      .map(id => ACTION_CATALOG.find(a => a.id === id))
      .filter(Boolean)
      .map(a => ({
        id: a!.id, label: a!.label, description: a!.description, icon: a!.icon,
        category: a!.categoria, categoryLabel: CATEGORY_LABELS[a!.categoria] ?? a!.categoria,
        kind: actionKind(a!.id), configSchema: a!.configSchema, outputVariables: a!.outputVariables,
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
    try {
      const curr = JSON.parse(localStorage.getItem("flow_recent_actions") || "[]");
      const updated = [item.id, ...curr.filter((id: string) => id !== item.id)].slice(0, 5);
      localStorage.setItem("flow_recent_actions", JSON.stringify(updated));
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
        const CatIcon = getActionIcon(items[0]?.id ?? "");

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
