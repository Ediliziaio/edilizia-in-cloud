import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  FlaskConical,
  Loader2,
  Plus,
  Save,
  Settings2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { formatCurrency } from "@/lib/formatters";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/components/ui/confirm-dialog";

type RuleScope = "company" | "salesperson" | "order";
type RuleTrigger = "base" | "tier" | "bonus" | "malus" | "hold" | "payment_policy" | "quality";
type RuleBasis = "sold" | "collected" | "margin" | "revenue_period" | "errors" | "manual";

interface RulePayload {
  name: string;
  description?: string | null;
  is_active?: boolean;
  priority?: number;
  scope?: RuleScope;
  salesperson_id?: string | null;
  trigger_type: RuleTrigger;
  basis: RuleBasis;
  condition: Record<string, unknown>;
  action: Record<string, unknown>;
  ai_prompt?: string | null;
}

interface CommissionRule extends RulePayload {
  id: string;
  company_id: string;
  is_active: boolean;
  priority: number;
  scope: RuleScope;
  salesperson_id: string | null;
  description: string | null;
  ai_prompt: string | null;
  created_at: string;
}

interface AiResponse {
  rules?: RulePayload[];
  warnings?: string[];
}

interface SimulationValues {
  sold: number;
  collected: number;
  margin: number;
  periodRevenue: number;
  errors: number;
}

interface CommissionRulesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId?: string;
}

const TRIGGER_LABELS: Record<RuleTrigger, string> = {
  base: "Base",
  tier: "Scaglione",
  bonus: "Bonus",
  malus: "Malus",
  hold: "Blocco",
  payment_policy: "Pagamento",
  quality: "Qualita",
};

const BASIS_LABELS: Record<RuleBasis, string> = {
  sold: "Venduto",
  collected: "Incassato",
  margin: "Margine",
  revenue_period: "Fatturato periodo",
  errors: "Errori",
  manual: "Manuale",
};

const DEFAULT_AI_PROMPT =
  "Dai il 4% sull'incassato. Se supera 50.000 euro di fatturato mensile aggiungi 500 euro di bonus. Se ci sono errori gravi togli 150 euro e blocca la provvigione finche la contestazione non e chiusa.";

function numberFrom(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function storageKey(companyId: string): string {
  return `commission_rules:${companyId}`;
}

function readLocalRules(companyId: string): CommissionRule[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(storageKey(companyId)) || "[]") as CommissionRule[];
  } catch {
    return [];
  }
}

function writeLocalRules(companyId: string, rules: CommissionRule[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey(companyId), JSON.stringify(rules));
}

function shouldUseLocalRulesStorage(): boolean {
  if (typeof window === "undefined") return false;
  return ["localhost", "127.0.0.1"].includes(window.location.hostname);
}

function extractPercent(text: string, fallback = 4): number {
  const match = text.match(/(\d+(?:[,.]\d+)?)\s*%/);
  return match ? Number(match[1].replace(",", ".")) : fallback;
}

function parseLocalizedNumber(raw: string): number {
  const cleaned = raw.trim();
  if (cleaned.includes(".") && cleaned.includes(",")) {
    return Number(cleaned.replace(/\./g, "").replace(",", "."));
  }
  if (/^\d{1,3}(?:\.\d{3})+$/.test(cleaned)) {
    return Number(cleaned.replace(/\./g, ""));
  }
  return Number(cleaned.replace(",", "."));
}

function extractEuro(text: string, fallback = 0): number {
  const match = text.match(/(?:€|euro)\s*(\d+(?:[.,]\d+)?)|(\d+(?:[.,]\d+)?)\s*(?:€|euro)/i);
  if (!match) return fallback;
  return parseLocalizedNumber((match[1] || match[2] || fallback).toString());
}

