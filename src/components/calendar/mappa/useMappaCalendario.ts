import { useCallback, useMemo, useState, type SetStateAction } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { partiNelFuso } from "../../../../shared/mappa-operativa/calcoli";

export interface StatoMappa { id: string | null; risorsa: string; stato: string; cantiere: string }
const iniziale: StatoMappa = { id: null, risorsa: "", stato: "", cantiere: "" };

export function dataCalendarioOggi() {
  return new Date(partiNelFuso(new Date()).giorno + "T12:00:00");
}

// Il cache del gestionale è in memoria. Nessuna coordinata personale viene scritta su disco.
export function useMemoriaMappa<T>(ambito: string, chiave: string, predefinito: T) {
  const cache = useQueryClient();
  const queryKey = useMemo(() => ["memoria-mappa", ambito, chiave] as const, [ambito, chiave]);
  const [locale, setLocale] = useState<{ queryKey: typeof queryKey; valore: T }>();
  const valore = locale?.queryKey === queryKey ? locale.valore : cache.getQueryData<T>(queryKey) ?? predefinito;
  const set = useCallback((next: SetStateAction<T>) => {
    const salvato = cache.setQueryData<T>(queryKey, prev => typeof next === "function"
      ? (next as (v: T) => T)(prev ?? predefinito)
      : next);
    setLocale({ queryKey, valore: salvato ?? predefinito });
  }, [cache, queryKey, predefinito]);
  return [valore, set] as const;
}

export function useDataMappaCalendario(azienda: string | undefined, utente: string | undefined, ambito: string) {
  const [oggi] = useState(dataCalendarioOggi);
  return useMemoriaMappa(`giorno:${ambito}`, `${azienda ?? ""}:${utente ?? ""}`, oggi);
}

export function useMappaCalendario(azienda: string | undefined, utente: string | undefined, ambito: string) {
  const [state, set] = useMemoriaMappa(`filtri:${ambito}`, `${azienda ?? ""}:${utente ?? ""}`, iniziale);
  const onState = useCallback((patch: Partial<StatoMappa>) => {
    set(s => ({ ...s, ...patch }));
  }, [set]);
  return { state, onState };
}
