import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useSuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";
import { AccessDenied } from "@/components/admin/AccessDenied";
import { CreateProduttoreDialog } from "@/components/admin/produttori/CreateProduttoreDialog";
import { ProduttoriAnalytics } from "@/components/admin/produttori/ProduttoriAnalytics";
import { companyStatusLabelIt } from "@/lib/companyStatusLabel";
import {
  Factory, Building2, Plus, ChevronDown, ChevronRight, AlertCircle, RefreshCw,
  BadgeEuro, Globe, ShieldCheck, CreditCard, Mail, Percent, Save, Loader2, Play, Ban, Link2, Copy, Package,
} from "lucide-react";

interface Rivenditore {
  id: string;
  name: string;
  status: string | null;
  billing_comped: boolean | null;
  created_at: string | null;
  subscription_plan_id: string | null;
  plan_name: string | null;
  plan_price: number;
}
interface Produttore {
  id: string;
  name: string;
  email: string | null;
  status: string | null;
  reseller_billing_mode: string | null;
  created_at: string;
  admin_email: string | null;
  custom_domain: string | null;
  custom_domain_verified: boolean;
  wholesale_pct: number;
  reseller_limit: number;
  rivenditori: Rivenditore[];
  rivenditori_count: number;
  comped_count: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow = any;

async function fetchProduttori(): Promise<{ produttori: Produttore[]; totals: { produttori: number; rivenditori: number; comped: number } }> {
  // parent_company_id / reseller_billing_mode / billing_comped / whitelabel_tier non
  // sono nei tipi generati (migration recente) → client non tipizzato.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;

  // 1. Produttori = aziende con branding agency.
  const { data: brand, error: e1 } = await sb
    .from("company_branding")
    .select("company_id, custom_domain, custom_domain_verified")
    .eq("whitelabel_tier", "agency");
  if (e1) throw new Error(e1.message);
  const ids: string[] = [...new Set((brand ?? []).map((b: AnyRow) => b.company_id).filter(Boolean))];
  if (ids.length === 0) return { produttori: [], totals: { produttori: 0, rivenditori: 0, comped: 0 } };

  const { data: comps, error: e2 } = await sb
    .from("companies")
    .select("id, name, email, status, reseller_billing_mode, reseller_wholesale_pct, reseller_limit, created_at")
    .in("id", ids);
  if (e2) throw new Error(e2.message);

  // 2. Rivenditori (figli) di tutti i produttori.
  const { data: rivs, error: e3 } = await sb
    .from("companies")
    .select("id, name, parent_company_id, billing_comped, status, created_at, subscription_plan_id, subscription_plans:subscription_plan_id(name, price_monthly)")
    .in("parent_company_id", ids);
  if (e3) throw new Error(e3.message);

  // 3. Email dell'admin produttore (profiles dei produttore_admin di quelle aziende).
  const { data: roleRows } = await sb.from("user_roles").select("user_id").eq("role", "produttore_admin");
  const adminIds: string[] = [...new Set((roleRows ?? []).map((r: AnyRow) => r.user_id).filter(Boolean))];
  const { data: profs } = adminIds.length
    ? await sb.from("profiles").select("id, company_id, email").in("company_id", ids).in("id", adminIds)
    : { data: [] as AnyRow[] };

  const brandByCompany = new Map<string, AnyRow>((brand ?? []).map((b: AnyRow) => [b.company_id, b]));
  const adminByCompany = new Map<string, string>();
  (profs ?? []).forEach((p: AnyRow) => {
    if (p.company_id && p.email && !adminByCompany.has(p.company_id)) adminByCompany.set(p.company_id, p.email);
  });
  const rivByParent = new Map<string, Rivenditore[]>();
  (rivs ?? []).forEach((r: AnyRow) => {
    const arr = rivByParent.get(r.parent_company_id) ?? [];
    arr.push({
      id: r.id, name: r.name, status: r.status, billing_comped: r.billing_comped,
      created_at: r.created_at ?? null,
      subscription_plan_id: r.subscription_plan_id ?? null,
      plan_name: (r.subscription_plans?.name as string | undefined) ?? null,
      plan_price: Number(r.subscription_plans?.price_monthly ?? 0),
    });
    rivByParent.set(r.parent_company_id, arr);
  });

  const produttori: Produttore[] = (comps ?? [])
    .map((c: AnyRow): Produttore => {
      const children = rivByParent.get(c.id) ?? [];
      const b = brandByCompany.get(c.id);
      return {
        id: c.id,
        name: c.name,
        email: c.email ?? null,
        status: c.status ?? null,
        reseller_billing_mode: c.reseller_billing_mode ?? null,
        created_at: c.created_at,
        admin_email: adminByCompany.get(c.id) ?? c.email ?? null,
        custom_domain: b?.custom_domain ?? null,
        custom_domain_verified: !!b?.custom_domain_verified,
        wholesale_pct: Number(c.reseller_wholesale_pct ?? 0),
        reseller_limit: Number(c.reseller_limit ?? 0),
        rivenditori: children,
        rivenditori_count: children.length,
        comped_count: children.filter((x) => x.billing_comped).length,
      };
    })
    .sort((a: Produttore, b: Produttore) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));

