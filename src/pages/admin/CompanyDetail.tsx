import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Building2, Loader2, Users, Copy, Check } from "lucide-react";
import { addDays } from "date-fns";
import { formatCurrency } from "@/lib/formatters";
import type { Company, CompanyStatus, CompanySector } from "@/types/auth";
import { useToast } from "@/hooks/use-toast";
import { StaffUserDialog, type StaffUserFormData } from "@/components/users/StaffUserDialog";
import { PermissionsDialog, type StaffPermissions } from "@/components/users/PermissionsDialog";
import { SalespersonDialog } from "@/components/salespeople/SalespersonDialog";
import { EmployeeDialog, type EmployeeFormData } from "@/components/employees/EmployeeDialog";
import { ALL_MODULES } from "@/lib/adminConstants";

import { CompanyDetailHeader } from "@/components/admin/company/CompanyDetailHeader";
import { CompanyDetailsTab } from "@/components/admin/company/CompanyDetailsTab";
import { CompanyTeamTab } from "@/components/admin/company/CompanyTeamTab";
import { CompanySaaSTab } from "@/components/admin/company/CompanySaaSTab";
import { CompanySubscriptionTab } from "@/components/admin/company/CompanySubscriptionTab";
import { CompanyActivityTab } from "@/components/admin/company/CompanyActivityTab";

interface CompanyStats {
  ordersCount: number;
  ordersValue: number;
  customersCount: number;
  ticketsCount: number;
  openTicketsCount: number;
  teamCount: number;
}

const formSchema = z.object({
  name: z.string().min(2, "Il nome deve avere almeno 2 caratteri"),
  business_name: z.string().optional().or(z.literal("")),
  email: z.string().email("Email non valida"),
  phone: z.string().optional().or(z.literal("")),
  sector: z.enum(["serramenti", "infissi", "bagni", "tetti", "fotovoltaico", "pittura", "ristrutturazioni", "altro"]),
  vat_number: z.string().optional().or(z.literal("")),
  fiscal_code: z.string().optional().or(z.literal("")),
  pec: z.string().optional().or(z.literal("")),
  sdi_code: z.string().optional().or(z.literal("")),
  website: z.string().optional().or(z.literal("")),
  legal_address: z.string().optional().or(z.literal("")),
  legal_city: z.string().optional().or(z.literal("")),
  legal_province: z.string().optional().or(z.literal("")),
  legal_postal_code: z.string().optional().or(z.literal("")),
  operational_address: z.string().optional().or(z.literal("")),
  operational_city: z.string().optional().or(z.literal("")),
  operational_province: z.string().optional().or(z.literal("")),
  operational_postal_code: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
});

type FormData = z.infer<typeof formSchema>;

