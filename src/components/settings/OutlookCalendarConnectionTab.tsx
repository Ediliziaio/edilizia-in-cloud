/**
 * OutlookCalendarConnectionTab — UI tab per collegare Outlook Calendar (Microsoft 365)
 *
 * Pattern identico a GoogleCalendarConnectionTab: OAuth popup → postMessage,
 * sync manuale, disconnect con AlertDialog. Mostra calendari disponibili e
 * permette di scegliere quale(i) sincronizzare.
 *
 * Wired in MarketingCalendarsConfig.tsx → tab "Collegamenti".
 */
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CheckCircle2, AlertTriangle, RefreshCw, Trash2, CalendarDays } from "lucide-react";

type OutlookConnection = {
  id: string;
  microsoft_account_email: string | null;
  status: string;
  primary_calendar_id: string | null;
  primary_calendar_name: string | null;
  synced_calendar_ids: string[] | null;
  last_sync_at: string | null;
  last_sync_event_count: number | null;
  last_error: string | null;
};

type OutlookCalendar = {
  outlook_calendar_id: string;
  name: string | null;
  color: string | null;
  is_default_calendar: boolean | null;
  can_edit: boolean | null;
  owner_name: string | null;
};

const POPUP_POLL_INTERVAL_MS = 800;
const POPUP_MAX_WAIT_MS = 5 * 60_000;

