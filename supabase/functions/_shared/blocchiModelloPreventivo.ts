/**
 * Il modello «offerta» del preventivo e i blocchi della libreria collegati
 * (copertina, condizioni, legali, sezioni, schede prodotto) — 25/09/2026.
 *
 * Ogni blocco ha nell'editor la sua palette («Colori della copertina: titolo,
 * sottotitolo, accent overlay», «Colori del blocco: heading sezioni…»), ma il
 * PDF e le anteprime usavano solo i colori del modello principale: Ener Italia
 * ha messo la copertina verde e il PDF è uscito blu. Qui la regola unica: il
 * colore di un blocco vale nella sua parte di documento se è stato scelto;
 * se è rimasto quello di fabbrica, vale quello del modello (come prima).
 *
 * E i contatti dell'impresa nel preventivo: il PDF stampava la mail del
 * profilo aziendale, che per Ener era quella di un consulente. Nel modello
 * si scrivono mail e telefono da mostrare; vuoti = quelli del profilo.
 *
 * Lo leggono la funzione generate-quote-pdf e le anteprime dell'app.
 */
import { normalizzaHex } from "./temaColori.ts";

/** I colori con cui nasce un modello: chi non ha scelto, ha questi. */
export const COLORE_PRIMARIO_DI_FABBRICA = "#1E40AF";
export const COLORE_ACCENTO_DI_FABBRICA = "#DBEAFE";

/**
 * Il colore scelto nel blocco, in «#RRGGBB»; null se manca, non è un colore
 * o è quello di fabbrica — allora vale quello del modello principale.
 */
export function coloreDelBlocco(
  colore: unknown,
  diFabbrica: string = COLORE_PRIMARIO_DI_FABBRICA,
): string | null {
  const hex = normalizzaHex(colore);
  if (!hex || hex === normalizzaHex(diFabbrica)) return null;
  return hex;
}

/** Il fondo della copertina: quello della copertina collegata, se scelto; se no quello del modello. */
export function coloreCopertina(
  modelloPrincipale: unknown,
  copertinaCollegata: { primary_color?: unknown } | null | undefined,
): string {
  return coloreDelBlocco(copertinaCollegata?.primary_color)
    ?? normalizzaHex(modelloPrincipale)
    ?? COLORE_PRIMARIO_DI_FABBRICA;
}

/** Mail e telefono dell'impresa stampati nel preventivo: quelli scritti nel modello, se ci sono. */
export function contattiImpresa(
  modello: { email_impresa?: unknown; telefono_impresa?: unknown } | null | undefined,
  profilo: { email?: unknown; phone?: unknown } | null | undefined,
): { email: string | null; phone: string | null } {
  const testo = (valore: unknown): string | null => {
    const pulito = typeof valore === "string" ? valore.trim() : "";
    return pulito || null;
  };
  return {
    email: testo(modello?.email_impresa) ?? testo(profilo?.email),
    phone: testo(modello?.telefono_impresa) ?? testo(profilo?.phone),
  };
}
