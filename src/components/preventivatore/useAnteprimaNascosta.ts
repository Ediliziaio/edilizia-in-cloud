/**
 * Chi nasconde l'anteprima la vuole nascosta in ogni preventivatore: la scelta è
 * della persona, non del modulo. Vale per questo browser (senza memoria, per la
 * visita).
 */
import { useCallback, useState } from "react";

const CHIAVE = "preventivatore_anteprima_nascosta";

export function useAnteprimaNascosta(): readonly [boolean, (nascosta: boolean) => void] {
  const [nascosta, setNascosta] = useState<boolean>(() => {
    try { return localStorage.getItem(CHIAVE) === "1"; } catch { return false; }
  });
  const imposta = useCallback((valore: boolean) => {
    setNascosta(valore);
    try { localStorage.setItem(CHIAVE, valore ? "1" : "0"); } catch { /* senza memoria vale per questa visita */ }
  }, []);
  return [nascosta, imposta] as const;
}
