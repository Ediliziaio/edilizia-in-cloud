/** Una segnalazione dal cantiere è una frase: il titolo sono le sue prime parole, il resto va nella descrizione. */
export const MASSIMO_FOTO_SEGNALAZIONE = 3;
const LUNGHEZZA_TITOLO = 60;

export function segnalazioneDaTesto(testo: string, urgente: boolean) {
  const pulito = testo.trim().replace(/\s+/g, " ");
  if (!pulito) return null;
  const titolo = pulito.length <= LUNGHEZZA_TITOLO
    ? pulito
    : `${pulito.slice(0, LUNGHEZZA_TITOLO).replace(/\s+\S*$/, "")}…`;
  return {
    titolo,
    descrizione: pulito.length <= LUNGHEZZA_TITOLO ? null : testo.trim(),
    // `tickets` ha due colonne: `priority` (enum, la legge l'ufficio) e `priorita` (testo, vecchia).
    priorita: urgente ? "alta" : "media",
    priority: urgente ? "alta" as const : "normale" as const,
  };
}
