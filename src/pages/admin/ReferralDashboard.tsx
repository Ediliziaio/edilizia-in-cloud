import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Gift, Plus, AlertCircle, RefreshCw, Loader2, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { ReferralStatCards } from "@/components/admin/referral/ReferralStatCards";
import { ReferralTable } from "@/components/admin/referral/ReferralTable";
import { ReferralAnalytics } from "@/components/admin/referral/ReferralAnalytics";
import { ReferrerDialog } from "@/components/admin/referral/ReferrerDialog";
import { ReferrerDetailDialog } from "@/components/admin/referral/ReferrerDetailDialog";
import { PayoutDialog } from "@/components/admin/referral/PayoutDialog";
import { useSuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";
import { AccessDenied } from "@/components/admin/AccessDenied";

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
}

export interface ReferralCompany {
  id: string;
  referrer_id: string;
  company_id: string;
  referred_at: string;
  is_active: boolean;
  notes: string | null;
  company?: {
    id: string;
    name: string;
    status: string;
    subscription_plan_id: string | null;
  };
  plan?: {
    price_monthly: number;
  } | null;
}

export interface ReferralPayout {
  id: string;
  referrer_id: string;
  amount: number;
  period_start: string;
  period_end: string;
  paid_at: string;
  payment_method: string;
  notes: string | null;
  created_at: string;
}

export default function ReferralDashboard() {
  const { permissions: saPermissions } = useSuperAdminPermissions();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [referrerDialogOpen, setReferrerDialogOpen] = useState(false);
  const [editingReferrer, setEditingReferrer] = useState<Referrer | null>(null);
  const [detailReferrer, setDetailReferrer] = useState<Referrer | null>(null);
  const [payoutReferrer, setPayoutReferrer] = useState<Referrer | null>(null);

  const { data: referrers = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["referrers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("referrers")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Referrer[];
    },
    staleTime: 120000,
  });

  const { data: referralCompanies = [] } = useQuery({
    queryKey: ["referral_companies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("referral_companies")
        .select("*");
      if (error) throw error;
      if (data.length === 0) return [] as ReferralCompany[];

      const companyIds = [...new Set(data.map((rc: any) => rc.company_id))];
      const { data: companies } = await supabase
        .from("companies")
        .select("id, name, status, subscription_plan_id")
        .in("id", companyIds);
      
      const planIds = [...new Set((companies || []).filter(c => c.subscription_plan_id).map(c => c.subscription_plan_id!))];
      const { data: plans } = planIds.length > 0
        ? await supabase.from("subscription_plans").select("id, price_monthly").in("id", planIds)
        : { data: [] as { id: string; price_monthly: number }[] };

      return data.map((rc: any) => {
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
      const { data, error } = await supabase
        .from("referral_payouts")
        .select("*")
        .order("paid_at", { ascending: false });
      if (error) throw error;
      return data as ReferralPayout[];
    },
    staleTime: 120000,
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("referrers")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["referrers"] });
      toast({ title: "Stato aggiornato" });
    },
    onError: (err: any) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  const handleEdit = (referrer: Referrer) => {
    setEditingReferrer(referrer);
    setReferrerDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setReferrerDialogOpen(false);
    setEditingReferrer(null);
  };

  // Calculate monthly commissions per referrer
  const getMonthlyCommission = (referrer: Referrer) => {
    const companies = referralCompanies.filter(
      (rc) => rc.referrer_id === referrer.id && rc.is_active
    );
    return companies.reduce((total, rc) => {
      const mrr = rc.plan?.price_monthly || 0;
      if (referrer.commission_type === "percentage") {
        return total + mrr * (referrer.commission_value / 100);
      }
      return total + referrer.commission_value;
    }, 0);
  };

  const getCompanyCount = (referrerId: string) =>
    referralCompanies.filter((rc) => rc.referrer_id === referrerId).length;

  if (!saPermissions.can_manage_referrals) return <AccessDenied />;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
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
              <RefreshCw className="h-3 w-3 mr-1" />
              Riprova
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Gift className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Programma Referral</h1>
            <p className="text-muted-foreground">Gestisci affiliati e commissioni</p>
          </div>
        </div>
        <Button onClick={() => setReferrerDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nuovo Referrer
        </Button>
      </div>

      <ReferralStatCards
        referrers={referrers}
        referralCompanies={referralCompanies}
        payouts={payouts}
        getMonthlyCommission={getMonthlyCommission}
      />

      <Tabs defaultValue="referrers">
        <TabsList>
          <TabsTrigger value="referrers">
            <Gift className="h-4 w-4 mr-2" />
            Referrer
          </TabsTrigger>
          <TabsTrigger value="analytics">
            <BarChart3 className="h-4 w-4 mr-2" />
            Analytics
          </TabsTrigger>
        </TabsList>

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
      </Tabs>

      <ReferrerDialog
        open={referrerDialogOpen}
        onOpenChange={handleCloseDialog}
        referrer={editingReferrer}
      />

      <ReferrerDetailDialog
        referrer={detailReferrer}
        onOpenChange={() => setDetailReferrer(null)}
        referralCompanies={referralCompanies.filter(
          (rc) => rc.referrer_id === detailReferrer?.id
        )}
        payouts={payouts.filter(
          (p) => p.referrer_id === detailReferrer?.id
        )}
      />

      <PayoutDialog
        referrer={payoutReferrer}
        onOpenChange={() => setPayoutReferrer(null)}
      />
    </div>
  );
}
