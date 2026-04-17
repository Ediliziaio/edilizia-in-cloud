import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { History, ShieldAlert, ShieldCheck, Trash2, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";

/**
 * Mini storico degli override di feature per azienda.
 *
 * Legge da `company_flag_audit_log` filtrando per
 *   `company_id = companyId` e `field_name IN ('feature_overrides')`.
 *
 * Mostra gli ultimi N eventi con before/after, motivo e autore.
 *
 * Invalidato da ogni mutation in `CompanyFeatureOverridesCard` via
 * `queryKeys.admin.companyFlagAuditLog(companyId)`.
 */

interface Props {
  companyId: string;
  limit?: number;
}

interface AuditLogRow {
  id: string;
  company_id: string;
  changed_by: string;
  field_name: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  reason: string | null;
  created_at: string | null;
  changed_by_profile?: { email: string | null; first_name: string | null; last_name: string | null } | null;
}

export function CompanyOverrideAuditLogCard({ companyId, limit = 15 }: Props) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: queryKeys.admin.companyFlagAuditLog(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_flag_audit_log")
        .select("id, company_id, changed_by, field_name, old_value, new_value, reason, created_at")
        .eq("company_id", companyId)
        .eq("field_name", "feature_overrides")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as AuditLogRow[];
    },
    staleTime: 30 * 1000,
  });

  const renderValueSummary = (value: Record<string, unknown> | null) => {
    if (!value) return <span className="text-muted-foreground italic">—</span>;
    const featureKey = typeof value.feature_key === "string" ? value.feature_key : null;
    const isEnabled =
      typeof value.is_enabled === "boolean" ? (value.is_enabled as boolean) : null;
    const limitValue =
      typeof value.limit_value === "number" ? (value.limit_value as number) : null;
    const expiresAt =
      typeof value.expires_at === "string" ? (value.expires_at as string) : null;

    return (
      <div className="flex flex-wrap items-center gap-1 text-[0.7rem]">
        {featureKey && (
          <code className="text-[0.65rem] bg-muted px-1 rounded">{featureKey}</code>
        )}
        {isEnabled !== null && (
          <Badge
            variant={isEnabled ? "default" : "outline"}
            className={`text-[0.6rem] px-1 ${
              isEnabled ? "bg-emerald-600 hover:bg-emerald-700" : "text-rose-700 border-rose-300"
            }`}
          >
            {isEnabled ? "ON" : "OFF"}
          </Badge>
        )}
        {limitValue !== null && (
          <span className="text-muted-foreground">
            lim:<span className="font-mono ml-0.5">{limitValue}</span>
          </span>
        )}
        {expiresAt && (
          <span className="text-muted-foreground">
            exp:
            <span className="font-mono ml-0.5">
              {format(new Date(expiresAt), "dd/MM/yy", { locale: it })}
            </span>
          </span>
        )}
      </div>
    );
  };

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <History className="h-4 w-4 text-primary" />
              Storico Override Feature
            </CardTitle>
            <CardDescription>
              Ultimi {limit} eventi di modifica override dalla tab Abbonamento. Include sblocchi,
              blocchi, modifiche di limite, scadenza, prezzo custom.
            </CardDescription>
          </div>
          <Badge variant="outline" className="gap-1">
            <History className="h-3 w-3" />
            {rows.length} eventi
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[200px] w-full" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Nessun override registrato per questa azienda.
          </p>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => {
              const isCreation = row.old_value === null && row.new_value !== null;
              const isDeletion = row.old_value !== null && row.new_value === null;
              const Icon = isDeletion ? Trash2 : isCreation ? ShieldCheck : ShieldAlert;
              const iconColor = isDeletion
                ? "text-rose-600"
                : isCreation
                ? "text-emerald-600"
                : "text-amber-600";
              const actionLabel = isDeletion
                ? "Reset"
                : isCreation
                ? "Creato"
                : "Aggiornato";

              return (
                <div
                  key={row.id}
                  className="flex items-start gap-3 rounded-md border p-3 text-sm"
                >
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                    <Icon className={`h-4 w-4 ${iconColor}`} />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[0.65rem] px-1">
                        {actionLabel}
                      </Badge>
                      {row.reason && (
                        <span className="text-xs text-muted-foreground truncate">
                          {row.reason}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {renderValueSummary(row.old_value)}
                      <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                      {renderValueSummary(row.new_value)}
                    </div>
                  </div>
                  <span className="text-[0.65rem] text-muted-foreground shrink-0 whitespace-nowrap">
                    {row.created_at
                      ? format(new Date(row.created_at), "dd/MM/yy HH:mm", { locale: it })
                      : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
