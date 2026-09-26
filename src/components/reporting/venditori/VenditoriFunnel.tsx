import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { TrendingDown } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import type { FunnelStage } from "@/hooks/useVendorReport";

/*
 * Dove sono oggi le opportunità create nel periodo, fase per fase, nell'ordine
 * della pipeline (get_vendor_funnel_stages le ordina per posizione).
 *
 * Prima tra una fase e l'altra c'era un «conv. %» = opportunità nella fase
 * dopo ÷ opportunità in questa: su una fotografia di dove stanno le trattative
 * oggi non è una conversione (usciva anche 133%). E le fasi venivano
 * riordinate indovinando dal nome («nuovo», «proposta»…), che per nomi come
 * «Primo Contatto» non funzionava.
 */

const STAGE_COLORS = [
  "hsl(var(--primary) / 0.5)",
  "hsl(var(--primary) / 0.6)",
  "hsl(var(--primary) / 0.7)",
  "hsl(var(--primary) / 0.8)",
  "hsl(var(--primary) / 0.9)",
  "hsl(var(--primary))",
];

const WON_STAGES = ["vinto", "vinta", "vinte", "won", "chiuso vinto", "closed won"];
const LOST_STAGES = ["perso", "persa", "perse", "lost", "chiuso perso", "closed lost"];

const norm = (s: string) => s.toLowerCase().replace(/[_-]+/g, " ").trim();
function isWon(stage: string) { return WON_STAGES.includes(norm(stage)); }
function isLost(stage: string) { return LOST_STAGES.includes(norm(stage)); }

export function VenditoriFunnel({ stages }: { stages: FunnelStage[] }) {
  if (!stages.length) return null;

  const maxCount = Math.max(...stages.map(s => s.count_opp), 1);
  const totalOpp = stages.reduce((a, s) => a + s.count_opp, 0);
  const conVinteOPerse = stages.some(s => isWon(s.stage ?? "") || isLost(s.stage ?? ""));

  return (
    // Telefono: barre più basse, senza spiegazione né legenda.
    <Card>
      <CardHeader className="max-sm:p-3 max-sm:pb-2">
        <CardTitle className="flex items-center gap-2 text-base max-sm:text-sm">
          <TrendingDown className="h-5 w-5 max-sm:hidden" />
          Opportunità per fase
        </CardTitle>
        <CardDescription className="max-sm:hidden">
          Dove sono oggi le {totalOpp} opportunità create nel periodo, nell'ordine della pipeline
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1.5 max-sm:p-3 max-sm:pt-0">
        {stages.map((stage, idx) => {
          const width = Math.max((stage.count_opp / maxCount) * 100, 8);
          const won = isWon(stage.stage ?? "");
          const lost = isLost(stage.stage ?? "");
          const bgColor = won
            ? "hsl(142 76% 36%)"
            : lost
            ? "hsl(0 84% 60%)"
            : STAGE_COLORS[idx % STAGE_COLORS.length];

          return (
            <div key={stage.stage} className="flex items-center gap-3 max-sm:gap-2">
              <span className="w-28 text-sm text-right truncate text-muted-foreground font-medium max-sm:w-24 max-sm:text-[11px]" title={stage.stage}>
                {stage.stage}
              </span>
              <div className="flex-1 h-7 bg-muted rounded-md overflow-hidden max-sm:h-5">
                <div
                  className="h-full rounded-md flex items-center justify-end px-2 text-xs font-semibold text-primary-foreground transition-all"
                  style={{ width: `${width}%`, backgroundColor: bgColor }}
                >
                  {stage.count_opp}
                  <span className="ml-1 opacity-75 max-sm:hidden">{Number(stage.pct_del_totale ?? 0).toLocaleString("it-IT")}%</span>
                </div>
              </div>
              <span className="w-24 text-sm text-right tabular-nums text-muted-foreground max-sm:w-[72px] max-sm:text-[11px]">
                {formatCurrency(stage.valore_totale)}
              </span>
            </div>
          );
        })}

        {conVinteOPerse && (
          <div className="flex items-center gap-4 pt-3 text-xs text-muted-foreground max-sm:hidden">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: "hsl(142 76% 36%)" }} /> Vinte
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: "hsl(0 84% 60%)" }} /> Perse
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
