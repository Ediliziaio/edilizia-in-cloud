import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { startOfWeek, addWeeks, subWeeks, format, addDays } from "date-fns";
import { it } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Plus, ChevronLeft, ChevronRight, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import MarketingCalendarWeekView from "@/components/marketing/MarketingCalendarWeekView";
import MarketingCalendarFilters from "@/components/marketing/MarketingCalendarFilters";
import MarketingAppointmentsList from "@/components/marketing/MarketingAppointmentsList";
import { AppointmentDialog, type AppointmentData } from "@/components/appointments/AppointmentDialog";

type TabKey = "calendar" | "list";

export default function MarketingCalendar() {
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const [activeTab, setActiveTab] = useState<TabKey>("calendar");
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<AppointmentData | null>(null);
  const [defaultDate, setDefaultDate] = useState<string | undefined>();
  const [defaultTime, setDefaultTime] = useState<string | undefined>();

  // Filter state
  const [selectedCalendarIds, setSelectedCalendarIds] = useState<string[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [filtersInitialized, setFiltersInitialized] = useState(false);

  // Fetch calendars
  const { data: calendars = [] } = useQuery({
    queryKey: ["marketing-calendars", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data } = await supabase
        .from("marketing_calendars")
        .select("id, name, is_active")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("name");
      if (data && !filtersInitialized) {
        setSelectedCalendarIds(data.map((c) => c.id));
        setFiltersInitialized(true);
      }
      return data || [];
    },
    enabled: !!companyId,
  });

  // Fetch assignable users
  const { data: users = [] } = useQuery({
    queryKey: ["marketing-calendar-users", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .eq("company_id", companyId)
        .order("last_name");
      if (!profiles?.length) return [];
      const userIds = profiles.map((p) => p.id);
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", userIds);
      const validIds =
        roles
          ?.filter((r) => r.role === "company_admin" || r.role === "company_staff")
          .map((r) => r.user_id) || [];
      const result = profiles.filter((p) => validIds.includes(p.id));
      if (!filtersInitialized && result.length) {
        setSelectedUserIds(result.map((u) => u.id));
      }
      return result;
    },
    enabled: !!companyId,
  });

  // Fetch appointments
  const {
    data: rawAppointments = [],
    refetch: refetchAppointments,
  } = useQuery({
    queryKey: ["marketing-appointments", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data } = await supabase
        .from("appointments")
        .select("*")
        .eq("company_id", companyId)
        .order("appointment_date", { ascending: true });
      return (data || []) as any[];
    },
    enabled: !!companyId,
  });

  // Enrich with names
  const appointments = useMemo(() => {
    return rawAppointments.map((a: any) => ({
      ...a,
      calendar_name: calendars.find((c) => c.id === a.calendar_id)?.name || null,
      assigned_name: users.find((u) => u.id === a.assigned_to)
        ? `${users.find((u) => u.id === a.assigned_to)!.first_name} ${users.find((u) => u.id === a.assigned_to)!.last_name}`
        : null,
      contact_name: null, // will be enriched if needed
    }));
  }, [rawAppointments, calendars, users]);

  // Filtered for week view
  const filteredAppointments = useMemo(() => {
    return appointments.filter((a: any) => {
      if (selectedCalendarIds.length > 0 && a.calendar_id && !selectedCalendarIds.includes(a.calendar_id))
        return false;
      if (selectedUserIds.length > 0 && a.assigned_to && !selectedUserIds.includes(a.assigned_to))
        return false;
      return true;
    });
  }, [appointments, selectedCalendarIds, selectedUserIds]);

  const handleToggleCalendar = useCallback((id: string) => {
    setSelectedCalendarIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }, []);

  const handleToggleUser = useCallback((id: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }, []);

  const openNewDialog = (date?: Date, hour?: number) => {
    setEditingAppointment(null);
    setDefaultDate(date ? format(date, "yyyy-MM-dd") : undefined);
    setDefaultTime(hour !== undefined ? `${String(hour).padStart(2, "0")}:00` : undefined);
    setDialogOpen(true);
  };

  const openEditDialog = (apt: any) => {
    setEditingAppointment({
      id: apt.id,
      title: apt.title,
      description: apt.description,
      appointment_date: apt.appointment_date,
      appointment_time: apt.appointment_time,
      appointment_type: apt.appointment_type,
      assigned_to: apt.assigned_to,
      order_id: apt.order_id || null,
      is_completed: apt.is_completed,
    });
    setDialogOpen(true);
  };

  const weekEnd = addDays(weekStart, 6);
  const weekLabel = `${format(weekStart, "d MMM", { locale: it })} – ${format(weekEnd, "d MMM yyyy", { locale: it })}`;

  const tabs = [
    { key: "calendar" as const, label: "Visualizza calendario" },
    { key: "list" as const, label: "Vista elenco Appuntamento" },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          <h1 className="text-xl font-bold">Calendari</h1>
          <nav className="flex items-center gap-1 border-b">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={cn(
                  "px-3 py-2 text-sm font-medium border-b-2 transition-colors",
                  activeTab === t.key
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {t.label}
              </button>
            ))}
            <button
              onClick={() => navigate("/azienda/impostazioni/calendari")}
              className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground border-b-2 border-transparent transition-colors flex items-center gap-1"
            >
              <Settings className="h-3.5 w-3.5" />
              Impostazioni
            </button>
          </nav>
        </div>
        <Button size="sm" onClick={() => openNewDialog()}>
          <Plus className="h-4 w-4 mr-1" />
          Nuovo
        </Button>
      </div>

      {/* Content */}
      {activeTab === "calendar" && (
        <div className="flex gap-0 h-[calc(100vh-200px)]">
          {/* Week navigation + calendar */}
          <div className="flex-1 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
              >
                Oggi
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setWeekStart((w) => subWeeks(w, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setWeekStart((w) => addWeeks(w, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium">{weekLabel}</span>
            </div>

            <MarketingCalendarWeekView
              weekStart={weekStart}
              appointments={filteredAppointments}
              calendarIds={calendars.map((c) => c.id)}
              onClickAppointment={openEditDialog}
              onClickSlot={(date, hour) => openNewDialog(date, hour)}
            />
          </div>

          {/* Filters panel */}
          <MarketingCalendarFilters
            calendars={calendars}
            users={users}
            selectedCalendarIds={selectedCalendarIds}
            selectedUserIds={selectedUserIds}
            onToggleCalendar={handleToggleCalendar}
            onToggleUser={handleToggleUser}
          />
        </div>
      )}

      {activeTab === "list" && (
        <MarketingAppointmentsList
          appointments={filteredAppointments}
          onRefresh={() => refetchAppointments()}
          onClickAppointment={openEditDialog}
        />
      )}

      <AppointmentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        appointment={editingAppointment}
        onSaved={() => refetchAppointments()}
        showOrderSelect
        defaultDate={defaultDate}
        defaultTime={defaultTime}
      />
    </div>
  );
}
