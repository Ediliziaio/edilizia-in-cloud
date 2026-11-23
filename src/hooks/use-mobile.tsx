import { useSottoLarghezza } from "@/hooks/useSottoLarghezza";

const MOBILE_BREAKPOINT = 768;

/**
 * Di serie telefono (<768 px); gli elenchi possono includere i tablet.
 *
 * La regola della larghezza sta tutta in `useSottoLarghezza`: valore vero già
 * al primo disegno (niente passaggio false→true che su Safari interferiva con
 * l'apertura dei pannelli) e, finché la larghezza non si sa, si parte da
 * computer invece che da telefono.
 */
export function useIsMobile(breakpoint = MOBILE_BREAKPOINT) {
  return useSottoLarghezza(breakpoint);
}
