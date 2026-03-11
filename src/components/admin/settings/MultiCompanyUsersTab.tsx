import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Trash2, KeyRound, Loader2, Building, Users, X, UserPlus } from "lucide-react";
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

function getInitials(first: string, last: string) {
  return `${first?.[0] || ""}${last?.[0] || ""}`.toUpperCase();
}

export default function MultiCompanyUsersTab() {
  const { permissions: saPermissions } = useSuperAdminPermissions();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MultiCompanyUser | null>(null);
  const [resetTarget, setResetTarget] = useState<MultiCompanyUser | null>(null);
  const [selectedUser, setSelectedUser] = useState<MultiCompanyUser | null>(null);

  const { data: users = [], isLoading } = useQuery({
    queryKey: [...queryKeys.admin.superAdmins, "multi-company"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("manage-platform-users", {
        body: { action: "list-multi-company" },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) {
        const body = await res.error.context?.json?.();
        throw new Error(body?.error || res.error.message);
      }
      return (res.data?.users || []) as MultiCompanyUser[];
    },
  });

  // Keep selectedUser in sync with data
  const activeUser = selectedUser ? users.find((u) => u.id === selectedUser.id) || null : null;

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
      setSelectedUser(null);
      toast.success("Utente multi-azienda rimosso");
    },
    onError: (e: Error) => { setDeleteTarget(null); toast.error(e.message); },
  });

  const removeAccessMutation = useMutation({
    mutationFn: async ({ userId, companyId }: { userId: string; companyId: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("manage-platform-users", {
        body: { action: "update-company-access", userId, companyId, operation: "remove" },
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
      toast.success("Accesso rimosso");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetMutation = useMutation({
    mutationFn: async ({ userId, newPassword }: { userId: string; newPassword: string }) => {
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
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 min-h-[400px]">
              {/* Left: User list */}
              <div className="lg:col-span-2">
                <ScrollArea className="h-[400px]">
                  <div className="space-y-1 pr-2">
                    {users.map((u) => (
                      <button
                        key={u.id}
                        onClick={() => setSelectedUser(u)}
                        className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors hover:bg-muted/50 ${
                          activeUser?.id === u.id ? "bg-muted border border-border" : ""
                        }`}
                      >
                        <Avatar className="h-9 w-9">
                          <AvatarFallback className="text-xs bg-primary/10 text-primary">{getInitials(u.first_name, u.last_name)}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{u.first_name} {u.last_name}</p>
                          <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                        </div>
                        <Badge variant="secondary" className="text-[10px] shrink-0">{u.accesses.length} az.</Badge>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              {/* Right: Detail panel */}
              <div className="lg:col-span-3 border rounded-lg p-4">
                {activeUser ? (
                  <div className="space-y-4">
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-11 w-11">
                          <AvatarFallback className="bg-primary/10 text-primary">{getInitials(activeUser.first_name, activeUser.last_name)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <h3 className="font-semibold">{activeUser.first_name} {activeUser.last_name}</h3>
                          <p className="text-sm text-muted-foreground">{activeUser.email}</p>
                          <p className="text-xs text-muted-foreground">Creato il {format(new Date(activeUser.created_at), "dd MMM yyyy", { locale: it })}</p>
                        </div>
                      </div>
                      {saPermissions.can_manage_admins && (
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => setResetTarget(activeUser)} title="Reset password">
                            <KeyRound className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(activeUser)} className="text-destructive hover:text-destructive" title="Elimina">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Company accesses */}
                    <div>
                      <p className="text-sm font-medium mb-2">Aziende accessibili ({activeUser.accesses.length})</p>
                      <div className="space-y-2">
                        {activeUser.accesses.map((a) => (
                          <div key={a.id} className="flex items-center justify-between gap-2 border rounded-lg p-3">
                            <div className="flex items-center gap-2 min-w-0">
                              <Building className="h-4 w-4 text-muted-foreground shrink-0" />
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{a.companies?.name || "N/A"}</p>
                                <p className="text-xs text-muted-foreground">{a.access_role}</p>
                              </div>
                            </div>
                            {saPermissions.can_manage_admins && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive hover:text-destructive shrink-0 h-7 w-7"
                                onClick={() => removeAccessMutation.mutate({ userId: activeUser.id, companyId: a.company_id })}
                                disabled={removeAccessMutation.isPending}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center py-12">
                    <UserPlus className="h-10 w-10 text-muted-foreground/40 mb-3" />
                    <p className="text-sm text-muted-foreground">Seleziona un utente per vedere i dettagli</p>
                  </div>
                )}
              </div>
            </div>
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
