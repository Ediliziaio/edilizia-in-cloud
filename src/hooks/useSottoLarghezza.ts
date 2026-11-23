/**
 * «Quanto è larga la finestra» — una regola sola per tutta l'app (23/11/2026).
 *
 * `window.innerWidth` vale 0 finché la finestra non è stata misurata: scheda
 * aperta in secondo piano, finestra che si sta aprendo, pagina ripresa dalla
 * cache del browser, pannello ancora nascosto. Zero NON vuol dire «telefono»:
 * vuol dire «non lo so ancora». Chi lo leggeva come una larghezza vera faceva
 * partire la pagina in versione stretta per poi rifarla in versione computer
 * appena la misura arrivava — il lampo di «prima la schermata vecchia, poi
 * quella nuova» visto in Fatture ricevute e nella barra laterale.
 *
 * Perciò: finché la larghezza non si sa si risponde «computer», e ci si
 * corregge appena arriva. Serve ascoltare ANCHE il resize: se si parte da 0, il
 * media query non cambia stato quando arriva la larghezza vera di un telefono
 * (era «sotto 768» e resta «sotto 768»), e si resterebbe su computer per sempre.
 */
import * as React from "react";

/** La larghezza della finestra, o null se non la si conosce ancora. */
export function larghezzaFinestra(): number | null {
  if (typeof window === "undefined") return null;
  const w = window.innerWidth || window.visualViewport?.width || 0;
  return w > 0 ? w : null;
}

/** Vero se la finestra è più stretta di `px`. Larghezza ignota = computer, non telefono. */
export function sottoLarghezza(px: number): boolean {
  const w = larghezzaFinestra();
  return w === null ? false : w < px;
}

/** Come `sottoLarghezza`, ma si aggiorna quando la finestra cambia (o quando la si misura). */
export function useSottoLarghezza(px: number | undefined): boolean {
  const [sotto, setSotto] = React.useState<boolean>(() => (px === undefined ? false : sottoLarghezza(px)));

  React.useEffect(() => {
    if (px === undefined) {
      setSotto(false);
      return;
    }
    const aggiorna = () => setSotto(sottoLarghezza(px));
    const mql = window.matchMedia(`(max-width: ${px - 1}px)`);
    // Compatibilità Safari < 14: addListener come fallback.
    if (mql.addEventListener) mql.addEventListener("change", aggiorna);
    else if (mql.addListener) mql.addListener(aggiorna);
    window.addEventListener("resize", aggiorna);
    aggiorna();
    return () => {
      if (mql.removeEventListener) mql.removeEventListener("change", aggiorna);
      else if (mql.removeListener) mql.removeListener(aggiorna);
      window.removeEventListener("resize", aggiorna);
    };
  }, [px]);

  return sotto;
}
