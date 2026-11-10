// lead-agente-whatsapp — l'agente WhatsApp dei lead con il prompt dell'azienda
// (25/09/2026).
//
// Lo chiama whatsapp-webhook (handlers/lead.ts) quando il numero «lead» ha un
// agente collegato (ai_whatsapp_numbers.agent_id → ai_agents_v2, tipo
// whatsapp). A differenza di lead-ai-processor, che ha un prompt fisso uguale
// per tutti e per gli appuntamenti apre solo un ticket:
// - il prompt è quello dell'azienda (ai_agents_v2.system_prompt) più regole
//   fisse (promptAgenteLead.ts);
// - la storia della chat si legge per contatto nei due versi;
// - gli orari e la prenotazione sono quelli veri del calendario scelto
//   (calendarioPrenotazione.ts), e l'opportunità si sposta nelle fasi scelte;
// - se una persona ha preso la conversazione (conversazioni.bot_in_pausa)
//   l'agente tace.
//
// Un turno per contatto (conversazioni.bot_occupato_fino): due messaggi a
// pochi secondi non fanno partire due giri in parallelo. Chi ha il turno, se
// intanto arrivano altri messaggi, butta la risposta preparata e rifà il giro
// con la storia nuova; prima di lasciare il turno ricontrolla.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/headers.ts";
import { chiamataInternaValida, rispostaNonAutorizzata } from "../_shared/chiamataInterna.ts";
import { callOpenAI, type ChatMessage } from "../whatsapp-ai-processor/openai.ts";
import { InsufficientCreditsError } from "../_shared/ai-provider/index.ts";
import { checkBudget, consumeBudget, estimateCostEur } from "../whatsapp-ai-processor/budget.ts";
import { logToolCall } from "../whatsapp-ai-processor/observability.ts";
import { sanitizeAnswer } from "../_shared/structuredOutput.ts";
import { leggiConfigAgenteLead, type ConfigAgenteLead } from "../_shared/agenteLeadConfig.ts";
import { turniPerLlm, type RigaMessaggio } from "../_shared/storiaWhatsApp.ts";
import { promptAgenteLead } from "../_shared/promptAgenteLead.ts";
import { messaggiRiepilogo, notaRiepilogo } from "../_shared/riepilogoChatLead.ts";
import { avvisaUtenti, specificheStrumenti, trovaStrumento, type CtxAgente } from "./strumenti.ts";
import { rispostaDelModello } from "./giroStrumenti.ts";

interface Richiesta {
  message_id?: string;
  contact_id: string;
  wa_number_id: string;
  /** Il numero da cui ha scritto il lead, come lo manda Meta (solo cifre, col prefisso). */
  from_phone?: string;
}

const MAX_GIRI_STRUMENTI = 5;
const MAX_RIPRESE = 3;
const DURATA_TURNO_MS = 120_000;

