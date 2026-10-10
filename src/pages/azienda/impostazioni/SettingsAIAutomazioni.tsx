/**
 * SettingsAIAutomazioni — cosa fa Silvio da solo: trust-level + auto-execution policy per azienda.
 *
 * v9.0 — Feature #1 del piano AI strategico.
 *
 * Permette al titolare/admin azienda di decidere, per ogni tipologia di azione AI,
 * quanta autonomia dare al sistema:
 *
 *   • disabled                       — Silvio non propone neanche l'azione (silvio_tool_propose_action rifiuta).
 *   • propose                        — la propone, ma non si esegue (silvio-execute-action risponde 403).
 *   • require_confirmation           — la propone e l'utente clicca OK per eseguirla.
 *   • require_strong_confirmation    — propone + utente deve scrivere "CONFERMO X".
 *   • auto_execute                   — eseguita automaticamente (solo super_admin può abilitarla).
 *
 * Lega:
 *   • Tabella DB: public.ai_company_action_permissions (riga per company × action_type)
 *   • RPC read:   get_ai_action_permission(company_id, action_type)
 *   • RPC write:  set_ai_action_permission(...) — richiede il RUOLO company_admin/super_admin
 *   • Default:    ai_default_action_policy(action_type) — sane defaults
 *
 * Sicurezza (enforce nel DB, qui solo UX):
 *   • mode='auto_execute' richiede super_admin (RLS).
 *   • risk_level='red' richiede super_admin (RLS).
 *   • Per gli altri company_admin può editare liberamente.
 *
 * NOTA UX: le 7 azioni canoniche sono quelle che `silvio-execute-action` esegue
 * realmente. Aggiungere qui significa anche aggiungere lì.
 *
 * 09/10/2026 (revisione impostazioni): niente titolo di pagina qui (lo mette il layout), una frase e un «Come
 * funziona» chiuso; le parole sono quelle di chi legge («Spenta», «Solo proposta», «Chiede conferma (un tocco)»,
 * «Chiede di scrivere CONFERMO»), senza «super_admin» né «auto-execute»; «Salva tutte» dà UN messaggio; le scelte
 * non salvate non si perdono uscendo dalla pagina; chi non può cambiare vede la pagina in sola lettura e il perché.
 * Si modifica solo da amministratore azienda: è ciò che pretende l'RPC (prima la pagina si apriva in modifica anche
 * a chi aveva solo il permesso «Personalizzazione» e il salvataggio finiva in «company admin access required»).
 * La logica delle «scelte pronte» NON è cambiata: solo le parole.
 */
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useSettingsDraftGuard } from "@/hooks/useSettingsDraftGuard";
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
import { SezioneImpostazione } from "@/components/impostazioni/SezioneImpostazione";
import { motivoDelRifiuto } from "@/lib/impostazioni/erroriPerUtente";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  ShieldAlert, ShieldCheck, Save, RotateCcw, History, Lock,
  AlertTriangle, CheckCircle2, XCircle, Hourglass,
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
    description: "Scrive al cliente che ha una rata scaduta o un saldo non incassato.",
    effect: "Email al cliente con la commessa e l'importo da pagare.",
    defaultMode: "require_confirmation",
    defaultRisk: "yellow",
    defaultMaxDaily: 50,
    external: true,
  },
  {
    type: "send_quote_followup",
    label: "Follow-up preventivo",
    description: "Scrive al cliente per ricordargli un preventivo non ancora firmato.",
    effect: "Email al cliente con il riepilogo del preventivo e il pulsante per accettarlo.",
    defaultMode: "require_confirmation",
    defaultRisk: "yellow",
    defaultMaxDaily: 50,
    external: true,
  },
  {
    type: "create_purchase_order",
    label: "Ordine fornitore (bozza)",
    description: "Prepara una bozza di ordine al fornitore per ricomprare i materiali sotto la scorta minima.",
    effect: "Bozza salvata. Al fornitore non parte nessuna email da sola.",
    defaultMode: "require_confirmation",
    defaultRisk: "yellow",
    defaultMaxDaily: 25,
    external: false,
  },
  {
    type: "create_quote_draft",
    label: "Preventivo (bozza)",
    description: "Prepara una bozza di preventivo per un nuovo contatto o una richiesta in arrivo.",
    effect: "Bozza salvata. Al cliente non arriva niente finché non la rivedi tu.",
    defaultMode: "propose",
    defaultRisk: "yellow",
    defaultMaxDaily: 10,
    external: false,
  },
  {
    type: "create_invoice_draft",
    label: "Fattura (bozza)",
    description: "Prepara la bozza di fattura per uno stato avanzamento o una rata già consegnata, da rivedere ed emettere.",
    effect: "Bozza salvata. Niente va al cliente o allo SdI da solo.",
    defaultMode: "propose",
    defaultRisk: "yellow",
    defaultMaxDaily: 10,
    external: false,
  },
  {
    type: "mark_payment_received",
    label: "Registra pagamento ricevuto",
    description: "Segna come incassata la rata di un cliente (per esempio quando la banca conferma il bonifico).",
    effect: "La rata risulta incassata e resta il registro dell'operazione.",
    defaultMode: "require_strong_confirmation",
    defaultRisk: "red",
    defaultMaxDaily: null,
    external: false,
  },
  {
    type: "generic_email",
    label: "Email libera",
    description: "Silvio scrive e invia un'email che non è legata a un preventivo o a una rata. È l'azione che chiede più cautela.",
    effect: "Email scritta da Silvio e inviata a nome della tua azienda.",
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

/** Come si leggono le cinque modalità nell'elenco a tendina. */
const MODE_LABELS: Record<ActionMode, string> = {
  disabled: "Spenta",
  propose: "Solo proposta",
  require_confirmation: "Chiede conferma (un tocco)",
  require_strong_confirmation: "Chiede di scrivere CONFERMO",
  auto_execute: "Esegue da sola",
};

const MODE_DESCRIPTIONS: Record<ActionMode, string> = {
  disabled: "Silvio non la propone mai. Resta possibile farla a mano dai menu dell'app.",
  propose: "Silvio prepara la proposta in chat ma non si può eseguire da lì: serve per osservare cosa proporrebbe.",
  require_confirmation: "Silvio prepara la proposta e un tocco su «Esegui» la fa partire.",
  require_strong_confirmation: "Silvio prepara la proposta e, per eseguirla, scrivi CONFERMO e il nome dell'azione: è una sicurezza contro i tocchi sbagliati.",
  auto_execute: "Silvio la esegue da solo, senza chiederti niente. La attiva EdiliziaInCloud, su richiesta.",
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

/** Scelte pronte che applicano modalità coerenti a tutte le azioni. */
type PresetKey = "conservative" | "balanced" | "aggressive";
const PRESETS: Record<PresetKey, { label: string; description: string; resolve: (a: ActionDef) => ActionMode }> = {
  conservative: {
    label: "Prudente",
    description: "Ogni azione chiede conferma; quelle a rischio alto di scrivere CONFERMO. Consigliata per cominciare.",
    resolve: (a) => {
      if (a.defaultRisk === "red") return "require_strong_confirmation";
      return "require_confirmation";
    },
  },
  balanced: {
    label: "Equilibrata",
    description: "Preventivi, fatture e ordini restano solo proposte, senza eseguirle. Solleciti ed email chiedono conferma; i pagamenti, di scrivere CONFERMO.",
    resolve: (a) => {
      if (a.defaultRisk === "red") return "require_strong_confirmation";
      if (a.external) return "require_confirmation";
      return "propose"; // bozze interne: solo proporre, niente click conferma
    },
  },
  aggressive: {
    label: "Aggressivo",
    description: "Solo per EdiliziaInCloud: le email ai clienti partono da sole, entro il limite al giorno.",
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

const scelte = (n: number) => (n === 1 ? "1 scelta" : `${n} scelte`);

export default function SettingsAIAutomazioni() {
  const { effectiveCompany, role } = useAuth();
  const permissions = usePermissions();
  const queryClient = useQueryClient();
  const companyId = effectiveCompany?.id ?? null;

  const isSuperAdmin = role === "super_admin";
  // L'RPC che scrive le scelte vuole il ruolo di amministratore: il permesso «Personalizzazione» da solo non basta.
  const canEdit = permissions.isAdmin && permissions.canEditSettingsCustomization;

  const [drafts, setDrafts] = useState<Record<string, PermissionDraft>>({});

  // Carica permission per tutte le 7 azioni — in parallelo via Promise.all.
  const { data: permissionsByType, isLoading, isError, refetch } = useQuery({
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
    // Il messaggio lo dà chi chiama (una scelta sola, o «3 scelte salvate» per «Salva tutte»): qui solo i dati.
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["ai-action-permissions", companyId] });
      setDrafts((d) => {
        const copy = { ...d };
        delete copy[vars.action_type];
        return copy;
      });
    },
  });

  // Audit log: recenti auto-execute / applied di proposte AI.
  const { data: recentExecutions, isError: storicoErrore, refetch: riprovaStorico } = useQuery({
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

  const daSalvare = rows.filter((r) => r.dirty);
  // Le scelte non salvate non si perdono uscendo dalla pagina senza accorgersene.
  useSettingsDraftGuard(daSalvare.length > 0 || setMutation.isPending);

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
    toast.info(`Scelta «${PRESETS[preset].label}» caricata: controlla le azioni e premi «Salva tutte».`);
  };

  /** Salva le scelte indicate, una dopo l'altra, e dà UN solo messaggio alla fine. */
  const salva = async (da: typeof rows) => {
    if (da.length === 0) return;
    const riuscite: string[] = [];
    const fallite: { nome: string; motivo: string }[] = [];
    for (const r of da) {
      try {
        await setMutation.mutateAsync({
          action_type: r.action.type,
          mode: r.mode,
          risk_level: r.risk,
          max_daily_executions: r.maxDaily,
        });
        riuscite.push(r.action.label);
      } catch (e) {
        fallite.push({ nome: r.action.label, motivo: motivoDelRifiuto(e, "Riprova tra poco.") });
      }
    }
    if (fallite.length === 0) {
      toast.success(riuscite.length === 1 ? `Scelta salvata: ${riuscite[0]}` : `${scelte(riuscite.length)} salvate`);
      return;
    }
    const titolo = riuscite.length > 0
      ? `Salvate ${scelte(riuscite.length)} su ${da.length}`
      : da.length === 1 ? `Non sono riuscito a salvare «${fallite[0].nome}»` : "Non sono riuscito a salvare le scelte";
    toast.error(titolo, { description: fallite.slice(0, 3).map((f) => `«${f.nome}»: ${f.motivo}`).join(" · ") });
  };

  if (!companyId) {
    return (
      <Alert>
        <AlertTitle>Azienda non selezionata</AlertTitle>
        <AlertDescription>Scegli un'azienda dalla barra laterale per vedere cosa fa Silvio da solo.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="max-w-4xl space-y-4">
      <p className="text-sm text-muted-foreground">
        Per ogni azione scegli se Silvio la propone, chiede conferma o la esegue da solo, con un limite al giorno.
      </p>

      <details className="rounded-lg border bg-card px-4 py-3 text-sm">
        <summary className="cursor-pointer select-none font-medium">Come funziona</summary>
        <div className="mt-2 space-y-2 text-muted-foreground">
          <p>Silvio è l'assistente AI: legge cosa succede in azienda e propone azioni, per esempio un sollecito o una bozza di preventivo.</p>
          <p>
            Le azioni a rischio alto (registrare un pagamento, l'email libera) chiedono sempre di scrivere CONFERMO e le
            cambia solo EdiliziaInCloud, su richiesta. Lo stesso vale per l'esecuzione automatica.
          </p>
          <p>Le azioni portate a termine o andate male, anche quelle fatte da te con un tocco, restano elencate nella scheda «Cosa ha fatto».</p>
        </div>
      </details>

      {!canEdit && (
        <Alert>
          <Lock className="h-4 w-4" />
          <AlertDescription>
            Stai consultando le scelte di Silvio: le cambia l'amministratore dell'azienda.
          </AlertDescription>
        </Alert>
      )}

      {isError ? (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center gap-3">
            Non riesco a leggere le scelte salvate, quindi non le mostro: quelle di partenza potrebbero essere diverse.
            <Button size="sm" variant="outline" onClick={() => void refetch()}>Riprova</Button>
          </AlertDescription>
        </Alert>
      ) : (
        <Tabs defaultValue="scelte">
          <TabsList>
            <TabsTrigger value="scelte">Cosa può fare</TabsTrigger>
            <TabsTrigger value="storico">
              <History className="h-4 w-4 mr-1" aria-hidden="true" /> Cosa ha fatto
            </TabsTrigger>
          </TabsList>

          <TabsContent value="scelte" className="space-y-4">
            {/* In alto e non in basso: da telefono la barra di navigazione galleggia sul fondo. */}
            {canEdit && (
              <div className="sticky top-2 z-20 flex flex-wrap items-center justify-end gap-x-3 gap-y-2 rounded-lg border bg-card/95 px-3 py-2 shadow-sm backdrop-blur">
                <p role="status" className="mr-auto min-w-0 text-xs">
                  {daSalvare.length > 0
                    ? <span className="text-amber-700">{scelte(daSalvare.length)} da salvare</span>
                    : <span className="text-muted-foreground">Nessuna modifica da salvare</span>}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={daSalvare.length === 0 || setMutation.isPending}
                  onClick={() => setDrafts({})}
                >
                  <RotateCcw className="h-3 w-3 mr-1" aria-hidden="true" /> Annulla modifiche
                </Button>
                <Button
                  size="sm"
                  disabled={daSalvare.length === 0 || setMutation.isPending}
                  onClick={() => void salva(daSalvare)}
                >
                  <Save className="h-3 w-3 mr-1" aria-hidden="true" /> Salva tutte
                </Button>
              </div>
            )}

            <SezioneImpostazione
              id="scelte-pronte"
              titolo="Scelte pronte"
              descrizione="Un modo veloce per impostare tutte le azioni insieme: ne scegli una e poi cambi le singole azioni se vuoi. Rimette anche i limiti al giorno a quelli consigliati. Non salva niente finché non premi «Salva tutte»."
            >
              <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
                {(Object.keys(PRESETS) as PresetKey[])
                  // «Aggressivo» ha senso solo per chi può accendere l'esecuzione automatica: per un'azienda carica una cosa diversa.
                  .filter((k) => k !== "aggressive" || isSuperAdmin)
                  .map((k) => (
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
              </div>
            </SezioneImpostazione>

            <SezioneImpostazione
              id="azioni"
              titolo="Le azioni di Silvio"
              descrizione="Per ognuna: cosa fa Silvio e quante volte al giorno."
            >
              {isLoading && (
                <div className="space-y-2 p-4">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
                </div>
              )}

              {!isLoading && rows.map((r) => {
                const a = r.action;
                const lockedAutoExec = !isSuperAdmin && r.mode === "auto_execute";
                const lockedRed = !isSuperAdmin && r.risk === "red";
                return (
                  <div key={a.type} className={cn("space-y-4 px-4 py-4", r.dirty && "bg-amber-50/60 dark:bg-amber-950/10")}>
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex-1 min-w-0 md:min-w-[260px] max-w-full">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold leading-tight">{a.label}</h3>
                          <Badge variant="outline" className={RISK_COLORS[r.risk]}>
                            {r.risk === "red" && <ShieldAlert className="h-3 w-3 mr-1" aria-hidden="true" />}
                            {r.risk === "yellow" && <AlertTriangle className="h-3 w-3 mr-1" aria-hidden="true" />}
                            {r.risk === "green" && <ShieldCheck className="h-3 w-3 mr-1" aria-hidden="true" />}
                            Rischio {RISK_LABELS[r.risk]}
                          </Badge>
                          {r.current?.source === "company_override" && (
                            <Badge variant="secondary" className="text-xs">Personalizzato</Badge>
                          )}
                          {r.dirty && (
                            <Badge className="bg-amber-500 text-white text-xs">Modificato</Badge>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{a.description}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          <strong>Cosa succede:</strong> {a.effect}
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

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor={`mode-${a.type}`}>Cosa fa Silvio</Label>
                        <Select
                          value={r.mode}
                          disabled={!canEdit || lockedRed}
                          onValueChange={(v) => {
                            const newMode = v as ActionMode;
                            if (newMode === "auto_execute" && !isSuperAdmin) {
                              toast.error("L'esecuzione automatica la attiva solo EdiliziaInCloud, su richiesta.");
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
                            <SelectItem value="disabled">{MODE_LABELS.disabled}</SelectItem>
                            <SelectItem value="propose">{MODE_LABELS.propose}</SelectItem>
                            <SelectItem value="require_confirmation">{MODE_LABELS.require_confirmation}</SelectItem>
                            <SelectItem value="require_strong_confirmation">{MODE_LABELS.require_strong_confirmation}</SelectItem>
                            <SelectItem value="auto_execute" disabled={!isSuperAdmin}>
                              {MODE_LABELS.auto_execute}{!isSuperAdmin && " — su richiesta all'assistenza"}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">{MODE_DESCRIPTIONS[r.mode]}</p>
                        {lockedRed && (
                          <p className="text-xs text-rose-600 flex items-center gap-1">
                            <Lock className="h-3 w-3" aria-hidden="true" /> Azione a rischio alto: la scelta la cambia solo EdiliziaInCloud, su richiesta.
                          </p>
                        )}
                        {lockedAutoExec && (
                          <p className="text-xs text-amber-600 flex items-center gap-1">
                            <Lock className="h-3 w-3" aria-hidden="true" /> Questa azione si esegue da sola, attivata da EdiliziaInCloud: se scegli un'altra modalità, per riaverla devi chiederlo all'assistenza.
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor={`limit-${a.type}`}>
                          Limite al giorno {a.defaultMaxDaily === null && "(non c'è un limite consigliato)"}
                        </Label>
                        <Input
                          id={`limit-${a.type}`}
                          type="number"
                          inputMode="numeric"
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
                          Raggiunto questo numero in una giornata, Silvio smette di proporre e di eseguire questa azione fino
                          a domani. Vuoto = nessun limite (sconsigliato).
                        </p>
                      </div>
                    </div>

                    {r.dirty && (
                      <div className="flex gap-2 justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Annulla modifica: ${a.label}`}
                          onClick={() => {
                            setDrafts((d) => {
                              const copy = { ...d };
                              delete copy[a.type];
                              return copy;
                            });
                          }}
                        >
                          <RotateCcw className="h-3 w-3 mr-1" aria-hidden="true" /> Annulla modifica
                        </Button>
                        <Button
                          size="sm"
                          aria-label={`Salva: ${a.label}`}
                          disabled={setMutation.isPending}
                          onClick={() => void salva([r])}
                        >
                          <Save className="h-3 w-3 mr-1" aria-hidden="true" /> Salva
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </SezioneImpostazione>
          </TabsContent>

          <TabsContent value="storico" className="space-y-3">
            <SezioneImpostazione
              id="storico"
              titolo="Le ultime azioni di Silvio"
              descrizione="Le ultime 20 azioni portate a termine o andate male, per questa azienda."
            >
              {storicoErrore ? (
                <div className="flex flex-wrap items-center gap-3 p-4 text-sm text-muted-foreground">
                  Non riesco a leggere lo storico.
                  <Button size="sm" variant="outline" onClick={() => void riprovaStorico()}>Riprova</Button>
                </div>
              ) : !recentExecutions ? (
                <div className="space-y-2 p-4">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : recentExecutions.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">
                  Silvio non ha ancora eseguito azioni.
                </p>
              ) : (
                recentExecutions.map((row) => {
                  const a = ACTIONS.find((x) => x.type === row.action_type);
                  return (
                    <div key={row.id} className="flex items-start gap-3 px-4 py-3">
                      <div className="mt-0.5">
                        {row.status === "applied" && <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />}
                        {row.status === "failed" && <XCircle className="h-4 w-4 text-rose-600" aria-hidden="true" />}
                        {row.status !== "applied" && row.status !== "failed" && <Hourglass className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{a?.label ?? row.action_type}</span>
                          <span className={cn("text-xs font-medium", row.status === "failed" ? "text-rose-600" : row.status === "applied" ? "text-emerald-700" : "text-muted-foreground")}>
                            {row.status === "applied" ? "Eseguita" : row.status === "failed" ? "Non riuscita" : "In attesa"}
                          </span>
                          {row.risk_level === "red" && (
                            <Badge variant="outline" className={RISK_COLORS.red}>Rischio alto</Badge>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {row.applied_at ? new Date(row.applied_at).toLocaleString("it-IT") : "—"}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{row.summary}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </SezioneImpostazione>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
