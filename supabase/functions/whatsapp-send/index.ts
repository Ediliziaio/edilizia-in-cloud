import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptMaybeEncrypted, getEncryptionKey } from "../_shared/encryption.ts";
import { getWhatsAppWindowStatus } from "../_shared/whatsappWindow.ts";
import { getCorsHeaders } from "../_shared/headers.ts";
import { checkPaymentMethod, PAYMENT_METHOD_REQUIRED_MESSAGE } from "../_shared/requirePaymentMethod.ts";
import { addebitaMessaggioWhatsApp, rimborsaMessaggioWhatsApp } from "../_shared/whatsappCredits.ts";
import { addonWhatsAppAttivo, rispostaAddonWhatsApp } from "../_shared/whatsappAddon.ts";
import { corpoDelModello, lingueDelModello, testoDelModello, valoriDaiComponenti } from "../_shared/modelloWhatsApp.ts";

import { serveConMetriche } from "../_shared/withMetrics.ts";
type SendType = "text" | "interactive" | "template";
type TemplateLanguageInput = string | { code?: string } | undefined;

interface SendBody {
  company_id?: string;
  wa_number_id?: string | null;
  to?: string;
  type?: SendType;
  text?: string | { body?: string };
  interactive?: Record<string, unknown>;
  template?: {
    name?: string;
    language?: string | { code?: string };
    components?: unknown[];
    variables?: Record<string, unknown>;
  };
  log_message?: boolean;
}