// deno-lint-ignore no-explicit-any
type Admin = any;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  // Solo whatsapp-webhook, con la chiave di servizio: nessun altro può far
  // parlare l'agente a nome dell'azienda e a spese del suo credito.
  if (!chiamataInternaValida(req)) return rispostaNonAutorizzata(corsHeaders);
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const admin: Admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  let body: Richiesta;
  try { body = await req.json() as Richiesta; } catch { return json({ error: "invalid_json" }, 400); }
  if (!body.wa_number_id || !body.contact_id) return json({ error: "missing_fields" }, 400);

  // ── Numero, agente, configurazione ──────────────────────────────────────
  const { data: numero } = await admin
    .from("ai_whatsapp_numbers")
    .select("id, company_id, agent_id, stato")
    .eq("id", body.wa_number_id).is("deleted_at", null).maybeSingle();
  if (!numero?.agent_id || (numero.stato && numero.stato !== "active")) return json({ ok: true, skipped: "nessun_agente" });
  const companyId = numero.company_id as string;

  const { data: agente } = await admin
    .from("ai_agents_v2")
    .select("id, company_id, nome, tipo, stato, system_prompt, tools_config")
    .eq("id", numero.agent_id).eq("company_id", companyId).maybeSingle();
  if (!agente || agente.tipo !== "whatsapp" || (agente.stato && agente.stato !== "attivo")) {
    console.warn(JSON.stringify({ fn: "lead-agente-whatsapp", msg: "agente non attivo: il lead non riceve risposta", agente: numero.agent_id }));
    return json({ ok: true, skipped: "agente_non_attivo" });
  }
  const conf = leggiConfigAgenteLead(agente.tools_config);
  if (!conf.ok) {
    console.warn(JSON.stringify({ fn: "lead-agente-whatsapp", msg: "configurazione incompleta", agente: agente.id, mancano: conf.mancano }));
    return json({ ok: true, skipped: "configurazione_incompleta", mancano: conf.mancano });
  }
  const config = conf.config;

  // ── Messaggio, contatto, pausa ──────────────────────────────────────────
  const { data: questo } = body.message_id
    ? await admin.from("whatsapp_messages").select("created_at, message_type, from_phone").eq("id", body.message_id).maybeSingle()
    : { data: null };
  // Una reazione (👍) non è un messaggio a cui rispondere.
  if (questo?.message_type === "reaction") return json({ ok: true, skipped: "reazione" });

  const { data: contatto } = await admin
    .from("marketing_contacts")
    .select("id, company_id, first_name, last_name, phone, source, qualificazione_json, optout_whatsapp, opt_out")
    .eq("id", body.contact_id).eq("company_id", companyId).maybeSingle();
  if (!contatto) return json({ ok: true, skipped: "contatto_non_trovato" });
  if (contatto.optout_whatsapp || contatto.opt_out) return json({ ok: true, skipped: "opt_out" });
  // Si risponde al numero da cui ha scritto (quello di Meta, col prefisso), non a
  // quello salvato in scheda, che può essere senza +39.
  const destinatario = String(body.from_phone || questo?.from_phone || contatto.phone || "").replace(/[^0-9]/g, "");
  if (!destinatario) return json({ ok: true, skipped: "contatto_senza_numero" });

  const filtroConv = { company_id: companyId, entita_tipo: "contatto", entita_id: contatto.id };
  await admin.from("conversazioni").upsert(filtroConv, { onConflict: "company_id,entita_tipo,entita_id", ignoreDuplicates: true });
  const { data: conversazione } = await admin
    .from("conversazioni").select("bot_in_pausa").match(filtroConv).maybeSingle();
  // In pausa: ha preso la conversazione una persona, e va bene così — ma il
  // lead che scrive non deve sparire. La pausa non scade mai (la mette il
  // riquadro di Conversazioni al primo messaggio scritto a mano) e l'uscita
  // era muta: nessuna risposta, nessun avviso, nessuna riga di registro. Il
  // 10/11/2026 erano 147 conversazioni in pausa sulla piattaforma e 52
  // persone avevano riscritto senza che nessuno rispondesse. Qui si avvisa
  // chi deve rispondere, una volta ogni dodici ore per non diventare rumore.
  if (conversazione?.bot_in_pausa) {
    await avvisaSePausaMuta(admin, { companyId, config, contatto, numeroId: numero.id });
    return json({ ok: true, skipped: "in_pausa" });
  }

  // ── Turno ───────────────────────────────────────────────────────────────
  const turno = await prendiTurno(admin, filtroConv);
  if (!turno) return json({ ok: true, skipped: "turno_occupato" });

  try {
    let risposte = 0;
    let restano = false;
    for (let ripresa = 0; ripresa < MAX_RIPRESE; ripresa++) {
      const esito = await unGiro(admin, { companyId, numeroId: numero.id, agente, config, contatto, destinatario, messageId: body.message_id ?? null });
      if (esito === "inviata") risposte++;
      if (esito === "fermo") { restano = false; break; }
      // Prima di lasciare il turno: è arrivato altro mentre si rispondeva?
      restano = await ciSonoMessaggiSenzaRisposta(admin, companyId, numero.id, contatto.id);
      if (!restano) break;
    }
    // Si esce con un messaggio del lead ancora senza risposta: finiti i tre
    // giri, oppure tre «niente»/«rifare» di fila. Fino al 10/11/2026 qui si
    // usciva con ok:true e risposte:0, indistinguibile da un successo: il lead
    // non riceveva niente e nessuno lo sapeva. Chi era uscito con
    // «turno_occupato» contava su questo giro, quindi non lo riprende nessuno.
    if (restano) {
      console.error(JSON.stringify({ level: "error", fn: "lead-agente-whatsapp", msg: "giri finiti con un messaggio del lead senza risposta", contatto: contatto.id, risposte }));
      await avvisaUtenti(
        { admin, companyId, contactId: contatto.id, config, contatto: { first_name: contatto.first_name, last_name: contatto.last_name, phone: contatto.phone }, waNumberId: numero.id },
        "Assistente WhatsApp: un messaggio è rimasto senza risposta",
        "Il lead ha scritto e l'assistente non è riuscito a chiudere il giro. Rispondi tu da Conversazioni.",
      );
    }
    return json({ ok: true, risposte, senza_risposta: restano });
  } finally {
    // Solo il proprio turno: se questo giro ha sforato i due minuti, il turno
    // può già essere di un'altra invocazione, e azzerarlo le farebbe girare
    // accanto una terza — due risposte allo stesso lead e due prenotazioni.
    await admin.from("conversazioni").update({ bot_occupato_fino: null }).match(filtroConv).eq("bot_occupato_fino", turno);
  }
});

