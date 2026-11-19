import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { readAllPages } from "@/lib/personale/readAllPages";
import { useMemo } from "react";

export interface SezionaleIva { id: string; codice: string; nome: string; lato: "vendite" | "acquisti" }
export interface ProtocolloIva { id: string; sezionale_id: string; documento_id: string; lato: "vendite" | "acquisti"; anno: number; numero: number; data_registrazione: string }
export const chiaveProtocolloIva = (lato: string, id: string) => `${lato}:${id}`;

export function useRegistriIva(company: string | undefined | null) {
  const qc = useQueryClient();
  const sezionali = useQuery({
    queryKey: ["iva-sezionali", company], enabled: !!company,
    queryFn: async () => {
      const { data, error } = await supabase.from("iva_sezionali" as never).select("id,codice,nome,lato").eq("company_id", company!).order("lato").order("codice");
      if (error) throw error;
      return (data ?? []) as unknown as SezionaleIva[];
    },
  });
  const protocolli = useQuery({
    queryKey: ["iva-protocolli", company], enabled: !!company,
    queryFn: async () => await readAllPages((da, a) => supabase.from("iva_protocolli" as never)
      .select("id,sezionale_id,documento_id,lato,anno,numero,data_registrazione").eq("company_id", company!)
      .is("annullato_il", null).order("id").range(da, a)) as unknown as ProtocolloIva[],
  });
  const permesso = useQuery({
    queryKey: ["iva-permesso-scrittura", company], enabled: !!company,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("contabilita_puo_scrivere", { p_company: company! });
      if (error) throw error;
      return data === true;
    },
  });
  const perDocumento = useMemo(() => new Map((protocolli.data ?? []).map(p => [chiaveProtocolloIva(p.lato, p.documento_id), p])), [protocolli.data]);
  const perSezionale = useMemo(() => new Map((sezionali.data ?? []).map(s => [s.id, s])), [sezionali.data]);
  return { sezionali, protocolli, puoScrivere: permesso.data === true, perDocumento, perSezionale,
    ricarica: async () => { await Promise.all([qc.invalidateQueries({ queryKey: ["iva-protocolli", company] }), qc.invalidateQueries({ queryKey: ["iva-sezionali", company] })]); },
  };
}
