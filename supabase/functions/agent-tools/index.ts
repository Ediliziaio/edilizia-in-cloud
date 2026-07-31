/**
 * agent-tools — strumenti che l'agente vocale usa DURANTE la chiamata
 *
 * ElevenLabs supporta i "webhook tool": quando il cliente chiede qualcosa che
 * richiede dati veri, il modello chiama questo endpoint IN CHIAMATA e legge la
 * risposta al telefono. È la differenza tra "le farò sapere" e "la sua merce
 * è arrivata ieri in magazzino, la posa è prevista giovedì 6".
 *
 * Azioni:
 *  - stato_consegna  → ultima commessa aperta del numero: stato, avanzamento,
 *                      merce in magazzino, data consegna prevista.
 *  - crea_ticket     → apre un ticket di assistenza col racconto del cliente
 *                      e risponde col riferimento da leggere a voce.
 *
 * COME SI COLLEGA (tools_config dell'agente, già supportato dal proxy):
 *   edilizia_tools: {
 *     stato_consegna: { enabled: true, webhook_url:
 *       "https://<ref>.supabase.co/functions/v1/agent-tools?agent=<elevenlabs_agent_id>&key=<ELEVENLABS_WEBHOOK_SECRET>" },
 *     crea_ticket:   { enabled: true, webhook_url: "...stesso url..." }
 *   }
 *
 * Sicurezza e tenancy: ElevenLabs chiama senza JWT, quindi l'URL porta la
 * chiave (confronto constant-time con ELEVENLABS_WEBHOOK_SECRET) e l'agent id
 * ElevenLabs: l'azienda si risolve SEMPRE lato server da quell'id — il corpo
 * della richiesta, scritto dall'LLM, non può scegliere il tenant. Il numero di
 * telefono arriva dalla dynamic variable di sistema (system__caller_id) o dal
 * body: serve solo a filtrare DENTRO l'azienda dell'agente.
 *
 * Risposte: testo semplice in italiano, pensato per essere LETTO A VOCE.
 * Niente markdown, niente importi, niente dati di terzi.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders as baseCorsHeaders } from "../_shared/headers.ts";
import { sanitizePhoneForQuery } from "../_shared/webhookSecurity.ts";

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

function dataParlata(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso + (iso.length === 10 ? "T12:00:00" : ""));
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Rome" });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: baseCorsHeaders });

  try {
    const url = new URL(req.url);
    const secret = Deno.env.get("AGENT_TOOLS_SECRET") || Deno.env.get("ELEVENLABS_WEBHOOK_SECRET");
    if (!secret) return json({ error: "Secret non configurato" }, 503);
    const key = url.searchParams.get("key") ?? "";
    if (!constantTimeEq(key, secret)) return json({ error: "unauthorized" }, 401);

    const elevenlabsAgentId = url.searchParams.get("agent");
    if (!elevenlabsAgentId) return json({ error: "agent mancante nell'URL" }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Tenancy dal solo agent id: il body non decide mai l'azienda.
    let companyId: string | null = null;
    for (const tab of ["ai_agents_v2", "ai_agents", "internal_ai_agents"] as const) {
      const { data } = await admin.from(tab).select("company_id").eq("elevenlabs_agent_id", elevenlabsAgentId).maybeSingle();
      if (data?.company_id) { companyId = data.company_id as string; break; }
    }
    if (!companyId) return json({ error: "Agente sconosciuto" }, 404);

    // Body scritto dall'LLM: parsing tollerante su nomi alternativi.
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const azione = String(body.azione ?? body.action ?? body.tool ?? url.searchParams.get("azione") ?? "").toLowerCase();
    const rawPhone = String(body.telefono ?? body.phone ?? body.caller_id ?? body.system__caller_id ?? "");
    const safePhone = sanitizePhoneForQuery(rawPhone);
    const suffix = safePhone ? safePhone.replace(/\+/g, "").slice(-9) : null;

    // ── STATO CONSEGNA / COMMESSA ──────────────────────────────────────────
    if (azione === "stato_consegna" || azione === "stato_commessa" || azione === "stato_ordine") {
      if (!suffix) {
        return json({ risposta: "Per controllare lo stato mi serve il numero di telefono con cui è registrato il lavoro. Può confermarmelo?" });
      }
      const { data: ordini } = await admin
        .from("orders")
        .select("order_code, tipo_lavoro, status, percentuale_avanzamento, expected_date, warehouse_arrival_date, work_start_date")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .not("status", "in", '("completato","annullato")')
        .ilike("client_phone", `%${suffix}%`)
        .order("created_at", { ascending: false })
        .limit(1);

      const o = ordini?.[0];
      if (!o) {
        return json({ risposta: "Con questo numero non trovo lavori in corso. Se il lavoro è intestato a un altro numero o a un familiare, posso comunque prendere nota e farla richiamare dall'ufficio." });
      }

      const lavoro = o.tipo_lavoro ? String(o.tipo_lavoro).replace(/_/g, " ") : "il lavoro";
      const pezzi: string[] = [`Per ${lavoro}, pratica ${o.order_code}:`];
      if (o.warehouse_arrival_date) {
        const arrivata = new Date(o.warehouse_arrival_date as string) <= new Date();
        pezzi.push(arrivata
          ? `la merce è arrivata in magazzino ${dataParlata(o.warehouse_arrival_date as string)}.`
          : `l'arrivo della merce in magazzino è previsto ${dataParlata(o.warehouse_arrival_date as string)}.`);
      } else {
        pezzi.push("la merce è in ordine dal fornitore, non abbiamo ancora una data di arrivo confermata.");
      }
      if (o.percentuale_avanzamento != null && Number(o.percentuale_avanzamento) > 0) {
        pezzi.push(`I lavori sono avanti al ${o.percentuale_avanzamento} per cento.`);
      }
      if (o.expected_date) pezzi.push(`La fine prevista è ${dataParlata(o.expected_date as string)}.`);
      pezzi.push("Se le serve una data più precisa, posso far richiamare dall'ufficio.");
      return json({ risposta: pezzi.join(" ") });
    }

    // ── CREA TICKET ASSISTENZA ─────────────────────────────────────────────
    if (azione === "crea_ticket" || azione === "apri_ticket" || azione === "assistenza") {
      const descrizione = String(body.descrizione ?? body.problema ?? body.description ?? "").trim();
      if (!descrizione) {
        return json({ risposta: "Per aprire la segnalazione mi descriva il problema in una frase, per favore." });
      }
      const urgente = /urgent|subito|emergenz|perdita|allagament|non funziona/i.test(
        String(body.urgenza ?? "") + " " + descrizione,
      );

      // Aggancia il cliente se il numero è noto (facoltativo: il ticket nasce comunque)
      let customerId: string | null = null;
      let nomeCliente = String(body.nome ?? body.nome_cliente ?? "").trim();
      if (suffix) {
        const { data: contact } = await admin
          .from("marketing_contacts")
          .select("id, first_name, last_name")
          .eq("company_id", companyId)
          .ilike("phone", `%${suffix}%`)
          .limit(1)
          .maybeSingle();
        if (contact) {
          customerId = contact.id as string;
          if (!nomeCliente) nomeCliente = [contact.first_name, contact.last_name].filter(Boolean).join(" ");
        }
      }

      const titolo = `Assistenza telefonica${nomeCliente ? ` — ${nomeCliente}` : ""}`;
      const { data: ticket, error: tErr } = await admin
        .from("tickets")
        .insert({
          company_id: companyId,
          customer_id: customerId,
          titolo,
          subject: titolo,
          descrizione: `${descrizione}\n\n[Aperto dall'agente vocale${rawPhone ? ` — chiamante ${rawPhone}` : ""}]`,
          priorita: urgente ? "alta" : "media",
          priority: urgente ? "high" : "medium",
          fonte: "agente_vocale",
          status: "aperto",
        })
        .select("id")
        .single();

      if (tErr || !ticket) {
        console.error("[AGENT-TOOLS] crea_ticket:", tErr?.message);
        // Mai lasciare l'agente muto: fallback onesto.
        return json({ risposta: "Ho registrato la sua richiesta e la passo subito all'ufficio, che la ricontatterà in giornata." });
      }

      const rif = String(ticket.id).slice(0, 8).toUpperCase();
      return json({
        risposta: `Fatto: ho aperto la segnalazione con riferimento ${rif}${urgente ? ", marcata come urgente" : ""}. Il tecnico la ricontatterà ${urgente ? "il prima possibile" : "entro un giorno lavorativo"}.`,
        ticket_id: ticket.id,
      });
    }

    return json({ risposta: "Non ho capito quale operazione fare. Posso controllare lo stato di una consegna o aprire una segnalazione di assistenza." });
  } catch (e) {
    console.error("[AGENT-TOOLS] errore:", e instanceof Error ? e.message : e);
    return json({ risposta: "In questo momento non riesco ad accedere ai dati. Prendo nota e faccio richiamare dall'ufficio." });
  }
});
