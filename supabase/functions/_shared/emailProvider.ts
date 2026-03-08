import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getPlatformSetting } from "./getPlatformSetting.ts";

export interface EmailSendRequest {
  from: string;
  to: string[];
  subject: string;
  html: string;
  replyTo?: string;
  attachments?: { filename: string; content: string; type: string }[];
  headers?: Record<string, string>;
}

export interface EmailSendResult {
  ok: boolean;
  status: number;
  body: unknown;
  providerMessageId?: string;
}

/**
 * Load provider settings from platform_settings.
 * stream = "marketing" | "transactional"
 *
 * Keys follow the naming convention:
 *   email_marketing_provider, email_marketing_api_key, email_marketing_from_address,
 *   email_marketing_from_name, email_marketing_domain
 *   email_transactional_provider, email_transactional_api_key, ...
 */
export async function loadProviderSettings(stream: "marketing" | "transactional" = "marketing") {
  const prefix = `email_${stream}`;
  const provider = (await getPlatformSetting(`${prefix}_provider`)) || "sendgrid";
  const apiKey = await getPlatformSetting(`${prefix}_api_key`);
  const fromEmail = (await getPlatformSetting(`${prefix}_from_address`)) || "noreply@ediliziacloud.it";
  const fromName = await getPlatformSetting(`${prefix}_from_name`);
  const domain = await getPlatformSetting(`${prefix}_domain`);

  // Build "from" string: "Name <email>" or just "email"
  const fromDefault = fromName ? `${fromName} <${fromEmail}>` : fromEmail;

  return { provider, apiKey, fromEmail, fromName, domain, fromDefault };
}

/**
 * Parse "Name <email>" format, returning just the email.
 */
function extractEmail(from: string): string {
  const match = from.match(/<(.+)>/);
  return match ? match[1] : from;
}

/**
 * Parse "Name <email>" format, returning the name.
 */
function extractName(from: string): string | undefined {
  const match = from.match(/^(.+?)\s*</);
  return match ? match[1].trim() : undefined;
}

/**
 * Send an email via the configured provider.
 * Supports: sendgrid, brevo, resend, elastic_email, mailgun
 */
export async function sendViaProvider(
  provider: string,
  apiKey: string,
  req: EmailSendRequest,
  opts?: { domain?: string }
): Promise<EmailSendResult> {
  let url: string;
  let headers: Record<string, string>;
  let body: string;
  let extractId: (json: Record<string, unknown>) => string | undefined;

  const fromEmail = extractEmail(req.from);
  const fromName = extractName(req.from);

  switch (provider) {
    case "sendgrid": {
      url = "https://api.sendgrid.com/v3/mail/send";
      headers = {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      };
      const fromObj: Record<string, string> = { email: fromEmail };
      if (fromName) fromObj.name = fromName;
      const payload: Record<string, unknown> = {
        personalizations: [{ to: req.to.map((e) => ({ email: e })) }],
        from: fromObj,
        subject: req.subject,
        content: [{ type: "text/html", value: req.html }],
        // Disable native tracking — we handle it ourselves
        tracking_settings: {
          click_tracking: { enable: false },
          open_tracking: { enable: false },
        },
      };
      if (req.replyTo) payload.reply_to = { email: req.replyTo };
      if (req.headers) {
        (payload.personalizations as Record<string, unknown>[])[0].headers = req.headers;
      }
      if (req.attachments?.length) {
        payload.attachments = req.attachments.map((a) => ({
          content: a.content,
          filename: a.filename,
          type: a.type,
          disposition: "attachment",
        }));
      }
      body = JSON.stringify(payload);
      // SendGrid returns message ID in x-message-id header, not body
      extractId = () => undefined;
      break;
    }

    case "sendinblue":
    case "brevo": {
      url = "https://api.brevo.com/v3/smtp/email";
      headers = {
        "api-key": apiKey,
        "Content-Type": "application/json",
      };
      const senderObj: Record<string, string> = { email: fromEmail };
      if (fromName) senderObj.name = fromName;
      const payload: Record<string, unknown> = {
        sender: senderObj,
        to: req.to.map((e) => ({ email: e })),
        subject: req.subject,
        htmlContent: req.html,
      };
      if (req.replyTo) payload.replyTo = { email: req.replyTo };
      if (req.attachments?.length) {
        payload.attachment = req.attachments.map((a) => ({
          content: a.content,
          name: a.filename,
        }));
      }
      body = JSON.stringify(payload);
      extractId = (json) => json.messageId as string | undefined;
      break;
    }

    case "elastic_email":
    case "elasticemail": {
      url = "https://api.elasticemail.com/v4/emails/transactional";
      headers = {
        "X-ElasticEmail-ApiKey": apiKey,
        "Content-Type": "application/json",
      };
      const payload: Record<string, unknown> = {
        Recipients: {
          To: req.to.map((e) => e),
        },
        Content: {
          From: fromName ? `${fromName} <${fromEmail}>` : fromEmail,
          Subject: req.subject,
          Body: [{ ContentType: "HTML", Content: req.html }],
        },
      };
      if (req.replyTo) {
        (payload.Content as Record<string, unknown>).ReplyTo = req.replyTo;
      }
      body = JSON.stringify(payload);
      extractId = (json) => (json as Record<string, unknown>).MessageID as string | undefined;
      break;
    }

    case "mailgun": {
      const mailgunDomain = opts?.domain || (await getPlatformSetting("email_marketing_domain"));
      url = `https://api.mailgun.net/v3/${mailgunDomain}/messages`;
      headers = {
        Authorization: `Basic ${btoa(`api:${apiKey}`)}`,
      };
      const formData = new FormData();
      formData.append("from", req.from);
      req.to.forEach((t) => formData.append("to", t));
      formData.append("subject", req.subject);
      formData.append("html", req.html);
      if (req.replyTo) formData.append("h:Reply-To", req.replyTo);
      // Disable native tracking
      formData.append("o:tracking", "no");

      if (req.attachments?.length) {
        for (const att of req.attachments) {
          const blob = new Blob([Uint8Array.from(atob(att.content), (c) => c.charCodeAt(0))], { type: att.type });
          formData.append("attachment", blob, att.filename);
        }
      }

      const res = await fetch(url, { method: "POST", headers, body: formData });
      const json = await res.json().catch(() => ({}));
      return {
        ok: res.ok,
        status: res.status,
        body: json,
        providerMessageId: json?.id,
      };
    }

    case "resend":
    default: {
      url = "https://api.resend.com/emails";
      headers = {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      };
      const payload: Record<string, unknown> = {
        from: req.from,
        to: req.to,
        subject: req.subject,
        html: req.html,
      };
      if (req.replyTo) payload.reply_to = req.replyTo;
      if (req.attachments?.length) {
        payload.attachments = req.attachments.map((a) => ({
          content: a.content,
          filename: a.filename,
        }));
      }
      body = JSON.stringify(payload);
      extractId = (json) => json.id as string | undefined;
      break;
    }
  }

  const res = await fetch(url, { method: "POST", headers, body });
  const json = await res.json().catch(() => ({}));

  return {
    ok: res.ok,
    status: res.status,
    body: json,
    providerMessageId: extractId?.(json as Record<string, unknown>),
  };
}
