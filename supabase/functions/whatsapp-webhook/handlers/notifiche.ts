// MP03 — Handler notifiche PRODUCTION.
// Canale outbound-only. Inbound: persistiamo, loggiamo e non invochiamo AI
// (se il titolare risponde "ok" a un alert, è sufficiente l'audit).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { InboundContext } from "../types.ts";
import { persistInboundMessage } from "./_shared.ts";

export async function handleNotifiche(
  supabase: SupabaseClient,
  ctx: InboundContext,
): Promise<void> {
  const { waNumber, extracted } = ctx;

  await persistInboundMessage(supabase, ctx);

  console.log(
    JSON.stringify({
      level: "info",
      fn: "handleNotifiche",
      msg: "inbound su canale notifiche",
      wa_number_id: waNumber.id,
      company_id: waNumber.company_id,
      content_preview: (extracted.content ?? "").substring(0, 80),
    }),
  );
}
