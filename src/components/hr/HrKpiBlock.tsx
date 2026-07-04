/**
 * HrKpiBlock — KPI di una persona.
 * Card per KPI con valore-vs-target + barra, badge "auto" per i calcolati
 * (valore dalla RPC hr_persona_kpi_auto), input "aggiorna valore" per i manuali
 * (scrive hr_kpi_valori sul periodo corrente YYYY-MM) + mini-trend recharts.
 */
import { useMemo, useState } from "react";
import { useHrKpi, useHrKpiValori, useHrKpiAuto, useHrKpiMutations } from "@/hooks/useHrKpi";
import type { HrKpi, HrKpiValore, KpiUnita, KpiDirezione, KpiAuto } from "@/types/hr";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Gauge, Plus, Trash2, Loader2, Zap, Check } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, Tooltip } from "recharts";

/** Periodo corrente in formato YYYY-MM. */
function currentPeriodo(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const UNITA: KpiUnita[] = ["num", "%", "ore", "€"];

function fmtVal(v: number | null | undefined, unita: KpiUnita): string {
  if (v == null) return "—";
  const n = Number(v);
  const num = Number.isInteger(n) ? String(n) : n.toFixed(1);
  if (unita === "%") return `${num}%`;
  if (unita === "€") return `€ ${num}`;
  if (unita === "ore") return `${num} h`;
  return num;
}

/** valore auto per un KPI in base alla metrica. */
function autoValue(auto: KpiAuto | undefined, metric: HrKpi["auto_metric"]): number | null {
  if (!auto || !metric) return null;
  if (metric === "presenza_pct") return auto.presenza_pct;
  if (metric === "ore_mese") return auto.ore_mese;
  if (metric === "task_completati") return auto.task_completati;
  return null;
}

interface KpiCardProps {
  kpi: HrKpi;
  valori: HrKpiValore[];
  auto: KpiAuto | undefined;
  periodo: string;
  onSetValore: (v: number) => void;
  onDelete: () => void;
  saving: boolean;
}

function KpiCard({ kpi, valori, auto, periodo, onSetValore, onDelete, saving }: KpiCardProps) {
  const isAuto = kpi.tipo === "auto";
  const mine = valori.filter((v) => v.kpi_id === kpi.id);
  const currentManual = mine.find((v) => v.periodo_label === periodo)?.valore ?? null;
  const value = isAuto ? autoValue(auto, kpi.auto_metric) : currentManual;

  const [input, setInput] = useState<string>(currentManual != null ? String(currentManual) : "");

  const pct = useMemo(() => {
    if (value == null || kpi.target == null || Number(kpi.target) === 0) return null;
    const raw = (Number(value) / Number(kpi.target)) * 100;
    // per direzione "giu" (più basso è meglio) invertiamo la lettura del progresso
    const p = kpi.direzione === "giu" ? (Number(kpi.target) / Math.max(Number(value), 0.0001)) * 100 : raw;
    return Math.max(0, Math.min(100, p));
  }, [value, kpi.target, kpi.direzione]);

  const onTarget = pct != null && pct >= 100;

  const trend = useMemo(
    () => mine.map((v) => ({ periodo: v.periodo_label, valore: Number(v.valore) })),
    [mine],
  );

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm">{kpi.nome}</span>
              {isAuto && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-violet-100 text-violet-800 border-violet-200">
                  <Zap className="h-3 w-3 mr-0.5" />auto
                </Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {kpi.periodo} · {kpi.direzione === "su" ? "più alto è meglio" : "più basso è meglio"}
            </div>
          </div>
          {!isAuto && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive shrink-0" title="Elimina KPI">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Eliminare il KPI?</AlertDialogTitle>
                  <AlertDialogDescription>{kpi.nome}. Verranno rimossi anche i valori storicizzati.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annulla</AlertDialogCancel>
                  <AlertDialogAction onClick={onDelete}>Elimina</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>

        <div className="flex items-baseline gap-2">
          <span className={`text-2xl font-bold ${onTarget ? "text-green-600" : ""}`}>{fmtVal(value, kpi.unita)}</span>
          {kpi.target != null && (
            <span className="text-xs text-muted-foreground">/ obiettivo {fmtVal(kpi.target, kpi.unita)}</span>
          )}
        </div>

        {pct != null && (
          <Progress value={pct} indicatorClassName={onTarget ? "bg-green-500" : undefined} />
        )}

        {!isAuto && trend.length >= 2 && (
          <div className="h-12 -mx-1">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                <Tooltip
                  contentStyle={{ fontSize: 11, padding: "2px 6px" }}
                  labelFormatter={(l) => `Periodo ${l}`}
                  formatter={(v: any) => [fmtVal(Number(v), kpi.unita), "Valore"]}
                />
                <Line type="monotone" dataKey="valore" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {!isAuto && (
          <div className="flex items-end gap-2 pt-1">
            <div className="flex-1">
              <Label className="text-xs text-muted-foreground">Valore {periodo}</Label>
              <Input
                type="number"
                step="0.1"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="—"
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={saving || input === "" || Number.isNaN(Number(input))}
              onClick={() => onSetValore(Number(input))}
            >
              {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}Aggiorna
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface Props { profiloId: string; companyId: string; }

const EMPTY_NEW = { nome: "", unita: "num" as KpiUnita, target: "", direzione: "su" as KpiDirezione };

export function HrKpiBlock({ profiloId, companyId }: Props) {
  const periodo = currentPeriodo();
  const { data: kpis = [], isLoading } = useHrKpi(profiloId);
  const kpiIds = useMemo(() => kpis.map((k) => k.id), [kpis]);
  const { data: valori = [] } = useHrKpiValori(profiloId, kpiIds);
  const { data: auto } = useHrKpiAuto(profiloId, periodo);
  const { create, remove, setValore } = useHrKpiMutations(profiloId, companyId);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_NEW);

  const saveNew = async () => {
    await create.mutateAsync({
      nome: form.nome,
      unita: form.unita,
      direzione: form.direzione,
      target: form.target === "" ? null : Number(form.target),
      tipo: "manuale",
    });
    setForm(EMPTY_NEW);
    setOpen(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-muted-foreground">KPI & PERFORMANCE</h4>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline"><Plus className="h-4 w-4 mr-1" />KPI manuale</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Nuovo KPI manuale</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Nome *</Label>
                <Input value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} placeholder="es. Preventivi chiusi" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Unità</Label>
                  <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={form.unita} onChange={(e) => setForm((f) => ({ ...f, unita: e.target.value as KpiUnita }))}>
                    {UNITA.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Obiettivo</Label>
                  <Input type="number" step="0.1" value={form.target}
                    onChange={(e) => setForm((f) => ({ ...f, target: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <Label>Direzione</Label>
                  <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={form.direzione} onChange={(e) => setForm((f) => ({ ...f, direzione: e.target.value as KpiDirezione }))}>
                    <option value="su">Più alto è meglio</option>
                    <option value="giu">Più basso è meglio</option>
                  </select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Annulla</Button>
              <Button onClick={saveNew} disabled={create.isPending || !form.nome.trim()}>
                {create.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Crea
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : kpis.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">
          <Gauge className="h-8 w-8 mx-auto mb-2 opacity-40" />
          Nessun KPI. Aggiungi un KPI manuale o applica i KPI del ruolo dalla mansione.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {kpis.map((k) => (
            <KpiCard
              key={k.id}
              kpi={k}
              valori={valori}
              auto={auto}
              periodo={periodo}
              saving={setValore.isPending}
              onSetValore={(v) => setValore.mutate({ kpiId: k.id, periodo, valore: v })}
              onDelete={() => remove.mutate(k.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
