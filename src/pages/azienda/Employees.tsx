import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users, Building2, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmployeeDialog, EmployeeFormData } from "@/components/employees/EmployeeDialog";
import { ExternalTeamDialog, ExternalTeamFormData } from "@/components/employees/ExternalTeamDialog";
import { EmployeeAttachments } from "@/components/employees/EmployeeAttachments";
import { ExternalTeamAttachments } from "@/components/employees/ExternalTeamAttachments";
import { WorkLogsAdminTab } from "@/components/employees/WorkLogsAdminTab";
import { EmployeesTab } from "@/components/employees/EmployeesTab";
import { ExternalTeamsTab } from "@/components/employees/ExternalTeamsTab";
import type { Employee, ExternalTeam } from "@/types/employees";

export default function Employees() {
  const { effectiveCompany } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const effectiveCompanyId = effectiveCompany?.id;

  const [employeeDialogOpen, setEmployeeDialogOpen] = useState(false);
  const [teamDialogOpen, setTeamDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [editingTeam, setEditingTeam] = useState<ExternalTeam | null>(null);
  const [attachmentsEmployee, setAttachmentsEmployee] = useState<Employee | null>(null);
  const [attachmentsTeam, setAttachmentsTeam] = useState<ExternalTeam | null>(null);
  const [createUserDialogOpen, setCreateUserDialogOpen] = useState(false);
  const [createUserEmployee, setCreateUserEmployee] = useState<Employee | null>(null);
  const [createUserEmail, setCreateUserEmail] = useState("");
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);
  const [activeRoleType, setActiveRoleType] = useState<'operaio' | 'staff_interno'>('operaio');

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
    staleTime: 5 * 60 * 1000,
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
    staleTime: 5 * 60 * 1000,
  });

  // Mutations
  const saveEmployeeMutation = useMutation({
    mutationFn: async (data: EmployeeFormData & { id?: string; role_type?: string }) => {
      if (data.id) {
        const { error } = await supabase.from("employees").update({
          first_name: data.first_name, last_name: data.last_name,
          email: data.email || null, phone: data.phone || null,
          gross_salary: data.gross_salary, net_salary: data.net_salary,
          monthly_hours: data.monthly_hours, is_active: data.is_active,
        }).eq("id", data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("employees").insert({
          company_id: effectiveCompanyId!,
          first_name: data.first_name, last_name: data.last_name,
          email: data.email || null, phone: data.phone || null,
          gross_salary: data.gross_salary, net_salary: data.net_salary,
          monthly_hours: data.monthly_hours, is_active: data.is_active,
          role_type: data.role_type || 'operaio',
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      toast({ title: editingEmployee ? "Dipendente aggiornato" : "Dipendente creato", description: "I dati sono stati salvati con successo." });
      setEmployeeDialogOpen(false);
      setEditingEmployee(null);
    },
    onError: () => {
      toast({ title: "Errore", description: "Si è verificato un errore durante il salvataggio.", variant: "destructive" });
    },
  });

  const deleteEmployeeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("employees").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      toast({ title: "Dipendente eliminato", description: "Il dipendente è stato rimosso." });
    },
    onError: () => {
      toast({ title: "Errore", description: "Impossibile eliminare il dipendente. Potrebbe essere assegnato a degli ordini.", variant: "destructive" });
    },
  });

  const saveTeamMutation = useMutation({
    mutationFn: async (data: ExternalTeamFormData & { id?: string }) => {
      if (data.id) {
        const { error } = await supabase.from("external_teams").update({
          name: data.name, contact_name: data.contact_name || null,
          phone: data.phone || null, email: data.email || null,
          notes: data.notes || null, is_active: data.is_active,
          vat_rate: data.vat_rate,
        }).eq("id", data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("external_teams").insert({
          company_id: effectiveCompanyId!,
          name: data.name, contact_name: data.contact_name || null,
          phone: data.phone || null, email: data.email || null,
          notes: data.notes || null, is_active: data.is_active,
          vat_rate: data.vat_rate,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["external-teams"] });
      toast({ title: editingTeam ? "Squadra aggiornata" : "Squadra creata", description: "I dati sono stati salvati con successo." });
      setTeamDialogOpen(false);
      setEditingTeam(null);
    },
    onError: () => {
      toast({ title: "Errore", description: "Si è verificato un errore durante il salvataggio.", variant: "destructive" });
    },
  });

  const deleteTeamMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("external_teams").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["external-teams"] });
      toast({ title: "Squadra eliminata", description: "La squadra esterna è stata rimossa." });
    },
    onError: () => {
      toast({ title: "Errore", description: "Impossibile eliminare la squadra. Potrebbe essere assegnata a degli ordini.", variant: "destructive" });
    },
  });

  const createUserMutation = useMutation({
    mutationFn: async ({ employeeId, email }: { employeeId: string; email: string }) => {
      const { data, error } = await supabase.functions.invoke("create-employee-user", {
        body: { employee_id: employeeId, email },
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      setCreatedPassword(data.temp_password);
      toast({ title: "Account creato", description: data.message });
    },
    onError: (error: any) => {
      toast({ title: "Errore", description: error.message || "Impossibile creare l'account.", variant: "destructive" });
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
    saveEmployeeMutation.mutate({ ...data, id: editingEmployee?.id, role_type: editingEmployee?.role_type ?? activeRoleType });
  };

  const operai = employees.filter(e => (e.role_type || 'operaio') === 'operaio');
  const staffInterno = employees.filter(e => e.role_type === 'staff_interno');

  const handleSaveTeam = (data: ExternalTeamFormData) => {
    saveTeamMutation.mutate({ ...data, id: editingTeam?.id });
  };

  const handleCreateUser = (employee: Employee) => {
    setCreateUserEmployee(employee);
    setCreateUserEmail(employee.email || "");
    setCreatedPassword(null);
    setCreateUserDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Gestione Staff</h1>
        <p className="text-muted-foreground">Operai, squadre esterne e staff interno</p>
      </div>

      <Tabs defaultValue="employees" className="space-y-4">
        <TabsList>
          <TabsTrigger value="employees" className="gap-2">
            <Users className="h-4 w-4" />
            Operai ({operai.length})
          </TabsTrigger>
          <TabsTrigger value="teams" className="gap-2">
            <Building2 className="h-4 w-4" />
            Squadre ({externalTeams.length})
          </TabsTrigger>
          <TabsTrigger value="staff-interno" className="gap-2">
            <Users className="h-4 w-4" />
            Staff Interno ({staffInterno.length})
          </TabsTrigger>
          <TabsTrigger value="worklogs" className="gap-2">
            <Clock className="h-4 w-4" />
            Rapportini
          </TabsTrigger>
        </TabsList>

        <TabsContent value="employees">
          <EmployeesTab
            employees={operai}
            isLoading={loadingEmployees}
            roleType="operaio"
            onNew={() => { setEditingEmployee(null); setActiveRoleType('operaio'); setEmployeeDialogOpen(true); }}
            onEdit={handleEditEmployee}
            onDelete={(id) => deleteEmployeeMutation.mutate(id)}
            onViewAttachments={setAttachmentsEmployee}
            onCreateUser={handleCreateUser}
          />
        </TabsContent>

        <TabsContent value="teams">
          <ExternalTeamsTab
            teams={externalTeams}
            isLoading={loadingTeams}
            onNew={() => { setEditingTeam(null); setTeamDialogOpen(true); }}
            onEdit={handleEditTeam}
            onDelete={(id) => deleteTeamMutation.mutate(id)}
            onViewAttachments={setAttachmentsTeam}
          />
        </TabsContent>

        <TabsContent value="staff-interno">
          <EmployeesTab
            employees={staffInterno}
            isLoading={loadingEmployees}
            roleType="staff_interno"
            onNew={() => { setEditingEmployee(null); setActiveRoleType('staff_interno'); setEmployeeDialogOpen(true); }}
            onEdit={handleEditEmployee}
            onDelete={(id) => deleteEmployeeMutation.mutate(id)}
            onViewAttachments={setAttachmentsEmployee}
            onCreateUser={handleCreateUser}
          />
        </TabsContent>

        <TabsContent value="worklogs">
          <WorkLogsAdminTab />
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <EmployeeDialog
        open={employeeDialogOpen}
        onOpenChange={(open) => { setEmployeeDialogOpen(open); if (!open) setEditingEmployee(null); }}
        employee={editingEmployee}
        onSave={handleSaveEmployee}
        isSaving={saveEmployeeMutation.isPending}
        roleType={activeRoleType}
      />

      <ExternalTeamDialog
        open={teamDialogOpen}
        onOpenChange={(open) => { setTeamDialogOpen(open); if (!open) setEditingTeam(null); }}
        team={editingTeam}
        onSave={handleSaveTeam}
        isSaving={saveTeamMutation.isPending}
      />

      {attachmentsEmployee && (
        <EmployeeAttachments
          employee={attachmentsEmployee}
          open={!!attachmentsEmployee}
          onOpenChange={(open) => { if (!open) setAttachmentsEmployee(null); }}
        />
      )}

      {attachmentsTeam && (
        <ExternalTeamAttachments
          team={attachmentsTeam}
          open={!!attachmentsTeam}
          onOpenChange={(open) => { if (!open) setAttachmentsTeam(null); }}
        />
      )}

      <Dialog open={createUserDialogOpen} onOpenChange={setCreateUserDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crea Account Dipendente</DialogTitle>
            <DialogDescription>
              {createUserEmployee && `Crea un account per ${createUserEmployee.first_name} ${createUserEmployee.last_name} per permettergli di registrare le ore lavorate.`}
            </DialogDescription>
          </DialogHeader>

          {createdPassword ? (
            <div className="space-y-4">
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg dark:bg-green-900/20 dark:border-green-800">
                <p className="font-medium text-green-800 dark:text-green-200">Account creato con successo!</p>
                <p className="text-sm text-green-700 dark:text-green-300 mt-2">
                  Password temporanea: <code className="bg-green-100 dark:bg-green-800 px-2 py-1 rounded font-mono">{createdPassword}</code>
                </p>
                <p className="text-xs text-green-600 dark:text-green-400 mt-2">
                  Comunica questa password al dipendente. Dovrà cambiarla al primo accesso.
                </p>
              </div>
              <DialogFooter>
                <Button onClick={() => setCreateUserDialogOpen(false)}>Chiudi</Button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={(e) => {
              e.preventDefault();
              if (createUserEmployee && createUserEmail) {
                createUserMutation.mutate({ employeeId: createUserEmployee.id, email: createUserEmail });
              }
            }} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="user-email">Email per l'account</Label>
                <Input
                  id="user-email"
                  type="email"
                  value={createUserEmail}
                  onChange={(e) => setCreateUserEmail(e.target.value)}
                  placeholder="email@esempio.com"
                  required
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCreateUserDialogOpen(false)}>Annulla</Button>
                <Button type="submit" disabled={createUserMutation.isPending}>
                  {createUserMutation.isPending ? "Creazione..." : "Crea Account"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
