import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";

const decodeJson = <T,>(raw: string): T => JSON.parse(raw) as T;
const encodeJson = <T,>(value: T): string => JSON.stringify(value);
/** Carica prima di renderizzare il nuovo ambito; non persiste mai il valore
 * dell'azienda precedente sotto la chiave di quella appena selezionata. */
export function useScopedStorage<T>(key: string | null, fallback: T, decode = decodeJson<T>, encode = encodeJson<T>): [T, Dispatch<SetStateAction<T>>] {
  const read = () => {
    try { const raw = key ? window.localStorage.getItem(key) : null; return raw === null ? fallback : decode(raw); }
    catch { return fallback; }
  };
  const [entry, setEntry] = useState(() => ({ key, value: read() }));
  if (entry.key !== key) setEntry({ key, value: read() });
  const setValue: Dispatch<SetStateAction<T>> = useCallback(value => {
    setEntry(current => ({ key, value: typeof value === "function" ? (value as (previous: T) => T)(current.value) : value }));
  }, [key]);
  useEffect(() => {
    if (!key || entry.key !== key) return;
    try { window.localStorage.setItem(key, encode(entry.value)); } catch { /* lo stato resta utilizzabile anche con storage pieno/disabilitato */ }
  }, [key, entry.key, entry.value, encode]);
  return [entry.value, setValue];
}
