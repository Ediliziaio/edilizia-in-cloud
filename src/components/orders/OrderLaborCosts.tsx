import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { HardHat, Users, Building2, Plus, Trash2, Check, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/formatters";

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

interface OrderLaborCostsProps {
  orderId: string;
  editable?: boolean;
}

export function OrderLaborCosts({ orderId, editable = true }: OrderLaborCostsProps) {
  const { effectiveCompany } = useAuth();
  const { toast } = useToast();
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

  // Delete order employee mutation
  const deleteEmployeeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("order_employees").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order-employees", orderId] });
      toast({ title: "Assegnazione rimossa" });
    },
    onError: () => {
      toast({
        title: "Errore",
        description: "Impossibile rimuovere l'assegnazione.",
        variant: "destructive",
      });
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
      toast({ title: "Squadra rimossa" });
    },
    onError: () => {
      toast({
        title: "Errore",
        description: "Impossibile rimuovere la squadra.",
        variant: "destructive",
      });
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
      toast({ title: "Stato pagamento aggiornato" });
    },
  });

  const totalEmployeeCost = orderEmployees.reduce((sum, e) => sum + e.total_cost, 0);
  const totalTeamCost = orderExternalTeams.reduce((sum, t) => sum + t.total_cost, 0);
  const totalLaborCost = totalEmployeeCost + totalTeamCost;

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
              Squadre ({orderExternalTeams.length})
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

          {/* External Teams Tab */}
          <TabsContent value="teams" className="space-y-3 mt-4">
            {orderExternalTeams.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                Nessuna squadra esterna assegnata
              </p>
            ) : (
              <div className="space-y-2">
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
                                <AlertDialogTitle>Rimuovere squadra?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  La squadra verrà rimossa da questo ordine.
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
                  <span className="font-medium">Totale Squadre</span>
                  <span className="font-semibold">{formatCurrency(totalTeamCost)}</span>
                </div>
              </div>
            )}

            {editable && (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => setAssignTeamOpen(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Aggiungi Squadra
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
