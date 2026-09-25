import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { MODULI_CON_MODELLI, TABELLA_PREVENTIVI, type ModuloConModelli } from "@/lib/moduli/modelloPreventivo";

/**
 * La tabella dei preventivi ha la colonna del modello? Prima la migrazione, poi
 * l'app: senza la colonna un preventivo con il modello non si crea (come Tetti,
 * useTettiModelSupport). Si interroga senza leggere righe.
 */
async function haColonnaModello(tabella: string, companyId: string): Promise<boolean> {
  const { error } = await supabase.from(tabella as never)
    .select("modello_snapshot", { head: true }).eq("company_id", companyId).limit(0);
  if (!error) return true;
  if (["42703", "PGRST204", "PGRST205", "42P01"].includes(error.code)) return false;
  throw error;
}

/** I preventivatori edili pronti a salvare il modello dell'intervento. */
export function useSupportoModelliPreventivo(moduli: readonly ModuloConModelli[] = MODULI_CON_MODELLI) {
  const companyId = useEffectiveCompanyId();
  const query = useQuery({
    queryKey: ["supporto-modelli-preventivo", companyId, moduli.join(",")],
    enabled: !!companyId, staleTime: 60_000, retry: false,
    queryFn: async (): Promise<Partial<Record<ModuloConModelli, boolean>>> => Object.fromEntries(
      await Promise.all(moduli.map(async (modulo) => [modulo, await haColonnaModello(TABELLA_PREVENTIVI[modulo], companyId!)] as const)),
    ),
  });
  return {
    supportato: (modulo: ModuloConModelli) => query.data?.[modulo] === true,
    isLoading: !!companyId && query.isLoading,
    isError: query.isError,
  };
}

/** Per un solo preventivatore, con la forma di useTettiModelSupport. */
export function useSupportoModelloPreventivo(modulo: ModuloConModelli) {
  const supporto = useSupportoModelliPreventivo([modulo]);
  return { supported: supporto.supportato(modulo), isLoading: supporto.isLoading, isError: supporto.isError };
}
