import { useState, useMemo } from "react";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { escapeCsvCell } from "@/lib/csvExport";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
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
  Download, Mail, Phone, Filter, Wallet,
} from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { formatCurrency } from "@/lib/formatters";
import { PERMISSION_LABELS, commissionTypeLabels } from "@/lib/adminConstants";
import type { StaffPermissions } from "@/components/users/PermissionsDialog";
import { DEFAULT_PERMISSIONS } from "@/components/users/permissionsDefaults";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface PersonFields {
  id: string;
  user_id?: string | null;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  created_at?: string | null;
  last_login_at?: string | null;
}

interface StaffMember extends PersonFields {
  permissions?: Partial<StaffPermissions> | null;
}

interface SalespersonMember extends PersonFields {
  commission_type: string;
  commission_value: number;
  is_active?: boolean | null;
}

interface EmployeeMember extends PersonFields {
  monthly_hours: number;
  gross_salary: number;
  net_salary: number;
  is_active?: boolean | null;
}

interface TeamData {
  admins: PersonFields[];
  staff: StaffMember[];
  salespeople: SalespersonMember[];
  employees: EmployeeMember[];
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

function getActivePermissions(permissions?: Partial<StaffPermissions> | null) {
  if (!permissions) return [];
  return Object.entries(PERMISSION_LABELS)
    .filter(([key]) => permissions[key as keyof StaffPermissions] === true)
    .map(([, label]) => label);
}

function LastAccessBadge({ lastLoginAt }: { lastLoginAt?: string | null }) {
  if (!lastLoginAt)
    return (
      <Badge variant="secondary" className="text-xs gap-1">
        <Clock className="h-3 w-3" />Mai
      </Badge>
    );
  const days = differenceInDays(new Date(), new Date(lastLoginAt));
  if (days <= 3)
    return (
      <Badge variant="default" className="bg-emerald-600 text-xs gap-1">
        <Clock className="h-3 w-3" />
        {days === 0 ? "Oggi" : `${days}gg fa`}
      </Badge>
    );
  if (days <= 14)
    return (
      <Badge variant="outline" className="border-amber-500/30 text-amber-600 text-xs gap-1">
        <Clock className="h-3 w-3" />
        {days}gg fa
      </Badge>
    );
  return (
    <Badge variant="outline" className="border-destructive/30 text-destructive text-xs gap-1">
      <Clock className="h-3 w-3" />
      {days}gg fa
    </Badge>
  );
}

function getDisplayName(member: PersonFields): string {
  const name = `${member.first_name || ""} ${member.last_name || ""}`.trim();
  return name || member.email || "Senza nome";
}

function getInitials(member: PersonFields): string {
  const source = getDisplayName(member);
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return format(date, "dd/MM/yyyy");
}

function matchesSearch(member: PersonFields, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const name = getDisplayName(member).toLowerCase();
  const email = (member.email || "").toLowerCase();
  return name.includes(q) || email.includes(q);
}

/** True se `last_login_at` è > N giorni fa (o assente). */
function isInactive(member: PersonFields, daysThreshold = 30): boolean {
  if (!member.last_login_at) return true;
  return differenceInDays(new Date(), new Date(member.last_login_at)) > daysThreshold;
}

/** Email cliccabile mailto */
function EmailLink({ email }: { email?: string | null }) {
  if (!email) return <span className="text-muted-foreground">—</span>;
  return (
    <a
      href={`mailto:${email}`}
      className="text-muted-foreground hover:text-primary inline-flex items-center gap-1 max-w-[220px]"
    >
      <Mail className="h-3 w-3 shrink-0" />
      <span className="truncate">{email}</span>
    </a>
  );
}

/** Phone cliccabile tel: */
function PhoneLink({ phone }: { phone?: string | null }) {
  if (!phone) return <span className="text-muted-foreground">—</span>;
  return (
    <a
      href={`tel:${phone.replace(/\s/g, "")}`}
      className="text-muted-foreground hover:text-primary inline-flex items-center gap-1"
    >
      <Phone className="h-3 w-3 shrink-0" />
      <span>{phone}</span>
    </a>
  );
}

/** CSV escape RFC 4180 + anti formula-injection (separatore ,) */
function csvEscape(v: string | number | null | undefined): string {
  return escapeCsvCell(v, ",");
}

export function CompanyTeamTab({
  teamData, totalTeam,
  onCreateStaff, onCreateSalesperson, onCreateEmployee,
  onEditPermissions, onCreateAccount, creatingAccountFor,
  onDeleteUser, onResetPassword, isDeletingUser, isResettingPassword: _isResettingPassword,
  isRefreshing, onRefresh,
}: CompanyTeamTabProps) {
  const [search, setSearch] = useState("");
  const [showOnlyInactive, setShowOnlyInactive] = useState(false);
  const [showOnlyNoAccount, setShowOnlyNoAccount] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const filtered = useMemo(() => {
    if (!teamData) return { admins: [], staff: [], salespeople: [], employees: [] };
    const applyFilters = <T extends PersonFields>(rows: T[]): T[] => {
      return rows.filter((m) => {
        if (!matchesSearch(m, search)) return false;
        if (showOnlyInactive && !isInactive(m)) return false;
        if (showOnlyNoAccount && !!m.user_id) return false;
        return true;
      });
    };
    return {
      admins: applyFilters(teamData.admins),
      staff: applyFilters(teamData.staff),
      salespeople: applyFilters(teamData.salespeople),
      employees: applyFilters(teamData.employees),
    };
  }, [teamData, search, showOnlyInactive, showOnlyNoAccount]);

  // === KPI compute ===
  const kpi = useMemo(() => {
    if (!teamData) {
      return {
        withAccount: 0,
        withoutAccount: 0,
        active7d: 0,
        inactive30d: 0,
        totalPayrollGross: 0,
      };
    }
    const allMembers: PersonFields[] = [
      ...teamData.admins,
      ...teamData.staff,
      ...teamData.salespeople,
      ...teamData.employees,
    ];
    const accountIds = new Set<string>();
    teamData.admins.forEach((m) => accountIds.add(m.id));
    teamData.staff.forEach((m) => accountIds.add(m.id));
    teamData.salespeople.forEach((m) => {
      if (m.user_id) accountIds.add(m.user_id);
    });
    teamData.employees.forEach((m) => {
      if (m.user_id) accountIds.add(m.user_id);
    });
    const withAccount = accountIds.size;

    const active7d = allMembers.filter(
      (m) =>
        m.last_login_at &&
        differenceInDays(new Date(), new Date(m.last_login_at)) <= 7,
    ).length;
    const inactive30d = allMembers.filter((m) => isInactive(m, 30)).length;
    const totalPayrollGross = teamData.employees.reduce(
      (sum, e) => sum + (e.gross_salary ?? 0),
      0,
    );

    return {
      withAccount,
      withoutAccount: Math.max(0, totalTeam - withAccount),
      active7d,
      inactive30d,
      totalPayrollGross,
    };
  }, [teamData, totalTeam]);

  // === CSV Export ===
  const handleExportCsv = () => {
    if (!teamData) return;
    const rows: Array<{
      role: string;
      name: string;
      email: string;
      phone: string;
      last_login: string;
      created: string;
      account: string;
      extra: string;
    }> = [];

    teamData.admins.forEach((m) =>
      rows.push({
        role: "Admin",
        name: getDisplayName(m),
        email: m.email ?? "",
        phone: m.phone ?? "",
        last_login: m.last_login_at
          ? format(new Date(m.last_login_at), "yyyy-MM-dd HH:mm")
          : "",
        created: m.created_at ? format(new Date(m.created_at), "yyyy-MM-dd") : "",
        account: "Sì",
        extra: "",
      }),
    );
    teamData.staff.forEach((m) => {
      const perms = getActivePermissions(m.permissions);
      rows.push({
        role: "Staff",
        name: getDisplayName(m),
        email: m.email ?? "",
        phone: m.phone ?? "",
        last_login: m.last_login_at
          ? format(new Date(m.last_login_at), "yyyy-MM-dd HH:mm")
          : "",
        created: m.created_at ? format(new Date(m.created_at), "yyyy-MM-dd") : "",
        account: "Sì",
        extra: `Permessi: ${perms.join(" | ") || "Nessuno"}`,
      });
    });
    teamData.salespeople.forEach((m) =>
      rows.push({
        role: "Venditore",
        name: getDisplayName(m),
        email: m.email ?? "",
        phone: m.phone ?? "",
        last_login: m.last_login_at
          ? format(new Date(m.last_login_at), "yyyy-MM-dd HH:mm")
          : "",
        created: m.created_at ? format(new Date(m.created_at), "yyyy-MM-dd") : "",
        account: m.user_id ? "Sì" : "No",
        extra: `Provvigione: ${
          m.commission_type === "fixed_per_order"
            ? formatCurrency(m.commission_value)
            : `${m.commission_value}%`
        } (${commissionTypeLabels[m.commission_type] || m.commission_type})`,
      }),
    );
    teamData.employees.forEach((m) =>
      rows.push({
        role: "Dipendente",
        name: getDisplayName(m),
        email: m.email ?? "",
        phone: m.phone ?? "",
        last_login: m.last_login_at
          ? format(new Date(m.last_login_at), "yyyy-MM-dd HH:mm")
          : "",
        created: m.created_at ? format(new Date(m.created_at), "yyyy-MM-dd") : "",
        account: m.user_id ? "Sì" : "No",
        extra: `${m.monthly_hours}h · Lordo ${formatCurrency(m.gross_salary)} · Netto ${formatCurrency(m.net_salary)}`,
      }),
    );

    const headers = [
      "Ruolo", "Nome", "Email", "Telefono", "Ultimo accesso", "Creato", "Account", "Extra",
    ];
    const csv = [
      headers.join(","),
      ...rows.map((r) =>
        [
          csvEscape(r.role),
          csvEscape(r.name),
          csvEscape(r.email),
          csvEscape(r.phone),
          csvEscape(r.last_login),
          csvEscape(r.created),
          csvEscape(r.account),
          csvEscape(r.extra),
        ].join(","),
      ),
    ].join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `team-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Esportate ${rows.length} persone`);
  };

