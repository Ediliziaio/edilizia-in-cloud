/**
 * elevenlabs-call-init — riconoscimento del chiamante A INIZIO chiamata
 *
 * È il pezzo che trasforma la segretaria generica in un'assistente vera:
 * quando arriva una chiamata, ElevenLabs (configurando questo endpoint come
 * "conversation initiation client data webhook" sull'agente) ci chiama PRIMA
 * di aprire la conversazione, passando il numero del chiamante. Noi cerchiamo
 * il cliente nel CRM e rispondiamo con le dynamic variables: l'agente saluta
 * per nome, sa quante commesse aperte ha davanti, se la merce è arrivata in
 * magazzino e se ci sono ticket aperti — PRIMA di dire una parola.
 *
 * Differenza da internal-agent-webhook: quello riconosce il cliente a chiamata
 * FINITA (per il log). Questo lo riconosce PRIMA, per parlarci.
 *
 * REGOLA DURA sulle dynamic variables: una variabile citata nel prompt ma non
 * fornita arriva al modello come testo letterale "{{nome_cliente}}" — quindi
 * questo endpoint restituisce SEMPRE tutte le variabili, con default sicuri
 * per lo sconosciuto. I template contano su questo contratto.
 *
 * Risposta nel formato ElevenLabs:
 *   { type: "conversation_initiation_client_data",
 *     dynamic_variables: {...},
 *     conversation_config_override: { agent: { first_message } } }  // solo se riconosciuto
 *
 * Sicurezza: HMAC xi-signature con ELEVENLABS_WEBHOOK_SECRET, come i fratelli.
 * Privacy: al modello passano solo dati che il chiamante può conoscere di suo
 * (le SUE commesse, i SUOI ticket) — mai importi, mai dati di altri clienti.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders as baseCorsHeaders } from "../_shared/headers.ts";
import { sanitizePhoneForQuery } from "../_shared/webhookSecurity.ts";
import { verificaFirmaElevenLabs, chiaveUrlValida } from "../_shared/elevenlabsWebhook.ts";

const corsHeaders = {
  ...baseCorsHeaders,
  "Access-Control-Allow-Headers": baseCorsHeaders["Access-Control-Allow-Headers"] + ", xi-signature",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Data leggibile al telefono: "giovedì 6 agosto". */
