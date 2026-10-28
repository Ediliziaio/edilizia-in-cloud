import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { readAllPages } from "@/lib/personale/readAllPages";
import { differenceInMinutes, endOfMonth, format, parseISO } from "date-fns";
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

/**
 * Ore lavorate in una giornata: dall'entrata all'uscita (o ad adesso, se non
 * è ancora uscito), meno le pause. Condiviso da «Ore» e da «Il mio stato».
 */
export function calcolaOreLavorate(timbrs: HrTimbratura[]): number {
  let minutiPausa = 0;
  const entrata = timbrs.find(t => t.tipo === "entrata");
  const uscita = timbrs.find(t => t.tipo === "uscita");
  if (!entrata) return 0;
  const fine = uscita ? parseISO(uscita.timestamp) : new Date();
  const minuti = differenceInMinutes(fine, parseISO(entrata.timestamp));
  for (let i = 0; i < timbrs.length - 1; i++) {
    const cur = timbrs[i];
    const nxt = timbrs[i + 1];
    const isPausaStart = cur.tipo === "pausa_inizio" || cur.tipo === "inizio_pausa";
    const isPausaEnd = nxt.tipo === "pausa_fine" || nxt.tipo === "fine_pausa";
    if (isPausaStart && isPausaEnd) {
      minutiPausa += differenceInMinutes(parseISO(nxt.timestamp), parseISO(cur.timestamp));
    }
  }
  return Math.max(0, (minuti - minutiPausa) / 60);
}

/** Le timbrature di un mese («yyyy-MM») del proprio profilo. Una sola chiave per «Ore» e «Il mio stato». */
export function useMyTimbratureMese(profiloId: string | undefined, mese: string) {
  return useQuery({
    queryKey: ["my-timbrature-mese", profiloId, mese],
    queryFn: async () => {
      const [y, m] = mese.split("-");
      const start = `${y}-${m}-01`;
      const end = format(endOfMonth(new Date(Number(y), Number(m) - 1)), "yyyy-MM-dd");
      const { data, error } = await supabase
        .from("hr_timbrature")
        .select("*")
        .eq("profilo_id", profiloId!)
        .gte("data_evento", start)
        .lte("data_evento", end)
        .order("timestamp", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as HrTimbratura[];
    },
    enabled: !!profiloId,
    staleTime: 2 * 60 * 1000,
  });
}

/** Riepilogo di un mese: ore lavorate, giorni presenti, ore attese da contratto e ore in più. */
export function riepilogoMese(timbrature: HrTimbratura[], oreGiornaliere: number | null | undefined) {
  const perGiorno: Record<string, HrTimbratura[]> = {};
  for (const t of timbrature) (perGiorno[t.data_evento] ??= []).push(t);
  const ore = Object.values(perGiorno).reduce((acc, ts) => acc + calcolaOreLavorate(ts), 0);
  const giorniPresenti = Object.values(perGiorno).filter(ts => ts.some(t => t.tipo === "entrata")).length;
  const oreAttese = (oreGiornaliere ?? 0) * giorniPresenti;
  return { perGiorno, ore, giorniPresenti, oreAttese, oreInPiu: Math.max(0, ore - oreAttese) };
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
      // Tutto ciò che mostra le timbrature, ovunque si sia timbrato (barra in
      // alto, scheda Ore, chiosco): oggi, il mese di «Il mio stato», il pannello
      // ufficio «chi è presente» e la Manodopera del giorno.
      queryClient.invalidateQueries({ queryKey: ["hr-my-timbrature-today"] });
      queryClient.invalidateQueries({ queryKey: ["my-timbrature-mese"] });
      queryClient.invalidateQueries({ queryKey: ["hr-timbrature"] });
      queryClient.invalidateQueries({ queryKey: ["hr-giornate"] });
      queryClient.invalidateQueries({ queryKey: ["hr-live-status"] });
      queryClient.invalidateQueries({ queryKey: ["manodopera"] });
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
      const profili = await readAllPages((from, to) => supabase
        .from("hr_profili")
        .select("id, nome, cognome, colore_avatar, mansione, reparto")
        .eq("company_id", companyId)
        .eq("attivo", true)
        .order("cognome").order("id").range(from, to));

      // Get today's timbrature
      const timbrature = await readAllPages((from, to) => supabase
        .from("hr_timbrature")
        .select("profilo_id, tipo, timestamp, ora_evento")
        .eq("company_id", companyId)
        .eq("data_evento", today)
        .order("timestamp", { ascending: false }).order("id", { ascending: false }).range(from, to));
      const latest = new Map<string, typeof timbrature[number]>();
      for (const row of timbrature) if (!latest.has(row.profilo_id)) latest.set(row.profilo_id, row);

      // Map: for each profilo, find last timbratura
      return (profili as (Pick<Tables<"hr_profili">, "id" | "nome" | "cognome" | "colore_avatar" | "mansione"> & { reparto?: string | null })[]).map((p) => {
        const last = latest.get(p.id);
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
