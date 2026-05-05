import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";
import { fetchWithTimeout, isTimeoutError } from "../_shared/fetchWithTimeout.ts";
import { extractJsonFromLLM } from "../_shared/extractJson.ts";

/**
 * bank-categorize-ai: Categorizza transazioni ambigue usando Claude API.
 * Prende transazioni con categoria "Non categorizzata" o "Entrata" generica
 * e chiede a Claude di assegnare la categoria corretta.
 * Opzionalmente aggiorna le bank_categorization_rules per apprendimento.
 */

const CATEGORIES = [
  "Stipendi", "Affitti", "Fornitori", "Tasse & Tributi", "Utenze",
  "Assicurazioni", "Ristorazione", "Trasferte", "Bancario", "Clienti", "Entrata",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return errorResponse("Missing authorization", 401);
    const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) return errorResponse("Unauthorized", 401);

    const body = await req.json().catch(() => ({}));
    let companyId = body.company_id;
    const limit = body.limit || 20;
    const learnRules = body.learn_rules !== false; // default true

    if (!companyId) {
      const { data: profile } = await supabase.from("profiles").select("company_id").eq("id", user.id).single();
      companyId = profile?.company_id;
    }
    if (!companyId) return errorResponse("No company", 400);

    // Recupera API key Claude
    // claude_api_key non più richiesta — aiRouter usa OPENROUTER_API_KEY
    // (mantenuto check soft per backward-compat)

    // Transazioni da categorizzare
    const { data: transactions } = await supabase
      .from("bank_transactions")
      .select("id, description, creditor_name, debtor_name, amount, transaction_type, category")
      .eq("company_id", companyId)
      .in("category", ["Non categorizzata", "Entrata"])
      .eq("status", "booked")
      .order("booking_date", { ascending: false })
      .limit(limit);

    if (!transactions || transactions.length === 0) {
      return jsonResponse({ success: true, categorized: 0, message: "Nessuna transazione da categorizzare" });
    }

    // Regole custom esistenti (per contesto)
    const { data: customRules } = await supabase
      .from("bank_categorization_rules")
      .select("pattern, category")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .limit(50);

    // Prepara il prompt
    const txList = transactions.map((tx: any, i: number) => (
      `${i + 1}. "${tx.description || "N/A"}" | Creditore: "${tx.creditor_name || "N/A"}" | Debitore: "${tx.debtor_name || "N/A"}" | Importo: ${tx.amount}€ | Tipo: ${tx.transaction_type}`
    )).join("\n");

    const rulesContext = (customRules || []).length > 0
      ? `\nRegole personalizzate dell'azienda:\n${customRules!.map((r: any) => `- "${r.pattern}" → ${r.category}`).join("\n")}\n`
      : "";

    const prompt = `Sei un esperto contabile italiano. Categorizza queste transazioni bancarie.

Categorie disponibili: ${CATEGORIES.join(", ")}
${rulesContext}
Transazioni da categorizzare:
${txList}

Rispondi SOLO con un JSON array, dove ogni elemento ha: { "index": numero, "category": "NomeCategoria", "confidence": 0-100, "pattern": "pattern suggerito per regola futura" }
Esempio: [{"index": 1, "category": "Utenze", "confidence": 95, "pattern": "ENEL ENERGIA"}]`;

    // Migrato ad aiRouter: routing OpenRouter + charge_ai_call + ledger SuperAdmin
    let responseText = "";
    try {
      const { aiRouterComplete } = await import("../_shared/aiRouter.ts");
      const result = await aiRouterComplete({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: supabase as any,
        taskKey: "bank_categorize",
        messages: [{ role: "user", content: prompt }],
        params: { temperature: 0.1, max_tokens: 2000 },
        responseFormat: { type: "json_object" },
        companyId,
        userId: null, // bank-categorize is system-level, no user attribution
      });
      responseText = result.content;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes("timeout") || msg.toLowerCase().includes("aborted")) {
        return jsonResponse({ success: false, error: "Timeout servizio AI" }, 504);
      }
      throw new Error(`AI Router error: ${msg}`);
    }

    // P2-4: extractJsonFromLLM gestisce fence markdown + prosa + array.
    let results: Array<{ index: number; category: string; confidence: number; pattern?: string }>;
    try {
      results = extractJsonFromLLM(responseText);
    } catch {
      return jsonResponse({ success: false, error: "Risposta AI non parsabile", raw: responseText });
    }
    let categorized = 0;
    let rulesCreated = 0;

    for (const result of results) {
      const tx = transactions[result.index - 1];
      if (!tx || !CATEGORIES.includes(result.category)) continue;

      // Aggiorna la transazione
      await supabase
        .from("bank_transactions")
        .update({ category: result.category })
        .eq("id", tx.id);
      categorized++;

      // Crea regola se confidence alta e learn_rules attivo
      if (learnRules && result.confidence >= 85 && result.pattern) {
        const pattern = result.pattern.trim().toUpperCase();
        // Controlla se esiste già
        const { count } = await supabase
          .from("bank_categorization_rules")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .ilike("pattern", pattern);

        if ((count ?? 0) === 0) {
          await supabase.from("bank_categorization_rules").insert({
            company_id: companyId,
            pattern,
            category: result.category,
            category_icon: getCategoryIcon(result.category),
            priority: 50, // priorità media per regole AI
            is_active: true,
            is_case_sensitive: false,
          });
          rulesCreated++;
        }
      }
    }

    return jsonResponse({
      success: true,
      categorized,
      rules_created: rulesCreated,
      total_processed: transactions.length,
    });
  } catch (e) {
    console.error("bank-categorize-ai error:", e);
    return errorResponse(e.message, 500);
  }
});

function getCategoryIcon(category: string): string {
  const map: Record<string, string> = {
    Stipendi: "Users", Affitti: "Home", Fornitori: "Package",
    "Tasse & Tributi": "FileText", Utenze: "Zap", Assicurazioni: "Shield",
    Ristorazione: "UtensilsCrossed", Trasferte: "Plane", Bancario: "Landmark",
    Clienti: "TrendingUp", Entrata: "ArrowDownLeft",
  };
  return map[category] || "HelpCircle";
}
