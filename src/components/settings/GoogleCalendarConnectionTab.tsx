import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Trash2, CheckCircle2, AlertTriangle, Settings2, CalendarDays, RefreshCw } from "lucide-react";
import GoogleCalendarSyncPrefsDialog from "./GoogleCalendarSyncPrefsDialog";
import { useUserCalendarPrefs } from "@/hooks/useUserCalendarPrefs";
import type { DirezioneSync } from "@/lib/calendar/direzioneSync";

type GoogleCalendar = {
  id: string;
  summary: string;
  primary: boolean;
  backgroundColor?: string;
  accessRole?: string;
};

const CONNECTION_TIMEOUT_MS = 8_000;

function withConnectionTimeout<T>(promise: PromiseLike<T>, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => reject(new Error(`${label}: controllo collegamento troppo lento.`)), CONNECTION_TIMEOUT_MS);
    promise.then(
      (value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

export default function GoogleCalendarConnectionTab() {
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id;
  const userId = user?.id;
  const { data: prefsUtente } = useUserCalendarPrefs(userId);
  const queryClient = useQueryClient();
  const [syncPrefsOpen, setSyncPrefsOpen] = useState(false);
  const [editingPrimary, setEditingPrimary] = useState(false);
  const [editingConflict, setEditingConflict] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [syncingBusy, setSyncingBusy] = useState(false);
  const popupRef = useRef<Window | null>(null);
  const pollRef = useRef<number | null>(null);
  // Safety valve: if the user ignores the popup for >5 min, stop polling.
  const maxPollTimeoutRef = useRef<number | null>(null);

  const getAccessToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Sessione scaduta: accedi di nuovo.");
    return session.access_token;
  };

  // Connection status
  const { data: connection, isLoading: loadingConn, isError: connectionError, error: connectionLoadError, refetch: refetchConnection, isFetching: connectionFetching } = useQuery({
    queryKey: ["google-calendar-connection", companyId, userId],
    queryFn: async () => {
      if (!companyId || !userId) return null;
      const { data, error } = await withConnectionTimeout(
        supabase
          .from("google_calendar_connections")
          // Mai i token cifrati: il database non li concede più al browser.
          .select("id, company_id, user_id, google_account_email, google_sub, token_expires_at, status, last_sync_at, last_error, created_at, updated_at, webhook_channel_id, webhook_resource_id, webhook_expiry_at, last_webhook_processed_at, last_sync_source")
          .eq("company_id", companyId)
          .eq("user_id", userId)
          .maybeSingle(),
        "Google Calendar",
      );
      if (error) throw error;
      return data;
    },
    enabled: !!companyId && !!userId,
    retry: false,
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
      if (!session?.access_token) throw new Error("Sessione scaduta: accedi di nuovo.");
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
      const token = await getAccessToken();
      const res = await supabase.functions.invoke("google-calendar-auth", {
        body: { action: "list-calendars", companyId },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.error) throw new Error(res.error.message);
      return (res.data?.calendars || []) as GoogleCalendar[];
    },
    enabled: !!companyId && connection?.status === "connected",
  });

  const isConnected = connection?.status === "connected";

  // OAuth connect
  const handleConnect = useCallback(async () => {
    try {
      if (!companyId) return;
      const token = await getAccessToken();
      const res = await supabase.functions.invoke("google-calendar-auth", {
        body: { action: "start", companyId },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.error || !res.data?.url) {
        toast.error("Impossibile avviare il collegamento Google Calendar");
        return;
      }
      const w = 600, h = 700;
      const left = (screen.width - w) / 2;
      const top = (screen.height - h) / 2;
      const popup = window.open(res.data.url, "google_oauth", `width=${w},height=${h},left=${left},top=${top}`);
      if (!popup) {
        toast.error("Il popup è stato bloccato dal browser. Consenti i popup per questo sito e riprova.");
        return;
      }
      popupRef.current = popup;

      const stopPolling = () => {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        if (maxPollTimeoutRef.current) { clearTimeout(maxPollTimeoutRef.current); maxPollTimeoutRef.current = null; }
        popupRef.current = null;
      };

      pollRef.current = window.setInterval(() => {
        if (popupRef.current?.closed) {
          stopPolling();
          // Se il messaggio del popup si perde (window.opener tagliato dal
          // browser), si rilegge comunque lo stato: prima restava «non collegato».
          queryClient.invalidateQueries({ queryKey: ["google-calendar-connection"] });
          queryClient.invalidateQueries({ queryKey: ["google-calendar-settings"] });
        }
      }, 1000);

      // Safety: stop polling after 5 minutes regardless of popup state
      maxPollTimeoutRef.current = window.setTimeout(stopPolling, 5 * 60 * 1000);
    } catch (e: any) {
      toast.error(e.message || "Impossibile avviare il collegamento Google Calendar");
      return;
    }
  }, [companyId, queryClient]);

  // Listen for OAuth result
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      // Validate origin to prevent cross-origin message injection
      const trustedOrigins = [window.location.origin];
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
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        if (maxPollTimeoutRef.current) { clearTimeout(maxPollTimeoutRef.current); maxPollTimeoutRef.current = null; }
      }
    };
    window.addEventListener("message", handler);
    return () => {
      window.removeEventListener("message", handler);
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      if (maxPollTimeoutRef.current) { clearTimeout(maxPollTimeoutRef.current); maxPollTimeoutRef.current = null; }
    };
  }, [queryClient]);

  // Disconnect
  const disconnectMut = useMutation({
    mutationFn: async () => {
      const token = await getAccessToken();
      const res = await supabase.functions.invoke("google-calendar-auth", {
        body: { action: "disconnect", companyId },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.error) throw new Error(res.error.message);
    },
    onSuccess: () => {
      toast.success("Google Calendar disconnesso");
      queryClient.invalidateQueries({ queryKey: ["google-calendar-connection"] });
      queryClient.invalidateQueries({ queryKey: ["google-calendar-settings"] });
      setDisconnectOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handlePullBusySlots = async () => {
    if (!companyId) return;
    setSyncingBusy(true);
    try {
      const token = await getAccessToken();
      const res = await supabase.functions.invoke("google-calendar-sync", {
        body: { action: "full-sync", companyId },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.error || res.data?.error) {
        throw new Error(res.data?.error || res.error?.message || "Sincronizzazione non riuscita");
      }
      toast.success("Slot occupati aggiornati", {
        description: `${res.data?.pulled ?? 0} eventi importati da Google Calendar.`,
      });
      // 2026-05-27 (audit fix): invalida le query così il calendario CRM
      // si aggiorna immediatamente con i nuovi slot Google. Prima l'utente
      // doveva fare refresh manuale per vedere gli eventi importati.
      queryClient.invalidateQueries({ queryKey: ["gcal-busy-slots", companyId] });
      queryClient.invalidateQueries({ queryKey: ["google-calendar-connection", companyId] });
      queryClient.invalidateQueries({ queryKey: ["google-calendar-settings", companyId] });
      queryClient.invalidateQueries({ queryKey: ["unified-calendar-busy-slots", companyId] });
      // Calendari marketing/appointments che leggono busy slots
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      queryClient.invalidateQueries({ queryKey: ["marketing-calendar"] });
    } catch (e: any) {
      toast.error(e.message || "Errore sincronizzazione Google Calendar");
    } finally {
      setSyncingBusy(false);
    }
  };

  // Update settings
  const updateSettings = useMutation({
    // sync_direction non appartiene a questa tabella: e' la preferenza utente
    // che la sincronizzazione legge davvero.
    mutationFn: async (updates: Record<string, unknown>) => {
      if (!companyId || !userId) throw new Error("Missing context");
      const { sync_direction: direzione, ...settings } = updates as { sync_direction?: DirezioneSync };
      const { error } = await supabase
        .from("google_calendar_settings")
        .update(settings)
        .eq("company_id", companyId)
        .eq("user_id", userId);
      if (error) throw error;
      if (direzione) {
        const { error: prefErr } = await supabase
          .from("user_calendar_preferences")
          .upsert(
            { user_id: userId, company_id: companyId, sync_direction: direzione, updated_at: new Date().toISOString() } as never,
            { onConflict: "user_id" },
          );
        if (prefErr) throw prefErr;
      }
    },
    onSuccess: () => {
      toast.success("Impostazioni salvate");
      queryClient.invalidateQueries({ queryKey: ["google-calendar-settings"] });
      queryClient.invalidateQueries({ queryKey: ["user-calendar-prefs", userId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (loadingConn) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Calendari collegati</CardTitle>
          <CardDescription>Controllo lo stato del collegamento Google Calendar...</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (connectionError) {
    return (
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle>Calendari collegati</CardTitle>
          <CardDescription>Non riesco a controllare Google Calendar in questo momento.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2 rounded-lg bg-destructive/5 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{connectionLoadError instanceof Error ? connectionLoadError.message : "Controllo collegamento non riuscito."}</span>
          </div>
          <Button variant="outline" onClick={() => refetchConnection()} disabled={connectionFetching}>
            {connectionFetching ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : null}
            Riprova
          </Button>
        </CardContent>
      </Card>
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
                {connection?.last_sync_at && (
                  <p className="text-xs text-muted-foreground">
                    Ultima sync: {new Date(connection.last_sync_at).toLocaleString("it-IT")}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePullBusySlots}
                disabled={syncingBusy || !settings?.conflict_calendar_ids?.length}
                className="gap-1.5"
              >
                <RefreshCw className={`h-4 w-4 ${syncingBusy ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">Aggiorna busy</span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setDisconnectOpen(true)}
                disabled={disconnectMut.isPending}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
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
          <CardTitle>Impostazioni generali dell'account</CardTitle>
          <CardDescription>
            Il calendario di ogni singolo calendario marketing si sceglie dentro il calendario stesso
            (Calendari marketing → apri il calendario → <strong>Calendario esterno</strong>).
            Qui imposti il ripiego per chi non ha scelto, e quali calendari vuoi vedere come
            &quot;occupati&quot;.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* 2026-05-27: UX rivista — label esplicite + sempre visibile lo stato
              corrente + helper text. Prima i nomi "calendario collegato" e
              "calendari dei conflitti" non comunicavano cosa facessero. */}

          {/* Primary Calendar — TARGET PUSH CRM → Google */}
          <div className="rounded-md border bg-muted/20 p-3">
            <div className="mb-2 flex items-start justify-between gap-3">
              <div className="flex-1">
                <p className="text-sm font-semibold">
                  📤 Calendario di ripiego
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Usato solo dagli appuntamenti dei calendari che non hanno scelto un calendario esterno proprio.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditingPrimary((v) => !v)}
                disabled={loadingCals}
              >
                {editingPrimary ? "Annulla" : (primaryCal ? "Cambia" : "Seleziona")}
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-blue-600 shrink-0" />
              <span className="text-sm font-medium">
                {primaryCal
                  ? `${primaryCal.summary}${primaryCal.primary ? " (calendario principale)" : ""}`
                  : (settings?.primary_calendar_id === "primary"
                      ? "Calendario principale Google"
                      : <span className="text-amber-700">⚠ Nessun calendario selezionato</span>)}
              </span>
            </div>
            {editingPrimary && (
              <div className="mt-3 border-t pt-3">
                <Select
                  value={settings?.primary_calendar_id || ""}
                  onValueChange={(val) => {
                    updateSettings.mutate({ primary_calendar_id: val });
                    setEditingPrimary(false);
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Scegli un calendario Google…" />
                  </SelectTrigger>
                  <SelectContent>
                    {googleCalendars.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.summary} {c.primary ? "· Principale" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Conflict Calendars — IMPORT BUSY SLOTS DA Google */}
          <div className="rounded-md border bg-muted/20 p-3">
            <div className="mb-2 flex items-start justify-between gap-3">
              <div className="flex-1">
                <p className="text-sm font-semibold">
                  📥 Altri calendari da visualizzare nel CRM
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Gli eventi di questi calendari appariranno come slot "occupati" nel calendario
                  marketing, così eviti di prendere appuntamenti sovrapposti.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditingConflict((v) => !v)}
                disabled={loadingCals}
              >
                {editingConflict ? "Chiudi" : (conflictCals.length > 0 ? "Modifica" : "Configura")}
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {conflictCals.length > 0 ? (
                conflictCals.map((c) => (
                  <span
                    key={c.id}
                    className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-800 border border-blue-200"
                  >
                    <CalendarDays className="h-3 w-3" />
                    {c.summary}
                  </span>
                ))
              ) : (
                <span className="text-xs text-muted-foreground italic">
                  Nessun altro calendario selezionato — solo il calendario di destinazione viene mostrato.
                </span>
              )}
            </div>
            {editingConflict && (
              <div className="mt-3 border-t pt-3">
                {loadingCals ? (
                  <Skeleton className="h-8 w-full" />
                ) : googleCalendars.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nessun calendario disponibile</p>
                ) : (
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {googleCalendars
                      .filter((c) => c.id !== settings?.primary_calendar_id) // non duplicare il primary
                      .map((c) => (
                      <label
                        key={c.id}
                        className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted/40"
                      >
                        <Checkbox
                          checked={conflictIds.includes(c.id)}
                          onCheckedChange={(checked) => {
                            const next = checked
                              ? [...conflictIds, c.id]
                              : conflictIds.filter((id) => id !== c.id);
                            updateSettings.mutate({ conflict_calendar_ids: next });
                          }}
                        />
                        <span className="truncate">{c.summary}</span>
                        {c.primary && (
                          <span className="text-[10px] text-muted-foreground">(principale)</span>
                        )}
                      </label>
                    ))}
                  </div>
                )}
              </div>
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
        direzione={prefsUtente?.id ? (prefsUtente.sync_direction as DirezioneSync) : undefined}
        importGoogleEvents={settings?.import_google_events_to_crm || false}
        createContactsFromGuests={settings?.create_contacts_from_guests || false}
        eventPrivacy={(settings?.event_privacy === "busy_only" ? "busy_only" : "full") as "full" | "busy_only"}
        allowTwoWay={policies?.allowTwoWay || false}
        allowGuestContactCreate={policies?.allowGuestContact || false}
        allowGoogleToImport={policies?.allowGoogleImport || false}
        onSave={(prefs) => {
          updateSettings.mutate(prefs);
          setSyncPrefsOpen(false);
        }}
        isSaving={updateSettings.isPending}
      />

      <AlertDialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnettere Google Calendar?</AlertDialogTitle>
            <AlertDialogDescription>
              La sincronizzazione verrà interrotta e i nuovi appuntamenti CRM non saranno più inviati a Google Calendar finché non ricolleghi l'account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => disconnectMut.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Disconnetti
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
