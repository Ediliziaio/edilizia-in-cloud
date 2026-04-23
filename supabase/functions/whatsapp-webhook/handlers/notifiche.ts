// MP01 — Handler 'notifiche'. Inbound non previsto (canale transazionale
// one-way). Se arriva qualcosa, persistiamo e logghiamo.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { InboundContext } from "../types.ts";
import { persistInboundMessage } from "./_shared.ts";

export async function handleNotifiche(
  supabase: SupabaseClient,
  ctx: InboundContext,
): Promise<void> {
  const id = await persistInboundMessage(supabase, ctx);
  console.log(
    JSON.stringify({
      level: "info",
      fn: "handleNotifiche",
      msg: "inbound su canale notifiche (atteso solo outbound automatico)",
      wa_number_id: ctx.waNumber.id,
      company_id: ctx.waNumber.company_id,
      inserted_id: id,
    }),
  );
}
