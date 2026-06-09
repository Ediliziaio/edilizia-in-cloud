import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { CreateRivenditoreDialog } from "@/components/produttore/CreateRivenditoreDialog";
import { ResellerDetailSheet } from "@/components/produttore/ResellerDetailSheet";
import { companyStatusLabelIt } from "@/lib/companyStatusLabel";
import { useResellerPlans } from "@/hooks/useResellerPlans";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Users, Plus, Building2, AlertCircle, RefreshCw, Factory, CreditCard, CheckCircle2,
  Wallet, MoreVertical, Package, Search, Ban, Play, Eye,
} from "lucide-react";

type BillingMode = "fabbrica_paga" | "reseller_paga";
type StatusFilter = "all" | "active" | "suspended";
type BillingFilter = "all" | "comped" | "paid";

interface Rivenditore {
  id: string;
  name: string;
  status: string | null;
  billing_comped: boolean | null;
  created_at: string;
  subscription_plan_id: string | null;
  plan_name: string | null;
  plan_price: number;
}

/**
 * Dashboard del PRODUTTORE — console di gestione dei propri rivenditori.
 * KPI + ricerca/filtri + righe con piano/€/chi-paga/stato + azioni (chi paga,
 * cambia piano, sospendi/riattiva). Tutte le mutation invalidano sia l'elenco
 * sia la Fatturazione (che dipende da piano + chi paga).
 */
