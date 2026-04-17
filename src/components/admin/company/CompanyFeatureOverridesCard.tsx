import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/queryKeys";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  ShieldAlert,
  Loader2,
  Zap,
  ShieldCheck,
  Layers,
  RotateCcw,
  CalendarClock,
} from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";

/**
 * Editor inline degli override per-azienda per-feature.
 *
 * Sorgente principale: tabella `company_feature_overrides` (esistente).
 * Mostra TUTTE le feature del catalogo (non solo addon), con stato effettivo
 * risolto contro plan_feature_defaults + plans_included[] + default_value.
 *
 * Ogni riga consente:
 *   - Toggle rapido ON/OFF (upsert override `is_enabled`)
 *   - Editor avanzato (limit_value, expires_at, override_reason, price_override)
 *   - Reset override (DELETE → cade sul default del piano)
 *
 * Ogni modifica viene loggata in `company_flag_audit_log` con field_name =
 * `feature_overrides` e un payload con before/after.
 *
 * Differenze vs legacy `SuperAdminCompanyOverrides`:
 *   - Inline (no dialog di ingresso)
 *   - Include TUTTE le feature, non solo `category = addon`
 *   - Mostra la sorgente effettiva (badge) per ciascuna feature
 *   - Supporta `limit_value` e `price_override` oltre a `is_enabled` + `expires_at`
 *   - Audit log automatico (old vs new)
 */

interface Props {
  companyId: string;
  companyName: string;
  planId: string | null;
  planSlug: string | null;
}

interface FeatureFlagRow {
  key: string;
  name: string;
  description: string | null;
  category: string | null;
  is_beta: boolean | null;
  default_value: boolean | null;
  plans_included: string[] | null;
  sort_order: number | null;
}

interface PlanFeatureDefaultRow {
  feature_key: string;
  is_enabled: boolean;
  limit_value: number | null;
}

interface CompanyFeatureOverrideRow {
  id: string;
  company_id: string;
  feature_key: string;
  is_enabled: boolean | null;
  limit_value: number | null;
  expires_at: string | null;
  override_reason: string | null;
  price_override: number | null;
  notes: string | null;
  override_by: string | null;
  set_by: string | null;
  set_by_email: string | null;
  created_at: string | null;
  updated_at: string | null;
}

type EffectiveSource = "override" | "plan_default" | "plan" | "default";

interface MergedRow {
  flag: FeatureFlagRow;
  override: CompanyFeatureOverrideRow | null;
  planDefault: PlanFeatureDefaultRow | null;
  /** Stato effettivo risolto: override → plan_default → plans_included → default_value. */
  effectiveEnabled: boolean;
  /** Limite effettivo (override.limit_value → plan_default.limit_value → null illimitato). */
  effectiveLimit: number | null;
  /** Sorgente dello stato effettivo. */
  source: EffectiveSource;
}

