import { messaggioErrore } from "./messaggioErrore";

/** Il testo da mostrare quando un'approvazione di rapportino non va a buon fine. */
export function messaggioApprovazione(error: unknown): string {
  return messaggioErrore(error, "Errore durante l'approvazione");
}