export default function ProduttoreDashboard() {
  const { profile, effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id ?? profile?.company_id ?? null;
  const qc = useQueryClient();
  const { data: plans = [] } = useResellerPlans();
  const [open, setOpen] = useState(false);
  const [createKey, setCreateKey] = useState(0);
  const openCreate = () => { setCreateKey((k) => k + 1); setOpen(true); };
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [billingFilter, setBillingFilter] = useState<BillingFilter>("all");
  const [suspendTarget, setSuspendTarget] = useState<Rivenditore | null>(null);
  const [detailTarget, setDetailTarget] = useState<{ id: string; name: string } | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["produttore-rivenditori", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      // parent_company_id / billing_comped / reseller_billing_mode non nei tipi generati.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const [rivsRes, compRes] = await Promise.all([
        sb.from("companies")
          .select("id, name, status, billing_comped, created_at, subscription_plan_id, subscription_plans:subscription_plan_id(name, price_monthly)")
          .eq("parent_company_id", companyId)
          .order("created_at", { ascending: false }),
        sb.from("companies").select("reseller_billing_mode").eq("id", companyId).maybeSingle(),
      ]);
      if (rivsRes.error) throw new Error(rivsRes.error.message);
      if (compRes.error) throw new Error(compRes.error.message);
      return {
        rivenditori: ((rivsRes.data ?? []) as Record<string, unknown>[]).map((r) => ({
          id: r.id as string,
          name: r.name as string,
          status: (r.status as string | null) ?? null,
          billing_comped: (r.billing_comped as boolean | null) ?? null,
          created_at: r.created_at as string,
          subscription_plan_id: (r.subscription_plan_id as string | null) ?? null,
          plan_name: (r.subscription_plans as { name?: string } | null)?.name ?? null,
          plan_price: Number((r.subscription_plans as { price_monthly?: number } | null)?.price_monthly ?? 0),
        })) as Rivenditore[],
        mode: (compRes.data?.reseller_billing_mode ?? "fabbrica_paga") as BillingMode,
      };
    },
  });

  // Piano e chi-paga influiscono sulla Fatturazione → invalido entrambe le query.
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["produttore-rivenditori", companyId] });
    qc.invalidateQueries({ queryKey: ["produttore-fatturazione", companyId] });
  };

  const setBilling = useMutation({
    mutationFn: async ({ id, comped }: { id: string; comped: boolean }) => {
      const { data: res, error } = await supabase.functions.invoke("set-reseller-billing", {
        body: { reseller_id: id, billing_comped: comped },
      });
      if (error) throw new Error(error.message ?? "Aggiornamento fallito");
      const r = res as { success?: boolean; error?: string } | null;
      if (r && r.success === false) throw new Error(r.error ?? "Aggiornamento fallito");
    },
    onSuccess: () => {
      toast.success("Aggiornato", { description: "Modello di pagamento del rivenditore aggiornato." });
      invalidate();
    },
    onError: (e) => toast.error("Aggiornamento fallito", { description: (e as Error).message }),
  });

  const setPlan = useMutation({
    mutationFn: async ({ id, planId }: { id: string; planId: string }) => {
      const { data: res, error } = await supabase.functions.invoke("set-reseller-plan", {
        body: { reseller_id: id, subscription_plan_id: planId },
      });
      if (error) throw new Error(error.message ?? "Aggiornamento fallito");
      const r = res as { success?: boolean; error?: string } | null;
      if (r && r.success === false) throw new Error(r.error ?? "Aggiornamento fallito");
    },
    onSuccess: () => {
      toast.success("Piano aggiornato", { description: "Il piano del rivenditore è stato cambiato." });
      invalidate();
    },
    onError: (e) => toast.error("Aggiornamento fallito", { description: (e as Error).message }),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "active" | "suspended" }) => {
      const { data: res, error } = await supabase.functions.invoke("set-reseller-status", {
        body: { reseller_id: id, status },
      });
      if (error) throw new Error(error.message ?? "Operazione fallita");
      const r = res as { success?: boolean; error?: string } | null;
      if (r && r.success === false) throw new Error(r.error ?? "Operazione fallita");
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.status === "suspended" ? "Rivenditore sospeso" : "Rivenditore riattivato");
      invalidate();
    },
    onError: (e) => toast.error("Operazione fallita", { description: (e as Error).message }),
  });

  const rivenditori = data?.rivenditori ?? [];
  const mode = data?.mode ?? "fabbrica_paga";
  const attivi = rivenditori.filter((r) => r.status === "active").length;
  const comped = rivenditori.filter((r) => r.billing_comped).length;
  const paganti = rivenditori.length - comped;
  // Quanto paghi TU al mese = somma dei prezzi-piano dei rivenditori comped.
  const youPayMonthly = rivenditori.filter((r) => r.billing_comped).reduce((s, r) => s + (r.plan_price ?? 0), 0);
  const byPlan = plans.map((p) => ({ name: p.name, count: rivenditori.filter((r) => r.subscription_plan_id === p.id).length }));

  const ql = q.trim().toLowerCase();
  const filtered = rivenditori.filter((r) => {
    if (ql && !r.name.toLowerCase().includes(ql)) return false;
    if (statusFilter === "active" && r.status !== "active") return false;
    if (statusFilter === "suspended" && r.status !== "suspended") return false;
    if (billingFilter === "comped" && !r.billing_comped) return false;
    if (billingFilter === "paid" && r.billing_comped) return false;
    return true;
  });

  const pendingFor = (id: string) =>
    (setBilling.isPending && setBilling.variables?.id === id) ||
    (setPlan.isPending && setPlan.variables?.id === id) ||
    (setStatus.isPending && setStatus.variables?.id === id);

  const resetFilters = () => { setQ(""); setStatusFilter("all"); setBillingFilter("all"); };

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
        <StatCard icon={<Factory className="h-5 w-5" />} value={comped} label="Paghi tu" sub={`~€${youPayMonthly}/mese`} tone="amber" loading={isLoading} />
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
          <span className="hidden sm:inline">· modificabile in Fatturazione, o per singolo rivenditore.</span>
        </div>
      )}

      {/* Distribuzione piani */}
      {!isLoading && !isError && byPlan.some((b) => b.count > 0) && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">Per piano:</span>
          {byPlan.map((b) => (
            <Badge key={b.name} variant="secondary" className="gap-1 font-normal">
              <Package className="h-3 w-3" /> {b.name} ×{b.count}
            </Badge>
          ))}
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
        <>
          {/* Toolbar: ricerca + filtri */}
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative sm:flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca rivenditore…" className="pl-9" />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <FilterChips
                value={statusFilter}
                onChange={setStatusFilter}
                options={[{ v: "all", label: "Tutti" }, { v: "active", label: "Attivi" }, { v: "suspended", label: "Sospesi" }]}
              />
              <FilterChips
                value={billingFilter}
                onChange={setBillingFilter}
                options={[{ v: "all", label: "Tutti" }, { v: "comped", label: "Paghi tu", Icon: Factory }, { v: "paid", label: "Pagano loro", Icon: CreditCard }]}
              />
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed p-10 text-center">
              <Search className="mx-auto mb-3 h-8 w-8 text-muted-foreground opacity-40" />
              <p className="font-medium">Nessun rivenditore corrisponde ai filtri</p>
              <Button variant="ghost" size="sm" className="mt-3" onClick={resetFilters}>Azzera filtri</Button>
            </div>
          ) : (
            <>
              <div className="mb-2 text-xs text-muted-foreground">
                {filtered.length} di {rivenditori.length} rivenditori
              </div>
              <ul className="space-y-2">
                {filtered.map((r) => (
                  <li key={r.id} className="rounded-xl border bg-card p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                          <Building2 className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() => setDetailTarget({ id: r.id, name: r.name })}
                            className="block max-w-full truncate text-left font-medium hover:underline"
                          >
                            {r.name}
                          </button>
                          <div className="text-xs text-muted-foreground">
                            Creato il {new Date(r.created_at).toLocaleDateString("it-IT")}
                          </div>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" disabled={pendingFor(r.id)} title="Gestisci rivenditore" aria-label="Azioni rivenditore">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          <DropdownMenuItem onClick={() => setDetailTarget({ id: r.id, name: r.name })}>
                            <Eye className="mr-2 h-4 w-4" /> Dettagli
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuLabel>Chi paga l&apos;abbonamento</DropdownMenuLabel>
                          <DropdownMenuItem disabled={!!r.billing_comped} onClick={() => setBilling.mutate({ id: r.id, comped: true })}>
                            <Factory className="mr-2 h-4 w-4" /> Paghi tu
                          </DropdownMenuItem>
                          <DropdownMenuItem disabled={!r.billing_comped} onClick={() => setBilling.mutate({ id: r.id, comped: false })}>
                            <CreditCard className="mr-2 h-4 w-4" /> Paga il rivenditore
                          </DropdownMenuItem>
                          {plans.length > 0 && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuLabel>Piano</DropdownMenuLabel>
                              {plans.map((p) => (
                                <DropdownMenuItem
                                  key={p.id}
                                  disabled={r.subscription_plan_id === p.id}
                                  onClick={() => setPlan.mutate({ id: r.id, planId: p.id })}
                                >
                                  <Package className="mr-2 h-4 w-4" /> {p.name}
                                  <span className="ml-auto pl-3 text-xs text-muted-foreground">€{p.price_monthly}</span>
                                </DropdownMenuItem>
                              ))}
                            </>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuLabel>Stato</DropdownMenuLabel>
                          {r.status === "suspended" ? (
                            <DropdownMenuItem onClick={() => setStatus.mutate({ id: r.id, status: "active" })}>
                              <Play className="mr-2 h-4 w-4" /> Riattiva
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setSuspendTarget(r)}>
                              <Ban className="mr-2 h-4 w-4" /> Sospendi
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <Badge variant={r.status === "active" ? "default" : r.status === "suspended" ? "destructive" : "secondary"}>
                        {companyStatusLabelIt(r.status)}
                      </Badge>
                      {r.plan_name && (
                        <Badge variant="outline" className="gap-1">
                          <Package className="h-3.5 w-3.5" /> {r.plan_name}
                          {r.plan_price > 0 && <span className="text-muted-foreground">· €{r.plan_price}/mese</span>}
                        </Badge>
                      )}
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
            </>
          )}
        </>
      )}

      <CreateRivenditoreDialog
        key={createKey}
        open={open}
        onOpenChange={setOpen}
        companyId={companyId}
        defaultComped={mode === "fabbrica_paga"}
      />

      <AlertDialog open={!!suspendTarget} onOpenChange={(o) => { if (!o) setSuspendTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sospendere {suspendTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              L&apos;area del rivenditore verrà bloccata e potrà rientrare solo dopo la riattivazione.
              Nessun dato viene eliminato: puoi riattivarlo quando vuoi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (suspendTarget) setStatus.mutate({ id: suspendTarget.id, status: "suspended" });
                setSuspendTarget(null);
              }}
            >
              Sospendi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ResellerDetailSheet
        target={detailTarget}
        onOpenChange={(o) => { if (!o) setDetailTarget(null); }}
        onMutated={invalidate}
      />
    </div>
  );
}

function FilterChips<T extends string>({
  value, onChange, options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { v: T; label: string; Icon?: typeof Factory }[];
}) {
  return (
    <div className="inline-flex rounded-lg border bg-muted/40 p-0.5">
      {options.map(({ v, label, Icon }) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          aria-pressed={value === v}
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            value === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {Icon && <Icon className="h-3.5 w-3.5" />}
          {label}
        </button>
      ))}
    </div>
  );
}

function StatCard({
  icon, value, label, sub, tone, loading,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  sub?: string;
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
          {sub && !loading && <div className="text-[11px] leading-tight text-muted-foreground">{sub}</div>}
        </div>
      </CardContent>
    </Card>
  );
}
