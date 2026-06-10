/**
 * ai-biz-card-ocr — FASE H.1
 *
 * Estrae dati strutturati da biglietto da visita (immagine).
 * Opzionalmente crea direttamente un contatto in marketing_contacts.
 *
 * Input:
 *   { image_base64: string, mime: string, company_id: uuid, auto_create_contact?: boolean }
 *
 * Output:
 *   { success, extracted: {...}, contact_created_id?: uuid, ai_meta }
 */

import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { gateAiPayment } from "../_shared/requirePaymentMethod.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";
import { buildStableAiIdempotencyKey } from "../_shared/directAiLedger.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = Record<string, any>;

const SYSTEM_PROMPT = `Sei un OCR specialista per biglietti da visita italiani.
Estrai i dati di contatto in JSON strutturato.

OUTPUT JSON ESATTO (no markdown, null se non leggibile):
{
  "first_name": "string | null",
  "last_name": "string | null",
  "company_name": "string | null",
  "ruolo_titolo": "string | null (es. 'CEO', 'Direttore Commerciale')",
  "email": "string | null",
  "phone": "string | null (formato +39 ...)",
  "phone_mobile": "string | null",
  "website": "string | null",
  "address": "string | null (via + numero)",
  "city": "string | null",
  "province": "string | null (sigla 2 lettere es. RM)",
  "postal_code": "string | null",
  "vat_number": "string | null (P.IVA)",
  "fiscal_code": "string | null (CF)",
  "social_linkedin": "string | null",
  "note_aggiuntive": "string | null",
  "confidenza_estrazione": "alta" | "media" | "bassa"
}`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }
  const cors = getCorsHeaders(req);

  try {
    if (req.method !== "POST") {
      return errorResponse("Metodo non consentito", 405, cors);
    }

    const { userId, supabaseAdmin } = await requireAuth(req, cors);

    const body = await req.json().catch(() => ({}));
    const { image_base64, mime, image_url, company_id, auto_create_contact } = body as {
      image_base64?: string;
      mime?: string;
      image_url?: string;
      company_id?: string;
      auto_create_contact?: boolean;
    };

    if (!company_id) return errorResponse("company_id obbligatorio", 400, cors);
    await requireCompanyAccess(supabaseAdmin, userId, company_id, cors);
    // Gate carta (audit AI 2026-06): strumento a costo senza controllo pagamento.
    const paymentBlock = await gateAiPayment(supabaseAdmin, company_id, cors);
    if (paymentBlock) return paymentBlock;
    if (!image_base64 && !image_url) {
      return errorResponse("image_base64 o image_url obbligatorio", 400, cors);
    }

    const imageContent = image_base64
      ? `data:${mime || "image/jpeg"};base64,${image_base64}`
      : image_url!;
    const imageFingerprint = image_base64
      ? await buildStableAiIdempotencyKey("biz_card_image", [image_base64])
      : image_url!;
    const idempotencyKey = await buildStableAiIdempotencyKey("biz_card_ocr", [
      company_id,
      userId,
      mime ?? null,
      imageFingerprint,
    ]);

    let aiResult;
    try {
      aiResult = await aiRouterComplete({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: supabaseAdmin as any,
        taskKey: "biz_card_ocr",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: "Estrai i dati di contatto da questo biglietto da visita." },
              { type: "image_url", image_url: { url: imageContent } },
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ] as any,
          },
        ],
        params: { temperature: 0.05, max_tokens: 600 },
        responseFormat: { type: "json_object" },
        companyId: company_id,
        userId,
        idempotencyKey,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return errorResponse(`AI Router error: ${msg}`, 502, cors);
    }

    let extracted: AnyObj;
    try {
      extracted = JSON.parse(aiResult.content);
    } catch {
      return errorResponse("AI ha restituito JSON non valido", 502, cors);
    }

    let contactCreatedId: string | null = null;
    if (auto_create_contact) {
      // Need at least name or company
      if (extracted.first_name || extracted.last_name || extracted.company_name) {
        const email = extracted.email ? String(extracted.email).trim().toLowerCase() : null;
        const phone = extracted.phone_mobile ?? extracted.phone
          ? String(extracted.phone_mobile ?? extracted.phone).trim()
          : null;
        let existingContactId: string | null = null;
        if (email) {
          const { data: existingByEmail } = await supabaseAdmin
            .from("marketing_contacts")
            .select("id")
            .eq("company_id", company_id)
            .ilike("email", email)
            .maybeSingle();
          existingContactId = existingByEmail?.id ?? null;
        }
        if (!existingContactId && phone) {
          const { data: existingByPhone } = await supabaseAdmin
            .from("marketing_contacts")
            .select("id")
            .eq("company_id", company_id)
            .or(`phone.eq.${phone},phone_mobile.eq.${phone}`)
            .maybeSingle();
          existingContactId = existingByPhone?.id ?? null;
        }
        if (existingContactId) {
          contactCreatedId = existingContactId;
        } else {
        const tagsArr = ["biz_card_ai", "import_ocr"];
        if (extracted.ruolo_titolo) tagsArr.push(`ruolo_${String(extracted.ruolo_titolo).toLowerCase().slice(0, 30)}`);

        const { data: created, error: createErr } = await supabaseAdmin
          .from("marketing_contacts")
          .insert({
            company_id,
            first_name: extracted.first_name,
            last_name: extracted.last_name,
            company_name: extracted.company_name,
            email: extracted.email,
            phone: extracted.phone_mobile ?? extracted.phone,
            website: extracted.website,
            address: extracted.address,
            city: extracted.city,
            province: extracted.province,
            postal_code: extracted.postal_code,
            vat_number: extracted.vat_number,
            fiscal_code: extracted.fiscal_code,
            tags: tagsArr,
            source: "biz_card_ai",
            notes: extracted.note_aggiuntive ?? null,
          })
          .select("id")
          .single();
        if (!createErr && created) contactCreatedId = created.id;
        }
      }
    }

    return jsonResponse({
      success: true,
      extracted,
      contact_created_id: contactCreatedId,
      ai_meta: {
        model_used: aiResult.modelUsed,
        tokens: aiResult.totalTokens,
        cost_billed_eur: aiResult.costBilledEur,
      },
    }, 200, cors);
  } catch (err) {
    if (err instanceof Response) return err;
    return errorResponse(`Errore interno: ${err instanceof Error ? err.message : String(err)}`, 500, getCorsHeaders(req));
  }
});
