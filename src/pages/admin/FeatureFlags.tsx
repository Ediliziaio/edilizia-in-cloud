import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Loader2, Search, Eye, EyeOff, Bot, MessageCircle, BarChart3, MessageSquare,
  Cpu, Mail, Zap, Percent, Plus, Pencil, Trash2, Flag, Users2, Sparkles,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";

const ICON_MAP: Record<string, React.ElementType> = {
  Bot, MessageCircle, BarChart3, MessageSquare, Cpu, Mail, Zap,
};

const CATEGORY_STYLES: Record<string, { label: string; variant: string; className: string }> = {
  core: { label: "Core", variant: "outline", className: "text-blue-600 border-blue-300 bg-blue-50 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-700" },
  addon: { label: "Addon", variant: "outline", className: "text-violet-600 border-violet-300 bg-violet-50 dark:bg-violet-950 dark:text-violet-400 dark:border-violet-700" },
  beta: { label: "Beta", variant: "outline", className: "text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-700" },
  enterprise: { label: "Enterprise", variant: "outline", className: "text-indigo-600 border-indigo-300 bg-indigo-50 dark:bg-indigo-950 dark:text-indigo-400 dark:border-indigo-700" },
};

const ICON_OPTIONS = ["Bot", "MessageCircle", "BarChart3", "MessageSquare", "Cpu", "Mail", "Zap"] as const;
const CATEGORY_OPTIONS = ["core", "addon", "beta", "enterprise"] as const;

interface FlagForm {
  id?: string;
  key: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  is_beta: boolean;
  default_value: boolean;
  plans_included: string[];
  price_per_month: string;
  sort_order: number;
}

interface FlagRow {
  id: string;
  key: string;
  name: string;
  icon: string | null;
  category: string;
  description: string | null;
  is_beta: boolean;
  default_value: boolean;
  plans_included: string[] | null;
  price_per_month: number | null;
  sort_order: number;
}

interface CompanyRow {
  id: string;
  name: string;
}

interface OverrideRow {
  company_id: string;
  feature_key: string;
  is_enabled: boolean;
}

interface PlanSlugRow {
  id: string;
  name: string;
  slug: string;
}

const EMPTY_FLAG_FORM: FlagForm = {
  key: "",
  name: "",
  description: "",
  category: "core",
  icon: "Zap",
  is_beta: false,
  default_value: false,
  plans_included: [],
  price_per_month: "",
  sort_order: 0,
};

