import React from "react";

/** Riordina le celle insieme alle intestazioni, lasciando fuori selezione e azioni. */
export function ordinaElementiTabella(elemento: React.ReactElement<{ children?: React.ReactNode }>, ordine?: string[]) {
  const figli = React.Children.toArray(elemento.props.children);
  if (!ordine) return figli;
  const posizione = new Map(ordine.map((chiave, indice) => [chiave, indice]));
  const chiave = (nodo: React.ReactNode) => React.isValidElement(nodo) ? String(nodo.key ?? "").replace(/^\.\$/, "") : "";
  return figli.sort((a, b) => (posizione.get(chiave(a)) ?? Number.MAX_SAFE_INTEGER) - (posizione.get(chiave(b)) ?? Number.MAX_SAFE_INTEGER));
}
