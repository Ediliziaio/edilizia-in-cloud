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
import { monthlyMrrSeries, formatMrrAxis, type MrrSnapshot } from "@/lib/adminRevenueHistory";
import { lazy, Suspense } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Wallet,
  LineChart as LineChartIcon,
  Package as PackageIcon,
  CreditCard,
  FileText,
  Ticket,
  Settings2,
  Users,
  TrendingUp,
  Euro,
  AlertCircle,
  RefreshCw,
  Sparkles,
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
import { AdminHubTabs, type AdminHubTab } from "@/components/admin/AdminHubTabs";
import { RigaRiepilogo } from "@/components/admin/fatturato/AreaUI";
import {
  getAdminRevenueBreakdown,
  isRevenueEligibleCompany,
  applyPlanPriceOverride,
  ADMIN_REVENUE_COMPANY_SELECT,
  type AdminRevenueCompanyLike,
} from "@/lib/adminRevenue";

// Tutte le pagine sono lazy-loaded — solo il tab attivo paga il bundle cost.
const AdminRevenueDashboard = lazy(() => import("@/pages/admin/AdminRevenueDashboard"));
const ServiziFatturatoTab = lazy(() => import("@/components/admin/fatturato/ServiziFatturatoTab").then((m) => ({ default: m.ServiziFatturatoTab })));
const SubscriptionPlans = lazy(() => import("@/pages/admin/SubscriptionPlans"));
const AdminInvoiceHistory = lazy(() => import("@/pages/admin/AdminInvoiceHistory"));
const PromoCodes = lazy(() => import("@/pages/admin/PromoCodes"));
const AdminDunningConfig = lazy(() => import("@/pages/admin/AdminDunningConfig"));

type FatturatoTab = "revenue" | "servizi" | "piani" | "fatture" | "promo" | "dunning";

const VALID_TABS: readonly FatturatoTab[] = ["revenue", "servizi", "piani", "fatture", "promo", "dunning"];

function isValidTab(value: string | null): value is FatturatoTab {
  return value != null && (VALID_TABS as readonly string[]).includes(value);
}

const fmtCurrency = (n: number) =>
  n.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" });