function dataParlata(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso + (iso.length === 10 ? "T12:00:00" : ""));
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Rome" });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceRoleKey);

    // ── Auth ──
    // ElevenLabs NON firma questo webhook (documentazione "conversation
    // initiation client data"): pretendere l'HMAC significava rispondere 401
    // a ogni chiamata in entrata. La credenziale viaggia nell'URL configurato
    // sull'agente (?key=master o chiave derivata dell'azienda); il legacy
    // `xi-signature` resta accettato per i chiamanti interni.
    const rawBody = await req.clone().text();
    let bodyPre: Record<string, unknown> = {};
    try { bodyPre = JSON.parse(rawBody); } catch { /* vuoto */ }
    let companyPerChiave: string | null = null;
    {
      const idAg = (bodyPre.agent_id as string) ?? null;
      if (idAg) {
        for (const tab of ["ai_agents_v2", "ai_agents", "internal_ai_agents"] as const) {
          const { data } = await admin.from(tab).select("company_id").eq("elevenlabs_agent_id", idAg).maybeSingle();
          if (data?.company_id) { companyPerChiave = data.company_id as string; break; }
        }
      }
    }
    const perUrl = await chiaveUrlValida(req, companyPerChiave);
    if (!perUrl) {
      const haFirma = !!(req.headers.get("elevenlabs-signature") || req.headers.get("xi-signature"));
      if (!haFirma) return json({ error: "Unauthorized: chiave URL mancante o non valida" }, 401);
      const firma = await verificaFirmaElevenLabs(req, rawBody);
      if (!firma.ok) return json({ error: firma.motivo }, firma.status);
    }

    const body = bodyPre;
    // Campi del webhook di inizializzazione ElevenLabs (telefonia):
    // caller_id, agent_id, called_number, call_sid, conversation_id
    const elevenlabsAgentId: string | null = body.agent_id ?? null;
    const callerId: string | null = body.caller_id ?? body.caller_phone ?? null;

    // Default sicuri: valgono per chiamante sconosciuto E per ogni errore a
    // valle — l'agente non deve mai ricevere {{variabili}} non risolte.
    const vars: Record<string, string> = {
      // Tutti i template dicono "{{azienda}}": senza, il modello legge la
      // parentesi graffa a voce. Valorizzata appena si conosce l'azienda.
      azienda: "",
      telefono_azienda: "",
      cliente_esistente: "no",
      nome_cliente: "",
      commesse_aperte: "0",
      commessa_recente: "",
      stato_commessa: "",
      avanzamento_commessa: "",
      consegna_prevista: "",
      merce_arrivata: "no",
      data_arrivo_merce: "",
      ticket_aperti: "0",
    };
    const rispostaBase = { type: "conversation_initiation_client_data", dynamic_variables: vars };

    if (!elevenlabsAgentId || !callerId) return json(rispostaBase);

    // ── Risolvi l'agente → azienda (v2, poi legacy, poi interni) ──
    let companyId: string | null = null;
    for (const tab of ["ai_agents_v2", "ai_agents", "internal_ai_agents"] as const) {
      const { data } = await admin.from(tab).select("company_id").eq("elevenlabs_agent_id", elevenlabsAgentId).maybeSingle();
      if (data?.company_id) { companyId = data.company_id as string; break; }
    }
    if (!companyId) return json(rispostaBase);

    {
      const { data: az } = await admin.from("companies").select("name, phone").eq("id", companyId).maybeSingle();
      vars.azienda = String(az?.name ?? "");
      vars.telefono_azienda = String(az?.phone ?? "");
    }

    // ── Cliente dal numero (match sugli ultimi 9 caratteri, come i fratelli) ──
    const safePhone = sanitizePhoneForQuery(callerId);
    const suffix = safePhone ? safePhone.replace(/\+/g, "").slice(-9) : null;
    if (!suffix) return json(rispostaBase);

    const { data: contact } = await admin
      .from("marketing_contacts")
      .select("id, first_name, last_name")
      .eq("company_id", companyId)
      .ilike("phone", `%${suffix}%`)
      .limit(1)
      .maybeSingle();

    // ── Commesse aperte: cerca sia per telefono che (se trovato) per nome ──
    const { data: ordini } = await admin
      .from("orders")
      .select("order_code, tipo_lavoro, status, percentuale_avanzamento, expected_date, warehouse_arrival_date")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .not("status", "in", '("completato","annullato")')
      .ilike("client_phone", `%${suffix}%`)
      .order("created_at", { ascending: false })
      .limit(5);

    const aperte = ordini ?? [];
    const nome = contact ? [contact.first_name, contact.last_name].filter(Boolean).join(" ") : "";

    // Riconosciuto = contatto CRM oppure almeno una commessa con quel numero.
    if (!contact && aperte.length === 0) return json(rispostaBase);

    vars.cliente_esistente = "si";
    vars.nome_cliente = nome;
    vars.commesse_aperte = String(aperte.length);

    if (aperte.length > 0) {
      const o = aperte[0];
      vars.commessa_recente = [o.order_code, o.tipo_lavoro ? String(o.tipo_lavoro).replace(/_/g, " ") : null]
        .filter(Boolean).join(" — ");
      vars.stato_commessa = String(o.status ?? "");
      vars.avanzamento_commessa = o.percentuale_avanzamento != null ? `${o.percentuale_avanzamento}%` : "";
      vars.consegna_prevista = dataParlata(o.expected_date as string | null);
      if (o.warehouse_arrival_date) {
        const arrivata = new Date(o.warehouse_arrival_date as string) <= new Date();
        vars.merce_arrivata = arrivata ? "si" : "no";
        vars.data_arrivo_merce = dataParlata(o.warehouse_arrival_date as string);
      }
    }

    if (contact) {
      const { count } = await admin
        .from("tickets")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("customer_id", contact.id)
        // ticket_status è un ENUM (aperto|in_lavorazione|risolto): un valore
        // fuori lista nel filtro fa FALLIRE la query (count null → "0" sempre).
        .not("status", "in", '("risolto","chiuso","annullato")');
      vars.ticket_aperti = String(count ?? 0);
    }

    // Saluto personalizzato SOLO se conosciamo il nome: per il resto comanda
    // il primo messaggio configurato sull'agente.
    const override = nome
      ? {
          conversation_config_override: {
            agent: {
              first_message:
                `Buongiorno ${nome.split(" ")[0]}! Che piacere risentirla. Sono l'assistente: come posso aiutarla oggi?`,
            },
          },
        }
      : {};

    return json({ ...rispostaBase, ...override });
  } catch (e) {
    console.error("[CALL-INIT] errore:", e instanceof Error ? e.message : e);
    // Anche in errore: risposta valida con default — la chiamata DEVE partire.
    return json({
      type: "conversation_initiation_client_data",
      dynamic_variables: {
        azienda: "", telefono_azienda: "",
        cliente_esistente: "no", nome_cliente: "", commesse_aperte: "0",
        commessa_recente: "", stato_commessa: "", avanzamento_commessa: "",
        consegna_prevista: "", merce_arrivata: "no", data_arrivo_merce: "", ticket_aperti: "0",
      },
    });
  }
});
