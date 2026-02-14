import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Shield, UserCheck, TrendingUp, HardHat, Plus, Loader2, KeyRound } from "lucide-react";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/formatters";
import { PERMISSION_LABELS, commissionTypeLabels } from "@/lib/adminConstants";
import type { StaffPermissions } from "@/components/users/PermissionsDialog";

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
}

function getActivePermissions(permissions: any) {
  if (!permissions) return [];
  return Object.entries(PERMISSION_LABELS)
    .filter(([key]) => permissions[key] === true)
    .map(([, label]) => label);
}

export function CompanyTeamTab({
  teamData,
  totalTeam,
  onCreateStaff,
  onCreateSalesperson,
  onCreateEmployee,
  onEditPermissions,
  onCreateAccount,
  creatingAccountFor,
}: CompanyTeamTabProps) {
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-medium">{totalTeam} membri totali:</span>
            <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700">{teamData?.admins.length || 0} Admin</Badge>
            <Badge variant="default" className="bg-blue-600 hover:bg-blue-700">{teamData?.staff.length || 0} Staff</Badge>
            <Badge variant="default" className="bg-violet-600 hover:bg-violet-700">{teamData?.salespeople.length || 0} Venditori</Badge>
            <Badge variant="default" className="bg-amber-600 hover:bg-amber-700">{teamData?.employees.length || 0} Dipendenti</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Admin */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-emerald-600" />
            <CardTitle className="text-base">Admin Azienda</CardTitle>
            <Badge variant="secondary" className="ml-auto">{teamData?.admins.length || 0}</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {teamData?.admins.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nessun admin trovato</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Telefono</TableHead>
                  <TableHead>Creato il</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teamData?.admins.map((admin) => (
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
                    <TableCell className="text-muted-foreground">{format(new Date(admin.created_at), "dd/MM/yyyy")}</TableCell>
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
            <Badge variant="secondary">{teamData?.staff.length || 0}</Badge>
            <Button size="sm" variant="outline" className="ml-auto" onClick={onCreateStaff}>
              <Plus className="h-4 w-4 mr-1" /> Aggiungi
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {teamData?.staff.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nessun membro staff trovato</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Permessi</TableHead>
                  <TableHead>Creato il</TableHead>
                  <TableHead>Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teamData?.staff.map((member) => {
                  const perms = getActivePermissions(member.permissions);
                  const defaultPerms: StaffPermissions = {
                    can_view_dashboard: member.permissions?.can_view_dashboard ?? false,
                    can_view_orders: member.permissions?.can_view_orders ?? false,
                    can_edit_orders: member.permissions?.can_edit_orders ?? false,
                    can_view_warehouse: member.permissions?.can_view_warehouse ?? false,
                    can_edit_warehouse: member.permissions?.can_edit_warehouse ?? false,
                    can_view_calendar: member.permissions?.can_view_calendar ?? false,
                    can_view_customers: member.permissions?.can_view_customers ?? false,
                    can_edit_customers: member.permissions?.can_edit_customers ?? false,
                    can_view_employees: member.permissions?.can_view_employees ?? false,
                    can_view_tickets: member.permissions?.can_view_tickets ?? false,
                    can_edit_tickets: member.permissions?.can_edit_tickets ?? false,
                    can_view_forecast: member.permissions?.can_view_forecast ?? false,
                    can_view_settings: member.permissions?.can_view_settings ?? false,
                  };
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
                      <TableCell className="text-muted-foreground">{format(new Date(member.created_at), "dd/MM/yyyy")}</TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onEditPermissions({ id: member.id, name: `${member.first_name} ${member.last_name}`, permissions: defaultPerms })}
                        >
                          <Shield className="h-4 w-4 mr-1" /> Permessi
                        </Button>
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
            <Badge variant="secondary">{teamData?.salespeople.length || 0}</Badge>
            <Button size="sm" variant="outline" className="ml-auto" onClick={onCreateSalesperson}>
              <Plus className="h-4 w-4 mr-1" /> Aggiungi
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {teamData?.salespeople.length === 0 ? (
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
                {teamData?.salespeople.map((sp) => (
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
            <Badge variant="secondary">{teamData?.employees.length || 0}</Badge>
            <Button size="sm" variant="outline" className="ml-auto" onClick={onCreateEmployee}>
              <Plus className="h-4 w-4 mr-1" /> Aggiungi
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {teamData?.employees.length === 0 ? (
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
                {teamData?.employees.map((emp) => (
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
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
