/**
 * planimetria-conta-simboli — Conta i simboli DISEGNATI di una tavola
 * d'impianto (punti luce, prese, rilevatori…) su UN riquadro dell'immagine.
 * Le tavole Archicad sono enormi (275×165 cm, centinaia di migliaia di linee):
 * il browser le disegna a riquadri con pdfjs e manda un riquadro per volta,
 * con la legenda della tavola (letta come testo) come guida.
 *
 * Il risultato è una STIMA con la sua confidenza: il browser somma i riquadri
 * e salva i conteggi in planimetrie_conteggi come bozza (metodo
 * 'ai_immagine'), da confermare a mano. Le sigle scritte (PA, T, TG…) non
 * passano da qui: si contano esattamente dal testo del PDF.
 *
 * Input:  { company_id, immagine: "data:image/jpeg;base64,…", legenda: string[], riquadro?: { riga, colonna } }
 * Output: { success, simboli: [{ simbolo, quantita, confidenza, note }] }
 *
 * Gli errori del provider li segnala aiRouterComplete (segnalaErroreAI nel
 * catch di ogni tentativo).
 */
import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";
import { leggiJson, promptSimboli, pulisciSimboli } from "../_shared/distintaAI.ts";

const MAX_IMMAGINE = 6 * 1024 * 1024;

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return errorResponse("POST only", 405, cors);

  try {
    const { userId, supabaseAdmin } = await requireAuth(req, cors);
    const body = await req.json().catch(() => ({}));
    const companyId = String(body?.company_id ?? "");
    const immagine = String(body?.immagine ?? "");
    const legenda = (Array.isArray(body?.legenda) ? body.legenda : [])
      .map((l: unknown) => String(l ?? "").trim())
      .filter((l: string) => l.length > 1)
      .slice(0, 60);
    if (!companyId) return errorResponse("company_id required", 400, cors);
    if (!/^data:image\/(jpeg|png|webp);base64,/.test(immagine)) return errorResponse("Immagine non valida", 400, cors);
    if (immagine.length > MAX_IMMAGINE) return errorResponse("Riquadro troppo grande", 413, cors);
    if (!legenda.length) return errorResponse("Serve la legenda della tavola: scegli i simboli da contare", 400, cors);
    await requireCompanyAccess(supabaseAdmin, userId, companyId, cors);

    const { data: puo } = await supabaseAdmin.rpc("has_permission_for_company", {
      _user_id: userId, _permission: "can_view_orders", _company_id: companyId,
    });
    if (puo !== true) return errorResponse("Non hai accesso alle commesse", 403, cors);

    const ai = await aiRouterComplete({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: supabaseAdmin as any,
      taskKey: "pdf_vision_extract",
      messages: [
        { role: "system", content: promptSimboli(legenda) },
        {
          role: "user",
          content: [
            { type: "text", text: `Riquadro ${body?.riquadro?.riga ?? "?"}-${body?.riquadro?.colonna ?? "?"} della tavola. Conta i simboli della legenda.` },
            { type: "image_url", image_url: { url: immagine } },
          ],
        },
      ],
      params: { temperature: 0, max_tokens: 2000 },
      responseFormat: { type: "json_object" },
      companyId,
      userId,
    });

    return jsonResponse({
      success: true,
      simboli: pulisciSimboli(leggiJson(ai.content ?? ""), legenda),
      ai_meta: { model_used: ai.modelUsed, tokens: ai.totalTokens },
    }, 200, cors);
  } catch (err) {
    if (err instanceof Response) return err;
    return errorResponse(err instanceof Error ? err.message : String(err), 500, getCorsHeaders(req));
  }
});
