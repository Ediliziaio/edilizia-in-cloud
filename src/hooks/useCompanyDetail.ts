import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { useSuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";
import { toast } from "sonner";
import { addDays, differenceInDays } from "date-fns";
import type { Company, CompanyStatus, CompanySector } from "@/types/auth";
import type { StaffUserFormData } from "@/components/users/StaffUserDialog";
import type { StaffPermissions } from "@/components/users/PermissionsDialog";
import type { EmployeeFormData } from "@/components/employees/EmployeeDialog";

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

export type CompanyFormData = z.infer<typeof formSchema>;

export interface CompanyStats {
  ordersCount: number;
  ordersValue: number;
  customersCount: number;
  ticketsCount: number;
  openTicketsCount: number;
  teamCount: number;
}

export function useCompanyDetail(id: string | undefined) {
  const { user, impersonateCompany } = useAuth();
  const { permissions: saPermissions } = useSuperAdminPermissions();
  const queryClient = useQueryClient();

  // UI state
  const [changePlanDialog, setChangePlanDialog] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [sameAsLegal, setSameAsLegal] = useState(false);

  // Team management state
  const [createStaffOpen, setCreateStaffOpen] = useState(false);
  const [createStaffLoading, setCreateStaffLoading] = useState(false);
  const [createSalespersonOpen, setCreateSalespersonOpen] = useState(false);
  const [createEmployeeOpen, setCreateEmployeeOpen] = useState(false);
  const [permissionsUser, setPermissionsUser] = useState<{ id: string; name: string; permissions: StaffPermissions } | null>(null);
  const [savingPermissions, setSavingPermissions] = useState(false);
  const [passwordDialog, setPasswordDialog] = useState<{ open: boolean; password: string; name: string; email: string } | null>(null);
  const [copiedPassword, setCopiedPassword] = useState(false);
  const [creatingAccountFor, setCreatingAccountFor] = useState<string | null>(null);

  const form = useForm<CompanyFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "", business_name: "", email: "", phone: "", sector: "altro",
      vat_number: "", fiscal_code: "", pec: "", sdi_code: "", website: "",
      legal_address: "", legal_city: "", legal_province: "", legal_postal_code: "",
      operational_address: "", operational_city: "", operational_province: "", operational_postal_code: "",
      notes: "",
    },
  });

  // ========== QUERIES ==========

  const { data: companyData, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.companyDetail.detail(id),
    queryFn: async () => {
      if (!id) return null;
      const [companyRes, ordersRes, profilesRes, ticketsRes] = await Promise.all([
        supabase.from("companies").select("*").eq("id", id).single(),
        supabase.from("orders").select("id, total_amount").eq("company_id", id),
        supabase.from("profiles").select("id", { count: "exact" }).eq("company_id", id),
        supabase.from("tickets").select("id, status").eq("company_id", id),
      ]);
      if (!companyRes.data) return null;
      const company = companyRes.data as unknown as Company;
      const ordersValue = ordersRes.data?.reduce((sum, o) => sum + (o.total_amount || 0), 0) || 0;
      const openTickets = ticketsRes.data?.filter((t) => t.status !== "risolto").length || 0;
      const stats: CompanyStats = {
        ordersCount: ordersRes.data?.length || 0,
        ordersValue,
        customersCount: profilesRes.count || 0,
        ticketsCount: ticketsRes.data?.length || 0,
        openTicketsCount: openTickets,
        teamCount: profilesRes.data?.length || 0,
      };
      return { company, stats };
    },
    enabled: !!id,
    staleTime: 2 * 60 * 1000,
  });

  const company = companyData?.company ?? null;
  const stats = companyData?.stats ?? null;

  // Reset form when company data loads
  const resetFormWithCompany = (c: Company) => {
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
  };

  const lastResetId = useRef<string | null>(null);
  useEffect(() => {
    if (company && company.id !== lastResetId.current) {
      lastResetId.current = company.id;
      resetFormWithCompany(company);
    }
  }, [company?.id]);

  const { data: teamData } = useQuery({
    queryKey: queryKeys.companyDetail.team(id),
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
    staleTime: 2 * 60 * 1000,
  });

  const { data: currentPlan } = useQuery({
    queryKey: queryKeys.companyDetail.plan(company?.subscription_plan_id),
    queryFn: async () => {
      if (!company?.subscription_plan_id) return null;
      const { data } = await supabase.from("subscription_plans").select("*").eq("id", company.subscription_plan_id).single();
      return data;
    },
    enabled: !!company?.subscription_plan_id,
  });

  const { data: subscriptionLogs } = useQuery({
    queryKey: queryKeys.companyDetail.subscriptionLogs(id),
    queryFn: async () => {
      const { data } = await supabase.from("subscription_logs").select("*, subscription_plans:plan_id(name)").eq("company_id", id!).order("created_at", { ascending: false }).limit(10);
      return data || [];
    },
    enabled: !!id,
    staleTime: 2 * 60 * 1000,
  });

  const { data: currentSubscription } = useQuery({
    queryKey: queryKeys.companyDetail.subscription(id),
    queryFn: async () => {
      const { data } = await supabase.from("company_subscriptions").select("*, subscription_plans:plan_id(name)").eq("company_id", id!).order("created_at", { ascending: false }).limit(1).maybeSingle();
      return data;
    },
    enabled: !!id,
    staleTime: 2 * 60 * 1000,
  });

  const { data: plans } = useQuery({
    queryKey: queryKeys.companyDetail.plansActive,
    queryFn: async () => {
      const { data } = await supabase.from("subscription_plans").select("*").eq("is_active", true).order("position");
      return data || [];
    },
  });

  const { data: recentOrders } = useQuery({
    queryKey: queryKeys.companyDetail.recentOrders(id),
    queryFn: async () => {
      const { data } = await supabase.from("orders").select("id, description, total_amount, created_at, current_status_id, order_statuses:current_status_id(name, color, icon)").eq("company_id", id!).order("created_at", { ascending: false }).limit(5);
      return data || [];
    },
    enabled: !!id,
    staleTime: 2 * 60 * 1000,
  });

  const { data: recentTickets } = useQuery({
    queryKey: queryKeys.companyDetail.recentTickets(id),
    queryFn: async () => {
      const { data } = await supabase.from("tickets").select("id, subject, status, created_at").eq("company_id", id!).order("created_at", { ascending: false }).limit(5);
      return data || [];
    },
    enabled: !!id,
    staleTime: 2 * 60 * 1000,
  });

  // Monthly orders for chart (last 6 months)
  const { data: allOrders } = useQuery({
    queryKey: queryKeys.companyDetail.allOrdersChart(id),
    queryFn: async () => {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const { data } = await supabase
        .from("orders")
        .select("created_at, total_amount")
        .eq("company_id", id!)
        .gte("created_at", sixMonthsAgo.toISOString())
        .order("created_at", { ascending: true });
      return data || [];
    },
    enabled: !!id,
    staleTime: 2 * 60 * 1000,
  });

  const monthlyOrders = useMemo(() => {
    if (!allOrders || allOrders.length === 0) return [];
    const months: Record<string, { count: number; value: number }> = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months[key] = { count: 0, value: 0 };
    }
    allOrders.forEach((o) => {
      const d = new Date(o.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (months[key]) {
        months[key].count += 1;
        months[key].value += o.total_amount || 0;
      }
    });
    const monthNames = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
    return Object.entries(months).map(([key, val]) => ({
      month: monthNames[parseInt(key.split("-")[1]) - 1],
      count: val.count,
      value: Math.round(val.value),
    }));
  }, [allOrders]);

  const daysSinceLastOrder = useMemo(() => {
    if (!recentOrders || recentOrders.length === 0) return null;
    return differenceInDays(new Date(), new Date(recentOrders[0].created_at));
  }, [recentOrders]);

  // ========== MUTATIONS ==========

  const refreshCompany = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.companyDetail.detail(id) });
  };

  const assertCanManage = () => {
    if (!saPermissions.can_manage_companies) {
      throw new Error("Permesso negato: non puoi gestire le aziende");
    }
    if (id && saPermissions.allowed_company_ids && !saPermissions.allowed_company_ids.includes(id)) {
      throw new Error("Permesso negato: azienda non autorizzata");
    }
  };

  const updateStatusMutation = useMutation({
    mutationFn: async ({ newStatus, notes }: { newStatus: CompanyStatus; notes: string }) => {
      assertCanManage();
      if (!id || !company) return;
      const { error: updateError } = await supabase.from("companies").update({ status: newStatus }).eq("id", id);
      if (updateError) throw updateError;
      await supabase.from("subscription_logs").insert({
        company_id: id,
        event_type: newStatus === "active" ? "activated" : newStatus === "suspended" ? "suspended" : "status_change",
        old_status: company.status, new_status: newStatus, notes, performed_by: user?.id,
      });
      if (user?.id) {
        const auditAction = newStatus === "suspended" ? "suspend_company" : newStatus === "active" ? "reactivate_company" : "status_change";
        await supabase.from("admin_audit_log").insert({
          user_id: user.id,
          action: auditAction,
          target_type: "company",
          target_id: id,
          details: { company_name: company.name, old_status: company.status, new_status: newStatus, notes },
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companyDetail.subscriptionLogs(id) });
      refreshCompany();
      toast.success("Stato aggiornato");
    },
    onError: (err: any) => {
      toast.error("Errore aggiornamento stato", { description: err.message });
    },
  });

  const changePlanMutation = useMutation({
    mutationFn: async (planId: string) => {
      assertCanManage();
      if (!id || !company) return;
      const { error } = await supabase.from("companies").update({ subscription_plan_id: planId }).eq("id", id);
      if (error) throw error;
      await supabase.from("subscription_logs").insert({
        company_id: id, event_type: "plan_changed", old_status: company.status,
        new_status: company.status, plan_id: planId, notes: "Piano cambiato manualmente", performed_by: user?.id,
      });
      if (user?.id) {
        const newPlan = plans?.find((p: any) => p.id === planId);
        const oldPlan = plans?.find((p: any) => p.id === company.subscription_plan_id);
        await supabase.from("admin_audit_log").insert({
          user_id: user.id,
          action: "change_plan",
          target_type: "company",
          target_id: id,
          details: {
            company_name: company.name,
            old_plan: oldPlan?.name || "Nessuno",
            new_plan: newPlan?.name || planId,
          },
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companyDetail.planAll });
      queryClient.invalidateQueries({ queryKey: queryKeys.companyDetail.subscriptionLogs(id) });
      setChangePlanDialog(false);
      refreshCompany();
      toast.success("Piano aggiornato");
    },
    onError: (err: any) => {
      toast.error("Errore cambio piano", { description: err.message });
    },
  });

  const extendTrialMutation = useMutation({
    mutationFn: async (days: number) => {
      assertCanManage();
      if (!id || !company) return;
      const currentEnd = company.trial_ends_at ? new Date(company.trial_ends_at) : new Date();
      const newEnd = addDays(currentEnd, days);
      const { error } = await supabase.from("companies").update({ trial_ends_at: newEnd.toISOString(), status: "trial" }).eq("id", id);
      if (error) throw error;
      await supabase.from("subscription_logs").insert({
        company_id: id, event_type: "trial_extended", old_status: company.status,
        new_status: "trial", notes: `Trial esteso di ${days} giorni`, performed_by: user?.id,
      });
      if (user?.id) {
        await supabase.from("admin_audit_log").insert({
          user_id: user.id,
          action: "extend_trial",
          target_type: "company",
          target_id: id,
          details: { company_name: company.name, days, new_end: newEnd.toISOString() },
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companyDetail.subscriptionLogs(id) });
      refreshCompany();
      toast.success("Trial esteso");
    },
    onError: (err: any) => {
      toast.error("Errore estensione trial", { description: err.message });
    },
  });

  // ========== HANDLERS ==========

  const handleImpersonate = async () => {
    if (company) {
      await impersonateCompany(company.id, saPermissions);
    }
  };

  const handleCreateStaff = async (data: StaffUserFormData): Promise<{ temporaryPassword?: string }> => {
    assertCanManage();
    setCreateStaffLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const resp = await supabase.functions.invoke("create-company-staff", {
        body: { first_name: data.first_name, last_name: data.last_name, email: data.email, company_id: id },
        headers: { Authorization: `Bearer ${sessionData.session?.access_token}` },
      });
      if (resp.error || !resp.data?.success) throw new Error(resp.data?.error || resp.error?.message || "Errore creazione staff");
      queryClient.invalidateQueries({ queryKey: ["company-team", id] });
      toast.success("Staff creato con successo");
      return { temporaryPassword: resp.data.temporary_password };
    } catch (err: any) {
      toast.error("Errore", { description: err.message });
      throw err;
    } finally {
      setCreateStaffLoading(false);
    }
  };

  const handleSavePermissions = async (permissions: StaffPermissions) => {
    if (!permissionsUser) return;
    setSavingPermissions(true);
    try {
      const syncedPermissions = {
        ...permissions,
        can_view_marketing: [
          "can_view_marketing_dashboard", "can_view_marketing_contacts",
          "can_view_marketing_opportunities", "can_view_marketing_activities",
          "can_view_marketing_appointments", "can_view_marketing_automations",
          "can_view_marketing_ai_agent", "can_view_marketing_email",
          "can_view_marketing_whatsapp", "can_view_marketing_reports",
        ].some(k => (permissions as any)[k] === true),
        can_edit_marketing: [
          "can_edit_marketing_contacts",
          "can_edit_marketing_opportunities",
        ].some(k => (permissions as any)[k] === true),
      };
      const { error } = await supabase.from("staff_permissions").update(syncedPermissions).eq("user_id", permissionsUser.id).eq("company_id", id!);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["company-team", id] });
      toast.success("Permessi aggiornati");
    } catch (err: any) {
      toast.error("Errore", { description: err.message });
    } finally {
      setSavingPermissions(false);
    }
  };

  const createSalespersonMutation = useMutation({
    mutationFn: async (data: any) => {
      const { error } = await supabase.from("salespeople").insert({
        company_id: id!, first_name: data.first_name, last_name: data.last_name,
        email: data.email || null, phone: data.phone || null,
        commission_type: data.commission_type, commission_value: data.commission_value, is_active: data.is_active ?? true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setCreateSalespersonOpen(false);
      queryClient.invalidateQueries({ queryKey: ["company-team", id] });
      toast.success("Venditore creato");
    },
    onError: (err: any) => {
      toast.error("Errore", { description: err.message });
    },
  });

  const handleCreateSalesperson = (data: any) => {
    createSalespersonMutation.mutate(data);
  };

  const createEmployeeMutation = useMutation({
    mutationFn: async (data: EmployeeFormData) => {
      assertCanManage();
      const { error } = await supabase.from("employees").insert({
        company_id: id!, first_name: data.first_name, last_name: data.last_name,
        email: data.email || null, phone: data.phone || null,
        gross_salary: data.gross_salary, net_salary: data.net_salary, monthly_hours: data.monthly_hours, is_active: data.is_active,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setCreateEmployeeOpen(false);
      queryClient.invalidateQueries({ queryKey: ["company-team", id] });
      toast.success("Dipendente creato");
    },
    onError: (err: any) => {
      toast.error("Errore", { description: err.message });
    },
  });

  const handleCreateEmployee = (data: EmployeeFormData) => {
    createEmployeeMutation.mutate(data);
  };

  const handleCreateAccount = async (type: "salesperson" | "employee", entityId: string, email: string, name: string) => {
    assertCanManage();
    setCreatingAccountFor(entityId);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const funcName = type === "salesperson" ? "create-salesperson-user" : "create-employee-user";
      const body = type === "salesperson" ? { salesperson_id: entityId, email } : { employee_id: entityId, email };
      const resp = await supabase.functions.invoke(funcName, {
        body, headers: { Authorization: `Bearer ${sessionData.session?.access_token}` },
      });
      if (resp.error || !resp.data?.success) throw new Error(resp.data?.error || resp.error?.message || "Errore creazione account");
      queryClient.invalidateQueries({ queryKey: ["company-team", id] });
      setPasswordDialog({ open: true, password: resp.data.temp_password, name, email });
      toast.success("Account creato");
    } catch (err: any) {
      toast.error("Errore", { description: err.message });
    } finally {
      setCreatingAccountFor(null);
    }
  };

  const handleCopyPassword = async () => {
    if (passwordDialog?.password) {
      await navigator.clipboard.writeText(passwordDialog.password);
      setCopiedPassword(true);
      setTimeout(() => setCopiedPassword(false), 2000);
      toast.success("Copiato!");
    }
  };

  const onSaveDetails = async (data: CompanyFormData) => {
    assertCanManage();
    if (!id) return;
    setIsSaving(true);
    try {
      const updateData: Record<string, any> = {
        name: data.name, email: data.email, sector: data.sector,
        business_name: data.business_name || null, phone: data.phone || null,
        vat_number: data.vat_number || null, fiscal_code: data.fiscal_code || null,
        pec: data.pec || null, sdi_code: data.sdi_code || null, website: data.website || null,
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
      refreshCompany();
      toast.success("Dati aggiornati con successo");
    } catch (error: any) {
      toast.error("Errore", { description: error.message });
    } finally {
      setIsSaving(false);
    }
  };

  const updatePaymentMethodMutation = useMutation({
    mutationFn: async (data: {
      payment_method: string;
      bank_iban: string | null;
      bank_account_holder: string | null;
      bank_name: string | null;
      payment_notes: string | null;
    }) => {
      if (!id) return;
      const { error } = await supabase.from("companies").update({
        payment_method: data.payment_method,
        bank_iban: data.bank_iban,
        bank_account_holder: data.bank_account_holder,
        bank_name: data.bank_name,
        payment_notes: data.payment_notes,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      refreshCompany();
      toast.success("Metodo di pagamento aggiornato");
    },
    onError: (err: any) => {
      toast.error("Errore", { description: err.message });
    },
  });

  const handleUpdatePaymentMethod = async (data: {
    payment_method: string;
    bank_iban: string | null;
    bank_account_holder: string | null;
    bank_name: string | null;
    payment_notes: string | null;
  }) => {
    await updatePaymentMethodMutation.mutateAsync(data);
  };

  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);

  const createCheckoutMutation = useMutation({
    mutationFn: async ({ billingPeriod }: { billingPeriod?: string } = {}) => {
      if (!id || !company?.subscription_plan_id) throw new Error("Piano non assegnato");
      const { data: sessionData } = await supabase.auth.getSession();
      const resp = await supabase.functions.invoke("create-checkout-session", {
        body: { company_id: id, plan_id: company.subscription_plan_id, billing_period: billingPeriod || "monthly" },
        headers: { Authorization: `Bearer ${sessionData.session?.access_token}` },
      });
      if (resp.error) throw new Error(resp.error.message);
      if (resp.data?.error) throw new Error(resp.data.error);
      return resp.data;
    },
    onSuccess: (data) => {
      setCheckoutUrl(data.url);
      toast.success("Link di pagamento generato");
    },
    onError: (err: any) => {
      toast.error("Errore generazione link", { description: err.message });
    },
  });

  const handleCreateCheckout = () => {
    createCheckoutMutation.mutate({});
  };

  return {
    // Data
    company, stats, isLoading, isError, refetch, teamData, currentPlan, subscriptionLogs, currentSubscription, plans, recentOrders, recentTickets, monthlyOrders, daysSinceLastOrder, form,
    checkoutUrl,
    // UI state
    changePlanDialog, setChangePlanDialog, selectedPlanId, setSelectedPlanId, isSaving, sameAsLegal, setSameAsLegal,
    createStaffOpen, setCreateStaffOpen, createStaffLoading,
    createSalespersonOpen, setCreateSalespersonOpen, savingSalesperson: createSalespersonMutation.isPending,
    createEmployeeOpen, setCreateEmployeeOpen, savingEmployee: createEmployeeMutation.isPending,
    permissionsUser, setPermissionsUser, savingPermissions,
    passwordDialog, setPasswordDialog, copiedPassword, setCopiedPassword, creatingAccountFor,
    // Mutations
    updateStatusMutation, changePlanMutation, extendTrialMutation, updatePaymentMethodMutation, createCheckoutMutation,
    // Handlers
    handleImpersonate, handleCreateStaff, handleSavePermissions,
    handleCreateSalesperson, handleCreateEmployee, handleCreateAccount, handleCopyPassword, onSaveDetails,
    handleUpdatePaymentMethod, handleCreateCheckout,
  };
}