export function CompanyFeatureOverridesCard({
  companyId,
  companyName,
  planId,
  planSlug,
}: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // 1) Catalogo completo delle feature
  const { data: flags = [], isLoading: flagsLoading } = useQuery({
    queryKey: ["admin-feature-flags-catalog"] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_feature_flags")
        .select("key, name, description, category, is_beta, default_value, plans_included, sort_order")
        .order("sort_order", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as FeatureFlagRow[];
    },
    staleTime: 5 * 60 * 1000,
  });

  // 2) Override esistenti per questa azienda
  const { data: overrides = [], isLoading: overridesLoading } = useQuery({
    queryKey: queryKeys.admin.companyFeatureOverrides(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_feature_overrides")
        .select("*")
        .eq("company_id", companyId);
      if (error) throw error;
      return (data ?? []) as CompanyFeatureOverrideRow[];
    },
    staleTime: 30 * 1000,
  });

  // 3) Default del piano per badge "plan_default"
  const { data: planDefaults = [], isLoading: planDefaultsLoading } = useQuery({
    queryKey: queryKeys.admin.planFeatureDefaults(planId ?? ""),
    queryFn: async () => {
      if (!planId) return [] as PlanFeatureDefaultRow[];
      const { data, error } = await supabase
        .from("plan_feature_defaults")
        .select("feature_key, is_enabled, limit_value")
        .eq("plan_id", planId);
      if (error) throw error;
      return (data ?? []) as PlanFeatureDefaultRow[];
    },
    enabled: !!planId,
    staleTime: 60 * 1000,
  });

  const isLoading = flagsLoading || overridesLoading || planDefaultsLoading;

  // JOIN in JS + calcolo sorgente effettiva
  const rows: MergedRow[] = useMemo(() => {
    const overrideByKey = new Map(overrides.map(o => [o.feature_key, o]));
    const planDefaultByKey = new Map(planDefaults.map(p => [p.feature_key, p]));
    return flags.map((flag) => {
      const ov = overrideByKey.get(flag.key) ?? null;
      const pd = planDefaultByKey.get(flag.key) ?? null;

      // Determina stato effettivo: override → plan_default → plans_included → default_value
      let effectiveEnabled: boolean;
      let effectiveLimit: number | null;
      let source: EffectiveSource;
      if (ov) {
        effectiveEnabled = Boolean(ov.is_enabled);
        effectiveLimit = ov.limit_value ?? pd?.limit_value ?? null;
        source = "override";
      } else if (pd) {
        effectiveEnabled = pd.is_enabled;
        effectiveLimit = pd.limit_value ?? null;
        source = "plan_default";
      } else if (flag.plans_included && planSlug && flag.plans_included.includes(planSlug)) {
        effectiveEnabled = true;
        effectiveLimit = null;
        source = "plan";
      } else {
        effectiveEnabled = Boolean(flag.default_value);
        effectiveLimit = null;
        source = "default";
      }

      return {
        flag,
        override: ov,
        planDefault: pd,
        effectiveEnabled,
        effectiveLimit,
        source,
      };
    });
  }, [flags, overrides, planDefaults, planSlug]);

  // Helpers per scrittura audit log
  const insertAuditLog = async (args: {
    featureKey: string;
    oldValue: Record<string, unknown> | null;
    newValue: Record<string, unknown> | null;
    reason: string | null;
  }) => {
    if (!user?.id) return;
    await supabase.from("company_flag_audit_log").insert({
      company_id: companyId,
      changed_by: user.id,
      field_name: "feature_overrides",
      old_value: args.oldValue
        ? ({ feature_key: args.featureKey, ...args.oldValue } as never)
        : null,
      new_value: args.newValue
        ? ({ feature_key: args.featureKey, ...args.newValue } as never)
        : null,
      reason: args.reason,
    });
  };

  // Invalidation comune
  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.admin.companyFeatureOverrides(companyId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.admin.companyFlagAuditLog(companyId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.admin.featureOverrides });
    queryClient.invalidateQueries({ queryKey: ["feature-access"] });
    queryClient.invalidateQueries({ queryKey: queryKeys.featureFlags.companyResolved(companyId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.featureFlags.companyOverrides(companyId) });
  };

  // Toggle rapido: upsert override `is_enabled` (preserva limit/expires/reason/price)
  const toggleMutation = useMutation({
    mutationFn: async (args: { row: MergedRow; newEnabled: boolean }) => {
      if (!user?.id) throw new Error("Utente non autenticato");
      const { row, newEnabled } = args;
      const payload = {
        company_id: companyId,
        feature_key: row.flag.key,
        is_enabled: newEnabled,
        limit_value: row.override?.limit_value ?? null,
        expires_at: row.override?.expires_at ?? null,
        override_reason: row.override?.override_reason ?? null,
        price_override: row.override?.price_override ?? null,
        notes: row.override?.notes ?? null,
        override_by: user.id,
        set_by: user.id,
        set_by_email: user.email ?? null,
      };
      const { error } = await supabase
        .from("company_feature_overrides")
        .upsert(payload, { onConflict: "company_id,feature_key" });
      if (error) throw error;

      await insertAuditLog({
        featureKey: row.flag.key,
        oldValue: row.override
          ? { is_enabled: row.override.is_enabled, source: row.source }
          : { is_enabled: row.effectiveEnabled, source: row.source },
        newValue: { is_enabled: newEnabled, source: "override" },
        reason: `Toggle rapido ${newEnabled ? "ON" : "OFF"} da tab Abbonamento`,
      });
    },
    onSuccess: () => {
      invalidateAll();
      toast.success("Override aggiornato");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Reset override: DELETE → cade sul plan_default / plans_included / default_value
  const resetMutation = useMutation({
    mutationFn: async (row: MergedRow) => {
      if (!row.override) return;
      if (!user?.id) throw new Error("Utente non autenticato");
      const { error } = await supabase
        .from("company_feature_overrides")
        .delete()
        .eq("id", row.override.id);
      if (error) throw error;

      await insertAuditLog({
        featureKey: row.flag.key,
        oldValue: {
          is_enabled: row.override.is_enabled,
          limit_value: row.override.limit_value,
          expires_at: row.override.expires_at,
          override_reason: row.override.override_reason,
          price_override: row.override.price_override,
          source: "override",
        },
        newValue: null,
        reason: "Reset override → fallback su plan_default/plans_included/default",
      });
    },
    onSuccess: () => {
      invalidateAll();
      toast.success("Override rimosso — fallback sul piano");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Editor avanzato
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorTarget, setEditorTarget] = useState<MergedRow | null>(null);
  const [editorForm, setEditorForm] = useState({
    is_enabled: false,
    limit_value: "",
    expires_at: "",
    override_reason: "",
    price_override: "",
    notes: "",
  });

  const openEditor = (row: MergedRow) => {
    setEditorTarget(row);
    setEditorForm({
      is_enabled: row.override?.is_enabled ?? row.effectiveEnabled,
      limit_value: row.override?.limit_value?.toString() ?? "",
      // HTML datetime-local vuole formato YYYY-MM-DDTHH:mm
      expires_at: row.override?.expires_at
        ? row.override.expires_at.slice(0, 16)
        : "",
      override_reason: row.override?.override_reason ?? "",
      price_override: row.override?.price_override?.toString() ?? "",
      notes: row.override?.notes ?? "",
    });
    setEditorOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!editorTarget) throw new Error("Nessuna feature selezionata");
      if (!user?.id) throw new Error("Utente non autenticato");
      const limit =
        editorForm.limit_value.trim() === "" ? null : Number(editorForm.limit_value);
      if (limit !== null && (!Number.isFinite(limit) || !Number.isInteger(limit))) {
        throw new Error("limit_value deve essere un intero (vuoto = illimitato)");
      }
      const price =
        editorForm.price_override.trim() === "" ? null : Number(editorForm.price_override);
      if (price !== null && !Number.isFinite(price)) {
        throw new Error("price_override deve essere numerico");
      }
      const expires =
        editorForm.expires_at.trim() === ""
          ? null
          : new Date(editorForm.expires_at).toISOString();

      const payload = {
        company_id: companyId,
        feature_key: editorTarget.flag.key,
        is_enabled: editorForm.is_enabled,
        limit_value: limit,
        expires_at: expires,
        override_reason: editorForm.override_reason.trim() || null,
        price_override: price,
        notes: editorForm.notes.trim() || null,
        override_by: user.id,
        set_by: user.id,
        set_by_email: user.email ?? null,
      };
      const { error } = await supabase
        .from("company_feature_overrides")
        .upsert(payload, { onConflict: "company_id,feature_key" });
      if (error) throw error;

      await insertAuditLog({
        featureKey: editorTarget.flag.key,
        oldValue: editorTarget.override
          ? {
              is_enabled: editorTarget.override.is_enabled,
              limit_value: editorTarget.override.limit_value,
              expires_at: editorTarget.override.expires_at,
              override_reason: editorTarget.override.override_reason,
              price_override: editorTarget.override.price_override,
            }
          : { is_enabled: editorTarget.effectiveEnabled, source: editorTarget.source },
        newValue: {
          is_enabled: editorForm.is_enabled,
          limit_value: limit,
          expires_at: expires,
          override_reason: editorForm.override_reason.trim() || null,
          price_override: price,
        },
        reason:
          editorForm.override_reason.trim() ||
          "Editor avanzato — override salvato da tab Abbonamento",
      });
    },
    onSuccess: () => {
      invalidateAll();
      toast.success("Override salvato");
      setEditorOpen(false);
      setEditorTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const activeCount = overrides.length;
  const totalCount = flags.length;

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-600" />
              Override Feature per Azienda
            </CardTitle>
            <CardDescription>
              Sblocco/blocco per ogni feature, limiti numerici, scadenza, prezzo custom per{" "}
              <span className="font-medium">{companyName}</span>. Gli override hanno priorità su{" "}
              <code className="text-[0.65rem] bg-muted px-1 rounded">plan_default</code>{" "}
              e sul legacy <code className="text-[0.65rem] bg-muted px-1 rounded">plans_included[]</code>.
            </CardDescription>
          </div>
          <Badge variant="outline" className="gap-1">
            <Layers className="h-3 w-3" />
            {activeCount}/{totalCount} override attivi
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[300px] w-full" />
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[220px]">Feature</TableHead>
                  <TableHead className="w-[110px]">Stato</TableHead>
                  <TableHead className="w-[90px] text-right">Limite</TableHead>
                  <TableHead className="w-[150px]">Scadenza</TableHead>
                  <TableHead className="w-[120px]">Sorgente</TableHead>
                  <TableHead className="w-[200px] text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const { flag, override, effectiveEnabled, effectiveLimit, source } = row;
                  const limitLabel =
                    effectiveLimit != null
                      ? effectiveLimit === 0
                        ? "bloccato"
                        : effectiveLimit.toString()
                      : "—";
                  const expiresLabel = override?.expires_at
                    ? format(new Date(override.expires_at), "dd/MM/yyyy HH:mm", { locale: it })
                    : "—";
                  const isExpired =
                    override?.expires_at && new Date(override.expires_at) < new Date();

                  return (
                    <TableRow key={flag.key}>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium">{flag.name}</span>
                            {flag.is_beta && (
                              <Badge
                                variant="outline"
                                className="text-[0.6rem] px-1 border-amber-300 text-amber-700"
                              >
                                BETA
                              </Badge>
                            )}
                            {flag.category && (
                              <Badge variant="outline" className="text-[0.6rem] px-1">
                                {flag.category}
                              </Badge>
                            )}
                          </div>
                          <code className="text-[0.65rem] text-muted-foreground">{flag.key}</code>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={effectiveEnabled}
                          disabled={toggleMutation.isPending}
                          onCheckedChange={(checked) =>
                            toggleMutation.mutate({ row, newEnabled: checked })
                          }
                        />
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">{limitLabel}</TableCell>
                      <TableCell>
                        {override?.expires_at ? (
                          <div className="flex items-center gap-1 text-xs">
                            <CalendarClock
                              className={`h-3 w-3 ${
                                isExpired ? "text-red-500" : "text-muted-foreground"
                              }`}
                            />
                            <span className={isExpired ? "text-red-600" : ""}>{expiresLabel}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">{expiresLabel}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {source === "override" ? (
                          <Badge variant="default" className="gap-1 bg-amber-600 hover:bg-amber-700">
                            <ShieldAlert className="h-3 w-3" /> override
                          </Badge>
                        ) : source === "plan_default" ? (
                          <Badge variant="secondary" className="gap-1">
                            <ShieldCheck className="h-3 w-3" /> plan_default
                          </Badge>
                        ) : source === "plan" ? (
                          <Badge variant="outline">plans_included</Badge>
                        ) : (
                          <Badge variant="outline">default</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEditor(row)}>
                            <Zap className="h-3 w-3 mr-1" /> Avanzate
                          </Button>
                          {override && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={resetMutation.isPending}
                              onClick={() => resetMutation.mutate(row)}
                            >
                              <RotateCcw className="h-3 w-3 mr-1" /> Reset
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* Editor avanzato */}
      <Dialog
        open={editorOpen}
        onOpenChange={(open) => {
          setEditorOpen(open);
          if (!open) setEditorTarget(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editorTarget?.flag.name ?? "Feature"} — override per {companyName}
            </DialogTitle>
            <DialogDescription>
              Imposta abilitazione, limite numerico, scadenza e prezzo custom per questa azienda.
              L&apos;override ha priorità su <code>plan_default</code> e{" "}
              <code>plans_included[]</code>. Lascia vuoti i campi per usare il valore del piano.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between gap-4 rounded-md border p-3">
              <div>
                <Label className="text-sm">Feature abilitata</Label>
                <p className="text-xs text-muted-foreground">
                  Se spento, la feature viene bloccata per questa azienda anche se inclusa nel
                  piano.
                </p>
              </div>
              <Switch
                checked={editorForm.is_enabled}
                onCheckedChange={(v) => setEditorForm((f) => ({ ...f, is_enabled: v }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Limit value (intero)</Label>
                <Input
                  type="number"
                  step="1"
                  placeholder="vuoto = piano"
                  value={editorForm.limit_value}
                  onChange={(e) =>
                    setEditorForm((f) => ({ ...f, limit_value: e.target.value }))
                  }
                />
                <p className="text-[0.65rem] text-muted-foreground">
                  0 = bloccato, vuoto = eredita dal piano
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Price override (EUR/mese)</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="vuoto = piano"
                  value={editorForm.price_override}
                  onChange={(e) =>
                    setEditorForm((f) => ({ ...f, price_override: e.target.value }))
                  }
                />
                <p className="text-[0.65rem] text-muted-foreground">
                  Se valorizzato, fattura questo importo invece del piano standard
                </p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Scadenza override (opzionale)</Label>
              <Input
                type="datetime-local"
                value={editorForm.expires_at}
                onChange={(e) =>
                  setEditorForm((f) => ({ ...f, expires_at: e.target.value }))
                }
              />
              <p className="text-[0.65rem] text-muted-foreground">
                Dopo questa data l&apos;override decade automaticamente
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Motivo / giustificativo</Label>
              <Input
                value={editorForm.override_reason}
                onChange={(e) =>
                  setEditorForm((f) => ({ ...f, override_reason: e.target.value }))
                }
                placeholder="Es: cliente VIP, trial esteso, promo Q2"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Note (interne)</Label>
              <Textarea
                value={editorForm.notes}
                onChange={(e) => setEditorForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Note operative riservate al team SuperAdmin"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)}>
              Annulla
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Salva override
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
