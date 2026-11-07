// src/hooks/useFasiDiPartenza.ts
import { useCallback, useMemo, useState } from "react";
import { useImpostazioniAvvio } from "@/hooks/useImpostazioniAvvio";
import { useModelliFasi } from "@/hooks/useModelliFasi";
import { modelliDaOffrire, type ModelloFasi } from "@/lib/orders/modelliFasi";
import { modelloDiAvvio } from "@/lib/orders/nuovaCommessa";
import { useProfiloLavori } from "@/hooks/useProfiloLavori";

/**
 * Le fasi con cui parte la commessa nel modulo di nuova commessa: gli stessi modelli di
 * «Scegli le fasi», con già scelto quello di partenza dell'azienda (se ne ha uno).
 * Se l'utente non tocca niente, la commessa parte con quello; «Nessuna» la fa partire vuota.
 */
export function useFasiDiPartenza() {
  const { modelli, inizializzati } = useModelliFasi();
  const { modelloFasi } = useImpostazioniAvvio();
  const [scelto, setScelto] = useState<string | null>(null);
  // Solo i modelli dei lavori che l'azienda fa (Impostazioni → Fasi e avanzamento, o il settore).
  const { modelliStandard } = useProfiloLavori();
  const perContratto = useMemo(() => modelliDaOffrire(inizializzati, modelli, modelliStandard), [inizializzati, modelli, modelliStandard]);
  const offerti = useMemo(() => perContratto.filter(m=>m.ambito !== "contratto"),[perContratto]);
  const modello: ModelloFasi | null = modelloDiAvvio(offerti, scelto, modelloFasi);
  const scegli = useCallback((id: string | null) => setScelto(id), []);
  return { offerti, perContratto, modello, scelta: modello?.id ?? "", scelto, scegli };
}
