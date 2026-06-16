/**
 * Edge Function: send-roi-report
 *
 * Invia al cliente il report del Simulatore ROI di vendita (Round 2):
 * email HTML brandizzata EdiliziaInCloud + PDF brandizzato in allegato.
 *
 * Lo strumento vive nel Platform Admin CRM (super-admin sales). Per evitare il
 * gate carta del payment_method='none' (vedi AI router interno) l'invio è a
 * livello piattaforma: `companyId: null` → nessuna deduzione wallet / quota
 * per-azienda (in sendEmailUnified `shouldCharge` richiede companyId non nullo).
 *
 * Body:
 *   {
 *     to: string,                 // email destinatario (obbligatorio, validato)
 *     subject: string,            // oggetto (obbligatorio)
 *     html: string,               // corpo HTML (obbligatorio)
 *     attachment?: {              // PDF in allegato (opzionale)
 *       filename: string,
 *       content: string,          // base64 puro (no prefisso data:)
 *       type: string,             // es. "application/pdf"
 *     },
 *     client_name?: string | null,
 *     metadata?: Record<string, unknown> | null,
 *   }
 *
 * Auth: JWT richiesto (requireAuth). Solo super_admin può usare il tool — il
 * gate UI è `can_manage_marketing`; qui verifichiamo il ruolo lato server.
 */
import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";

const isEmail = (v: unknown): v is string =>
  typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

// Limite difensivo allegato: ~7 MB di base64 (~5 MB binari).
const MAX_ATTACHMENT_B64 = 7_000_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }
  const corsH = getCorsHeaders(req);
  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405, corsH);
  }

  try {
    const { userId, supabaseAdmin } = await requireAuth(req, corsH);
    // Lo strumento è super-admin only (Platform Admin CRM).
    await requireRole(supabaseAdmin, userId, ["super_admin"], corsH);

    const body = await req.json().catch(() => ({}));
    const to = String(body?.to ?? "").trim();
    const subject = String(body?.subject ?? "").trim();
    const html = String(body?.html ?? "").trim();
    const clientName = body?.client_name ? String(body.client_name).slice(0, 200) : null;
    const metadata =
      body?.metadata && typeof body.metadata === "object" ? body.metadata as Record<string, unknown> : {};

    if (!isEmail(to)) return errorResponse("Indirizzo email destinatario non valido", 400, corsH);
    if (!subject) return errorResponse("Oggetto mancante", 400, corsH);
    if (subject.length > 200) return errorResponse("Oggetto troppo lungo (max 200)", 400, corsH);
    if (!html) return errorResponse("Corpo email mancante", 400, corsH);

    // ── Allegato (opzionale) ──
    let attachments: { filename: string; content: string; type: string }[] | undefined;
    const att = body?.attachment;
    if (att && typeof att === "object") {
      const filename = String(att.filename ?? "report.pdf").slice(0, 180);
      const content = String(att.content ?? "");
      const type = String(att.type ?? "application/pdf");
      if (content) {
        if (content.length > MAX_ATTACHMENT_B64) {
          return errorResponse("Allegato troppo grande", 413, corsH);
        }
        attachments = [{ filename, content, type }];
      }
    }

    // ── Invio a livello piattaforma (nessun billing per-azienda) ──
    const result = await sendEmailUnified({
      companyId: null,
      stream: "transactional",
      to: [to],
      subject,
      html,
      attachments,
      templateName: "roi_report",
      skipCredits: true,
      adminClient: supabaseAdmin,
      metadata: {
        ...metadata,
        source: "roi_simulator",
        client_name: clientName,
        sender_user_id: userId,
        has_attachment: Boolean(attachments?.length),
      },
    });

    if (!result.ok) {
      console.error("send-roi-report send failed:", result.status, result.body);
      const msg =
        typeof result.body === "object" && (result.body as { error?: string })?.error
          ? String((result.body as { error?: string }).error)
          : `Invio email fallito (status ${result.status})`;
      return errorResponse(msg, result.status >= 400 && result.status < 600 ? result.status : 500, corsH);
    }

    return jsonResponse(
      { success: true, delivery_log_id: result.deliveryLogId ?? null },
      200,
      corsH,
    );
  } catch (err) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : String(err);
    console.error("send-roi-report error:", msg);
    return errorResponse(msg, 500, corsH);
  }
});
