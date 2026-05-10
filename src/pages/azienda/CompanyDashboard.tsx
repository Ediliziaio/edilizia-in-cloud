/**
 * CompanyDashboard — la regia operativa dell'azienda.
 *
 * Layout:
 *  1. Header dashboard (titolo + filtri + azioni rapide)
 *  2. Sintesi operativa blu
 *  3. Board operativo: agenda, commesse da seguire, blocchi da risolvere
 *
 * Principi UX:
 *  - Risponde in 5 secondi a: "cosa deve fare il team adesso"
 *  - Mobile-first: tutto impila, FAB per azioni rapide
 *  - Tastiera: Cmd+K per comandi globali
 */
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ClipboardList, Users, AlertTriangle,
  ChevronDown, RefreshCw, LayoutDashboard, Loader2,
  CalendarClock, Wrench, Euro, BarChart3, Package,
  CheckCircle2, CircleAlert, Receipt, ExternalLink,
} from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { formatCurrency, formatCurrencyCompact } from "@/lib/formatters";
import { queryKeys } from "@/lib/queryKeys";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardSelectorBar } from "@/components/dashboard/DashboardSelectorBar";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { DashboardQuickActions, DashboardKeyboardHint } from "@/components/dashboard/DashboardQuickActions";
import { CompanyDashboardFilters } from "@/components/dashboard/CompanyDashboardFilters";
import { useCompanyDashboardData } from "@/hooks/useCompanyDashboardData";
import { EditOrderDatesDialog } from "@/components/calendar/EditOrderDatesDialog";
import type { CalendarOrder } from "@/types/calendar";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer,
} from "recharts";

