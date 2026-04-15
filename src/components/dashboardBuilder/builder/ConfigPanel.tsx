import { Trash2 } from "lucide-react";
import type {
  Aggregation,
  BreakdownDim,
  DashboardWidget,
  MetricCatalogItem,
  PeriodPreset,
} from "@/lib/dashboardBuilder/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  widget: DashboardWidget;
  catalog: MetricCatalogItem[];
  onChange: (patch: Partial<DashboardWidget>) => void;
  onDelete: () => void;
}

const PERIODS: Array<{ value: PeriodPreset; label: string }> = [
  { value: "this_month", label: "Questo mese" },
  { value: "last_month", label: "Mese scorso" },
  { value: "this_quarter", label: "Trimestre corrente" },
  { value: "last_quarter", label: "Trimestre scorso" },
  { value: "ytd", label: "Anno in corso" },
  { value: "last_year", label: "Anno scorso" },
  { value: "last_7_days", label: "Ultimi 7 giorni" },
  { value: "last_30_days", label: "Ultimi 30 giorni" },
  { value: "last_90_days", label: "Ultimi 90 giorni" },
];

export function ConfigPanel({ widget, catalog, onChange, onDelete }: Props) {
  const cfg = widget.config ?? {};
  const metric = catalog.find((m) => m.id === cfg.metric);
  const isMetricWidget = !["text_markdown", "divider"].includes(widget.type);
  const supportsBreakdown = !["kpi_card", "progress", "gauge"].includes(widget.type);

  const setCfg = (patch: Partial<typeof cfg>) =>
    onChange({ config: { ...cfg, ...patch } });

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-[11px] uppercase text-muted-foreground tracking-wide">Widget</p>
          <p className="text-sm font-medium truncate">{widget.type}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={onDelete} title="Elimina">
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-3">
        <div className="space-y-1">
          <Label className="text-xs">Titolo</Label>
          <Input
            value={cfg.title ?? ""}
            onChange={(e) => setCfg({ title: e.target.value })}
            placeholder="Titolo widget"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Sottotitolo</Label>
          <Input
            value={cfg.subtitle ?? ""}
            onChange={(e) => setCfg({ subtitle: e.target.value })}
            placeholder="Opzionale"
          />
        </div>

        {widget.type === "text_markdown" && (
          <div className="space-y-1">
            <Label className="text-xs">Testo</Label>
            <Textarea
              value={cfg.text ?? ""}
              onChange={(e) => setCfg({ text: e.target.value })}
              rows={6}
              placeholder="Inserisci testo…"
            />
          </div>
        )}

        {isMetricWidget && (
          <>
            <div className="space-y-1">
              <Label className="text-xs">Metrica</Label>
              <Select value={cfg.metric ?? ""} onValueChange={(v) => setCfg({ metric: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona metrica" />
                </SelectTrigger>
                <SelectContent>
                  {catalog.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {metric?.description && (
                <p className="text-[11px] text-muted-foreground">{metric.description}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Aggregazione</Label>
              <Select
                value={cfg.aggregation ?? metric?.default_aggregation ?? "sum"}
                onValueChange={(v) => setCfg({ aggregation: v as Aggregation })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(metric?.allowed_aggregations ?? ["sum", "avg", "count", "min", "max"]).map((a) => (
                    <SelectItem key={a} value={a}>{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {supportsBreakdown && (
              <div className="space-y-1">
                <Label className="text-xs">Scomposizione</Label>
                <Select
                  value={cfg.breakdown ?? "none"}
                  onValueChange={(v) => setCfg({ breakdown: v as BreakdownDim })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(metric?.allowed_dimensions ?? ["none", "month"]).map((d) => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-xs">Periodo</Label>
              <Select
                value={cfg.filter?.period ?? "none"}
                onValueChange={(v) =>
                  setCfg({ filter: { ...(cfg.filter ?? {}), period: v === "none" ? undefined : (v as PeriodPreset) } })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Eredita dashboard" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Eredita dashboard</SelectItem>
                  {PERIODS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Valuta</Label>
                <Select
                  value={cfg.format?.currency ?? "none"}
                  onValueChange={(v) =>
                    setCfg({
                      format: { ...(cfg.format ?? {}), currency: v === "none" ? undefined : (v as "EUR" | "USD") },
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nessuna</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Decimali</Label>
                <Input
                  type="number"
                  min={0}
                  max={4}
                  value={cfg.format?.decimals ?? ""}
                  onChange={(e) =>
                    setCfg({
                      format: {
                        ...(cfg.format ?? {}),
                        decimals: e.target.value === "" ? undefined : Number(e.target.value),
                      },
                    })
                  }
                  placeholder="auto"
                />
              </div>
            </div>

            {(widget.type === "progress" || widget.type === "gauge") && (
              <div className="grid grid-cols-2 gap-2">
                {widget.type === "gauge" && (
                  <div className="space-y-1">
                    <Label className="text-xs">Minimo</Label>
                    <Input
                      type="number"
                      value={cfg.min ?? ""}
                      onChange={(e) =>
                        setCfg({ min: e.target.value === "" ? undefined : Number(e.target.value) })
                      }
                    />
                  </div>
                )}
                <div className="space-y-1">
                  <Label className="text-xs">{widget.type === "gauge" ? "Massimo" : "Target"}</Label>
                  <Input
                    type="number"
                    value={(widget.type === "gauge" ? cfg.max : cfg.target) ?? ""}
                    onChange={(e) => {
                      const v = e.target.value === "" ? undefined : Number(e.target.value);
                      setCfg(widget.type === "gauge" ? { max: v } : { target: v });
                    }}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
