// Chi scrive al bot operativo e con quali poteri (27/09/2026).
//
// Il bot riconosceva come amministratori solo ruoli che non esistono
// (titolare, admin, proprietario): un amministratore vero (company_admin)
// non passava mai. La regola sta qui, senza database, così si prova.

export type TipoUtenteBot = "operaio" | "ufficio" | "admin";

/** Chi amministra l'azienda: può tutto, come nell'app. */
const RUOLI_ADMIN = ["super_admin", "company_admin"];
/** Chi lavora in ufficio: quello che i suoi permessi gli lasciano. */
const RUOLI_UFFICIO = ["accountant", "salesperson", "call_center", "company_staff"];
/** Chi lavora per l'azienda (gli altri, clienti e segnalatori, non usano il bot operativo). */
const RUOLI_INTERNI = [...RUOLI_ADMIN, ...RUOLI_UFFICIO, "employee", "subcontractor", "worker"];

/**
 * Le ultime 9 cifre: +39 348 346 7567, 00393483467567 e 348 3467567 danno
 * la stessa chiave. È la regola della finestra delle 24 ore (whatsappWindow.ts).
 * Sotto le 9 cifre non è un cellulare: chiave vuota, non combacia con niente.
 */
export function chiaveTelefono(telefono: string | null | undefined): string {
  const cifre = String(telefono ?? "").replace(/\D/g, "");
  return cifre.length >= 9 ? cifre.slice(-9) : "";
}

export function stessoTelefono(a: string | null | undefined, b: string | null | undefined): boolean {
  const chiave = chiaveTelefono(a);
  return chiave !== "" && chiave === chiaveTelefono(b);
}

export function eUtenteInterno(ruoli: readonly string[]): boolean {
  return ruoli.some((r) => RUOLI_INTERNI.includes(r));
}

/**
 * Il tipo di utente per il bot. Senza account nell'app si resta operaio:
 * gli strumenti d'ufficio agiscono a nome di un utente e dei suoi permessi.
 */
export function tipoUtenteBot(ruoliNellAzienda: readonly string[], haAccount: boolean): TipoUtenteBot {
  if (!haAccount) return "operaio";
  if (ruoliNellAzienda.some((r) => RUOLI_ADMIN.includes(r))) return "admin";
  if (ruoliNellAzienda.some((r) => RUOLI_UFFICIO.includes(r))) return "ufficio";
  return "operaio";
}