// ── Un giro: storia → LLM con strumenti → risposta ──────────────────────────

type EsitoGiro = "inviata" | "rifare" | "niente" | "fermo";

async function unGiro(admin: Admin, g: {
  companyId: string;
  numeroId: string;
  // deno-lint-ignore no-explicit-any
  agente: any;
  config: ConfigAgenteLead;
  // deno-lint-ignore no-explicit-any
  contatto: any;
  destinatario: string;
  messageId: string | null;
}): Promise<EsitoGiro> {
  const { data: righe, error: eStoria } = await admin
    .from("whatsapp_messages")
    .select("id, direction, message_type, content_text, created_at")
    // Anche il numero, non solo il contatto (10/11/2026): senza, nella storia
    // entravano i messaggi dello stesso contatto sugli altri numeri WhatsApp
    // dell'azienda — un invio marketing o un promemoria diventavano un turno
    // «assistant» e il modello rispondeva come se l'avesse scritto lui. Peggio:
    // se l'ultimo messaggio della storia mescolata era in uscita, il giro
    // usciva con «niente» mentre il controllo sul solo numero diceva che un
    // messaggio senza risposta c'era: tre giri a vuoto e poi silenzio.
    .eq("company_id", g.companyId).eq("wa_number_id", g.numeroId).eq("contact_id", g.contatto.id)
    .order("created_at", { ascending: false })
    .limit(40);
  if (eStoria) throw new Error(`storia: ${eStoria.message}`);
  const utili = ((righe ?? []) as Array<RigaMessaggio & { id: string }>).filter((r) => r.message_type !== "reaction");
  const ultimoEntrata = utili.find((r) => r.direction === "inbound");
  const turni = turniPerLlm(utili, 24);
  if (!ultimoEntrata || !turni.length || turni[turni.length - 1].role !== "user") return "niente";

  const [{ data: azienda }, { data: calendario }, { data: opp }, { data: qualifica }] = await Promise.all([
    admin.from("companies").select("name").eq("id", g.companyId).maybeSingle(),
    admin.from("marketing_calendars").select("name").eq("id", g.config.calendarioId).maybeSingle(),
    admin.from("marketing_opportunities")
      .select("stage_id, marketing_pipeline_stages(name)")
      .eq("company_id", g.companyId).eq("contact_id", g.contatto.id).eq("status", "open").is("deleted_at", null)
      .order("created_at", { ascending: false }).limit(1),
    admin.from("marketing_contacts").select("qualificazione_json").eq("id", g.contatto.id).maybeSingle(),
  ]);
  // deno-lint-ignore no-explicit-any
  const faseAttuale = ((opp?.[0] as any)?.marketing_pipeline_stages?.name as string | undefined) ?? null;
  const adesso = new Date();
  const sistema = promptAgenteLead({
    promptAzienda: String(g.agente.system_prompt ?? ""),
    nomeAzienda: String(azienda?.name ?? "l'azienda"),
    adesso,
    contatto: { nome: g.contatto.first_name, cognome: g.contatto.last_name },
    origine: g.contatto.source ?? null,
    qualificazione: (qualifica?.qualificazione_json ?? {}) as Record<string, unknown>,
    faseAttuale,
    calendarioNome: String(calendario?.name ?? "calendario delle chiamate"),
    showroom: g.config.showroom.map((x) => ({ nome: x.nome, indirizzo: x.indirizzo })),
  });

  const ctx: CtxAgente = {
    admin, companyId: g.companyId, contactId: g.contatto.id,
    contatto: { first_name: g.contatto.first_name, last_name: g.contatto.last_name, phone: g.contatto.phone },
    config: g.config,
    adesso,
    prenotazioniNelGiro: 0,
    waNumberId: g.numeroId,
  };

  const budget = await checkBudget(admin, g.companyId);
  if (!budget.ok) {
    await avvisaUtenti(ctx, "Assistente WhatsApp fermo", "Il budget AI del giorno è finito: un lead ha scritto e non ha ricevuto risposta.");
    return "fermo";
  }

  const conv: ChatMessage[] = [{ role: "system", content: sistema }, ...turni.map((t) => ({ role: t.role, content: t.content }))];
  const strumenti = specificheStrumenti(g.config);
  let testoFinale: string | null = null;
  let tokIn = 0, tokOut = 0, modello = budget.model_override ?? "routing";
  const chiedi = async (toolChoice: "auto" | "none", maxTokens: number) => {
    const r = await callOpenAI({
      task_kind: "lead_qualificazione",
      company_id: g.companyId,
      wa_message_id: g.messageId,
      model: budget.model_override ?? undefined,
      messages: conv, tools: strumenti, tool_choice: toolChoice,
      temperature: 0.4, max_tokens: maxTokens,
    });
    tokIn += r.usage?.prompt_tokens ?? 0;
    tokOut += r.usage?.completion_tokens ?? 0;
    modello = r.model || modello;
    return r.choices[0].message;
  };

  try {
    testoFinale = await rispostaDelModello({
      maxGiri: MAX_GIRI_STRUMENTI,
      chiedi,
      annotaRichiesta: (msg) => { conv.push(msg as ChatMessage); },
      esegui: async (tc) => {
        const strumento = trovaStrumento(tc.function.name, g.config);
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(tc.function.arguments || "{}"); } catch { /* argomenti vuoti */ }
        const t0 = Date.now();
        let esito: { ok: boolean; [k: string]: unknown };
        try {
          esito = strumento ? await strumento.handler(ctx, args) : { ok: false, errore: "strumento_sconosciuto" };
        } catch (e) {
          esito = { ok: false, errore: "errore_interno", dettaglio: String(e).slice(0, 200) };
        }
        await logToolCall(admin, {
          company_id: g.companyId,
          wa_message_id: g.messageId,
          tool_name: tc.function.name,
          role_kind: "lead",
          args, result: esito,
          duration_ms: Date.now() - t0,
          model_used: modello,
          tokens_prompt: 0,
          tokens_completion: 0,
        });
        conv.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(esito) });
        return esito;
      },
    });
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      // Al lead non si scrive dei crediti: si avvisa il team.
      await avvisaUtenti(ctx, "Assistente WhatsApp fermo", "I crediti AI sono finiti: un lead ha scritto e non ha ricevuto risposta.");
      return "fermo";
    }
    console.error(JSON.stringify({ level: "error", fn: "lead-agente-whatsapp", error: String(err) }));
    await avvisaUtenti(ctx, "Assistente WhatsApp: risposta non inviata", `Un lead ha scritto ma l'assistente non è riuscito a rispondere (${String(err).slice(0, 120)}). Rispondi tu da Conversazioni.`);
    return "fermo";
  } finally {
    await consumeBudget(admin, g.companyId, estimateCostEur(modello, tokIn, tokOut));
  }

  // Arrivato altro mentre si preparava la risposta: si rifà il giro con tutto.
  // (Le azioni fatte dagli strumenti restano: il giro nuovo le vede nella scheda.)
  if (await entrataPiuRecente(admin, g.companyId, g.numeroId, g.contatto.id, ultimoEntrata.created_at)) return "rifare";

  // sanitizeAnswer toglie la riga di apertura quando sembra un ragionamento
  // («Okay, ho capito…», «Analizzo:…»). Su una chat WhatsApp, dove il prompt
  // impone messaggi brevi, quella riga è spesso TUTTO il messaggio: il filtro
  // lo svuotava, isFullyChainOfThought diventava vero e la frase buona — con
  // dentro gli orari — finiva nel cestino, mentre al lead non arrivava niente.
  // Qui, se ripulire non lascia niente, vale il testo com'era (10/11/2026).
  const pulito = sanitizeAnswer(testoFinale ?? "");
  const risposta = (pulito.cleaned || testoFinale || "").trim();
  if (!risposta) {
    await avvisaUtenti(ctx, "Assistente WhatsApp: risposta vuota", "Un lead ha scritto ma l'assistente non ha prodotto una risposta. Rispondi tu da Conversazioni.");
    return "fermo";
  }
  const inviata = await inviaRisposta(g.numeroId, g.companyId, g.destinatario, g.contatto.id, risposta);
  if (!inviata) {
    await avvisaUtenti(ctx, "Assistente WhatsApp: invio non riuscito", "La risposta dell'assistente non è partita (WhatsApp l'ha rifiutata). Rispondi tu da Conversazioni.");
    return "fermo";
  }
  if (ctx.riepilogo) {
    await scriviRiepilogo(admin, {
      companyId: g.companyId,
      contactId: g.contatto.id,
      opportunityId: ctx.riepilogo.opportunityId,
      esito: ctx.riepilogo.esito,
      nomeAzienda: String(azienda?.name ?? "l'azienda"),
      nomeContatto: [g.contatto.first_name, g.contatto.last_name].filter(Boolean).join(" "),
      chat: [...turni, { role: "assistant" as const, content: risposta }],
      messageId: g.messageId,
    });
  }
  return "inviata";
}

