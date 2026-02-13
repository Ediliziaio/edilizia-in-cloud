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
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import {
  ArrowLeft,
  Building2,
  Mail,
  LogIn,
  Loader2,
  ClipboardList,
  Users,
  MessageSquare,
  Calendar,
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
} from "lucide-react";
import { format, addDays } from "date-fns";
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

const ALL_MODULES = [
  { key: "orders", label: "Ordini", icon: ClipboardList },
  { key: "warehouse", label: "Magazzino", icon: Warehouse },
  { key: "calendar", label: "Calendario", icon: CalendarDays },
  { key: "customers", label: "Clienti", icon: Users },
  { key: "employees", label: "Dipendenti", icon: HardHat },
  { key: "tickets", label: "Assistenza", icon: HeadphonesIcon },
  { key: "forecast", label: "Previsionale", icon: TrendingUp },
] as const;

const formSchema = z.object({
  name: z.string().min(2, "Il nome deve avere almeno 2 caratteri"),
  email: z.string().email("Email non valida"),
  sector: z.enum(["serramenti", "infissi", "bagni", "tetti", "fotovoltaico", "pittura", "ristrutturazioni", "altro"]),
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

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", email: "", sector: "altro" },
  });

  useEffect(() => {
    async function fetchCompanyData() {
      if (!id) return;
      const [companyRes, ordersRes, customersRes, ticketsRes] = await Promise.all([
        supabase.from("companies").select("*").eq("id", id).single(),
        supabase.from("orders").select("id, total_amount").eq("company_id", id),
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("company_id", id),
        supabase.from("tickets").select("id, status").eq("company_id", id),
      ]);
      if (companyRes.data) {
        const c = companyRes.data as Company;
        setCompany(c);
        form.reset({ name: c.name, email: c.email, sector: c.sector as CompanySector });
      }
      const ordersValue = ordersRes.data?.reduce((sum, o) => sum + (o.total_amount || 0), 0) || 0;
      const openTickets = ticketsRes.data?.filter((t) => t.status !== "risolto").length || 0;
      setStats({
        ordersCount: ordersRes.data?.length || 0,
        ordersValue,
        customersCount: customersRes.count || 0,
        ticketsCount: ticketsRes.data?.length || 0,
        openTicketsCount: openTickets,
      });
      setIsLoading(false);
    }
    fetchCompanyData();
  }, [id, form]);

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

  const { data: plans } = useQuery({
    queryKey: ["subscription-plans-active"],
    queryFn: async () => {
      const { data } = await supabase.from("subscription_plans").select("*").eq("is_active", true).order("position");
      return data || [];
    },
  });

  const refreshCompany = async () => {
    const { data } = await supabase.from("companies").select("*").eq("id", id!).single();
    if (data) setCompany(data as Company);
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
      const { error } = await supabase.from("companies").update({ name: data.name, email: data.email, sector: data.sector }).eq("id", id);
      if (error) throw error;
      await refreshCompany();
      toast({ title: "Dati aggiornati" });
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
  const ordersPercent = maxOrders === -1 ? 0 : Math.min(100, ((stats?.ordersCount || 0) / maxOrders) * 100);
  const usersPercent = maxUsers === -1 ? 0 : Math.min(100, ((stats?.customersCount || 0) / maxUsers) * 100);

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
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Mail className="h-3.5 w-3.5" />
                {company.email}
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
          <TabsTrigger value="saas">SaaS</TabsTrigger>
          <TabsTrigger value="abbonamento">Abbonamento</TabsTrigger>
          <TabsTrigger value="attivita">Attività</TabsTrigger>
        </TabsList>

        {/* TAB: Dettagli di base */}
        <TabsContent value="dettagli">
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Informazioni Account</CardTitle>
                <CardDescription>Modifica i dati dell'azienda</CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSaveDetails)} className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Nome Azienda</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                              <Input type="email" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={form.control}
                      name="sector"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Settore</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {sectors.map((s) => (
                                <SelectItem key={s.value} value={s.value}>
                                  {s.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button type="submit" disabled={isSaving}>
                      {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                      Salva Modifiche
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Info Generali</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between py-2 border-b text-sm">
                  <span className="text-muted-foreground">Settore</span>
                  <Badge variant="secondary">{sectorLabels[company.sector] || company.sector}</Badge>
                </div>
                <div className="flex justify-between py-2 border-b text-sm">
                  <span className="text-muted-foreground">Creata il</span>
                  <span className="font-medium">{format(new Date(company.created_at), "dd MMM yyyy", { locale: it })}</span>
                </div>
                <div className="flex justify-between py-2 border-b text-sm">
                  <span className="text-muted-foreground">Piano</span>
                  <span className="font-medium">{currentPlan?.name || "Nessuno"}</span>
                </div>
                <div className="flex justify-between py-2 text-sm">
                  <span className="text-muted-foreground">Stato</span>
                  <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TAB: SaaS */}
        <TabsContent value="saas">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Piano Attuale</CardTitle>
                <CardDescription>{currentPlan?.name || "Nessun piano assegnato"}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {currentPlan && (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Prezzo mensile</span>
                      <span className="font-semibold">{formatCurrency(currentPlan.price_monthly)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Prezzo annuale</span>
                      <span className="font-semibold">{formatCurrency(currentPlan.price_yearly)}</span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Utilizzo</CardTitle>
                <CardDescription>Ordini e utenti rispetto ai limiti del piano</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Ordini</span>
                    <span className="font-medium">
                      {stats?.ordersCount || 0} / {maxOrders === -1 ? "∞" : maxOrders}
                    </span>
                  </div>
                  <Progress value={maxOrders === -1 ? 0 : ordersPercent} className="h-2" />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Utenti</span>
                    <span className="font-medium">
                      {stats?.customersCount || 0} / {maxUsers === -1 ? "∞" : maxUsers}
                    </span>
                  </div>
                  <Progress value={maxUsers === -1 ? 0 : usersPercent} className="h-2" />
                </div>
              </CardContent>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Moduli Inclusi</CardTitle>
                <CardDescription>Funzionalità disponibili nel piano attuale</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {ALL_MODULES.map((mod) => {
                    const enabled = includedModules.includes(mod.key);
                    return (
                      <div
                        key={mod.key}
                        className={`flex items-center gap-2 rounded-lg border p-3 ${enabled ? "border-primary/30 bg-primary/5" : "opacity-50"}`}
                      >
                        {enabled ? <CheckCircle className="h-4 w-4 text-primary" /> : <XCircle className="h-4 w-4 text-muted-foreground" />}
                        <mod.icon className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{mod.label}</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TAB: Abbonamento */}
        <TabsContent value="abbonamento">
          <div className="grid gap-6 lg:grid-cols-2">
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
              <CardContent className="space-y-4">
                <div className="flex justify-between py-2 border-b text-sm">
                  <span className="text-muted-foreground">Piano</span>
                  <span className="font-medium">{currentPlan?.name || "Nessun piano"}</span>
                </div>
                {companyStatus === "trial" && company.trial_ends_at && (
                  <div className="flex justify-between py-2 border-b text-sm">
                    <span className="text-muted-foreground">Scadenza Trial</span>
                    <div className="flex items-center gap-1">
                      <Timer className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-medium">{format(new Date(company.trial_ends_at), "dd/MM/yyyy", { locale: it })}</span>
                    </div>
                  </div>
                )}
                {currentPlan && (
                  <div className="flex justify-between py-2 border-b text-sm">
                    <span className="text-muted-foreground">Prezzo</span>
                    <span className="font-medium">{formatCurrency(currentPlan.price_monthly)}/mese</span>
                  </div>
                )}
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={() => setChangePlanDialog(true)}>
                    <CreditCard className="h-3 w-3 mr-1" />
                    Cambia piano
                  </Button>
                  {companyStatus !== "suspended" ? (
                    <Button variant="outline" size="sm" onClick={() => updateStatusMutation.mutate({ newStatus: "suspended", notes: "Sospeso manualmente" })}>
                      <Pause className="h-3 w-3 mr-1" />
                      Sospendi
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => updateStatusMutation.mutate({ newStatus: "active", notes: "Riattivato manualmente" })}>
                      <Play className="h-3 w-3 mr-1" />
                      Riattiva
                    </Button>
                  )}
                  {(companyStatus === "trial" || companyStatus === "expired") && (
                    <Button variant="outline" size="sm" onClick={() => extendTrialMutation.mutate(14)}>
                      <Timer className="h-3 w-3 mr-1" />
                      +14 giorni trial
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
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
                  <div className="space-y-3">
                    {subscriptionLogs.map((log) => {
                      const planInfo = log.subscription_plans as { name: string } | null;
                      return (
                        <div key={log.id} className="flex items-start gap-3 text-sm">
                          <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium">
                              {eventTypeLabels[log.event_type] || log.event_type}
                              {planInfo && <span className="text-muted-foreground"> — {planInfo.name}</span>}
                            </p>
                            {log.notes && <p className="text-muted-foreground truncate">{log.notes}</p>}
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

        {/* TAB: Attività */}
        <TabsContent value="attivita">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Ordini</CardTitle>
                <ClipboardList className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.ordersCount || 0}</div>
                <p className="text-xs text-muted-foreground">{formatCurrency(stats?.ordersValue || 0)} valore</p>
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
                <CardTitle className="text-sm font-medium text-muted-foreground">Ticket Totali</CardTitle>
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.ticketsCount || 0}</div>
                <p className="text-xs text-muted-foreground">richieste assistenza</p>
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
                <p className="text-xs text-muted-foreground">da gestire</p>
              </CardContent>
            </Card>
          </div>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Azioni Rapide</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Button variant="outline" onClick={handleImpersonate}>
                <LogIn className="h-4 w-4 mr-2" />
                Accedi al pannello azienda
              </Button>
              <Button
                variant="outline"
                onClick={async () => {
                  await impersonateCompany(company.id);
                  navigate("/azienda/ordini");
                }}
              >
                <ClipboardList className="h-4 w-4 mr-2" />
                Visualizza ordini ({stats?.ordersCount || 0})
              </Button>
              <Button
                variant="outline"
                onClick={async () => {
                  await impersonateCompany(company.id);
                  navigate("/azienda/assistenza");
                }}
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                Gestisci ticket ({stats?.ticketsCount || 0})
              </Button>
            </CardContent>
          </Card>
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
            <Button variant="outline" onClick={() => setChangePlanDialog(false)}>
              Annulla
            </Button>
            <Button disabled={!selectedPlanId || changePlanMutation.isPending} onClick={() => selectedPlanId && changePlanMutation.mutate(selectedPlanId)}>
              {changePlanMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Conferma
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
