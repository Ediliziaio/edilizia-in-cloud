/**
 * Le caselle di calendario collegate all'azienda (Google, Outlook, Apple) e i
 * calendari che ci sono dentro.
 *
 * Serve al momento in cui una persona sola mette in fila tutto: sceglie la
 * casella, poi il calendario. Ogni provider tiene le sue connessioni in una
 * tabella diversa, ma qui escono in una lista unica.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type ProviderCalendario = "google" | "outlook" | "apple";

export const PROVIDER_LABEL: Record<ProviderCalendario, string> = {
  google: "Google",
  outlook: "Outlook",
  apple: "Apple",
};

/**
 * Chi scrive davvero gli appuntamenti sul calendario esterno. Outlook oggi
 * viene solo letto (i suoi impegni bloccano gli orari): dirlo nella tendina e'
 * meglio che far credere a chi configura che gli appuntamenti ci arrivino.
 */
export const PROVIDER_SCRIVE_APPUNTAMENTI: Record<ProviderCalendario, boolean> = {
  google: true,
  apple: true,
  outlook: false,
};

export interface CasellaCalendario {
  provider: ProviderCalendario;
  connectionId: string;
  email: string;
  status: string;
}

export interface CalendarioEsterno {
  id: string;
  nome: string;
  colore?: string | null;
  principale?: boolean;
}

/** Tutte le caselle collegate dell'azienda: quelle che la RLS lascia vedere a chi guarda. */
export function useCaselleCalendario() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  return useQuery({
    queryKey: ["caselle-calendario", companyId],
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async (): Promise<CasellaCalendario[]> => {
      const [g, o, a] = await Promise.all([
        supabase.from("google_calendar_connections").select("id, google_account_email, status").eq("company_id", companyId!),
        supabase.from("outlook_calendar_connections").select("id, microsoft_account_email, status").eq("company_id", companyId!),
        supabase.from("apple_calendar_connections").select("id, apple_id_email, status").eq("company_id", companyId!),
      ]);
      const caselle: CasellaCalendario[] = [];
      for (const r of (g.data ?? []) as Array<{ id: string; google_account_email: string | null; status: string }>) {
        caselle.push({ provider: "google", connectionId: r.id, email: r.google_account_email ?? "Account Google", status: r.status });
      }
      for (const r of (o.data ?? []) as Array<{ id: string; microsoft_account_email: string | null; status: string }>) {
        caselle.push({ provider: "outlook", connectionId: r.id, email: r.microsoft_account_email ?? "Account Outlook", status: r.status });
      }
      for (const r of (a.data ?? []) as Array<{ id: string; apple_id_email: string | null; status: string }>) {
        caselle.push({ provider: "apple", connectionId: r.id, email: r.apple_id_email ?? "Account Apple", status: r.status });
      }
      // Le caselle rotte restano in lista ma in fondo: chi configura deve sapere che ci sono.
      return caselle.sort((x, y) => Number(y.status === "connected") - Number(x.status === "connected") || x.email.localeCompare(y.email));
    },
  });
}

/** I calendari dentro una casella. Google e Apple passano dalle edge (serve il token), Outlook dalla cache. */
export function useCalendariDiCasella(casella: CasellaCalendario | null) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  return useQuery({
    queryKey: ["calendari-di-casella", casella?.provider, casella?.connectionId],
    enabled: !!companyId && !!casella,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<CalendarioEsterno[]> => {
      if (!casella) return [];
      if (casella.provider === "outlook") {
        const { data, error } = await supabase
          .from("outlook_calendars_cache")
          .select("outlook_calendar_id, name, color, is_default_calendar")
          .eq("connection_id", casella.connectionId)
          .order("name");
        if (error) throw error;
        return (data ?? []).map((c: Record<string, unknown>) => ({
          id: String(c.outlook_calendar_id),
          nome: (c.name as string) || "Calendario",
          colore: (c.color as string) ?? null,
          principale: !!c.is_default_calendar,
        }));
      }

      const { data: sess } = await supabase.auth.getSession();
      const headers = sess.session?.access_token ? { Authorization: `Bearer ${sess.session.access_token}` } : undefined;
      const fn = casella.provider === "google" ? "google-calendar-auth" : "apple-calendar-auth";
      const res = await supabase.functions.invoke(fn, {
        body: { action: "list-calendars", companyId, connectionId: casella.connectionId },
        headers,
      });
      if (res.error) throw new Error(res.error.message);
      const payload = res.data as { calendars?: Array<Record<string, unknown>>; error?: string };
      if (payload?.error) throw new Error(payload.error);
      return (payload?.calendars ?? []).map((c) => ({
        // Apple identifica i calendari con l'URL CalDAV, Google con l'id.
        id: String(c.id ?? c.url ?? ""),
        nome: String(c.summary ?? c.name ?? c.displayName ?? "Calendario"),
        colore: (c.backgroundColor as string) ?? (c.color as string) ?? null,
        principale: !!c.primary,
      })).filter((c) => !!c.id);
    },
  });
}
