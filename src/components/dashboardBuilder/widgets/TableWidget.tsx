/**
 * TableWidget — tabella breakdown con stile "leaderboard" alla Executive
 * Dashboard (rank medaglia trofeo sulla prima riga, sfondo crema sulla #1,
 * numerali tabellari, header uppercase tracking-wider).
 *
 * Colonne: label (sinistra) + valore (destra). Intestazioni personalizzabili
 * via `cfg.columns`.
 */
import { AlertTriangle, Inbox, Trophy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { DashboardWidget, ResolvedWidget } from "@/lib/dashboardBuilder/types";
import { formatValue } from "../formatValue";
import { widgetLabel } from "@/lib/dashboardBuilder/widgetLabels";

interface Props {
  widget: DashboardWidget;
  resolved: ResolvedWidget | undefined;
}

function displayTitle(widget: DashboardWidget): string {
  const cfg = widget.config ?? {};
  if (cfg.title && cfg.title.trim()) return cfg.title.trim();
  if (cfg.metric) return cfg.metric;
  return widgetLabel(widget.type);
}

export function TableWidget({ widget, resolved }: Props) {
  const cfg = widget.config ?? {};
  const title = displayTitle(widget);
  const rows = resolved?.status === "ok" ? resolved.breakdown ?? [] : [];
  const error = resolved?.status === "error" ? resolved.error : null;

  // Colonne configurabili via cfg.columns; default label/valore.
  const columns =
    cfg.columns && cfg.columns.length >= 2
      ? cfg.columns
      : [
          { key: "label", label: "Categoria" },
          { key: "value", label: "Valore" },
        ];
  const labelCol = columns[0];
  const valueCol = columns[1];

  // Solo breakdown che ha senso "classificare" (customer, member, team, supplier,
  // assigned_to) riceve lo styling leaderboard con medaglia trofeo. Gli altri
  // breakdown (month, category, ecc.) mantengono lo stile tabella piatto.
  const leaderboardDims = new Set([
    "customer",
    "member",
    "team",
    "supplier",
    "assigned_to",
  ]);
  const isLeaderboard =
    cfg.breakdown != null && leaderboardDims.has(cfg.breakdown);

  return (
    <Card className="h-full flex flex-col overflow-hidden shadow-sm">
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="text-sm font-semibold text-foreground/90 flex items-center gap-2 truncate">
          {isLeaderboard && (
            <Trophy className="h-4 w-4 text-amber-500 shrink-0" />
          )}
          <span className="truncate">{title}</span>
        </CardTitle>
        {cfg.subtitle && (
          <p className="text-[11px] text-muted-foreground truncate">
            {cfg.subtitle}
          </p>
        )}
      </CardHeader>
      <CardContent className="flex-1 p-0 overflow-auto">
        {error ? (
          <div className="h-full w-full flex flex-col items-center justify-center gap-2 px-4 py-6 text-center">
            <div className="w-8 h-8 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </div>
            <p className="text-[11px] text-destructive/90 leading-snug line-clamp-3">
              {error}
            </p>
          </div>
        ) : rows.length === 0 ? (
          <div className="h-full w-full flex flex-col items-center justify-center gap-2 px-4 py-6 text-center">
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
              <Inbox className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Nessun dato nel periodo
            </p>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted/40 backdrop-blur z-[1] border-b border-border/60">
              <tr>
                {isLeaderboard && (
                  <th className="w-10 text-center px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    #
                  </th>
                )}
                <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {labelCol.label}
                </th>
                <th className="text-right px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {valueCol.label}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const isFirst = isLeaderboard && i === 0;
                return (
                  <tr
                    key={row.key}
                    className={cn(
                      "border-b border-border/40 transition-colors last:border-b-0",
                      isFirst
                        ? "bg-amber-50/70 hover:bg-amber-50"
                        : i % 2 === 1
                          ? "bg-muted/20 hover:bg-muted/40"
                          : "hover:bg-muted/30",
                    )}
                  >
                    {isLeaderboard && (
                      <td className="w-10 text-center px-2 py-2 tabular-nums">
                        {isFirst ? (
                          <Trophy className="h-3.5 w-3.5 text-amber-500 inline" />
                        ) : (
                          <span className="text-muted-foreground font-medium">
                            {i + 1}
                          </span>
                        )}
                      </td>
                    )}
                    <td className="px-3 py-2 truncate max-w-0">
                      <span
                        className={cn(
                          "truncate",
                          isFirst && "font-semibold text-foreground",
                        )}
                      >
                        {row.label}
                      </span>
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2 text-right tabular-nums",
                        isFirst && "font-semibold",
                      )}
                    >
                      {formatValue(row.value, cfg)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
