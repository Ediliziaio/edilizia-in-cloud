import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Remember this user's list choices within this tab and company; explicit URLs win.
 *
 * `nonRipristinare` (26/11/2026): valori che si ricordano ma non si rimettono. Il cestino è il
 * caso: chi apre i documenti eliminati ci resta dentro, e da quel momento l'elenco si riapre
 * sempre lì — anche dopo un'uscita e un rientro, perché la memoria è della scheda del browser.
 * Impresa Vulcano ha segnalato «le fatture non ancora inviate a SDI non ci sono più» ed erano
 * tutte al loro posto: l'elenco si era riaperto sul Cestino.
 */
export function useOperationalViewMemory(
  namespace: string,
  fields: string[],
  options: { restoreView?: boolean; nonRipristinare?: Record<string, readonly string[]> } = {},
) {
  const { user, effectiveCompany } = useAuth();
  const [params, setParams] = useSearchParams();
  const restored = useRef<string | null>(null);
  const key =
    user?.id && effectiveCompany?.id
      ? `operational-view:${user.id}:${effectiveCompany.id}:${namespace}`
      : null;
  const restoreView = options.restoreView !== false;
  const fieldNames = fields.join("|");
  const vietati = JSON.stringify(options.nonRipristinare ?? {});
  useEffect(() => {
    if (!key) return;
    const names = fieldNames.split("|");
    try {
      if (restored.current !== key) {
        restored.current = key;
        const saved = sessionStorage.getItem(key);
        if (saved && !names.some((name) => params.has(name))) {
          const stored = new URLSearchParams(saved);
          const fuoriRipristino = JSON.parse(vietati) as Record<string, string[]>;
          for (const [nome, valori] of Object.entries(fuoriRipristino)) {
            const valore = stored.get(nome);
            if (valore !== null && valori.includes(valore)) stored.delete(nome);
          }
          if (names.some((name) => stored.has(name))) {
            setParams(
              (before) => {
                const next = new URLSearchParams(before);
                for (const name of names) {
                  if (!restoreView && (name === "vista" || name === "raggruppa" || name.endsWith("_vista"))) continue;
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
  }, [key, fieldNames, params, setParams, restoreView, vietati]);
}
