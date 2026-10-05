/**
 * CompanyEmailsOverview — Panoramica AZIENDALE degli account email connessi.
 *
 * Nel popup della scheda «Caselle email» in /azienda/impostazioni/integrazioni
 * (solo company_admin/super_admin). Stesso pattern di CompanyCalendarsOverview
 * ma per email_oauth_connections.
 *
 * La gestione dei MIEI account email (collega/disconnetti/cambia password) sta in
 * Mio Profilo → tab Email (EmailOAuthConnectionsCard). Qui l'admin vede
 * l'elenco di TUTTI gli utenti dell'azienda con account email collegato —
 * utile per:
 *  - Capire chi ha email sync attivo
 *  - Diagnosticare errori sync (consecutive_errors > 0, status != connected)
 *  - Vedere a colpo d'occhio l'ultima sync e quante email sono state scaricate
 *
 * Due pezzi (05/10/2026): `useCaselleDelTeam` (i dati, usati anche dalla
 * pagina per lo stato della scheda e il riquadro «Da sistemare») e
 * `CaselleDelTeam` (l'elenco). La spiegazione dell'errore dice «premi
 * Riconnetti», ma qui un amministratore guarda anche le caselle degli altri:
 * per quelle si dice chi deve ricollegarla, e il pulsante c'è solo sulla
 * propria.
 *
 * RLS richiesto: migration email_company_admin_select_view (2026-05-27).
 *
 * NOTA SICUREZZA: la query NON seleziona token/password (access_token_enc,
 * refresh_token_enc, password_enc). Anche se la RLS è a livello di riga,
 * limitiamo le colonne SELECT esposte al frontend per principio del minimo.
 */
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useIsCompanyAdmin } from "@/hooks/useIsCompanyAdmin";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { spiegaErroreCasella } from "@/lib/email/spiegaErroreCasella";
import { PallinoStato, type Tono } from "./StatoCollegamento";

type ProfileLite = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
};

