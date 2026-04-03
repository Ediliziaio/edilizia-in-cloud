import { useState } from "react";
import { ChevronDown, RotateCcw } from "lucide-react";

export interface AnomalyFilterState {
  date_from?: string;
  date_to?: string;
  priority: "all" | "low" | "medium" | "high" | "urgent";
  status: "all" | "in_review" | "assigned" | "resolved" | "closed";
  assigned_to_ids: string[];
  type: "all" | "dati" | "fatturazione" | "integrazioni" | "workflow";
  order_number?: string;
  client_ids: string[];
  impact_min?: number;
  impact_max?: number;
}

export const INITIAL_ANOMALY_FILTER_STATE: AnomalyFilterState = {
  priority: "all",
  status: "all",
  assigned_to_ids: [],
  type: "all",
  client_ids: [],
};

interface AnomaliesFilterSidebarProps {
  filters: AnomalyFilterState;
  onFiltersChange: (filters: AnomalyFilterState) => void;
  teamMembers: Array<{ id: string; name: string }>;
  clienti: Array<{ id: string; name: string }>;
  anomaliesCount: number;
}

const PRIORITY_LEVELS = [
  { id: "low", label: "Bassa" },
  { id: "medium", label: "Media" },
  { id: "high", label: "Alta" },
  { id: "urgent", label: "Urgente" },
];

const ANOMALY_TYPES = [
  { id: "dati", label: "Dati" },
  { id: "fatturazione", label: "Fatturazione" },
  { id: "integrazioni", label: "Integrazioni" },
  { id: "workflow", label: "Workflow" },
];

const STATUS_OPTIONS = [
  { id: "in_review", label: "In revisione" },
  { id: "assigned", label: "Assegnata" },
  { id: "resolved", label: "Risolto" },
  { id: "closed", label: "Chiuso" },
];

function SectionHeader({
  label,
  sectionKey,
  expanded,
  onToggle,
}: {
  label: string;
  sectionKey: string;
  expanded: boolean;
  onToggle: (k: string) => void;
}) {
  return (
    <button
      onClick={() => onToggle(sectionKey)}
      className="flex items-center justify-between w-full p-3 hover:bg-gray-50 rounded-lg transition-colors"
    >
      <h3 className="font-semibold text-gray-900 text-sm">{label}</h3>
      <ChevronDown
        className={`w-4 h-4 transition-transform text-gray-400 ${expanded ? "rotate-180" : ""}`}
      />
    </button>
  );
}

