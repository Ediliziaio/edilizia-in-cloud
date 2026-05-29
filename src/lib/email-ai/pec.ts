/**
 * pec.ts — MP-EMAIL-AI-17 · helper PEC lato client (etichette + classificazione)
 *
 * Funzioni pure: la classificazione autorevole avviene nel trigger DB
 * (pec_classifica_su_insert). Qui ne rispecchiamo le regole per i test e per
 * etichettare in italiano i badge nella UI. Nessun I/O.
 */

export type PecTipo = "messaggio" | "accettazione" | "consegna" | "mancata_consegna";
export type PecStato = "inviata" | "accettata" | "consegnata" | "mancata";

/** Domini PEC noti (best-effort: la PEC certificata di solito contiene "pec"). */
const PROVIDER_PEC = [
  "pec.it", "legalmail.it", "postecert.it", "pec.aruba.it", "arubapec.it",
  "sicurezzapostale.it", "pec.cgn.it", "registerpec.it", " pecimprese.it",
];

export function isDominioPec(dominio: string | null | undefined): boolean {
  const d = (dominio || "").trim().toLowerCase();
  if (!d) return false;
  return d.includes("pec") || PROVIDER_PEC.some((p) => d === p.trim() || d.endsWith("." + p.trim()));
}

/**
 * Classifica un'email PEC dai segnali standard (header X-Ricevuta / prefisso oggetto).
 * Specchio del trigger DB: serve a test e a coerenza UI.
 */
export function classificaRicevutaPec(
  subject: string | null | undefined,
  headers: Record<string, string> | null | undefined,
): PecTipo {
  const subj = (subject || "").trim().toLowerCase();
  const h = headers || {};
  const xric = (h["X-Ricevuta"] ?? h["x-ricevuta"] ?? "").toLowerCase();

  if (xric === "accettazione" || subj.startsWith("accettazione:")) return "accettazione";
  if (xric === "avvenuta-consegna" || subj.startsWith("consegna:") || subj.startsWith("avvenuta consegna:")) return "consegna";
  if (
    ["errore-consegna", "preavviso-errore-consegna", "non-accettazione"].includes(xric) ||
    subj.startsWith("mancata consegna:") || subj.startsWith("errore consegna") ||
    subj.startsWith("preavviso di mancata consegna:")
  ) return "mancata_consegna";
  return "messaggio";
}

/** Stato di spedizione finale dato l'insieme dei tipi-ricevuta arrivati. */
export function statoDaRicevute(tipi: PecTipo[]): PecStato {
  if (tipi.includes("mancata_consegna")) return "mancata";
  if (tipi.includes("consegna")) return "consegnata";
  if (tipi.includes("accettazione")) return "accettata";
  return "inviata";
}

export function etichettaPecTipo(tipo: string | null | undefined): string {
  switch (tipo) {
    case "accettazione": return "Ricevuta di accettazione";
    case "consegna": return "Ricevuta di consegna";
    case "mancata_consegna": return "Mancata consegna";
    case "messaggio": return "Messaggio PEC";
    default: return "PEC";
  }
}

export function etichettaPecStato(stato: string | null | undefined): string {
  switch (stato) {
    case "inviata": return "Inviata";
    case "accettata": return "Accettata";
    case "consegnata": return "Consegnata";
    case "mancata": return "Mancata consegna";
    default: return "—";
  }
}

/** La mancata consegna è l'unico stato che merita un alert all'utente. */
export function pecRichiedeAlert(stato: string | null | undefined): boolean {
  return stato === "mancata";
}
