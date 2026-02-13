import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ArrowLeft,
  Building2,
  Mail,
  LogIn,
  Loader2,
  ClipboardList,
  Users,
  MessageSquare,
  CreditCard,
  Clock,
  Pause,
  Play,
  Timer,
  Save,
  Warehouse,
  CalendarDays,
  HardHat,
  HeadphonesIcon,
  TrendingUp,
  CheckCircle,
  XCircle,
  Shield,
  UserCheck,
  Phone,
  MapPin,
  CalendarIcon,
  RefreshCw,
  Globe,
  FileText,
  Hash,
  ReceiptText,
  StickyNote,
  HardDrive,
  BarChart3,
  Package,
  ArrowUpRight,
  Banknote,
} from "lucide-react";
import { format, addDays, formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import { formatCurrency } from "@/lib/formatters";
import type { Company, CompanyStatus, CompanySector } from "@/types/auth";
import { useToast } from "@/hooks/use-toast";

interface CompanyStats {
  ordersCount: number;
  ordersValue: number;
  customersCount: number;
  ticketsCount: number;
  openTicketsCount: number;
  teamCount: number;
}

const sectorLabels: Record<string, string> = {
  serramenti: "Serramenti",
  infissi: "Infissi",
  bagni: "Bagni",
  tetti: "Tetti",
  fotovoltaico: "Fotovoltaico",
  pittura: "Pittura",
  ristrutturazioni: "Ristrutturazioni",
  altro: "Altro",
};

const sectors: { value: CompanySector; label: string }[] = [
  { value: "serramenti", label: "Serramenti" },
  { value: "infissi", label: "Infissi" },
  { value: "bagni", label: "Bagni" },
  { value: "tetti", label: "Tetti" },
  { value: "fotovoltaico", label: "Fotovoltaico" },
  { value: "pittura", label: "Pittura" },
  { value: "ristrutturazioni", label: "Ristrutturazioni" },
  { value: "altro", label: "Altro" },
];

const statusConfig: Record<CompanyStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  trial: { label: "Trial", variant: "outline" },
  active: { label: "Attivo", variant: "default" },
  suspended: { label: "Sospeso", variant: "secondary" },
  expired: { label: "Scaduto", variant: "destructive" },
};

const eventTypeLabels: Record<string, string> = {
  trial_started: "Trial avviato",
  activated: "Attivato",
  suspended: "Sospeso",
  canceled: "Cancellato",
  renewed: "Rinnovato",
  plan_changed: "Piano cambiato",
  payment_failed: "Pagamento fallito",
  trial_extended: "Trial esteso",
  status_change: "Cambio stato",
};

const eventTypeIcons: Record<string, typeof Play> = {
  trial_started: Timer,
  activated: Play,
  suspended: Pause,
  canceled: XCircle,
  renewed: RefreshCw,
  plan_changed: CreditCard,
  payment_failed: XCircle,
  trial_extended: Timer,
  status_change: RefreshCw,
};

const ALL_MODULES = [
  { key: "orders", label: "Ordini", icon: ClipboardList, description: "Gestione ordini e preventivi" },
  { key: "warehouse", label: "Magazzino", icon: Warehouse, description: "Gestione materiali e scorte" },
  { key: "calendar", label: "Calendario", icon: CalendarDays, description: "Pianificazione lavori" },
  { key: "customers", label: "Clienti", icon: Users, description: "Anagrafica clienti" },
  { key: "employees", label: "Dipendenti", icon: HardHat, description: "Gestione personale" },
  { key: "tickets", label: "Assistenza", icon: HeadphonesIcon, description: "Supporto clienti" },
  { key: "forecast", label: "Previsionale", icon: TrendingUp, description: "Analisi cash flow" },
] as const;

