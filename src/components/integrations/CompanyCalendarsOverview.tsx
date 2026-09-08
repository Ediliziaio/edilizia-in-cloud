/**
 * CompanyCalendarsOverview — Panoramica AZIENDALE dei calendari connessi.
 *
 * Mostrata in /azienda/impostazioni/integrazioni (solo company_admin/super_admin).
 * Sostituisce la vecchia sezione che embeddava GoogleCalendarConnectionTab +
 * AppleCalendarConnectionTab inline (troppo invasiva, mescolava preferenze
 * personali dell'admin con la vista aziendale).
 *
 * Pattern: la gestione dei MIEI calendari personali sta in /azienda/impostazioni/mio-profilo
 * (tab "calendari"). Qui in Integrazioni l'admin vede l'elenco di TUTTI gli utenti
 * dell'azienda che hanno collegato Google o Apple Calendar — utile per:
 *  - Capire chi ha sync attivo
 *  - Diagnosticare errori token (status != connected)
 *  - Vedere a colpo d'occhio l'ultima sync
 *
 * Per non-admin la sezione mostra solo un placeholder con CTA al proprio profilo.
 *
 * RLS richiesto: policy SELECT su google_calendar_connections + apple_calendar_connections
 * che permetta a company_admin/super_admin di leggere le connessioni degli altri
 * utenti della stessa azienda. Migration: 20260527_calendar_admin_company_view.sql
 */
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Calendar as CalendarIcon, AlertCircle, CheckCircle2, ExternalLink, User2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useIsCompanyAdmin } from "@/hooks/useIsCompanyAdmin";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type ProfileLite = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
};

type GoogleCalRow = {
  id: string;
  user_id: string;
  google_account_email: string | null;
  status: string;
  last_sync_at: string | null;
  last_error: string | null;
  updated_at: string | null;
  // embedded join
  profile?: ProfileLite | null;
};

type AppleCalRow = {
  id: string;
  user_id: string;
  apple_id_email: string | null;
  status: string;
  last_sync_at: string | null;
  last_error: string | null;
  updated_at: string | null;
  profile?: ProfileLite | null;
};
type OutlookCalRow = {
  id: string;
  user_id: string;
  microsoft_account_email: string | null;
  status: string;
  last_sync_at: string | null;
  last_error: string | null;
  updated_at: string | null;
  profile?: ProfileLite | null;
};

/**
 * Profili degli utenti collegati con una seconda query `.in()`.
 * NIENTE embed `profiles!user_id`: user_id punta ad auth.users e non esiste
 * una FK verso profiles → PostgREST rispondeva 400 e la panoramica diceva
 * "nessun calendario collegato" a TUTTE le aziende.
 */
async function caricaProfili(userIds: Array<string | null | undefined>): Promise<Map<string, ProfileLite>> {
  const ids = [...new Set(userIds.filter((x): x is string => !!x))];
  const mappa = new Map<string, ProfileLite>();
  if (ids.length === 0) return mappa;
  const { data } = await supabase.from("profiles").select("id, first_name, last_name, email").in("id", ids);
  for (const p of (data ?? []) as ProfileLite[]) mappa.set(p.id, p);
  return mappa;
}

function formatUserName(p: ProfileLite | null | undefined, fallbackUserId: string): string {
  if (!p) return `Utente ${fallbackUserId.slice(0, 6)}…`;
  const name = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
  return name || p.email || `Utente ${fallbackUserId.slice(0, 6)}…`;
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "mai";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "ora";
  if (m < 60) return `${m} min fa`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h fa`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days} g fa`;
  return d.toLocaleDateString("it-IT");
}

function StatusBadge({ status }: { status: string }) {
  const isOk = status === "connected";
  const isWarn = status === "token_expired" || status === "auth_failed";
  return (
    <Badge
      variant={isOk ? "default" : isWarn ? "secondary" : "destructive"}
      className={cn(
        "text-[10px] gap-1",
        isOk && "bg-emerald-600 hover:bg-emerald-600",
        isWarn && "bg-amber-500 hover:bg-amber-500 text-white",
      )}
    >
      {isOk ? <CheckCircle2 className="h-2.5 w-2.5" /> : <AlertCircle className="h-2.5 w-2.5" />}
      {status === "connected" ? "Connesso" : status === "token_expired" ? "Token scaduto" : status === "auth_failed" ? "Auth fallita" : status === "disconnected" ? "Disconnesso" : status}
    </Badge>
  );
}

function NonAdminPlaceholder() {
  const navigate = useNavigate();
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CalendarIcon className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-base">Calendari aziendali</CardTitle>
        </div>
        <CardDescription>
          La panoramica calendari aziendali è riservata agli amministratori. Per
          gestire i tuoi calendari personali (Google / Apple) vai al tuo profilo.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="outline" size="sm" onClick={() => navigate("/azienda/impostazioni/mio-profilo")}>
          <User2 className="h-4 w-4 mr-2" />
          Vai al mio profilo
        </Button>
      </CardContent>
    </Card>
  );
}

