/**
 * Art. 101 comma 3 del D.Lgs 81/2008: l'impresa esecutrice consegna il POS all'affidataria, che lo verifica e lo
 * trasmette al CSE; con una verifica negativa i lavori non possono iniziare, anche se nell'app il POS risulta
 * approvato (l'approvazione dell'app è del datore di lavoro, non sostituisce l'esito di chi verifica).
 * Conta solo la verifica che si applica: quella dell'affidataria in subappalto, quella del CSE con il PSC.
 */
export function verificaIterNegativa(
  contenuto: { impresa?: { ruolo?: string | null } | null; procedure_psc?: { psc_presente?: boolean | null } | null } | null | undefined,
  iter: { affidataria_esito?: string | null; cse_esito?: string | null } | null | undefined,
): boolean {
  if (!iter) return false;
  const inSubappalto = contenuto?.impresa?.ruolo === "esecutrice_subappalto";
  const conCse = contenuto?.procedure_psc?.psc_presente === true;
  return (inSubappalto && iter.affidataria_esito === "negativo") || (conCse && iter.cse_esito === "negativo");
}
