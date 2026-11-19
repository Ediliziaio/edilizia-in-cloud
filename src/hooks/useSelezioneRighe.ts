import { useState } from "react";

/** La selezione riguarda sempre le righe visibili nella pagina e nei filtri attuali. */
export function useSelezioneRighe<T extends { id: string }>(righe: readonly T[], ambito: string) {
  const [stato, setStato] = useState({ ambito, ids: new Set<string>() });
  if (stato.ambito !== ambito) setStato({ ambito, ids: new Set() });
  const selezionate = stato.ambito === ambito ? righe.filter((r) => stato.ids.has(r.id)) : [];
  const ids = new Set(selezionate.map((r) => r.id));
  return {
    selezionate, ids,
    tutte: righe.length > 0 && ids.size === righe.length,
    parziale: ids.size > 0 && ids.size < righe.length,
    alterna(id: string) {
      setStato((prima) => {
        const dopo = new Set(prima.ambito === ambito ? prima.ids : []);
        if (dopo.has(id)) dopo.delete(id); else dopo.add(id);
        return { ambito, ids: dopo };
      });
    },
    pagina(attive: boolean) { setStato({ ambito, ids: new Set(attive ? righe.map((r) => r.id) : []) }); },
    mantieni(errori: readonly string[]) { setStato((prima) => prima.ambito === ambito ? { ambito, ids: new Set(errori) } : prima); },
  };
}
