/**
 * SettingsAIAutomazioni — Trust-level + auto-execution policy per azienda.
 *
 * v9.0 — Feature #1 del piano AI strategico.
 *
 * Permette al titolare/admin azienda di decidere, per ogni tipologia di azione AI,
 * quanto autonomia dare al sistema:
 *
 *   • disabled                       — Silvio non propone neanche l'azione.
 *   • propose                        — la propone, ma non si esegue (nemmeno con conferma).
 *   • require_confirmation           — la propone e l'utente clicca OK per eseguirla.
 *   • require_strong_confirmation    — propone + utente deve scrivere "CONFERMO X".
 *   • auto_execute                   — eseguita automaticamente (solo super_admin può abilitarla).
 *
 * Lega:
 *   • Tabella DB: public.ai_company_action_permissions (riga per company × action_type)
 *   • RPC read:   get_ai_action_permission(company_id, action_type)
 *   • RPC write:  set_ai_action_permission(...)
 *   • Default:    ai_default_action_policy(action_type) — sane defaults
 *
 * Sicurezza (enforce nel DB, qui solo UX):
 *   • mode='auto_execute' richiede super_admin (RLS).
 *   • risk_level='red' richiede super_admin (RLS).
 *   • Per gli altri company_admin può editare liberamente.
 *
 * NOTA UX: le 7 azioni canoniche sono quelle che `silvio-execute-action` esegue
 * realmente. Aggiungere qui significa anche aggiungere lì.
 */
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import {
  Bot, ShieldAlert, ShieldCheck, Save, RotateCcw, History, Lock,
  AlertTriangle, CheckCircle2, XCircle, Hourglass, Sparkles, Info,
} from "lucide-react";

type ActionMode =
  | "disabled"
  | "propose"
  | "require_confirmation"
  | "require_strong_confirmation"
  | "auto_execute";
type RiskLevel = "green" | "yellow" | "red";

/** Catalogo azioni canoniche supportate da silvio-execute-action. */
interface ActionDef {
  type: string;
  label: string;
  description: string;
  defaultMode: ActionMode;
  defaultRisk: RiskLevel;
  defaultMaxDaily: number | null;
  /** Etichetta "cosa fa concretamente" mostrata all'utente. */
  effect: string;
  /** Se true: questa azione manda una comunicazione esterna (email/WA) → invasiva. */
  external: boolean;
}

const ACTIONS: ActionDef[] = [
  {
    type: "send_overdue_reminder",
    label: "Sollecito di pagamento",
    description: "Invia un'email/messaggio al cliente che ha una rata scaduta o un saldo non incassato.",
    effect: "Email inviata al cliente con riferimento ordine e importo da pagare.",
    defaultMode: "require_confirmation",
    defaultRisk: "yellow",
    defaultMaxDaily: 50,
    external: true,
  },
  {
    type: "send_quote_followup",
    label: "Follow-up preventivo",
    description: "Invia un'email/messaggio al cliente per ricordargli un preventivo non ancora firmato.",
    effect: "Email inviata al cliente con riepilogo preventivo e CTA per accettare.",
    defaultMode: "require_confirmation",
    defaultRisk: "yellow",
    defaultMaxDaily: 50,
    external: true,
  },
  {
    type: "create_purchase_order",
    label: "Ordine fornitore (bozza)",
    description: "Crea una bozza di ordine fornitore per riapprovvigionare materiali sotto soglia.",
    effect: "Bozza salvata. Nessuna email parte automaticamente al fornitore.",
    defaultMode: "require_confirmation",
    defaultRisk: "yellow",
    defaultMaxDaily: 25,
    external: false,
  },
  {
    type: "create_quote_draft",
    label: "Preventivo (bozza)",
    description: "Genera una bozza di preventivo per un nuovo lead o richiesta in arrivo.",
    effect: "Bozza preventivo salvata. Non viene inviata al cliente fino alla tua revisione.",
    defaultMode: "propose",
    defaultRisk: "yellow",
    defaultMaxDaily: 10,
    external: false,
  },
  {
    type: "create_invoice_draft",
    label: "Fattura (bozza)",
    description: "Prepara una bozza di fattura per un SAL o rata già consegnata, da rivedere ed emettere.",
    effect: "Bozza fattura salvata. Nessun documento inviato a SDI/cliente automaticamente.",
    defaultMode: "propose",
    defaultRisk: "yellow",
    defaultMaxDaily: 10,
    external: false,
  },
  {
    type: "mark_payment_received",
    label: "Registra pagamento ricevuto",
    description: "Segna come incassata una rata cliente (es. da riconciliazione bancaria automatica).",
    effect: "Aggiornamento status rata + audit log. Movimento contabile registrato.",
    defaultMode: "require_strong_confirmation",
    defaultRisk: "red",
    defaultMaxDaily: null,
    external: false,
  },
  {
    type: "generic_email",
    label: "Email custom",
    description: "Permette all'AI di comporre e inviare email arbitrarie. Massima libertà = massimo rischio.",
    effect: "Email arbitraria inviata via Resend con account aziendale.",
    defaultMode: "require_strong_confirmation",
    defaultRisk: "red",
    defaultMaxDaily: null,
    external: true,
  },
];

