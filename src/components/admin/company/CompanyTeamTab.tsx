import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Shield, UserCheck, TrendingUp, HardHat, Plus, Loader2, KeyRound,
  Search, MoreHorizontal, Trash2, Key, Users, UserX, Clock, RefreshCw,
} from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { formatCurrency } from "@/lib/formatters";
import { PERMISSION_LABELS, commissionTypeLabels } from "@/lib/adminConstants";
import type { StaffPermissions } from "@/components/users/PermissionsDialog";
import { DEFAULT_PERMISSIONS } from "@/components/users/permissionsDefaults";

interface TeamData {
  admins: any[];
  staff: any[];
  salespeople: any[];
  employees: any[];
}

interface CompanyTeamTabProps {
  teamData: TeamData | null | undefined;
  totalTeam: number;
  onCreateStaff: () => void;
  onCreateSalesperson: () => void;
  onCreateEmployee: () => void;
  onEditPermissions: (user: { id: string; name: string; permissions: StaffPermissions }) => void;
  onCreateAccount: (type: "salesperson" | "employee", entityId: string, email: string, name: string) => void;
  creatingAccountFor: string | null;
  onDeleteUser?: (userId: string, name: string) => void;
  onResetPassword?: (userId: string, name: string) => void;
  isDeletingUser?: boolean;
  isResettingPassword?: boolean;
  isRefreshing?: boolean;
  onRefresh?: () => void;
}

function getActivePermissions(permissions: any) {
  if (!permissions) return [];
  return Object.entries(PERMISSION_LABELS)
    .filter(([key]) => permissions[key] === true)
    .map(([, label]) => label);
}

function LastAccessBadge({ lastLoginAt }: { lastLoginAt?: string | null }) {
  if (!lastLoginAt) return <Badge variant="secondary" className="text-xs gap-1"><Clock className="h-3 w-3" />Mai</Badge>;
  const days = differenceInDays(new Date(), new Date(lastLoginAt));
  if (days <= 3) return <Badge variant="default" className="bg-emerald-600 text-xs gap-1"><Clock className="h-3 w-3" />{days === 0 ? "Oggi" : `${days}gg fa`}</Badge>;
  if (days <= 14) return <Badge variant="outline" className="border-amber-500/30 text-amber-600 text-xs gap-1"><Clock className="h-3 w-3" />{days}gg fa</Badge>;
  return <Badge variant="outline" className="border-destructive/30 text-destructive text-xs gap-1"><Clock className="h-3 w-3" />{days}gg fa</Badge>;
}

function matchesSearch(member: any, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const name = `${member.first_name || ""} ${member.last_name || ""}`.toLowerCase();
  const email = (member.email || "").toLowerCase();
  return name.includes(q) || email.includes(q);
}

