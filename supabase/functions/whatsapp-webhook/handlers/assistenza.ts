// MP01 — Handler stub 'assistenza'. Implementato compiutamente in MP3.
// Persiste il messaggio per audit, non invoca AI né trigger automation.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { InboundContext } from "../types.ts";
import { persistInboundMessage } from "./_shared.ts";

export async function handleAssistenza(
  supabase: SupabaseClient,
  ctx: InboundContext,
): Promise<void> {
  const id = await persistInboundMessage(supabase, ctx);
  console.log(
    JSON.stringify({
      level: "info",
      fn: "handleAssistenza",
      msg: "stub — full impl in MP3",
      wa_number_id: ctx.waNumber.id,
      company_id: ctx.waNumber.company_id,
      wa_message_id: ctx.msg.id ?? null,
      inserted_id: id,
    }),
  );
}
