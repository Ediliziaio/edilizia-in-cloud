import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users, Plus, Shield, Trash2, Loader2, ShieldCheck, Search, MoreHorizontal, KeyRound, UserX, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { StaffUserDialog, StaffUserFormData } from "@/components/users/StaffUserDialog";
import { StaffPermissions } from "@/components/users/PermissionsDialog";

interface CompanyUser {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  role: "company_admin" | "company_staff";
  permissions: StaffPermissions | null;
}

export function UsersConfig() {
  const { user, effectiveCompany } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const effectiveCompanyId = effectiveCompany?.id;

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  const { data: companyUsers = [], isLoading } = useQuery({
    queryKey: ["company-users", effectiveCompanyId],
    queryFn: async () => {
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email, phone")
        .eq("company_id", effectiveCompanyId!);

      if (profilesError) throw profilesError;

      const userIds = profiles.map((p) => p.id);
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", userIds);

      const companyRoles = roles?.filter(
        (r) => (r.role === "company_admin" || r.role === "company_staff") && r.user_id !== user?.id
      ) || [];

      if (companyRoles.length === 0) return [];

      const staffUserIds = companyRoles.filter((r) => r.role === "company_staff").map((r) => r.user_id);

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

      if (data.role_type === "company_staff" && data.permissions && response.data?.user_id) {
        const { only_assigned, ...permFields } = data.permissions;
        // Sync legacy marketing fields based on granular permissions
        const hasAnyMarketingView = permFields.can_view_marketing_dashboard || permFields.can_view_marketing_contacts ||
          permFields.can_view_marketing_opportunities || permFields.can_view_marketing_activities ||
          permFields.can_view_marketing_appointments || permFields.can_view_marketing_automations ||
          permFields.can_view_marketing_ai_agent || permFields.can_view_marketing_email ||
          permFields.can_view_marketing_whatsapp || permFields.can_view_marketing_reports;
        const hasAnyMarketingEdit = permFields.can_edit_marketing_contacts || permFields.can_edit_marketing_opportunities;
        permFields.can_view_marketing = hasAnyMarketingView || permFields.can_view_marketing;
        permFields.can_edit_marketing = hasAnyMarketingEdit || permFields.can_edit_marketing;
        await supabase
          .from("staff_permissions")
          .update({ ...permFields, only_assigned: only_assigned || false })
          .eq("user_id", response.data.user_id);
      }

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

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      // Call edge function to also delete from auth.users
      const { data, error: fnError } = await supabase.functions.invoke("delete-company-user", {
        body: { userId },
      });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
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
    if (u.permissions.can_view_cruscotto) labels.push("Cruscotto");
    if (u.permissions.can_view_dashboard) labels.push("Dashboard");
    if (u.permissions.can_view_orders) labels.push("Ordini");
    if (u.permissions.can_view_warehouse) labels.push("Magazzino");
    if (u.permissions.can_view_calendar) labels.push("Calendario");
    if (u.permissions.can_view_customers) labels.push("Clienti");
    if (u.permissions.can_view_employees) labels.push("Dipendenti");
    if (u.permissions.can_view_tickets) labels.push("Assistenza");
    if (u.permissions.can_view_forecast) labels.push("Previsionale");
    if (u.permissions.can_view_settings) labels.push("Impostazioni");
    // Check granular marketing permissions instead of legacy field
    const hasAnyMarketing = u.permissions.can_view_marketing_dashboard || u.permissions.can_view_marketing_contacts ||
      u.permissions.can_view_marketing_opportunities || u.permissions.can_view_marketing_activities ||
      u.permissions.can_view_marketing_appointments || u.permissions.can_view_marketing_automations ||
      u.permissions.can_view_marketing_ai_agent || u.permissions.can_view_marketing_email ||
      u.permissions.can_view_marketing_whatsapp || u.permissions.can_view_marketing_reports ||
      u.permissions.can_view_marketing;
    if (hasAnyMarketing) labels.push("Marketing");
    
    if (labels.length === 0) return "Nessun permesso";
    if (labels.length > 3) return `${labels.slice(0, 3).join(", ")} +${labels.length - 3}`;
    return labels.join(", ");
  };

  const getInitials = (firstName: string, lastName: string) =>
    `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();

  const filteredUsers = companyUsers.filter((u) => {
    const matchesSearch = searchQuery === "" || 
      `${u.first_name} ${u.last_name} ${u.email}`.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === "all" || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

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

        {/* Filters */}
        <div className="flex items-center gap-3 mt-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cerca per nome o email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filtra per ruolo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti i ruoli</SelectItem>
              <SelectItem value="company_admin">Amministratori</SelectItem>
              <SelectItem value="company_staff">Operatori</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground border rounded-lg">
            <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>{companyUsers.length === 0 ? "Nessun altro utente creato." : "Nessun utente trovato con i filtri selezionati."}</p>
            {companyUsers.length === 0 && (
              <p className="text-sm">Crea il primo utente per dare accesso al tuo team.</p>
            )}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12"></TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Telefono</TableHead>
                <TableHead>Ruolo</TableHead>
                <TableHead>Permessi</TableHead>
                <TableHead className="text-right w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.map((u) => (
                <TableRow
                  key={u.id}
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => navigate(`/azienda/impostazioni/utenti/${u.id}`)}
                >
                  <TableCell>
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs bg-primary/10 text-primary">
                        {getInitials(u.first_name, u.last_name)}
                      </AvatarFallback>
                    </Avatar>
                  </TableCell>
                  <TableCell className="font-medium">
                    {u.first_name} {u.last_name}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {u.email}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {u.phone || "—"}
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
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => navigate(`/azienda/impostazioni/utenti/${u.id}`)}>
                          <Shield className="h-4 w-4 mr-2" />
                          Gestisci
                        </DropdownMenuItem>
                        {u.role === "company_staff" && (
                          <DropdownMenuItem onClick={() => navigate(`/azienda/impostazioni/utenti/${u.id}?tab=permissions`)}>
                            <Shield className="h-4 w-4 mr-2" />
                            Permessi
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive">
                              <Trash2 className="h-4 w-4 mr-2" />
                              Elimina
                            </DropdownMenuItem>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Eliminare l'utente?</AlertDialogTitle>
                              <AlertDialogDescription>
                                L'utente {u.first_name} {u.last_name} non potrà più accedere al sistema. Questa azione è irreversibile.
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
                      </DropdownMenuContent>
                    </DropdownMenu>
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
    </Card>
  );
}