function extractJwtRole(authHeader: string): string | null {
  if (!authHeader.startsWith("Bearer ")) return null;
  const jwt = authHeader.substring(7);
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

function inferType(body: SendBody): SendType | null {
  if (body.type) return body.type;
  if (body.template) return "template";
  if (body.interactive) return "interactive";
  if (body.text) return "text";
  return null;
}

function textBody(text: SendBody["text"]): string | null {
  if (typeof text === "string") return text.trim() || null;
  if (text?.body && typeof text.body === "string") return text.body.trim() || null;
  return null;
}

function templateLanguage(language: TemplateLanguageInput) {
  if (typeof language === "string") return { code: language };
  if (language && typeof language === "object" && "code" in language && typeof language.code === "string") {
    return { code: language.code };
  }
  return { code: "it" };
}

function variablesToComponents(variables: Record<string, unknown> | undefined) {
  const values = Object.values(variables ?? {}).filter((v) => v !== null && v !== undefined);
  if (values.length === 0) return undefined;
  return [{
    type: "body",
    parameters: values.map((value) => ({ type: "text", text: String(value) })),
  }];
}

/**
 * Il testo del modello inviato, con le variabili sostituite; null se il
 * modello non è tra quelli sincronizzati (vale allora l'etichetta).
 */
async function testoDelModelloInviato(
  adminClient: ReturnType<typeof createClient>,
  companyId: string,
  waNumberId: string | null,
  nome: string,
  lingua: string,
  components: unknown,
): Promise<string | null> {
  try {
    let q = adminClient
      .from("wa_meta_templates")
      .select("components_json")
      .eq("company_id", companyId)
      .eq("template_name", nome)
      .in("template_language", lingueDelModello(lingua));
    if (waNumberId) q = q.eq("wa_number_id", waNumberId);
    const { data } = await q.limit(1).maybeSingle();
    const corpo = corpoDelModello((data as { components_json?: unknown } | null)?.components_json);
    return corpo ? testoDelModello(corpo, valoriDaiComponenti(components)) : null;
  } catch {
    return null;
  }
}

serveConMetriche("whatsapp-send", async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    const cronSecret = req.headers.get("x-cron-secret");
    const internalSecret = Deno.env.get("INTERNAL_CRON_SECRET") || serviceKey;
    const roleClaim = extractJwtRole(authHeader);

    let isAuthenticated =
      authHeader === `Bearer ${serviceKey}` ||
      roleClaim === "service_role" ||
      (cronSecret?.length ? cronSecret === internalSecret : false);

    // Chi arriva col proprio accesso (dall'app) e non da una funzione interna:
    // più sotto si controlla che l'azienda sia la sua.
    let clienteUtente: ReturnType<typeof createClient> | null = null;

    if (!isAuthenticated && authHeader.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      const supabaseUser = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: { user }, error: authErr } = await supabaseUser.auth.getUser(token);
      isAuthenticated = !authErr && !!user;
      if (isAuthenticated) clienteUtente = supabaseUser;
    }

    if (!isAuthenticated) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: jsonHeaders,
      });
    }

    const body = (await req.json()) as SendBody;
    const companyId = body.company_id;
    const to = body.to?.replace(/[^0-9]/g, "") ?? "";
    const type = inferType(body);
    const logMessage = body.log_message !== false;

    if (!companyId || !to || !type) {
      return new Response(
        JSON.stringify({ error: "Parametri mancanti: company_id, to e contenuto sono obbligatori" }),
        { status: 400, headers: jsonHeaders },
      );
    }

    if (!["text", "interactive", "template"].includes(type)) {
      return new Response(
        JSON.stringify({ error: "Tipo non valido. Valori ammessi: text, interactive, template" }),
        { status: 400, headers: jsonHeaders },
      );
    }

    // Un utente invia solo per un'azienda a cui ha accesso (24/09/2026).
    // Prima bastava essere collegati: company_id arrivava dal corpo della
    // richiesta così com'era, e con quello si sceglievano numero, token e
    // credito — anche di un'altra azienda. Il controllo gira con l'accesso
    // dell'utente, quindi vale ciò che il database sa di lui: la sua azienda,
    // le aziende a cui è abilitato, il super admin; e mai se è bloccato.
    if (clienteUtente) {
      const [accesso, blocco] = await Promise.all([
        clienteUtente.rpc("user_can_access_company", { p_company_id: companyId }),
        clienteUtente.rpc("utente_bloccato"),
      ]);
      if (accesso.error || accesso.data !== true || blocco.error || blocco.data === true) {
        console.warn(JSON.stringify({
          level: "warn",
          fn: "whatsapp-send",
          msg: "invio rifiutato: azienda non accessibile",
          company_id: companyId,
          errore: accesso.error?.message ?? blocco.error?.message ?? null,
        }));
        return new Response(
          JSON.stringify({ error: "Non puoi inviare messaggi WhatsApp per questa azienda.", code: "forbidden_company" }),
          { status: 403, headers: jsonHeaders },
        );
      }
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      serviceKey,
    );

    // Gate "carta obbligatoria": blocca l'invio se l'azienda non ha un metodo di pagamento valido.
    const pmCheck = await checkPaymentMethod(adminClient, companyId);
    if (!pmCheck.allowed) {
      return new Response(
        JSON.stringify({ error: pmCheck.message ?? PAYMENT_METHOD_REQUIRED_MESSAGE, code: "payment_method_required" }),
        { status: 402, headers: jsonHeaders },
      );
    }

    // Add-on WhatsApp Business: il numero dell'azienda invia solo se il piano
    // lo include, l'add-on è pagato o il super admin l'ha sbloccato. Se la
    // verifica non risponde si invia lo stesso: qui passano notifiche e
    // broadcast già dovuti, e l'add-on non corre a ogni messaggio.
    if (!(await addonWhatsAppAttivo(adminClient, companyId, { seNonVerificabile: "consenti" }))) {
      return rispostaAddonWhatsApp(corsHeaders);
    }

    let phoneNumberId: string | null = null;
    let accessTokenEncrypted: string | null = null;
    let fromPhoneForLog = "";

    if (body.wa_number_id) {
      const { data: waNumber, error: waErr } = await adminClient
        .from("ai_whatsapp_numbers")
        .select("id, numero, phone_number_id, access_token_encrypted, company_id")
        .eq("id", body.wa_number_id)
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .maybeSingle();

      if (waErr) {
        return new Response(JSON.stringify({ error: waErr.message }), { status: 400, headers: jsonHeaders });
      }
      if (!waNumber?.phone_number_id || !waNumber?.access_token_encrypted) {
        return new Response(
          JSON.stringify({ error: "Numero WhatsApp non configurato o token mancante" }),
          { status: 400, headers: jsonHeaders },
        );
      }
      phoneNumberId = waNumber.phone_number_id;
      accessTokenEncrypted = waNumber.access_token_encrypted;
      fromPhoneForLog = waNumber.numero ?? phoneNumberId;
    } else {
      const { data: legacyConfig } = await adminClient
        .from("messaging_whatsapp_config")
        .select("phone_number_id, access_token_encrypted")
        .eq("company_id", companyId)
        .eq("is_connected", true)
        .maybeSingle();

      if (!legacyConfig?.phone_number_id || !legacyConfig?.access_token_encrypted) {
        return new Response(
          JSON.stringify({ error: "WhatsApp non configurato per questa azienda" }),
          { status: 400, headers: jsonHeaders },
        );
      }
      phoneNumberId = legacyConfig.phone_number_id;
      accessTokenEncrypted = legacyConfig.access_token_encrypted;
      fromPhoneForLog = legacyConfig.phone_number_id;
    }

    const accessToken = await decryptMaybeEncrypted(accessTokenEncrypted, getEncryptionKey());
    const payload: Record<string, unknown> = {
      messaging_product: "whatsapp",
      to,
      type,
    };

    let logContent = "";
    if (type === "text") {
      const bodyText = textBody(body.text);
      if (!bodyText) {
        return new Response(JSON.stringify({ error: "Campo text obbligatorio" }), {
          status: 400,
          headers: jsonHeaders,
        });
      }
      // Conformità Customer Service Window (24h): il testo libero è permesso
      // SOLO se il cliente ha scritto negli ultimi 24h. Altrimenti serve un
      // template approvato (Meta rifiuterebbe con errore 131047).
      const win = await getWhatsAppWindowStatus(adminClient, companyId, to);
      if (!win.open) {
        return new Response(
          JSON.stringify({
            error: "Finestra 24h chiusa: per scrivere a questo numero serve un template approvato.",
            code: "window_closed",
          }),
          { status: 422, headers: jsonHeaders },
        );
      }
      payload.text = { body: bodyText };
      logContent = bodyText;
    } else if (type === "interactive") {
      if (!body.interactive?.type || !body.interactive?.body || !body.interactive?.action) {
        return new Response(
          JSON.stringify({ error: "Campi interactive.type, body e action obbligatori" }),
          { status: 400, headers: jsonHeaders },
        );
      }
      payload.interactive = body.interactive;
      const interactiveBody = body.interactive.body as { text?: string } | undefined;
      logContent = interactiveBody?.text || JSON.stringify(body.interactive);
    } else if (type === "template") {
      if (!body.template?.name) {
        return new Response(JSON.stringify({ error: "Campo template.name obbligatorio" }), {
          status: 400,
          headers: jsonHeaders,
        });
      }
      const components = body.template.components ?? variablesToComponents(body.template.variables);
      const language = templateLanguage(body.template.language);
      payload.template = {
        name: body.template.name,
        language,
        ...(components ? { components } : {}),
      };
      // Nella conversazione si salva il messaggio come lo legge il cliente,
      // non l'etichetta del modello.
      logContent = (await testoDelModelloInviato(
        adminClient, companyId, body.wa_number_id ?? null, body.template.name, language.code, components,
      )) ?? `[Template: ${body.template.name}]`;
    }

    // ── Credito ──────────────────────────────────────────────────────────
    // Qui passano il bot, i promemoria, le notifiche, i report e il primo
    // contatto sui lead: era l'unico percorso che non guardava il saldo.
    // Si addebita PRIMA di consegnare a Meta — vedi _shared/whatsappCredits.ts
    // per il perché — e si rimborsa se il messaggio non parte davvero.
    const credito = await addebitaMessaggioWhatsApp(
      adminClient,
      companyId,
      `Messaggio WhatsApp (${type}) verso ${to}`,
      { to, type, wa_number_id: body.wa_number_id ?? null },
    );
    if (!credito.consentito) {
      return new Response(
        JSON.stringify({
          error: credito.codice ?? "insufficient_credits",
          message: credito.messaggio,
          saldo_eur: credito.saldo,
        }),
        { status: credito.codice === "whatsapp_disabled" ? 403 : 402, headers: jsonHeaders },
      );
    }

    const metaRes = await fetch(
      `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );

    const metaResult = await metaRes.json();
    if (!metaRes.ok) {
      console.error("[whatsapp-send] Meta API error:", metaResult);
      // Il messaggio non è partito: il credito torna indietro.
      await rimborsaMessaggioWhatsApp(
        adminClient, companyId, credito.addebitato,
        "Rimborso: invio WhatsApp rifiutato dal provider",
        { to, type, meta_error: metaResult.error ?? null },
      );
      return new Response(
        JSON.stringify({
          error: metaResult.error?.message || "Errore invio WhatsApp",
          meta_error: metaResult.error,
        }),
        { status: 502, headers: jsonHeaders },
      );
    }

    const metaMessageId = metaResult.messages?.[0]?.id ||
      `out_${Date.now()}_${crypto.randomUUID()}`;

    if (logMessage) {
      const { error: logErr } = await adminClient
        .from("whatsapp_messages")
        .insert({
          company_id: companyId,
          wa_number_id: body.wa_number_id ?? null,
          wa_message_id: metaMessageId,
          direction: "outbound",
          from_phone: fromPhoneForLog,
          to_phone: to,
          message_type: type,
          content_text: logContent,
          processing_status: "processed",
          processed_at: new Date().toISOString(),
        });

      if (logErr) {
        console.error("[whatsapp-send] Log insert error:", logErr);
      }
    }

    return new Response(
      JSON.stringify({ success: true, meta_message_id: metaMessageId }),
      { status: 200, headers: jsonHeaders },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Errore interno del server";
    console.error("[whatsapp-send] Error:", err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: {
        ...getCorsHeaders(req),
        "Content-Type": "application/json",
      },
    });
  }
});
