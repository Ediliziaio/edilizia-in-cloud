import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  // Columns configurabili via cfg.columns, altrimenti fallback "Categoria / Valore"
  const columns =
    cfg.columns && cfg.columns.length >= 2
      ? cfg.columns
      : [
          { key: "label", label: "Categoria" },
          { key: "value", label: "Valore" },
        ];
  const labelCol = columns[0];
  const valueCol = columns[1];

  return (
    <Card className="h-full flex flex-col overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium truncate">{title}</CardTitle>
        {cfg.subtitle && (
          <p className="text-[11px] text-muted-foreground truncate">{cfg.subtitle}</p>
        )}
      </CardHeader>
      <CardContent className="flex-1 p-0 overflow-auto">
        {error ? (
          <p className="text-xs text-destructive p-3">Errore: {error}</p>
        ) : rows.length === 0 ? (
          <p className="text-xs text-muted-foreground p-3">Nessun dato</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted/50 z-[1]">
              <tr>
                <th className="text-left px-3 py-2 font-medium">{labelCol.label}</th>
                <th className="text-right px-3 py-2 font-medium">{valueCol.label}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.key}
                  className="border-t border-border/40 hover:bg-muted/30 transition-colors"
                >
                  <td className="px-3 py-1.5 truncate max-w-0">{row.label}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {formatValue(row.value, cfg)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
