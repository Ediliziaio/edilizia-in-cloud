import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decrypt, getEncryptionKey } from "../_shared/encryption.ts";
import { getCorsHeaders } from "../_shared/headers.ts";
import { sanitizePhoneForQuery } from "../_shared/webhookSecurity.ts";

// ── Types ───────────────────────────────────────────────────────────────────
interface WhatsAppMessage {
  id: string;
  company_id: string;
  cantiere_id: string | null;
  operaio_id: string | null;
  wa_message_id: string;
  direction: string;
  from_phone: string;
  to_phone: string;
  message_type: string;
  content_text: string | null;
  media_url: string | null;
  media_storage_path: string | null;
  ai_intent: string | null;
  ai_confidence: number | null;
  ai_extracted_data: Record<string, unknown>;
  processing_status: string;
  session_id: string | null;
}

interface IntentResult {
  intent: string;
  confidence: number;
  extracted: Record<string, unknown>;
}

// ── Constants ───────────────────────────────────────────────────────────────
const OPENAI_API_URL = "https://api.openai.com/v1";

const INTENT_SYSTEM_PROMPT = `Sei un assistente AI per cantieri edili italiani. Classifica il messaggio dell'operaio in UNA di queste categorie: rapportino, ddt, foto_cantiere, presenze, segnalazione, domanda. Rispondi SOLO con JSON: { "intent": "...", "confidence": 0.95, "extracted": { ... } }

Per ogni intent, estrai i dati rilevanti nel campo "extracted":
- rapportino: { "data": "YYYY-MM-DD", "ore_lavorate": N, "ora_inizio": "HH:MM", "ora_fine": "HH:MM", "attivita": [...], "materiali_usati": [...], "mezzi_usati": [...], "note": "...", "condizioni_meteo": "..." }
- presenze: { "tipo": "entrata|uscita", "ora": "HH:MM", "note": "..." }
- segnalazione: { "urgenza": "alta|media|bassa", "descrizione": "...", "tipo_problema": "..." }
- domanda: { "domanda": "..." }
- foto_cantiere: { "descrizione": "...", "tags": [...] }
- ddt: { "descrizione": "..." }

Se il messaggio contiene un'immagine, considera che potrebbe essere un DDT o una foto cantiere.
Se il messaggio contiene audio, il testo fornito e' la trascrizione.`;

const DDT_EXTRACTION_PROMPT = `Analizza questa immagine di un DDT (Documento di Trasporto) di cantiere edile italiano.
Estrai i seguenti dati in formato JSON:
{
  "numero_ddt": "...",
  "data_ddt": "YYYY-MM-DD",
  "fornitore": "...",
  "righe": [
    { "descrizione": "...", "quantita": N, "unita_misura": "..." }
  ]
}
Se un campo non e' leggibile, usa null. Rispondi SOLO con il JSON.`;

const RAPPORTINO_EXTRACTION_PROMPT = `Analizza il messaggio dell'operaio e estrai i dati del rapportino giornaliero in formato JSON:
{
  "data": "YYYY-MM-DD",
  "ore_lavorate": N,
  "ora_inizio": "HH:MM",
  "ora_fine": "HH:MM",
  "attivita": ["..."],
  "materiali_usati": ["..."],
  "mezzi_usati": ["..."],
  "note": "...",
  "condizioni_meteo": "soleggiato|nuvoloso|pioggia|neve|vento"
}
Usa la data di oggi se non specificata. Rispondi SOLO con il JSON.`;

// ── Helpers ─────────────────────────────────────────────────────────────────

function normalizePhone(phone: string): string {
  return (phone || "").replace(/[^0-9]/g, "");
}

function getFileExtension(mimeType: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "audio/ogg": "ogg",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "application/pdf": "pdf",
    "video/mp4": "mp4",
  };
  return map[mimeType] || "bin";
}

