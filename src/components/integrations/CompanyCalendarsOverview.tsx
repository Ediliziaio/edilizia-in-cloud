/**
 * CompanyCalendarsOverview — Panoramica AZIENDALE dei calendari connessi.
 *
 * Pattern: la gestione dei MIEI calendari personali sta in /azienda/impostazioni/mio-profilo
 * (tab "calendari"). Qui l'admin vede l'elenco di TUTTI gli utenti
 * dell'azienda che hanno collegato Google, Apple o Outlook Calendar — utile per:
 *  - Capire chi ha sync attivo
 *  - Diagnosticare errori token (status != connected)
 *  - Vedere a colpo d'occhio l'ultima sync
 *
 * Tre pezzi (05/10/2026):
 *  - `useCalendariDelTeam`: i dati, usati anche dalla pagina Integrazioni per
 *    lo stato della scheda e il riquadro «Da sistemare»;
 *  - `CalendariDelTeam`: l'elenco senza cornice, nel popup della scheda
 *    Calendari in Integrazioni;
 *  - default export: l'elenco in una Card, nelle impostazioni dei calendari
 *    (marketing e lavori).
 * L'errore non si mostra più com'è salvato («Refresh token failed: { "error":
 * "invalid_grant" … }»): si dice cosa fare e chi deve farlo.
 *
 * Per non-admin la sezione mostra solo un placeholder con CTA al proprio profilo.
 *
 * RLS richiesto: policy SELECT su google_calendar_connections + apple_calendar_connections
 * che permetta a company_admin/super_admin di leggere le connessioni degli altri
 * utenti della stessa azienda. Migration: 20260527_calendar_admin_company_view.sql
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Calendar as CalendarIcon, ExternalLink, User2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useIsCompanyAdmin } from "@/hooks/useIsCompanyAdmin";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PallinoStato, type Tono } from "./StatoCollegamento";

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

export type ProviderCalendario = "google" | "apple" | "outlook";

/** Un calendario collegato, qualunque sia il provider. */
export type CalendarioDelTeam = {
  id: string;
  user_id: string;
  provider: ProviderCalendario;
  account: string | null;
  status: string;
  last_sync_at: string | null;
  last_error: string | null;
  nome: string;
};

const PROVIDER: ProviderCalendario[] = ["google", "apple", "outlook"];
const NOME_PROVIDER: Record<ProviderCalendario, string> = {
  google: "Google Calendar",
  apple: "Apple Calendar",
  outlook: "Microsoft Outlook",
};

/** Collegato ma non funziona più. «disconnected» è una scelta di chi l'ha scollegato, non un guasto. */
export function calendarioDaRicollegare(status: string): boolean {
  return status !== "connected" && status !== "disconnected";
}

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

function statoRiga(status: string): { tono: Tono; label: string } {
  if (status === "connected") return { tono: "ok", label: "Attivo" };
  if (status === "disconnected") return { tono: "spento", label: "Scollegato" };
  return { tono: "errore", label: "Da ricollegare" };
}

