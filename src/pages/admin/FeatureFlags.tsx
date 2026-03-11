import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Search, Eye, EyeOff, Bot, MessageCircle, BarChart3, MessageSquare, Cpu, Mail, Zap } from "lucide-react";
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

export default function FeatureFlags() {
  const queryClient = useQueryClient();
  const [dialogFlagKey, setDialogFlagKey] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [bulkConfirm, setBulkConfirm] = useState<{ flagKey: string; value: boolean; count: number } | null>(null);

  // Fetch flags
  const { data: flags = [], isLoading: flagsLoading } = useQuery({
    queryKey: ["admin-feature-flags"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_feature_flags")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  // Fetch companies
  const { data: companies = [], isLoading: companiesLoading } = useQuery({
    queryKey: ["admin-ff-companies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Fetch all overrides
  const { data: allOverrides = [] } = useQuery({
    queryKey: ["admin-all-overrides"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_feature_overrides")
        .select("*");
      if (error) throw error;
      return data;
    },
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
      queryClient.invalidateQueries({ queryKey: ["admin-feature-flags"] });
      queryClient.invalidateQueries({ queryKey: ["platform-feature-flags"] });
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-all-overrides"] });
      queryClient.invalidateQueries({ queryKey: ["company-feature-overrides"] });
      toast.success("Override aggiornato");
    },
    onError: () => toast.error("Errore nell'aggiornamento"),
  });

  // Bulk override
  const bulkOverrideMutation = useMutation({
    mutationFn: async ({ flagKey, enabled }: { flagKey: string; enabled: boolean }) => {
      if (enabled) {
        // Upsert overrides for all companies
        const rows = companies.map((c) => ({
          company_id: c.id,
          feature_key: flagKey,
          is_enabled: true,
        }));
        for (const row of rows) {
          const { error } = await supabase
            .from("company_feature_overrides")
            .upsert(row, { onConflict: "company_id,feature_key" });
          if (error) throw error;
        }
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
      queryClient.invalidateQueries({ queryKey: ["admin-all-overrides"] });
      queryClient.invalidateQueries({ queryKey: ["company-feature-overrides"] });
      toast.success(vars.enabled ? "Attivato per tutte le aziende" : "Override rimossi per tutte le aziende");
    },
    onError: () => toast.error("Errore nell'operazione bulk"),
  });

  const filteredFlags = flags.filter((f: any) =>
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Feature Flags</h1>
        <p className="text-muted-foreground">Gestisci i moduli e le funzionalità disponibili per le aziende.</p>
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
        {filteredFlags.map((flag: any) => {
          const IconComp = ICON_MAP[flag.icon] || Zap;
          const catStyle = CATEGORY_STYLES[flag.category] || CATEGORY_STYLES.core;
          const flagOverrides = allOverrides.filter((o: any) => o.feature_key === flag.key && o.is_enabled);
          const activeCount = flagOverrides.length;
          const noneActive = activeCount === 0 && !flag.default_value;
          const StatusIcon = noneActive ? EyeOff : Eye;

          return (
            <Card key={flag.id}>
              <div className="flex items-center justify-between px-6 py-3 border-b bg-muted/40 rounded-t-lg">
                <div className="flex items-center gap-2">
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
                  <StatusIcon className="h-3.5 w-3.5" />
                  <span>
                    {activeCount > 0
                      ? `Override attivo su ${activeCount}/${companies.length} aziende`
                      : "Nessun override"}
                  </span>
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

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDialogFlagKey(flag.key)}
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
              <Dialog open={dialogFlagKey === flag.key} onOpenChange={(open) => { if (!open) { setDialogFlagKey(null); setSearchTerm(""); } }}>
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
                      .filter((c: any) => c.name.toLowerCase().includes(searchTerm.toLowerCase()))
                      .map((company: any) => {
                        const hasOverride = allOverrides.some(
                          (o: any) => o.company_id === company.id && o.feature_key === flag.key && o.is_enabled
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
                    {companies.filter((c: any) => c.name.toLowerCase().includes(searchTerm.toLowerCase())).length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">Nessuna azienda trovata.</p>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            </Card>
          );
        })}
      </div>

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