export default function OutlookCalendarConnectionTab() {
  const { effectiveCompany, user } = useAuth();
  const userId = user?.id;
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const popupRef = useRef<Window | null>(null);
  const pollRef = useRef<number | null>(null);
  const maxWaitRef = useRef<number | null>(null);

  const getAccessToken = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Sessione scaduta");
    return session.access_token;
  }, []);

  const { data: connection, refetch: refetchConnection } = useQuery({
    queryKey: ["outlook-calendar-connection", companyId, userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from("outlook_calendar_connections")
        .select("id, microsoft_account_email, status, primary_calendar_id, primary_calendar_name, synced_calendar_ids, last_sync_at, last_sync_event_count, last_error")
        .eq("user_id", userId)
        .eq("company_id", companyId!)
        .maybeSingle();
      if (error) throw error;
      return data as OutlookConnection | null;
    },
    // Un collegamento per azienda: senza il filtro, con più aziende la
    // scheda mostrava quello di un'altra.
    enabled: !!userId && !!companyId,
  });

  const isConnected = connection?.status === "connected";

  const { data: calendars = [] } = useQuery({
    queryKey: ["outlook-calendars-cache", connection?.id],
    queryFn: async () => {
      if (!connection?.id) return [];
      const { data, error } = await supabase
        .from("outlook_calendars_cache")
        .select("outlook_calendar_id, name, color, is_default_calendar, can_edit, owner_name")
        .eq("connection_id", connection.id)
        .order("is_default_calendar", { ascending: false });
      if (error) throw error;
      return (data ?? []) as OutlookCalendar[];
    },
    enabled: isConnected,
  });

  const syncedIds = useMemo(
    () => new Set(Array.isArray(connection?.synced_calendar_ids) ? connection.synced_calendar_ids : []),
    [connection?.synced_calendar_ids],
  );

  // ── OAuth popup ───────────────────────────────────────────────────────────
  const cleanupPopup = useCallback(() => {
    if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
    if (maxWaitRef.current) { window.clearTimeout(maxWaitRef.current); maxWaitRef.current = null; }
    if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
    popupRef.current = null;
    setConnecting(false);
  }, []);

  useEffect(() => () => cleanupPopup(), [cleanupPopup]);

  useEffect(() => {
    const handler = (ev: MessageEvent) => {
      // Il popup atterra su /oauth-done della NOSTRA origin (302 dal callback
      // edge): accettiamo solo messaggi same-origin, mai da terzi.
      if (ev.origin !== window.location.origin) return;
      const data = ev.data;
      if (!data || data.source !== "outlook-calendar-oauth") return;
      if (data.status === "ok") {
        toast.success("Outlook Calendar collegato");
        queryClient.invalidateQueries({ queryKey: ["outlook-calendar-connection"] });
        // Prima sync subito: senza, dopo il collegamento il calendario restava
        // vuoto finche' qualcuno non premeva "Sincronizza".
        setAutoSyncDopoCollegamento(true);
      } else {
        toast.error(`Errore OAuth: ${data.message ?? "sconosciuto"}`);
      }
      cleanupPopup();
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [cleanupPopup, queryClient]);

  const handleConnect = useCallback(async () => {
    if (!userId) return;
    setConnecting(true);
    try {
      const accessToken = await getAccessToken();
      const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string) || "";
      const res = await fetch(`${supabaseUrl}/functions/v1/outlook-calendar-auth?action=start`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ companyId }),
      });
      const json = await res.json();
      if (!res.ok || !json.url) throw new Error(json.error ?? "Impossibile avviare OAuth");

      const w = 520, h = 640;
      const left = window.screenX + (window.outerWidth - w) / 2;
      const top = window.screenY + (window.outerHeight - h) / 2;
      popupRef.current = window.open(json.url, "outlook_oauth", `width=${w},height=${h},left=${left},top=${top}`);
      if (!popupRef.current) throw new Error("Popup bloccato dal browser");

      pollRef.current = window.setInterval(() => {
        if (popupRef.current?.closed) { cleanupPopup(); refetchConnection(); }
      }, POPUP_POLL_INTERVAL_MS);
      maxWaitRef.current = window.setTimeout(cleanupPopup, POPUP_MAX_WAIT_MS);
    } catch (e) {
      toast.error((e as Error).message);
      setConnecting(false);
    }
  }, [userId, companyId, getAccessToken, cleanupPopup, refetchConnection]);

  const [autoSyncDopoCollegamento, setAutoSyncDopoCollegamento] = useState(false);

  // ── Sync ──────────────────────────────────────────────────────────────────
  const syncMutation = useMutation({
    mutationFn: async () => {
      setSyncing(true);
      const { data, error } = await supabase.functions.invoke("outlook-calendar-sync", {
        body: { companyId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Sincronizzazione completata: ${data?.synced ?? 0} eventi`);
      queryClient.invalidateQueries({ queryKey: ["outlook-calendar-connection"] });
      setSyncing(false);
    },
    onError: (e: Error) => {
      toast.error(`Errore sync: ${e.message}`);
      setSyncing(false);
    },
  });

  useEffect(() => {
    if (!autoSyncDopoCollegamento) return;
    setAutoSyncDopoCollegamento(false);
    syncMutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSyncDopoCollegamento]);

  // ── Toggle calendar in synced list ────────────────────────────────────────
  const toggleSyncedMutation = useMutation({
    mutationFn: async (calendarId: string) => {
      if (!connection?.id) throw new Error("Nessuna connection");
      const newIds = new Set(syncedIds);
      if (newIds.has(calendarId)) newIds.delete(calendarId);
      else newIds.add(calendarId);
      const { error } = await supabase
        .from("outlook_calendar_connections")
        .update({ synced_calendar_ids: Array.from(newIds) })
        .eq("id", connection.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["outlook-calendar-connection"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Disconnect ────────────────────────────────────────────────────────────
  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const accessToken = await getAccessToken();
      const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string) || "";
      const res = await fetch(`${supabaseUrl}/functions/v1/outlook-calendar-auth?action=disconnect`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ companyId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Errore disconnessione");
      return json;
    },
    onSuccess: () => {
      toast.success("Outlook Calendar scollegato");
      queryClient.invalidateQueries({ queryKey: ["outlook-calendar-connection"] });
      setDisconnectOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const lastSyncText = useMemo(() => {
    if (!connection?.last_sync_at) return null;
    return new Date(connection.last_sync_at).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });
  }, [connection?.last_sync_at]);

  if (!userId || !companyId) return null;

  return (
    <>
      <Card className="border-l-4 border-l-[#0078D4]">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
                <CalendarDays className="h-5 w-5 text-[#0078D4]" />
              </div>
              <div>
                <CardTitle className="text-base">Outlook Calendar (Microsoft 365)</CardTitle>
                <CardDescription>
                  Sincronizza appuntamenti Outlook con il tuo calendario commerciale EiC
                </CardDescription>
              </div>
            </div>
            {isConnected ? (
              <Badge className="bg-emerald-600 hover:bg-emerald-600">
                <CheckCircle2 className="mr-1 h-3 w-3" /> Collegato
              </Badge>
            ) : (
              <Badge variant="outline">Non collegato</Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {!isConnected && (
            <>
              <p className="text-sm text-muted-foreground">
                Collega l'account Microsoft 365 per importare appuntamenti, disponibilità e
                programmare lo stesso evento su entrambe le piattaforme.
              </p>
              <Button onClick={handleConnect} disabled={connecting} className="w-full bg-[#0078D4] hover:bg-[#005a9e]">
                {connecting ? "Connessione in corso..." : "Collega Outlook Calendar"}
              </Button>
            </>
          )}

          {isConnected && (
            <div className="space-y-4">
              <div className="rounded-lg bg-blue-50 p-3 text-sm">
                <p className="font-medium text-blue-900">Account Microsoft</p>
                <p className="text-blue-700 text-xs mt-1">{connection?.microsoft_account_email}</p>
              </div>

              {calendars.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Calendari da sincronizzare</p>
                  <div className="space-y-2 rounded-lg border p-3">
                    {calendars.map((cal) => (
                      <label
                        key={cal.outlook_calendar_id}
                        className="flex items-center gap-3 cursor-pointer hover:bg-slate-50 -mx-2 px-2 py-1 rounded"
                      >
                        <Checkbox
                          checked={syncedIds.has(cal.outlook_calendar_id)}
                          onCheckedChange={() => toggleSyncedMutation.mutate(cal.outlook_calendar_id)}
                          disabled={toggleSyncedMutation.isPending}
                        />
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {cal.color && (
                            <span
                              className="h-3 w-3 rounded-full shrink-0"
                              style={{ backgroundColor: cal.color.startsWith("#") ? cal.color : undefined }}
                            />
                          )}
                          <span className="text-sm truncate">{cal.name ?? "Senza nome"}</span>
                          {cal.is_default_calendar && (
                            <Badge variant="secondary" className="text-xs">Principale</Badge>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {lastSyncText && (
                <p className="text-xs text-muted-foreground">
                  Ultima sincronizzazione: {lastSyncText} · {connection?.last_sync_event_count ?? 0} eventi
                </p>
              )}
              {connection?.last_error && (
                <div className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
                  <AlertTriangle className="inline h-3 w-3 mr-1" />
                  {connection.last_error}
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  variant="default"
                  onClick={() => syncMutation.mutate()}
                  disabled={syncing || syncedIds.size === 0}
                  className="flex-1"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
                  Sincronizza ora
                </Button>
                <Button variant="outline" onClick={() => setDisconnectOpen(true)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Scollegare Outlook Calendar?</AlertDialogTitle>
            <AlertDialogDescription>
              Gli eventi già importati restano in EiC ma non riceverai più aggiornamenti da Outlook.
              Puoi ricollegare in qualsiasi momento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disconnectMutation.isPending}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => disconnectMutation.mutate()}
              disabled={disconnectMutation.isPending}
            >
              Scollega
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
