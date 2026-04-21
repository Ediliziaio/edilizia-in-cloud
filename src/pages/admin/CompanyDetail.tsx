import { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { getSubdomainUrl, navigateToSubdomain } from "@/utils/subdomainNav";
import { safeRedirect } from "@/utils/safeRedirect";
import { useAuth, getCachedTokens } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Building2, Loader2, Users, Copy, Check, RefreshCw, Eye, FileText, CreditCard, Activity, StickyNote, Blocks, History, Mail, MailCheck, Ticket, ListChecks, ShieldAlert, Palette } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatCurrency } from "@/lib/formatters";
import { ALL_MODULES } from "@/lib/adminConstants";
import { StaffUserDialog } from "@/components/users/StaffUserDialog";
import { PermissionsDialog } from "@/components/users/PermissionsDialog";
import { SalespersonDialog } from "@/components/salespeople/SalespersonDialog";
import { EmployeeDialog } from "@/components/employees/EmployeeDialog";
import { CompanyDetailHeader } from "@/components/admin/company/CompanyDetailHeader";
import { CompanyDetailsTab } from "@/components/admin/company/CompanyDetailsTab";
import { CompanyBillingTab } from "@/components/admin/company/CompanyBillingTab";
import { CompanyTeamTab } from "@/components/admin/company/CompanyTeamTab";
import { CompanySaaSTab } from "@/components/admin/company/CompanySaaSTab";
import { CompanySubscriptionTab } from "@/components/admin/company/CompanySubscriptionTab";
import { CompanyOverviewTab } from "@/components/admin/company/CompanyOverviewTab";
import { CompanyActivityTab } from "@/components/admin/company/CompanyActivityTab";
import { CompanyNextActions } from "@/components/admin/company/CompanyNextActions";
import { CompanyNotes } from "@/components/admin/company/CompanyNotes";
import { TabLifecycle } from "@/components/admin/company/TabLifecycle";
import { TabComunicazioni } from "@/components/admin/company/TabComunicazioni";
import { TabSupporto } from "@/components/admin/company/TabSupporto";
import { TabOnboarding } from "@/components/admin/company/TabOnboarding";
import { AuditLogTab } from "@/components/admin/company/AuditLogTab";
import { TabWhiteLabel } from "@/components/admin/company/TabWhiteLabel";
import { CompanyEmailTab } from "@/components/admin/company/CompanyEmailTab";
import { SuperAdminCompanyOverrides } from "@/components/admin/SuperAdminCompanyOverrides";
import { useCompanyDetail } from "@/hooks/useCompanyDetail";
import { useSuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";
import { AccessDenied } from "@/components/admin/AccessDenied";

const COMPANY_TABS = new Set([
  "panoramica",
  "dettagli",
  "team",
  "saas",
  "abbonamento",
  "billing",
  "attivita",
  "note",
  "lifecycle",
  "comunicazioni",
  "email",
  "supporto",
  "onboarding",
  "whitelabel",
  "audit",
]);

export default function CompanyDetail() {
  const { permissions } = useSuperAdminPermissions();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const h = useCompanyDetail(id);
  const queryClient = useQueryClient();
  const { profile, role, company: saCompany } = useAuth();
  const requestedTab = searchParams.get("tab") || "panoramica";
  const safeRequestedTab = COMPANY_TABS.has(requestedTab) ? requestedTab : "panoramica";
  const [activeTab, setActiveTab] = useState(safeRequestedTab);
  const [isDeletingUser, setIsDeletingUser] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);

  useEffect(() => {
    setActiveTab(safeRequestedTab);
  }, [safeRequestedTab]);

  if (!permissions.can_manage_companies) return <AccessDenied />;

  // Validate allowed_company_ids restriction
  if (permissions.allowed_company_ids && id && !permissions.allowed_company_ids.includes(id)) {
    return <AccessDenied />;
  }

  if (h.isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (h.isError) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => navigate("/admin/aziende")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Torna alle aziende
        </Button>
        <Alert variant="destructive">
          <RefreshCw className="h-4 w-4" />
          <AlertTitle>Errore di caricamento</AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span>Impossibile caricare i dati dell'azienda.</span>
            <Button variant="outline" size="sm" onClick={() => h.refetch()}>
              <RefreshCw className="h-3 w-3 mr-1" /> Riprova
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!h.company) {
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

  const includedModules: string[] = h.currentPlan
    ? (Array.isArray(h.currentPlan.included_modules) ? (h.currentPlan.included_modules as string[]) : ALL_MODULES.map((m) => m.key))
    : [];

  const totalTeam = (h.teamData?.admins.length || 0) + (h.teamData?.staff.length || 0) + (h.teamData?.salespeople.length || 0) + (h.teamData?.employees.length || 0);

  const selectTab = (tab: string) => {
    setActiveTab(tab);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (tab === "panoramica") next.delete("tab");
      else next.set("tab", tab);
      return next;
    }, { replace: true });
  };

  // Avvia impersonazione azienda con cross-subdomain handoff.
  // Stesso pattern di CompaniesList/AdminLayout: ottiene il token secure,
  // costruisce l'hash #_at=&_rt=&_it=&_ic=&_pr= e redireziona su app.*.
  // In locale getSubdomainUrl restituisce solo il path → safeRedirect fa un
  // same-origin navigation con i token in hash, che AuthContext riprende
  // per sincronizzare sessione + impersonated company in ordine corretto
  // (evita il flash "Nessuna azienda selezionata").
  const handleImpersonate = async () => {
    if (!h.company) return;
    const impToken = await h.handleImpersonate();
    if (impToken) {
      const { accessToken, refreshToken } = getCachedTokens();
      if (accessToken && refreshToken) {
        let pr: string | undefined;
        if (profile && role) {
          try {
            const relay = JSON.stringify({ profile, role, company: saCompany ?? null });
            pr = btoa(relay).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
          } catch {
            // relay opzionale — graceful degradation
          }
        }
        const params = new URLSearchParams({
          _at: accessToken,
          _rt: refreshToken,
          _it: impToken,
          _ic: h.company.id,
          ...(pr ? { _pr: pr } : {}),
        });
        const url = getSubdomainUrl(`/azienda#${params.toString()}`, "app");
        safeRedirect(url);
        return;
      }
    }
    navigateToSubdomain("/azienda", "app", navigate);
  };

  const handleDeleteCompany = async () => {
    try {
      await h.handleDeleteCompany();
      toast.success("Azienda eliminata");
      navigate("/admin/aziende");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Errore sconosciuto";
      toast.error("Errore eliminazione azienda", { description: msg });
    }
  };

  const handleExportCompany = () => {
    h.handleExportCompany();
    toast.success("Dati esportati");
  };

  // Delete company user
  const handleDeleteUser = async (userId: string, name: string) => {
    setIsDeletingUser(true);
    try {
      const { error } = await supabase.functions.invoke("delete-company-user", { body: { userId } });
      if (error) throw error;
      toast.success(`${name} eliminato`);
      await h.refreshTeamData();
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.companiesFull });
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.companiesUserCounts });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Errore sconosciuto";
      toast.error("Errore eliminazione utente", { description: msg });
    } finally {
      setIsDeletingUser(false);
    }
  };

  // Reset password
  const handleResetPassword = async (userId: string, name: string) => {
    setIsResettingPassword(true);
    try {
      // Ci interessa solo verificare `error`; il body di risposta è ignorato
      // (la password è inviata via email dal servizio server-side).
      const { error } = await supabase.functions.invoke("manage-super-admins", {
        body: { action: "reset-password", userId },
      });
      if (error) throw error;
      toast.success(`Password resettata per ${name}`, { description: "La nuova password è stata inviata via email." });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Errore sconosciuto";
      toast.error("Errore reset password", { description: msg });
    } finally {
      setIsResettingPassword(false);
    }
  };


  return (
    <div className="space-y-6">
      <CompanyDetailHeader
        company={h.company}
        onBack={() => navigate("/admin/aziende")}
        onImpersonate={handleImpersonate}
        onEdit={() => selectTab("dettagli")}
        onSuspend={() => h.updateStatusMutation.mutate({ newStatus: "suspended", notes: "Sospeso manualmente" })}
        onReactivate={() => h.updateStatusMutation.mutate({ newStatus: "active", notes: "Riattivato manualmente" })}
        onDelete={handleDeleteCompany}
        onExport={handleExportCompany}
        isUpdatingStatus={h.updateStatusMutation.isPending}
      />

      {/* Next Best Actions */}
      <CompanyNextActions
        status={h.company.status}
        trialEndsAt={h.company.trial_ends_at}
        onboardingPct={0}
        daysSinceLastOrder={h.daysSinceLastOrder}
        paymentMethod={h.company.payment_method || "none"}
      />

      {/* Override Funzionalità - SuperAdmin */}
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => setOverrideDialogOpen(true)}>
          <Blocks className="h-4 w-4 mr-2" />
          Override Funzionalità
        </Button>
      </div>
      <SuperAdminCompanyOverrides
        company={{ id: h.company.id, name: h.company.name }}
        open={overrideDialogOpen}
        onClose={() => setOverrideDialogOpen(false)}
      />

      <Tabs
        value={activeTab}
        onValueChange={selectTab}
        className="space-y-4"
      >
        <TabsList className="flex flex-wrap h-auto gap-1 p-1 overflow-x-auto">
          <TabsTrigger value="panoramica" className="gap-1.5">
            <Eye className="h-3.5 w-3.5" /> Panoramica
          </TabsTrigger>
          <TabsTrigger value="dettagli" className="gap-1.5">
            <FileText className="h-3.5 w-3.5" /> Dettagli
          </TabsTrigger>
          <TabsTrigger value="team" className="gap-1.5">
            <Users className="h-3.5 w-3.5" /> Team
            {totalTeam > 0 && (
              <span className="ml-0.5 text-xs font-bold bg-muted px-1.5 py-0.5 rounded-full">{totalTeam}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="saas" className="gap-1.5">
            <Blocks className="h-3.5 w-3.5" /> SaaS
          </TabsTrigger>
          <TabsTrigger value="abbonamento" className="gap-1.5">
            <CreditCard className="h-3.5 w-3.5" /> Abbonamento
          </TabsTrigger>
          <TabsTrigger value="billing" className="gap-1.5">
            <CreditCard className="h-3.5 w-3.5" /> Billing
          </TabsTrigger>
          <TabsTrigger value="attivita" className="gap-1.5">
            <Activity className="h-3.5 w-3.5" /> Attività
          </TabsTrigger>
          <TabsTrigger value="note" className="gap-1.5">
            <StickyNote className="h-3.5 w-3.5" /> Note
          </TabsTrigger>
          <TabsTrigger value="lifecycle" className="gap-1.5">
            <History className="h-3.5 w-3.5" /> Cronologia
          </TabsTrigger>
          <TabsTrigger value="comunicazioni" className="gap-1.5">
            <Mail className="h-3.5 w-3.5" /> Comunicazioni
          </TabsTrigger>
          <TabsTrigger value="email" className="gap-1.5">
            <MailCheck className="h-3.5 w-3.5" /> Email
          </TabsTrigger>
          <TabsTrigger value="supporto" className="gap-1.5">
            <Ticket className="h-3.5 w-3.5" /> Supporto
          </TabsTrigger>
          <TabsTrigger value="onboarding" className="gap-1.5">
            <ListChecks className="h-3.5 w-3.5" /> Onboarding
          </TabsTrigger>
          <TabsTrigger value="whitelabel" className="gap-1.5">
            <Palette className="h-3.5 w-3.5" /> White-Label
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5" /> Audit Log
          </TabsTrigger>
        </TabsList>

        <TabsContent value="panoramica">
          <CompanyOverviewTab
            stats={h.stats} totalTeam={totalTeam}
            recentOrders={h.recentOrders} recentTickets={h.recentTickets}
            currentPlan={h.currentPlan} currentSubscription={h.currentSubscription}
            monthlyOrders={h.monthlyOrders} daysSinceLastOrder={h.daysSinceLastOrder}
            companyCreatedAt={h.company.created_at}
            companyStatus={h.company.status}
            trialEndsAt={h.company.trial_ends_at}
            paymentMethod={h.company.payment_method || "none"}
            onExtendTrial={(days) => h.extendTrialMutation.mutate(days)}
            isExtendingTrial={h.extendTrialMutation.isPending}
          />
        </TabsContent>

        <TabsContent value="dettagli">
          <CompanyDetailsTab
            company={h.company} form={h.form} onSubmit={h.onSaveDetails}
            isSaving={h.isSaving} sameAsLegal={h.sameAsLegal} onSameAsLegalChange={h.setSameAsLegal}
            currentPlanName={h.currentPlan?.name || null} stats={h.stats} totalTeam={totalTeam}
            onLogoUpdated={() => h.refetch()}
          />
        </TabsContent>

        <TabsContent value="team">
          <CompanyTeamTab
            teamData={h.teamData} totalTeam={totalTeam}
            onCreateStaff={() => h.setCreateStaffOpen(true)}
            onCreateSalesperson={() => h.setCreateSalespersonOpen(true)}
            onCreateEmployee={() => h.setCreateEmployeeOpen(true)}
            onEditPermissions={h.setPermissionsUser}
            onCreateAccount={h.handleCreateAccount} creatingAccountFor={h.creatingAccountFor}
            onDeleteUser={handleDeleteUser}
            onResetPassword={handleResetPassword}
            isDeletingUser={isDeletingUser}
            isResettingPassword={isResettingPassword}
            isRefreshing={h.isTeamFetching}
            onRefresh={() => void h.refreshTeamData()}
          />
        </TabsContent>

        <TabsContent value="saas">
          <CompanySaaSTab
            currentPlan={h.currentPlan} stats={h.stats}
            includedModules={includedModules} plans={h.plans} companyPlanId={h.company.subscription_plan_id}
            companyId={h.company.id}
            company={h.company}
          />
        </TabsContent>

        <TabsContent value="abbonamento">
          <CompanySubscriptionTab
            company={h.company} currentPlan={h.currentPlan}
            currentSubscription={h.currentSubscription} subscriptionLogs={h.subscriptionLogs}
            onChangePlan={() => h.setChangePlanDialog(true)}
            onSuspend={() => h.updateStatusMutation.mutate({ newStatus: "suspended", notes: "Sospeso manualmente" })}
            onReactivate={() => h.updateStatusMutation.mutate({ newStatus: "active", notes: "Riattivato manualmente" })}
            onExtendTrial={(days) => h.extendTrialMutation.mutate(days)}
            isUpdatingStatus={h.updateStatusMutation.isPending}
            isExtendingTrial={h.extendTrialMutation.isPending}
            onUpdatePaymentMethod={h.handleUpdatePaymentMethod}
            isSavingPaymentMethod={h.updatePaymentMethodMutation.isPending}
            onGenerateCheckout={h.handleCreateCheckout}
            isGeneratingCheckout={h.createCheckoutMutation.isPending}
            checkoutUrl={h.checkoutUrl}
          />
        </TabsContent>

        <TabsContent value="attivita">
          <CompanyActivityTab companyId={h.company.id} />
        </TabsContent>

        <TabsContent value="billing">
          <CompanyBillingTab companyId={h.company.id} />
        </TabsContent>

        <TabsContent value="note">
          <CompanyNotes companyId={h.company.id} />
        </TabsContent>

        <TabsContent value="lifecycle">
          <TabLifecycle companyId={h.company.id} />
        </TabsContent>

        <TabsContent value="comunicazioni">
          <TabComunicazioni companyId={h.company.id} />
        </TabsContent>

        <TabsContent value="email">
          <CompanyEmailTab companyId={h.company.id} companyName={h.company.name} />
        </TabsContent>

        <TabsContent value="supporto">
          <TabSupporto companyId={h.company.id} />
        </TabsContent>

        <TabsContent value="onboarding">
          <TabOnboarding companyId={h.company.id} />
        </TabsContent>

        <TabsContent value="whitelabel">
          <TabWhiteLabel companyId={h.company.id} />
        </TabsContent>

        <TabsContent value="audit">
          <AuditLogTab companyId={h.company.id} />
        </TabsContent>
      </Tabs>

      {/* Change Plan Dialog */}
      <Dialog open={h.changePlanDialog} onOpenChange={h.setChangePlanDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambia Piano</DialogTitle>
            <DialogDescription>Seleziona il nuovo piano per {h.company.name}</DialogDescription>
          </DialogHeader>
          <Select value={h.selectedPlanId} onValueChange={h.setSelectedPlanId}>
            <SelectTrigger><SelectValue placeholder="Seleziona piano" /></SelectTrigger>
            <SelectContent>
              {h.plans?.map((plan) => (
                <SelectItem key={plan.id} value={plan.id}>{plan.name} — {formatCurrency(plan.price_monthly)}/mese</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => h.setChangePlanDialog(false)}>Annulla</Button>
            <Button onClick={() => h.selectedPlanId && h.changePlanMutation.mutate(h.selectedPlanId)} disabled={!h.selectedPlanId || h.changePlanMutation.isPending}>
              {h.changePlanMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Conferma
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Team Dialogs */}
      <StaffUserDialog open={h.createStaffOpen} onOpenChange={h.setCreateStaffOpen} onSubmit={h.handleCreateStaff} isLoading={h.createStaffLoading} />
      {h.permissionsUser && (
        <PermissionsDialog open={!!h.permissionsUser} onOpenChange={(open) => !open && h.setPermissionsUser(null)}
          userName={h.permissionsUser.name} currentPermissions={h.permissionsUser.permissions}
          onSave={h.handleSavePermissions} isLoading={h.savingPermissions} />
      )}
      <SalespersonDialog open={h.createSalespersonOpen} onOpenChange={h.setCreateSalespersonOpen} salesperson={null} onSave={h.handleCreateSalesperson} isLoading={h.savingSalesperson} />
      <EmployeeDialog open={h.createEmployeeOpen} onOpenChange={h.setCreateEmployeeOpen} employee={null} onSave={h.handleCreateEmployee} isSaving={h.savingEmployee} />

      {/* Password Dialog */}
      <Dialog open={h.passwordDialog?.open ?? false} onOpenChange={() => { h.setPasswordDialog(null); h.setCopiedPassword(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Account Creato! 🎉</DialogTitle>
            <DialogDescription>L'account per {h.passwordDialog?.name} è stato creato. Comunica la password temporanea.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-lg space-y-2">
              <p className="text-sm font-medium">Credenziali di accesso:</p>
              <div className="text-sm"><span className="text-muted-foreground">Email:</span> {h.passwordDialog?.email}</div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Password:</span>
                <code className="px-2 py-1 bg-background rounded text-sm font-mono select-all">{h.passwordDialog?.password}</code>
                <Button variant="ghost" size="icon" onClick={h.handleCopyPassword} className="h-8 w-8" title="Copia password">
                  {h.copiedPassword ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <Alert className="border-amber-500/50 bg-amber-500/10">
              <AlertDescription className="text-sm text-amber-700 dark:text-amber-400">
                ⚠️ Questa password viene mostrata solo una volta. Copiala e salvala prima di chiudere.
              </AlertDescription>
            </Alert>
          </div>
          <DialogFooter>
            <Button onClick={() => { h.setPasswordDialog(null); h.setCopiedPassword(false); }}>Chiudi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
