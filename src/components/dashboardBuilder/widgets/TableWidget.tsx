import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardWidget, ResolvedWidget } from "@/lib/dashboardBuilder/types";
import { formatValue } from "../formatValue";

interface Props {
  widget: DashboardWidget;
  resolved: ResolvedWidget | undefined;
}

export function TableWidget({ widget, resolved }: Props) {
  const cfg = widget.config ?? {};
  const title = cfg.title ?? cfg.metric ?? widget.id;
  const rows = resolved?.status === "ok" ? resolved.breakdown ?? [] : [];
  const error = resolved?.status === "error" ? resolved.error : null;

  return (
    <Card className="h-full flex flex-col overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 p-0 overflow-auto">
        {error ? (
          <p className="text-xs text-destructive p-3">Errore: {error}</p>
        ) : rows.length === 0 ? (
          <p className="text-xs text-muted-foreground p-3">Nessun dato</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted/50">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Categoria</th>
                <th className="text-right px-3 py-2 font-medium">Valore</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-t border-border/40">
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
