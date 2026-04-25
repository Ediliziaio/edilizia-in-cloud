import { useMemo, useState } from "react";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Package, ClipboardList, Users, CheckCircle, XCircle, ArrowUpRight, Loader2,
  Search, RotateCcw, ExternalLink,
} from "lucide-react";
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
  /** Callback per navigare ad altro tab (es. "abbonamento") */
  onNavigateToTab?: (tab: string) => void;
}

export function CompanySaaSTab({
  currentPlan, stats, includedModules, plans, companyPlanId,
  companyId, company, onNavigateToTab,
}: CompanySaaSTabProps) {
  const queryClient = useQueryClient();
  const [flagSearch, setFlagSearch] = useState("");
  const [resetAllOpen, setResetAllOpen] = useState(false);

  const { data: storageData } = useQuery({
    queryKey: ['company-storage', companyId],
    queryFn: async () => {
      const [ordersRes, customersRes] = await Promise.all([
        supabase.from('orders').select('id', { count: 'exact', head: true }).eq('company_id', companyId),
        supabase.from('customers').select('id', { count: 'exact', head: true }).eq('company_id', companyId),
      ]);
      let storageMb = 0;
      let fileCount = 0;
      try {
        const filesRes = await supabase.storage.from('company-files').list(companyId!, { limit: 1000 });
        if (filesRes.data) {
          fileCount = filesRes.data.length;
          storageMb = filesRes.data.reduce(
            (sum: number, f: { metadata?: { size?: number } }) =>
              sum + ((f.metadata?.size ?? 0) / 1024 / 1024),
            0
          );
        }
      } catch {
        // Ignora errori storage (bucket potrebbe non esistere)
      }
      return {
        ordersCount: ordersRes.count ?? 0,
        customersCount: customersRes.count ?? 0,
        fileCount,
        storageMb: Math.round(storageMb * 10) / 10,
      };
    },
    staleTime: 10 * 60 * 1000,
    enabled: !!companyId,
  });

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

  // Filtro flags per ricerca
  const filteredFlags = useMemo(() => {
    const q = flagSearch.trim().toLowerCase();
    if (!q) return flags;
    return flags.filter(
      (f: any) =>
        (f.name ?? "").toLowerCase().includes(q) ||
        (f.key ?? "").toLowerCase().includes(q) ||
        (f.description ?? "").toLowerCase().includes(q),
    );
  }, [flags, flagSearch]);

  // Reset bulk di tutti gli override per questa azienda
  const resetAllOverridesMutation = useMutation({
    mutationFn: async () => {
      if (!companyId || overrides.length === 0) return;
      const { error } = await supabase
        .from("company_feature_overrides")
        .delete()
        .eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-feature-overrides", companyId] });
      queryClient.invalidateQueries({ queryKey: ["admin-all-overrides"] });
      toast.success(`Reset di ${overrides.length} override completato`);
      setResetAllOpen(false);
    },
    onError: (e: Error) =>
      toast.error("Errore durante il reset", { description: e.message }),
  });

  // Storage limit dinamico dal piano (fallback 500 MB se non specificato)
  const storageLimitMb: number = currentPlan?.max_storage_mb ?? 500;

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
              <div className="flex-1 min-w-0">
                <p className="text-sm text-muted-foreground">Piano Attuale</p>
                <p className="text-xl font-bold truncate">{currentPlan?.name || "Nessuno"}</p>
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
            {onNavigateToTab && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full mt-3 h-8 text-xs"
                onClick={() => onNavigateToTab("abbonamento")}
              >
                Gestisci abbonamento
                <ExternalLink className="h-3 w-3 ml-1.5" />
              </Button>
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
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div>
                <CardTitle className="text-base">Feature Flags</CardTitle>
                <CardDescription>
                  Override delle funzionalità per questa azienda
                  {overrides.length > 0 && (
                    <>
                      {" "}— <strong>{overrides.length}</strong> attiv
                      {overrides.length === 1 ? "o" : "i"}
                    </>
                  )}
                </CardDescription>
              </div>
              {overrides.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setResetAllOpen(true)}
                  className="h-8 text-xs"
                  disabled={resetAllOverridesMutation.isPending}
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                  Reset tutti gli override
                </Button>
              )}
            </div>
            {/* Search box visibile solo con >5 flags */}
            {flags.length > 5 && (
              <div className="relative mt-2">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Cerca feature flag..."
                  value={flagSearch}
                  onChange={(e) => setFlagSearch(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>
            )}
          </CardHeader>
          <CardContent>
            {flagsLoading || overridesLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filteredFlags.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                {flagSearch
                  ? `Nessuna flag corrisponde a "${flagSearch}"`
                  : "Nessuna feature flag configurata"}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredFlags.map((flag: any) => {
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
                              <Badge variant="outline" className="text-xs px-1.5 py-0 text-amber-600 border-amber-300">
                                BETA
                              </Badge>
                            )}
                            <Badge variant="secondary" className={`text-xs px-1.5 py-0 ${sourceBadgeClass}`}>
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

      {/* Utilizzo Dati & Storage */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Utilizzo Dati & Storage</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Ordini/Commesse</p>
              <p className="text-lg font-bold">
                {(storageData?.ordersCount ?? 0).toLocaleString('it-IT')}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Clienti</p>
              <p className="text-lg font-bold">
                {(storageData?.customersCount ?? 0).toLocaleString('it-IT')}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">File caricati</p>
              <p className="text-lg font-bold">{storageData?.fileCount ?? 0}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Storage usato</p>
              <p className="text-lg font-bold">{storageData?.storageMb ?? 0} MB</p>
              {/* Threshold dinamico: 80% del limite del piano */}
              {(storageData?.storageMb ?? 0) > storageLimitMb * 0.8 && (
                <Badge variant="destructive" className="text-xs mt-1">
                  Vicino al limite ({storageLimitMb} MB)
                </Badge>
              )}
            </div>
          </div>
          {(storageData?.storageMb ?? 0) > 0 && (
            <div>
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>Storage</span>
                <span>
                  {storageData?.storageMb} / {storageLimitMb} MB
                </span>
              </div>
              <Progress
                value={Math.min(
                  ((storageData?.storageMb ?? 0) / storageLimitMb) * 100,
                  100,
                )}
                className="h-2"
              />
            </div>
          )}
        </CardContent>
      </Card>

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

      {/* Conferma reset bulk override */}
      <AlertDialog open={resetAllOpen} onOpenChange={setResetAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Reset di {overrides.length} override?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Tutti gli override locali per questa azienda verranno rimossi. Le feature
              flags torneranno al comportamento del piano (o al default).
              <br />
              <strong className="text-foreground">Operazione irreversibile.</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetAllOverridesMutation.isPending}>
              Annulla
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              disabled={resetAllOverridesMutation.isPending}
              onClick={() => resetAllOverridesMutation.mutate()}
            >
              {resetAllOverridesMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset tutti
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
