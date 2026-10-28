import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

/** Remember this user's list choices within this tab and company; explicit URLs win. */
export function useOperationalViewMemory(namespace: string, fields: string[]) {
  const { user, effectiveCompany } = useAuth();
  const [params, setParams] = useSearchParams();
  const restored = useRef<string | null>(null);
  const key =
    user?.id && effectiveCompany?.id
      ? `operational-view:${user.id}:${effectiveCompany.id}:${namespace}`
      : null;
  const fieldNames = fields.join("|");
  useEffect(() => {
    if (!key) return;
    const names = fieldNames.split("|");
    try {
      if (restored.current !== key) {
        restored.current = key;
        const saved = sessionStorage.getItem(key);
        if (saved && !names.some((name) => params.has(name))) {
          const stored = new URLSearchParams(saved);
          if (names.some((name) => stored.has(name))) {
            setParams(
              (before) => {
                const next = new URLSearchParams(before);
                for (const name of names) {
                  const value = stored.get(name);
                  if (value !== null) next.set(name, value);
                }
                return next;
              },
              { replace: true },
            );
            return;
          }
        }
      }
      const selected = new URLSearchParams();
      for (const name of names) {
        const value = params.get(name);
        if (value !== null) selected.set(name, value);
      }
      sessionStorage.setItem(key, selected.toString());
    } catch {
      /* List controls remain usable when browser storage is unavailable. */
    }
  }, [key, fieldNames, params, setParams]);
}
