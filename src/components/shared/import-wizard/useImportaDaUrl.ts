import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * La pagina di ogni oggetto, che conosce i suoi campi personalizzati e sa importarlo.
 * Relativa al CRM in cui si è: da /admin/marketing non si deve finire su /azienda,
 * cioè nell'azienda impersonata invece che nel CRM di piattaforma.
 */
export const PAGINA_IMPORTAZIONE = {
  contacts: "contatti?importa=1",
  opportunities: "opportunita?importa=1",
} as const;

/**
 * Apre l'importazione se si arriva con ?importa=1, una volta sola: quando i permessi
 * sono letti, e toglie il parametro dall'indirizzo. Senza permesso non si apre.
 */
export function useImportaDaUrl(pronto: boolean, puoImportare: boolean, apri: () => void) {
  const [params, setParams] = useSearchParams();
  const richiesto = params.get("importa") === "1";
  useEffect(() => {
    if (!richiesto || !pronto) return;
    if (puoImportare) apri();
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("importa");
      return next;
    }, { replace: true });
  }, [richiesto, pronto, puoImportare, apri, setParams]);
}
