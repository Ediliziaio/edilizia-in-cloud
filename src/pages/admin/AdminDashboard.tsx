import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Building, 
  Users, 
  ClipboardList, 
  Plus, 
  Loader2, 
  Euro,
  AlertCircle,
  TrendingUp,
  Clock,
  MessageSquare
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import { formatCurrency } from "@/lib/formatters";

interface Stats {
  totalCompanies: number;
  totalOrders: number;
  totalOrdersValue: number;
  totalCustomers: number;
  openTickets: number;
}

interface RecentCompany {
  id: string;
  name: string;
  email: string;
  sector: string;
  logo_url: string | null;
  created_at: string;
}

interface RecentActivity {
  id: string;
  type: "order" | "ticket" | "company";
  title: string;
  subtitle: string;
  created_at: string;
}

const sectorLabels: Record<string, string> = {
  serramenti: "Serramenti",
  infissi: "Infissi",
  bagni: "Bagni",
  tetti: "Tetti",
  fotovoltaico: "Fotovoltaico",
  pittura: "Pittura",
  ristrutturazioni: "Ristrutturazioni",
  altro: "Altro",
};

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats>({ 
    totalCompanies: 0, 
    totalOrders: 0, 
    totalOrdersValue: 0,
    totalCustomers: 0,
    openTickets: 0,
  });
  const [recentCompanies, setRecentCompanies] = useState<RecentCompany[]>([]);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch all stats in parallel
        const [
          companiesRes,
          ordersRes,
          customersRes,
          ticketsRes,
          ordersValueRes,
          recentCompaniesRes,
          recentOrdersRes,
          recentTicketsRes,
        ] = await Promise.all([
          supabase.from("companies").select("id", { count: "exact", head: true }),
          supabase.from("orders").select("id", { count: "exact", head: true }),
          supabase.from("user_roles").select("id", { count: "exact", head: true }).eq("role", "customer"),
          supabase.from("tickets").select("id", { count: "exact", head: true }).neq("status", "risolto"),
          supabase.from("orders").select("total_amount"),
          supabase.from("companies").select("*").order("created_at", { ascending: false }).limit(5),
          supabase.from("orders").select(`
            id,
            description,
            created_at,
            company:companies(name)
          `).order("created_at", { ascending: false }).limit(5),
          supabase.from("tickets").select(`
            id,
            subject,
            created_at,
            company:companies(name)
          `).order("created_at", { ascending: false }).limit(5),
        ]);

        // Calculate total orders value
        const totalValue = ordersValueRes.data?.reduce((sum, order) => sum + (order.total_amount || 0), 0) || 0;

        setStats({
          totalCompanies: companiesRes.count || 0,
          totalOrders: ordersRes.count || 0,
          totalOrdersValue: totalValue,
          totalCustomers: customersRes.count || 0,
          openTickets: ticketsRes.count || 0,
        });

        setRecentCompanies(recentCompaniesRes.data as RecentCompany[] || []);

        // Combine and sort recent activity
        const activities: RecentActivity[] = [];
        
        recentOrdersRes.data?.forEach((order: any) => {
          activities.push({
            id: order.id,
            type: "order",
            title: order.description?.substring(0, 50) || "Nuovo ordine",
            subtitle: order.company?.name || "Azienda",
            created_at: order.created_at,
          });
        });

        recentTicketsRes.data?.forEach((ticket: any) => {
          activities.push({
            id: ticket.id,
            type: "ticket",
            title: ticket.subject,
            subtitle: ticket.company?.name || "Azienda",
            created_at: ticket.created_at,
          });
        });

        // Sort by date and take top 8
        activities.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setRecentActivity(activities.slice(0, 8));

      } catch (error) {
        console.error("Error fetching stats:", error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
  }, []);

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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard Super Admin</h1>
          <p className="text-muted-foreground">Panoramica globale della piattaforma</p>
        </div>
        <Button asChild>
          <Link to="/admin/aziende/nuova">
            <Plus className="h-4 w-4 mr-2" />
            Nuova Azienda
          </Link>
        </Button>
      </div>

      {/* Stats Grid */}
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

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Companies */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg">Aziende Recenti</CardTitle>
              <CardDescription>Ultime aziende registrate</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link to="/admin/aziende">Vedi tutte</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {recentCompanies.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Building className="h-10 w-10 mx-auto mb-2 opacity-50" />
                <p>Nessuna azienda registrata</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentCompanies.map((company) => (
                  <Link
                    key={company.id}
                    to={`/admin/aziende/${company.id}`}
                    className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                  >
                    {company.logo_url ? (
                      <img
                        src={company.logo_url}
                        alt={company.name}
                        className="h-10 w-10 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Building className="h-5 w-5 text-primary" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{company.name}</p>
                      <p className="text-sm text-muted-foreground truncate">{company.email}</p>
                    </div>
                    <Badge variant="secondary" className="shrink-0">
                      {sectorLabels[company.sector] || company.sector}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg">Attività Recente</CardTitle>
              <CardDescription>Ultimi ordini e ticket</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {recentActivity.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="h-10 w-10 mx-auto mb-2 opacity-50" />
                <p>Nessuna attività recente</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentActivity.map((activity) => (
                  <div
                    key={`${activity.type}-${activity.id}`}
                    className="flex items-start gap-3 p-3 rounded-lg border"
                  >
                    <div className={`p-2 rounded-lg shrink-0 ${
                      activity.type === "order" ? "bg-green-100" : "bg-orange-100"
                    }`}>
                      {activity.type === "order" ? (
                        <ClipboardList className="h-4 w-4 text-green-600" />
                      ) : (
                        <MessageSquare className="h-4 w-4 text-orange-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{activity.title}</p>
                      <p className="text-xs text-muted-foreground">{activity.subtitle}</p>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatDistanceToNow(new Date(activity.created_at), { 
                        addSuffix: true, 
                        locale: it 
                      })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Azioni Rapide</CardTitle>
          <CardDescription>Accedi velocemente alle funzionalità principali</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button variant="outline" asChild>
            <Link to="/admin/aziende">
              <Building className="h-4 w-4 mr-2" />
              Gestisci Aziende
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/admin/ordini">
              <ClipboardList className="h-4 w-4 mr-2" />
              Vedi Ordini Globali
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/admin/ticket">
              <MessageSquare className="h-4 w-4 mr-2" />
              Gestisci Ticket
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/admin/aziende/nuova">
              <Plus className="h-4 w-4 mr-2" />
              Crea Nuova Azienda
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
