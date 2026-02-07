import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users, Building2, Plus, Pencil, Trash2, Phone, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/formatters";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { EmployeeDialog, EmployeeFormData } from "@/components/employees/EmployeeDialog";
import { ExternalTeamDialog, ExternalTeamFormData } from "@/components/employees/ExternalTeamDialog";

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  gross_salary: number;
  net_salary: number;
  monthly_hours: number;
  is_active: boolean;
}

interface ExternalTeam {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  is_active: boolean;
}

export default function Employees() {
  const { effectiveCompany } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const effectiveCompanyId = effectiveCompany?.id;

  const [employeeDialogOpen, setEmployeeDialogOpen] = useState(false);
  const [teamDialogOpen, setTeamDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [editingTeam, setEditingTeam] = useState<ExternalTeam | null>(null);

  // Fetch employees
  const { data: employees = [], isLoading: loadingEmployees } = useQuery({
    queryKey: ["employees", effectiveCompanyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("*")
        .eq("company_id", effectiveCompanyId!)
        .order("last_name");

      if (error) throw error;
      return data as Employee[];
    },
    enabled: !!effectiveCompanyId,
  });

  // Fetch external teams
  const { data: externalTeams = [], isLoading: loadingTeams } = useQuery({
    queryKey: ["external-teams", effectiveCompanyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("external_teams")
        .select("*")
        .eq("company_id", effectiveCompanyId!)
        .order("name");

      if (error) throw error;
      return data as ExternalTeam[];
    },
    enabled: !!effectiveCompanyId,
  });

  // Create/update employee mutation
  const saveEmployeeMutation = useMutation({
    mutationFn: async (data: EmployeeFormData & { id?: string }) => {
      if (data.id) {
        const { error } = await supabase
          .from("employees")
          .update({
            first_name: data.first_name,
            last_name: data.last_name,
            email: data.email || null,
            phone: data.phone || null,
            gross_salary: data.gross_salary,
            net_salary: data.net_salary,
            monthly_hours: data.monthly_hours,
            is_active: data.is_active,
          })
          .eq("id", data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("employees").insert({
          company_id: effectiveCompanyId!,
          first_name: data.first_name,
          last_name: data.last_name,
          email: data.email || null,
          phone: data.phone || null,
          gross_salary: data.gross_salary,
          net_salary: data.net_salary,
          monthly_hours: data.monthly_hours,
          is_active: data.is_active,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      toast({
        title: editingEmployee ? "Dipendente aggiornato" : "Dipendente creato",
        description: "I dati sono stati salvati con successo.",
      });
      setEmployeeDialogOpen(false);
      setEditingEmployee(null);
    },
    onError: () => {
      toast({
        title: "Errore",
        description: "Si è verificato un errore durante il salvataggio.",
        variant: "destructive",
      });
    },
  });

  // Delete employee mutation
  const deleteEmployeeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("employees").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      toast({
        title: "Dipendente eliminato",
        description: "Il dipendente è stato rimosso.",
      });
    },
    onError: () => {
      toast({
        title: "Errore",
        description: "Impossibile eliminare il dipendente. Potrebbe essere assegnato a degli ordini.",
        variant: "destructive",
      });
    },
  });

  // Create/update external team mutation
  const saveTeamMutation = useMutation({
    mutationFn: async (data: ExternalTeamFormData & { id?: string }) => {
      if (data.id) {
        const { error } = await supabase
          .from("external_teams")
          .update({
            name: data.name,
            contact_name: data.contact_name || null,
            phone: data.phone || null,
            email: data.email || null,
            notes: data.notes || null,
            is_active: data.is_active,
          })
          .eq("id", data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("external_teams").insert({
          company_id: effectiveCompanyId!,
          name: data.name,
          contact_name: data.contact_name || null,
          phone: data.phone || null,
          email: data.email || null,
          notes: data.notes || null,
          is_active: data.is_active,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["external-teams"] });
      toast({
        title: editingTeam ? "Squadra aggiornata" : "Squadra creata",
        description: "I dati sono stati salvati con successo.",
      });
      setTeamDialogOpen(false);
      setEditingTeam(null);
    },
    onError: () => {
      toast({
        title: "Errore",
        description: "Si è verificato un errore durante il salvataggio.",
        variant: "destructive",
      });
    },
  });

  // Delete external team mutation
  const deleteTeamMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("external_teams").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["external-teams"] });
      toast({
        title: "Squadra eliminata",
        description: "La squadra esterna è stata rimossa.",
      });
    },
    onError: () => {
      toast({
        title: "Errore",
        description: "Impossibile eliminare la squadra. Potrebbe essere assegnata a degli ordini.",
        variant: "destructive",
      });
    },
  });

  const handleEditEmployee = (employee: Employee) => {
    setEditingEmployee(employee);
    setEmployeeDialogOpen(true);
  };

  const handleEditTeam = (team: ExternalTeam) => {
    setEditingTeam(team);
    setTeamDialogOpen(true);
  };

  const handleSaveEmployee = (data: EmployeeFormData) => {
    saveEmployeeMutation.mutate({
      ...data,
      id: editingEmployee?.id,
    });
  };

  const handleSaveTeam = (data: ExternalTeamFormData) => {
    saveTeamMutation.mutate({
      ...data,
      id: editingTeam?.id,
    });
  };

  const calculateHourlyCost = (grossSalary: number, monthlyHours: number) => {
    return monthlyHours > 0 ? grossSalary / monthlyHours : 0;
  };

  const activeEmployees = employees.filter((e) => e.is_active);
  const inactiveEmployees = employees.filter((e) => !e.is_active);
  const activeTeams = externalTeams.filter((t) => t.is_active);
  const inactiveTeams = externalTeams.filter((t) => !t.is_active);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Gestione Personale</h1>
        <p className="text-muted-foreground">
          Dipendenti interni e squadre esterne
        </p>
      </div>

      <Tabs defaultValue="employees" className="space-y-4">
        <TabsList>
          <TabsTrigger value="employees" className="gap-2">
            <Users className="h-4 w-4" />
            Dipendenti Interni ({employees.length})
          </TabsTrigger>
          <TabsTrigger value="teams" className="gap-2">
            <Building2 className="h-4 w-4" />
            Squadre Esterne ({externalTeams.length})
          </TabsTrigger>
        </TabsList>

        {/* Employees Tab */}
        <TabsContent value="employees" className="space-y-4">
          <div className="flex justify-between items-center">
            <div className="text-sm text-muted-foreground">
              {activeEmployees.length} attivi, {inactiveEmployees.length} inattivi
            </div>
            <Button
              onClick={() => {
                setEditingEmployee(null);
                setEmployeeDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Nuovo Dipendente
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              {loadingEmployees ? (
                <div className="p-8 text-center text-muted-foreground">
                  Caricamento...
                </div>
              ) : employees.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  Nessun dipendente registrato. Aggiungi il primo dipendente per iniziare.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Contatti</TableHead>
                      <TableHead className="text-right">Stipendio Lordo</TableHead>
                      <TableHead className="text-right">Stipendio Netto</TableHead>
                      <TableHead className="text-right">Ore/Mese</TableHead>
                      <TableHead className="text-right">Costo Orario</TableHead>
                      <TableHead>Stato</TableHead>
                      <TableHead className="text-right">Azioni</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {employees.map((employee) => (
                      <TableRow key={employee.id}>
                        <TableCell className="font-medium">
                          {employee.first_name} {employee.last_name}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                            {employee.email && (
                              <div className="flex items-center gap-1">
                                <Mail className="h-3 w-3" />
                                {employee.email}
                              </div>
                            )}
                            {employee.phone && (
                              <div className="flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {employee.phone}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(employee.gross_salary)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(employee.net_salary)}
                        </TableCell>
                        <TableCell className="text-right">
                          {employee.monthly_hours}h
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(
                            calculateHourlyCost(employee.gross_salary, employee.monthly_hours)
                          )}/h
                        </TableCell>
                        <TableCell>
                          <Badge variant={employee.is_active ? "default" : "secondary"}>
                            {employee.is_active ? "Attivo" : "Inattivo"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEditEmployee(employee)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Eliminare il dipendente?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Questa azione è irreversibile. Se il dipendente è assegnato a ordini, 
                                    considera invece di impostarlo come "Inattivo".
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Annulla</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteEmployeeMutation.mutate(employee.id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    Elimina
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* External Teams Tab */}
        <TabsContent value="teams" className="space-y-4">
          <div className="flex justify-between items-center">
            <div className="text-sm text-muted-foreground">
              {activeTeams.length} attive, {inactiveTeams.length} inattive
            </div>
            <Button
              onClick={() => {
                setEditingTeam(null);
                setTeamDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Nuova Squadra
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              {loadingTeams ? (
                <div className="p-8 text-center text-muted-foreground">
                  Caricamento...
                </div>
              ) : externalTeams.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  Nessuna squadra esterna registrata. Aggiungi la prima squadra per iniziare.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome Ditta</TableHead>
                      <TableHead>Referente</TableHead>
                      <TableHead>Contatti</TableHead>
                      <TableHead>Note</TableHead>
                      <TableHead>Stato</TableHead>
                      <TableHead className="text-right">Azioni</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {externalTeams.map((team) => (
                      <TableRow key={team.id}>
                        <TableCell className="font-medium">{team.name}</TableCell>
                        <TableCell>{team.contact_name || "-"}</TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                            {team.email && (
                              <div className="flex items-center gap-1">
                                <Mail className="h-3 w-3" />
                                {team.email}
                              </div>
                            )}
                            {team.phone && (
                              <div className="flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {team.phone}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">
                          {team.notes || "-"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={team.is_active ? "default" : "secondary"}>
                            {team.is_active ? "Attiva" : "Inattiva"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEditTeam(team)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Eliminare la squadra?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Questa azione è irreversibile. Se la squadra è assegnata a ordini, 
                                    considera invece di impostarla come "Inattiva".
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Annulla</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteTeamMutation.mutate(team.id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    Elimina
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Employee Dialog */}
      <EmployeeDialog
        open={employeeDialogOpen}
        onOpenChange={(open) => {
          setEmployeeDialogOpen(open);
          if (!open) setEditingEmployee(null);
        }}
        employee={editingEmployee}
        onSave={handleSaveEmployee}
        isSaving={saveEmployeeMutation.isPending}
      />

      {/* External Team Dialog */}
      <ExternalTeamDialog
        open={teamDialogOpen}
        onOpenChange={(open) => {
          setTeamDialogOpen(open);
          if (!open) setEditingTeam(null);
        }}
        team={editingTeam}
        onSave={handleSaveTeam}
        isSaving={saveTeamMutation.isPending}
      />
    </div>
  );
}
