/**
 * Dati della pagina Impostazioni → Calendari lavori.
 *
 * Le squadre stanno in `external_teams` (vedi src/types/squadre.ts), i
 * calendari standard in `company_calendar_links`, le connessioni Google sono
 * quelle di tutti gli utenti dell'azienda (l'admin le legge per RLS).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/queryKeys";
import { userErrorMessage } from "@/lib/userErrorMessage";
import type { ExternalTeam } from "@/types/employees";
import type {
  CalendarioGoogle,
  CalendarioStandardKind,
  CompanyCalendarLink,
  ConnessioneGoogleAzienda,
} from "@/types/squadre";

const SQUADRA_COLS =
  "id, name, contact_name, phone, email, notes, is_active, vat_rate, color, kind, subappaltatore_id, " +
  "leader_user_id, google_connection_id, google_calendar_id, google_sync_enabled, google_last_sync_at, google_last_error";

/** Chiavi locali: shape diversa da `queryKeys.externalTeams.list`, quindi chiave diversa. */
export const calendariLavoriKeys = {
  squadre: (companyId: string | undefined) => ["calendari-lavori", "squadre", companyId] as const,
  connessioni: (companyId: string | undefined) => ["calendari-lavori", "connessioni", companyId] as const,
  calendari: (companyId: string | undefined, connectionId: string | null) =>
    ["calendari-lavori", "calendari", companyId, connectionId] as const,
  links: (companyId: string | undefined) => ["calendari-lavori", "links", companyId] as const,
  subappaltatori: (companyId: string | undefined) => ["calendari-lavori", "subappaltatori", companyId] as const,
};

/** Tutto ciò che altrove mostra le squadre: la pagina calendario e la commessa usano chiavi proprie. */
function invalidaSquadreOvunque(qc: ReturnType<typeof useQueryClient>, companyId: string | undefined) {
  qc.invalidateQueries({ queryKey: calendariLavoriKeys.squadre(companyId) });
  qc.invalidateQueries({ queryKey: queryKeys.externalTeams.all });
  qc.invalidateQueries({ queryKey: ["external-teams-filter"] });
  qc.invalidateQueries({ queryKey: ["external-teams-list"] });
}

/**
 * Un canale webhook per il calendario appena collegato: così quando la squadra
 * sposta una posa su Google, EiC lo sa subito. Best effort: se fallisce, il
 * cron delle 6 ore ci riprova e quello dei 15 minuti rilegge comunque.
 */
async function registraCanaleCalendario(connectionId: string | null, calendarId: string | null) {
  if (!connectionId || !calendarId) return;
  try {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    const res = await supabase.functions.invoke("google-calendar-webhook?action=register_calendar_watch", {
      body: { connectionId, calendarId },
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (res.error) console.warn("[calendari-lavori] canale non registrato", res.error.message);
  } catch (e) {
    console.warn("[calendari-lavori] canale non registrato", e);
  }
}

export function useSquadre() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  return useQuery({
    queryKey: calendariLavoriKeys.squadre(companyId),
    enabled: !!companyId,
    queryFn: async (): Promise<ExternalTeam[]> => {
      const { data, error } = await supabase
        .from("external_teams")
        .select(SQUADRA_COLS)
        .eq("company_id", companyId!)
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as ExternalTeam[];
    },
  });
}

export function useConnessioniGoogleAzienda() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  return useQuery({
    queryKey: calendariLavoriKeys.connessioni(companyId),
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async (): Promise<ConnessioneGoogleAzienda[]> => {
      const { data, error } = await supabase
        .from("google_calendar_connections")
        .select("id, user_id, google_account_email, status")
        .eq("company_id", companyId!)
        .order("google_account_email");
      if (error) throw error;
      return (data ?? []) as ConnessioneGoogleAzienda[];
    },
  });
}

/** I calendari Google di UNA connessione, letti dalla funzione edge (serve il token). */
export function useCalendariDiConnessione(connectionId: string | null) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  return useQuery({
    queryKey: calendariLavoriKeys.calendari(companyId, connectionId),
    enabled: !!companyId && !!connectionId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<CalendarioGoogle[]> => {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const res = await supabase.functions.invoke("google-calendar-auth", {
        body: { action: "list-calendars", companyId, connectionId },
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (res.error) throw new Error(res.error.message);
      const payload = res.data as { calendars?: CalendarioGoogle[]; error?: string };
      if (payload?.error) throw new Error(payload.error);
      return payload?.calendars ?? [];
    },
  });
}

export function useCalendarLinks() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  return useQuery({
    queryKey: calendariLavoriKeys.links(companyId),
    enabled: !!companyId,
    queryFn: async (): Promise<CompanyCalendarLink[]> => {
      const { data, error } = await supabase
        .from("company_calendar_links" as never)
        .select("*")
        .eq("company_id", companyId!);
      if (error) throw error;
      return (data ?? []) as unknown as CompanyCalendarLink[];
    },
  });
}