export function AnomaliesFilterSidebar({
  filters,
  onFiltersChange,
  teamMembers,
  clienti,
  anomaliesCount,
}: AnomaliesFilterSidebarProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["date", "priority"]));

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const activeCount = [
    filters.date_from,
    filters.date_to,
    filters.priority !== "all" ? filters.priority : undefined,
    filters.status !== "all" ? filters.status : undefined,
    filters.type !== "all" ? filters.type : undefined,
    filters.order_number,
    filters.impact_min !== undefined ? filters.impact_min : undefined,
    filters.impact_max !== undefined ? filters.impact_max : undefined,
    ...filters.assigned_to_ids,
    ...filters.client_ids,
  ].filter(Boolean).length;

  const handleReset = () => onFiltersChange(INITIAL_ANOMALY_FILTER_STATE);

  return (
    <div className="w-72 hidden lg:flex flex-col bg-white border-r border-gray-200 overflow-y-auto sticky top-0 h-screen shrink-0">
      {/* Header */}
      <div className="px-5 py-5 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900">Filtri</h2>
          {activeCount > 0 && (
            <span className="text-xs bg-orange-500 text-white rounded-full px-2 py-0.5 font-semibold">
              {activeCount}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-1">{anomaliesCount} anomalie</p>
      </div>

      <div className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {/* DATA */}
        <div>
          <SectionHeader label="Data anomalia" sectionKey="date" expanded={expanded.has("date")} onToggle={toggle} />
          {expanded.has("date") && (
            <div className="space-y-2 px-3 pb-3">
              <input
                type="date"
                value={filters.date_from || ""}
                onChange={(e) => onFiltersChange({ ...filters, date_from: e.target.value || undefined })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="Da"
              />
              <input
                type="date"
                value={filters.date_to || ""}
                onChange={(e) => onFiltersChange({ ...filters, date_to: e.target.value || undefined })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="A"
              />
            </div>
          )}
        </div>

        {/* PRIORITÀ */}
        <div>
          <SectionHeader label="Priorità" sectionKey="priority" expanded={expanded.has("priority")} onToggle={toggle} />
          {expanded.has("priority") && (
            <div className="space-y-1.5 px-3 pb-3">
              {(["all", ...PRIORITY_LEVELS.map((p) => p.id)] as const).map((p) => (
                <label key={p} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="priority"
                    value={p}
                    checked={filters.priority === p}
                    onChange={() => onFiltersChange({ ...filters, priority: p as AnomalyFilterState["priority"] })}
                    className="w-4 h-4 accent-primary"
                  />
                  <span className="text-sm text-gray-700">
                    {p === "all" ? "Tutte" : PRIORITY_LEVELS.find((x) => x.id === p)?.label}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* STATUS */}
        <div>
          <SectionHeader label="Status" sectionKey="status" expanded={expanded.has("status")} onToggle={toggle} />
          {expanded.has("status") && (
            <div className="space-y-1.5 px-3 pb-3">
              {(["all", ...STATUS_OPTIONS.map((s) => s.id)] as const).map((s) => (
                <label key={s} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="status"
                    value={s}
                    checked={filters.status === s}
                    onChange={() => onFiltersChange({ ...filters, status: s as AnomalyFilterState["status"] })}
                    className="w-4 h-4 accent-primary"
                  />
                  <span className="text-sm text-gray-700">
                    {s === "all" ? "Tutti" : STATUS_OPTIONS.find((x) => x.id === s)?.label}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* TIPO */}
        <div>
          <SectionHeader label="Tipo anomalia" sectionKey="type" expanded={expanded.has("type")} onToggle={toggle} />
          {expanded.has("type") && (
            <div className="space-y-1.5 px-3 pb-3">
              {(["all", ...ANOMALY_TYPES.map((t) => t.id)] as const).map((t) => (
                <label key={t} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="type"
                    value={t}
                    checked={filters.type === t}
                    onChange={() => onFiltersChange({ ...filters, type: t as AnomalyFilterState["type"] })}
                    className="w-4 h-4 accent-primary"
                  />
                  <span className="text-sm text-gray-700">
                    {t === "all" ? "Tutti" : ANOMALY_TYPES.find((x) => x.id === t)?.label}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* ASSEGNATO A */}
        {teamMembers.length > 0 && (
          <div>
            <SectionHeader label="Assegnato a" sectionKey="assigned" expanded={expanded.has("assigned")} onToggle={toggle} />
            {expanded.has("assigned") && (
              <div className="space-y-1.5 px-3 pb-3 max-h-44 overflow-y-auto">
                {teamMembers.map((m) => (
                  <label key={m.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.assigned_to_ids.includes(m.id)}
                      onChange={(e) => {
                        const ids = e.target.checked
                          ? [...filters.assigned_to_ids, m.id]
                          : filters.assigned_to_ids.filter((id) => id !== m.id);
                        onFiltersChange({ ...filters, assigned_to_ids: ids });
                      }}
                      className="w-4 h-4 rounded accent-primary"
                    />
                    <span className="text-sm text-gray-700">{m.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {/* NUMERO ORDINE */}
        <div>
          <SectionHeader label="Numero ordine" sectionKey="order" expanded={expanded.has("order")} onToggle={toggle} />
          {expanded.has("order") && (
            <div className="px-3 pb-3">
              <input
                type="text"
                value={filters.order_number || ""}
                onChange={(e) => onFiltersChange({ ...filters, order_number: e.target.value || undefined })}
                placeholder="Es: ORD-2026-007"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          )}
        </div>

        {/* CLIENTE */}
        {clienti.length > 0 && (
          <div>
            <SectionHeader label="Cliente" sectionKey="client" expanded={expanded.has("client")} onToggle={toggle} />
            {expanded.has("client") && (
              <div className="space-y-1.5 px-3 pb-3 max-h-44 overflow-y-auto">
                {clienti.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.client_ids.includes(c.id)}
                      onChange={(e) => {
                        const ids = e.target.checked
                          ? [...filters.client_ids, c.id]
                          : filters.client_ids.filter((id) => id !== c.id);
                        onFiltersChange({ ...filters, client_ids: ids });
                      }}
                      className="w-4 h-4 rounded accent-primary"
                    />
                    <span className="text-sm text-gray-700">{c.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {/* IMPATTO */}
        <div>
          <SectionHeader label="Impatto (€)" sectionKey="impact" expanded={expanded.has("impact")} onToggle={toggle} />
          {expanded.has("impact") && (
            <div className="space-y-2 px-3 pb-3">
              <input
                type="number"
                value={filters.impact_min ?? ""}
                onChange={(e) =>
                  onFiltersChange({ ...filters, impact_min: e.target.value ? parseFloat(e.target.value) : undefined })
                }
                placeholder="Min (€)"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <input
                type="number"
                value={filters.impact_max ?? ""}
                onChange={(e) =>
                  onFiltersChange({ ...filters, impact_max: e.target.value ? parseFloat(e.target.value) : undefined })
                }
                placeholder="Max (€)"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          )}
        </div>
      </div>

      {/* Reset button */}
      {activeCount > 0 && (
        <div className="px-5 py-4 border-t border-gray-100">
          <button
            onClick={handleReset}
            className="w-full px-4 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors flex items-center justify-center gap-2 text-sm font-medium"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Ripristina filtri
          </button>
        </div>
      )}
    </div>
  );
}
