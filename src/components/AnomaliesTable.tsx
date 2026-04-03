import { ChevronUp, ChevronDown } from "lucide-react";

export interface Anomaly {
  id: string;
  order_number: string;
  client_name: string;
  created_at: string;
  type: string;
  title: string;
  description?: string;
  impact_amount: number;
  priority: string;
  status: string;
  assigned_to_name?: string;
}

interface AnomaliesTableProps {
  anomalies: Anomaly[];
  isLoading: boolean;
  sortBy?: string;
  sortDirection?: "asc" | "desc";
  onSort: (column: string) => void;
  onSelectAnomaly: (anomalyId: string) => void;
  selectedAnomalies: Set<string>;
  onSelectionChange: (selectedIds: Set<string>) => void;
}

const TYPE_COLORS: Record<string, string> = {
  dati: "bg-blue-100 text-blue-800",
  fatturazione: "bg-red-100 text-red-800",
  integrazioni: "bg-green-100 text-green-800",
  workflow: "bg-orange-100 text-orange-800",
};

const TYPE_LABELS: Record<string, string> = {
  dati: "Dati",
  fatturazione: "Fatturazione",
  integrazioni: "Integrazioni",
  workflow: "Workflow",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-gray-100 text-gray-700",
  medium: "bg-yellow-100 text-yellow-800",
  high: "bg-orange-100 text-orange-800",
  urgent: "bg-red-100 text-red-800",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "Bassa",
  medium: "Media",
  high: "Alta",
  urgent: "Urgente",
};

const STATUS_COLORS: Record<string, string> = {
  in_review: "bg-blue-100 text-blue-800",
  assigned: "bg-yellow-100 text-yellow-800",
  resolved: "bg-green-100 text-green-800",
  closed: "bg-gray-100 text-gray-700",
};

const STATUS_LABELS: Record<string, string> = {
  in_review: "In revisione",
  assigned: "Assegnata",
  resolved: "Risolta",
  closed: "Chiusa",
};

function SortIcon({ column, sortBy, sortDirection }: { column: string; sortBy?: string; sortDirection?: "asc" | "desc" }) {
  if (sortBy !== column) return <div className="w-3 h-3 opacity-30"><ChevronDown className="w-3 h-3" /></div>;
  return sortDirection === "asc" ? (
    <ChevronUp className="w-3 h-3" />
  ) : (
    <ChevronDown className="w-3 h-3" />
  );
}

export function AnomaliesTable({
  anomalies,
  isLoading,
  sortBy,
  sortDirection,
  onSort,
  selectedAnomalies,
  onSelectionChange,
  onSelectAnomaly,
}: AnomaliesTableProps) {
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    onSelectionChange(e.target.checked ? new Set(anomalies.map((a) => a.id)) : new Set());
  };

  const handleSelectOne = (id: string) => {
    const next = new Set(selectedAnomalies);
    next.has(id) ? next.delete(id) : next.add(id);
    onSelectionChange(next);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (anomalies.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-gray-400">
        <p className="text-sm">Nessuna anomalia trovata con i filtri selezionati.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="px-4 py-3 text-left w-10">
              <input
                type="checkbox"
                checked={anomalies.length > 0 && selectedAnomalies.size === anomalies.length}
                onChange={handleSelectAll}
                className="w-4 h-4 rounded accent-primary"
                aria-label="Seleziona tutto"
              />
            </th>
            <th
              onClick={() => onSort("created_at")}
              className="px-4 py-3 text-left font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 select-none"
            >
              <div className="flex items-center gap-1">
                Data <SortIcon column="created_at" sortBy={sortBy} sortDirection={sortDirection} />
              </div>
            </th>
            <th
              onClick={() => onSort("order_number")}
              className="px-4 py-3 text-left font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 select-none"
            >
              <div className="flex items-center gap-1">
                Ordine <SortIcon column="order_number" sortBy={sortBy} sortDirection={sortDirection} />
              </div>
            </th>
            <th className="px-4 py-3 text-left font-semibold text-gray-700">Cliente</th>
            <th className="px-4 py-3 text-left font-semibold text-gray-700">Tipo</th>
            <th className="px-4 py-3 text-left font-semibold text-gray-700">Titolo</th>
            <th
              onClick={() => onSort("impact_amount")}
              className="px-4 py-3 text-left font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 select-none"
            >
              <div className="flex items-center gap-1">
                Impatto <SortIcon column="impact_amount" sortBy={sortBy} sortDirection={sortDirection} />
              </div>
            </th>
            <th className="px-4 py-3 text-left font-semibold text-gray-700">Priorità</th>
            <th className="px-4 py-3 text-left font-semibold text-gray-700">Status</th>
            <th className="px-4 py-3 text-left font-semibold text-gray-700">Assegnato</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {anomalies.map((a) => (
            <tr
              key={a.id}
              className={`hover:bg-gray-50 transition-colors cursor-pointer ${
                selectedAnomalies.has(a.id) ? "bg-blue-50" : ""
              }`}
              onClick={() => onSelectAnomaly(a.id)}
            >
              <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selectedAnomalies.has(a.id)}
                  onChange={() => handleSelectOne(a.id)}
                  className="w-4 h-4 rounded accent-primary"
                  aria-label={`Seleziona anomalia ${a.title}`}
                />
              </td>
              <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                {new Date(a.created_at).toLocaleDateString("it-IT")}{" "}
                {new Date(a.created_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
              </td>
              <td className="px-4 py-3 font-semibold text-primary text-xs">
                {a.order_number || "—"}
              </td>
              <td className="px-4 py-3 text-gray-900 text-xs">{a.client_name || "—"}</td>
              <td className="px-4 py-3">
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[a.type] || "bg-gray-100 text-gray-700"}`}>
                  {TYPE_LABELS[a.type] || a.type}
                </span>
              </td>
              <td className="px-4 py-3 text-gray-700 text-xs max-w-[200px] truncate" title={a.title}>
                {a.title}
              </td>
              <td className="px-4 py-3 font-semibold text-gray-900 text-xs">
                €{a.impact_amount.toLocaleString("it-IT")}
              </td>
              <td className="px-4 py-3">
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${PRIORITY_COLORS[a.priority] || "bg-gray-100 text-gray-700"}`}>
                  {PRIORITY_LABELS[a.priority] || a.priority}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[a.status] || "bg-gray-100 text-gray-700"}`}>
                  {STATUS_LABELS[a.status] || a.status}
                </span>
              </td>
              <td className="px-4 py-3 text-gray-500 text-xs">{a.assigned_to_name || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
