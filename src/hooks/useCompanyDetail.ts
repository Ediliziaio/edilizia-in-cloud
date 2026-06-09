import { useState, useEffect, useRef, useMemo, useCallback } from "react";
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

      // 🛠️ 2026-05-10 — Performance fix: prima caricavamo 5000 orders + 5000
      // tickets per company per calcolare 4 numeri (count + sum). Su company
      // medie/grandi: 200-500 KB di payload e 50-200ms di parse client.
      //
      // Ora: 5 head-only COUNT queries (parallel) + 1 GET orders solo
      // total_amount con limit 5000 per la sum (necessario senza RPC server).
      // Riduzione attesa: 80-95% bandwidth, latenza simile o migliore grazie
      // a head:true che salta il transfer dei row data.
      const [
        companyRes,
        ordersCountRes,
        ordersAmountRes,
        profilesCountRes,
        ticketsCountRes,
        openTicketsCountRes,
      ] = await Promise.all([
        supabase.from("companies").select("*").eq("id", id).single(),
        // Count orders senza payload
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("company_id", id),
        // Per la sum: solo la colonna numerica, limite di sicurezza
        supabase.from("orders").select("total_amount").eq("company_id", id).limit(5000),
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("company_id", id),
        supabase.from("tickets").select("id", { count: "exact", head: true }).eq("company_id", id),
        // Count tickets aperti (server-side filter via .neq)
        supabase.from("tickets").select("id", { count: "exact", head: true }).eq("company_id", id).neq("status", "risolto"),
      ]);
      if (!companyRes.data) return null;
      const company = companyRes.data as unknown as Company;
      const ordersValue = ordersAmountRes.data?.reduce(
        (sum, o) => sum + (o.total_amount || 0),
        0,
      ) || 0;
      const stats: CompanyStats = {
        ordersCount: ordersCountRes.count || 0,
        ordersValue,
        customersCount: profilesCountRes.count || 0,
        ticketsCount: ticketsCountRes.count || 0,
        openTicketsCount: openTicketsCountRes.count || 0,
        teamCount: profilesCountRes.count || 0,
      };
      return { company, stats };
    },
    enabled: !!id,
    staleTime: 2 * 60 * 1000,
  });

  const company = companyData?.company ?? null;
  const stats = companyData?.stats ?? null;

  // Reset form when company data loads
  const resetFormWithCompany = useCallback((c: Company) => {
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
  }, [form]);

  const lastResetId = useRef<string | null>(null);
  useEffect(() => {
    if (company && company.id !== lastResetId.current) {
      lastResetId.current = company.id;
      resetFormWithCompany(company);
    }
  }, [company, resetFormWithCompany]);

  const { data: teamData, isFetching: isTeamFetching } = useQuery({
    queryKey: queryKeys.companyDetail.team(id),
    queryFn: async () => {
      if (!id) return null;
      const pageTo = 4999;
      const [profilesRes, permissionsRes, salespeopleRes, employeesRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, email, first_name, last_name, phone, created_at, last_login_at, company_id")
          .eq("company_id", id)
          .order("created_at", { ascending: true })
          .range(0, pageTo),
        supabase.from("staff_permissions").select("*").eq("company_id", id).range(0, pageTo),
        supabase.from("salespeople").select("*").eq("company_id", id).order("created_at", { ascending: true }).range(0, pageTo),
        supabase.from("employees").select("*").eq("company_id", id).order("created_at", { ascending: true }).range(0, pageTo),
      ]);
      if (profilesRes.error) throw profilesRes.error;
      if (permissionsRes.error) throw permissionsRes.error;
      if (salespeopleRes.error) throw salespeopleRes.error;
      if (employeesRes.error) throw employeesRes.error;
      const profiles = profilesRes.data || [];
      const profileIds = profiles.map((p) => p.id);
      let roles: { user_id: string; role: string }[] = [];
      if (profileIds.length > 0) {
        const { data: rolesData, error: rolesError } = await supabase
          .from("user_roles")
          .select("user_id, role")
          .in("user_id", profileIds)
          .range(0, pageTo);
        if (rolesError) throw rolesError;
        roles = rolesData || [];
      }
      const rolesByUser = new Map<string, Set<string>>();
      roles.forEach((row) => {
        const current = rolesByUser.get(row.user_id) ?? new Set<string>();
        current.add(row.role);
        rolesByUser.set(row.user_id, current);
      });
      const hasRole = (userId: string, roleName: string) => rolesByUser.get(userId)?.has(roleName) ?? false;
      const linkedOperationalUserIds = new Set<string>(
        [
          ...(salespeopleRes.data || []).map((s) => s.user_id),
          ...(employeesRes.data || []).map((e) => e.user_id),
        ].filter(Boolean) as string[],
      );
      const admins = profiles.filter((p) => hasRole(p.id, "company_admin"));
      const staff = profiles.filter((p) => {
        const userRoles = rolesByUser.get(p.id);
        if (!userRoles?.has("company_staff")) return false;
        if (userRoles.has("company_admin")) return false;
        if (userRoles.has("salesperson") || userRoles.has("employee") || userRoles.has("subcontractor")) return false;
        return !linkedOperationalUserIds.has(p.id);
      });
      const permissionsMap = new Map((permissionsRes.data || []).map((p) => [p.user_id, p]));
      return {
        admins,
        staff: staff.map((s) => ({ ...s, permissions: permissionsMap.get(s.id) || null })),
        salespeople: salespeopleRes.data || [],
        employees: employeesRes.data || [],
      };
    },
    enabled: !!id,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  const refreshTeamData = useCallback(async () => {
    if (!id) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.companyDetail.team(id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.companyDetail.detail(id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.companiesFull }),
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.companiesUserCounts }),
      queryClient.invalidateQueries({ queryKey: ["admin-companies-summary"] }),
    ]);
    await Promise.all([
      queryClient.refetchQueries({ queryKey: queryKeys.companyDetail.team(id), type: "active" }),
      queryClient.refetchQueries({ queryKey: queryKeys.companyDetail.detail(id), type: "active" }),
    ]);
  }, [id, queryClient]);

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
      // Solo piani globali (no piani ad hoc dei produttori). produttore_id non nei tipi → cast.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any).from("subscription_plans").select("*").eq("is_active", true).is("produttore_id", null).order("position");
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
    onError: (err: Error) => {
      toast.error("Errore aggiornamento stato", { description: err.message });
    },
  });

  const changePlanMutation = useMutation({
    mutationFn: async (planId: string) => {
      assertCanManage();
      if (!id) return;
      const { data, error } = await supabase.functions.invoke("admin-change-plan", {
        body: { company_id: id, new_plan_id: planId },
      });
      if (error) {
        const msg = await error?.context?.json?.().catch((): null => null);
        throw new Error(msg?.error || "Errore cambio piano");
      }
      return data;
    },
    onSuccess: (data) => {
      // S1.10: invalidazione completa di tutte le cache che dipendono dal piano
      queryClient.invalidateQueries({ queryKey: queryKeys.companyDetail.planAll });
      queryClient.invalidateQueries({ queryKey: queryKeys.companyDetail.subscriptionLogs(id) });
      // Feature resolver + override (il piano cambia i default)
      queryClient.invalidateQueries({ queryKey: queryKeys.featureFlags.companyResolved(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.featureFlags.companyOverrides(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.featureFlags.list(id) });
      // Feature-access per-feature (menu sidebar + FeatureGate)
      queryClient.invalidateQueries({ queryKey: ["feature-access"] });
      // Lista admin companies mostra il nome del piano
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.companiesFull });
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.planUsage });
      // Override per-azienda visti dal pannello admin
      queryClient.invalidateQueries({
        queryKey: queryKeys.admin.companyFeatureOverrides(id!),
      });
      setChangePlanDialog(false);
      refreshCompany();

      // Toast contestuale: se Stripe non è stato sincronizzato lo segnaliamo
      // come warning invece di success silente (S1.9 → feedback UX)
      if (data?.stripe_attempted && !data?.stripe_synced) {
        toast.warning("Piano aggiornato in DB ma Stripe NON sincronizzato", {
          description: data?.stripe_error
            ? `Errore Stripe: ${data.stripe_error}`
            : "Sottoscrizione Stripe non trovata — verifica manuale",
        });
      } else {
        toast.success("Piano aggiornato");
      }
    },
    onError: (err: Error) => {
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
    onError: (err: Error) => {
      toast.error("Errore estensione trial", { description: err.message });
    },
  });

  // ========== HANDLERS ==========

  const handleImpersonate = async (): Promise<string | null> => {
    if (!company) return null;
    return await impersonateCompany(company.id, saPermissions);
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
      await refreshTeamData();
      toast.success("Staff creato con successo");
      return { temporaryPassword: resp.data.temporary_password };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Errore sconosciuto";
      toast.error("Errore", { description: msg });
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
        ].some((k) => permissions[k as keyof StaffPermissions] === true),
        can_edit_marketing: [
          "can_edit_marketing_contacts",
          "can_edit_marketing_opportunities",
        ].some((k) => permissions[k as keyof StaffPermissions] === true),
      };
      const { error } = await supabase.from("staff_permissions").update(syncedPermissions).eq("user_id", permissionsUser.id).eq("company_id", id!);
      if (error) throw error;
      await refreshTeamData();
      toast.success("Permessi aggiornati");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Errore sconosciuto";
      toast.error("Errore", { description: msg });
    } finally {
      setSavingPermissions(false);
    }
  };

  // Payload per creazione venditore: replica i campi del form salesperson.
  // Tipato qui per evitare `any` sul mutation payload e sul handler.
  interface SalespersonFormPayload {
    first_name: string;
    last_name: string;
    email?: string | null;
    phone?: string | null;
    commission_type: string;
    commission_value: number;
    is_active?: boolean;
  }

  const createSalespersonMutation = useMutation({
    mutationFn: async (data: SalespersonFormPayload) => {
      assertCanManage();
      const { error } = await supabase.from("salespeople").insert({
        company_id: id!, first_name: data.first_name, last_name: data.last_name,
        email: data.email || null, phone: data.phone || null,
        commission_type: data.commission_type, commission_value: data.commission_value, is_active: data.is_active ?? true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setCreateSalespersonOpen(false);
      void refreshTeamData();
      toast.success("Venditore creato");
    },
    onError: (err: Error) => {
      toast.error("Errore", { description: err.message });
    },
  });

  const handleCreateSalesperson = (data: SalespersonFormPayload) => {
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
      void refreshTeamData();
      toast.success("Dipendente creato");
    },
    onError: (err: Error) => {
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
      await refreshTeamData();
      setPasswordDialog({ open: true, password: resp.data.temp_password, name, email });
      toast.success("Account creato");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Errore sconosciuto";
      toast.error("Errore", { description: msg });
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
      // Shape esatta del subset di colonne `companies` che aggiorniamo dal
      // form — coincide con i campi validati da `formSchema` più i 4 campi
      // operativi duplicati dal toggle "sameAsLegal".
      interface CompanyUpdatePayload {
        name: string;
        email: string;
        sector: CompanySector;
        business_name: string | null;
        phone: string | null;
        vat_number: string | null;
        fiscal_code: string | null;
        pec: string | null;
        sdi_code: string | null;
        website: string | null;
        legal_address: string | null;
        legal_city: string | null;
        legal_province: string | null;
        legal_postal_code: string | null;
        notes: string | null;
        operational_address: string | null;
        operational_city: string | null;
        operational_province: string | null;
        operational_postal_code: string | null;
      }
      const updateData: CompanyUpdatePayload = {
        name: data.name,
        email: data.email,
        sector: data.sector as CompanySector,
        business_name: data.business_name || null,
        phone: data.phone || null,
        vat_number: data.vat_number || null,
        fiscal_code: data.fiscal_code || null,
        pec: data.pec || null,
        sdi_code: data.sdi_code || null,
        website: data.website || null,
        legal_address: data.legal_address || null,
        legal_city: data.legal_city || null,
        legal_province: data.legal_province || null,
        legal_postal_code: data.legal_postal_code || null,
        notes: data.notes || null,
        operational_address: sameAsLegal
          ? data.legal_address || null
          : data.operational_address || null,
        operational_city: sameAsLegal
          ? data.legal_city || null
          : data.operational_city || null,
        operational_province: sameAsLegal
          ? data.legal_province || null
          : data.operational_province || null,
        operational_postal_code: sameAsLegal
          ? data.legal_postal_code || null
          : data.operational_postal_code || null,
      };
      const { error } = await supabase.from("companies").update(updateData).eq("id", id);
      if (error) throw error;
      refreshCompany();
      toast.success("Dati aggiornati con successo");
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Errore sconosciuto";
      toast.error("Errore", { description: msg });
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
      assertCanManage();
      if (!saPermissions.billing_write) {
        throw new Error("Permesso negato: non puoi modificare dati billing");
      }
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
    onError: (err: Error) => {
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
      assertCanManage();
      if (!saPermissions.billing_write) {
        throw new Error("Permesso negato: non puoi generare link di pagamento");
      }
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
    onError: (err: Error) => {
      toast.error("Errore generazione link", { description: err.message });
    },
  });

  const handleCreateCheckout = () => {
    createCheckoutMutation.mutate({});
  };

  const handleDeleteCompany = async () => {
    assertCanManage();
    if (!id || !company) return;
    const { data, error } = await supabase.functions.invoke("manage-super-admins", {
      body: { action: "delete-company", companyId: id },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
  };

  const handleExportCompany = () => {
    if (!company) return;
    if (!saPermissions.data_export) {
      toast.error("Permesso negato", { description: "Non puoi esportare dati aziendali" });
      return;
    }
    const exportData = {
      ...company,
      stats,
      team: teamData,
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${company.name.replace(/\s+/g, "_")}_export.json`;
    a.click();
    URL.revokeObjectURL(url);
    if (user?.id) {
      supabase.from("admin_audit_log").insert({
        user_id: user.id,
        action: "export_company_data",
        target_type: "company",
        target_id: id,
        details: { company_name: company.name },
      });
    }
  };

  return {
    // Data
    company, stats, isLoading, isError, refetch, teamData, isTeamFetching, refreshTeamData, currentPlan, subscriptionLogs, currentSubscription, plans, recentOrders, recentTickets, monthlyOrders, daysSinceLastOrder, form,
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
    handleUpdatePaymentMethod, handleCreateCheckout, handleDeleteCompany, handleExportCompany,
  };
}
