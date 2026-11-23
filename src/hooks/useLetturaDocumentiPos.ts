import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { chiamaServerPos } from "@/hooks/usePos";
import type { DecisioniLettore, RisultatoLettore } from "../../supabase/functions/_shared/posLettoreDocumenti";

export interface LetturaDocumentiVista {
  id: string;
  stato: "in_corso" | "pronta" | "errore";
  errore: string | null;
  avvisi: string[];
  fonti: {
    psc: { id: string; titolo: string; revisione: string; sha256: string } | null;
    contratto: { id: string; file_name: string; file_path: string } | null;
  };
  avanzamento: { fatti: number; blocchi: number | null };
  ferma: boolean;
  risultato: RisultatoLettore | null;
  decisioni: DecisioniLettore;
  aggiornata_il: string;
}

export interface ContrattoCandidato { id: string; file_name: string; file_url: string; created_at: string; suggerito: boolean }

const chiave = (companyId: string, posId: string) => ["pos-lettura-documenti", companyId, posId] as const;

/** Lo stato dell'ultima lettura di PSC e contratto del POS; mentre è in corso si aggiorna da solo. */
export function useLetturaDocumentiPos(companyId: string, posId: string) {
  const client = useQueryClient();
  const queryKey = chiave(companyId, posId);
  const stato = useQuery({
    queryKey,
    queryFn: async () => (await chiamaServerPos<{ lettura: LetturaDocumentiVista | null }>({
      azione: "stato_lettura_documenti", company_id: companyId, pos_id: posId,
    })).lettura,
    retry: 1,
    refetchInterval: q => q.state.data?.stato === "in_corso" && !q.state.data.ferma ? 3000 : false,
  });
  const aggiorna = async (lettura: LetturaDocumentiVista | null) => {
    await client.cancelQueries({ queryKey });
    client.setQueryData(queryKey, lettura);
    void client.invalidateQueries({ queryKey });
  };
  const avvia = useMutation({
    mutationFn: async ({ contrattoId, usaPsc, salva }: { contrattoId: string | null; usaPsc: boolean; salva?: () => Promise<boolean> }) => {
      if (salva && !await salva()) throw new Error("Salva la bozza prima di leggere i documenti.");
      return (await chiamaServerPos<{ lettura: LetturaDocumentiVista }>({
        azione: "avvia_lettura_documenti", company_id: companyId, pos_id: posId, usa_psc: usaPsc,
        ...(contrattoId ? { contratto_id: contrattoId } : {}),
      })).lettura;
    },
    onSuccess: aggiorna,
  });
  const decidi = useMutation({
    mutationFn: async ({ letturaId, decisioni }: { letturaId: string; decisioni: DecisioniLettore }) =>
      (await chiamaServerPos<{ decisioni: DecisioniLettore }>({
        azione: "decidi_lettura_documenti", company_id: companyId, pos_id: posId, lettura_id: letturaId, decisioni,
      })).decisioni,
    onSuccess: decisioni => {
      client.setQueryData<LetturaDocumentiVista | null>(queryKey, prev => prev ? { ...prev, decisioni } : prev);
    },
  });
  return { stato, avvia, decidi };
}

/** I PDF della commessa che l'utente può leggere: il contratto si sceglie fra questi. */
export function useContrattiCommessaPos(orderId: string, attivo: boolean) {
  return useQuery({
    queryKey: ["pos-contratti-commessa", orderId],
    enabled: attivo && !!orderId,
    queryFn: async (): Promise<ContrattoCandidato[]> => {
      const { data, error } = await supabase.from("order_attachments")
        .select("id,file_name,file_url,file_type,created_at")
        .eq("order_id", orderId).order("created_at", { ascending: false }).limit(80);
      if (error) throw error;
      return (data ?? [])
        .filter(a => a.file_type === "application/pdf" || /\.pdf$/i.test(a.file_name ?? ""))
        .map(a => ({
          id: a.id, file_name: a.file_name ?? "documento.pdf", file_url: a.file_url, created_at: a.created_at,
          suggerito: /\/ai-contratti\//.test(a.file_url) || /contratt/i.test(a.file_name ?? ""),
        }))
        .sort((a, b) => Number(b.suggerito) - Number(a.suggerito));
    },
  });
}
