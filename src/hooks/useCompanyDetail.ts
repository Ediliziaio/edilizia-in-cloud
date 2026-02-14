import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { addDays } from "date-fns";
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
  const { toast } = useToast();
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
  const [savingSalesperson, setSavingSalesperson] = useState(false);
  const [createEmployeeOpen, setCreateEmployeeOpen] = useState(false);
  const [savingEmployee, setSavingEmployee] = useState(false);
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

  const { data: companyData, isLoading } = useQuery({
    queryKey: ["company-detail", id],
    queryFn: async () => {
      if (!id) return null;
      const [companyRes, ordersRes, customersRes, ticketsRes, profilesRes] = await Promise.all([
        supabase.from("companies").select("*").eq("id", id).single(),
        supabase.from("orders").select("id, total_amount").eq("company_id", id),
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("company_id", id),
        supabase.from("tickets").select("id, status").eq("company_id", id),
        supabase.from("profiles").select("id").eq("company_id", id),
      ]);
      if (!companyRes.data) return null;
      const company = companyRes.data as unknown as Company;
      const ordersValue = ordersRes.data?.reduce((sum, o) => sum + (o.total_amount || 0), 0) || 0;
      const openTickets = ticketsRes.data?.filter((t) => t.status !== "risolto").length || 0;
      const stats: CompanyStats = {
        ordersCount: ordersRes.data?.length || 0,
        ordersValue,
        customersCount: customersRes.count || 0,
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
      const { data } = await supabase.from("subscription_logs").select("*, subscription_plans:plan_id(name)").eq("company_id", id!).order("created_at", { ascending: false }).limit(10);
      return data || [];
    },
    enabled: !!id,
  });

  const { data: currentSubscription } = useQuery({
    queryKey: ["company-subscription", id],
    queryFn: async () => {
      const { data } = await supabase.from("company_subscriptions").select("*, subscription_plans:plan_id(name)").eq("company_id", id!).order("created_at", { ascending: false }).limit(1).maybeSingle();
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
      const { data } = await supabase.from("orders").select("id, description, total_amount, created_at, current_status_id, order_statuses:current_status_id(name, color, icon)").eq("company_id", id!).order("created_at", { ascending: false }).limit(5);
      return data || [];
    },
    enabled: !!id,
  });

  const { data: recentTickets } = useQuery({
    queryKey: ["company-recent-tickets", id],
    queryFn: async () => {
      const { data } = await supabase.from("tickets").select("id, subject, status, created_at").eq("company_id", id!).order("created_at", { ascending: false }).limit(5);
      return data || [];
    },
    enabled: !!id,
  });

  // Monthly orders for chart (last 6 months)
  const { data: allOrders } = useQuery({
    queryKey: ["company-all-orders-chart", id],
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
  });

  const monthlyOrders = useMemo(() => {
    if (!allOrders || allOrders.length === 0) return [];
    const months: Record<string, { count: number; value: number }> = {};
    // Pre-fill last 6 months
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
    const lastDate = new Date(recentOrders[0].created_at);
    return Math.round((Date.now() - lastDate.getTime()) / (24 * 60 * 60 * 1000));
  }, [recentOrders]);

  // ========== MUTATIONS ==========

  const refreshCompany = () => {
    queryClient.invalidateQueries({ queryKey: ["company-detail", id] });
  };

  const updateStatusMutation = useMutation({
    mutationFn: async ({ newStatus, notes }: { newStatus: CompanyStatus; notes: string }) => {
      if (!id || !company) return;
      const { error: updateError } = await supabase.from("companies").update({ status: newStatus }).eq("id", id);
      if (updateError) throw updateError;
      await supabase.from("subscription_logs").insert({
        company_id: id,
        event_type: newStatus === "active" ? "activated" : newStatus === "suspended" ? "suspended" : "status_change",
        old_status: company.status, new_status: newStatus, notes, performed_by: user?.id,
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
        company_id: id, event_type: "plan_changed", old_status: company.status,
        new_status: company.status, plan_id: planId, notes: "Piano cambiato manualmente", performed_by: user?.id,
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
        company_id: id, event_type: "trial_extended", old_status: company.status,
        new_status: "trial", notes: `Trial esteso di ${days} giorni`, performed_by: user?.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscription-logs", id] });
      refreshCompany();
      toast({ title: "Trial esteso" });
    },
  });

  // ========== HANDLERS ==========

  const handleImpersonate = async () => {
    if (company) {
      await impersonateCompany(company.id);
    }
  };

  const handleImpersonateAndNavigate = async (path: string) => {
    if (company) {
      await impersonateCompany(company.id);
    }
    return path;
  };

  const handleCreateStaff = async (data: StaffUserFormData): Promise<{ temporaryPassword?: string }> => {
    setCreateStaffLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const resp = await supabase.functions.invoke("create-company-staff", {
        body: { first_name: data.first_name, last_name: data.last_name, email: data.email, company_id: id },
        headers: { Authorization: `Bearer ${sessionData.session?.access_token}` },
      });
      if (resp.error || !resp.data?.success) throw new Error(resp.data?.error || resp.error?.message || "Errore creazione staff");
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
      company_id: id!, first_name: data.first_name, last_name: data.last_name,
      email: data.email || null, phone: data.phone || null,
      commission_type: data.commission_type, commission_value: data.commission_value, is_active: data.is_active ?? true,
    }).then(({ error }) => {
      setSavingSalesperson(false);
      if (error) { toast({ title: "Errore", description: error.message, variant: "destructive" }); return; }
      setCreateSalespersonOpen(false);
      queryClient.invalidateQueries({ queryKey: ["company-team", id] });
      toast({ title: "Venditore creato" });
    });
  };

  const handleCreateEmployee = (data: EmployeeFormData) => {
    setSavingEmployee(true);
    supabase.from("employees").insert({
      company_id: id!, first_name: data.first_name, last_name: data.last_name,
      email: data.email || null, phone: data.phone || null,
      gross_salary: data.gross_salary, net_salary: data.net_salary, monthly_hours: data.monthly_hours, is_active: data.is_active,
    }).then(({ error }) => {
      setSavingEmployee(false);
      if (error) { toast({ title: "Errore", description: error.message, variant: "destructive" }); return; }
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
        body, headers: { Authorization: `Bearer ${sessionData.session?.access_token}` },
      });
      if (resp.error || !resp.data?.success) throw new Error(resp.data?.error || resp.error?.message || "Errore creazione account");
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

  const onSaveDetails = async (data: CompanyFormData) => {
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
      toast({ title: "Dati aggiornati con successo" });
    } catch (error: any) {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  return {
    // Data
    company, stats, isLoading, teamData, currentPlan, subscriptionLogs, currentSubscription, plans, recentOrders, recentTickets, monthlyOrders, daysSinceLastOrder, form,
    // UI state
    changePlanDialog, setChangePlanDialog, selectedPlanId, setSelectedPlanId, isSaving, sameAsLegal, setSameAsLegal,
    createStaffOpen, setCreateStaffOpen, createStaffLoading,
    createSalespersonOpen, setCreateSalespersonOpen, savingSalesperson,
    createEmployeeOpen, setCreateEmployeeOpen, savingEmployee,
    permissionsUser, setPermissionsUser, savingPermissions,
    passwordDialog, setPasswordDialog, copiedPassword, setCopiedPassword, creatingAccountFor,
    // Mutations
    updateStatusMutation, changePlanMutation, extendTrialMutation,
    // Handlers
    handleImpersonate, handleImpersonateAndNavigate, handleCreateStaff, handleSavePermissions,
    handleCreateSalesperson, handleCreateEmployee, handleCreateAccount, handleCopyPassword, onSaveDetails,
  };
}
