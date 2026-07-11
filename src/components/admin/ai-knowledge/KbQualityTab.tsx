/**
 * KbQualityTab — Lista chunks problematici dalla view v_kb_quality_alerts.
 *
 * Tipi alert:
 *   - expired:           valid_until passato
 *   - stale_unverified:  mai verificato o >180gg
 *   - orphaned:          0 hits da >30gg
 *   - too_short:         <100 char
 *   - too_long:          >8000 char
 *   - low_similarity:    avg retrieval similarity <0.40
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Clock, FileWarning, Hash, TrendingDown, Trash2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface QualityAlert {
  id: string;
  chunk_id: string;
  title: string | null;
  category: string | null;
  category_path: string | null;
  content_length: number;
  estimated_tokens: number;
  alert_type: string;
  severity: "critical" | "warning" | "info" | "ok";
  hits_count: number | null;
  last_used_at: string | null;
  last_verified_at: string | null;
  valid_until: string | null;
  avg_retrieval_similarity: number | null;
}

const ALERT_CFG: Record<string, { label: string; icon: LucideIcon; description: string }> = {
  expired:           { label: "Scaduto",          icon: AlertTriangle, description: "valid_until già passato — l'LLM potrebbe rispondere info obsolete" },
  stale_unverified:  { label: "Da verificare",    icon: Clock,         description: "Mai verificato o non rivisto da >180 giorni" },
  orphaned:          { label: "Orfano",           icon: Trash2,        description: "Mai usato (0 hits) da >30 giorni — potenzialmente da rimuovere" },
  too_short:         { label: "Troppo corto",     icon: FileWarning,   description: "<100 caratteri — embedding poco informativo" },
  too_long:          { label: "Troppo lungo",     icon: FileWarning,   description: ">8000 caratteri — splittare in chunks" },
  low_similarity:    { label: "Bassa qualità",    icon: TrendingDown,  description: "Retrieval similarity media <0.40 — riformula o rimuovi" },
};

const SEVERITY_COLOR: Record<QualityAlert["severity"], string> = {
  critical: "border-rose-300 text-rose-700 bg-rose-50",
  warning:  "border-amber-300 text-amber-700 bg-amber-50",
  info:     "border-blue-300 text-blue-700 bg-blue-50",
  ok:       "border-emerald-300 text-emerald-700 bg-emerald-50",
};

export function KbQualityTab() {
  const { data: alerts, isLoading } = useQuery({
    queryKey: ["admin-kb-quality"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_kb_quality_alerts")
        .select("*")
        .neq("alert_type", "ok")
        .limit(500);
      if (error) throw error;
      // severity è TEXT: l'ORDER BY testuale metteva "warning" > "info" >
      // "critical" → i critici finivano in fondo ed erano i primi tagliati
      // dal limit. Ordina per rank reale lato client.
      const rank: Record<string, number> = { critical: 3, warning: 2, info: 1 };
      return ((data ?? []) as QualityAlert[]).sort(
        (a, b) => (rank[b.severity] ?? 0) - (rank[a.severity] ?? 0),
      );
    },
  });

  // Aggregazione per tipo
  const byType = (alerts ?? []).reduce<Record<string, number>>((acc, a) => {
    acc[a.alert_type] = (acc[a.alert_type] ?? 0) + 1;
    return acc;
  }, {});

  const critical = alerts?.filter((a) => a.severity === "critical").length ?? 0;
  const warning = alerts?.filter((a) => a.severity === "warning").length ?? 0;
  const info = alerts?.filter((a) => a.severity === "info").length ?? 0;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Quality Alerts</h3>
        <p className="text-xs text-muted-foreground">
          Chunks della KB con problemi: scaduti, non verificati, orfani, troppo corti/lunghi, bassa retrieval quality.
        </p>
      </div>

      {/* Summary */}
      {alerts && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Card>
            <CardContent className="p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Totali</p>
              <p className="text-2xl font-bold mt-0.5">{alerts.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Critici</p>
              <p className={`text-2xl font-bold mt-0.5 ${critical > 0 ? "text-rose-600" : "text-muted-foreground"}`}>
                {critical}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Warning</p>
              <p className={`text-2xl font-bold mt-0.5 ${warning > 0 ? "text-amber-600" : "text-muted-foreground"}`}>
                {warning}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Info</p>
              <p className="text-2xl font-bold mt-0.5 text-muted-foreground">{info}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Breakdown per tipo */}
      {Object.keys(byType).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(byType).map(([type, count]) => {
            const cfg = ALERT_CFG[type];
            if (!cfg) return null;
            const Icon = cfg.icon;
            return (
              <Badge key={type} variant="outline" className="text-xs py-1.5 px-2">
                <Icon className="h-3 w-3 mr-1.5" />
                {cfg.label}: <strong className="ml-1">{count}</strong>
              </Badge>
            );
          })}
        </div>
      )}

      {/* Lista alert */}
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : !alerts || alerts.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-sm text-emerald-600 font-medium">✓ Nessun alert qualità</p>
            <p className="text-xs text-muted-foreground mt-1">
              Tutti i chunks della KB sono in buono stato.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-1.5">
          {alerts.map((a) => {
            const cfg = ALERT_CFG[a.alert_type];
            const Icon = cfg?.icon ?? Hash;
            return (
              <Card key={a.id}>
                <CardContent className="p-3 flex items-start gap-3">
                  <Badge variant="outline" className={`shrink-0 mt-0.5 ${SEVERITY_COLOR[a.severity]}`}>
                    <Icon className="h-3 w-3 mr-1" />
                    {cfg?.label ?? a.alert_type}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{a.title || "(senza titolo)"}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {cfg?.description}
                    </p>
                    <div className="flex flex-wrap gap-2 mt-1.5 text-[10px] text-muted-foreground">
                      <span className="font-mono">chunk:{a.chunk_id}</span>
                      {a.category_path && <span>📂 {a.category_path}</span>}
                      <span>{a.estimated_tokens.toLocaleString("it-IT")} tokens</span>
                      <span>{a.hits_count ?? 0} hits</span>
                      {a.avg_retrieval_similarity !== null && (
                        <span>sim media {(a.avg_retrieval_similarity * 100).toFixed(0)}%</span>
                      )}
                      {a.valid_until && (
                        <span>scade: {new Date(a.valid_until).toLocaleDateString("it-IT")}</span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
