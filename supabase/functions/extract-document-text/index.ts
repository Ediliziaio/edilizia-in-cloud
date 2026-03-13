import { corsHeaders, secureHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let documentoId: string | undefined;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return errorResponse("Non autenticato", 401);
    }
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsErr } = await (userClient.auth as any).getClaims(
      authHeader.replace("Bearer ", "")
    );
    if (claimsErr || !claimsData?.claims?.sub) {
      return errorResponse("Non autenticato", 401);
    }

    const body = await req.json();
    documentoId = body.documentoId;

    if (!documentoId) return errorResponse("documentoId richiesto", 400);

    // Load document record
    const { data: doc, error: docErr } = await supabase
      .from("preventivo_kb_documenti")
      .select("*")
      .eq("id", documentoId)
      .single();

    if (docErr || !doc) return errorResponse("Documento non trovato", 404);

    // Update status
    await supabase
      .from("preventivo_kb_documenti")
      .update({ stato: "elaborazione" })
      .eq("id", documentoId);

    // Download file from storage
    const storagePath = doc.file_url;
    const { data: fileData, error: fileErr } = await supabase.storage
      .from("preventivo-kb")
      .download(storagePath);

    if (fileErr || !fileData) {
      throw new Error("File non scaricabile: " + fileErr?.message);
    }

    const arrayBuffer = await fileData.arrayBuffer();
    let pagineTesto: Array<{ pagina: number; testo: string }> = [];
    let totalePagine = 0;

    if (doc.file_type === "txt") {
      // Direct text extraction
      const testo = new TextDecoder().decode(arrayBuffer);
      pagineTesto = [{ pagina: 1, testo }];
      totalePagine = 1;
    } else if (doc.file_type === "pdf") {
      // Use Gemini Vision to extract text from PDF
      const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
      if (!geminiApiKey) throw new Error("GEMINI_API_KEY non configurata");

      const uint8 = new Uint8Array(arrayBuffer);
      let binary = "";
      const chunkSize = 8192;
      for (let i = 0; i < uint8.length; i += chunkSize) {
        binary += String.fromCharCode(...uint8.slice(i, i + chunkSize));
      }
      const base64 = btoa(binary);

      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${geminiApiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              role: "user",
              parts: [
                {
                  inline_data: {
                    mime_type: "application/pdf",
                    data: base64,
                  },
                },
                {
                  text: `Estrai tutto il testo da questo documento PDF mantenendo la struttura logica (titoli, paragrafi, liste, tabelle).
Restituisci un JSON con questa struttura:
{
  "pagine": [
    { "pagina": 1, "testo": "contenuto pagina 1" },
    { "pagina": 2, "testo": "contenuto pagina 2" }
  ],
  "totale_pagine": N
}
Restituisci SOLO il JSON valido, senza markdown.`,
                },
              ],
            }],
            generationConfig: { temperature: 0, maxOutputTokens: 8192 },
          }),
        }
      );

      if (!geminiRes.ok) {
        const errText = await geminiRes.text();
        console.error("Gemini error:", geminiRes.status, errText);
        throw new Error(`Errore estrazione Gemini: ${geminiRes.status}`);
      }

      const geminiData = await geminiRes.json();
      const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

      try {
        const cleaned = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        const parsed = JSON.parse(cleaned);
        pagineTesto = parsed.pagine || [];
        totalePagine = parsed.totale_pagine || pagineTesto.length;
      } catch {
        pagineTesto = [{ pagina: 1, testo: rawText }];
        totalePagine = 1;
      }
    } else {
      pagineTesto = [{ pagina: 1, testo: "Tipo file non supportato per estrazione diretta" }];
      totalePagine = 0;
    }

    // Update page count
    await supabase
      .from("preventivo_kb_documenti")
      .update({ pagine: totalePagine })
      .eq("id", documentoId);

    return jsonResponse({ pagineTesto, totalePagine, documentoId });
  } catch (err: any) {
    console.error("[extract-document-text]", err);
    if (documentoId) {
      try {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );
        await supabase
          .from("preventivo_kb_documenti")
          .update({ stato: "errore", errore_msg: err.message })
          .eq("id", documentoId);
      } catch {}
    }
    if (err instanceof Response) return err;
    return errorResponse(err.message || "Errore sconosciuto", 500);
  }
});
