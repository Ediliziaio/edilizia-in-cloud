/**
 * sms-automation-runner
 * Esegue le automazioni SMS attive per un determinato evento aziendale.
 * Invocato da altri Edge Function (es. salva-preventivo, crea-cantiere)
 * o dal cron job process-automation.
 *
 * POST service-role: {
 *   evento: SmsAutomationEvento,
 *   company_id: string,
 *   trigger_ref?: string,
 *   trigger_entity?: string,
 *   variabili?: Record<string,string>   // { nome, importo, data, ecc. }
 * }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/headers.ts";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Sostituisce {{variabile}} nel template */
function interpolaTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Metodo non consentito" }, 405);

  try {
    const supabaseUrl    = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json() as {
      evento: string;
      company_id: string;
      trigger_ref?: string;
      trigger_entity?: string;
      variabili?: Record<string, string>;
    };

    const { evento, company_id, trigger_ref, trigger_entity, variabili = {} } = body;

    if (!evento || !company_id) {
      return json({ error: "Parametri obbligatori: evento, company_id" }, 400);
    }

    // ── Carica automazioni attive per questo evento ───────────────
    const { data: automations, error: errAuto } = await admin
      .from("sms_automations")
      .select("id, template_body, tipo_destinatario, numero_custom, delay_minuti, nome")
      .eq("company_id", company_id)
      .eq("trigger_evento", evento)
      .eq("attiva", true);

    if (errAuto) throw errAuto;
    if (!automations || automations.length === 0) {
      return json({ ok: true, inviate: 0, saltate: 0, errori: 0 });
    }

    // ── Numero mittente ───────────────────────────────────────────
    const { data: numero } = await admin
      .from("sms_telnyx_numbers")
      .select("numero_e164, messaging_profile_id")
      .eq("company_id", company_id)
      .eq("stato", "attivo")
      .maybeSingle();

    if (!numero) {
      return json({
        ok: false,
        error: "Nessun numero SMS attivo per questa azienda",
        inviate: 0,
        saltate: automations.length,
        errori: 0,
      });
    }

    // ── Telnyx API key ────────────────────────────────────────────
    const { data: account } = await admin
      .from("sms_telnyx_accounts")
      .select("telnyx_api_key")
      .eq("company_id", company_id)
      .maybeSingle();

    const masterApiKey = Deno.env.get("TELNYX_MASTER_API_KEY");
    const apiKey = account?.telnyx_api_key ?? masterApiKey;

    if (!apiKey) {
      return json({ ok: false, error: "Chiave API Telnyx non configurata", inviate: 0, saltate: 0, errori: automations.length });
    }

    // ── Pricing / Wallet ──────────────────────────────────────────
    const { data: pricing } = await admin
      .from("sms_pricing_config")
      .select("prezzo_per_sms")
      .limit(1)
      .maybeSingle();
    const costoSms = Number(pricing?.prezzo_per_sms ?? 0.06);

    const { data: wallet } = await admin
      .from("sms_wallet")
      .select("crediti_disponibili, saldo_bloccato")
      .eq("company_id", company_id)
      .maybeSingle();

    let crediti = Number(wallet?.crediti_disponibili ?? 0);
    const bloccato = wallet?.saldo_bloccato ?? false;

    // ── Esegui ogni automazione ───────────────────────────────────
    let inviate = 0;
    let saltate = 0;
    let errori = 0;

    for (const automation of automations) {
      // Determina numero destinatario
      let toNumber: string | null = null;

      if (automation.tipo_destinatario === "custom_number" && automation.numero_custom) {
        toNumber = automation.numero_custom;
      } else if (variabili["telefono_cliente"]) {
        toNumber = variabili["telefono_cliente"];
      } else if (variabili["telefono_tecnico"]) {
        toNumber = variabili["telefono_tecnico"];
      }

      if (!toNumber) {
        await admin.from("sms_automation_logs").insert({
          automation_id: automation.id,
          company_id,
          trigger_ref: trigger_ref ?? null,
          trigger_entity: trigger_entity ?? null,
          status: "skipped",
          error_message: "Numero destinatario non trovato nelle variabili",
        });
        saltate++;
        continue;
      }

      // Verifica crediti
      if (bloccato || crediti < costoSms) {
        await admin.from("sms_automation_logs").insert({
          automation_id: automation.id,
          company_id,
          trigger_ref: trigger_ref ?? null,
          trigger_entity: trigger_entity ?? null,
          status: "skipped",
          error_message: "Crediti SMS insufficienti",
        });
        saltate++;
        continue;
      }

      const msgBody = interpolaTemplate(automation.template_body, variabili);

      // Crea record sms_messages
      const { data: msgRecord } = await admin
        .from("sms_messages")
        .insert({
          company_id,
          direction: "outbound",
          status: "queued",
          to_number: toNumber,
          from_number: numero.numero_e164,
          body: msgBody,
          trigger_type: "automation",
          trigger_entity: trigger_entity ?? null,
          trigger_ref: trigger_ref ?? null,
        })
        .select("id")
        .single();

      const msgId = msgRecord?.id as string | undefined;

      // Chiama Telnyx API
      try {
        const telnyxPayload: Record<string, unknown> = {
          from: numero.numero_e164,
          to: toNumber,
          text: msgBody,
          type: "SMS",
        };
        if (numero.messaging_profile_id) {
          telnyxPayload.messaging_profile_id = numero.messaging_profile_id;
        }

        const telnyxRes = await fetch("https://api.telnyx.com/v2/messages", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(telnyxPayload),
        });

        if (!telnyxRes.ok) {
          throw new Error(`Telnyx ${telnyxRes.status}`);
        }

        const td = await telnyxRes.json() as { data?: { id?: string } };
        const telnyxId = td?.data?.id ?? null;

        if (msgId) {
          await admin
            .from("sms_messages")
            .update({ status: "sending", telnyx_id: telnyxId, sent_at: new Date().toISOString() })
            .eq("id", msgId);
        }

        // Scala crediti
        crediti -= costoSms;
        await admin.from("sms_wallet_transazioni").insert({
          company_id,
          tipo: "addebito_sms",
          importo: costoSms,
          note: `Automazione "${automation.nome}" → ${toNumber}`,
        });

        // Log successo
        await admin.from("sms_automation_logs").insert({
          automation_id: automation.id,
          company_id,
          sms_message_id: msgId ?? null,
          trigger_ref: trigger_ref ?? null,
          trigger_entity: trigger_entity ?? null,
          status: "sent",
        });

        // Aggiorna contatore + ultima_esecuzione
        await admin
          .from("sms_automations")
          .update({
            contatore_invii: (automation as unknown as Record<string, number>)["contatore_invii"]
              ? (automation as unknown as Record<string, number>)["contatore_invii"] + 1
              : 1,
            ultima_esecuzione: new Date().toISOString(),
          })
          .eq("id", automation.id);

        inviate++;
      } catch (errTelnyx: unknown) {
        const errMsg = errTelnyx instanceof Error ? errTelnyx.message : "Errore Telnyx";

        if (msgId) {
          await admin
            .from("sms_messages")
            .update({ status: "failed", error_message: errMsg })
            .eq("id", msgId);
        }

        await admin.from("sms_automation_logs").insert({
          automation_id: automation.id,
          company_id,
          sms_message_id: msgId ?? null,
          trigger_ref: trigger_ref ?? null,
          trigger_entity: trigger_entity ?? null,
          status: "failed",
          error_message: errMsg,
        });

        errori++;
      }
    }

    return json({ ok: true, inviate, saltate, errori });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Errore interno";
    console.error("sms-automation-runner:", message);
    return json({ ok: false, error: message, inviate: 0, saltate: 0, errori: 0 }, 500);
  }
});