function extractAmountAfter(text: string, keywords: string[], fallback = 0): number {
  for (const keyword of keywords) {
    const index = text.indexOf(keyword);
    if (index < 0) continue;
    const segment = text.slice(index, index + 90);
    const match = segment.match(/(?:€|euro)\s*(\d+(?:[.,]\d+)?)|(\d+(?:[.,]\d+)?)\s*(?:€|euro)?/i);
    if (match) return parseLocalizedNumber((match[1] || match[2] || fallback).toString());
  }
  return fallback;
}

function extractThreshold(text: string, fallback = 50000): number {
  const match = text.match(/(?:oltre|sopra|supera|da)\s*(\d+(?:[.,]\d+)?)\s*(k|mila|000|euro|€)?/i);
  if (!match) return fallback;
  const raw = parseLocalizedNumber(match[1]);
  if (match[2]?.toLowerCase() === "k" || match[2]?.toLowerCase() === "mila") return raw * 1000;
  return raw < 1000 ? raw * 1000 : raw;
}

function buildLocalAiDrafts(prompt: string): RulePayload[] {
  const text = prompt.toLowerCase();
  const percent = extractPercent(text);
  const basis: RuleBasis = text.includes("incassat") ? "collected" : text.includes("margine") ? "margin" : "sold";
  const drafts: RulePayload[] = [];

  drafts.push({
    name: `Provvigione ${percent}% su ${BASIS_LABELS[basis].toLowerCase()}`,
    description: "Regola generata dal testo inserito",
    is_active: true,
    priority: 100,
    scope: "company",
    trigger_type: "base",
    basis,
    condition: {},
    action: { commission_percent: percent },
    ai_prompt: prompt,
  });

  if (/fatturat|target|scaglion|sopra|oltre|supera/.test(text)) {
    const threshold = extractThreshold(text);
    const bonus = Math.max(extractAmountAfter(text, ["aggiungi", "premio", "bonus"], 500), 0);
    drafts.push({
      name: `Bonus target ${formatCurrency(threshold)}`,
      description: "Premio quando viene raggiunto il target di periodo",
      is_active: true,
      priority: 80,
      scope: "company",
      trigger_type: "bonus",
      basis: "revenue_period",
      condition: { min_revenue: threshold },
      action: { bonus_amount: bonus || 500 },
      ai_prompt: prompt,
    });
  }

  if (/error|sbagl|contest|qualit/.test(text)) {
    const penalty = extractAmountAfter(text, ["togli", "decurt", "malus", "error", "contest"], 150) || extractEuro(text, 150) || 150;
    drafts.push({
      name: "Malus errori commerciali",
      description: "Decurtazione se sono presenti errori o contestazioni",
      is_active: true,
      priority: 60,
      scope: "company",
      trigger_type: "malus",
      basis: "errors",
      condition: { min_errors: 1, severity: text.includes("grav") ? "grave" : "any" },
      action: { deduction_amount: penalty, per_error: true },
      ai_prompt: prompt,
    });
  }

  if (/bloc|saldo|saldat|pagat|incassat|contest/.test(text)) {
    const holdForContest = /bloc|contest/.test(text) && !/saldo|saldat|pagat/.test(text);
    const collectedMin = text.includes("saldo") || text.includes("saldat") ? 100 : extractPercent(text, 70);
    drafts.push({
      name: holdForContest ? "Blocco per contestazione" : `Maturazione al ${collectedMin}% incassato`,
      description: holdForContest
        ? "La provvigione resta sospesa finche la contestazione non e chiusa"
        : "La provvigione resta sospesa finche non matura la condizione di incasso",
      is_active: true,
      priority: 40,
      scope: "company",
      trigger_type: "payment_policy",
      basis: "collected",
      condition: holdForContest ? { reason: "contestazione" } : { collected_min_percent: collectedMin },
      action: holdForContest ? { hold_commission: true } : { hold_until_collected: true },
      ai_prompt: prompt,
    });
  }

  return drafts;
}

