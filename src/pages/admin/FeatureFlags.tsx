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
import { Loader2, Search, Eye, EyeOff, Bot, MessageCircle, BarChart3, MessageSquare, Cpu, Mail, Zap, Percent, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

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

// Shape della riga di `platform_feature_flags` con le colonne realmente
// selezionate dalla query catalogo sotto. Tenerla qui evita di dover
// `any`-izzare i callback (.map/.filter) in tutta la pagina.
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
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [bulkConfirm, setBulkConfirm] = useState<{ flagKey: string; value: boolean; count: number } | null>(null);
  const [rolloutPct, setRolloutPct] = useState<number>(0);
  const [rolloutConfirm, setRolloutConfirm] = useState<{ flagKey: string; pct: number } | null>(null);

  // CRUD state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingFlag, setEditingFlag] = useState<FlagForm>(EMPTY_FLAG_FORM);
  const [deleteConfirmFlag, setDeleteConfirmFlag] = useState<{ id: string; key: string; name: string } | null>(null);

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

  // Fetch companies
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

  // Fetch plans for plans_included selector
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

  // Fetch all overrides
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

  // Toggle per-company override
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
      toast.success("Override aggiornato");
      // Audit log for feature flag toggle
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

  // Bulk override
  const bulkOverrideMutation = useMutation({
    mutationFn: async ({ flagKey, enabled }: { flagKey: string; enabled: boolean }) => {
      if (enabled) {
        // Single batch upsert for all companies — atomic, no partial state
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
        // Delete all overrides for this flag
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

  // Rollout percentage mutation: enable for top N% of companies (sorted by name, deterministic)
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

  // Save flag (insert/update)
  const saveFlagMutation = useMutation({
    mutationFn: async (form: FlagForm) => {
      // Shape esatta della riga da persistere; evita il cast ad `any`
      // sul payload e guida l'autocompletamento nei consumer.
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

  // Delete flag
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

  const filteredFlags = flags.filter((f) =>
    categoryFilter === "all" || f.category === categoryFilter
  );

  if (flagsLoading || companiesLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="hidden md:block">
          <h1 className="text-2xl font-bold">Feature Flags</h1>
          <p className="text-muted-foreground">Gestisci i moduli e le funzionalità disponibili per le aziende.</p>
        </div>
        <Button onClick={openCreateFlag} className="self-end sm:self-auto">
          <Plus className="h-4 w-4 mr-2" />
          Nuova feature
        </Button>
      </div>

      <Tabs value={categoryFilter} onValueChange={setCategoryFilter}>
        <TabsList>
          <TabsTrigger value="all">Tutti</TabsTrigger>
          <TabsTrigger value="core">Core</TabsTrigger>
          <TabsTrigger value="addon">Addon</TabsTrigger>
          <TabsTrigger value="beta">Beta</TabsTrigger>
          <TabsTrigger value="enterprise">Enterprise</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid gap-4">
        {filteredFlags.map((flag) => {
          const IconComp = (flag.icon && ICON_MAP[flag.icon]) || Zap;
          const catStyle = CATEGORY_STYLES[flag.category] || CATEGORY_STYLES.core;
          const flagOverrides = allOverrides.filter((o) => o.feature_key === flag.key && o.is_enabled);
          const activeCount = flagOverrides.length;
          const noneActive = activeCount === 0 && !flag.default_value;
          const StatusIcon = noneActive ? EyeOff : Eye;

          return (
            <Card key={flag.id}>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 md:px-6 py-3 border-b bg-muted/40 rounded-t-lg">
                <div className="flex items-center gap-2 flex-wrap">
                  <IconComp className="h-4 w-4 text-primary" />
                  <span className="font-semibold text-sm">{flag.name}</span>
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
                      ? `Override su ${activeCount}/${companies.length}`
                      : "Nessun override"}
                  </span>
                  {companies.length > 0 && activeCount > 0 && (
                    <span className="flex items-center gap-0.5 font-medium text-primary shrink-0">
                      <Percent className="h-3 w-3" />
                      {Math.round((activeCount / companies.length) * 100)}%
                    </span>
                  )}
                </div>
              </div>

              <CardContent className="pt-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2 flex-1">
                    <p className="text-sm text-muted-foreground">{flag.description}</p>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Default:</span>
                        <Switch
                          checked={flag.default_value}
                          onCheckedChange={(v) => toggleDefaultMutation.mutate({ flagId: flag.id, value: v })}
                          disabled={toggleDefaultMutation.isPending}
                        />
                      </div>
                      {flag.plans_included?.length > 0 && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-muted-foreground">Piani:</span>
                          {flag.plans_included.map((p: string) => (
                            <Badge key={p} variant="secondary" className="text-xs capitalize">{p}</Badge>
                          ))}
                        </div>
                      )}
                      {flag.price_per_month != null && (
                        <span className="text-xs text-muted-foreground">€{flag.price_per_month}/mese</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEditFlag(flag)}
                      title="Modifica feature"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteConfirmFlag({ id: flag.id, key: flag.key, name: flag.name })}
                      title="Elimina feature"
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const cur = allOverrides.filter((o) => o.feature_key === flag.key && o.is_enabled).length;
                        setRolloutPct(companies.length > 0 ? Math.round((cur / companies.length) * 100) : 0);
                        setDialogFlagKey(flag.key);
                      }}
                    >
                      Gestisci aziende
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => setBulkConfirm({ flagKey: flag.key, value: activeCount < companies.length, count: companies.length })}
                      disabled={bulkOverrideMutation.isPending}
                      variant={activeCount === companies.length ? "destructive" : "default"}
                    >
                      {bulkOverrideMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                      {activeCount === companies.length ? "Rimuovi override" : "Attiva per tutte"}
                    </Button>
                  </div>
                </div>
              </CardContent>

              {/* Per-company dialog */}
              <Dialog open={dialogFlagKey === flag.key} onOpenChange={(open) => { if (!open) { setDialogFlagKey(null); setSearchTerm(""); setRolloutPct(0); } }}>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Override aziende — {flag.name}</DialogTitle>
                    <DialogDescription>Seleziona le aziende per cui forzare l'attivazione del modulo.</DialogDescription>
                  </DialogHeader>

                  <div className="relative mb-2">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Cerca azienda..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9 h-9"
                    />
                  </div>

                  {/* Rollout percentage */}
                  <div className="flex items-center gap-2 mb-3 p-2.5 rounded-lg border bg-muted/30">
                    <Percent className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-xs text-muted-foreground">Rollout:</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={rolloutPct}
                      onChange={(e) => setRolloutPct(Math.max(0, Math.min(100, Number(e.target.value))))}
                      className="w-16 h-7 text-sm border rounded px-2 bg-background"
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                    <span className="text-xs text-muted-foreground ml-1">
                      ≈ {Math.round((rolloutPct / 100) * companies.length)} az.
                    </span>
                    <Button
                      size="sm"
                      className="ml-auto h-7 text-xs"
                      onClick={() => setRolloutConfirm({ flagKey: flag.key, pct: rolloutPct })}
                      disabled={rolloutMutation.isPending}
                    >
                      Applica
                    </Button>
                  </div>

                  <div className="flex gap-2 mb-3">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => bulkOverrideMutation.mutate({ flagKey: flag.key, enabled: true })}
                      disabled={bulkOverrideMutation.isPending}
                    >
                      Seleziona tutte
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => bulkOverrideMutation.mutate({ flagKey: flag.key, enabled: false })}
                      disabled={bulkOverrideMutation.isPending}
                    >
                      Deseleziona tutte
                    </Button>
                  </div>

                  <div className="max-h-72 overflow-y-auto space-y-1 pr-1">
                    {companies
                      .filter((c) => c.name.toLowerCase().includes(searchTerm.toLowerCase()))
                      .map((company) => {
                        const hasOverride = allOverrides.some(
                          (o) => o.company_id === company.id && o.feature_key === flag.key && o.is_enabled
                        );
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
                                  flagKey: flag.key,
                                  enabled: !!checked,
                                })
                              }
                              disabled={toggleOverrideMutation.isPending}
                            />
                            <span className="text-sm truncate">{company.name}</span>
                          </label>
                        );
                      })}
                    {companies.filter((c) => c.name.toLowerCase().includes(searchTerm.toLowerCase())).length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">Nessuna azienda trovata.</p>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            </Card>
          );
        })}
      </div>

      {/* Rollout confirm dialog */}
      <AlertDialog open={!!rolloutConfirm} onOpenChange={(open) => { if (!open) setRolloutConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma rollout graduale</AlertDialogTitle>
            <AlertDialogDescription>
              Stai per impostare il rollout al <strong>{rolloutConfirm?.pct}%</strong> ({Math.round(((rolloutConfirm?.pct ?? 0) / 100) * companies.length)} di {companies.length} aziende).
              Le aziende vengono selezionate in ordine alfabetico. Questa azione sovrascrive gli override esistenti per questo flag.
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
                <p className="text-xs text-muted-foreground">snake_case, immutabile dopo la creazione</p>
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
                    {ICON_OPTIONS.map((i) => (
                      <SelectItem key={i} value={i}>{i}</SelectItem>
                    ))}
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
                  placeholder="vuoto = nessun prezzo"
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

      {/* Delete confirm dialog */}
      <AlertDialog open={!!deleteConfirmFlag} onOpenChange={(open) => { if (!open) setDeleteConfirmFlag(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare feature "{deleteConfirmFlag?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Questa azione rimuove permanentemente la definizione della feature
              <code className="mx-1">{deleteConfirmFlag?.key}</code>
              dal catalogo e tutti gli override aziendali collegati (cascade). Operazione irreversibile.
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

      {/* Bulk confirm dialog */}
      <AlertDialog open={!!bulkConfirm} onOpenChange={(open) => { if (!open) setBulkConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma operazione bulk</AlertDialogTitle>
            <AlertDialogDescription>
              {bulkConfirm?.value
                ? `Stai per attivare l'override per tutte le ${bulkConfirm?.count} aziende.`
                : `Stai per rimuovere tutti gli override per questo flag.`}
              {" "}Questa azione avrà effetto immediato.
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
              {bulkConfirm?.value ? "Attiva per tutte" : "Rimuovi tutti gli override"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
