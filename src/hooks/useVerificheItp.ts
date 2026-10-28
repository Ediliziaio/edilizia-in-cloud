import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { readAllPages } from "@/lib/personale/readAllPages";
import { chiaviFascicolo } from "./useFascicoloCantiere";
import type {
  ContestoItp,
  DatiVerificaItp,
  VerificaItp,
} from "@/lib/sicurezza/itp";
import { datiItpPerRegistrazione } from "@/lib/sicurezza/itp";
export function useVerificheItp(companyId: string, orderId: string) {
  const p = usePermissions();
  return useQuery({
    queryKey: ["verifiche-itp", companyId, orderId],
    enabled: !!companyId && !!orderId && p.canViewSicurezzaCantiere,
    queryFn: async () =>
      (await readAllPages((from, to) =>
        supabase
          .from("sicurezza_verifiche_itp" as never)
          .select("*")
          .eq("company_id", companyId)
          .eq("order_id", orderId)
          .order("versione", { ascending: false })
          .order("id")
          .range(from, to),
      )) as unknown as VerificaItp[],
  });
}
export function useContestoItp(
  companyId: string,
  orderId: string,
  subId: string | undefined,
  faseId?: string | null,
) {
  const p = usePermissions();
  return useQuery({
    queryKey: ["contesto-itp", companyId, orderId, subId, faseId ?? null],
    enabled: !!companyId && !!orderId && !!subId && p.canViewSicurezzaCantiere,
    queryFn: async (): Promise<ContestoItp> => {
      const { data, error } = await supabase.rpc(
        "sicurezza_itp_contesto" as never,
        {
          _company: companyId,
          _ordine: orderId,
          _sub: subId,
          _fase: faseId || null,
        } as never,
      );
      if (error) throw error;
      if (!data) throw new Error("Contesto della verifica non disponibile");
      return data as unknown as ContestoItp;
    },
  });
}
export function useRegistraItp(
  companyId: string,
  orderId: string,
  subId: string,
) {
  const p = usePermissions();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      precedente,
      dati,
    }: {
      id: string;
      precedente: string | null;
      dati: DatiVerificaItp;
    }) => {
      if (!p.canViewSicurezzaCantiere || p.solaLettura)
        throw new Error("Non puoi registrare verifiche ITP.");
      const { data, error } = await supabase.rpc(
        "sicurezza_registra_itp" as never,
        {
          _id: id,
          _company: companyId,
          _ordine: orderId,
          _sub: subId,
          _precedente: precedente,
          _dati: datiItpPerRegistrazione(dati),
        } as never,
      );
      if (error) throw error;
      const raw: unknown = data;
      const r = (Array.isArray(raw) ? raw[0] : raw) as VerificaItp | null;
      if (!r?.id)
        throw new Error(
          "Registrazione non confermata: rileggi lo storico prima di riprovare.",
        );
      return r;
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({
          queryKey: ["verifiche-itp", companyId, orderId],
        }),
        qc.invalidateQueries({ queryKey: chiaviFascicolo }),
      ]);
    },
  });
}

export async function leggiSoggettiItp(
  companyId: string,
  orderId: string,
  subId: string,
): Promise<import("@/lib/sicurezza/soggettiItp").SoggettiItp> {
  const { data, error } = await supabase.rpc(
    "sicurezza_itp_soggetti" as never,
    { _company: companyId, _ordine: orderId, _sub: subId } as never,
  );
  if (error) throw error;
  if (!data) throw new Error("Soggetti del cantiere non disponibili");
  return data as unknown as import("@/lib/sicurezza/soggettiItp").SoggettiItp;
}
export function useSoggettiItp(
  companyId: string,
  orderId: string,
  subId?: string,
) {
  const p = usePermissions();
  return useQuery({
    queryKey: ["soggetti-itp", companyId, orderId, subId],
    enabled: !!companyId && !!orderId && !!subId && p.canViewSicurezzaCantiere,
    queryFn: () => leggiSoggettiItp(companyId, orderId, subId!),
  });
}