function conditionApplies(rule: Pick<CommissionRule, "condition">, values: SimulationValues): boolean {
  const condition = rule.condition || {};
  const minRevenue = numberFrom(condition.min_revenue);
  const minErrors = numberFrom(condition.min_errors);
  const collectedMinPercent = numberFrom(condition.collected_min_percent);

  if (minRevenue > 0 && values.periodRevenue < minRevenue) return false;
  if (minErrors > 0 && values.errors < minErrors) return false;
  if (collectedMinPercent > 0) {
    const collectedPercent = values.sold > 0 ? (values.collected / values.sold) * 100 : 0;
    if (collectedPercent < collectedMinPercent) return false;
  }
  return true;
}

function basisAmount(basis: RuleBasis, values: SimulationValues): number {
  if (basis === "collected") return values.collected;
  if (basis === "margin") return values.margin;
  if (basis === "revenue_period") return values.periodRevenue;
  return values.sold;
}

function simulateRules(rules: CommissionRule[], values: SimulationValues) {
  let total = 0;
  let blocked = false;
  const rows = rules
    .filter((rule) => rule.is_active)
    .sort((a, b) => a.priority - b.priority)
    .map((rule) => {
      if (!conditionApplies(rule, values)) {
        return { id: rule.id, name: rule.name, amount: 0, skipped: true, blocked: false };
      }

      const action = rule.action || {};
      const base = basisAmount(rule.basis, values);
      let amount = 0;

      if (numberFrom(action.commission_percent) > 0) amount += base * (numberFrom(action.commission_percent) / 100);
      if (numberFrom(action.commission_fixed) > 0) amount += numberFrom(action.commission_fixed);
      if (numberFrom(action.bonus_amount) > 0) amount += numberFrom(action.bonus_amount);
      if (numberFrom(action.deduction_amount) > 0) {
        amount -= numberFrom(action.deduction_amount) * (action.per_error ? Math.max(values.errors, 1) : 1);
      }
      if (numberFrom(action.deduction_percent) > 0) amount -= base * (numberFrom(action.deduction_percent) / 100);
      if (action.hold_until_collected || action.hold_commission) blocked = true;

      const roundedAmount = roundCurrency(amount);
      total += roundedAmount;
      return { id: rule.id, name: rule.name, amount: roundedAmount, skipped: false, blocked: !!(action.hold_until_collected || action.hold_commission) };
    });

  return { total: Math.max(0, roundCurrency(total)), rows, blocked };
}

function describeCondition(rule: Pick<CommissionRule, "condition">): string {
  const condition = rule.condition || {};
  const parts: string[] = [];
  if (numberFrom(condition.min_revenue) > 0) parts.push(`da ${formatCurrency(numberFrom(condition.min_revenue))}`);
  if (numberFrom(condition.min_errors) > 0) parts.push(`${numberFrom(condition.min_errors)}+ errori`);
  if (condition.severity) parts.push(`gravita ${String(condition.severity)}`);
  if (numberFrom(condition.collected_min_percent) > 0) parts.push(`${numberFrom(condition.collected_min_percent)}% incassato`);
  return parts.length ? parts.join(" · ") : "Sempre";
}

function describeAction(rule: Pick<CommissionRule, "action">): string {
  const action = rule.action || {};
  const parts: string[] = [];
  if (numberFrom(action.commission_percent) > 0) parts.push(`${numberFrom(action.commission_percent)}%`);
  if (numberFrom(action.commission_fixed) > 0) parts.push(formatCurrency(numberFrom(action.commission_fixed)));
  if (numberFrom(action.bonus_amount) > 0) parts.push(`+${formatCurrency(numberFrom(action.bonus_amount))}`);
  if (numberFrom(action.deduction_amount) > 0) parts.push(`-${formatCurrency(numberFrom(action.deduction_amount))}${action.per_error ? " per errore" : ""}`);
  if (numberFrom(action.deduction_percent) > 0) parts.push(`-${numberFrom(action.deduction_percent)}%`);
  if (action.hold_until_collected || action.hold_commission) parts.push("blocco pagamento");
  return parts.length ? parts.join(" · ") : "Evento";
}

