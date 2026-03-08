import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, secureHeaders } from "../_shared/headers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    if (!lovableApiKey) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Verify caller
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    let userId: string | null = null;
    try {
      const { data: claimsData } = await (userClient.auth as any).getClaims(token);
      userId = claimsData?.claims?.sub || null;
    } catch {}
    if (!userId) {
      const { data: { user } } = await userClient.auth.getUser();
      userId = user?.id || null;
    }
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const { message_id, company_id } = await req.json();
    if (!message_id || !company_id) {
      return new Response(JSON.stringify({ error: "message_id and company_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch message
    const { data: message, error: msgErr } = await adminClient
      .from("messaging_messages")
      .select("*, messaging_conversations(*)")
      .eq("id", message_id)
      .single();

    if (msgErr || !message) {
      return new Response(JSON.stringify({ error: "Message not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const textToAnalyze = message.transcription || message.content || "";
    if (!textToAnalyze.trim()) {
      return new Response(JSON.stringify({ error: "No text to analyze" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: textToAnalyze },
        ],
        tools: [
          {
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
          },
        ],
        tool_choice: { type: "function", function: { name: "analyze_message" } },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);

      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, riprova tra poco." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Crediti AI esauriti." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Update AI run as failed
      await adminClient
        .from("messaging_ai_runs")
        .update({ status: "error", ai_output: { error: errText } })
        .eq("id", aiRun.id);

      throw new Error("AI gateway error");
    }

    const aiResponse = await response.json();
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
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-message error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
