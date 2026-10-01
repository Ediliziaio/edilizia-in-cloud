import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useAuth } from "@/contexts/AuthContext";
import type { HrTimbratura, TimbraturaTipo } from "@/types/hr";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import type { GPSResult } from "@/hooks/useGPS";
import { toast } from "sonner";

type HrTimbraturaInsert = TablesInsert<"hr_timbrature">;
type HrTimbraturaJoined = Tables<"hr_timbrature"> & {
  hr_profili?: {
    nome: string | null;
    cognome: string | null;
    colore_avatar: string | null;
    mansione: string | null;
    reparto?: string | null;
  } | null;
  orders?: { order_code: string | null; description: string | null } | null;
};

export type TimbraturaAdminRow = HrTimbratura & {
  profilo_nome: string | null;
  profilo_cognome: string | null;
  profilo_colore: string | null;
  profilo_reparto?: string | null;
  profilo_mansione?: string | null;
  cantiere_codice: string | null;
  cantiere_descrizione: string | null;
};

export type LiveStatusProfilo = Pick<Tables<"hr_profili">, "id" | "nome" | "cognome" | "colore_avatar" | "mansione"> & {
  reparto?: string | null;
  last_tipo: string | null;
  last_ora: string | null;
  is_present: boolean;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Errore sconosciuto";
}

/** Get the current user's hr_profilo */
export function useMyHrProfilo() {
  const { user } = useAuth();
  const companyId = useEffectiveCompanyId();

  return useQuery({
    queryKey: ["hr-my-profilo", user?.id, companyId],
    queryFn: async () => {
      if (!user?.id || !companyId) return null;
      const { data, error } = await supabase
        .from("hr_profili")
        .select("*")
        .eq("company_id", companyId)
        .eq("user_id", user.id)
        .eq("attivo", true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id && !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
}

/** Get today's timbrature for current user */
export function useMyTodayTimbrature(profiloId: string | undefined) {
  const companyId = useEffectiveCompanyId();
  // data_evento è calcolata in Europe/Rome: confrontarla con la data UTC
  // sbagliava giorno tra la mezzanotte e le 2 di notte italiane.
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });

  return useQuery({
    queryKey: ["hr-my-timbrature-today", companyId, profiloId, today],
    queryFn: async () => {
      if (!companyId || !profiloId) return [];
      const { data, error } = await supabase
        .from("hr_timbrature")
        .select("*")
        .eq("company_id", companyId)
        .eq("profilo_id", profiloId)
        .eq("data_evento", today)
        .order("timestamp", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as HrTimbratura[];
    },
    enabled: !!companyId && !!profiloId,
    staleTime: 30 * 1000,
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
  });
}

/** Clock in/out mutation */
export function useTimbra() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      companyId,
      profiloId,
      tipo,
      gps,
    }: {
      companyId: string;
      profiloId: string;
      tipo: TimbraturaTipo;
      gps: GPSResult | null;
    }) => {
      const now = new Date().toISOString();
      // data_evento e ora_evento sono colonne GENERATED ALWAYS nel DB
      // (calcolate da timestamp AT TIME ZONE 'Europe/Rome'): NON vanno mai
      // passate nell'insert, altrimenti Postgres rifiuta con
      // "cannot insert a non-DEFAULT value into column data_evento".
      const payload: HrTimbraturaInsert = {
        company_id: companyId,
        profilo_id: profiloId,
        tipo,
        timestamp: now,
        lat: gps?.lat || null,
        lng: gps?.lng || null,
        sede_id: gps?.sede_id || null,
        fonte: "web",
        ip_address: null,
        note: gps?.status === "denied" ? "GPS non disponibile" : null,
      };

      const { data, error } = await supabase
        .from("hr_timbrature")
        .insert(payload)
        .select()
        .maybeSingle();

      // maybeSingle: se una RLS/race non restituisce la riga appena inserita,
      // .single() lancerebbe (PGRST116) facendo apparire fallita una timbratura
      // in realtà avvenuta. Con maybeSingle l'insert resta valido; le query
      // vengono comunque invalidate in onSuccess.
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr-my-timbrature-today"] });
      queryClient.invalidateQueries({ queryKey: ["hr-timbrature"] });
      queryClient.invalidateQueries({ queryKey: ["hr-giornate"] });
    },
    onError: (error: unknown) => {
      toast.error("Errore timbratura: " + getErrorMessage(error));
    },
  });
}

/** Quante timbrature mostra l'elenco a schermo: oltre, si avvisa e si scarica il resto. */
export const LIMITE_ELENCO_TIMBRATURE = 500;

/**
 * Tutte le timbrature di un periodo, per l'esportazione: a pagine da 1000, senza il
 * tetto dell'elenco (prima un mese intero si sarebbe tagliato a 200 righe senza dirlo).
 */