interface PermissionResult {
  company_id: string;
  action_type: string;
  source: "default" | "company_override";
  risk_level: RiskLevel;
  mode: ActionMode;
  allowed_roles: string[];
  requires_company_admin: boolean;
  requires_strong_confirmation: boolean;
  max_daily_executions: number | null;
  daily_executions: number;
  daily_limit_reached: boolean;
  notes: string | null;
}

const MODE_LABELS: Record<ActionMode, string> = {
  disabled: "Disattivata",
  propose: "Solo proporre",
  require_confirmation: "Conferma con 1 click",
  require_strong_confirmation: "Conferma forte (testo)",
  auto_execute: "Esegui automaticamente",
};

const MODE_DESCRIPTIONS: Record<ActionMode, string> = {
  disabled: "Silvio non proporrà mai questa azione. L'azione resta accessibile manualmente nei menu dell'app.",
  propose: "Silvio prepara la proposta in chat ma il pulsante \"Esegui\" è disabilitato. Buono per fase di osservazione.",
  require_confirmation: "Silvio prepara e propone. Un click conferma l'invio.",
  require_strong_confirmation: "Silvio prepara, propone, e per eseguire devi scrivere \"CONFERMO {azione}\". Anti-misclick.",
  auto_execute: "Silvio esegue automaticamente senza chiederti nulla. Riservato a super_admin per ridurre il rischio.",
};

const RISK_LABELS: Record<RiskLevel, string> = {
  green: "Basso",
  yellow: "Medio",
  red: "Alto",
};

const RISK_COLORS: Record<RiskLevel, string> = {
  green: "bg-emerald-100 text-emerald-800 border-emerald-200",
  yellow: "bg-amber-100 text-amber-800 border-amber-200",
  red: "bg-rose-100 text-rose-800 border-rose-200",
};

/** Preset rapidi che applicano modalità coerenti a tutte le azioni. */
type PresetKey = "conservative" | "balanced" | "aggressive";
const PRESETS: Record<PresetKey, { label: string; description: string; resolve: (a: ActionDef) => ActionMode }> = {
  conservative: {
    label: "Cauto",
    description: "Ogni azione richiede conferma esplicita. Default consigliato per chi parte.",
    resolve: (a) => {
      if (a.defaultRisk === "red") return "require_strong_confirmation";
      return "require_confirmation";
    },
  },
  balanced: {
    label: "Bilanciato",
    description: "Bozze (preventivi, fatture, ordini) auto-proposte. Email e pagamenti richiedono conferma.",
    resolve: (a) => {
      if (a.defaultRisk === "red") return "require_strong_confirmation";
      if (a.external) return "require_confirmation";
      return "propose"; // bozze interne: solo proporre, niente click conferma
    },
  },
  aggressive: {
    label: "Aggressivo",
    description: "Solo super_admin può attivare. Le azioni esterne (email) si fanno automaticamente entro i limiti giornalieri.",
    resolve: (a) => {
      if (a.defaultRisk === "red") return "require_strong_confirmation"; // mai auto sulle red
      if (a.external) return "auto_execute";
      return "require_confirmation";
    },
  },
};

interface PermissionDraft {
  mode: ActionMode;
  max_daily_executions: number | null;
}

