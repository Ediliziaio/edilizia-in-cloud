/** Le voci d'ordine sono stime unitarie: un costo mancante resta sconosciuto. */
export function margineVoce(item: {
  quantity: number | null;
  unit_price: number | null;
  purchase_price: number | null;
  standard_cost: number | null;
}) {
  const numero = (value: number | null) => value !== null && Number.isFinite(Number(value)) ? Number(value) : null;
  const quantity = numero(item.quantity);
  const prezzo = numero(item.unit_price);
  const costoUnitario = numero(item.purchase_price) ?? numero(item.standard_cost);
  const ricavo = quantity !== null && prezzo !== null ? quantity * prezzo : null;
  const costo = quantity !== null && costoUnitario !== null ? quantity * costoUnitario : null;
  const margine = ricavo !== null && costo !== null ? ricavo - costo : null;
  const percentuale = margine !== null && ricavo !== null && ricavo > 0 ? margine / ricavo * 100 : null;
  return { ricavo, costo, margineVoce: margine, margineVocePerc: percentuale };
}
