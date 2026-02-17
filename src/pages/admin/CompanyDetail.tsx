import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Building2, Loader2, Users, Copy, Check, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatCurrency } from "@/lib/formatters";
import { ALL_MODULES } from "@/lib/adminConstants";
import { StaffUserDialog } from "@/components/users/StaffUserDialog";
import { PermissionsDialog } from "@/components/users/PermissionsDialog";
import { SalespersonDialog } from "@/components/salespeople/SalespersonDialog";
import { EmployeeDialog } from "@/components/employees/EmployeeDialog";
import { CompanyDetailHeader } from "@/components/admin/company/CompanyDetailHeader";
import { CompanyDetailsTab } from "@/components/admin/company/CompanyDetailsTab";
import { CompanyTeamTab } from "@/components/admin/company/CompanyTeamTab";
import { CompanySaaSTab } from "@/components/admin/company/CompanySaaSTab";
import { CompanySubscriptionTab } from "@/components/admin/company/CompanySubscriptionTab";
import { CompanyOverviewTab } from "@/components/admin/company/CompanyOverviewTab";
import { useCompanyDetail } from "@/hooks/useCompanyDetail";

export default function CompanyDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const h = useCompanyDetail(id);

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
    ? (Array.isArray((h.currentPlan as any).included_modules) ? (h.currentPlan as any).included_modules : ALL_MODULES.map((m) => m.key))
    : [];

  const totalTeam = (h.teamData?.admins.length || 0) + (h.teamData?.staff.length || 0) + (h.teamData?.salespeople.length || 0) + (h.teamData?.employees.length || 0);

  const handleImpersonate = async () => {
    await h.handleImpersonate();
    navigate("/azienda");
  };

  return (
    <div className="space-y-6">
      <CompanyDetailHeader
        company={h.company}
        onBack={() => navigate("/admin/aziende")}
        onImpersonate={handleImpersonate}
      />

      <Tabs defaultValue="panoramica">
        <TabsList>
          <TabsTrigger value="panoramica">Panoramica</TabsTrigger>
          <TabsTrigger value="dettagli">Dettagli</TabsTrigger>
          <TabsTrigger value="team"><Users className="h-4 w-4 mr-1.5" />Team</TabsTrigger>
          <TabsTrigger value="saas">SaaS</TabsTrigger>
          <TabsTrigger value="abbonamento">Abbonamento</TabsTrigger>
        </TabsList>

        <TabsContent value="panoramica">
          <CompanyOverviewTab
            stats={h.stats} totalTeam={totalTeam}
            recentOrders={h.recentOrders} recentTickets={h.recentTickets}
            currentPlan={h.currentPlan} currentSubscription={h.currentSubscription}
            monthlyOrders={h.monthlyOrders} daysSinceLastOrder={h.daysSinceLastOrder}
            companyCreatedAt={h.company.created_at}
          />
        </TabsContent>

        <TabsContent value="dettagli">
          <CompanyDetailsTab
            company={h.company} form={h.form} onSubmit={h.onSaveDetails}
            isSaving={h.isSaving} sameAsLegal={h.sameAsLegal} onSameAsLegalChange={h.setSameAsLegal}
            currentPlanName={h.currentPlan?.name || null} stats={h.stats} totalTeam={totalTeam}
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
          />
        </TabsContent>

        <TabsContent value="saas">
          <CompanySaaSTab
            currentPlan={h.currentPlan} stats={h.stats}
            includedModules={includedModules} plans={h.plans} companyPlanId={h.company.subscription_plan_id}
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
                <code className="px-2 py-1 bg-background rounded text-sm font-mono">{h.passwordDialog?.password}</code>
                <Button variant="ghost" size="icon" onClick={h.handleCopyPassword} className="h-8 w-8">
                  {h.copiedPassword ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">⚠️ Questa password viene mostrata solo una volta. L'utente potrà cambiarla dopo il primo accesso.</p>
          </div>
          <DialogFooter>
            <Button onClick={() => { h.setPasswordDialog(null); h.setCopiedPassword(false); }}>Chiudi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
