/**
 * Il messaggio che resta sul computo quando la lettura fallisce.
 *
 * Negli ultimi 120 giorni (controllo del 07/11/2026) 5 computi su 22 si sono
 * fermati su «Registra una carta di pagamento aziendale», e uno sul credito AI
 * della piattaforma finito. Il messaggio diceva solo di registrare la carta. Ma
 * il file PriMus (XPWE) e l'Excel con l'intestazione delle colonne si leggono
 * senza AI e senza carta: chi ha quel file può importare il computo subito.
 * Qui si aggiunge l'indicazione; non si regala la lettura AI.
 */
// Ferma l'azienda: niente carta, o crediti AI dell'azienda finiti.
const FERMO_AZIENDA = /carta di pagamento|crediti ai dell.azienda sono insufficienti/i;
// Ferma la piattaforma: il credito OpenRouter è finito (402).
const CREDITO_PIATTAFORMA = /openrouter 402|insufficient credits|in balance for/i;

export const SENZA_AI =
  "Intanto puoi caricare il file PriMus (XPWE) o l'Excel del computo: si leggono senza AI.";

export function messaggioErroreLettura(errore: string, tipoFile: string): string {
  const base = `Extraction error: ${errore}`;
  // PriMus ed Excel non passano dall'AI: il consiglio vale solo per PDF e foto.
  if (tipoFile === "xpwe" || tipoFile === "dcf" || tipoFile === "xlsx" || tipoFile === "xls") return base;
  if (FERMO_AZIENDA.test(errore)) return `${base} ${SENZA_AI}`;
  if (CREDITO_PIATTAFORMA.test(errore)) {
    return `Extraction error: la lettura con l'AI è momentaneamente ferma (credito AI della piattaforma). Riprova più tardi. ${SENZA_AI}`;
  }
  return base;
}
