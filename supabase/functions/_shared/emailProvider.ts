import { getPlatformSetting } from "./getPlatformSetting.ts";

/**
 * P1-6: sanitizza il display name mittente per RFC 5322.
 *
 * Prima: un fromName del tipo `Edilizia <Rossi>` o `Ditta, S.r.l.`
 * finiva in `${fromName} <${fromEmail}>` producendo header malformati
 * come `Edilizia <Rossi> <noreply@ediliziaincloud.it>`. I provider
 * (Elastic Email, Resend, SendGrid, Brevo) rispondevano 400 "Invalid
 * sender" e la campagna saltava senza feedback chiaro.
 *
 * - Rimuove caratteri di controllo (0x00-0x1F, 0x7F).
 * - Tronca a 78 caratteri (line folding RFC 5322 §2.1.1).
 * - Se contiene `,`, `<`, `>`, `"`, `;`, `@`, `(`, `)`, `\`, `[`, `]`,
 *   `:`, `'` wrappa in quoted-string escapando `\` e `"` (RFC 5322 §3.2.4).
 */
export function sanitizeFromName(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  // eslint-disable-next-line no-control-regex -- P1-6: RFC 5322 richiede strip caratteri di controllo
  const clean = String(raw).replace(/[\x00-\x1F\x7F]/g, "").trim();
  if (!clean) return undefined;
  const truncated = clean.slice(0, 78);
  if (/[,<>"'();:@[\]\\]/.test(truncated)) {
    const escaped = truncated.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return `"${escaped}"`;
  }
  return truncated;
}

export interface EmailSendRequest {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text?: string;
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
  const providerDefault = stream === "marketing" ? "elastic_email" : "resend";
  const provider = (await getPlatformSetting(`${prefix}_provider`)) || providerDefault;
  const apiKey = await getPlatformSetting(`${prefix}_api_key`);
  const fromEmail = (await getPlatformSetting(`${prefix}_from_address`)) || "noreply@ediliziaincloud.it";
  const fromNameRaw = await getPlatformSetting(`${prefix}_from_name`);
  const fromName = sanitizeFromName(fromNameRaw); // P1-6
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
 * Parse "Name <email>" format, returning the name sanitized (P1-6).
 */
function extractName(from: string): string | undefined {
  const match = from.match(/^(.+?)\s*</);
  return match ? sanitizeFromName(match[1].trim()) : undefined;
}

/**
 * Fetch with exponential backoff retry on 429 (rate limit) responses.
 * GAP-19: max 3 attempts, base delay 1000ms.
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  maxAttempts = 3,
  baseDelayMs = 1000
): Promise<Response> {
  let lastResponse: Response | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(url, init);
    if (res.status !== 429) return res;
    lastResponse = res;
    if (attempt < maxAttempts) {
      // Honour Retry-After header if present, otherwise exponential backoff
      const retryAfter = res.headers.get("Retry-After");
      const delayMs = retryAfter
        ? Math.min(parseInt(retryAfter, 10) * 1000, 30_000)
        : baseDelayMs * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return lastResponse!;
}

/**
 * Send an email via the configured provider.
 * Supports: sendgrid, brevo, resend, elastic_email, mailgun
 */
export async function sendViaProvider(
  provider: string,
  apiKey: string,
  req: EmailSendRequest,
  opts?: {
    domain?: string;
    stream?: "marketing" | "transactional";
    disableNativeTracking?: boolean;
  }
): Promise<EmailSendResult> {
  let url: string;
  let headers: Record<string, string>;
  let body: string;
  let extractId: (json: Record<string, unknown>) => string | undefined = () => undefined;

  const fromEmail = extractEmail(req.from);
  const fromName = extractName(req.from);
  const stream = opts?.stream ?? "transactional";
  const disableNativeTracking = opts?.disableNativeTracking ?? (stream === "marketing");

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
      if (req.text) {
        (payload.content as Array<{ type: string; value: string }>).push({
          type: "text/plain",
          value: req.text,
        });
      }
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
      // SendGrid returns message ID in x-message-id response header — do early return
      const sgRes = await fetchWithRetry(url, { method: "POST", headers, body });
      const sgMsgId = sgRes.headers.get("x-message-id") || undefined;
      const sgJson = await sgRes.json().catch(() => ({}));
      return { ok: sgRes.ok, status: sgRes.status, body: sgJson, providerMessageId: sgMsgId };
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
      if (req.text) payload.textContent = req.text;
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
      url = stream === "marketing"
        ? "https://api.elasticemail.com/v4/emails"
        : "https://api.elasticemail.com/v4/emails/transactional";
      headers = {
        "X-ElasticEmail-ApiKey": apiKey,
        "Content-Type": "application/json",
      };
      const bodyParts: Array<Record<string, string>> = [
        { ContentType: "HTML", Charset: "utf-8", Content: req.html },
      ];
      if (req.text) {
        bodyParts.push({ ContentType: "PlainText", Charset: "utf-8", Content: req.text });
      }
      const content: Record<string, unknown> = {
        From: fromName ? `${fromName} <${fromEmail}>` : fromEmail,
        Subject: req.subject,
        Body: bodyParts,
      };
      if (req.replyTo) content.ReplyTo = req.replyTo;
      if (req.headers) content.Headers = req.headers;
      if (req.attachments?.length) {
        content.Attachments = req.attachments.map((a) => ({
          BinaryContent: a.content,
          Name: a.filename,
          ContentType: a.type,
        }));
      }
      const payload: Record<string, unknown> = stream === "marketing"
        ? {
            Recipients: req.to.map((email) => ({ Email: email })),
            Content: content,
            Options: disableNativeTracking
              ? {
                  TrackOpens: false,
                  TrackClicks: false,
                }
              : undefined,
          }
        : {
            Recipients: {
              To: req.to.map((e) => e),
            },
            Content: content,
          };
      body = JSON.stringify(payload);
      extractId = (json) =>
        (json as Record<string, unknown>).MessageID as string | undefined ||
        (json as Record<string, unknown>).TransactionID as string | undefined;
      break;
    }

    case "mailgun": {
      // P1-6 + P2-7: guard completo sul domain Mailgun.
      // Prima: domain vuoto → URL "/v3//messages" → 404 interpretato come
      // rate-limit → retry infinito. Ora fail-fast con errore chiaro +
      // validazione che sia un dominio vero (deve contenere almeno un '.').
      const mailgunDomain = (opts?.domain || "").trim();
      if (!mailgunDomain || !mailgunDomain.includes(".")) {
        console.error(
          `[emailProvider] Mailgun domain non configurato o non valido: "${mailgunDomain}"`,
        );
        return {
          ok: false,
          status: 500,
          body: {
            error:
              "Mailgun domain non configurato. Vai in Admin > Email > Provider per impostare il dominio (es. mg.tuazienda.it).",
          },
        };
      }
      url = `https://api.mailgun.net/v3/${encodeURIComponent(mailgunDomain)}/messages`;
      headers = {
        Authorization: `Basic ${btoa(`api:${apiKey}`)}`,
      };
      const formData = new FormData();
      formData.append("from", req.from);
      req.to.forEach((t) => formData.append("to", t));
      formData.append("subject", req.subject);
      formData.append("html", req.html);
      if (req.text) formData.append("text", req.text);
      if (req.replyTo) formData.append("h:Reply-To", req.replyTo);
      // Disable native tracking
      formData.append("o:tracking", "no");

      if (req.attachments?.length) {
        for (const att of req.attachments) {
          const blob = new Blob([Uint8Array.from(atob(att.content), (c) => c.charCodeAt(0))], { type: att.type });
          formData.append("attachment", blob, att.filename);
        }
      }

      const res = await fetchWithRetry(url, { method: "POST", headers, body: formData });
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
      if (req.text) payload.text = req.text;
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

  const res = await fetchWithRetry(url, { method: "POST", headers, body });
  const json = await res.json().catch(() => ({}));

  return {
    ok: res.ok,
    status: res.status,
    body: json,
    providerMessageId: extractId?.(json as Record<string, unknown>),
  };
}
