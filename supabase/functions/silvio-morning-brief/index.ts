/**
 * silvio-morning-brief — cron 08:00 IT
 *
 * Genera un briefing giornaliero per ogni utente attivo (amministratori e
 * staff che hanno fatto login negli ultimi 14gg). Il briefing è 3-5 bullet con:
 *   - Crediti scaduti gravi
 *   - Lavori/pose oggi e domani
 *   - Anomalie cassa
 *   - Opportunità (preventivi in scadenza, follow-up)
 * Ognuno riceve solo le voci che Silvio gli darebbe in chat, col SUO ruolo e
 * i SUOI permessi (regole in _shared/briefDelMattino.ts). Chi non ha niente da
 * vedere si salta prima di ogni query e di ogni chiamata al modello.
 *
 * Salvato in silvio_morning_briefings (UNIQUE per user+day).
 * Letto dal SilvioFAB launcher come "Cose da sapere stamattina".
 *
 * Trigger:
 *   - Cron: pg_cron "5 7 * * *" UTC = 08:05 CET / 09:05 CEST
 *   - Manuale, solo super_admin: POST { mode: "user", user_id, company_id } per debug
 *
 * Budget: max 50 utenti per run. Modelli economici (t1_economic) per costo basso.
 */

import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";
import { type ToolContext } from "../_shared/silvioTools.ts";
import { executeToolWithRouting } from "../_shared/silvioToolExecution.ts";
import {
  isInternalRequest,
  requireAuth,
  requireCompanyAccess,
  requireInternalSecret,
  requireRole,
} from "../_shared/auth.ts";
import {
  briefDaFare,
  pianoDelBrief,
  raccogliDatiDelBrief,
  type PermessiUtente,
  type PianoDelBrief,
} from "../_shared/briefDelMattino.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_USERS_PER_RUN = 50;
/** Utenti per lettura di ruoli e permessi: tiene corto l'indirizzo della richiesta. */
const LOTTO_UTENTI = 100;

// MP-SILVIO-BRIEF-ACTIONABLE-01: cta_action degli alert che hanno un handler reale
// in silvio-execute-action (le navigazioni open_* NON diventano proposte). Per ognuno
// di questi alert critici/importanti il brief PRE-CREA la proposta (HITL) da approvare.
const OPERATIONAL_CTA = [
  "send_overdue_reminder", "send_quote_followup", "create_purchase_order",
  "mark_payment_received", "create_logistics_task", "generic_email",
  "create_quote_draft", "create_invoice_draft",
];
const MAX_BRIEF_ACTIONS = 6;

interface BriefAction {
  proposal_id: string;
  action_type: string;
  label: string;
  alert_title: string;
  severity: string;
}

interface BriefingInput {
  user_id: string;
  company_id: string;
}

/** Un candidato con ciò che può vedere: ruolo vero e permessi per quell'azienda. */
interface Destinatario extends BriefingInput {
  piano: PianoDelBrief;
  permessi: PermessiUtente;
}

/** salvato = brief scritto; niente_da_dire = nessun dato e nessuna azione;
 *  scartato = risposta del modello inutilizzabile o brief di oggi già presente. */