/** Le ditte con login: servono per dare un accesso alla squadra. */
export function useSubappaltatoriAzienda() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  return useQuery({
    queryKey: calendariLavoriKeys.subappaltatori(companyId),
    enabled: !!companyId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subappaltatori")
        .select("id, ragione_sociale, user_id, user_email")
        .eq("company_id", companyId!)
        .eq("is_active", true)
        .order("ragione_sociale");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; ragione_sociale: string; user_id: string | null; user_email: string | null }>;
    },
  });
}

export interface SquadraInput {
  id?: string;
  name: string;
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  is_active: boolean;
  vat_rate: number;
  kind: "interna" | "esterna";
  subappaltatore_id?: string | null;
  leader_user_id?: string | null;
  color?: string | null;
}

export function useSalvaSquadra() {
  const qc = useQueryClient();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  return useMutation({
    mutationFn: async (input: SquadraInput) => {
      const riga = {
        name: input.name,
        contact_name: input.contact_name || null,
        phone: input.phone || null,
        email: input.email || null,
        notes: input.notes || null,
        is_active: input.is_active,
        vat_rate: input.vat_rate,
        kind: input.kind,
        subappaltatore_id: input.subappaltatore_id || null,
        leader_user_id: input.leader_user_id || null,
        color: input.color || null,
      };
      if (input.id) {
        const { error } = await supabase.from("external_teams").update(riga as never).eq("id", input.id);
        if (error) throw error;
        return input.id;
      }
      const { data, error } = await supabase
        .from("external_teams")
        .insert({ ...riga, company_id: companyId! } as never)
        .select("id")
        .single();
      if (error) throw error;
      return (data as { id: string }).id;
    },
    onSuccess: (_id, input) => {
      invalidaSquadreOvunque(qc, companyId);
      toast.success(input.id ? "Squadra aggiornata" : "Squadra creata");
    },
    onError: (e) => toast.error("Squadra non salvata", { description: userErrorMessage(e) }),
  });
}

export function useEliminaSquadra() {
  const qc = useQueryClient();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("external_teams").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidaSquadreOvunque(qc, companyId);
      toast.success("Squadra eliminata");
    },
    onError: () =>
      toast.error("Impossibile eliminare", { description: "La squadra è assegnata a delle commesse: disattivala invece." }),
  });
}

/** Collega (o scollega, con null) il calendario Google della squadra. */
export function useCollegaCalendarioSquadra() {
  const qc = useQueryClient();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  return useMutation({
    mutationFn: async (p: {
      id: string;
      google_connection_id: string | null;
      google_calendar_id: string | null;
      google_sync_enabled?: boolean;
    }) => {
      const scollega = !p.google_connection_id || !p.google_calendar_id;
      const { error } = await supabase
        .from("external_teams")
        .update({
          google_connection_id: scollega ? null : p.google_connection_id,
          google_calendar_id: scollega ? null : p.google_calendar_id,
          google_sync_enabled: scollega ? false : (p.google_sync_enabled ?? true),
          google_last_error: null,
        } as never)
        .eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: (_r, p) => {
      invalidaSquadreOvunque(qc, companyId);
      toast.success(p.google_calendar_id ? "Calendario collegato" : "Calendario scollegato");
      void registraCanaleCalendario(p.google_connection_id, p.google_calendar_id);
    },
    onError: (e) => {
      const giaPreso = /ux_external_teams_google_calendar|duplicate/i.test(String((e as Error)?.message));
      toast.error("Collegamento non salvato", {
        description: giaPreso ? "Questo calendario Google è già collegato a un'altra squadra." : userErrorMessage(e),
      });
    },
  });
}

export function useSalvaCalendarLink() {
  const qc = useQueryClient();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  return useMutation({
    mutationFn: async (p: {
      kind: CalendarioStandardKind;
      google_connection_id: string | null;
      google_calendar_id: string | null;
      enabled?: boolean;
    }) => {
      const scollega = !p.google_connection_id || !p.google_calendar_id;
      const { error } = await supabase
        .from("company_calendar_links" as never)
        .upsert(
          {
            company_id: companyId!,
            kind: p.kind,
            google_connection_id: scollega ? null : p.google_connection_id,
            google_calendar_id: scollega ? null : p.google_calendar_id,
            enabled: scollega ? false : (p.enabled ?? true),
            last_error: null,
            updated_at: new Date().toISOString(),
          } as never,
          { onConflict: "company_id,kind" },
        );
      if (error) throw error;
    },
    onSuccess: (_r, p) => {
      qc.invalidateQueries({ queryKey: calendariLavoriKeys.links(companyId) });
      toast.success(p.google_calendar_id ? "Calendario collegato" : "Calendario scollegato");
      void registraCanaleCalendario(p.google_connection_id, p.google_calendar_id);
    },
    onError: (e) => toast.error("Collegamento non salvato", { description: userErrorMessage(e) }),
  });
}
