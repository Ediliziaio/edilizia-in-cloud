/**
 * Porta a una sezione di una pagina di impostazioni e la evidenzia per un attimo.
 *
 * Legge l'àncora dall'indirizzo (`…/margini#prezzo`), così funziona anche arrivando da un altro schermo: la
 * ricerca delle impostazioni, il rimando dal preventivatore. `pronto` = i dati sono caricati e le sezioni sono
 * davvero nella pagina (prima non c'è niente a cui scorrere).
 */
import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const DURATA_EVIDENZIA_MS = 2500;

function idDaAncora(hash: string): string | null {
  if (!hash || hash === "#") return null;
  const grezzo = hash.slice(1);
  try { return decodeURIComponent(grezzo); } catch { return grezzo; } // àncora scritta male: si cerca com'è
}

export function useVaiASezione(pronto: boolean) {
  const { hash } = useLocation();
  const navigate = useNavigate();
  // Ogni «giro» è uno scorrimento: serve a ripeterlo quando si tocca la voce dell'indice già nell'indirizzo.
  const [giro, setGiro] = useState(0);
  const [spenta, setSpenta] = useState<string | null>(null);

  const id = pronto ? idDaAncora(hash) : null;
  const chiave = id ? `${id}:${giro}` : null;
  const evidenziata = chiave && spenta !== chiave ? id : null;

  useEffect(() => {
    if (!id || !chiave) return;
    const ridotto = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(id)?.scrollIntoView?.({ block: "start", behavior: ridotto ? "auto" : "smooth" });
    const spegni = window.setTimeout(() => setSpenta(chiave), DURATA_EVIDENZIA_MS);
    return () => window.clearTimeout(spegni);
  }, [id, chiave]);

  const vai = useCallback(
    (sezione: string) => {
      if (hash === `#${sezione}`) setGiro((g) => g + 1);
      else navigate({ hash: sezione }, { replace: true });
    },
    [hash, navigate],
  );

  return { evidenziata, vai };
}
