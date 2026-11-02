import { Check } from "lucide-react";
import type { OrderStatus } from "@/lib/orderUtils";
import type { StatusHistoryItem } from "./OrderProgressTracker";
import { statusVisits } from "@/lib/orders/statusHistory";

interface OrdineStatusStripProps {
  statuses: OrderStatus[];
  currentStatusId: string | null;
  statusHistory?: StatusHistoryItem[];
  onStatusChange?: (statusId: string) => void;
}

/**
 * Tutti gli stati in vista, col nome intero e quello attuale pieno: va a capo invece
 * di scorrere, così lo stato attuale non resta mai fuori schermo. Clic = cambio stato,
 * con la conferma di chi chiama. La spunta dice che ci è passata, non che è finito.
 */
export function OrdineStatusStrip({ statuses, currentStatusId, statusHistory = [], onStatusChange }: OrdineStatusStripProps) {
  const sorted = [...statuses].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const visits = statusVisits(statusHistory);

  return (
    <ol className="flex flex-wrap gap-1.5" aria-label="Stati della commessa">
      {sorted.map((status) => {
        const isCurrent = status.id === currentStatusId;
        const visited = visits.get(status.id);
        const color = status.color || "#64748b";
        const label = isCurrent ? `Stato attuale: ${status.name}` : `Imposta stato "${status.name}"`;
        return (
          <li key={status.id}>
            <button
              type="button"
              disabled={!onStatusChange || isCurrent}
              aria-current={isCurrent ? "step" : undefined}
              data-status-visited={visited ? "true" : "false"}
              aria-label={label}
              title={visited ? `${label} · ultimo passaggio ${visited.toLocaleDateString("it-IT")}` : label}
              onClick={() => onStatusChange?.(status.id)}
              style={isCurrent ? { backgroundColor: color, borderColor: color, color: "#fff" } : undefined}
              className={[
                "inline-flex min-h-7 items-center gap-1 rounded-md border px-2 py-0.5 text-xs transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-default",
                isCurrent ? "font-semibold" : visited ? "border-slate-300 bg-white text-slate-700" : "border-slate-200 bg-white text-slate-500",
                !isCurrent && onStatusChange ? "hover:border-slate-400 hover:bg-slate-50" : "",
              ].join(" ")}
            >
              {visited && !isCurrent && <Check className="h-3 w-3 text-emerald-600" aria-hidden="true" />}
              {status.name}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
