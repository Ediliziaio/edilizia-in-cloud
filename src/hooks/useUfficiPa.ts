// Uffici di fatturazione di un cliente PA (lotto 2, 15/11/2026).
// Riusabile da scheda anagrafica, commessa e fattura (lotti 3-4):
//   const { uffici, predefinito, aggiungi, modifica, rendiPredefinito, disattiva } = useUfficiPa(anagraficaId);
// La regola d'accesso è per azienda; l'azienda della riga la mette il database
// (presa dall'anagrafica), il client non la sceglie.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  COLONNE_UFFICIO_PA,
  normalizzaCodiceUfficio,
  ordinaUfficiPa,
  ufficioDaProporre,
  type UfficioPa,
  type UfficioPaForm,
} from "@/lib/clienti/ufficiPa";

export const chiaveUfficiPa = (anagraficaId: string | null | undefined) => ["uffici-pa", anagraficaId ?? null] as const;

export function useUfficiPa(anagraficaId: string | null | undefined, opzioni: { soloAttivi?: boolean } = {}) {
  const qc = useQueryClient();
  const chiave = chiaveUfficiPa(anagraficaId);

  const query = useQuery({
    queryKey: chiave,
    enabled: !!anagraficaId,
    queryFn: async (): Promise<UfficioPa[]> => {
      const { data, error } = await supabase
        .from("anagrafica_uffici_pa")
        .select(COLONNE_UFFICIO_PA)
        .eq("anagrafica_id", anagraficaId!);
      if (error) throw error;
      return ordinaUfficiPa((data ?? []) as UfficioPa[]);
    },
    staleTime: 60_000,
  });

  const tutti = query.data ?? [];
  const uffici = opzioni.soloAttivi ? tutti.filter((u) => u.attivo) : tutti;

  const aggiorna = () => {
    qc.invalidateQueries({ queryKey: chiave });
    // codice_sdi dell'anagrafica segue il predefinito: la scheda va riletta.
    qc.invalidateQueries({ queryKey: ["anagrafiche-native"] });
  };

  const aggiungi = useMutation({
    mutationFn: async (f: UfficioPaForm & { predefinito?: boolean }) => {
      if (!anagraficaId) throw new Error("Anagrafica mancante");
      const { data, error } = await supabase
        .from("anagrafica_uffici_pa")
        .insert({
          anagrafica_id: anagraficaId,
          descrizione: f.descrizione.trim(),
          codice_univoco_ufficio: normalizzaCodiceUfficio(f.codice),
          note: f.note?.trim() || null,
          predefinito: !!f.predefinito,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: aggiorna,
  });

  const modifica = useMutation({
    mutationFn: async ({ id, ...f }: UfficioPaForm & { id: string }) => {
      const { error } = await supabase
        .from("anagrafica_uffici_pa")
        .update({
          descrizione: f.descrizione.trim(),
          codice_univoco_ufficio: normalizzaCodiceUfficio(f.codice),
          note: f.note?.trim() || null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: aggiorna,
  });

  const rendiPredefinito = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("anagrafica_uffici_pa").update({ predefinito: true, attivo: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: aggiorna,
  });

  const disattiva = useMutation({
    mutationFn: async ({ id, attivo }: { id: string; attivo: boolean }) => {
      const { error } = await supabase.from("anagrafica_uffici_pa").update({ attivo }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: aggiorna,
  });

  return {
    ...query,
    uffici,
    tutti,
    predefinito: ufficioDaProporre(tutti),
    aggiungi,
    modifica,
    rendiPredefinito,
    disattiva,
  };
}

/** Messaggio leggibile per gli errori del database sugli uffici. */
export function messaggioErroreUfficio(err: unknown): string {
  const m = (err as { message?: string })?.message ?? String(err);
  if (/anagrafica_uffici_pa_codice_unico|duplicate key/i.test(m)) return "Questo codice c'è già tra gli uffici dell'ente.";
  if (/anagrafica_uffici_pa_codice_check/i.test(m)) return "Il codice univoco ufficio ha 6 caratteri, lettere o cifre.";
  if (/row-level security|permission denied/i.test(m)) return "Non hai il permesso di modificare gli uffici di questo cliente.";
  return m;
}
