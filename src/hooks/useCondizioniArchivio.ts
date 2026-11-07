/**
 * L'archivio delle condizioni contrattuali: lettura e scrittura (07/11/2026).
 *
 * Le clausole sono i mattoni, i modelli i muri. Un modello ha un ambito (a chi va il documento) e, per
 * ambito, uno solo può essere il predefinito: è quello che il sistema pesca da solo.
 *
 * Ogni salvataggio di un modello alza la versione e ne conserva la fotografia: lo fa il database, non qui.
 * Finché le tabelle non esistono (migrazioni 20281219100000 e 20281219110000) la lettura non rompe niente
 * e la sezione resta vuota.
 */
import { dimenticaArchivioLetto } from "@/lib/condizioni/archivioNelModello";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { AmbitoCondizioni, Clausola, ModelloCondizioni } from "@/lib/condizioni/archivio";

// Le tabelle non sono nei tipi generati finché non si rigenerano: si passa dal client non tipizzato.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface ClausolaArchivio {
  id: string;
  company_id: string;
  categoria: string | null;
  titolo: string;
  testo: string;
  vessatoria: boolean;
  attiva: boolean;
  ordine: number;
}

const CHIAVE_CLAUSOLE = (azienda: string | undefined) => ["condizioni-clausole", azienda] as const;
const CHIAVE_MODELLI = (azienda: string | undefined) => ["condizioni-modelli", azienda] as const;

export function useCondizioniArchivio() {
  const { effectiveCompany } = useAuth();
  const azienda = effectiveCompany?.id;
  const qc = useQueryClient();
  const aggiorna = (): void => {
    void qc.invalidateQueries({ queryKey: CHIAVE_CLAUSOLE(azienda) });
    void qc.invalidateQueries({ queryKey: CHIAVE_MODELLI(azienda) });
    // Il PDF dei preventivi aperti rilegge l'archivio al prossimo giro, senza aspettare il minuto.
    dimenticaArchivioLetto();
  };
  const errore = (e: unknown): void => { toast.error(e instanceof Error && e.message ? e.message : "Non salvato: riprova."); };

  const clausole = useQuery({
    queryKey: CHIAVE_CLAUSOLE(azienda),
    enabled: !!azienda,
    staleTime: 60_000,
    retry: false,
    queryFn: async (): Promise<{ disponibile: boolean; righe: ClausolaArchivio[] }> => {
      const { data, error } = await db.from("condizioni_clausole")
        .select("id, company_id, categoria, titolo, testo, vessatoria, attiva, ordine")
        .eq("company_id", azienda).order("ordine").order("titolo").limit(1000);
      if (error) return { disponibile: false, righe: [] };
      return { disponibile: true, righe: (data ?? []) as ClausolaArchivio[] };
    },
  });

  const modelli = useQuery({
    queryKey: CHIAVE_MODELLI(azienda),
    enabled: !!azienda,
    staleTime: 60_000,
    retry: false,
    queryFn: async (): Promise<{ disponibile: boolean; righe: ModelloCondizioni[] }> => {
      const { data, error } = await db.from("condizioni_modelli")
        .select("id, nome, ambito, predefinito, attivo, versione, clausole, note")
        .eq("company_id", azienda).order("ambito").order("nome").limit(500);
      if (error) return { disponibile: false, righe: [] };
      return { disponibile: true, righe: (data ?? []) as ModelloCondizioni[] };
    },
  });

  const salvaClausola = useMutation({
    mutationFn: async (c: Partial<ClausolaArchivio> & { titolo: string; testo: string }) => {
      const riga = { company_id: azienda, categoria: c.categoria ?? null, titolo: c.titolo.trim(), testo: c.testo,
        vessatoria: !!c.vessatoria, attiva: c.attiva ?? true, ordine: c.ordine ?? 0 };
      const { error } = c.id
        ? await db.from("condizioni_clausole").update({ ...riga, updated_at: new Date().toISOString() }).eq("id", c.id)
        : await db.from("condizioni_clausole").insert(riga);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success("Clausola salvata"); aggiorna(); },
    onError: errore,
  });

  /** Le clausole di base, tutte in un colpo: un avviso solo, non sette. */
  const clausoleDiPartenza = useMutation({
    mutationFn: async (righe: ReadonlyArray<{ titolo: string; testo: string; vessatoria?: boolean; categoria?: string }>) => {
      const { error } = await db.from("condizioni_clausole").insert(righe.map((c, i) => ({
        company_id: azienda, categoria: c.categoria ?? null, titolo: c.titolo, testo: c.testo,
        vessatoria: !!c.vessatoria, attiva: true, ordine: i,
      })));
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success("Clausole di base aggiunte: rileggile e adattale"); aggiorna(); },
    onError: errore,
  });

  const eliminaClausola = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("condizioni_clausole").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success("Clausola eliminata"); aggiorna(); },
    onError: errore,
  });

  const salvaModello = useMutation({
    mutationFn: async (m: { id?: string; nome: string; ambito: AmbitoCondizioni; clausole: Clausola[]; predefinito?: boolean; attivo?: boolean; note?: string | null }) => {
      const riga = { company_id: azienda, nome: m.nome.trim(), ambito: m.ambito, clausole: m.clausole,
        predefinito: !!m.predefinito, attivo: m.attivo ?? true, note: m.note ?? null };
      // Un solo predefinito per ambito: lo impone un indice unico, qui si libera il posto prima.
      if (riga.predefinito) {
        await db.from("condizioni_modelli").update({ predefinito: false })
          .eq("company_id", azienda).eq("ambito", m.ambito).neq("id", m.id ?? "00000000-0000-0000-0000-000000000000");
      }
      // Restituisce il modello salvato: chi lo crea da un preventivatore lo associa subito.
      const { data, error } = m.id
        ? await db.from("condizioni_modelli").update(riga).eq("id", m.id).select("id,nome,versione").single()
        : await db.from("condizioni_modelli").insert(riga).select("id,nome,versione").single();
      if (error) throw new Error(error.message);
      return data as { id: string; nome: string; versione: number };
    },
    onSuccess: () => { toast.success("Modello salvato"); aggiorna(); },
    onError: errore,
  });

  const eliminaModello = useMutation({
    mutationFn: async (id: string) => {
      // Non si cancella: si archivia, così i documenti che lo citano continuano a raccontarsi.
      const { error } = await db.from("condizioni_modelli").update({ attivo: false, predefinito: false }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success("Modello archiviato"); aggiorna(); },
    onError: errore,
  });

  return {
    disponibile: clausole.data?.disponibile !== false && modelli.data?.disponibile !== false,
    inCaricamento: clausole.isLoading || modelli.isLoading,
    clausole: clausole.data?.righe ?? [],
    modelli: modelli.data?.righe ?? [],
    salvaClausola, clausoleDiPartenza, eliminaClausola, salvaModello, eliminaModello,
  };
}
