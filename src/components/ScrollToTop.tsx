import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

export default function ScrollToTop() {
  const { pathname } = useLocation();
  // Solo quando si cambia pagina, non al primo montaggio: all'apertura la
  // posizione la decide il browser (un link con #ancora, il ritorno indietro),
  // e chi ha già scorso la pagina preparata dal prerender non va riportato in
  // cima quando React finisce di montare.
  const primoMontaggio = useRef(true);
  useEffect(() => {
    if (primoMontaggio.current) {
      primoMontaggio.current = false;
      return;
    }
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}