export default function CompanyDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { impersonateCompany, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [company, setCompany] = useState<Company | null>(null);
  const [stats, setStats] = useState<CompanyStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [changePlanDialog, setChangePlanDialog] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [sameAsLegal, setSameAsLegal] = useState(false);

  // Team management state
  const [createStaffOpen, setCreateStaffOpen] = useState(false);
  const [createStaffLoading, setCreateStaffLoading] = useState(false);
  const [createSalespersonOpen, setCreateSalespersonOpen] = useState(false);
  const [savingSalesperson, setSavingSalesperson] = useState(false);
  const [createEmployeeOpen, setCreateEmployeeOpen] = useState(false);
  const [savingEmployee, setSavingEmployee] = useState(false);
  const [permissionsUser, setPermissionsUser] = useState<{ id: string; name: string; permissions: StaffPermissions } | null>(null);
  const [savingPermissions, setSavingPermissions] = useState(false);
  const [passwordDialog, setPasswordDialog] = useState<{ open: boolean; password: string; name: string; email: string } | null>(null);
  const [copiedPassword, setCopiedPassword] = useState(false);
  const [creatingAccountFor, setCreatingAccountFor] = useState<string | null>(null);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "", business_name: "", email: "", phone: "", sector: "altro",
      vat_number: "", fiscal_code: "", pec: "", sdi_code: "", website: "",
      legal_address: "", legal_city: "", legal_province: "", legal_postal_code: "",
      operational_address: "", operational_city: "", operational_province: "", operational_postal_code: "",
      notes: "",
    },
  });

  useEffect(() => {
    async function fetchCompanyData() {
      if (!id) return;
      const [companyRes, ordersRes, customersRes, ticketsRes, profilesRes] = await Promise.all([
        supabase.from("companies").select("*").eq("id", id).single(),
        supabase.from("orders").select("id, total_amount").eq("company_id", id),
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("company_id", id),
        supabase.from("tickets").select("id, status").eq("company_id", id),
        supabase.from("profiles").select("id").eq("company_id", id),
      ]);
      if (companyRes.data) {
        const c = companyRes.data as unknown as Company;
        setCompany(c);
        form.reset({
          name: c.name, business_name: c.business_name || "", email: c.email,
          phone: c.phone || "", sector: c.sector as CompanySector,
          vat_number: c.vat_number || "", fiscal_code: c.fiscal_code || "",
          pec: c.pec || "", sdi_code: c.sdi_code || "", website: c.website || "",
          legal_address: c.legal_address || "", legal_city: c.legal_city || "",
          legal_province: c.legal_province || "", legal_postal_code: c.legal_postal_code || "",
          operational_address: c.operational_address || "", operational_city: c.operational_city || "",
          operational_province: c.operational_province || "", operational_postal_code: c.operational_postal_code || "",
          notes: c.notes || "",
        });
      }
      const ordersValue = ordersRes.data?.reduce((sum, o) => sum + (o.total_amount || 0), 0) || 0;
      const openTickets = ticketsRes.data?.filter((t) => t.status !== "risolto").length || 0;
      setStats({
        ordersCount: ordersRes.data?.length || 0,
        ordersValue,
        customersCount: customersRes.count || 0,
        ticketsCount: ticketsRes.data?.length || 0,
        openTicketsCount: openTickets,
        teamCount: profilesRes.data?.length || 0,
      });
      setIsLoading(false);
    }
    fetchCompanyData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Team data queries
  const { data: teamData } = useQuery({
    queryKey: ["company-team", id],
    queryFn: async () => {
      if (!id) return null;
      const [profilesRes, permissionsRes, salespeopleRes, employeesRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("company_id", id),
        supabase.from("staff_permissions").select("*").eq("company_id", id),
        supabase.from("salespeople").select("*").eq("company_id", id),
        supabase.from("employees").select("*").eq("company_id", id),
      ]);
      const profiles = profilesRes.data || [];
      const profileIds = profiles.map((p) => p.id);
      let roles: { user_id: string; role: string }[] = [];
      if (profileIds.length > 0) {
        const { data: rolesData } = await supabase.from("user_roles").select("user_id, role").in("user_id", profileIds);
        roles = rolesData || [];
      }
      const admins = profiles.filter((p) => roles.some((r) => r.user_id === p.id && r.role === "company_admin"));
      const staff = profiles.filter((p) => roles.some((r) => r.user_id === p.id && r.role === "company_staff"));
      const permissionsMap = new Map((permissionsRes.data || []).map((p) => [p.user_id, p]));
      return {
        admins,
        staff: staff.map((s) => ({ ...s, permissions: permissionsMap.get(s.id) || null })),
        salespeople: salespeopleRes.data || [],
        employees: employeesRes.data || [],
      };
    },
    enabled: !!id,
  });

  const { data: currentPlan } = useQuery({
    queryKey: ["company-plan", company?.subscription_plan_id],
    queryFn: async () => {
      if (!company?.subscription_plan_id) return null;
      const { data } = await supabase.from("subscription_plans").select("*").eq("id", company.subscription_plan_id).single();
      return data;
    },
    enabled: !!company?.subscription_plan_id,
  });

  const { data: subscriptionLogs } = useQuery({
    queryKey: ["subscription-logs", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("subscription_logs")
        .select("*, subscription_plans:plan_id(name)")
        .eq("company_id", id!)
        .order("created_at", { ascending: false })
        .limit(10);
      return data || [];
    },
    enabled: !!id,
  });

  const { data: currentSubscription } = useQuery({
    queryKey: ["company-subscription", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("company_subscriptions")
        .select("*, subscription_plans:plan_id(name)")
        .eq("company_id", id!)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!id,
  });

  const { data: plans } = useQuery({
    queryKey: ["subscription-plans-active"],
    queryFn: async () => {
      const { data } = await supabase.from("subscription_plans").select("*").eq("is_active", true).order("position");
      return data || [];
    },
  });

  const { data: recentOrders } = useQuery({
    queryKey: ["company-recent-orders", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("id, description, total_amount, created_at, current_status_id, order_statuses:current_status_id(name, color, icon)")
        .eq("company_id", id!)
        .order("created_at", { ascending: false })
        .limit(5);
      return data || [];
    },
    enabled: !!id,
  });

  const { data: recentTickets } = useQuery({
    queryKey: ["company-recent-tickets", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("tickets")
        .select("id, subject, status, created_at")
        .eq("company_id", id!)
        .order("created_at", { ascending: false })
        .limit(5);
      return data || [];
    },
    enabled: !!id,
  });

  const refreshCompany = async () => {
    const { data } = await supabase.from("companies").select("*").eq("id", id!).single();
    if (data) setCompany(data as unknown as Company);
  };

  const updateStatusMutation = useMutation({
    mutationFn: async ({ newStatus, notes }: { newStatus: CompanyStatus; notes: string }) => {
      if (!id || !company) return;
      const { error: updateError } = await supabase.from("companies").update({ status: newStatus }).eq("id", id);
      if (updateError) throw updateError;
      await supabase.from("subscription_logs").insert({
        company_id: id,
        event_type: newStatus === "active" ? "activated" : newStatus === "suspended" ? "suspended" : "status_change",
        old_status: company.status,
        new_status: newStatus,
        notes,
        performed_by: user?.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscription-logs", id] });
      refreshCompany();
      toast({ title: "Stato aggiornato" });
    },
  });

  const changePlanMutation = useMutation({
    mutationFn: async (planId: string) => {
      if (!id || !company) return;
      const { error } = await supabase.from("companies").update({ subscription_plan_id: planId }).eq("id", id);
      if (error) throw error;
      await supabase.from("subscription_logs").insert({
        company_id: id,
        event_type: "plan_changed",
        old_status: company.status,
        new_status: company.status,
        plan_id: planId,
        notes: "Piano cambiato manualmente",
        performed_by: user?.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-plan"] });
      queryClient.invalidateQueries({ queryKey: ["subscription-logs", id] });
      setChangePlanDialog(false);
      refreshCompany();
      toast({ title: "Piano aggiornato" });
    },
  });

  const extendTrialMutation = useMutation({
    mutationFn: async (days: number) => {
      if (!id || !company) return;
      const currentEnd = company.trial_ends_at ? new Date(company.trial_ends_at) : new Date();
      const newEnd = addDays(currentEnd, days);
      const { error } = await supabase.from("companies").update({ trial_ends_at: newEnd.toISOString(), status: "trial" }).eq("id", id);
      if (error) throw error;
      await supabase.from("subscription_logs").insert({
        company_id: id,
        event_type: "trial_extended",
        old_status: company.status,
        new_status: "trial",
        notes: `Trial esteso di ${days} giorni`,
        performed_by: user?.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscription-logs", id] });
      refreshCompany();
      toast({ title: "Trial esteso" });
    },
  });

  const handleImpersonate = async () => {
    if (company) {
      await impersonateCompany(company.id);
      navigate("/azienda");
    }
  };

  const handleImpersonateAndNavigate = async (path: string) => {
    if (company) {
      await impersonateCompany(company.id);
      navigate(path);
    }
  };

  // ========== TEAM MANAGEMENT HANDLERS ==========

  const handleCreateStaff = async (data: StaffUserFormData): Promise<{ temporaryPassword?: string }> => {
    setCreateStaffLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const resp = await supabase.functions.invoke("create-company-staff", {
        body: { first_name: data.first_name, last_name: data.last_name, email: data.email, company_id: id },
        headers: { Authorization: `Bearer ${sessionData.session?.access_token}` },
      });
      if (resp.error || !resp.data?.success) {
        throw new Error(resp.data?.error || resp.error?.message || "Errore creazione staff");
      }
      queryClient.invalidateQueries({ queryKey: ["company-team", id] });
      toast({ title: "Staff creato con successo" });
      return { temporaryPassword: resp.data.temporary_password };
    } catch (err: any) {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
      throw err;
    } finally {
      setCreateStaffLoading(false);
    }
  };

  const handleSavePermissions = async (permissions: StaffPermissions) => {
    if (!permissionsUser) return;
    setSavingPermissions(true);
    try {
      const { error } = await supabase.from("staff_permissions").update(permissions).eq("user_id", permissionsUser.id).eq("company_id", id!);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["company-team", id] });
      toast({ title: "Permessi aggiornati" });
    } catch (err: any) {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    } finally {
      setSavingPermissions(false);
    }
  };

  const handleCreateSalesperson = (data: any) => {
    setSavingSalesperson(true);
    supabase.from("salespeople").insert({
      company_id: id!,
      first_name: data.first_name,
      last_name: data.last_name,
      email: data.email || null,
      phone: data.phone || null,
      commission_type: data.commission_type,
      commission_value: data.commission_value,
      is_active: data.is_active ?? true,
    }).then(({ error }) => {
      setSavingSalesperson(false);
      if (error) {
        toast({ title: "Errore", description: error.message, variant: "destructive" });
        return;
      }
      setCreateSalespersonOpen(false);
      queryClient.invalidateQueries({ queryKey: ["company-team", id] });
      toast({ title: "Venditore creato" });
    });
  };

  const handleCreateEmployee = (data: EmployeeFormData) => {
    setSavingEmployee(true);
    supabase.from("employees").insert({
      company_id: id!,
      first_name: data.first_name,
      last_name: data.last_name,
      email: data.email || null,
      phone: data.phone || null,
      gross_salary: data.gross_salary,
      net_salary: data.net_salary,
      monthly_hours: data.monthly_hours,
      is_active: data.is_active,
    }).then(({ error }) => {
      setSavingEmployee(false);
      if (error) {
        toast({ title: "Errore", description: error.message, variant: "destructive" });
        return;
      }
      setCreateEmployeeOpen(false);
      queryClient.invalidateQueries({ queryKey: ["company-team", id] });
      toast({ title: "Dipendente creato" });
    });
  };

  const handleCreateAccount = async (type: "salesperson" | "employee", entityId: string, email: string, name: string) => {
    setCreatingAccountFor(entityId);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const funcName = type === "salesperson" ? "create-salesperson-user" : "create-employee-user";
      const body = type === "salesperson" ? { salesperson_id: entityId, email } : { employee_id: entityId, email };
      const resp = await supabase.functions.invoke(funcName, {
        body,
        headers: { Authorization: `Bearer ${sessionData.session?.access_token}` },
      });
      if (resp.error || !resp.data?.success) {
        throw new Error(resp.data?.error || resp.error?.message || "Errore creazione account");
      }
      queryClient.invalidateQueries({ queryKey: ["company-team", id] });
      setPasswordDialog({ open: true, password: resp.data.temp_password, name, email });
      toast({ title: "Account creato" });
    } catch (err: any) {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    } finally {
      setCreatingAccountFor(null);
    }
  };

  const handleCopyPassword = async () => {
    if (passwordDialog?.password) {
      await navigator.clipboard.writeText(passwordDialog.password);
      setCopiedPassword(true);
      setTimeout(() => setCopiedPassword(false), 2000);
      toast({ title: "Copiato!" });
    }
  };

  const onSaveDetails = async (data: FormData) => {
    if (!id) return;
    setIsSaving(true);
    try {
      const updateData: Record<string, any> = {
        name: data.name, email: data.email, sector: data.sector,
        business_name: data.business_name || null, phone: data.phone || null,
        vat_number: data.vat_number || null, fiscal_code: data.fiscal_code || null,
        pec: data.pec || null, sdi_code: data.sdi_code || null,
        website: data.website || null,
        legal_address: data.legal_address || null, legal_city: data.legal_city || null,
        legal_province: data.legal_province || null, legal_postal_code: data.legal_postal_code || null,
        notes: data.notes || null,
      };
      if (sameAsLegal) {
        updateData.operational_address = data.legal_address || null;
        updateData.operational_city = data.legal_city || null;
        updateData.operational_province = data.legal_province || null;
        updateData.operational_postal_code = data.legal_postal_code || null;
      } else {
        updateData.operational_address = data.operational_address || null;
        updateData.operational_city = data.operational_city || null;
        updateData.operational_province = data.operational_province || null;
        updateData.operational_postal_code = data.operational_postal_code || null;
      }
      const { error } = await supabase.from("companies").update(updateData).eq("id", id);
      if (error) throw error;
      await refreshCompany();
      toast({ title: "Dati aggiornati con successo" });
    } catch (error: any) {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  // ========== RENDER ==========

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!company) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => navigate("/admin/aziende")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Torna alle aziende
        </Button>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">Azienda non trovata</h3>
          </CardContent>
        </Card>
      </div>
    );
  }

  const includedModules: string[] = currentPlan
    ? (Array.isArray((currentPlan as any).included_modules) ? (currentPlan as any).included_modules : ALL_MODULES.map((m) => m.key))
    : [];

  const totalTeam = (teamData?.admins.length || 0) + (teamData?.staff.length || 0) + (teamData?.salespeople.length || 0) + (teamData?.employees.length || 0);

  return (
    <div className="space-y-6">
      <CompanyDetailHeader
        company={company}
        onBack={() => navigate("/admin/aziende")}
        onImpersonate={handleImpersonate}
      />

      <Tabs defaultValue="dettagli">
        <TabsList>
          <TabsTrigger value="dettagli">Dettagli di base</TabsTrigger>
          <TabsTrigger value="team">
            <Users className="h-4 w-4 mr-1.5" />
            Team
          </TabsTrigger>
          <TabsTrigger value="saas">SaaS</TabsTrigger>
          <TabsTrigger value="abbonamento">Abbonamento</TabsTrigger>
          <TabsTrigger value="attivita">Attività</TabsTrigger>
        </TabsList>

        <TabsContent value="dettagli">
          <CompanyDetailsTab
            company={company}
            form={form}
            onSubmit={onSaveDetails}
            isSaving={isSaving}
            sameAsLegal={sameAsLegal}
            onSameAsLegalChange={setSameAsLegal}
            currentPlanName={currentPlan?.name || null}
            stats={stats}
            totalTeam={totalTeam}
          />
        </TabsContent>

        <TabsContent value="team">
          <CompanyTeamTab
            teamData={teamData}
            totalTeam={totalTeam}
            onCreateStaff={() => setCreateStaffOpen(true)}
            onCreateSalesperson={() => setCreateSalespersonOpen(true)}
            onCreateEmployee={() => setCreateEmployeeOpen(true)}
            onEditPermissions={setPermissionsUser}
            onCreateAccount={handleCreateAccount}
            creatingAccountFor={creatingAccountFor}
          />
        </TabsContent>

        <TabsContent value="saas">
          <CompanySaaSTab
            currentPlan={currentPlan}
            stats={stats}
            includedModules={includedModules}
            plans={plans}
            companyPlanId={company.subscription_plan_id}
          />
        </TabsContent>

        <TabsContent value="abbonamento">
          <CompanySubscriptionTab
            company={company}
            currentPlan={currentPlan}
            currentSubscription={currentSubscription}
            subscriptionLogs={subscriptionLogs}
            onChangePlan={() => setChangePlanDialog(true)}
            onSuspend={() => updateStatusMutation.mutate({ newStatus: "suspended", notes: "Sospeso manualmente" })}
            onReactivate={() => updateStatusMutation.mutate({ newStatus: "active", notes: "Riattivato manualmente" })}
            onExtendTrial={(days) => extendTrialMutation.mutate(days)}
            isUpdatingStatus={updateStatusMutation.isPending}
            isExtendingTrial={extendTrialMutation.isPending}
          />
        </TabsContent>

        <TabsContent value="attivita">
          <CompanyActivityTab
            stats={stats}
            totalTeam={totalTeam}
            teamData={teamData}
            recentOrders={recentOrders}
            recentTickets={recentTickets}
            onImpersonate={handleImpersonate}
            onImpersonateAndNavigate={handleImpersonateAndNavigate}
          />
        </TabsContent>
      </Tabs>

      {/* Change Plan Dialog */}
      <Dialog open={changePlanDialog} onOpenChange={setChangePlanDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambia Piano</DialogTitle>
            <DialogDescription>Seleziona il nuovo piano per {company.name}</DialogDescription>
          </DialogHeader>
          <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
            <SelectTrigger>
              <SelectValue placeholder="Seleziona piano" />
            </SelectTrigger>
            <SelectContent>
              {plans?.map((plan) => (
                <SelectItem key={plan.id} value={plan.id}>
                  {plan.name} — {formatCurrency(plan.price_monthly)}/mese
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChangePlanDialog(false)}>Annulla</Button>
            <Button onClick={() => selectedPlanId && changePlanMutation.mutate(selectedPlanId)} disabled={!selectedPlanId || changePlanMutation.isPending}>
              {changePlanMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Conferma
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Team Management Dialogs */}
      <StaffUserDialog
        open={createStaffOpen}
        onOpenChange={setCreateStaffOpen}
        onSubmit={handleCreateStaff}
        isLoading={createStaffLoading}
      />

      {permissionsUser && (
        <PermissionsDialog
          open={!!permissionsUser}
          onOpenChange={(open) => !open && setPermissionsUser(null)}
          userName={permissionsUser.name}
          currentPermissions={permissionsUser.permissions}
          onSave={handleSavePermissions}
          isLoading={savingPermissions}
        />
      )}

      <SalespersonDialog
        open={createSalespersonOpen}
        onOpenChange={setCreateSalespersonOpen}
        salesperson={null}
        onSave={handleCreateSalesperson}
        isLoading={savingSalesperson}
      />

      <EmployeeDialog
        open={createEmployeeOpen}
        onOpenChange={setCreateEmployeeOpen}
        employee={null}
        onSave={handleCreateEmployee}
        isSaving={savingEmployee}
      />

      {/* Password Dialog */}
      <Dialog open={passwordDialog?.open ?? false} onOpenChange={() => { setPasswordDialog(null); setCopiedPassword(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Account Creato! 🎉</DialogTitle>
            <DialogDescription>
              L'account per {passwordDialog?.name} è stato creato. Comunica la password temporanea.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-lg space-y-2">
              <p className="text-sm font-medium">Credenziali di accesso:</p>
              <div className="text-sm">
                <span className="text-muted-foreground">Email:</span> {passwordDialog?.email}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Password:</span>
                <code className="px-2 py-1 bg-background rounded text-sm font-mono">{passwordDialog?.password}</code>
                <Button variant="ghost" size="icon" onClick={handleCopyPassword} className="h-8 w-8">
                  {copiedPassword ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              ⚠️ Questa password viene mostrata solo una volta. L'utente potrà cambiarla dopo il primo accesso.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => { setPasswordDialog(null); setCopiedPassword(false); }}>Chiudi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
