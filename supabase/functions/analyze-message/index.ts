import { getCorsHeaders } from "../_shared/headers.ts";
import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    const corsHeaders = getCorsHeaders(req);
    const auth = await requireAuth(req, corsHeaders);
    const userId = auth.userId;
    const adminClient = auth.supabaseAdmin;

    const { message_id, company_id } = await req.json();
    if (!message_id || !company_id) {
      return new Response(JSON.stringify({ error: "message_id and company_id required" }), {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    await requireCompanyAccess(adminClient, userId, company_id, corsHeaders);

    // Fetch message
    const { data: message, error: msgErr } = await adminClient
      .from("messaging_messages")
      .select("*, messaging_conversations(*)")
      .eq("id", message_id)
      .eq("company_id", company_id)
      .single();

    if (msgErr || !message) {
      return new Response(JSON.stringify({ error: "Message not found" }), {
        status: 404,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const textToAnalyze = message.transcription || message.content || "";
    if (!textToAnalyze.trim()) {
      return new Response(JSON.stringify({ error: "No text to analyze" }), {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Create pending AI run
    const { data: aiRun, error: aiRunErr } = await adminClient
      .from("messaging_ai_runs")
      .insert({
        message_id,
        company_id,
        raw_input: textToAnalyze,
        status: "pending",
      })
      .select()
      .single();

    if (aiRunErr) {
      console.error("Error creating AI run:", aiRunErr);
      throw new Error("Failed to create AI run");
    }

    // Fetch company context (orders, customers, employees) - limited for prompt size
    const [ordersRes, customersRes, employeesRes] = await Promise.all([
      adminClient
        .from("orders")
        .select("id, description, order_code, current_status_id, customer_id")
        .eq("company_id", company_id)
        .limit(50),
      adminClient
        .from("profiles")
        .select("id, first_name, last_name, phone, address, site_address")
        .eq("company_id", company_id)
        .limit(50),
      adminClient
        .from("employees")
        .select("id, first_name, last_name, role_type")
        .eq("company_id", company_id)
        .eq("is_active", true)
        .limit(50),
    ]);

    const contextData = {
      orders: ordersRes.data || [],
      customers: customersRes.data || [],
      employees: employeesRes.data || [],
    };

    const systemPrompt = `Sei un assistente AI per un gestionale edile italiano. Analizzi messaggi ricevuti da clienti, operai e collaboratori.

CONTESTO AZIENDALE:
Ordini attivi: ${JSON.stringify(contextData.orders)}
Clienti: ${JSON.stringify(contextData.customers)}
Dipendenti: ${JSON.stringify(contextData.employees)}

Info conversazione:
- Tipo contatto: ${message.messaging_conversations?.contact_type || "sconosciuto"}
- Nome contatto: ${message.messaging_conversations?.contact_name || "Sconosciuto"}
- Telefono: ${message.messaging_conversations?.phone_number || "N/A"}

ISTRUZIONI:
Analizza il messaggio e usa la funzione analyze_message per restituire il risultato strutturato.
- Cerca di abbinare il messaggio a un'entita' nota (ordine, cliente, dipendente) usando il contesto.
- Se non trovi un match preciso, usa confidence bassa.
- Identifica l'intent principale del messaggio.
- Suggerisci azioni concrete.`;

    const analysisTool = {
      type: "function",
      function: {
        name: "analyze_message",
        description: "Analizza un messaggio e restituisce entita', intent e azioni suggerite.",
        parameters: {
          type: "object",
          properties: {
            matched_entity: {
              type: "object",
              properties: {
                type: { type: "string", enum: ["cliente", "cantiere", "ordine", "dipendente", "nessuno"] },
                id: { type: "string", description: "UUID dell'entita' se trovata, null altrimenti" },
                name: { type: "string", description: "Nome dell'entita' trovata" },
                confidence: { type: "number", description: "Livello di confidenza 0-1" },
              },
              required: ["type", "confidence"],
            },
            intent: {
              type: "string",
              enum: [
                "problema_cantiere",
                "materiale_mancante",
                "report_lavoro",
                "aggiornamento_stato",
                "urgenza_ordine",
                "richiesta_informazioni",
                "altro",
              ],
            },
            priority: { type: "string", enum: ["bassa", "normale", "alta", "urgente"] },
            summary: { type: "string", description: "Riassunto breve del messaggio (max 100 caratteri)" },
            action_suggestions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  type: { type: "string", enum: ["create_task", "create_daily_report", "change_order_status", "notify", "none"] },
                  title: { type: "string" },
                  description: { type: "string" },
                  priority: { type: "string", enum: ["bassa", "normale", "alta", "urgente"] },
                  assign_to: { type: "string", description: "Ruolo o nome suggerito" },
                },
                required: ["type", "title"],
              },
            },
          },
          required: ["matched_entity", "intent", "priority", "summary", "action_suggestions"],
          additionalProperties: false,
        },
      },
    };

    let aiResponse: any;
    try {
      const aiResult = await aiRouterComplete({
        supabase: adminClient,
        taskKey: "message_analysis",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: textToAnalyze },
        ],
        params: {
          temperature: 0.1,
          max_tokens: 1600,
          tools: [analysisTool],
          tool_choice: { type: "function", function: { name: "analyze_message" } },
        },
        companyId: company_id,
        userId,
        estimatedCostEur: 0.05,
        idempotencyKey: `message_analysis_${message_id}`,
      });
      aiResponse = aiResult.rawResponse;
    } catch (aiErr) {
      const aiMsg = aiErr instanceof Error ? aiErr.message : String(aiErr);
      await adminClient
        .from("messaging_ai_runs")
        .update({ status: "error", ai_output: { error: aiMsg } })
        .eq("id", aiRun.id);
      throw aiErr;
    }
    let aiOutput: any = null;

    // Extract tool call result
    const toolCall = aiResponse.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try {
        aiOutput = JSON.parse(toolCall.function.arguments);
      } catch {
        aiOutput = { raw: toolCall.function.arguments };
      }
    }

    if (!aiOutput) {
      await adminClient
        .from("messaging_ai_runs")
        .update({ status: "error", ai_output: { error: "No structured output" } })
        .eq("id", aiRun.id);

      return new Response(JSON.stringify({ error: "AI did not return structured output" }), {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Update AI run with results
    await adminClient
      .from("messaging_ai_runs")
      .update({
        ai_output: aiOutput,
        confidence: aiOutput.matched_entity?.confidence || 0,
        intent: aiOutput.intent,
        status: "completed",
      })
      .eq("id", aiRun.id);

    // Mark message as AI processed
    await adminClient
      .from("messaging_messages")
      .update({ ai_processed: true })
      .eq("id", message_id);

    return new Response(JSON.stringify({ success: true, ai_run_id: aiRun.id, result: aiOutput }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-message error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
