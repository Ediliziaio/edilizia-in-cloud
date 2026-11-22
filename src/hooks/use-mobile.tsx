import { useCallback, useSyncExternalStore } from "react";

const MOBILE_BREAKPOINT = 768;
const serverSnapshot = () => false;

/**
 * Di serie telefono (<768 px); gli elenchi possono includere i tablet.
 * La misura è disponibile già al primo render, senza un passaggio false→true
 * che su Safari interferiva con l'apertura dei pannelli.
 */
export function useIsMobile(breakpoint = MOBILE_BREAKPOINT) {
  const subscribe = useCallback((onChange: () => void) => {
    const media = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    if (media.addEventListener) {
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    }
    media.addListener(onChange);
    return () => media.removeListener(onChange);
  }, [breakpoint]);
  const getSnapshot = useCallback(() => window.innerWidth < breakpoint, [breakpoint]);
  return useSyncExternalStore(subscribe, getSnapshot, serverSnapshot);
}
