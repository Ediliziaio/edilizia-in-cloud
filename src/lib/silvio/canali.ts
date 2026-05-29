/**
 * canali.ts — MP-SILVIO-07 · logica pura multicanale (sicurezza, no I/O)
 * Le regole non cambiano col canale; cambia solo la FORZA della conferma:
 * più il canale è debole nell'identità, più forte deve essere la conferma per
 * denaro/esterno — e in dubbio si rimanda all'app (dove l'identità è certa).
 */

export type Canale = "web" | "email" | "whatsapp" | "voce";
export type CategoriaRischio = "interno" | "esterno" | "denaro";
export type ForzaConferma = "piena" | "forte" | "media" | "rimanda_app";

/** I canali esterni (auth debole) richiedono identità verificata prima di agire. */
export function richiedeIdentitaVerificata(canale: Canale): boolean {
  return canale === "whatsapp" || canale === "voce";
}

/**
 * Forza di conferma richiesta per approvare un'azione 'conferma' su un canale.
 * - web/email: identità certa → conferma piena (pulsante in app).
 * - whatsapp: interno → forte (bottoni / "CONFERMA <codice>"); denaro/esterno → rimanda_app.
 * - voce: interno → media (ripetizione + parola); esterno → forte; denaro → rimanda_app.
 */
export function forzaConferma(canale: Canale, rischio: CategoriaRischio): ForzaConferma {
  if (canale === "web" || canale === "email") return "piena";
  if (canale === "whatsapp") {
    if (rischio === "denaro" || rischio === "esterno") return "rimanda_app";
    return "forte";
  }
  // voce
  if (rischio === "denaro") return "rimanda_app";
  if (rischio === "esterno") return "forte";
  return "media";
}

/** Vero se l'azione può essere approvata sul canale; falso → rimanda all'app. */
export function approvabileSuCanale(canale: Canale, rischio: CategoriaRischio): boolean {
  return forzaConferma(canale, rischio) !== "rimanda_app";
}

/**
 * Su interpretazione incerta (voce trascritta, messaggio ambiguo) Silvio NON agisce:
 * riformula e chiede conferma. Sopra soglia di confidenza può procedere col flusso normale.
 */
export const SOGLIA_CONFIDENZA_CANALE = 0.75;
export function richiedeRiformulazione(confidenza: number | null | undefined): boolean {
  return typeof confidenza !== "number" || confidenza < SOGLIA_CONFIDENZA_CANALE;
}
