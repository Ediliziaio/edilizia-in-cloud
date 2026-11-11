/**
 * I passaggi della firma, per dirli a chi firma prima che li incontri (31/10/2026).
 *
 * Un cliente di Dimora ha inserito il codice e si è fermato: dopo il codice c'erano ancora
 * recesso, clausole e «Accetto e firmo», che la pagina non annunciava (diceva «due passaggi,
 * un minuto»), e dopo 15 minuti la sessione è scaduta senza che nessuno lo vedesse.
 */
import type { FEASessionePubblica } from "@/types/fea";

export type PassoFirma = "codice" | "identificazione";

export const ETICHETTA_PASSO: Record<PassoFirma, string> = {
  codice: "Codice",
  identificazione: "Identità",
};

type SessioneMinima = Pick<FEASessionePubblica, "identificazione_richiesta" | "dichiarazione_richiesta" | "dichiarazione_fea">;

/**
 * I passaggi dopo il consenso. Dall'11/11/2026 recesso, clausole e privacy si accettano con un'unica spunta
 * prima del codice, e col codice giusto il documento è firmato: resta solo l'identità della firma avanzata.
 */
export function passiFirma(s: Partial<SessioneMinima> | null | undefined): PassoFirma[] {
  const passi: PassoFirma[] = ["codice"];
  if ((s?.identificazione_richiesta || s?.dichiarazione_richiesta) && s?.dichiarazione_fea) passi.push("identificazione");
  return passi;
}
