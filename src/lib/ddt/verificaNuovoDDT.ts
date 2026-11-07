/** Controlli del riepilogo prima di creare la bolla o i suoi movimenti. */
export function erroreVerificaDDT({
  data,
  stato,
  quantita,
  righe,
  haDocumento,
}: {
  data: string;
  stato: string;
  quantita: string;
  righe: Array<{ descrizione: string; quantita?: number | null }>;
  haDocumento: boolean;
}): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return "Indica la data di ricezione.";
  const date = new Date(`${data}T12:00:00Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== data
  )
    return "Indica una data di ricezione valida.";
  const qty = quantita.trim() === "" ? 0 : Number(quantita);
  if (!Number.isFinite(qty) || qty < 0)
    return "La quantità ricevuta non può essere negativa o non valida.";
  for (let i = 0; i < righe.length; i++) {
    const r = righe[i];
    if (!r.descrizione.trim())
      return `Riga ${i + 1}: indica la descrizione della merce.`;
    if (r.quantita == null || !Number.isFinite(r.quantita) || r.quantita <= 0)
      return `Riga ${i + 1}: indica una quantità maggiore di zero.`;
  }
  if (stato !== "atteso" && !haDocumento && !righe.length && qty === 0)
    return "Aggiungi il documento, almeno una riga o una quantità ricevuta prima di registrare il DDT.";
  return null;
}
