import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Users, ShoppingCart, Server, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

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
