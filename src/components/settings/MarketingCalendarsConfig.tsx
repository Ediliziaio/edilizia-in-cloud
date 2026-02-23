import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Search, Pencil, Trash2, CalendarDays, Link2, Clock, Settings2, Copy } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import CalendarDialog from "./CalendarDialog";

type MarketingCalendar = {
  id: string;
  company_id: string;
  name: string;
  group_name: string | null;
  duration_minutes: number;
  calendar_type: string;
  is_active: boolean;
  owner_id: string | null;
  description: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  base_address_line: string | null;
  base_address_city: string | null;
  base_address_postal_code: string | null;
  base_address_province: string | null;
  base_address_country: string | null;
  base_formatted_address: string | null;
  base_lat: number | null;
  base_lng: number | null;
  base_place_id: string | null;
};

type CalendarPreferences = {
  id: string;
  company_id: string;
  week_start_day: string;
  time_format: string;
  language: string;
  show_services_menu: boolean;
  show_rooms: boolean;
  show_equipment: boolean;
};

type CalendarAvailability = {
  id: string;
  company_id: string;
  calendar_id: string;
  day_of_week: number | null;
  start_time: string;
  end_time: string;
  is_enabled: boolean;
  specific_date: string | null;
};

const DAYS = [
  { value: 1, label: "Lunedì" },
  { value: 2, label: "Martedì" },
  { value: 3, label: "Mercoledì" },
  { value: 4, label: "Giovedì" },
  { value: 5, label: "Venerdì" },
  { value: 6, label: "Sabato" },
  { value: 0, label: "Domenica" },
];

