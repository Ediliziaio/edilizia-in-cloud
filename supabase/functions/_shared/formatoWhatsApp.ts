/**
 * Testi per WhatsApp (27/09/2026).
 *
 * I modelli scrivono in Markdown da web: **grassetto**, # titoli, [testo](link).
 * Su WhatsApp il grassetto è UN asterisco, i titoli non esistono e i link si
 * scrivono per intero: senza conversione gli asterischi doppi restano a vista
 * (primo messaggio vero del bot operativo al titolare di Demo Azienda 2).
 */

/** Converte il Markdown del modello nella formattazione di WhatsApp. */
export function formatoWhatsApp(testo: string): string {
  return testo
    // Titoli «# …»: una riga in grassetto WhatsApp (senza eventuali ** dentro).
    .replace(/^#{1,6}[ \t]+(.+?)[ \t]*$/gm, (_m, t: string) => `*${t.replace(/\*+/g, "").trim()}*`)
    // **grassetto** e __corsivo__ del Markdown → *grassetto* e _corsivo_.
    .replace(/\*\*([^*\n]+?)\*\*/g, "*$1*")
    .replace(/__([^_\n]+?)__/g, "_$1_")
    // [testo](https://…) → «testo: https://…» (WhatsApp mostra il link intero).
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1: $2")
    // Asterischi doppi rimasti spaiati.
    .replace(/\*\*/g, "")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * La riga con data e ora da dare al modello: senza, «questo mese» o
 * «prossime due settimane» non hanno un punto di partenza.
 */
export function adessoPerIlPrompt(adesso: Date): string {
  const giorno = new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(adesso);
  const ora = new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(adesso);
  return `OGGI: ${giorno}, ore ${ora} (ora italiana).`;
}
