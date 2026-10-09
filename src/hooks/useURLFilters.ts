import { useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";

type ParamDef<T> = {
  key: string;
  defaultValue: T;
  serialize?: (value: T) => string;
  deserialize?: (raw: string) => T;
};

/** Scrive un valore nell'indirizzo: se è quello di partenza (o vuoto) il parametro sparisce. */
function applica<T>(params: URLSearchParams, def: ParamDef<T>, value: T) {
  const serialized = def.serialize ? def.serialize(value) : String(value);
  if (serialized === String(def.defaultValue) || serialized === "") {
    params.delete(def.key);
  } else {
    params.set(def.key, serialized);
  }
}

/**
 * Syncs a set of simple state values with URL search params.
 * Returns [values, setters] where setters update both state and URL.
 *
 * Più scritture nello stesso gestore si sommano: `setSearchParams` di React Router NON le mette in coda (anche nella
 * forma a funzione la seconda riparte dall'indirizzo letto al rendering e cancella la prima). Prima, `setPageSize(50);
 * setPage(1)` lasciava le righe per pagina a 25 («questo tasto non funziona») e ordinare una colonna non ordinava.
 * Qui si tiene l'indirizzo «in costruzione»: finché il rendering non porta un indirizzo nuovo, ogni scrittura si somma
 * alle precedenti.
 *
 * Usage:
 *   const { params, setParam, setParams } = useURLFilters({
 *     status: { key: "status", defaultValue: "all" },
 *     page:   { key: "page", defaultValue: 1, deserialize: Number, serialize: String },
 *   });
 */
export function useURLFilters<
  D extends Record<string, ParamDef<any>>
>(defs: D): {
  params: { [K in keyof D]: D[K]["defaultValue"] };
  setParam: <K extends keyof D>(key: K, value: D[K]["defaultValue"]) => void;
  setParams: (partial: Partial<{ [K in keyof D]: D[K]["defaultValue"] }>) => void;
} {
  const [searchParams, setSearchParams] = useSearchParams();
  const defsRef = useRef(defs);
  defsRef.current = defs;
  // L'indirizzo a cui si sta lavorando, insieme a quello letto al rendering da cui è partito.
  const inCostruzione = useRef<{ base: string; params: URLSearchParams } | null>(null);

  // Read current values from URL
  const params = {} as any;
  for (const [stateKey, def] of Object.entries(defs)) {
    const raw = searchParams.get(def.key);
    if (raw !== null && raw !== "") {
      params[stateKey] = def.deserialize ? def.deserialize(raw) : raw;
    } else {
      params[stateKey] = def.defaultValue;
    }
  }

  // Quando l'indirizzo cambia davvero la coda ha fatto il suo lavoro: si svuota. Senza, tornando a un indirizzo
  // visto prima (indietro del browser) la prossima scrittura ripartirebbe da modifiche ormai superate.
  useEffect(() => { inCostruzione.current = null; }, [searchParams]);

  const scrivi = useCallback((modifica: (params: URLSearchParams) => void) => {
    const base = searchParams.toString();
    const next = inCostruzione.current?.base === base ? inCostruzione.current.params : new URLSearchParams(searchParams);
    modifica(next);
    inCostruzione.current = { base, params: next };
    setSearchParams(new URLSearchParams(next), { replace: true });
  }, [searchParams, setSearchParams]);

  const setParam = useCallback(<K extends keyof D>(key: K, value: D[K]["defaultValue"]) => {
    scrivi((next) => applica(next, defsRef.current[key as string], value));
  }, [scrivi]);

  const setParams = useCallback((partial: Partial<{ [K in keyof D]: D[K]["defaultValue"] }>) => {
    scrivi((next) => {
      for (const [stateKey, value] of Object.entries(partial)) {
        const def = defsRef.current[stateKey];
        if (!def) continue;
        applica(next, def, value);
      }
    });
  }, [scrivi]);

  return { params, setParam, setParams };
}
