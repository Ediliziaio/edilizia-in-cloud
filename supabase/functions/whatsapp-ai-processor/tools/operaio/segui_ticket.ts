import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { idWhatsAppValido } from "../../bolleInConversazione.ts";
import { allegatoOperativo } from "../shared/allegatoOperativo.ts";
import { requireSiteAccess } from "../shared/siteAccess.ts";
import type { ToolCtx } from "../shared/types.ts";

export async function ticketDaCitazione(db: SupabaseClient, company: string, numero: string, telefono: string, citazione: unknown) {
  if (typeof citazione !== "string" || !citazione.trim() || citazione.length > 512) return null;
  const { data, error } = await db.from("whatsapp_messages").select("direction, from_phone, to_phone, linked_record_id")
    .eq("company_id", company).eq("wa_number_id", numero).eq("wa_message_id", citazione)
    .eq("linked_record_type", "tickets").maybeSingle();
  if (error) throw new Error("riferimento_ticket_non_disponibile");
  if (!data || (data.direction === "inbound" ? data.from_phone : data.to_phone) !== telefono) return null;
  return idWhatsAppValido(data.linked_record_id) ? data.linked_record_id : null;
}

export async function collegaMessaggioTicket(ctx: ToolCtx, messageId: string | undefined, ticket: string) {
  if (!idWhatsAppValido(messageId)) return;
  const { error } = await ctx.supabase.from("whatsapp_messages").update({ linked_record_type: "tickets", linked_record_id: ticket })
    .eq("id", messageId).eq("company_id", ctx.company_id).eq("wa_number_id", ctx.waNumberId).eq("from_phone", ctx.phone).eq("direction", "inbound");
  if (error) throw new Error("ticket_messaggio_non_collegato");
}

export function linkTicket(id: string) {
  return `https://app.ediliziaincloud.com/azienda/assistenza/${id}`;
}

export async function seguiTicket(ctx: ToolCtx, id: string, tipo: string, testo: string): Promise<string | null> {
  if (!ctx.role_grants.includes("segnalazione.write") || !idWhatsAppValido(ctx.requestId)) return null;
  const chiedeStato = /\b(?:stato|a che punto|come procede|novit[àa]|in carico)\b/i.test(testo);
  const allegato = ["document", "image", "audio"].includes(tipo);
  const nota = testo.trim().slice(0, 5000);
  if (!chiedeStato && !allegato && nota.length < 3) return "Scrivi l’aggiornamento, manda una foto o chiedi lo stato del ticket.";

  const { data: ticket, error } = await ctx.supabase.from("tickets").select("id, subject, status, order_id, created_by, assigned_to")
    .eq("company_id", ctx.company_id).eq("id", id).eq("fonte", "campo").maybeSingle();
  if (error || !ticket || ticket.created_by !== ctx.user_id) return "Questo ticket non è disponibile per la tua utenza.";
  if (ticket.order_id) await requireSiteAccess(ctx, ticket.order_id);
  const link = linkTicket(ticket.id);
  if (chiedeStato && !["image", "document"].includes(tipo)) {
    const stato = String(ticket.status ?? "aperto").replace(/_/g, " ");
    const assegnatario = ticket.assigned_to ? await ctx.supabase.from("profiles").select("first_name, last_name")
      .eq("company_id", ctx.company_id).eq("id", ticket.assigned_to).maybeSingle() : null;
    const nome = [assegnatario?.data?.first_name, assegnatario?.data?.last_name].filter(Boolean).join(" ");
    await collegaMessaggioTicket(ctx, ctx.requestId, id);
    return `Il ticket «${ticket.subject}» è ${stato}.${nome ? ` In carico a ${nome}.` : ""}\n${link}`;
  }
  if (["risolto", "chiuso"].includes(String(ticket.status))) return `Il ticket è chiuso.\n${link}`;

  let file: Awaited<ReturnType<typeof allegatoOperativo>> = null;
  if (allegato) {
    try { file = await allegatoOperativo({ ...ctx, sourceMessageId: ctx.requestId }, "ticket", id); }
    catch { return `Il file resta nella chat WhatsApp. Riprova rispondendo al ticket.\n${link}`; }
    if (!file) return `Il file non è arrivato completo. Rimandalo rispondendo al ticket.\n${link}`;
  }
  if (ctx.user_id) {
    const { error: messaggioErrore } = await ctx.supabase.from("ticket_messages").upsert({
      id: ctx.requestId, ticket_id: id, sender_id: ctx.user_id,
      message: [nota, file ? `${file.tipoMedia} negli allegati del ticket.` : null].filter(Boolean).join("\n"),
    }, { onConflict: "id", ignoreDuplicates: true });
    if (messaggioErrore) return `Verifica l’aggiornamento nel ticket prima di riprovare.\n${link}`;
  } else if (!file) return `Puoi aggiungere una foto o un vocale rispondendo a questo ticket.\n${link}`;
  await collegaMessaggioTicket(ctx, ctx.requestId, id);
  return `${file ? `${file.tipoMedia} aggiunto al ticket.` : "Aggiornamento aggiunto al ticket."}\n${link}`;
}
