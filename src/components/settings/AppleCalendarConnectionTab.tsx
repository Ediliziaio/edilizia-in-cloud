import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle2,
  AlertTriangle,
  CalendarDays,
  Trash2,
  RefreshCw,
  ExternalLink,
} from "lucide-react";

type AppleCalendar = {
  url: string;
  name: string;
  color: string;
  ctag: string;
};

export default function AppleCalendarConnectionTab() {
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id;
  const userId = user?.id;
  const queryClient = useQueryClient();

  const [appleId, setAppleId] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [editingPrimary, setEditingPrimary] = useState(false);

  // Connection status
  const { data: connection, isLoading: loadingConn } = useQuery({
    queryKey: ["apple-calendar-connection", companyId, userId],
    queryFn: async () => {
      if (!companyId || !userId) return null;
      const { data } = await supabase
        .from("apple_calendar_connections")
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
    queryKey: ["apple-calendar-settings", companyId, userId],
    queryFn: async () => {
      if (!companyId || !userId) return null;
      const { data } = await supabase
        .from("apple_calendar_settings")
        .select("*")
        .eq("company_id", companyId)
        .eq("user_id", userId)
        .maybeSingle();
      return data;
    },
    enabled: !!companyId && !!userId,
  });

  // Available calendars (only when connected)
  const { data: appleCalendars = [], isLoading: loadingCals } = useQuery({
    queryKey: ["apple-calendars-list", companyId, userId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("apple-calendar-auth", {
        body: { action: "list-calendars", companyId },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw new Error(res.error.message);
      return (res.data?.calendars || []) as AppleCalendar[];
    },
    enabled: !!companyId && connection?.status === "connected",
  });

  const isConnected = connection?.status === "connected";

  // Connect
  const handleConnect = async () => {
    if (!appleId || !appPassword) {
      toast.error("Inserisci Apple ID e App-Specific Password");
      return;
    }
    setConnecting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("apple-calendar-auth", {
        body: { action: "connect", companyId, appleId, appPassword },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error || res.data?.error) {
        toast.error(res.data?.error || "Connessione fallita");
        return;
      }
      toast.success("Apple Calendar collegato con successo!");
      setAppleId("");
      setAppPassword("");
      queryClient.invalidateQueries({ queryKey: ["apple-calendar-connection"] });
      queryClient.invalidateQueries({ queryKey: ["apple-calendar-settings"] });
      queryClient.invalidateQueries({ queryKey: ["apple-calendars-list"] });
    } catch (e: any) {
      toast.error(e.message || "Errore di connessione");
    } finally {
      setConnecting(false);
    }
  };

  // Disconnect mutation
  const disconnectMut = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("apple-calendar-auth", {
        body: { action: "disconnect", companyId },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw new Error(res.error.message);
    },
    onSuccess: () => {
      toast.success("Apple Calendar disconnesso");
      queryClient.invalidateQueries({ queryKey: ["apple-calendar-connection"] });
      queryClient.invalidateQueries({ queryKey: ["apple-calendar-settings"] });
      queryClient.invalidateQueries({ queryKey: ["apple-calendars-list"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Update settings
  const updateSettings = useMutation({
    mutationFn: async (updates: Record<string, unknown>) => {
      if (!companyId || !userId) throw new Error("Missing context");
      const { error } = await supabase
        .from("apple_calendar_settings")
        .update(updates)
        .eq("company_id", companyId)
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Impostazioni salvate");
      queryClient.invalidateQueries({ queryKey: ["apple-calendar-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Manual sync
  const handleSync = async () => {
    if (!companyId) return;
    setSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("apple-calendar-sync", {
        body: { action: "pull-busy-slots", companyId },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error || res.data?.error) {
        toast.error(res.data?.error || "Errore durante la sincronizzazione");
        return;
      }
      toast.success("Sincronizzazione completata", {
        description: `${res.data?.pulled ?? 0} eventi importati`,
      });
      queryClient.invalidateQueries({ queryKey: ["apple-busy-slots"] });
    } catch (e: any) {
      toast.error(e.message || "Errore sincronizzazione");
    } finally {
      setSyncing(false);
    }
  };

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
          <CardTitle>Apple Calendar (iCloud)</CardTitle>
          <CardDescription>
            Collega Apple Calendar tramite CalDAV per sincronizzare gli appuntamenti e bloccare gli slot occupati.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-lg border bg-muted/30 p-4 text-sm space-y-2">
            <p className="font-medium">Come ottenere una App-Specific Password:</p>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>
                Vai su{" "}
                <a
                  href="https://appleid.apple.com/account/manage"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline inline-flex items-center gap-1"
                >
                  appleid.apple.com <ExternalLink className="h-3 w-3" />
                </a>
              </li>
              <li>Accedi e vai su "Sicurezza dell'account"</li>
              <li>Clicca "Genera password" sotto "Password specifiche per app"</li>
              <li>Dai un nome (es. "Edilizia in Cloud") e copia la password generata</li>
            </ol>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="apple-id">Apple ID (email)</Label>
              <Input
                id="apple-id"
                type="email"
                placeholder="tuoemail@icloud.com"
                value={appleId}
                onChange={(e) => setAppleId(e.target.value)}
                autoComplete="username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="app-password">App-Specific Password</Label>
              <Input
                id="app-password"
                type="password"
                placeholder="xxxx-xxxx-xxxx-xxxx"
                value={appPassword}
                onChange={(e) => setAppPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <Button
              onClick={handleConnect}
              disabled={connecting || !appleId || !appPassword}
              className="w-full"
            >
              {connecting ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Connessione in corso...
                </>
              ) : (
                <>
                  <CalendarDays className="h-4 w-4 mr-2" />
                  Connetti Apple Calendar
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // CONNECTED
  const primaryCal = appleCalendars.find((c) => c.url === settings?.primary_calendar_url);
  const statusBadge =
    connection?.status === "connected" ? (
      <Badge variant="default" className="bg-green-500 hover:bg-green-600 text-white gap-1">
        <CheckCircle2 className="h-3 w-3" />
        Connesso
      </Badge>
    ) : connection?.status === "auth_failed" ? (
      <Badge variant="destructive" className="gap-1">
        <AlertTriangle className="h-3 w-3" />
        Errore autenticazione
      </Badge>
    ) : (
      <Badge variant="secondary" className="gap-1">Disconnesso</Badge>
    );

  return (
    <div className="space-y-4">
      {/* Connected account card */}
      <Card>
        <CardHeader>
          <CardTitle>Apple Calendar (iCloud)</CardTitle>
          <CardDescription>Il tuo account Apple Calendar è collegato via CalDAV.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <CalendarDays className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">Apple Calendar</span>
                  {statusBadge}
                </div>
                <p className="text-xs text-muted-foreground">
                  {connection?.apple_id_email || "Account collegato"}
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
                onClick={handleSync}
                disabled={syncing}
                className="gap-1.5"
              >
                <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">Sincronizza</span>
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    disabled={disconnectMut.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Disconnetti Apple Calendar?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Questa azione rimuoverà tutte le sincronizzazioni e gli slot occupati di Apple Calendar dal CRM. Gli appuntamenti originali in Apple Calendar non verranno eliminati.
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
          </div>

          {connection?.last_error && (
            <div className="flex items-center gap-2 mt-3 p-2 rounded bg-destructive/10 text-destructive text-xs">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{connection.last_error}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Calendar configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Configurazione del calendario</CardTitle>
          <CardDescription>Seleziona il calendario principale su cui sincronizzare gli appuntamenti CRM</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between py-2">
            <div className="flex-1">
              <p className="font-medium text-sm">Calendario principale</p>
              <p className="text-sm text-muted-foreground">
                {primaryCal ? primaryCal.name : "Nessun calendario selezionato"}
              </p>
            </div>
            {editingPrimary ? (
              <div className="flex items-center gap-2">
                {loadingCals ? (
                  <Skeleton className="h-9 w-[220px]" />
                ) : (
                  <Select
                    value={settings?.primary_calendar_url || ""}
                    onValueChange={(val) => {
                      const cal = appleCalendars.find((c) => c.url === val);
                      updateSettings.mutate({
                        primary_calendar_url: val,
                        primary_calendar_name: cal?.name || null,
                      });
                      setEditingPrimary(false);
                    }}
                  >
                    <SelectTrigger className="w-[220px]">
                      <SelectValue placeholder="Seleziona calendario" />
                    </SelectTrigger>
                    <SelectContent>
                      {appleCalendars.map((c) => (
                        <SelectItem key={c.url} value={c.url}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
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
        </CardContent>
      </Card>
    </div>
  );
}