async function callOpenAI(
  messages: Array<{ role: string; content: unknown }>,
  model = "gpt-4o",
  maxTokens = 1000
): Promise<string> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY non configurata");

  const res = await fetch(`${OPENAI_API_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature: 0.1,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

async function transcribeAudio(audioBuffer: Uint8Array, mimeType: string): Promise<string> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY non configurata");

  const ext = getFileExtension(mimeType);
  const formData = new FormData();
  formData.append("file", new Blob([audioBuffer], { type: mimeType }), `audio.${ext}`);
  formData.append("model", "whisper-1");
  formData.append("language", "it");

  const res = await fetch(`${OPENAI_API_URL}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Whisper API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.text || "";
}

// ── Main Handler ────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // ── Auth: x-cron-secret (internal service-to-service) ─────────────────
  const cronSecret = req.headers.get("x-cron-secret");
  const internalSecret =
    Deno.env.get("INTERNAL_CRON_SECRET") ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!cronSecret || cronSecret !== internalSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: jsonHeaders,
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let messageId: string | null = null;

  try {
    const body = await req.json();
    messageId = body.message_id;

    if (!messageId) {
      return new Response(
        JSON.stringify({ error: "Parametro message_id mancante" }),
        { status: 400, headers: jsonHeaders }
      );
    }

    // ── 1. Load whatsapp_message record ───────────────────────────────────
    const { data: message, error: msgErr } = await supabase
      .from("whatsapp_messages")
      .select("*")
      .eq("id", messageId)
      .single();

    if (msgErr || !message) {
      return new Response(
        JSON.stringify({ error: "Messaggio non trovato", details: msgErr?.message }),
        { status: 404, headers: jsonHeaders }
      );
    }

    const waMsg = message as WhatsAppMessage;

    // P1-1: lock condizionale anti double-processing.
    // Se il cron recovery e il webhook invocano il processor in parallelo,
    // solo chi riesce a spostare lo stato da 'received' → 'processing'
    // continua. L'altro riceve lockedRows=[] e ritorna skipped=true.
    const { data: lockedRows, error: lockErr } = await supabase
      .from("whatsapp_messages")
      .update({
        processing_status: "processing",
        last_processing_attempt_at: new Date().toISOString(),
      })
      .eq("id", messageId)
      .eq("processing_status", "received")
      .select("id");
    if (lockErr) {
      return new Response(
        JSON.stringify({ error: "Lock failed", details: lockErr.message }),
        { status: 500, headers: jsonHeaders },
      );
    }
    if (!lockedRows || lockedRows.length === 0) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "already processing or processed" }),
        { headers: jsonHeaders },
      );
    }

    // ── 2. identifyOperaio ──────────────────────────────────────────────
    const senderPhone = normalizePhone(waMsg.from_phone);
    let operaioId: string | null = waMsg.operaio_id;
    let companyId = waMsg.company_id;
    let operaioUserId: string | null = null;

    if (!operaioId) {
      // P2-2: sanitize phone + `.in()` al posto di `.or()` con
      // interpolazione raw nel DSL PostgREST. Stesso pattern di P0-7
      // su whatsapp-webhook.
      const cleanPhone = sanitizePhoneForQuery(senderPhone);
      if (!cleanPhone) {
        console.warn(`[whatsapp-ai-processor] phone non valido: ${senderPhone}`);
      } else {
        const digits = cleanPhone.replace(/\+/g, "");
        const phoneVariants = [digits, `+${digits}`];

        // Try phone_whatsapp first
        const { data: empByWa } = await supabase
          .from("employees")
          .select("id, company_id, user_id, phone_whatsapp, phone")
          .in("phone_whatsapp", phoneVariants)
          .eq("company_id", companyId)
          .maybeSingle();

        if (empByWa) {
          operaioId = empByWa.id;
          operaioUserId = empByWa.user_id;
        } else {
          // Fallback: employees.phone
          const { data: empByPhone } = await supabase
            .from("employees")
            .select("id, company_id, user_id, phone")
            .in("phone", phoneVariants)
            .eq("company_id", companyId)
            .maybeSingle();

          if (empByPhone) {
            operaioId = empByPhone.id;
            operaioUserId = empByPhone.user_id;
          }
        }
      }

      if (operaioId) {
        await supabase
          .from("whatsapp_messages")
          .update({ operaio_id: operaioId })
          .eq("id", messageId);
      }
    }

    // ── 3. determineCantiere ────────────────────────────────────────────
    let cantiereId: string | null = waMsg.cantiere_id;

    if (!cantiereId && operaioId) {
      // Check whatsapp_sessions for current cantiere
      const { data: session } = await supabase
        .from("whatsapp_sessions")
        .select("id, current_cantiere_id, state")
        .eq("phone_number", senderPhone)
        .eq("company_id", companyId)
        .maybeSingle();

      if (session?.current_cantiere_id) {
        cantiereId = session.current_cantiere_id;
      } else if (operaioUserId) {
        // Fallback: order_campo_assignments joined with orders where stato='in_corso'
        const { data: assignments } = await supabase
          .from("order_campo_assignments")
          .select("order_id, orders!inner(id, stato)")
          .eq("user_id", operaioUserId)
          .eq("company_id", companyId)
          .eq("orders.stato", "in_corso");

        if (assignments && assignments.length === 1) {
          cantiereId = assignments[0].order_id;
        } else if (assignments && assignments.length > 1) {
          // Multiple cantieri - ask user to choose
          if (session) {
            await supabase
              .from("whatsapp_sessions")
              .update({
                state: "awaiting_cantiere",
                state_data: {
                  cantieri_ids: assignments.map((a: { order_id: string }) => a.order_id),
                  pending_message_id: messageId,
                },
                last_activity_at: new Date().toISOString(),
              })
              .eq("id", session.id);
          } else {
            await supabase.from("whatsapp_sessions").insert({
              company_id: companyId,
              operaio_id: operaioId,
              phone_number: senderPhone,
              state: "awaiting_cantiere",
              state_data: {
                cantieri_ids: assignments.map((a: { order_id: string }) => a.order_id),
                pending_message_id: messageId,
              },
            });
          }

          // Send interactive message to ask which cantiere
          const { data: ordersData } = await supabase
            .from("orders")
            .select("id, name")
            .in("id", assignments.map((a: { order_id: string }) => a.order_id));

          const buttons = (ordersData || []).slice(0, 3).map((o: { id: string; name: string }, idx: number) => ({
            type: "reply",
            reply: { id: `cantiere_${o.id}`, title: (o.name || "Cantiere").substring(0, 20) },
          }));

          await callWhatsAppSend(supabase, companyId, senderPhone, {
            type: "interactive",
            interactive: {
              type: "button",
              body: { text: "Sei assegnato a piu' cantieri. Quale cantiere riguarda questo messaggio?" },
              action: { buttons },
            },
          });

          await supabase
            .from("whatsapp_messages")
            .update({
              processing_status: "requires_confirmation",
              processing_error: "Multipli cantieri, in attesa selezione",
            })
            .eq("id", messageId);

          return new Response(
            JSON.stringify({ success: true, status: "awaiting_cantiere" }),
            { status: 200, headers: jsonHeaders }
          );
        }
      }

      if (cantiereId) {
        await supabase
          .from("whatsapp_messages")
          .update({ cantiere_id: cantiereId })
          .eq("id", messageId);
      }
    }

    // ── 4. Handle media (image/document/audio) ──────────────────────────
    let mediaStoragePath: string | null = waMsg.media_storage_path;
    let transcribedText: string | null = null;
    let mediaBase64: string | null = null;

    const hasMedia = ["image", "document", "audio"].includes(waMsg.message_type);
    const mediaIdMatch = waMsg.media_url?.match(/^wa-media:\/\/(.+)$/);
    const mediaId = mediaIdMatch?.[1];

    if (hasMedia && mediaId && !mediaStoragePath) {
      try {
        // Get WhatsApp config for access token
        const { data: waConfig } = await supabase
          .from("messaging_whatsapp_config")
          .select("phone_number_id, access_token_encrypted")
          .eq("company_id", companyId)
          .eq("is_connected", true)
          .maybeSingle();

        if (waConfig?.access_token_encrypted) {
          const encKey = getEncryptionKey();
          const accessToken = await decrypt(waConfig.access_token_encrypted, encKey);

          // Step 1: Get media URL from Meta
          const mediaInfoRes = await fetch(
            `https://graph.facebook.com/v21.0/${mediaId}`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          const mediaInfo = await mediaInfoRes.json();

          if (mediaInfo.url) {
            // Step 2: Download binary
            const mediaBinaryRes = await fetch(mediaInfo.url, {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
            const mediaBuffer = new Uint8Array(await mediaBinaryRes.arrayBuffer());
            const mimeType = mediaInfo.mime_type || "application/octet-stream";
            const ext = getFileExtension(mimeType);
            const today = new Date().toISOString().split("T")[0];

            // Step 3: Upload to Supabase Storage
            const storagePath = `whatsapp/${companyId}/${cantiereId || "unknown"}/${waMsg.message_type}/${today}_${waMsg.wa_message_id}.${ext}`;

            const { error: uploadErr } = await supabase.storage
              .from("foto-cantiere")
              .upload(storagePath, mediaBuffer, {
                contentType: mimeType,
                upsert: false,
              });

            if (!uploadErr) {
              mediaStoragePath = storagePath;
              await supabase
                .from("whatsapp_messages")
                .update({ media_storage_path: storagePath })
                .eq("id", messageId);
            } else {
              console.error("[whatsapp-ai-processor] Storage upload error:", uploadErr);
            }

            // For audio: transcribe with Whisper
            if (waMsg.message_type === "audio") {
              transcribedText = await transcribeAudio(mediaBuffer, mimeType);
              console.log("[whatsapp-ai-processor] Transcription:", transcribedText);
            }

            // For images: prepare base64 for Vision API
            if (waMsg.message_type === "image") {
              mediaBase64 = btoa(String.fromCharCode(...mediaBuffer));
            }
          }
        }
      } catch (mediaErr) {
        console.error("[whatsapp-ai-processor] Media processing error:", mediaErr);
        // Continue processing - media failure is not fatal
      }
    }

    // ── 5. classifyIntent ───────────────────────────────────────────────
    const textForClassification =
      transcribedText || waMsg.content_text || `[${waMsg.message_type}]`;

    const classifyMessages: Array<{ role: string; content: unknown }> = [
      { role: "system", content: INTENT_SYSTEM_PROMPT },
    ];

    if (waMsg.message_type === "image" && mediaBase64) {
      classifyMessages.push({
        role: "user",
        content: [
          { type: "text", text: textForClassification },
          {
            type: "image_url",
            image_url: { url: `data:image/jpeg;base64,${mediaBase64}` },
          },
        ],
      });
    } else {
      classifyMessages.push({ role: "user", content: textForClassification });
    }

    const classifyResponse = await callOpenAI(classifyMessages, "gpt-4o", 500);

    let intentResult: IntentResult;
    try {
      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = classifyResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found in AI response");
      intentResult = JSON.parse(jsonMatch[0]);
    } catch {
      console.error("[whatsapp-ai-processor] Failed to parse intent:", classifyResponse);
      intentResult = { intent: "unknown", confidence: 0, extracted: {} };
    }

    const { intent, confidence, extracted } = intentResult;

    // ── 6. Process based on intent ──────────────────────────────────────
    let linkedRecordType: string | null = null;
    let linkedRecordId: string | null = null;
    let confirmationMessage = "";

    switch (intent) {
      // ── RAPPORTINO ──────────────────────────────────────────────────
      case "rapportino": {
        // Further extraction with dedicated prompt if needed
        let rapportinoData = extracted;
        if (!extracted.ore_lavorate && textForClassification) {
          const rapRes = await callOpenAI([
            { role: "system", content: RAPPORTINO_EXTRACTION_PROMPT },
            { role: "user", content: textForClassification },
          ], "gpt-4o", 500);
          try {
            const jsonMatch = rapRes.match(/\{[\s\S]*\}/);
            if (jsonMatch) rapportinoData = JSON.parse(jsonMatch[0]);
          } catch { /* use original extracted */ }
        }

        const dataLavoro = (rapportinoData.data as string) || new Date().toISOString().split("T")[0];
        const oreLavorate = rapportinoData.ore_lavorate as number || null;

        const attivita = Array.isArray(rapportinoData.attivita) ? rapportinoData.attivita : [];
        const materialiUsati = Array.isArray(rapportinoData.materiali_usati) ? rapportinoData.materiali_usati : [];
        const descrizione = attivita.length > 0
          ? attivita.join(", ")
          : (rapportinoData.note as string || textForClassification);

        const insertData: Record<string, unknown> = {
          company_id: companyId,
          order_id: cantiereId,
          data_lavoro: dataLavoro,
          ore_lavorate: oreLavorate,
          descrizione_lavori: descrizione,
          materiali_usati: materialiUsati.length > 0 ? JSON.stringify(materialiUsati) : "[]",
          meteo: rapportinoData.condizioni_meteo || null,
          note: rapportinoData.note || null,
          source: "whatsapp",
          role_type: "employee",
        };

        if (operaioUserId) insertData.user_id = operaioUserId;

        const { data: rapRecord, error: rapErr } = await supabase
          .from("campo_rapportini")
          .insert(insertData)
          .select("id")
          .single();

        if (rapErr) {
          console.error("[whatsapp-ai-processor] Rapportino insert error:", rapErr);
          throw new Error(`Errore inserimento rapportino: ${rapErr.message}`);
        }

        linkedRecordType = "campo_rapportini";
        linkedRecordId = rapRecord.id;
        confirmationMessage = `Rapportino registrato per il ${dataLavoro}${oreLavorate ? ` (${oreLavorate}h)` : ""}. Attivita': ${descrizione.substring(0, 100)}`;
        break;
      }

      // ── DDT ─────────────────────────────────────────────────────────
      case "ddt": {
        let ddtData: Record<string, unknown> = {};

        // Use GPT-4 Vision for OCR if we have an image
        if (mediaBase64) {
          const ddtRes = await callOpenAI([
            { role: "system", content: DDT_EXTRACTION_PROMPT },
            {
              role: "user",
              content: [
                { type: "text", text: "Estrai i dati da questo DDT:" },
                {
                  type: "image_url",
                  image_url: { url: `data:image/jpeg;base64,${mediaBase64}` },
                },
              ],
            },
          ], "gpt-4o", 1000);

          try {
            const jsonMatch = ddtRes.match(/\{[\s\S]*\}/);
            if (jsonMatch) ddtData = JSON.parse(jsonMatch[0]);
          } catch {
            console.error("[whatsapp-ai-processor] DDT OCR parse error:", ddtRes);
          }
        }

        const numeroDdt = (ddtData.numero_ddt as string) || `WA-${waMsg.wa_message_id.substring(0, 8)}`;
        const dataDdt = (ddtData.data_ddt as string) || new Date().toISOString().split("T")[0];
        const fornitore = (ddtData.fornitore as string) || null;
        const righe = ddtData.righe || [];

        // Insert DDT record - note: ddt_ricezione requires purchase_order_id
        // For WhatsApp-sourced DDTs without a PO, we store in notes/extracted_data
        const ddtInsert: Record<string, unknown> = {
          company_id: companyId,
          numero_ddt: numeroDdt,
          data_ricezione: dataDdt,
          note: `Da WhatsApp - Fornitore: ${fornitore || "N/A"} - Righe: ${JSON.stringify(righe)}`,
          source: "whatsapp",
          stato: "ricevuto",
          quantita_ricevuta: 0,
        };

        // Try to find a matching purchase_order for this company
        const { data: defaultPo } = await supabase
          .from("purchase_orders")
          .select("id")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (defaultPo) {
          ddtInsert.purchase_order_id = defaultPo.id;

          const { data: ddtRecord, error: ddtErr } = await supabase
            .from("ddt_ricezione")
            .insert(ddtInsert)
            .select("id")
            .single();

          if (ddtErr) {
            console.error("[whatsapp-ai-processor] DDT insert error:", ddtErr);
            throw new Error(`Errore inserimento DDT: ${ddtErr.message}`);
          }

          linkedRecordType = "ddt_ricezione";
          linkedRecordId = ddtRecord.id;
        }

        confirmationMessage = `DDT n. ${numeroDdt} del ${dataDdt} registrato${fornitore ? ` (Fornitore: ${fornitore})` : ""}`;
        if (Array.isArray(righe) && righe.length > 0) {
          confirmationMessage += `. ${righe.length} righe rilevate.`;
        }
        break;
      }

      // ── FOTO CANTIERE ─────────────────────────────────────────────
      case "foto_cantiere": {
        if (!mediaStoragePath && !waMsg.media_storage_path) {
          confirmationMessage = "Ho capito che vuoi inviare una foto del cantiere. Per favore invia un'immagine.";
          break;
        }

        const fotoInsert: Record<string, unknown> = {
          company_id: companyId,
          order_id: cantiereId,
          storage_path: mediaStoragePath || waMsg.media_storage_path,
          taken_at: new Date().toISOString(),
          descrizione: (extracted.descrizione as string) || waMsg.content_text || "Foto da WhatsApp",
          tags: Array.isArray(extracted.tags) ? extracted.tags : ["whatsapp"],
          source: "whatsapp",
        };

        if (operaioUserId) fotoInsert.uploaded_by = operaioUserId;

        const { data: fotoRecord, error: fotoErr } = await supabase
          .from("foto_cantiere")
          .insert(fotoInsert)
          .select("id")
          .single();

        if (fotoErr) {
          console.error("[whatsapp-ai-processor] Foto insert error:", fotoErr);
          throw new Error(`Errore inserimento foto: ${fotoErr.message}`);
        }

        linkedRecordType = "foto_cantiere";
        linkedRecordId = fotoRecord.id;
        confirmationMessage = "Foto del cantiere salvata correttamente.";
        break;
      }

      // ── PRESENZE ──────────────────────────────────────────────────
      case "presenze": {
        // Find hr_profili record for this employee
        let profiloId: string | null = null;

        if (operaioId) {
          const { data: hrProfilo } = await supabase
            .from("hr_profili")
            .select("id")
            .eq("employee_id", operaioId)
            .eq("company_id", companyId)
            .maybeSingle();

          profiloId = hrProfilo?.id || null;
        }

        if (!profiloId && operaioUserId) {
          const { data: hrProfilo } = await supabase
            .from("hr_profili")
            .select("id")
            .eq("user_id", operaioUserId)
            .eq("company_id", companyId)
            .maybeSingle();

          profiloId = hrProfilo?.id || null;
        }

        if (!profiloId) {
          confirmationMessage = "Non riesco a trovare il tuo profilo presenze. Contatta l'amministratore.";
          break;
        }

        const oggi = new Date().toISOString().split("T")[0];
        const oreLavorate = (extracted.ore_lavorate as number) || 8;
        const oraInizio = extracted.ora_inizio || extracted.ora;
        const oraFine = extracted.ora_fine;

        const { data: giornataRecord, error: giornataErr } = await supabase
          .from("hr_giornate")
          .upsert(
            {
              company_id: companyId,
              profilo_id: profiloId,
              data: (extracted.data as string) || oggi,
              stato: "presente",
              ore_lavorate: oreLavorate,
              prima_entrata: oraInizio || null,
              ultima_uscita: oraFine || null,
              note: `Registrato via WhatsApp${extracted.note ? ": " + extracted.note : ""}`,
              source: "whatsapp",
            },
            { onConflict: "profilo_id,data" }
          )
          .select("id")
          .single();

        if (giornataErr) {
          console.error("[whatsapp-ai-processor] Presenze insert error:", giornataErr);
          throw new Error(`Errore registrazione presenze: ${giornataErr.message}`);
        }

        linkedRecordType = "hr_giornate";
        linkedRecordId = giornataRecord.id;
        confirmationMessage = `Presenza registrata per il ${(extracted.data as string) || oggi}: ${oreLavorate}h lavorative.`;
        break;
      }

      // ── SEGNALAZIONE ──────────────────────────────────────────────
      case "segnalazione": {
        // Get company admin user
        const { data: adminProfile } = await supabase
          .from("profiles")
          .select("id")
          .eq("company_id", companyId)
          .eq("role", "titolare")
          .limit(1)
          .maybeSingle();

        const adminUserId = adminProfile?.id;
        if (!adminUserId) {
          // Fallback: get any admin
          const { data: anyAdmin } = await supabase
            .from("profiles")
            .select("id")
            .eq("company_id", companyId)
            .in("role", ["titolare", "admin", "amministratore"])
            .limit(1)
            .maybeSingle();

          if (anyAdmin) {
            const urgenza = (extracted.urgenza as string) || "media";
            const descrizione = (extracted.descrizione as string) || textForClassification;

            const { data: notifRecord, error: notifErr } = await supabase
              .from("notifications")
              .insert({
                company_id: companyId,
                user_id: anyAdmin.id,
                type: "segnalazione_cantiere",
                title: `Segnalazione da cantiere${urgenza === "alta" ? " - URGENTE" : ""}`,
                body: descrizione,
                entity_type: cantiereId ? "order" : "whatsapp_message",
                entity_id: cantiereId || messageId,
              })
              .select("id")
              .single();

            if (!notifErr && notifRecord) {
              linkedRecordType = "notifications";
              linkedRecordId = notifRecord.id;
            }
          }
        } else {
          const urgenza = (extracted.urgenza as string) || "media";
          const descrizione = (extracted.descrizione as string) || textForClassification;

          const { data: notifRecord, error: notifErr } = await supabase
            .from("notifications")
            .insert({
              company_id: companyId,
              user_id: adminUserId,
              type: "segnalazione_cantiere",
              title: `Segnalazione da cantiere${urgenza === "alta" ? " - URGENTE" : ""}`,
              body: descrizione,
              entity_type: cantiereId ? "order" : "whatsapp_message",
              entity_id: cantiereId || messageId,
            })
            .select("id")
            .single();

          if (!notifErr && notifRecord) {
            linkedRecordType = "notifications";
            linkedRecordId = notifRecord.id;
          }
        }

        confirmationMessage = "Segnalazione ricevuta e inoltrata al responsabile. Grazie!";
        break;
      }

      // ── DOMANDA ───────────────────────────────────────────────────
      case "domanda": {
        const aiResponse = await callOpenAI(
          [
            {
              role: "system",
              content:
                "Sei un assistente esperto per cantieri edili italiani. Rispondi in modo chiaro, conciso e professionale in italiano. Se non sei sicuro di qualcosa, suggerisci di contattare il responsabile di cantiere.",
            },
            { role: "user", content: textForClassification },
          ],
          "gpt-4o",
          500
        );

        confirmationMessage = aiResponse || "Mi dispiace, non sono riuscito a elaborare la tua domanda. Contatta il responsabile di cantiere.";
        break;
      }

      // ── UNKNOWN ───────────────────────────────────────────────────
      default: {
        confirmationMessage =
          "Ho ricevuto il tuo messaggio ma non sono riuscito a classificarlo. Puoi provare a riformularlo? Puoi inviare: rapportini, foto cantiere, DDT, presenze o segnalazioni.";
        break;
      }
    }

    // ── 7. Update whatsapp_messages with AI results ─────────────────────
    await supabase
      .from("whatsapp_messages")
      .update({
        ai_intent: intent,
        ai_confidence: confidence,
        ai_extracted_data: extracted,
        processing_status: "processed",
        linked_record_type: linkedRecordType,
        linked_record_id: linkedRecordId,
        processed_at: new Date().toISOString(),
      })
      .eq("id", messageId);

    // ── 8. Send confirmation message via whatsapp-send ──────────────────
    if (confirmationMessage) {
      await callWhatsAppSend(supabase, companyId, waMsg.from_phone, {
        type: "text",
        text: { body: confirmationMessage },
      });
    }

    // ── 9. Notify company admin ─────────────────────────────────────────
    if (intent !== "segnalazione" && intent !== "domanda") {
      // Check notification preferences
      const { data: waConfig } = await supabase
        .from("messaging_whatsapp_config")
        .select("notify_titolare_on_rapportino, notify_titolare_on_ddt, notify_titolare_on_segnalazione")
        .eq("company_id", companyId)
        .maybeSingle();

      let shouldNotify = false;
      if (intent === "rapportino" && waConfig?.notify_titolare_on_rapportino) shouldNotify = true;
      if (intent === "ddt" && waConfig?.notify_titolare_on_ddt) shouldNotify = true;
      if (intent === "foto_cantiere") shouldNotify = true;
      if (intent === "presenze") shouldNotify = true;

      if (shouldNotify) {
        const { data: adminProfile } = await supabase
          .from("profiles")
          .select("id")
          .eq("company_id", companyId)
          .in("role", ["titolare", "admin", "amministratore"])
          .limit(1)
          .maybeSingle();

        if (adminProfile) {
          const intentLabel: Record<string, string> = {
            rapportino: "Rapportino",
            ddt: "DDT",
            foto_cantiere: "Foto cantiere",
            presenze: "Presenze",
          };

          await supabase.from("notifications").insert({
            company_id: companyId,
            user_id: adminProfile.id,
            type: "whatsapp_bot_activity",
            title: `${intentLabel[intent] || intent} ricevuto via WhatsApp`,
            body: `Messaggio elaborato automaticamente dal bot WhatsApp.${cantiereId ? "" : " Cantiere non identificato."}`,
            entity_type: linkedRecordType || "whatsapp_message",
            entity_id: linkedRecordId || messageId,
          });
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        intent,
        confidence,
        linked_record_type: linkedRecordType,
        linked_record_id: linkedRecordId,
      }),
      { status: 200, headers: jsonHeaders }
    );
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Errore interno del server";
    console.error("[whatsapp-ai-processor] Error:", err);

    // Update message as failed
    if (messageId) {
      await supabase
        .from("whatsapp_messages")
        .update({
          processing_status: "failed",
          processing_error: errorMessage,
          processed_at: new Date().toISOString(),
        })
        .eq("id", messageId);
    }

    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: jsonHeaders }
    );
  }
});

// ── Internal helper: call whatsapp-send function ────────────────────────────
async function callWhatsAppSend(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
  to: string,
  messagePayload: Record<string, unknown>
): Promise<void> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const internalSecret =
      Deno.env.get("INTERNAL_CRON_SECRET") || serviceKey;

    const res = await fetch(`${supabaseUrl}/functions/v1/whatsapp-send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-cron-secret": internalSecret,
      },
      body: JSON.stringify({
        company_id: companyId,
        to,
        ...messagePayload,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error("[whatsapp-ai-processor] whatsapp-send error:", errBody);
    }
  } catch (err) {
    console.error("[whatsapp-ai-processor] Failed to call whatsapp-send:", err);
  }
}
