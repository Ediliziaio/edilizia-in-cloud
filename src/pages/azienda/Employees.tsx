import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users, Building2, Clock, Loader2, Check, Copy, Palmtree } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { StaffPermissions } from "@/components/users/PermissionsDialog";
import { ALL_PERMISSION_SECTIONS } from "@/components/users/permissionsDefaults";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { EmployeeDialog, EmployeeFormData } from "@/components/employees/EmployeeDialog";
import { ExternalTeamDialog, ExternalTeamFormData } from "@/components/employees/ExternalTeamDialog";
import { EmployeeAttachments } from "@/components/employees/EmployeeAttachments";
import { ExternalTeamAttachments } from "@/components/employees/ExternalTeamAttachments";
import { WorkLogsAdminTab } from "@/components/employees/WorkLogsAdminTab";
import { LeaveAdminTab } from "@/components/employees/LeaveAdminTab";
import { EmployeesTab } from "@/components/employees/EmployeesTab";
import { ExternalTeamsTab } from "@/components/employees/ExternalTeamsTab";
import type { Employee, ExternalTeam } from "@/types/employees";

import { DEFAULT_PERMISSIONS } from "@/components/users/permissionsDefaults";

const MARKETING_SECTION_KEYS = [
  "can_view_marketing_dashboard", "can_view_marketing_contacts", "can_view_marketing_opportunities",
  "can_view_marketing_activities", "can_view_marketing_appointments", "can_view_marketing_automations",
  "can_view_marketing_ai_agent", "can_view_marketing_email", "can_view_marketing_whatsapp", "can_view_marketing_reports",
];
const INTERNAL_SECTIONS = ALL_PERMISSION_SECTIONS.filter(s => !MARKETING_SECTION_KEYS.includes(s.viewKey as string));
const MARKETING_SECTIONS = ALL_PERMISSION_SECTIONS.filter(s => MARKETING_SECTION_KEYS.includes(s.viewKey as string));

