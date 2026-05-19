import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Package,
  ShieldAlert,
  Database,
  Clock,
  Settings2,
} from "lucide-react";

interface SuperAdminCompanyOverridesProps {
  company: { id: string; name: string };
  open: boolean;
  onClose: () => void;
}

export function SuperAdminCompanyOverrides({
  company,
  open,
  onClose,
}: SuperAdminCompanyOverridesProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [reason, setReason] = useState("");
  const [trialExtension, setTrialExtension] = useState<string>("");
  const [trialReason, setTrialReason] = useState("");
  const [saving, setSaving] = useState(false);

  // v8.6.62 — local state ora supporta access_level tri-state
  type AccessLevel = "disabled" | "preview" | "enabled";
  const [localOverrides, setLocalOverrides] = useState<
    Record<
      string,
      { access_level: AccessLevel; is_enabled: boolean; expires_at: string; override_reason: string }
    >
  >({});

  // ── Fetch current plan ──
  const { data: subscription, isLoading: subLoading } = useQuery({
    queryKey: ["company-subscription-plan", company.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_subscriptions")
        .select("*, subscription_plans:plan_id(name, max_storage_mb, max_orders, max_users, price_monthly)")
        .eq("company_id", company.id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  // ── Fetch company (for trial_ends_at) ──
  const { data: companyData } = useQuery({
    queryKey: ["company-trial", company.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("trial_ends_at, trial_extensions_count")
        .eq("id", company.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  // ── Fetch addon feature flags ──
  const { data: addonFlags = [], isLoading: flagsLoading } = useQuery({
    queryKey: ["platform-feature-flags-addons"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_feature_flags")
        .select("*")
        .eq("category", "addon")
        .order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  // ── Fetch existing overrides ──
  const { data: existingOverrides = [], isLoading: overridesLoading } =
    useQuery({
      queryKey: ["company-feature-overrides", company.id],
      queryFn: async () => {
        const { data, error } = await supabase
          .from("company_feature_overrides")
          .select("*")
          .eq("company_id", company.id);
        if (error) throw error;
        return data;
      },
      enabled: open,
    });

  // ── Fetch limits override (storage/orders) ──
  const { data: limitsOverride } = useQuery({
    queryKey: ["company-limits-override", company.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("company_billing_overrides" as never)
        .select("custom_max_orders")
        .eq("company_id", company.id)
        .eq("service" as never, "_limits")
        .maybeSingle();
      return data as { custom_max_orders: number | null } | null;
    },
    enabled: open,
  });

  // Derived data
  const plan = subscription?.subscription_plans as {
    name: string;
    max_storage_mb: number;
    max_orders: number;
    max_users: number;
    price_monthly: number;
  } | null;

  const activeOverridesCount = useMemo(() => {
    return existingOverrides.filter(
      (o: { is_enabled: boolean; expires_at: string | null }) =>
        o.is_enabled && (!o.expires_at || new Date(o.expires_at) > new Date())
    ).length;
  }, [existingOverrides]);

  // Helper to get override state (local edits take precedence)
  const getOverrideState = (flagKey: string) => {
    if (localOverrides[flagKey]) return localOverrides[flagKey];
    const existing = existingOverrides.find(
      (o: { feature_key: string }) => o.feature_key === flagKey
    ) as { is_enabled: boolean; access_level?: AccessLevel; expires_at: string | null; override_reason: string | null } | undefined;
    if (existing) {
      return {
        access_level: existing.access_level ?? (existing.is_enabled ? "enabled" : "disabled") as AccessLevel,
        is_enabled: existing.is_enabled,
        expires_at: existing.expires_at ?? "",
        override_reason: existing.override_reason ?? "",
      };
    }
    return { access_level: "disabled" as AccessLevel, is_enabled: false, expires_at: "", override_reason: "" };
  };

  const updateLocalOverride = (
    flagKey: string,
    field: string,
    value: string | boolean
  ) => {
    setLocalOverrides((prev) => {
      const current = getOverrideState(flagKey);
      const next = { ...current, [field]: value };
      // Sync is_enabled <-> access_level
      if (field === "access_level") {
        next.is_enabled = value === "enabled";
      } else if (field === "is_enabled") {
        next.access_level = value ? "enabled" : "disabled";
      }
      return { ...prev, [flagKey]: next };
    });
  };

  // ── Save all overrides ──
  const handleSave = async () => {
    if (!user?.id) return;
    setSaving(true);

    try {
      // 1. Upsert feature overrides (only those with local edits)
      const keysToSave = Object.keys(localOverrides);
      if (keysToSave.length > 0) {
        for (const key of keysToSave) {
          const state = localOverrides[key];
          const { error } = await supabase
            .from("company_feature_overrides")
            .upsert(
              {
                company_id: company.id,
                feature_key: key,
                access_level: state.access_level,
                is_enabled: state.access_level === "enabled",
                expires_at: state.expires_at || null,
                override_by: user.id,
                override_reason: state.override_reason || reason || null,
              },
              { onConflict: "company_id,feature_key" }
            );
          if (error) throw error;
        }
      }

      // 2. Log the override action
      if (keysToSave.length > 0 || trialExtension) {
        await supabase.from("company_flag_audit_log").insert({
          company_id: company.id,
          changed_by: user.id,
          field_name: "feature_overrides",
          new_value: {
            overrides_changed: keysToSave,
            trial_extension: trialExtension || null,
            reason: reason || trialReason || null,
          },
          reason: reason || trialReason || "Override da SuperAdmin",
        });
      }

      // 3. Trial extension
      if (trialExtension && parseInt(trialExtension) > 0) {
        const daysToAdd = parseInt(trialExtension);
        const currentTrialEnd = companyData?.trial_ends_at
          ? new Date(companyData.trial_ends_at)
          : new Date();
        const baseDate =
          currentTrialEnd > new Date() ? currentTrialEnd : new Date();
        const newTrialEnd = new Date(baseDate);
        newTrialEnd.setDate(newTrialEnd.getDate() + daysToAdd);

        const { error } = await supabase
          .from("companies")
          .update({
            trial_ends_at: newTrialEnd.toISOString(),
            trial_extensions_count:
              (companyData?.trial_extensions_count ?? 0) + 1,
          })
          .eq("id", company.id);
        if (error) throw error;
      }

      // Invalidate queries
      queryClient.invalidateQueries({
        queryKey: ["company-feature-overrides", company.id],
      });
      queryClient.invalidateQueries({
        queryKey: ["admin-all-overrides"],
      });
      queryClient.invalidateQueries({
        queryKey: ["company-trial", company.id],
      });

      toast.success("Override salvati con successo");
      setLocalOverrides({});
      setReason("");
      setTrialExtension("");
      setTrialReason("");
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Errore sconosciuto";
      toast.error("Errore nel salvataggio: " + msg);
    } finally {
      setSaving(false);
    }
  };

  const isLoading = subLoading || flagsLoading || overridesLoading;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-600" />
            Override Azienda: {company.name}
          </DialogTitle>
          <DialogDescription>
            Gestisci gli override delle funzionalità per questa azienda.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6 pt-2">
            {/* ── Header: Piano attuale ── */}
            <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Package className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Piano attuale</p>
                <p className="text-lg font-bold">
                  {plan?.name ?? "Nessun piano"}
                  {plan && (
                    <span className="text-sm font-normal text-muted-foreground ml-2">
                      ({plan.price_monthly}€/mese)
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* ── Status Cards ── */}
            <div className="grid grid-cols-3 gap-3">
              <Card>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Database className="h-4 w-4 text-blue-600" />
                    <span className="text-xs text-muted-foreground">
                      Storage
                    </span>
                  </div>
                  <p className="text-lg font-bold">
                    {plan?.max_storage_mb ?? "—"}{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      MB
                    </span>
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Settings2 className="h-4 w-4 text-violet-600" />
                    <span className="text-xs text-muted-foreground">
                      Max ordini
                    </span>
                  </div>
                  <p className="text-lg font-bold">
                    {limitsOverride?.custom_max_orders != null ? (
                      <>
                        {limitsOverride.custom_max_orders === -1
                          ? "∞"
                          : limitsOverride.custom_max_orders}
                        <Badge
                          variant="outline"
                          className="ml-2 text-xs text-amber-600 border-amber-300"
                        >
                          Override
                        </Badge>
                      </>
                    ) : plan?.max_orders === -1 ? (
                      "∞"
                    ) : (
                      plan?.max_orders ?? "—"
                    )}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-2 mb-1">
                    <ShieldAlert className="h-4 w-4 text-amber-600" />
                    <span className="text-xs text-muted-foreground">
                      Override attivi
                    </span>
                  </div>
                  <p className="text-lg font-bold">{activeOverridesCount}</p>
                </CardContent>
              </Card>
            </div>

            {/* ── Feature Overrides ── */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Settings2 className="h-4 w-4" />
                  Override Funzionalità (Addon)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {addonFlags.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Nessun addon disponibile.
                  </p>
                ) : (
                  addonFlags.map((flag: {
                    id: string;
                    key: string;
                    name: string;
                    description: string | null;
                    is_beta: boolean | null;
                    price_per_month: number | null;
                    supports_preview?: boolean;
                  }) => {
                    const state = getOverrideState(flag.key);
                    const isPreview = state.access_level === "preview";
                    const isEnabled = state.access_level === "enabled";
                    return (
                      <div
                        key={flag.id}
                        className={`rounded-lg border p-3 space-y-2 transition-colors ${
                          isEnabled ? "border-emerald-300/40 bg-emerald-50/40" :
                          isPreview ? "border-amber-300/40 bg-amber-50/40" : ""
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium">
                              {flag.name}
                            </span>
                            {flag.is_beta && (
                              <Badge
                                variant="outline"
                                className="text-xs px-1.5 py-0 text-amber-600 border-amber-300"
                              >
                                BETA
                              </Badge>
                            )}
                            {flag.price_per_month != null &&
                              flag.price_per_month > 0 && (
                                <Badge
                                  variant="secondary"
                                  className="text-xs px-1.5 py-0"
                                >
                                  {flag.price_per_month}€/mese
                                </Badge>
                              )}
                          </div>
                          {/* Tri-state selector */}
                          <div className="inline-flex rounded-md border bg-background p-0.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => updateLocalOverride(flag.key, "access_level", "disabled")}
                              className={`px-2.5 py-1 text-xs rounded-sm transition-colors ${
                                state.access_level === "disabled"
                                  ? "bg-slate-200 text-slate-900 font-medium"
                                  : "text-muted-foreground hover:text-foreground"
                              }`}
                              aria-pressed={state.access_level === "disabled"}
                            >
                              Off
                            </button>
                            <button
                              type="button"
                              onClick={() => updateLocalOverride(flag.key, "access_level", "preview")}
                              disabled={flag.supports_preview === false}
                              title={flag.supports_preview === false ? "Questa funzione non supporta la modalità demo (consumi API a pagamento)" : "Modalità demo: vede UI ma azioni bloccate da popup"}
                              className={`px-2.5 py-1 text-xs rounded-sm transition-colors ${
                                state.access_level === "preview"
                                  ? "bg-amber-200 text-amber-900 font-medium"
                                  : "text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                              }`}
                              aria-pressed={state.access_level === "preview"}
                            >
                              Demo
                            </button>
                            <button
                              type="button"
                              onClick={() => updateLocalOverride(flag.key, "access_level", "enabled")}
                              className={`px-2.5 py-1 text-xs rounded-sm transition-colors ${
                                state.access_level === "enabled"
                                  ? "bg-emerald-200 text-emerald-900 font-medium"
                                  : "text-muted-foreground hover:text-foreground"
                              }`}
                              aria-pressed={state.access_level === "enabled"}
                            >
                              On
                            </button>
                          </div>
                        </div>
                        {flag.description && (
                          <p className="text-xs text-muted-foreground">
                            {flag.description}
                          </p>
                        )}
                        {isPreview && (
                          <p className="text-xs text-amber-700 bg-amber-100/50 rounded px-2 py-1.5">
                            💡 L'azienda vede l'interfaccia ma ogni azione apre il popup
                            "Sblocca contattando il consulente" → ticket assegnato a te.
                          </p>
                        )}
                        {(isEnabled || isPreview) && (
                          <div className="grid grid-cols-2 gap-2 pt-1">
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">
                                Scadenza (opzionale)
                              </Label>
                              <Input
                                type="date"
                                value={state.expires_at?.split("T")[0] ?? ""}
                                onChange={(e) =>
                                  updateLocalOverride(
                                    flag.key,
                                    "expires_at",
                                    e.target.value
                                      ? new Date(
                                          e.target.value
                                        ).toISOString()
                                      : ""
                                  )
                                }
                                className="h-8 text-xs"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">
                                Nota override
                              </Label>
                              <Input
                                placeholder="Es: Promo Q1"
                                value={state.override_reason}
                                onChange={(e) =>
                                  updateLocalOverride(
                                    flag.key,
                                    "override_reason",
                                    e.target.value
                                  )
                                }
                                className="h-8 text-xs"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>

            {/* ── Estensione Trial ── */}
            <Card className="border-amber-200 bg-amber-50/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-600" />
                  Estensione Trial
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>
                    Trial attuale:{" "}
                    {companyData?.trial_ends_at
                      ? new Date(companyData.trial_ends_at).toLocaleDateString(
                          "it-IT"
                        )
                      : "Non impostato"}
                  </span>
                  {companyData?.trial_extensions_count != null &&
                    companyData.trial_extensions_count > 0 && (
                      <Badge
                        variant="outline"
                        className="text-xs text-amber-600 border-amber-300"
                      >
                        Esteso {companyData.trial_extensions_count} volt
                        {companyData.trial_extensions_count === 1 ? "a" : "e"}
                      </Badge>
                    )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Estendi di</Label>
                    <Select
                      value={trialExtension}
                      onValueChange={setTrialExtension}
                    >
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="Seleziona..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="30">+30 giorni</SelectItem>
                        <SelectItem value="60">+60 giorni</SelectItem>
                        <SelectItem value="90">+90 giorni</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Motivazione estensione</Label>
                    <Input
                      placeholder="Es: Richiesta commerciale"
                      value={trialReason}
                      onChange={(e) => setTrialReason(e.target.value)}
                      className="h-9 text-sm"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* ── Note / Motivazione generale ── */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Motivazione generale override
              </Label>
              <Textarea
                placeholder="Inserisci la motivazione per le modifiche apportate..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                Questa nota viene salvata nel log degli audit.
              </p>
            </div>

            {/* ── Azioni ── */}
            <div className="flex justify-end gap-3 pt-2 border-t">
              <Button variant="outline" onClick={onClose} disabled={saving}>
                Annulla
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Salva Override
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