function ManagementOverview({
  stats,
  weeklyDeadlines,
  urgentItems,
  financialAlerts,
  cashFlow,
  monthlyBalance,
}: {
  stats: ReturnType<typeof useCompanyDashboardData>["stats"];
  weeklyDeadlines: ReturnType<typeof useCompanyDashboardData>["weeklyDeadlines"];
  urgentItems: ReturnType<typeof useCompanyDashboardData>["urgentItems"];
  financialAlerts: ReturnType<typeof useCompanyDashboardData>["financialAlerts"];
  cashFlow: ReturnType<typeof useCompanyDashboardData>["cashFlow"];
  monthlyBalance: ReturnType<typeof useCompanyDashboardData>["monthlyBalance"];
}) {
  const operationalAgenda = weeklyDeadlines.upcomingWorks ?? [];
  const upcomingWorks = operationalAgenda.filter((item) => item.source === "order" || !item.source).length;
  const warehouseArrivals = operationalAgenda.filter((item) => item.source === "warehouse").length;
  const weeklyReceivables = weeklyDeadlines.receivables?.length ?? 0;
  const weeklyCosts = weeklyDeadlines.companyCosts?.length ?? 0;
  const soldPeriod = Number(stats.totalRevenue || 0);
  const plannedCosts = monthlyBalance.reduce((sum, item) => sum + Number(item.uscite || 0), 0);
  const realIncome = Number(stats.collectedRevenue || cashFlow.realIncome || 0);
  const pendingRevenue = Number(stats.pendingRevenue || 0);
  const operationalIssues = urgentItems.length + stats.openTickets + financialAlerts.length;
  const nextActions = [
    financialAlerts.length > 0 ? {
      label: "Anomalie e controlli",
      detail: `${financialAlerts.length} segnali da verificare su gestione e dati`,
      to: "/azienda/ordini?tab=anomalie",
      tone: "red",
    } : null,
    urgentItems.length > 0 ? {
      label: "Materiali da presidiare",
      detail: `${urgentItems.length} articoli con posa imminente`,
      to: "/azienda/magazzino",
      tone: "orange",
    } : null,
    stats.openTickets > 0 ? {
      label: "Assistenza clienti",
      detail: `${stats.openTickets} ticket aperti da gestire`,
      to: "/azienda/assistenza",
      tone: "red",
    } : null,
    warehouseArrivals > 0 ? {
      label: "Merce in arrivo",
      detail: `${warehouseArrivals} arrivi fornitore da presidiare`,
      to: "/azienda/calendario",
      tone: "orange",
    } : null,
    upcomingWorks > 0 ? {
      label: "Calendario lavori",
      detail: `${upcomingWorks} lavori in arrivo nei prossimi giorni`,
      to: "/azienda/calendario",
      tone: "blue",
    } : null,
    weeklyCosts + weeklyReceivables > 0 ? {
      label: "Scadenze settimana",
      detail: `${weeklyReceivables} incassi e ${weeklyCosts} costi in agenda`,
      to: "/azienda/previsionale",
      tone: "orange",
    } : null,
  ].filter(Boolean) as Array<{ label: string; detail: string; to: string; tone: string }>;

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="grid gap-0 xl:grid-cols-[minmax(620px,0.62fr)_minmax(420px,0.38fr)]">
        <div className="bg-[#173b67] p-5 text-white sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 text-white shadow-[0_8px_18px_rgba(249,115,22,0.28)]">
                <LayoutDashboard className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-100">Dashboard gestione</p>
                <h2 className="mt-1 text-xl font-semibold text-white">Vista dall'alto della gestione</h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-blue-50/85">
                  Qui vedi in un colpo solo commesse, venduto, incassi, calendario lavori, materiali, assistenza
                  e anomalie. Serve a decidere cosa controllare prima, non a rifare il bilancio aziendale.
                </p>
              </div>
            </div>
            <Badge className="w-fit shrink-0 border border-white/20 bg-white/10 text-white hover:bg-white/10">
              {operationalIssues > 0 ? `${operationalIssues} attenzioni` : "nessuna urgenza"}
            </Badge>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
            {[
              { label: "Commesse", value: stats.totalOrders, detail: "nel periodo selezionato", icon: ClipboardList, tone: "blue" },
              { label: "Venduto periodo", value: formatCurrencyCompact(soldPeriod), detail: "valore commesse nel periodo", icon: Euro, tone: "blue" },
              { label: "Incassato", value: formatCurrencyCompact(realIncome), detail: "pagamenti segnati sulle commesse", icon: CheckCircle2, tone: "green" },
              { label: "Da incassare", value: formatCurrencyCompact(pendingRevenue), detail: "residuo coerente col venduto", icon: CircleAlert, tone: "orange" },
              { label: "Pose / lavori", value: upcomingWorks, detail: "in calendario a breve", icon: CalendarClock, tone: "orange" },
              { label: "Anomalie", value: financialAlerts.length, detail: `${urgentItems.length} materiali · ${stats.openTickets} ticket`, icon: AlertTriangle, tone: operationalIssues > 0 ? "red" : "green" },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-xl border border-white/14 bg-white/[0.08] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
              >
                <div className="flex items-start gap-3">
                  <div className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border",
                    item.tone === "orange" && "border-orange-200/30 bg-orange-400/15 text-orange-100",
                    item.tone === "red" && "border-red-200/30 bg-red-400/15 text-red-100",
                    item.tone === "green" && "border-emerald-200/30 bg-emerald-400/15 text-emerald-100",
                    item.tone === "blue" && "border-blue-100/20 bg-white/10 text-blue-50",
                  )}>
                    <item.icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-100">{item.label}</p>
                    <p className="mt-1 truncate text-2xl font-bold text-white">{item.value}</p>
                    <p className="mt-0.5 truncate text-xs text-blue-50/70">{item.detail}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <aside className="border-t border-slate-200 bg-gradient-to-br from-white to-orange-50/50 p-5 xl:border-l xl:border-t-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase text-slate-500">Andamento gestione</p>
              <h3 className="mt-1 text-base font-semibold text-slate-950">Venduto e costi pianificati</h3>
              <p className="mt-1 text-xs text-slate-500">Lettura rapida degli ultimi mesi del perimetro selezionato.</p>
            </div>
            <BarChart3 className="h-5 w-5 text-orange-600" />
          </div>
          <div className="mt-4 h-[180px] rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyBalance.slice(-6)} margin={{ top: 8, right: 6, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={formatCurrencyCompact} tickLine={false} axisLine={false} />
                <RechartsTooltip
                  formatter={(value: number, name: string) => [formatCurrency(value), name]}
                  contentStyle={{ backgroundColor: "white", borderColor: "#e2e8f0", borderRadius: 10, fontSize: 12 }}
                />
                <Bar dataKey="entrate" name="Venduto" fill="#2563eb" radius={[4, 4, 0, 0]} barSize={14} />
                <Bar dataKey="uscite" name="Costi pianificati" fill="#f97316" radius={[4, 4, 0, 0]} barSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border border-slate-100 bg-white p-3">
              <p className="font-semibold text-slate-500">Costi pianificati</p>
              <p className="mt-1 text-base font-bold text-slate-950">{formatCurrencyCompact(plannedCosts)}</p>
            </div>
            <div className="rounded-lg border border-slate-100 bg-white p-3">
              <p className="font-semibold text-slate-500">Scadenze settimana</p>
              <p className="mt-1 text-base font-bold text-slate-950">{weeklyReceivables + weeklyCosts}</p>
            </div>
          </div>
        </aside>
      </div>

      <div className="border-t border-slate-200 bg-slate-50/70 p-4 sm:p-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {nextActions.length > 0 ? nextActions.slice(0, 4).map((action) => (
            <Link
              key={action.label}
              to={action.to}
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition-colors hover:border-orange-200 hover:bg-orange-50/60"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-slate-950">{action.label}</span>
                <span className="block truncate text-xs text-slate-500">{action.detail}</span>
              </span>
              <ChevronDown className="-rotate-90 h-4 w-4 shrink-0 text-slate-400" />
            </Link>
          )) : (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-800 xl:col-span-4">
              Nessuna priorità operativa critica in questo momento.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function formatAgendaDate(value?: string) {
  if (!value) return "Data da definire";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data da verificare";
  return new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short" }).format(date);
}

function getDateKey(value?: string | null) {
  if (!value) return null;
  const key = value.slice(0, 10);
  const date = new Date(`${key}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : key;
}

function getOrderIdFromAgendaId(value?: string, source?: "order" | "appointment" | "warehouse") {
  if (!value || source === "appointment") return null;
  for (const prefix of ["order-work-", "order-posa-", "order-warehouse-"]) {
    if (value.startsWith(prefix)) return value.slice(prefix.length);
  }
  return null;
}

function addCalendarDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatCalendarDay(date: Date) {
  return {
    weekday: new Intl.DateTimeFormat("it-IT", { weekday: "short" }).format(date),
    day: new Intl.DateTimeFormat("it-IT", { day: "2-digit" }).format(date),
    month: new Intl.DateTimeFormat("it-IT", { month: "short" }).format(date),
    key: toLocalDateKey(date),
  };
}

function DaysLeftPill({ daysLeft }: { daysLeft: number }) {
  const label = daysLeft === 0 ? "oggi" : daysLeft === 1 ? "domani" : `${daysLeft} giorni`;
  return (
    <Badge
      variant="outline"
      className={cn(
        "shrink-0 rounded-full text-[11px]",
        daysLeft <= 1 && "border-orange-200 bg-orange-50 text-orange-700",
        daysLeft > 1 && daysLeft <= 7 && "border-blue-200 bg-blue-50 text-blue-700",
        daysLeft > 7 && "border-slate-200 bg-slate-50 text-slate-600",
      )}
    >
      {label}
    </Badge>
  );
}

function OperationalCalendarCard({
  weeklyDeadlines,
}: {
  weeklyDeadlines: ReturnType<typeof useCompanyDashboardData>["weeklyDeadlines"];
}) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const maxDays = 31;
  const receivables = weeklyDeadlines.receivables ?? [];
  const companyCosts = weeklyDeadlines.companyCosts ?? [];
  const upcomingWorks = weeklyDeadlines.upcomingWorks ?? [];
  const workItems = upcomingWorks.filter((item) => item.source === "order" || !item.source);
  const warehouseItems = upcomingWorks.filter((item) => item.source === "warehouse");
  const appointmentItems = upcomingWorks.filter((item) => item.source === "appointment");
  const allAgendaItems = [
    ...upcomingWorks.map((work, index) => ({
      id: `work-${work.orderCode}-${index}`,
      rawId: work.id,
      orderId: getOrderIdFromAgendaId(work.id, work.source),
      type: work.source === "warehouse"
        ? ("warehouse" as const)
        : work.source === "appointment"
          ? ("appointment" as const)
          : ("work" as const),
      title: work.source === "warehouse"
        ? (work.detailTitle || work.purchaseOrderNumber || "Merce in arrivo")
        : (work.orderCode || (work.source === "appointment" ? "Sopralluogo" : "Lavoro pianificato")),
      subtitle: work.source === "warehouse"
        ? (work.materialSummary || work.detailSubtitle || [work.kindLabel, work.customerName].filter(Boolean).join(" · "))
        : [work.kindLabel, work.customerName || "Cliente"].filter(Boolean).join(" · "),
      date: work.workDate,
      daysLeft: work.daysLeft,
      amount: undefined as number | undefined,
      to: work.source === "warehouse" ? "/azienda/magazzino" : "/azienda/calendario",
      icon: work.source === "warehouse" ? Package : work.source === "appointment" ? CalendarClock : Wrench,
      supplierName: work.supplierName,
      purchaseOrderNumber: work.purchaseOrderNumber,
      materialSummary: work.materialSummary,
      detailTitle: work.detailTitle,
      detailSubtitle: work.detailSubtitle,
    })),
    ...receivables.map((receivable, index) => ({
      id: `receivable-${receivable.orderDescription}-${index}`,
      rawId: undefined,
      orderId: null,
      type: "receivable" as const,
      title: receivable.customerName || "Incasso previsto",
      subtitle: receivable.orderDescription || "Commessa",
      date: receivable.expectedDate,
      daysLeft: receivable.daysLeft,
      amount: receivable.amount,
      to: "/azienda/previsionale",
      icon: Euro,
      supplierName: undefined as string | null | undefined,
      purchaseOrderNumber: undefined as string | null | undefined,
      materialSummary: undefined as string | null | undefined,
      detailTitle: undefined as string | null | undefined,
      detailSubtitle: undefined as string | null | undefined,
    })),
    ...companyCosts.map((cost, index) => ({
      id: `cost-${cost.name}-${index}`,
      rawId: undefined,
      orderId: null,
      type: "cost" as const,
      title: cost.name || "Costo in scadenza",
      subtitle: "Uscita pianificata",
      date: cost.dueDate,
      daysLeft: cost.daysLeft,
      amount: cost.amount,
      to: "/azienda/costi",
      icon: Receipt,
      supplierName: undefined as string | null | undefined,
      purchaseOrderNumber: undefined as string | null | undefined,
      materialSummary: undefined as string | null | undefined,
      detailTitle: undefined as string | null | undefined,
      detailSubtitle: undefined as string | null | undefined,
    })),
  ]
    .filter((item) => item.daysLeft <= maxDays)
    .sort((a, b) => a.daysLeft - b.daysLeft);
  const [selectedEvent, setSelectedEvent] = useState<(typeof allAgendaItems)[number] | null>(null);
  const selectedOrderId = selectedEvent?.type === "work" ? selectedEvent.orderId : null;
  const { data: selectedOrder, isFetching: isSelectedOrderLoading } = useQuery({
    queryKey: ["dashboard-calendar-order-detail", selectedOrderId],
    queryFn: async () => {
      if (!selectedOrderId || !companyId) return null;
      const { data, error } = await supabase
        .from("orders")
        .select(`
          id,
          order_code,
          description,
          expected_date,
          work_start_date,
          work_end_date,
          warehouse_arrival_date,
          created_at,
          customer_id,
          current_status_id,
          indirizzo_lavori,
          customer:profiles!orders_customer_id_fkey(first_name, last_name),
          status:order_statuses!orders_current_status_id_fkey(name, color),
          order_employees(employee:employees(id, first_name, last_name)),
          order_external_teams(external_team:external_teams(id, name))
        `)
        .eq("id", selectedOrderId)
        .eq("company_id", companyId)
        .maybeSingle();
      if (error) throw error;
      return (data || null) as CalendarOrder | null;
    },
    enabled: !!selectedOrderId && !!companyId,
    staleTime: 30_000,
  });
  const selectedEventUsesOrderDialog = selectedEvent?.type === "work";
  const showGenericEventDialog = !!selectedEvent && (
    !selectedEventUsesOrderDialog ||
    !selectedOrderId ||
    (!!selectedOrderId && !isSelectedOrderLoading && !selectedOrder)
  );
  const agendaItems = allAgendaItems.slice(0, 6);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = toLocalDateKey(today);
  const calendarDays = Array.from(
    { length: 31 },
    (_, offset) => formatCalendarDay(addCalendarDays(today, offset)),
  );
  const itemsByDate = new Map<string, typeof allAgendaItems>();
  for (const item of allAgendaItems) {
    const key = getDateKey(item.date);
    if (!key) continue;
    const current = itemsByDate.get(key) ?? [];
    current.push(item);
    itemsByDate.set(key, current);
  }
  const visibleWorks = workItems.filter((item) => item.daysLeft <= maxDays).length;
  const visibleWarehouse = warehouseItems.filter((item) => item.daysLeft <= maxDays);
  const visibleAppointments = appointmentItems.filter((item) => item.daysLeft <= maxDays).length;
  const visibleReceivables = receivables.filter((item) => item.daysLeft <= maxDays);
  const visibleCosts = companyCosts.filter((item) => item.daysLeft <= maxDays);
  const receivablesTotal = visibleReceivables.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const costsTotal = visibleCosts.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const getCalendarEventLabel = (item: (typeof allAgendaItems)[number]) => {
    if (item.type === "work") return item.title;
    if (item.type === "warehouse") return item.detailTitle || item.title;
    if (item.type === "appointment") return item.title || "Sopralluogo";
    if (item.type === "receivable") return "Incasso";
    return "Costo";
  };
  const getCalendarEventTypeLabel = (item: (typeof allAgendaItems)[number]) => {
    if (item.type === "work") return "Lavoro";
    if (item.type === "warehouse") return "Merce in arrivo";
    if (item.type === "appointment") return "Sopralluogo";
    if (item.type === "receivable") return "Incasso previsto";
    return "Costo pianificato";
  };

  return (
    <Card className="overflow-hidden border-slate-200 shadow-sm">
      <CardHeader className="border-b border-slate-100 bg-gradient-to-r from-white to-blue-50/60 pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
              <CalendarClock className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-base">Calendario gestione</CardTitle>
              <CardDescription className="text-xs">
                Cosa succede nei prossimi 30 giorni tra pose, merce in arrivo, sopralluoghi, incassi e costi.
              </CardDescription>
            </div>
          </div>
          <Badge variant="outline" className="w-fit rounded-full border-blue-100 bg-blue-50 text-blue-700">
            Vista mese
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 p-4 xl:grid-cols-[minmax(280px,0.36fr)_minmax(520px,0.64fr)]">
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-3">
              <p className="text-[11px] font-semibold uppercase text-emerald-700">Lavori</p>
              <p className="mt-1 text-2xl font-bold text-slate-950">{visibleWorks}</p>
              <p className="text-xs text-slate-500">pose e cantieri in agenda</p>
            </div>
            <div className="rounded-xl border border-amber-100 bg-amber-50/80 p-3">
              <p className="text-[11px] font-semibold uppercase text-amber-700">Merce in arrivo</p>
              <p className="mt-1 text-2xl font-bold text-slate-950">{visibleWarehouse.length}</p>
              <p className="text-xs text-slate-500">con dettagli materiali dove collegati</p>
            </div>
            <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-3">
              <p className="text-[11px] font-semibold uppercase text-blue-700">Sopralluoghi</p>
              <p className="mt-1 text-2xl font-bold text-slate-950">{visibleAppointments}</p>
              <p className="text-xs text-slate-500">appuntamenti e visite operative</p>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-3">
              <p className="text-[11px] font-semibold uppercase text-emerald-700">Incassi previsti</p>
              <p className="mt-1 text-2xl font-bold text-emerald-700">{formatCurrencyCompact(receivablesTotal)}</p>
              <p className="text-xs text-slate-500">{visibleReceivables.length} scadenze clienti</p>
            </div>
            <div className="rounded-xl border border-orange-100 bg-orange-50/70 p-3">
              <p className="text-[11px] font-semibold uppercase text-orange-700">Costi da pagare</p>
              <p className="mt-1 text-2xl font-bold text-orange-700">{formatCurrencyCompact(costsTotal)}</p>
              <p className="text-xs text-slate-500">{visibleCosts.length} uscite operative</p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Prossimi eventi</p>
              <Link to="/azienda/calendario" className="text-xs font-semibold text-orange-700 hover:text-orange-800">
                Apri calendario
              </Link>
            </div>
            {agendaItems.length > 0 ? agendaItems.map((item) => (
              <button
                type="button"
                key={item.id}
                onClick={() => setSelectedEvent(item)}
                className="group flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left transition-colors hover:border-orange-200 hover:bg-orange-50/50"
              >
                <div className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                  item.type === "work" && "bg-emerald-50 text-emerald-700",
                  item.type === "warehouse" && "bg-amber-50 text-amber-700",
                  item.type === "appointment" && "bg-blue-50 text-blue-700",
                  item.type === "receivable" && "bg-teal-50 text-teal-700",
                  item.type === "cost" && "bg-orange-50 text-orange-700",
                )}>
                  <item.icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-slate-950 group-hover:text-orange-700">{item.title}</span>
                    <span className="shrink-0 text-xs text-slate-400">{formatAgendaDate(item.date)}</span>
                  </div>
                  <p className="truncate text-xs text-slate-500">{item.subtitle}</p>
                </div>
                {item.amount !== undefined && (
                  <span className={cn("hidden shrink-0 text-sm font-semibold sm:block", item.type === "cost" ? "text-orange-700" : "text-emerald-700")}>
                    {formatCurrencyCompact(item.amount)}
                  </span>
                )}
                <DaysLeftPill daysLeft={item.daysLeft} />
              </button>
            )) : (
              <div className="rounded-xl border border-dashed bg-slate-50 p-6 text-center text-sm text-slate-500">
                <CalendarClock className="mx-auto mb-2 h-8 w-8 text-slate-400" />
                Nessun evento operativo nel periodo selezionato.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Vista calendario</p>
              <p className="text-sm font-semibold text-slate-950">Prossimi 30 giorni</p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> lavori</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> merce</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500" /> sopralluoghi</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-teal-500" /> incassi</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-orange-500" /> costi</span>
            </div>
          </div>

          <TooltipProvider delayDuration={120}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              {calendarDays.map((day) => {
                const dayAllItems = itemsByDate.get(day.key) ?? [];
                const dayItems = dayAllItems.slice(0, 5);
                const extraCount = Math.max(0, dayAllItems.length - dayItems.length);
                return (
                  <div
                    key={day.key}
                    className={cn(
                      "min-h-[150px] rounded-xl border bg-white p-2 shadow-sm transition-all hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-md",
                      day.key === todayKey && "border-orange-300 ring-1 ring-orange-100",
                    )}
                  >
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[10px] font-semibold uppercase text-slate-400">{day.weekday}</p>
                        <p className="text-lg font-bold leading-none text-slate-950">{day.day}</p>
                      </div>
                      <span className="text-[10px] text-slate-400">{day.month}</span>
                    </div>

                    <div className="space-y-1">
                      {dayItems.map((item) => (
                        <Tooltip key={`${day.key}-${item.id}`}>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={() => setSelectedEvent(item)}
                              className={cn(
                                "block w-full truncate rounded-md border px-2 py-1 text-left text-[10px] font-semibold leading-tight transition-colors",
                                item.type === "work" && "border-emerald-100 bg-emerald-50 text-emerald-800 hover:bg-emerald-100",
                                item.type === "warehouse" && "border-amber-100 bg-amber-50 text-amber-800 hover:bg-amber-100",
                                item.type === "appointment" && "border-blue-100 bg-blue-50 text-blue-800 hover:bg-blue-100",
                                item.type === "receivable" && "border-teal-100 bg-teal-50 text-teal-800 hover:bg-teal-100",
                                item.type === "cost" && "border-orange-100 bg-orange-50 text-orange-800 hover:bg-orange-100",
                              )}
                            >
                              {getCalendarEventLabel(item)}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" align="start" className="max-w-[320px] rounded-xl border border-slate-200 bg-white p-3 text-left text-slate-900 shadow-xl">
                            <div className="space-y-2">
                              <Badge variant="outline" className={cn(
                                "rounded-full text-[10px]",
                                item.type === "work" && "border-emerald-100 bg-emerald-50 text-emerald-700",
                                item.type === "warehouse" && "border-amber-100 bg-amber-50 text-amber-700",
                                item.type === "appointment" && "border-blue-100 bg-blue-50 text-blue-700",
                                item.type === "receivable" && "border-teal-100 bg-teal-50 text-teal-700",
                                item.type === "cost" && "border-orange-100 bg-orange-50 text-orange-700",
                              )}>
                                {getCalendarEventTypeLabel(item)}
                              </Badge>
                              <div>
                                <p className="text-sm font-semibold text-slate-950">{item.title}</p>
                                {item.subtitle && <p className="mt-0.5 text-xs text-slate-500">{item.subtitle}</p>}
                              </div>
                              <div className="grid grid-cols-[86px_1fr] gap-x-2 gap-y-1 text-xs">
                                <span className="text-slate-500">Data</span>
                                <span className="font-medium text-slate-800">{formatAgendaDate(item.date)}</span>
                                {item.type === "warehouse" && (
                                  <>
                                    <span className="text-slate-500">Cosa arriva</span>
                                    <span className="font-medium text-slate-800">{item.materialSummary || "Materiali non dettagliati"}</span>
                                    <span className="text-slate-500">Fornitore</span>
                                    <span className="font-medium text-slate-800">{item.supplierName || "Non collegato"}</span>
                                    <span className="text-slate-500">ODA</span>
                                    <span className="font-medium text-slate-800">{item.purchaseOrderNumber || "Non presente"}</span>
                                  </>
                                )}
                                {item.amount !== undefined && (
                                  <>
                                    <span className="text-slate-500">Importo</span>
                                    <span className={cn("font-semibold", item.type === "cost" ? "text-orange-700" : "text-emerald-700")}>
                                      {formatCurrency(item.amount)}
                                    </span>
                                  </>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-400">Clicca per aprire il dettaglio operativo.</p>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      ))}
                      {extraCount > 0 && (
                        <Link to="/azienda/calendario" className="block rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-100">
                          +{extraCount} altri
                        </Link>
                      )}
                      {dayItems.length === 0 && (
                        <div className="rounded-md border border-dashed border-slate-200 px-2 py-1 text-[11px] text-slate-400">
                          libero
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </TooltipProvider>
        </div>
      </CardContent>

      {selectedOrderId && isSelectedOrderLoading && (
        <Dialog open onOpenChange={(open) => !open && setSelectedEvent(null)}>
          <DialogContent className="sm:max-w-[520px]">
            <DialogHeader>
              <DialogTitle>Carico dettaglio commessa</DialogTitle>
              <DialogDescription>Sto recuperando date, squadra, pagamenti e informazioni operative.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-28 w-full rounded-xl" />
              <Skeleton className="h-20 w-full rounded-xl" />
            </div>
          </DialogContent>
        </Dialog>
      )}

      {selectedOrder && selectedEvent?.type === "work" && (
        <EditOrderDatesDialog
          order={selectedOrder}
          open={!!selectedOrder}
          onOpenChange={(open) => !open && setSelectedEvent(null)}
        />
      )}

      {showGenericEventDialog && (
        <Dialog open onOpenChange={(open) => !open && setSelectedEvent(null)}>
          <DialogContent className="sm:max-w-[460px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <selectedEvent.icon className={cn(
                  "h-5 w-5",
                  selectedEvent.type === "work" && "text-emerald-600",
                  selectedEvent.type === "warehouse" && "text-amber-600",
                  selectedEvent.type === "appointment" && "text-blue-600",
                  selectedEvent.type === "receivable" && "text-teal-600",
                  selectedEvent.type === "cost" && "text-orange-600",
                )} />
                {selectedEvent.title}
              </DialogTitle>
              <DialogDescription>{selectedEvent.subtitle || "Dettaglio evento operativo"}</DialogDescription>
            </DialogHeader>

            <div className="space-y-3 rounded-xl border bg-slate-50 p-4 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Data</span>
                <span className="font-semibold text-slate-950">{formatAgendaDate(selectedEvent.date)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Urgenza</span>
                <DaysLeftPill daysLeft={selectedEvent.daysLeft} />
              </div>
              {selectedEvent.amount !== undefined && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-500">Importo</span>
                  <span className={cn(
                    "font-semibold",
                    selectedEvent.type === "cost" ? "text-orange-700" : "text-emerald-700",
                  )}>
                    {formatCurrency(selectedEvent.amount)}
                  </span>
                </div>
              )}
              {selectedEvent.type === "work" && (
                <p className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Non riesco a risalire alla commessa completa da questo evento. Apri il calendario lavori per il dettaglio operativo.
                </p>
              )}
              {selectedEvent.type === "warehouse" && (
                <div className="space-y-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <div>
                    <p className="font-semibold uppercase tracking-wide text-amber-700">Cosa arriva</p>
                    <p className="mt-1 text-sm font-semibold text-slate-950">{selectedEvent.materialSummary || selectedEvent.subtitle}</p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <span className="text-amber-700">Fornitore</span>
                      <p className="font-semibold text-slate-950">{selectedEvent.supplierName || "Non collegato"}</p>
                    </div>
                    <div>
                      <span className="text-amber-700">ODA</span>
                      <p className="font-semibold text-slate-950">{selectedEvent.purchaseOrderNumber || "Non presente"}</p>
                    </div>
                  </div>
                  {!selectedEvent.purchaseOrderNumber && (
                    <p className="rounded-md bg-white/70 px-2 py-1 text-amber-800">
                      Questa è una data merce generica sulla commessa: per vedere righe, quantità e fornitore serve collegare un ODA o caricare le righe in magazzino.
                    </p>
                  )}
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="outline" onClick={() => setSelectedEvent(null)}>
                Chiudi
              </Button>
              <Button asChild>
                <Link to={selectedEvent.to} onClick={() => setSelectedEvent(null)}>
                  Apri sezione <ExternalLink className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}

function CostControlCard({
  stats,
  cashFlow,
  monthlyBalance,
  weeklyDeadlines,
}: {
  stats: ReturnType<typeof useCompanyDashboardData>["stats"];
  cashFlow: ReturnType<typeof useCompanyDashboardData>["cashFlow"];
  monthlyBalance: ReturnType<typeof useCompanyDashboardData>["monthlyBalance"];
  weeklyDeadlines: ReturnType<typeof useCompanyDashboardData>["weeklyDeadlines"];
}) {
  const soldPeriod = Number(stats.totalRevenue || 0);
  const plannedCosts = monthlyBalance.reduce((sum, item) => sum + Number(item.uscite || 0), 0);
  const paidCosts = Number(cashFlow.realOutflow || 0);
  const forecastCosts = Number(cashFlow.forecastOutflow || 0);
  const costsNext30 = (weeklyDeadlines.companyCosts ?? []).reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const operationalBalance = soldPeriod - plannedCosts;
  const costWeight = soldPeriod > 0 ? Math.min(999, (plannedCosts / soldPeriod) * 100) : 0;
  const cashSourceLabel = cashFlow.hasRealData
    ? "Pagamenti reali alimentati da costi registrati come pagati."
    : "Pagamenti reali non ancora alimentati: lettura basata sui costi pianificati.";
  const riskLevel = soldPeriod > 0 && costWeight > 75
    ? "alto"
    : soldPeriod > 0 && costWeight > 55
      ? "medio"
      : "sotto controllo";

  return (
    <Card className="overflow-hidden border-slate-200 shadow-sm">
      <CardHeader className="border-b border-slate-100 bg-gradient-to-r from-white to-orange-50/70 pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
              <Receipt className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-base">Controllo costi</CardTitle>
              <CardDescription className="text-xs">
                Costi operativi, uscite reali e impatto sul venduto nel perimetro selezionato.
              </CardDescription>
            </div>
          </div>
          <Badge
            variant="outline"
            className={cn(
              "w-fit rounded-full",
              riskLevel === "alto" && "border-red-200 bg-red-50 text-red-700",
              riskLevel === "medio" && "border-orange-200 bg-orange-50 text-orange-700",
              riskLevel === "sotto controllo" && "border-emerald-200 bg-emerald-50 text-emerald-700",
            )}
          >
            rischio costi {riskLevel}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 p-4 xl:grid-cols-[minmax(360px,0.58fr)_minmax(280px,0.42fr)]">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-orange-100 bg-orange-50/60 p-4">
            <p className="text-[11px] font-semibold uppercase text-orange-700">Costi pianificati</p>
            <p className="mt-1 text-2xl font-bold text-slate-950">{formatCurrencyCompact(plannedCosts)}</p>
            <p className="text-xs text-slate-500">somma costi del periodo</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-[11px] font-semibold uppercase text-slate-500">Pagato reale mese</p>
            <p className="mt-1 text-2xl font-bold text-slate-950">{formatCurrencyCompact(paidCosts)}</p>
            <p className="text-xs text-slate-500">uscite già registrate</p>
          </div>
          <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
            <p className="text-[11px] font-semibold uppercase text-blue-700">Da pagare 30gg</p>
            <p className="mt-1 text-2xl font-bold text-blue-800">{formatCurrencyCompact(costsNext30 || forecastCosts)}</p>
            <p className="text-xs text-slate-500">{(weeklyDeadlines.companyCosts ?? []).length} scadenze operative</p>
          </div>
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-4">
            <p className="text-[11px] font-semibold uppercase text-emerald-700">Saldo dopo costi</p>
            <p className={cn("mt-1 text-2xl font-bold", operationalBalance >= 0 ? "text-emerald-700" : "text-red-700")}>
              {formatCurrencyCompact(operationalBalance)}
            </p>
            <p className="text-xs text-slate-500">venduto meno costi pianificati</p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase text-slate-500">Incidenza costi</p>
              <p className="mt-1 text-2xl font-bold text-slate-950">{costWeight.toFixed(1)}%</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-50 text-orange-600">
              <BarChart3 className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4 h-2 rounded-full bg-slate-100">
            <div
              className={cn(
                "h-2 rounded-full transition-all",
                riskLevel === "alto" && "bg-red-500",
                riskLevel === "medio" && "bg-orange-500",
                riskLevel === "sotto controllo" && "bg-emerald-500",
              )}
              style={{ width: `${Math.min(100, costWeight)}%` }}
            />
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-500">{cashSourceLabel}</p>
          <Button variant="outline" size="sm" asChild className="mt-4 w-full justify-center">
            <Link to="/azienda/costi">Apri controllo costi</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function OperationalBoard({
  stats,
  recentOrders,
  cashFlow,
  monthlyBalance,
  weeklyDeadlines,
  urgentItems,
  financialAlerts,
}: {
  stats: ReturnType<typeof useCompanyDashboardData>["stats"];
  recentOrders: ReturnType<typeof useCompanyDashboardData>["recentOrders"];
  cashFlow: ReturnType<typeof useCompanyDashboardData>["cashFlow"];
  monthlyBalance: ReturnType<typeof useCompanyDashboardData>["monthlyBalance"];
  weeklyDeadlines: ReturnType<typeof useCompanyDashboardData>["weeklyDeadlines"];
  urgentItems: ReturnType<typeof useCompanyDashboardData>["urgentItems"];
  financialAlerts: ReturnType<typeof useCompanyDashboardData>["financialAlerts"];
}) {
  const upcomingWorks = weeklyDeadlines.upcomingWorks ?? [];
  const workItems = upcomingWorks.filter((item) => item.source === "order" || !item.source);
  const warehouseItems = upcomingWorks.filter((item) => item.source === "warehouse");
  const receivables = weeklyDeadlines.receivables ?? [];
  const companyCosts = weeklyDeadlines.companyCosts ?? [];
  const blockers = [
    ...urgentItems.slice(0, 3).map((item) => ({
      title: item.name,
      detail: `${item.orderCode ? `${item.orderCode} · ` : ""}${item.customerName}`,
      badge: item.daysLeft === 0 ? "oggi" : item.daysLeft === 1 ? "domani" : `${item.daysLeft}gg`,
      to: "/azienda/magazzino",
      tone: "orange" as const,
    })),
    ...(stats.openTickets > 0 ? [{
      title: "Ticket assistenza aperti",
      detail: "Clienti da seguire prima che diventino urgenze",
      badge: String(stats.openTickets),
      to: "/azienda/assistenza",
      tone: "red" as const,
    }] : []),
    ...financialAlerts.slice(0, 2).map((alert) => ({
      title: alert.type === "error" ? "Anomalia gestionale" : "Attenzione gestionale",
      detail: alert.message,
      badge: alert.type === "error" ? "critico" : "check",
      to: "/azienda/ordini?tab=anomalie",
      tone: alert.type === "error" ? "red" as const : "orange" as const,
    })),
  ];
  const sectionTiles = [
    {
      label: "Cantieri e lavori",
      detail: `${stats.totalOrders} commesse nel perimetro`,
      to: "/azienda/ordini",
      icon: ClipboardList,
      tone: "blue",
    },
    {
      label: "Calendario pose",
      detail: `${workItems.length} lavori in arrivo`,
      to: "/azienda/calendario",
      icon: CalendarClock,
      tone: "orange",
    },
    {
      label: "Magazzino",
      detail: `${warehouseItems.length} arrivi merce · ${urgentItems.length} materiali da presidiare`,
      to: "/azienda/magazzino",
      icon: Package,
      tone: warehouseItems.length + urgentItems.length > 0 ? "orange" : "green",
    },
    {
      label: "Anomalie",
      detail: `${financialAlerts.length} segnali da controllare`,
      to: "/azienda/ordini?tab=anomalie",
      icon: AlertTriangle,
      tone: financialAlerts.length > 0 ? "red" : "green",
    },
    {
      label: "Assistenza",
      detail: `${stats.openTickets} ticket aperti`,
      to: "/azienda/assistenza",
      icon: Wrench,
      tone: stats.openTickets > 0 ? "red" : "green",
    },
  ];

  return (
    <section className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {sectionTiles.map((tile) => (
          <Link
            key={tile.label}
            to={tile.to}
            className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-md"
          >
            <div className="flex items-start gap-3">
              <div className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                tile.tone === "blue" && "bg-blue-50 text-blue-700",
                tile.tone === "orange" && "bg-orange-50 text-orange-700",
                tile.tone === "red" && "bg-red-50 text-red-700",
                tile.tone === "green" && "bg-emerald-50 text-emerald-700",
              )}>
                <tile.icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-950 group-hover:text-orange-700">{tile.label}</p>
                <p className="mt-1 line-clamp-2 text-xs text-slate-500">{tile.detail}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <OperationalCalendarCard weeklyDeadlines={weeklyDeadlines} />
      <CostControlCard
        stats={stats}
        cashFlow={cashFlow}
        monthlyBalance={monthlyBalance}
        weeklyDeadlines={weeklyDeadlines}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(320px,0.9fr)_minmax(320px,1fr)_minmax(320px,0.9fr)]">
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Agenda operativa</CardTitle>
              <CardDescription className="text-xs">Lavori e scadenze da presidiare nei prossimi giorni</CardDescription>
            </div>
            <CalendarClock className="h-5 w-5 text-orange-500" />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-xl border bg-slate-50 p-3">
              <p className="text-[10px] font-semibold uppercase text-slate-500">Lavori</p>
              <p className="text-xl font-bold text-slate-950">{workItems.length}</p>
            </div>
            <div className="rounded-xl border bg-amber-50 p-3">
              <p className="text-[10px] font-semibold uppercase text-amber-700">Merce</p>
              <p className="text-xl font-bold text-slate-950">{warehouseItems.length}</p>
            </div>
            <div className="rounded-xl border bg-slate-50 p-3">
              <p className="text-[10px] font-semibold uppercase text-slate-500">Incassi</p>
              <p className="text-xl font-bold text-slate-950">{receivables.length}</p>
            </div>
            <div className="rounded-xl border bg-slate-50 p-3">
              <p className="text-[10px] font-semibold uppercase text-slate-500">Costi</p>
              <p className="text-xl font-bold text-slate-950">{companyCosts.length}</p>
            </div>
          </div>
          <div className="space-y-2">
            {upcomingWorks.slice(0, 3).map((work, index) => (
              <Link key={`${work.orderCode}-${index}`} to="/azienda/calendario" className="flex items-center justify-between rounded-xl border px-3 py-2 transition-colors hover:bg-slate-50">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-slate-900">{work.orderCode}</span>
                  <span className="block truncate text-xs text-slate-500">{[work.kindLabel, work.customerName].filter(Boolean).join(" · ")}</span>
                </span>
                <Badge variant="outline">{work.daysLeft === 0 ? "oggi" : `${work.daysLeft}gg`}</Badge>
              </Link>
            ))}
            {upcomingWorks.length === 0 && (
              <div className="rounded-xl border border-dashed bg-slate-50 p-4 text-sm text-slate-500">Nessun lavoro imminente nel periodo selezionato.</div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Commesse da seguire</CardTitle>
              <CardDescription className="text-xs">Le ultime commesse operative, senza metriche finanziarie pesanti</CardDescription>
            </div>
            <ClipboardList className="h-5 w-5 text-blue-600" />
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {recentOrders.slice(0, 5).map((order) => (
            <Link
              key={order.id}
              to={`/azienda/ordini/${order.id}`}
              className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 transition-colors hover:border-blue-200 hover:bg-blue-50/50"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-slate-900">{order.description || "Commessa senza descrizione"}</span>
                <span className="block truncate text-xs text-slate-500">
                  {order.customer?.first_name} {order.customer?.last_name}
                </span>
              </span>
              {order.status && (
                <Badge
                  variant="secondary"
                  style={{ backgroundColor: order.status.color + "20", color: order.status.color }}
                  className="shrink-0"
                >
                  {order.status.name}
                </Badge>
              )}
            </Link>
          ))}
          {recentOrders.length === 0 && (
            <div className="rounded-xl border border-dashed bg-slate-50 p-4 text-center text-sm text-slate-500">
              Nessuna commessa recente.
              <Button variant="link" asChild className="mt-1 h-auto p-0">
                <Link to="/azienda/ordini/nuovo">Crea una commessa</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Blocchi da risolvere</CardTitle>
              <CardDescription className="text-xs">Materiali, ticket e alert che possono fermare il lavoro</CardDescription>
            </div>
            <AlertTriangle className={cn("h-5 w-5", blockers.length > 0 ? "text-orange-500" : "text-emerald-600")} />
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {blockers.slice(0, 5).map((blocker, index) => (
            <Link
              key={`${blocker.title}-${index}`}
              to={blocker.to}
              className={cn(
                "flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 transition-colors",
                blocker.tone === "red" ? "hover:border-red-200 hover:bg-red-50" : "hover:border-orange-200 hover:bg-orange-50",
              )}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-slate-900">{blocker.title}</span>
                <span className="block truncate text-xs text-slate-500">{blocker.detail}</span>
              </span>
              <Badge variant={blocker.tone === "red" ? "destructive" : "outline"} className="shrink-0">{blocker.badge}</Badge>
            </Link>
          ))}
          {blockers.length === 0 && (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-800">
              Nessun blocco operativo evidente.
            </div>
          )}
        </CardContent>
      </Card>
      </div>
    </section>
  );
}

export default function CompanyDashboard() {
  const queryClient = useQueryClient();
  // isImpersonating + impersonatedCompanyId ci dicono se siamo in transizione:
  // il super_admin ha cliccato "Accedi" ma fetchImpersonatedCompany deve ancora
  // risolvere → mostriamo un loader invece di "Nessuna azienda selezionata".
  const { isImpersonating, impersonatedCompanyId } = useAuth();

  const {
    companyId, filters, updateFilters,
    isLoading, isError,
    stats, recentOrders, cashFlow, monthlyBalance,
    urgentItems, financialAlerts, weeklyDeadlines,
  } = useCompanyDashboardData();

  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    // P2.2 fix — invalidate ALL le query della dashboard, non solo
    // queryKeys.dashboard.all. Le query principali stanno sotto namespaces
    // diversi (`company-dashboard-management-financials`,
    // `company-dashboard-operational-agenda`).
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all }),
      queryClient.invalidateQueries({ queryKey: ["company-dashboard-management-financials"] }),
      queryClient.invalidateQueries({ queryKey: ["company-dashboard-operational-agenda"] }),
    ]);
    setLastRefresh(new Date());
    setTimeout(() => setIsRefreshing(false), 600);
  };

  // ─────────────────────────────────────────────
  // Guards
  // ─────────────────────────────────────────────
  if (!companyId) {
    // Durante l'impersonazione (super_admin → azienda) c'è una finestra breve
    // in cui impersonatedCompanyId è già settato ma fetchImpersonatedCompany
    // non ha ancora caricato l'oggetto Company. In quell'istante companyId è
    // undefined: mostriamo un loader invece dell'empty state "Nessuna azienda".
    if (isImpersonating || impersonatedCompanyId) {
      return (
        <div className="flex flex-col items-center justify-center text-center py-16 text-muted-foreground">
          <Loader2 className="h-8 w-8 mb-4 animate-spin" />
          <p className="font-medium text-foreground">Caricamento azienda…</p>
          <p className="text-sm mt-1">Stiamo aprendo il pannello dell'azienda selezionata</p>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center text-center py-16 text-muted-foreground">
        <Users className="h-12 w-12 mb-4 opacity-50" />
        <p className="font-medium text-foreground">Nessuna azienda selezionata</p>
        <p className="text-sm mt-1">Scegli un'azienda dal menu in alto per visualizzare la dashboard</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-64" />
          </div>
          <div className="flex gap-2 flex-wrap">
            <Skeleton className="h-9 w-24 sm:w-36" />
            <Skeleton className="h-9 w-24 sm:w-36" />
          </div>
        </div>
        <div className="grid gap-3 sm:gap-4 grid-cols-1 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-16 text-muted-foreground">
        <AlertTriangle className="h-12 w-12 mb-4 text-destructive opacity-70" />
        <p className="font-medium text-foreground">Errore nel caricamento della dashboard</p>
        <p className="text-sm mt-1 mb-4">Si è verificato un problema durante il recupero dei dati</p>
        <Button variant="outline" size="sm" onClick={handleRefresh}>
          <RefreshCw className="h-4 w-4 mr-2" /> Riprova
        </Button>
      </div>
    );
  }

  // ─────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────
  return (
    <div className="space-y-4 sm:space-y-6">
      <DashboardSelectorBar title="Dashboard Gestione" />

      <DashboardPageHeader
        title="Dashboard Gestione"
        subtitle={`La tua sala operativa · aggiornata ${lastRefresh.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`}
        icon={LayoutDashboard}
        leftAccessory={<DashboardKeyboardHint />}
        toolbar={<CompanyDashboardFilters filters={filters} onUpdate={updateFilters} compact />}
        actions={
          <>
            <DashboardQuickActions />
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="h-8 w-8"
              aria-label="Aggiorna dati"
              title="Aggiorna dati"
            >
              <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
            </Button>
          </>
        }
      />

      <ManagementOverview
        stats={stats}
        weeklyDeadlines={weeklyDeadlines}
        urgentItems={urgentItems}
        financialAlerts={financialAlerts}
        cashFlow={cashFlow}
        monthlyBalance={monthlyBalance}
      />

      <OperationalBoard
        stats={stats}
        recentOrders={recentOrders}
        cashFlow={cashFlow}
        monthlyBalance={monthlyBalance}
        weeklyDeadlines={weeklyDeadlines}
        urgentItems={urgentItems}
        financialAlerts={financialAlerts}
      />

    </div>
  );
}
