/**
 * silvio-canali-logic.ts — MP-SILVIO-07 · logica pura multicanale (Deno mirror)
 * Specchio FEDELE di src/lib/silvio/canali.ts. Nessun I/O. Tieni i due allineati:
 * il test di parità in src/lib/silvio/__tests__/canali.test.ts li confronta.
 */

export type Canale = "web" | "email" | "whatsapp" | "voce";
export type CategoriaRischio = "interno" | "esterno" | "denaro";
export type ForzaConferma = "piena" | "forte" | "media" | "rimanda_app";

/** I canali esterni (auth debole) richiedono identità verificata prima di agire. */
export function richiedeIdentitaVerificata(canale: Canale): boolean {
  return canale === "whatsapp" || canale === "voce";
}

/** Forza di conferma richiesta per approvare un'azione 'conferma' su un canale. */
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

export const SOGLIA_CONFIDENZA_CANALE = 0.75;
export function richiedeRiformulazione(confidenza: number | null | undefined): boolean {
  return typeof confidenza !== "number" || confidenza < SOGLIA_CONFIDENZA_CANALE;
}

/** Messaggio di ritorno per un canale dopo l'orchestratore (vedi canali.ts). */
export function messaggioEsito(inviati: number, inCoda: number, ok: boolean): string {
  if (!ok) return "Non sono sicuro di aver capito. Puoi riformulare in modo più semplice?";
  const parti: string[] = [];
  if (inviati > 0) parti.push(`Ho fatto ${inviati} ${inviati === 1 ? "cosa" : "cose"}`);
  if (inCoda > 0) parti.push(`${inCoda} ${inCoda === 1 ? "azione è" : "azioni sono"} da confermare in app`);
  if (parti.length === 0) return "Ok, non serviva fare nulla.";
  return parti.join(" · ") + ".";
}