/** Riepilogo top-level fatturato — versione "leggera" del dashboard revenue. */
function useFatturatoSnapshot() {
  return useQuery({
    queryKey: ["admin-fatturato-snapshot", "monthly-v2"],
    queryFn: async () => {
      const since = new Date();
      since.setDate(1);
      since.setMonth(since.getMonth() - 11);
      const fromDate = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, "0")}-01`;
      const oggi = new Date();
      const inizioMese = new Date(oggi.getFullYear(), oggi.getMonth(), 1);
      const meseCorrente = `${oggi.getFullYear()}-${String(oggi.getMonth() + 1).padStart(2, "0")}`;
      const [subsRes, snapshotsRes, serviziRes, extraRes] = await Promise.all([
        // Stessa select e stessa regola dell'elenco Aziende (KPI «MRR pagante»):
        // niente azienda di piattaforma, niente cancellate, prezzo custom dove c'è.
        supabase
          .from("companies")
          .select(ADMIN_REVENUE_COMPANY_SELECT)
          .eq("is_platform_admin_company", false)
          .is("deleted_at", null),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("mrr_snapshots")
          .select("data, mrr_stripe_cents, mrr_interno_cents, aziende_attive_stripe")
          .gte("data", fromDate)
          .order("data", { ascending: false })
          .limit(400),
        // Canale «Servizi»: incassato del mese dai clienti-servizio.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("aedix_service_billings")
          .select("importo_incassato,periodo")
          .gte("periodo", `${meseCorrente}-01`)
          .limit(5000),
        // Canali «Add-on» (SMS, WhatsApp, email) e «Render e AI»: ricavo del mese.
        supabase.rpc("get_extra_services_economics" as never, {
          _from: inizioMese.toISOString(),
          _to: oggi.toISOString(),
        } as never),
      ]);

      if (subsRes.error) throw subsRes.error;
      const companies = applyPlanPriceOverride((subsRes.data ?? []) as AdminRevenueCompanyLike[]);
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
      const chart = monthlyMrrSeries((snapshotsRes.data ?? []) as MrrSnapshot[]);

      // I canali secondari non fermano la pagina: se una fonte non risponde la
      // card dice «non disponibile» invece di mostrare 0 € come fosse vero.
      const serviziMese = serviziRes.error
        ? null
        : ((serviziRes.data ?? []) as { importo_incassato: number | null; periodo: string | null }[])
            .filter((b) => (b.periodo ?? "").slice(0, 7) === meseCorrente)
            .reduce((t, b) => t + (Number(b.importo_incassato) || 0), 0);
      const extra = extraRes.error
        ? null
        : ((extraRes.data as unknown as { servizi?: { key: string; revenue: number | null }[] } | null)?.servizi ?? []);
      const ricavoDi = (chiavi: string[]) =>
        extra == null ? null : extra.filter((x) => chiavi.includes(x.key)).reduce((t, x) => t + (Number(x.revenue) || 0), 0);

      return {
        mrr,
        arr,
        serviziMese,
        addonMese: ricavoDi(["sms", "whatsapp", "email"]),
        renderAiMese: ricavoDi(["render", "ai"]),
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
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { permissions } = useSuperAdminPermissions();
  const { data: snapshot, isLoading, refetch, isFetching } = useFatturatoSnapshot();
  const queryClient = useQueryClient();
  // «Aggiorna» ricarica il riepilogo e anche i dati del tab Ricavi sotto.
  const aggiorna = () => {
    void refetch();
    void queryClient.invalidateQueries({ queryKey: ["admin-revenue-dashboard"] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "mrr-snapshots"] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "servizi-fatturato"] });
  };

  const tabParam = searchParams.get("tab");
  const requestedTab: FatturatoTab = isValidTab(tabParam) ? tabParam : "revenue";

  const tabs = [
    {
      id: "revenue" as const,
      label: "Ricavi",
      icon: LineChartIcon,
      show: permissions.billing_read,
      description: "KPI ARR, MRR, churn",
    },
    {
      id: "servizi" as const,
      label: "Servizi",
      icon: PackageIcon,
      show: permissions.billing_read,
      description: "Fatturato e incassato dei servizi (consulenze, agenzia, performance)",
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
      label: "Recupero pagamenti",
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
        subtitle="Quanto entra, da quale canale, e chi deve ancora pagare."
        actions={
          <>
            {/* bottone, non link: l'intestazione scura colora solo i bottoni (col link
                restava un rettangolo bianco vuoto) */}
            <Button variant="outline" size="sm" className="gap-2" aria-label="Insoluti" onClick={() => navigate("/admin/insoluti")}>
              <AlertCircle className="h-4 w-4" />
              <span className="hidden sm:inline">Insoluti</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={aggiorna}
              disabled={isFetching}
              className="gap-2"
              aria-label="Aggiorna"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Aggiorna</span>
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

      {/* ─── Ricavi per canale: sempre visibili, una card per fonte di
         incasso. Ogni card porta alla sezione che la spiega. ───────────── */}
      <RigaRiepilogo
        voci={[
          {
            etichetta: "Abbonamenti",
            icona: CreditCard,
            valore: isLoading ? "…" : fmtCurrency(snapshot?.mrr ?? 0),
            dettaglio: isLoading ? undefined : `al mese · ${snapshot?.payingCount ?? 0} paganti`,
            tono: "buono",
            onClick: activeTab === "revenue" ? undefined : () => handleTabChange("revenue"),
          },
          {
            etichetta: "Servizi",
            icona: PackageIcon,
            valore: isLoading ? "…" : snapshot?.serviziMese == null ? "n.d." : fmtCurrency(snapshot.serviziMese),
            dettaglio: snapshot?.serviziMese == null && !isLoading ? "dati non disponibili" : "incassato questo mese",
            tono: snapshot?.serviziMese == null ? "spento" : "neutro",
            onClick: tabs.some((t) => t.id === "servizi") && activeTab !== "servizi" ? () => handleTabChange("servizi") : undefined,
          },
          {
            etichetta: "Add-on",
            icona: Ticket,
            valore: isLoading ? "…" : snapshot?.addonMese == null ? "n.d." : fmtCurrency(snapshot.addonMese),
            dettaglio: snapshot?.addonMese == null && !isLoading ? "dati non disponibili" : "SMS, WhatsApp, email · mese",
            tono: snapshot?.addonMese == null ? "spento" : "neutro",
            to: "/admin/fatturato?vista=servizi-extra",
          },
          {
            etichetta: "Render e AI",
            icona: Sparkles,
            valore: isLoading ? "…" : snapshot?.renderAiMese == null ? "n.d." : fmtCurrency(snapshot.renderAiMese),
            dettaglio: snapshot?.renderAiMese == null && !isLoading ? "dati non disponibili" : "consumi pagati · mese",
            tono: snapshot?.renderAiMese == null ? "spento" : "neutro",
            to: "/admin/fatturato?vista=servizi-extra",
          },
        ]}
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
            subtitle="L'MRR pagante è nella prima card in alto: qui quello che ne deriva."
            kpis={[
              {
                label: "ARR proiettato",
                value: isLoading ? <Skeleton className="h-6 w-24 bg-white/20" /> : fmtCurrency(snapshot?.arr ?? 0),
                caption: "MRR × 12 mesi",
                icon: TrendingUp,
                tone: "blue",
              },
              {
                label: "Ricavo medio",
                value: isLoading ? <Skeleton className="h-6 w-16 bg-white/20" /> : fmtCurrency(snapshot?.arpu ?? 0),
                caption: "al mese per azienda pagante",
                icon: Euro,
                tone: "orange",
              },
              {
                label: "Aziende",
                value: isLoading ? <Skeleton className="h-6 w-16 bg-white/20" /> : `${snapshot?.accessActiveCompanies ?? 0} / ${snapshot?.totalCompanies ?? 0}`,
                caption: `con accesso / registrate · ${Math.max(0, (snapshot?.accessActiveCompanies ?? 0) - (snapshot?.payingCount ?? 0))} non pagano`,
                icon: Users,
                tone: "blue",
              },
              {
                label: "MRR escluso",
                value: isLoading ? <Skeleton className="h-6 w-16 bg-white/20" /> : fmtCurrency(snapshot?.excludedMrr ?? 0),
                caption: "listino delle aziende che non pagano",
                icon: TrendingUp,
                tone: "orange",
              },
            ]}
            chartEyebrow="Storico mensile disponibile · fino a 12 mesi"
            chartTitle="MRR per mese: Stripe e interno"
            chartLegend={[
              { label: "MRR Stripe", color: "blue" },
              { label: "MRR interno", color: "orange" },
              { label: "Aziende", color: "slate" },
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
                    tickFormatter={(value) => formatMrrAxis(Number(value))}
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
                        Number(value).toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" }),
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

          {/* La riga «Paganti / Totale aziende / Non paganti / MRR escluso» ripeteva
              numeri già sopra: è confluita nel riquadro. */}
        </>
      )}

      {/* ─── Tab content ────────────────────────────────────────────────── */}
      <Suspense fallback={<HubTabSkeleton />}>
        {activeTab === "revenue" && <AdminRevenueDashboard />}
        {activeTab === "servizi" && <ServiziFatturatoTab />}
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
