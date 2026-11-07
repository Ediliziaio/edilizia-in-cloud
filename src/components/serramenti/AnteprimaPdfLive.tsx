/**
 * Il PDF vero del preventivo serramenti, a lato del wizard: lo disegna `AnteprimaPdfVero` (comune a tutti i
 * preventivatori dal 07/11/2026) con `renderSerramentoBlob`, la stessa funzione del bottone «Scarica».
 */
import { useCallback, useMemo } from "react";
import type { SerramentoPdfPayload } from "@/hooks/useSerramentoPDF";
import { AnteprimaPdfVero } from "@/components/preventivatore/AnteprimaPdfVero";

interface Props {
  payload: SerramentoPdfPayload;
  /** Se false non genera nulla (il pannello è chiuso). */
  attivo: boolean;
}

export function AnteprimaPdfLive({ payload, attivo }: Props) {
  // Cambia solo quando cambia qualcosa che finisce nel PDF.
  const chiave = useMemo(() => JSON.stringify([payload.detail, payload.template ?? null, payload.company ?? null]), [payload.detail, payload.template, payload.company]);
  const genera = useCallback(async () => {
    const { renderSerramentoBlob } = await import("@/hooks/useSerramentoPDF");
    return renderSerramentoBlob({ ...payload, useFreshTemplate: false });
  }, [payload]);
  return <AnteprimaPdfVero genera={genera} chiave={chiave} attivo={attivo} />;
}

export default AnteprimaPdfLive;
