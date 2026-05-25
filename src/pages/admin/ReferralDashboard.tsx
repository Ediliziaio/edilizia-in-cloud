import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Gift, Plus, AlertCircle, RefreshCw, Loader2, BarChart3, Wallet, Award, Compass, MousePointerClick, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ReferralStatCards } from "@/components/admin/referral/ReferralStatCards";
import { ReferralTable } from "@/components/admin/referral/ReferralTable";
import { ReferralAnalytics } from "@/components/admin/referral/ReferralAnalytics";
import { ReferrerDialog } from "@/components/admin/referral/ReferrerDialog";
import { ReferrerDetailDialog } from "@/components/admin/referral/ReferrerDetailDialog";
import { PayoutDialog } from "@/components/admin/referral/PayoutDialog";
import { PayoutApprovalTab } from "@/components/admin/referral/PayoutApprovalTab";
import { TierMaterialsTab } from "@/components/admin/referral/TierMaterialsTab";
import { useSuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";
import { AccessDenied } from "@/components/admin/AccessDenied";
import { ReferralCommandCenter } from "@/components/admin/referral/ReferralCommandCenter";
import { ReferralConversionsPanel } from "@/components/admin/referral/ReferralConversionsPanel";
import { ReferralRulesPanel } from "@/components/admin/referral/ReferralRulesPanel";
import type { Json } from "@/integrations/supabase/types";

export interface Referrer {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  referral_code: string;
  commission_type: string;
  commission_value: number;
  is_active: boolean;
  notes: string | null;
  total_earned: number;
  total_paid: number;
  created_at: string;
  tier_id: string | null;
  total_clicks: number;
  total_conversions: number;
  conversion_rate: number;
  partner_type: string | null;
  has_accepted_terms?: boolean | null;
  last_event_at?: string | null;
  parent_referrer_id?: string | null;
  payout_details?: Json | null;
  payout_method?: string | null;
  public_profile_enabled?: boolean | null;
  referral_link?: string | null;
  sublevel_commission_pct?: number | null;
  referral_tiers?: {
    name: string | null;
    icon: string | null;
    color: string | null;
    slug: string;
    commission_addon_pct?: number | null;
    commission_multiplier?: number | null;
    commission_plan_pct?: number | null;
    min_active_companies?: number | null;
    position?: number | null;
  } | null;
}

export interface ReferralCompany {
  id: string;
  referrer_id: string;
  company_id: string;
  referred_at: string;
  is_active: boolean;
  notes: string | null;
  company?: { id: string; name: string; status: string; subscription_plan_id: string | null };
  plan?: { price_monthly: number } | null;
}

export interface ReferralPayout {
  id: string;
  referrer_id: string;
  amount: number;
  period_start: string;
  period_end: string;
  paid_at: string | null;
  payment_method: string | null;
  notes: string | null;
  created_at: string;
  status?: string;
}

export interface ReferralClick {
  id: string;
  referrer_id: string;
  referral_code: string;
  created_at: string | null;
  converted: boolean | null;
  converted_at: string | null;
  converted_company_id: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  landing_page: string | null;
  device_hash: string | null;
  dedupe_key: string | null;
}

export interface ReferralEvent {
  id: string;
  event_type: string;
  referrer_id: string | null;
  referral_code: string | null;
  company_id: string | null;
  click_id: string | null;
  user_id: string | null;
  event_payload: Json;
  created_at: string;
}

export interface ReferralLedgerEntry {
  id: string;
  referrer_id: string;
  company_id: string;
  period_month: number;
  period_year: number;
  subscription_plan_name: string | null;
  plan_mrr: number | null;
  commission_type: string | null;
  commission_rate: number | null;
  tier_multiplier: number | null;
  commission_amount: number | null;
  status: string | null;
  payout_id: string | null;
  notes: string | null;
  calculated_at: string | null;
}

export interface ReferralFraudLog {
  id: string;
  referrer_id: string | null;
  company_id: string | null;
  fraud_type: string;
  details: Json | null;
  detected_at: string | null;
}

type CompanyLookupRow = { id: string; name: string; status: string; subscription_plan_id: string | null };
type PlanLookupRow = { id: string; price_monthly: number };

export default function ReferralDashboard() {
  const { permissions: saPermissions } = useSuperAdminPermissions();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("regia");
  const [referrerDialogOpen, setReferrerDialogOpen] = useState(false);
  const [editingReferrer, setEditingReferrer] = useState<Referrer | null>(null);
  const [detailReferrer, setDetailReferrer] = useState<Referrer | null>(null);
  const [payoutReferrer, setPayoutReferrer] = useState<Referrer | null>(null);

  const { data: referrers = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["referrers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("referrers")
        .select("*, referral_tiers(name, icon, color, slug, commission_multiplier, commission_plan_pct, commission_addon_pct, min_active_companies, position)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Referrer[];
    },
    staleTime: 120000,
  });

  const { data: referralCompanies = [], isError: referralCompaniesError } = useQuery({
    queryKey: ["referral_companies"],
    queryFn: async () => {
      const { data, error } = await supabase.from("referral_companies").select("*");
      if (error) throw error;
      const rows = (data ?? []) as ReferralCompany[];
      if (rows.length === 0) return [] as ReferralCompany[];
      const companyIds = [...new Set(rows.map((rc) => rc.company_id).filter(Boolean))];
      const { data: companies, error: companiesError } = companyIds.length > 0
        ? await supabase.from("companies").select("id, name, status, subscription_plan_id").in("id", companyIds)
        : { data: [] as CompanyLookupRow[], error: null };
      if (companiesError) throw companiesError;
      const planIds = [...new Set((companies || []).filter(c => c.subscription_plan_id).map(c => c.subscription_plan_id!))];
      const { data: plans, error: plansError } = planIds.length > 0
        ? await supabase.from("subscription_plans").select("id, price_monthly").in("id", planIds)
        : { data: [] as PlanLookupRow[], error: null };
      if (plansError) throw plansError;
      return rows.map((rc) => {
        const company = companies?.find(c => c.id === rc.company_id);
        const plan = company?.subscription_plan_id ? plans?.find(p => p.id === company.subscription_plan_id) : null;
        return { ...rc, company, plan };
      }) as ReferralCompany[];
    },
    staleTime: 120000,
  });

  const { data: payouts = [] } = useQuery({
    queryKey: ["referral_payouts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("referral_payouts").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ReferralPayout[];
    },
    staleTime: 120000,
  });

  const { data: pendingPayoutCount = 0 } = useQuery({
    queryKey: ["pending-payout-count"],
    queryFn: async () => {
      const { count, error } = await supabase.from("referral_payouts").select("id", { count: "exact", head: true }).eq("status", "pending");
      if (error) throw error;
      return count || 0;
    },
    staleTime: 60000,
  });

  const since90Days = new Date(Date.now() - 90 * 86_400_000).toISOString();

  const { data: referralClicks = [], isError: referralClicksError } = useQuery({
    queryKey: ["referral_clicks", "admin", "90d"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("referral_clicks")
        .select("id, referrer_id, referral_code, created_at, converted, converted_at, converted_company_id, utm_source, utm_medium, utm_campaign, landing_page, device_hash, dedupe_key")
        .gte("created_at", since90Days)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as ReferralClick[];
    },
    staleTime: 60000,
  });

  const { data: referralEvents = [], isError: referralEventsError } = useQuery({
    queryKey: ["referral_events", "admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("referral_events")
        .select("id, event_type, referrer_id, referral_code, company_id, click_id, user_id, event_payload, created_at")
        .order("created_at", { ascending: false })
        .limit(120);
      if (error) throw error;
      return (data ?? []) as ReferralEvent[];
    },
    staleTime: 60000,
  });

  const { data: referralLedger = [], isError: referralLedgerError } = useQuery({
    queryKey: ["referral_commission_ledger", "admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("referral_commission_ledger")
        .select("id, referrer_id, company_id, period_month, period_year, subscription_plan_name, plan_mrr, commission_type, commission_rate, tier_multiplier, commission_amount, status, payout_id, notes, calculated_at")
        .order("calculated_at", { ascending: false, nullsFirst: false })
        .limit(250);
      if (error) throw error;
      return (data ?? []) as ReferralLedgerEntry[];
    },
    staleTime: 60000,
  });

  const { data: referralFraudLogs = [], isError: referralFraudLogsError } = useQuery({
    queryKey: ["referral_fraud_log", "admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("referral_fraud_log")
        .select("id, referrer_id, company_id, fraud_type, details, detected_at")
        .order("detected_at", { ascending: false, nullsFirst: false })
        .limit(80);
      if (error) throw error;
      return (data ?? []) as ReferralFraudLog[];
    },
    staleTime: 60000,
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("referrers").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["referrers"] });
      toast.success("Stato aggiornato");
    },
    onError: (err: unknown) => toast.error("Errore", { description: err instanceof Error ? err.message : "Aggiornamento non riuscito" }),
  });

  const handleEdit = (referrer: Referrer) => {
    setEditingReferrer(referrer);
    setReferrerDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setReferrerDialogOpen(false);
    setEditingReferrer(null);
  };

  const getMonthlyCommission = (referrer: Referrer) => {
    const companies = referralCompanies.filter(
      (rc) => rc.referrer_id === referrer.id && rc.is_active && rc.company?.status === "active",
    );
    return companies.reduce((total, rc) => {
      const mrr = rc.plan?.price_monthly || 0;
      if (referrer.commission_type === "percentage") return total + mrr * (referrer.commission_value / 100);
      return total + referrer.commission_value;
    }, 0);
  };

  const getCompanyCount = (referrerId: string) =>
    referralCompanies.filter(rc => rc.referrer_id === referrerId).length;

  if (!saPermissions.can_manage_referrals) return <AccessDenied />;

  if (isLoading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Programma Referral</h1>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>Errore nel caricamento dei referrer.</span>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-3 w-3 mr-1" /> Riprova
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="hidden md:flex items-center gap-3">
          <Gift className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Programma Referral</h1>
            <p className="text-muted-foreground">Gestisci affiliati, commissioni e payout · <span className="text-xs italic">Commissioni calcolate sul prezzo di listino</span></p>
          </div>
        </div>
        <Button onClick={() => setReferrerDialogOpen(true)} className="self-end sm:self-auto">
          <Plus className="h-4 w-4 mr-2" /> Nuovo Referrer
        </Button>
      </div>

      <ReferralStatCards
        referrers={referrers}
        referralCompanies={referralCompanies}
        getMonthlyCommission={getMonthlyCommission}
      />

      {referralCompaniesError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Aziende referral non caricate: commissioni e analytics potrebbero essere parziali.
          </AlertDescription>
        </Alert>
      )}

      {(referralClicksError || referralEventsError || referralLedgerError || referralFraudLogsError) && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Alcuni log referral avanzati non sono disponibili: la dashboard resta utilizzabile con dati parziali.
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex h-auto flex-wrap justify-start gap-1 bg-muted/60 p-1">
          <TabsTrigger value="regia">
            <Compass className="h-4 w-4 mr-2" /> Regia
          </TabsTrigger>
          <TabsTrigger value="referrers">
            <Gift className="h-4 w-4 mr-2" /> Partner
          </TabsTrigger>
          <TabsTrigger value="conversions">
            <MousePointerClick className="h-4 w-4 mr-2" /> Conversioni
          </TabsTrigger>
          <TabsTrigger value="analytics">
            <BarChart3 className="h-4 w-4 mr-2" /> Analytics
          </TabsTrigger>
          <TabsTrigger value="payouts" className="relative">
            <Wallet className="h-4 w-4 mr-2" /> Payout
            {pendingPayoutCount > 0 && (
              <Badge variant="destructive" className="ml-1.5 h-5 min-w-5 px-1 text-xs">
                {pendingPayoutCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="tiers">
            <Award className="h-4 w-4 mr-2" /> Tier & Materiali
          </TabsTrigger>
          <TabsTrigger value="rules">
            <SlidersHorizontal className="h-4 w-4 mr-2" /> Regole
          </TabsTrigger>
        </TabsList>

        <TabsContent value="regia" className="space-y-4 mt-4">
          <ReferralCommandCenter
            referrers={referrers}
            referralCompanies={referralCompanies}
            payouts={payouts}
            clicks={referralClicks}
            events={referralEvents}
            fraudLogs={referralFraudLogs}
            getMonthlyCommission={getMonthlyCommission}
            onSelectTab={setActiveTab}
            onDetail={setDetailReferrer}
            onPayout={setPayoutReferrer}
          />
        </TabsContent>

        <TabsContent value="referrers" className="space-y-4 mt-4">
          <ReferralTable
            referrers={referrers}
            isLoading={isLoading}
            getCompanyCount={getCompanyCount}
            getMonthlyCommission={getMonthlyCommission}
            onEdit={handleEdit}
            onDetail={setDetailReferrer}
            onPayout={setPayoutReferrer}
            isToggling={toggleActiveMutation.isPending}
            onToggleActive={(id, active) => toggleActiveMutation.mutate({ id, is_active: active })}
            onTierRecalculated={() => queryClient.invalidateQueries({ queryKey: ["referrers"] })}
          />
        </TabsContent>

        <TabsContent value="conversions" className="mt-4">
          <ReferralConversionsPanel
            referrers={referrers}
            referralCompanies={referralCompanies}
            clicks={referralClicks}
            onDetail={setDetailReferrer}
          />
        </TabsContent>

        <TabsContent value="analytics" className="mt-4">
          <ReferralAnalytics
            referrers={referrers}
            referralCompanies={referralCompanies}
            payouts={payouts}
            getMonthlyCommission={getMonthlyCommission}
          />
        </TabsContent>

        <TabsContent value="payouts" className="mt-4">
          <PayoutApprovalTab />
        </TabsContent>

        <TabsContent value="tiers" className="mt-4">
          <TierMaterialsTab />
        </TabsContent>

        <TabsContent value="rules" className="mt-4">
          <ReferralRulesPanel
            referrers={referrers}
            ledger={referralLedger}
            payouts={payouts}
            fraudLogs={referralFraudLogs}
          />
        </TabsContent>
      </Tabs>

      <ReferrerDialog open={referrerDialogOpen} onOpenChange={handleCloseDialog} referrer={editingReferrer} />
      <ReferrerDetailDialog
        referrer={detailReferrer}
        onOpenChange={() => setDetailReferrer(null)}
        referralCompanies={referralCompanies.filter(rc => rc.referrer_id === detailReferrer?.id)}
        payouts={payouts.filter(p => p.referrer_id === detailReferrer?.id)}
        clicks={referralClicks.filter((click) => click.referrer_id === detailReferrer?.id)}
        events={referralEvents.filter((event) => event.referrer_id === detailReferrer?.id)}
        ledger={referralLedger.filter((entry) => entry.referrer_id === detailReferrer?.id)}
        fraudLogs={referralFraudLogs.filter((log) => log.referrer_id === detailReferrer?.id)}
      />
      <PayoutDialog referrer={payoutReferrer} onOpenChange={() => setPayoutReferrer(null)} />
    </div>
  );
}
