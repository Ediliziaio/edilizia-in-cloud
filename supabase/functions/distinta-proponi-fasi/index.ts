/**
 * distinta-proponi-fasi — Nella generazione dei materiali, i capitoli del
 * computo che il confronto per parole non sa mettere in una fase: l'AI propone
 * per ognuno la fase della commessa (o il nome di una fase nuova), con un
 * motivo e la confidenza. È solo un suggerimento: nell'anteprima l'utente lo
 * cambia, e niente si salva da qui.
 *
 * Input:  { company_id, order_id, capitoli: [{ nome, esempi: [descrizioni di voce] }] }
 *         (al massimo 40 capitoli)
 * Output: { success, proposte: [{ capitolo, phase_id, nuova_fase, motivo, confidenza }] }
 *
 * Gli errori del provider (credito finito, chiave rifiutata) li segnala
 * aiRouterComplete con segnalaErroreAI nel catch di ogni tentativo.
 */
import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";
import { buildStableAiIdempotencyKey } from "../_shared/directAiLedger.ts";
import { leggiJson } from "../_shared/distintaAI.ts";
import {
  MAX_CAPITOLI, messaggioFasi, PROMPT_FASI, pulisciProposteFasi,
  type CapitoloDaAbbinare, type FaseEsistente,
} from "../_shared/distintaFasiAI.ts";

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return errorResponse("POST only", 405, cors);

  try {
    const { userId, supabaseAdmin } = await requireAuth(req, cors);
    const body = await req.json().catch(() => ({}));
    const companyId = String(body?.company_id ?? "");
    const orderId = String(body?.order_id ?? "");
    const capitoli: CapitoloDaAbbinare[] = (Array.isArray(body?.capitoli) ? body.capitoli : [])
      .map((c: { nome?: unknown; esempi?: unknown }) => ({
        nome: String(c?.nome ?? "").trim().slice(0, 200),
        esempi: (Array.isArray(c?.esempi) ? c.esempi : []).map((e: unknown) => String(e ?? "").slice(0, 200)).filter(Boolean).slice(0, 5),
      }))
      .filter((c: CapitoloDaAbbinare) => c.nome);
    if (!companyId || !orderId) return errorResponse("company_id e order_id obbligatori", 400, cors);
    if (!capitoli.length) return errorResponse("Nessun capitolo da abbinare", 400, cors);
    if (capitoli.length > MAX_CAPITOLI) return errorResponse(`Al massimo ${MAX_CAPITOLI} capitoli per volta`, 400, cors);
    await requireCompanyAccess(supabaseAdmin, userId, companyId, cors);

    const permessi = await Promise.all(["can_edit_orders", "can_validate_bom"].map((p) =>
      supabaseAdmin.rpc("has_permission_for_company", { _user_id: userId, _permission: p, _company_id: companyId })));
    if (!permessi.some((r: { data: unknown }) => r.data === true)) {
      return errorResponse("Non hai il permesso di preparare i materiali", 403, cors);
    }

    // Le fasi si leggono dal database, solo se la commessa è dell'azienda.
    const { data: commessa } = await supabaseAdmin
      .from("orders").select("id").eq("id", orderId).eq("company_id", companyId).maybeSingle();
    if (!commessa) return errorResponse("Commessa non trovata", 404, cors);
    const { data: righeFasi, error: fasiErr } = await supabaseAdmin
      .from("order_work_phases").select("id, name").eq("order_id", orderId).order("position");
    if (fasiErr) return errorResponse(fasiErr.message, 500, cors);
    const fasi: FaseEsistente[] = (righeFasi ?? []).map((f: { id: string; name: string }) => ({ id: f.id, nome: f.name }));

    const idempotencyKey = await buildStableAiIdempotencyKey("distinta_proponi_fasi", [
      companyId, orderId, userId, ...fasi.map((f) => f.id).sort(), ...capitoli.map((c) => c.nome).sort(),
    ]);
    const ai = await aiRouterComplete({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: supabaseAdmin as any,
      taskKey: "preventivo_genera",
      messages: [
        { role: "system", content: PROMPT_FASI },
        { role: "user", content: messaggioFasi(capitoli, fasi) },
      ],
      params: { temperature: 0.1, max_tokens: 3000 },
      responseFormat: { type: "json_object" },
      companyId,
      userId,
      idempotencyKey,
    });

    const proposte = pulisciProposteFasi(leggiJson(ai.content ?? ""), capitoli.map((c) => c.nome), fasi);
    if (!proposte.length) return errorResponse("L'AI non ha restituito proposte leggibili: riprova", 502, cors);

    return jsonResponse({
      success: true,
      proposte,
      ai_meta: { model_used: ai.modelUsed, tokens: ai.totalTokens },
    }, 200, cors);
  } catch (err) {
    if (err instanceof Response) return err;
    return errorResponse(err instanceof Error ? err.message : String(err), 500, getCorsHeaders(req));
  }
});
