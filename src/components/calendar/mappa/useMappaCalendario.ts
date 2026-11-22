import { useCallback, useState } from "react";
import { partiNelFuso } from "../../../../shared/mappa-operativa/calcoli";

export interface StatoMappa { id: string | null; risorsa: string; stato: string; cantiere: string }
const iniziale: StatoMappa = { id: null, risorsa: "", stato: "", cantiere: "" };

export function dataCalendarioOggi() {
  return new Date(partiNelFuso(new Date()).giorno + "T12:00:00");
}

export function useMappaCalendario(azienda?: string, utente?: string) {
  const chiave = `${azienda ?? ""}:${utente ?? ""}`;
  const [sessione, setSessione] = useState({ chiave, state: iniziale });
  const onState = useCallback((patch: Partial<StatoMappa>) => {
    setSessione(s => ({ chiave, state: { ...(s.chiave === chiave ? s.state : iniziale), ...patch } }));
  }, [chiave]);
  return { state: sessione.chiave === chiave ? sessione.state : iniziale, onState };
}
