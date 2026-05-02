import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ClipboardList,
  Loader2,
  ChevronRight,
  AlertCircle,
  Search,
  ShoppingCart,
  CreditCard,
  CalendarDays,
  HeadphonesIcon,
  Activity,
  FileText,
  ShieldCheck,
} from "lucide-react";
import { Link } from "react-router-dom";
import { formatCurrency, formatRelativeTime } from "@/lib/formatters";
import { format, addDays } from "date-fns";
import { it } from "date-fns/locale";

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
  const { user, company, profile } = useAuth();
  const companyId = profile?.company_id ?? company?.id ?? null;
  const [searchQuery, setSearchQuery] = useState("");
  // Conta ticket aperti
  const { data: openTicketsCount = 0 } = useQuery({
    queryKey: ["customer-open-tickets", companyId, user?.id],
    queryFn: async () => {
      if (!companyId) return 0;
      const { count, error } = await supabase
        .from("tickets")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("customer_id", user!.id)
        .in("status", ["aperto", "in_lavorazione"]);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!user?.id && !!companyId,
    staleTime: 2 * 60 * 1000,
  });

  // ── Orders query ──────────────────────────────────────────
  const {
    data: orders = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["customer-orders", companyId, user?.id],
    queryFn: async () => {
      if (!companyId) return [];
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
        .eq("company_id", companyId)
        .eq("customer_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      return data as unknown as Order[];
    },
    enabled: !!user?.id && !!companyId,
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
    queryKey: ["customer-installments-due", companyId, user?.id],
    queryFn: async () => {
      if (!companyId) return 0;
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
    enabled: !!user?.id && !!companyId,
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

  const nextAction = useMemo(() => {
    if (dueSoonCount > 0) {
      return {
        title: "Ci sono pagamenti in scadenza",
        description: "Controlla rate, acconti e saldo per evitare ritardi.",
        href: "/cliente/rate",
        label: "Vai ai pagamenti",
        icon: CreditCard,
      };
    }
    if (nextAppointment) {
      return {
        title: "Hai un intervento programmato",
        description: `Prossimo appuntamento il ${format(new Date(nextAppointment), "d MMMM yyyy", { locale: it })}.`,
        href: "/cliente/appuntamenti",
        label: "Vedi interventi",
        icon: CalendarDays,
      };
    }
    if (openTicketsCount > 0) {
      return {
        title: "Assistenza in corso",
        description: "Segui gli aggiornamenti dei ticket aperti.",
        href: "/cliente/assistenza",
        label: "Vedi assistenza",
        icon: HeadphonesIcon,
      };
    }
    if (activeOrdersCount > 0) {
      return {
        title: "I tuoi ordini sono in lavorazione",
        description: "Apri un ordine per consultare avanzamento, date e documenti.",
        href: "/cliente/documenti",
        label: "Vedi documenti",
        icon: FileText,
      };
    }
    return {
      title: "Area cliente aggiornata",
      description: "Qui trovi ordini, pagamenti, interventi e documenti condivisi.",
      href: "/cliente/documenti",
      label: "Apri documenti",
      icon: ShieldCheck,
    };
  }, [activeOrdersCount, dueSoonCount, nextAppointment, openTicketsCount]);

  // ── Activity feed: last 5 status changes ──────────────────
  const { data: activityFeed = [] } = useQuery({
    queryKey: ["customer-activity-feed", companyId, user?.id],
    queryFn: async () => {
      if (!companyId) return [];
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
    enabled: !!user?.id && !!companyId,
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

  // Greeting based on time of day
  const hour = new Date().getHours();
  const greeting = hour < 13 ? "Buongiorno" : hour < 18 ? "Buon pomeriggio" : "Buonasera";
  const NextActionIcon = nextAction.icon;

  return (
    <div className="space-y-5">
      {/* Header mobile-first con saluto */}
      <div>
        <p className="text-xs text-muted-foreground md:hidden">
          {format(new Date(), "EEEE d MMMM yyyy", { locale: it }).replace(/^\w/, c => c.toUpperCase())}
        </p>
        <h1 className="text-xl md:text-2xl font-bold text-foreground">
          <span className="md:hidden">{greeting}, {profile?.first_name}</span>
          <span className="hidden md:inline">I Miei Ordini</span>
        </h1>
        <p className="text-sm text-muted-foreground hidden md:block">
          Visualizza lo stato dei tuoi ordini con {company?.name}
        </p>
      </div>

      {/* FEATURE 1 — Dashboard Summary Cards — compatte su mobile */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4">
        <div className="bg-background border border-border/60 rounded-2xl p-3 md:p-4 flex items-center gap-2.5">
          <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <ShoppingCart className="h-4 w-4 md:h-5 md:w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] md:text-sm text-muted-foreground leading-tight">Ordini attivi</p>
            <p className="text-lg md:text-xl font-bold leading-tight">{activeOrdersCount}</p>
          </div>
        </div>

        <div className="bg-background border border-border/60 rounded-2xl p-3 md:p-4 flex items-center gap-2.5">
          <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-orange-500/10 flex items-center justify-center shrink-0">
            <CreditCard className="h-4 w-4 md:h-5 md:w-5 text-orange-500" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] md:text-sm text-muted-foreground leading-tight">In scadenza</p>
            <p className="text-lg md:text-xl font-bold leading-tight">{dueSoonCount}</p>
          </div>
        </div>

        <div className="bg-background border border-border/60 rounded-2xl p-3 md:p-4 flex items-center gap-2.5">
          <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
            <CalendarDays className="h-4 w-4 md:h-5 md:w-5 text-blue-500" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] md:text-sm text-muted-foreground leading-tight">Appuntamento</p>
            <p className="text-lg md:text-xl font-bold leading-tight">
              {nextAppointment
                ? format(new Date(nextAppointment), "d MMM", { locale: it })
                : "—"}
            </p>
          </div>
        </div>

        <Link to="/cliente/assistenza" className="bg-background border border-border/60 rounded-2xl p-3 md:p-4 flex items-center gap-2.5 active:scale-[0.97] transition-transform">
          <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-violet-500/10 flex items-center justify-center shrink-0">
            <HeadphonesIcon className="h-4 w-4 md:h-5 md:w-5 text-violet-500" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] md:text-sm text-muted-foreground leading-tight">Ticket aperti</p>
            <p className="text-lg md:text-xl font-bold leading-tight">{openTicketsCount}</p>
          </div>
        </Link>
      </div>

      <Link
        to={nextAction.href}
        className="flex items-center justify-between gap-3 bg-background border border-border/60 rounded-2xl p-4 hover:shadow-md transition-all active:scale-[0.98]"
      >
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <NextActionIcon className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm md:text-base">{nextAction.title}</p>
            <p className="text-xs md:text-sm text-muted-foreground mt-0.5">
              {nextAction.description}
            </p>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-1 text-sm font-semibold text-primary shrink-0">
          {nextAction.label}
          <ChevronRight className="h-4 w-4" />
        </div>
        <ChevronRight className="h-5 w-5 text-muted-foreground/50 shrink-0 sm:hidden" />
      </Link>

      {/* FEATURE 3 — Activity Feed */}
      {activityFeed.length > 0 && (
        <div className="bg-background border border-border/60 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">
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
                    className="border flex-shrink-0 mt-0.5 text-[10px]"
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
                  <p className="truncate text-sm text-foreground">
                    {entry.order?.description ?? "Ordine"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatRelativeTime(entry.changed_at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* FEATURE 2 — Search Bar — stile mobile-first */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          placeholder="Cerca ordine..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-muted/80 border border-border/60 rounded-2xl pl-10 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all"
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
        <div className="space-y-3">
          {filteredOrders.map((order) => (
            <Link
              key={order.id}
              to={`/cliente/ordini/${order.id}`}
              className="block bg-background border border-border/60 rounded-2xl p-4 hover:shadow-md transition-all active:scale-[0.98]"
              style={{
                borderLeftWidth: "4px",
                borderLeftColor: order.status?.color ?? "#94a3b8",
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0 space-y-1.5">
                  <h3 className="font-semibold text-sm text-foreground line-clamp-2 leading-snug">
                    {order.description}
                  </h3>

                  {order.status && (
                    <Badge
                      variant="secondary"
                      className="border text-[10px] px-2 py-0.5"
                      style={{
                        backgroundColor: order.status.color + "20",
                        color: order.status.color,
                        borderColor: order.status.color + "40",
                      }}
                    >
                      {order.status.name}
                    </Badge>
                  )}

                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                    <span>
                      Totale:{" "}
                      <span className="text-foreground font-semibold">
                        {formatCurrency(order.total_amount)}
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
                    <p className="text-xs text-muted-foreground">
                      Previsto:{" "}
                      {format(new Date(order.expected_date), "d MMM yyyy", { locale: it })}
                    </p>
                  )}
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground/50 shrink-0 mt-0.5" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
