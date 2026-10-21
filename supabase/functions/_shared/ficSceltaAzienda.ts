// Quale azienda di Fatture in Cloud collegare (21/10/2026).
//
// Un account Fatture in Cloud può gestire più aziende: il commercialista, o chi
// ha chiuso una società e ne ha aperta un'altra con lo stesso login. Prima si
// prendeva sempre la prima dell'elenco, e un'impresa si è trovata importate le
// fatture della società vecchia. Ora: se ce n'è una sola si prende quella; se
// sono più di una si prende quella con la stessa partita IVA (o codice fiscale)
// dell'azienda in EdiliziaInCloud; se nessuna corrisponde, sceglie chi collega.

export type AziendaFic = { id: number | string; name?: string | null; vat_number?: string | null; tax_code?: string | null };

const norm = (v?: string | null) =>
  (v ?? "").replace(/[^0-9A-Za-z]/g, "").toUpperCase().replace(/^IT(?=\d{11}$)/, "") || null;

export function scegliAziendaFic(
  aziende: AziendaFic[],
  nostriCodici: Array<string | null | undefined>,
): { azienda: AziendaFic } | { daScegliere: AziendaFic[] } | { nessuna: true } {
  const valide = aziende.filter((a) => a && a.id != null);
  if (valide.length === 0) return { nessuna: true };
  if (valide.length === 1) return { azienda: valide[0] };
  const nostri = new Set(nostriCodici.map(norm).filter((x): x is string => !!x));
  const uguali = valide.filter((a) => nostri.has(norm(a.vat_number) ?? "") || nostri.has(norm(a.tax_code) ?? ""));
  if (uguali.length === 1) return { azienda: uguali[0] };
  return { daScegliere: valide };
}
