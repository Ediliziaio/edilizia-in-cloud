import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2 } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { differenceInDays } from "date-fns";
import type { CompanyStatus } from "@/types/auth";

interface PipelineCompany {
  id: string;
  name: string;
  status: string;
  created_at: string;
  trial_ends_at: string | null;
  logo_url: string | null;
  subscription_plans: { name: string; price_monthly: number } | null;
}

interface CompanyPipelineViewProps {
  companies: PipelineCompany[];
  healthScores?: Record<string, { score: number; health: string }>;
}

const COLUMNS: { key: string; label: string; color: string }[] = [
  { key: "trial", label: "Trial", color: "border-t-blue-500" },
  { key: "active", label: "Attivo", color: "border-t-green-500" },
  { key: "suspended", label: "Sospeso", color: "border-t-amber-500" },
  { key: "expired", label: "Scaduto", color: "border-t-red-500" },
];

const healthBadge: Record<string, { label: string; className: string }> = {
  healthy: { label: "●", className: "text-green-500" },
  at_risk: { label: "●", className: "text-amber-500" },
  critical: { label: "●", className: "text-red-500" },
};

export function CompanyPipelineView({ companies, healthScores = {} }: CompanyPipelineViewProps) {
  const navigate = useNavigate();

  const grouped = useMemo(() => {
    const map: Record<string, PipelineCompany[]> = { trial: [], active: [], suspended: [], expired: [] };
    companies.forEach((c) => {
      const st = c.status || "trial";
      if (map[st]) map[st].push(c);
      else map.trial.push(c);
    });
    return map;
  }, [companies]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      {COLUMNS.map((col) => {
        const items = grouped[col.key] || [];
        const totalMrr = items.reduce((s, c) => s + (c.subscription_plans?.price_monthly || 0), 0);
        return (
          <div key={col.key} className="space-y-2">
            <div className={`rounded-lg border border-t-4 ${col.color} bg-card p-3`}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">{col.label}</span>
                <Badge variant="secondary" className="text-xs">{items.length}</Badge>
              </div>
              {totalMrr > 0 && (
                <p className="text-xs text-muted-foreground mt-0.5">MRR: {formatCurrency(totalMrr)}</p>
              )}
            </div>
            <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
              {items.map((c) => {
                const plan = c.subscription_plans;
                const hs = healthScores[c.id];
                const daysInStatus = differenceInDays(new Date(), new Date(c.created_at));
                const hb = hs ? healthBadge[hs.health] || healthBadge.critical : null;

                return (
                  <Card
                    key={c.id}
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => navigate(`/admin/aziende/${c.id}`)}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2">
                        {c.logo_url ? (
                          <img src={c.logo_url} alt="" className="h-6 w-6 rounded object-cover" />
                        ) : (
                          <div className="h-6 w-6 rounded bg-primary/10 flex items-center justify-center">
                            <Building2 className="h-3 w-3 text-primary" />
                          </div>
                        )}
                        <span className="text-sm font-medium truncate flex-1">{c.name}</span>
                        {hb && <span className={`text-xs ${hb.className}`} title={`Health: ${hs?.score}`}>{hb.label}</span>}
                      </div>
                      <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                        <span>{plan ? formatCurrency(plan.price_monthly) : "—"}</span>
                        <span>{daysInStatus}gg</span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              {items.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">Nessuna azienda</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
