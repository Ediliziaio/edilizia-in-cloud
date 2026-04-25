import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Trash2, KeyRound, Loader2, Shield, Users, AlertCircle, RefreshCw, Search, X } from "lucide-react";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  PLATFORM_ROLE_LABELS,
  PLATFORM_ROLE_COLORS,
  PLATFORM_ROLES,
  type PlatformRole,
} from "@/types/auth";
import { useSuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";
import ResetPasswordDialog from "./ResetPasswordDialog";
import PlatformPermissionsDialog from "./PlatformPermissionsDialog";
import CreatePlatformUserDialog from "./CreatePlatformUserDialog";

interface PlatformUser {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  created_at: string;
  last_login_at?: string | null;
  roles: string[];
  permissions: Record<string, boolean>;
}

const ROLE_STAT_CARDS: { role: "super_admin" | PlatformRole; label: string; colorClass: string }[] = [
  { role: "super_admin", label: "Super Admin", colorClass: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
  { role: "platform_manager", label: PLATFORM_ROLE_LABELS.platform_manager, colorClass: PLATFORM_ROLE_COLORS.platform_manager },
  { role: "platform_sales", label: PLATFORM_ROLE_LABELS.platform_sales, colorClass: PLATFORM_ROLE_COLORS.platform_sales },
  { role: "platform_support", label: PLATFORM_ROLE_LABELS.platform_support, colorClass: PLATFORM_ROLE_COLORS.platform_support },
  { role: "platform_marketing", label: PLATFORM_ROLE_LABELS.platform_marketing, colorClass: PLATFORM_ROLE_COLORS.platform_marketing },
  { role: "platform_implementation", label: PLATFORM_ROLE_LABELS.platform_implementation, colorClass: PLATFORM_ROLE_COLORS.platform_implementation },
];

function getInitials(first: string, last: string) {
  return `${first?.[0] || ""}${last?.[0] || ""}`.toUpperCase();
}

// Avatar palette deterministica — utenti distinguibili a colpo d'occhio
const AVATAR_COLORS = [
  "bg-rose-500", "bg-blue-500", "bg-emerald-500", "bg-amber-500",
  "bg-violet-500", "bg-cyan-500", "bg-pink-500", "bg-teal-500",
  "bg-indigo-500", "bg-orange-500",
];
function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export default function PlatformTeamTab() {
  const { user } = useAuth();
  const { permissions: saPermissions } = useSuperAdminPermissions();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PlatformUser | null>(null);
  const [resetTarget, setResetTarget] = useState<PlatformUser | null>(null);
  const [permsTarget, setPermsTarget] = useState<PlatformUser | null>(null);
  const [search, setSearch] = useState("");

  const { data: users = [], isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: [...queryKeys.admin.superAdmins, "platform-team"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("manage-platform-users", {
        body: { action: "list" },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) {
        const body = await res.error.context?.json?.();
        throw new Error(body?.error || res.error.message);
      }
      return (res.data?.users || []) as PlatformUser[];
    },
  });

  // Filtered list: search by name, email or role
  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const name = `${u.first_name} ${u.last_name}`.toLowerCase();
      const roles = (u.roles ?? []).join(" ").toLowerCase();
      return name.includes(q) || u.email.toLowerCase().includes(q) || roles.includes(q);
    });
  }, [users, search]);

  const deleteMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("manage-platform-users", {
        body: { action: "delete", userId },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) {
        const body = await res.error.context?.json?.();
        throw new Error(body?.error || res.error.message);
      }
      if (res.data?.error) throw new Error(res.data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.superAdmins });
      setDeleteTarget(null);
      toast.success("Utente rimosso dal team");
    },
    onError: (e: Error) => { setDeleteTarget(null); toast.error(e.message); },
  });

  const resetMutation = useMutation({
    mutationFn: async ({ userId, newPassword }: { userId: string; newPassword: string }) => {
      // NB: il reset password è gestito dalla legacy `manage-super-admins`
      // (verificato: la nuova `manage-platform-users` non implementa
      // l'action `reset-password`). Single round-trip, no fallback.
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("manage-super-admins", {
        body: { action: "reset-password", userId, newPassword },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) {
        const body = await res.error.context?.json?.();
        throw new Error(body?.error || res.error.message);
      }
      if (res.data?.error) throw new Error(res.data.error);
    },
    onSuccess: () => {
      setResetTarget(null);
      toast.success("Password reimpostata");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const getPlatformRole = (u: PlatformUser): PlatformRole | "super_admin" | null => {
    if (u.roles.includes("super_admin")) return "super_admin";
    const pr = u.roles.find(r => PLATFORM_ROLES.includes(r as PlatformRole));
    return (pr as PlatformRole) || null;
  };

  const getRoleBadge = (u: PlatformUser) => {
    const role = getPlatformRole(u);
    if (role === "super_admin") {
      return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">Super Admin</Badge>;
    }
    if (role && role in PLATFORM_ROLE_LABELS) {
      return <Badge className={PLATFORM_ROLE_COLORS[role as PlatformRole]}>{PLATFORM_ROLE_LABELS[role as PlatformRole]}</Badge>;
    }
    return <Badge variant="secondary">Custom</Badge>;
  };

  const getPermissionBadges = (u: PlatformUser) => {
    if (!u.permissions) return null;
    const activePerms = Object.entries(u.permissions)
      .filter(([k, v]) => v === true && k.startsWith("can_"))
      .map(([k]) => k.replace("can_", "").replace(/_/g, " "));
    if (activePerms.length === 0) return <span className="text-xs text-muted-foreground">Nessuno</span>;
    return (
      <div className="flex flex-wrap gap-1">
        {activePerms.slice(0, 3).map((p) => (
          <Badge key={p} variant="outline" className="text-xs px-1.5 py-0">{p}</Badge>
        ))}
        {activePerms.length > 3 && (
          <Badge variant="secondary" className="text-xs px-1.5 py-0">+{activePerms.length - 3}</Badge>
        )}
      </div>
    );
  };

  // Counts per role
  const roleCounts = ROLE_STAT_CARDS.map((rc) => ({
    ...rc,
    count: users.filter((u) =>
      rc.role === "super_admin"
        ? u.roles.includes("super_admin")
        : u.roles.includes(rc.role)
    ).length,
  }));

  return (
    <div className="space-y-6">
      {/* Role stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {roleCounts.map((rc) => (
          <Card key={rc.role}>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="text-2xl font-bold">{rc.count}</div>
              <Badge className={`${rc.colorClass} text-xs mt-1`}>{rc.label}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Team Piattaforma</CardTitle>
            <CardDescription>Super Admin e staff interno della piattaforma</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => refetch()}
              disabled={isFetching}
              title="Ricarica lista"
            >
              <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
            </Button>
            {saPermissions.can_manage_admins && (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-2" /> Nuovo Membro
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search bar */}
          {!isLoading && !isError && users.length > 0 && (
            <div className="relative max-w-sm">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cerca per nome, email o ruolo…"
                className="pl-8 h-9 text-sm"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted"
                  aria-label="Pulisci ricerca"
                >
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              )}
            </div>
          )}

          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3 text-muted-foreground">
              <AlertCircle className="h-8 w-8 text-destructive" />
              <p className="text-sm">Errore nel caricamento del team.</p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="h-3 w-3 mr-1" /> Riprova
              </Button>
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-8">
              <Users className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground font-medium">Nessun membro del team</p>
              {saPermissions.can_manage_admins && (
                <Button className="mt-4" onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" /> Aggiungi il primo membro
                </Button>
              )}
            </div>
          ) : filteredUsers.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">
              Nessun membro corrisponde alla ricerca.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Ruolo</TableHead>
                  <TableHead>Permessi</TableHead>
                  <TableHead>Ultimo accesso</TableHead>
                  <TableHead>Creato il</TableHead>
                  <TableHead className="w-[150px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className={cn("text-xs text-white", avatarColor(u.id))}>
                            {getInitials(u.first_name, u.last_name)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <span className="font-medium">{u.first_name} {u.last_name}</span>
                          {u.id === user?.id && <Badge variant="secondary" className="ml-2 text-xs">Tu</Badge>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                    <TableCell>{getRoleBadge(u)}</TableCell>
                    <TableCell>{getPermissionBadges(u)}</TableCell>
                    <TableCell className="text-sm">
                      {u.last_login_at ? (() => {
                        const days = (Date.now() - new Date(u.last_login_at).getTime()) / 86_400_000;
                        const stale = days > 30;
                        return (
                          <span className={cn("text-xs", stale ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>
                            {stale && "⚠️ "}{formatDistanceToNow(new Date(u.last_login_at), { addSuffix: true, locale: it })}
                          </span>
                        );
                      })() : (
                        <span className="text-xs text-muted-foreground italic">Mai</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{format(new Date(u.created_at), "dd MMM yyyy", { locale: it })}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {u.id !== user?.id && saPermissions.can_manage_admins && (
                          <>
                            <Button variant="ghost" size="icon" onClick={() => setPermsTarget(u)} title="Permessi">
                              <Shield className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => setResetTarget(u)} title="Reset password">
                              <KeyRound className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(u)} className="text-destructive hover:text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CreatePlatformUserDialog open={createOpen} onOpenChange={setCreateOpen} />

      <ResetPasswordDialog
        open={!!resetTarget}
        onOpenChange={(o) => !o && setResetTarget(null)}
        onSubmit={(pw) => resetTarget && resetMutation.mutate({ userId: resetTarget.id, newPassword: pw })}
        isPending={resetMutation.isPending}
        userName={resetTarget ? `${resetTarget.first_name} ${resetTarget.last_name}` : ""}
      />

      {permsTarget && (
        <PlatformPermissionsDialog
          open={!!permsTarget}
          onOpenChange={(o) => !o && setPermsTarget(null)}
          adminId={permsTarget.id}
          adminName={`${permsTarget.first_name} ${permsTarget.last_name}`}
        />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rimuovere dal team?</AlertDialogTitle>
            <AlertDialogDescription>
              L'utente <strong>{deleteTarget?.first_name} {deleteTarget?.last_name}</strong> ({deleteTarget?.email}) perderà l'accesso alla piattaforma. Questa azione è irreversibile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)} disabled={deleteMutation.isPending} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Rimuovi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
