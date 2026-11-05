/**
 * Si annulla da qui solo l'incasso registrato dallo scadenzario. La scadenza di una fattura
 * interna ([DOC:…]) si incassa e si annulla dalla fattura. Le stesse regole, e quelle che dal
 * browser non si vedono (un bonifico agganciato), le controlla annulla_incasso_scadenza.
 */
export function siAnnullaIncasso(s: {
  direction: string;
  status: string;
  prima_nota_entry_id: string | null;
  cost_id: string | null;
  notes: string | null;
}): boolean {
  return s.direction === "entrata"
    && (s.status === "pagata" || s.status === "parziale")
    && !!s.prima_nota_entry_id
    && !s.cost_id
    && !(s.notes ?? "").includes("[DOC:");
}