export default function CompanyCalendarsOverview() {
  const { effectiveCompany } = useAuth();
  const navigate = useNavigate();
  const isAdmin = useIsCompanyAdmin();
  const companyId = (effectiveCompany as any)?.id;

  const { data: googleRows = [], isLoading: gLoading } = useQuery<GoogleCalRow[]>({
    queryKey: ["company-google-calendars", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("google_calendar_connections")
        .select("id, user_id, google_account_email, status, last_sync_at, last_error, updated_at")
        .eq("company_id", companyId)
        .order("status", { ascending: true })
        .order("last_sync_at", { ascending: false });
      if (error) throw error;
      const righe = (data || []) as GoogleCalRow[];
      const profili = await caricaProfili(righe.map((r) => r.user_id));
      return righe.map((r) => ({ ...r, profile: profili.get(r.user_id) ?? null }));
    },
    enabled: isAdmin && !!companyId,
  });

  const { data: appleRows = [], isLoading: aLoading } = useQuery<AppleCalRow[]>({
    queryKey: ["company-apple-calendars", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("apple_calendar_connections")
        .select("id, user_id, apple_id_email, status, last_sync_at, last_error, updated_at")
        .eq("company_id", companyId)
        .order("status", { ascending: true })
        .order("last_sync_at", { ascending: false });
      if (error) throw error;
      const righe = (data || []) as AppleCalRow[];
      const profili = await caricaProfili(righe.map((r) => r.user_id));
      return righe.map((r) => ({ ...r, profile: profili.get(r.user_id) ?? null }));
    },
    enabled: isAdmin && !!companyId,
  });

  const { data: outlookRows = [], isLoading: oLoading } = useQuery<OutlookCalRow[]>({
    queryKey: ["company-outlook-calendars", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("outlook_calendar_connections")
        .select("id, user_id, microsoft_account_email, status, last_sync_at, last_error, updated_at")
        .eq("company_id", companyId)
        .order("status", { ascending: true })
        .order("last_sync_at", { ascending: false });
      if (error) throw error;
      const righe = (data || []) as OutlookCalRow[];
      const profili = await caricaProfili(righe.map((r) => r.user_id));
      return righe.map((r) => ({ ...r, profile: profili.get(r.user_id) ?? null }));
    },
    enabled: isAdmin && !!companyId,
  });

  if (!isAdmin) {
    return <NonAdminPlaceholder />;
  }

  const isLoading = gLoading || aLoading || oLoading;
  const googleConnected = googleRows.filter((r) => r.status === "connected").length;
  const appleConnected = appleRows.filter((r) => r.status === "connected").length;
  const outlookConnected = outlookRows.filter((r) => r.status === "connected").length;
  const hasAny = googleRows.length > 0 || appleRows.length > 0 || outlookRows.length > 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">Calendari aziendali</CardTitle>
          </div>
          <CardDescription className="text-xs">
            Panoramica di tutti i Google Calendar, Outlook e Apple Calendar collegati dagli
            utenti della tua azienda. Per gestire i tuoi calendari personali vai a{" "}
            <button
              type="button"
              onClick={() => navigate("/azienda/impostazioni/mio-profilo")}
              className="underline underline-offset-2 hover:text-foreground"
            >
              Mio Profilo → Calendari
            </button>
            .
          </CardDescription>
        </div>
        <Button variant="ghost" size="sm" onClick={() => navigate("/azienda/impostazioni/mio-profilo")}>
          <ExternalLink className="h-4 w-4 mr-1.5" />
          Mio profilo
        </Button>
      </CardHeader>

      <CardContent className="space-y-6">
        {isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}

        {!isLoading && !hasAny && (
          <div className="text-center py-6 text-sm text-muted-foreground">
            Nessun utente dell'azienda ha ancora collegato un calendario. Invita gli
            utenti a connettere il proprio Google / Outlook / Apple Calendar dal loro profilo.
          </div>
        )}

        {!isLoading && hasAny && (
          <>
            {/* Google */}
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Google Calendar</h3>
                <span className="text-xs text-muted-foreground">
                  {googleConnected}/{googleRows.length} attivo
                </span>
              </div>
              {googleRows.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nessuna connessione Google Calendar.</p>
              ) : (
                <div className="border rounded-md divide-y">
                  {googleRows.map((row) => (
                    <CalendarRow
                      key={row.id}
                      userName={formatUserName(row.profile, row.user_id)}
                      accountEmail={row.google_account_email}
                      status={row.status}
                      lastSyncAt={row.last_sync_at}
                      lastError={row.last_error}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Apple */}
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Apple Calendar</h3>
                <span className="text-xs text-muted-foreground">
                  {appleConnected}/{appleRows.length} attivo
                </span>
              </div>
              {appleRows.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nessuna connessione Apple Calendar.</p>
              ) : (
                <div className="border rounded-md divide-y">
                  {appleRows.map((row) => (
                    <CalendarRow
                      key={row.id}
                      userName={formatUserName(row.profile, row.user_id)}
                      accountEmail={row.apple_id_email}
                      status={row.status}
                      lastSyncAt={row.last_sync_at}
                      lastError={row.last_error}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Outlook */}
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Microsoft Outlook</h3>
                <span className="text-xs text-muted-foreground">
                  {outlookConnected}/{outlookRows.length} attivo
                </span>
              </div>
              {outlookRows.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nessuna connessione Outlook.</p>
              ) : (
                <div className="border rounded-md divide-y">
                  {outlookRows.map((row) => (
                    <CalendarRow
                      key={row.id}
                      userName={formatUserName(row.profile, row.user_id)}
                      accountEmail={row.microsoft_account_email}
                      status={row.status}
                      lastSyncAt={row.last_sync_at}
                      lastError={row.last_error}
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function CalendarRow({
  userName,
  accountEmail,
  status,
  lastSyncAt,
  lastError,
}: {
  userName: string;
  accountEmail: string | null;
  status: string;
  lastSyncAt: string | null;
  lastError: string | null;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium truncate">{userName}</span>
          <StatusBadge status={status} />
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {accountEmail ?? "—"}
        </div>
        {lastError && status !== "connected" && (
          <div className="text-xs text-destructive mt-0.5 truncate" title={lastError}>
            {lastError}
          </div>
        )}
      </div>
      <div className="text-xs text-muted-foreground whitespace-nowrap">
        Ultima sync: {formatRelativeTime(lastSyncAt)}
      </div>
    </div>
  );
}
