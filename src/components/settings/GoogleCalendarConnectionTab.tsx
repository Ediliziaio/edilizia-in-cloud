import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Link2, Plus, Trash2, CheckCircle2, AlertTriangle, Settings2, CalendarDays } from "lucide-react";
import GoogleCalendarSyncPrefsDialog from "./GoogleCalendarSyncPrefsDialog";

type GoogleCalendar = {
  id: string;
  summary: string;
  primary: boolean;
  backgroundColor?: string;
  accessRole?: string;
};

export default function GoogleCalendarConnectionTab() {
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id;
  const userId = user?.id;
  const queryClient = useQueryClient();
  const [syncPrefsOpen, setSyncPrefsOpen] = useState(false);
  const [editingPrimary, setEditingPrimary] = useState(false);
  const [editingConflict, setEditingConflict] = useState(false);
  const popupRef = useRef<Window | null>(null);
  const pollRef = useRef<number | null>(null);

  // Connection status
  const { data: connection, isLoading: loadingConn } = useQuery({
    queryKey: ["google-calendar-connection", companyId, userId],
    queryFn: async () => {
      if (!companyId || !userId) return null;
      const { data } = await supabase
        .from("google_calendar_connections")
        .select("*")
        .eq("company_id", companyId)
        .eq("user_id", userId)
        .maybeSingle();
      return data;
    },
    enabled: !!companyId && !!userId,
  });

  // Settings
  const { data: settings } = useQuery({
    queryKey: ["google-calendar-settings", companyId, userId],
    queryFn: async () => {
      if (!companyId || !userId) return null;
      const { data } = await supabase
        .from("google_calendar_settings")
        .select("*")
        .eq("company_id", companyId)
        .eq("user_id", userId)
        .maybeSingle();
      return data;
    },
    enabled: !!companyId && !!userId,
  });

  // Platform policies
  const { data: policies } = useQuery({
    queryKey: ["google-calendar-policies"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("manage-super-admins", {
        body: { action: "get-settings" },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const s = res.data?.settings || {};
      return {
        allowTwoWay: s.google_calendar_allow_two_way?.value === "true",
        allowGuestContact: s.google_calendar_allow_guest_contact_create?.value === "true",
        allowGoogleImport: s.google_calendar_allow_google_to_crm_import?.value === "true",
      };
    },
    staleTime: 5 * 60 * 1000,
  });

  // Google calendars list
  const { data: googleCalendars = [], isLoading: loadingCals, refetch: refetchCals } = useQuery({
    queryKey: ["google-calendars-list", companyId, userId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("google-calendar-auth", {
        body: { action: "list-calendars", companyId },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw new Error(res.error.message);
      return (res.data?.calendars || []) as GoogleCalendar[];
    },
    enabled: !!companyId && connection?.status === "connected",
  });

  const isConnected = connection?.status === "connected";

  // OAuth connect
  const handleConnect = useCallback(async () => {
    if (!companyId) return;
    const { data: { session } } = await supabase.auth.getSession();
    const res = await supabase.functions.invoke("google-calendar-auth", {
      body: { action: "start", companyId },
      headers: { Authorization: `Bearer ${session?.access_token}` },
    });
    if (res.error || !res.data?.url) {
      toast.error("Impossibile avviare il collegamento Google Calendar");
      return;
    }
    const w = 600, h = 700;
    const left = (screen.width - w) / 2;
    const top = (screen.height - h) / 2;
    const popup = window.open(res.data.url, "google_oauth", `width=${w},height=${h},left=${left},top=${top}`);
    popupRef.current = popup;

    pollRef.current = window.setInterval(() => {
      if (popupRef.current?.closed) {
        popupRef.current = null;
        if (pollRef.current) clearInterval(pollRef.current);
      }
    }, 1000);
  }, [companyId]);

  // Listen for OAuth result
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      // Validate origin to prevent cross-origin message injection
      const trustedOrigins = [window.location.origin, "https://edilizia-in-cloud.lovable.app"];
      if (!trustedOrigins.includes(event.origin)) return;
      if (event.data?.type === "GOOGLE_OAUTH_RESULT") {
        if (event.data.status === "success") {
          toast.success("Google Calendar collegato!");
          queryClient.invalidateQueries({ queryKey: ["google-calendar-connection"] });
          queryClient.invalidateQueries({ queryKey: ["google-calendar-settings"] });
          queryClient.invalidateQueries({ queryKey: ["google-calendars-list"] });
        } else {
          toast.error("Errore nel collegamento: " + (event.data.error || "sconosciuto"));
        }
        popupRef.current = null;
        if (pollRef.current) clearInterval(pollRef.current);
      }
    };
    window.addEventListener("message", handler);
    return () => {
      window.removeEventListener("message", handler);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [queryClient]);

  // Disconnect
  const disconnectMut = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("google-calendar-auth", {
        body: { action: "disconnect", companyId },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw new Error(res.error.message);
    },
    onSuccess: () => {
      toast.success("Google Calendar disconnesso");
      queryClient.invalidateQueries({ queryKey: ["google-calendar-connection"] });
      queryClient.invalidateQueries({ queryKey: ["google-calendar-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Update settings
  const updateSettings = useMutation({
    mutationFn: async (updates: Record<string, unknown>) => {
      if (!companyId || !userId) throw new Error("Missing context");
      const { error } = await supabase
        .from("google_calendar_settings")
        .update(updates)
        .eq("company_id", companyId)
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Impostazioni salvate");
      queryClient.invalidateQueries({ queryKey: ["google-calendar-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (loadingConn) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  // NOT CONNECTED
  if (!isConnected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Calendari collegati</CardTitle>
          <CardDescription>Collega Google Calendar per sincronizzare appuntamenti e bloccare slot occupati.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <CalendarDays className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">Nessun calendario collegato</h3>
          <p className="text-sm text-muted-foreground max-w-sm mb-6">
            Collega il tuo account Google Calendar per vedere gli slot occupati e sincronizzare gli appuntamenti.
          </p>
          <Button onClick={handleConnect} className="gap-2">
            <Plus className="h-4 w-4" />
            Aggiungi nuovo
          </Button>
        </CardContent>
      </Card>
    );
  }

  // CONNECTED
  const primaryCal = googleCalendars.find((c) => c.id === settings?.primary_calendar_id);
  const conflictIds: string[] = (settings?.conflict_calendar_ids as string[]) || [];
  const conflictCals = googleCalendars.filter((c) => conflictIds.includes(c.id));

  return (
    <div className="space-y-4">
      {/* Connected account card */}
      <Card>
        <CardHeader>
          <CardTitle>Calendari collegati</CardTitle>
          <CardDescription>Il tuo account Google Calendar è collegato.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <CalendarDays className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">Google Calendar</span>
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                </div>
                <p className="text-xs text-muted-foreground">
                  {connection?.google_account_email || "Account collegato"}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => disconnectMut.mutate()}
              disabled={disconnectMut.isPending}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          {connection?.status === "error" || connection?.status === "token_expired" ? (
            <div className="flex items-center gap-2 mt-3 p-2 rounded bg-destructive/10 text-destructive text-xs">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{connection.last_error || "Token scaduto. Ricollega il tuo account."}</span>
              <Button size="sm" variant="outline" onClick={handleConnect} className="ml-auto">
                Ricollega
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Calendar configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Configurazione del calendario</CardTitle>
          <CardDescription>Gestisci il calendario principale e i calendari dei conflitti</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Primary Calendar */}
          <div className="flex items-center justify-between py-2">
            <div className="flex-1">
              <p className="font-medium text-sm">Calendario collegato</p>
              <p className="text-sm text-muted-foreground">
                {primaryCal ? primaryCal.summary : "Nessun calendario selezionato"}
              </p>
            </div>
            {editingPrimary ? (
              <div className="flex items-center gap-2">
                <Select
                  value={settings?.primary_calendar_id || ""}
                  onValueChange={(val) => {
                    updateSettings.mutate({ primary_calendar_id: val });
                    setEditingPrimary(false);
                  }}
                >
                  <SelectTrigger className="w-[220px]">
                    <SelectValue placeholder="Seleziona calendario" />
                  </SelectTrigger>
                  <SelectContent>
                    {googleCalendars.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.summary} {c.primary ? "(Principale)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="sm" onClick={() => setEditingPrimary(false)}>
                  Annulla
                </Button>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setEditingPrimary(true)}>
                {primaryCal ? "Modifica" : "Seleziona"}
              </Button>
            )}
          </div>

          {/* Conflict Calendars */}
          <div className="flex items-center justify-between py-2">
            <div className="flex-1">
              <p className="font-medium text-sm">Calendari dei conflitti</p>
              <p className="text-sm text-muted-foreground">
                {conflictCals.length > 0
                  ? conflictCals.map((c) => c.summary).join(", ")
                  : "Nessun calendario selezionato"}
              </p>
            </div>
            {editingConflict ? (
              <div className="flex flex-col gap-2 min-w-[220px]">
                {loadingCals ? (
                  <Skeleton className="h-8 w-full" />
                ) : (
                  googleCalendars.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={conflictIds.includes(c.id)}
                        onCheckedChange={(checked) => {
                          const next = checked
                            ? [...conflictIds, c.id]
                            : conflictIds.filter((id) => id !== c.id);
                          updateSettings.mutate({ conflict_calendar_ids: next });
                        }}
                      />
                      {c.summary}
                    </label>
                  ))
                )}
                <Button variant="ghost" size="sm" onClick={() => setEditingConflict(false)}>
                  Chiudi
                </Button>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setEditingConflict(true)}>
                {conflictCals.length > 0 ? "Modifica" : "Configura"}
              </Button>
            )}
          </div>

          {/* Sync preferences link */}
          <div className="pt-2 border-t">
            <Button
              variant="link"
              className="p-0 h-auto text-sm gap-1"
              onClick={() => setSyncPrefsOpen(true)}
            >
              <Settings2 className="h-3.5 w-3.5" />
              Preferenze di sincronizzazione
            </Button>
          </div>
        </CardContent>
      </Card>

      <GoogleCalendarSyncPrefsDialog
        open={syncPrefsOpen}
        onOpenChange={setSyncPrefsOpen}
        syncMode={settings?.sync_mode || "one_way"}
        importGoogleEvents={settings?.import_google_events_to_crm || false}
        createContactsFromGuests={settings?.create_contacts_from_guests || false}
        allowTwoWay={policies?.allowTwoWay || false}
        allowGuestContactCreate={policies?.allowGuestContact || false}
        allowGoogleToImport={policies?.allowGoogleImport || false}
        onSave={(prefs) => {
          updateSettings.mutate(prefs);
          setSyncPrefsOpen(false);
        }}
        isSaving={updateSettings.isPending}
      />
    </div>
  );
}
