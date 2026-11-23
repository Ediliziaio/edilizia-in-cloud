import { useSottoLarghezza } from "@/hooks/useSottoLarghezza";

/** Sotto i 1024 px le schede a tre colonne diventano una pila: la vista a schede si monta solo lì. */
export function useSchermoStretto(): boolean {
  return useSottoLarghezza(1024);
}
