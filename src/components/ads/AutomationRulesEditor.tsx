/**
 * AutomationRulesEditor — UI per creare/modificare regole if-then.
 *
 * Pattern:
 *   • Lista regole con toggle enable/disable + edit/delete
 *   • Form crea regola: metric → operator → value → window → action
 *   • Esempi pronti ("Pausa se CPL > 50€ per 3gg", "Scala +20% se ROAS > 4")
 */
import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Plus, Trash2, Zap, PauseCircle, TrendingUp, Bell } from "lucide-react";
import { useAdAutomationRules, type CreateRuleInput } from "@/hooks/useAdAutomationRules";
import { cn } from "@/lib/utils";

const METRICS = [
  { v: "cpa", label: "Costo per conversione (CPA)" },
  { v: "cpl", label: "Costo per lead (CPL)" },
  { v: "roas", label: "ROAS (return on ad spend)" },
  { v: "ctr", label: "Click-through rate (CTR)" },
  { v: "spend", label: "Spesa giornaliera" },
  { v: "frequency", label: "Frequency (impressioni per utente)" },
  { v: "leads", label: "Numero lead generati" },
];

const OPERATORS = [
  { v: ">", label: "maggiore di" },
  { v: "<", label: "minore di" },
  { v: ">=", label: "almeno" },
  { v: "<=", label: "al massimo" },
  { v: "==", label: "uguale a" },
];

const ACTIONS = [
  { v: "pause", label: "Metti in pausa", icon: PauseCircle, color: "text-amber-600" },
  { v: "scale", label: "Aumenta budget", icon: TrendingUp, color: "text-emerald-600" },
  { v: "notify", label: "Solo notifica (no azione)", icon: Bell, color: "text-blue-600" },
];

const PRESETS: Array<{ name: string; description: string; rule: Omit<CreateRuleInput, "name"> }> = [
  {
    name: "Pausa CPL alto",
    description: "Pausa se costo per lead > 50€ per 2 giorni",
    rule: {
      description: "Salvaguardia: se il CPL supera 50€ continuativamente, la campagna non sta funzionando.",
      scope_type: "campaign",
      trigger: { metric: "cpl", operator: ">", value: 50, window_days: 2 },
      action: { type: "pause" },
    },
  },
  {
    name: "Scala campagna vincente",
    description: "Aumenta budget +20% se ROAS > 3x per 3 giorni",
    rule: {
      description: "Scala in modo controllato campagne che convertono bene.",
      scope_type: "campaign",
      trigger: { metric: "roas", operator: ">", value: 3, window_days: 3 },
      action: { type: "scale", params: { scale_pct: 20 } },
    },
  },
  {
    name: "Alert budget esaurito",
    description: "Notifica se spesa giornaliera > 100€",
    rule: {
      description: "Solo notifica, no azione automatica.",
      scope_type: "campaign",
      trigger: { metric: "spend", operator: ">", value: 100 },
      action: { type: "notify", params: { notify_channel: "email" } },
    },
  },
];