export default function SettingsAIAutomazioni() {
  const { effectiveCompany, role } = useAuth();
  const permissions = usePermissions();
  const queryClient = useQueryClient();
  const companyId = effectiveCompany?.id ?? null;

  const isSuperAdmin = role === "super_admin";
  const canEdit = permissions.canEditSettingsCustomization;

  const [drafts, setDrafts] = useState<Record<string, PermissionDraft>>({});

  // Carica permission per tutte le 7 azioni — in parallelo via Promise.all.
  const { data: permissionsByType, isLoading } = useQuery({
    queryKey: ["ai-action-permissions", companyId],
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async (): Promise<Record<string, PermissionResult>> => {
      if (!companyId) return {};
      const results = await Promise.all(
        ACTIONS.map(async (a) => {
          const { data, error } = await supabase.rpc("get_ai_action_permission", {
            p_company_id: companyId,
            p_action_type: a.type,
          });
          if (error) throw error;
          return [a.type, data as unknown as PermissionResult] as const;
        }),
      );
      const map: Record<string, PermissionResult> = {};
      for (const [t, p] of results) map[t] = p;
      return map;
    },
  });

  const setMutation = useMutation({
    mutationFn: async (input: { action_type: string; mode: ActionMode; risk_level: RiskLevel; max_daily_executions: number | null }) => {
      if (!companyId) throw new Error("Nessuna azienda attiva");
      const action = ACTIONS.find((a) => a.type === input.action_type);
      const allowedRoles = action?.defaultRisk === "red"
        ? ["super_admin", "company_admin"]
        : ["super_admin", "company_admin", "company_staff"];
      const { data, error } = await supabase.rpc("set_ai_action_permission", {
        p_company_id: companyId,
        p_action_type: input.action_type,
        p_mode: input.mode,
        p_risk_level: input.risk_level,
        p_allowed_roles: allowedRoles,
        p_requires_company_admin: input.risk_level === "red",
        p_max_daily_executions: input.max_daily_executions,
        p_notes: null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["ai-action-permissions", companyId] });
      setDrafts((d) => {
        const copy = { ...d };
        delete copy[vars.action_type];
        return copy;
      });
      toast.success(`Policy aggiornata: ${ACTIONS.find((a) => a.type === vars.action_type)?.label}`);
    },
    onError: (e: Error) => {
      toast.error(`Errore salvataggio policy: ${e.message}`);
    },
  });

  // Audit log: recenti auto-execute / applied di proposte AI.
  const { data: recentExecutions } = useQuery({
    queryKey: ["ai-recent-executions", companyId],
    enabled: !!companyId,
    staleTime: 30_000,
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("ai_action_proposals")
        .select("id, action_type, summary, status, applied_at, applied_result, risk_level")
        .eq("company_id", companyId)
        .in("status", ["applied", "failed"])
        .order("applied_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Riga della tabella permessi per ogni azione.
  const rows = useMemo(() => {
    return ACTIONS.map((a) => {
      const current = permissionsByType?.[a.type];
      const draft = drafts[a.type];
      const mode = draft?.mode ?? current?.mode ?? a.defaultMode;
      const maxDaily = draft?.max_daily_executions ?? current?.max_daily_executions ?? a.defaultMaxDaily;
      const risk = (current?.risk_level ?? a.defaultRisk) as RiskLevel;
      const dirty = !!draft && (draft.mode !== current?.mode || draft.max_daily_executions !== current?.max_daily_executions);
      return {
        action: a,
        current,
        mode,
        maxDaily,
        risk,
        dirty,
      };
    });
  }, [permissionsByType, drafts]);

  const applyPreset = (preset: PresetKey) => {
    const next: Record<string, PermissionDraft> = {};
    for (const a of ACTIONS) {
      const resolvedMode = PRESETS[preset].resolve(a);
      // Validazione UX: auto_execute richiede super_admin.
      const finalMode = resolvedMode === "auto_execute" && !isSuperAdmin
        ? "require_confirmation"
        : resolvedMode;
      next[a.type] = {
        mode: finalMode,
        max_daily_executions: a.defaultMaxDaily,
      };
    }
    setDrafts(next);
    toast.info(`Preset "${PRESETS[preset].label}" caricato. Premi "Salva tutte" per applicarlo.`);
  };

  const saveAllDirty = async () => {
    const dirty = rows.filter((r) => r.dirty);
    if (dirty.length === 0) {
      toast.info("Nessuna modifica da salvare.");
      return;
    }
    for (const r of dirty) {
      await setMutation.mutateAsync({
        action_type: r.action.type,
        mode: r.mode,
        risk_level: r.risk,
        max_daily_executions: r.maxDaily,
      });
    }
  };

  if (!companyId) {
    return (
      <div className="p-6">
        <Alert>
          <AlertTitle>Azienda non selezionata</AlertTitle>
          <AlertDescription>Seleziona un'azienda dalla sidebar per gestire le automazioni AI.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 space-y-6 max-w-6xl">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-violet-100 text-violet-600">
          <Bot className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Automazioni AI</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Decidi tu quanto fare al sistema. Per ogni tipo di azione scegli se Silvio deve solo proporre,
            chiederti conferma o eseguire da solo entro i limiti giornalieri.
          </p>
        </div>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Come funziona</AlertTitle>
        <AlertDescription className="text-sm">
          Le azioni "ad alto rischio" (registra pagamento, invio email custom) richiedono sempre conferma forte e non possono essere
          messe in auto-execute da un company admin. Solo il super_admin può abilitare l'esecuzione automatica.
          Tutti gli interventi automatici sono comunque registrati nel log audit qui sotto.
        </AlertDescription>
      </Alert>

      {/* Preset rapidi */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4" /> Preset rapidi</CardTitle>
          <CardDescription>Tre profili pronti. Caricali e poi modifica singole azioni se vuoi.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          {(Object.keys(PRESETS) as PresetKey[]).map((k) => (
            <Button
              key={k}
              variant="outline"
              disabled={!canEdit || setMutation.isPending}
              onClick={() => applyPreset(k)}
              className="h-auto flex-col items-start gap-1 p-4 text-left"
            >
              <span className="font-semibold">{PRESETS[k].label}</span>
              <span className="text-xs text-muted-foreground font-normal whitespace-normal">
                {PRESETS[k].description}
              </span>
            </Button>
          ))}
        </CardContent>
      </Card>

      <Tabs defaultValue="policies">
        <TabsList>
          <TabsTrigger value="policies">Policy per azione</TabsTrigger>
          <TabsTrigger value="audit">
            <History className="h-4 w-4 mr-1" /> Storico esecuzioni
          </TabsTrigger>
        </TabsList>

        <TabsContent value="policies" className="space-y-4">
          {isLoading && (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 w-full" />)}
            </div>
          )}

          {!isLoading && rows.map((r) => {
            const a = r.action;
            const lockedAutoExec = !isSuperAdmin && r.mode === "auto_execute";
            const lockedRed = !isSuperAdmin && r.risk === "red";
            return (
              <Card key={a.type} className={r.dirty ? "border-amber-400 ring-2 ring-amber-200" : ""}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0 md:min-w-[260px] max-w-full">
                      <CardTitle className="flex items-center gap-2 text-base">
                        {a.label}
                        <Badge variant="outline" className={RISK_COLORS[r.risk]}>
                          {r.risk === "red" && <ShieldAlert className="h-3 w-3 mr-1" />}
                          {r.risk === "yellow" && <AlertTriangle className="h-3 w-3 mr-1" />}
                          {r.risk === "green" && <ShieldCheck className="h-3 w-3 mr-1" />}
                          Rischio {RISK_LABELS[r.risk]}
                        </Badge>
                        {r.current?.source === "company_override" && (
                          <Badge variant="secondary" className="text-xs">Personalizzato</Badge>
                        )}
                        {r.dirty && (
                          <Badge className="bg-amber-500 text-white text-xs">Modificato</Badge>
                        )}
                      </CardTitle>
                      <CardDescription className="mt-1 text-xs">{a.description}</CardDescription>
                      <p className="text-xs text-muted-foreground mt-2">
                        <strong>Effetto concreto:</strong> {a.effect}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {r.current && r.current.max_daily_executions !== null && (
                        <span>
                          Oggi: <strong>{r.current.daily_executions}/{r.current.max_daily_executions}</strong>
                          {r.current.daily_limit_reached && (
                            <span className="ml-1 text-rose-600 font-semibold">limite raggiunto</span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor={`mode-${a.type}`}>Modalità di esecuzione</Label>
                      <Select
                        value={r.mode}
                        disabled={!canEdit || lockedRed}
                        onValueChange={(v) => {
                          const newMode = v as ActionMode;
                          if (newMode === "auto_execute" && !isSuperAdmin) {
                            toast.error("Solo il super_admin può abilitare l'esecuzione automatica per questa azione.");
                            return;
                          }
                          setDrafts((d) => ({
                            ...d,
                            [a.type]: {
                              mode: newMode,
                              max_daily_executions: r.maxDaily,
                            },
                          }));
                        }}
                      >
                        <SelectTrigger id={`mode-${a.type}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="disabled">Disattivata</SelectItem>
                          <SelectItem value="propose">Solo proporre</SelectItem>
                          <SelectItem value="require_confirmation">Conferma con 1 click</SelectItem>
                          <SelectItem value="require_strong_confirmation">Conferma forte (testo)</SelectItem>
                          <SelectItem value="auto_execute" disabled={!isSuperAdmin}>
                            Esegui automaticamente {!isSuperAdmin && "🔒 super_admin"}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">{MODE_DESCRIPTIONS[r.mode]}</p>
                      {lockedRed && (
                        <p className="text-xs text-rose-600 flex items-center gap-1">
                          <Lock className="h-3 w-3" /> Azione a rischio alto: configurabile solo dal super_admin.
                        </p>
                      )}
                      {lockedAutoExec && (
                        <p className="text-xs text-amber-600 flex items-center gap-1">
                          <Lock className="h-3 w-3" /> Solo super_admin può tenere questa azione in auto-execute.
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor={`limit-${a.type}`}>
                        Limite giornaliero {a.defaultMaxDaily === null && "(nessun limite consigliato)"}
                      </Label>
                      <Input
                        id={`limit-${a.type}`}
                        type="number"
                        min={0}
                        max={500}
                        disabled={!canEdit || lockedRed || r.mode === "disabled"}
                        placeholder="es. 50"
                        value={r.maxDaily ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          const next = v === "" ? null : Math.max(0, Math.min(500, parseInt(v, 10) || 0));
                          setDrafts((d) => ({
                            ...d,
                            [a.type]: {
                              mode: r.mode,
                              max_daily_executions: next,
                            },
                          }));
                        }}
                      />
                      <p className="text-xs text-muted-foreground">
                        Quando l'AI ha già eseguito questo numero di azioni nella giornata, viene messa in pausa per quel tipo
                        fino a domani. Lascia vuoto per nessun limite (sconsigliato).
                      </p>
                    </div>
                  </div>

                  {r.dirty && (
                    <div className="mt-4 flex gap-2 justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setDrafts((d) => {
                            const copy = { ...d };
                            delete copy[a.type];
                            return copy;
                          });
                        }}
                      >
                        <RotateCcw className="h-3 w-3 mr-1" /> Annulla modifica
                      </Button>
                      <Button
                        size="sm"
                        disabled={setMutation.isPending}
                        onClick={() =>
                          setMutation.mutate({
                            action_type: a.type,
                            mode: r.mode,
                            risk_level: r.risk,
                            max_daily_executions: r.maxDaily,
                          })
                        }
                      >
                        <Save className="h-3 w-3 mr-1" /> Salva
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}

          {/* Save all CTA — sticky bottom solo se ci sono modifiche dirty */}
          {rows.some((r) => r.dirty) && (
            <div className="sticky bottom-4 z-10 flex justify-center">
              <div className="bg-background border shadow-lg rounded-full px-4 py-2 flex items-center gap-3">
                <span className="text-sm">
                  {rows.filter((r) => r.dirty).length} modifica/he non salvate
                </span>
                <Button
                  size="sm"
                  disabled={setMutation.isPending || !canEdit}
                  onClick={saveAllDirty}
                >
                  <Save className="h-3 w-3 mr-1" /> Salva tutte
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="audit" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Storico recenti esecuzioni AI</CardTitle>
              <CardDescription>
                Ultime 20 azioni AI completate o fallite per questa azienda.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!recentExecutions && (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              )}
              {recentExecutions && recentExecutions.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Nessuna azione AI eseguita finora.
                </p>
              )}
              {recentExecutions && recentExecutions.length > 0 && (
                <div className="space-y-2">
                  {recentExecutions.map((row) => {
                    const a = ACTIONS.find((x) => x.type === row.action_type);
                    return (
                      <div
                        key={row.id}
                        className="flex items-start gap-3 p-3 border rounded-md hover:bg-muted/50 transition-colors"
                      >
                        <div className="mt-0.5">
                          {row.status === "applied" && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                          {row.status === "failed" && <XCircle className="h-4 w-4 text-rose-600" />}
                          {row.status !== "applied" && row.status !== "failed" && <Hourglass className="h-4 w-4 text-muted-foreground" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">{a?.label ?? row.action_type}</span>
                            {row.risk_level === "red" && (
                              <Badge variant="outline" className={RISK_COLORS.red}>Alto rischio</Badge>
                            )}
                            <span className="text-xs text-muted-foreground">
                              {row.applied_at ? new Date(row.applied_at).toLocaleString("it-IT") : "—"}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{row.summary}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
