import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ClipboardList, Users, MessageSquare, BarChart3, LogIn } from "lucide-react";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/formatters";
import { ticketStatusLabels } from "@/lib/adminConstants";

interface CompanyStats {
  ordersCount: number;
  ordersValue: number;
  customersCount: number;
  ticketsCount: number;
  openTicketsCount: number;
  teamCount: number;
}

interface CompanyActivityTabProps {
  stats: CompanyStats | null;
  totalTeam: number;
  teamData: { admins: any[]; staff: any[]; salespeople: any[]; employees: any[] } | null | undefined;
  recentOrders: any[] | undefined;
  recentTickets: any[] | undefined;
  onImpersonate: () => void;
  onImpersonateAndNavigate: (path: string) => void;
}

export function CompanyActivityTab({
  stats,
  totalTeam,
  teamData,
  recentOrders,
  recentTickets,
  onImpersonate,
  onImpersonateAndNavigate,
}: CompanyActivityTabProps) {
  const avgOrderValue = stats && stats.ordersCount > 0 ? stats.ordersValue / stats.ordersCount : 0;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Ordini</CardTitle>
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.ordersCount || 0}</div>
            <p className="text-xs text-muted-foreground">{formatCurrency(stats?.ordersValue || 0)} totale</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Valore Medio</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(avgOrderValue)}</div>
            <p className="text-xs text-muted-foreground">per ordine</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Clienti</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.customersCount || 0}</div>
            <p className="text-xs text-muted-foreground">registrati</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Team</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalTeam}</div>
            <p className="text-xs text-muted-foreground">
              {teamData?.admins.length || 0}A · {teamData?.staff.length || 0}S · {teamData?.salespeople.length || 0}V · {teamData?.employees.length || 0}D
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Ticket Aperti</CardTitle>
            <MessageSquare className={`h-4 w-4 ${(stats?.openTicketsCount || 0) > 0 ? "text-orange-500" : "text-green-500"}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${(stats?.openTicketsCount || 0) > 0 ? "text-orange-600" : "text-green-600"}`}>
              {stats?.openTicketsCount || 0}
            </div>
            <p className="text-xs text-muted-foreground">{stats?.ticketsCount || 0} totali</p>
          </CardContent>
        </Card>
      </div>

      {/* Ultimi ordini e ticket */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-primary" />
              Ultimi Ordini
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {!recentOrders || recentOrders.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Nessun ordine</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Descrizione</TableHead>
                    <TableHead>Importo</TableHead>
                    <TableHead>Stato</TableHead>
                    <TableHead>Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentOrders.map((order) => {
                    const statusInfo = order.order_statuses as { name: string; color: string; icon: string } | null;
                    return (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium max-w-[200px] truncate">{order.description}</TableCell>
                        <TableCell className="font-medium">{formatCurrency(order.total_amount)}</TableCell>
                        <TableCell>
                          {statusInfo ? (
                            <Badge variant="outline" className="text-xs" style={{ borderColor: statusInfo.color, color: statusInfo.color }}>
                              {statusInfo.name}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">{format(new Date(order.created_at), "dd/MM/yy")}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" />
              Ultimi Ticket
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {!recentTickets || recentTickets.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Nessun ticket</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Oggetto</TableHead>
                    <TableHead>Stato</TableHead>
                    <TableHead>Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentTickets.map((ticket) => {
                    const tStatus = ticketStatusLabels[ticket.status] || { label: ticket.status, variant: "outline" as const };
                    return (
                      <TableRow key={ticket.id}>
                        <TableCell className="font-medium max-w-[250px] truncate">{ticket.subject}</TableCell>
                        <TableCell>
                          <Badge variant={tStatus.variant} className="text-xs">{tStatus.label}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">{format(new Date(ticket.created_at), "dd/MM/yy")}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Azioni rapide */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Azioni Rapide</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={onImpersonate}>
            <LogIn className="h-4 w-4 mr-2" />
            Accedi al pannello azienda
          </Button>
          <Button variant="outline" onClick={() => onImpersonateAndNavigate("/azienda/ordini")}>
            <ClipboardList className="h-4 w-4 mr-2" />
            Visualizza ordini ({stats?.ordersCount || 0})
          </Button>
          <Button variant="outline" onClick={() => onImpersonateAndNavigate("/azienda/assistenza")}>
            <MessageSquare className="h-4 w-4 mr-2" />
            Gestisci ticket ({stats?.ticketsCount || 0})
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
