/**
 * Il motore della console (manuale operativo): metriche del giorno con
 * semaforo e Indice di Esecuzione, allarmi aperti dalle regole, soglie per
 * cliente e benchmark di settore. Tutto arriva da tabelle già calcolate dal
 * database (mkt_*): la console non ricalcola mai a runtime, salvo il pulsante
 * «Ricalcola adesso».
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// Tabelle e funzioni nuove: i tipi generati non le conoscono ancora.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const num = (v: unknown) => (v == null ? null : Number(v));

export type Semaforo = "V" | "G" | "R" | "N";

export interface Metriche {
  service_client_id: string;
  giorno: string;
  stato_cliente: string | null;
  giorni_dall_inizio: number | null;
  spesa_giorno: number | null;
  spesa_7g: number | null;
  spesa_mese: number | null;
  budget_giornaliero: number | null;
  lead_grezzi_giorno: number | null;
  lead_grezzi_7g: number | null;
  lead_validi_7g: number | null;
  cpl_valido_7g: number | null;
  cpl_target: number | null;
  cpl_giallo: number | null;
  cpl_rosso: number | null;
  fattore_stagionale: number | null;
  appuntamenti_14g: number | null;
  costo_appuntamento_14g: number | null;
  tasso_appuntamento_14g: number | null;
  mediana_primo_contatto_min_7g: number | null;
  lead_fermi: number | null;
  lead_fermo_piu_vecchio_ore: number | null;
  spesa_senza_lead: number | null;
  rapporto_zero: number | null;
  copertura_budget: number | null;
  indice_esecuzione: number | null;
  indice_componenti: Record<string, number> | null;
  semaforo: Semaforo | null;
  semaforo_componenti: Record<string, Semaforo> | null;
  dati_freschi: boolean;
  spesa_disponibile: boolean;
  ultimo_sync: string | null;
  calcolato_il: string;
}

export interface Allarme {
  id: string;
  service_client_id: string;
  regola: string;
  gravita: "nota" | "giallo" | "rosso" | "grave";
  titolo: string;
  dettaglio: Record<string, unknown>;
  azione: string;
  proprietario: string;
  scadenza: string | null;
  aperto_il: string;
  mostrato: boolean;
  motivo_non_mostrato: string | null;
  rimandato_a: string | null;
}

export interface Soglia {
  id: string;
  service_client_id: string;
  valida_dal: string;
  origine: "settore" | "storico" | "manuale";
  cpl_target: number;
  cpl_giallo: number;
  cpl_rosso: number;
  moltiplicatore_zero_giallo: number;
  moltiplicatore_zero_rosso: number;
  lead_attesi_giorno: number | null;
  costo_appuntamento_target: number | null;
  cac_target: number | null;
  roas_minimo: number;
  stagionalita_applicata: boolean;
  blocca_ritaratura: boolean;
  cpl_suggerito: number | null;
  suggerito_il: string | null;
  note: string | null;
}

export interface Benchmark {
  settore: string;
  etichetta: string;
  cpl_min: number;
  cpl_max: number;
  appuntamento_min: number;
  appuntamento_max: number;
  costo_appuntamento_min: number;
  costo_appuntamento_max: number;
  ticket_min: number;
  ticket_max: number;
  stagionalita: number[];
}

export interface ProfiloCliente {
  id: string;
  mkt_settore: string | null;
  mkt_classe: string | null;
  mkt_budget_mensile: number | null;
  mkt_ticket_medio: number | null;
  mkt_chi_richiama: string | null;
  mkt_orario_servizio: Record<string, unknown> | null;
  mkt_pausa_fino_a: string | null;
}

const CHIAVE = ["clienti-marketing", "motore"] as const;

function coerciMetriche(r: Record<string, unknown>): Metriche {
  const out: Record<string, unknown> = { ...r };
  for (const k of ["spesa_giorno", "spesa_7g", "spesa_mese", "budget_giornaliero", "lead_grezzi_giorno", "lead_grezzi_7g", "lead_validi_7g", "cpl_valido_7g", "cpl_target", "cpl_giallo", "cpl_rosso", "fattore_stagionale", "appuntamenti_14g", "costo_appuntamento_14g", "tasso_appuntamento_14g", "mediana_primo_contatto_min_7g", "lead_fermi", "lead_fermo_piu_vecchio_ore", "spesa_senza_lead", "rapporto_zero", "copertura_budget", "indice_esecuzione", "giorni_dall_inizio"]) {
    out[k] = num(r[k]);
  }
  return out as unknown as Metriche;
}

function coerciSoglia(r: Record<string, unknown>): Soglia {
  const out: Record<string, unknown> = { ...r };
  for (const k of ["cpl_target", "cpl_giallo", "cpl_rosso", "moltiplicatore_zero_giallo", "moltiplicatore_zero_rosso", "lead_attesi_giorno", "costo_appuntamento_target", "cac_target", "roas_minimo", "cpl_suggerito"]) {
    out[k] = num(r[k]);
  }
  return out as unknown as Soglia;
}

/** Metriche di oggi (o le ultime calcolate), allarmi aperti, soglie in vigore, benchmark. */
export function useMktConsole(enabled = true) {
  return useQuery({
    queryKey: [...CHIAVE, "stato"],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const [met, all, sog, ben] = await Promise.all([
        db.from("mkt_metriche_giorno").select("*").order("giorno", { ascending: false }).limit(200),
        db.from("mkt_allarmi").select("*").is("chiuso_il", null).order("aperto_il", { ascending: false }),
        db.from("mkt_soglie").select("*").order("valida_dal", { ascending: false }),
        db.from("mkt_settori_benchmark").select("*"),
      ]);
      for (const r of [met, all, sog, ben]) if (r.error) throw r.error;
      // Una riga per cliente: la più recente.
      const metriche = new Map<string, Metriche>();
      for (const r of (met.data ?? []) as Record<string, unknown>[]) {
        const m = coerciMetriche(r);
        if (!metriche.has(m.service_client_id)) metriche.set(m.service_client_id, m);
      }
      const soglie = new Map<string, Soglia>();
      for (const r of (sog.data ?? []) as Record<string, unknown>[]) {
        const s = coerciSoglia(r);
        if (!soglie.has(s.service_client_id)) soglie.set(s.service_client_id, s);
      }
      const benchmark = ((ben.data ?? []) as Record<string, unknown>[]).map((b) => ({
        ...b,
        cpl_min: Number(b.cpl_min), cpl_max: Number(b.cpl_max), appuntamento_min: Number(b.appuntamento_min), appuntamento_max: Number(b.appuntamento_max),
        costo_appuntamento_min: Number(b.costo_appuntamento_min), costo_appuntamento_max: Number(b.costo_appuntamento_max), ticket_min: Number(b.ticket_min), ticket_max: Number(b.ticket_max),
        stagionalita: Array.isArray(b.stagionalita) ? (b.stagionalita as unknown[]).map(Number) : [],
      })) as Benchmark[];
      return { metriche, allarmi: (all.data ?? []) as Allarme[], soglie, benchmark };
    },
  });
}