export default function FeatureFlags() {
  const queryClient = useQueryClient();
  const [dialogFlagKey, setDialogFlagKey] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [flagsSearch, setFlagsSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [bulkConfirm, setBulkConfirm] = useState<{ flagKey: string; flagName: string; value: boolean; enableCount: number; disableCount: number } | null>(null);
  const [rolloutPct, setRolloutPct] = useState<number>(0);
  const [rolloutConfirm, setRolloutConfirm] = useState<{ flagKey: string; pct: number } | null>(null);

  // CRUD state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingFlag, setEditingFlag] = useState<FlagForm>(EMPTY_FLAG_FORM);
  const [deleteConfirmFlag, setDeleteConfirmFlag] = useState<{ id: string; key: string; name: string; overridesCount: number } | null>(null);

  // Fetch flags
  const { data: flags = [], isLoading: flagsLoading } = useQuery<FlagRow[]>({
    queryKey: queryKeys.admin.featureFlags,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_feature_flags")
        .select("id, key, name, icon, category, description, is_beta, default_value, plans_included, price_per_month, sort_order")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as FlagRow[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: companies = [], isLoading: companiesLoading } = useQuery<CompanyRow[]>({
    queryKey: queryKeys.admin.ffCompanies,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return (data ?? []) as CompanyRow[];
    },
    staleTime: 10 * 60 * 1000,
  });

  const { data: plans = [] } = useQuery<PlanSlugRow[]>({
    queryKey: ["admin-plans-slugs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_plans")
        .select("id, name, slug")
        .order("position");
      if (error) throw error;
      return (data ?? []) as PlanSlugRow[];
    },
    staleTime: 10 * 60 * 1000,
  });

  const { data: allOverrides = [] } = useQuery<OverrideRow[]>({
    queryKey: queryKeys.admin.featureOverrides,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_feature_overrides")
        .select("company_id, feature_key, is_enabled");
      if (error) throw error;
      return (data ?? []) as OverrideRow[];
    },
    staleTime: 5 * 60 * 1000,
  });

  // OPTIMIZATION — precompute overrides per-flag map (was O(n) filter per render).
  // allOverrides ha 1 row per (company, flag): con 50 flags × 1000 company =
  // 50k rows max. Scorrere l'array a ogni render per ogni flag è O(flags × overrides).
  // Precomputing in un Map dà O(1) lookup per flag.
  const overridesByFlag = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const o of allOverrides) {
      if (!o.is_enabled) continue;
      if (!m.has(o.feature_key)) m.set(o.feature_key, new Set());
      m.get(o.feature_key)!.add(o.company_id);
    }
    return m;
  }, [allOverrides]);

  // Stats globali — non reagiscono ai filtri di vista
  const globalStats = useMemo(() => {
    const totalFlags = flags.length;
    const activeFlagsWithOverrides = flags.filter((f) => (overridesByFlag.get(f.key)?.size ?? 0) > 0).length;
    const betaFlagsCount = flags.filter((f) => f.is_beta).length;
    const defaultOnCount = flags.filter((f) => f.default_value).length;
    // Avg coverage: media delle % di override attivi su company_count
    const totalCompanies = companies.length;
    const avgCoverage = totalFlags > 0 && totalCompanies > 0
      ? Math.round(
          flags.reduce((s, f) => s + ((overridesByFlag.get(f.key)?.size ?? 0) / totalCompanies) * 100, 0) / totalFlags
        )
      : 0;
    // Count per categoria
    const byCategory = flags.reduce((acc, f) => {
      acc[f.category] = (acc[f.category] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    return { totalFlags, activeFlagsWithOverrides, betaFlagsCount, defaultOnCount, avgCoverage, byCategory };
  }, [flags, overridesByFlag, companies.length]);

  // Toggle default value
  const toggleDefaultMutation = useMutation({
    mutationFn: async ({ flagId, value }: { flagId: string; value: boolean }) => {
      const { error } = await supabase
        .from("platform_feature_flags")
        .update({ default_value: value })
        .eq("id", flagId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.featureFlags });
      queryClient.invalidateQueries({ queryKey: queryKeys.featureFlags.platform });
      toast.success("Default aggiornato");
    },
    onError: () => toast.error("Errore nell'aggiornamento"),
  });

  const toggleOverrideMutation = useMutation({
    mutationFn: async ({ companyId, flagKey, enabled }: { companyId: string; flagKey: string; enabled: boolean }) => {
      const { error } = await supabase
        .from("company_feature_overrides")
        .upsert(
          { company_id: companyId, feature_key: flagKey, is_enabled: enabled },
          { onConflict: "company_id,feature_key" }
        );
      if (error) throw error;
    },
    onSuccess: async (_, vars) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.featureOverrides });
      queryClient.invalidateQueries({ queryKey: queryKeys.featureFlags.companyOverrides(undefined) });
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) {
        await supabase.from("admin_audit_log").insert({
          user_id: session.user.id,
          action: "feature_flag_toggle",
          target_type: "company",
          target_id: vars.companyId,
          details: { feature: vars.flagKey, enabled: vars.enabled },
        });
      }
    },
    onError: () => toast.error("Errore nell'aggiornamento"),
  });

  const bulkOverrideMutation = useMutation({
    mutationFn: async ({ flagKey, enabled }: { flagKey: string; enabled: boolean }) => {
      if (enabled) {
        const rows = companies.map((c) => ({
          company_id: c.id,
          feature_key: flagKey,
          is_enabled: true,
        }));
        const { error } = await supabase
          .from("company_feature_overrides")
          .upsert(rows, { onConflict: "company_id,feature_key" });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("company_feature_overrides")
          .delete()
          .eq("feature_key", flagKey);
        if (error) throw error;
      }
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.featureOverrides });
      queryClient.invalidateQueries({ queryKey: queryKeys.featureFlags.companyOverrides(undefined) });
      toast.success(vars.enabled ? "Attivato per tutte le aziende" : "Override rimossi per tutte le aziende");
    },
    onError: () => toast.error("Errore nell'operazione bulk"),
  });

  const rolloutMutation = useMutation({
    mutationFn: async ({ flagKey, pct }: { flagKey: string; pct: number }) => {
      const count = Math.round((pct / 100) * companies.length);
      const sorted = [...companies].sort((a, b) => a.name.localeCompare(b.name));
      const toEnable = sorted.slice(0, count).map((c) => c.id);
      const toDisable = sorted.slice(count).map((c) => c.id);
      if (toEnable.length > 0) {
        const rows = toEnable.map((id) => ({ company_id: id, feature_key: flagKey, is_enabled: true }));
        const { error } = await supabase
          .from("company_feature_overrides")
          .upsert(rows, { onConflict: "company_id,feature_key" });
        if (error) throw error;
      }
      if (toDisable.length > 0) {
        const { error } = await supabase
          .from("company_feature_overrides")
          .delete()
          .eq("feature_key", flagKey)
          .in("company_id", toDisable);
        if (error) throw error;
      }
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.featureOverrides });
      queryClient.invalidateQueries({ queryKey: queryKeys.featureFlags.companyOverrides(undefined) });
      toast.success(`Rollout applicato: ${vars.pct}% delle aziende`);
      setRolloutConfirm(null);
    },
    onError: () => toast.error("Errore nel rollout"),
  });

  const saveFlagMutation = useMutation({
    mutationFn: async (form: FlagForm) => {
      interface FlagDbRow {
        key: string;
        name: string;
        description: string | null;
        category: string;
        icon: string | null;
        is_beta: boolean;
        default_value: boolean;
        plans_included: string[];
        price_per_month: number | null;
        sort_order: number;
      }
      const payload: FlagDbRow = {
        key: form.key.trim().toLowerCase().replace(/\s+/g, "_"),
        name: form.name.trim(),
        description: form.description.trim() || null,
        category: form.category,
        icon: form.icon || null,
        is_beta: form.is_beta,
        default_value: form.default_value,
        plans_included: form.plans_included,
        price_per_month: form.price_per_month === "" ? null : Number(form.price_per_month),
        sort_order: form.sort_order,
      };
      if (form.id) {
        const { error } = await supabase
          .from("platform_feature_flags")
          .update(payload as never)
          .eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("platform_feature_flags")
          .insert(payload as never);
        if (error) throw error;
      }
    },
    onSuccess: (_, form) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.featureFlags });
      queryClient.invalidateQueries({ queryKey: queryKeys.featureFlags.platform });
      setEditDialogOpen(false);
      toast.success(form.id ? "Feature flag aggiornata" : "Feature flag creata");
    },
    onError: (err: Error) => toast.error(`Errore: ${err.message}`),
  });

  const deleteFlagMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("platform_feature_flags")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.featureFlags });
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.featureOverrides });
      queryClient.invalidateQueries({ queryKey: queryKeys.featureFlags.platform });
      setDeleteConfirmFlag(null);
      toast.success("Feature flag eliminata");
    },
    onError: (err: Error) => toast.error(`Errore: ${err.message}`),
  });

  const openCreateFlag = () => {
    setEditingFlag({ ...EMPTY_FLAG_FORM, sort_order: (flags?.length || 0) + 1 });
    setEditDialogOpen(true);
  };

  const openEditFlag = (flag: FlagRow) => {
    setEditingFlag({
      id: flag.id,
      key: flag.key,
      name: flag.name,
      description: flag.description || "",
      category: flag.category || "core",
      icon: flag.icon || "Zap",
      is_beta: !!flag.is_beta,
      default_value: !!flag.default_value,
      plans_included: Array.isArray(flag.plans_included) ? flag.plans_included : [],
      price_per_month: flag.price_per_month != null ? String(flag.price_per_month) : "",
      sort_order: flag.sort_order ?? 0,
    });
    setEditDialogOpen(true);
  };

  // Filter flags: category + search
  const filteredFlags = useMemo(() => {
    const q = flagsSearch.trim().toLowerCase();
    return flags.filter((f) => {
      if (categoryFilter !== "all" && f.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        f.name.toLowerCase().includes(q) ||
        f.key.toLowerCase().includes(q) ||
        (f.description ?? "").toLowerCase().includes(q)
      );
    });
  }, [flags, categoryFilter, flagsSearch]);

  // Active dialog flag (per-company)
  const activeDialogFlag = useMemo(
    () => flags.find((f) => f.key === dialogFlagKey) ?? null,
    [flags, dialogFlagKey]
  );
  const filteredDialogCompanies = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((c) => c.name.toLowerCase().includes(q));
  }, [companies, searchTerm]);

  const isInitialLoading = flagsLoading || companiesLoading;

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="hidden md:block">
          <h1 className="text-2xl font-bold">Feature Flags</h1>
          <p className="text-muted-foreground">Gestisci moduli e funzionalità disponibili per le aziende.</p>
        </div>
        <Button onClick={openCreateFlag} className="self-end sm:self-auto" disabled={isInitialLoading}>
          <Plus className="h-4 w-4 mr-2" />
          Nuova feature
        </Button>
      </div>

      {/* Global stats KPI */}
      <StatsRow
        loading={isInitialLoading}
        totalFlags={globalStats.totalFlags}
        activeFlagsWithOverrides={globalStats.activeFlagsWithOverrides}
        defaultOnCount={globalStats.defaultOnCount}
        betaFlagsCount={globalStats.betaFlagsCount}
        avgCoverage={globalStats.avgCoverage}
        totalCompanies={companies.length}
      />

      {/* Search + Tabs */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca per nome, key o descrizione…"
            value={flagsSearch}
            onChange={(e) => setFlagsSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <Tabs value={categoryFilter} onValueChange={setCategoryFilter}>
          <TabsList>
            <TabsTrigger value="all">
              Tutti
              {globalStats.totalFlags > 0 && (
                <span className="ml-1.5 rounded bg-muted-foreground/15 px-1.5 text-[10px] font-medium">
                  {globalStats.totalFlags}
                </span>
              )}
            </TabsTrigger>
            {CATEGORY_OPTIONS.map((cat) => (
              <TabsTrigger key={cat} value={cat}>
                {CATEGORY_STYLES[cat].label}
                {(globalStats.byCategory[cat] ?? 0) > 0 && (
                  <span className="ml-1.5 rounded bg-muted-foreground/15 px-1.5 text-[10px] font-medium">
                    {globalStats.byCategory[cat]}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Loading skeleton */}
      {isInitialLoading && (
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-36 rounded-lg" />)}
        </div>
      )}

      {/* Empty state */}
      {!isInitialLoading && flags.length === 0 && (
        <EmptyState onCreate={openCreateFlag} />
      )}

      {/* No results with active filter */}
      {!isInitialLoading && flags.length > 0 && filteredFlags.length === 0 && (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-2 text-center">
            <AlertCircle className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm font-medium">Nessuna feature corrisponde ai filtri</p>
            <p className="text-xs text-muted-foreground">
              {flagsSearch && `"${flagsSearch}" in categoria "${categoryFilter === "all" ? "tutti" : CATEGORY_STYLES[categoryFilter]?.label}"`}
            </p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => { setFlagsSearch(""); setCategoryFilter("all"); }}>
              Reset filtri
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Flag cards */}
      <div className="grid gap-4">
        {!isInitialLoading && filteredFlags.map((flag) => (
          <FlagCard
            key={flag.id}
            flag={flag}
            totalCompanies={companies.length}
            overrideCompanyIds={overridesByFlag.get(flag.key) ?? new Set()}
            onToggleDefault={(value) => toggleDefaultMutation.mutate({ flagId: flag.id, value })}
            toggleDefaultPending={toggleDefaultMutation.isPending}
            onEdit={() => openEditFlag(flag)}
            onDelete={() =>
              setDeleteConfirmFlag({
                id: flag.id,
                key: flag.key,
                name: flag.name,
                overridesCount: overridesByFlag.get(flag.key)?.size ?? 0,
              })
            }
            onManageCompanies={() => {
              const cur = overridesByFlag.get(flag.key)?.size ?? 0;
              setRolloutPct(companies.length > 0 ? Math.round((cur / companies.length) * 100) : 0);
              setDialogFlagKey(flag.key);
            }}
            onBulkToggle={() => {
              const cur = overridesByFlag.get(flag.key)?.size ?? 0;
              const enable = cur < companies.length;
              setBulkConfirm({
                flagKey: flag.key,
                flagName: flag.name,
                value: enable,
                enableCount: enable ? companies.length - cur : 0,
                disableCount: enable ? 0 : cur,
              });
            }}
            bulkPending={bulkOverrideMutation.isPending}
          />
        ))}
      </div>

      {/* ====== SINGLE Per-company dialog (before: N Dialog componenti nel loop) ====== */}
      <Dialog
        open={!!dialogFlagKey}
        onOpenChange={(open) => {
          if (!open) {
            setDialogFlagKey(null);
            setSearchTerm("");
            setRolloutPct(0);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Override aziende — {activeDialogFlag?.name}</DialogTitle>
            <DialogDescription>
              Seleziona le aziende per cui forzare l'attivazione del modulo, oppure usa il rollout percentuale.
            </DialogDescription>
          </DialogHeader>

          {activeDialogFlag && (
            <>
              {/* Rollout slider + input sincronizzati, con preview numerica */}
              <div className="space-y-2 p-3 rounded-lg border bg-muted/30">
                <div className="flex items-center gap-2">
                  <Percent className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium">Rollout graduale</span>
                  <span className="ml-auto text-sm font-bold">{rolloutPct}%</span>
                  <span className="text-xs text-muted-foreground">
                    · {Math.round((rolloutPct / 100) * companies.length)}/{companies.length} az.
                  </span>
                </div>
                <Slider
                  value={[rolloutPct]}
                  min={0}
                  max={100}
                  step={5}
                  onValueChange={(v) => setRolloutPct(v[0] ?? 0)}
                />
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Valore esatto:</span>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={rolloutPct}
                    onChange={(e) => setRolloutPct(Math.max(0, Math.min(100, Number(e.target.value))))}
                    className="w-20 h-7 text-sm"
                  />
                  <Button
                    size="sm"
                    className="ml-auto h-7 text-xs"
                    onClick={() => setRolloutConfirm({ flagKey: activeDialogFlag.key, pct: rolloutPct })}
                    disabled={rolloutMutation.isPending}
                  >
                    Applica rollout
                  </Button>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => bulkOverrideMutation.mutate({ flagKey: activeDialogFlag.key, enabled: true })}
                  disabled={bulkOverrideMutation.isPending}
                >
                  Seleziona tutte
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => bulkOverrideMutation.mutate({ flagKey: activeDialogFlag.key, enabled: false })}
                  disabled={bulkOverrideMutation.isPending}
                >
                  Deseleziona tutte
                </Button>
                <span className="ml-auto text-xs text-muted-foreground flex items-center">
                  {overridesByFlag.get(activeDialogFlag.key)?.size ?? 0} override attivi
                </span>
              </div>

              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cerca azienda..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>

              <div className="max-h-72 overflow-y-auto space-y-1 pr-1">
                {filteredDialogCompanies.map((company) => {
                  const hasOverride = overridesByFlag.get(activeDialogFlag.key)?.has(company.id) ?? false;
                  return (
                    <label
                      key={company.id}
                      className="flex items-center gap-2 rounded-md px-3 py-2 hover:bg-muted cursor-pointer transition-colors"
                    >
                      <Checkbox
                        checked={hasOverride}
                        onCheckedChange={(checked) =>
                          toggleOverrideMutation.mutate({
                            companyId: company.id,
                            flagKey: activeDialogFlag.key,
                            enabled: !!checked,
                          })
                        }
                        disabled={toggleOverrideMutation.isPending}
                      />
                      <span className="text-sm truncate">{company.name}</span>
                    </label>
                  );
                })}
                {filteredDialogCompanies.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">Nessuna azienda trovata.</p>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Rollout confirm */}
      <AlertDialog open={!!rolloutConfirm} onOpenChange={(open) => { if (!open) setRolloutConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma rollout graduale</AlertDialogTitle>
            <AlertDialogDescription>
              Stai per impostare il rollout al <strong>{rolloutConfirm?.pct}%</strong>: <strong>{Math.round(((rolloutConfirm?.pct ?? 0) / 100) * companies.length)}</strong> di <strong>{companies.length}</strong> aziende.
              Le aziende vengono selezionate in ordine alfabetico. Gli override esistenti per questo flag vengono sovrascritti.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => rolloutConfirm && rolloutMutation.mutate({ flagKey: rolloutConfirm.flagKey, pct: rolloutConfirm.pct })}
            >
              Applica rollout {rolloutConfirm?.pct}%
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create/Edit Flag dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingFlag.id ? "Modifica feature" : "Nuova feature"}</DialogTitle>
            <DialogDescription>
              Configura la definizione della feature nel catalogo piattaforma.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="ff-key">Chiave (key) *</Label>
                <Input
                  id="ff-key"
                  placeholder="es. ai_assistant"
                  value={editingFlag.key}
                  onChange={(e) => setEditingFlag({ ...editingFlag, key: e.target.value })}
                  disabled={!!editingFlag.id}
                />
                <p className="text-xs text-muted-foreground">
                  {editingFlag.id ? "Immutabile. Per un'altra key crea una nuova feature." : "snake_case, usata dal codice."}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ff-name">Nome *</Label>
                <Input
                  id="ff-name"
                  placeholder="es. Assistente AI"
                  value={editingFlag.name}
                  onChange={(e) => setEditingFlag({ ...editingFlag, name: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ff-desc">Descrizione</Label>
              <Textarea
                id="ff-desc"
                rows={2}
                placeholder="Descrizione della feature"
                value={editingFlag.description}
                onChange={(e) => setEditingFlag({ ...editingFlag, description: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Categoria</Label>
                <Select
                  value={editingFlag.category}
                  onValueChange={(v) => setEditingFlag({ ...editingFlag, category: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map((c) => (
                      <SelectItem key={c} value={c}>{CATEGORY_STYLES[c]?.label ?? c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Icona</Label>
                <Select
                  value={editingFlag.icon}
                  onValueChange={(v) => setEditingFlag({ ...editingFlag, icon: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ICON_OPTIONS.map((i) => {
                      const IconComp = ICON_MAP[i] ?? Zap;
                      return (
                        <SelectItem key={i} value={i}>
                          <span className="flex items-center gap-2">
                            <IconComp className="h-3.5 w-3.5" />
                            {i}
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ff-price">Prezzo (€/mese)</Label>
                <Input
                  id="ff-price"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="vuoto = incluso"
                  value={editingFlag.price_per_month}
                  onChange={(e) => setEditingFlag({ ...editingFlag, price_per_month: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="ff-sort">Ordine</Label>
                <Input
                  id="ff-sort"
                  type="number"
                  min="0"
                  value={editingFlag.sort_order}
                  onChange={(e) => setEditingFlag({ ...editingFlag, sort_order: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div className="flex items-center justify-between pt-6 rounded-md border px-3">
                <Label htmlFor="ff-beta" className="cursor-pointer">Beta</Label>
                <Switch
                  id="ff-beta"
                  checked={editingFlag.is_beta}
                  onCheckedChange={(v) => setEditingFlag({ ...editingFlag, is_beta: v })}
                />
              </div>
              <div className="flex items-center justify-between pt-6 rounded-md border px-3">
                <Label htmlFor="ff-default" className="cursor-pointer">Default on</Label>
                <Switch
                  id="ff-default"
                  checked={editingFlag.default_value}
                  onCheckedChange={(v) => setEditingFlag({ ...editingFlag, default_value: v })}
                />
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t">
              <Label className="text-base font-semibold">Piani inclusi</Label>
              <p className="text-xs text-muted-foreground">
                Seleziona i piani che includono automaticamente questa feature.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {plans.map((p) => {
                  const checked = editingFlag.plans_included.includes(p.slug);
                  return (
                    <label
                      key={p.id}
                      className="flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer hover:bg-muted"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) =>
                          setEditingFlag({
                            ...editingFlag,
                            plans_included: v
                              ? [...editingFlag.plans_included, p.slug]
                              : editingFlag.plans_included.filter((s) => s !== p.slug),
                          })
                        }
                      />
                      <span className="text-sm font-medium">{p.name}</span>
                      <code className="text-xs text-muted-foreground ml-auto">{p.slug}</code>
                    </label>
                  );
                })}
                {plans.length === 0 && (
                  <p className="text-sm text-muted-foreground col-span-2 text-center py-4">
                    Nessun piano configurato.
                  </p>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Annulla</Button>
            <Button
              onClick={() => saveFlagMutation.mutate(editingFlag)}
              disabled={
                !editingFlag.key.trim() ||
                !editingFlag.name.trim() ||
                saveFlagMutation.isPending
              }
            >
              {saveFlagMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingFlag.id ? "Salva modifiche" : "Crea feature"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteConfirmFlag} onOpenChange={(open) => { if (!open) setDeleteConfirmFlag(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare feature "{deleteConfirmFlag?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Questa azione rimuove permanentemente la feature <code className="mx-1">{deleteConfirmFlag?.key}</code> dal catalogo
              {(deleteConfirmFlag?.overridesCount ?? 0) > 0 && (
                <> e i suoi <strong>{deleteConfirmFlag?.overridesCount}</strong> override aziendali (cascade)</>
              )}.
              Operazione irreversibile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteConfirmFlag && deleteFlagMutation.mutate(deleteConfirmFlag.id)}
            >
              Elimina feature
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk confirm — ora mostra conteggio preciso */}
      <AlertDialog open={!!bulkConfirm} onOpenChange={(open) => { if (!open) setBulkConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma operazione bulk</AlertDialogTitle>
            <AlertDialogDescription>
              {bulkConfirm?.value
                ? <>Stai per <strong>attivare</strong> la feature <strong>{bulkConfirm?.flagName}</strong> per <strong>{bulkConfirm?.enableCount}</strong> aziende aggiuntive.</>
                : <>Stai per <strong>rimuovere</strong> <strong>{bulkConfirm?.disableCount}</strong> override per la feature <strong>{bulkConfirm?.flagName}</strong>. Le aziende torneranno al default.</>
              }
              {" "}Effetto immediato.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (bulkConfirm) {
                  bulkOverrideMutation.mutate({ flagKey: bulkConfirm.flagKey, enabled: bulkConfirm.value });
                  setBulkConfirm(null);
                }
              }}
              className={bulkConfirm?.value ? "" : "bg-destructive text-destructive-foreground hover:bg-destructive/90"}
            >
              {bulkConfirm?.value ? `Attiva per ${bulkConfirm?.enableCount} aziende` : `Rimuovi ${bulkConfirm?.disableCount} override`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// =============================================================================
// COMPONENTI ATOMICI
// =============================================================================

function StatsRow({
  loading, totalFlags, activeFlagsWithOverrides, defaultOnCount, betaFlagsCount,
  avgCoverage, totalCompanies,
}: {
  loading: boolean;
  totalFlags: number;
  activeFlagsWithOverrides: number;
  defaultOnCount: number;
  betaFlagsCount: number;
  avgCoverage: number;
  totalCompanies: number;
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      <StatPill
        icon={<Flag className="h-4 w-4" />}
        label="Feature totali"
        value={totalFlags}
        accent="bg-primary/10 text-primary"
      />
      <StatPill
        icon={<Eye className="h-4 w-4" />}
        label="Default ON"
        value={defaultOnCount}
        subtitle={totalFlags > 0 ? `${Math.round((defaultOnCount / totalFlags) * 100)}% delle feature` : "—"}
        accent="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
      />
      <StatPill
        icon={<Users2 className="h-4 w-4" />}
        label="Con override attivi"
        value={activeFlagsWithOverrides}
        subtitle={totalCompanies > 0 ? `su ${totalCompanies} aziende totali` : "—"}
        accent="bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
      />
      <StatPill
        icon={<Percent className="h-4 w-4" />}
        label="Coverage media"
        value={`${avgCoverage}%`}
        subtitle="Media % override per feature"
        accent="bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300"
      />
      <StatPill
        icon={<Sparkles className="h-4 w-4" />}
        label="Feature Beta"
        value={betaFlagsCount}
        accent="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
      />
    </div>
  );
}

function StatPill({
  icon, label, value, subtitle, accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subtitle?: string;
  accent: string;
}) {
  return (
    <Card>
      <CardContent className="p-3 flex items-start gap-2.5">
        <div className={cn("p-1.5 rounded-lg shrink-0", accent)}>{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide truncate">{label}</p>
          <p className="text-xl font-bold leading-tight mt-0.5">{value}</p>
          {subtitle && <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{subtitle}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <Card>
      <CardContent className="py-16 flex flex-col items-center justify-center text-center gap-4">
        <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Flag className="h-8 w-8 text-primary" />
        </div>
        <div className="max-w-sm">
          <h3 className="text-lg font-semibold">Nessuna feature flag configurata</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Le feature flag permettono di attivare/disattivare moduli selettivamente per azienda o in rollout graduale.
          </p>
        </div>
        <Button onClick={onCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Crea la prima feature
        </Button>
      </CardContent>
    </Card>
  );
}

function FlagCard({
  flag, totalCompanies, overrideCompanyIds,
  onToggleDefault, toggleDefaultPending,
  onEdit, onDelete, onManageCompanies, onBulkToggle, bulkPending,
}: {
  flag: FlagRow;
  totalCompanies: number;
  overrideCompanyIds: Set<string>;
  onToggleDefault: (v: boolean) => void;
  toggleDefaultPending: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onManageCompanies: () => void;
  onBulkToggle: () => void;
  bulkPending: boolean;
}) {
  const IconComp = (flag.icon && ICON_MAP[flag.icon]) || Zap;
  const catStyle = CATEGORY_STYLES[flag.category] || CATEGORY_STYLES.core;
  const activeCount = overrideCompanyIds.size;
  const noneActive = activeCount === 0 && !flag.default_value;
  const StatusIcon = noneActive ? EyeOff : Eye;
  const coveragePct = totalCompanies > 0 ? Math.round((activeCount / totalCompanies) * 100) : 0;
  const allActive = activeCount === totalCompanies && totalCompanies > 0;

  return (
    <Card>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 md:px-6 py-3 border-b bg-muted/40 rounded-t-lg">
        <div className="flex items-center gap-2 flex-wrap">
          <IconComp className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm">{flag.name}</span>
          <code className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">{flag.key}</code>
          <Badge variant="outline" className={`text-xs ${catStyle.className}`}>
            {catStyle.label}
          </Badge>
          {flag.is_beta && (
            <Badge variant="outline" className="text-xs text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-700">
              BETA
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <StatusIcon className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            {activeCount > 0
              ? `Override su ${activeCount}/${totalCompanies}`
              : "Nessun override"}
          </span>
          {totalCompanies > 0 && activeCount > 0 && (
            <span className="flex items-center gap-0.5 font-medium text-primary shrink-0">
              <Percent className="h-3 w-3" />
              {coveragePct}%
            </span>
          )}
        </div>
      </div>

      <CardContent className="pt-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2 flex-1 min-w-0">
            {flag.description && <p className="text-sm text-muted-foreground">{flag.description}</p>}
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Default:</span>
                <Switch
                  checked={flag.default_value}
                  onCheckedChange={onToggleDefault}
                  disabled={toggleDefaultPending}
                />
              </div>
              {flag.plans_included && flag.plans_included.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs text-muted-foreground">Piani:</span>
                  {flag.plans_included.map((p) => (
                    <Badge key={p} variant="secondary" className="text-xs capitalize">{p}</Badge>
                  ))}
                </div>
              )}
              {flag.price_per_month != null && (
                <span className="text-xs text-muted-foreground">€{flag.price_per_month}/mese</span>
              )}
            </div>

            {/* Progress bar coverage (visibile se ci sono override) */}
            {totalCompanies > 0 && activeCount > 0 && (
              <div className="pt-2">
                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${coveragePct}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
            <Button variant="ghost" size="icon" onClick={onEdit} title="Modifica feature">
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onDelete}
              title="Elimina feature"
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={onManageCompanies}>
              Gestisci aziende
            </Button>
            <Button
              size="sm"
              onClick={onBulkToggle}
              disabled={bulkPending || totalCompanies === 0}
              variant={allActive ? "destructive" : "default"}
            >
              {bulkPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
              {allActive ? "Rimuovi override" : "Attiva per tutte"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
