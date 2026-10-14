import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { ModalitaAcquisto, RigaAcquisto, StatoAcquisto, StatoRimborso } from "@/lib/campo/acquisti";
import { refreshCampoAcquistoQueries } from "@/lib/orders/refreshCommessaCampoQueries";

export interface AcquistoMio {
  id: string;
  created_at: string;
  order_id: string | null;
  modalita: ModalitaAcquisto;
  fornitore: string | null;
  numero_documento: string | null;
  totale: number | null;
  righe: RigaAcquisto[] | null;
  stato: StatoAcquisto;
  rimborso_stato: StatoRimborso;
  motivo_rifiuto: string | null;
  order?: { order_code: string | null } | null;
}

type RpcFn = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
const rpc = () => supabase.rpc.bind(supabase) as unknown as RpcFn;

/** Le ultime merci che ho segnato, con cosa ne ha fatto l'ufficio. */
export function useMieiAcquisti() {
  const { user, profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  return useQuery<AcquistoMio[]>({
    queryKey: ["campo-acquisti-miei", companyId, user?.id],
    enabled: !!user?.id && !!companyId,
    staleTime: 30_000,
    queryFn: async () => {
      // Tabella nuova, non ancora nei tipi generati.
      const { data, error } = await supabase
        .from("campo_acquisti" as never)
        .select("id, created_at, order_id, modalita, fornitore, numero_documento, totale, righe, stato, rimborso_stato, motivo_rifiuto, order:orders(order_code)" as never)
        .eq("company_id" as never, companyId as never)
        .eq("user_id" as never, user!.id as never)
        .order("created_at" as never, { ascending: false })
        .limit(12);
      if (error) throw error;
      return (data ?? []) as unknown as AcquistoMio[];
    },
  });
}

export interface NuovoAcquisto {
  orderId: string;
  modalita: ModalitaAcquisto;
  tipoDocumento: string;
  fornitore: string;
  numero: string;
  data: string | null;
  totale: number | null;
  righe: RigaAcquisto[];
  fotoPath: string | null;
  lettura: { confidenza: number; da_controllare: boolean } | null;
  note: string;
}

export function useRegistraAcquisto() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    onMutate: () => ({ companyId: profile?.company_id }),
    mutationFn: async (a: NuovoAcquisto) => {
      const { data, error } = await rpc()("campo_acquisto_registra", {
        p_order_id: a.orderId,
        p_modalita: a.modalita,
        p_tipo_documento: a.tipoDocumento,
        p_fornitore: a.fornitore || null,
        p_numero: a.numero || null,
        p_data: a.data,
        p_totale: a.totale,
        p_righe: a.righe,
        p_foto_path: a.fotoPath,
        p_lettura: a.lettura,
        p_note: a.note || null,
      });
      if (error) throw error;
      if (typeof data !== "string" || !data.trim()) throw new Error("L’ufficio non ha confermato la ricezione: controlla le ultime inviate prima di riprovare.");
      return data as string;
    },
    onSuccess: (_id, a, context) => { void refreshCampoAcquistoQueries(qc, a.orderId, context?.companyId); },
  });
}

export function useAnnullaAcquisto() {
  const qc = useQueryClient();
  const { profile, user } = useAuth();
  return useMutation({
    onMutate: (id: string) => ({ companyId: profile?.company_id,
      orderId: qc.getQueryData<AcquistoMio[]>(["campo-acquisti-miei", profile?.company_id, user?.id])?.find(a => a.id === id)?.order_id }),
    mutationFn: async (id: string) => {
      const { error } = await rpc()("campo_acquisto_annulla", { p_id: id });
      if (error) throw error;
    },
    onSuccess: (_data, _id, context) => { void refreshCampoAcquistoQueries(qc, context?.orderId, context?.companyId); },
  });
}
