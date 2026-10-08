import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { statoDaSalvare, type ConfermaAttesa } from "../_shared/botOperativoConferme.ts";

/** Compare-and-swap: due messaggi non possono consumare lo stesso Sì.
 * Un esito incerto non rimette la conferma in circolo. Nessun retry di scritture.
 */
export class BotSessionState {
  private consumed = false;
  constructor(private db: SupabaseClient, private companyId: string,
    private sessionId: string | null, private previous: unknown) {}

  async save(changes: { conferma?: ConfermaAttesa | null; domini?: string[] }): Promise<void> {
    if (!this.sessionId) throw new Error("bot_session_unavailable");
    const next = statoDaSalvare(this.previous, changes, new Date());
    let query = this.db.from("whatsapp_sessions").update({ state_data: next })
      .eq("id", this.sessionId).eq("company_id", this.companyId);
    query = this.previous == null ? query.is("state_data", null)
      : query.eq("state_data", JSON.stringify(this.previous));
    const { data, error } = await query.select("id");
    if (error || data?.length !== 1) throw new Error("bot_session_changed_or_unavailable");
    this.previous = next;
  }

  async consume(): Promise<boolean> {
    if (this.consumed) return false;
    this.consumed = true;
    await this.save({ conferma: null });
    return true;
  }
}
