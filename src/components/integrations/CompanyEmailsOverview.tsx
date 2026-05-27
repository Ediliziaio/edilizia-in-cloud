/**
 * CompanyEmailsOverview — Panoramica AZIENDALE degli account email connessi.
 *
 * Mostrata in /azienda/impostazioni/integrazioni (solo company_admin/super_admin).
 * Stesso pattern di CompanyCalendarsOverview ma per email_oauth_connections.
 *
 * La gestione dei MIEI account email (collega/disconnetti/cambia password) sta in
 * Mio Profilo → tab Email (EmailOAuthConnectionsCard). Qui in Integrazioni l'admin
 * vede l'elenco di TUTTI gli utenti dell'azienda con account email collegato —
 * utile per:
 *  - Capire chi ha email sync attivo
 *  - Diagnosticare errori sync (consecutive_errors > 0, status != connected)
 *  - Vedere a colpo d'occhio l'ultima sync e quante email sono state scaricate
 *
 * RLS richiesto: migration email_company_admin_select_view (2026-05-27).
 *
 * NOTA SICUREZZA: la query NON seleziona token/password (access_token_enc,
 * refresh_token_enc, password_enc). Anche se la RLS è a livello di riga,
 * limitiamo le colonne SELECT esposte al frontend per principio del minimo.
 */
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Mail, AlertCircle, CheckCircle2, ExternalLink, User2, Pause } from "lucide-react";
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

type EmailConnRow = {
  id: string;
  user_id: string;
  provider: string;
  provider_label: string | null;
  email_address: string;
  status: string;
  last_synced_at: string | null;
  last_sync_error: string | null;
  consecutive_errors: number | null;
  emails_fetched_total: number | null;
  poll_enabled: boolean | null;
  profile?: ProfileLite | null;
};

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

function providerLabel(provider: string, providerLabel: string | null): string {
  if (providerLabel) return providerLabel;
  switch (provider) {
    case "google":
    case "gmail":
      return "Gmail";
    case "microsoft":
    case "outlook":
      return "Outlook";
    case "imap":
      return "IMAP";
    default:
      return provider;
  }
}

function StatusBadge({ status, consecutiveErrors }: { status: string; consecutiveErrors: number | null }) {
  const isOk = status === "connected" && (consecutiveErrors ?? 0) === 0;
  const isWarn = status === "connected" && (consecutiveErrors ?? 0) > 0;
  const isError = status !== "connected";
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
      {isOk
        ? "Attivo"
        : isWarn
          ? `${consecutiveErrors} errori consecutivi`
          : isError
            ? status === "expired" || status === "token_expired"
              ? "Token scaduto"
              : status === "disconnected"
                ? "Disconnesso"
                : "Errore"
            : status}
    </Badge>
  );
}

