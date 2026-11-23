import { useCallback, useEffect, useRef } from "react";

type Direzione = readonly [avanti: number, lato: number];

export const TASTI_CAMMINATA: Readonly<Record<string, Direzione>> = {
  w: [1, 0], a: [0, -1], s: [-1, 0], d: [0, 1],
  arrowup: [1, 0], arrowleft: [0, -1], arrowdown: [-1, 0], arrowright: [0, 1],
};

const METRI_SECONDO = 1.45;
const PASSO_TAP = .13;

export function useCamminata3D(attiva: boolean, cammina: (avanti: number, lato: number) => void) {
  const direzioni = useRef(new Map<string, Direzione>());
  const frame = useRef<number | undefined>(undefined);
  const passo = useRef(cammina);
  useEffect(() => { passo.current = cammina; }, [cammina]);

  const ferma = useCallback(() => {
    direzioni.current.clear();
    if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    frame.current = undefined;
  }, []);
  useEffect(() => {
    if (!attiva) { ferma(); return; }
    window.addEventListener("blur", ferma);
    document.addEventListener("visibilitychange", ferma);
    return () => {
      ferma();
      window.removeEventListener("blur", ferma);
      document.removeEventListener("visibilitychange", ferma);
    };
  }, [attiva, ferma]);

  const premi = (id: string, direzione: Direzione) => {
    if (!attiva || direzioni.current.has(id)) return;
    direzioni.current.set(id, direzione);
    if (frame.current !== undefined) return;
    passo.current(direzione[0] * PASSO_TAP, direzione[1] * PASSO_TAP);
    let precedente = performance.now();
    const aggiorna = (ora: number) => {
      if (!direzioni.current.size) { frame.current = undefined; return; }
      let avanti = 0, lato = 0;
      for (const [a, l] of direzioni.current.values()) {
        avanti += a;
        lato += l;
      }
      const distanza = Math.min(Math.max(0, (ora - precedente) / 1000), .04) * METRI_SECONDO;
      precedente = ora;
      const modulo = Math.hypot(avanti, lato);
      if (modulo && distanza > 0) passo.current(avanti / modulo * distanza, lato / modulo * distanza);
      frame.current = requestAnimationFrame(aggiorna);
    };
    frame.current = requestAnimationFrame(aggiorna);
  };

  const rilascia = (id: string) => {
    direzioni.current.delete(id);
    if (!direzioni.current.size) ferma();
  };

  return { premi, rilascia, ferma };
}
