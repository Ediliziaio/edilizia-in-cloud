/**
 * agent-tools — strumenti che l'agente vocale usa DURANTE la chiamata
 *
 * ElevenLabs supporta i "webhook tool": quando il cliente chiede qualcosa che
 * richiede dati veri, il modello chiama questo endpoint IN CHIAMATA e legge la
 * risposta al telefono. È la differenza tra "le farò sapere" e "la sua merce
 * è arrivata ieri in magazzino, la posa è prevista giovedì 6".
 *
 * La LOGICA degli strumenti vive in _shared/ediliziaCustomerTools.ts, condivisa
 * con WhatsApp e widget chat: qui restano solo trasporto (HTTP), auth e alias.
 *
 * Azioni canoniche: stato_consegna, crea_ticket, fissa_appuntamento,
 * disponibilita, stato_preventivo, richiesta_richiamo, info_prodotto,
 * info_cliente — più gli alias del catalogo tool del proxy
 * (create_appointment, get_availability, assign_to_user, search_products,
 * get_lead_info).
 *
 * COME SI COLLEGA: il proxy (elevenlabs-proxy) genera da solo gli URL per i
 * tool abilitati in tools_config.edilizia_tools, nella forma
 *   .../agent-tools?agent=<elevenlabs_agent_id>&key=<chiave>&tool=<azione>
 * `tool` nell'URL rende deterministica l'azione (il body lo scrive l'LLM e può
 * sbagliare i nomi); il body resta il canale dei parametri (data, ora, ...).
 *
 * Sicurezza e tenancy: ElevenLabs chiama senza JWT, quindi l'URL porta la
 * chiave. Sono valide DUE chiavi (confronto constant-time):
 *   1. ELEVENLABS_WEBHOOK_SECRET (master, solo configurazioni manuali);
 *   2. la chiave derivata per azienda HMAC(secret, "agent-tools:"+company_id) —
 *      è quella che il proxy scrive negli URL: se trapela, espone solo i dati
 *      che quell'azienda vede già, MAI il secret di piattaforma.
 * L'azienda si risolve SEMPRE dall'agent id ElevenLabs nell'URL — il corpo
 * della richiesta, scritto dall'LLM, non può scegliere il tenant. Il numero di
 * telefono arriva dalla dynamic variable di sistema (system__caller_id) o dal
 * body: serve solo a filtrare DENTRO l'azienda dell'agente.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders as baseCorsHeaders } from "../_shared/headers.ts";
import {
  eseguiCustomerTool,
  suffissoTelefono,
  type CustomerToolCtx,
} from "../_shared/ediliziaCustomerTools.ts";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...baseCorsHeaders, "Content-Type": "application/json" },
  });
}

function constantTimeEq(x: string, y: string): boolean {
  const enc = new TextEncoder();
  const a = enc.encode(x), b = enc.encode(y);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Chiave derivata per azienda: stessa formula usata dal proxy quando genera gli URL. */
async function deriveCompanyKey(secret: string, companyId: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`agent-tools:${companyId}`));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Alias dal catalogo tool del proxy e nomi alternativi che l'LLM può usare.
const ALIAS: Record<string, string> = {
  stato_commessa: "stato_consegna", stato_ordine: "stato_consegna",
  apri_ticket: "crea_ticket", assistenza: "crea_ticket",
  create_appointment: "fissa_appuntamento", crea_appuntamento: "fissa_appuntamento", prendi_appuntamento: "fissa_appuntamento",
  get_availability: "disponibilita", verifica_disponibilita: "disponibilita", "disponibilità": "disponibilita",
  quote_status: "stato_preventivo", preventivo: "stato_preventivo",
  assign_to_user: "richiesta_richiamo", callback: "richiesta_richiamo", richiedi_richiamo: "richiesta_richiamo",
  search_products: "info_prodotto", cerca_prodotto: "info_prodotto",
  get_lead_info: "info_cliente", chi_sono: "info_cliente",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: baseCorsHeaders });

  try {
    const url = new URL(req.url);
    const secret = Deno.env.get("AGENT_TOOLS_SECRET") || Deno.env.get("ELEVENLABS_WEBHOOK_SECRET");
    if (!secret) return json({ error: "Secret non configurato" }, 503);
    const key = url.searchParams.get("key") ?? "";

    const elevenlabsAgentId = url.searchParams.get("agent");
    if (!elevenlabsAgentId) return json({ error: "agent mancante nell'URL" }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Tenancy dal solo agent id: il body non decide mai l'azienda. La risoluzione
    // avviene PRIMA della verifica chiave perché la chiave derivata dipende
    // dall'azienda; agente sconosciuto → stesso 401 della chiave sbagliata
    // (nessun oracolo sugli id esistenti).
    let companyId: string | null = null;
    let agentRowId: string | null = null;
    for (const tab of ["ai_agents_v2", "ai_agents", "internal_ai_agents"] as const) {
      const { data } = await admin.from(tab).select("id, company_id").eq("elevenlabs_agent_id", elevenlabsAgentId).maybeSingle();
      if (data?.company_id) { companyId = data.company_id as string; agentRowId = data.id as string; break; }
    }
    if (!companyId || !agentRowId) return json({ error: "unauthorized" }, 401);

    const masterOk = constantTimeEq(key, secret);
    const derivedOk = masterOk ? true : constantTimeEq(key, await deriveCompanyKey(secret, companyId));
    if (!masterOk && !derivedOk) return json({ error: "unauthorized" }, 401);

    // Azione: prima il parametro URL `tool` (lo scrive il proxy, deterministico),
    // poi il body scritto dall'LLM. Parsing tollerante sui nomi alternativi.
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const azioneRaw = String(
      url.searchParams.get("tool") ?? url.searchParams.get("azione") ?? body.azione ?? body.action ?? body.tool ?? "",
    ).toLowerCase();
    const azione = ALIAS[azioneRaw] ?? azioneRaw;

    const rawPhone = String(body.telefono ?? body.phone ?? body.caller_id ?? body.system__caller_id ?? "");
    const ctx: CustomerToolCtx = {
      rawPhone,
      suffix: suffissoTelefono(rawPhone),
      fallbackCreatedBy: agentRowId,
    };

    // Parametri: il dispatcher condiviso legge i nomi canonici; qui mappiamo i
    // sinonimi tipici del parlato/LLM sui campi attesi.
    const args: Record<string, unknown> = {
      data: body.data ?? body.date ?? body.giorno,
      ora: body.ora ?? body.time ?? body.orario,
      motivo: body.motivo ?? body.titolo ?? body.title,
      nome: body.nome ?? body.nome_cliente,
      descrizione: body.descrizione ?? body.problema ?? body.description ?? body.motivo,
      urgenza: body.urgenza,
      prodotto: body.prodotto ?? body.query ?? body.nome_prodotto ?? body.q,
    };

    if (!azione) {
      return json({ risposta: "Non ho capito quale operazione fare. Posso controllare consegne e preventivi, fissare un appuntamento, aprire una segnalazione o farla richiamare dall'ufficio." });
    }

    const result = await eseguiCustomerTool(admin, companyId, ctx, azione, args);
    return json(result);
  } catch (e) {
    console.error("[AGENT-TOOLS] errore:", e instanceof Error ? e.message : e);
    return json({ risposta: "In questo momento non riesco ad accedere ai dati. Prendo nota e faccio richiamare dall'ufficio." });
  }
});
