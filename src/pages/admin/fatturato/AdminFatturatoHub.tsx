/**
 * AdminFatturatoHub — pagina hub per tutta l'area Fatturato (Superadmin)
 *
 * Sostituisce 5 voci separate nella sidebar (Revenue, Piani, Fatture, Promo,
 * Dunning) con un'unica pagina che ha:
 *   1. Hero header in stile "Commesse" (icona arancio + titolo + actions)
 *   2. Tab di navigazione sotto (Revenue · Piani · Fatture · Promo · Dunning)
 *   3. Riepilogo dark blue + chart (visibile solo nel tab "Revenue" — KPI top)
 *   4. Status cards quick-filter
 *   5. Contenuto del tab attivo
 *
 * Coerenza UX: stesso pattern di /azienda/ordini (Commesse).
 */
import { lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Wallet,
  LineChart as LineChartIcon,
  CreditCard,
  FileText,
  Ticket,
  Settings2,
  Users,
  TrendingUp,
  ShieldCheck,
  DollarSign,
  Euro,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Bar,
  Line,
  Tooltip as RechartsTooltip,
} from "recharts";
import { useSuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { AdminHeroHeader } from "@/components/admin/AdminHeroHeader";
import { AdminSummaryPanel } from "@/components/admin/AdminSummaryPanel";
import { AdminStatusCards } from "@/components/admin/AdminStatusCards";
import { AdminHubTabs, type AdminHubTab } from "@/components/admin/AdminHubTabs";
import {
  getAdminRevenueBreakdown,
  isRevenueEligibleCompany,
  type AdminRevenueCompanyLike,
} from "@/lib/adminRevenue";

// Tutte le pagine sono lazy-loaded — solo il tab attivo paga il bundle cost.
const AdminRevenueDashboard = lazy(() => import("@/pages/admin/AdminRevenueDashboard"));
const SubscriptionPlans = lazy(() => import("@/pages/admin/SubscriptionPlans"));
const AdminInvoiceHistory = lazy(() => import("@/pages/admin/AdminInvoiceHistory"));
const PromoCodes = lazy(() => import("@/pages/admin/PromoCodes"));
const AdminDunningConfig = lazy(() => import("@/pages/admin/AdminDunningConfig"));

type FatturatoTab = "revenue" | "piani" | "fatture" | "promo" | "dunning";

const VALID_TABS: readonly FatturatoTab[] = ["revenue", "piani", "fatture", "promo", "dunning"];

function isValidTab(value: string | null): value is FatturatoTab {
  return value != null && (VALID_TABS as readonly string[]).includes(value);
}

const fmtCurrency = (n: number) =>
  n.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

/** Riepilogo top-level fatturato — versione "leggera" del dashboard revenue. */
function useFatturatoSnapshot() {
  return useQuery({
    queryKey: ["admin-fatturato-snapshot"],
    queryFn: async () => {
      const [subsRes, snapshotsRes] = await Promise.all([
        supabase
          .from("companies")
          .select("id,status,payment_method,stripe_customer_id,stripe_subscription_status,is_platform_admin_company,subscription_plan_id,subscription_plans:subscription_plan_id(price_monthly,price_yearly),company_subscriptions(status,stripe_subscription_id,billing_period)")
          .eq("is_platform_admin_company", false),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("mrr_snapshots")
          .select("data, mrr_stripe_cents, mrr_interno_cents, aziende_attive_stripe")
          .order("data", { ascending: false })
          .limit(12),
      ]);

      if (subsRes.error) throw subsRes.error;
      const companies = (subsRes.data ?? []) as AdminRevenueCompanyLike[];
      const breakdown = getAdminRevenueBreakdown(companies);
      const paidCompanies = companies.filter(isRevenueEligibleCompany);
      const mrr = breakdown.mrr;
      const arr = mrr * 12;
      const arpu = breakdown.payingCompanies > 0 ? mrr / breakdown.payingCompanies : 0;

      // Chart: ultimi 12 mesi di MRR snapshot (cents → euros).
      // Un errore qui NON è fatale (i KPI vengono da subsRes) ma nemmeno
      // silente: prima finiva mascherato da "Nessun snapshot MRR disponibile"
      // come fosse un dato reale.
      const chartError = !!snapshotsRes.error;
      const snapshots = (snapshotsRes.data ?? []) as Array<{
        data: string;
        mrr_stripe_cents: number;
        mrr_interno_cents: number;
        aziende_attive_stripe: number;
      }>;
      const chart = snapshots
        .slice()
        .reverse()
        .map((s) => ({
          mese: new Date(s.data).toLocaleDateString("it-IT", { month: "short", year: "2-digit" }),
          mrrStripe: Math.round(s.mrr_stripe_cents / 100),
          mrrInterno: Math.round(s.mrr_interno_cents / 100),
          aziende: s.aziende_attive_stripe,
        }));

      return {
        mrr,
        arr,
        arpu,
        payingCount: breakdown.payingCompanies,
        totalCompanies: breakdown.totalCompanies,
        accessActiveCompanies: breakdown.accessActiveCompanies,
        paidCount: paidCompanies.length,
        excludedMrr: breakdown.excludedMrr,
        chart,
        chartError,
      };
    },
    staleTime: 5 * 60_000,
  });
}

export default function AdminFatturatoHub() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { permissions } = useSuperAdminPermissions();
  const { data: snapshot, isLoading, refetch, isFetching } = useFatturatoSnapshot();

  const tabParam = searchParams.get("tab");
  const requestedTab: FatturatoTab = isValidTab(tabParam) ? tabParam : "revenue";

  const tabs = [
    {
      id: "revenue" as const,
      label: "Revenue",
      icon: LineChartIcon,
      show: permissions.billing_read,
      description: "KPI ARR, MRR, churn",
    },
    {
      id: "piani" as const,
      label: "Piani",
      icon: CreditCard,
      show: permissions.can_manage_plans,
      description: "Catalogo piani e pricing",
    },
    {
      id: "fatture" as const,
      label: "Fatture",
      icon: FileText,
      show: permissions.billing_read,
      description: "Storico fatture emesse",
    },
    {
      id: "promo" as const,
      label: "Promo",
      icon: Ticket,
      show: permissions.billing_write,
      description: "Codici sconto e campagne",
    },
    {
      id: "dunning" as const,
      label: "Dunning",
      icon: Settings2,
      show: permissions.billing_write,
      description: "Recupero crediti & solleciti",
    },
  ].filter((t) => t.show);

  const activeTab: FatturatoTab = tabs.some((t) => t.id === requestedTab)
    ? requestedTab
    : (tabs[0]?.id ?? "revenue");

  const handleTabChange = (tab: FatturatoTab) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (tab === "revenue") next.delete("tab");
        else next.set("tab", tab);
        return next;
      },
      { replace: true },
    );
  };

  return (
    <div className="space-y-4 pb-20 sm:space-y-6 sm:pb-0">
      {/* ─── Hero header in stile Commesse ──────────────────────────────── */}
      <AdminHeroHeader
        icon={Wallet}
        title="Fatturato"
        subtitle="Revenue, piani, fatture, promo e dunning in un'unica vista."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refetch()}
              disabled={isFetching}
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              Aggiorna
            </Button>
          </>
        }
      />

      {/* ─── Tab navigation in alto ─────────────────────────────────────── */}
      <AdminHubTabs<FatturatoTab>
        activeTab={activeTab}
        onChange={handleTabChange}
        ariaLabel="Sezioni fatturato"
        tabs={tabs as AdminHubTab<FatturatoTab>[]}
      />

      {/* ─── Riepilogo top-level: visibile SOLO sul tab Revenue (default) ─
         Sugli altri tab il dashboard interno della pagina mostra già metriche
         specifiche, evitiamo rumore visivo. */}
      {activeTab === "revenue" && (
        <>
          <AdminSummaryPanel
            icon={Wallet}
            eyebrow="Riepilogo fatturato"
            title="Vista economica piattaforma"
            subtitle="MRR, ARR e aziende paganti calcolati in tempo reale."
            kpis={[
              {
                label: "MRR pagante",
                value: isLoading ? <Skeleton className="h-6 w-20 bg-white/20" /> : fmtCurrency(snapshot?.mrr ?? 0),
                caption: "ricavo mensile reale",
                icon: DollarSign,
                tone: "emerald",
              },
              {
                label: "ARR proiettato",
                value: isLoading ? <Skeleton className="h-6 w-24 bg-white/20" /> : fmtCurrency(snapshot?.arr ?? 0),
                caption: "MRR × 12 mesi",
                icon: TrendingUp,
                tone: "blue",
              },
              {
                label: "Aziende paganti",
                value: isLoading ? <Skeleton className="h-6 w-10 bg-white/20" /> : (snapshot?.payingCount ?? 0),
                caption: `${snapshot?.accessActiveCompanies ?? 0} con accesso attivo`,
                icon: ShieldCheck,
                tone: "orange",
              },
              {
                label: "ARPU",
                value: isLoading ? <Skeleton className="h-6 w-16 bg-white/20" /> : fmtCurrency(snapshot?.arpu ?? 0),
                caption: "ricavo medio per cliente",
                icon: Euro,
                tone: "orange",
              },
            ]}
            chartEyebrow="Andamento 12 mesi"
            chartTitle="MRR Stripe + interno"
            chartLegend={[
              { label: "MRR Stripe", color: "blue" },
              { label: "MRR Interno", color: "orange" },
              { label: "N. aziende", color: "slate" },
            ]}
            chartQuickStats={[
              {
                label: "MRR Corrente",
                value: isLoading ? <Skeleton className="h-5 w-20" /> : fmtCurrency(snapshot?.mrr ?? 0),
                tone: "blue",
              },
              {
                label: "ARR",
                value: isLoading ? <Skeleton className="h-5 w-20" /> : fmtCurrency(snapshot?.arr ?? 0),
                tone: "orange",
              },
              {
                label: "Paganti",
                value: isLoading ? <Skeleton className="h-5 w-10" /> : String(snapshot?.payingCount ?? 0),
                tone: "neutral",
              },
            ]}
          >
            {isLoading ? (
              <div className="flex h-full items-end gap-2 px-2 pb-4">
                {[60, 92, 48, 130, 78, 155, 105, 184].map((height, index) => (
                  <Skeleton key={index} className="flex-1 rounded-t-md" style={{ height }} />
                ))}
              </div>
            ) : snapshot?.chartError ? (
              <div className="grid h-full place-items-center text-center">
                <div>
                  <p className="text-sm font-medium text-slate-700">Storico MRR non caricato</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Errore nel leggere <code className="rounded bg-slate-100 px-1 text-[10px]">mrr_snapshots</code>.
                  </p>
                  <button
                    type="button"
                    onClick={() => void refetch()}
                    className="mt-2 text-xs font-medium text-blue-600 underline underline-offset-2"
                  >
                    {isFetching ? "Ricarico…" : "Riprova"}
                  </button>
                </div>
              </div>
            ) : (snapshot?.chart.length ?? 0) === 0 ? (
              <div className="grid h-full place-items-center text-center">
                <div>
                  <p className="text-sm font-medium text-slate-700">Nessun snapshot MRR disponibile</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Il cron giornaliero popolerà <code className="rounded bg-slate-100 px-1 text-[10px]">mrr_snapshots</code> entro 24h.
                  </p>
                </div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={snapshot?.chart ?? []} margin={{ top: 8, right: 2, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#edf2f7" />
                  <XAxis dataKey="mese" tickLine={false} axisLine={false} fontSize={11} stroke="#64748b" />
                  <YAxis
                    yAxisId="money"
                    tickLine={false}
                    axisLine={false}
                    fontSize={10}
                    stroke="#94a3b8"
                    tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`}
                  />
                  <YAxis
                    yAxisId="count"
                    orientation="right"
                    tickLine={false}
                    axisLine={false}
                    fontSize={10}
                    stroke="#94a3b8"
                    allowDecimals={false}
                  />
                  <RechartsTooltip
                    cursor={{ fill: "rgba(15, 23, 42, 0.04)" }}
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid #e2e8f0",
                      boxShadow: "0 12px 30px rgba(15, 23, 42, 0.12)",
                    }}
                    formatter={(value, name) => {
                      if (name === "aziende") return [Number(value).toLocaleString("it-IT"), "Aziende"];
                      return [
                        Number(value).toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }),
                        name === "mrrStripe" ? "MRR Stripe" : "MRR Interno",
                      ];
                    }}
                  />
                  <Bar yAxisId="money" dataKey="mrrStripe" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={14} />
                  <Bar yAxisId="money" dataKey="mrrInterno" fill="#f97316" radius={[4, 4, 0, 0]} barSize={14} />
                  <Line yAxisId="count" type="monotone" dataKey="aziende" stroke="#0f172a" strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </AdminSummaryPanel>

          {/* ─── Status cards quick filter ─────────────────────────────── */}
          <AdminStatusCards
            cards={[
              {
                label: "Paganti",
                value: isLoading ? "…" : String(snapshot?.payingCount ?? 0),
                caption: "aziende con MRR reale",
                icon: ShieldCheck,
                tone: "emerald",
              },
              {
                label: "Totale aziende",
                value: isLoading ? "…" : String(snapshot?.totalCompanies ?? 0),
                caption: "registrate in piattaforma",
                icon: Users,
                tone: "blue",
              },
              {
                label: "Non paganti attive",
                value: isLoading ? "…" : String((snapshot?.accessActiveCompanies ?? 0) - (snapshot?.payingCount ?? 0)),
                caption: "accesso attivo, no MRR",
                icon: AlertCircle,
                tone: "amber",
              },
              {
                label: "MRR escluso",
                value: isLoading ? "…" : fmtCurrency(snapshot?.excludedMrr ?? 0),
                caption: "valore teorico non incassato",
                icon: TrendingUp,
                tone: "orange",
              },
            ]}
          />
        </>
      )}

      {/* ─── Tab content ────────────────────────────────────────────────── */}
      <Suspense fallback={<HubTabSkeleton />}>
        {activeTab === "revenue" && <AdminRevenueDashboard />}
        {activeTab === "piani" && <SubscriptionPlans />}
        {activeTab === "fatture" && <AdminInvoiceHistory />}
        {activeTab === "promo" && <PromoCodes />}
        {activeTab === "dunning" && <AdminDunningConfig />}
      </Suspense>
    </div>
  );
}

function HubTabSkeleton() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
      <Skeleton className="h-72 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
