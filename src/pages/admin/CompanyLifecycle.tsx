import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";
import { useAdminRevenueData } from "@/hooks/useAdminRevenueData";
import { AccessDenied } from "@/components/admin/AccessDenied";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { 
  Loader2, CheckCircle2, XCircle, Clock, CalendarPlus, 
  ArrowRight, AlertTriangle, Search, Building 
} from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { format, addDays, differenceInDays } from "date-fns";
import { it } from "date-fns/locale";

interface OnboardingStep {
  key: string;
  label: string;
  done: boolean;
}

function getOnboardingSteps(healthScore: any): OnboardingStep[] {
  return [
    { key: "profile", label: "Profilo completo", done: true }, // All companies have a profile
    { key: "staff", label: "Primo utente staff", done: healthScore?.hasStaff || false },
    { key: "customers", label: "Primo cliente", done: healthScore?.hasCustomers || false },
    { key: "orders", label: "Primo ordine", done: healthScore?.hasOrders || false },
    { key: "users", label: "Almeno 2 utenti", done: (healthScore?.userCount || 0) >= 2 },
  ];
}

function OnboardingProgress({ steps }: { steps: OnboardingStep[] }) {
  const completed = steps.filter((s) => s.done).length;
  const pct = Math.round((completed / steps.length) * 100);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{completed}/{steps.length} completati</span>
        <span>{pct}%</span>
      </div>
      <Progress value={pct} className="h-2" />
      <div className="flex flex-wrap gap-1.5 mt-1">
        {steps.map((s) => (
          <Badge key={s.key} variant={s.done ? "default" : "outline"} className="text-[10px] gap-1">
            {s.done ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3 text-muted-foreground" />}
            {s.label}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function TrialExtensionButton({ companyId, currentEnd, extensionsCount = 0 }: { companyId: string; currentEnd: string | null; extensionsCount?: number }) {
  const queryClient = useQueryClient();
  const [showWarning, setShowWarning] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      const newEnd = addDays(currentEnd ? new Date(currentEnd) : new Date(), 14).toISOString();
      const { error } = await supabase
        .from("companies")
        .update({
          trial_ends_at: newEnd,
          status: "trial",
          trial_extensions_count: extensionsCount + 1,
        } as any)
        .eq("id", companyId);
      if (error) throw error;
      return newEnd;
    },
    onSuccess: () => {
      toast.success("Trial esteso di 14 giorni");
      setShowWarning(false);
      queryClient.invalidateQueries({ queryKey: ["admin-revenue-intelligence"] });
    },
    onError: () => toast.error("Errore nell'estensione del trial"),
  });

  const handleClick = () => {
    if (extensionsCount >= 3) {
      setShowWarning(true);
    } else {
      mutation.mutate();
    }
  };

  return (
    <>
      <div className="flex items-center gap-1.5">
        <Button size="sm" variant="outline" onClick={handleClick} disabled={mutation.isPending}>
          {mutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CalendarPlus className="h-3 w-3 mr-1" />}
          +14gg
        </Button>
        {extensionsCount > 0 && (
          <Badge variant={extensionsCount >= 3 ? "destructive" : "secondary"} className="text-[10px]">
            {extensionsCount}x
          </Badge>
        )}
      </div>
      <AlertDialog open={showWarning} onOpenChange={setShowWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Attenzione: {extensionsCount} estensioni effettuate</AlertDialogTitle>
            <AlertDialogDescription>
              Questa azienda ha già ricevuto {extensionsCount} estensioni trial. Proseguire con un'ulteriore estensione?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => mutation.mutate()}>
              Estendi comunque
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default function CompanyLifecycle() {
  const { permissions } = useSuperAdminPermissions();
  const { data: revenueData, isLoading } = useAdminRevenueData();
  const [search, setSearch] = useState("");

  if (!permissions.can_manage_companies) return <AccessDenied />;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const healthScores = revenueData?.healthScores || [];
  const trialCompanies = healthScores.filter((h) => h.status === "trial");
  const expiredCompanies = healthScores.filter((h) => h.status === "expired");
  const activeCompanies = healthScores.filter((h) => h.status === "active");
  const suspendedCompanies = healthScores.filter((h) => h.status === "suspended");

  const filterBySearch = (list: typeof healthScores) =>
    list.filter((c) => c.companyName.toLowerCase().includes(search.toLowerCase()));

  const filteredTrial = filterBySearch(trialCompanies);
  const filteredExpired = filterBySearch(expiredCompanies);
  const filteredActive = filterBySearch(activeCompanies);
  const filteredSuspended = filterBySearch(suspendedCompanies);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Company Lifecycle</h1>
        <p className="text-muted-foreground">Gestisci onboarding, trial e win-back</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Cerca azienda..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Tabs defaultValue="trial">
        <TabsList>
          <TabsTrigger value="trial">
            Trial attivi ({trialCompanies.length})
          </TabsTrigger>
          <TabsTrigger value="active">
            Attivi ({activeCompanies.length})
          </TabsTrigger>
          <TabsTrigger value="suspended">
            Sospesi ({suspendedCompanies.length})
          </TabsTrigger>
          <TabsTrigger value="expired">
            Win-back ({expiredCompanies.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="trial" className="space-y-4 mt-4">
          {filteredTrial.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">Nessun trial attivo</CardContent></Card>
          ) : (
            filteredTrial.map((company) => {
              const steps = getOnboardingSteps(company);
              const daysLeft = company.trialEndsAt
                ? differenceInDays(new Date(company.trialEndsAt), new Date())
                : null;
              return (
                <Card key={company.companyId}>
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-3">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
                            <Building className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div>
                            <Link to={`/admin/aziende/${company.companyId}`} className="font-semibold hover:underline">
                              {company.companyName}
                            </Link>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              {daysLeft !== null && (
                                <span className={daysLeft <= 3 ? "text-destructive font-medium" : ""}>
                                  <Clock className="h-3 w-3 inline mr-1" />
                                  {daysLeft > 0 ? `${daysLeft}gg rimanenti` : "Scaduto"}
                                </span>
                              )}
                              <Badge variant={company.health === "healthy" ? "default" : company.health === "at_risk" ? "secondary" : "destructive"} className="text-[10px]">
                                Score: {company.score}
                              </Badge>
                            </div>
                          </div>
                        </div>
                        <OnboardingProgress steps={steps} />
                      </div>
                      <div className="flex items-center gap-2">
                        <TrialExtensionButton companyId={company.companyId} currentEnd={company.trialEndsAt} extensionsCount={company.trialExtensionsCount} />
                        <Button size="sm" variant="ghost" asChild>
                          <Link to={`/admin/aziende/${company.companyId}`}>
                            <ArrowRight className="h-4 w-4" />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="active" className="space-y-4 mt-4">
          {filteredActive.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">Nessuna azienda attiva</CardContent></Card>
          ) : (
            filteredActive.map((company) => (
              <Card key={company.companyId}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        </div>
                        <div>
                          <Link to={`/admin/aziende/${company.companyId}`} className="font-semibold hover:underline">
                            {company.companyName}
                          </Link>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Badge variant={company.health === "healthy" ? "default" : company.health === "at_risk" ? "secondary" : "destructive"} className="text-[10px]">
                              Score: {company.score}
                            </Badge>
                            <span>{company.orderCount} ordini</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" asChild>
                      <Link to={`/admin/aziende/${company.companyId}`}>
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="suspended" className="space-y-4 mt-4">
          {filteredSuspended.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">Nessuna azienda sospesa</CardContent></Card>
          ) : (
            filteredSuspended.map((company) => (
              <Card key={company.companyId}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                          <AlertTriangle className="h-4 w-4 text-orange-600" />
                        </div>
                        <div>
                          <Link to={`/admin/aziende/${company.companyId}`} className="font-semibold hover:underline">
                            {company.companyName}
                          </Link>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Badge variant="destructive" className="text-[10px]">Sospeso</Badge>
                            <span>{company.orderCount} ordini</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {company.trialEndsAt && (
                        <TrialExtensionButton companyId={company.companyId} currentEnd={company.trialEndsAt} extensionsCount={company.trialExtensionsCount} />
                      )}
                       <Button size="sm" variant="ghost" asChild>
                         <Link to={`/admin/aziende/${company.companyId}`}>
                             <ArrowRight className="h-4 w-4" />
                         </Link>
                       </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="expired" className="space-y-4 mt-4">
          {filteredExpired.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">Nessuna azienda scaduta</CardContent></Card>
          ) : (
            filteredExpired.map((company) => {
              const steps = getOnboardingSteps(company);
              return (
                <Card key={company.companyId}>
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-3">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-lg bg-destructive/10 flex items-center justify-center">
                            <AlertTriangle className="h-4 w-4 text-destructive" />
                          </div>
                          <div>
                            <Link to={`/admin/aziende/${company.companyId}`} className="font-semibold hover:underline">
                              {company.companyName}
                            </Link>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              {company.trialEndsAt && (
                                <span>Scaduto il {format(new Date(company.trialEndsAt), "d MMM yyyy", { locale: it })}</span>
                              )}
                              <Badge variant="destructive" className="text-[10px]">Score: {company.score}</Badge>
                            </div>
                          </div>
                        </div>
                        <OnboardingProgress steps={steps} />
                      </div>
                      <div className="flex items-center gap-2">
                        <TrialExtensionButton companyId={company.companyId} currentEnd={company.trialEndsAt} extensionsCount={company.trialExtensionsCount} />
                        <Button size="sm" variant="ghost" asChild>
                          <Link to={`/admin/aziende/${company.companyId}`}>
                            <ArrowRight className="h-4 w-4" />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
