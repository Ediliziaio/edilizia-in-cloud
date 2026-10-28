import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useFiscalPeriod } from "@/hooks/useFiscalPeriod";
import { fiscalNumber } from "@/lib/fatturazione/fiscalWorkspace";
export interface LiquidazioneIVAResult {
  iva_vendite: number | null;
  iva_acquisti: number | null;
  saldo: number | null;
  credito: boolean;
  dovuto: boolean;
  periodo_label: string;
  ipotesi: string[];
  escluso: unknown;
  documenti: unknown;
  dettaglio_aliquote: unknown;
  esigibilita_differita: unknown;
  calcolabile: boolean;
  motivo?: string;
}
export function useLiquidazioneIVA() {
  const company = useEffectiveCompanyId(),
    p = useFiscalPeriod(),
    qc = useQueryClient();
  const key = [
    "fiscal-liquidazione",
    company,
    p.anno,
    p.tipo,
    p.mese,
    p.trimestre,
  ];
  const query = useQuery({
    queryKey: key,
    enabled: false,
    retry: false,
    queryFn: async () => {
      if (!company) throw Error("Seleziona un’azienda");
      const { data, error } = await supabase.rpc(
        "liquidazione_iva_periodo" as never,
        {
          p_company_id: company,
          p_periodo: p.tipo,
          p_anno: p.anno,
          p_mese: p.tipo === "mensile" ? p.mese : null,
          p_trimestre: p.tipo === "trimestrale" ? p.trimestre : null,
        } as never,
      );
      if (error) throw error;
      const r = data as Record<string, unknown>,
        vendite = fiscalNumber(r?.iva_vendite),
        acquisti = fiscalNumber(r?.iva_acquisti),
        saldo = fiscalNumber(r?.saldo);
      if (
        r?.calcolabile !== false &&
        (vendite === null || acquisti === null || saldo === null)
      )
        throw Error(
          "Risultato IVA incompleto: non può essere presentato come saldo valido",
        );
      return {
        ...r,
        iva_vendite: vendite,
        iva_acquisti: acquisti,
        saldo,
        credito: saldo !== null && saldo < 0,
        dovuto: saldo !== null && saldo > 0,
        periodo_label:
          (r.periodo as { etichetta?: string })?.etichetta ||
          `${p.dal} – ${p.al}`,
        calcolabile: r.calcolabile === true,
        ipotesi: Array.isArray(r.ipotesi) ? r.ipotesi.map(String) : [],
        motivo: typeof r.motivo === "string" ? r.motivo : undefined,
      } as LiquidazioneIVAResult;
    },
  });
  return {
    calcola: async () => {
      await query.refetch();
    },
    isCalcolando: query.isFetching,
    risultato: query.isError ? null : (query.data ?? null),
    error: query.isError
      ? "Impossibile calcolare il prospetto: nessun saldo è stato confermato. Riprova."
      : null,
    reset: () => {
      qc.removeQueries({ queryKey: key, exact: true });
    },
  };
}
