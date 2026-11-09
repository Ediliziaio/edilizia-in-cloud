import { useEffect, useState } from "react";

/** Sotto i 1024 px le schede a tre colonne diventano una pila: la vista a schede si monta solo lì. */
export function useSchermoStretto(): boolean {
  const [stretto, setStretto] = useState(() => typeof window !== "undefined" && window.innerWidth < 1024);
  useEffect(() => {
    const mql = window.matchMedia?.("(max-width: 1023px)");
    if (!mql) return;
    const aggiorna = () => setStretto(mql.matches);
    aggiorna();
    mql.addEventListener?.("change", aggiorna);
    return () => mql.removeEventListener?.("change", aggiorna);
  }, []);
  return stretto;
}
