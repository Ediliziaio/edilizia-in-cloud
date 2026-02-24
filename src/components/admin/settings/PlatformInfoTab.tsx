import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Users, ShoppingCart, Server, Copy, Check, Shield, Eye, EyeOff, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";

function StatCard({ icon: Icon, label, value, loading }: { icon: typeof Building2; label: string; value: number; loading: boolean }) {
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

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3">
        <code className="flex-1 text-xs break-all">{value}</code>
        <Button variant="ghost" size="icon" onClick={copy} className="shrink-0 h-8 w-8">
          {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4 text-muted-foreground" />}
        </Button>
      </div>
    </div>
  );
}

function MetaIntegrationCard() {
  const queryClient = useQueryClient();
  const [metaAppId, setMetaAppId] = useState("");
  const [metaAppSecret, setMetaAppSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);

  const { data: settings, isLoading } = useQuery({
    queryKey: ["platform-settings-meta"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("manage-super-admins", {
        body: { action: "get-settings" },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw new Error(res.error.message);
      return res.data?.settings as Record<string, { value: string; masked?: string; updated_at?: string }> | undefined;
    },
    staleTime: 60 * 1000,
  });

  const isConfigured = !!(settings?.meta_app_id?.value || settings?.meta_app_secret?.value);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const updates: Record<string, string> = {};
      if (metaAppId.trim()) updates.meta_app_id = metaAppId.trim();
      if (metaAppSecret.trim()) updates.meta_app_secret = metaAppSecret.trim();
      if (Object.keys(updates).length === 0) throw new Error("Inserisci almeno un valore");

      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("manage-super-admins", {
        body: { action: "update-settings", settings: updates },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw new Error(res.error.message);
      return res.data;
    },
    onSuccess: () => {
      toast.success("Configurazione Meta salvata");
      setMetaAppId("");
      setMetaAppSecret("");
      queryClient.invalidateQueries({ queryKey: ["platform-settings-meta"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <CardTitle>Integrazioni Meta</CardTitle>
          </div>
          <Badge variant={isConfigured ? "default" : "secondary"}>
            {isLoading ? "..." : isConfigured ? "Configurato" : "Non configurato"}
          </Badge>
        </div>
        <CardDescription className="flex items-center gap-1">
          Credenziali Meta App per OAuth (Lead Ads)
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                Queste credenziali vengono usate da tutte le aziende per il collegamento OAuth Meta.
                Ogni azienda ottiene i propri token di accesso specifici.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Meta App ID</label>
          <Input
            placeholder={settings?.meta_app_id?.value || "Inserisci App ID"}
            value={metaAppId}
            onChange={(e) => setMetaAppId(e.target.value)}
          />
          {settings?.meta_app_id?.value && !metaAppId && (
            <p className="text-xs text-muted-foreground">Valore attuale: {settings.meta_app_id.value}</p>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Meta App Secret</label>
          <div className="relative">
            <Input
              type={showSecret ? "text" : "password"}
              placeholder={settings?.meta_app_secret?.masked || "Inserisci App Secret"}
              value={metaAppSecret}
              onChange={(e) => setMetaAppSecret(e.target.value)}
              className="pr-10"
            />
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 h-10 w-10"
              onClick={() => setShowSecret(!showSecret)}
              type="button"
            >
              {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
          {settings?.meta_app_secret?.masked && !metaAppSecret && (
            <p className="text-xs text-muted-foreground">Valore attuale: {settings.meta_app_secret.masked}</p>
          )}
        </div>

        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || (!metaAppId.trim() && !metaAppSecret.trim())}
          className="w-full"
        >
          {saveMutation.isPending ? "Salvataggio..." : "Salva configurazione"}
        </Button>

        <p className="text-xs text-muted-foreground">
          I valori esistenti restano invariati se il campo è vuoto. Le credenziali di ambiente vengono usate come fallback.
        </p>
      </CardContent>
    </Card>
  );
}

export default function PlatformInfoTab() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["platform-stats"],
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

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Building2} label="Aziende registrate" value={stats?.totalCompanies || 0} loading={isLoading} />
        <StatCard icon={Users} label="Utenti totali" value={stats?.totalUsers || 0} loading={isLoading} />
        <StatCard icon={ShoppingCart} label="Ordini totali" value={stats?.totalOrders || 0} loading={isLoading} />
      </div>

      <MetaIntegrationCard />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Server className="h-5 w-5" /> Informazioni Piattaforma</CardTitle>
          <CardDescription>Dettagli tecnici e credenziali API</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <div>
              <p className="text-sm font-medium">Versione Piattaforma</p>
              <p className="text-xs text-muted-foreground">Edilizia in Cloud v1.0.0</p>
            </div>
          </div>
          <CopyField label="URL Progetto" value={supabaseUrl} />
          <CopyField label="Anon Key (pubblica)" value={anonKey} />
          <p className="text-xs text-muted-foreground">Queste credenziali sono pubbliche e possono essere usate per integrazioni API lato client.</p>
        </CardContent>
      </Card>
    </div>
  );
}
