import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users, Plus, Shield, ShieldOff, Trash2, Loader2, ShieldCheck, Search,
  MoreHorizontal, Lock, LockOpen, UserCheck, Phone, TrendingUp,
  Clock, Wifi, AlertTriangle, Download, Upload, CheckSquare,
  HardHat, Building2, ArrowRightLeft,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { logger } from "@/utils/logger";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CreateUserWizard, type WizardUserFormData } from "@/components/users/CreateUserWizard";
import { StaffPermissions } from "@/components/users/PermissionsDialog";
import { syncLegacySettingsFlags } from "@/components/users/permissionsDefaults";

type EffectiveRole = "company_admin" | "company_staff" | "salesperson" | "call_center" | "employee" | "subcontractor";

interface CompanyUser {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  effectiveRole: EffectiveRole;
  /**
   * Tutti i ruoli assegnati (multi-ruolo supportato).
   * Esempio: un operatore d'ufficio può avere `["company_staff", "salesperson"]`
   * così compare anche nel calendario CRM e nei dropdown venditori.
   */
  allRoles: string[];
  permissions: StaffPermissions | null;
  last_login_at: string | null;
  locked_until: string | null;
  failed_login_count: number;
  active_sessions: number;
  is_blocked: boolean;
}

// ─── Role Config ──────────────────────────────────────────────────────
const ROLE_CONFIG: Record<EffectiveRole, { label: string; icon: React.ElementType; color: string }> = {
  company_admin: { label: "Admin", icon: ShieldCheck, color: "bg-primary/10 text-primary border-primary/20" },
  company_staff: { label: "Operatore", icon: UserCheck, color: "bg-slate-100 text-slate-700 border-slate-200" },
  salesperson: { label: "Venditore", icon: TrendingUp, color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  call_center: { label: "Call Center", icon: Phone, color: "bg-blue-50 text-blue-700 border-blue-200" },
  employee: { label: "Operaio", icon: HardHat, color: "bg-amber-50 text-amber-700 border-amber-200" },
  subcontractor: { label: "Subappaltatore", icon: Building2, color: "bg-purple-50 text-purple-700 border-purple-200" },
};

function RoleBadge({ role }: { role: EffectiveRole }) {
  const { label, icon: Icon, color } = ROLE_CONFIG[role];
  return (
    <Badge className={`${color} font-normal gap-1`}>
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}

/**
 * Mostra TUTTI i ruoli dell'utente (primary + secondari).
 * Utile per capire subito se un operatore ha anche ruolo commerciale.
 */
function RolesBadgeGroup({ roles }: { roles: string[] }) {
  const primary = determineEffectiveRole(roles);
  const extras: EffectiveRole[] = [];
  // Marca il ruolo commerciale come "extra" se non è già il primary
  if (primary !== "salesperson" && roles.includes("salesperson")) extras.push("salesperson");
  if (primary !== "call_center" && roles.includes("call_center")) extras.push("call_center");
  return (
    <div className="flex items-center gap-1 flex-wrap">
      <RoleBadge role={primary} />
      {extras.map((r) => {
        const cfg = ROLE_CONFIG[r];
        if (!cfg) return null;
        const Icon = cfg.icon;
        return (
          <Tooltip key={r}>
            <TooltipTrigger asChild>
              <Badge
                className={`${cfg.color} font-normal gap-1 opacity-90 border-dashed`}
                variant="outline"
              >
                <Icon className="h-3 w-3" />
                {cfg.label}
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              Ruolo aggiuntivo: appare anche nel CRM (calendario, venditori).
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

function UserStatus({ u }: { u: CompanyUser }) {
  const isLocked = u.locked_until && new Date(u.locked_until) > new Date();
  const isOnline = u.active_sessions > 0;

  if (u.is_blocked) {
    return (
      <Badge variant="destructive" className="text-[10px] gap-1 font-normal">
        <Shield className="h-2.5 w-2.5" /> Accesso bloccato
      </Badge>
    );
  }
  if (isLocked) {
    return (
      <Badge variant="outline" className="text-[10px] gap-1 font-normal text-amber-600 border-amber-300 bg-amber-50">
        <Lock className="h-2.5 w-2.5" /> Bloccato temporaneo
      </Badge>
    );
  }
  if (isOnline) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-emerald-600">
        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
        Online
      </span>
    );
  }
  if (u.last_login_at) {
    return (
      <span className="text-xs text-muted-foreground">
        {formatDistanceToNow(new Date(u.last_login_at), { addSuffix: true, locale: it })}
      </span>
    );
  }
  return <span className="text-xs text-muted-foreground italic">Mai connesso</span>;
}

function determineEffectiveRole(roles: string[]): EffectiveRole {
  if (roles.includes("company_admin")) return "company_admin";
  if (roles.includes("salesperson")) return "salesperson";
  if (roles.includes("call_center")) return "call_center";
  if (roles.includes("employee")) return "employee";
  if (roles.includes("worker")) return "employee";
  if (roles.includes("subcontractor")) return "subcontractor";
  return "company_staff";
}

// ─── Delete User Dialog ───────────────────────────────────────────────
function DeleteUserDialog({
  user: targetUser,
  open,
  onOpenChange,
  companyUsers,
  onConfirm,
  isDeleting,
}: {
  user: CompanyUser | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyUsers: CompanyUser[];
  onConfirm: (userId: string, reassignToUserId?: string) => void;
  isDeleting: boolean;
}) {
  const [reassignTo, setReassignTo] = useState<string>("none");

  if (!targetUser) return null;

  const eligibleUsers = companyUsers.filter(
    (u) => u.id !== targetUser.id && u.effectiveRole !== "employee" && u.effectiveRole !== "subcontractor"
  );

  const roleLabel = ROLE_CONFIG[targetUser.effectiveRole]?.label || targetUser.effectiveRole;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="h-5 w-5" />
            Elimina utente
          </DialogTitle>
          <DialogDescription>
            Stai per eliminare <strong>{targetUser.first_name} {targetUser.last_name}</strong> ({roleLabel}).
            L'utente non potr&agrave; pi&ugrave; accedere al sistema.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <p className="font-medium flex items-center gap-1.5 mb-1">
              <AlertTriangle className="h-4 w-4" />
              Dati associati
            </p>
            <p>
              Eventuali ordini, fatture e documenti associati a questo utente rimarranno nel sistema
              ma senza riferimento all'utente eliminato.
            </p>
          </div>

          {eligibleUsers.length > 0 && (
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 text-sm">
                <ArrowRightLeft className="h-3.5 w-3.5" />
                Riassegna i dati a un altro utente (opzionale)
              </Label>
              <Select value={reassignTo} onValueChange={setReassignTo}>
                <SelectTrigger>
                  <SelectValue placeholder="Non riassegnare" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Non riassegnare — lascia senza riferimento</SelectItem>
                  {eligibleUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.first_name} {u.last_name} ({ROLE_CONFIG[u.effectiveRole]?.label})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isDeleting}>
            Annulla
          </Button>
          <Button
            variant="destructive"
            disabled={isDeleting}
            onClick={() => {
              onConfirm(targetUser.id, reassignTo !== "none" ? reassignTo : undefined);
            }}
          >
            {isDeleting ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Eliminazione...</>
            ) : (
              <><Trash2 className="h-4 w-4 mr-2" />Elimina definitivamente</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ───────────────────────────────────────────────────
export function UsersConfig() {
  const { user, effectiveCompany, role } = useAuth();
  const canManageUsers = role === "company_admin" || role === "super_admin";
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const effectiveCompanyId = effectiveCompany?.id;

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CompanyUser | null>(null);

  // ── Teams ───────────────────────────────────────────────────────────
  const { data: teams = [] } = useQuery({
    queryKey: ["teams-filter", effectiveCompanyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teams").select("id, name")
        .eq("company_id", effectiveCompanyId!).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!effectiveCompanyId,
  });

  const { data: teamMemberships = [] } = useQuery({
    queryKey: ["team-memberships-filter", effectiveCompanyId, teams.map(t => t.id)],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_members").select("user_id, team_id")
        .in("team_id", teams.map(t => t.id));
      if (error) throw error;
      return data;
    },
    enabled: teams.length > 0,
  });

  // ── Company Users Query ─────────────────────────────────────────────
  const { data: companyUsers = [], isLoading } = useQuery({
    queryKey: ["company-users", effectiveCompanyId],
    queryFn: async () => {
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email, phone, last_login_at, locked_until, failed_login_count, is_blocked")
        .eq("company_id", effectiveCompanyId!);
      if (profilesError) throw profilesError;

      const userIds = profiles.map((p) => p.id);
      const [rolesRes, sessionsRes, permsRes] = await Promise.all([
        supabase.from("user_roles").select("user_id, role").in("user_id", userIds),
        supabase.from("user_sessions").select("user_id").eq("company_id", effectiveCompanyId!).eq("is_active", true),
        supabase.from("staff_permissions").select("*").in("user_id", userIds),
      ]);
      if (rolesRes.error) throw rolesRes.error;
      if (sessionsRes.error) throw sessionsRes.error;
      if (permsRes.error) throw permsRes.error;

      const rolesByUser: Record<string, string[]> = {};
      rolesRes.data?.forEach((r) => {
        if (!rolesByUser[r.user_id]) rolesByUser[r.user_id] = [];
        rolesByUser[r.user_id].push(r.role);
      });

      const sessionsByUser: Record<string, number> = {};
      sessionsRes.data?.forEach((s) => {
        sessionsByUser[s.user_id] = (sessionsByUser[s.user_id] || 0) + 1;
      });

      const permissionsMap: Record<string, StaffPermissions> = {};
      permsRes.data?.forEach((p) => { permissionsMap[p.user_id] = p as unknown as StaffPermissions; });

      const companyRoles = ["company_admin", "company_staff", "salesperson", "call_center", "employee", "worker", "subcontractor"];
      const companyUserIds = Object.entries(rolesByUser)
        .filter(([, userRoles]) => userRoles.some((r) => companyRoles.includes(r)))
        .map(([uid]) => uid);

      if (companyUserIds.length === 0) return [];

      return companyUserIds.flatMap((uid) => {
        const profile = profiles.find((p) => p.id === uid);
        if (!profile) return [];
        const userRoles = rolesByUser[uid] || [];
        return [{
          ...profile,
          effectiveRole: determineEffectiveRole(userRoles),
          allRoles: userRoles,
          permissions: permissionsMap[uid] || null,
          active_sessions: sessionsByUser[uid] || 0,
          is_blocked: profile.is_blocked ?? false,
        }];
      }) as CompanyUser[];
    },
    enabled: !!effectiveCompanyId,
    staleTime: 5 * 60 * 1000,
  });

  // ── KPI ─────────────────────────────────────────────────────────────
  const roleCounts = companyUsers.reduce((acc, u) => {
    acc[u.effectiveRole] = (acc[u.effectiveRole] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // ── Create User ─────────────────────────────────────────────────────
  const handleCreateUser = async (data: WizardUserFormData): Promise<{ temporaryPassword?: string }> => {
    setIsCreating(true);
    try {
      const response = await supabase.functions.invoke("create-company-staff", {
        body: {
          first_name: data.first_name, last_name: data.last_name,
          email: data.email, company_id: effectiveCompanyId,
          role_type: data.role_type, password: data.password,
        },
      });

      if (response.error) {
        let errorMessage = "Errore durante la creazione dell'utente";
        try {
          const errorBody = await response.error.context?.json?.();
          if (errorBody?.error) errorMessage = errorBody.error;
        } catch {
          if (response.error.message && !response.error.message.includes("non-2xx")) {
            errorMessage = response.error.message;
          }
        }
        throw new Error(errorMessage);
      }
      if (response.data?.error) throw new Error(response.data.error);

      // Update permissions
      const rolesWithPermissions = ["company_staff", "salesperson", "call_center", "employee", "subcontractor"];
      if (rolesWithPermissions.includes(data.role_type) && data.permissions && response.data?.user_id) {
        const synced = syncLegacySettingsFlags(data.permissions);
        const { only_assigned, ...permFields } = synced;
        const hasAnyMarketingView = permFields.can_view_marketing_dashboard || permFields.can_view_marketing_contacts ||
          permFields.can_view_marketing_opportunities || permFields.can_view_marketing_activities ||
          permFields.can_view_marketing_appointments || permFields.can_view_marketing_automations ||
          permFields.can_view_marketing_ai_agent || permFields.can_view_marketing_email ||
          permFields.can_view_marketing_whatsapp || permFields.can_view_marketing_reports;
        const hasAnyMarketingEdit = permFields.can_edit_marketing_contacts || permFields.can_edit_marketing_opportunities;
        permFields.can_view_marketing = hasAnyMarketingView || permFields.can_view_marketing;
        permFields.can_edit_marketing = hasAnyMarketingEdit || permFields.can_edit_marketing;
        const { error: permUpdateError } = await supabase
          .from("staff_permissions")
          .update({ ...permFields, only_assigned: only_assigned || false })
          .eq("user_id", response.data.user_id)
          .eq("company_id", effectiveCompanyId!);
        if (permUpdateError) {
          logger.error("Failed to update permissions:", permUpdateError);
          toast.warning("Utente creato, ma i permessi non sono stati salvati");
        }
      }

      // Create salespeople record for salesperson role
      if (data.role_type === "salesperson" && response.data?.user_id && effectiveCompanyId) {
        const { error: spError } = await supabase.from("salespeople").insert({
          company_id: effectiveCompanyId, user_id: response.data.user_id,
          first_name: data.first_name, last_name: data.last_name,
          email: data.email, commission_type: "percentage_sold",
          commission_value: data.commission_percentage ?? 0,
        });
        if (spError) {
          logger.error("Failed to create salespeople record:", spError);
          toast.warning("Utente creato, ma il profilo venditore non è stato creato");
        }
      }

      // Audit log
      if (effectiveCompanyId) {
        await supabase.from("user_audit_log").insert({
          company_id: effectiveCompanyId, actor_id: user!.id,
          target_user_id: response.data.user_id, action: "user_created",
          details: { role: data.role_type, email: data.email, commission_percentage: data.commission_percentage },
        });
      }

      // Invalidate all related queries
      queryClient.invalidateQueries({ queryKey: ["company-users"] });
      queryClient.invalidateQueries({ queryKey: ["salespeople"] });
      queryClient.invalidateQueries({ queryKey: ["sub-campo-list"] });

      const roleLabels: Record<string, string> = {
        company_admin: "Amministratore", company_staff: "Operatore",
        salesperson: "Venditore", call_center: "Call Center",
        employee: "Operaio", subcontractor: "Subappaltatore",
      };
      toast.success("Utente creato", {
        description: `${data.first_name} ${data.last_name} — ${roleLabels[data.role_type] || "Operatore"}`,
      });

      return { temporaryPassword: response.data.temporary_password };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Errore durante la creazione";
      toast.error(message);
      throw error;
    } finally {
      setIsCreating(false);
    }
  };

  // ── Delete User ─────────────────────────────────────────────────────
  const deleteUserMutation = useMutation({
    mutationFn: async ({ userId, reassignToUserId }: { userId: string; reassignToUserId?: string }) => {
      const { data, error: fnError } = await supabase.functions.invoke("delete-company-user", {
        body: { userId, reassignToUserId },
      });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-users"] });
      queryClient.invalidateQueries({ queryKey: ["salespeople"] });
      queryClient.invalidateQueries({ queryKey: ["sub-campo-list"] });
      toast.success("Utente eliminato con successo");
      setDeleteTarget(null);
      setSelectedUsers(new Set());
    },
    onError: (e: Error) => {
      toast.error(e.message || "Errore durante l'eliminazione");
    },
  });

  const unlockAccountMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("profiles")
        .update({ locked_until: null, failed_login_count: 0 } as never)
        .eq("id", userId).eq("company_id", effectiveCompanyId!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-users"] });
      toast.success("Account sbloccato");
    },
    onError: () => toast.error("Errore nello sblocco"),
  });

  const blockAccessMutation = useMutation({
    mutationFn: async ({ userId, block }: { userId: string; block: boolean }) => {
      const { error } = await supabase
        .from("profiles")
        .update({
          is_blocked: block,
          blocked_at: block ? new Date().toISOString() : null,
          blocked_by: block ? user?.id : null,
          block_reason: block ? "Bloccato dall'amministratore" : null,
        } as never)
        .eq("id", userId).eq("company_id", effectiveCompanyId!);
      if (error) throw error;
    },
    onSuccess: (_, { block }) => {
      queryClient.invalidateQueries({ queryKey: ["company-users"] });
      toast.success(block ? "Accesso bloccato" : "Accesso ripristinato");
    },
    onError: () => toast.error("Errore nel cambio stato accesso"),
  });

  // ── Toggle ruolo secondario (salesperson/call_center) ──────────────
  // Permette a un utente con primary role "operatore ufficio" di avere
  // ANCHE il ruolo commerciale così compare nel calendario CRM, dropdown
  // venditori, ecc.
  const toggleSecondaryRoleMutation = useMutation({
    mutationFn: async ({
      userId,
      role,
      add,
      userData,
    }: {
      userId: string;
      role: "salesperson" | "call_center";
      add: boolean;
      userData: { first_name: string; last_name: string; email: string };
    }) => {
      if (add) {
        // Aggiungi ruolo (idempotente: upsert)
        const { error } = await supabase
          .from("user_roles")
          .upsert(
            { user_id: userId, role: role as any },
            { onConflict: "user_id,role", ignoreDuplicates: true }
          );
        if (error) throw error;

        // Se stiamo aggiungendo "salesperson", creiamo anche la riga
        // in tabella salespeople (per provvigioni) se non esiste già
        if (role === "salesperson" && effectiveCompanyId) {
          const { data: existing } = await supabase
            .from("salespeople")
            .select("id")
            .eq("user_id", userId)
            .eq("company_id", effectiveCompanyId)
            .maybeSingle();
          if (!existing) {
            await supabase.from("salespeople").insert({
              company_id: effectiveCompanyId,
              user_id: userId,
              first_name: userData.first_name || "",
              last_name: userData.last_name || "",
              email: userData.email || null,
              is_active: true,
            });
          } else {
            // Riattiva se era stato disattivato
            await supabase
              .from("salespeople")
              .update({ is_active: true })
              .eq("id", existing.id);
          }
        }
      } else {
        // Rimuovi ruolo
        const { error } = await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", userId)
          .eq("role", role as any);
        if (error) throw error;

        // Se rimuoviamo "salesperson" disattiviamo la riga salespeople
        // (non cancelliamo, perché potrebbe avere provvigioni storiche legate)
        if (role === "salesperson" && effectiveCompanyId) {
          await supabase
            .from("salespeople")
            .update({ is_active: false })
            .eq("user_id", userId)
            .eq("company_id", effectiveCompanyId);
        }
      }
    },
    onSuccess: (_, { role, add }) => {
      queryClient.invalidateQueries({ queryKey: ["company-users"] });
      queryClient.invalidateQueries({ queryKey: ["company-staff-users"] });
      queryClient.invalidateQueries({ queryKey: ["salespeople"] });
      const label = role === "salesperson" ? "Venditore" : "Call Center";
      toast.success(
        add
          ? `Ruolo "${label}" aggiunto — ora compare nel CRM`
          : `Ruolo "${label}" rimosso`
      );
    },
    onError: (e: Error) => toast.error(`Errore: ${e.message}`),
  });

  // ── Filters ─────────────────────────────────────────────────────────
  const filteredUsers = companyUsers.filter((u) => {
    const matchesSearch = searchQuery === "" ||
      `${u.first_name} ${u.last_name} ${u.email}`.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === "all" || u.effectiveRole === roleFilter;
    return matchesSearch && matchesRole;
  });

  const isCurrentUser = (userId: string) => userId === user?.id;
  const getInitials = (fn: string, ln: string) => `${fn.charAt(0)}${ln.charAt(0)}`.toUpperCase();

  // ── Bulk Actions ────────────────────────────────────────────────────
  const toggleSelectUser = (userId: string) => {
    setSelectedUsers(prev => {
      const next = new Set(prev);
      next.has(userId) ? next.delete(userId) : next.add(userId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const selectableIds = filteredUsers.filter(u => !isCurrentUser(u.id)).map(u => u.id);
    setSelectedUsers(prev => prev.size === selectableIds.length ? new Set() : new Set(selectableIds));
  };

  const handleBulkDelete = async () => {
    setBulkActionLoading(true);
    let deleted = 0;
    for (const uid of Array.from(selectedUsers)) {
      try {
        const { data, error } = await supabase.functions.invoke("delete-company-user", { body: { userId: uid } });
        if (!error && !data?.error) deleted++;
      } catch { /* skip */ }
    }
    queryClient.invalidateQueries({ queryKey: ["company-users"] });
    queryClient.invalidateQueries({ queryKey: ["salespeople"] });
    queryClient.invalidateQueries({ queryKey: ["sub-campo-list"] });
    toast.success(`${deleted} utente/i eliminato/i`);
    setSelectedUsers(new Set());
    setBulkActionLoading(false);
  };

  // ── CSV Export ──────────────────────────────────────────────────────
  const handleExportCSV = () => {
    const headers = ["Nome", "Cognome", "Email", "Telefono", "Ruolo", "Ultimo Accesso"];
    const rows = filteredUsers.map((u) => [
      u.first_name, u.last_name, u.email, u.phone || "",
      ROLE_CONFIG[u.effectiveRole]?.label || u.effectiveRole,
      u.last_login_at ? new Date(u.last_login_at).toLocaleString("it-IT") : "Mai",
    ]);
    const csvContent = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `utenti_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Export completato");
  };

  // ── CSV Import ─────────────────────────────────────────────────────
  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.split("\n").filter((l) => l.trim());
    if (lines.length < 2) { toast.error("File CSV vuoto o non valido"); return; }

    const dataRows = lines.slice(1);
    let imported = 0;
    const failedRows: { row: number; email: string; reason: string }[] = [];
    const roleMap: Record<string, string> = {
      amministratore: "company_admin", operatore: "company_staff",
      venditore: "salesperson", "call center": "call_center",
      operaio: "employee", subappaltatore: "subcontractor",
    };

    for (let i = 0; i < dataRows.length; i++) {
      const cols = dataRows[i].split(",").map((c) => c.replace(/^"|"$/g, "").trim());
      const [firstName, lastName, email, , roleLabel] = cols;
      if (!firstName || !lastName || !email) {
        failedRows.push({ row: i + 2, email: email || "—", reason: "Campi obbligatori mancanti" });
        continue;
      }
      const roleType = roleMap[(roleLabel || "").toLowerCase()] || "company_staff";
      try {
        const { data: fnData, error: fnError } = await supabase.functions.invoke("create-company-staff", {
          body: { first_name: firstName, last_name: lastName, email, company_id: effectiveCompanyId, role_type: roleType },
        });
        if (fnError) throw fnError;
        if (fnData?.error) throw new Error(fnData.error);
        imported++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : undefined;
        failedRows.push({ row: i + 2, email, reason: msg?.includes("esiste già") ? "Email già in uso" : msg || "Errore" });
      }
    }
    queryClient.invalidateQueries({ queryKey: ["company-users"] });
    if (imported > 0) toast.success(`${imported} utente/i importato/i`);
    if (failedRows.length > 0) {
      const detail = failedRows.slice(0, 5).map((r) => `Riga ${r.row}: ${r.email} — ${r.reason}`).join("\n");
      toast.error(`${failedRows.length} riga/e non importata/e`, { description: detail, duration: 8000 });
    }
    e.target.value = "";
  };

  // ─── RENDER ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* ── Summary Bar ───────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted text-sm font-medium">
          <Users className="h-4 w-4" />
          {companyUsers.length} utenti
        </div>
        {Object.entries(ROLE_CONFIG).map(([key, cfg]) => {
          const count = roleCounts[key] || 0;
          if (count === 0) return null;
          const Icon = cfg.icon;
          return (
            <button
              key={key}
              onClick={() => setRoleFilter(roleFilter === key ? "all" : key)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors cursor-pointer ${
                roleFilter === key ? cfg.color + " ring-1 ring-offset-1" : "bg-card hover:bg-muted"
              }`}
            >
              <Icon className="h-3 w-3" />
              {count} {cfg.label}
            </button>
          );
        })}
      </div>

      {/* ── Main Card ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cerca per nome o email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9"
              />
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <Button onClick={() => setCreateDialogOpen(true)} size="sm">
                <Plus className="h-4 w-4 mr-1.5" />
                Nuovo Utente
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportCSV} title="Esporta CSV">
                <Download className="h-4 w-4" />
              </Button>
              <div className="relative">
                <input type="file" accept=".csv"
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  onChange={handleImportCSV} />
                <Button variant="outline" size="sm" title="Importa CSV">
                  <Upload className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Bulk action toolbar */}
          {selectedUsers.size > 0 && (
            <div className="flex items-center gap-2 mt-3 px-3 py-2 bg-primary/5 border border-primary/20 rounded-lg">
              <CheckSquare className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">{selectedUsers.size} selezionato/i</span>
              <div className="flex items-center gap-1.5 ml-auto">
                {canManageUsers && (
                  <Button size="sm" variant="destructive" disabled={bulkActionLoading} onClick={handleBulkDelete}>
                    {bulkActionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Trash2 className="h-3.5 w-3.5 mr-1" />}
                    Elimina
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => setSelectedUsers(new Set())}>
                  Deseleziona
                </Button>
              </div>
            </div>
          )}
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center p-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">
                {companyUsers.length === 0 ? "Nessun utente" : "Nessun risultato"}
              </p>
              <p className="text-sm mt-1">
                {companyUsers.length === 0
                  ? "Crea il primo utente per iniziare."
                  : "Prova a modificare i filtri."}
              </p>
              {companyUsers.length === 0 && (
                <Button variant="outline" size="sm" className="mt-3" onClick={() => setCreateDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-1.5" /> Crea utente
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 pl-4">
                    <Checkbox
                      checked={filteredUsers.filter(u => !isCurrentUser(u.id)).length > 0 &&
                        selectedUsers.size === filteredUsers.filter(u => !isCurrentUser(u.id)).length}
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead className="min-w-[200px]">Utente</TableHead>
                  <TableHead className="w-[140px]">Ruolo</TableHead>
                  <TableHead className="w-[140px]">Stato</TableHead>
                  <TableHead className="w-12 text-right pr-4"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((u) => (
                  <TableRow
                    key={u.id}
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => !isCurrentUser(u.id) && navigate(`/azienda/impostazioni/utenti/${u.id}`)}
                  >
                    <TableCell className="pl-4" onClick={e => e.stopPropagation()}>
                      {!isCurrentUser(u.id) && (
                        <Checkbox
                          checked={selectedUsers.has(u.id)}
                          onCheckedChange={() => toggleSelectUser(u.id)}
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8 shrink-0">
                          <AvatarFallback className="text-xs bg-primary/10 text-primary">
                            {getInitials(u.first_name, u.last_name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-sm truncate">
                              {u.first_name} {u.last_name}
                            </span>
                            {isCurrentUser(u.id) && (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">Tu</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <RolesBadgeGroup roles={u.allRoles} />
                    </TableCell>
                    <TableCell>
                      <UserStatus u={u} />
                    </TableCell>
                    <TableCell className="text-right pr-4" onClick={(e) => e.stopPropagation()}>
                      {!isCurrentUser(u.id) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => navigate(`/azienda/impostazioni/utenti/${u.id}`)}>
                              <Shield className="h-4 w-4 mr-2" /> Gestisci
                            </DropdownMenuItem>
                            {u.effectiveRole !== "company_admin" && (
                              <DropdownMenuItem onClick={() => navigate(`/azienda/impostazioni/utenti/${u.id}?tab=permissions`)}>
                                <Shield className="h-4 w-4 mr-2" /> Permessi
                              </DropdownMenuItem>
                            )}
                            {/* Toggle ruoli commerciali (multi-role) */}
                            {canManageUsers && u.effectiveRole !== "company_admin" && (
                              <>
                                <DropdownMenuSeparator />
                                {(() => {
                                  const isSalesperson = u.allRoles.includes("salesperson");
                                  const isCallCenter = u.allRoles.includes("call_center");
                                  const isPrimarySales = u.effectiveRole === "salesperson";
                                  const isPrimaryCall = u.effectiveRole === "call_center";
                                  return (
                                    <>
                                      {/* Se ha già salesperson come primary → non mostrare toggle */}
                                      {!isPrimarySales && (
                                        <DropdownMenuItem
                                          onClick={() =>
                                            toggleSecondaryRoleMutation.mutate({
                                              userId: u.id,
                                              role: "salesperson",
                                              add: !isSalesperson,
                                              userData: {
                                                first_name: u.first_name,
                                                last_name: u.last_name,
                                                email: u.email,
                                              },
                                            })
                                          }
                                        >
                                          <TrendingUp
                                            className={`h-4 w-4 mr-2 ${
                                              isSalesperson ? "text-emerald-600" : ""
                                            }`}
                                          />
                                          {isSalesperson ? (
                                            <>Rimuovi ruolo Venditore</>
                                          ) : (
                                            <>Aggiungi ruolo Venditore</>
                                          )}
                                        </DropdownMenuItem>
                                      )}
                                      {!isPrimaryCall && (
                                        <DropdownMenuItem
                                          onClick={() =>
                                            toggleSecondaryRoleMutation.mutate({
                                              userId: u.id,
                                              role: "call_center",
                                              add: !isCallCenter,
                                              userData: {
                                                first_name: u.first_name,
                                                last_name: u.last_name,
                                                email: u.email,
                                              },
                                            })
                                          }
                                        >
                                          <Phone
                                            className={`h-4 w-4 mr-2 ${
                                              isCallCenter ? "text-blue-600" : ""
                                            }`}
                                          />
                                          {isCallCenter ? (
                                            <>Rimuovi ruolo Call Center</>
                                          ) : (
                                            <>Aggiungi ruolo Call Center</>
                                          )}
                                        </DropdownMenuItem>
                                      )}
                                    </>
                                  );
                                })()}
                              </>
                            )}
                            {((u.locked_until && new Date(u.locked_until) > new Date()) || u.failed_login_count > 0) && (
                              <DropdownMenuItem onClick={() => unlockAccountMutation.mutate(u.id)}>
                                <LockOpen className="h-4 w-4 mr-2" /> Sblocca account
                              </DropdownMenuItem>
                            )}
                            {canManageUsers && u.effectiveRole !== "company_admin" && (
                              <>
                                <DropdownMenuSeparator />
                                {u.is_blocked ? (
                                  <DropdownMenuItem onClick={() => blockAccessMutation.mutate({ userId: u.id, block: false })}>
                                    <ShieldCheck className="h-4 w-4 mr-2 text-emerald-600" /> Ripristina accesso
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem onClick={() => blockAccessMutation.mutate({ userId: u.id, block: true })}
                                    className="text-amber-700">
                                    <ShieldOff className="h-4 w-4 mr-2" /> Blocca accesso
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => setDeleteTarget(u)}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" /> Elimina
                                </DropdownMenuItem>
                              </>
                            )}
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

      {/* Delete Dialog */}
      <DeleteUserDialog
        user={deleteTarget}
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        companyUsers={companyUsers}
        onConfirm={(userId, reassignToUserId) => {
          deleteUserMutation.mutate({ userId, reassignToUserId });
        }}
        isDeleting={deleteUserMutation.isPending}
      />
    </div>
  );
}
