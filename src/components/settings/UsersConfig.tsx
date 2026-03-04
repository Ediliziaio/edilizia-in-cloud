import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users, Plus, Shield, Trash2, Loader2, ShieldCheck, Search, MoreHorizontal, Lock, UserCheck } from "lucide-react";
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

// --- KPI Card Component ---
function KpiCard({ icon: Icon, label, count, variant = "default" }: {
  icon: React.ElementType;
  label: string;
  count: number;
  variant?: "default" | "primary" | "secondary" | "warning";
}) {
  const variantStyles = {
    default: "bg-card border",
    primary: "bg-primary/5 border-primary/20",
    secondary: "bg-secondary border-secondary/50",
    warning: "bg-orange-500/5 border-orange-500/20",
  };
  const iconStyles = {
    default: "text-muted-foreground",
    primary: "text-primary",
    secondary: "text-muted-foreground",
    warning: "text-orange-600",
  };

  return (
    <div className={`rounded-lg border p-4 flex items-center gap-3 ${variantStyles[variant]}`}>
      <div className={`rounded-full p-2 ${variant === "primary" ? "bg-primary/10" : variant === "warning" ? "bg-orange-500/10" : "bg-muted"}`}>
        <Icon className={`h-4 w-4 ${iconStyles[variant]}`} />
      </div>
      <div>
        <p className="text-2xl font-bold leading-none">{count}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      </div>
    </div>
  );
}

// --- Permission Badges ---
function PermissionBadges({ u }: { u: CompanyUser }) {
  if (u.role === "company_admin") {
    return (
      <Badge className="bg-primary/10 text-primary border-primary/20">
        <ShieldCheck className="h-3 w-3 mr-1" />
        Accesso completo
      </Badge>
    );
  }

  if (!u.permissions) {
    return <span className="text-xs text-muted-foreground italic">Nessun permesso</span>;
  }

  const internalLabels: string[] = [];
  const marketingLabels: string[] = [];

  if (u.permissions.can_view_cruscotto) internalLabels.push("Cruscotto");
  if (u.permissions.can_view_dashboard) internalLabels.push("Dashboard");
  if (u.permissions.can_view_orders) internalLabels.push("Ordini");
  if (u.permissions.can_view_warehouse) internalLabels.push("Magazzino");
  if (u.permissions.can_view_calendar) internalLabels.push("Calendario");
  if (u.permissions.can_view_customers) internalLabels.push("Clienti");
  if (u.permissions.can_view_employees) internalLabels.push("Dipendenti");
  if (u.permissions.can_view_tickets) internalLabels.push("Assistenza");
  if (u.permissions.can_view_forecast) internalLabels.push("Previsionale");
  if (u.permissions.can_view_settings) internalLabels.push("Impostazioni");

  const hasAnyMarketing = u.permissions.can_view_marketing_dashboard || u.permissions.can_view_marketing_contacts ||
    u.permissions.can_view_marketing_opportunities || u.permissions.can_view_marketing_activities ||
    u.permissions.can_view_marketing_appointments || u.permissions.can_view_marketing_automations ||
    u.permissions.can_view_marketing_ai_agent || u.permissions.can_view_marketing_email ||
    u.permissions.can_view_marketing_whatsapp || u.permissions.can_view_marketing_reports ||
    u.permissions.can_view_marketing;
  if (hasAnyMarketing) marketingLabels.push("Marketing");

  const allLabels = [...internalLabels, ...marketingLabels];
  if (allLabels.length === 0) {
    return <span className="text-xs text-muted-foreground italic">Nessun permesso</span>;
  }

  const visible = allLabels.slice(0, 3);
  const remaining = allLabels.length - visible.length;

  return (
    <div className="flex flex-wrap gap-1">
      {visible.map((label) => (
        <Badge key={label} variant="outline" className="text-[11px] font-normal px-1.5 py-0">
          {label}
        </Badge>
      ))}
      {remaining > 0 && (
        <Badge variant="secondary" className="text-[11px] font-normal px-1.5 py-0">
          +{remaining}
        </Badge>
      )}
    </div>
  );
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

  // Include current user in the list (no longer excluding user?.id)
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
        (r) => r.role === "company_admin" || r.role === "company_staff"
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

  // --- KPI calculations ---
  const totalUsers = companyUsers.length;
  const adminCount = companyUsers.filter((u) => u.role === "company_admin").length;
  const staffCount = companyUsers.filter((u) => u.role === "company_staff").length;
  const limitedCount = companyUsers.filter(
    (u) => u.role === "company_staff" && u.permissions?.only_assigned === true
  ).length;

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

  const getInitials = (firstName: string, lastName: string) =>
    `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();

  const filteredUsers = companyUsers.filter((u) => {
    const matchesSearch = searchQuery === "" || 
      `${u.first_name} ${u.last_name} ${u.email}`.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === "all" || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const isCurrentUser = (userId: string) => userId === user?.id;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={Users} label="Totale Utenti" count={totalUsers} />
        <KpiCard icon={ShieldCheck} label="Amministratori" count={adminCount} variant="primary" />
        <KpiCard icon={UserCheck} label="Operatori" count={staffCount} variant="secondary" />
        <KpiCard icon={Lock} label="Accesso limitato" count={limitedCount} variant="warning" />
      </div>

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
            <div className="p-8 text-center text-muted-foreground border rounded-lg border-dashed">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-40" />
              <p className="font-medium">
                {companyUsers.length === 0
                  ? "Nessun utente nel team"
                  : "Nessun risultato per i filtri selezionati"}
              </p>
              <p className="text-sm mt-1">
                {companyUsers.length === 0
                  ? "Aggiungi amministratori o operatori per dare accesso al tuo team."
                  : "Prova a modificare la ricerca o il filtro ruolo."}
              </p>
              {companyUsers.length === 0 && (
                <Button variant="outline" size="sm" className="mt-4" onClick={() => setCreateDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Crea il primo utente
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12"></TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
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
                    onClick={() => !isCurrentUser(u.id) && navigate(`/azienda/impostazioni/utenti/${u.id}`)}
                  >
                    <TableCell>
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs bg-primary/10 text-primary">
                          {getInitials(u.first_name, u.last_name)}
                        </AvatarFallback>
                      </Avatar>
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {u.first_name} {u.last_name}
                        {isCurrentUser(u.id) && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Tu</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {u.email}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        {u.role === "company_admin" ? (
                          <Badge className="bg-primary/10 text-primary border-primary/20 w-fit">
                            <ShieldCheck className="h-3 w-3 mr-1" />
                            Admin
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="w-fit">Operatore</Badge>
                        )}
                        {u.role === "company_staff" && u.permissions?.only_assigned && (
                          <span className="text-[10px] text-orange-600 flex items-center gap-0.5 mt-0.5">
                            <Lock className="h-2.5 w-2.5" />
                            Solo assegnati
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <PermissionBadges u={u} />
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      {!isCurrentUser(u.id) && (
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
                      )}
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
    </div>
  );
}
