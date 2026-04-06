import { useState } from "react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import {
  ArrowUpCircle,
  ArrowDownCircle,
  Euro,
  X,
  Clock,
  RefreshCw,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Activity,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { LifecycleEvent } from "@/hooks/useLifecycleEvents";

const eventConfig: Record<
  string,
  { label: string; icon: React.ElementType; className: string }
> = {
  activated: {
    label: "Attivazione",
    icon: CheckCircle,
    className: "text-green-600 bg-green-100 border-green-200",
  },
  upgraded: {
    label: "Upgrade piano",
    icon: ArrowUpCircle,
    className: "text-green-600 bg-green-100 border-green-200",
  },
  downgraded: {
    label: "Downgrade piano",
    icon: ArrowDownCircle,
    className: "text-red-600 bg-red-100 border-red-200",
  },
  plan_changed: {
    label: "Cambio piano",
    icon: RefreshCw,
    className: "text-blue-600 bg-blue-100 border-blue-200",
  },
  payment_received: {
    label: "Pagamento ricevuto",
    icon: Euro,
    className: "text-blue-600 bg-blue-100 border-blue-200",
  },
  cancelled: {
    label: "Cancellazione",
    icon: X,
    className: "text-red-600 bg-red-100 border-red-200",
  },
  suspended: {
    label: "Sospensione",
    icon: Clock,
    className: "text-orange-600 bg-orange-100 border-orange-200",
  },
  reactivated: {
    label: "Riattivazione",
    icon: CheckCircle,
    className: "text-green-600 bg-green-100 border-green-200",
  },
  trial_started: {
    label: "Avvio trial",
    icon: Clock,
    className: "text-orange-600 bg-orange-100 border-orange-200",
  },
  trial_extended: {
    label: "Estensione trial",
    icon: Clock,
    className: "text-orange-600 bg-orange-100 border-orange-200",
  },
  trial_expired: {
    label: "Trial scaduto",
    icon: Clock,
    className: "text-red-600 bg-red-100 border-red-200",
  },
  renewed: {
    label: "Rinnovo",
    icon: RefreshCw,
    className: "text-blue-600 bg-blue-100 border-blue-200",
  },
};

const fallbackConfig = {
  label: "Evento",
  icon: Activity,
  className: "text-gray-600 bg-gray-100 border-gray-200",
};

function humanizeEventType(type: string): string {
  return (
    eventConfig[type]?.label ??
    type
      .replace(/_/g, " ")
      .replace(/\b\w/g, (l) => l.toUpperCase())
  );
}

interface LifecycleEventItemProps {
  event: LifecycleEvent;
  isLast: boolean;
}

export function LifecycleEventItem({ event, isLast }: LifecycleEventItemProps) {
  const [expanded, setExpanded] = useState(false);
  const cfg = eventConfig[event.event_type] ?? fallbackConfig;
  const Icon = cfg.icon;

  const hasExtra = !!(event.old_status || event.new_status || event.plan_id || event.notes);

  return (
    <div className="flex gap-3">
      {/* Icona + linea timeline */}
      <div className="flex flex-col items-center flex-shrink-0">
        <div className={`rounded-full p-1.5 border ${cfg.className}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        {!isLast && <div className="w-px flex-1 bg-border mt-1 mb-0.5" />}
      </div>

      {/* Contenuto */}
      <div className={`flex-1 ${isLast ? "" : "pb-4"}`}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-medium">{humanizeEventType(event.event_type)}</p>
            {event.notes && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{event.notes}</p>
            )}
          </div>
          <span className="text-xs text-muted-foreground flex-shrink-0">
            {format(new Date(event.created_at), "dd/MM/yy HH:mm", { locale: it })}
          </span>
        </div>

        {/* Stato prima/dopo */}
        {(event.old_status || event.new_status) && (
          <div className="flex items-center gap-1 mt-1.5 flex-wrap">
            {event.old_status && (
              <Badge variant="outline" className="text-[11px] text-muted-foreground">
                {event.old_status}
              </Badge>
            )}
            {event.old_status && event.new_status && (
              <span className="text-muted-foreground text-xs">→</span>
            )}
            {event.new_status && (
              <Badge variant="outline" className={`text-[11px] ${cfg.className}`}>
                {event.new_status}
              </Badge>
            )}
          </div>
        )}

        {/* Accordion metadati */}
        {hasExtra && (
          <button
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-1 transition-colors"
            onClick={() => setExpanded((prev) => !prev)}
          >
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {expanded ? "Nascondi dettagli" : "Mostra dettagli"}
          </button>
        )}

        {expanded && (
          <div className="mt-2 rounded-md bg-muted p-2 text-xs space-y-1">
            {event.plan_id && (
              <div>
                <span className="text-muted-foreground">Piano ID: </span>
                <span className="font-mono">{event.plan_id}</span>
              </div>
            )}
            {event.previous_plan_id && (
              <div>
                <span className="text-muted-foreground">Piano precedente: </span>
                <span className="font-mono">{event.previous_plan_id}</span>
              </div>
            )}
            {event.performed_by && (
              <div>
                <span className="text-muted-foreground">Eseguito da: </span>
                <span className="font-mono">{event.performed_by}</span>
              </div>
            )}
            {event.notes && (
              <div>
                <span className="text-muted-foreground">Note: </span>
                <span>{event.notes}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
