/**
 * MP-OPS-08 — AI Genera POS / DUVRI (on-demand)
 *
 * Body:
 *   { cantiere_id: uuid, company_id: uuid, document_type?: 'pos'|'duvri', force_regenerate?: boolean }
 *
 * Flow:
 *   1. Carica anagrafica cantiere + computo metrico + operai allocati
 *   2. Persona compliance compone le 8 sezioni POS (placeholder; in prod LLM)
 *   3. Salva in pos_documents via RPC
 *   4. Crea action_proposal RED per firma RSPP
 *
 * Defensive: assenza moduli computo → sezioni con placeholder.
 */
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let body: {
    cantiere_id?: string;
    company_id?: string;
    document_type?: "pos" | "duvri";
    force_regenerate?: boolean;
  } = {};

  try {
    body = await req.json();
  } catch {
    return jsonOk({ ok: false, error: "invalid_json" }, 400);
  }

  if (!body.cantiere_id || !body.company_id) {
    return jsonOk({ ok: false, error: "missing_required_fields" }, 400);
  }

  const docType = body.document_type ?? "pos";
  const t0 = Date.now();

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rpcName = docType === "pos" ? "silvio_tool_genera_pos_cantiere" : "silvio_tool_genera_duvri_cantiere";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rpcRes } = docType === "pos"
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? await (supabase as any).rpc(rpcName, {
        p_company_id: body.company_id,
        p_cantiere_id: body.cantiere_id,
        p_force_regenerate: body.force_regenerate ?? false,
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      : await (supabase as any).rpc(rpcName, {
        p_company_id: body.company_id,
        p_cantiere_id: body.cantiere_id,
      });

    const docId = (rpcRes as { pos_id?: string; duvri_id?: string } | null)?.pos_id ??
                  (rpcRes as { pos_id?: string; duvri_id?: string } | null)?.duvri_id;

    if (!docId) {
      return jsonOk({ ok: false, error: "rpc_returned_no_id", duration_ms: Date.now() - t0 }, 500);
    }

    // Skeleton sezioni AI (in produzione: LLM persona compliance)
    const sezioni = {
      identificazione_cantiere: { generated_by: "ai_skeleton" },
      organizzazione_cantiere: { generated_by: "ai_skeleton" },
      individuazione_rischi: { rischi: ["caduta_dall_alto", "investimento", "elettrico"] },
      misure_prevenzione: { misure: ["ponteggi_a_norma", "DPI_obbligatori", "formazione_specifica"] },
      dpi_required: ["casco", "scarpe_antinfortunistiche", "imbragatura_se_quota"],
      formazioni_required: ["sicurezza_generale_4h", "sicurezza_specifica_12h"],
      cronoprogramma: { fasi: [] },
      riferimenti_normativi: ["D.Lgs 81/08", "Allegato XV"],
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("pos_documents")
      .update({
        identificazione_cantiere: sezioni.identificazione_cantiere,
        organizzazione_cantiere: sezioni.organizzazione_cantiere,
        individuazione_rischi: sezioni.individuazione_rischi,
        misure_prevenzione: sezioni.misure_prevenzione,
        dpi_required: sezioni.dpi_required,
        formazioni_required: sezioni.formazioni_required,
        cronoprogramma: sezioni.cronoprogramma,
        riferimenti_normativi: sezioni.riferimenti_normativi,
        ai_persona_used: "compliance",
        ai_cost_billed_eur: docType === "pos" ? 0.08 : 0.05,
      })
      .eq("id", docId);

    return jsonOk({
      ok: true,
      document_id: docId,
      document_type: docType,
      sezioni_generate: 8,
      next_step: "firma RSPP via action_proposal",
      duration_ms: Date.now() - t0,
    });
  } catch (e) {
    return jsonOk(
      { ok: false, error: (e as Error).message, duration_ms: Date.now() - t0 },
      500,
    );
  }
});

function jsonOk(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
