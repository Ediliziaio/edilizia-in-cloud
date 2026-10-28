import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "./usePermissions";
import { readAllPages } from "@/lib/personale/readAllPages";
import { apriFileFascicolo } from "./useFascicoloCantiere";
import {
  erroriProdottoSds,
  type DatiProdottoSds,
  type ImpiegoProdottoSds,
  type QuadroProdottiSds,
} from "@/lib/sicurezza/prodottiSds";
export interface AmbitoProdottiSds {
  companyId: string;
  orderId: string;
  data: string;
  faseId?: string;
}
export async function leggiProdottiSds(
  a: AmbitoProdottiSds,
): Promise<QuadroProdottiSds> {
  const { data, error } = await supabase.rpc(
    "sicurezza_prodotti_quadro" as never,
    {
      _company: a.companyId,
      _ordine: a.orderId,
      _data: a.data,
      _fase: a.faseId || null,
    } as never,
  );
  if (error) throw new Error(error.message);
  const r = data as unknown as QuadroProdottiSds | null;
  if (
    !r ||
    r.company_id !== a.companyId ||
    r.order_id !== a.orderId ||
    r.data !== a.data ||
    r.fase_id !== (a.faseId || null) ||
    ![r.materiali, r.documenti, r.imprese, r.impieghi].every(Array.isArray)
  )
    throw new Error("Prodotti non disponibili per questo contesto.");
  return r;
}
export function useProdottiSds(a: AmbitoProdottiSds, enabled = true) {
  const p = usePermissions();
  return useQuery({
    queryKey: [
      "sicurezza-prodotti",
      a.companyId,
      a.orderId,
      a.data,
      a.faseId || null,
    ],
    enabled:
      enabled && !!a.companyId && !!a.orderId && p.canViewSicurezzaCantiere,
    queryFn: () => leggiProdottiSds(a),
    staleTime: 15000,
  });
}
export function useSalvaProdottoSds(a: AmbitoProdottiSds) {
  const p = usePermissions();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      id: string;
      versione: number | null;
      requestId: string;
      dati: DatiProdottoSds;
    }) => {
      if (!p.canViewSicurezzaCantiere || p.solaLettura)
        throw new Error("Non puoi modificare i prodotti.");
      const e = erroriProdottoSds(v.dati);
      if (e.length) throw new Error(e.join(" "));
      const { data, error } = await supabase.rpc(
        "sicurezza_prodotto_salva" as never,
        {
          _id: v.id,
          _company: a.companyId,
          _ordine: a.orderId,
          _versione: v.versione,
          _request: v.requestId,
          _data: a.data,
          _dati: v.dati,
        } as never,
      );
      if (error) throw new Error(error.message);
      const r = data as unknown as ImpiegoProdottoSds | null;
      if (
        !r ||
        r.id !== v.id ||
        !Number.isInteger(r.versione) ||
        r.versione < 1
      )
        throw new Error("Registrazione del prodotto non confermata.");
      return r;
    },
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ["sds-aziendali", a.companyId] }),
        qc.invalidateQueries({
          queryKey: ["sicurezza-prodotti", a.companyId, a.orderId],
        }),
        qc.invalidateQueries({
          queryKey: ["sicurezza-prodotti-storico", a.companyId, a.orderId],
        }),
      ]),
  });
}
export interface EventoProdottoSds {
  id: string;
  versione: number;
  prima: ImpiegoProdottoSds | null;
  dopo: ImpiegoProdottoSds;
  motivo: string;
  registrato_da: string;
  registrato_il: string;
}
export function useStoricoProdottoSds(a: AmbitoProdottiSds, id: string) {
  const p = usePermissions();
  return useQuery({
    queryKey: ["sicurezza-prodotti-storico", a.companyId, a.orderId, id],
    enabled: !!id && p.canViewSicurezzaCantiere,
    queryFn: async (): Promise<EventoProdottoSds[]> =>
      (await readAllPages((from, to) =>
        supabase
          .from("sicurezza_prodotti_eventi" as never)
          .select("id,versione,prima,dopo,motivo,registrato_da,registrato_il")
          .eq("company_id", a.companyId)
          .eq("order_id", a.orderId)
          .eq("impiego_id", id)
          .order("versione", { ascending: false })
          .order("id")
          .range(from, to),
      )) as unknown as EventoProdottoSds[],
  });
}
export async function apriSdsProdotto(
  a: AmbitoProdottiSds,
  id: string,
  impronta: string,
) {
  const { data, error } = await supabase.rpc(
    "sicurezza_sds_apri" as never,
    {
      _company: a.companyId,
      _ordine: a.orderId,
      _impiego: id,
      _data: a.data,
      _impronta: impronta,
    } as never,
  );
  if (error) throw new Error(error.message);
  if (typeof data !== "string" || !data)
    throw new Error("File SDS non disponibile.");
  await apriFileFascicolo(data);
}
