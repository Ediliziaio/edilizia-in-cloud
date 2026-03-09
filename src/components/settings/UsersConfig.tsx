import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users, Plus, Shield, Trash2, Loader2, ShieldCheck, Search, MoreHorizontal, Lock, LockOpen, UserCheck, Phone, TrendingUp, Clock, Wifi, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
import { CreateUserWizard, type WizardUserFormData } from "@/components/users/CreateUserWizard";
import { StaffPermissions } from "@/components/users/PermissionsDialog";

type EffectiveRole = "company_admin" | "company_staff" | "salesperson" | "call_center";

interface CompanyUser {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  effectiveRole: EffectiveRole;
  permissions: StaffPermissions | null;
  last_login_at: string | null;
  locked_until: string | null;
  failed_login_count: number;
  active_sessions: number;
}

// --- KPI Card Component ---
function KpiCard({ icon: Icon, label, count, variant = "default" }: {
  icon: React.ElementType;
  label: string;
  count: number;
  variant?: "default" | "primary" | "secondary" | "warning" | "info";
}) {
  const variantStyles = {
    default: "bg-card border",
    primary: "bg-primary/5 border-primary/20",
    secondary: "bg-secondary border-secondary/50",
    warning: "bg-orange-500/5 border-orange-500/20",
    info: "bg-blue-500/5 border-blue-500/20",
  };
  const iconStyles = {
    default: "text-muted-foreground",
    primary: "text-primary",
    secondary: "text-muted-foreground",
    warning: "text-orange-600",
    info: "text-blue-600",
  };

  return (
    <div className={`rounded-lg border p-4 flex items-center gap-3 ${variantStyles[variant]}`}>
      <div className={`rounded-full p-2 ${variant === "primary" ? "bg-primary/10" : variant === "warning" ? "bg-orange-500/10" : variant === "info" ? "bg-blue-500/10" : "bg-muted"}`}>
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
  if (u.effectiveRole === "company_admin") {
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

// --- Role Badge ---
function RoleBadge({ role, onlyAssigned }: { role: EffectiveRole; onlyAssigned?: boolean }) {
  const config: Record<EffectiveRole, { label: string; icon: React.ElementType; className: string }> = {
    company_admin: { label: "Admin", icon: ShieldCheck, className: "bg-primary/10 text-primary border-primary/20" },
    company_staff: { label: "Operatore", icon: UserCheck, className: "bg-secondary text-secondary-foreground" },
    salesperson: { label: "Venditore", icon: TrendingUp, className: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20" },
    call_center: { label: "Call Center", icon: Phone, className: "bg-blue-500/10 text-blue-700 border-blue-500/20" },
  };

  const { label, icon: Icon, className } = config[role];

  return (
    <div className="flex flex-col gap-0.5">
      <Badge className={`w-fit ${className}`}>
        <Icon className="h-3 w-3 mr-1" />
        {label}
      </Badge>
      {onlyAssigned && (
        <span className="text-[10px] text-orange-600 flex items-center gap-0.5 mt-0.5">
          <Lock className="h-2.5 w-2.5" />
          Solo assegnati
        </span>
      )}
    </div>
  );
}

// --- Security Status ---
function SecurityStatus({ u }: { u: CompanyUser }) {
  const isLocked = u.locked_until && new Date(u.locked_until) > new Date();

  return (
    <TooltipProvider>
      <div className="flex items-center gap-1.5">
        {/* Active sessions indicator */}
        {u.active_sessions > 0 && (
          <Tooltip>
            <TooltipTrigger>
              <span className="flex items-center gap-0.5 text-emerald-600">
                <Wifi className="h-3 w-3" />
                <span className="text-[11px]">{u.active_sessions}</span>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {u.active_sessions} sessione/i attiva/e
            </TooltipContent>
          </Tooltip>
        )}

        {/* Locked indicator */}
        {isLocked && (
          <Tooltip>
            <TooltipTrigger>
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                <Lock className="h-2.5 w-2.5 mr-0.5" />
                Bloccato
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              Bloccato fino a {new Date(u.locked_until!).toLocaleString("it-IT")}
            </TooltipContent>
          </Tooltip>
        )}

        {/* Failed attempts warning */}
        {!isLocked && u.failed_login_count > 0 && (
          <Tooltip>
            <TooltipTrigger>
              <span className="flex items-center gap-0.5 text-orange-500">
                <AlertTriangle className="h-3 w-3" />
                <span className="text-[11px]">{u.failed_login_count}</span>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {u.failed_login_count} tentativi falliti
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}

function determineEffectiveRole(roles: string[]): EffectiveRole {
  if (roles.includes("company_admin")) return "company_admin";
  if (roles.includes("salesperson")) return "salesperson";
  if (roles.includes("call_center")) return "call_center";
  return "company_staff";
}

export function UsersConfig() {
  const { user, effectiveCompany } = useAuth();
  
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const effectiveCompanyId = effectiveCompany?.id;

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: companyUsers = [], isLoading } = useQuery({
    queryKey: ["company-users", effectiveCompanyId],
    queryFn: async () => {
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email, phone, last_login_at, locked_until, failed_login_count")
        .eq("company_id", effectiveCompanyId!);

      if (profilesError) throw profilesError;

      const userIds = profiles.map((p) => p.id);
      
      // Fetch roles and active sessions in parallel
      const [rolesRes, sessionsRes, permsRes] = await Promise.all([
        supabase.from("user_roles").select("user_id, role").in("user_id", userIds),
        supabase.from("user_sessions").select("user_id").eq("company_id", effectiveCompanyId!).eq("is_active", true),
        supabase.from("staff_permissions").select("*").in("user_id", userIds),
      ]);

      // Group roles by user
      const rolesByUser: Record<string, string[]> = {};
      rolesRes.data?.forEach((r) => {
        if (!rolesByUser[r.user_id]) rolesByUser[r.user_id] = [];
        rolesByUser[r.user_id].push(r.role);
      });

      // Count active sessions per user
      const sessionsByUser: Record<string, number> = {};
      sessionsRes.data?.forEach((s) => {
        sessionsByUser[s.user_id] = (sessionsByUser[s.user_id] || 0) + 1;
      });

      // Permissions map
      const permissionsMap: Record<string, any> = {};
      permsRes.data?.forEach((p) => { permissionsMap[p.user_id] = p; });

      // Filter to only company-relevant users
      const companyUserIds = Object.entries(rolesByUser)
        .filter(([, userRoles]) =>
          userRoles.some((r) => ["company_admin", "company_staff", "salesperson", "call_center"].includes(r))
        )
        .map(([uid]) => uid);

      if (companyUserIds.length === 0) return [];

      const result: CompanyUser[] = companyUserIds.map((uid) => {
        const profile = profiles.find((p) => p.id === uid)!;
        return {
          ...profile,
          effectiveRole: determineEffectiveRole(rolesByUser[uid] || []),
          permissions: permissionsMap[uid] || null,
          active_sessions: sessionsByUser[uid] || 0,
        };
      });

      return result;
    },
    enabled: !!effectiveCompanyId,
    staleTime: 5 * 60 * 1000,
  });

  // --- KPI calculations ---
  const totalUsers = companyUsers.length;
  const adminCount = companyUsers.filter((u) => u.effectiveRole === "company_admin").length;
  const staffCount = companyUsers.filter((u) => u.effectiveRole === "company_staff").length;
  const salespersonCount = companyUsers.filter((u) => u.effectiveRole === "salesperson").length;
  const callCenterCount = companyUsers.filter((u) => u.effectiveRole === "call_center").length;

  const handleCreateUser = async (data: WizardUserFormData): Promise<{ temporaryPassword?: string }> => {
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

      // Update permissions for roles that use staff_permissions
      const rolesWithPermissions = ["company_staff", "salesperson", "call_center"];
      if (rolesWithPermissions.includes(data.role_type) && data.permissions && response.data?.user_id) {
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

      // Audit log
      if (effectiveCompanyId) {
        await supabase.from("user_audit_log").insert({
          company_id: effectiveCompanyId,
          actor_id: user!.id,
          target_user_id: response.data.user_id,
          action: "user_created",
          details: { role: data.role_type, email: data.email },
        });
      }

      queryClient.invalidateQueries({ queryKey: ["company-users"] });

      const roleLabels: Record<string, string> = {
        company_admin: "Amministratore",
        company_staff: "Operatore",
        salesperson: "Venditore",
        call_center: "Call Center",
      };

      toast.success("Utente creato", {
        description: `${data.first_name} ${data.last_name} è stato creato come ${roleLabels[data.role_type] || "Operatore"}.`,
      });

      return { temporaryPassword: response.data.temporary_password };
    } catch (error: any) {
      toast.error("Errore", {
        description: error.message || "Errore durante la creazione dell'utente",
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
      toast.success("Utente eliminato", { description: "L'utente è stato rimosso." });
    },
    onError: () => {
      toast.error("Errore", { description: "Impossibile eliminare l'utente." });
    },
  });

  const unlockAccountMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("profiles")
        .update({ locked_until: null, failed_login_count: 0 } as never)
        .eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-users"] });
      toast.success("Account sbloccato");
    },
    onError: () => {
      toast.error("Errore nello sblocco dell'account");
    },
  });

  const getInitials = (firstName: string, lastName: string) =>
    `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();

  const filteredUsers = companyUsers.filter((u) => {
    const matchesSearch = searchQuery === "" ||
      `${u.first_name} ${u.last_name} ${u.email}`.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === "all" || u.effectiveRole === roleFilter;
    return matchesSearch && matchesRole;
  });

  const isCurrentUser = (userId: string) => userId === user?.id;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard icon={Users} label="Totale Utenti" count={totalUsers} />
        <KpiCard icon={ShieldCheck} label="Amministratori" count={adminCount} variant="primary" />
        <KpiCard icon={UserCheck} label="Operatori" count={staffCount} variant="secondary" />
        <KpiCard icon={TrendingUp} label="Venditori" count={salespersonCount} variant="warning" />
        <KpiCard icon={Phone} label="Call Center" count={callCenterCount} variant="info" />
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
                Gestisci gli accessi del tuo team
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
                <SelectItem value="salesperson">Venditori</SelectItem>
                <SelectItem value="call_center">Call Center</SelectItem>
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
                  ? "Aggiungi amministratori, operatori, venditori o call center per dare accesso al tuo team."
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
                  <TableHead>Ultimo accesso</TableHead>
                  <TableHead>Stato</TableHead>
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
                      <RoleBadge
                        role={u.effectiveRole}
                        onlyAssigned={u.effectiveRole !== "company_admin" && u.permissions?.only_assigned === true}
                      />
                    </TableCell>
                    <TableCell>
                      <PermissionBadges u={u} />
                    </TableCell>
                    <TableCell>
                      {u.last_login_at ? (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatDistanceToNow(new Date(u.last_login_at), { addSuffix: true, locale: it })}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              {new Date(u.last_login_at).toLocaleString("it-IT")}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">Mai</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <SecurityStatus u={u} />
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
                            {u.effectiveRole !== "company_admin" && (
                              <DropdownMenuItem onClick={() => navigate(`/azienda/impostazioni/utenti/${u.id}?tab=permissions`)}>
                                <Shield className="h-4 w-4 mr-2" />
                                Permessi
                              </DropdownMenuItem>
                            )}
                            {(u.locked_until && new Date(u.locked_until) > new Date()) || u.failed_login_count > 0 ? (
                              <DropdownMenuItem onClick={() => unlockAccountMutation.mutate(u.id)}>
                                <LockOpen className="h-4 w-4 mr-2" />
                                Sblocca account
                              </DropdownMenuItem>
                            ) : null}
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

        <CreateUserWizard
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          onSubmit={handleCreateUser}
          isLoading={isCreating}
        />
      </Card>
    </div>
  );
}
