// src/hooks/useFasiDiPartenza.ts
import { useCallback, useMemo, useState } from "react";
import { PHASE_TEMPLATES } from "@/hooks/useOrderWorkPhases";
import { useImpostazioniAvvio } from "@/hooks/useImpostazioniAvvio";
import { useModelliFasi } from "@/hooks/useModelliFasi";
import { modelliDaOffrire, type ModelloFasi } from "@/lib/orders/modelliFasi";
import { modelloDiAvvio } from "@/lib/orders/nuovaCommessa";

/**
 * Le fasi con cui parte la commessa nel modulo di nuova commessa: gli stessi modelli di
 * «Scegli le fasi», con già scelto quello di partenza dell'azienda (se ne ha uno).
 * Se l'utente non tocca niente, la commessa parte con quello; «Nessuna» la fa partire vuota.
 */
export function useFasiDiPartenza() {
  const { modelli, inizializzati } = useModelliFasi();
  const { modelloFasi } = useImpostazioniAvvio();
  const [scelto, setScelto] = useState<string | null>(null);
  const offerti = useMemo(() => modelliDaOffrire(inizializzati, modelli, PHASE_TEMPLATES), [inizializzati, modelli]);
  const modello: ModelloFasi | null = modelloDiAvvio(offerti, scelto, modelloFasi);
  const scegli = useCallback((id: string | null) => setScelto(id), []);
  return { offerti, modello, scelta: modello?.id ?? "", scelto, scegli };
}
