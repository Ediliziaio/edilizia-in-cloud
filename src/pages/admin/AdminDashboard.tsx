import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building, Users, ClipboardList, Plus, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";

interface Stats {
  totalCompanies: number;
  totalOrders: number;
  totalCustomers: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats>({ totalCompanies: 0, totalOrders: 0, totalCustomers: 0 });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const [companiesRes, ordersRes, customersRes] = await Promise.all([
          supabase.from("companies").select("id", { count: "exact", head: true }),
          supabase.from("orders").select("id", { count: "exact", head: true }),
          supabase.from("user_roles").select("id", { count: "exact", head: true }).eq("role", "customer"),
        ]);

        setStats({
          totalCompanies: companiesRes.count || 0,
          totalOrders: ordersRes.count || 0,
          totalCustomers: customersRes.count || 0,
        });
      } catch (error) {
        console.error("Error fetching stats:", error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchStats();
  }, []);

  const statCards = [
    {
      title: "Aziende Attive",
      value: stats.totalCompanies,
      icon: Building,
      description: "Aziende registrate sulla piattaforma",
    },
    {
      title: "Ordini Totali",
      value: stats.totalOrders,
      icon: ClipboardList,
      description: "Ordini gestiti da tutte le aziende",
    },
    {
      title: "Clienti Totali",
      value: stats.totalCustomers,
      icon: Users,
      description: "Clienti registrati sulla piattaforma",
    },
  ];

  return (
    <div className="space-y-6">
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

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {statCards.map((stat) => (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <stat.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground mt-1">{stat.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Azioni Rapide</CardTitle>
          <CardDescription>Accedi velocemente alle funzionalità principali</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4">
          <Button variant="outline" asChild>
            <Link to="/admin/aziende">
              <Building className="h-4 w-4 mr-2" />
              Gestisci Aziende
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
