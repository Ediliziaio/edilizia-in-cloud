/**
 * Quali campi scrivere quando si MODIFICA un componente FV.
 *
 * Il salvataggio costruiva sempre il payload completo, con `?? null` sui campi
 * non passati. In modifica questo cancellava tutto ciò che la schermata
 * "Componenti FV" non gestisce: salvare il prezzo di vendita di un inverter
 * metteva a null il suo prezzo di acquisto (e garanzia, efficienza, unità di
 * misura). Qui si tengono solo i campi che il chiamante ha passato davvero.
 *
 * `company_id` e `attivo` restano sempre: il primo fa da recinto, il secondo è
 * il comportamento storico (modificare un componente lo riattiva).
 */
const SEMPRE = new Set(["company_id", "attivo"]);

export function campiDaAggiornare<T extends Record<string, unknown>>(
  payload: T,
  passati: Record<string, unknown>,
): Partial<T> {
  return Object.fromEntries(
    Object.entries(payload).filter(([campo]) => SEMPRE.has(campo) || passati[campo] !== undefined),
  ) as Partial<T>;
}
