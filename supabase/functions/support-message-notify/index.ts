// support-message-notify — avviso interno a ogni messaggio che un'AZIENDA scrive in Assistenza.
// Prima di questa funzione nessuna email partiva: il messaggio compariva solo nella dashboard
// super_admin (caso Tecnoprover S.r.l., 02/11/2026, nessuna mail ricevuta).
// Chiamata dal trigger su support_messages via pg_net (x-cron-secret dal Vault).
// Destinatario: platform_settings.internal_alert_email (notificheotm@gmail.com), vedi notificaInterna.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cronSecretValido } from "../_shared/cronAuth.ts";
import { notificaInterna } from "../_shared/notificaInterna.ts";

Deno.serve(async (req) => {
  if (!cronSecretValido(req)) return new Response("unauthorized", { status: 401 });
  try {
    const { message_id } = await req.json();
    if (!message_id) return new Response("message_id mancante", { status: 400 });
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: m } = await admin.from("support_messages")
      .select("id, company_id, sender_role, message, created_at").eq("id", message_id).maybeSingle();
    if (!m || m.sender_role === "super_admin") return Response.json({ skipped: true });
    const { data: c } = await admin.from("companies").select("name").eq("id", m.company_id).maybeSingle();
    const nome = c?.name ?? "Azienda";
    const ok = await notificaInterna(admin, {
      oggetto: `Assistenza: nuovo messaggio da ${nome}`,
      sommario: `${nome} ha scritto in Assistenza Clienti.`,
      dettagli: [["Azienda", nome], ["Messaggio", String(m.message).slice(0, 1500)]],
      url: "https://app.ediliziaincloud.com/admin/cs",
      urlLabel: "Rispondi in Assistenza",
      dedupeKey: `support_msg_${m.id}`,
    });
    return Response.json({ ok });
  } catch (e) {
    console.error("[support-message-notify]", (e as Error).message);
    return new Response("errore", { status: 500 });
  }
});