function normalizeDraft(draft: RulePayload): RulePayload {
  return {
    name: draft.name.trim() || "Regola provvigionale",
    description: draft.description || null,
    is_active: draft.is_active ?? true,
    priority: draft.priority ?? 100,
    scope: draft.scope ?? "company",
    salesperson_id: draft.salesperson_id ?? null,
    trigger_type: draft.trigger_type,
    basis: draft.basis,
    condition: draft.condition ?? {},
    action: draft.action ?? {},
    ai_prompt: draft.ai_prompt ?? null,
  };
}

export function CommissionRulesDialog({ open, onOpenChange, companyId }: CommissionRulesDialogProps) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [aiPrompt, setAiPrompt] = useState(DEFAULT_AI_PROMPT);
  const [aiDrafts, setAiDrafts] = useState<RulePayload[]>([]);
  const [manualName, setManualName] = useState("Provvigione base 4%");
  const [manualTrigger, setManualTrigger] = useState<RuleTrigger>("base");
  const [manualBasis, setManualBasis] = useState<RuleBasis>("sold");
  const [manualPercent, setManualPercent] = useState(4);
  const [manualThreshold, setManualThreshold] = useState(50000);
  const [manualAmount, setManualAmount] = useState(500);
  const [simulation, setSimulation] = useState<SimulationValues>({
    sold: 10000,
    collected: 6000,
    margin: 3000,
    periodRevenue: 55000,
    errors: 1,
  });

  const { data: rules = [], isLoading } = useQuery({
    queryKey: queryKeys.salespeople.commissionRules(companyId),
    queryFn: async () => {
      if (!companyId) return [];
      if (shouldUseLocalRulesStorage()) return readLocalRules(companyId);
      const { data, error } = await supabase
        .from("commission_rules" as never)
        .select("*")
        .eq("company_id", companyId)
        .order("priority", { ascending: true })
        .order("created_at", { ascending: false });

      if (error) return readLocalRules(companyId);
      return ((data as unknown as CommissionRule[]) ?? []).map((rule) => ({
        ...rule,
        condition: rule.condition ?? {},
        action: rule.action ?? {},
      }));
    },
    enabled: !!companyId && open,
  });

  const simulated = useMemo(() => simulateRules(rules, simulation), [rules, simulation]);

  const saveRuleMutation = useMutation({
    mutationFn: async (draft: RulePayload) => {
      if (!companyId) throw new Error("Azienda non disponibile");
      const payload = { company_id: companyId, ...normalizeDraft(draft) };

      if (shouldUseLocalRulesStorage()) {
        const localRule: CommissionRule = {
          ...(payload as RulePayload & { company_id: string }),
          id: crypto.randomUUID(),
          company_id: companyId,
          is_active: payload.is_active ?? true,
          priority: payload.priority ?? 100,
          scope: payload.scope ?? "company",
          salesperson_id: payload.salesperson_id ?? null,
          description: payload.description ?? null,
          ai_prompt: payload.ai_prompt ?? null,
          created_at: new Date().toISOString(),
        };
        writeLocalRules(companyId, [localRule, ...readLocalRules(companyId)]);
        return { fallback: true };
      }

      const { data, error } = await supabase
        .from("commission_rules" as never)
        .insert(payload as never)
        .select()
        .single();

      if (error) {
        const localRule: CommissionRule = {
          ...(payload as RulePayload & { company_id: string }),
          id: crypto.randomUUID(),
          company_id: companyId,
          is_active: payload.is_active ?? true,
          priority: payload.priority ?? 100,
          scope: payload.scope ?? "company",
          salesperson_id: payload.salesperson_id ?? null,
          description: payload.description ?? null,
          ai_prompt: payload.ai_prompt ?? null,
          created_at: new Date().toISOString(),
        };
        writeLocalRules(companyId, [localRule, ...readLocalRules(companyId)]);
        return { fallback: true };
      }

      return { fallback: false, data };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.salespeople.commissionRules(companyId) });
      toast.success(result.fallback ? "Regola salvata nel browser locale" : "Regola salvata");
    },
    onError: (error: Error) => toast.error(error.message || "Impossibile salvare la regola"),
  });

  const toggleRuleMutation = useMutation({
    mutationFn: async ({ rule, is_active }: { rule: CommissionRule; is_active: boolean }) => {
      if (!companyId) throw new Error("Azienda non disponibile");
      if (shouldUseLocalRulesStorage()) {
        writeLocalRules(companyId, readLocalRules(companyId).map((r) => (r.id === rule.id ? { ...r, is_active } : r)));
        return;
      }
      const { error } = await supabase
        .from("commission_rules" as never)
        .update({ is_active } as never)
        .eq("id", rule.id);

      if (error) {
        writeLocalRules(companyId, readLocalRules(companyId).map((r) => (r.id === rule.id ? { ...r, is_active } : r)));
        return;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.salespeople.commissionRules(companyId) }),
  });

  const deleteRuleMutation = useMutation({
    mutationFn: async (rule: CommissionRule) => {
      if (!companyId) throw new Error("Azienda non disponibile");
      if (shouldUseLocalRulesStorage()) {
        writeLocalRules(companyId, readLocalRules(companyId).filter((r) => r.id !== rule.id));
        return;
      }
      const { error } = await supabase.from("commission_rules" as never).delete().eq("id", rule.id);
      if (error) {
        writeLocalRules(companyId, readLocalRules(companyId).filter((r) => r.id !== rule.id));
        return;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.salespeople.commissionRules(companyId) });
      toast.success("Regola eliminata");
    },
  });

  const generateAiMutation = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Azienda non disponibile");
      if (aiPrompt.trim().length < 20) throw new Error("Descrizione troppo breve");

      const { data, error } = await supabase.functions.invoke<AiResponse>("ai-commission-rules", {
        body: { company_id: companyId, prompt: aiPrompt },
      });

      if (error || !data?.rules?.length) return buildLocalAiDrafts(aiPrompt);
      return data.rules.map(normalizeDraft);
    },
    onSuccess: (drafts) => {
      setAiDrafts(drafts);
      toast.success("Bozze regole generate");
    },
    onError: (error: Error) => toast.error(error.message || "AI non disponibile"),
  });

  const buildManualRule = (): RulePayload => {
    if (manualTrigger === "bonus") {
      return {
        name: manualName,
        description: "Bonus su target di fatturato",
        is_active: true,
        priority: 80,
        scope: "company",
        trigger_type: "bonus",
        basis: "revenue_period",
        condition: { min_revenue: manualThreshold },
        action: { bonus_amount: manualAmount },
      };
    }

    if (manualTrigger === "malus" || manualTrigger === "quality") {
      return {
        name: manualName,
        description: "Decurtazione legata a errori o qualita vendita",
        is_active: true,
        priority: 60,
        scope: "company",
        trigger_type: "malus",
        basis: "errors",
        condition: { min_errors: 1 },
        action: { deduction_amount: manualAmount, per_error: true },
      };
    }

    if (manualTrigger === "payment_policy" || manualTrigger === "hold") {
      return {
        name: manualName,
        description: "Maturazione e pagabilita provvigione",
        is_active: true,
        priority: 40,
        scope: "company",
        trigger_type: "payment_policy",
        basis: "collected",
        condition: { collected_min_percent: manualPercent },
        action: { hold_until_collected: true },
      };
    }

    return {
      name: manualName,
      description: "Regola base provvigionale",
      is_active: true,
      priority: 100,
      scope: "company",
      trigger_type: manualTrigger,
      basis: manualBasis,
      condition: manualTrigger === "tier" ? { min_revenue: manualThreshold } : {},
      action: { commission_percent: manualPercent },
    };
  };

  const applyAiDrafts = async () => {
    for (const draft of aiDrafts) {
      await saveRuleMutation.mutateAsync(draft);
    }
    setAiDrafts([]);
  };

  const updateSimulation = (key: keyof SimulationValues, value: string) => {
    setSimulation((prev) => ({ ...prev, [key]: Number(value) || 0 }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            Regole provvigioni
          </DialogTitle>
          <DialogDescription>
            Configurazione avanzata per provvigioni, bonus, malus, maturazione e qualita vendita.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="rules" className="space-y-4">
          <TabsList className="grid h-auto w-full grid-cols-3">
            <TabsTrigger value="rules" className="gap-2">
              <Settings2 className="h-4 w-4" />
              Regole
            </TabsTrigger>
            <TabsTrigger value="ai" className="gap-2">
              <Bot className="h-4 w-4" />
              AI
            </TabsTrigger>
            <TabsTrigger value="simulator" className="gap-2">
              <FlaskConical className="h-4 w-4" />
              Simulatore
            </TabsTrigger>
          </TabsList>

          <TabsContent value="rules" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
              <div className="rounded-lg border">
                <div className="flex items-center justify-between border-b px-4 py-3">
                  <div>
                    <h3 className="text-sm font-semibold">Regole attive</h3>
                    <p className="text-xs text-muted-foreground">{rules.filter((rule) => rule.is_active).length} attive su {rules.length}</p>
                  </div>
                  {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                </div>
                <div className="divide-y">
                  {!isLoading && rules.length === 0 && (
                    <div className="p-6 text-sm text-muted-foreground">Nessuna regola configurata.</div>
                  )}
                  {rules.map((rule) => (
                    <div
                      key={rule.id}
                      data-testid="commission-rule-row"
                      data-rule-name={rule.name}
                      className="grid gap-3 p-4 md:grid-cols-[1fr_auto] md:items-center"
                    >
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{rule.name}</span>
                          <Badge variant="outline">{TRIGGER_LABELS[rule.trigger_type]}</Badge>
                          <Badge variant="secondary">{BASIS_LABELS[rule.basis]}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {describeCondition(rule)} · {describeAction(rule)}
                        </p>
                        {rule.description && <p className="text-xs text-muted-foreground">{rule.description}</p>}
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <Switch
                          checked={rule.is_active}
                          onCheckedChange={(checked) => toggleRuleMutation.mutate({ rule, is_active: checked })}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Elimina regola provvigione ${rule.name}`}
                          onClick={async () => {
                            if (
                              await confirm({
                                title: "Eliminare la regola di provvigione?",
                                description: `La regola "${rule.name}" verrà rimossa definitivamente dal piano provvigioni.`,
                                confirmLabel: "Elimina",
                                variant: "destructive",
                              })
                            ) {
                              deleteRuleMutation.mutate(rule);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                          <span className="sr-only">Elimina {rule.name}</span>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border p-4">
                <div className="mb-4 flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  <h3 className="text-sm font-semibold">Nuova regola rapida</h3>
                </div>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="commission-rule-name">Nome</Label>
                    <Input id="commission-rule-name" value={manualName} onChange={(e) => setManualName(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Tipo</Label>
                      <Select value={manualTrigger} onValueChange={(value) => setManualTrigger(value as RuleTrigger)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="base">Base</SelectItem>
                          <SelectItem value="tier">Scaglione</SelectItem>
                          <SelectItem value="bonus">Bonus target</SelectItem>
                          <SelectItem value="malus">Malus errori</SelectItem>
                          <SelectItem value="payment_policy">Pagamento</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Base</Label>
                      <Select value={manualBasis} onValueChange={(value) => setManualBasis(value as RuleBasis)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sold">Venduto</SelectItem>
                          <SelectItem value="collected">Incassato</SelectItem>
                          <SelectItem value="margin">Margine</SelectItem>
                          <SelectItem value="revenue_period">Fatturato periodo</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="commission-rule-percent">%</Label>
                      <Input id="commission-rule-percent" type="number" step="0.1" value={manualPercent} onChange={(e) => setManualPercent(Number(e.target.value) || 0)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="commission-rule-threshold">Soglia</Label>
                      <Input id="commission-rule-threshold" type="number" step="100" value={manualThreshold} onChange={(e) => setManualThreshold(Number(e.target.value) || 0)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="commission-rule-amount">Importo</Label>
                      <Input id="commission-rule-amount" type="number" step="10" value={manualAmount} onChange={(e) => setManualAmount(Number(e.target.value) || 0)} />
                    </div>
                  </div>
                  <Button className="w-full gap-2" onClick={() => saveRuleMutation.mutate(buildManualRule())} disabled={saveRuleMutation.isPending}>
                    {saveRuleMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Salva regola
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="ai" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
              <div className="rounded-lg border p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Bot className="h-4 w-4" />
                  <h3 className="text-sm font-semibold">Configura con AI</h3>
                </div>
                <Textarea
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  rows={9}
                  className="resize-none"
                />
                <Button className="mt-3 w-full gap-2" onClick={() => generateAiMutation.mutate()} disabled={generateAiMutation.isPending}>
                  {generateAiMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
                  Genera regole
                </Button>
              </div>

              <div className="rounded-lg border">
                <div className="flex items-center justify-between border-b px-4 py-3">
                  <h3 className="text-sm font-semibold">Bozze AI</h3>
                  {aiDrafts.length > 0 && <Badge variant="secondary">{aiDrafts.length}</Badge>}
                </div>
                <div className="divide-y">
                  {aiDrafts.length === 0 && (
                    <div className="p-6 text-sm text-muted-foreground">Nessuna bozza generata.</div>
                  )}
                  {aiDrafts.map((draft, index) => (
                    <div key={`${draft.name}-${index}`} className="p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{draft.name}</span>
                        <Badge variant="outline">{TRIGGER_LABELS[draft.trigger_type]}</Badge>
                        <Badge variant="secondary">{BASIS_LABELS[draft.basis]}</Badge>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {describeCondition(draft as CommissionRule)} · {describeAction(draft as CommissionRule)}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="border-t p-4">
                  <Button className="w-full gap-2" disabled={aiDrafts.length === 0 || saveRuleMutation.isPending} onClick={applyAiDrafts}>
                    {saveRuleMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Applica bozze
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="simulator" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
              <div className="rounded-lg border p-4">
                <h3 className="mb-4 text-sm font-semibold">Scenario</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Venduto</Label>
                    <Input type="number" value={simulation.sold} onChange={(e) => updateSimulation("sold", e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Incassato</Label>
                    <Input type="number" value={simulation.collected} onChange={(e) => updateSimulation("collected", e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Margine</Label>
                    <Input type="number" value={simulation.margin} onChange={(e) => updateSimulation("margin", e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Fatturato mese</Label>
                    <Input type="number" value={simulation.periodRevenue} onChange={(e) => updateSimulation("periodRevenue", e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Errori</Label>
                    <Input type="number" value={simulation.errors} onChange={(e) => updateSimulation("errors", e.target.value)} />
                  </div>
                </div>
                <Separator className="my-4" />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Stima</span>
                  <span className="text-xl font-semibold">{formatCurrency(simulated.total)}</span>
                </div>
                {simulated.blocked && (
                  <Alert className="mt-3">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>Pagamento sospeso da una regola di maturazione.</AlertDescription>
                  </Alert>
                )}
              </div>

              <div className="rounded-lg border">
                <div className="border-b px-4 py-3">
                  <h3 className="text-sm font-semibold">Risultato regole</h3>
                </div>
                <div className="divide-y">
                  {simulated.rows.length === 0 && (
                    <div className="p-6 text-sm text-muted-foreground">Aggiungi una regola per simulare.</div>
                  )}
                  {simulated.rows.map((row) => (
                    <div key={row.id} className="flex items-center justify-between gap-3 p-4">
                      <div>
                        <p className="text-sm font-medium">{row.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {row.skipped ? "Condizione non raggiunta" : row.blocked ? "Matura ma resta sospesa" : "Applicata"}
                        </p>
                      </div>
                      <span className={row.amount < 0 ? "font-medium text-red-700" : "font-medium"}>
                        {row.skipped ? "—" : formatCurrency(row.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Chiudi</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
