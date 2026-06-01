/**
 * #54-58 — Ponte dati tra il LISTINO PREZZI di manutenzione (Impostazioni →
 * "Tariffe & Manutenzione", tab Manutenzione) e il FLUSSO OPERATIVO
 * (/azienda/manutenzione: ticket/interventi e contratti).
 *
 * Wrappa la RPC `get_prezzo_intervento` (SECURITY DEFINER, definita nella
 * migration 20260814000001_listino_prezzi.sql), che calcola il prezzo di un
 * intervento da `listino_prezzi` per la combinazione (tipo_impianto,
 * tipo_intervento), applicando l'eventuale override per cliente da
 * `listino_override_cliente`.
 *
 * Contesto: prima di questo modulo la RPC esisteva ma NON era invocata da
 * nessuno (0 riferimenti nel frontend / edge function), quindi le tariffe di
 * manutenzione configurate non avevano alcun effetto sul flusso operativo.
 *
 * Null-safe: se non esiste una tariffa a listino per la combinazione scelta la
 * RPC restituisce NULL → qui `null` (nessun prezzo suggerito, nessun errore).
 * Modulo "puro" lato dati (più un hook React Query opzionale): riutilizzabile
 * sia nella creazione intervento sia nel wizard contratto.
 */
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

export interface PrezzoIntervento {
  /** Prezzo finale applicato (base oppure override cliente). */
  prezzo: number;
  /** Prezzo base da listino (prima dell'eventuale override). */
  prezzo_base: number;
  /** IVA % (può mancare a listino). */
  iva: number | null;
  /** Unità di misura/quantificazione (può mancare a listino). */
  unita: string | null;
  /** Note del listino (può mancare). */
  note: string | null;
  /** true se il prezzo deriva da un override specifico per il cliente. */
  da_override: boolean;
}

export interface PrezzoInterventoParams {
  companyId?: string | null;
  tipoImpiantoId?: string | null;
  tipoInterventoId?: string | null;
  /** Opzionale: se presente, applica l'override per quel cliente. */
  clienteId?: string | null;
}

/**
 * Lookup puro (no React) del prezzo a listino per una combinazione
 * tipo_impianto × tipo_intervento (+ eventuale override cliente).
 * Ritorna `null` se non esiste una tariffa attiva e valida per la combinazione.
 */
export async function fetchPrezzoIntervento(p: {
  companyId: string;
  tipoImpiantoId: string;
  tipoInterventoId: string;
  clienteId?: string | null;
}): Promise<PrezzoIntervento | null> {
  const { data, error } = await supabase.rpc("get_prezzo_intervento", {
    p_company_id: p.companyId,
    p_tipo_impianto_id: p.tipoImpiantoId,
    p_tipo_intervento_id: p.tipoInterventoId,
    p_cliente_id: p.clienteId ?? undefined,
  });
  if (error) throw error;
  if (data == null) return null; // nessuna tariffa a listino per la combinazione
  return data as unknown as PrezzoIntervento;
}

/**
 * Hook React Query: si attiva SOLO quando company + entrambi i tipi sono
 * presenti, così l'integrazione è completamente opzionale (le aziende che non
 * usano il listino di manutenzione non vedono alcuna differenza).
 */
export function usePrezzoIntervento({
  companyId,
  tipoImpiantoId,
  tipoInterventoId,
  clienteId,
}: PrezzoInterventoParams) {
  return useQuery({
    queryKey: ["prezzo-intervento", companyId, tipoImpiantoId, tipoInterventoId, clienteId ?? null],
    enabled: !!companyId && !!tipoImpiantoId && !!tipoInterventoId,
    staleTime: 60_000,
    queryFn: () =>
      fetchPrezzoIntervento({
        companyId: companyId as string,
        tipoImpiantoId: tipoImpiantoId as string,
        tipoInterventoId: tipoInterventoId as string,
        clienteId,
      }),
  });
}
