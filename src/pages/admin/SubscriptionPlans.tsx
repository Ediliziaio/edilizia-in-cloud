import { useEffect, useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Edit, Loader2, Package, Users, HardDrive, ClipboardList, Euro, RefreshCw, AlertCircle, Building2, TrendingUp, ExternalLink, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { ALL_MODULES } from "@/lib/adminConstants";
import { useSuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";
import { AccessDenied } from "@/components/admin/AccessDenied";
import { getCompanyMonthlyRevenue, isRevenueEligibleCompany } from "@/lib/adminRevenue";
import { DeletePlanDialog } from "@/components/admin/plan/DeletePlanDialog";
import { useAuth } from "@/contexts/AuthContext";

interface PlanForm {
  name: string;
  slug: string;
  description: string;
  price_monthly: number;
  price_yearly: number;
  max_orders: number;
  trial_days: number;
  max_users: number;
  max_storage_mb: number;
  features: string[];
  is_active: boolean;
  is_full_plan: boolean;
  position: number;
  included_modules: string[];
  stripe_product_id: string;
  stripe_price_monthly_id: string;
  stripe_price_yearly_id: string;
}

const emptyForm: PlanForm = {
  name: "",
  slug: "",
  description: "",
  price_monthly: 0,
  price_yearly: 0,
  max_orders: -1,
  trial_days: 31,
  max_users: -1,
  max_storage_mb: 10240,
  features: [],
  is_active: true,
  // Default false: la sidebar mostra DEMO sui moduli non inclusi.
  // Switch su true SOLO per piani che danno accesso a TUTTI i 7 moduli core
  // (es. starter/pro/enterprise). Per piani parziali (scopri/render/free)
  // tenere false così il cliente vede DEMO sui moduli non inclusi.
  is_full_plan: false,
  position: 0,
  included_modules: ALL_MODULES.map(m => m.key),
  stripe_product_id: "",
  stripe_price_monthly_id: "",
  stripe_price_yearly_id: "",
};

interface PlanUsageStats {
  assignedCompanies: number;
  accessCompanies: number;
  payingCompanies: number;
  complimentaryCompanies: number;
  paidMrr: number;
}

interface DeletePlanTarget {
  id: string;
  name: string;
  slug: string | null;
}

const emptyUsage: PlanUsageStats = {
  assignedCompanies: 0,
  accessCompanies: 0,
  payingCompanies: 0,
  complimentaryCompanies: 0,
  paidMrr: 0,
};

function slugifyPlan(value: string) {
  return value
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseNumberInput(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function validatePlanForm(plan: PlanForm, cleanSlug: string): string[] {
  const errors: string[] = [];
  if (!plan.name.trim()) errors.push("Il nome del piano è obbligatorio.");
  if (!cleanSlug) errors.push("Lo slug del piano è obbligatorio.");
  if (!Number.isFinite(plan.price_monthly) || plan.price_monthly < 0) errors.push("Il prezzo mensile non può essere negativo.");
  if (!Number.isFinite(plan.price_yearly) || plan.price_yearly < 0) errors.push("Il prezzo annuale non può essere negativo.");
  if (!Number.isInteger(plan.max_orders) || plan.max_orders < -1) errors.push("Il limite ordini deve essere -1 oppure un numero positivo.");
  if (!Number.isInteger(plan.max_users) || plan.max_users < -1) errors.push("Il limite utenti deve essere -1 oppure un numero positivo.");
  if (!Number.isInteger(plan.max_storage_mb) || plan.max_storage_mb < 0) errors.push("Lo storage non può essere negativo.");
  if (!Number.isInteger(plan.trial_days) || plan.trial_days < 0 || plan.trial_days > 365) errors.push("Il trial deve essere compreso tra 0 e 365 giorni.");
  if (!Number.isInteger(plan.position) || plan.position < 0) errors.push("La posizione deve essere un numero positivo.");
  if (plan.included_modules.length === 0) errors.push("Seleziona almeno un modulo incluso.");
  return errors;
}

export default function SubscriptionPlans() {
  const { permissions: saPermissions } = useSuperAdminPermissions();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeletePlanTarget | null>(null);
  const [form, setForm] = useState<PlanForm>(emptyForm);
  const [featuresText, setFeaturesText] = useState("");
  // v8.6.77 — tri-state per ogni feature flag (disabled / preview / enabled)
  type PlanFeatureAccess = "disabled" | "preview" | "enabled";
  const [featureDefaults, setFeatureDefaults] = useState<Record<string, PlanFeatureAccess>>({});

  const { data: plans, isLoading, isError, refetch } = useQuery({
    queryKey: ["subscription-plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_plans")
        .select("*")
        .order("position", { ascending: true });
      if (error) throw error;
      return data;
    },
    staleTime: 2 * 60 * 1000,
  });

  // v8.6.77 — Lista flag piattaforma per il selettore tri-state nel dialog
  const { data: platformFlags = [] } = useQuery({
    queryKey: ["platform-feature-flags-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_feature_flags")
        .select("key, name, description, category, is_beta, supports_preview, sort_order")
        .order("category", { ascending: true })
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data as Array<{
        key: string;
        name: string;
        description: string | null;
        category: string | null;
        is_beta: boolean | null;
        supports_preview: boolean | null;
        sort_order: number | null;
      }>;
    },
    staleTime: 10 * 60 * 1000,
  });

  // v8.6.77 — Defaults attuali per il piano in editing
  const { data: existingDefaults = [] } = useQuery({
    queryKey: ["plan-feature-defaults", editingId],
    queryFn: async () => {
      if (!editingId) return [];
      const { data, error } = await supabase
        .from("plan_feature_defaults")
        .select("feature_key, is_enabled, access_level")
        .eq("plan_id", editingId);
      if (error) throw error;
      return data as Array<{ feature_key: string; is_enabled: boolean; access_level: PlanFeatureAccess | null }>;
    },
    enabled: !!editingId && dialogOpen,
  });

  // Sync existingDefaults → featureDefaults state quando arrivano
  useEffect(() => {
    if (!dialogOpen) return;
    const map: Record<string, PlanFeatureAccess> = {};
    platformFlags.forEach(f => { map[f.key] = "disabled"; });
    existingDefaults.forEach(d => {
      map[d.feature_key] = d.access_level ?? (d.is_enabled ? "enabled" : "disabled");
    });
    setFeatureDefaults(map);
  }, [existingDefaults, platformFlags, dialogOpen]);

  const { data: companyCounts } = useQuery({
    queryKey: ["admin-plan-usage"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_plan_company_counts");
      if (error) throw error;
      const counts: Record<string, number> = {};
      data?.forEach((row: { subscription_plan_id: string; company_count: number }) => {
        counts[row.subscription_plan_id] = row.company_count;
      });
      return counts;
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: planRevenue = {} } = useQuery({
    queryKey: ["admin-plan-paid-revenue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, status, payment_method, stripe_customer_id, stripe_subscription_status, is_platform_admin_company, subscription_plan_id, subscription_plans:subscription_plan_id(id, name, price_monthly, price_yearly)")
        .eq("is_platform_admin_company", false)
        .not("subscription_plan_id", "is", null)
        .limit(5000);
      if (error) throw error;

      const usage: Record<string, PlanUsageStats> = {};
      for (const row of data ?? []) {
        const planId = row.subscription_plan_id;
        if (!planId) continue;
        usage[planId] = usage[planId] ?? { ...emptyUsage };
        usage[planId].assignedCompanies += 1;
        if (row.status === "active" || row.status === "trial") {
          usage[planId].accessCompanies += 1;
        }
        if (isRevenueEligibleCompany(row)) {
          usage[planId].payingCompanies += 1;
          usage[planId].paidMrr += getCompanyMonthlyRevenue(row);
        } else if (row.status === "active" && getCompanyMonthlyRevenue(row) > 0) {
          usage[planId].complimentaryCompanies += 1;
        }
      }
      return usage;
    },
    staleTime: 5 * 60 * 1000,
  });

  const stats = useMemo(() => {
    if (!plans) return { totalPlans: 0, activePlans: 0, inactivePlans: 0, subscribedCompanies: 0, payingCompanies: 0, paidMrr: 0 };
    const activePlans = plans.filter((p) => p.is_active).length;
    const inactivePlans = plans.length - activePlans;
    const counts = companyCounts || {};
    const usageRows = Object.values(planRevenue);
    const subscribedCompanies = usageRows.length > 0
      ? usageRows.reduce((sum, row) => sum + row.accessCompanies, 0)
      : Object.values(counts).reduce((s, n) => s + n, 0);
    const payingCompanies = usageRows.reduce((sum, row) => sum + row.payingCompanies, 0);
    const paidMrr = usageRows.reduce((sum, row) => sum + row.paidMrr, 0);
    return { totalPlans: plans.length, activePlans, inactivePlans, subscribedCompanies, payingCompanies, paidMrr };
  }, [plans, companyCounts, planRevenue]);

  const saveMutation = useMutation({
    mutationFn: async (plan: PlanForm & { id?: string }) => {
      if (!saPermissions.can_manage_plans) throw new Error("Non hai i permessi per gestire i piani");
      const cleanName = plan.name.trim();
      const cleanSlug = slugifyPlan(plan.slug || plan.name);
      const validationErrors = validatePlanForm(plan, cleanSlug);
      if (validationErrors.length > 0) throw new Error(validationErrors.join(" "));

      let duplicateSlugQuery = supabase
        .from("subscription_plans")
        .select("id", { count: "exact", head: true })
        .eq("slug", cleanSlug);
      if (plan.id) duplicateSlugQuery = duplicateSlugQuery.neq("id", plan.id);
      const { count: duplicateCount, error: duplicateError } = await duplicateSlugQuery;
      if (duplicateError) throw duplicateError;
      if ((duplicateCount ?? 0) > 0) {
        throw new Error("Esiste già un piano con questo slug. Usa uno slug univoco.");
      }
      // Shape del record da persistere su subscription_plans.
      // Manteniamo il tipo esplicito per evitare `any` e allinearci alla
      // colonna SQL (features JSONB array, included_modules text[] — entrambi
      // accettano string[] lato supabase-js via cast implicito).
      interface PlanDbRow {
        name: string;
        slug: string;
        description: string | null;
        price_monthly: number;
        price_yearly: number;
        max_orders: number;
        trial_days: number;
        max_users: number;
        max_storage_mb: number;
        features: string[];
        is_active: boolean;
        is_full_plan: boolean;
        position: number;
        included_modules: string[];
        stripe_product_id: string | null;
        stripe_price_monthly_id: string | null;
        stripe_price_yearly_id: string | null;
      }
      const payload: PlanDbRow = {
        name: cleanName,
        slug: cleanSlug,
        description: plan.description.trim() || null,
        price_monthly: plan.price_monthly,
        price_yearly: plan.price_yearly,
        max_orders: plan.max_orders,
        trial_days: plan.trial_days,
        max_users: plan.max_users,
        max_storage_mb: plan.max_storage_mb,
        features: plan.features,
        is_active: plan.is_active,
        is_full_plan: plan.is_full_plan,
        position: plan.position,
        included_modules: plan.included_modules,
        stripe_product_id: plan.stripe_product_id || null,
        stripe_price_monthly_id: plan.stripe_price_monthly_id || null,
        stripe_price_yearly_id: plan.stripe_price_yearly_id || null,
      };

      if (plan.id) {
        // Cast su `never`: il tipo generato di supabase-js per update()
        // è unione discriminata di tutte le tabelle → qui specializziamo al
        // nostro payload senza ricorrere ad `any`.
        const { error } = await supabase
          .from("subscription_plans")
          .update(payload as never)
          .eq("id", plan.id);
        if (error) throw error;
        if (user?.id) {
          await supabase.from("admin_audit_log").insert({
            user_id: user.id,
            action: "subscription_plan_update",
            target_type: "subscription_plan",
            target_id: plan.id,
            details: {
              plan_name: cleanName,
              slug: cleanSlug,
              price_monthly: payload.price_monthly,
              price_yearly: payload.price_yearly,
              max_orders: payload.max_orders,
              max_users: payload.max_users,
              max_storage_mb: payload.max_storage_mb,
              trial_days: payload.trial_days,
              included_modules_count: payload.included_modules.length,
              is_full_plan: payload.is_full_plan,
              source: "admin_plans_list",
            },
          });
        }
      } else {
        const { data: created, error } = await supabase
          .from("subscription_plans")
          .insert(payload as never)
          .select("id")
          .single();
        if (error) throw error;
        if (user?.id && created?.id) {
          await supabase.from("admin_audit_log").insert({
            user_id: user.id,
            action: "subscription_plan_create",
            target_type: "subscription_plan",
            target_id: created.id,
            details: {
              plan_name: cleanName,
              slug: cleanSlug,
              price_monthly: payload.price_monthly,
              price_yearly: payload.price_yearly,
              max_orders: payload.max_orders,
              max_users: payload.max_users,
              max_storage_mb: payload.max_storage_mb,
              trial_days: payload.trial_days,
              included_modules_count: payload.included_modules.length,
              is_full_plan: payload.is_full_plan,
              source: "admin_plans_list",
            },
          });
        }
        // v8.6.77 — Salva feature_defaults per il nuovo piano
        if (created?.id) {
          const planId = created.id as string;
          await syncPlanFeatureDefaults(planId);
        }
      }

      // v8.6.77 — In edit: sync feature_defaults dopo update piano
      if (editingId) {
        await syncPlanFeatureDefaults(editingId);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscription-plans"] });
      queryClient.invalidateQueries({ queryKey: ["admin-plan-usage"] });
      queryClient.invalidateQueries({ queryKey: ["admin-plan-paid-revenue"] });
      queryClient.invalidateQueries({ queryKey: ["admin-plan-detail", editingId] });
      setDialogOpen(false);
      toast({ title: editingId ? "Piano aggiornato" : "Piano creato" });
    },
    onError: (error) => {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    },
  });

  // v8.6.77 — Upsert plan_feature_defaults per ogni flag piattaforma con
  // l'access_level scelto nel dialog. is_enabled tenuto allineato via trigger DB.
  async function syncPlanFeatureDefaults(planId: string) {
    const rows = Object.entries(featureDefaults).map(([feature_key, access_level]) => ({
      plan_id: planId,
      feature_key,
      access_level,
      is_enabled: access_level === "enabled",
    }));
    if (rows.length === 0) return;
    // upsert con onConflict (plan_id, feature_key) — chiave unica naturale
    const { error } = await supabase
      .from("plan_feature_defaults")
      .upsert(rows as never, { onConflict: "plan_id,feature_key" } as never);
    if (error) console.warn("syncPlanFeatureDefaults error:", error.message);
  }

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      if (!saPermissions.can_manage_plans) throw new Error("Non hai i permessi per gestire i piani");
      const { error } = await supabase.from("subscription_plans").update({ is_active }).eq("id", id);
      if (error) throw error;
      if (user?.id) {
        await supabase.from("admin_audit_log").insert({
          user_id: user.id,
          action: is_active ? "subscription_plan_activate" : "subscription_plan_deactivate",
          target_type: "subscription_plan",
          target_id: id,
          details: { is_active, source: "admin_plans_list" },
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscription-plans"] });
      queryClient.invalidateQueries({ queryKey: ["admin-plan-paid-revenue"] });
      queryClient.invalidateQueries({ queryKey: ["admin-plan-detail"] });
      toast({ title: "Stato aggiornato" });
    },
    onError: (error) => {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    },
  });

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm, position: (plans?.length || 0) + 1 });
    setFeaturesText("");
    setDialogOpen(true);
  };

  // Auto-open edit dialog from ?edit=<id>
  useEffect(() => {
    const editId = searchParams.get("edit");
    if (editId && plans?.length && !dialogOpen) {
      const target = plans.find((p) => p.id === editId);
      if (target) {
        openEdit(target);
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.delete("edit");
          return next;
        }, { replace: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plans, searchParams]);

  const openEdit = (plan: NonNullable<typeof plans>[0]) => {
    setEditingId(plan.id);
    const features = Array.isArray(plan.features) ? (plan.features as string[]) : [];
    setForm({
      name: plan.name,
      slug: plan.slug,
      description: plan.description || "",
      price_monthly: plan.price_monthly,
      price_yearly: plan.price_yearly,
      max_orders: plan.max_orders,
      trial_days: plan.trial_days ?? 31,
      max_users: plan.max_users,
      max_storage_mb: plan.max_storage_mb,
      features,
      is_active: plan.is_active,
      // is_full_plan può essere mancante in DB pre-migration → default false
      // (sidebar mostra DEMO sui moduli non inclusi; safer default).
      is_full_plan: (plan as { is_full_plan?: boolean }).is_full_plan === true,
      position: plan.position,
      included_modules: Array.isArray(plan.included_modules) ? (plan.included_modules as string[]) : ALL_MODULES.map(m => m.key),
      stripe_product_id: plan.stripe_product_id || "",
      stripe_price_monthly_id: plan.stripe_price_monthly_id || "",
      stripe_price_yearly_id: plan.stripe_price_yearly_id || "",
    });
    setFeaturesText(features.join("\n"));
    setDialogOpen(true);
  };

  const handleNameChange = (name: string) => {
    setForm((prev) => {
      const previousAutoSlug = slugifyPlan(prev.name);
      const shouldRefreshSlug = !editingId && (!prev.slug || prev.slug === previousAutoSlug);
      return {
        ...prev,
        name,
        slug: shouldRefreshSlug ? slugifyPlan(name) : prev.slug,
      };
    });
  };

  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false);
  const [pendingSave, setPendingSave] = useState<(PlanForm & { id?: string }) | null>(null);

  const handleSave = () => {
    const cleanSlug = slugifyPlan(form.slug || form.name);
    const validationErrors = validatePlanForm(form, cleanSlug);
    if (validationErrors.length > 0) {
      toast({
        title: "Controlla i dati del piano",
        description: validationErrors[0],
        variant: "destructive",
      });
      return;
    }
    const features = featuresText.split("\n").map((f) => f.trim()).filter(Boolean);
    const payload = { ...form, slug: cleanSlug, features, id: editingId || undefined };

    // If editing an existing plan with active companies, show confirmation
    const usageCount = editingId ? (companyCounts?.[editingId] ?? 0) : 0;
    if (editingId && usageCount > 0) {
      setPendingSave(payload);
      setConfirmSaveOpen(true);
    } else {
      saveMutation.mutate(payload);
    }
  };

  // `displayLimit` è la versione con glifo ∞ usata nelle card; la variante
  // "Illimitati" testuale era duplicata e non referenziata — rimossa per
  // restare in linea con §8 (no dead code).
  const displayLimit = (val: number) => val === -1 ? '∞ Illimitati' : val.toString();
  const displayStorage = (mb: number) => mb >= 1024 ? `${Math.round(mb / 1024)} GB` : `${mb} MB`;

  if (!saPermissions.can_manage_plans) return <AccessDenied />;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Piani Tariffari</h1>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>Errore nel caricamento dei piani tariffari.</span>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-3 w-3 mr-1" />
              Riprova
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Piani Tariffari</h1>
          <p className="text-muted-foreground">Gestisci i piani di abbonamento della piattaforma</p>
        </div>
        <Button onClick={openCreate} className="self-end sm:self-auto">
          <Plus className="h-4 w-4 mr-2" />
          Nuovo Piano
        </Button>
      </div>

      {/* Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Piani Attivi</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activePlans}</div>
            <p className="text-xs text-muted-foreground">{stats.inactivePlans} disattivi su {stats.totalPlans} totali</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Aziende con accesso</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.subscribedCompanies}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Aziende paganti</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.payingCompanies}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">MRR pagante</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.paidMrr)}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {plans?.length === 0 && (
          <Card className="md:col-span-2 lg:col-span-3">
            <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <Package className="h-10 w-10 text-muted-foreground" />
              <div>
                <h2 className="font-semibold">Nessun piano configurato</h2>
                <p className="text-sm text-muted-foreground">Crea il primo piano tariffario per abilitarlo in piattaforma.</p>
              </div>
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4 mr-2" />
                Nuovo Piano
              </Button>
            </CardContent>
          </Card>
        )}
        {plans?.map((plan) => {
          const features = Array.isArray(plan.features) ? (plan.features as string[]) : [];
          const usage: PlanUsageStats = {
            ...emptyUsage,
            assignedCompanies: companyCounts?.[plan.id] ?? 0,
            ...(planRevenue[plan.id] ?? {}),
          };
          return (
            <Card key={plan.id} className={`relative ${!plan.is_active ? "opacity-60" : ""}`}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl">{plan.name}</CardTitle>
                  <Badge variant={plan.is_active ? "default" : "secondary"}>
                    {plan.is_active ? "Attivo" : "Disattivo"}
                  </Badge>
                  {plan.price_monthly === 0 && (
                    <Badge variant="outline" className="border-green-500 text-green-600">Gratis</Badge>
                  )}
                </div>
                <CardDescription>{plan.description || plan.slug}</CardDescription>
                {usage.assignedCompanies > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <Badge variant="secondary" className="w-fit gap-1">
                      <Building2 className="h-3 w-3" />
                      {usage.assignedCompanies} assegnate
                    </Badge>
                    <Badge variant={usage.payingCompanies > 0 ? "default" : "outline"} className="w-fit gap-1">
                      <Users className="h-3 w-3" />
                      {usage.payingCompanies} paganti
                    </Badge>
                    {usage.complimentaryCompanies > 0 && (
                      <Badge variant="outline" className="w-fit text-amber-700 border-amber-300">
                        {usage.complimentaryCompanies} accessi non paganti
                      </Badge>
                    )}
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Prices */}
                <div className="flex items-baseline gap-1">
                  <Euro className="h-4 w-4 text-muted-foreground" />
                  <span className="text-3xl font-bold">{formatCurrency(plan.price_monthly)}</span>
                  <span className="text-muted-foreground">/mese</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {formatCurrency(plan.price_yearly)}/anno
                </p>
                {usage.assignedCompanies > 0 && (
                  <p className="text-xs text-muted-foreground">
                    MRR pagante del piano: <span className="font-medium text-foreground">{formatCurrency(usage.paidMrr)}</span>
                  </p>
                )}

                {/* Limits */}
                <div className="space-y-2 pt-2 border-t">
                  <div className="flex items-center gap-2 text-sm">
                    <ClipboardList className="h-4 w-4 text-muted-foreground" />
                    <span>{displayLimit(plan.max_orders)} ordini</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span>{displayLimit(plan.max_users)} utenti</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <HardDrive className="h-4 w-4 text-muted-foreground" />
                    <span>{displayStorage(plan.max_storage_mb)} storage</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <RefreshCw className="h-4 w-4 text-muted-foreground" />
                    <span>{(plan.trial_days ?? 31) === 0 ? "Per sempre (no scadenza)" : `${plan.trial_days ?? 31} giorni trial`}</span>
                  </div>
                </div>

                {/* Included Modules */}
                <div className="flex flex-wrap gap-1.5 pt-2 border-t">
                {ALL_MODULES.map((mod) => {
                    const modules = plan.included_modules as string[] | null;
                    const included = Array.isArray(modules) && modules.includes(mod.key);
                    return (
                      <Badge key={mod.key} variant={included ? "default" : "outline"} className="text-xs gap-1">
                        <mod.icon className="h-3 w-3" />
                        {mod.label}
                      </Badge>
                    );
                  })}
                </div>

                {/* Features */}
                {features.length > 0 && (
                  <div className="space-y-1 pt-2 border-t">
                    {features.map((f, i) => (
                      <p key={i} className="text-sm flex items-center gap-2">
                        <span className="text-primary">✓</span> {f}
                      </p>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-2 border-t flex-wrap">
                  <Button variant="default" size="sm" className="flex-1 min-w-[110px]" onClick={() => navigate(`/admin/piani/${plan.id}`)}>
                    <ExternalLink className="h-3 w-3 mr-1" />
                    Dettaglio
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1 min-w-[110px]" onClick={() => openEdit(plan)}>
                    <Edit className="h-3 w-3 mr-1" />
                    Modifica
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 min-w-[110px]"
                    disabled={toggleActiveMutation.isPending}
                    onClick={() => toggleActiveMutation.mutate({ id: plan.id, is_active: !plan.is_active })}
                  >
                    {plan.is_active ? "Disattiva" : "Attiva"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 min-w-[110px] border-destructive/30 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                    onClick={() => setDeleteTarget({ id: plan.id, name: plan.name, slug: plan.slug })}
                  >
                    <Trash2 className="h-3 w-3 mr-1" />
                    Elimina
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Dialog Create/Edit */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Modifica Piano" : "Nuovo Piano"}</DialogTitle>
            <DialogDescription>Configura i dettagli del piano tariffario</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input value={form.name} onChange={(e) => handleNameChange(e.target.value)} placeholder="Es. Pro" />
              </div>
              <div className="space-y-2">
                <Label>Slug *</Label>
                <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: slugifyPlan(e.target.value) })} placeholder="Es. pro" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Descrizione</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Descrizione del piano" />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Prezzo Mensile (€)</Label>
                <Input type="number" min="0" step="0.01" value={form.price_monthly} onChange={(e) => setForm({ ...form, price_monthly: parseNumberInput(e.target.value, 0) })} />
              </div>
              <div className="space-y-2">
                <Label>Prezzo Annuale (€)</Label>
                <Input type="number" min="0" step="0.01" value={form.price_yearly} onChange={(e) => setForm({ ...form, price_yearly: parseNumberInput(e.target.value, 0) })} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Max Ordini (-1 = illimitati)</Label>
                <Input type="number" value={form.max_orders} onChange={(e) => setForm({ ...form, max_orders: parseNumberInput(e.target.value, -1) })} />
              </div>
              <div className="space-y-2">
                <Label>Max Utenti (-1 = illimitati)</Label>
                <Input type="number" value={form.max_users} onChange={(e) => setForm({ ...form, max_users: parseNumberInput(e.target.value, -1) })} />
              </div>
              <div className="space-y-2">
                <Label>Max Storage (MB)</Label>
                <Input type="number" value={form.max_storage_mb} onChange={(e) => setForm({ ...form, max_storage_mb: parseNumberInput(e.target.value, 500) })} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Giorni di Trial</Label>
                <Input type="number" min="0" max="365" value={form.trial_days} onChange={(e) => setForm({ ...form, trial_days: parseNumberInput(e.target.value, 0) })} />
                <p className="text-xs text-muted-foreground">Giorni di prova gratuita per nuove aziende</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Features (una per riga)</Label>
              <Textarea value={featuresText} onChange={(e) => setFeaturesText(e.target.value)} placeholder={"Gestione ordini\nSupporto prioritario\nReport avanzati"} rows={4} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Posizione</Label>
                <Input type="number" min="0" value={form.position} onChange={(e) => setForm({ ...form, position: parseNumberInput(e.target.value, 0) })} />
              </div>
              <div className="flex items-center gap-3 pt-6">
                <Switch checked={form.is_active} onCheckedChange={(checked) => setForm({ ...form, is_active: checked })} />
                <Label>Piano attivo</Label>
              </div>
            </div>

            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="flex items-start gap-3">
                <Switch
                  checked={form.is_full_plan}
                  onCheckedChange={(checked) => setForm({ ...form, is_full_plan: checked })}
                />
                <div className="space-y-1">
                  <Label className="text-sm font-semibold cursor-pointer">
                    Piano completo (full plan)
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Attivo → la sidebar del cliente mostra tutti i moduli core <strong>senza badge DEMO</strong> (consigliato per starter / pro / enterprise).
                    Disattivo → i moduli NON in &quot;Moduli inclusi&quot; sotto appaiono con badge <strong>DEMO</strong> (consigliato per scopri / pacchetti / piani parziali → upselling).
                  </p>
                </div>
              </div>
            </div>

            {/* Moduli inclusi */}
            <div className="space-y-3 pt-2 border-t">
              <Label className="text-base font-semibold">Moduli inclusi nel piano</Label>
              <div className="grid gap-3 sm:grid-cols-2">
                {ALL_MODULES.map((mod) => (
                  <div key={mod.key} className="flex items-center justify-between rounded-lg border p-3">
                    <div className="flex items-center gap-2">
                      <mod.icon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{mod.label}</span>
                    </div>
                    <Switch
                      checked={form.included_modules.includes(mod.key)}
                      onCheckedChange={(checked) => {
                        setForm({
                          ...form,
                          included_modules: checked
                            ? [...form.included_modules, mod.key]
                            : form.included_modules.filter((k) => k !== mod.key),
                        });
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* v8.6.77 — Feature flags granulari con tri-state.
                Per ogni feature: Off (disabled) | Demo (preview UI bloccata) | On (enabled).
                Una company sottoscrivendo questo piano eredita questi defaults
                (sovrascrivibili poi da override per singola company). */}
            <div className="space-y-3 pt-2 border-t">
              <div>
                <Label className="text-base font-semibold">Funzioni del piano (tri-state)</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Per ogni funzione: <strong>Off</strong> nascosta · <strong>Demo</strong> UI demo
                  con click bloccato · <strong>On</strong> uso pieno.
                </p>
              </div>
              {platformFlags.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nessun flag piattaforma configurato.</p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto rounded-lg border p-2">
                  {(() => {
                    // Raggruppa per categoria per leggibilità
                    const byCategory: Record<string, typeof platformFlags> = {};
                    platformFlags.forEach(f => {
                      const cat = f.category || "Altro";
                      if (!byCategory[cat]) byCategory[cat] = [];
                      byCategory[cat].push(f);
                    });
                    return Object.entries(byCategory).map(([cat, flags]) => (
                      <div key={cat} className="space-y-1">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-2 pt-2">
                          {cat}
                        </p>
                        {flags.map((flag) => {
                          const current = featureDefaults[flag.key] ?? "disabled";
                          const supportsPreview = flag.supports_preview ?? true;
                          return (
                            <div key={flag.key} className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium truncate">{flag.name}</span>
                                  {flag.is_beta && <Badge variant="outline" className="text-[9px] h-4 px-1 text-amber-600 border-amber-300">BETA</Badge>}
                                </div>
                                {flag.description && <p className="text-xs text-muted-foreground truncate">{flag.description}</p>}
                              </div>
                              <div className="inline-flex rounded-md border bg-background p-0.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => setFeatureDefaults(prev => ({ ...prev, [flag.key]: "disabled" }))}
                                  className={`px-2 py-0.5 text-[11px] rounded-sm transition-colors ${
                                    current === "disabled" ? "bg-slate-200 text-slate-900 font-medium" : "text-muted-foreground hover:text-foreground"
                                  }`}
                                >Off</button>
                                <button
                                  type="button"
                                  disabled={!supportsPreview}
                                  title={!supportsPreview ? "Questa funzione consuma API a pagamento — niente demo gratis" : "Modalità demo: UI visibile ma azioni bloccate"}
                                  onClick={() => setFeatureDefaults(prev => ({ ...prev, [flag.key]: "preview" }))}
                                  className={`px-2 py-0.5 text-[11px] rounded-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                                    current === "preview" ? "bg-amber-200 text-amber-900 font-medium" : "text-muted-foreground hover:text-foreground"
                                  }`}
                                >Demo</button>
                                <button
                                  type="button"
                                  onClick={() => setFeatureDefaults(prev => ({ ...prev, [flag.key]: "enabled" }))}
                                  className={`px-2 py-0.5 text-[11px] rounded-sm transition-colors ${
                                    current === "enabled" ? "bg-emerald-200 text-emerald-900 font-medium" : "text-muted-foreground hover:text-foreground"
                                  }`}
                                >On</button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ));
                  })()}
                </div>
              )}
            </div>

            {/* Stripe IDs - hidden for now but editable */}
            <details className="pt-2">
              <summary className="text-sm text-muted-foreground cursor-pointer">Configurazione Stripe (opzionale)</summary>
              <div className="grid gap-4 mt-3">
                <div className="space-y-2">
                  <Label>Stripe Product ID</Label>
                  <Input value={form.stripe_product_id} onChange={(e) => setForm({ ...form, stripe_product_id: e.target.value })} placeholder="prod_..." />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Stripe Price Monthly ID</Label>
                    <Input value={form.stripe_price_monthly_id} onChange={(e) => setForm({ ...form, stripe_price_monthly_id: e.target.value })} placeholder="price_..." />
                  </div>
                  <div className="space-y-2">
                    <Label>Stripe Price Yearly ID</Label>
                    <Input value={form.stripe_price_yearly_id} onChange={(e) => setForm({ ...form, stripe_price_yearly_id: e.target.value })} placeholder="price_..." />
                  </div>
                </div>
              </div>
            </details>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annulla</Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingId ? "Salva Modifiche" : "Crea Piano"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm save for plan with active companies */}
      <AlertDialog open={confirmSaveOpen} onOpenChange={setConfirmSaveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma modifica piano</AlertDialogTitle>
            <AlertDialogDescription>
              Questo piano è attualmente usato da{" "}
              <strong>{editingId ? (companyCounts?.[editingId] ?? 0) : 0} aziende</strong>.
              Le modifiche ai limiti e ai prezzi avranno effetto immediato su tutte.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingSave(null)}>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (pendingSave) saveMutation.mutate(pendingSave); setPendingSave(null); setConfirmSaveOpen(false); }}>
              Conferma modifica
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DeletePlanDialog
        open={!!deleteTarget}
        plan={deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      />
    </div>
  );
}
