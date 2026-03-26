import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Clock, Search, FileText, PenLine, Send, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import type { InternalAgentAction } from "../hooks/useInternalCallLogs";
import { format } from "date-fns";
import { it } from "date-fns/locale";

const TOOL_ICON: Record<string, typeof Search> = {
  identify_caller: Search,
  get_client_info: Search,
  get_order_status: Search,
  get_orders_list: Search,
  get_appointment_info: Clock,
  create_note: PenLine,
  create_activity: FileText,
  update_order_date: Clock,
  send_sms_confirmation: Send,
  create_support_ticket: AlertTriangle,
  schedule_callback: Clock,
};

export const TOOL_LABEL: Record<string, string> = {
  identify_caller: "Identifica Chiamante",
  get_client_info: "Info Cliente",
  get_order_status: "Stato Ordine",
  get_orders_list: "Lista Ordini",
  get_appointment_info: "Appuntamenti",
  create_note: "Crea Nota",
  create_activity: "Crea Attività",
  update_order_date: "Aggiorna Data",
  send_sms_confirmation: "Invia SMS",
  create_support_ticket: "Crea Segnalazione",
  schedule_callback: "Programma Richiamo",
};

interface Props {
  actions: InternalAgentAction[];
}

function ActionRow({ action }: { action: InternalAgentAction }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = TOOL_ICON[action.tool_name] ?? FileText;
  const isSuccess = action.status === "success";
  const isError = action.status === "error";
  const hasDetail = action.input_params || action.result || action.error_message;

  return (
    <div className="relative flex gap-3">
      {/* Dot */}
      <div
        className={`absolute -left-6 top-1 h-[22px] w-[22px] rounded-full border-2 flex items-center justify-center ${
          isSuccess
            ? "bg-accent border-primary"
            : isError
            ? "bg-destructive/10 border-destructive"
            : "bg-muted border-muted-foreground/40"
        }`}
      >
        {isSuccess ? (
          <CheckCircle2 className="h-3 w-3 text-primary" />
        ) : isError ? (
          <XCircle className="h-3 w-3 text-destructive" />
        ) : (
          <Clock className="h-3 w-3 text-muted-foreground" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <button
          type="button"
          className="w-full text-left"
          onClick={() => hasDetail && setExpanded(!expanded)}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium">
              {TOOL_LABEL[action.tool_name] ?? action.tool_name}
            </span>
            <Badge
              variant={isSuccess ? "default" : isError ? "destructive" : "secondary"}
              className="text-[10px] px-1.5 py-0"
            >
              {action.status}
            </Badge>
            <span className="text-xs text-muted-foreground ml-auto">
              {format(new Date(action.executed_at), "HH:mm:ss", { locale: it })}
            </span>
            {hasDetail && (
              expanded
                ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </div>
        </button>

        {action.entity_type && action.entity_id && !expanded && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {action.entity_type}: {action.entity_id.slice(0, 8)}…
          </p>
        )}

        {/* Expandable detail */}
        {expanded && (
          <div className="mt-2 space-y-2 rounded-md border bg-muted/40 p-2 text-xs font-mono">
            {action.error_message && (
              <div>
                <p className="text-[10px] font-semibold text-destructive uppercase mb-0.5">Errore</p>
                <p className="text-destructive break-all">{action.error_message}</p>
              </div>
            )}
            {action.input_params && Object.keys(action.input_params).length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-0.5">Input</p>
                <pre className="whitespace-pre-wrap break-all text-[10px] text-foreground">
                  {JSON.stringify(action.input_params, null, 2)}
                </pre>
              </div>
            )}
            {action.result && Object.keys(action.result).length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-0.5">Risultato</p>
                <pre className="whitespace-pre-wrap break-all text-[10px] text-foreground">
                  {JSON.stringify(action.result, null, 2)}
                </pre>
              </div>
            )}
            {action.entity_type && action.entity_id && (
              <p className="text-muted-foreground">{action.entity_type}: {action.entity_id}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function ActionTimeline({ actions }: Props) {
  if (!actions.length) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        Nessuna azione CRM registrata per questa chiamata.
      </p>
    );
  }

  return (
    <div className="relative pl-6 space-y-4">
      {/* Vertical line */}
      <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-border" />
      {actions.map((action) => (
        <ActionRow key={action.id} action={action} />
      ))}
    </div>
  );
}
