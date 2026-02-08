import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, Loader2, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { formatCurrency } from "@/lib/formatters";

interface Order {
  id: string;
  description: string;
  total_amount: number;
  deposit_amount: number;
  balance_amount: number;
  expected_date: string | null;
  created_at: string;
  status: {
    name: string;
    color: string;
    icon: string;
  } | null;
}

export default function CustomerOrders() {
  const { user, company } = useAuth();

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["customer-orders", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(`
          id,
          description,
          total_amount,
          deposit_amount,
          balance_amount,
          expected_date,
          created_at,
          status:order_statuses(name, color, icon)
        `)
        .eq("customer_id", user!.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as unknown as Order[];
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000, // 2 minuti
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">I Miei Ordini</h1>
        <p className="text-muted-foreground">
          Visualizza lo stato dei tuoi ordini con {company?.name}
        </p>
      </div>

      {orders.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <ClipboardList className="h-16 w-16 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium mb-2">Nessun ordine presente</h3>
            <p className="text-muted-foreground text-center max-w-md">
              Non hai ancora ordini attivi. Contatta l'azienda per effettuare un nuovo ordine.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <Card key={order.id} className="overflow-hidden hover:shadow-md transition-shadow">
              <Link to={`/cliente/ordini/${order.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-start justify-between">
                        <h3 className="font-medium line-clamp-2">{order.description}</h3>
                        <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                      </div>
                      
                      {order.status && (
                        <Badge 
                          variant="secondary"
                          style={{ 
                            backgroundColor: order.status.color + "20", 
                            color: order.status.color,
                            borderColor: order.status.color + "40"
                          }}
                          className="border"
                        >
                          {order.status.name}
                        </Badge>
                      )}
                      
                      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
                        <span>Totale: <span className="text-foreground font-medium">{formatCurrency(order.total_amount)}</span></span>
                        <span>Acconto: <span className="text-foreground">{formatCurrency(order.deposit_amount)}</span></span>
                        <span>Saldo: <span className="text-foreground">{formatCurrency(order.balance_amount)}</span></span>
                      </div>
                      
                      {order.expected_date && (
                        <p className="text-sm text-muted-foreground">
                          Data prevista: {new Date(order.expected_date).toLocaleDateString("it-IT")}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