function NonAdminPlaceholder() {
  const navigate = useNavigate();
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-base">Account email aziendali</CardTitle>
        </div>
        <CardDescription>
          La panoramica degli account email aziendali è riservata agli
          amministratori. Per gestire i tuoi account email (Gmail / Outlook /
          IMAP) vai al tuo profilo.
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

export default function CompanyEmailsOverview() {
  const { effectiveCompany } = useAuth();
  const navigate = useNavigate();
  const isAdmin = useIsCompanyAdmin();
  const companyId = (effectiveCompany as any)?.id;

  const { data: rows = [], isLoading } = useQuery<EmailConnRow[]>({
    queryKey: ["company-email-connections", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      // Selezioniamo SOLO colonne non-sensibili (no token, no password, no scopes
      // dettagliati). I token cifrati restano sul server, mai esposti al client.
      const { data, error } = await supabase
        .from("email_oauth_connections")
        .select(
          "id, user_id, provider, provider_label, email_address, status, last_synced_at, last_sync_error, consecutive_errors, emails_fetched_total, poll_enabled, profile:profiles!user_id(id, first_name, last_name, email)",
        )
        .eq("company_id", companyId)
        .order("status", { ascending: true })
        .order("last_synced_at", { ascending: false });
      if (error) throw error;
      return ((data || []) as unknown) as EmailConnRow[];
    },
    enabled: isAdmin && !!companyId,
  });

  if (!isAdmin) {
    return <NonAdminPlaceholder />;
  }

  // Raggruppa per provider per UI più leggibile (Gmail / Outlook / IMAP)
  const byProvider = rows.reduce<Record<string, EmailConnRow[]>>((acc, r) => {
    const key = r.provider || "altro";
    acc[key] = acc[key] || [];
    acc[key].push(r);
    return acc;
  }, {});

  const activeCount = rows.filter((r) => r.status === "connected" && (r.consecutive_errors ?? 0) === 0).length;
  const errorCount = rows.filter((r) => r.status !== "connected" || (r.consecutive_errors ?? 0) > 0).length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">Account email aziendali</CardTitle>
          </div>
          <CardDescription className="text-xs">
            Panoramica di tutti gli account email (Gmail, Outlook, IMAP) collegati
            dagli utenti della tua azienda. Per gestire i tuoi account vai a{" "}
            <button
              type="button"
              onClick={() => navigate("/azienda/impostazioni/mio-profilo")}
              className="underline underline-offset-2 hover:text-foreground"
            >
              Mio Profilo → Email
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

        {!isLoading && rows.length === 0 && (
          <div className="text-center py-6 text-sm text-muted-foreground">
            Nessun utente dell'azienda ha ancora collegato un account email.
            Invita gli utenti a connettere Gmail / Outlook / IMAP dal loro
            profilo.
          </div>
        )}

        {!isLoading && rows.length > 0 && (
          <>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-muted-foreground">Totale: {rows.length}</span>
              <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-600 text-[10px] gap-1">
                <CheckCircle2 className="h-2.5 w-2.5" />
                {activeCount} attivo
              </Badge>
              {errorCount > 0 && (
                <Badge variant="destructive" className="text-[10px] gap-1">
                  <AlertCircle className="h-2.5 w-2.5" />
                  {errorCount} con problemi
                </Badge>
              )}
            </div>

            {Object.entries(byProvider).map(([provider, providerRows]) => {
              const label = providerLabel(provider, providerRows[0]?.provider_label ?? null);
              return (
                <section key={provider} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">{label}</h3>
                    <span className="text-xs text-muted-foreground">
                      {providerRows.length} {providerRows.length === 1 ? "account" : "account"}
                    </span>
                  </div>
                  <div className="border rounded-md divide-y">
                    {providerRows.map((row) => (
                      <EmailRow
                        key={row.id}
                        userName={formatUserName(row.profile, row.user_id)}
                        emailAddress={row.email_address}
                        status={row.status}
                        consecutiveErrors={row.consecutive_errors}
                        lastSyncAt={row.last_synced_at}
                        lastError={row.last_sync_error}
                        emailsFetched={row.emails_fetched_total}
                        pollEnabled={row.poll_enabled}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function EmailRow({
  userName,
  emailAddress,
  status,
  consecutiveErrors,
  lastSyncAt,
  lastError,
  emailsFetched,
  pollEnabled,
}: {
  userName: string;
  emailAddress: string;
  status: string;
  consecutiveErrors: number | null;
  lastSyncAt: string | null;
  lastError: string | null;
  emailsFetched: number | null;
  pollEnabled: boolean | null;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium truncate">{userName}</span>
          <StatusBadge status={status} consecutiveErrors={consecutiveErrors} />
          {pollEnabled === false && (
            <Badge variant="outline" className="text-[10px] gap-1 text-muted-foreground">
              <Pause className="h-2.5 w-2.5" />
              Polling off
            </Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {emailAddress}
        </div>
        {lastError && status !== "connected" && (
          <div className="text-xs text-destructive mt-0.5 truncate" title={lastError}>
            {lastError}
          </div>
        )}
      </div>
      <div className="text-xs text-muted-foreground whitespace-nowrap text-right">
        <div>Sync: {formatRelativeTime(lastSyncAt)}</div>
        {typeof emailsFetched === "number" && emailsFetched > 0 && (
          <div className="text-[10px] opacity-70">{emailsFetched.toLocaleString("it-IT")} email</div>
        )}
      </div>
    </div>
  );
}
