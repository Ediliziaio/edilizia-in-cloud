/**
 * Il contatto nuovo creato da un messaggio WhatsApp (24/09/2026).
 *
 * marketing_contacts.first_name è obbligatorio, e il webhook creava il
 * contatto senza: il database rifiutava l'inserimento e il messaggio restava
 * senza contatto (per i numeri «lead» e «assistenza» non veniva nemmeno
 * salvato). Il nome è quello del profilo WhatsApp del cliente, se c'è.
 *
 * Nessun import: lo leggono sia Deno sia i test.
 */

export const NOME_SENZA_PROFILO = "Contatto WhatsApp";

/** Nome e cognome dal nome del profilo WhatsApp («Mario Rossi»). */
export function nomeDalProfilo(profilo: unknown): { nome: string; cognome: string | null } {
  const testo = typeof profilo === "string" ? profilo.replace(/\s+/g, " ").trim() : "";
  // Senza profilo il router mette il numero al posto del nome.
  if (!/\p{L}/u.test(testo)) return { nome: NOME_SENZA_PROFILO, cognome: null };
  const [nome, ...resto] = testo.split(" ");
  return {
    nome: nome.slice(0, 100),
    cognome: resto.length ? resto.join(" ").slice(0, 100) : null,
  };
}
