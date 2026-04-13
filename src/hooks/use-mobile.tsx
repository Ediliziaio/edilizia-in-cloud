import * as React from "react";

const MOBILE_BREAKPOINT = 768;

/**
 * Rileva se il viewport è mobile (< 768px).
 * Inizializza SINCRONAMENTE con il valore reale per evitare flash/crash
 * su Safari WebKit (iPhone reale) dove il primo render con `undefined`
 * causava race condition con createPortal.
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean>(() => {
    // Inizializzazione sincrona — evita il flash false→true su iPhone
    if (typeof window !== "undefined") {
      return window.innerWidth < MOBILE_BREAKPOINT;
    }
    return false;
  });

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    // Compatibilità Safari < 14: addListener come fallback
    if (mql.addEventListener) {
      mql.addEventListener("change", onChange);
    } else if (mql.addListener) {
      mql.addListener(onChange);
    }
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => {
      if (mql.removeEventListener) {
        mql.removeEventListener("change", onChange);
      } else if (mql.removeListener) {
        mql.removeListener(onChange);
      }
    };
  }, []);

  return isMobile;
}
