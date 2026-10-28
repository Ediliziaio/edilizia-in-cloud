import { loadCatalogPages } from "@/lib/listino/loadCatalogPages";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "./useEffectiveCompanyId";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { PianoMezzo, CostoPianoMezzo } from "@/lib/mezzi/pianoCantiere";
// Nuove tabelle: tipi locali fino alla rigenerazione del client generale.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
export function usePianoMezziCantiere(
  orderId: string,
  enabled: boolean,
  costi: boolean,
) {
  const companyId = useEffectiveCompanyId();
  const { user } = useAuth();
  const qc = useQueryClient();
  const key = ["mezzi-piani-cantiere", companyId, orderId, user?.id];
  const piani = useQuery({
    queryKey: key,
    enabled: enabled && !!companyId,
    queryFn: async (): Promise<PianoMezzo[]> => {
      return loadCatalogPages<PianoMezzo>((from, to) =>
        db
          .from("mezzi_piani_cantiere")
          .select("*")
          .eq("company_id", companyId)
          .eq("order_id", orderId)
          .order("dal")
          .order("id")
          .range(from, to),
      );
    },
  });
  const prezzi = useQuery({
    queryKey: [
      ...key,
      "costi",
      costi,
      (piani.data ?? [])
        .map((p) => p.id)
        .sort()
        .join(","),
    ],
    enabled: enabled && costi && !!piani.data?.length,
    queryFn: async (): Promise<Record<string, CostoPianoMezzo>> => {
      const data = await loadCatalogPages<
        CostoPianoMezzo & { piano_id: string; id: string }
      >((from, to) =>
        db
          .from("mezzi_piani_costi")
          .select("*,id:piano_id,piano:mezzi_piani_cantiere!inner(order_id)")
          .eq("company_id", companyId)
          .eq("piano.order_id", orderId)
          .order("piano_id")
          .range(from, to),
      );
      return Object.fromEntries(
        data.map((c: CostoPianoMezzo & { piano_id: string; id: string }) => [
          c.piano_id,
          c,
        ]),
      );
    },
  });
  const salva = useMutation({
    mutationFn: async (
      input: Partial<PianoMezzo> & { costo?: CostoPianoMezzo | null },
    ) => {
      const { error } = await db.rpc("salva_piano_mezzo", {
        p_dati: { ...input, order_id: orderId },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ["mezzi-piani-cantiere", companyId, orderId],
      });
      toast.success("Pianificazione salvata");
    },
    onError: (e: { message?: string }) =>
      toast.error(e.message || "Impossibile salvare la pianificazione"),
  });
  return { piani, prezzi, salva };
}
