import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Trash2, KeyRound, Loader2, Building, Users } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { useSuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";
import ResetPasswordDialog from "./ResetPasswordDialog";
import CreateMultiCompanyUserDialog from "./CreateMultiCompanyUserDialog";

interface MultiCompanyUser {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  created_at: string;
  accesses: Array<{
    id: string;
    company_id: string;
    access_role: string;
    companies: { id: string; name: string; logo_url: string | null } | null;
  }>;
}

export default function MultiCompanyUsersTab() {
  const { permissions: saPermissions } = useSuperAdminPermissions();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MultiCompanyUser | null>(null);
  const [resetTarget, setResetTarget] = useState<MultiCompanyUser | null>(null);

  const { data: users = [], isLoading } = useQuery({
    queryKey: [...queryKeys.admin.superAdmins, "multi-company"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("manage-platform-users", {
        body: { action: "list-multi-company" },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw new Error(res.error.message);
      return (res.data?.users || []) as MultiCompanyUser[];
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
      toast.success("Utente multi-azienda rimosso");
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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><Building className="h-5 w-5" /> Utenti Multi-Azienda</CardTitle>
            <CardDescription>Consulenti e partner con accesso a più aziende</CardDescription>
          </div>
          {saPermissions.can_manage_admins && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> Nuovo Utente
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : users.length === 0 ? (
            <div className="text-center py-8">
              <Users className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground">Nessun utente multi-azienda configurato</p>
              <p className="text-sm text-muted-foreground mt-1">Crea un utente che può accedere a più aziende contemporaneamente</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Aziende</TableHead>
                  <TableHead>Creato il</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.first_name} {u.last_name}</TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {u.accesses.slice(0, 3).map((a) => (
                          <Badge key={a.id} variant="outline" className="text-xs">
                            {a.companies?.name || "N/A"}
                          </Badge>
                        ))}
                        {u.accesses.length > 3 && (
                          <Badge variant="secondary" className="text-xs">+{u.accesses.length - 3}</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{format(new Date(u.created_at), "dd MMM yyyy", { locale: it })}</TableCell>
                    <TableCell className="flex gap-1">
                      {saPermissions.can_manage_admins && (
                        <>
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

      <CreateMultiCompanyUserDialog open={createOpen} onOpenChange={setCreateOpen} />

      <ResetPasswordDialog
        open={!!resetTarget}
        onOpenChange={(o) => !o && setResetTarget(null)}
        onSubmit={(pw) => resetTarget && resetMutation.mutate({ userId: resetTarget.id, newPassword: pw })}
        isPending={resetMutation.isPending}
        userName={resetTarget ? `${resetTarget.first_name} ${resetTarget.last_name}` : ""}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rimuovere utente multi-azienda?</AlertDialogTitle>
            <AlertDialogDescription>
              L'utente <strong>{deleteTarget?.first_name} {deleteTarget?.last_name}</strong> perderà l'accesso a tutte le aziende associate. Questa azione è irreversibile.
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