export function CompanyTeamTab({
  teamData, totalTeam,
  onCreateStaff, onCreateSalesperson, onCreateEmployee,
  onEditPermissions, onCreateAccount, creatingAccountFor,
  onDeleteUser, onResetPassword, isDeletingUser, isResettingPassword,
  isRefreshing, onRefresh,
}: CompanyTeamTabProps) {
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const filtered = useMemo(() => {
    if (!teamData) return { admins: [], staff: [], salespeople: [], employees: [] };
    return {
      admins: teamData.admins.filter((m) => matchesSearch(m, search)),
      staff: teamData.staff.filter((m) => matchesSearch(m, search)),
      salespeople: teamData.salespeople.filter((m) => matchesSearch(m, search)),
      employees: teamData.employees.filter((m) => matchesSearch(m, search)),
    };
  }, [teamData, search]);

  const withAccount = useMemo(() => {
    if (!teamData) return 0;
    return (
      teamData.admins.length +
      teamData.staff.length +
      teamData.salespeople.filter((s) => s.user_id).length +
      teamData.employees.filter((e) => e.user_id).length
    );
  }, [teamData]);

  const withoutAccount = Math.max(0, totalTeam - withAccount);

  return (
    <div className="space-y-6">
      {/* Stats + Search */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex items-center gap-3 flex-wrap flex-1">
          <Card className="px-4 py-2.5 flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">{totalTeam}</span>
            <span className="text-xs text-muted-foreground">Persone totali</span>
          </Card>
          <Card className="px-4 py-2.5 flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-emerald-600" />
            <span className="text-sm font-medium">{withAccount}</span>
            <span className="text-xs text-muted-foreground">Account login</span>
          </Card>
          {withoutAccount > 0 && (
            <Card className="px-4 py-2.5 flex items-center gap-2">
              <UserX className="h-4 w-4 text-amber-600" />
              <span className="text-sm font-medium">{withoutAccount}</span>
              <span className="text-xs text-muted-foreground">Senza login</span>
            </Card>
          )}
        </div>
        <div className="flex w-full sm:w-auto gap-2">
          {onRefresh && (
            <Button variant="outline" size="icon" onClick={onRefresh} disabled={isRefreshing} title="Aggiorna team">
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            </Button>
          )}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cerca per nome o email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
      </div>

      {/* Badges summary */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Composizione team</CardTitle>
          <CardDescription>
            Il totale include admin, staff, venditori e dipendenti. Gli account login sono solo le persone che possono accedere alla piattaforma.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0 pb-4">
          <div className="flex items-center gap-3 flex-wrap">
            <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700">{filtered.admins.length} Admin</Badge>
            <Badge variant="default" className="bg-blue-600 hover:bg-blue-700">{filtered.staff.length} Staff</Badge>
            <Badge variant="default" className="bg-violet-600 hover:bg-violet-700">{filtered.salespeople.length} Venditori</Badge>
            <Badge variant="default" className="bg-amber-600 hover:bg-amber-700">{filtered.employees.length} Dipendenti</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Admin */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-emerald-600" />
            <CardTitle className="text-base">Admin Azienda</CardTitle>
            <Badge variant="secondary" className="ml-auto">{filtered.admins.length}</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.admins.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nessun admin trovato</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Telefono</TableHead>
                  <TableHead>Ultimo Accesso</TableHead>
                  <TableHead>Creato il</TableHead>
                  {(onDeleteUser || onResetPassword) && <TableHead className="w-12" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.admins.map((admin) => (
                  <TableRow key={admin.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 text-xs font-bold">
                          {admin.first_name[0]}{admin.last_name[0]}
                        </div>
                        {admin.first_name} {admin.last_name}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{admin.email}</TableCell>
                    <TableCell className="text-muted-foreground">{admin.phone || "—"}</TableCell>
                    <TableCell><LastAccessBadge lastLoginAt={admin.last_login_at} /></TableCell>
                    <TableCell className="text-muted-foreground">{format(new Date(admin.created_at), "dd/MM/yyyy")}</TableCell>
                    {(onDeleteUser || onResetPassword) && (
                      <TableCell>
                        <MemberActions
                          userId={admin.user_id || admin.id}
                          name={`${admin.first_name} ${admin.last_name}`}
                          hasAccount
                          onDelete={onDeleteUser ? () => setDeleteTarget({ id: admin.user_id || admin.id, name: `${admin.first_name} ${admin.last_name}` }) : undefined}
                          onResetPassword={onResetPassword}
                        />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Staff */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-blue-600" />
            <CardTitle className="text-base">Staff</CardTitle>
            <Badge variant="secondary">{filtered.staff.length}</Badge>
            <Button size="sm" variant="outline" className="ml-auto" onClick={onCreateStaff}>
              <Plus className="h-4 w-4 mr-1" /> Aggiungi
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.staff.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nessun membro staff trovato</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Permessi</TableHead>
                  <TableHead>Ultimo Accesso</TableHead>
                  <TableHead>Creato il</TableHead>
                  <TableHead>Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.staff.map((member) => {
                  const perms = getActivePermissions(member.permissions);
                  const defaultPerms: StaffPermissions = Object.keys(DEFAULT_PERMISSIONS).reduce((acc, key) => {
                    (acc as any)[key] = (member.permissions as any)?.[key] ?? false;
                    return acc;
                  }, { ...DEFAULT_PERMISSIONS });
                  return (
                    <TableRow key={member.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-bold">
                            {member.first_name[0]}{member.last_name[0]}
                          </div>
                          {member.first_name} {member.last_name}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{member.email}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {perms.length === 0 ? (
                            <span className="text-sm text-muted-foreground">Nessun permesso</span>
                          ) : perms.length <= 4 ? (
                            perms.map((p) => <Badge key={p} variant="outline" className="text-xs px-1.5 py-0">{p}</Badge>)
                          ) : (
                            <>
                              {perms.slice(0, 3).map((p) => <Badge key={p} variant="outline" className="text-xs px-1.5 py-0">{p}</Badge>)}
                              <Badge variant="secondary" className="text-xs px-1.5 py-0">+{perms.length - 3} altri</Badge>
                            </>
                          )}
                        </div>
                      </TableCell>
                      <TableCell><LastAccessBadge lastLoginAt={member.last_login_at} /></TableCell>
                      <TableCell className="text-muted-foreground">{format(new Date(member.created_at), "dd/MM/yyyy")}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => onEditPermissions({ id: member.id, name: `${member.first_name} ${member.last_name}`, permissions: defaultPerms })}
                          >
                            <Shield className="h-4 w-4 mr-1" /> Permessi
                          </Button>
                          {(onDeleteUser || onResetPassword) && (
                            <MemberActions
                              userId={member.id}
                              name={`${member.first_name} ${member.last_name}`}
                              hasAccount
                              onDelete={onDeleteUser ? () => setDeleteTarget({ id: member.id, name: `${member.first_name} ${member.last_name}` }) : undefined}
                              onResetPassword={onResetPassword}
                            />
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Salespeople */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-violet-600" />
            <CardTitle className="text-base">Venditori</CardTitle>
            <Badge variant="secondary">{filtered.salespeople.length}</Badge>
            <Button size="sm" variant="outline" className="ml-auto" onClick={onCreateSalesperson}>
              <Plus className="h-4 w-4 mr-1" /> Aggiungi
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.salespeople.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nessun venditore trovato</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Telefono</TableHead>
                  <TableHead>Provvigione</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead>Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.salespeople.map((sp) => (
                  <TableRow key={sp.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-violet-100 flex items-center justify-center text-violet-700 text-xs font-bold">
                          {sp.first_name[0]}{sp.last_name[0]}
                        </div>
                        <div>
                          <p>{sp.first_name} {sp.last_name}</p>
                          {sp.email && <p className="text-xs text-muted-foreground">{sp.email}</p>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{sp.phone || "—"}</TableCell>
                    <TableCell>
                      <span className="font-medium">{sp.commission_type === "fixed_per_order" ? formatCurrency(sp.commission_value) : `${sp.commission_value}%`}</span>
                      <span className="text-xs text-muted-foreground ml-1">{commissionTypeLabels[sp.commission_type] || sp.commission_type}</span>
                    </TableCell>
                    <TableCell>
                      {sp.user_id ? <Badge variant="default" className="bg-emerald-600 text-xs">Attivo</Badge> : <Badge variant="secondary" className="text-xs">No account</Badge>}
                    </TableCell>
                    <TableCell>
                      {sp.is_active ? <Badge variant="default" className="text-xs">Attivo</Badge> : <Badge variant="destructive" className="text-xs">Inattivo</Badge>}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {!sp.user_id && sp.email && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={creatingAccountFor === sp.id}
                            onClick={() => onCreateAccount("salesperson", sp.id, sp.email!, `${sp.first_name} ${sp.last_name}`)}
                          >
                            {creatingAccountFor === sp.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4 mr-1" />}
                            Crea Account
                          </Button>
                        )}
                        {sp.user_id && (onDeleteUser || onResetPassword) && (
                          <MemberActions
                            userId={sp.user_id}
                            name={`${sp.first_name} ${sp.last_name}`}
                            hasAccount
                            onDelete={onDeleteUser ? () => setDeleteTarget({ id: sp.user_id, name: `${sp.first_name} ${sp.last_name}` }) : undefined}
                            onResetPassword={onResetPassword}
                          />
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

      {/* Employees */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <HardHat className="h-5 w-5 text-amber-600" />
            <CardTitle className="text-base">Dipendenti</CardTitle>
            <Badge variant="secondary">{filtered.employees.length}</Badge>
            <Button size="sm" variant="outline" className="ml-auto" onClick={onCreateEmployee}>
              <Plus className="h-4 w-4 mr-1" /> Aggiungi
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.employees.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nessun dipendente trovato</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Telefono</TableHead>
                  <TableHead>Ore/mese</TableHead>
                  <TableHead>Lordo</TableHead>
                  <TableHead>Netto</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead>Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.employees.map((emp) => (
                  <TableRow key={emp.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 text-xs font-bold">
                          {emp.first_name[0]}{emp.last_name[0]}
                        </div>
                        <div>
                          <p>{emp.first_name} {emp.last_name}</p>
                          {emp.email && <p className="text-xs text-muted-foreground">{emp.email}</p>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{emp.phone || "—"}</TableCell>
                    <TableCell className="font-medium">{emp.monthly_hours}h</TableCell>
                    <TableCell className="font-medium">{formatCurrency(emp.gross_salary)}</TableCell>
                    <TableCell className="font-medium">{formatCurrency(emp.net_salary)}</TableCell>
                    <TableCell>
                      {emp.user_id ? <Badge variant="default" className="bg-emerald-600 text-xs">Attivo</Badge> : <Badge variant="secondary" className="text-xs">No account</Badge>}
                    </TableCell>
                    <TableCell>
                      {emp.is_active ? <Badge variant="default" className="text-xs">Attivo</Badge> : <Badge variant="destructive" className="text-xs">Inattivo</Badge>}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {!emp.user_id && emp.email && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={creatingAccountFor === emp.id}
                            onClick={() => onCreateAccount("employee", emp.id, emp.email!, `${emp.first_name} ${emp.last_name}`)}
                          >
                            {creatingAccountFor === emp.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4 mr-1" />}
                            Crea Account
                          </Button>
                        )}
                        {emp.user_id && (onDeleteUser || onResetPassword) && (
                          <MemberActions
                            userId={emp.user_id}
                            name={`${emp.first_name} ${emp.last_name}`}
                            hasAccount
                            onDelete={onDeleteUser ? () => setDeleteTarget({ id: emp.user_id, name: `${emp.first_name} ${emp.last_name}` }) : undefined}
                            onResetPassword={onResetPassword}
                          />
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

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              L'account login verrà rimosso dall'azienda. Se è collegato a un venditore o dipendente, la scheda operativa resta nel team come persona senza login.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              disabled={isDeletingUser}
              onClick={() => {
                if (deleteTarget && onDeleteUser) {
                  onDeleteUser(deleteTarget.id, deleteTarget.name);
                }
                setDeleteTarget(null);
              }}
            >
              {isDeletingUser && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Trash2 className="h-4 w-4 mr-2" />
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Row-level actions dropdown ────────────────────────────────────────────────

function MemberActions({
  userId, name, hasAccount,
  onDelete, onResetPassword,
}: {
  userId: string;
  name: string;
  hasAccount: boolean;
  onDelete?: () => void;
  onResetPassword?: (userId: string, name: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {hasAccount && onResetPassword && (
          <DropdownMenuItem onClick={() => onResetPassword(userId, name)}>
            <Key className="h-4 w-4 mr-2" />
            Reset Password
          </DropdownMenuItem>
        )}
        {onDelete && (
          <>
            {onResetPassword && <DropdownMenuSeparator />}
            <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
              <Trash2 className="h-4 w-4 mr-2" />
              Elimina Utente
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
