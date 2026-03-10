import { useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";

type ParamDef<T> = {
  key: string;
  defaultValue: T;
  serialize?: (value: T) => string;
  deserialize?: (raw: string) => T;
};

/**
 * Syncs a set of simple state values with URL search params.
 * Returns [values, setters] where setters update both state and URL.
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

  const setParam = useCallback(<K extends keyof D>(key: K, value: D[K]["defaultValue"]) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      const def = defsRef.current[key as string];
      const serialized = def.serialize ? def.serialize(value) : String(value);
      if (serialized === String(def.defaultValue) || serialized === "") {
        next.delete(def.key);
      } else {
        next.set(def.key, serialized);
      }
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const setParams = useCallback((partial: Partial<{ [K in keyof D]: D[K]["defaultValue"] }>) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [stateKey, value] of Object.entries(partial)) {
        const def = defsRef.current[stateKey];
        if (!def) continue;
        const serialized = def.serialize ? def.serialize(value) : String(value);
        if (serialized === String(def.defaultValue) || serialized === "") {
          next.delete(def.key);
        } else {
          next.set(def.key, serialized);
        }
      }
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  return { params, setParam, setParams };
}
