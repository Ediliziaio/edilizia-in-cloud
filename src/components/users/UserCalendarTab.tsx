import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  useUserCalendarPrefs,
  useGoogleCalendarConnection,
  useSaveUserCalendarPrefs,
  useDisconnectGoogleCalendar,
} from "@/hooks/useUserCalendarPrefs";
import type { UserCalendarPrefs } from "@/hooks/useUserCalendarPrefs";
import { DIREZIONI_SYNC, type DirezioneSync } from "@/lib/calendar/direzioneSync";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";


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
  Loader2,
  Calendar,
  CheckCircle2,
  XCircle,
  ArrowRightLeft,
  ArrowRight,
  ArrowLeft,
  ExternalLink,
  RefreshCw,
  Apple,
} from "lucide-react";
import { formatRelativeTime } from "@/lib/formatters";
import { cn } from "@/lib/utils";


const ICONA_DIREZIONE: Record<DirezioneSync, typeof ArrowRightLeft> = {
  both: ArrowRightLeft,
  to_google: ArrowRight,
  from_google: ArrowLeft,
};

export function UserCalendarTab() {
  const { userId } = useParams<{ userId: string }>();
  const { effectiveCompany, user: authUser } = useAuth();
  const companyId = effectiveCompany?.id;
  const navigate = useNavigate();
  const { toast } = useToast();

  const { data: gcalConn, isLoading: connLoading } = useGoogleCalendarConnection(userId, companyId);
  const { data: prefsData, isLoading: prefsLoading } = useUserCalendarPrefs(userId);
  const saveMutation = useSaveUserCalendarPrefs(userId, companyId);
  const disconnectMutation = useDisconnectGoogleCalendar(userId, companyId);
  const [syncing, setSyncing] = useState(false);

  // Le modifiche non ancora salvate stanno da sole: prima un useEffect
  // ricopiava le preferenze appena arrivavano dal server e cancellava quello
  // che l'utente aveva appena toccato (oltre a far storcere il naso al lint).
  const [modifiche, setModifiche] = useState<Partial<UserCalendarPrefs>>({});
  const prefs: UserCalendarPrefs = {
    sync_enabled: true,
    sync_direction: "both",
    default_calendar_id: null,
    default_calendar_name: null,
    buffer_before_min: 0,
    buffer_after_min: 0,
    block_busy_slots: true,
    ...(prefsData ?? {}),
    ...modifiche,
  };
  const setPrefs = (aggiorna: (p: UserCalendarPrefs) => UserCalendarPrefs) =>
    setModifiche((m) => {
      const base: UserCalendarPrefs = { ...prefs, ...m };
      return { ...m, ...aggiorna(base) };
    });

  const isOwnProfile = userId === authUser?.id;
  const isConnected = gcalConn?.status === "connected";
  const isLoading = connLoading || prefsLoading;

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-calendar-sync", {
        body: { action: "full-sync", userId, companyId },
      });
      if (error) throw error;
      toast({
        title: "Sincronizzazione completata",
        description: data?.pulled != null
          ? `${data.pulled ?? 0} eventi aggiornati · ${data.busySlots ?? 0} slot occupati`
          : "Gli eventi sono stati sincronizzati.",
      });
    } catch (e) {
      toast({
        title: "Errore sincronizzazione",
        description: (e as Error).message || "Impossibile avviare la sincronizzazione.",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleConnect = () => {
    navigate(
      `/azienda/impostazioni/calendari?return=/azienda/impostazioni/utenti/${userId}?tab=calendar`
    );
  };

  const handleDisconnect = async () => {
    try {
      await disconnectMutation.mutateAsync();
      toast({
        title: "Calendario disconnesso",
        description: "La connessione con Google Calendar è stata rimossa.",
      });
    } catch (e) {
      toast({
        title: "Errore disconnessione",
        description: (e as Error).message || "Impossibile disconnettere il calendario.",
        variant: "destructive",
      });
    }
  };

  const handleSave = async () => {
    try {
      await saveMutation.mutateAsync(prefs);
      setModifiche({});
      toast({
        title: "Preferenze salvate",
        description: "Le impostazioni del calendario sono state aggiornate.",
      });
    } catch (e) {
      toast({
        title: "Errore salvataggio preferenze",
        description: (e as Error).message || "Impossibile salvare le preferenze.",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Google Calendar Connection */}
      <Card className={cn(
        "overflow-hidden border-l-4 transition-colors",
        isConnected ? "border-l-emerald-500" : "border-l-slate-300"
      )}>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Google Calendar</CardTitle>
            {isConnected && (
              <Badge className="ml-auto bg-emerald-600 hover:bg-emerald-600 gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Sync real-time attivo
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isConnected ? (
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <p className="font-medium text-sm">Connesso</p>
                  <p className="text-xs text-muted-foreground">{gcalConn?.google_account_email}</p>
                  {gcalConn?.updated_at && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Ultimo sync: {formatRelativeTime(gcalConn.updated_at)}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleSyncNow} disabled={syncing}>
                  {syncing ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
                  Sincronizza Ora
                </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10">
                    Disconnetti
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Disconnetti Google Calendar?</AlertDialogTitle>
                    <AlertDialogDescription>
                      La sincronizzazione degli appuntamenti con Google Calendar verrà interrotta.
                      Gli eventi già creati non verranno eliminati.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annulla</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDisconnect} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Disconnetti
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                  <XCircle className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-medium text-sm">Non connesso</p>
                  <p className="text-xs text-muted-foreground">
                    {isOwnProfile
                      ? "Collega il tuo Google Calendar per sincronizzare gli appuntamenti."
                      : "Questo utente non ha ancora collegato Google Calendar."}
                  </p>
                </div>
              </div>
              {isOwnProfile && (
                <Button size="sm" onClick={handleConnect}>
                  <Calendar className="h-4 w-4 mr-1.5" />
                  Collega
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Outlook — disponibile, si collega dal profilo o dalle impostazioni calendari */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            <CardTitle className="text-base">Microsoft Outlook</CardTitle>
          </div>
          <CardDescription>
            La sincronizzazione con Outlook (Microsoft 365) è attiva, in sola lettura: gli
            impegni Outlook compaiono come occupati nel calendario. Si collega con l'account
            Microsoft da Impostazioni → Calendari.
          </CardDescription>
        </CardHeader>
        {isOwnProfile && (
          <CardContent className="pt-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/azienda/impostazioni/calendari")}
            >
              <ExternalLink className="h-4 w-4 mr-1.5" />
              Apri impostazioni calendari
            </Button>
          </CardContent>
        )}
      </Card>

      {/* Apple Calendar — disponibile, si collega dalle impostazioni calendari */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Apple className="h-5 w-5" />
            <CardTitle className="text-base">Apple Calendar</CardTitle>
          </div>
          <CardDescription>
            La sincronizzazione con Apple Calendar (iCal) è attiva. Si collega da
            Impostazioni → Calendari, con una password per app di iCloud.
          </CardDescription>
        </CardHeader>
        {isOwnProfile && (
          <CardContent className="pt-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/azienda/impostazioni/calendari")}
            >
              <ExternalLink className="h-4 w-4 mr-1.5" />
              Apri impostazioni calendari
            </Button>
          </CardContent>
        )}
      </Card>

      {/* Sync Preferences (only show if connected) */}
      {isConnected && (
        <>
          <Separator />

          {/* Sync Enabled */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Sincronizzazione attiva</p>
                  <p className="text-xs text-muted-foreground">
                    Abilita o disabilita la sincronizzazione per questo utente.
                  </p>
                </div>
                <Switch
                  checked={prefs.sync_enabled}
                  onCheckedChange={(v) => setPrefs((p) => ({ ...p, sync_enabled: v }))}
                />
              </div>
            </CardContent>
          </Card>

          {/* Sync Direction */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">Direzione Sincronizzazione</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {DIREZIONI_SYNC.map((opt) => {
                const Icon = ICONA_DIREZIONE[opt.value];
                const selected = prefs.sync_direction === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPrefs((p) => ({ ...p, sync_direction: opt.value }))}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      selected
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50 hover:bg-muted/40"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center shrink-0">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{opt.label}</p>
                        <p className="text-xs text-muted-foreground">{opt.descrizione}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </CardContent>
          </Card>

          {/* I margini fra un appuntamento e l'altro NON stanno qui: sono una
              regola del calendario di prenotazione (Impostazioni → Calendari →
              Regole di agenda). Questa scheda li faceva scegliere e poi non li
              leggeva nessuno. */}

          {/* Block Busy Slots */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Blocca slot occupati</p>
                  <p className="text-xs text-muted-foreground">
                    Quando sei occupato in Google Calendar, non mostrare disponibilità per nuove prenotazioni.
                  </p>
                </div>
                <Switch
                  checked={prefs.block_busy_slots}
                  onCheckedChange={(v) => setPrefs((p) => ({ ...p, block_busy_slots: v }))}
                />
              </div>
            </CardContent>
          </Card>

          {/* Save */}
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salva Preferenze
            </Button>
          </div>
        </>
      )}

      {/* Info link */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2">
        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
        <span>
          Per gestire i calendari aziendali condivisi vai a{" "}
          <button
            type="button"
            className="underline hover:text-foreground transition-colors"
            onClick={() => navigate("/azienda/impostazioni/calendari")}
          >
            Impostazioni → Calendari
          </button>
        </span>
      </div>
    </div>
  );
}
