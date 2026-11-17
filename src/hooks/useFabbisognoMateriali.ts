import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { RigaFabbisogno } from "@/lib/acquisti/fabbisogno";
import { ordinaDalFabbisogno } from "@/lib/acquisti/ordinaDalFabbisogno";

// La funzione è nuova e non è ancora nei tipi generati.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/**
 * I materiali ancora da ordinare (o da verificare) di tutte le commesse, solo
 * delle fasi validate dal tecnico, già ordinati per «entro quando». Una pagina
 * da 500 righe: oltre, il cruscotto lo dice.
 */
export function useFabbisognoMateriali(orderId?: string | null) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  return useQuery({
    queryKey: ["fabbisogno-materiali", companyId, orderId ?? "tutte"],
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async (): Promise<RigaFabbisogno[]> => {
      // Una commessa sola (la finestra «Fabbisogno» dentro la commessa, 17/11/2026): tutte le sue
      // righe, senza il tetto di 500 dell'azienda, con le stesse regole della pagina.
      if (orderId) return fabbisognoDellaCommessa(orderId);
      const { data, error } = await db.rpc("materiali_riconciliazione_azienda", {
        p_company: companyId, p_solo_aperti: true, p_limite: 500, p_da: 0,
      });
      if (error) throw error;
      return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
        ...(r as unknown as RigaFabbisogno),
        previsto: Number(r.previsto ?? 0),
        ordinato: Number(r.ordinato ?? 0),
        in_bozza: Number(r.in_bozza ?? 0),
        ricevuto: Number(r.ricevuto ?? 0),
        residuo: Number(r.residuo ?? 0),
        eccedenza: Number(r.eccedenza ?? 0),
      }));
    },
  });
}

const daRiga = (r: Record<string, unknown>): RigaFabbisogno => ({
  ...(r as unknown as RigaFabbisogno),
  previsto: Number(r.previsto ?? 0),
  ordinato: Number(r.ordinato ?? 0),
  in_bozza: Number(r.in_bozza ?? 0),
  ricevuto: Number(r.ricevuto ?? 0),
  residuo: Number(r.residuo ?? 0),
  eccedenza: Number(r.eccedenza ?? 0),
});

/**
 * Il fabbisogno di una commessa: le righe aperte (come materiali_riconciliazione_azienda) delle fasi
 * validate o che la validazione non la usano. Una fase in preparazione o dal tecnico resta fuori.
 */
async function fabbisognoDellaCommessa(orderId: string): Promise<RigaFabbisogno[]> {
  const [{ data, error }, { data: val, error: e2 }] = await Promise.all([
    db.rpc("materiali_riconciliazione", { p_order: orderId }),
    db.from("materiali_fasi_validazione").select("phase_id, stato").eq("order_id", orderId),
  ]);
  if (error) throw error;
  if (e2) throw e2;
  const inAttesa = new Set(((val ?? []) as { phase_id: string; stato: string }[]).filter((v) => v.stato !== "validata").map((v) => v.phase_id));
  return ((data ?? []) as Array<Record<string, unknown>>).map(daRiga).filter((r) =>
    !(r.phase_id && inAttesa.has(r.phase_id))
    && ((r.residuo > 0 && !["consegnato", "installato"].includes(r.stato)) || r.eccedenza > 0 || r.unita_diversa));
}

/**
 * La data in cui i materiali servono in cantiere (null = l'inizio della fase).
 * Sposta «ordina entro»: il fabbisogno si ricarica.
 */
export function useImpostaDataFabbisogno() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, data }: { ids: string[]; data: string | null }) => {
      const { data: n, error } = await db.rpc("materiali_data_fabbisogno_imposta", { p_items: ids, p_data: data });
      if (error) throw error;
      return Number(n ?? 0);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fabbisogno-materiali"] });
      queryClient.invalidateQueries({ queryKey: ["order-items"] });
      queryClient.invalidateQueries({ queryKey: ["materiali-per-fase"] });
    },
  });
}

/** Le bozze d'ordine dai materiali selezionati: una per commessa e fornitore. */
export function useOrdinaDalFabbisogno() {
  const queryClient = useQueryClient();
  const { effectiveCompany, user } = useAuth();
  return useMutation({
    mutationFn: (righe: RigaFabbisogno[]) => {
      if (!effectiveCompany?.id) throw new Error("Azienda non disponibile");
      return ordinaDalFabbisogno({ companyId: effectiveCompany.id, userId: user?.id, righe });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["fabbisogno-materiali"] });
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["material-procurement"] });
      queryClient.invalidateQueries({ queryKey: ["linked-purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["materiali-per-fase"] });
    },
  });
}
