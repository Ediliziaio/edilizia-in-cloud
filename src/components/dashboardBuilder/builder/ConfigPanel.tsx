/**
 * ConfigPanel — pannello configurazione widget nel builder.
 * Mostra nome amichevole, icona colorata, tab Configura/Avanzate
 * e sezioni raggruppate per categoria.
 */
import {
  ArrowLeft,
  Copy,
  Trash2,
  Hash,
  LineChart,
  BarChart3,
  AreaChart,
  PieChart,
  Table2,
  CircleDot,
  Gauge,
  Type,
  Minus,
} from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ── Widget metadata ──────────────────────────────────────────────
const WIDGET_META: Record<
  string,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    iconBg: string;
    iconColor: string;
  }
> = {
  kpi_card: { label: "Scheda KPI", icon: Hash, iconBg: "bg-blue-100", iconColor: "text-blue-600" },
  chart_line: { label: "Grafico linea", icon: LineChart, iconBg: "bg-violet-100", iconColor: "text-violet-600" },
  chart_bar: { label: "Grafico barre", icon: BarChart3, iconBg: "bg-orange-100", iconColor: "text-orange-600" },
  chart_area: { label: "Grafico area", icon: AreaChart, iconBg: "bg-teal-100", iconColor: "text-teal-600" },
  chart_pie: { label: "Grafico torta", icon: PieChart, iconBg: "bg-pink-100", iconColor: "text-pink-600" },
  table: { label: "Tabella dati", icon: Table2, iconBg: "bg-slate-100", iconColor: "text-slate-600" },
  progress: { label: "Barra progresso", icon: CircleDot, iconBg: "bg-green-100", iconColor: "text-green-600" },
  gauge: { label: "Indicatore", icon: Gauge, iconBg: "bg-amber-100", iconColor: "text-amber-600" },
  text_markdown: { label: "Testo libero", icon: Type, iconBg: "bg-zinc-100", iconColor: "text-zinc-600" },
  divider: { label: "Separatore", icon: Minus, iconBg: "bg-zinc-100", iconColor: "text-zinc-400" },
};

// ── Aggregation labels ───────────────────────────────────────────
const AGG_LABELS: Record<string, string> = {
  sum: "Somma",
  avg: "Media",
  count: "Conteggio",
  min: "Minimo",
  max: "Massimo",
  none: "Nessuna",
};

// ── Dimension labels ─────────────────────────────────────────────
const DIM_LABELS: Record<string, string> = {
  none: "Nessuna scomposizione",
  month: "Per mese",
  week: "Per settimana",
  day: "Per giorno",
  customer: "Per cliente",
  order_status: "Per stato ordine",
  payment_method: "Per metodo pagamento",
  category: "Per categoria",
  supplier: "Per fornitore",
  team: "Per team",
  member: "Per membro",
  assigned_to: "Per assegnatario",
  bucket: "Per fascia",
  source: "Per fonte",
};

// ── Period presets ───────────────────────────────────────────────
const PERIODS: Array<{ value: PeriodPreset; label: string }> = [
  { value: "this_month", label: "Questo mese" },
  { value: "last_month", label: "Mese scorso" },
  { value: "this_quarter", label: "Trimestre corrente" },
  { value: "last_quarter", label: "Trimestre scorso" },
  { value: "ytd", label: "Anno in corso (YTD)" },
  { value: "last_year", label: "Anno scorso" },
  { value: "last_7_days", label: "Ultimi 7 giorni" },
  { value: "last_30_days", label: "Ultimi 30 giorni" },
  { value: "last_90_days", label: "Ultimi 90 giorni" },
];

// ── Section header ───────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
      {children}
    </p>
  );
}

// ── Compare-to labels ────────────────────────────────────────────
const COMPARE_LABELS: Record<string, string> = {
  none: "Nessun confronto",
  prev_period: "Periodo precedente",
  prev_year: "Anno precedente",
};

// ── Props ────────────────────────────────────────────────────────
interface Props {
  widget: DashboardWidget;
  catalog: MetricCatalogItem[];
  onChange: (patch: Partial<DashboardWidget>) => void;
  onDelete: () => void;
  onDuplicate?: () => void;
  onBack?: () => void;
}