/**
 * Il riepilogo della chat negli appunti dell'opportunità (marketing_contact_notes
 * con opportunity_id), dopo che il cliente ha già la sua risposta: se l'AI non
 * risponde, la chat resta comunque in Conversazioni e si avvisa nel log.
 */
async function scriviRiepilogo(admin: Admin, r: {
  companyId: string;
  contactId: string;
  opportunityId: string | null;
  esito: string;
  nomeAzienda: string;
  nomeContatto: string;
  chat: Array<{ role: "user" | "assistant"; content: string }>;
  messageId: string | null;
}): Promise<void> {
  try {
    const { data: q } = await admin.from("marketing_contacts").select("qualificazione_json").eq("id", r.contactId).maybeSingle();
    const risposta = await callOpenAI({
      task_kind: "lead_qualificazione",
      company_id: r.companyId,
      wa_message_id: r.messageId,
      messages: messaggiRiepilogo({
        nomeAzienda: r.nomeAzienda,
        nomeContatto: r.nomeContatto,
        qualificazione: (q?.qualificazione_json ?? {}) as Record<string, unknown>,
        esito: r.esito,
        chat: r.chat,
      }) as ChatMessage[],
      temperature: 0.2,
      max_tokens: 350,
    });
    await consumeBudget(admin, r.companyId, estimateCostEur(risposta.model, risposta.usage?.prompt_tokens ?? 0, risposta.usage?.completion_tokens ?? 0));
    const testo = (risposta.choices[0]?.message?.content ?? "").trim();
    if (!testo) return;
    const { error } = await admin.from("marketing_contact_notes").insert({
      company_id: r.companyId,
      contact_id: r.contactId,
      opportunity_id: r.opportunityId,
      content: notaRiepilogo(testo, r.esito),
      automatica: true,
    });
    if (error) console.warn("[lead-agente] riepilogo non salvato:", error.message);
  } catch (e) {
    console.warn("[lead-agente] riepilogo non scritto:", String(e).slice(0, 200));
  }
}

