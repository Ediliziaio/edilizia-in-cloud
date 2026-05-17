// deno-lint-ignore-file no-explicit-any
// ============================================================================
// admin-preview-email-template — Preview fedele template email (super_admin)
// ============================================================================
// Prende in input subject/html_body/text_body in editing e li renderizza con
// il layout completo (header/footer/branding) applicando placeholder mock.
// Output: stesso formato di renderEmailTemplate → { subject, html, text }.
//
// Non richiede che la riga sia già salvata in DB: l'editor manda il contenuto
// corrente e riceve la preview. Così il super_admin vede il risultato prima
// di salvare.
//
// Security: auth JWT + verifica super_admin. Nessuna email inviata.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, jsonResponse, errorResponse } from "../_shared/headers.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { renderLayout } from "../_shared/email-templates/layout.ts";
import { applyPlaceholders, htmlToPlainText } from "../_shared/email-templates/applyPlaceholders.ts";
import type { Branding } from "../_shared/email-templates/types.ts";

interface PreviewRequest {
  subject: string;
  htmlBody: string;
  textBody?: string | null;
  mockProps?: Record<string, string>;
  /**
   * Variante per ruolo (es. "super_admin", "company_admin"). Usato solo per
   * label preview — l'editor manda già subject/body della variante scelta.
   */
  roleVariant?: string | null;
}

/**
 * Lettura best-effort dei default di piattaforma per mostrare nel preview
 * la firma reale che userebbe un utente senza branding di company.
 */
async function loadPlatformDefaults(
  admin: ReturnType<typeof createClient>,
): Promise<{
  fromName: string;
  footerText: string;
  supportMail: string;
}> {
  try {
    const { data } = await admin
      .from("platform_settings")
      .select("key, value")
      .in("key", [
        "email_default_from_name",
        "email_default_footer_text",
        "email_default_support_mail",
      ]);
    const map = new Map<string, string>();
    for (const r of (data ?? []) as Array<{ key: string; value: string }>) {
      map.set(r.key, r.value);
    }
    return {
      fromName: map.get("email_default_from_name") || "EdiliziaInCloud",
      footerText: map.get("email_default_footer_text") || "",
      supportMail:
        map.get("email_default_support_mail") || "support@ediliziaincloud.it",
    };
  } catch {
    return {
      fromName: "EdiliziaInCloud",
      footerText: "",
      supportMail: "support@ediliziaincloud.it",
    };
  }
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors });
  }
  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405, cors);
  }

  try {
    // ── 1+2. Auth + role check (S2-04) ──
    const { userId, supabaseAdmin: admin } = await requireAuth(req, cors);
    await requireRole(admin, userId, ["super_admin"], cors);

    // ── 3. Parse body ──
    let body: PreviewRequest;
    try {
      body = await req.json();
    } catch {
      return errorResponse("Invalid JSON", 400, cors);
    }

    if (typeof body.subject !== "string" || !body.subject.trim()) {
      return errorResponse("subject is required", 400, cors);
    }
    if (typeof body.htmlBody !== "string" || !body.htmlBody.trim()) {
      return errorResponse("htmlBody is required", 400, cors);
    }

    const mockProps = body.mockProps ?? {};

    // ── 4. Branding mock (stessi default di loadBranding senza company) ──
    // Leggi i default platform-wide così il preview mostra la firma che
    // vedrebbero gli utenti senza branding di company.
    const platformDefaults = await loadPlatformDefaults(admin);
    const branding: Branding = {
      companyName: mockProps.companyName || platformDefaults.fromName,
      logoUrl: null,
      primaryColor: "#1E3A5F",
      secondaryColor: "#F97316",
      footerText: platformDefaults.footerText || null,
      showPoweredBy: true,
      unsubscribeFooterHtml: null,
      replyTo: platformDefaults.supportMail,
      unsubscribeUrl: null,
    };

    // ── 5. Substitution + layout ──
    const placeholderData: Record<string, unknown> = {
      ...mockProps,
      companyName: branding.companyName,
    };

    const innerBodyHtml = applyPlaceholders(body.htmlBody, placeholderData, true);
    const subject = applyPlaceholders(body.subject, placeholderData, false);
    const rawText = body.textBody
      ? applyPlaceholders(body.textBody, placeholderData, false)
      : htmlToPlainText(innerBodyHtml);

    const html = renderLayout({
      branding,
      innerBodyHtml,
      preheaderText: subject,
    });

    return jsonResponse({ subject, html, text: rawText }, 200, cors);
  } catch (err: any) {
    if (err instanceof Response) return err;
    console.error("[admin-preview-email-template] error:", err);
    return errorResponse(err?.message ?? "Internal error", 500, cors);
  }
});