export default function Employees() {
  const { effectiveCompany } = useAuth();
  
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
  const [createUserPhone, setCreateUserPhone] = useState("");
  const [createUserPassword, setCreateUserPassword] = useState("");
  const [createUserPermissions, setCreateUserPermissions] = useState<StaffPermissions>({ ...DEFAULT_PERMISSIONS });
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);
  const [activeRoleType, setActiveRoleType] = useState<'operaio' | 'staff_interno'>('operaio');

  const { data: employees = [], isLoading: loadingEmployees } = useQuery({
    queryKey: ["employees", effectiveCompanyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select("*")
        .eq("company_id", effectiveCompanyId!).order("last_name");
      if (error) throw error;
      return data as Employee[];
    },
    enabled: !!effectiveCompanyId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: externalTeams = [], isLoading: loadingTeams } = useQuery({
    queryKey: ["external-teams", effectiveCompanyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("external_teams").select("*")
        .eq("company_id", effectiveCompanyId!).order("name");
      if (error) throw error;
      return data as ExternalTeam[];
    },
    enabled: !!effectiveCompanyId,
    staleTime: 5 * 60 * 1000,
  });

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
      toast.success(editingEmployee ? "Dipendente aggiornato" : "Dipendente creato", { description: "I dati sono stati salvati con successo." });
      setEmployeeDialogOpen(false); setEditingEmployee(null);
    },
    onError: () => {
      toast.error("Errore", { description: "Si è verificato un errore durante il salvataggio." });
    },
  });

  const deleteEmployeeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("employees").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      toast.success("Dipendente eliminato", { description: "Il dipendente è stato rimosso." });
    },
    onError: () => {
      toast.error("Errore", { description: "Impossibile eliminare il dipendente. Potrebbe essere assegnato a degli ordini." });
    },
  });

  const saveTeamMutation = useMutation({
    mutationFn: async (data: ExternalTeamFormData & { id?: string }) => {
      if (data.id) {
        const { error } = await supabase.from("external_teams").update({
          name: data.name, contact_name: data.contact_name || null,
          phone: data.phone || null, email: data.email || null,
          notes: data.notes || null, is_active: data.is_active, vat_rate: data.vat_rate,
        }).eq("id", data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("external_teams").insert({
          company_id: effectiveCompanyId!,
          name: data.name, contact_name: data.contact_name || null,
          phone: data.phone || null, email: data.email || null,
          notes: data.notes || null, is_active: data.is_active, vat_rate: data.vat_rate,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["external-teams"] });
      toast.success(editingTeam ? "Squadra aggiornata" : "Squadra creata", { description: "I dati sono stati salvati con successo." });
      setTeamDialogOpen(false); setEditingTeam(null);
    },
    onError: () => {
      toast.error("Errore", { description: "Si è verificato un errore durante il salvataggio." });
    },
  });

  const deleteTeamMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("external_teams").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["external-teams"] });
      toast.success("Squadra eliminata", { description: "La squadra esterna è stata rimossa." });
    },
    onError: () => {
      toast.error("Errore", { description: "Impossibile eliminare la squadra. Potrebbe essere assegnata a degli ordini." });
    },
  });

  const createUserMutation = useMutation({
    mutationFn: async ({ employeeId, email, password, phone, permissions }: {
      employeeId: string; email: string; password?: string; phone?: string; permissions?: StaffPermissions;
    }) => {
      const { data, error } = await supabase.functions.invoke("create-employee-user", {
        body: { employee_id: employeeId, email, password: password || undefined, phone: phone || undefined, permissions },
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      queryClient.invalidateQueries({ queryKey: ["staff-users"] });
      if (data.temp_password) {
        setCreatedPassword(data.temp_password);
      } else {
        setCreateUserDialogOpen(false);
        resetCreateUserForm();
        toast.success("Account creato", { description: data.message });
      }
    },
    onError: (error: any) => {
      toast.error("Errore", { description: error.message || "Impossibile creare l'account." });
    },
  });

  const resetCreateUserForm = () => {
    setCreateUserEmail(""); setCreateUserPhone(""); setCreateUserPassword("");
    setCreateUserPermissions({ ...DEFAULT_PERMISSIONS }); setCreatedPassword(null);
  };

  const handleEditEmployee = (employee: Employee) => { setEditingEmployee(employee); setEmployeeDialogOpen(true); };
  const handleEditTeam = (team: ExternalTeam) => { setEditingTeam(team); setTeamDialogOpen(true); };

  const handleSaveEmployee = (data: EmployeeFormData) => {
    saveEmployeeMutation.mutate({ ...data, id: editingEmployee?.id, role_type: editingEmployee?.role_type ?? activeRoleType });
  };

  const operai = employees.filter(e => (e.role_type || 'operaio') === 'operaio');
  const staffInterno = employees.filter(e => e.role_type === 'staff_interno');
  const handleSaveTeam = (data: ExternalTeamFormData) => { saveTeamMutation.mutate({ ...data, id: editingTeam?.id }); };

  const handleCreateUser = (employee: Employee) => {
    setCreateUserEmployee(employee);
    setCreateUserEmail(employee.email || "");
    setCreateUserPhone(employee.phone || "");
    setCreateUserPassword("");
    setCreateUserPermissions({ ...DEFAULT_PERMISSIONS });
    setCreatedPassword(null);
    setCreateUserDialogOpen(true);
  };

  const handleTogglePermission = (key: keyof StaffPermissions, value: boolean) => {
    setCreateUserPermissions((prev) => {
      const updated = { ...prev, [key]: value };
      const section = ALL_PERMISSION_SECTIONS.find((s) => s.viewKey === key);
      if (section?.editKey && !value) updated[section.editKey] = false;
      return updated;
    });
  };

  const handleSelectAllPerms = () => {
    setCreateUserPermissions((prev) => ({
      ...DEFAULT_PERMISSIONS,
      can_view_dashboard: true, can_view_orders: true, can_edit_orders: true,
      can_view_warehouse: true, can_edit_warehouse: true, can_view_calendar: true,
      can_view_customers: true, can_edit_customers: true, can_view_employees: true,
      can_view_tickets: true, can_edit_tickets: true, can_view_forecast: true,
      can_view_settings: true, can_view_marketing: true, can_edit_marketing: true,
      only_assigned: prev.only_assigned,
    }));
  };

  const handleDeselectAllPerms = () => {
    setCreateUserPermissions((prev) => ({ ...DEFAULT_PERMISSIONS, only_assigned: prev.only_assigned }));
  };

  const renderPermSection = (section: typeof ALL_PERMISSION_SECTIONS[0]) => (
    <div key={section.viewKey} className="space-y-1.5">
      <div className="flex items-center space-x-2">
        <Checkbox id={`emp-${section.viewKey}`} checked={createUserPermissions[section.viewKey] as boolean}
          onCheckedChange={(checked) => handleTogglePermission(section.viewKey, checked as boolean)} />
        <Label htmlFor={`emp-${section.viewKey}`} className="font-medium text-sm">{section.label}</Label>
      </div>
      {section.editKey && createUserPermissions[section.viewKey] && (
        <div className="ml-6 flex items-center space-x-2">
          <Checkbox id={`emp-${section.editKey}`} checked={createUserPermissions[section.editKey] as boolean}
            onCheckedChange={(checked) => handleTogglePermission(section.editKey!, checked as boolean)} />
          <Label htmlFor={`emp-${section.editKey}`} className="text-xs text-muted-foreground">Può modificare</Label>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Gestione Staff</h1>
        <p className="text-muted-foreground">Operai, squadre esterne e staff interno</p>
      </div>

      <Tabs defaultValue="employees" className="space-y-4">
        <TabsList>
          <TabsTrigger value="employees" className="gap-2"><Users className="h-4 w-4" />Operai ({operai.length})</TabsTrigger>
          <TabsTrigger value="teams" className="gap-2"><Building2 className="h-4 w-4" />Squadre ({externalTeams.length})</TabsTrigger>
          <TabsTrigger value="staff-interno" className="gap-2"><Users className="h-4 w-4" />Staff Interno ({staffInterno.length})</TabsTrigger>
          <TabsTrigger value="worklogs" className="gap-2"><Clock className="h-4 w-4" />Rapportini</TabsTrigger>
        </TabsList>

        <TabsContent value="employees">
          <EmployeesTab employees={operai} isLoading={loadingEmployees} roleType="operaio"
            onNew={() => { setEditingEmployee(null); setActiveRoleType('operaio'); setEmployeeDialogOpen(true); }}
            onEdit={handleEditEmployee} onDelete={(id) => deleteEmployeeMutation.mutate(id)}
            onViewAttachments={setAttachmentsEmployee} onCreateUser={handleCreateUser} />
        </TabsContent>
        <TabsContent value="teams">
          <ExternalTeamsTab teams={externalTeams} isLoading={loadingTeams}
            onNew={() => { setEditingTeam(null); setTeamDialogOpen(true); }}
            onEdit={handleEditTeam} onDelete={(id) => deleteTeamMutation.mutate(id)}
            onViewAttachments={setAttachmentsTeam} />
        </TabsContent>
        <TabsContent value="staff-interno">
          <EmployeesTab employees={staffInterno} isLoading={loadingEmployees} roleType="staff_interno"
            onNew={() => { setEditingEmployee(null); setActiveRoleType('staff_interno'); setEmployeeDialogOpen(true); }}
            onEdit={handleEditEmployee} onDelete={(id) => deleteEmployeeMutation.mutate(id)}
            onViewAttachments={setAttachmentsEmployee} onCreateUser={handleCreateUser} />
        </TabsContent>
        <TabsContent value="worklogs"><WorkLogsAdminTab /></TabsContent>
      </Tabs>

      <EmployeeDialog open={employeeDialogOpen}
        onOpenChange={(open) => { setEmployeeDialogOpen(open); if (!open) setEditingEmployee(null); }}
        employee={editingEmployee} onSave={handleSaveEmployee} isSaving={saveEmployeeMutation.isPending} roleType={activeRoleType} />

      <ExternalTeamDialog open={teamDialogOpen}
        onOpenChange={(open) => { setTeamDialogOpen(open); if (!open) setEditingTeam(null); }}
        team={editingTeam} onSave={handleSaveTeam} isSaving={saveTeamMutation.isPending} />

      {attachmentsEmployee && (
        <EmployeeAttachments employee={attachmentsEmployee} open={!!attachmentsEmployee}
          onOpenChange={(open) => { if (!open) setAttachmentsEmployee(null); }} />
      )}
      {attachmentsTeam && (
        <ExternalTeamAttachments team={attachmentsTeam} open={!!attachmentsTeam}
          onOpenChange={(open) => { if (!open) setAttachmentsTeam(null); }} />
      )}

      {/* Create User Dialog - Extended */}
      <Dialog open={createUserDialogOpen} onOpenChange={(open) => {
        if (!open) { setCreateUserDialogOpen(false); resetCreateUserForm(); }
        else setCreateUserDialogOpen(open);
      }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Crea Account Dipendente</DialogTitle>
            <DialogDescription>
              {createUserEmployee && `Crea un account per ${createUserEmployee.first_name} ${createUserEmployee.last_name}`}
            </DialogDescription>
          </DialogHeader>

          {createdPassword ? (
            <div className="space-y-4">
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg dark:bg-green-900/20 dark:border-green-800">
                <p className="font-medium text-green-800 dark:text-green-200 flex items-center gap-2">
                  <Check className="h-4 w-4" /> Account creato con successo!
                </p>
                <p className="text-sm text-green-700 dark:text-green-300 mt-2">
                  Password temporanea: <code className="bg-green-100 dark:bg-green-800 px-2 py-1 rounded font-mono">{createdPassword}</code>
                  <Button variant="ghost" size="icon" className="h-6 w-6 ml-1" onClick={() => {
                    navigator.clipboard.writeText(createdPassword);
                    toast.success("Copiato", { description: "Password copiata" });
                  }}><Copy className="h-3 w-3" /></Button>
                </p>
                <p className="text-xs text-green-600 dark:text-green-400 mt-2">
                  Comunica questa password al dipendente. Dovrà cambiarla al primo accesso.
                </p>
              </div>
              <DialogFooter>
                <Button onClick={() => { setCreateUserDialogOpen(false); resetCreateUserForm(); }}>Chiudi</Button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={(e) => {
              e.preventDefault();
              if (createUserEmployee && createUserEmail) {
                createUserMutation.mutate({
                  employeeId: createUserEmployee.id,
                  email: createUserEmail,
                  password: createUserPassword || undefined,
                  phone: createUserPhone || undefined,
                  permissions: createUserPermissions,
                });
              }
            }} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="user-email">Email *</Label>
                <Input id="user-email" type="email" value={createUserEmail}
                  onChange={(e) => setCreateUserEmail(e.target.value)} placeholder="email@esempio.com" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="user-phone">Cellulare</Label>
                <Input id="user-phone" type="tel" value={createUserPhone}
                  onChange={(e) => setCreateUserPhone(e.target.value)} placeholder="+39 333 1234567" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="user-password">Password</Label>
                <Input id="user-password" type="text" value={createUserPassword}
                  onChange={(e) => setCreateUserPassword(e.target.value)} placeholder="Lascia vuoto per generarla automaticamente" />
                <p className="text-xs text-muted-foreground">Se lasci vuoto, verrà generata automaticamente e mostrata dopo la creazione</p>
              </div>

              <Separator />

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold">Permessi</Label>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={handleSelectAllPerms}>Seleziona tutti</Button>
                    <Button type="button" variant="outline" size="sm" onClick={handleDeselectAllPerms}>Deseleziona tutti</Button>
                  </div>
                </div>

                <div className="space-y-3 max-h-[250px] overflow-y-auto pr-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Gestione Interna</p>
                  {INTERNAL_SECTIONS.map(renderPermSection)}
                  <Separator />
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Marketing e Vendita</p>
                  {MARKETING_SECTIONS.map(renderPermSection)}
                  <Separator />
                  <div className="space-y-1.5">
                    <div className="flex items-center space-x-2">
                      <Checkbox id="emp-only_assigned" checked={createUserPermissions.only_assigned || false}
                        onCheckedChange={(checked) => setCreateUserPermissions((prev) => ({ ...prev, only_assigned: checked as boolean }))} />
                      <Label htmlFor="emp-only_assigned" className="font-medium text-sm">Solo elementi assegnati</Label>
                    </div>
                    <p className="text-xs text-muted-foreground ml-6">Se attivo, l'utente vedrà solo ordini, attività e appuntamenti assegnati a lui</p>
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => { setCreateUserDialogOpen(false); resetCreateUserForm(); }}>Annulla</Button>
                <Button type="submit" disabled={createUserMutation.isPending}>
                  {createUserMutation.isPending ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creazione...</>) : "Crea Account"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