/** Il profilo marketing di un cliente-servizio (settore, budget, orari…). */
export function useProfiloCliente(serviceClientId: string | null) {
  return useQuery({
    queryKey: [...CHIAVE, "profilo", serviceClientId],
    enabled: !!serviceClientId,
    queryFn: async (): Promise<ProfiloCliente> => {
      const { data, error } = await db.from("aedix_service_clients")
        .select("id, mkt_settore, mkt_classe, mkt_budget_mensile, mkt_ticket_medio, mkt_chi_richiama, mkt_orario_servizio, mkt_pausa_fino_a")
        .eq("id", serviceClientId).single();
      if (error) throw error;
      const p = data as ProfiloCliente;
      return { ...p, mkt_budget_mensile: num(p.mkt_budget_mensile), mkt_ticket_medio: num(p.mkt_ticket_medio) };
    },
  });
}

function invalidaTutto(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: CHIAVE });
  qc.invalidateQueries({ queryKey: ["clienti-marketing", "riepilogo"] });
}

/** Fatto, non era un problema, rimandato a domani. */
export function useChiudiAllarme() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { id: string; esito: "risolto" | "falso_positivo" | "ignorato" | "rimandato"; nota?: string | null }) => {
      const { error } = await db.rpc("mkt_chiudi_allarme", { p_id: p.id, p_esito: p.esito, p_nota: p.nota ?? null, p_rimanda_a: null });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CHIAVE }),
  });
}

/** Ricalcola metriche e regole adesso (quello che fa il cron alle 05:30). */
export function useRicalcola() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<{ clienti: number; allarmi_nuovi: number }> => {
      const { data, error } = await db.rpc("mkt_aggiorna");
      if (error) throw error;
      return data as { clienti: number; allarmi_nuovi: number };
    },
    onSuccess: () => invalidaTutto(qc),
  });
}

export interface SoglieInput {
  service_client_id: string;
  profilo: Omit<ProfiloCliente, "id" | "mkt_orario_servizio" | "mkt_pausa_fino_a">;
  soglia: {
    cpl_target: number;
    cpl_giallo: number;
    cpl_rosso: number;
    moltiplicatore_zero_giallo: number;
    moltiplicatore_zero_rosso: number;
    lead_attesi_giorno: number | null;
    costo_appuntamento_target: number | null;
    cac_target: number | null;
    roas_minimo: number;
    stagionalita_applicata: boolean;
    blocca_ritaratura: boolean;
    note: string | null;
  };
}

/** Salva profilo e soglie: la soglia nuova vale da oggi (storico intatto). */
export function useSalvaSoglie() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: SoglieInput) => {
      const oggi = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      const { error: e1 } = await db.from("aedix_service_clients").update({ ...input.profilo, updated_at: new Date().toISOString() }).eq("id", input.service_client_id);
      if (e1) throw e1;
      const { error: e2 } = await db.from("mkt_soglie").upsert({
        service_client_id: input.service_client_id,
        valida_dal: oggi,
        origine: "manuale",
        ...input.soglia,
        created_by: user?.id ?? null,
      }, { onConflict: "service_client_id,valida_dal" });
      if (e2) throw e2;
    },
    onSuccess: () => invalidaTutto(qc),
  });
}
