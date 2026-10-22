/**
 * distinta-proponi-scomposizioni — Le voci del computo che la libreria non sa
 * ancora tradurre in materiali (es. «punto presa 10/16 A»): l'AI propone i
 * componenti per una unità della voce. Ogni proposta entra in
 * scomposizioni_voce con origine 'ai' e NON attiva: si usa solo dopo che un
 * tecnico che valida le distinte l'ha controllata e approvata.
 *
 * Input:  { company_id, voci: [{ id, codice_prezzario?, descrizione_breve, descrizione_estesa?, unita_misura? }] }
 *         (al massimo 12 voci per chiamata, dalla stessa azienda)
 * Output: { success, create: n, scomposizioni: [{ id, voce_id, nome, componenti }], senza_materiali: [voce_id] }
 *
 * Gli errori del provider (credito finito, chiave rifiutata) li segnala
 * aiRouterComplete con segnalaErroreAI nel catch di ogni tentativo.
 */
import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";
import { buildStableAiIdempotencyKey } from "../_shared/directAiLedger.ts";
import { leggiJson, messaggioVoci, pulisciScomposizioni, PROMPT_SCOMPOSIZIONI, type VoceDaScomporre } from "../_shared/distintaAI.ts";

const MAX_VOCI = 12;

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return errorResponse("POST only", 405, cors);

  try {
    const { userId, supabaseAdmin } = await requireAuth(req, cors);
    const body = await req.json().catch(() => ({}));
    const companyId = String(body?.company_id ?? "");
    const richieste = Array.isArray(body?.voci) ? (body.voci as VoceDaScomporre[]) : [];
    if (!companyId) return errorResponse("company_id required", 400, cors);
    if (!richieste.length) return errorResponse("Nessuna voce da scomporre", 400, cors);
    if (richieste.length > MAX_VOCI) return errorResponse(`Al massimo ${MAX_VOCI} voci per volta`, 400, cors);
    await requireCompanyAccess(supabaseAdmin, userId, companyId, cors);

    const permessi = await Promise.all(["can_edit_orders", "can_validate_bom"].map((p) =>
      supabaseAdmin.rpc("has_permission_for_company", { _user_id: userId, _permission: p, _company_id: companyId })));
    if (!permessi.some((r: { data: unknown }) => r.data === true)) {
      return errorResponse("Non hai il permesso di preparare le distinte materiali", 403, cors);
    }

    // Le voci si rileggono dal database: si scompone solo ciò che è davvero
    // nel computo di questa azienda, non quello che arriva dal browser.
    const ids = [...new Set(richieste.map((v) => String(v?.id ?? "")).filter(Boolean))];
    const { data: voci, error: vociErr } = await supabaseAdmin
      .from("computo_voci_estratte")
      .select("id, codice_prezzario, descrizione_breve, descrizione_estesa, unita_misura")
      .eq("company_id", companyId)
      .in("id", ids);
    if (vociErr) return errorResponse(vociErr.message, 500, cors);
    if (!voci?.length) return errorResponse("Voci non trovate", 404, cors);

    const idempotencyKey = await buildStableAiIdempotencyKey("distinta_proponi_scomposizioni", [
      companyId, userId, ...ids.sort(),
    ]);
    const ai = await aiRouterComplete({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: supabaseAdmin as any,
      taskKey: "preventivo_genera",
      messages: [
        { role: "system", content: PROMPT_SCOMPOSIZIONI },
        { role: "user", content: messaggioVoci(voci as VoceDaScomporre[]) },
      ],
      params: { temperature: 0.1, max_tokens: 6000 },
      responseFormat: { type: "json_object" },
      companyId,
      userId,
      idempotencyKey,
    });

    const proposte = pulisciScomposizioni(leggiJson(ai.content ?? ""), voci.map((v: { id: string }) => v.id));
    if (!proposte.length) return errorResponse("L'AI non ha restituito proposte leggibili: riprova", 502, cors);

    const create: { id: string; voce_id: string; nome: string; componenti: number }[] = [];
    const senzaMateriali: string[] = [];
    for (const p of proposte) {
      if (!p.componenti.length) { senzaMateriali.push(p.voce_id); continue; }
      const voce = voci.find((v: { id: string }) => v.id === p.voce_id) as VoceDaScomporre;
      const codice = (voce.codice_prezzario ?? "").trim() || null;
      const parole = p.parole_chiave.length ? p.parole_chiave : [voce.descrizione_breve.slice(0, 40)];
      const { data: s, error: sErr } = await supabaseAdmin
        .from("scomposizioni_voce")
        .insert({
          company_id: companyId,
          nome: p.nome,
          codice_prezzario: codice,
          parole_chiave: codice ? [] : parole,
          unita_misura: voce.unita_misura ?? null,
          categoria: p.componenti.find((c) => c.categoria)?.categoria ?? null,
          attiva: false,
          origine: "ai",
          note: [p.note, `Proposta dall'AI per «${voce.descrizione_breve.slice(0, 160)}»: da controllare prima di approvarla.`]
            .filter(Boolean).join("\n"),
          creata_da: userId,
        })
        .select("id")
        .single();
      if (sErr || !s?.id) return errorResponse(sErr?.message ?? "Scomposizione non salvata", 500, cors);
      const { error: cErr } = await supabaseAdmin.from("scomposizioni_voce_componenti").insert(
        p.componenti.map((c, i) => ({ ...c, scomposizione_id: s.id, company_id: companyId, ordine: i })),
      );
      if (cErr) return errorResponse(cErr.message, 500, cors);
      create.push({ id: s.id, voce_id: p.voce_id, nome: p.nome, componenti: p.componenti.length });
    }

    return jsonResponse({
      success: true,
      create: create.length,
      scomposizioni: create,
      senza_materiali: senzaMateriali,
      ai_meta: { model_used: ai.modelUsed, tokens: ai.totalTokens },
    }, 200, cors);
  } catch (err) {
    if (err instanceof Response) return err;
    return errorResponse(err instanceof Error ? err.message : String(err), 500, getCorsHeaders(req));
  }
});
