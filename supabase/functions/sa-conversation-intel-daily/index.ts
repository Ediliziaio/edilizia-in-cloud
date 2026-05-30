/**
 * sa-conversation-intel-daily — MP-SILVIO-SA-INTEL-01
 *
 * Cron notturno (INTERNAL_CRON_SECRET). Per ogni azienda con messaggi UTENTE→Silvio
 * nelle ultime 24h, li classifica con aiRouterComplete (tier economico) in una
 * tassonomia FISSA e salva SOLO il segnale aggregato e anonimo in
 * sa_conversation_signals. MAI il testo grezzo con PII. Poi ricalcola il profilo
 * intel (sa_compute_company_intel). READ del raw resta nell'azienda col suo RLS.
 */

import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { isInternalRequest, requireInternalSecret, requireAuth } from "../_shared/auth.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SILVIO_SENDER_ID = "00000000-0000-0000-0000-000000000002";
const MAX_COMPANIES = 30;
const MAX_MSGS_PER_COMPANY = 60;
const AREE = ["margini", "cashflow", "vendita", "marketing", "preventivi", "cantiere", "fatturazione", "hr", "magazzino", "compliance", "altro"];
const INTENTI = ["difficolta", "domanda", "richiesta_funzione", "lamentela"];

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    if (isInternalRequest(req)) requireInternalSecret(req, cors);
    else await requireAuth(req, cors); // super_admin debug

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin: any = createClient(
      Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const body = await req.json().catch(() => ({}));
    const onlyCompany: string | null = body?.company_id ?? null;

    // aziende con messaggi utente→Silvio nelle ultime 24h
    const { data: rows, error } = await admin.rpc("sa_companies_with_recent_silvio_msgs", { p_hours: 24, p_limit: MAX_COMPANIES });
    if (error) return errorResponse(`rpc companies: ${error.message}`, 500, cors);
    let companies: string[] = (rows ?? []).map((r: { company_id: string }) => r.company_id);
    if (onlyCompany) companies = [onlyCompany];

    let processed = 0, signals = 0, failed = 0;
    for (const companyId of companies) {
      try {
        const { data: msgs } = await admin.rpc("sa_recent_silvio_user_messages", { p_company_id: companyId, p_hours: 24, p_limit: MAX_MSGS_PER_COMPANY });
        const texts: string[] = (msgs ?? []).map((m: { content: string }) => (m.content ?? "").slice(0, 400)).filter(Boolean);
        if (texts.length === 0) continue;

        const sys = `Sei un classificatore di segnali. Ricevi messaggi che imprenditori edili hanno scritto al loro assistente AI. Estrai SOLO segnali aggregati, MAI il testo originale.

OUTPUT JSON ESATTO: {"signals":[{"area": <una di: ${AREE.join("|")}>, "intento": <una di: ${INTENTI.join("|")}>, "peso": <int, quante occorrenze>, "esempio_anonimo": "<1 frase RIASSUNTA, senza nomi propri, ragioni sociali, importi, indirizzi>"}]}

REGOLE FERREE:
- Raggruppa per (area,intento): un solo oggetto per coppia, con peso = numero di messaggi.
- esempio_anonimo: parafrasi neutra (es. "dubbi sul margine di una commessa"). MAI copiare la frase. MAI nomi/importi/indirizzi.
- Se un messaggio non è un segnale d'azienda (saluti, test), ignoralo.
- Massimo 8 oggetti.`;

        const ai = await aiRouterComplete({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          supabase: admin as any,
          taskKey: "text_summarize",
          messages: [{ role: "system", content: sys }, { role: "user", content: `MESSAGGI:\n- ${texts.join("\n- ")}\n\nClassifica in JSON.` }],
          params: { temperature: 0.1, max_tokens: 700 },
          responseFormat: { type: "json_object" },
          companyId,
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let parsed: { signals?: Array<{ area: string; intento: string; peso: number; esempio_anonimo?: string }> };
        try { parsed = JSON.parse((ai as { content?: string })?.content ?? "{}"); } catch { continue; }

        for (const s of (parsed.signals ?? [])) {
          const area = AREE.includes(s.area) ? s.area : "altro";
          const intento = INTENTI.includes(s.intento) ? s.intento : "domanda";
          const peso = Math.max(1, Math.min(99, Number(s.peso) || 1));
          await admin.from("sa_conversation_signals").upsert({
            company_id: companyId, giorno: new Date().toISOString().slice(0, 10),
            area, intento, peso, esempio_anonimo: (s.esempio_anonimo ?? "").slice(0, 200) || null,
          }, { onConflict: "company_id,giorno,area,intento" });
          signals++;
        }
        await admin.rpc("sa_compute_company_intel", { p_company_id: companyId });
        processed++;
      } catch (e) {
        failed++;
        console.error(`[sa-intel] company ${companyId} fail`, e instanceof Error ? e.message : String(e));
      }
    }
    return jsonResponse({ ok: true, companies: companies.length, processed, signals, failed }, 200, cors);
  } catch (e) {
    if (e instanceof Response) return e;
    return errorResponse(`Fatal: ${e instanceof Error ? e.message : String(e)}`, 500, cors);
  }
});
