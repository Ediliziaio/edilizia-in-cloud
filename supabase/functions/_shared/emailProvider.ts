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
 */
export async function loadProviderSettings(stream: "marketing" | "transactional" = "marketing") {
  const suffix = stream === "transactional" ? "_transactional" : "";
  const provider = (await getPlatformSetting(`email_provider${suffix}`)) || "sendgrid";
  const apiKey = await getPlatformSetting(`email_provider_api_key${suffix}`);
  const fromDefault = await getPlatformSetting(`email_default_from${suffix}`) || "noreply@ediliziacloud.it";
  return { provider, apiKey, fromDefault };
}

/**
 * Parse "Name <email>" format, returning just the email.
 */
function extractEmail(from: string): string {
  const match = from.match(/<(.+)>/);
  return match ? match[1] : from;
}

/**
 * Send an email via the configured provider.
 * Supports: sendgrid, brevo, resend, elasticemail, mailgun
 */
export async function sendViaProvider(
  provider: string,
  apiKey: string,
  req: EmailSendRequest
): Promise<EmailSendResult> {
  let url: string;
  let headers: Record<string, string>;
  let body: string;
  let extractId: (json: Record<string, unknown>) => string | undefined;

  const fromEmail = extractEmail(req.from);

  switch (provider) {
    case "sendgrid": {
      url = "https://api.sendgrid.com/v3/mail/send";
      headers = {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      };
      const payload: Record<string, unknown> = {
        personalizations: [{ to: req.to.map((e) => ({ email: e })) }],
        from: { email: fromEmail },
        subject: req.subject,
        content: [{ type: "text/html", value: req.html }],
      };
      if (req.replyTo) payload.reply_to = { email: req.replyTo };
      if (req.headers) {
        (payload.personalizations as Record<string, unknown>[])[0].headers = req.headers;
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
      const payload: Record<string, unknown> = {
        sender: { email: fromEmail },
        to: req.to.map((e) => ({ email: e })),
        subject: req.subject,
        htmlContent: req.html,
      };
      if (req.replyTo) payload.replyTo = { email: req.replyTo };
      body = JSON.stringify(payload);
      extractId = (json) => json.messageId as string | undefined;
      break;
    }

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
          From: fromEmail,
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
      // Mailgun uses form-data, extract domain from API key or settings
      const domain = await getPlatformSetting("mailgun_domain");
      url = `https://api.mailgun.net/v3/${domain}/messages`;
      headers = {
        Authorization: `Basic ${btoa(`api:${apiKey}`)}`,
      };
      const formData = new FormData();
      formData.append("from", req.from);
      req.to.forEach((t) => formData.append("to", t));
      formData.append("subject", req.subject);
      formData.append("html", req.html);
      if (req.replyTo) formData.append("h:Reply-To", req.replyTo);

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
