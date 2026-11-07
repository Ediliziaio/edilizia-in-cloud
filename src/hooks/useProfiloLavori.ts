// src/hooks/useProfiloLavori.ts
import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useImpostazioniAvvio } from "@/hooks/useImpostazioniAvvio";
import { PHASE_TEMPLATES } from "@/hooks/useOrderWorkPhases";
import { modelliDiPartenzaDelProfilo, profiloLavori, type ProfiloLavori } from "@/lib/orders/tipiLavoro";

/**
 * I lavori che fa l'azienda (scelti in Impostazioni, altrimenti dal settore) e i
 * modelli standard di fasi che le si possono proporre. Chi fa solo serramenti non
 * si vede proporre il fotovoltaico.
 */
export function useProfiloLavori(): { profilo: ProfiloLavori; modelliStandard: typeof PHASE_TEMPLATES } {
  const { effectiveCompany } = useAuth();
  const { tipiLavoro } = useImpostazioniAvvio();
  const profilo = useMemo(() => profiloLavori(tipiLavoro, effectiveCompany?.sector), [tipiLavoro, effectiveCompany?.sector]);
  const modelliStandard = useMemo(() => modelliDiPartenzaDelProfilo(PHASE_TEMPLATES, profilo), [profilo]);
  return { profilo, modelliStandard };
}
