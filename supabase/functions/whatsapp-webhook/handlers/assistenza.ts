// MP03 — Handler assistenza PRODUCTION.
// Clienti finali aprono ticket via WhatsApp, interrogano stato lavori.
// Flow: STOP handling → resolve/create marketing_contact → persist msg → invoke assistenza-ai-processor.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { InboundContext } from "../types.ts";
import { persistInboundMessage } from "./_shared.ts";
import {
  isStopMessage,
  markOptOut,
  resolveOrCreateContact,
  sendPlainReply,
} from "./_contact.ts";

export async function handleAssistenza(
  supabase: SupabaseClient,
  ctx: InboundContext,
): Promise<void> {
  const { waNumber, extracted, senderPhone } = ctx;

  const contact = await resolveOrCreateContact(supabase, senderPhone, waNumber.company_id, {
    tipo: "cliente_prospect",
    stato: "nuovo",
    source: "whatsapp_assistenza",
    firstMessage: extracted.content,
  });

  if (!contact) {
    console.error(
      JSON.stringify({
        level: "error",
        fn: "handleAssistenza",
        msg: "contact resolution failed",
      }),
    );
    return;
  }

  const messageId = await persistInboundMessage(supabase, ctx);

  if (isStopMessage(extracted.content)) {
    await markOptOut(supabase, contact.id);
    await sendPlainReply(
      waNumber.id,
      waNumber.company_id,
      senderPhone,
      "✅ Confermato, non riceverà più messaggi. Per qualsiasi necessità può scrivere di nuovo, la identificheremo subito.",
    );
    return;
  }

  if (contact.opt_out) {
    await supabase
      .from("marketing_contacts")
      .update({ opt_out: false })
      .eq("id", contact.id);
  }

  const baseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  fetch(`${baseUrl}/functions/v1/assistenza-ai-processor`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({
      message_id: messageId,
      contact_id: contact.id,
      wa_number_id: waNumber.id,
    }),
  }).catch((err) =>
    console.error(
      JSON.stringify({
        level: "error",
        fn: "handleAssistenza",
        msg: "processor invoke failed",
        error: String(err),
      }),
    )
  );
}