  const hasActiveFilters = !!search || showOnlyInactive || showOnlyNoAccount;

  return (
    <div className="space-y-6">
      {/* === KPI Strip esteso === */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-2.5">
            <div className="rounded-lg p-2 bg-primary/10">
              <Users className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
                Totale
              </p>
              <p className="text-xl font-bold leading-tight">{totalTeam}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-2.5">
            <div className="rounded-lg p-2 bg-emerald-500/10">
              <UserCheck className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
                Account login
              </p>
              <p className="text-xl font-bold leading-tight">{kpi.withAccount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-2.5">
            <div
              className={cn(
                "rounded-lg p-2",
                kpi.active7d > 0
                  ? "bg-blue-500/10"
                  : "bg-muted",
              )}
            >
              <Clock
                className={cn(
                  "h-4 w-4",
                  kpi.active7d > 0 ? "text-blue-600" : "text-muted-foreground",
                )}
              />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
                Attivi 7gg
              </p>
              <p className="text-xl font-bold leading-tight">{kpi.active7d}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-2.5">
            <div
              className={cn(
                "rounded-lg p-2",
                kpi.inactive30d > 0 ? "bg-amber-500/10" : "bg-muted",
              )}
            >
              <UserX
                className={cn(
                  "h-4 w-4",
                  kpi.inactive30d > 0 ? "text-amber-600" : "text-muted-foreground",
                )}
              />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
                Inattivi &gt;30gg
              </p>
              <p className="text-xl font-bold leading-tight">{kpi.inactive30d}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-2.5">
            <div className="rounded-lg p-2 bg-violet-500/10">
              <Wallet className="h-4 w-4 text-violet-600" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
                Payroll lordo/mese
              </p>
              <p className="text-lg font-bold leading-tight">
                {kpi.totalPayrollGross > 0
                  ? formatCurrency(kpi.totalPayrollGross)
                  : "—"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* === Toolbar: search + filtri + actions === */}
      <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center flex-wrap">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca per nome o email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Filtri toggle */}
        <Button
          variant={showOnlyInactive ? "default" : "outline"}
          size="sm"
          onClick={() => setShowOnlyInactive((s) => !s)}
          className="h-9"
        >
          <Filter className="h-3.5 w-3.5 mr-1.5" />
          Solo inattivi (&gt;30gg)
          {showOnlyInactive && kpi.inactive30d > 0 && (
            <Badge variant="secondary" className="ml-2 h-4 px-1 text-[10px]">
              {kpi.inactive30d}
            </Badge>
          )}
        </Button>
        <Button
          variant={showOnlyNoAccount ? "default" : "outline"}
          size="sm"
          onClick={() => setShowOnlyNoAccount((s) => !s)}
          className="h-9"
        >
          <Filter className="h-3.5 w-3.5 mr-1.5" />
          Senza login
          {showOnlyNoAccount && kpi.withoutAccount > 0 && (
            <Badge variant="secondary" className="ml-2 h-4 px-1 text-[10px]">
              {kpi.withoutAccount}
            </Badge>
          )}
        </Button>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 text-xs"
            onClick={() => {
              setSearch("");
              setShowOnlyInactive(false);
              setShowOnlyNoAccount(false);
            }}
          >
            Reset filtri
          </Button>
        )}

        <div className="flex items-center gap-2 ml-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            disabled={!teamData || totalTeam === 0}
            className="h-9"
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />
            CSV
          </Button>
          {onRefresh && (
            <Button
              variant="outline"
              size="icon"
              onClick={onRefresh}
              disabled={isRefreshing}
              title="Aggiorna team"
              className="h-9 w-9"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            </Button>
          )}
        </div>
      </div>

      {/* Composizione team */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Composizione team</CardTitle>
          <CardDescription>
            Totale calcolato su persone uniche: lo staff interno non include venditori
            o dipendenti che hanno un account operativo.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0 pb-4">
          <div className="flex items-center gap-3 flex-wrap">
            <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700">
              {filtered.admins.length} Admin
            </Badge>
            <Badge variant="default" className="bg-blue-600 hover:bg-blue-700">
              {filtered.staff.length} Staff
            </Badge>
            <Badge variant="default" className="bg-violet-600 hover:bg-violet-700">
              {filtered.salespeople.length} Venditori
            </Badge>
            <Badge variant="default" className="bg-amber-600 hover:bg-amber-700">
              {filtered.employees.length} Dipendenti
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Admin */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-emerald-600" />
            <CardTitle className="text-base">Admin Azienda</CardTitle>
            <Badge variant="secondary" className="ml-auto">
              {filtered.admins.length}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.admins.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              {hasActiveFilters
                ? "Nessun admin con i filtri correnti"
                : "Nessun admin trovato"}
            </p>
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
                          {getInitials(admin)}
                        </div>
                        {getDisplayName(admin)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <EmailLink email={admin.email} />
                    </TableCell>
                    <TableCell>
                      <PhoneLink phone={admin.phone} />
                    </TableCell>
                    <TableCell>
                      <LastAccessBadge lastLoginAt={admin.last_login_at} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(admin.created_at)}
                    </TableCell>
                    {(onDeleteUser || onResetPassword) && (
                      <TableCell>
                        <MemberActions
                          userId={admin.user_id || admin.id}
                          name={getDisplayName(admin)}
                          hasAccount
                          onDelete={
                            onDeleteUser
                              ? () =>
                                  setDeleteTarget({
                                    id: admin.user_id || admin.id,
                                    name: getDisplayName(admin),
                                  })
                              : undefined
                          }
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
            <div className="text-center py-6">
              <p className="text-sm text-muted-foreground">
                {hasActiveFilters
                  ? "Nessun membro staff con i filtri correnti"
                  : "Nessun membro staff"}
              </p>
              {!hasActiveFilters && (
                <Button
                  size="sm"
                  variant="link"
                  onClick={onCreateStaff}
                  className="mt-1 text-xs"
                >
                  Aggiungi il primo
                </Button>
              )}
            </div>
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
                  const defaultPerms: StaffPermissions = { ...DEFAULT_PERMISSIONS };
                  (Object.keys(DEFAULT_PERMISSIONS) as Array<keyof StaffPermissions>).forEach(
                    (key) => {
                      defaultPerms[key] = member.permissions?.[key] ?? false;
                    },
                  );
                  return (
                    <TableRow key={member.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-bold">
                            {getInitials(member)}
                          </div>
                          {getDisplayName(member)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <EmailLink email={member.email} />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {perms.length === 0 ? (
                            <span className="text-sm text-muted-foreground">
                              Nessun permesso
                            </span>
                          ) : perms.length <= 4 ? (
                            perms.map((p) => (
                              <Badge key={p} variant="outline" className="text-xs px-1.5 py-0">
                                {p}
                              </Badge>
                            ))
                          ) : (
                            <>
                              {perms.slice(0, 3).map((p) => (
                                <Badge
                                  key={p}
                                  variant="outline"
                                  className="text-xs px-1.5 py-0"
                                >
                                  {p}
                                </Badge>
                              ))}
                              <Badge variant="secondary" className="text-xs px-1.5 py-0">
                                +{perms.length - 3} altri
                              </Badge>
                            </>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <LastAccessBadge lastLoginAt={member.last_login_at} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(member.created_at)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              onEditPermissions({
                                id: member.id,
                                name: getDisplayName(member),
                                permissions: defaultPerms,
                              })
                            }
                          >
                            <Shield className="h-4 w-4 mr-1" /> Permessi
                          </Button>
                          {(onDeleteUser || onResetPassword) && (
                            <MemberActions
                              userId={member.id}
                              name={getDisplayName(member)}
                              hasAccount
                              onDelete={
                                onDeleteUser
                                  ? () =>
                                      setDeleteTarget({
                                        id: member.id,
                                        name: getDisplayName(member),
                                      })
                                  : undefined
                              }
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
            <Button
              size="sm"
              variant="outline"
              className="ml-auto"
              onClick={onCreateSalesperson}
            >
              <Plus className="h-4 w-4 mr-1" /> Aggiungi
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.salespeople.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-sm text-muted-foreground">
                {hasActiveFilters
                  ? "Nessun venditore con i filtri correnti"
                  : "Nessun venditore"}
              </p>
              {!hasActiveFilters && (
                <Button
                  size="sm"
                  variant="link"
                  onClick={onCreateSalesperson}
                  className="mt-1 text-xs"
                >
                  Aggiungi il primo
                </Button>
              )}
            </div>
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
                          {getInitials(sp)}
                        </div>
                        <div>
                          <p>{getDisplayName(sp)}</p>
                          {sp.email && <EmailLink email={sp.email} />}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <PhoneLink phone={sp.phone} />
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">
                        {sp.commission_type === "fixed_per_order"
                          ? formatCurrency(sp.commission_value)
                          : `${sp.commission_value}%`}
                      </span>
                      <span className="text-xs text-muted-foreground ml-1">
                        {commissionTypeLabels[sp.commission_type] || sp.commission_type}
                      </span>
                    </TableCell>
                    <TableCell>
                      {sp.user_id ? (
                        <Badge variant="default" className="bg-emerald-600 text-xs">
                          Attivo
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">
                          No account
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {sp.is_active ? (
                        <Badge variant="default" className="text-xs">
                          Attivo
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="text-xs">
                          Inattivo
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {!sp.user_id && sp.email && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={creatingAccountFor === sp.id}
                            onClick={() =>
                              onCreateAccount(
                                "salesperson",
                                sp.id,
                                sp.email!,
                                getDisplayName(sp),
                              )
                            }
                          >
                            {creatingAccountFor === sp.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <KeyRound className="h-4 w-4 mr-1" />
                            )}
                            Crea Account
                          </Button>
                        )}
                        {sp.user_id && (onDeleteUser || onResetPassword) && (
                          <MemberActions
                            userId={sp.user_id}
                            name={getDisplayName(sp)}
                            hasAccount
                            onDelete={
                              onDeleteUser
                                ? () =>
                                    setDeleteTarget({
                                      id: sp.user_id!,
                                      name: getDisplayName(sp),
                                    })
                                : undefined
                            }
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
            <Button
              size="sm"
              variant="outline"
              className="ml-auto"
              onClick={onCreateEmployee}
            >
              <Plus className="h-4 w-4 mr-1" /> Aggiungi
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.employees.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-sm text-muted-foreground">
                {hasActiveFilters
                  ? "Nessun dipendente con i filtri correnti"
                  : "Nessun dipendente"}
              </p>
              {!hasActiveFilters && (
                <Button
                  size="sm"
                  variant="link"
                  onClick={onCreateEmployee}
                  className="mt-1 text-xs"
                >
                  Aggiungi il primo
                </Button>
              )}
            </div>
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
                          {getInitials(emp)}
                        </div>
                        <div>
                          <p>{getDisplayName(emp)}</p>
                          {emp.email && <EmailLink email={emp.email} />}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <PhoneLink phone={emp.phone} />
                    </TableCell>
                    <TableCell className="font-medium">{emp.monthly_hours}h</TableCell>
                    <TableCell className="font-medium">
                      {formatCurrency(emp.gross_salary)}
                    </TableCell>
                    <TableCell className="font-medium">
                      {formatCurrency(emp.net_salary)}
                    </TableCell>
                    <TableCell>
                      {emp.user_id ? (
                        <Badge variant="default" className="bg-emerald-600 text-xs">
                          Attivo
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">
                          No account
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {emp.is_active ? (
                        <Badge variant="default" className="text-xs">
                          Attivo
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="text-xs">
                          Inattivo
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {!emp.user_id && emp.email && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={creatingAccountFor === emp.id}
                            onClick={() =>
                              onCreateAccount(
                                "employee",
                                emp.id,
                                emp.email!,
                                getDisplayName(emp),
                              )
                            }
                          >
                            {creatingAccountFor === emp.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <KeyRound className="h-4 w-4 mr-1" />
                            )}
                            Crea Account
                          </Button>
                        )}
                        {emp.user_id && (onDeleteUser || onResetPassword) && (
                          <MemberActions
                            userId={emp.user_id}
                            name={getDisplayName(emp)}
                            hasAccount
                            onDelete={
                              onDeleteUser
                                ? () =>
                                    setDeleteTarget({
                                      id: emp.user_id!,
                                      name: getDisplayName(emp),
                                    })
                                : undefined
                            }
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
              L'account login verrà rimosso dall'azienda. Se è collegato a un venditore o
              dipendente, la scheda operativa resta nel team come persona senza login.
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
            <DropdownMenuItem
              onClick={onDelete}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Elimina Utente
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