  return {
    produttori,
    totals: {
      produttori: produttori.length,
      rivenditori: (rivs ?? []).length,
      comped: (rivs ?? []).filter((x: AnyRow) => x.billing_comped).length,
    },
  };
}

export default function ProduttoriDashboard() {
  const { permissions: saPermissions } = useSuperAdminPermissions();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-produttori"],
    queryFn: fetchProduttori,
    staleTime: 60_000,
    enabled: saPermissions.can_manage_companies,
  });

  if (!saPermissions.can_manage_companies) return <AccessDenied />;

  const produttori = data?.produttori ?? [];

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Factory className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Produttori</h1>
            <p className="text-muted-foreground">
              Fabbriche white-label che gestiscono i propri rivenditori, col proprio brand e dominio.
            </p>
          </div>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="self-end gap-1.5 sm:self-auto">
          <Plus className="h-4 w-4" /> Crea produttore
        </Button>
      </div>

      {/* Analytics: KPI ricchi + grafici (stile mega dashboard) */}
      {!isLoading && !isError && produttori.length > 0 && <ProduttoriAnalytics produttori={produttori} />}

      {isError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>Errore nel caricamento dei produttori.</span>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="mr-1 h-3 w-3" /> Riprova
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : produttori.length === 0 && !isError ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Factory className="h-10 w-10 text-muted-foreground opacity-40" />
            <div>
              <p className="font-medium">Nessun produttore ancora</p>
              <p className="mt-1 text-sm text-muted-foreground">Crea il primo produttore white-label per iniziare.</p>
            </div>
            <Button onClick={() => setCreateOpen(true)} className="gap-1.5">
              <Plus className="h-4 w-4" /> Crea produttore
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {produttori.map((p) => {
            const isOpen = expanded === p.id;
            return (
              <li key={p.id} className="overflow-hidden rounded-xl border bg-card">
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : p.id)}
                  className="flex w-full items-center gap-3 p-4 text-left hover:bg-muted/40"
                >
                  {isOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <Factory className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-semibold">{p.name}</span>
                      <Badge variant={p.status === "active" ? "default" : "secondary"} className="shrink-0">{companyStatusLabelIt(p.status)}</Badge>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      {p.admin_email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {p.admin_email}</span>}
                      {p.custom_domain && (
                        <span className="inline-flex items-center gap-1">
                          <Globe className="h-3 w-3" /> {p.custom_domain}
                          {p.custom_domain_verified && <ShieldCheck className="h-3 w-3 text-emerald-600" />}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant="outline" className="gap-1">
                      <Building2 className="h-3.5 w-3.5" /> {p.rivenditori_count} rivend.
                    </Badge>
                    <Badge variant="outline" className="hidden gap-1 sm:inline-flex">
                      {p.reseller_billing_mode === "reseller_paga"
                        ? <><CreditCard className="h-3.5 w-3.5" /> Paga il rivend.</>
                        : <><Factory className="h-3.5 w-3.5" /> Paga il produttore</>}
                    </Badge>
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t bg-muted/20 px-4 py-3">
                    <ProduttoreActions p={p} onChanged={() => qc.invalidateQueries({ queryKey: ["admin-produttori"] })} />
                    <WholesaleControl
                      produttoreId={p.id}
                      initialPct={p.wholesale_pct}
                      onSaved={() => qc.invalidateQueries({ queryKey: ["admin-produttori"] })}
                    />
                    <div className="mb-3">
                      <ChargeControl produttoreId={p.id} produttoreName={p.name} />
                    </div>
                    <ProduttorePiani produttoreId={p.id} />
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Rivenditori ({p.rivenditori_count})
                      {p.rivenditori_count > 0 && <> · {p.comped_count} comped</>}
                    </div>
                    {p.rivenditori_count === 0 ? (
                      <p className="text-sm text-muted-foreground">Nessun rivenditore creato da questo produttore.</p>
                    ) : (
                      <ul className="divide-y">
                        {p.rivenditori.map((r) => (
                          <li key={r.id} className="flex items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
                            <span className="truncate text-sm font-medium">{r.name}</span>
                            <div className="flex shrink-0 items-center gap-2">
                              <Badge variant="secondary" className="text-[11px]">{companyStatusLabelIt(r.status)}</Badge>
                              {r.billing_comped
                                ? <Badge variant="outline" className="gap-1 border-emerald-200 text-[11px] text-emerald-700"><Factory className="h-3 w-3" /> Comped</Badge>
                                : <Badge variant="outline" className="gap-1 border-blue-200 text-[11px] text-blue-700"><CreditCard className="h-3 w-3" /> Paga</Badge>}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <CreateProduttoreDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

function ProduttoreActions({ p, onChanged }: { p: Produttore; onChanged: () => void }) {
  const [limit, setLimit] = useState(String(p.reseller_limit ?? 0));
  const [accessLink, setAccessLink] = useState<string | null>(null);
  const [suspendOpen, setSuspendOpen] = useState(false);

  const setConfig = useMutation({
    mutationFn: async (patch: { status?: string; reseller_limit?: number }) => {
      const { data, error } = await supabase.functions.invoke("set-produttore-config", { body: { produttore_id: p.id, ...patch } });
      if (error) throw new Error(error.message);
      const r = data as { success?: boolean; error?: string } | null;
      if (r && r.success === false) throw new Error(r.error ?? "Aggiornamento fallito");
    },
    onSuccess: () => { toast.success("Produttore aggiornato"); setSuspendOpen(false); onChanged(); },
    onError: (e) => toast.error("Aggiornamento fallito", { description: (e as Error).message }),
  });

  const reinvite = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("resend-produttore-invite", { body: { produttore_id: p.id } });
      if (error) throw new Error(error.message);
      const r = data as { success?: boolean; error?: string; action_link?: string } | null;
      if (!r || r.success === false) throw new Error(r?.error ?? "Operazione fallita");
      return r.action_link ?? null;
    },
    onSuccess: (link) => { setAccessLink(link); toast.success("Link d'accesso generato"); },
    onError: (e) => toast.error("Operazione fallita", { description: (e as Error).message }),
  });

  const copy = async (t: string) => {
    try { await navigator.clipboard.writeText(t); toast.success("Copiato negli appunti"); }
    catch { toast.error("Impossibile copiare"); }
  };
  const limitDirty = String(p.reseller_limit ?? 0) !== limit.trim();

  return (
    <div className="mb-3 space-y-2 rounded-lg border bg-background p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">Gestione produttore</span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {p.status === "suspended" ? (
            <Button size="sm" variant="outline" className="gap-1.5" disabled={setConfig.isPending} onClick={() => setConfig.mutate({ status: "active" })}>
              <Play className="h-3.5 w-3.5" /> Riattiva
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="gap-1.5 text-destructive" disabled={setConfig.isPending} onClick={() => setSuspendOpen(true)}>
              <Ban className="h-3.5 w-3.5" /> Sospendi
            </Button>
          )}
          <Button size="sm" variant="outline" className="gap-1.5" disabled={reinvite.isPending} onClick={() => reinvite.mutate()}>
            {reinvite.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />} Reinvito
          </Button>
        </div>
      </div>

      {accessLink && (
        <div className="flex items-center gap-1.5">
          <Input readOnly value={accessLink} className="h-8 text-xs" onFocus={(e) => e.currentTarget.select()} />
          <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => copy(accessLink)} aria-label="Copia link"><Copy className="h-4 w-4" /></Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm">Tetto rivenditori</span>
        <span className="text-xs text-muted-foreground">(0 = illimitato)</span>
        <div className="ml-auto flex items-center gap-1.5">
          <Input type="number" min={0} value={limit} onChange={(e) => setLimit(e.target.value)} className="h-8 w-20" aria-label="Tetto rivenditori" />
          <Button size="sm" className="gap-1.5" disabled={!limitDirty || setConfig.isPending} onClick={() => {
            const n = Number(limit);
            if (!Number.isInteger(n) || n < 0) { toast.error("Il tetto deve essere un intero ≥ 0"); return; }
            setConfig.mutate({ reseller_limit: n });
          }}>
            <Save className="h-3.5 w-3.5" /> Salva
          </Button>
        </div>
      </div>

      <AlertDialog open={suspendOpen} onOpenChange={setSuspendOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sospendere {p.name}?</AlertDialogTitle>
            <AlertDialogDescription>Il produttore verrà sospeso. Nessun dato viene eliminato: puoi riattivarlo quando vuoi.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={setConfig.isPending} onClick={() => setConfig.mutate({ status: "suspended" })}>
              Sospendi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function WholesaleControl({ produttoreId, initialPct, onSaved }: { produttoreId: string; initialPct: number; onSaved: () => void }) {
  const [pct, setPct] = useState(String(initialPct ?? 0));
  const save = useMutation({
    mutationFn: async () => {
      const n = Number(pct);
      if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error("Inserisci una percentuale tra 0 e 100");
      const { data: res, error } = await supabase.functions.invoke("set-produttore-wholesale", {
        body: { produttore_id: produttoreId, wholesale_pct: n },
      });
      if (error) throw new Error(error.message);
      const r = res as { success?: boolean; error?: string } | null;
      if (r && r.success === false) throw new Error(r.error ?? "Salvataggio fallito");
    },
    onSuccess: () => { toast.success("Sconto wholesale aggiornato"); onSaved(); },
    onError: (e) => toast.error("Salvataggio fallito", { description: (e as Error).message }),
  });
  const dirty = String(initialPct ?? 0) !== pct.trim();
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border bg-background p-3">
      <Percent className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <span className="text-sm font-medium">Sconto wholesale</span>
        <span className="ml-1 text-xs text-muted-foreground">sul listino dei rivenditori comped</span>
      </div>
      <div className="ml-auto flex items-center gap-1.5">
        <Input
          type="number" min={0} max={100} value={pct}
          onChange={(e) => setPct(e.target.value)}
          className="h-8 w-20"
          aria-label="Percentuale sconto wholesale"
        />
        <span className="text-sm text-muted-foreground">%</span>
        <Button size="sm" className="gap-1.5" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Salva
        </Button>
      </div>
    </div>
  );
}

function ChargeControl({ produttoreId, produttoreName }: { produttoreId: string; produttoreName: string }) {
  const [confirm, setConfirm] = useState<{ amount: number; period: string } | null>(null);

  const preview = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("charge-produttore-billing", {
        body: { produttore_id: produttoreId, preview: true },
      });
      if (error) throw new Error(error.message);
      const r = data as { success?: boolean; error?: string; amount?: number; period?: string; has_customer?: boolean } | null;
      if (!r || r.success === false) throw new Error(r?.error ?? "Errore");
      return r;
    },
    onSuccess: (r) => {
      if ((r.amount ?? 0) <= 0) { toast.info("Nessun importo da addebitare"); return; }
      if (!r.has_customer) { toast.warning("Il produttore non ha ancora una carta a sistema"); return; }
      setConfirm({ amount: r.amount as number, period: r.period as string });
    },
    onError: (e) => toast.error("Errore", { description: (e as Error).message }),
  });

  const charge = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("charge-produttore-billing", {
        body: { produttore_id: produttoreId, preview: false },
      });
      if (error) throw new Error(error.message);
      const r = data as { success?: boolean; error?: string; charged?: boolean; reason?: string; status?: string; amount?: number } | null;
      if (!r || r.success === false) throw new Error(r?.error ?? "Errore");
      return r;
    },
    onSuccess: (r) => {
      setConfirm(null);
      if (r.charged) toast.success(`Addebitato €${r.amount} — fattura ${r.status}`);
      else if (r.reason === "already_billed") toast.info(`Già fatturato questo mese (${r.status ?? "—"})`);
      else if (r.reason === "no_card") toast.warning("Il produttore non ha una carta a sistema");
      else if (r.reason === "no_amount") toast.info("Nessun importo da addebitare");
      else toast.info(`Non addebitato: ${r.reason ?? r.status ?? "—"}`);
    },
    onError: (e) => toast.error("Addebito fallito", { description: (e as Error).message }),
  });

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-background p-3">
        <BadgeEuro className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <span className="text-sm font-medium">Conto wholesale</span>
          <span className="ml-1 text-xs text-muted-foreground">addebito sulla carta del produttore</span>
        </div>
        <Button size="sm" variant="outline" className="ml-auto gap-1.5" disabled={preview.isPending} onClick={() => preview.mutate()}>
          {preview.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BadgeEuro className="h-3.5 w-3.5" />}
          Addebita conto
        </Button>
      </div>

      <AlertDialog open={!!confirm} onOpenChange={(o) => { if (!o) setConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Addebitare €{confirm?.amount}?</AlertDialogTitle>
            <AlertDialogDescription>
              Verrà addebitato il conto wholesale di <strong>{produttoreName}</strong> ({confirm?.period}) sulla sua carta.
              È un pagamento <strong>reale</strong> e immediato.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction disabled={charge.isPending} onClick={() => charge.mutate()}>
              {charge.isPending ? "Addebito…" : "Addebita ora"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

interface CustomPlan { id: string; name: string; price_monthly: number; is_active: boolean }

function ProduttorePiani({ produttoreId }: { produttoreId: string }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");

  const { data: plans = [] } = useQuery({
    queryKey: ["admin-produttore-plans", produttoreId],
    staleTime: 60_000,
    queryFn: async (): Promise<CustomPlan[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const { data, error } = await sb
        .from("subscription_plans")
        .select("id, name, price_monthly, is_active")
        .eq("produttore_id", produttoreId)
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as CustomPlan[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const n = name.trim();
      const p = Number(price);
      if (!n) throw new Error("Inserisci un nome");
      if (!Number.isFinite(p) || p < 0) throw new Error("Inserisci un prezzo valido");
      const { data, error } = await supabase.functions.invoke("manage-produttore-plan", {
        body: { action: "create", produttore_id: produttoreId, name: n, price_monthly: p },
      });
      if (error) throw new Error(error.message);
      const r = data as { success?: boolean; error?: string } | null;
      if (r && r.success === false) throw new Error(r.error ?? "Creazione fallita");
    },
    onSuccess: () => { toast.success("Piano creato"); setName(""); setPrice(""); qc.invalidateQueries({ queryKey: ["admin-produttore-plans", produttoreId] }); },
    onError: (e) => toast.error("Creazione fallita", { description: (e as Error).message }),
  });

  const deactivate = useMutation({
    mutationFn: async (planId: string) => {
      const { data, error } = await supabase.functions.invoke("manage-produttore-plan", {
        body: { action: "deactivate", plan_id: planId },
      });
      if (error) throw new Error(error.message);
      const r = data as { success?: boolean; error?: string } | null;
      if (r && r.success === false) throw new Error(r.error ?? "Operazione fallita");
    },
    onSuccess: () => { toast.success("Piano disattivato"); qc.invalidateQueries({ queryKey: ["admin-produttore-plans", produttoreId] }); },
    onError: (e) => toast.error("Operazione fallita", { description: (e as Error).message }),
  });

  return (
    <div className="mb-3 rounded-lg border bg-background p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium"><Package className="h-4 w-4 text-muted-foreground" /> Piani personalizzati</div>
      {plans.length > 0 ? (
        <ul className="mb-2 divide-y">
          {plans.map((pl) => (
            <li key={pl.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
              <span className="truncate">{pl.name} <span className="text-muted-foreground">· €{pl.price_monthly}/mese</span></span>
              <Button size="sm" variant="ghost" className="h-7 shrink-0 text-destructive" disabled={deactivate.isPending} onClick={() => deactivate.mutate(pl.id)}>Disattiva</Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-2 text-xs text-muted-foreground">Nessun piano personalizzato. Creane uno per offrirlo ai rivenditori di questo produttore.</p>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome piano (es. Plus)" className="h-8 min-w-[140px] flex-1" maxLength={80} />
        <Input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="€/mese" className="h-8 w-24" />
        <Button size="sm" className="gap-1.5" disabled={create.isPending || !name.trim()} onClick={() => create.mutate()}>
          {create.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Crea
        </Button>
      </div>
    </div>
  );
}

