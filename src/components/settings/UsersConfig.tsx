import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users, Plus, Shield, Trash2, Loader2 } from "lucide-react";
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

interface StaffUser {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
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
  const { effectiveCompany } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const effectiveCompanyId = effectiveCompany?.id;

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [permissionsUser, setPermissionsUser] = useState<StaffUser | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Fetch staff users with their permissions
  const { data: staffUsers = [], isLoading } = useQuery({
    queryKey: ["staff-users", effectiveCompanyId],
    queryFn: async () => {
      // First get all staff users in this company
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email")
        .eq("company_id", effectiveCompanyId!);

      if (profilesError) throw profilesError;

      // Get their roles
      const userIds = profiles.map((p) => p.id);
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", userIds);

      // Filter only company_staff
      const staffUserIds = roles
        ?.filter((r) => r.role === "company_staff")
        .map((r) => r.user_id) || [];

      if (staffUserIds.length === 0) return [];

      // Get permissions for staff users
      const { data: permissions } = await supabase
        .from("staff_permissions")
        .select("*")
        .in("user_id", staffUserIds);

      // Build result
      const result: StaffUser[] = profiles
        .filter((p) => staffUserIds.includes(p.id))
        .map((p) => ({
          ...p,
          permissions: permissions?.find((perm) => perm.user_id === p.id) || null,
        }));

      return result;
    },
    enabled: !!effectiveCompanyId,
    staleTime: 5 * 60 * 1000,
  });

  // Create staff user
  const handleCreateUser = async (data: StaffUserFormData): Promise<{ temporaryPassword?: string }> => {
    setIsCreating(true);
    try {
      const response = await supabase.functions.invoke("create-company-staff", {
        body: {
          first_name: data.first_name,
          last_name: data.last_name,
          email: data.email,
          company_id: effectiveCompanyId,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || "Errore durante la creazione");
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      queryClient.invalidateQueries({ queryKey: ["staff-users"] });
      
      toast({
        title: "Utente creato",
        description: `${data.first_name} ${data.last_name} è stato creato con successo.`,
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

  // Save permissions mutation
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
      queryClient.invalidateQueries({ queryKey: ["staff-users"] });
      toast({
        title: "Permessi salvati",
        description: "I permessi sono stati aggiornati con successo.",
      });
    },
    onError: () => {
      toast({
        title: "Errore",
        description: "Errore durante il salvataggio dei permessi",
        variant: "destructive",
      });
    },
  });

  // Delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      // Delete permissions first
      await supabase.from("staff_permissions").delete().eq("user_id", userId);
      // Delete role
      await supabase.from("user_roles").delete().eq("user_id", userId);
      // Delete profile
      const { error } = await supabase.from("profiles").delete().eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-users"] });
      toast({
        title: "Utente eliminato",
        description: "L'utente è stato rimosso.",
      });
    },
    onError: () => {
      toast({
        title: "Errore",
        description: "Impossibile eliminare l'utente.",
        variant: "destructive",
      });
    },
  });

  // Helper to summarize permissions
  const getPermissionsSummary = (permissions: StaffPermissions | null): string => {
    if (!permissions) return "Nessun permesso";
    
    const labels: string[] = [];
    if (permissions.can_view_dashboard) labels.push("Dashboard");
    if (permissions.can_view_orders) labels.push("Ordini");
    if (permissions.can_view_warehouse) labels.push("Magazzino");
    if (permissions.can_view_calendar) labels.push("Calendario");
    if (permissions.can_view_customers) labels.push("Clienti");
    if (permissions.can_view_employees) labels.push("Dipendenti");
    if (permissions.can_view_tickets) labels.push("Assistenza");
    if (permissions.can_view_forecast) labels.push("Previsionale");
    if (permissions.can_view_settings) labels.push("Impostazioni");
    
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
              Utenti Staff
            </CardTitle>
            <CardDescription>
              Gestisci gli accessi del tuo team
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
        ) : staffUsers.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground border rounded-lg">
            <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Nessun utente staff creato.</p>
            <p className="text-sm">Crea il primo utente per dare accesso al tuo team.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Permessi</TableHead>
                <TableHead className="text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {staffUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">
                    {user.first_name} {user.last_name}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {user.email}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-normal">
                      {getPermissionsSummary(user.permissions)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setPermissionsUser(user)}
                        title="Gestisci permessi"
                      >
                        <Shield className="h-4 w-4" />
                      </Button>
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
                              L'utente {user.first_name} {user.last_name} non potrà più accedere al sistema.
                              Questa azione è irreversibile.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Annulla</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteUserMutation.mutate(user.id)}
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