/**
 * Il lead ha scritto ma l'assistente è in pausa: avvisa chi deve rispondere,
 * al massimo una volta ogni dodici ore per quella persona.
 */
async function avvisaSePausaMuta(admin: Admin, d: {
  companyId: string;
  // deno-lint-ignore no-explicit-any
  config: any;
  // deno-lint-ignore no-explicit-any
  contatto: any;
  numeroId: string;
}): Promise<void> {
  try {
    const { count } = await admin
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("company_id", d.companyId)
      .eq("entity_id", d.contatto.id)
      .eq("type", "lead_whatsapp_agente")
      .gt("created_at", new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString());
    if ((count ?? 0) > 0) return;
    const nome = [d.contatto.first_name, d.contatto.last_name].filter(Boolean).join(" ") || "Un lead";
    await avvisaUtenti(
      { admin, companyId: d.companyId, contactId: d.contatto.id, config: d.config, contatto: { first_name: d.contatto.first_name, last_name: d.contatto.last_name, phone: d.contatto.phone }, waNumberId: d.numeroId },
      `WhatsApp: ${nome} ha scritto, l'assistente è in pausa`,
      "La conversazione è in mano a una persona, quindi l'assistente non risponde. Rispondi tu da Conversazioni, oppure riattiva l'assistente da lì.",
    );
  } catch (e) {
    console.warn("[lead-agente] avviso di pausa non inviato:", String(e).slice(0, 120));
  }
}

