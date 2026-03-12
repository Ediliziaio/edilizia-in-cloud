import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useAdminTeam, useUpdateAdminPermission,
  useDeleteAdmin, useInviteAdmin, AdminMember, AdminPermissions,
  PERMISSION_LABELS, PERMISSION_PRESETS, DEFAULT_PERMISSIONS,
} from "@/hooks/useAdminTeam";
import { useSuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { useMutation } from "@tanstack/react-query";
import ResetPasswordDialog from "./ResetPasswordDialog";
import CreateSuperAdminDialog from "./CreateSuperAdminDialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Search, Plus, Trash2, KeyRound, UserPlus,
  Monitor, Clock, Loader2, ChevronDown,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";

// ─── PERMISSION MATRIX ROW ────────────────────────────────────────────────────

function PermissionRow({ member }: { member: AdminMember }) {
  const { user } = useAuth();
  const isSelf = member.id === user?.id;
  const { mutate: updatePerm, isPending } = useUpdateAdminPermission();
  const { mutate: applyPreset } = useUpdateAdminPermission();

  const perms: AdminPermissions = member.permissions ?? {
    can_manage_companies: true, can_manage_plans: true,
    can_manage_tickets: true, can_manage_referrals: true,
    can_manage_admins: true, can_view_platform_stats: true,
    can_manage_marketing: true, allowed_company_ids: null,
  };

  const handleToggle = (key: keyof Omit<AdminPermissions, "allowed_company_ids">, val: boolean) => {
    if (isSelf) return;
    updatePerm({ userId: member.id, permissions: { [key]: val } });
  };

  const handlePreset = (preset: Partial<AdminPermissions>) => {
    if (isSelf) return;
    applyPreset(
      { userId: member.id, permissions: preset },
      { onSuccess: () => toast.success("Preset applicato") },
    );
  };

  return (
    <TableRow className="group">
      <TableCell className="min-w-[200px]">
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarImage src={member.avatarUrl ?? undefined} />
            <AvatarFallback className="text-xs">
              {member.firstName[0]}{member.lastName[0]}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium truncate">
                {member.firstName} {member.lastName}
              </span>
              {isSelf && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Tu</Badge>}
            </div>
            <p className="text-xs text-muted-foreground truncate">{member.email || "—"}</p>
          </div>
        </div>
      </TableCell>

      {PERMISSION_LABELS.map(({ key }) => (
        <TableCell key={key} className="text-center px-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex justify-center">
                  <Switch
                    checked={!!perms[key]}
                    onCheckedChange={(val) => handleToggle(key, val)}
                    disabled={isSelf || isPending}
                    className="scale-75"
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {isSelf
                  ? "Non puoi modificare i tuoi permessi"
                  : perms[key]
                    ? `Revoca "${PERMISSION_LABELS.find(p => p.key === key)?.label}"`
                    : `Concedi "${PERMISSION_LABELS.find(p => p.key === key)?.label}"`
                }
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </TableCell>
      ))}

      <TableCell className="text-center px-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" disabled={isSelf}>
              Preset <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {PERMISSION_PRESETS.map((p) => (
              <DropdownMenuItem key={p.label} onClick={() => handlePreset(p.value)}>
                <span className="mr-2">{p.icon}</span>
                {p.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>

      <TableCell className="min-w-[140px]">
        <div className="space-y-1 text-xs text-muted-foreground">
          {member.activeSessions > 0 && (
            <div className="flex items-center gap-1">
              <Monitor className="h-3 w-3" />
              {member.activeSessions} sessioni
            </div>
          )}
          {member.lastLoginAt && (
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDistanceToNow(new Date(member.lastLoginAt), { addSuffix: true, locale: it })}
            </div>
          )}
          {!member.activeSessions && !member.lastLoginAt && (
            <span className="text-muted-foreground/50">—</span>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

// ─── DIALOGO INVITO ───────────────────────────────────────────────────────────

function InviteAdminDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { mutate: invite, isPending } = useInviteAdmin();
  const [email, setEmail] = useState("");
  const [selectedPreset, setSelectedPreset] = useState(0);

  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  const handleInvite = () => {
    if (!email.trim()) { toast.error("Inserisci l'email"); return; }
    const preset = PERMISSION_PRESETS[selectedPreset];
    invite(
      { email: email.trim(), permissions: { ...DEFAULT_PERMISSIONS, ...preset.value } },
      {
        onSuccess: (data: any) => {
          // Show invite URL if returned
          if (data?.inviteUrl) {
            setInviteUrl(data.inviteUrl);
          } else {
            onClose(); setEmail("");
          }
        },
      }
    );
  };

  const handleCopyUrl = () => {
    if (inviteUrl) {
      navigator.clipboard.writeText(inviteUrl);
      toast.success("Link copiato negli appunti");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invita Super Admin</DialogTitle>
          <DialogDescription>
            Invia un link di invito via email. Il link è valido per 7 giorni.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="mario@example.com"
              onKeyDown={(e) => e.key === "Enter" && handleInvite()}
            />
          </div>
          <div className="space-y-2">
            <Label>Livello di accesso</Label>
            <div className="grid grid-cols-2 gap-2">
              {PERMISSION_PRESETS.map((p, i) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setSelectedPreset(i)}
                  className={`p-3 rounded-lg border text-left transition-colors ${
                    selectedPreset === i
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-muted-foreground/30"
                  }`}
                >
                  <span className="mr-1.5">{p.icon}</span>
                  <span className="text-sm font-medium">{p.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={handleInvite} disabled={isPending} className="gap-2">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Invia invito
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── COMPONENTE PRINCIPALE ────────────────────────────────────────────────────

export default function SuperAdminUsersTab() {
  const { data: members, isLoading } = useAdminTeam();
  const { permissions: saPermissions } = useSuperAdminPermissions();
  const [search, setSearch] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [toDelete, setToDelete] = useState<AdminMember | null>(null);
  const [resetTarget, setResetTarget] = useState<AdminMember | null>(null);
  const { user } = useAuth();
  const { mutate: deleteAdmin, isPending: isDeleting } = useDeleteAdmin();

  // Reset password mutation (uses existing edge function)
  const resetMutation = useMutation({
    mutationFn: async ({ userId, newPassword }: { userId: string; newPassword: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("manage-super-admins", {
        body: { action: "reset-password", userId, newPassword },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) {
        const msg = await res.error?.context?.json?.().catch((): null => null);
        throw new Error(msg?.error || res.error.message);
      }
      if (res.data?.error) throw new Error(res.data.error);
    },
    onSuccess: () => {
      setResetTarget(null);
      toast.success("Password reimpostata con successo");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Create mutation (uses existing edge function)
  const createMutation = useMutation({
    mutationFn: async (data: { email: string; password: string; firstName: string; lastName: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("manage-super-admins", {
        body: { action: "create", ...data },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) {
        const msg = await res.error?.context?.json?.().catch((): null => null);
        throw new Error(msg?.error || res.error.message);
      }
      if (res.data?.error) throw new Error(res.data.error);
    },
    onSuccess: () => {
      setShowCreate(false);
      toast.success("Super Admin creato con successo");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = (members ?? []).filter(
    (m) =>
      search === "" ||
      `${m.firstName} ${m.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
      m.email.toLowerCase().includes(search.toLowerCase())
  );

  const totalFullAccess = (members ?? []).filter((m) =>
    !m.permissions ||
    Object.entries(m.permissions).every(([k, v]) =>
      k === "allowed_company_ids" || v === true || v === null
    )
  ).length;

  const totalSessions = (members ?? []).reduce((s, m) => s + m.activeSessions, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Team Super Admin</h2>
          <p className="text-sm text-muted-foreground">
            Gestisci gli amministratori e i loro permessi.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowCreate(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Crea Admin
          </Button>
          <Button onClick={() => setShowInvite(true)} className="gap-2">
            <UserPlus className="h-4 w-4" /> Invita Admin
          </Button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs text-muted-foreground font-medium">Totale Admin</p>
            <p className="text-2xl font-bold">{members?.length ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs text-muted-foreground font-medium">Sessioni attive</p>
            <p className="text-2xl font-bold">{totalSessions}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs text-muted-foreground font-medium">Accesso completo</p>
            <p className="text-2xl font-bold">{totalFullAccess}</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Cerca per nome o email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Permission Matrix */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Matrix permessi</CardTitle>
          <CardDescription>
            Abilita/disabilita permessi direttamente dalla tabella.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-3 p-6">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-muted-foreground">Nessun admin trovato</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[200px]">Admin</TableHead>
                    {PERMISSION_LABELS.map(({ key, label, description }) => (
                      <TableHead key={key} className="text-center px-2 min-w-[80px]">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-xs cursor-help">{label}</span>
                            </TooltipTrigger>
                            <TooltipContent>{description}</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableHead>
                    ))}
                    <TableHead className="text-center px-2">Preset</TableHead>
                    <TableHead className="min-w-[140px]">Attività</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((member) => (
                    <PermissionRow key={member.id} member={member} />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Individual actions card */}
      {!isLoading && filtered.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Azioni individuali</CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            {filtered.map((member) => {
              const isSelf = member.id === user?.id;
              return (
                <div key={member.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={member.avatarUrl ?? undefined} />
                      <AvatarFallback className="text-xs">
                        {member.firstName[0]}{member.lastName[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <span className="text-sm font-medium">
                        {member.firstName} {member.lastName}
                      </span>
                      {isSelf && <Badge variant="secondary" className="ml-2 text-[10px]">Tu</Badge>}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {!isSelf && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1.5 text-xs"
                          onClick={() => setResetTarget(member)}
                        >
                          <KeyRound className="h-3.5 w-3.5" /> Reset password
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1.5 text-xs text-destructive hover:text-destructive"
                          onClick={() => setToDelete(member)}
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Elimina
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Dialogs */}
      <InviteAdminDialog open={showInvite} onClose={() => setShowInvite(false)} />

      <CreateSuperAdminDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onSubmit={(d) => createMutation.mutate(d)}
        isPending={createMutation.isPending}
      />

      <ResetPasswordDialog
        open={!!resetTarget}
        onOpenChange={(o) => !o && setResetTarget(null)}
        onSubmit={(pw) => resetTarget && resetMutation.mutate({ userId: resetTarget.id, newPassword: pw })}
        isPending={resetMutation.isPending}
        userName={resetTarget ? `${resetTarget.firstName} ${resetTarget.lastName}` : ""}
      />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina Admin</AlertDialogTitle>
            <AlertDialogDescription>
              Stai per eliminare{" "}
              <strong>{toDelete?.firstName} {toDelete?.lastName}</strong>.
              L'account verrà rimosso definitivamente. Sei sicuro?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => toDelete && deleteAdmin(toDelete.id, { onSuccess: () => setToDelete(null) })}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-2"
            >
              {isDeleting && <Loader2 className="h-4 w-4 animate-spin" />}
              Elimina definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