const PERMISSION_LABELS: Record<string, string> = {
  can_view_dashboard: "Dashboard",
  can_view_orders: "Ordini",
  can_edit_orders: "Modifica Ordini",
  can_view_customers: "Clienti",
  can_edit_customers: "Modifica Clienti",
  can_view_warehouse: "Magazzino",
  can_edit_warehouse: "Modifica Magazzino",
  can_view_calendar: "Calendario",
  can_view_employees: "Dipendenti",
  can_view_tickets: "Ticket",
  can_edit_tickets: "Modifica Ticket",
  can_view_forecast: "Previsionale",
  can_view_settings: "Impostazioni",
};

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

  const onSaveDetails = async (data: FormData) => {
    if (!id) return;
    setIsSaving(true);
    try {
      const updateData: Record<string, any> = {
        name: data.name,
        email: data.email,
        sector: data.sector,
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

  const companyStatus = (company.status || "trial") as CompanyStatus;
  const statusCfg = statusConfig[companyStatus] || statusConfig.trial;
  const includedModules: string[] = currentPlan ? (Array.isArray((currentPlan as any).included_modules) ? (currentPlan as any).included_modules : ALL_MODULES.map((m) => m.key)) : [];
  const maxOrders = currentPlan?.max_orders ?? -1;
  const maxUsers = currentPlan?.max_users ?? -1;
  const maxStorage = currentPlan?.max_storage_mb ?? 500;
  const ordersPercent = maxOrders === -1 ? 0 : Math.min(100, ((stats?.ordersCount || 0) / maxOrders) * 100);
  const usersPercent = maxUsers === -1 ? 0 : Math.min(100, ((stats?.customersCount || 0) / maxUsers) * 100);

  const totalTeam = (teamData?.admins.length || 0) + (teamData?.staff.length || 0) + (teamData?.salespeople.length || 0) + (teamData?.employees.length || 0);

  const getActivePermissions = (permissions: any) => {
    if (!permissions) return [];
    return Object.entries(PERMISSION_LABELS)
      .filter(([key]) => permissions[key] === true)
      .map(([, label]) => label);
  };

  const commissionTypeLabels: Record<string, string> = {
    percentage_sold: "% sul venduto",
    percentage_margin: "% sul margine",
    fixed_per_order: "Fisso per ordine",
  };

  const ticketStatusLabels: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
    aperto: { label: "Aperto", variant: "outline" },
    in_lavorazione: { label: "In lavorazione", variant: "secondary" },
    risolto: { label: "Risolto", variant: "default" },
  };

  const avgOrderValue = stats && stats.ordersCount > 0 ? stats.ordersValue / stats.ordersCount : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin/aziende")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-4">
            {company.logo_url ? (
              <img src={company.logo_url} alt={company.name} className="h-12 w-12 rounded-xl object-cover" />
            ) : (
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Building2 className="h-6 w-6 text-primary" />
              </div>
            )}
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold">{company.name}</h1>
                <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
              </div>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{company.email}</span>
                {company.business_name && <span>· {company.business_name}</span>}
              </div>
            </div>
          </div>
        </div>
        <Button onClick={handleImpersonate}>
          <LogIn className="h-4 w-4 mr-2" />
          Accedi come Admin
        </Button>
      </div>

      {/* Tabs */}
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

        {/* ======================== TAB: DETTAGLI ======================== */}
        <TabsContent value="dettagli">
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Form - 2/3 */}
            <div className="lg:col-span-2">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSaveDetails)} className="space-y-6">
                  {/* Sezione 1: Identificazione */}
                  <Card>
                    <CardHeader className="pb-4">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-primary" />
                        Identificazione
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <FormField control={form.control} name="business_name" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Ragione Sociale</FormLabel>
                            <FormControl><Input placeholder="Ragione sociale..." {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="name" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Nome Commerciale *</FormLabel>
                            <FormControl><Input {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <FormField control={form.control} name="email" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email *</FormLabel>
                            <FormControl><Input type="email" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="phone" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Telefono</FormLabel>
                            <FormControl><Input placeholder="+39..." {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                      </div>
                      <FormField control={form.control} name="sector" render={({ field }) => (
                        <FormItem className="sm:w-1/2">
                          <FormLabel>Settore</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {sectors.map((s) => (
                                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )} />
                      {company.logo_url && (
                        <div>
                          <p className="text-sm font-medium mb-2">Logo attuale</p>
                          <img src={company.logo_url} alt="Logo" className="h-16 w-16 rounded-lg object-cover border" />
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Sezione 2: Dati Fiscali */}
                  <Card>
                    <CardHeader className="pb-4">
                      <CardTitle className="text-base flex items-center gap-2">
                        <ReceiptText className="h-4 w-4 text-primary" />
                        Dati Fiscali
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <FormField control={form.control} name="vat_number" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Partita IVA</FormLabel>
                            <FormControl><Input placeholder="IT12345678901" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="fiscal_code" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Codice Fiscale</FormLabel>
                            <FormControl><Input placeholder="Codice fiscale..." {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <FormField control={form.control} name="pec" render={({ field }) => (
                          <FormItem>
                            <FormLabel>PEC</FormLabel>
                            <FormControl><Input placeholder="azienda@pec.it" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="sdi_code" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Codice SDI</FormLabel>
                            <FormControl><Input placeholder="ABCDEFG" maxLength={7} {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                      </div>
                      <FormField control={form.control} name="website" render={({ field }) => (
                        <FormItem className="sm:w-1/2">
                          <FormLabel>Sito Web</FormLabel>
                          <FormControl><Input placeholder="https://www.esempio.it" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </CardContent>
                  </Card>

                  {/* Sezione 3: Sede Legale */}
                  <Card>
                    <CardHeader className="pb-4">
                      <CardTitle className="text-base flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-primary" />
                        Sede Legale
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <FormField control={form.control} name="legal_address" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Indirizzo</FormLabel>
                          <FormControl><Input placeholder="Via Roma, 1" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <div className="grid gap-4 sm:grid-cols-3">
                        <FormField control={form.control} name="legal_city" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Città</FormLabel>
                            <FormControl><Input placeholder="Milano" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="legal_province" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Provincia</FormLabel>
                            <FormControl><Input placeholder="MI" maxLength={2} {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="legal_postal_code" render={({ field }) => (
                          <FormItem>
                            <FormLabel>CAP</FormLabel>
                            <FormControl><Input placeholder="20100" maxLength={5} {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                      </div>
                    </CardContent>
                  </Card>

                  {/* Sezione 4: Sede Operativa */}
                  <Card>
                    <CardHeader className="pb-4">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-primary" />
                          Sede Operativa
                        </CardTitle>
                        <div className="flex items-center gap-2">
                          <Checkbox id="same-as-legal" checked={sameAsLegal} onCheckedChange={(v) => setSameAsLegal(!!v)} />
                          <label htmlFor="same-as-legal" className="text-sm text-muted-foreground cursor-pointer">
                            Uguale alla sede legale
                          </label>
                        </div>
                      </div>
                    </CardHeader>
                    {!sameAsLegal && (
                      <CardContent className="space-y-4">
                        <FormField control={form.control} name="operational_address" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Indirizzo</FormLabel>
                            <FormControl><Input placeholder="Via Roma, 1" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <div className="grid gap-4 sm:grid-cols-3">
                          <FormField control={form.control} name="operational_city" render={({ field }) => (
                            <FormItem>
                              <FormLabel>Città</FormLabel>
                              <FormControl><Input placeholder="Milano" {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )} />
                          <FormField control={form.control} name="operational_province" render={({ field }) => (
                            <FormItem>
                              <FormLabel>Provincia</FormLabel>
                              <FormControl><Input placeholder="MI" maxLength={2} {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )} />
                          <FormField control={form.control} name="operational_postal_code" render={({ field }) => (
                            <FormItem>
                              <FormLabel>CAP</FormLabel>
                              <FormControl><Input placeholder="20100" maxLength={5} {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )} />
                        </div>
                      </CardContent>
                    )}
                  </Card>

                  {/* Sezione 5: Note */}
                  <Card>
                    <CardHeader className="pb-4">
                      <CardTitle className="text-base flex items-center gap-2">
                        <StickyNote className="h-4 w-4 text-primary" />
                        Note Interne
                      </CardTitle>
                      <CardDescription>Visibili solo al Super Admin</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <FormField control={form.control} name="notes" render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Textarea placeholder="Annotazioni interne sull'azienda..." rows={4} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </CardContent>
                  </Card>

                  {/* Save button */}
                  <div className="sticky bottom-4 z-10">
                    <Button type="submit" disabled={isSaving} className="w-full sm:w-auto shadow-lg">
                      {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                      Salva Modifiche
                    </Button>
                  </div>
                </form>
              </Form>
            </div>

            {/* Sidebar Panoramica - 1/3 */}
            <div className="space-y-6">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex flex-col items-center text-center space-y-4">
                    {company.logo_url ? (
                      <img src={company.logo_url} alt={company.name} className="h-20 w-20 rounded-2xl object-cover shadow-sm" />
                    ) : (
                      <div className="h-20 w-20 rounded-2xl bg-primary/10 flex items-center justify-center">
                        <Building2 className="h-10 w-10 text-primary" />
                      </div>
                    )}
                    <div>
                      <h3 className="font-semibold text-lg">{company.name}</h3>
                      {company.business_name && <p className="text-sm text-muted-foreground">{company.business_name}</p>}
                      <p className="text-sm text-muted-foreground">{company.email}</p>
                    </div>
                    <div className="flex gap-2 flex-wrap justify-center">
                      <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
                      <Badge variant="secondary">{sectorLabels[company.sector] || company.sector}</Badge>
                    </div>
                  </div>

                  <Separator className="my-5" />

                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Piano</span>
                      <span className="font-medium">{currentPlan?.name || "Nessuno"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Creata</span>
                      <span className="font-medium">{format(new Date(company.created_at), "dd/MM/yyyy", { locale: it })}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Aggiornata</span>
                      <span className="font-medium">{formatDistanceToNow(new Date(company.updated_at), { addSuffix: true, locale: it })}</span>
                    </div>
                    {companyStatus === "trial" && company.trial_ends_at && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Scadenza trial</span>
                        <span className="font-medium">{format(new Date(company.trial_ends_at), "dd/MM/yyyy", { locale: it })}</span>
                      </div>
                    )}
                    {company.vat_number && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">P.IVA</span>
                        <span className="font-medium font-mono text-xs">{company.vat_number}</span>
                      </div>
                    )}
                  </div>

                  <Separator className="my-5" />

                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <p className="text-2xl font-bold">{stats?.ordersCount || 0}</p>
                      <p className="text-xs text-muted-foreground">Ordini</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{stats?.customersCount || 0}</p>
                      <p className="text-xs text-muted-foreground">Clienti</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{totalTeam}</p>
                      <p className="text-xs text-muted-foreground">Team</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ======================== TAB: TEAM ======================== */}
        <TabsContent value="team">
          <div className="space-y-6">
            <Card>
              <CardContent className="py-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-sm font-medium">{totalTeam} membri totali:</span>
                  <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700">{teamData?.admins.length || 0} Admin</Badge>
                  <Badge variant="default" className="bg-blue-600 hover:bg-blue-700">{teamData?.staff.length || 0} Staff</Badge>
                  <Badge variant="default" className="bg-violet-600 hover:bg-violet-700">{teamData?.salespeople.length || 0} Venditori</Badge>
                  <Badge variant="default" className="bg-amber-600 hover:bg-amber-700">{teamData?.employees.length || 0} Dipendenti</Badge>
                </div>
              </CardContent>
            </Card>

            {/* Admin */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-emerald-600" />
                  <CardTitle className="text-base">Admin Azienda</CardTitle>
                  <Badge variant="secondary" className="ml-auto">{teamData?.admins.length || 0}</Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {teamData?.admins.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">Nessun admin trovato</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Telefono</TableHead>
                        <TableHead>Creato il</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {teamData?.admins.map((admin) => (
                        <TableRow key={admin.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 text-xs font-bold">
                                {admin.first_name[0]}{admin.last_name[0]}
                              </div>
                              {admin.first_name} {admin.last_name}
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{admin.email}</TableCell>
                          <TableCell className="text-muted-foreground">{admin.phone || "—"}</TableCell>
                          <TableCell className="text-muted-foreground">{format(new Date(admin.created_at), "dd/MM/yyyy")}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* Staff */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <UserCheck className="h-5 w-5 text-blue-600" />
                  <CardTitle className="text-base">Staff</CardTitle>
                  <Badge variant="secondary" className="ml-auto">{teamData?.staff.length || 0}</Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {teamData?.staff.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">Nessun membro staff trovato</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Permessi</TableHead>
                        <TableHead>Creato il</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {teamData?.staff.map((member) => {
                        const perms = getActivePermissions(member.permissions);
                        return (
                          <TableRow key={member.id}>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-bold">
                                  {member.first_name[0]}{member.last_name[0]}
                                </div>
                                {member.first_name} {member.last_name}
                              </div>
                            </TableCell>
                            <TableCell className="text-muted-foreground">{member.email}</TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1 max-w-xs">
                                {perms.length === 0 ? (
                                  <span className="text-sm text-muted-foreground">Nessun permesso</span>
                                ) : perms.length <= 4 ? (
                                  perms.map((p) => <Badge key={p} variant="outline" className="text-xs px-1.5 py-0">{p}</Badge>)
                                ) : (
                                  <>
                                    {perms.slice(0, 3).map((p) => <Badge key={p} variant="outline" className="text-xs px-1.5 py-0">{p}</Badge>)}
                                    <Badge variant="secondary" className="text-xs px-1.5 py-0">+{perms.length - 3} altri</Badge>
                                  </>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-muted-foreground">{format(new Date(member.created_at), "dd/MM/yyyy")}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* Salespeople */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-violet-600" />
                  <CardTitle className="text-base">Venditori</CardTitle>
                  <Badge variant="secondary" className="ml-auto">{teamData?.salespeople.length || 0}</Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {teamData?.salespeople.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">Nessun venditore trovato</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Telefono</TableHead>
                        <TableHead>Provvigione</TableHead>
                        <TableHead>Account</TableHead>
                        <TableHead>Stato</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {teamData?.salespeople.map((sp) => (
                        <TableRow key={sp.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <div className="h-8 w-8 rounded-full bg-violet-100 flex items-center justify-center text-violet-700 text-xs font-bold">
                                {sp.first_name[0]}{sp.last_name[0]}
                              </div>
                              <div>
                                <p>{sp.first_name} {sp.last_name}</p>
                                {sp.email && <p className="text-xs text-muted-foreground">{sp.email}</p>}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{sp.phone || "—"}</TableCell>
                          <TableCell>
                            <span className="font-medium">{sp.commission_type === "fixed_per_order" ? formatCurrency(sp.commission_value) : `${sp.commission_value}%`}</span>
                            <span className="text-xs text-muted-foreground ml-1">{commissionTypeLabels[sp.commission_type] || sp.commission_type}</span>
                          </TableCell>
                          <TableCell>
                            {sp.user_id ? <Badge variant="default" className="bg-emerald-600 text-xs">Attivo</Badge> : <Badge variant="secondary" className="text-xs">No account</Badge>}
                          </TableCell>
                          <TableCell>
                            {sp.is_active ? <Badge variant="default" className="text-xs">Attivo</Badge> : <Badge variant="destructive" className="text-xs">Inattivo</Badge>}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* Employees */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <HardHat className="h-5 w-5 text-amber-600" />
                  <CardTitle className="text-base">Dipendenti</CardTitle>
                  <Badge variant="secondary" className="ml-auto">{teamData?.employees.length || 0}</Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {teamData?.employees.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">Nessun dipendente trovato</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Telefono</TableHead>
                        <TableHead>Ore/mese</TableHead>
                        <TableHead>Lordo</TableHead>
                        <TableHead>Netto</TableHead>
                        <TableHead>Account</TableHead>
                        <TableHead>Stato</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {teamData?.employees.map((emp) => (
                        <TableRow key={emp.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <div className="h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 text-xs font-bold">
                                {emp.first_name[0]}{emp.last_name[0]}
                              </div>
                              <div>
                                <p>{emp.first_name} {emp.last_name}</p>
                                {emp.email && <p className="text-xs text-muted-foreground">{emp.email}</p>}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{emp.phone || "—"}</TableCell>
                          <TableCell className="font-medium">{emp.monthly_hours}h</TableCell>
                          <TableCell className="font-medium">{formatCurrency(emp.gross_salary)}</TableCell>
                          <TableCell className="font-medium">{formatCurrency(emp.net_salary)}</TableCell>
                          <TableCell>
                            {emp.user_id ? <Badge variant="default" className="bg-emerald-600 text-xs">Attivo</Badge> : <Badge variant="secondary" className="text-xs">No account</Badge>}
                          </TableCell>
                          <TableCell>
                            {emp.is_active ? <Badge variant="default" className="text-xs">Attivo</Badge> : <Badge variant="destructive" className="text-xs">Inattivo</Badge>}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ======================== TAB: SAAS ======================== */}
        <TabsContent value="saas">
          <div className="space-y-6">
            {/* Piano e limiti */}
            <div className="grid gap-6 lg:grid-cols-3">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Package className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Piano Attuale</p>
                      <p className="text-xl font-bold">{currentPlan?.name || "Nessuno"}</p>
                    </div>
                  </div>
                  {currentPlan && (
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Mensile</span>
                        <span className="font-semibold">{formatCurrency(currentPlan.price_monthly)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Annuale</span>
                        <span className="font-semibold">{formatCurrency(currentPlan.price_yearly)}</span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                      <ClipboardList className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Ordini</p>
                      <p className="text-xl font-bold">{stats?.ordersCount || 0} <span className="text-sm font-normal text-muted-foreground">/ {maxOrders === -1 ? "∞" : maxOrders}</span></p>
                    </div>
                  </div>
                  <Progress value={maxOrders === -1 ? 0 : ordersPercent} className="h-2" />
                  <p className="text-xs text-muted-foreground mt-2">
                    {maxOrders === -1 ? "Illimitati" : `${Math.max(0, maxOrders - (stats?.ordersCount || 0))} rimanenti`}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-10 w-10 rounded-lg bg-violet-500/10 flex items-center justify-center">
                      <Users className="h-5 w-5 text-violet-600" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Utenti</p>
                      <p className="text-xl font-bold">{stats?.customersCount || 0} <span className="text-sm font-normal text-muted-foreground">/ {maxUsers === -1 ? "∞" : maxUsers}</span></p>
                    </div>
                  </div>
                  <Progress value={maxUsers === -1 ? 0 : usersPercent} className="h-2" />
                  <p className="text-xs text-muted-foreground mt-2">
                    {maxUsers === -1 ? "Illimitati" : `${Math.max(0, maxUsers - (stats?.customersCount || 0))} rimanenti`}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Storage */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-base flex items-center gap-2">
                  <HardDrive className="h-4 w-4 text-primary" />
                  Storage
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <Progress value={0} className="h-3" />
                  </div>
                  <span className="text-sm font-medium whitespace-nowrap">0 / {maxStorage} MB</span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">Spazio disponibile per allegati e documenti</p>
              </CardContent>
            </Card>

            {/* Moduli */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Moduli Inclusi</CardTitle>
                <CardDescription>Funzionalità disponibili nel piano attuale</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {ALL_MODULES.map((mod) => {
                    const enabled = includedModules.includes(mod.key);
                    return (
                      <div
                        key={mod.key}
                        className={`flex items-start gap-3 rounded-xl border p-4 transition-colors ${enabled ? "border-primary/30 bg-primary/5" : "opacity-40 border-dashed"}`}
                      >
                        <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${enabled ? "bg-primary/10" : "bg-muted"}`}>
                          <mod.icon className={`h-5 w-5 ${enabled ? "text-primary" : "text-muted-foreground"}`} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{mod.label}</span>
                            {enabled ? <CheckCircle className="h-3.5 w-3.5 text-primary" /> : <XCircle className="h-3.5 w-3.5 text-muted-foreground" />}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{mod.description}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Confronto piani */}
            {plans && plans.length > 1 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <ArrowUpRight className="h-4 w-4 text-primary" />
                    Confronto Piani
                  </CardTitle>
                  <CardDescription>Piani disponibili per upgrade</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {plans.map((plan) => {
                      const isCurrent = plan.id === company.subscription_plan_id;
                      return (
                        <div key={plan.id} className={`rounded-xl border p-4 space-y-3 ${isCurrent ? "border-primary bg-primary/5 ring-1 ring-primary/20" : ""}`}>
                          <div className="flex items-center justify-between">
                            <h4 className="font-semibold">{plan.name}</h4>
                            {isCurrent && <Badge variant="default" className="text-xs">Attuale</Badge>}
                          </div>
                          <p className="text-2xl font-bold">{formatCurrency(plan.price_monthly)}<span className="text-sm font-normal text-muted-foreground">/mese</span></p>
                          <div className="space-y-1.5 text-sm">
                            <div className="flex justify-between"><span className="text-muted-foreground">Ordini</span><span className="font-medium">{plan.max_orders === -1 ? "∞" : plan.max_orders}</span></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">Utenti</span><span className="font-medium">{plan.max_users === -1 ? "∞" : plan.max_users}</span></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">Storage</span><span className="font-medium">{plan.max_storage_mb} MB</span></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* ======================== TAB: ABBONAMENTO ======================== */}
        <TabsContent value="abbonamento">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Stato abbonamento */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <CreditCard className="h-5 w-5" />
                      Stato Abbonamento
                    </CardTitle>
                    <CardDescription>Gestisci lo stato e il piano</CardDescription>
                  </div>
                  <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between py-2 border-b text-sm">
                  <span className="text-muted-foreground">Piano</span>
                  <span className="font-medium">{currentPlan?.name || "Nessun piano"}</span>
                </div>
                {companyStatus === "trial" && company.trial_ends_at && (
                  <div className="flex justify-between py-2 border-b text-sm">
                    <span className="text-muted-foreground">Scadenza Trial</span>
                    <span className="font-medium">{format(new Date(company.trial_ends_at), "dd/MM/yyyy", { locale: it })}</span>
                  </div>
                )}
                {currentPlan && (
                  <div className="flex justify-between py-2 border-b text-sm">
                    <span className="text-muted-foreground">Prezzo</span>
                    <span className="font-medium">{formatCurrency(currentPlan.price_monthly)}/mese</span>
                  </div>
                )}
                {company.stripe_customer_id && (
                  <div className="flex justify-between py-2 border-b text-sm">
                    <span className="text-muted-foreground">Stripe ID</span>
                    <span className="font-medium font-mono text-xs">{company.stripe_customer_id}</span>
                  </div>
                )}
                {currentSubscription?.current_period_start && (
                  <div className="flex justify-between py-2 border-b text-sm">
                    <span className="text-muted-foreground">Inizio periodo</span>
                    <span className="font-medium">{format(new Date(currentSubscription.current_period_start), "dd/MM/yyyy", { locale: it })}</span>
                  </div>
                )}
                {currentSubscription?.current_period_end && (
                  <div className="flex justify-between py-2 border-b text-sm">
                    <span className="text-muted-foreground">Fine periodo</span>
                    <span className="font-medium">{format(new Date(currentSubscription.current_period_end), "dd/MM/yyyy", { locale: it })}</span>
                  </div>
                )}
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={() => setChangePlanDialog(true)}>
                    <CreditCard className="h-3 w-3 mr-1" />Cambia piano
                  </Button>
                  {companyStatus !== "suspended" ? (
                    <Button variant="outline" size="sm" disabled={updateStatusMutation.isPending} onClick={() => updateStatusMutation.mutate({ newStatus: "suspended", notes: "Sospeso manualmente" })}>
                      {updateStatusMutation.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Pause className="h-3 w-3 mr-1" />}Sospendi
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" disabled={updateStatusMutation.isPending} onClick={() => updateStatusMutation.mutate({ newStatus: "active", notes: "Riattivato manualmente" })}>
                      {updateStatusMutation.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Play className="h-3 w-3 mr-1" />}Riattiva
                    </Button>
                  )}
                  {(companyStatus === "trial" || companyStatus === "expired") && (
                    <Button variant="outline" size="sm" disabled={extendTrialMutation.isPending} onClick={() => extendTrialMutation.mutate(14)}>
                      {extendTrialMutation.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Timer className="h-3 w-3 mr-1" />}+14 giorni trial
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Dati Fatturazione */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Banknote className="h-5 w-5" />
                  Dati Fatturazione
                </CardTitle>
                <CardDescription>Dati aziendali per la fatturazione</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between py-2 border-b text-sm">
                  <span className="text-muted-foreground">Ragione Sociale</span>
                  <span className="font-medium">{company.business_name || company.name}</span>
                </div>
                {company.vat_number && (
                  <div className="flex justify-between py-2 border-b text-sm">
                    <span className="text-muted-foreground">Partita IVA</span>
                    <span className="font-medium font-mono">{company.vat_number}</span>
                  </div>
                )}
                {company.fiscal_code && (
                  <div className="flex justify-between py-2 border-b text-sm">
                    <span className="text-muted-foreground">Codice Fiscale</span>
                    <span className="font-medium font-mono">{company.fiscal_code}</span>
                  </div>
                )}
                {company.pec && (
                  <div className="flex justify-between py-2 border-b text-sm">
                    <span className="text-muted-foreground">PEC</span>
                    <span className="font-medium">{company.pec}</span>
                  </div>
                )}
                {company.sdi_code && (
                  <div className="flex justify-between py-2 border-b text-sm">
                    <span className="text-muted-foreground">Codice SDI</span>
                    <span className="font-medium font-mono">{company.sdi_code}</span>
                  </div>
                )}
                {company.legal_address && (
                  <div className="flex justify-between py-2 border-b text-sm">
                    <span className="text-muted-foreground">Sede Legale</span>
                    <span className="font-medium text-right">
                      {company.legal_address}{company.legal_city ? `, ${company.legal_city}` : ""}{company.legal_province ? ` (${company.legal_province})` : ""}{company.legal_postal_code ? ` - ${company.legal_postal_code}` : ""}
                    </span>
                  </div>
                )}
                {!company.vat_number && !company.pec && !company.sdi_code && (
                  <p className="text-sm text-muted-foreground text-center py-4">Nessun dato fiscale inserito. Compilali nel tab "Dettagli di base".</p>
                )}
              </CardContent>
            </Card>

            {/* Storico */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Storico Abbonamento
                </CardTitle>
                <CardDescription>Ultimi eventi</CardDescription>
              </CardHeader>
              <CardContent>
                {!subscriptionLogs || subscriptionLogs.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Nessun evento registrato</p>
                ) : (
                  <div className="space-y-4">
                    {subscriptionLogs.map((log) => {
                      const planInfo = log.subscription_plans as { name: string } | null;
                      const IconComp = eventTypeIcons[log.event_type] || RefreshCw;
                      return (
                        <div key={log.id} className="flex items-start gap-3 text-sm">
                          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                            <IconComp className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium">
                              {eventTypeLabels[log.event_type] || log.event_type}
                              {planInfo && <span className="text-muted-foreground"> — {planInfo.name}</span>}
                            </p>
                            {log.notes && <p className="text-muted-foreground truncate">{log.notes}</p>}
                            {log.old_status && log.new_status && log.old_status !== log.new_status && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {statusConfig[log.old_status as CompanyStatus]?.label || log.old_status} → {statusConfig[log.new_status as CompanyStatus]?.label || log.new_status}
                              </p>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {format(new Date(log.created_at), "dd/MM/yy HH:mm")}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ======================== TAB: ATTIVITA ======================== */}
        <TabsContent value="attivita">
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Ordini</CardTitle>
                  <ClipboardList className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats?.ordersCount || 0}</div>
                  <p className="text-xs text-muted-foreground">{formatCurrency(stats?.ordersValue || 0)} totale</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Valore Medio</CardTitle>
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(avgOrderValue)}</div>
                  <p className="text-xs text-muted-foreground">per ordine</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Clienti</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats?.customersCount || 0}</div>
                  <p className="text-xs text-muted-foreground">registrati</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Team</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{totalTeam}</div>
                  <p className="text-xs text-muted-foreground">
                    {teamData?.admins.length || 0}A · {teamData?.staff.length || 0}S · {teamData?.salespeople.length || 0}V · {teamData?.employees.length || 0}D
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Ticket Aperti</CardTitle>
                  <MessageSquare className={`h-4 w-4 ${(stats?.openTicketsCount || 0) > 0 ? "text-orange-500" : "text-green-500"}`} />
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${(stats?.openTicketsCount || 0) > 0 ? "text-orange-600" : "text-green-600"}`}>
                    {stats?.openTicketsCount || 0}
                  </div>
                  <p className="text-xs text-muted-foreground">{stats?.ticketsCount || 0} totali</p>
                </CardContent>
              </Card>
            </div>

            {/* Ultimi ordini e ticket */}
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <ClipboardList className="h-4 w-4 text-primary" />
                    Ultimi Ordini
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {!recentOrders || recentOrders.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">Nessun ordine</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Descrizione</TableHead>
                          <TableHead>Importo</TableHead>
                          <TableHead>Stato</TableHead>
                          <TableHead>Data</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {recentOrders.map((order) => {
                          const statusInfo = order.order_statuses as { name: string; color: string; icon: string } | null;
                          return (
                            <TableRow key={order.id}>
                              <TableCell className="font-medium max-w-[200px] truncate">{order.description}</TableCell>
                              <TableCell className="font-medium">{formatCurrency(order.total_amount)}</TableCell>
                              <TableCell>
                                {statusInfo ? (
                                  <Badge variant="outline" className="text-xs" style={{ borderColor: statusInfo.color, color: statusInfo.color }}>
                                    {statusInfo.name}
                                  </Badge>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell className="text-muted-foreground text-xs">{format(new Date(order.created_at), "dd/MM/yy")}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-primary" />
                    Ultimi Ticket
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {!recentTickets || recentTickets.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">Nessun ticket</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Oggetto</TableHead>
                          <TableHead>Stato</TableHead>
                          <TableHead>Data</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {recentTickets.map((ticket) => {
                          const tStatus = ticketStatusLabels[ticket.status] || { label: ticket.status, variant: "outline" as const };
                          return (
                            <TableRow key={ticket.id}>
                              <TableCell className="font-medium max-w-[250px] truncate">{ticket.subject}</TableCell>
                              <TableCell>
                                <Badge variant={tStatus.variant} className="text-xs">{tStatus.label}</Badge>
                              </TableCell>
                              <TableCell className="text-muted-foreground text-xs">{format(new Date(ticket.created_at), "dd/MM/yy")}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Azioni rapide */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Azioni Rapide</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-3">
                <Button variant="outline" onClick={handleImpersonate}>
                  <LogIn className="h-4 w-4 mr-2" />
                  Accedi al pannello azienda
                </Button>
                <Button variant="outline" onClick={async () => { await impersonateCompany(company.id); navigate("/azienda/ordini"); }}>
                  <ClipboardList className="h-4 w-4 mr-2" />
                  Visualizza ordini ({stats?.ordersCount || 0})
                </Button>
                <Button variant="outline" onClick={async () => { await impersonateCompany(company.id); navigate("/azienda/assistenza"); }}>
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Gestisci ticket ({stats?.ticketsCount || 0})
                </Button>
              </CardContent>
            </Card>
          </div>
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
    </div>
  );
}