// ── Component ────────────────────────────────────────────────────
export function ConfigPanel({
  widget,
  catalog,
  onChange,
  onDelete,
  onDuplicate,
  onBack,
}: Props) {
  const cfg = widget.config ?? {};
  const metric = catalog.find((m) => m.id === cfg.metric);
  const isMetricWidget = !["text_markdown", "divider"].includes(widget.type);
  const supportsBreakdown = !["kpi_card", "progress", "gauge"].includes(widget.type);

  const meta = WIDGET_META[widget.type] ?? {
    label: widget.type,
    icon: Hash,
    iconBg: "bg-primary/10",
    iconColor: "text-primary",
  };
  const WidgetIcon = meta.icon;

  const setCfg = (patch: Partial<typeof cfg>) =>
    onChange({ config: { ...cfg, ...patch } });

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Panel header ──────────────────────────────────────── */}
      <div className="px-4 pt-3 pb-3 border-b shrink-0">
        {/* Back + Delete row */}
        <div className="flex items-center justify-between mb-3">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-3 w-3" />
              Widget
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-3">
            {onDuplicate && (
              <button
                type="button"
                onClick={onDuplicate}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                title="Duplica widget (⌘D)"
              >
                <Copy className="h-3 w-3" />
                Duplica
              </button>
            )}
            <button
              type="button"
              onClick={onDelete}
              className="flex items-center gap-1 text-xs text-destructive/70 hover:text-destructive transition-colors"
              title="Elimina widget (Canc)"
            >
              <Trash2 className="h-3 w-3" />
              Elimina
            </button>
          </div>
        </div>

        {/* Widget identity */}
        <div className="flex items-center gap-3">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${meta.iconBg}`}
          >
            <WidgetIcon className={`h-[18px] w-[18px] ${meta.iconColor}`} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight truncate">{meta.label}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Configura il widget</p>
          </div>
        </div>
      </div>

      {/* ── Tabs ──────────────────────────────────────────────── */}
      <Tabs defaultValue="config" className="flex-1 flex flex-col min-h-0">
        <div className="px-4 pt-2 pb-0 shrink-0">
          <TabsList className="w-full h-8 rounded-lg">
            <TabsTrigger value="config" className="flex-1 text-xs h-6 rounded-md">
              Configura
            </TabsTrigger>
            <TabsTrigger value="advanced" className="flex-1 text-xs h-6 rounded-md">
              Avanzate
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ── Tab: Configura ──────────────────────────────────── */}
        <TabsContent
          value="config"
          className="flex-1 overflow-auto min-h-0 px-4 py-3 mt-0 space-y-5"
        >
          {/* Sezione: Generale */}
          <section>
            <SectionLabel>Generale</SectionLabel>
            <div className="space-y-2">
              <div className="space-y-1">
                <Label className="text-xs">Titolo</Label>
                <Input
                  value={cfg.title ?? ""}
                  onChange={(e) => setCfg({ title: e.target.value })}
                  placeholder="Titolo del widget"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Sottotitolo</Label>
                <Input
                  value={cfg.subtitle ?? ""}
                  onChange={(e) => setCfg({ subtitle: e.target.value })}
                  placeholder="Opzionale"
                  className="h-8 text-sm"
                />
              </div>
              {widget.type === "text_markdown" && (
                <div className="space-y-1">
                  <Label className="text-xs">Contenuto</Label>
                  <Textarea
                    value={cfg.text ?? ""}
                    onChange={(e) => setCfg({ text: e.target.value })}
                    rows={6}
                    placeholder="Inserisci il testo…"
                    className="text-sm resize-none"
                  />
                </div>
              )}
            </div>
          </section>

          {/* Sezione: Dati */}
          {isMetricWidget && (
            <section>
              <SectionLabel>Dati</SectionLabel>
              <div className="space-y-2">
                <div className="space-y-1">
                  <Label className="text-xs">Metrica</Label>
                  <Select
                    value={cfg.metric ?? ""}
                    onValueChange={(v) => setCfg({ metric: v })}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Seleziona metrica…" />
                    </SelectTrigger>
                    <SelectContent>
                      {catalog.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {metric?.description && (
                    <p className="text-[11px] text-muted-foreground leading-snug mt-1">
                      {metric.description}
                    </p>
                  )}
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Aggregazione</Label>
                  <Select
                    value={cfg.aggregation ?? metric?.default_aggregation ?? "sum"}
                    onValueChange={(v) => setCfg({ aggregation: v as Aggregation })}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(
                        metric?.allowed_aggregations ?? ["sum", "avg", "count", "min", "max"]
                      ).map((a) => (
                        <SelectItem key={a} value={a}>
                          {AGG_LABELS[a] ?? a}
                        </SelectItem>
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
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(metric?.allowed_dimensions ?? ["none", "month"]).map((d) => (
                          <SelectItem key={d} value={d}>
                            {DIM_LABELS[d] ?? d}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Sezione: Periodo */}
          {isMetricWidget && (
            <section>
              <SectionLabel>Periodo</SectionLabel>
              <Select
                value={cfg.filter?.period ?? "none"}
                onValueChange={(v) =>
                  setCfg({
                    filter: {
                      ...(cfg.filter ?? {}),
                      period: v === "none" ? undefined : (v as PeriodPreset),
                    },
                  })
                }
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Eredita dalla dashboard" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Eredita dalla dashboard</SelectItem>
                  {PERIODS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </section>
          )}
        </TabsContent>

        {/* ── Tab: Avanzate ──────────────────────────────────── */}
        <TabsContent
          value="advanced"
          className="flex-1 overflow-auto min-h-0 px-4 py-3 mt-0 space-y-5"
        >
          {/* Formato numerico */}
          {isMetricWidget && (
            <section>
              <SectionLabel>Formato</SectionLabel>
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Valuta</Label>
                    <Select
                      value={cfg.format?.currency ?? "none"}
                      onValueChange={(v) =>
                        setCfg({
                          format: {
                            ...(cfg.format ?? {}),
                            currency: v === "none" ? undefined : (v as "EUR" | "USD"),
                          },
                        })
                      }
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nessuna</SelectItem>
                        <SelectItem value="EUR">EUR (€)</SelectItem>
                        <SelectItem value="USD">USD ($)</SelectItem>
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
                            decimals:
                              e.target.value === "" ? undefined : Number(e.target.value),
                          },
                        })
                      }
                      placeholder="auto"
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Prefisso</Label>
                    <Input
                      value={cfg.format?.prefix ?? ""}
                      onChange={(e) =>
                        setCfg({
                          format: {
                            ...(cfg.format ?? {}),
                            prefix: e.target.value || undefined,
                          },
                        })
                      }
                      placeholder="es. €"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Suffisso</Label>
                    <Input
                      value={cfg.format?.suffix ?? ""}
                      onChange={(e) =>
                        setCfg({
                          format: {
                            ...(cfg.format ?? {}),
                            suffix: e.target.value || undefined,
                          },
                        })
                      }
                      placeholder="es. %"
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Obiettivi (progress / gauge) */}
          {(widget.type === "progress" || widget.type === "gauge") && (
            <section>
              <SectionLabel>Obiettivi</SectionLabel>
              <div className="space-y-2">
                {widget.type === "gauge" && (
                  <div className="space-y-1">
                    <Label className="text-xs">Valore minimo</Label>
                    <Input
                      type="number"
                      value={cfg.min ?? ""}
                      onChange={(e) =>
                        setCfg({
                          min: e.target.value === "" ? undefined : Number(e.target.value),
                        })
                      }
                      className="h-8 text-sm"
                    />
                  </div>
                )}
                <div className="space-y-1">
                  <Label className="text-xs">
                    {widget.type === "gauge" ? "Valore massimo" : "Target"}
                  </Label>
                  <Input
                    type="number"
                    value={(widget.type === "gauge" ? cfg.max : cfg.target) ?? ""}
                    onChange={(e) => {
                      const v = e.target.value === "" ? undefined : Number(e.target.value);
                      setCfg(widget.type === "gauge" ? { max: v } : { target: v });
                    }}
                    className="h-8 text-sm"
                  />
                </div>
              </div>
            </section>
          )}

          {/* Confronto (solo widget KPI) */}
          {widget.type === "kpi_card" && (
            <section>
              <SectionLabel>Confronto</SectionLabel>
              <div className="space-y-1">
                <Label className="text-xs">Mostra variazione rispetto a</Label>
                <Select
                  value={cfg.compareTo ?? "none"}
                  onValueChange={(v) =>
                    setCfg({ compareTo: v as "none" | "prev_period" | "prev_year" })
                  }
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(COMPARE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground leading-snug mt-1">
                  Quando disponibile, la scheda KPI mostrerà un badge con la
                  variazione percentuale.
                </p>
              </div>
            </section>
          )}

          {/* Colonne personalizzate (solo tabella) */}
          {widget.type === "table" && (
            <section>
              <SectionLabel>Colonne tabella</SectionLabel>
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Intestazione categoria</Label>
                    <Input
                      value={cfg.columns?.[0]?.label ?? ""}
                      onChange={(e) =>
                        setCfg({
                          columns: [
                            { key: "label", label: e.target.value || "Categoria" },
                            cfg.columns?.[1] ?? { key: "value", label: "Valore" },
                          ],
                        })
                      }
                      placeholder="Categoria"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Intestazione valore</Label>
                    <Input
                      value={cfg.columns?.[1]?.label ?? ""}
                      onChange={(e) =>
                        setCfg({
                          columns: [
                            cfg.columns?.[0] ?? { key: "label", label: "Categoria" },
                            { key: "value", label: e.target.value || "Valore" },
                          ],
                        })
                      }
                      placeholder="Valore"
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Personalizza le intestazioni delle due colonne della tabella.
                </p>
              </div>
            </section>
          )}

          {/* Placeholder per widget senza impostazioni avanzate */}
          {widget.type === "divider" && (
            <div className="py-8 text-center text-xs text-muted-foreground">
              Nessuna impostazione avanzata per il separatore.
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

