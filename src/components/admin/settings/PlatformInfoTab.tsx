import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Users, ShoppingCart, Server, Wrench } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { LucideIcon } from "lucide-react";

function StatCard({ icon: Icon, label, value, loading }: { icon: LucideIcon; label: string; value: number; loading: boolean }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-6">
        <div className="rounded-lg bg-primary/10 p-3"><Icon className="h-6 w-6 text-primary" /></div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold">{loading ? "..." : value.toLocaleString("it-IT")}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function MaintenanceCard({
  settings, isLoading, onToggle, isSaving,
}: {
  settings: Record<string, { value: string }> | undefined;
  isLoading: boolean;
  onToggle: (value: boolean) => void;
  isSaving: boolean;
}) {
  const isActive = settings?.["maintenance_mode"]?.value === "true";

  return (
    <>
      {isActive && (
        <Alert variant="destructive">
          <AlertDescription>
            🔧 La piattaforma è attualmente in <strong>modalità manutenzione</strong>. Gli utenti vedono una pagina di manutenzione.
          </AlertDescription>
        </Alert>
      )}
      <Card>
        <CardContent className="flex items-center justify-between p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-orange-100 dark:bg-orange-900/30 p-2">
              <Wrench className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <p className="text-sm font-medium">Modalità manutenzione</p>
              <p className="text-xs text-muted-foreground">
                Mostra una pagina di manutenzione a tutti gli utenti non-admin
              </p>
            </div>
          </div>
          <Switch
            checked={isActive}
            onCheckedChange={(v) => onToggle(v)}
            disabled={isSaving || isLoading}
          />
        </CardContent>
      </Card>
    </>
  );
}

function SiteUrlCard({
  settings, isLoading, onSave, isSaving,
}: {
  settings: Record<string, { value: string; masked?: string }> | undefined;
  isLoading: boolean;
  onSave: (updates: Record<string, string>) => void;
  isSaving: boolean;
}) {
  const [value, setValue] = useState("");
  const current = settings?.["site_url"];

  const handleSave = () => {
    if (!value.trim()) return;
    onSave({ site_url: value.trim() });
    setValue("");
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Server className="h-5 w-5 text-primary" />
          <CardTitle>URL Applicazione</CardTitle>
        </div>
        <CardDescription className="flex items-center gap-1">
          URL pubblico dell'app
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                URL pubblico dell'applicazione, usato per generare link inviti admin e link firma offerte nelle email.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">URL Applicazione</label>
          <Input
            placeholder={current?.value || "https://app.example.com"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          {current?.value && !value && (
            <p className="text-xs text-muted-foreground">Valore attuale: {current.value}</p>
          )}
        </div>
        <Button onClick={handleSave} disabled={isSaving || !value.trim()}>
          {isSaving ? "Salvataggio..." : "Salva"}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function PlatformInfoTab() {
  const queryClient = useQueryClient();

  const { data: stats, isLoading } = useQuery({
    queryKey: queryKeys.admin.platformStats,
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("manage-super-admins", {
        body: { action: "stats" },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw new Error(res.error.message);
      return res.data as { totalCompanies: number; totalUsers: number; totalOrders: number };
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: queryKeys.admin.platformSettings,
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("manage-super-admins", {
        body: { action: "get-settings" },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw new Error(res.error.message);
      return res.data?.settings as Record<string, { value: string; masked?: string }> | undefined;
    },
    staleTime: 60 * 1000,
  });

  const saveMutation = useMutation({
    mutationFn: async (updates: Record<string, string>) => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("manage-super-admins", {
        body: { action: "update-settings", settings: updates },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw new Error(res.error.message);
      return res.data;
    },
    onSuccess: () => {
      toast.success("Configurazione salvata");
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.platformSettings });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Building2} label="Aziende registrate" value={stats?.totalCompanies || 0} loading={isLoading} />
        <StatCard icon={Users} label="Utenti totali" value={stats?.totalUsers || 0} loading={isLoading} />
        <StatCard icon={ShoppingCart} label="Ordini totali" value={stats?.totalOrders || 0} loading={isLoading} />
      </div>

      {/* Maintenance */}
      <MaintenanceCard
        settings={settings}
        isLoading={settingsLoading}
        onToggle={(v) => saveMutation.mutate({ maintenance_mode: v ? "true" : "false" })}
        isSaving={saveMutation.isPending}
      />

      {/* URL Applicazione */}
      <SiteUrlCard
        settings={settings}
        isLoading={settingsLoading}
        onSave={(updates) => saveMutation.mutate(updates)}
        isSaving={saveMutation.isPending}
      />

      {/* Platform Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Server className="h-5 w-5" /> Informazioni Piattaforma</CardTitle>
          <CardDescription>Informazioni generali sulla piattaforma</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <div>
              <p className="text-sm font-medium">Versione Piattaforma</p>
              <p className="text-xs text-muted-foreground">Edilizia in Cloud v1.0.0</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
