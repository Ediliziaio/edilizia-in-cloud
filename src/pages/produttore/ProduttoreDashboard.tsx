import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { CreateRivenditoreDialog } from "@/components/produttore/CreateRivenditoreDialog";
import {
  Users, Plus, Building2, AlertCircle, RefreshCw, Factory, CreditCard, CheckCircle2, Wallet,
} from "lucide-react";

type BillingMode = "fabbrica_paga" | "reseller_paga";

interface Rivenditore {
  id: string;
  name: string;
  status: string | null;
  billing_comped: boolean | null;
  created_at: string;
}

/**
 * Dashboard del PRODUTTORE — panoramica + gestione dei propri rivenditori.
 * KPI (totale / attivi / chi paga) + elenco + creazione con scelta "chi paga".
 */
export default function ProduttoreDashboard() {
  const { profile, effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id ?? profile?.company_id ?? null;
  const [open, setOpen] = useState(false);
  const [createKey, setCreateKey] = useState(0);
  const openCreate = () => { setCreateKey((k) => k + 1); setOpen(true); };

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["produttore-rivenditori", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      // parent_company_id / billing_comped / reseller_billing_mode non nei tipi generati.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const [rivsRes, compRes] = await Promise.all([
        sb.from("companies")
          .select("id, name, status, billing_comped, created_at")
          .eq("parent_company_id", companyId)
          .order("created_at", { ascending: false }),
        sb.from("companies").select("reseller_billing_mode").eq("id", companyId).maybeSingle(),
      ]);
      if (rivsRes.error) throw new Error(rivsRes.error.message);
      if (compRes.error) throw new Error(compRes.error.message);
      return {
        rivenditori: (rivsRes.data ?? []) as Rivenditore[],
        mode: (compRes.data?.reseller_billing_mode ?? "fabbrica_paga") as BillingMode,
      };
    },
  });

  const rivenditori = data?.rivenditori ?? [];
  const mode = data?.mode ?? "fabbrica_paga";
  const attivi = rivenditori.filter((r) => r.status === "active").length;
  const comped = rivenditori.filter((r) => r.billing_comped).length;
  const paganti = rivenditori.length - comped;

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Users className="h-6 w-6" /> I tuoi rivenditori
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Crea e gestisci gli accessi dei tuoi rivenditori, col tuo brand e dominio.
          </p>
        </div>
        <Button className="gap-1.5 self-start sm:self-auto" onClick={openCreate}>
          <Plus className="h-4 w-4" /> Crea rivenditore
        </Button>
      </div>

      {/* KPI */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={<Building2 className="h-5 w-5" />} value={rivenditori.length} label="Rivenditori" tone="default" loading={isLoading} />
        <StatCard icon={<CheckCircle2 className="h-5 w-5" />} value={attivi} label="Attivi" tone="emerald" loading={isLoading} />
        <StatCard icon={<Factory className="h-5 w-5" />} value={comped} label="Paghi tu" tone="amber" loading={isLoading} />
        <StatCard icon={<CreditCard className="h-5 w-5" />} value={paganti} label="Pagano loro" tone="blue" loading={isLoading} />
      </div>

      {/* Modello di default attivo */}
      {!isLoading && !isError && (
        <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
          <Wallet className="h-3.5 w-3.5" />
          Modello predefinito per i nuovi rivenditori:{" "}
          <strong className="text-foreground">
            {mode === "fabbrica_paga" ? "Paghi tu per tutti" : "Paga ogni rivenditore"}
          </strong>
          <span className="hidden sm:inline">· modificabile in Fatturazione, o per singolo rivenditore alla creazione.</span>
        </div>
      )}

      {/* Elenco */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center">
          <AlertCircle className="mx-auto mb-3 h-8 w-8 text-destructive opacity-70" />
          <p className="font-medium">Errore nel caricamento dei rivenditori</p>
          <p className="mx-auto mb-4 mt-1 max-w-sm text-sm text-muted-foreground">
            Riprova tra poco. Se il problema persiste, contatta il supporto.
          </p>
          <Button variant="outline" className="gap-1.5" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" /> Riprova
          </Button>
        </div>
      ) : rivenditori.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <Building2 className="mx-auto mb-3 h-10 w-10 text-muted-foreground opacity-40" />
          <p className="font-medium">Nessun rivenditore ancora</p>
          <p className="mx-auto mb-4 mt-1 max-w-sm text-sm text-muted-foreground">
            Crea il primo rivenditore: avrà la sua area dedicata, con il tuo logo e dominio.
          </p>
          <Button className="gap-1.5" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Crea il primo rivenditore
          </Button>
        </div>
      ) : (
        <ul className="space-y-2">
          {rivenditori.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 rounded-xl border bg-card p-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Building2 className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="truncate font-medium">{r.name}</div>
                  <div className="text-xs text-muted-foreground">
                    Creato il {new Date(r.created_at).toLocaleDateString("it-IT")}
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant={r.status === "active" ? "default" : "secondary"}>{r.status ?? "—"}</Badge>
                {r.billing_comped ? (
                  <Badge variant="outline" className="gap-1 border-amber-200 text-amber-700">
                    <Factory className="h-3.5 w-3.5" /> Paghi tu
                  </Badge>
                ) : (
                  <Badge variant="outline" className="gap-1 border-blue-200 text-blue-700">
                    <CreditCard className="h-3.5 w-3.5" /> Paga lui
                  </Badge>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <CreateRivenditoreDialog
        key={createKey}
        open={open}
        onOpenChange={setOpen}
        companyId={companyId}
        defaultComped={mode === "fabbrica_paga"}
      />
    </div>
  );
}

function StatCard({
  icon, value, label, tone, loading,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  tone: "default" | "emerald" | "amber" | "blue";
  loading?: boolean;
}) {
  const toneCls =
    tone === "emerald" ? "bg-emerald-100 text-emerald-700"
      : tone === "amber" ? "bg-amber-100 text-amber-700"
        : tone === "blue" ? "bg-blue-100 text-blue-700"
          : "bg-muted";
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-4">
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", toneCls)}>{icon}</div>
        <div className="min-w-0">
          {loading ? <Skeleton className="h-7 w-10" /> : <div className="text-2xl font-bold leading-none">{value}</div>}
          <div className="mt-1 text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}