type EsitoBrief = "salvato" | "niente_da_dire" | "scartato";

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    // Auth: il cron col segreto interno; a mano, solo il super_admin. Fino al
    // 24/09/2026 a mano bastava essere loggati: con mode "user" chiunque poteva
    // farsi scrivere nel PROPRIO brief (che la RLS gli lascia leggere) i numeri
    // di un'altra azienda, e con mode "all" far ripartire il giro di tutti.
    if (isInternalRequest(req)) {
      requireInternalSecret(req, cors);
    } else {
      const auth = await requireAuth(req, cors);
      await requireRole(auth.supabaseAdmin, auth.userId, ["super_admin"], cors);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = await req.json().catch(() => ({}));
    const mode = body?.mode ?? "all";

    // ── 1. Candidati ──────────────────────────────────────────────────
    let candidati: BriefingInput[] = [];
    if (mode === "user" && body?.user_id && body?.company_id) {
      // Anche a mano l'utente deve appartenere all'azienda del brief.
      await requireCompanyAccess(supabase, body.user_id, body.company_id, cors);
      candidati = [{ user_id: body.user_id, company_id: body.company_id }];
    } else {
      const { data, error } = await supabase.rpc("silvio_users_for_morning_brief", { p_lookback_days: 14 });
      if (error) throw new Error(`silvio_users_for_morning_brief: ${error.message}`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      candidati = (data ?? []).map((r: any) => ({
        user_id: r.user_id,
        company_id: r.company_id,
      }));
    }

    // ── 2. Cosa può vedere ciascuno ───────────────────────────────────
    // Chi non ha niente da vedere esce qui: niente strumenti, niente modello,
    // e non occupa uno dei posti del giro (prima il taglio a 50 veniva prima).
    const conPiano = await destinatariConPiano(supabase, candidati);
    const conQualcosa = conPiano.filter((d) => briefDaFare(d.piano));
    const senzaPermessi = conPiano.length - conQualcosa.length;
    const destinatari = conQualcosa.slice(0, MAX_USERS_PER_RUN);

    if (destinatari.length === 0) {
      return jsonResponse(
        { ok: true, generated: 0, senza_permessi: senzaPermessi, message: "Nessun utente da processare" },
        200,
        cors,
      );
    }

    let ok = 0;
    let nienteDaDire = 0;
    let scartati = 0;
    let failed = 0;
    const errors: Array<{ user_id: string; error: string }> = [];

    // ── 3. Per ogni utente, raccogli dati + sintetizza ────────────────
    for (const d of destinatari) {
      try {
        const esito = await generateBriefingForUser(supabase, d);
        if (esito === "salvato") ok++;
        else if (esito === "niente_da_dire") nienteDaDire++;
        else scartati++;
      } catch (e) {
        failed++;
        errors.push({ user_id: d.user_id, error: e instanceof Error ? e.message : String(e) });
        console.error(`[morning-brief] user ${d.user_id} fail`, e);
      }
    }

    return jsonResponse({
      ok: true,
      generated: ok,
      niente_da_dire: nienteDaDire,
      scartati,
      senza_permessi: senzaPermessi,
      failed,
      errors: errors.slice(0, 5),
    }, 200, cors);

  } catch (e) {
    // requireAuth/requireInternalSecret throwano Response per UX consistente
    // con altre edge function. Restituiamole direttamente.
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[morning-brief] fatal", msg);
    return errorResponse(`Fatal: ${msg}`, 500, cors);
  }
});

