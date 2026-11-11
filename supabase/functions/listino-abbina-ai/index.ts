/**
 * listino-abbina-ai (11/11/2026): proposta per significato nel popup «Collega al listino».
 *
 * Riceve una commessa e fino a 40 voci senza voce di listino; per ognuna sceglie i candidati
 * per parole in comune e chiede al modello quale sia la stessa lavorazione (o nessuna).
 * Restituisce proposte da confermare: niente viene scritto nel database.
 * Il modello passa dal router (`listino_abbina_voci`), che controlla il credito e segnala gli
 * errori del provider all'allarme del credito AI.
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { gateAiPayment } from "../_shared/requirePaymentMethod.ts";
import { buildStableAiIdempotencyKey } from "../_shared/directAiLedger.ts";
import { conRegoleDocumento, incorniciaTestoDocumento } from "../_shared/documentoNonFidato.ts";
import { erroreAiPerUtente } from "../_shared/erroriAi.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";
import { candidati, leggiRisposta, SISTEMA, testoRichiesta, type VoceListinoCandidata } from "../_shared/abbinaVociAI.ts";

const MAX_VOCI = 40;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405, corsHeaders);
  try {
    const auth = await requireAuth(req, corsHeaders);
    const userId = auth.userId;
    // deno-lint-ignore no-explicit-any
    const admin = auth.supabaseAdmin as any;
    const body = await req.json().catch(() => ({}));
    const orderId = String(body?.order_id ?? "");
    const ids: string[] = Array.isArray(body?.voce_ids) ? body.voce_ids.map(String).filter((x: string) => UUID.test(x)) : [];
    if (!UUID.test(orderId) || !ids.length) return errorResponse("Commessa o voci mancanti.", 400, corsHeaders);
    if (ids.length > MAX_VOCI) return errorResponse(`Al massimo ${MAX_VOCI} voci per volta.`, 400, corsHeaders);

    const { data: ordine } = await admin.from("orders").select("company_id").eq("id", orderId).maybeSingle();
    const companyId: string | null = ordine?.company_id ?? null;
    if (!companyId) return errorResponse("Commessa non trovata.", 404, corsHeaders);
    await requireCompanyAccess(admin, userId, companyId, corsHeaders);
    const { data: puo } = await admin.rpc("has_permission_for_company", { _user_id: userId, _permission: "can_edit_orders", _company_id: companyId });
    if (puo !== true) return errorResponse("Per collegare le voci al listino serve il permesso sulle commesse.", 403, corsHeaders);
    const blocco = await gateAiPayment(admin, companyId, corsHeaders);
    if (blocco) return blocco;

    const [{ data: voci, error: e1 }, { data: listino, error: e2 }] = await Promise.all([
      admin.from("order_work_phase_voci").select("id, descrizione, unita").eq("order_id", orderId).is("tariffa_id", null).in("id", ids),
      admin.from("tariffe_aziendali").select("id, nome, unita, codice")
        .eq("company_id", companyId).eq("attivo", true).is("subappaltatore_id", null).is("external_team_id", null).limit(5000),
    ]);
    if (e1 || e2) throw new Error("Non riesco a leggere le voci o il listino.");
    const elenco = (listino ?? []) as VoceListinoCandidata[];
    const blocchi = ((voci ?? []) as Array<{ id: string; descrizione: string | null; unita: string | null }>)
      .filter((v) => (v.descrizione ?? "").trim().length >= 3)
      .map((v) => ({ voce: { id: v.id, descrizione: v.descrizione!.trim(), unita: v.unita }, candidati: candidati({ id: v.id, descrizione: v.descrizione!, unita: v.unita }, elenco) }))
      .filter((b) => b.candidati.length > 0);
    if (!blocchi.length) return jsonResponse({ proposte: [], analizzate: 0, senza_candidati: ids.length }, 200, corsHeaders);

    const risultato = await aiRouterComplete({
      // deno-lint-ignore no-explicit-any
      supabase: admin as any,
      taskKey: "listino_abbina_voci",
      messages: [
        { role: "system", content: conRegoleDocumento(SISTEMA) },
        { role: "user", content: incorniciaTestoDocumento(testoRichiesta(blocchi)) },
      ],
      params: { temperature: 0, max_tokens: 3000 },
      responseFormat: { type: "json_object" },
      companyId,
      userId,
      idempotencyKey: await buildStableAiIdempotencyKey("listino_abbina_voci", [companyId, orderId, ...blocchi.map((b) => b.voce.id).sort()]),
    });
    const proposte = leggiRisposta(risultato.content || "{}", blocchi);
    return jsonResponse({ proposte, analizzate: blocchi.length, senza_candidati: ids.length - blocchi.length }, 200, corsHeaders);
  } catch (err) {
    if (err instanceof Response) return err;
    const noto = erroreAiPerUtente(err);
    if (noto) return jsonResponse(noto.body, noto.status, corsHeaders);
    console.error("[listino-abbina-ai]", err instanceof Error ? err.message : err);
    return errorResponse("La proposta con l'AI non è riuscita. Riprova tra poco.", 500, corsHeaders);
  }
});
