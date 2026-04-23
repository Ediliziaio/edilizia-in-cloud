// MP01 — Handler 'marketing'. Inbound normalmente non previsto
// (il canale è outbound-only: template Meta approvati). Se arriva un
// inbound, lo persistiamo per audit ma non scattiamo AI/trigger.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { InboundContext } from "../types.ts";
import { persistInboundMessage } from "./_shared.ts";

export async function handleMarketing(
  supabase: SupabaseClient,
  ctx: InboundContext,
): Promise<void> {
  const id = await persistInboundMessage(supabase, ctx);
  console.log(
    JSON.stringify({
      level: "info",
      fn: "handleMarketing",
      msg: "inbound su canale marketing (atteso solo outbound)",
      wa_number_id: ctx.waNumber.id,
      company_id: ctx.waNumber.company_id,
      inserted_id: id,
    }),
  );
}
