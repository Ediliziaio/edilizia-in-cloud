/**
 * Dati delle campagne cold (sequenze outreach) per la Pipeline e le
 * Statistiche: tutto calcolato nel database dalle funzioni
 * outreach_campagna_* (migrazione 20280915220000), che condividono UNA
 * definizione di «fase» — il numero su una colonna e le righe che si aprono
 * cliccandola vengono dalla stessa query.
 */
import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { FaseRiga, PassoDef } from "./campagneFasi";

// Le funzioni sono nuove: i tipi generati non le conoscono ancora.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const TZ = "Europe/Rome";
const n = (v: unknown) => Number(v ?? 0) || 0;

export interface CampagnaRiepilogo {
  sequence_id: string;
  nome: string;
  stato: string;
  brand: string | null;
  creata_at: string;
  passi: number;
  ramificata: boolean;
  aperture_tracciate: boolean;
  iscritti: number;
  contattati: number;
  da_contattare: number;
  in_corso: number;
  completati: number;
  risposte: number;
  interessati: number;
  non_interessati: number;
  rimbalzati: number;
  disiscritti: number;
  fermati: number;
  in_pausa: number;
  messaggi_inviati: number;
  messaggi_programmati: number;
  prossimo_invio: string | null;
  ultimo_programmato: string | null;
}

const CAMPI_NUMERICI = [
  "passi", "iscritti", "contattati", "da_contattare", "in_corso", "completati", "risposte", "interessati",
  "non_interessati", "rimbalzati", "disiscritti", "fermati", "in_pausa", "messaggi_inviati", "messaggi_programmati",
] as const;

export function useCampagneRiepilogo(companyId: string) {
  return useQuery({
    queryKey: ["outreach-campagne", "riepilogo", companyId],
    staleTime: 60_000,
    refetchInterval: 120_000,
    queryFn: async () => {
      const { data, error } = await db.rpc("outreach_campagne_riepilogo", { p_company: companyId });
      if (error) throw error;
      return ((data ?? []) as Array<Record<string, unknown>>).map((r) => {
        const out = { ...r } as Record<string, unknown>;
        for (const k of CAMPI_NUMERICI) out[k] = n(r[k]);
        return out as unknown as CampagnaRiepilogo;
      });
    },
  });
}

export function useCampagnaFasi(companyId: string, sequenceId: string | null) {
  return useQuery({
    queryKey: ["outreach-campagne", "fasi", companyId, sequenceId],
    enabled: !!sequenceId,
    staleTime: 30_000,
    refetchInterval: 120_000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await db.rpc("outreach_campagna_fasi", { p_company: companyId, p_sequence: sequenceId });
      if (error) throw error;
      return ((data ?? []) as FaseRiga[]).map((r) => ({ ...r, contatti: n(r.contatti), in_pausa: n(r.in_pausa) }));
    },
  });
}

/** I passi della sequenza (canale, giorno, oggetto), per dare un nome alle colonne. */
export function useCampagnaPassi(sequenceId: string | null) {
  return useQuery({
    queryKey: ["outreach-campagne", "passi", sequenceId],
    enabled: !!sequenceId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await db
        .from("outreach_sequence_steps")
        .select("step_order, channel, delay_days, subject, node_type")
        .eq("sequence_id", sequenceId)
        .order("step_order", { ascending: true });
      if (error) throw error;
      const messaggi = ((data ?? []) as Array<{ step_order: number; channel: string | null; delay_days: number | null; subject: string | null; node_type: string | null }>)
        .filter((s) => ["email", "whatsapp", "sms", "call"].includes(s.node_type ?? s.channel ?? "email"));
      return messaggi.map((s, i): PassoDef => ({ passo: i + 1, canale: s.channel ?? "email", giorno: s.delay_days, oggetto: s.subject }));
    },
  });
}

export interface ContattoCampagna {
  enrollment_id: string;
  contact_id: string | null;
  nome: string | null;
  azienda: string | null;
  email: string | null;
  citta: string | null;
  provincia: string | null;
  stato: string;
  fase: string;
  inviati: number;
  ultimo_invio_at: string | null;
  prossimo_invio_at: string | null;
  casella: string | null;
  risposta_at: string | null;
  risposta_intent: string | null;
  risposta_testo: string | null;
  motivo_stop: string | null;
  iscritto_at: string | null;
  totale: number;
}

export const CONTATTI_PER_PAGINA = 50;