/**
 * Ruoli e permessi di tutti i candidati, a lotti. Se una lettura fallisce si
 * ferma il giro: meglio nessun brief che un brief col ruolo sbagliato.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function destinatariConPiano(supabase: any, candidati: BriefingInput[]): Promise<Destinatario[]> {
  const ids = [...new Set(candidati.map((c) => c.user_id))];
  const ruoli = new Map<string, string[]>();
  const permessi = new Map<string, Record<string, unknown>>();
  for (let i = 0; i < ids.length; i += LOTTO_UTENTI) {
    const lotto = ids.slice(i, i + LOTTO_UTENTI);
    const [righeRuoli, righePermessi] = await Promise.all([
      supabase.from("user_roles").select("user_id, role").in("user_id", lotto),
      supabase.from("staff_permissions").select("*").in("user_id", lotto),
    ]);
    if (righeRuoli.error) throw new Error(`lettura ruoli: ${righeRuoli.error.message}`);
    if (righePermessi.error) throw new Error(`lettura permessi: ${righePermessi.error.message}`);
    for (const r of (righeRuoli.data ?? []) as Array<{ user_id: string; role: string }>) {
      ruoli.set(r.user_id, [...(ruoli.get(r.user_id) ?? []), String(r.role)]);
    }
    for (const p of (righePermessi.data ?? []) as Array<Record<string, unknown>>) {
      permessi.set(`${p.user_id}:${p.company_id}`, p);
    }
  }
  return candidati.map((c) => {
    const perm = permessi.get(`${c.user_id}:${c.company_id}`) ?? null;
    return { ...c, permessi: perm, piano: pianoDelBrief(ruoli.get(c.user_id) ?? [], perm) };
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function generateBriefingForUser(supabase: any, d: Destinatario): Promise<EsitoBrief> {
  // Il ruolo VERO dell'utente: il motore rifà su questo i suoi controlli (ruolo
  // dello strumento, permesso d'area, commesse assegnate, importi nascosti).
  // Fino al 24/09/2026 qui c'era "company_admin" per tutti.
  const toolCtx: ToolContext = {
    supabase,
    companyId: d.company_id,
    userId: d.user_id,
    primaryRole: d.piano.ruolo ?? "",
    personaKey: "silvio",
    channel: "internal_chat",
    staffPermissions: d.permessi ?? null,
  };

  // ── Raccolta dati: solo gli strumenti del piano, in parallelo ───────
  const dati = await raccogliDatiDelBrief(d.piano, (nome, argomenti) => executeToolWithRouting(nome, argomenti, toolCtx));
  const dataParts = [...dati.parti];

  // ── MP-SILVIO-BRIEF-ACTIONABLE-01: da «alert» a «azioni pronte da approvare» ──
  // Per ogni alert critico/importante con un'azione operativa, pre-creo la proposta
  // (riusa silvio-execute-action → email/ordine reali) in stato 'pending'. Niente
  // esegue senza approvazione umana: la card Approva/Ignora appare in "Cose da sapere".
  // Solo per gli amministratori: gli avvisi sono dell'intera azienda.
  const briefActions = d.piano.azioniPronte ? await prepareActionableProposals(supabase, d) : [];
  if (briefActions.length > 0) {
    dataParts.push(
      `Azioni già pronte da approvare (${briefActions.length}): ` +
      briefActions.map((a) => `${a.label} — ${a.alert_title}`).join("; "),
    );
  }

  if (!dati.conContenuto && briefActions.length === 0) {
    // Nessun dato da raccontare e nessuna azione: niente briefing, e niente modello.
    return "niente_da_dire";
  }

  // ── LLM: estrai briefing strutturato ─────────────────────────────
  const sysPrompt = `Sei Silvio, assistente AI di un'impresa edile italiana. Genera il briefing del giorno per l'utente.

INPUT: dati operativi delle ultime 24-48h.

OUTPUT JSON ESATTO (no markdown wrappers):
{
  "content": "stringa markdown 200-400 char con 3-5 bullet su cosa è IMPORTANTE oggi",
  "key_points": [
    {"text": "breve max 80 char", "severity": "info"|"attention"|"urgent", "action_hint": "verbo+oggetto, max 30 char"},
    ...3-5 punti
  ],
  "severity": "info" se tutto regolare, "attention" se ci sono cose da seguire, "urgent" se c'è crediti scaduti gravi/cashflow negativo/pose oggi non assegnate"
}

REGOLE:
- Concentrati su COSE AZIONABILI, non statistiche generiche.
- Se nei dati c'è "Azioni già pronte da approvare", dillo chiaramente: hai PREPARATO le bozze e bastano un tap (es. "Ho già preparato 3 azioni: ti basta approvarle qui sotto"). NON dire che le hai inviate: sono in attesa di conferma.
- Se non c'è nulla di urgente, dillo (es. "Nessuna anomalia rilevante stamattina").
- Parla SOLO delle aree presenti nei DATI. Se un'area manca (cassa, crediti, lavori), non nominarla e non dire che manca: chi legge non vede quell'area.
- NO emoji. NO saluti. NO "buongiorno".
- Cita numeri reali dai dati, MAI inventare.
- Lingua: italiano, tono diretto da socio (non assistente formale).`;

  const userPrompt = `DATI:\n\n${dataParts.join("\n\n")}\n\nGenera il briefing in JSON.`;

  const aiResult = await aiRouterComplete({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: supabase as any,
    taskKey: "text_summarize",
    messages: [
      { role: "system", content: sysPrompt },
      { role: "user", content: userPrompt },
    ],
    params: { temperature: 0.2, max_tokens: 700 },
    responseFormat: { type: "json_object" },
    companyId: d.company_id,
    userId: d.user_id,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ar = aiResult as any;
  let parsed: { content: string; key_points: Array<{ text: string; severity?: string; action_hint?: string }>; severity?: string };
  try {
    parsed = JSON.parse(ar?.content ?? "{}");
  } catch {
    console.warn(`[morning-brief] JSON parse failed user=${d.user_id}`);
    return "scartato";
  }

  if (!parsed.content || parsed.content.length < 20) return "scartato";

  // Severità finale: se ci sono azioni critiche pronte, non scendere sotto 'urgent'
  // anche se l'LLM ha sottostimato.
  let finalSeverity = ["info", "attention", "urgent"].includes(parsed.severity ?? "") ? parsed.severity! : "info";
  if (briefActions.some((a) => a.severity === "critical") && finalSeverity === "info") {
    finalSeverity = "urgent";
  }

  // ── Salva (idempotent: UNIQUE user_id + brief_date) ─────────────
  const { error: insErr } = await supabase
    .from("silvio_morning_briefings")
    .insert({
      company_id: d.company_id,
      user_id: d.user_id,
      content: parsed.content.slice(0, 2000),
      key_points: Array.isArray(parsed.key_points) ? parsed.key_points.slice(0, 5) : [],
      severity: finalSeverity,
      actions: briefActions,
      tools_used: dati.usati,
      model_used: ar?.model_used ?? null,
      cost_usd: ar?.cost_usd ?? null,
    });

  if (insErr) {
    if (/duplicate key/i.test(insErr.message ?? "")) return "scartato"; // briefing già esistente
    throw new Error(`insert briefing: ${insErr.message}`);
  }
  return "salvato";
}

/**
 * MP-SILVIO-BRIEF-ACTIONABLE-01 — da «alert» a «azioni pronte da approvare».
 * Carica gli alert OPEN operativi critici/importanti e, per ciascuno, pre-crea
 * (idempotente, lato DB) una proposta HITL in stato 'pending' che riusa il path
 * maturo silvio-execute-action. Non esegue nulla: serve solo conferma in 1 tap.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function prepareActionableProposals(supabase: any, t: BriefingInput): Promise<BriefAction[]> {
  const out: BriefAction[] = [];
  try {
    const { data: alertRows, error } = await supabase
      .from("silvio_alerts")
      .select("id, alert_type, severity, title, cta_label, cta_action")
      .eq("company_id", t.company_id)
      .eq("status", "open")
      .in("cta_action", OPERATIONAL_CTA)
      .in("severity", ["critical", "warning"])
      .order("severity", { ascending: true }) // 'critical' < 'warning' (alfabetico) → critici prima
      .order("created_at", { ascending: false })
      .limit(MAX_BRIEF_ACTIONS);
    if (error) {
      console.warn("[morning-brief] load actionable alerts failed:", error.message);
      return out;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const a of ((alertRows ?? []) as any[])) {
      const { data: pid, error: promErr } = await supabase.rpc("silvio_brief_promote_alert", {
        p_company_id: t.company_id,
        p_user_id: t.user_id,
        p_alert_id: a.id,
      });
      if (promErr) {
        console.warn(`[morning-brief] promote alert ${a.id} failed:`, promErr.message);
        continue;
      }
      if (pid) {
        out.push({
          proposal_id: pid as string,
          action_type: a.cta_action as string,
          label: (a.cta_label as string | null) ?? (a.cta_action as string),
          alert_title: a.title as string,
          severity: a.severity as string,
        });
      }
    }
  } catch (e) {
    console.warn("[morning-brief] prepareActionableProposals threw:", e instanceof Error ? e.message : String(e));
  }
  return out;
}
