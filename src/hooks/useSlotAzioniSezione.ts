import { useEffect, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";

/**
 * Le sezioni di Commesse (commesse, rapportini, sopralluoghi, acquisti, DDT…) da telefono e tablet
 * mettono i loro bottoni («+», «⋯») sulla riga delle pillole, nello slot che apre OrdersHub
 * (`#slot-azioni-sezione`), invece di una testata o di una barra a sé: stessa forma in tutte le
 * sezioni (decisione del founder, 23/11/2026). Da computer, o fuori da Commesse, restituisce null
 * e la sezione disegna la sua testata come prima.
 */
export function useSlotAzioniSezione(soglia = 1024): HTMLElement | null {
  const sottoComputer = useIsMobile(soglia);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => { setSlot(document.getElementById("slot-azioni-sezione")); }, []);
  return sottoComputer ? slot : null;
}
