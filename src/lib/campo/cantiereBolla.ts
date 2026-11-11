/**
 * Il cantiere di una bolla caricata dal telefono (11/11/2026).
 *
 * Per gli operai il cantiere è obbligatorio: la bolla va su uno dei loro
 * cantieri. Per l'ufficio è facoltativo: «Nessun cantiere» manda la bolla in
 * ufficio senza commessa (`ddt_documento_accoda` accetta `p_order` nullo per chi
 * è ufficio), e la commessa si aggancia dopo.
 */

/** Valore della voce «Nessun cantiere (va in ufficio)» nel selettore. */
export const NESSUN_CANTIERE = "__nessun_cantiere__";

export interface CantiereBolla {
  /** La commessa da mandare, o null se la bolla va in ufficio senza commessa. */
  orderId: string | null;
  /** Il valore da mostrare nel selettore. */
  valore: string;
  /** Si può salvare: c'è un cantiere, oppure chi carica è ufficio. */
  pronto: boolean;
}

export function cantiereBolla(opts: {
  richiesto: string | null;
  scelta: string;
  cantieri: readonly string[];
  ufficio: boolean;
}): CantiereBolla {
  const { richiesto, scelta, cantieri, ufficio } = opts;
  if (richiesto && cantieri.includes(richiesto))
    return { orderId: richiesto, valore: richiesto, pronto: true };
  if (ufficio && scelta === NESSUN_CANTIERE)
    return { orderId: null, valore: NESSUN_CANTIERE, pronto: true };
  const id =
    (scelta !== NESSUN_CANTIERE ? scelta : "") ||
    (cantieri.length === 1 ? cantieri[0] : "");
  if (id) return { orderId: id, valore: id, pronto: true };
  return ufficio
    ? { orderId: null, valore: NESSUN_CANTIERE, pronto: true }
    : { orderId: null, valore: "", pronto: false };
}
