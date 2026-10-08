/** HTTP success alone is not a provider receipt. Shared by browser and Deno. */
export function isWhatsAppReceipt(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const receipt = value as Record<string, unknown>;
  return receipt.success === true && !receipt.error &&
    typeof receipt.meta_message_id === "string" && receipt.meta_message_id.trim().length > 0 &&
    !["unknown", "failed", "pending", "rejected"].includes(String(receipt.status ?? ""));
}

export function requireWhatsAppReceipt(value: unknown): void {
  if (isWhatsAppReceipt(value)) return;
  throw new Error("Invio non confermato. La bozza è conservata: verifica la conversazione prima di riprovare.");
}
