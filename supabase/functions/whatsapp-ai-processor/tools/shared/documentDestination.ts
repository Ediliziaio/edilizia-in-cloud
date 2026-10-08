import type { ToolCtx } from "./types.ts";

/** A document's destination is the trusted inbound event, never AI arguments. */
export async function requireDocumentConversation(ctx: ToolCtx): Promise<void> {
  if (!ctx.user_id || !["admin", "ufficio"].includes(ctx.kind) || !ctx.role_grants.includes("preventivi.pdf") ||
      !ctx.requestId || !ctx.waNumberId || !ctx.phone) throw new Error("Conversazione non verificabile.");
  const { data, error } = await ctx.supabase.from("whatsapp_messages").select("id")
    .eq("id", ctx.requestId).eq("company_id", ctx.company_id).eq("wa_number_id", ctx.waNumberId)
    .eq("from_phone", ctx.phone).eq("direction", "inbound").maybeSingle();
  if (error || !data) throw new Error("Conversazione di destinazione non verificabile.");
}

/** Require the exact storage object, not just an arbitrary URL on our domain. */
export function verifiedDocumentUrl(value: unknown, base: string, storagePath: string): string {
  const url = new URL(String(value));
  if (url.origin !== new URL(base).origin || url.protocol !== "https:" || url.username || url.password ||
      url.hash || !url.searchParams.get("token") ||
      decodeURIComponent(url.pathname) !== `/storage/v1/object/sign/quote-pdfs/${storagePath}` ||
      storagePath.split("/").some(part => !part || part === "." || part === ".." || part.includes("\\"))) {
    throw new Error("Link del documento non verificabile.");
  }
  return url.href;
}
