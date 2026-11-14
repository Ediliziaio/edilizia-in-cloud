import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function leggi(): boolean {
  // Dove matchMedia non c'è (test, vecchi browser) niente animazioni:
  // meglio un grafico fermo che uno che parte a metà.
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
  return window.matchMedia(QUERY).matches;
}

/**
 * true se chi guarda ha chiesto al sistema meno movimento (vertigini, mal
 * d'auto): i grafici compaiono già disegnati, senza crescere.
 */
export function usePreferisceMenoMovimento(): boolean {
  const [ridotto, setRidotto] = useState(leggi);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(QUERY);
    const cambia = () => setRidotto(mq.matches);
    mq.addEventListener?.("change", cambia);
    return () => mq.removeEventListener?.("change", cambia);
  }, []);
  return ridotto;
}
