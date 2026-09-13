/**
 * Un punto solo che riconosce "hai finito i crediti" in qualunque risposta
 * del server e apre la finestra di ricarica.
 *
 * Ogni strumento a consumo lo dice a modo suo: WhatsApp e i render rispondono
 * 402 con { error: "insufficient_credits" }; le funzioni che passano dal
 * router AI rispondono 500/502 con "Credito insufficiente o bloccato" dentro
 * il messaggio; le email 402 con "Crediti email insufficienti"; Silvio 200 con
 * { ok: false, error: "credito_esaurito" }; le RPC del portafoglio sollevano
 * "Crediti insufficienti: saldo …". Prima ognuno finiva in un toast diverso,
 * o in un "Errore interno" che non diceva cosa fare. Qui la forma non conta:
 * si riconosce il segnale e si apre sempre lo stesso dialog di ricarica
 * (PaymentGateDialog, modalita' "credits").
 */
import {
  usePaymentGateStore,
  type DettaglioCreditoEsaurito,
  type PaymentGateKind,
  type PortafoglioEsaurito,
} from "@/store/paymentGateStore";

export type { DettaglioCreditoEsaurito, PortafoglioEsaurito };

/** Codici macchina con cui le funzioni dichiarano il credito finito. */
const CODICI_CREDITO = new Set([
  "insufficient_credits",
  "credito_esaurito",
  "insufficient_balance",
  "credits_exhausted",
  "wallet_missing",
]);

/** Codice del gate "carta obbligatoria" (requirePaymentMethod.ts). */
const CODICE_CARTA = "payment_method_required";

/**
 * Le frasi con cui il server dice che il credito e' finito, in italiano e in
 * inglese: "Credito insufficiente o bloccato", "Crediti email insufficienti",
 * "Crediti insufficienti: saldo 0 EUR", "credito esaurito", "Insufficient
 * credits", "Saldo €0.00 insufficiente". Il pezzo fra le due parole e' corto
 * di proposito: "credito" e "insufficiente" a trenta parole di distanza non
 * parlano della stessa cosa.
 */
const TESTO_CREDITO =
  /\bcredit[oi]\b[^.;\n]{0,40}?\b(?:insufficient[ei]|esaurit[oi])\b|\binsufficient[ _]credits?\b|\bsaldo\b[^.;\n]{0,30}?\b(?:insufficiente|esaurito)\b/i;

/** Raccoglie le stringhe di una risposta (due livelli bastano: { error: { code, message } }). */
function stringheDi(corpo: unknown, profondita = 0, raccolte: string[] = []): string[] {
  if (raccolte.length >= 40) return raccolte;
  if (typeof corpo === "string") {
    raccolte.push(corpo);
  } else if (corpo && typeof corpo === "object" && profondita < 2) {
    for (const valore of Object.values(corpo as Record<string, unknown>)) {
      stringheDi(valore, profondita + 1, raccolte);
    }
  }
  return raccolte;
}

/**
 * Dice se una risposta del server e' un blocco per crediti finiti ("credits"),
 * per carta o abbonamento mancante ("payment"), o nessuno dei due (null).
 * Il 402 senza altro indizio resta "payment": e' il contratto storico del gate.
 */
export function classificaBloccoPagamento(status: number, corpo: unknown): PaymentGateKind | null {
  const stringhe = stringheDi(corpo);
  if (stringhe.some((s) => s.trim().toLowerCase() === CODICE_CARTA)) return "payment";
  if (stringhe.some((s) => CODICI_CREDITO.has(s.trim().toLowerCase()) || TESTO_CREDITO.test(s))) {
    return "credits";
  }
  return status === 402 ? "payment" : null;
}

/** Quale borsellino, a leggere codici e frasi della risposta. */
function portafoglioDi(stringhe: string[], corpo: Record<string, unknown>): PortafoglioEsaurito | undefined {
  const dichiarato = [corpo.wallet, corpo.wallet_type, corpo.credit_type, corpo.service]
    .find((v): v is string => typeof v === "string")
    ?.toLowerCase();
  if (dichiarato === "ai_agents") return "ai";
  if (dichiarato && ["ai", "email", "whatsapp", "render", "sms"].includes(dichiarato)) {
    return dichiarato as PortafoglioEsaurito;
  }
  const testo = stringhe.join(" ");
  if (/\brender\b/i.test(testo)) return "render";
  if (/\bwhatsapp\b/i.test(testo)) return "whatsapp";
  if (/\bsms\b/i.test(testo)) return "sms";
  if (/\be-?mail\b/i.test(testo)) return "email";
  if (/\bai\b|\bchiamat[ae]\b|\bsilvio\b/i.test(testo)) return "ai";
  return undefined;
}

/** Saldo residuo, se la risposta lo riporta con uno dei nomi in uso. */
function saldoDi(corpo: Record<string, unknown>): number | undefined {
  for (const chiave of ["balance_eur", "balance_before", "saldo_eur", "saldo", "spendibile", "balance"]) {
    const v = corpo[chiave];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  }
  return undefined;
}

/** Il messaggio leggibile, preferendo quelli scritti per l'utente. */
function messaggioDi(corpo: Record<string, unknown>): string | undefined {
  for (const chiave of ["user_message", "user_message_it", "messaggio", "message"]) {
    const v = corpo[chiave];
    if (typeof v === "string" && v.trim() !== "" && !CODICI_CREDITO.has(v.trim().toLowerCase())) return v.trim();
  }
  const errore = corpo.error;
  if (typeof errore === "string" && !CODICI_CREDITO.has(errore.trim().toLowerCase())) return errore.trim();
  if (errore && typeof errore === "object") return messaggioDi(errore as Record<string, unknown>);
  return undefined;
}

/** Estrae dalla risposta quel poco che serve al dialog: borsellino, frase, saldo. */
export function estraiDettaglioCredito(corpo: unknown): DettaglioCreditoEsaurito {
  if (!corpo || typeof corpo !== "object") return {};
  const oggetto = corpo as Record<string, unknown>;
  const stringhe = stringheDi(corpo);
  const dettaglio: DettaglioCreditoEsaurito = {};
  const portafoglio = portafoglioDi(stringhe, oggetto);
  if (portafoglio) dettaglio.portafoglio = portafoglio;
  const messaggio = messaggioDi(oggetto);
  if (messaggio) dettaglio.messaggio = messaggio;
  const saldo = saldoDi(oggetto);
  if (saldo !== undefined) dettaglio.saldoEur = saldo;
  return dettaglio;
}

/** Apre il dialog "Crediti esauriti" con la ricarica. Da usare dove il server risponde 200 con ok:false. */
export function segnalaCreditoEsaurito(dettaglio: DettaglioCreditoEsaurito = {}): void {
  usePaymentGateStore.getState().show("credits", dettaglio);
}

/**
 * Guarda una risposta d'errore del server e, se e' un blocco per crediti o
 * carta, apre il dialog giusto. Ritorna cosa ha riconosciuto (o null).
 */
export function segnalaBloccoDaRisposta(status: number, corpo: unknown): PaymentGateKind | null {
  const kind = classificaBloccoPagamento(status, corpo);
  if (kind === null) return null;
  usePaymentGateStore.getState().show(kind, kind === "credits" ? estraiDettaglioCredito(corpo) : null);
  return kind;
}
