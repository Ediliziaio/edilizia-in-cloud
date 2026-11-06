/** La risposta non va registrata se il prezzo non è stato salvato. */
export async function salvaPrezzoRdo({
  raw,
  precedente,
  salva,
  registraRisposta,
}: {
  raw: string;
  precedente: number | null;
  salva: (value: number | null) => Promise<unknown>;
  registraRisposta?: () => Promise<unknown>;
}) {
  const value = raw.trim() === "" ? null : Number(raw);
  if (value != null && (!Number.isFinite(value) || value < 0))
    throw new Error(
      "Il prezzo deve essere positivo o zero, oppure vuoto se non disponibile.",
    );
  if (value === precedente) return;
  await salva(value);
  if (value != null && registraRisposta) await registraRisposta();
}
