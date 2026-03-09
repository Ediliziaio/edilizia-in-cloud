import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Package, ClipboardList, Users, CheckCircle, XCircle, ArrowUpRight, Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { ALL_MODULES } from "@/lib/adminConstants";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CompanyAddonsSection } from "./CompanyAddonsSection";
import type { Company } from "@/types/auth";

interface CompanySaaSTabProps {
  currentPlan: any;
  stats: { ordersCount: number; customersCount: number } | null;
  includedModules: string[];
  plans: any[] | undefined;
  companyPlanId: string | null | undefined;
  companyId?: string;
  company?: Company | null;
}

export function CompanySaaSTab({ currentPlan, stats, includedModules, plans, companyPlanId, companyId, company }: CompanySaaSTabProps) {
  const queryClient = useQueryClient();
  const maxOrders = currentPlan?.max_orders ?? -1;
  const maxUsers = currentPlan?.max_users ?? -1;
  const ordersPercent = maxOrders === -1 ? 0 : Math.min(100, ((stats?.ordersCount || 0) / maxOrders) * 100);
  const usersPercent = maxUsers === -1 ? 0 : Math.min(100, ((stats?.customersCount || 0) / maxUsers) * 100);

  // Feature flags
  const { data: flags = [], isLoading: flagsLoading } = useQuery({
    queryKey: ["platform-feature-flags"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_feature_flags")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: overrides = [], isLoading: overridesLoading } = useQuery({
    queryKey: ["company-feature-overrides", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_feature_overrides")
        .select("*")
        .eq("company_id", companyId!);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  const toggleOverrideMutation = useMutation({
    mutationFn: async ({ flagKey, enabled }: { flagKey: string; enabled: boolean }) => {
      if (enabled) {
        const { error } = await supabase
          .from("company_feature_overrides")
          .upsert(
            { company_id: companyId!, feature_key: flagKey, is_enabled: true },
            { onConflict: "company_id,feature_key" }
          );
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("company_feature_overrides")
          .delete()
          .eq("company_id", companyId!)
          .eq("feature_key", flagKey);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-feature-overrides", companyId] });
      queryClient.invalidateQueries({ queryKey: ["admin-all-overrides"] });
      toast.success("Feature flag aggiornato");
    },
    onError: () => toast.error("Errore nell'aggiornamento"),
  });

  const getOverrideForFlag = (key: string) =>
    overrides.find((o: any) => o.feature_key === key);

  const getFlagSource = (flag: any): { enabled: boolean; source: string } => {
    const override = getOverrideForFlag(flag.key);
    const overrideValid = override && (!override.expires_at || new Date(override.expires_at) > new Date());
    if (overrideValid) return { enabled: override.is_enabled, source: "Override" };
    if (flag.plans_included?.length > 0 && currentPlan?.name && flag.plans_included.includes(currentPlan.name.toLowerCase())) {
      return { enabled: true, source: "Piano" };
    }
    return { enabled: flag.default_value, source: "Default" };
  };

  return (
    <div className="space-y-6">
      {/* Addon a Pagamento */}
      {company && <CompanyAddonsSection company={company} />}

      {/* Piano e limiti */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Package className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Piano Attuale</p>
                <p className="text-xl font-bold">{currentPlan?.name || "Nessuno"}</p>
              </div>
            </div>
            {currentPlan && (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Mensile</span>
                  <span className="font-semibold">{formatCurrency(currentPlan.price_monthly)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Annuale</span>
                  <span className="font-semibold">{formatCurrency(currentPlan.price_yearly)}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <ClipboardList className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Ordini</p>
                <p className="text-xl font-bold">{stats?.ordersCount || 0} <span className="text-sm font-normal text-muted-foreground">/ {maxOrders === -1 ? "∞" : maxOrders}</span></p>
              </div>
            </div>
            <Progress value={maxOrders === -1 ? 0 : ordersPercent} className="h-2" />
            <p className="text-xs text-muted-foreground mt-2">
              {maxOrders === -1 ? "Illimitati" : `${Math.max(0, maxOrders - (stats?.ordersCount || 0))} rimanenti`}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-lg bg-violet-500/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-violet-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Utenti</p>
                <p className="text-xl font-bold">{stats?.customersCount || 0} <span className="text-sm font-normal text-muted-foreground">/ {maxUsers === -1 ? "∞" : maxUsers}</span></p>
              </div>
            </div>
            <Progress value={maxUsers === -1 ? 0 : usersPercent} className="h-2" />
            <p className="text-xs text-muted-foreground mt-2">
              {maxUsers === -1 ? "Illimitati" : `${Math.max(0, maxUsers - (stats?.customersCount || 0))} rimanenti`}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Moduli */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Moduli Inclusi</CardTitle>
          <CardDescription>Funzionalità disponibili nel piano attuale</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {ALL_MODULES.map((mod) => {
              const enabled = includedModules.includes(mod.key);
              return (
                <div
                  key={mod.key}
                  className={`flex items-start gap-3 rounded-xl border p-4 transition-colors ${enabled ? "border-primary/30 bg-primary/5" : "opacity-40 border-dashed"}`}
                >
                  <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${enabled ? "bg-primary/10" : "bg-muted"}`}>
                    <mod.icon className={`h-5 w-5 ${enabled ? "text-primary" : "text-muted-foreground"}`} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{mod.label}</span>
                      {enabled ? <CheckCircle className="h-3.5 w-3.5 text-primary" /> : <XCircle className="h-3.5 w-3.5 text-muted-foreground" />}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{mod.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Feature Flags */}
      {companyId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Feature Flags</CardTitle>
            <CardDescription>Override delle funzionalità per questa azienda</CardDescription>
          </CardHeader>
          <CardContent>
            {flagsLoading || overridesLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-3">
                {flags.map((flag: any) => {
                  const { enabled, source } = getFlagSource(flag);
                  const hasOverride = !!getOverrideForFlag(flag.key);
                  const sourceBadgeClass =
                    source === "Override"
                      ? "bg-primary/10 text-primary"
                      : source === "Piano"
                        ? "bg-blue-500/10 text-blue-600"
                        : "bg-muted text-muted-foreground";

                  return (
                    <div
                      key={flag.id}
                      className={`flex items-center justify-between rounded-lg border p-3 transition-colors ${
                        enabled ? "border-primary/20 bg-primary/5" : ""
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`h-8 w-8 rounded-md flex items-center justify-center ${enabled ? "bg-primary/10" : "bg-muted"}`}>
                          {enabled ? (
                            <CheckCircle className="h-4 w-4 text-primary" />
                          ) : (
                            <XCircle className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{flag.name}</span>
                            {flag.is_beta && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-amber-600 border-amber-300">
                                BETA
                              </Badge>
                            )}
                            <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${sourceBadgeClass}`}>
                              {source}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">{flag.description}</p>
                        </div>
                      </div>
                      <Switch
                        checked={hasOverride ? enabled : false}
                        onCheckedChange={(checked) =>
                          toggleOverrideMutation.mutate({ flagKey: flag.key, enabled: checked })
                        }
                        disabled={toggleOverrideMutation.isPending}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Confronto piani */}
      {plans && plans.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ArrowUpRight className="h-4 w-4 text-primary" />
              Confronto Piani
            </CardTitle>
            <CardDescription>Piani disponibili per upgrade</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {plans.map((plan) => {
                const isCurrent = plan.id === companyPlanId;
                return (
                  <div key={plan.id} className={`rounded-xl border p-4 space-y-3 ${isCurrent ? "border-primary bg-primary/5 ring-1 ring-primary/20" : ""}`}>
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold">{plan.name}</h4>
                      {isCurrent && <Badge variant="default" className="text-xs">Attuale</Badge>}
                    </div>
                    <p className="text-2xl font-bold">{formatCurrency(plan.price_monthly)}<span className="text-sm font-normal text-muted-foreground">/mese</span></p>
                    <div className="space-y-1.5 text-sm">
                      <div className="flex justify-between"><span className="text-muted-foreground">Ordini</span><span className="font-medium">{plan.max_orders === -1 ? "∞" : plan.max_orders}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Utenti</span><span className="font-medium">{plan.max_users === -1 ? "∞" : plan.max_users}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Storage</span><span className="font-medium">{plan.max_storage_mb} MB</span></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