export type CasellaDelTeam = {
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

export function nomeTitolareCasella(r: CasellaDelTeam): string {
  return formatUserName(r.profile, r.user_id);
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

// Lo stato scritto in DB è "active" (mai "connected"): prima ogni casella
// viva risultava in errore.
const viva = (s: string) => s === "active" || s === "connected";

/** Collegata ma non più letta. «disconnected» è una scelta, non un guasto. */
export function casellaDaRicollegare(status: string): boolean {
  return !viva(status) && status !== "disconnected";
}

function statoRiga(status: string, consecutiveErrors: number | null): { tono: Tono; label: string } {
  const errori = consecutiveErrors ?? 0;
  if (viva(status)) {
    return errori > 0
      ? { tono: "attenzione", label: errori === 1 ? "1 lettura non riuscita" : `${errori} letture non riuscite` }
      : { tono: "ok", label: "Attiva" };
  }
  if (status === "disconnected") return { tono: "spento", label: "Scollegata" };
  return { tono: "errore", label: "Da ricollegare" };
}

// Sempre lo stesso array vuoto: chi lo usa in un useMemo non ricalcola a ogni render.
const NESSUNA: CasellaDelTeam[] = [];

/** Le caselle collegate da tutta l'azienda (solo per gli amministratori). */
export function useCaselleDelTeam() {
  const { effectiveCompany } = useAuth();
  const isAdmin = useIsCompanyAdmin();
  const companyId = (effectiveCompany as any)?.id;

  const { data: righe = NESSUNA, isLoading } = useQuery<CasellaDelTeam[]>({
    queryKey: ["company-email-connections", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      // Selezioniamo SOLO colonne non-sensibili (no token, no password, no scopes
      // dettagliati). I token cifrati restano sul server, mai esposti al client.
      // NIENTE embed `profiles!user_id`: user_id punta ad auth.users, non
      // esiste una FK verso profiles → PostgREST rispondeva 400 e la
      // panoramica diceva "nessun account collegato" a TUTTE le aziende.
      // I profili si prendono con una seconda query .in() (pattern LMS).
      const { data, error } = await supabase
        .from("email_oauth_connections")
        .select(
          "id, user_id, provider, provider_label, email_address, status, last_synced_at, last_sync_error, consecutive_errors, emails_fetched_total, poll_enabled",
        )
        .eq("company_id", companyId)
        .order("status", { ascending: true })
        .order("last_synced_at", { ascending: false });
      if (error) throw error;
      const righe = (data || []) as Array<Omit<CasellaDelTeam, "profile"> & { user_id: string | null }>;
      const userIds = [...new Set(righe.map((r) => r.user_id).filter((x): x is string => !!x))];
      const profili = new Map<string, CasellaDelTeam["profile"]>();
      if (userIds.length > 0) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("id, first_name, last_name, email")
          .in("id", userIds);
        for (const p of (prof ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null; email: string | null }>) {
          profili.set(p.id, p);
        }
      }
      return righe.map((r) => ({ ...r, profile: (r.user_id && profili.get(r.user_id)) || null })) as CasellaDelTeam[];
    },
    enabled: isAdmin && !!companyId,
  });

  return { isAdmin, isLoading, righe };
}

/** L'elenco delle caselle del team, per provider, senza cornice. */
export function CaselleDelTeam() {
  const { user } = useAuth();
  const { isAdmin, isLoading, righe } = useCaselleDelTeam();

  if (!isAdmin) {
    return (
      <p className="text-sm text-muted-foreground">
        L'elenco delle caselle di tutta l'azienda lo vedono gli amministratori. Le tue caselle
        (Gmail, Outlook, IMAP) le colleghi dal tuo profilo.
      </p>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (righe.length === 0) {
    return (
      <div className="py-6 text-center text-sm text-muted-foreground">
        Nessuno ha ancora collegato una casella. Ognuno collega la propria Gmail, Outlook o IMAP
        dal suo profilo.
      </div>
    );
  }

  // Raggruppa per provider per UI più leggibile (Gmail / Outlook / IMAP)
  const byProvider = righe.reduce<Record<string, CasellaDelTeam[]>>((acc, r) => {
    const key = r.provider || "altro";
    acc[key] = acc[key] || [];
    acc[key].push(r);
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      {Object.entries(byProvider).map(([provider, providerRows]) => {
        const label = providerLabel(provider, providerRows[0]?.provider_label ?? null);
        return (
          <section key={provider} className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{label}</h3>
              <span className="text-xs text-muted-foreground tabular-nums">
                {providerRows.length} {providerRows.length === 1 ? "casella" : "caselle"}
              </span>
            </div>
            <div className="divide-y rounded-lg border">
              {providerRows.map((row) => (
                <EmailRow key={row.id} riga={row} mio={row.user_id === user?.id} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function EmailRow({ riga, mio }: { riga: CasellaDelTeam; mio: boolean }) {
  const navigate = useNavigate();
  const nome = nomeTitolareCasella(riga);
  const stato = statoRiga(riga.status, riga.consecutive_errors);
  const guasto = casellaDaRicollegare(riga.status);
  const spiegazione = spiegaErroreCasella(riga.last_sync_error, riga.provider);
  return (
    <div className="flex items-start justify-between gap-3 px-3 py-2.5 text-sm">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium truncate">
            {nome}
            {mio && <span className="font-normal text-muted-foreground"> (tu)</span>}
          </span>
          <PallinoStato tono={stato.tono} title={stato.tono === "attenzione" ? spiegazione || undefined : undefined}>
            {stato.label}
          </PallinoStato>
          {riga.poll_enabled === false && (
            <span className="text-[11px] text-muted-foreground">· controllo spento</span>
          )}
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {riga.email_address}
        </div>
        {guasto && (
          <div className="mt-0.5 text-xs text-rose-700 dark:text-rose-400" title={riga.last_sync_error ?? undefined}>
            {mio
              ? spiegazione || "Il collegamento si è interrotto: ricollegala dal tuo profilo, ci vuole un minuto."
              : `Il collegamento si è interrotto: deve ricollegarla ${nome} dal suo profilo.`}
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5 text-right">
        <div className="text-xs text-muted-foreground whitespace-nowrap">
          Controllata: {formatRelativeTime(riga.last_synced_at)}
        </div>
        {typeof riga.emails_fetched_total === "number" && riga.emails_fetched_total > 0 && (
          <div className="text-[10px] text-muted-foreground tabular-nums">
            {riga.emails_fetched_total.toLocaleString("it-IT")} email
          </div>
        )}
        {guasto && mio && (
          <Button
            size="sm"
            variant="outline"
            className="h-7"
            onClick={() => navigate("/azienda/impostazioni/mio-profilo?tab=email")}
          >
            Riconnetti
          </Button>
        )}
      </div>
    </div>
  );
}
