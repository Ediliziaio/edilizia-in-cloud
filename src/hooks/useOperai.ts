/**
 * Operai di cantiere per l'ufficio (Manodopera e Mezzi, 26/09/2026).
 *
 * Si leggono con le funzioni manodopera_* del database, che controllano il
 * permesso «Operai» e restituiscono solo i campi che servono ai cantieri: le
 * tabelle del Personale (IBAN, PIN, contatti privati) restano chiuse.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import type { Database } from "@/integrations/supabase/types";

type Funzioni = Database["public"]["Functions"];
export type OperaioElenco = Funzioni["manodopera_operai"]["Returns"][number];
export type OperaioOggi = Funzioni["manodopera_oggi"]["Returns"][number];

export type StatoGiornata = "al_lavoro" | "in_pausa" | "uscito" | "uscita_mancante" | "assente" | "non_timbrato";

export interface SchedaOperaio {
  scheda: {
    id: string;
    company_id: string;
    employee_id: string | null;
    nome: string;
    cognome: string;
    mansione: string | null;
    telefono: string | null;
    email: string | null;
    colore_avatar: string | null;
    foto_url: string | null;
    attivo: boolean;
    lavora_in_cantiere: boolean;
    data_assunzione: string | null;
    data_cessazione: string | null;
    tipo_contratto: string | null;
    matricola: string | null;
    ha_accesso_app: boolean;
  };
  puo_modificare: boolean;
  costo: {
    costo_orario: number | null;
    costo_orario_scritto: number | null;
    /** Solo per chi può modificare gli operai. */
    stipendio_lordo: number | null;
    ore_mese: number | null;
    contributi_percento: number | null;
  };
  documenti: {
    id: string;
    categoria: string;
    titolo: string;
    ente: string | null;
    data_rilascio: string | null;
    data_scadenza: string | null;
    stato: "scaduto" | "in_scadenza" | "valido" | "senza_scadenza";
  }[];
  giornate: {
    data: string;
    stato: string;
    ore_lavorate: number | null;
    ore_straordinario: number | null;
    prima_entrata: string | null;
    ultima_uscita: string | null;
    anomalia: boolean;
    anomalia_motivo: string | null;
  }[];
  cantieri: {
    order_id: string;
    codice: string | null;
    cliente: string | null;
    indirizzo: string | null;
    dal: string | null;
    al: string | null;
    capocantiere: boolean;
    in_corso: boolean;
  }[];
  mezzi: { id: string; nome: string; tipo: string | null; targa: string | null }[];
}

export interface DatiOperaio {
  nome?: string;
  cognome?: string;
  telefono?: string;
  email?: string;
  mansione?: string;
  data_assunzione?: string;
  tipo_contratto?: string;
  attivo?: boolean;
  lavora_in_cantiere?: boolean;
  costo_orario?: string;
  stipendio_lordo?: string;
  ore_mese?: string;
}

/** Oggi in Italia, come AAAA-MM-GG (le timbrature si contano sul giorno italiano). */
export function oggiRoma(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
}

/**
 * I messaggi scritti dalle funzioni (permesso, nome mancante…) sono già frasi
 * per chi usa l'app; tutto il resto diventa una frase generica.
 */
export function messaggioErroreOperai(err: unknown, ripiego: string): string {
  const e = err as { code?: string; message?: string } | null;
  if (e?.code === "42501" || e?.code === "22023") return e.message ?? ripiego;
  return ripiego;
}

export const chiaviOperai = {
  tutti: ["manodopera"] as const,
  elenco: (companyId: string | null) => ["manodopera", "operai", companyId] as const,
  giornata: (companyId: string | null, giorno: string) => ["manodopera", "oggi", companyId, giorno] as const,
  scheda: (id: string | undefined) => ["manodopera", "operaio", id] as const,
};

export function useOperai() {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: chiaviOperai.elenco(companyId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("manodopera_operai", { p_company_id: companyId! });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!companyId,
    staleTime: 60_000,
  });
}

export function useGiornataOperai(giorno: string) {
  const companyId = useEffectiveCompanyId();
  const eOggi = giorno === oggiRoma();
  return useQuery({
    queryKey: chiaviOperai.giornata(companyId, giorno),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("manodopera_oggi", { p_company_id: companyId!, p_giorno: giorno });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!companyId,
    staleTime: eOggi ? 30_000 : 5 * 60_000,
    // Oggi si aggiorna da solo ogni minuto, come la Regia del Personale.
    refetchInterval: eOggi ? 60_000 : false,
    refetchIntervalInBackground: false,
  });
}

export function useSchedaOperaio(id: string | undefined) {
  return useQuery({
    queryKey: chiaviOperai.scheda(id),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("manodopera_operaio", { p_profilo_id: id! });
      if (error) throw error;
      return data as unknown as SchedaOperaio;
    },
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useSalvaOperaio() {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, dati }: { id: string | null; dati: DatiOperaio }) => {
      if (!companyId) throw new Error("Azienda non trovata");
      const { data, error } = await supabase.rpc("manodopera_salva_operaio", {
        p_company_id: companyId,
        p_profilo_id: id,
        p_dati: dati as unknown as Database["public"]["Functions"]["manodopera_salva_operaio"]["Args"]["p_dati"],
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chiaviOperai.tutti });
      // Personale e Gestione staff leggono le stesse persone.
      qc.invalidateQueries({ queryKey: ["hr-profili-all"] });
      qc.invalidateQueries({ queryKey: ["hr-profili"] });
      qc.invalidateQueries({ queryKey: ["hr-live-status"] });
    },
  });
}

/**
 * Accesso all'app di cantiere per un operaio: crea l'account e manda le
 * credenziali per email (funzione create-employee-user, solo amministratori).
 */
export function useDaiAccessoApp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ employeeId, email }: { employeeId: string; email: string }) => {
      const { data, error } = await supabase.functions.invoke("create-employee-user", {
        body: { employee_id: employeeId, email },
      });
      if (error) {
        let corpo: { error?: string } | null = null;
        try {
          const ctx = (error as { context?: unknown }).context;
          if (ctx instanceof Response) corpo = await ctx.json();
        } catch { /* risposta senza corpo leggibile */ }
        throw new Error(corpo?.error ?? "Non sono riuscito a creare l'accesso. Riprova tra qualche secondo.");
      }
      if (!data?.success) throw new Error(data?.error ?? "Non sono riuscito a creare l'accesso.");
      return data as { success: true; temp_password?: string; message?: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chiaviOperai.tutti });
    },
  });
}