export default function MarketingCalendarsConfig() {
  const { effectiveCompany, user } = useAuth();
  const effectiveCompanyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCalendar, setEditingCalendar] = useState<MarketingCalendar | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedCalendarId, setSelectedCalendarId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("calendars");

  // ---- QUERIES ----
  const { data: calendars = [], isLoading: loadingCalendars } = useQuery({
    queryKey: ["marketing-calendars", effectiveCompanyId],
    queryFn: async () => {
      if (!effectiveCompanyId) return [];
      const { data, error } = await supabase
        .from("marketing_calendars")
        .select("*")
        .eq("company_id", effectiveCompanyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as MarketingCalendar[];
    },
    enabled: !!effectiveCompanyId,
  });

  const { data: preferences, isLoading: loadingPrefs } = useQuery({
    queryKey: ["marketing-calendar-preferences", effectiveCompanyId],
    queryFn: async () => {
      if (!effectiveCompanyId) return null;
      const { data, error } = await supabase
        .from("marketing_calendar_preferences")
        .select("*")
        .eq("company_id", effectiveCompanyId)
        .maybeSingle();
      if (error) throw error;
      return data as CalendarPreferences | null;
    },
    enabled: !!effectiveCompanyId,
  });

  const { data: availability = [], isLoading: loadingAvail } = useQuery({
    queryKey: ["marketing-calendar-availability", selectedCalendarId],
    queryFn: async () => {
      if (!selectedCalendarId || !effectiveCompanyId) return [];
      const { data, error } = await supabase
        .from("marketing_calendar_availability")
        .select("*")
        .eq("calendar_id", selectedCalendarId)
        .eq("company_id", effectiveCompanyId)
        .order("day_of_week");
      if (error) throw error;
      return data as CalendarAvailability[];
    },
    enabled: !!selectedCalendarId && !!effectiveCompanyId,
  });

  // ---- MUTATIONS ----
  const createCalendar = useMutation({
    mutationFn: async (data: any) => {
      if (!effectiveCompanyId || !user?.id) throw new Error("Dati mancanti");
      const { error } = await supabase.from("marketing_calendars").insert({
        company_id: effectiveCompanyId,
        created_by: user.id,
        name: data.name,
        description: data.description || null,
        owner_id: data.owner_id || null,
        duration_minutes: data.duration_minutes,
        calendar_type: "personal",
        group_name: null,
        base_address_line: data.base_address_line || null,
        base_address_city: data.base_address_city || null,
        base_address_postal_code: data.base_address_postal_code || null,
        base_address_province: data.base_address_province || null,
        base_address_country: data.base_address_country || "IT",
        base_formatted_address: data.base_formatted_address || null,
        base_lat: data.base_lat ?? null,
        base_lng: data.base_lng ?? null,
        base_place_id: data.base_place_id || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Calendario creato");
      queryClient.invalidateQueries({ queryKey: ["marketing-calendars"] });
      setDialogOpen(false);
    },
  });

  const updateCalendar = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const { error } = await supabase.from("marketing_calendars").update({
        name: data.name,
        description: data.description || null,
        owner_id: data.owner_id || null,
        duration_minutes: data.duration_minutes,
        base_address_line: data.base_address_line || null,
        base_address_city: data.base_address_city || null,
        base_address_postal_code: data.base_address_postal_code || null,
        base_address_province: data.base_address_province || null,
        base_address_country: data.base_address_country || "IT",
        base_formatted_address: data.base_formatted_address || null,
        base_lat: data.base_lat ?? null,
        base_lng: data.base_lng ?? null,
        base_place_id: data.base_place_id || null,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Calendario aggiornato");
      queryClient.invalidateQueries({ queryKey: ["marketing-calendars"] });
      setDialogOpen(false);
      setEditingCalendar(null);
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("marketing_calendars").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing-calendars"] });
    },
  });

  const deleteCalendar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("marketing_calendars").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Calendario eliminato");
      queryClient.invalidateQueries({ queryKey: ["marketing-calendars"] });
      setDeleteId(null);
    },
  });

  const upsertPreferences = useMutation({
    mutationFn: async (data: Partial<CalendarPreferences>) => {
      if (!effectiveCompanyId) throw new Error("Dati mancanti");
      const { error } = await supabase.from("marketing_calendar_preferences").upsert(
        { company_id: effectiveCompanyId, ...data },
        { onConflict: "company_id" }
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Preferenze salvate");
      queryClient.invalidateQueries({ queryKey: ["marketing-calendar-preferences"] });
    },
  });

  const saveAvailability = useMutation({
    mutationFn: async (rows: { day_of_week: number; start_time: string; end_time: string; is_enabled: boolean }[]) => {
      if (!selectedCalendarId || !effectiveCompanyId) throw new Error("Dati mancanti");
      // Delete existing weekly rows, then insert new
      await supabase.from("marketing_calendar_availability")
        .delete()
        .eq("calendar_id", selectedCalendarId)
        .eq("company_id", effectiveCompanyId)
        .is("specific_date", null);
      const inserts = rows.map(r => ({
        company_id: effectiveCompanyId,
        calendar_id: selectedCalendarId,
        day_of_week: r.day_of_week,
        start_time: r.start_time,
        end_time: r.end_time,
        is_enabled: r.is_enabled,
        specific_date: null as string | null,
      }));
      if (inserts.length > 0) {
        const { error } = await supabase.from("marketing_calendar_availability").insert(inserts);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Disponibilità salvata");
      queryClient.invalidateQueries({ queryKey: ["marketing-calendar-availability"] });
    },
  });

  // ---- FILTERS ----
  const filtered = calendars.filter(c => {
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterStatus !== "all" && (filterStatus === "active" ? !c.is_active : c.is_active)) return false;
    if (filterType !== "all" && c.calendar_type !== filterType) return false;
    return true;
  });

  // ---- AVAILABILITY LOCAL STATE ----
  const [localAvail, setLocalAvail] = useState<{ day_of_week: number; start_time: string; end_time: string; is_enabled: boolean }[]>([]);

  // Sync availability from query data
  useEffect(() => {
    if (availability.length > 0) {
      setLocalAvail(
        availability
          .filter(a => a.specific_date === null)
          .map(a => ({
            day_of_week: a.day_of_week!,
            start_time: a.start_time,
            end_time: a.end_time,
            is_enabled: a.is_enabled,
          }))
      );
    } else if (selectedCalendarId) {
      setLocalAvail(
        DAYS.map(d => ({
          day_of_week: d.value,
          start_time: "09:00",
          end_time: "18:00",
          is_enabled: d.value >= 1 && d.value <= 5,
        }))
      );
    }
  }, [availability, selectedCalendarId]);

  // ---- PREFERENCES LOCAL STATE ----
  const [localPrefs, setLocalPrefs] = useState({
    week_start_day: "monday",
    time_format: "24h",
    language: "it",
    show_services_menu: true,
    show_rooms: true,
    show_equipment: true,
  });

  // Sync preferences from query data
  useEffect(() => {
    if (preferences) {
      setLocalPrefs({
        week_start_day: preferences.week_start_day,
        time_format: preferences.time_format,
        language: preferences.language,
        show_services_menu: preferences.show_services_menu,
        show_rooms: preferences.show_rooms,
        show_equipment: preferences.show_equipment,
      });
    }
  }, [preferences]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Calendari Marketing</h1>
        <p className="text-muted-foreground">Gestisci i calendari del modulo Marketing e Vendita</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="calendars" className="gap-2"><CalendarDays className="h-4 w-4" />Calendari</TabsTrigger>
          <TabsTrigger value="preferences" className="gap-2"><Settings2 className="h-4 w-4" />Preferenze</TabsTrigger>
          <TabsTrigger value="availability" className="gap-2"><Clock className="h-4 w-4" />Disponibilità</TabsTrigger>
          <TabsTrigger value="connections" className="gap-2"><Link2 className="h-4 w-4" />Collegamenti</TabsTrigger>
        </TabsList>

        {/* TAB: CALENDARI */}
        <TabsContent value="calendars" className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div className="flex gap-2 flex-wrap items-center">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Cerca calendario..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 w-56" />
              </div>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-32"><SelectValue placeholder="Stato" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti</SelectItem>
                  <SelectItem value="active">Attivi</SelectItem>
                  <SelectItem value="inactive">Inattivi</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-32"><SelectValue placeholder="Tipo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti</SelectItem>
                  <SelectItem value="personal">Personale</SelectItem>
                  <SelectItem value="team">Team</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => { setEditingCalendar(null); setDialogOpen(true); }} className="gap-2">
              <Plus className="h-4 w-4" /> Nuovo calendario
            </Button>
          </div>

          {loadingCalendars ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <CalendarDays className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-1">Nessun calendario</h3>
                <p className="text-muted-foreground mb-4">Crea il tuo primo calendario marketing per iniziare</p>
                <Button onClick={() => { setEditingCalendar(null); setDialogOpen(true); }} className="gap-2">
                  <Plus className="h-4 w-4" /> Nuovo calendario
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead className="hidden sm:table-cell">Gruppo</TableHead>
                    <TableHead>Durata</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Stato</TableHead>
                    <TableHead className="hidden md:table-cell">Aggiornato</TableHead>
                    <TableHead className="text-right">Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(cal => (
                    <TableRow key={cal.id}>
                      <TableCell className="font-medium">{cal.name}</TableCell>
                      <TableCell className="hidden sm:table-cell text-muted-foreground">{cal.group_name || "—"}</TableCell>
                      <TableCell>{cal.duration_minutes} min</TableCell>
                      <TableCell>
                        <Badge variant={cal.calendar_type === "team" ? "default" : "secondary"}>
                          {cal.calendar_type === "team" ? "Team" : "Personale"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Switch checked={cal.is_active} onCheckedChange={(v) => toggleActive.mutate({ id: cal.id, is_active: v })} />
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                        {format(new Date(cal.updated_at), "dd MMM yyyy", { locale: it })}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => { setEditingCalendar(cal); setDialogOpen(true); }}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeleteId(cal.id)} className="text-destructive hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* TAB: PREFERENZE */}
        <TabsContent value="preferences" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Preferenze dell'app</CardTitle>
              <CardDescription>Configura le preferenze generali del calendario</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Giorno di inizio settimana</Label>
                  <Select value={localPrefs.week_start_day} onValueChange={v => setLocalPrefs(p => ({ ...p, week_start_day: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monday">Lunedì</SelectItem>
                      <SelectItem value="sunday">Domenica</SelectItem>
                      <SelectItem value="saturday">Sabato</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Servizi</CardTitle>
              <CardDescription>Attiva o disattiva le funzionalità aggiuntive</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div><Label>Menu dei servizi</Label><p className="text-sm text-muted-foreground">Mostra il menu dei servizi nel calendario</p></div>
                <Switch checked={localPrefs.show_services_menu} onCheckedChange={v => setLocalPrefs(p => ({ ...p, show_services_menu: v }))} />
              </div>
              <div className="flex items-center justify-between">
                <div><Label>Stanze</Label><p className="text-sm text-muted-foreground">Gestisci le stanze per gli appuntamenti</p></div>
                <Switch checked={localPrefs.show_rooms} onCheckedChange={v => setLocalPrefs(p => ({ ...p, show_rooms: v }))} />
              </div>
              <div className="flex items-center justify-between">
                <div><Label>Attrezzature</Label><p className="text-sm text-muted-foreground">Gestisci le attrezzature disponibili</p></div>
                <Switch checked={localPrefs.show_equipment} onCheckedChange={v => setLocalPrefs(p => ({ ...p, show_equipment: v }))} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Preferenze widget</CardTitle>
              <CardDescription>Configura la visualizzazione del widget calendario</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Lingua</Label>
                  <Select value={localPrefs.language} onValueChange={v => setLocalPrefs(p => ({ ...p, language: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="it">Italiano</SelectItem>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="es">Español</SelectItem>
                      <SelectItem value="de">Deutsch</SelectItem>
                      <SelectItem value="fr">Français</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Formato ora</Label>
                  <Select value={localPrefs.time_format} onValueChange={v => setLocalPrefs(p => ({ ...p, time_format: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="24h">24 ore</SelectItem>
                      <SelectItem value="12h">12 ore (AM/PM)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Inizio settimana</Label>
                  <Select value={localPrefs.week_start_day} onValueChange={v => setLocalPrefs(p => ({ ...p, week_start_day: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monday">Lunedì</SelectItem>
                      <SelectItem value="sunday">Domenica</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={() => upsertPreferences.mutate(localPrefs)} disabled={upsertPreferences.isPending}>
              {upsertPreferences.isPending ? "Salvataggio..." : "Salva preferenze"}
            </Button>
          </div>
        </TabsContent>

        {/* TAB: DISPONIBILITÀ */}
        <TabsContent value="availability" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Disponibilità settimanale</CardTitle>
              <CardDescription>Seleziona un calendario e configura gli orari di lavoro</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Calendario</Label>
                <Select value={selectedCalendarId || ""} onValueChange={setSelectedCalendarId}>
                  <SelectTrigger className="w-full sm:w-72"><SelectValue placeholder="Seleziona un calendario" /></SelectTrigger>
                  <SelectContent>
                    {calendars.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {!selectedCalendarId ? (
                <p className="text-muted-foreground text-sm py-4">Seleziona un calendario per configurare la disponibilità</p>
              ) : loadingAvail ? (
                <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : (
                <>
                  <div className="space-y-2">
                    {DAYS.map(day => {
                      const row = localAvail.find(a => a.day_of_week === day.value);
                      if (!row) return null;
                      return (
                        <div key={day.value} className="flex items-center gap-3 py-2 border-b last:border-0">
                          <Checkbox
                            checked={row.is_enabled}
                            onCheckedChange={(v) => setLocalAvail(prev => prev.map(a => a.day_of_week === day.value ? { ...a, is_enabled: !!v } : a))}
                          />
                          <span className="w-24 text-sm font-medium">{day.label}</span>
                          <Input
                            type="time"
                            value={row.start_time}
                            onChange={e => setLocalAvail(prev => prev.map(a => a.day_of_week === day.value ? { ...a, start_time: e.target.value } : a))}
                            className="w-28"
                            disabled={!row.is_enabled}
                          />
                          <span className="text-muted-foreground">–</span>
                          <Input
                            type="time"
                            value={row.end_time}
                            onChange={e => setLocalAvail(prev => prev.map(a => a.day_of_week === day.value ? { ...a, end_time: e.target.value } : a))}
                            className="w-28"
                            disabled={!row.is_enabled}
                          />
                          <Button variant="ghost" size="icon" title="Copia a tutti i giorni attivi" onClick={() => {
                            setLocalAvail(prev => prev.map(a => a.is_enabled ? { ...a, start_time: row.start_time, end_time: row.end_time } : a));
                          }}>
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-end pt-2">
                    <Button onClick={() => saveAvailability.mutate(localAvail)} disabled={saveAvailability.isPending}>
                      {saveAvailability.isPending ? "Salvataggio..." : "Salva disponibilità"}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB: COLLEGAMENTI */}
        <TabsContent value="connections" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Calendari collegati</CardTitle>
              <CardDescription>Collega calendari esterni come Google Calendar, Outlook, ecc.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Link2 className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-1">Prossimamente</h3>
              <p className="text-muted-foreground max-w-sm">
                L'integrazione con Google Calendar e altri calendari esterni sarà disponibile in un prossimo aggiornamento.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Configurazione del calendario</CardTitle>
              <CardDescription>Gestisci il calendario collegato e i calendari dei conflitti</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="font-medium text-sm">Calendario collegato</p>
                  <p className="text-sm text-muted-foreground">Nessun calendario collegato</p>
                </div>
                <Button variant="outline" size="sm" disabled>Collega</Button>
              </div>
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="font-medium text-sm">Calendari dei conflitti</p>
                  <p className="text-sm text-muted-foreground">Verifica disponibilità su calendari esterni</p>
                </div>
                <Button variant="outline" size="sm" disabled>Configura</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <CalendarDialog
        open={dialogOpen}
        onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditingCalendar(null); }}
        onSubmit={(data) => {
          if (editingCalendar) {
            updateCalendar.mutate({ id: editingCalendar.id, ...data });
          } else {
            createCalendar.mutate(data);
          }
        }}
        onAdvancedSettings={() => {
          setDialogOpen(false);
          setActiveTab("availability");
        }}
        initialData={editingCalendar}
        isLoading={createCalendar.isPending || updateCalendar.isPending}
      />

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare il calendario?</AlertDialogTitle>
            <AlertDialogDescription>Questa azione è irreversibile. Il calendario e tutte le relative disponibilità verranno eliminati.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteCalendar.mutate(deleteId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
