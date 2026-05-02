import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useSuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";
import { AccessDenied } from "@/components/admin/AccessDenied";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import {
  ArrowLeft,
  Building2,
  ClipboardList,
  Copy,
  Edit,
  Euro,
  HardDrive,
  Loader2,
  Package,
  RefreshCw,
  Trash2,
  Users,
  Zap,
} from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { ALL_MODULES } from "@/lib/adminConstants";
import { useState } from "react";
import { PlanFeatureDefaultsCard } from "@/components/admin/plan/PlanFeatureDefaultsCard";
import { DeletePlanDialog } from "@/components/admin/plan/DeletePlanDialog";
import { useAuth } from "@/contexts/AuthContext";

export default function PlanDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { permissions: saPermissions } = useSuperAdminPermissions();
  const { user } = useAuth();
  const [duplicateConfirmOpen, setDuplicateConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const { data: plan, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-plan-detail", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("subscription_plans")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
    staleTime: 60 * 1000,
  });

  const { data: companyCount } = useQuery({
    queryKey: ["admin-plan-company-count", id],
    queryFn: async () => {
      if (!id) return 0;
      const { count, error } = await supabase
        .from("companies")
        .select("id", { count: "exact", head: true })
        .eq("subscription_plan_id", id);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!id,
    staleTime: 60 * 1000,
  });

  // Shape della lista legacy feature_flags per slug piano — serve solo a
  // renderizzare la card "plans_included" sotto. I campi sono esattamente
  // quelli selezionati: nessun allargamento opportunistico a `any`.
  interface LegacyPlanFeature {
    id: string;
    key: string;
    name: string;
    description: string | null;
    category: string;
    is_beta: boolean;
    default_value: boolean;
    plans_included: string[];
    price_per_month: number | null;
    icon: string | null;
    sort_order: number;
  }

  const { data: features = [] } = useQuery<LegacyPlanFeature[]>({
    queryKey: ["admin-plan-features", plan?.slug],
    queryFn: async () => {
      if (!plan?.slug) return [];
      const { data, error } = await supabase
        .from("platform_feature_flags")
        .select("id, key, name, description, category, is_beta, default_value, plans_included, price_per_month, icon, sort_order")
        .contains("plans_included", [plan.slug])
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as LegacyPlanFeature[];
    },
    enabled: !!plan?.slug,
    staleTime: 2 * 60 * 1000,
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async (is_active: boolean) => {
      if (!id) throw new Error("ID piano mancante");
      if (!saPermissions.can_manage_plans) throw new Error("Non hai i permessi per gestire i piani");
      const { error } = await supabase
        .from("subscription_plans")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
      if (user?.id) {
        await supabase.from("admin_audit_log").insert({
          user_id: user.id,
          action: is_active ? "subscription_plan_activate" : "subscription_plan_deactivate",
          target_type: "subscription_plan",
          target_id: id,
          details: {
            plan_name: plan?.name ?? null,
            slug: plan?.slug ?? null,
            is_active,
            source: "admin_plan_detail",
          },
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-plan-detail", id] });
      queryClient.invalidateQueries({ queryKey: ["subscription-plans"] });
      toast({ title: "Stato aggiornato" });
    },
    onError: (err: Error) => toast({ title: "Errore", description: err.message, variant: "destructive" }),
  });

  const duplicatePlanMutation = useMutation({
    mutationFn: async () => {
      if (!plan) throw new Error("Piano non caricato");
      if (!saPermissions.can_manage_plans) throw new Error("Non hai i permessi per gestire i piani");
      // `plan` è tipato dal generato di supabase-js (subscription_plans row).
      // Escludiamo i campi auto-generati; il resto è copiato 1:1 e poi
      // sovrascriviamo i campi che devono differire nella copia.
      const {
        id: _id,
        created_at: _c,
        ...rest
      } = plan;
      // Silence unused destructuring warnings: questi campi vengono esclusi
      // di proposito dal payload di insert.
      void _id;
      void _c;
      const payload = {
        ...rest,
        name: `${plan.name} (copia)`,
        slug: `${plan.slug}-copia-${Date.now().toString(36)}`,
        is_active: false,
        stripe_product_id: null,
        stripe_price_monthly_id: null,
        stripe_price_yearly_id: null,
      };
      const { data, error } = await supabase
        .from("subscription_plans")
        .insert(payload as never)
        .select("id")
        .single();
      if (error) throw error;
      if (user?.id && data?.id) {
        await supabase.from("admin_audit_log").insert({
          user_id: user.id,
          action: "subscription_plan_duplicate",
          target_type: "subscription_plan",
          target_id: data.id,
          details: {
            source_plan_id: plan.id,
            source_plan_name: plan.name,
            new_plan_name: payload.name,
            new_slug: payload.slug,
            source: "admin_plan_detail",
          },
        });
      }
      return data;
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["subscription-plans"] });
      toast({ title: "Piano duplicato" });
      setDuplicateConfirmOpen(false);
      if (created?.id) navigate(`/admin/piani/${created.id}`);
    },
    onError: (err: Error) => toast({ title: "Errore", description: err.message, variant: "destructive" }),
  });

  const displayLimit = (val: number) => (val === -1 ? "∞ Illimitati" : val.toString());
  const displayStorage = (mb: number) => (mb >= 1024 ? `${Math.round(mb / 1024)} GB` : `${mb} MB`);

  const planFeatures = useMemo(() => {
    return Array.isArray(plan?.features) ? (plan!.features as string[]) : [];
  }, [plan]);

  const includedModules = useMemo(() => {
    return Array.isArray(plan?.included_modules) ? (plan!.included_modules as string[]) : [];
  }, [plan]);

  if (!saPermissions.can_manage_plans) return <AccessDenied />;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !plan) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => navigate("/admin/piani")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Torna ai piani
        </Button>
        <Alert variant="destructive">
          <RefreshCw className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>Piano non trovato o errore nel caricamento.</span>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Riprova
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Button variant="ghost" onClick={() => navigate("/admin/piani")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Torna ai piani
        </Button>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/admin/piani?edit=${plan.id}`)}
          >
            <Edit className="h-4 w-4 mr-1.5" />
            Modifica
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => toggleActiveMutation.mutate(!plan.is_active)}
            disabled={toggleActiveMutation.isPending}
          >
            {plan.is_active ? "Disattiva" : "Attiva"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDuplicateConfirmOpen(true)}
            disabled={duplicatePlanMutation.isPending}
          >
            <Copy className="h-4 w-4 mr-1.5" />
            Duplica
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="border-destructive/30 text-destructive hover:bg-destructive hover:text-destructive-foreground"
            onClick={() => setDeleteConfirmOpen(true)}
          >
            <Trash2 className="h-4 w-4 mr-1.5" />
            Elimina
          </Button>
        </div>
      </div>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Package className="h-6 w-6 text-primary" />
            {plan.name}
          </h1>
          <p className="text-muted-foreground">{plan.description || plan.slug}</p>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <Badge variant={plan.is_active ? "default" : "secondary"}>
              {plan.is_active ? "Attivo" : "Disattivo"}
            </Badge>
            <code className="text-xs bg-muted px-2 py-0.5 rounded">{plan.slug}</code>
            {plan.price_monthly === 0 && (
              <Badge variant="outline" className="border-green-500 text-green-600">Gratis</Badge>
            )}
            {(companyCount ?? 0) > 0 && (
              <Badge variant="secondary" className="gap-1">
                <Building2 className="h-3 w-3" />
                {companyCount} aziende
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Euro className="h-4 w-4 text-muted-foreground" />
              Prezzo mensile
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(plan.price_monthly)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {formatCurrency(plan.price_yearly)}/anno
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-muted-foreground" />
              Trial
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(plan.trial_days ?? 0) === 0 ? "Illimitato" : `${plan.trial_days} giorni`}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Package className="h-4 w-4 text-muted-foreground" />
              Posizione
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{plan.position}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Limiti del piano</CardTitle>
          <CardDescription>Vincoli applicati alle aziende abbonate</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex items-center gap-2 text-sm rounded-lg border p-3">
              <ClipboardList className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="text-xs text-muted-foreground">Ordini</div>
                <div className="font-semibold">{displayLimit(plan.max_orders)}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm rounded-lg border p-3">
              <Users className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="text-xs text-muted-foreground">Utenti</div>
                <div className="font-semibold">{displayLimit(plan.max_users)}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm rounded-lg border p-3">
              <HardDrive className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="text-xs text-muted-foreground">Storage</div>
                <div className="font-semibold">{displayStorage(plan.max_storage_mb)}</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Moduli inclusi</CardTitle>
          <CardDescription>Aree funzionali abilitate di default</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {ALL_MODULES.map((mod) => {
              const included = includedModules.includes(mod.key);
              return (
                <Badge key={mod.key} variant={included ? "default" : "outline"} className="gap-1">
                  <mod.icon className="h-3 w-3" />
                  {mod.label}
                </Badge>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {planFeatures.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Bullet features</CardTitle>
            <CardDescription>Caratteristiche mostrate nella pagina prezzi</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {planFeatures.map((f, i) => (
              <p key={i} className="text-sm flex items-center gap-2">
                <span className="text-primary">✓</span> {f}
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Editor default per-piano (plan_feature_defaults): toggle/limit/credits per ogni feature */}
      <PlanFeatureDefaultsCard
        planId={plan.id}
        planSlug={plan.slug}
        planName={plan.name}
      />

      {/* Legacy: elenco feature legacy da plans_included[] — mantenuto per compat, mostrato solo se ci sono righe */}
      {features.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4 text-muted-foreground" />
              Feature flags legacy (plans_included[])
            </CardTitle>
            <CardDescription>
              Lista derivata dall'array <code>plans_included</code> su
              <code> platform_feature_flags</code>. La tabella sopra è la sorgente
              autoritativa; questa vista serve solo per riferimento.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {features.map((f) => (
                <div key={f.id} className="flex items-start justify-between gap-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{f.name}</span>
                      <code className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        {f.key}
                      </code>
                      {f.is_beta && (
                        <Badge variant="outline" className="text-xs border-amber-300 text-amber-700">
                          BETA
                        </Badge>
                      )}
                    </div>
                    {f.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{f.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {f.price_per_month != null && (
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        €{f.price_per_month}/mese
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate(`/admin/feature-flags`)}
                    >
                      Catalogo
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={duplicateConfirmOpen} onOpenChange={setDuplicateConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Duplicare il piano "{plan.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Sarà creata una copia disattiva con slug univoco. Potrai rinominarla e modificarla
              prima di attivarla. Gli ID Stripe non vengono copiati.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => duplicatePlanMutation.mutate()}
              disabled={duplicatePlanMutation.isPending}
            >
              {duplicatePlanMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Duplica piano
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DeletePlanDialog
        open={deleteConfirmOpen}
        plan={{ id: plan.id, name: plan.name, slug: plan.slug }}
        onOpenChange={setDeleteConfirmOpen}
        onDeleted={() => navigate("/admin/piani")}
      />
    </div>
  );
}