export function useCampagnaContatti(companyId: string, sequenceId: string | null, fase: string | null, cerca: string, pagina: number) {
  return useQuery({
    queryKey: ["outreach-campagne", "contatti", companyId, sequenceId, fase, cerca, pagina],
    enabled: !!sequenceId && !!fase,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await db.rpc("outreach_campagna_contatti", {
        p_company: companyId,
        p_sequence: sequenceId,
        p_fase: fase,
        p_cerca: cerca.trim() || null,
        p_limit: CONTATTI_PER_PAGINA,
        p_offset: pagina * CONTATTI_PER_PAGINA,
      });
      if (error) throw error;
      const righe = ((data ?? []) as ContattoCampagna[]).map((r) => ({ ...r, inviati: n(r.inviati), totale: n(r.totale) }));
      return { righe, totale: righe[0]?.totale ?? 0 };
    },
  });
}

export interface StatistichePasso {
  passo: number;
  canale: string;
  oggetto: string | null;
  giorno: number | null;
  inviati: number;
  aperti: number;
  risposte: number;
  interessati: number;
  rimbalzi: number;
  disiscritti: number;
  in_attesa: number;
}

export interface StatisticheGiorno {
  giorno: string;
  inviati: number;
  programmati: number;
  risposte: number;
}

export interface StatisticheCasella {
  id: string;
  email: string;
  stato: string;
  inviati: number;
  programmati: number;
  risposte: number;
  rimbalzi: number;
}

export interface StatisticheCampagna {
  aperture_tracciate: boolean;
  totali: {
    iscritti: number; contattati: number; da_contattare: number; in_corso: number; completati: number;
    risposte: number; interessati: number; non_interessati: number; rimbalzati: number; disiscritti: number;
    fermati: number; in_pausa: number;
  };
  messaggi: {
    inviati: number; aperti: number; programmati: number;
    primo_invio: string | null; ultimo_invio: string | null; prossimo_invio: string | null;
    ultimo_programmato: string | null; ore_mediane_risposta: number | null;
  };
  passi: StatistichePasso[];
  giorni: StatisticheGiorno[];
  caselle: StatisticheCasella[];
  esiti: Array<{ esito: string; contatti: number }>;
}

/** Statistiche di una campagna, o di tutte con sequenceId = null. */
export function useCampagnaStatistiche(companyId: string, sequenceId: string | null, giorni = 14) {
  return useQuery({
    queryKey: ["outreach-campagne", "statistiche", companyId, sequenceId, giorni],
    staleTime: 60_000,
    refetchInterval: 120_000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await db.rpc("outreach_campagna_statistiche", {
        p_company: companyId, p_sequence: sequenceId, p_tz: TZ, p_giorni: giorni,
      });
      if (error) throw error;
      return (data ?? null) as StatisticheCampagna | null;
    },
  });
}

const CHIAVE_MEMORIA = "outreach-campagna-scelta";

function leggiMemoria(): string | null {
  try { return localStorage.getItem(CHIAVE_MEMORIA); } catch { return null; }
}
function scriviMemoria(v: string) {
  try { localStorage.setItem(CHIAVE_MEMORIA, v); } catch { /* archiviazione non disponibile: si riparte dalla prima campagna */ }
}

/**
 * La campagna scelta, condivisa da Pipeline e Statistiche e ricordata alla
 * riapertura ("tutte" = panoramica). Se quella ricordata non c'è più si riparte
 * dalla prima: la lista arriva già ordinata con le attive in testa.
 */
export function useCampagnaScelta(companyId: string) {
  const riepilogo = useCampagneRiepilogo(companyId);
  const campagne = useMemo(
    () => (riepilogo.data ?? []).filter((c) => c.stato !== "archived" || c.iscritti > 0),
    [riepilogo.data],
  );
  const [scelta, setScelta] = useState<string | null>(() => leggiMemoria());
  // Derivata, non sincronizzata: una scelta che non esiste più ricade sulla
  // prima campagna senza riscrivere lo stato.
  const valida = scelta === "tutte" || campagne.some((c) => c.sequence_id === scelta);
  const idEffettivo = valida ? scelta : campagne[0]?.sequence_id ?? null;

  const cambia = (id: string | null) => {
    const v = id ?? "tutte";
    setScelta(v);
    scriviMemoria(v);
  };

  return {
    riepilogo,
    campagne,
    /** "tutte" oppure l'id della sequenza */
    scelta: idEffettivo,
    campagna: campagne.find((c) => c.sequence_id === idEffettivo) ?? null,
    cambia,
  };
}

/** yyyy-mm-dd di oggi a Roma: stesso calendario delle statistiche. */
export function oggiRoma(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}