export async function scaricaTimbratureAdmin(companyId: string, dateFrom: string, dateTo: string): Promise<TimbraturaAdminRow[]> {
  const PAGINA = 1000;
  const tutte: HrTimbraturaJoined[] = [];
  for (let da = 0; da < 200_000; da += PAGINA) {
    const { data, error } = await supabase
      .from("hr_timbrature")
      .select("*, hr_profili!hr_timbrature_profilo_id_fkey(nome, cognome, colore_avatar, mansione, reparto), orders(order_code, description)")
      .eq("company_id", companyId)
      .gte("data_evento", dateFrom)
      .lte("data_evento", dateTo)
      .order("timestamp", { ascending: true })
      .order("id", { ascending: true })
      .range(da, da + PAGINA - 1);
    if (error) throw error;
    const pagina = (data || []) as HrTimbraturaJoined[];
    tutte.push(...pagina);
    if (pagina.length < PAGINA) break;
  }
  return tutte.map((t) => ({
    ...t,
    profilo_nome: t.hr_profili?.nome ?? null,
    profilo_cognome: t.hr_profili?.cognome ?? null,
    profilo_colore: t.hr_profili?.colore_avatar ?? null,
    profilo_reparto: t.hr_profili?.reparto ?? null,
    profilo_mansione: t.hr_profili?.mansione ?? null,
    cantiere_codice: t.orders?.order_code ?? null,
    cantiere_descrizione: t.orders?.description ?? null,
  })) as TimbraturaAdminRow[];
}

/** Admin: fetch all timbrature for a date range */
export function useTimbratureAdmin(dateFrom: string, dateTo: string) {
  const companyId = useEffectiveCompanyId();

  return useQuery({
    queryKey: ["hr-timbrature", companyId, dateFrom, dateTo],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("hr_timbrature")
        .select("*, hr_profili!hr_timbrature_profilo_id_fkey(nome, cognome, colore_avatar, mansione, reparto), orders(order_code, description)")
        .eq("company_id", companyId)
        .gte("data_evento", dateFrom)
        .lte("data_evento", dateTo)
        .order("timestamp", { ascending: false })
        .limit(LIMITE_ELENCO_TIMBRATURE);

      if (error) throw error;
      return ((data || []) as HrTimbraturaJoined[]).map((t) => ({
        ...t,
        profilo_nome: t.hr_profili?.nome ?? null,
        profilo_cognome: t.hr_profili?.cognome ?? null,
        profilo_colore: t.hr_profili?.colore_avatar ?? null,
        profilo_reparto: t.hr_profili?.reparto ?? null,
        profilo_mansione: t.hr_profili?.mansione ?? null,
        cantiere_codice: t.orders?.order_code ?? null,
        cantiere_descrizione: t.orders?.description ?? null,
      })) as TimbraturaAdminRow[];
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
}

/** Admin: fetch today's last timbratura per profilo for live status */
export function useLiveStatus() {
  const companyId = useEffectiveCompanyId();
  // data_evento è calcolata in Europe/Rome: confrontarla con la data UTC
  // sbagliava giorno tra la mezzanotte e le 2 di notte italiane.
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });

  return useQuery({
    queryKey: ["hr-live-status", companyId, today],
    queryFn: async () => {
      if (!companyId) return [];

      // Get all active profili
      const { data: profili, error: profiliError } = await supabase
        .from("hr_profili")
        .select("id, nome, cognome, colore_avatar, mansione, reparto")
        .eq("company_id", companyId)
        .eq("attivo", true)
        .order("cognome");

      if (profiliError) throw profiliError;
      if (!profili) return [];

      // Get today's timbrature
      const { data: timbrature, error: timbratureError } = await supabase
        .from("hr_timbrature")
        .select("profilo_id, tipo, timestamp, ora_evento")
        .eq("company_id", companyId)
        .eq("data_evento", today)
        .order("timestamp", { ascending: false });

      if (timbratureError) throw timbratureError;

      // Map: for each profilo, find last timbratura
      return (profili as (Pick<Tables<"hr_profili">, "id" | "nome" | "cognome" | "colore_avatar" | "mansione"> & { reparto?: string | null })[]).map((p) => {
        const myTimbrature = (timbrature || []).filter((t) => t.profilo_id === p.id);
        const last = myTimbrature[0];
        return {
          ...p,
          last_tipo: last?.tipo || null,
          last_ora: last?.ora_evento?.slice(0, 5) || null,
          // In pausa = ancora in azienda: contarlo assente falsava "Presenti ora".
          is_present: last?.tipo === "entrata" || last?.tipo === "pausa_fine" || last?.tipo === "fine_pausa" || last?.tipo === "pausa_inizio" || last?.tipo === "inizio_pausa",
        };
      }) as LiveStatusProfilo[];
    },
    enabled: !!companyId,
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
  });
}
