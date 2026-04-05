/**
 * Dettaglio campagna SMS con log degli invii e statistiche.
 *
 * @param campagna - Campagna da visualizzare
 */
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { CheckCircle2, XCircle, Clock, Send, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useSmsLog } from "@/hooks/useSmsLog";
import { SmsStatsBadge } from "./SmsStatsBadge";
import type { SmsCampagna, SmsLogStato } from "@/types/sms-marketing";

const STATO_ICON: Record<SmsLogStato, React.ElementType> = {
  pending: Clock,
  inviato: Send,
  consegnato: CheckCircle2,
  fallito: XCircle,
  opt_out: AlertCircle,
};

const STATO_COLOR: Record<SmsLogStato, string> = {
  pending: "text-muted-foreground",
  inviato: "text-blue-600",
  consegnato: "text-emerald-600",
  fallito: "text-destructive",
  opt_out: "text-amber-600",
};

interface SmsCampagnaDetailProps {
  campagna: SmsCampagna;
}

export function SmsCampagnaDetail({ campagna }: SmsCampagnaDetailProps) {
  const { logs, stats, isLoading } = useSmsLog(campagna.id);

  return (
    <div className="space-y-4">
      {/* Header campagna */}
      <div className="flex items-center gap-2">
        <h3 className="font-semibold">{campagna.nome}</h3>
        <SmsStatsBadge stato={campagna.stato} />
      </div>

      {/* KPI */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Inviati", value: campagna.inviati },
          { label: "Consegnati", value: campagna.consegnati },
          { label: "Errori", value: campagna.errori },
          { label: "Tasso", value: `${stats.tasso_consegna.toFixed(1).replace(".", ",")}%` },
        ].map((k) => (
          <Card key={k.label}>
            <CardContent className="p-3 text-center">
              <div className="text-lg font-bold tabular-nums">{typeof k.value === "number" ? k.value.toLocaleString("it-IT") : k.value}</div>
              <div className="text-xs text-muted-foreground">{k.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Messaggio */}
      <div className="rounded-md border p-3 bg-muted/20">
        <p className="text-xs text-muted-foreground mb-1">Testo inviato · mittente: <strong>{campagna.mittente}</strong></p>
        <p className="text-sm">{campagna.messaggio}</p>
      </div>

      {/* Log invii */}
      <div>
        <h4 className="text-sm font-medium mb-2">Log invii ({logs.length.toLocaleString("it-IT")})</h4>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessun log disponibile.</p>
        ) : (
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {logs.map((log) => {
              const Icon = STATO_ICON[log.stato] ?? Clock;
              return (
                <div key={log.id} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted/20 text-xs">
                  <Icon className={`h-3.5 w-3.5 shrink-0 ${STATO_COLOR[log.stato]}`} />
                  <span className="font-mono w-28 shrink-0">{log.telefono}</span>
                  <Badge variant="outline" className={`text-xs ${STATO_COLOR[log.stato]}`}>
                    {log.stato}
                  </Badge>
                  {log.inviato_at && (
                    <span className="text-muted-foreground ml-auto">
                      {format(new Date(log.inviato_at), "HH:mm d MMM", { locale: it })}
                    </span>
                  )}
                  {log.errore_dettaglio && (
                    <span className="text-destructive truncate max-w-32" title={log.errore_dettaglio}>
                      {log.errore_dettaglio}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
