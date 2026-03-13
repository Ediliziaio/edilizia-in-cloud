import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { TrendingDown } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import type { FunnelStage } from "@/hooks/useVendorReport";

const STAGE_ORDER: Record<string, number> = {
  nuovo: 1, lead: 1,
  prospect: 2, qualificato: 2,
  appuntamento: 3, presentazione: 3,
  proposta: 4, offerta: 4, preventivo: 4,
  trattativa: 5, negoziazione: 5,
  decisione: 6,
  vinto: 7, won: 7, chiuso_vinto: 7, closed_won: 7,
  perso: 8, lost: 8, chiuso_perso: 8, closed_lost: 8,
};

const STAGE_COLORS = [
  "hsl(var(--primary) / 0.5)",
  "hsl(var(--primary) / 0.6)",
  "hsl(var(--primary) / 0.7)",
  "hsl(var(--primary) / 0.8)",
  "hsl(var(--primary) / 0.9)",
  "hsl(var(--primary))",
];

const WON_STAGES = ["vinto", "won", "chiuso_vinto", "closed_won"];
const LOST_STAGES = ["perso", "lost", "chiuso_perso", "closed_lost"];

function isWon(stage: string) { return WON_STAGES.includes(stage.toLowerCase()); }
function isLost(stage: string) { return LOST_STAGES.includes(stage.toLowerCase()); }

export function VenditoriFunnel({ stages }: { stages: FunnelStage[] }) {
  if (!stages.length) return null;

  const openStages = stages
    .filter(s => !isWon(s.stage ?? "") && !isLost(s.stage ?? ""))
    .sort((a, b) => (STAGE_ORDER[a.stage?.toLowerCase() ?? ""] ?? 5) - (STAGE_ORDER[b.stage?.toLowerCase() ?? ""] ?? 5));
  const wonStages = stages.filter(s => isWon(s.stage ?? ""));
  const lostStages = stages.filter(s => isLost(s.stage ?? ""));
  const allOrdered = [...openStages, ...wonStages, ...lostStages];

  const maxCount = Math.max(...stages.map(s => s.count_opp), 1);
  const totalOpp = stages.reduce((a, s) => a + s.count_opp, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingDown className="h-5 w-5" />
          Funnel Opportunità
        </CardTitle>
        <CardDescription>{totalOpp} opportunità totali nel periodo</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        {allOrdered.map((stage, idx) => {
          const width = Math.max((stage.count_opp / maxCount) * 100, 8);
          const won = isWon(stage.stage ?? "");
          const lost = isLost(stage.stage ?? "");
          const bgColor = won
            ? "hsl(142 76% 36%)"
            : lost
            ? "hsl(0 84% 60%)"
            : STAGE_COLORS[idx % STAGE_COLORS.length];

          const nextStage = allOrdered[idx + 1];
          const convRate =
            nextStage && !won && !lost && stage.count_opp > 0
              ? Math.round((nextStage.count_opp / stage.count_opp) * 100)
              : null;

          return (
            <div key={stage.stage} className="space-y-0.5">
              {idx > 0 && convRate !== null && (
                <div className="flex items-center gap-2 pl-28 text-xs text-muted-foreground py-0.5">
                  <div className="w-px h-3 bg-border" />
                  ↓ conv. {convRate}%
                </div>
              )}
              <div className="flex items-center gap-3">
                <span className="w-28 text-sm text-right truncate text-muted-foreground font-medium">
                  {stage.stage}
                </span>
                <div className="flex-1 h-7 bg-muted rounded-md overflow-hidden">
                  <div
                    className="h-full rounded-md flex items-center justify-end px-2 text-xs font-semibold text-primary-foreground transition-all"
                    style={{ width: `${width}%`, backgroundColor: bgColor }}
                  >
                    {stage.count_opp}
                    <span className="ml-1 opacity-75">{stage.pct_del_totale}%</span>
                  </div>
                </div>
                <span className="w-24 text-sm text-right tabular-nums text-muted-foreground">
                  {formatCurrency(stage.valore_totale)}
                </span>
              </div>
            </div>
          );
        })}

        <div className="flex items-center gap-4 pt-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: "hsl(142 76% 36%)" }} /> Vinte
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: "hsl(0 84% 60%)" }} /> Perse
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
