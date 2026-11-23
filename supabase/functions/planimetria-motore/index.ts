/**
 * planimetria-motore — biglietti per il render fotorealistico e il DWG online.
 * Tutta la logica è in `gestore.ts` (provata senza database in
 * src/test/logic/planimetrieMotoreGestore.test.ts).
 *
 * Segreti della funzione: PLANIMETRIE_MOTORE_SEGRETO (lo stesso del container)
 * e PLANIMETRIE_MOTORE_URL (indirizzo pubblico del container). Senza, risponde
 * 503 e l'app mostra il render come «non ancora attivo».
 */
import { requireAuth } from "../_shared/auth.ts";
import { getCorsHeaders, jsonResponse } from "../_shared/headers.ts";
import { verificaPermessoAzienda } from "../_shared/permessoAzienda.ts";
import { deductRenderCreditSafe, refundRenderCreditSafe } from "../_shared/renderCreditDeduct.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { gestisci } from "./gestore.ts";

const NOME = "planimetria-motore";

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return jsonResponse({ error: "Usa POST." }, 405, cors);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const corpo = await req.json().catch(() => null);
    const { stato, corpo: risposta } = await gestisci(corpo, {
      segreto: Deno.env.get("PLANIMETRIE_MOTORE_SEGRETO"),
      urlMotore: Deno.env.get("PLANIMETRIE_MOTORE_URL"),
      adesso: () => Date.now(),
      nuovoId: () => crypto.randomUUID(),
      autentica: async () => (await requireAuth(req, cors)).userId,
      verificaPermesso: (utente, azienda) => verificaPermessoAzienda(admin, utente, azienda, ["can_view_render_ai"], "il render fotorealistico"),
      scalaCredito: async ({ azienda, sessione, utente }) => (await deductRenderCreditSafe(admin, {
        companyId: azienda, sessionId: sessione, userId: utente,
        reasonMeta: { edge_fn: NOME, tipo: "render_cycles" }, logTag: NOME,
      })).status,
      rimborsaCredito: async ({ azienda, sessione, utente }) => (await refundRenderCreditSafe(admin, {
        companyId: azienda, sessionId: sessione, userId: utente,
        reasonMeta: { edge_fn: NOME, motivo: "render_cycles_fallito" }, logTag: NOME,
      })).status,
    });
    return jsonResponse(risposta, stato, cors);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(`[${NOME}]`, e instanceof Error ? e.message : e);
    return jsonResponse({ error: "Motore planimetrie non disponibile: riprova tra poco." }, 500, cors);
  }
});