// ── Turno e messaggi nuovi ──────────────────────────────────────────────────

/** La scadenza scritta sul turno preso, da riconoscere al rilascio; null se non l'ha preso. */
async function prendiTurno(admin: Admin, filtro: Record<string, string>): Promise<string | null> {
  const ora = new Date();
  const scadenza = new Date(ora.getTime() + DURATA_TURNO_MS).toISOString();
  const { data, error } = await admin
    .from("conversazioni")
    .update({ bot_occupato_fino: scadenza })
    .match(filtro)
    .or(`bot_occupato_fino.is.null,bot_occupato_fino.lt."${ora.toISOString()}"`)
    .select("id, bot_occupato_fino");
  if (error) {
    console.error("[lead-agente] turno:", error.message);
    return null;
  }
  // Il valore riletto dal database, non quello mandato: il confronto al
  // rilascio deve usare la stessa scrittura che il database ha salvato.
  return Array.isArray(data) && data.length > 0 ? (data[0].bot_occupato_fino ?? scadenza) : null;
}

async function entrataPiuRecente(admin: Admin, companyId: string, numeroId: string, contactId: string, dopo: string): Promise<boolean> {
  const { count } = await admin
    .from("whatsapp_messages")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId).eq("wa_number_id", numeroId).eq("contact_id", contactId)
    .eq("direction", "inbound").neq("message_type", "reaction")
    .gt("created_at", dopo);
  return (count ?? 0) > 0;
}

/** L'ultimo messaggio della chat (su questo numero) è del cliente? */
async function ciSonoMessaggiSenzaRisposta(admin: Admin, companyId: string, numeroId: string, contactId: string): Promise<boolean> {
  const { data } = await admin
    .from("whatsapp_messages")
    .select("direction, message_type")
    .eq("company_id", companyId).eq("wa_number_id", numeroId).eq("contact_id", contactId)
    .neq("message_type", "reaction")
    .order("created_at", { ascending: false })
    .limit(1);
  return data?.[0]?.direction === "inbound";
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function inviaRisposta(waNumberId: string, companyId: string, to: string, contactId: string, text: string): Promise<boolean> {
  try {
    const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/whatsapp-send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
      body: JSON.stringify({ wa_number_id: waNumberId, company_id: companyId, to, text, contact_id: contactId }),
    });
    if (!res.ok) {
      console.error("[lead-agente] whatsapp-send:", res.status, (await res.text()).slice(0, 300));
      return false;
    }
    return true;
  } catch (e) {
    console.error("[lead-agente] invio fallito:", String(e));
    return false;
  }
}
// 07/11/2026: ripubblicata perché le email di servizio partono col solo nome dell'azienda, senza «via EdiliziaInCloud» (_shared/resolveSender.ts).
