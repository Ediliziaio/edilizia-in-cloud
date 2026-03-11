import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Trash2, KeyRound, Loader2, Shield, Users } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { PLATFORM_ROLE_LABELS, PLATFORM_ROLE_COLORS, PLATFORM_ROLES, type PlatformRole } from "@/types/auth";
import { useSuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";
import ResetPasswordDialog from "./ResetPasswordDialog";
import SuperAdminPermissionsDialog from "./SuperAdminPermissionsDialog";
import CreatePlatformUserDialog from "./CreatePlatformUserDialog";

interface PlatformUser {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  created_at: string;
  roles: string[];
  permissions: any;
}

export default function PlatformTeamTab() {
  const { user } = useAuth();
  const { permissions: saPermissions } = useSuperAdminPermissions();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PlatformUser | null>(null);
  const [resetTarget, setResetTarget] = useState<PlatformUser | null>(null);
  const [permsTarget, setPermsTarget] = useState<PlatformUser | null>(null);

  const { data: users = [], isLoading } = useQuery({
    queryKey: [...queryKeys.admin.superAdmins, "platform-team"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("manage-platform-users", {
        body: { action: "list" },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw new Error(res.error.message);
      return (res.data?.users || []) as PlatformUser[];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("manage-platform-users", {
        body: { action: "delete", userId },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw new Error(res.error.message);
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
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("manage-super-admins", {
        body: { action: "reset-password", userId, newPassword },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw new Error(res.error.message);
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

  // Stats
  const superAdminCount = users.filter(u => u.roles.includes("super_admin")).length;
  const platformCount = users.filter(u => u.roles.some(r => PLATFORM_ROLES.includes(r as PlatformRole))).length;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold">{users.length}</div>
            <p className="text-xs text-muted-foreground">Team totale</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold">{superAdminCount}</div>
            <p className="text-xs text-muted-foreground">Super Admin</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold">{platformCount}</div>
            <p className="text-xs text-muted-foreground">Staff Piattaforma</p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Team Piattaforma</CardTitle>
            <CardDescription>Super Admin e staff interno della piattaforma</CardDescription>
          </div>
          {saPermissions.can_manage_admins && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> Nuovo Membro
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : users.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nessun membro del team</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Ruolo</TableHead>
                  <TableHead>Creato il</TableHead>
                  <TableHead className="w-[150px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">
                      {u.first_name} {u.last_name}
                      {u.id === user?.id && <Badge variant="secondary" className="ml-2">Tu</Badge>}
                    </TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>{getRoleBadge(u)}</TableCell>
                    <TableCell>{format(new Date(u.created_at), "dd MMM yyyy", { locale: it })}</TableCell>
                    <TableCell className="flex gap-1">
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
        <SuperAdminPermissionsDialog
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
