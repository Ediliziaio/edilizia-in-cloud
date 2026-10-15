import { supabase } from "@/integrations/supabase/client";

/** Una lettura personale resta personale anche quando il ruolo è superadmin. */
export async function readPersonalEmailThread(threadId: string, userId: string | undefined, accountIds?: string[]): Promise<unknown[]> {
  if (!userId || (accountIds && accountIds.length === 0)) return [];
  // Stessi campi del lettore, con vincoli espliciti su proprietario e caselle.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any).from("email_inbox")
    .select("id, thread_id, message_id, oauth_connection_id, from_email, from_name, to_email, cc_emails, subject, received_at, raw_html, raw_text, attachments, headers, ai_category, ai_priority, ai_summary, ai_extracted, ai_suggested_action, ai_processed_at, is_read, is_starred, is_pec, pec_tipo, pec_stato")
    .eq("thread_id", threadId).eq("user_id", userId);
  if (accountIds) query = query.in("oauth_connection_id", accountIds);
  const {data, error} = await query.order("received_at", {ascending:true});
  if (error) throw error;
  return (data ?? []) as unknown[];
}
