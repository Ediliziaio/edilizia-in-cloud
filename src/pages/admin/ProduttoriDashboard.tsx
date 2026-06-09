import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useSuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";
import { AccessDenied } from "@/components/admin/AccessDenied";
import { CreateProduttoreDialog } from "@/components/admin/produttori/CreateProduttoreDialog";
import { cn } from "@/lib/utils";
import { companyStatusLabelIt } from "@/lib/companyStatusLabel";
import {
  Factory, Users, Building2, Plus, ChevronDown, ChevronRight, AlertCircle, RefreshCw,
  BadgeEuro, Globe, ShieldCheck, CreditCard, Mail,
} from "lucide-react";

interface Rivenditore {
  id: string;
  name: string;
  status: string | null;
  billing_comped: boolean | null;
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
    .select("id, name, email, status, reseller_billing_mode, created_at")
    .in("id", ids);
  if (e2) throw new Error(e2.message);

  // 2. Rivenditori (figli) di tutti i produttori.
  const { data: rivs, error: e3 } = await sb
    .from("companies")
    .select("id, name, parent_company_id, billing_comped, status")
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
    arr.push({ id: r.id, name: r.name, status: r.status, billing_comped: r.billing_comped });
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
  const totals = data?.totals ?? { produttori: 0, rivenditori: 0, comped: 0 };

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

      {/* KPI */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard icon={<Factory className="h-5 w-5" />} value={totals.produttori} label="Produttori" tone="default" />
        <StatCard icon={<Users className="h-5 w-5" />} value={totals.rivenditori} label="Rivenditori totali" tone="blue" />
        <StatCard icon={<BadgeEuro className="h-5 w-5" />} value={totals.comped} label="Rivenditori comped (paga il produttore)" tone="emerald" />
      </div>

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

function StatCard({ icon, value, label, tone }: { icon: React.ReactNode; value: number; label: string; tone: "default" | "blue" | "emerald" }) {
  const toneCls = tone === "blue" ? "bg-blue-100 text-blue-700" : tone === "emerald" ? "bg-emerald-100 text-emerald-700" : "bg-muted";
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-4">
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", toneCls)}>{icon}</div>
        <div className="min-w-0">
          <div className="text-2xl font-bold leading-none">{value}</div>
          <div className="mt-1 text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}
