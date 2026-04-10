import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { HardHat, Users, Building2, Plus, Trash2, Check, Clock, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { differenceInDays, parseISO } from "date-fns";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { AssignEmployeeDialog } from "@/components/employees/AssignEmployeeDialog";
import { AssignExternalTeamDialog } from "@/components/employees/AssignExternalTeamDialog";
import type { SubappaltatoreConDashboard } from "@/types/subappaltatori";

interface OrderEmployee {
  id: string;
  employee_id: string;
  hours_worked: number;
  hourly_rate: number;
  total_cost: number;
  notes: string | null;
  employee: {
    first_name: string;
    last_name: string;
  };
}

interface OrderExternalTeam {
  id: string;
  external_team_id: string;
  total_cost: number;
  payment_date: string | null;
  is_paid: boolean;
  paid_date: string | null;
  notes: string | null;
  external_team: {
    name: string;
  };
}

function DurcBadge({ scadenza }: { scadenza: string | null }) {
  if (!scadenza) return <Badge variant="outline" className="text-xs">DURC mancante</Badge>;
  const daysLeft = differenceInDays(parseISO(scadenza), new Date());
  if (daysLeft < 0) return <Badge className="text-xs bg-red-600 text-white">DURC scaduto</Badge>;
  if (daysLeft <= 30) return <Badge className="text-xs bg-yellow-500 text-white">DURC {daysLeft}gg</Badge>;
  return <Badge className="text-xs bg-green-600 text-white">DURC OK</Badge>;
}

interface OrderLaborCostsProps {
  orderId: string;
  editable?: boolean;
}

export function OrderLaborCosts({ orderId, editable = true }: OrderLaborCostsProps) {
  const { effectiveCompany } = useAuth();

  const effectiveCompanyId = effectiveCompany?.id;
  const queryClient = useQueryClient();

  const [assignEmployeeOpen, setAssignEmployeeOpen] = useState(false);
  const [assignTeamOpen, setAssignTeamOpen] = useState(false);

  // Fetch order employees
  const { data: orderEmployees = [] } = useQuery({
    queryKey: ["order-employees", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_employees")
        .select(`
          *,
          employee:employees(first_name, last_name)
        `)
        .eq("order_id", orderId);

      if (error) throw error;
      return data as OrderEmployee[];
    },
    enabled: !!orderId,
    staleTime: 2 * 60 * 1000, // 2 minuti
  });

  // Fetch order external teams
  const { data: orderExternalTeams = [] } = useQuery({
    queryKey: ["order-external-teams", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_external_teams")
        .select(`
          *,
          external_team:external_teams(name)
        `)
        .eq("order_id", orderId);

      if (error) throw error;
      return data as OrderExternalTeam[];
    },
    enabled: !!orderId,
    staleTime: 2 * 60 * 1000, // 2 minuti
  });

  // Fetch subappaltatori from dashboard view
  const { data: subappaltatori = [] } = useQuery({
    queryKey: ["subappaltatori-order", orderId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("v_subappaltatori_dashboard")
        .select("*")
        .eq("order_id", orderId)
        .eq("company_id", effectiveCompanyId);
      if (error) throw error;
      return (data ?? []) as SubappaltatoreConDashboard[];
    },
    enabled: !!orderId && !!effectiveCompanyId,
    staleTime: 5 * 60 * 1000,
  });

  // Delete order employee mutation
  const deleteEmployeeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("order_employees").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order-employees", orderId] });
      toast.success("Assegnazione rimossa");
    },
    onError: () => {
      toast.error("Errore", { description: "Impossibile rimuovere l'assegnazione." });
    },
  });

  // Delete order external team mutation
  const deleteTeamMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("order_external_teams").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order-external-teams", orderId] });
      toast.success("Squadra rimossa");
    },
    onError: () => {
      toast.error("Errore", { description: "Impossibile rimuovere la squadra." });
    },
  });

  // Toggle paid status mutation
  const togglePaidMutation = useMutation({
    mutationFn: async ({ id, isPaid }: { id: string; isPaid: boolean }) => {
      const { error } = await supabase
        .from("order_external_teams")
        .update({
          is_paid: isPaid,
          paid_date: isPaid ? new Date().toISOString().split("T")[0] : null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order-external-teams", orderId] });
      toast.success("Stato pagamento aggiornato");
    },
  });

  const totalEmployeeCost = orderEmployees.reduce((sum, e) => sum + e.total_cost, 0);
  const totalTeamCost = orderExternalTeams.reduce((sum, t) => sum + t.total_cost, 0);
  const totalSubappCost = subappaltatori.reduce((s, sub) => s + (sub.totale_sal_lordo ?? 0), 0);
  const totalLaborCost = totalEmployeeCost + totalTeamCost + totalSubappCost;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HardHat className="h-5 w-5" />
          Manodopera
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs defaultValue="employees" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="employees" className="gap-2">
              <Users className="h-4 w-4" />
              Dipendenti ({orderEmployees.length})
            </TabsTrigger>
            <TabsTrigger value="teams" className="gap-2">
              <Building2 className="h-4 w-4" />
              Subappaltatori ({orderExternalTeams.length + subappaltatori.length})
            </TabsTrigger>
          </TabsList>

          {/* Employees Tab */}
          <TabsContent value="employees" className="space-y-3 mt-4">
            {orderEmployees.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                Nessun dipendente assegnato
              </p>
            ) : (
              <div className="space-y-2">
                {orderEmployees.map((oe) => (
                  <div
                    key={oe.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                  >
                    <div className="space-y-1">
                      <p className="font-medium">
                        {oe.employee.first_name} {oe.employee.last_name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {oe.hours_worked}h × {formatCurrency(oe.hourly_rate)}/h
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">
                        {formatCurrency(oe.total_cost)}
                      </span>
                      {editable && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Rimuovere assegnazione?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Il dipendente verrà rimosso da questo ordine.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Annulla</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteEmployeeMutation.mutate(oe.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Rimuovi
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </div>
                ))}
                <div className="flex justify-between pt-2 border-t">
                  <span className="font-medium">Totale Dipendenti</span>
                  <span className="font-semibold">{formatCurrency(totalEmployeeCost)}</span>
                </div>
              </div>
            )}

            {editable && (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => setAssignEmployeeOpen(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Assegna Dipendente
              </Button>
            )}
          </TabsContent>

          {/* Subappaltatori Tab */}
          <TabsContent value="teams" className="space-y-3 mt-4">
            {/* Subappaltatori from dashboard view */}
            {subappaltatori.length > 0 && (
              <div className="space-y-2">
                {subappaltatori.map((sub) => {
                  const lordo = sub.totale_sal_lordo ?? 0;
                  const contr = sub.importo_contrattuale ?? 0;
                  const pct = contr > 0 ? Math.min(100, Math.round((lordo / contr) * 100)) : 0;
                  return (
                    <div key={sub.id} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{sub.ragione_sociale}</p>
                          {sub.tipo_lavori && (
                            <p className="text-xs text-muted-foreground">{sub.tipo_lavori}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <DurcBadge scadenza={sub.durc_scadenza} />
                        </div>
                      </div>
                      {contr > 0 && (
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>Contratto eseguito</span>
                            <span className="font-medium">{pct}%</span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-orange-500 rounded-full transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>{formatCurrency(lordo)} / {formatCurrency(contr)}</span>
                            {sub.ritenute_in_corso > 0 && (
                              <span className="text-amber-600 font-medium">
                                {formatCurrency(sub.ritenute_in_corso)} ritenuta
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                      <Button asChild variant="ghost" size="sm" className="h-7 text-xs w-full">
                        <Link to={`/azienda/subappaltatori/${sub.id}`}>
                          <ExternalLink className="h-3 w-3 mr-1" />
                          Gestisci
                        </Link>
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* External teams (legacy) */}
            {orderExternalTeams.length > 0 && (
              <div className="space-y-2">
                {subappaltatori.length > 0 && <Separator />}
                {orderExternalTeams.map((ot) => (
                  <div
                    key={ot.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                  >
                    <div className="space-y-1">
                      <p className="font-medium">{ot.external_team.name}</p>
                      <div className="flex items-center gap-2 text-sm">
                        {ot.is_paid ? (
                          <Badge variant="default" className="gap-1">
                            <Check className="h-3 w-3" />
                            Pagato {ot.paid_date && `il ${formatDate(ot.paid_date)}`}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="gap-1">
                            <Clock className="h-3 w-3" />
                            {ot.payment_date
                              ? `Scadenza ${formatDate(ot.payment_date)}`
                              : "Non pagato"}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">
                        {formatCurrency(ot.total_cost)}
                      </span>
                      {editable && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() =>
                              togglePaidMutation.mutate({
                                id: ot.id,
                                isPaid: !ot.is_paid,
                              })
                            }
                          >
                            <Check
                              className={`h-4 w-4 ${
                                ot.is_paid ? "text-green-600" : "text-muted-foreground"
                              }`}
                            />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Rimuovere subappaltatore?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Il subappaltatore verrà rimosso da questo ordine.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Annulla</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteTeamMutation.mutate(ot.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Rimuovi
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </>
                      )}
                    </div>
                  </div>
                ))}
                <div className="flex justify-between pt-2 border-t">
                  <span className="font-medium">Totale Squadre Esterne</span>
                  <span className="font-semibold">{formatCurrency(totalTeamCost)}</span>
                </div>
              </div>
            )}

            {orderExternalTeams.length === 0 && subappaltatori.length === 0 && (
              <p className="text-sm text-muted-foreground py-2">
                Nessun subappaltatore assegnato
              </p>
            )}

            {editable && (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => setAssignTeamOpen(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Aggiungi Subappaltatore
              </Button>
            )}
          </TabsContent>
        </Tabs>

        <Separator />

        <div className="flex justify-between items-center pt-2">
          <span className="font-semibold">TOTALE MANODOPERA</span>
          <span className="text-lg font-bold text-primary">
            {formatCurrency(totalLaborCost)}
          </span>
        </div>

        {/* Dialogs */}
        <AssignEmployeeDialog
          open={assignEmployeeOpen}
          onOpenChange={setAssignEmployeeOpen}
          orderId={orderId}
          existingEmployeeIds={orderEmployees.map((e) => e.employee_id)}
        />

        <AssignExternalTeamDialog
          open={assignTeamOpen}
          onOpenChange={setAssignTeamOpen}
          orderId={orderId}
          existingTeamIds={orderExternalTeams.map((t) => t.external_team_id)}
        />
      </CardContent>
    </Card>
  );
}
