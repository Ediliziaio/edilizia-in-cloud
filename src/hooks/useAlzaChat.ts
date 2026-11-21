import { useEffect } from "react";
import type { RefObject } from "react";

/**
 * Alza i pulsanti fissi in basso a destra (WhatsApp, chat pubblica) sopra una barra
 * fissa in basso, della sua altezza vera. Prima la barra della home alzava sempre di
 * 64 px: su telefono va su due righe e il pulsante WhatsApp ci finiva sopra; la barra
 * arancione delle pagine funzionalità non alzava niente. Se la barra è nascosta
 * (display: none, o `visibile` falso) l'alzata torna a zero.
 */
export function useAlzaChat(ref: RefObject<HTMLElement>, visibile = true) {
  useEffect(() => {
    const el = ref.current;
    const root = document.documentElement;
    if (!el) return;
    const aggiorna = () => {
      // Altezza di layout + distanza dal fondo: non dipendono dalla transizione con cui
      // la barra entra (misurando la posizione a metà animazione usciva quasi zero).
      const stile = getComputedStyle(el);
      const mostrata = visibile && stile.display !== "none";
      const alto = mostrata ? Math.ceil(el.offsetHeight + (parseFloat(stile.bottom) || 0)) + 8 : 0;
      root.style.setProperty("--eic-chat-lift", `${Math.max(0, alto)}px`);
    };
    aggiorna();
    const ro = new ResizeObserver(aggiorna);
    ro.observe(el);
    window.addEventListener("resize", aggiorna);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", aggiorna);
      root.style.setProperty("--eic-chat-lift", "0px");
    };
  }, [ref, visibile]);
}
