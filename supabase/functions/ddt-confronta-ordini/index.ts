import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth } from "../_shared/auth.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";
import {
  preparaConfrontoDdt,
  validaConfrontoDdt,
  type ContestoDdtAI,
} from "../_shared/confrontoDdtOrdiniAI.ts";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST")
    return json({ error: "Metodo non consentito." }, 405);
  try {
    const { userId, supabaseAdmin } = await requireAuth(req, cors);
    const body = await req.text();
    if (body.length > 4000)
      return json({ error: "Richiesta troppo grande." }, 413);
    const input = JSON.parse(body);
    if (
      !uuid.test(input?.ddt_id ?? "") ||
      !uuid.test(input?.richiesta_id ?? "")
    )
      return json({ error: "Documento non valido." }, 400);
    const client = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
    const leggi = async () => {
      const { data, error } = await client.rpc("ddt_confronto_ai_contesto", {
        p_ddt: input.ddt_id,
      });
      if (error)
        throw Object.assign(new Error(error.message), {
          status: error.code === "42501" ? 403 : 400,
        });
      return data as ContestoDdtAI;
    };
    const c = await leggi();
    const result = await aiRouterComplete({
      supabase: supabaseAdmin,
      taskKey: "fattura_riconcilia",
      companyId: c.company_id,
      userId,
      messages: preparaConfrontoDdt(c),
      params: { temperature: 0, max_tokens: 10000, timeoutMs: 90_000 },
      responseFormat: { type: "json_object" },
      estimatedCostEur: 0.05,
      idempotencyKey: `ddt-confronto:v1:${c.company_id}:${userId}:${c.ddt_id}:${c.impronta}:${input.richiesta_id}`,
      guardProviderRequest: true,
    });
    const raw = JSON.parse(
      result.content
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, ""),
    );
    const righe = validaConfrontoDdt(raw, c);
    if ((await leggi()).impronta !== c.impronta)
      return json(
        {
          error:
            "La bolla o gli ordini sono cambiati durante l’analisi. Aggiorna il confronto.",
        },
        409,
      );
    return json({ righe, impronta: c.impronta });
  } catch (e) {
    if (e instanceof Response) return e;
    const error = e as { status?: number; message?: string };
    return json(
      {
        error:
          error.message ||
          "Analisi non disponibile. Nessun abbinamento salvato.",
      },
      error.status ?? 422,
    );
  }
});
