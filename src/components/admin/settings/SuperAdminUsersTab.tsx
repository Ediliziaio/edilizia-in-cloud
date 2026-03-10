import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ShieldCheck, Plus, Trash2, KeyRound, Loader2, Shield } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { SUPER_ADMIN_PERMISSION_LABELS } from "@/lib/adminConstants";
import CreateSuperAdminDialog from "./CreateSuperAdminDialog";
import ResetPasswordDialog from "./ResetPasswordDialog";
import SuperAdminPermissionsDialog from "./SuperAdminPermissionsDialog";

interface AdminPermissions {
  can_manage_companies: boolean;
  can_manage_plans: boolean;
  can_manage_tickets: boolean;
  can_manage_referrals: boolean;
  can_manage_admins: boolean;
  can_view_platform_stats: boolean;
  allowed_company_ids: string[] | null;
}

interface AdminUser {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  created_at: string;
  permissions: AdminPermissions | null;
}

export default function SuperAdminUsersTab() {
  const { user } = useAuth();
  const { permissions: saPermissions } = useSuperAdminPermissions();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [resetTarget, setResetTarget] = useState<AdminUser | null>(null);
  const [permsTarget, setPermsTarget] = useState<AdminUser | null>(null);

  const { data: admins = [], isLoading } = useQuery({
    queryKey: ["super-admins"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("manage-super-admins", {
        body: { action: "list" },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw new Error(res.error.message);
      return (res.data?.admins || []) as AdminUser[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: { email: string; password: string; firstName: string; lastName: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("manage-super-admins", {
        body: { action: "create", ...data },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admins"] });
      setCreateOpen(false);
      toast.success("Super Admin creato con successo");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("manage-super-admins", {
        body: { action: "delete", userId },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admins"] });
      setDeleteTarget(null);
      toast.success("Super Admin rimosso");
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
      toast.success("Password reimpostata con successo");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const getActivePermsBadges = (perms: AdminPermissions | null) => {
    if (!perms) return null;
    const keys = Object.keys(SUPER_ADMIN_PERMISSION_LABELS) as (keyof typeof SUPER_ADMIN_PERMISSION_LABELS)[];
    const disabled = keys.filter((k) => perms[k as keyof AdminPermissions] === false);
    if (disabled.length === 0) return <Badge variant="secondary" className="text-xs">Accesso completo</Badge>;
    const enabled = keys.filter((k) => perms[k as keyof AdminPermissions] !== false);
    return (
      <div className="flex flex-wrap gap-1">
        {enabled.map((k) => (
          <Badge key={k} variant="outline" className="text-xs">{SUPER_ADMIN_PERMISSION_LABELS[k]}</Badge>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" /> Utenti Super Admin</CardTitle>
            <CardDescription>Gestisci gli utenti con accesso amministrativo alla piattaforma</CardDescription>
          </div>
          <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-2" /> Nuovo Admin</Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : admins.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nessun super admin trovato</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Permessi</TableHead>
                  <TableHead>Creato il</TableHead>
                  <TableHead className="w-[150px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {admins.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">
                      {a.first_name} {a.last_name}
                      {a.id === user?.id && <Badge variant="secondary" className="ml-2">Tu</Badge>}
                    </TableCell>
                    <TableCell>{a.email}</TableCell>
                    <TableCell>{getActivePermsBadges(a.permissions)}</TableCell>
                    <TableCell>{format(new Date(a.created_at), "dd MMM yyyy", { locale: it })}</TableCell>
                    <TableCell className="flex gap-1">
                      {a.id !== user?.id && (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => setPermsTarget(a)} title="Permessi">
                            <Shield className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setResetTarget(a)} title="Reset password">
                            <KeyRound className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(a)} className="text-destructive hover:text-destructive">
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

      <CreateSuperAdminDialog open={createOpen} onOpenChange={setCreateOpen} onSubmit={(d) => createMutation.mutate(d)} isPending={createMutation.isPending} />

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
            <AlertDialogTitle>Rimuovere Super Admin?</AlertDialogTitle>
            <AlertDialogDescription>
              L'utente <strong>{deleteTarget?.first_name} {deleteTarget?.last_name}</strong> ({deleteTarget?.email}) perderà l'accesso amministrativo e verrà eliminato dalla piattaforma. Questa azione è irreversibile.
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
