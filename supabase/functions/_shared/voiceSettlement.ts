/** One database transaction owns deduction, usage and the v2 mirror. Never fall back to a manual balance update. */
export async function settleVoiceConversation(db: any, companyId: string, conversationId: string, pricing: Record<string, unknown>, state: string) {
  const { data, error } = await db.rpc("settle_voice_conversation", {
    p_company_id: companyId, p_conversation_id: conversationId, p_pricing: pricing, p_state: state,
  });
  if (error || !data || typeof data.balance_after !== "number" || typeof data.balance_before !== "number") {
    throw new Error("Riconciliazione della chiamata non completata: il webhook deve essere ritentato");
  }
  return data as { balance_before: number; balance_after: number; already_billed: boolean };
}
