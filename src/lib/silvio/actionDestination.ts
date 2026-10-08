/** Only destinations backed by a completed, persisted result; never use URLs from payloads. */
export function silvioActionDestination(actionType: string, status: string, result: unknown) {
  if (status !== "applied" || !result || typeof result !== "object" || Array.isArray(result)) return null;
  if (!["create_quote_draft", "crea_preventivo_bozza", "preventivo_bozza", "bozza_preventivo"].includes(actionType)) return null;
  const id = (result as Record<string, unknown>).quote_id;
  if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  return { href: `/azienda/marketing/preventivi/${id}`, label: "Apri il preventivo creato" };
}