export function AutomationRulesEditor({ companyId }: { companyId?: string }) {
  const { rules, isLoading, create, remove, toggleEnabled, isMutating } = useAdAutomationRules(companyId);
  const [isCreating, setIsCreating] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Zap className="h-5 w-5 text-amber-500" />
              Automazioni
            </CardTitle>
            <CardDescription>
              Pausa / scala / avvisa in base a metriche reali. Esecuzione cron oraria.
            </CardDescription>
          </div>
          <Button onClick={() => setIsCreating(!isCreating)} size="sm">
            <Plus className="h-4 w-4" />
            {isCreating ? "Annulla" : "Nuova regola"}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Preset rapidi */}
        {!isCreating && rules.length === 0 && (
          <div className="rounded-xl border border-dashed bg-slate-50 p-4">
            <p className="mb-3 text-sm font-semibold text-slate-700">Inizia con un preset</p>
            <div className="grid gap-2 md:grid-cols-3">
              {PRESETS.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  disabled={isMutating}
                  onClick={() => void create({ ...p.rule, name: p.name, is_enabled: false })}
                  className="rounded-lg border bg-white p-3 text-left hover:border-amber-300 hover:bg-amber-50"
                >
                  <p className="text-sm font-semibold text-slate-950">{p.name}</p>
                  <p className="mt-1 text-xs text-slate-500">{p.description}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Form crea regola */}
        {isCreating && (
          <RuleForm
            companyId={companyId}
            onCancel={() => setIsCreating(false)}
            onCreated={() => setIsCreating(false)}
          />
        )}

        {/* Lista regole */}
        {isLoading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Caricamento regole...
          </div>
        ) : rules.length === 0 && !isCreating ? (
          <p className="py-4 text-center text-sm text-slate-500">
            Nessuna regola attiva. Crea una regola o usa un preset.
          </p>
        ) : (
          <div className="space-y-2">
            {rules.map((rule) => {
              const action = rule.action.type;
              const actionMeta = ACTIONS.find((a) => a.v === action) ?? ACTIONS[0];
              const ActionIcon = actionMeta.icon;
              return (
                <div
                  key={rule.id}
                  className={cn(
                    "flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between",
                    rule.is_enabled ? "border-emerald-200 bg-emerald-50/30" : "border-slate-200 bg-white",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn("mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-white", actionMeta.color)}>
                      <ActionIcon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-950">{rule.name}</p>
                      <p className="text-xs text-slate-500">
                        Se <strong>{rule.trigger.metric}</strong> {rule.trigger.operator}{" "}
                        <strong>{rule.trigger.value}</strong>
                        {rule.trigger.window_days ? ` per ${rule.trigger.window_days}gg` : ""} →{" "}
                        <strong>{actionMeta.label.toLowerCase()}</strong>
                        {rule.action.params?.scale_pct ? ` (+${rule.action.params.scale_pct}%)` : ""}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {/* MP-ADS-04 GAP-1b: conferma che il runner valuta la regola (anche se non scatta) */}
                        <Badge variant="outline" className={`text-[10px] ${rule.last_evaluated_at ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-400"}`}>
                          {rule.last_evaluated_at
                            ? `Valutata: ${new Date(rule.last_evaluated_at).toLocaleString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`
                            : "Mai valutata ancora"}
                        </Badge>
                        {rule.last_triggered_at && (
                          <Badge variant="outline" className="border-amber-200 bg-amber-50 text-[10px] text-amber-700">
                            Ultimo trigger: {new Date(rule.last_triggered_at).toLocaleDateString("it-IT")}
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-[10px] text-slate-500">
                          {rule.trigger_count} esecuzioni totali
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void toggleEnabled(rule.id, !rule.is_enabled)}
                      disabled={isMutating}
                      className={cn(
                        "flex h-6 w-11 items-center rounded-full transition",
                        rule.is_enabled ? "bg-emerald-500" : "bg-slate-300",
                      )}
                      aria-label={rule.is_enabled ? "Disattiva" : "Attiva"}
                    >
                      <span
                        className={cn(
                          "h-5 w-5 rounded-full bg-white shadow transition-transform",
                          rule.is_enabled ? "translate-x-5" : "translate-x-0.5",
                        )}
                      />
                    </button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setDeleteId(rule.id)}
                      aria-label="Elimina regola"
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare questa regola?</AlertDialogTitle>
            <AlertDialogDescription>
              L'azione automatica non verrà più eseguita. Puoi sempre ricrearla da preset.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteId) void remove(deleteId);
                setDeleteId(null);
              }}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function RuleForm({
  companyId,
  onCancel,
  onCreated,
}: {
  companyId?: string;
  onCancel: () => void;
  onCreated: () => void;
}) {
  const { create, isMutating } = useAdAutomationRules(companyId);
  const [name, setName] = useState("");
  const [metric, setMetric] = useState("cpl");
  const [operator, setOperator] = useState(">");
  const [value, setValue] = useState(30);
  const [windowDays, setWindowDays] = useState(2);
  const [actionType, setActionType] = useState("pause");
  const [scalePct, setScalePct] = useState(20);

  const submit = async () => {
    if (!name.trim()) return;
    const trigger = { metric, operator, value, window_days: windowDays } as CreateRuleInput["trigger"];
    const action = actionType === "scale"
      ? { type: "scale" as const, params: { scale_pct: scalePct } }
      : actionType === "notify"
      ? { type: "notify" as const, params: { notify_channel: "email" as const } }
      : { type: "pause" as const };
    await create({
      name,
      scope_type: "campaign",
      trigger,
      action,
      is_enabled: false,
    });
    onCreated();
  };

  return (
    <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/30 p-4">
      <div>
        <Label className="mb-1 block">Nome regola</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Es. Pausa CPL alto"
        />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <Label className="mb-1 block text-xs">Metrica</Label>
          <Select value={metric} onValueChange={setMetric}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {METRICS.map((m) => (
                <SelectItem key={m.v} value={m.v}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="mb-1 block text-xs">Operatore</Label>
          <Select value={operator} onValueChange={setOperator}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OPERATORS.map((o) => (
                <SelectItem key={o.v} value={o.v}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="mb-1 block text-xs">Valore soglia</Label>
          <Input
            type="number"
            min={0}
            step={0.1}
            value={value}
            onChange={(e) => setValue(Number(e.target.value || 0))}
          />
        </div>
      </div>

      <div>
        <Label className="mb-1 block text-xs">Periodo osservazione (giorni)</Label>
        <Input
          type="number"
          min={1}
          max={30}
          value={windowDays}
          onChange={(e) => setWindowDays(Number(e.target.value || 1))}
          className="md:w-32"
        />
        <p className="mt-1 text-[11px] text-slate-500">
          La condizione deve essere vera per N giorni consecutivi prima di attivare l'azione.
        </p>
      </div>

      <div>
        <Label className="mb-1 block text-xs">Azione da eseguire</Label>
        <div className="grid gap-2 md:grid-cols-3">
          {ACTIONS.map((a) => {
            const Icon = a.icon;
            return (
              <button
                key={a.v}
                type="button"
                onClick={() => setActionType(a.v)}
                className={cn(
                  "flex items-center gap-2 rounded-lg border p-2 text-left text-sm",
                  actionType === a.v ? "border-amber-300 bg-amber-100" : "border-slate-200 bg-white",
                )}
              >
                <Icon className={cn("h-4 w-4", a.color)} />
                {a.label}
              </button>
            );
          })}
        </div>
      </div>

      {actionType === "scale" && (
        <div>
          <Label className="mb-1 block text-xs">% di aumento budget</Label>
          <Input
            type="number"
            min={5}
            max={100}
            value={scalePct}
            onChange={(e) => setScalePct(Number(e.target.value || 20))}
            className="md:w-32"
          />
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onCancel} disabled={isMutating}>
          Annulla
        </Button>
        <Button onClick={submit} disabled={!name.trim() || isMutating}>
          {isMutating && <Loader2 className="h-3 w-3 animate-spin" />}
          Crea regola
        </Button>
      </div>
    </div>
  );
}
