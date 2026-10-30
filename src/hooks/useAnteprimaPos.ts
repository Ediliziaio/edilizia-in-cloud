import { useRef, useState } from "react";
import { toast } from "sonner";
import { apriAnteprimaPos } from "@/lib/sicurezza/apriPdfPos";
import { ErroreAnnullato, type FasePdf } from "@/lib/sicurezza/posPdfBrowser";

/**
 * L'anteprima PDF del POS dall'editor: `inCorso` e `fase` per l'avanzamento, `annulla` per fermarla mentre si prepara o si
 * disegna. Un errore vero si mostra con il suo messaggio; un annullamento no, perché l'ha voluto l'utente.
 */
export function useAnteprimaPos() {
  const [fase, setFase] = useState<FasePdf | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const controllo = useRef<AbortController | null>(null);
  async function apri(companyId: string, posId: string) {
    const c = new AbortController();
    controllo.current = c;
    setInCorso(true);
    try {
      await apriAnteprimaPos(companyId, posId, { segnale: c.signal, onFase: setFase });
    } catch (e) {
      if (!(e instanceof ErroreAnnullato)) toast.error(e instanceof Error && e.message ? e.message : "Anteprima non disponibile");
    } finally {
      controllo.current = null;
      setFase(null);
      setInCorso(false);
    }
  }
  return { apri, inCorso, fase, annulla: () => controllo.current?.abort() };
}
