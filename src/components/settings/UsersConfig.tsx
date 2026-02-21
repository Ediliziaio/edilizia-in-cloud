import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users, Plus, Shield, Trash2, Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { StaffUserDialog, StaffUserFormData } from "@/components/users/StaffUserDialog";
import { PermissionsDialog, StaffPermissions } from "@/components/users/PermissionsDialog";

interface CompanyUser {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: "company_admin" | "company_staff";
  permissions: StaffPermissions | null;
}

const DEFAULT_PERMISSIONS: StaffPermissions = {
  can_view_dashboard: false,
  can_view_orders: false,
  can_edit_orders: false,
  can_view_warehouse: false,
  can_edit_warehouse: false,
  can_view_calendar: false,
  can_view_customers: false,
  can_edit_customers: false,
  can_view_employees: false,
  can_view_tickets: false,
  can_edit_tickets: false,
  can_view_forecast: false,
  can_view_settings: false,
};

export function UsersConfig() {
  const { user, effectiveCompany } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const effectiveCompanyId = effectiveCompany?.id;

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [permissionsUser, setPermissionsUser] = useState<CompanyUser | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Fetch all company users (admin + staff) excluding current user
  const { data: companyUsers = [], isLoading } = useQuery({
    queryKey: ["company-users", effectiveCompanyId],
    queryFn: async () => {
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email")
        .eq("company_id", effectiveCompanyId!);

      if (profilesError) throw profilesError;

      const userIds = profiles.map((p) => p.id);
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", userIds);

      // Filter company_admin and company_staff, exclude current user
      const companyRoles = roles?.filter(
        (r) => (r.role === "company_admin" || r.role === "company_staff") && r.user_id !== user?.id
      ) || [];

      if (companyRoles.length === 0) return [];

      const staffUserIds = companyRoles.filter((r) => r.role === "company_staff").map((r) => r.user_id);

      // Get permissions for staff users
      let permissionsMap: Record<string, any> = {};
      if (staffUserIds.length > 0) {
        const { data: permissions } = await supabase
          .from("staff_permissions")
          .select("*")
          .in("user_id", staffUserIds);
        permissions?.forEach((p) => { permissionsMap[p.user_id] = p; });
      }

      const result: CompanyUser[] = companyRoles.map((r) => {
        const profile = profiles.find((p) => p.id === r.user_id)!;
        return {
          ...profile,
          role: r.role as "company_admin" | "company_staff",
          permissions: permissionsMap[r.user_id] || null,
        };
      });

      return result;
    },
    enabled: !!effectiveCompanyId,
    staleTime: 5 * 60 * 1000,
  });

  // Create user
  const handleCreateUser = async (data: StaffUserFormData): Promise<{ temporaryPassword?: string }> => {
    setIsCreating(true);
    try {
      const response = await supabase.functions.invoke("create-company-staff", {
        body: {
          first_name: data.first_name,
          last_name: data.last_name,
          email: data.email,
          company_id: effectiveCompanyId,
          role_type: data.role_type,
        },
      });

      if (response.error) throw new Error(response.error.message || "Errore durante la creazione");
      if (response.data?.error) throw new Error(response.data.error);

      queryClient.invalidateQueries({ queryKey: ["company-users"] });
      
      toast({
        title: "Utente creato",
        description: `${data.first_name} ${data.last_name} è stato creato come ${data.role_type === "company_admin" ? "Amministratore" : "Operatore"}.`,
      });

      return { temporaryPassword: response.data.temporary_password };
    } catch (error: any) {
      toast({
        title: "Errore",
        description: error.message || "Errore durante la creazione dell'utente",
        variant: "destructive",
      });
      throw error;
    } finally {
      setIsCreating(false);
    }
  };

  // Save permissions
  const savePermissionsMutation = useMutation({
    mutationFn: async (permissions: StaffPermissions) => {
      if (!permissionsUser) throw new Error("No user selected");
      const { error } = await supabase
        .from("staff_permissions")
        .update(permissions)
        .eq("user_id", permissionsUser.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-users"] });
      toast({ title: "Permessi salvati", description: "I permessi sono stati aggiornati con successo." });
    },
    onError: () => {
      toast({ title: "Errore", description: "Errore durante il salvataggio dei permessi", variant: "destructive" });
    },
  });

  // Delete user
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      await supabase.from("staff_permissions").delete().eq("user_id", userId);
      await supabase.from("user_roles").delete().eq("user_id", userId);
      const { error } = await supabase.from("profiles").delete().eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-users"] });
      toast({ title: "Utente eliminato", description: "L'utente è stato rimosso." });
    },
    onError: () => {
      toast({ title: "Errore", description: "Impossibile eliminare l'utente.", variant: "destructive" });
    },
  });

  const getPermissionsSummary = (u: CompanyUser): string => {
    if (u.role === "company_admin") return "Accesso completo";
    if (!u.permissions) return "Nessun permesso";
    
    const labels: string[] = [];
    if (u.permissions.can_view_dashboard) labels.push("Dashboard");
    if (u.permissions.can_view_orders) labels.push("Ordini");
    if (u.permissions.can_view_warehouse) labels.push("Magazzino");
    if (u.permissions.can_view_calendar) labels.push("Calendario");
    if (u.permissions.can_view_customers) labels.push("Clienti");
    if (u.permissions.can_view_employees) labels.push("Dipendenti");
    if (u.permissions.can_view_tickets) labels.push("Assistenza");
    if (u.permissions.can_view_forecast) labels.push("Previsionale");
    if (u.permissions.can_view_settings) labels.push("Impostazioni");
    
    if (labels.length === 0) return "Nessun permesso";
    if (labels.length > 3) return `${labels.slice(0, 3).join(", ")} +${labels.length - 3}`;
    return labels.join(", ");
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Utenti Aziendali
            </CardTitle>
            <CardDescription>
              Gestisci gli accessi del tuo team (admin e operatori)
            </CardDescription>
          </div>
          <Button onClick={() => setCreateDialogOpen(true)} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Nuovo Utente
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : companyUsers.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground border rounded-lg">
            <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Nessun altro utente creato.</p>
            <p className="text-sm">Crea il primo utente per dare accesso al tuo team.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Ruolo</TableHead>
                <TableHead>Permessi</TableHead>
                <TableHead className="text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companyUsers.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">
                    {u.first_name} {u.last_name}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {u.email}
                  </TableCell>
                  <TableCell>
                    {u.role === "company_admin" ? (
                      <Badge className="bg-primary/10 text-primary border-primary/20">
                        <ShieldCheck className="h-3 w-3 mr-1" />
                        Admin
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Operatore</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-normal">
                      {getPermissionsSummary(u)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      {/* Only show permissions button for staff */}
                      {u.role === "company_staff" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setPermissionsUser(u)}
                          title="Gestisci permessi"
                        >
                          <Shield className="h-4 w-4" />
                        </Button>
                      )}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" title="Elimina">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Eliminare l'utente?</AlertDialogTitle>
                            <AlertDialogDescription>
                              L'utente {u.first_name} {u.last_name} non potrà più accedere al sistema.
                              Questa azione è irreversibile.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Annulla</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteUserMutation.mutate(u.id)}
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

      <StaffUserDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSubmit={handleCreateUser}
        isLoading={isCreating}
      />

      {permissionsUser && (
        <PermissionsDialog
          open={!!permissionsUser}
          onOpenChange={(open) => !open && setPermissionsUser(null)}
          userName={`${permissionsUser.first_name} ${permissionsUser.last_name}`}
          currentPermissions={permissionsUser.permissions || DEFAULT_PERMISSIONS}
          onSave={async (perms) => { savePermissionsMutation.mutate(perms); }}
          isLoading={savePermissionsMutation.isPending}
        />
      )}
    </Card>
  );
}
