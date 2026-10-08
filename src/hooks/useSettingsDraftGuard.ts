import { useCallback, useEffect } from "react";
import { useBeforeUnload } from "./useBeforeUnload";

const bozzeAttive = new Set<symbol>();
/** Per la ricerca e i controlli che navigano senza usare un link. */
export function confermaNavigazioneImpostazioni() {
  return bozzeAttive.size === 0 || window.confirm("Ci sono modifiche non salvate. Uscire senza salvarle?");
}

/** Protegge ricaricamento e link interni; per cambi di scheda programmati usare confermaUscita. */
export function useSettingsDraftGuard(dirty: boolean) {
  useBeforeUnload(dirty);
  useEffect(() => {
    if (!dirty) return;
    const id = Symbol("settings-draft");
    bozzeAttive.add(id);
    return () => { bozzeAttive.delete(id); };
  }, [dirty]);
  const confermaUscita = useCallback(
    () => !dirty || window.confirm("Ci sono modifiche non salvate. Uscire senza salvarle?"),
    [dirty],
  );
  useEffect(() => {
    if (!dirty) return;
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!target || target.target === "_blank" || target.hasAttribute("download")) return;
      const next = new URL(target.href, window.location.href);
      if (next.origin !== window.location.origin || (next.pathname === window.location.pathname && next.search === window.location.search)) return;
      if (!confermaUscita()) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [dirty, confermaUscita]);
  return confermaUscita;
}