/** I calendari collegati da tutta l'azienda (solo per gli amministratori). */
export function useCalendariDelTeam() {
  const { effectiveCompany } = useAuth();
  const isAdmin = useIsCompanyAdmin();
  const companyId = (effectiveCompany as any)?.id;
  const abilitato = isAdmin && !!companyId;

  // A cosa serve, in concreto, ogni account collegato: quali calendari del
  // gestionale ci scrivono dentro. Senza questo l'elenco dice solo "Tizio ha
  // collegato Gmail", che non aiuta a capire cosa succede agli appuntamenti.
  const { data: calendariPerAccount } = useQuery({
    queryKey: ["calendari-per-account", companyId],
    enabled: abilitato,
    queryFn: async (): Promise<Map<string, string[]>> => {
      const { data } = await supabase
        .from("marketing_calendars")
        .select("name, external_connection_id")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .not("external_connection_id", "is", null);
      const mappa = new Map<string, string[]>();
      // `as unknown` di mezzo: le colonne dell'aggancio sono piu' recenti dei
      // tipi generati, che qui vedrebbero un errore di colonna inesistente.
      for (const c of (data ?? []) as unknown as Array<{ name: string; external_connection_id: string }>) {
        mappa.set(c.external_connection_id, [...(mappa.get(c.external_connection_id) ?? []), c.name]);
      }
      return mappa;
    },
  });

  const google = useQuery<GoogleCalRow[]>({
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
    enabled: abilitato,
  });

  const apple = useQuery<AppleCalRow[]>({
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
    enabled: abilitato,
  });

  const outlook = useQuery<OutlookCalRow[]>({
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
    enabled: abilitato,
  });

  const righe = useMemo<CalendarioDelTeam[]>(() => {
    const comune = (r: GoogleCalRow | AppleCalRow | OutlookCalRow, provider: ProviderCalendario, account: string | null) => ({
      id: r.id,
      user_id: r.user_id,
      provider,
      account,
      status: r.status,
      last_sync_at: r.last_sync_at,
      last_error: r.last_error,
      nome: formatUserName(r.profile, r.user_id),
    });
    return [
      ...(google.data ?? []).map((r) => comune(r, "google", r.google_account_email)),
      ...(apple.data ?? []).map((r) => comune(r, "apple", r.apple_id_email)),
      ...(outlook.data ?? []).map((r) => comune(r, "outlook", r.microsoft_account_email)),
    ];
  }, [google.data, apple.data, outlook.data]);

  return {
    isAdmin,
    isLoading: google.isLoading || apple.isLoading || outlook.isLoading,
    righe,
    calendariPerAccount: calendariPerAccount ?? new Map<string, string[]>(),
  };
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

/** L'elenco dei calendari del team, per provider, senza cornice. */
export function CalendariDelTeam() {
  const { user } = useAuth();
  const { isAdmin, isLoading, righe, calendariPerAccount } = useCalendariDelTeam();

  if (!isAdmin) {
    return (
      <p className="text-sm text-muted-foreground">
        L'elenco dei calendari di tutta l'azienda lo vedono gli amministratori. I tuoi calendari li
        colleghi dal tuo profilo.
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
        Nessuno ha ancora collegato un calendario. Ognuno collega il proprio Google, Outlook o
        Apple Calendar dal suo profilo.
      </div>
    );
  }

  // I provider che nessuno usa stanno in una riga sola, non in un titolo con
  // «Nessuna connessione» sotto (prima: due sezioni vuote su tre).
  const usati = PROVIDER.filter((p) => righe.some((r) => r.provider === p));
  const nonUsati = PROVIDER.filter((p) => !usati.includes(p));

  return (
    <div className="space-y-5">
      {usati.map((p) => {
        const delProvider = righe.filter((r) => r.provider === p);
        const attivi = delProvider.filter((r) => r.status === "connected").length;
        return (
          <section key={p} className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{NOME_PROVIDER[p]}</h3>
              <span className="text-xs text-muted-foreground tabular-nums">
                {attivi} di {delProvider.length} {delProvider.length === 1 ? "attivo" : "attivi"}
              </span>
            </div>
            <div className="divide-y rounded-lg border">
              {delProvider.map((row) => (
                <CalendarRow
                  key={row.id}
                  riga={row}
                  mio={row.user_id === user?.id}
                  calendariUsati={calendariPerAccount.get(row.id) ?? []}
                />
              ))}
            </div>
          </section>
        );
      })}
      {nonUsati.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Nessuno ha collegato {nonUsati.map((p) => NOME_PROVIDER[p]).join(" o ")}.
        </p>
      )}
    </div>
  );
}

export default function CompanyCalendarsOverview() {
  const navigate = useNavigate();
  const isAdmin = useIsCompanyAdmin();

  if (!isAdmin) {
    return <NonAdminPlaceholder />;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">Calendari collegati dal team</CardTitle>
          </div>
          <CardDescription className="text-xs">
            Ogni persona collega il proprio account dal suo profilo: qui vedi chi l'ha fatto,
            con quale indirizzo e quali calendari del gestionale ci scrivono dentro. Il tuo lo
            gestisci qui sopra, o da{" "}
            <button
              type="button"
              onClick={() => navigate("/azienda/impostazioni/mio-profilo?tab=calendari")}
              className="underline underline-offset-2 hover:text-foreground"
            >
              Mio Profilo → Calendari
            </button>
            .
          </CardDescription>
        </div>
        <Button variant="ghost" size="sm" onClick={() => navigate("/azienda/impostazioni/mio-profilo?tab=calendari")}>
          <ExternalLink className="h-4 w-4 mr-1.5" />
          Mio profilo
        </Button>
      </CardHeader>

      <CardContent>
        <CalendariDelTeam />
      </CardContent>
    </Card>
  );
}

function CalendarRow({
  riga,
  mio,
  calendariUsati = [],
}: {
  riga: CalendarioDelTeam;
  mio: boolean;
  calendariUsati?: string[];
}) {
  const navigate = useNavigate();
  const stato = statoRiga(riga.status);
  const guasto = calendarioDaRicollegare(riga.status);
  return (
    <div className="flex items-start justify-between gap-3 px-3 py-2.5 text-sm">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium truncate">
            {riga.nome}
            {mio && <span className="font-normal text-muted-foreground"> (tu)</span>}
          </span>
          <PallinoStato tono={stato.tono}>{stato.label}</PallinoStato>
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {riga.account ?? "—"}
        </div>
        {calendariUsati.length > 0 && (
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            Ci scrivono: {calendariUsati.join(", ")}
          </div>
        )}
        {guasto && (
          // Il testo originale dell'errore resta nel tooltip, per l'assistenza.
          <div className="mt-0.5 text-xs text-rose-700 dark:text-rose-400" title={riga.last_error ?? undefined}>
            {mio
              ? "L'accesso al calendario si è interrotto: ricollegalo dal tuo profilo, ci vuole un minuto."
              : `L'accesso al calendario si è interrotto: deve ricollegarlo ${riga.nome} dal suo profilo.`}
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          Ultima sync: {formatRelativeTime(riga.last_sync_at)}
        </span>
        {guasto && mio && (
          <Button
            size="sm"
            variant="outline"
            className="h-7"
            onClick={() => navigate("/azienda/impostazioni/mio-profilo?tab=calendari")}
          >
            Ricollega
          </Button>
        )}
      </div>
    </div>
  );
}
