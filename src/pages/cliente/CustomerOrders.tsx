import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ClipboardList,
  Loader2,
  ChevronRight,
  AlertCircle,
  Search,
  ShoppingCart,
  CreditCard,
  CalendarDays,
  Mail,
  Activity,
} from "lucide-react";
import { Link } from "react-router-dom";
import { formatCurrency, formatRelativeTime } from "@/lib/formatters";
import { format, addDays } from "date-fns";
import { it } from "date-fns/locale";
import { useCustomerUnreadCount } from "@/hooks/useCustomerUnreadCount";

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

interface StatusHistoryEntry {
  id: string;
  changed_at: string;
  order: {
    id: string;
    description: string;
  } | null;
  status: {
    name: string;
    color: string;
    icon: string;
  } | null;
}

export default function CustomerOrders() {
  const { user, company } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const unreadCount = useCustomerUnreadCount();

  // ── Orders query ──────────────────────────────────────────
  const {
    data: orders = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["customer-orders", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          `
          id,
          description,
          total_amount,
          deposit_amount,
          balance_amount,
          expected_date,
          created_at,
          status:order_statuses(name, color, icon)
        `
        )
        .eq("customer_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      return data as unknown as Order[];
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
  });

  // ── Active orders count ───────────────────────────────────
  const activeOrdersCount = useMemo(() => {
    return orders.filter(
      (o) =>
        o.status &&
        !["completato", "annullato", "consegnato"].includes(
          o.status.name.toLowerCase()
        )
    ).length;
  }, [orders]);

  // ── Installments due within 7 days ────────────────────────
  const { data: dueSoonCount = 0 } = useQuery({
    queryKey: ["customer-installments-due", user?.id],
    queryFn: async () => {
      const now = new Date().toISOString().split("T")[0];
      const in7days = addDays(new Date(), 7).toISOString().split("T")[0];

      const { count, error } = await supabase
        .from("order_installments")
        .select("id, order_id, orders!inner(customer_id)", {
          count: "exact",
          head: true,
        })
        .eq("orders.customer_id", user!.id)
        .eq("is_paid", false)
        .gte("expected_date", now)
        .lte("expected_date", in7days);

      if (error) throw error;
      return count || 0;
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
  });

  // ── Next appointment (nearest expected_date in the future) ─
  const nextAppointment = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const upcoming = orders
      .filter((o) => o.expected_date && new Date(o.expected_date) >= today)
      .sort(
        (a, b) =>
          new Date(a.expected_date!).getTime() -
          new Date(b.expected_date!).getTime()
      );
    return upcoming.length > 0 ? upcoming[0].expected_date : null;
  }, [orders]);

  // ── Activity feed: last 5 status changes ──────────────────
  const { data: activityFeed = [] } = useQuery({
    queryKey: ["customer-activity-feed", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_status_history")
        .select(
          `
          id,
          changed_at,
          order:orders!inner(id, description),
          status:order_statuses(name, color, icon)
        `
        )
        .eq("orders.customer_id", user!.id)
        .order("changed_at", { ascending: false })
        .limit(5);

      if (error) throw error;
      return data as unknown as StatusHistoryEntry[];
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
  });

  // ── Client-side search filter ─────────────────────────────
  const filteredOrders = useMemo(() => {
    if (!searchQuery.trim()) return orders;
    const q = searchQuery.toLowerCase().trim();
    return orders.filter((o) => o.description.toLowerCase().includes(q));
  }, [orders, searchQuery]);

  // ── Loading state ─────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────
  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <p className="text-muted-foreground">
          Impossibile caricare gli ordini.
        </p>
        <Button variant="outline" onClick={() => refetch()}>
          Riprova
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">I Miei Ordini</h1>
        <p className="text-muted-foreground">
          Visualizza lo stato dei tuoi ordini con {company?.name}
        </p>
      </div>

      {/* FEATURE 1 — Dashboard Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-full bg-primary/10 p-2">
              <ShoppingCart className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Ordini attivi</p>
              <p className="text-xl font-bold">{activeOrdersCount}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-full bg-orange-500/10 p-2">
              <CreditCard className="h-5 w-5 text-orange-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">
                Pagamenti in scadenza
              </p>
              <p className="text-xl font-bold">{dueSoonCount}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-full bg-blue-500/10 p-2">
              <CalendarDays className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">
                Prossimo appuntamento
              </p>
              <p className="text-xl font-bold">
                {nextAppointment
                  ? format(new Date(nextAppointment), "d MMM", { locale: it })
                  : "Nessuno"}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-full bg-rose-500/10 p-2">
              <Mail className="h-5 w-5 text-rose-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">
                Messaggi non letti
              </p>
              <p className="text-xl font-bold">{unreadCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* FEATURE 3 — Activity Feed */}
      {activityFeed.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                Aggiornamenti recenti
              </h2>
            </div>
            <div className="space-y-3">
              {activityFeed.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-start gap-3 text-sm"
                >
                  {entry.status && (
                    <Badge
                      variant="secondary"
                      className="border flex-shrink-0 mt-0.5"
                      style={{
                        backgroundColor: entry.status.color + "20",
                        color: entry.status.color,
                        borderColor: entry.status.color + "40",
                      }}
                    >
                      {entry.status.name}
                    </Badge>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-foreground">
                      {entry.order?.description ?? "Ordine"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatRelativeTime(entry.changed_at)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* FEATURE 2 — Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Cerca ordine per descrizione..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Orders List */}
      {filteredOrders.length === 0 && orders.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <ClipboardList className="h-16 w-16 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium mb-2">
              Nessun ordine presente
            </h3>
            <p className="text-muted-foreground text-center max-w-md">
              Non hai ancora ordini attivi. Contatta l'azienda per effettuare un
              nuovo ordine.
            </p>
          </CardContent>
        </Card>
      ) : filteredOrders.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Search className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium mb-2">Nessun risultato</h3>
            <p className="text-muted-foreground text-center max-w-md">
              Nessun ordine corrisponde a &quot;{searchQuery}&quot;.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredOrders.map((order) => (
            <Card
              key={order.id}
              className="overflow-hidden hover:shadow-md transition-shadow"
            >
              <Link to={`/cliente/ordini/${order.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-start justify-between">
                        <h3 className="font-medium line-clamp-2">
                          {order.description}
                        </h3>
                        <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                      </div>

                      {order.status && (
                        <Badge
                          variant="secondary"
                          style={{
                            backgroundColor: order.status.color + "20",
                            color: order.status.color,
                            borderColor: order.status.color + "40",
                          }}
                          className="border"
                        >
                          {order.status.name}
                        </Badge>
                      )}

                      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
                        <span>
                          Totale:{" "}
                          <span className="text-foreground font-medium">
                            {formatCurrency(order.total_amount)}
                          </span>
                        </span>
                        <span>
                          Acconto:{" "}
                          <span className="text-foreground">
                            {formatCurrency(order.deposit_amount)}
                          </span>
                        </span>
                        <span>
                          Saldo:{" "}
                          <span className="text-foreground">
                            {formatCurrency(order.balance_amount)}
                          </span>
                        </span>
                      </div>

                      {order.expected_date && (
                        <p className="text-sm text-muted-foreground">
                          Data prevista:{" "}
                          {new Date(order.expected_date).toLocaleDateString(
                            "it-IT"
                          )}
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
