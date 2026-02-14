import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building, Users, ClipboardList, AlertCircle } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import type { AdminDashboardStats } from "@/hooks/useAdminDashboardData";

interface Props {
  stats: AdminDashboardStats;
}

export function AdminStatCards({ stats }: Props) {
  const statCards = [
    {
      title: "Aziende Attive",
      value: stats.totalCompanies,
      icon: Building,
      description: "Registrate sulla piattaforma",
      color: "text-blue-600",
      bgColor: "bg-blue-100",
    },
    {
      title: "Ordini Totali",
      value: stats.totalOrders,
      icon: ClipboardList,
      description: formatCurrency(stats.totalOrdersValue) + " valore totale",
      color: "text-green-600",
      bgColor: "bg-green-100",
    },
    {
      title: "Clienti Totali",
      value: stats.totalCustomers,
      icon: Users,
      description: "Utenti registrati",
      color: "text-purple-600",
      bgColor: "bg-purple-100",
    },
    {
      title: "Ticket Aperti",
      value: stats.openTickets,
      icon: AlertCircle,
      description: "Richieste in attesa",
      color: stats.openTickets > 0 ? "text-orange-600" : "text-green-600",
      bgColor: stats.openTickets > 0 ? "bg-orange-100" : "bg-green-100",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {statCards.map((stat) => (
        <Card key={stat.title} className="relative overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {stat.title}
            </CardTitle>
            <div className={`p-2 rounded-lg ${stat.bgColor}`}>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stat.value}</div>
            <p className="text-xs text-muted-foreground mt-1">{stat.description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
