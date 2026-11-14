// src/hooks/useUnitaDalPiano.ts
// Le unità che le vendite del piano elencano e che non sono ancora state create
// (lib/orders/generali/unitaDalPiano). Legge la versione del piano in vista — l'approvata,
// altrimenti la bozza —: le stesse letture del quadro della generale, che React Query condivide.
import { useMemo } from "react";
import { scegliVersione, useVersioniPiano, useVociPiano } from "@/hooks/useGeneralePiano";
import { unitaDalPiano, type UnitaDalPiano } from "@/lib/orders/generali/unitaDalPiano";

export function useUnitaDalPiano(generaleId: string | undefined, sigleEsistenti: string[], abilitato: boolean): UnitaDalPiano | null {
  const versioni = useVersioniPiano(generaleId, abilitato);
  const { inVista } = scegliVersione(Array.isArray(versioni.data) ? versioni.data : [], null, "approvata");
  const voci = useVociPiano(abilitato ? inVista?.id : null);
  const sigle = sigleEsistenti.join("\u0000");
  return useMemo(
    () => (abilitato && Array.isArray(voci.data) ? unitaDalPiano(voci.data, sigle ? sigle.split("\u0000") : []) : null),
    [abilitato, voci.data, sigle],
  );
}
