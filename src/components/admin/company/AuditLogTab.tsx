import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Shield, CreditCard, ToggleLeft, Clock, User } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useAuditLog, type AuditLogEntry } from "@/hooks/superadmin/useAuditLog";

interface AuditLogTabProps {
  companyId: string;
}

/** Restituisce l'icona corretta in base al nome del campo modificato */
function FieldIcon({ fieldName }: { fieldName: string }) {
  if (fieldName === "billing_status") return <Shield className="h-4 w-4 text-blue-500" />;
  if (fieldName === "subscription_plan_id") return <CreditCard className="h-4 w-4 text-purple-500" />;
  if (fieldName === "status") return <ToggleLeft className="h-4 w-4 text-green-500" />;
  return <Clock className="h-4 w-4 text-gray-400" />;
}

/** Formatta un valore unknown come stringa leggibile */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "Sì" : "No";
  return String(value);
}

/** Singola voce della timeline */
function AuditEntry({ entry }: { entry: AuditLogEntry }) {
  return (
    <div className="flex gap-4 relative">
      {/* Linea verticale della timeline */}
      <div className="flex flex-col items-center">
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted border">
          <FieldIcon fieldName={entry.field_name} />
        </div>
        <div className="w-px flex-1 bg-border mt-1" />
      </div>

      {/* Contenuto */}
      <div className="pb-6 flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <Badge variant="secondary" className="text-xs font-mono">
            {entry.field_name}
          </Badge>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {format(new Date(entry.created_at), "d MMM yyyy HH:mm", { locale: it })}
          </span>
        </div>

        <p className="text-sm">
          <span className="font-bold">{entry.field_name}</span>:{" "}
          <span className="text-muted-foreground">{formatValue(entry.old_value)}</span>
          {" → "}
          <span className="font-medium text-foreground">{formatValue(entry.new_value)}</span>
        </p>

        {entry.reason && (
          <p className="text-xs text-muted-foreground mt-1 italic">Motivo: {entry.reason}</p>
        )}

        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
          <User className="h-3 w-3" />
          {entry.profile_name ?? "Operatore sconosciuto"}
          {entry.ip_address && (
            <span className="ml-2 font-mono">IP: {entry.ip_address}</span>
          )}
        </p>
      </div>
    </div>
  );
}

/** Skeleton placeholder per il caricamento */
function AuditSkeleton() {
  return (
    <div className="space-y-4">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="flex gap-4">
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-3 w-40" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Tab con la timeline verticale delle modifiche ai flag di un'azienda */
export function AuditLogTab({ companyId }: AuditLogTabProps) {
  const { data: entries, isLoading, error } = useAuditLog(companyId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Shield className="h-4 w-4" />
          Storico modifiche flag
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && <AuditSkeleton />}

        {error && (
          <p className="text-sm text-destructive">
            Errore nel caricamento: {(error as Error).message}
          </p>
        )}

        {!isLoading && !error && entries?.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nessuna modifica registrata
          </p>
        )}

        {!isLoading && !error && entries && entries.length > 0 && (
          <div className="mt-2">
            {entries.map((entry) => (
              <AuditEntry key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
