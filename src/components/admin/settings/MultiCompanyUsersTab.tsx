import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { invokeAdminFunction } from "@/lib/admin/invokeAdminFunction";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus, Trash2, KeyRound, Loader2, Building, Users, X, UserPlus,
  AlertCircle, RefreshCw, Search,
} from "lucide-react";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import { useSuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";
import { cn } from "@/lib/utils";
import { logAdminAuditAction } from "@/lib/admin/auditLog";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmWithPasswordDialog } from "@/components/admin/ConfirmWithPasswordDialog";
import ResetPasswordDialog from "./ResetPasswordDialog";
import CreateMultiCompanyUserDialog from "./CreateMultiCompanyUserDialog";
import AddCompanyAccessForm from "./AddCompanyAccessForm";

interface MultiCompanyAccess {
  id: string;
  company_id: string;
  access_role: string;
  companies: { id: string; name: string; logo_url: string | null } | null;
}

interface MultiCompanyUser {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  created_at: string;
  last_login_at?: string | null;
  accesses: MultiCompanyAccess[];
}

const ACCESS_ROLE_LABELS: Record<string, string> = {
  company_admin: "Admin",
  company_staff: "Operatore",
  salesperson: "Venditore",
  call_center: "Call Center",
};
const ACCESS_ROLE_OPTIONS = [
  { value: "company_admin", label: "Admin" },
  { value: "company_staff", label: "Operatore" },
  { value: "salesperson", label: "Venditore" },
  { value: "call_center", label: "Call Center" },
] as const;

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
  // Confirm dialog per "Rimuovi accesso azienda" — destructive senza undo
  const [removeAccessTarget, setRemoveAccessTarget] = useState<{
    userId: string; userName: string; companyId: string; companyName: string;
  } | null>(null);
  // Search per la lista utenti
  const [userSearch, setUserSearch] = useState("");
  // Search per le aziende dentro al detail panel (utile su utenti con molti accessi)
  const [accessSearch, setAccessSearch] = useState("");
  // Track quali companyId stanno facendo remove/update per spinner per-row.
  // Set invece di stringa singola → niente collisioni se l'utente fa 2 azioni
  // concorrenti su righe diverse (race condition fix).
  const [removingCompanyIds, setRemovingCompanyIds] = useState<Set<string>>(() => new Set());
  const [updatingRoleCompanyIds, setUpdatingRoleCompanyIds] = useState<Set<string>>(() => new Set());

  const trackBusy = (
    setter: React.Dispatch<React.SetStateAction<Set<string>>>,
    companyId: string,
    busy: boolean,
  ) =>
    setter((prev) => {
      const next = new Set(prev);
      if (busy) next.add(companyId);
      else next.delete(companyId);
      return next;
    });

  const { data: users = [], isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: [...queryKeys.admin.superAdmins, "multi-company"],
    queryFn: async () => {
      const data = await invokeAdminFunction<{ users?: MultiCompanyUser[] }>(
        "manage-platform-users",
        { action: "list-multi-company" },
      );
      return (data?.users ?? []) as MultiCompanyUser[];
    },
  });

  // Keep selectedUser in sync con i dati live (prevents stale data dopo invalidate)
  const activeUser = selectedUser ? users.find((u) => u.id === selectedUser.id) || null : null;

  // Filtered list users (search by name, email, OR azienda accessibile).
  // Estensione: cerchi "Acme" → vedi tutti gli utenti con accesso ad Acme.
  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const name = `${u.first_name} ${u.last_name}`.toLowerCase();
      if (name.includes(q) || u.email.toLowerCase().includes(q)) return true;
      // Cerca anche tra le aziende accessibili dell'utente
      return u.accesses.some((a) =>
        (a.companies?.name ?? "").toLowerCase().includes(q),
      );
    });
  }, [users, userSearch]);

  // Filtered company accesses — match anche su ruolo (label IT).
  const filteredAccesses = useMemo(() => {
    if (!activeUser) return [];
    const q = accessSearch.trim().toLowerCase();
    if (!q) return activeUser.accesses;
    return activeUser.accesses.filter((a) => {
      const companyName = (a.companies?.name ?? "").toLowerCase();
      const roleLabel = (ACCESS_ROLE_LABELS[a.access_role] ?? a.access_role).toLowerCase();
      return companyName.includes(q) || roleLabel.includes(q);
    });
  }, [activeUser, accessSearch]);

  const deleteMutation = useMutation({
    mutationFn: async (userId: string) => {
      await invokeAdminFunction("manage-platform-users", { action: "delete", userId });
    },
    onSuccess: (_data, userId) => {
      const target = deleteTarget;
      void logAdminAuditAction({
        action: "multi_company_user.delete",
        targetType: "multi_company_user",
        targetId: userId,
        details: target
          ? {
              email: target.email,
              name: `${target.first_name} ${target.last_name}`,
              accesses_revoked: target.accesses.length,
              companies: target.accesses.map((a) => a.companies?.name).filter(Boolean),
            }
          : { id: userId },
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.superAdmins });
      queryClient.invalidateQueries({ queryKey: ["admin-companies-summary"] });
      setDeleteTarget(null);
      setSelectedUser(null);
      toast.success("Utente multi-azienda rimosso");
    },
    onError: (e: Error) => {
      setDeleteTarget(null);
      toast.error(e.message);
    },
  });

  // Update role di un singolo accesso (Asana-style inline edit, no remove+re-add)
  const updateRoleMutation = useMutation({
    mutationFn: async ({ companyId, userId, newRole }: { companyId: string; userId: string; newRole: string }) => {
      trackBusy(setUpdatingRoleCompanyIds, companyId, true);
      try {
        await invokeAdminFunction("manage-platform-users", {
          action: "update-company-access",
          userId,
          companyId,
          accessRole: newRole,
          operation: "update-role",
        });
      } finally {
        trackBusy(setUpdatingRoleCompanyIds, companyId, false);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.superAdmins });
      toast.success("Ruolo accesso aggiornato");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeAccessMutation = useMutation({
    mutationFn: async ({ companyId, userId }: { companyId: string; userId: string }) => {
      trackBusy(setRemovingCompanyIds, companyId, true);
      try {
        await invokeAdminFunction("manage-platform-users", {
          action: "update-company-access",
          userId,
          companyId,
          operation: "remove",
        });
      } finally {
        trackBusy(setRemovingCompanyIds, companyId, false);
      }
    },
    onSuccess: (_data, vars) => {
      const target = removeAccessTarget;
      void logAdminAuditAction({
        action: "multi_company_access.revoke",
        targetType: "multi_company_access",
        targetId: `${vars.userId}:${vars.companyId}`,
        details: target
          ? {
              user_name: target.userName,
              company_name: target.companyName,
              user_id: vars.userId,
              company_id: vars.companyId,
            }
          : { user_id: vars.userId, company_id: vars.companyId },
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.superAdmins });
      setRemoveAccessTarget(null);
      toast.success("Accesso azienda rimosso");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /**
   * Reset password — tenta prima `manage-platform-users` con action
   * `reset-password`, fallback su legacy `manage-super-admins`.
   * Vedi PlatformTeamTab per lo stesso pattern.
   */
  const resetMutation = useMutation({
    mutationFn: async ({ userId, newPassword }: { userId: string; newPassword: string }) => {
      try {
        await invokeAdminFunction("manage-platform-users", {
          action: "reset-password",
          userId,
          newPassword,
        });
      } catch (err) {
        const msg = (err as Error).message?.toLowerCase() ?? "";
        const isUnknownAction =
          msg.includes("unknown action") ||
          msg.includes("invalid action") ||
          msg.includes("not implemented") ||
          msg.includes("action not supported") ||
          // Vedi PlatformTeamTab: la edge nuova dà "Azione non valida" (IT).
          msg.includes("azione non valida");
        if (!isUnknownAction) throw err;
        await invokeAdminFunction("manage-super-admins", {
          action: "reset-password",
          userId,
          newPassword,
        });
      }
    },
    onSuccess: () => {
      setResetTarget(null);
      toast.success("Password reimpostata");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const renderLastActivity = (u: MultiCompanyUser) => {
    if (!u.last_login_at) return <span className="text-xs text-muted-foreground italic">Mai connesso</span>;
    try {
      const dist = formatDistanceToNow(new Date(u.last_login_at), { addSuffix: true, locale: it });
      const days = (Date.now() - new Date(u.last_login_at).getTime()) / 86_400_000;
      const stale = days > 30;
      return (
        <span className={cn("text-xs", stale ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>
          {stale && "⚠️ "}{dist}
        </span>
      );
    } catch {
      return null;
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2"><Building className="h-5 w-5" /> Utenti Multi-Azienda</CardTitle>
            <CardDescription>Consulenti e partner con accesso a più aziende</CardDescription>
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
                <Plus className="h-4 w-4 mr-2" /> Nuovo Utente
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3 text-muted-foreground">
              <AlertCircle className="h-8 w-8 text-destructive" />
              <p className="text-sm">Errore nel caricamento degli utenti.</p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="h-3 w-3 mr-1" /> Riprova
              </Button>
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-10">
              <Users className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground font-medium">Nessun utente multi-azienda configurato</p>
              <p className="text-sm text-muted-foreground mt-1 mb-4">
                Crea un utente che può accedere a più aziende contemporaneamente
              </p>
              {saPermissions.can_manage_admins && (
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" /> Crea il primo utente
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 min-h-[400px]">
              {/* ─── Left: User list with search ─────────────────────── */}
              <div className="lg:col-span-2 space-y-3">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Cerca per nome o email…"
                    className="pl-8 h-9 text-sm"
                  />
                  {userSearch && (
                    <button
                      type="button"
                      onClick={() => setUserSearch("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted"
                      aria-label="Pulisci ricerca"
                    >
                      <X className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  )}
                </div>
                <ScrollArea className="h-[420px]">
                  <div className="space-y-1 pr-2">
                    {filteredUsers.length === 0 ? (
                      <EmptyState
                        icon={Search}
                        size="sm"
                        title={<>Nessun utente corrisponde a &quot;{userSearch}&quot;</>}
                        action={{
                          label: "Pulisci ricerca",
                          onClick: () => setUserSearch(""),
                          icon: X,
                          variant: "ghost",
                        }}
                      />
                    ) : (
                      filteredUsers.map((u) => (
                        <button
                          key={u.id}
                          onClick={() => { setSelectedUser(u); setAccessSearch(""); }}
                          className={cn(
                            "w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors hover:bg-muted/50",
                            activeUser?.id === u.id && "bg-muted border border-border shadow-sm"
                          )}
                        >
                          <Avatar className="h-9 w-9">
                            <AvatarFallback className={cn("text-xs text-white", avatarColor(u.id))}>
                              {getInitials(u.first_name, u.last_name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{u.first_name} {u.last_name}</p>
                            <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                            <div className="mt-0.5">{renderLastActivity(u)}</div>
                          </div>
                          <Badge
                            variant={u.accesses.length === 0 ? "destructive" : "secondary"}
                            className="text-xs shrink-0"
                            title={u.accesses.length === 0 ? "Utente senza accessi — anomalia" : `${u.accesses.length} aziende accessibili`}
                          >
                            {u.accesses.length} az.
                          </Badge>
                        </button>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </div>

              {/* ─── Right: Detail panel ─────────────────────── */}
              <div className="lg:col-span-3 border rounded-lg p-4">
                {activeUser ? (
                  <div className="space-y-4">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar className="h-11 w-11 shrink-0">
                          <AvatarFallback className={cn("text-white", avatarColor(activeUser.id))}>
                            {getInitials(activeUser.first_name, activeUser.last_name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <h3 className="font-semibold truncate">{activeUser.first_name} {activeUser.last_name}</h3>
                          <p className="text-sm text-muted-foreground truncate">{activeUser.email}</p>
                          <p className="text-xs text-muted-foreground">
                            Creato il {format(new Date(activeUser.created_at), "dd MMM yyyy", { locale: it })}
                            {" · Ultimo accesso "}
                            {activeUser.last_login_at
                              ? formatDistanceToNow(new Date(activeUser.last_login_at), { addSuffix: true, locale: it })
                              : "mai"}
                          </p>
                        </div>
                      </div>
                      {saPermissions.can_manage_admins && (
                        <div className="flex gap-1 shrink-0">
                          <Button variant="ghost" size="icon" onClick={() => setResetTarget(activeUser)} title="Reset password">
                            <KeyRound className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(activeUser)} className="text-destructive hover:text-destructive" title="Elimina utente">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Company accesses */}
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <p className="text-sm font-medium">
                          Aziende accessibili ({activeUser.accesses.length})
                        </p>
                        {activeUser.accesses.length > 1 && (
                          <div className="relative w-48">
                            <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              value={accessSearch}
                              onChange={(e) => setAccessSearch(e.target.value)}
                              placeholder="Filtra azienda o ruolo…"
                              className="pl-7 h-7 text-xs"
                            />
                          </div>
                        )}
                      </div>

                      {activeUser.accesses.length === 0 ? (
                        <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                          ⚠️ Questo utente non ha accessi configurati. Aggiungine almeno uno.
                        </div>
                      ) : filteredAccesses.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic px-2 py-3">
                          Nessuna azienda corrisponde a "{accessSearch}"
                        </p>
                      ) : (
                        <ScrollArea className="max-h-[280px]">
                          <div className="space-y-2 pr-2">
                            {filteredAccesses.map((a) => {
                              const isRemoving = removingCompanyIds.has(a.company_id);
                              const isUpdatingRole = updatingRoleCompanyIds.has(a.company_id);
                              return (
                                <div key={a.id} className="flex items-center justify-between gap-2 border rounded-lg p-3 hover:bg-muted/30 transition-colors">
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <Building className="h-4 w-4 text-muted-foreground shrink-0" />
                                    <p className="text-sm font-medium truncate flex-1">
                                      {a.companies?.name || "Azienda non disponibile"}
                                    </p>
                                  </div>
                                  {saPermissions.can_manage_admins ? (
                                    <div className="flex items-center gap-1 shrink-0">
                                      <Select
                                        value={a.access_role}
                                        onValueChange={(v) => {
                                          if (v !== a.access_role) {
                                            updateRoleMutation.mutate({
                                              userId: activeUser.id,
                                              companyId: a.company_id,
                                              newRole: v,
                                            });
                                          }
                                        }}
                                        disabled={isUpdatingRole || isRemoving}
                                      >
                                        <SelectTrigger
                                          className="h-7 text-xs w-[130px]"
                                          aria-label={`Ruolo per ${a.companies?.name ?? ""}`}
                                        >
                                          {isUpdatingRole ? (
                                            <Loader2 className="h-3 w-3 animate-spin" />
                                          ) : (
                                            <SelectValue />
                                          )}
                                        </SelectTrigger>
                                        <SelectContent>
                                          {ACCESS_ROLE_OPTIONS.map((r) => (
                                            <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="text-destructive hover:text-destructive shrink-0 h-7 w-7"
                                        onClick={() => setRemoveAccessTarget({
                                          userId: activeUser.id,
                                          userName: `${activeUser.first_name} ${activeUser.last_name}`,
                                          companyId: a.company_id,
                                          companyName: a.companies?.name ?? "questa azienda",
                                        })}
                                        disabled={isRemoving}
                                        title={`Rimuovi accesso a ${a.companies?.name ?? ""}`}
                                      >
                                        {isRemoving
                                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                          : <X className="h-3.5 w-3.5" />}
                                      </Button>
                                    </div>
                                  ) : (
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
                                      {ACCESS_ROLE_LABELS[a.access_role] ?? a.access_role}
                                    </Badge>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </ScrollArea>
                      )}

                      {saPermissions.can_manage_admins && (
                        <AddCompanyAccessForm
                          userId={activeUser.id}
                          existingCompanyIds={activeUser.accesses.map((a) => a.company_id)}
                        />
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center py-12">
                    <UserPlus className="h-10 w-10 text-muted-foreground/40 mb-3" />
                    <p className="text-sm text-muted-foreground">Seleziona un utente per vedere i dettagli</p>
                    <p className="text-xs text-muted-foreground/70 mt-1">
                      {users.length} utenti totali · {users.reduce((s, u) => s + u.accesses.length, 0)} accessi configurati
                    </p>
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

      {/* Confirm dialog: delete utente intero — con re-auth password */}
      <ConfirmWithPasswordDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Rimuovere utente multi-azienda?"
        description={
          deleteTarget ? (
            <>
              L&apos;utente <strong>{deleteTarget.first_name} {deleteTarget.last_name}</strong>{" "}
              ({deleteTarget.email}) perderà l&apos;accesso a tutte le{" "}
              <strong>{deleteTarget.accesses.length}</strong> aziende associate.
              Questa azione è <strong>irreversibile</strong>.
            </>
          ) : null
        }
        destructiveLabel="Rimuovi utente"
        onConfirmed={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />

      {/* Confirm dialog: rimuovi singolo accesso azienda — prima era no-confirm + irreversibile */}
      <AlertDialog
        open={!!removeAccessTarget}
        onOpenChange={(o) => { if (!o) setRemoveAccessTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rimuovere accesso azienda?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{removeAccessTarget?.userName}</strong> non potrà più accedere a <strong>{removeAccessTarget?.companyName}</strong>.
              L'utente continuerà ad avere accesso alle altre aziende a cui è associato.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeAccessMutation.isPending}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => removeAccessTarget && removeAccessMutation.mutate({
                userId: removeAccessTarget.userId,
                companyId: removeAccessTarget.companyId,
              })}
              disabled={removeAccessMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removeAccessMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Rimuovi accesso
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
