import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LifeBuoy, Wrench, Settings, Plus, ChevronRight, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { format, addDays, isToday, isTomorrow } from "date-fns";
import { it } from "date-fns/locale";
import { NuovoInterventoDialog } from "@/components/interventi/NuovoInterventoDialog";

// ── TicketColumn subcomponent ─────────────────────────────────────────────────
interface ColumnItem {
  id: string;
  title: string;
  subtitle?: string | null;
  badge?: string;
  badgeVariant?: "default" | "secondary" | "destructive" | "outline";
  path: string;
}

function TicketColumn({
  icon: Icon,
  title,
  count,
  items,
  accentColor,
  onNewClick,
  newLabel,
  isLoading,
}: {
  icon: React.ElementType;
  title: string;
  count: number;
  items: ColumnItem[];
  accentColor: string;
  onNewClick?: () => void;
  newLabel?: string;
  isLoading?: boolean;
}) {
  const navigate = useNavigate();
  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-lg ${accentColor}`}>
              <Icon className="h-4 w-4 text-white" />
            </div>
            <CardTitle className="text-base">{title}</CardTitle>
            <Badge variant="secondary" className="text-xs">{count}</Badge>
          </div>
          {onNewClick && (
            <Button size="sm" variant="outline" onClick={onNewClick} className="h-7 gap-1 text-xs">
              <Plus className="h-3 w-3" />
              {newLabel ?? "Nuovo"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-2">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground text-sm gap-2">
            <CheckCircle2 className="h-8 w-8 opacity-30" />
            <p>Nessun elemento</p>
          </div>
        ) : (
          items.slice(0, 8).map((item) => (
            <button
              key={item.id}
              onClick={() => navigate(item.path)}
              className="w-full text-left bg-muted/30 hover:bg-muted/60 transition-colors rounded-lg px-3 py-2.5 flex items-center justify-between gap-2 group"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{item.title}</p>
                {item.subtitle && <p className="text-xs text-muted-foreground truncate mt-0.5">{item.subtitle}</p>}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {item.badge && <Badge variant={item.badgeVariant ?? "secondary"} className="text-[10px] px-1.5">{item.badge}</Badge>}
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </button>
          ))
        )}
      </CardContent>
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AssistenzaLavoriHub() {
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);

  const today = new Date().toISOString().split("T")[0];
  const in7Days = addDays(new Date(), 7).toISOString().split("T")[0];
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  // Query ticket aperti
  const { data: tickets = [], isLoading: loadingTickets } = useQuery({
    queryKey: ["hub-tickets", effectiveCompany?.id],
    queryFn: async () => {
      if (!effectiveCompany?.id) return [];
      const { data } = await supabase
        .from("tickets")
        .select("id, subject, status, priority, tipo, created_at")
        .eq("company_id", effectiveCompany.id)
        .in("status", ["aperto", "in_lavorazione"])
        .in("tipo", ["supporto"])
        .order("created_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
    enabled: !!effectiveCompany?.id,
    staleTime: 2 * 60 * 1000,
  });

  // Query interventi programmati (aperti / in lavorazione)
  const { data: interventi = [], isLoading: loadingInterventi } = useQuery({
    queryKey: ["hub-interventi", effectiveCompany?.id, today, in7Days],
    queryFn: async () => {
      if (!effectiveCompany?.id) return [];
      const { data } = await supabase
        .from("tickets")
        .select("id, subject, status, priority, data_intervento_prevista, assigned_to")
        .eq("company_id", effectiveCompany.id)
        .in("tipo", ["intervento", "emergenza"])
        .in("status", ["aperto", "in_lavorazione"])
        .order("data_intervento_prevista", { ascending: true, nullsFirst: false })
        .limit(20);
      return data ?? [];
    },
    enabled: !!effectiveCompany?.id,
    staleTime: 2 * 60 * 1000,
  });

  // Query manutenzioni in scadenza (prossimi 7 giorni)
  const { data: manutenzioni = [], isLoading: loadingManutenzioni } = useQuery({
    queryKey: ["hub-manutenzioni", effectiveCompany?.id, today, in7Days],
    queryFn: async () => {
      if (!effectiveCompany?.id) return [];
      const { data } = await supabase
        .from("piani_manutenzione")
        .select("id, titolo, prossima_scadenza, stato, frequenza_tipo")
        .eq("company_id", effectiveCompany.id)
        .not("prossima_scadenza", "is", null)
        .lte("prossima_scadenza", in7Days)
        .order("prossima_scadenza", { ascending: true })
        .limit(20);
      return data ?? [];
    },
    enabled: !!effectiveCompany?.id,
    staleTime: 2 * 60 * 1000,
  });

  // KPI
  const interventiOggi = interventi.filter((iv: any) =>
    iv.data_intervento_prevista && isToday(new Date(iv.data_intervento_prevista))
  ).length;
  const manutenzioniScadute = manutenzioni.filter((mn: any) =>
    mn.prossima_scadenza && mn.prossima_scadenza < today
  ).length;

  const ticketItems: ColumnItem[] = tickets.map((t: any) => ({
    id: t.id,
    title: t.subject,
    subtitle: format(new Date(t.created_at), "dd MMM yyyy", { locale: it }),
    badge: t.priority === "urgente" ? "Urgente" : t.status === "in_lavorazione" ? "In lavorazione" : undefined,
    badgeVariant: t.priority === "urgente" ? "destructive" : "secondary",
    path: `/azienda/assistenza/${t.id}`,
  }));

  const interventiItems: ColumnItem[] = interventi.map((iv: any) => {
    let subtitle = "Nessuna data";
    if (iv.data_intervento_prevista) {
      const d = new Date(iv.data_intervento_prevista);
      subtitle = isToday(d) ? "Oggi" : isTomorrow(d) ? "Domani" : format(d, "dd MMM yyyy", { locale: it });
    }
    return {
      id: iv.id,
      title: iv.subject,
      subtitle,
      badge: iv.priority === "urgente" ? "Urgente" : undefined,
      badgeVariant: "destructive",
      path: `/azienda/assistenza/${iv.id}`,
    };
  });

  const manutenzioniItems: ColumnItem[] = manutenzioni.map((mn: any) => {
    const isScaduto = mn.prossima_scadenza && mn.prossima_scadenza < today;
    return {
      id: mn.id,
      title: mn.titolo,
      subtitle: mn.prossima_scadenza
        ? (isScaduto ? `Scaduta il ${format(new Date(mn.prossima_scadenza), "dd MMM", { locale: it })}` : format(new Date(mn.prossima_scadenza), "dd MMM yyyy", { locale: it }))
        : "Nessuna scadenza",
      badge: isScaduto ? "Scaduta" : undefined,
      badgeVariant: "destructive",
      path: `/azienda/manutenzione`,
    };
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Assistenza & Lavori</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Panoramica ticket, interventi e manutenzioni</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Nuovo Intervento
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <LifeBuoy className="h-4 w-4 text-blue-600" />
              <span className="text-xs font-medium text-blue-700 dark:text-blue-300">Ticket Aperti</span>
            </div>
            <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{loadingTickets ? "—" : tickets.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Wrench className="h-4 w-4 text-orange-600" />
              <span className="text-xs font-medium text-orange-700 dark:text-orange-300">Interventi Oggi</span>
            </div>
            <p className="text-2xl font-bold text-orange-700 dark:text-orange-300">{loadingInterventi ? "—" : interventiOggi}</p>
          </CardContent>
        </Card>
        <Card className="bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Settings className="h-4 w-4 text-purple-600" />
              <span className="text-xs font-medium text-purple-700 dark:text-purple-300">Manutenzioni (7gg)</span>
            </div>
            <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">{loadingManutenzioni ? "—" : manutenzioni.length}</p>
          </CardContent>
        </Card>
        <Card className={`border-2 ${manutenzioniScadute > 0 ? "bg-red-50 dark:bg-red-900/20 border-red-300" : "bg-green-50 dark:bg-green-900/20 border-green-200"}`}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className={`h-4 w-4 ${manutenzioniScadute > 0 ? "text-red-600" : "text-green-600"}`} />
              <span className={`text-xs font-medium ${manutenzioniScadute > 0 ? "text-red-700 dark:text-red-300" : "text-green-700 dark:text-green-300"}`}>
                Manut. Scadute
              </span>
            </div>
            <p className={`text-2xl font-bold ${manutenzioniScadute > 0 ? "text-red-700 dark:text-red-300" : "text-green-700 dark:text-green-300"}`}>
              {loadingManutenzioni ? "—" : manutenzioniScadute}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 3-column layout */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <TicketColumn
          icon={LifeBuoy}
          title="Ticket"
          count={tickets.length}
          items={ticketItems}
          accentColor="bg-blue-500"
          onNewClick={() => navigate("/azienda/assistenza/nuovo")}
          newLabel="Ticket"
          isLoading={loadingTickets}
        />
        <TicketColumn
          icon={Wrench}
          title="Interventi"
          count={interventi.length}
          items={interventiItems}
          accentColor="bg-orange-500"
          onNewClick={() => setDialogOpen(true)}
          newLabel="Intervento"
          isLoading={loadingInterventi}
        />
        <TicketColumn
          icon={Settings}
          title="Manutenzioni in scadenza"
          count={manutenzioni.length}
          items={manutenzioniItems}
          accentColor="bg-purple-500"
          onNewClick={() => navigate("/azienda/manutenzione")}
          newLabel="Vai a Manut."
          isLoading={loadingManutenzioni}
        />
      </div>

      {/* Quick links */}
      <div className="flex flex-wrap gap-2 pt-2 border-t">
        <Button variant="outline" size="sm" onClick={() => navigate("/azienda/assistenza")} className="gap-1.5">
          <LifeBuoy className="h-3.5 w-3.5" /> Tutti i ticket
        </Button>
        <Button variant="outline" size="sm" onClick={() => navigate("/azienda/assistenza?tipo=intervento")} className="gap-1.5">
          <Wrench className="h-3.5 w-3.5" /> Tutti gli interventi
        </Button>
        <Button variant="outline" size="sm" onClick={() => navigate("/azienda/manutenzione")} className="gap-1.5">
          <Settings className="h-3.5 w-3.5" /> Piano manutenzione
        </Button>
        <Button variant="outline" size="sm" onClick={() => navigate("/azienda/calendario")} className="gap-1.5">
          <Clock className="h-3.5 w-3.5" /> Calendario
        </Button>
      </div>

      <NuovoInterventoDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["hub-interventi", effectiveCompany?.id] });
        }}
      />
    </div>
  );
}
