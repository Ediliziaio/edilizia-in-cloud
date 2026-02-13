import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Loader2, MoreHorizontal, Building, Calendar, AlertCircle } from "lucide-react";
import { format, addDays } from "date-fns";
import { it } from "date-fns/locale";
import { formatCurrency } from "@/lib/formatters";
import type { CompanyStatus } from "@/types/auth";

const statusConfig: Record<CompanyStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  trial: { label: "Trial", variant: "outline" },
  active: { label: "Attivo", variant: "default" },
  suspended: { label: "Sospeso", variant: "secondary" },
  expired: { label: "Scaduto", variant: "destructive" },
};

export default function Subscriptions() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [changePlanDialog, setChangePlanDialog] = useState<{ companyId: string; companyName: string } | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");

  const { data: companies, isLoading } = useQuery({
    queryKey: ["admin-subscriptions", statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("companies")
        .select("*, subscription_plans:subscription_plan_id(id, name, price_monthly, slug)")
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const { data: plans } = useQuery({
    queryKey: ["subscription-plans-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_plans")
        .select("*")
        .eq("is_active", true)
        .order("position");
      if (error) throw error;
      return data;
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ companyId, newStatus, notes }: { companyId: string; newStatus: CompanyStatus; notes: string }) => {
      const company = companies?.find((c) => c.id === companyId);
      const oldStatus = company?.status;

      const { error: updateError } = await supabase
        .from("companies")
        .update({ status: newStatus })
        .eq("id", companyId);
      if (updateError) throw updateError;

      const { error: logError } = await supabase.from("subscription_logs").insert({
        company_id: companyId,
        event_type: newStatus === "active" ? "activated" : newStatus === "suspended" ? "suspended" : "status_change",
        old_status: oldStatus,
        new_status: newStatus,
        notes,
        performed_by: user?.id,
      });
      if (logError) throw logError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-subscriptions"] });
      toast({ title: "Stato aggiornato" });
    },
    onError: (error) => {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    },
  });

  const changePlanMutation = useMutation({
    mutationFn: async ({ companyId, planId }: { companyId: string; planId: string }) => {
      const company = companies?.find((c) => c.id === companyId);

      const { error: updateError } = await supabase
        .from("companies")
        .update({ subscription_plan_id: planId })
        .eq("id", companyId);
      if (updateError) throw updateError;

      const { error: logError } = await supabase.from("subscription_logs").insert({
        company_id: companyId,
        event_type: "plan_changed",
        old_status: company?.status,
        new_status: company?.status,
        plan_id: planId,
        notes: "Piano cambiato manualmente dal Super Admin",
        performed_by: user?.id,
      });
      if (logError) throw logError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-subscriptions"] });
      setChangePlanDialog(null);
      toast({ title: "Piano aggiornato" });
    },
    onError: (error) => {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    },
  });

  const extendTrialMutation = useMutation({
    mutationFn: async ({ companyId, days }: { companyId: string; days: number }) => {
      const company = companies?.find((c) => c.id === companyId);
      const currentEnd = company?.trial_ends_at ? new Date(company.trial_ends_at) : new Date();
      const newEnd = addDays(currentEnd, days);

      const { error: updateError } = await supabase
        .from("companies")
        .update({ trial_ends_at: newEnd.toISOString(), status: "trial" })
        .eq("id", companyId);
      if (updateError) throw updateError;

      const { error: logError } = await supabase.from("subscription_logs").insert({
        company_id: companyId,
        event_type: "trial_extended",
        old_status: company?.status,
        new_status: "trial",
        notes: `Trial esteso di ${days} giorni`,
        performed_by: user?.id,
      });
      if (logError) throw logError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-subscriptions"] });
      toast({ title: "Trial esteso" });
    },
    onError: (error) => {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Abbonamenti</h1>
          <p className="text-muted-foreground">Gestisci gli abbonamenti delle aziende</p>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filtra per stato" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti gli stati</SelectItem>
            <SelectItem value="trial">Trial</SelectItem>
            <SelectItem value="active">Attivo</SelectItem>
            <SelectItem value="suspended">Sospeso</SelectItem>
            <SelectItem value="expired">Scaduto</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Azienda</TableHead>
                <TableHead>Piano</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead>Scadenza Trial</TableHead>
                <TableHead className="text-right">MRR</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Nessuna azienda trovata
                  </TableCell>
                </TableRow>
              ) : (
                companies?.map((company) => {
                  const status = company.status as CompanyStatus;
                  const config = statusConfig[status] || statusConfig.trial;
                  const plan = company.subscription_plans as { id: string; name: string; price_monthly: number; slug: string } | null;

                  return (
                    <TableRow key={company.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {company.logo_url ? (
                            <img src={company.logo_url} alt={company.name} className="h-8 w-8 rounded-lg object-cover" />
                          ) : (
                            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                              <Building className="h-4 w-4 text-primary" />
                            </div>
                          )}
                          <span className="font-medium">{company.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {plan ? (
                          <Badge variant="secondary">{plan.name}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">Nessun piano</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={config.variant}>{config.label}</Badge>
                      </TableCell>
                      <TableCell>
                        {company.trial_ends_at ? (
                          <div className="flex items-center gap-1 text-sm">
                            <Calendar className="h-3 w-3 text-muted-foreground" />
                            {format(new Date(company.trial_ends_at), "dd/MM/yyyy", { locale: it })}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {status === "active" && plan ? formatCurrency(plan.price_monthly) : "—"}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setChangePlanDialog({ companyId: company.id, companyName: company.name })}>
                              Cambia piano
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {status !== "active" && (
                              <DropdownMenuItem onClick={() => updateStatusMutation.mutate({ companyId: company.id, newStatus: "active", notes: "Attivato manualmente" })}>
                                Attiva
                              </DropdownMenuItem>
                            )}
                            {status !== "suspended" && (
                              <DropdownMenuItem onClick={() => updateStatusMutation.mutate({ companyId: company.id, newStatus: "suspended", notes: "Sospeso manualmente" })}>
                                Sospendi
                              </DropdownMenuItem>
                            )}
                            {(status === "trial" || status === "expired") && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => extendTrialMutation.mutate({ companyId: company.id, days: 7 })}>
                                  Estendi trial +7 giorni
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => extendTrialMutation.mutate({ companyId: company.id, days: 14 })}>
                                  Estendi trial +14 giorni
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => extendTrialMutation.mutate({ companyId: company.id, days: 30 })}>
                                  Estendi trial +30 giorni
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Change Plan Dialog */}
      <Dialog open={!!changePlanDialog} onOpenChange={(open) => !open && setChangePlanDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambia Piano</DialogTitle>
            <DialogDescription>Seleziona il nuovo piano per {changePlanDialog?.companyName}</DialogDescription>
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
            <Button variant="outline" onClick={() => setChangePlanDialog(null)}>Annulla</Button>
            <Button
              disabled={!selectedPlanId || changePlanMutation.isPending}
              onClick={() => {
                if (changePlanDialog && selectedPlanId) {
                  changePlanMutation.mutate({ companyId: changePlanDialog.companyId, planId: selectedPlanId });
                }
              }}
            >
              {changePlanMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Conferma
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
