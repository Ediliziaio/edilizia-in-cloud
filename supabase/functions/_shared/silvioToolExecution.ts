/**
 * MP-AIE-01 v2 — Helper di esecuzione tool con risk-level routing + audit.
 *
 * Sostituisce `executeTool` di silvioTools.ts (che resta per back-compat).
 * Funzionalità aggiuntive:
 *   1. Permission check completo (role + persona + channel)
 *   2. Risk-level routing (safe esegue, yellow/red crea action_proposal)
 *   3. Audit log unificato in `tool_execution_log`
 *   4. Esecuzione parallela di tool calls multiple (executeToolsParallel)
 *
 * Riusato da: silvio-chat, ai-orchestrator, whatsapp-ai-processor (post-refactor),
 * telegram-bot-processor, internal-agent-tools.
 */

import {
  DEFAULT_TOOL_ALLOWED_ROLES,
  DOMAIN_STAFF_PERMISSION,
  SILVIO_TOOLS,
  type Channel,
  type RiskLevel,
  type SilvioTool,
  type ToolContext,
} from "./silvioTools.ts";

export interface ToolExecutionResult {
  success: boolean;
  /** Output del tool (solo se eseguito direttamente). */
  data?: unknown;
  /** Errore di esecuzione/permission. */
  error?: { code: string; message: string };
  /** Se yellow/red ha creato una proposta HITL invece di eseguire. */
  proposalId?: string;
  /** Tool name (echo per logging consumer). */
  toolName: string;
  /** Durata in ms. */
  durationMs: number;
  /** Risk level effettivamente applicato (per UI). */
  riskLevel?: RiskLevel;
}

interface AuditFields {
  inputPayload: Record<string, unknown> | null;
  outputPayload: Record<string, unknown> | null;
  status: "success" | "error" | "proposed" | "denied";
  errorMessage: string | null;
  proposalId: string | null;
  durationMs: number;
}

// MP-SILVIO-COPILOT-01 — memoria preferenze decisionali.
// SICUREZZA (scelta del titolare): l'auto-esecuzione da regola è DISATTIVA.
// Il motore (silvio_decision_rules + silvio_match_decision_rule) e il punto di
// aggancio esistono già; per attivare l'auto-approvazione basterà mettere true
// QUESTO flag. Varrà SEMPRE solo per tool 'yellow' (mai 'red'), loggato e annullabile.
const DECISION_RULES_AUTOEXEC_ENABLED = false;

/**
 * Esegue un singolo tool con permission + risk-level routing + audit.
 */
export async function executeToolWithRouting(
  toolName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: any,
  ctx: ToolContext,
): Promise<ToolExecutionResult> {
  const t0 = Date.now();
  const tool = SILVIO_TOOLS[toolName];
  const channel: Channel = ctx.channel ?? "internal_chat";

  if (!tool) {
    return {
      success: false,
      toolName,
      error: { code: "tool_not_found", message: `Tool '${toolName}' non trovato nel registry` },
      durationMs: Date.now() - t0,
    };
  }

  // ── Permission: roles ──
  // FAIL-CLOSED: un tool senza allowedRoles è riservato agli admin
  // (DEFAULT_TOOL_ALLOWED_ROLES), mai eseguibile da qualsiasi ruolo.
  {
    const toolRoles = tool.allowedRoles && tool.allowedRoles.length > 0
      ? tool.allowedRoles
      : DEFAULT_TOOL_ALLOWED_ROLES;
    if (!toolRoles.includes(ctx.primaryRole) && !toolRoles.includes("*")) {
      await logAudit(ctx, tool, toolName, {
        inputPayload: sanitize(input),
        outputPayload: null,
        status: "denied",
        errorMessage: `role '${ctx.primaryRole}' not in allowedRoles`,
        proposalId: null,
        durationMs: Date.now() - t0,
      });
      return {
        success: false,
        toolName,
        error: { code: "forbidden_role", message: "Ruolo non autorizzato per questo tool" },
        durationMs: Date.now() - t0,
        riskLevel: tool.riskLevel,
      };
    }
  }

  // ── Permission: permessi granulari per-dominio (staff_permissions) ──
  // getToolsForChannel li applica solo alla LISTA mostrata al modello, e solo
  // se il chiamante li passa (silvio-chat sì, telegram/ai-orchestrator no).
  // Qui il gate è nel punto obbligato di ogni esecuzione: vale per tutti i
  // canali e regge anche se il modello invoca un tool che non era in lista
  // (nome allucinato, suggerito dall'utente o iniettato in un documento).
  // I permessi si leggono UNA volta e servono a due gate diversi: questo
  // (l'area intera), e piu sotto quello sulle RIGHE e sulle COLONNE.
  let staffPerms: Record<string, unknown> | null = null;
  if (ctx.primaryRole === "company_staff") {
    staffPerms = ctx.staffPermissions ?? null;
    if (!staffPerms) {
      // Non passati dal chiamante: li leggiamo noi. Una query in più è
      // preferibile a un permesso granulare aggirato.
      try {
        const { data } = await ctx.supabase
          .from("staff_permissions")
          .select("*")
          .eq("user_id", ctx.userId)
          .eq("company_id", ctx.companyId)
          .maybeSingle();
        staffPerms = (data as Record<string, unknown> | null) ?? null;
      } catch (_e) {
        staffPerms = null;
      }
    }
  }
  if (ctx.primaryRole === "company_staff" && tool.domain) {
    const permKey = DOMAIN_STAFF_PERMISSION[tool.domain];
    if (permKey) {
      const perms = staffPerms;
      // Nessuna riga permessi = nessuna restrizione esplicita (comportamento
      // storico dell'app): si nega solo quando il permesso è esplicitamente false.
      if (perms && perms[permKey] === false) {
        await logAudit(ctx, tool, toolName, {
          inputPayload: sanitize(input),
          outputPayload: null,
          status: "denied",
          errorMessage: `staff permission '${permKey}' = false (domain '${tool.domain}')`,
          proposalId: null,
          durationMs: Date.now() - t0,
        });
        return {
          success: false,
          toolName,
          error: {
            code: "forbidden_permission",
            message: `Non hai il permesso per l'area "${tool.domain}". Chiedi all'amministratore di abilitartelo.`,
          },
          durationMs: Date.now() - t0,
          riskLevel: tool.riskLevel,
        };
      }
    }
  }

  // ── Permission: persona ──
  if (ctx.personaKey && tool.allowedPersonas && tool.allowedPersonas.length > 0) {
    if (!tool.allowedPersonas.includes(ctx.personaKey) && !tool.allowedPersonas.includes("*")) {
      await logAudit(ctx, tool, toolName, {
        inputPayload: sanitize(input),
        outputPayload: null,
        status: "denied",
        errorMessage: `persona '${ctx.personaKey}' not in allowedPersonas`,
        proposalId: null,
        durationMs: Date.now() - t0,
      });
      return {
        success: false,
        toolName,
        error: { code: "forbidden_persona", message: "Persona non autorizzata per questo tool" },
        durationMs: Date.now() - t0,
        riskLevel: tool.riskLevel,
      };
    }
  }

  // ── Permission: channel ──
  if (tool.allowedChannels && tool.allowedChannels.length > 0) {
    if (!tool.allowedChannels.includes(channel)) {
      await logAudit(ctx, tool, toolName, {
        inputPayload: sanitize(input),
        outputPayload: null,
        status: "denied",
        errorMessage: `channel '${channel}' not in allowedChannels`,
        proposalId: null,
        durationMs: Date.now() - t0,
      });
      return {
        success: false,
        toolName,
        error: { code: "forbidden_channel", message: `Tool non disponibile su canale ${channel}` },
        durationMs: Date.now() - t0,
        riskLevel: tool.riskLevel,
      };
    }
  }

  // ── Permission: RIGHE e COLONNE (audit 2026-09-03) ──────────────────────
  // Il gate sopra ragiona per AREA: "vedi le commesse" oppure no. Ma i permessi
  // hanno anche caselle piu fini che le RPC di Silvio ignoravano del tutto,
  // perche girano in SECURITY DEFINER e quindi scavalcano le policy di riga:
  //   · only_assigned          → "vede solo le commesse assegnate a lui"
  //   · only_my_warehouse      → "vede solo le commesse del suo magazzino"
  //   · can_view_order_amounts → vede le commesse ma non gli importi
  //   · can_view_margins       → non vede i margini
  // Misurato in produzione prima del fix: tre persone con only_assigned = true
  // e ZERO commesse assegnate. Nell'applicativo ne vedevano 0 (giusto), a
  // Silvio bastava chiedere "elencami i cantieri" per averne 65 con clienti e
  // importi. Da qui in poi il limite vale anche quando la domanda passa dall'AI.
  const scope = await loadStaffScope(ctx, staffPerms);
  if (scope) {
    const denied = orderCodeNotAllowed(input, scope);
    if (denied) {
      await logAudit(ctx, tool, toolName, {
        inputPayload: sanitize(input),
        outputPayload: null,
        status: "denied",
        errorMessage: `visibilita commesse ristretta: '${denied}' fuori perimetro utente`,
        proposalId: null,
        durationMs: Date.now() - t0,
      });
      return {
        success: false,
        toolName,
        error: {
          code: "forbidden_row",
          message: `La commessa ${denied} non è tra quelle che puoi vedere. Chiedi all'amministratore di assegnartela o di darti accesso al suo magazzino.`,
        },
        durationMs: Date.now() - t0,
        riskLevel: tool.riskLevel,
      };
    }
  }

  // ── Risk-level routing ──
  const risk: RiskLevel = tool.riskLevel ?? "safe";

  if (risk === "red") {
    // Forza HITL anche per super_admin
    const proposalId = await createActionProposal(ctx, tool, toolName, input, "red");
    if (!proposalId) {
      await logAudit(ctx, tool, toolName, {
        inputPayload: sanitize(input),
        outputPayload: null,
        status: "error",
        errorMessage: "failed to create red-risk action proposal",
        proposalId: null,
        durationMs: Date.now() - t0,
      });
      return {
        success: false,
        toolName,
        error: { code: "proposal_creation_failed", message: "Non sono riuscito a creare la proposta di conferma." },
        durationMs: Date.now() - t0,
        riskLevel: "red",
      };
    }
    await logAudit(ctx, tool, toolName, {
      inputPayload: sanitize(input),
      outputPayload: null,
      status: "proposed",
      errorMessage: null,
      proposalId,
      durationMs: Date.now() - t0,
    });
    return {
      success: true,
      toolName,
      proposalId,
      durationMs: Date.now() - t0,
      riskLevel: "red",
    };
  }

  if (risk === "yellow" && !ctx.preApproved) {
    // MP-COPILOT: se il titolare ha attivato l'auto-esecuzione (flag) e una regola
    // 'auto_approva' copre il caso, esegui senza chiedere (loggato + annullabile).
    // Struttura: questo branch è SOLO dentro il ramo 'yellow' → un tool 'red' (gestito
    // sopra con return) non può MAI essere auto-approvato. Difensivo: ogni errore → proposta.
    if (DECISION_RULES_AUTOEXEC_ENABLED) {
      const rule = await matchDecisionRule(ctx, tool, input);
      if (rule && rule.azione === "auto_approva") {
        try {
          const data = await tool.executor(input, ctx);
          await logAudit(ctx, tool, toolName, {
            inputPayload: sanitize(input),
            outputPayload: sanitize(data),
            status: "success",
            errorMessage: `auto-approvato da regola ${rule.rule_id}`,
            proposalId: null,
            durationMs: Date.now() - t0,
          });
          return { success: true, toolName, data, durationMs: Date.now() - t0, riskLevel: "yellow" };
        } catch (_e) {
          // fall-through: in caso di errore creiamo comunque la proposta HITL
        }
      }
    }

    const proposalId = await createActionProposal(ctx, tool, toolName, input, "yellow");
    if (!proposalId) {
      await logAudit(ctx, tool, toolName, {
        inputPayload: sanitize(input),
        outputPayload: null,
        status: "error",
        errorMessage: "failed to create yellow-risk action proposal",
        proposalId: null,
        durationMs: Date.now() - t0,
      });
      return {
        success: false,
        toolName,
        error: { code: "proposal_creation_failed", message: "Non sono riuscito a creare la proposta di conferma." },
        durationMs: Date.now() - t0,
        riskLevel: "yellow",
      };
    }
    await logAudit(ctx, tool, toolName, {
      inputPayload: sanitize(input),
      outputPayload: null,
      status: "proposed",
      errorMessage: null,
      proposalId,
      durationMs: Date.now() - t0,
    });
    return {
      success: true,
      toolName,
      proposalId,
      durationMs: Date.now() - t0,
      riskLevel: "yellow",
    };
  }

  // ── Esecuzione (safe oppure yellow preApproved) ──
  try {
    const raw = await tool.executor(input, ctx);
    const data = scope ? applyStaffScope(raw, scope, tool.domain) : raw;
    await logAudit(ctx, tool, toolName, {
      inputPayload: sanitize(input),
      outputPayload: sanitize(data),
      status: "success",
      errorMessage: null,
      proposalId: null,
      durationMs: Date.now() - t0,
    });
    return {
      success: true,
      toolName,
      data,
      durationMs: Date.now() - t0,
      riskLevel: risk,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await logAudit(ctx, tool, toolName, {
      inputPayload: sanitize(input),
      outputPayload: null,
      status: "error",
      errorMessage: message,
      proposalId: null,
      durationMs: Date.now() - t0,
    });
    return {
      success: false,
      toolName,
      error: { code: "execution_failed", message },
      durationMs: Date.now() - t0,
      riskLevel: risk,
    };
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   Permessi di RIGA e di COLONNA sui risultati dei tool
   ══════════════════════════════════════════════════════════════════════════
   Le RPC di Silvio sono SECURITY DEFINER: vedono tutta l'azienda per
   costruzione, quindi le policy di riga non le toccano. Finche il permesso e
   "vedi l'area oppure no" il gate per dominio basta; per "vedi solo le tue" e
   "niente importi / niente margini" no. Qui il limite si applica sul risultato,
   una volta sola e per tutti i canali.

   Deliberatamente conservativo: agisce SOLO su chi ha la casella spuntata, e
   solo sui campi che si riconoscono per nome. Chi non ha restrizioni non passa
   nemmeno di qua (loadStaffScope ritorna null). */

interface StaffScope {
  /** Codici delle commesse che l'utente puo' vedere (upper-case). */
  codiciConsentiti: Set<string>;
  /** Id delle commesse che l'utente puo' vedere. */
  idConsentiti: Set<string>;
  /** true quando la visibilita' commesse e' ristretta (assegnate o magazzino). */
  commesseRistrette: boolean;
  nascondiImporti: boolean;
  nascondiMargini: boolean;
}

/** Chiavi che identificano UNA commessa dentro il risultato di un tool. */
const CHIAVI_COMMESSA = ["commessa", "order_code", "commessa_codice", "codice_commessa", "cantiere_codice"];
const CHIAVI_COMMESSA_ID = ["order_id", "commessa_id", "cantiere_id"];

/** Nomi di campo che contengono denaro di commessa. */
// Volutamente NON include "totale"/"total" da soli: `passi_totali` e
// `candidati_totali` sono conteggi, non denaro. `total_amount` passa lo stesso
// perche' contiene "amount".
const RE_IMPORTO = /importo|imponibile|amount|prezzo|price|acconto|saldo|incassat|fatturat|costo|valore_|_valore|residuo|scadut|_eur$|_euro$/i;
/** Nomi di campo che contengono margine / redditivita. */
const RE_MARGINE = /margin|marginalit|ricarico|markup|utile|redditiv|profitt/i;

/** Domini in cui "can_view_order_amounts" ha senso: i soldi di una commessa. */
const DOMINI_IMPORTI_COMMESSA = new Set(["cantiere", "operations", "preventivi", "sales"]);

const VALORE_NASCOSTO = "— non visibile con i tuoi permessi —";

/**
 * Costruisce il perimetro dell'utente, o null se non c'e nulla da limitare.
 * Una sola query, e solo per chi ha davvero only_assigned.
 */
async function loadStaffScope(
  ctx: ToolContext,
  perms: Record<string, unknown> | null,
): Promise<StaffScope | null> {
  if (ctx.primaryRole !== "company_staff" || !perms) return null;
  // Due modalita' ristrette sulle commesse, entrambe da rispettare:
  // "solo quelle assegnate a me" e "solo quelle del mio magazzino".
  const commesseRistrette = perms.only_assigned === true || perms.only_my_warehouse === true;
  const nascondiImporti = perms.can_view_order_amounts === false;
  const nascondiMargini = perms.can_view_margins === false;
  if (!commesseRistrette && !nascondiImporti && !nascondiMargini) return null;

  const codici = new Set<string>();
  const ids = new Set<string>();
  if (commesseRistrette) {
    try {
      // La regola sta in UN posto solo (silvio_commesse_visibili, che ricalca
      // can_see_order con l'utente passato per argomento): se domani nasce una
      // quarta modalita' di visibilita', qui non si tocca niente.
      const { data, error } = await ctx.supabase.rpc("silvio_commesse_visibili", {
        p_company_id: ctx.companyId,
        p_user_id: ctx.userId,
      });
      if (error) throw error;
      for (const row of (data ?? []) as Array<{ id: string; order_code: string | null }>) {
        if (row.id) ids.add(String(row.id));
        if (row.order_code) codici.add(String(row.order_code).trim().toUpperCase());
      }
    } catch (_e) {
      // Fail-closed: se non riusciamo a sapere quali commesse sono sue, non
      // gliene mostriamo nessuna. Meglio una risposta vuota che una che non
      // doveva vedere.
    }
  }
  return { codiciConsentiti: codici, idConsentiti: ids, commesseRistrette, nascondiImporti, nascondiMargini };
}

/** Il nome del campo indica una commessa? Ritorna il valore normalizzato. */
function estraiCommessa(obj: Record<string, unknown>): { codice?: string; id?: string } | null {
  let out: { codice?: string; id?: string } | null = null;
  for (const k of CHIAVI_COMMESSA) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) { out = { ...(out ?? {}), codice: v.trim().toUpperCase() }; break; }
  }
  for (const k of CHIAVI_COMMESSA_ID) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) { out = { ...(out ?? {}), id: v.trim() }; break; }
  }
  return out;
}

function commessaConsentita(rif: { codice?: string; id?: string }, scope: StaffScope): boolean {
  if (rif.id && scope.idConsentiti.has(rif.id)) return true;
  if (rif.codice && scope.codiciConsentiti.has(rif.codice)) return true;
  return false;
}

/**
 * Se gli ARGOMENTI del tool nominano una commessa non sua, si nega prima di
 * eseguire: piu pulito che eseguire e poi cancellare la risposta.
 * Ritorna il codice negato, oppure null.
 */
function orderCodeNotAllowed(input: unknown, scope: StaffScope): string | null {
  if (!scope.commesseRistrette) return null;
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const rif = estraiCommessa(input as Record<string, unknown>);
  if (!rif) return null;
  if (commessaConsentita(rif, scope)) return null;
  return rif.codice ?? rif.id ?? "richiesta";
}

/**
 * Passa il risultato al setaccio: via le righe di commesse non sue, via i
 * valori di importo/margine che non puo vedere. Non tocca la struttura, cosi
 * il modello legge lo stesso formato di sempre.
 */
function applyStaffScope(data: unknown, scope: StaffScope, domain?: string): unknown {
  const importiQui = scope.nascondiImporti && (!domain || DOMINI_IMPORTI_COMMESSA.has(domain));
  let righeTolte = 0;

  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) {
      const out: unknown[] = [];
      for (const el of node) {
        if (scope.commesseRistrette && el && typeof el === "object" && !Array.isArray(el)) {
          const rif = estraiCommessa(el as Record<string, unknown>);
          if (rif && !commessaConsentita(rif, scope)) { righeTolte++; continue; }
        }
        out.push(walk(el));
      }
      return out;
    }
    if (node && typeof node === "object") {
      const src = node as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(src)) {
        if (scope.nascondiMargini && RE_MARGINE.test(k)) { out[k] = VALORE_NASCOSTO; continue; }
        if (importiQui && RE_IMPORTO.test(k) && typeof v !== "object") { out[k] = VALORE_NASCOSTO; continue; }
        out[k] = walk(v);
      }
      return out;
    }
    return node;
  };

  const scremato = walk(data);
  if (scremato && typeof scremato === "object" && !Array.isArray(scremato)) {
    const note: string[] = [];
    if (righeTolte > 0) {
      note.push(righeTolte === 1
        ? "1 riga non mostrata: riguarda una commessa fuori dalla visibilita di chi sta chiedendo."
        : `${righeTolte} righe non mostrate: riguardano commesse fuori dalla visibilita di chi sta chiedendo.`);
    }
    if (scope.nascondiMargini) note.push("I margini non sono visibili con i permessi di questo utente.");
    if (importiQui) note.push("Gli importi di commessa non sono visibili con i permessi di questo utente.");
    if (note.length > 0) {
      (scremato as Record<string, unknown>).nota_permessi =
        `${note.join(" ")} Non dire che i dati non esistono: di' che non sono visibili con i permessi attuali e che vanno chiesti all'amministratore.`;
    }
  }
  return scremato;
}

/**
 * Esegue una lista di tool calls in parallelo (Promise.all).
 * Tipica chiamata dopo che l'LLM ritorna `tool_calls[]` in una iterazione.
 */
export async function executeToolsParallel(
  calls: Array<{ name: string; input: unknown }>,
  ctx: ToolContext,
): Promise<ToolExecutionResult[]> {
  return Promise.all(calls.map(c => executeToolWithRouting(c.name, c.input, ctx)));
}

// ─── Internals ──────────────────────────────────────────────────────────────

/**
 * Etichetta in italiano dell'azione, per il riepilogo di conferma.
 * Priorità alle operazioni ECONOMICHE: chi approva deve leggere in chiaro
 * "cosa sto autorizzando" senza conoscere i nomi tecnici dei tool.
 */
const AZIONE_LABEL: Record<string, string> = {
  // ── denaro in entrata/uscita ──
  registra_pagamento_commessa: "Registrare un INCASSO",
  registra_pagamento_fornitore: "Registrare un PAGAMENTO a fornitore",
  invia_sollecito_pagamento: "Inviare un sollecito di pagamento",
  registra_fattura_passiva: "Registrare una FATTURA fornitore",
  create_invoice_draft: "Creare una bozza di FATTURA",
  compone_sal_da_rapportini: "Comporre un SAL da fatturare",
  approva_sal: "Approvare un SAL",
  genera_f24_mese: "Generare un F24",
  genera_lipe_trimestrale: "Generare la LIPE trimestrale",
  invia_lipe_ade: "INVIARE la LIPE all'Agenzia delle Entrate",
  genera_cedolino_dipendente: "Generare un cedolino",
  invia_cedolino_dipendente: "Inviare un cedolino",
  avanza_fatt_zero_touch: "Avanzare la pipeline di fatturazione",
  // ── impegni commerciali/operativi ──
  crea_ordine_fornitore: "Creare un ordine d'acquisto",
  crea_commessa_bozza: "Creare una commessa",
  crea_cliente: "Creare un cliente in anagrafica",
  aggiorna_stato_commessa: "Cambiare stato a una commessa",
  aggiorna_stato_preventivo: "Cambiare stato a un preventivo",
  aggiorna_opportunita: "Aggiornare un'opportunità",
  registra_movimento_magazzino: "Movimentare il magazzino",
  crea_articolo_magazzino: "Creare un articolo a magazzino",
  importa_listino_prodotti: "Importare voci a listino",
  carica_documento_cantiere: "Archiviare un documento in commessa",
};

/** Formatta un numero come importo in euro all'italiana. */
function formatEuro(n: number): string {
  return `${n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

/** Primo valore utile tra più chiavi possibili dell'input del tool. */
function pick(input: unknown, chiavi: string[]): unknown {
  if (!input || typeof input !== "object") return undefined;
  const obj = input as Record<string, unknown>;
  for (const k of chiavi) {
    const v = obj[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

/**
 * Riepilogo leggibile dell'azione da confermare.
 * Prima mostrava solo "FINANCE: registra_pagamento_commessa": chi approvava non
 * vedeva né importo né controparte, cioè non poteva decidere davvero. Ora la
 * riga dice cosa si sta autorizzando, per quanto e verso chi.
 */
export function buildProposalSummary(toolName: string, tool: SilvioTool, input: unknown): string {
  const azione = AZIONE_LABEL[toolName] ?? toolName.replace(/_/g, " ");
  const parti: string[] = [];

  const importo = pick(input, ["importo", "amount", "valore", "totale", "total", "importo_pagato"]);
  const num = typeof importo === "number" ? importo : Number(importo);
  if (Number.isFinite(num) && num > 0) parti.push(formatEuro(num));

  const chi = pick(input, [
    "fornitore_nome", "cliente_nome", "contatto_nome", "destinatario",
    "nome_cliente", "opportunita_nome", "assegna_a", "articolo", "nome",
  ]);
  // La freccia ha senso solo dopo un importo ("1.830 € → Limena Srl").
  if (typeof chi === "string") parti.push(parti.length > 0 ? `→ ${chi}` : chi);

  const rif = pick(input, ["commessa_codice", "preventivo", "numero", "oda_number", "ticket", "titolo"]);
  if (typeof rif === "string") parti.push(`(${rif})`);

  // Per i cambi di stato l'informazione che conta è proprio lo stato nuovo.
  const stato = pick(input, ["nuovo_stato", "stato", "esito"]);
  if (typeof stato === "string") parti.push(`→ ${stato}`);

  const quanti = pick(input, ["voci", "righe", "items"]);
  if (Array.isArray(quanti) && quanti.length > 0) parti.push(`${quanti.length} righe`);

  const quando = pick(input, ["data_pagamento", "data", "scadenza_data", "data_prevista"]);
  if (typeof quando === "string" && /^\d{4}-\d{2}-\d{2}$/.test(quando)) {
    const [a, m, g] = quando.split("-");
    parti.push(`il ${g}/${m}/${a}`);
  }

  const testa = parti.length > 0 ? `${azione}: ${parti.join(" ")}` : azione;
  // Le operazioni economiche restano riconoscibili a colpo d'occhio nella lista.
  const prefisso = tool.domain === "finance" || tool.domain === "fattura" ? "💶 " : "";
  return `${prefisso}${testa}`;
}

/**
 * Crea un'action proposal nella tabella ai_action_proposals con la giusta
 * configurazione di risk_level. La proposta resta in stato 'pending' finché
 * l'utente non conferma via UI (componente `ActionProposalCard`).
 */
async function createActionProposal(
  ctx: ToolContext,
  tool: SilvioTool,
  toolName: string,
  input: unknown,
  riskLevel: "yellow" | "red",
): Promise<string> {
  try {
    const summary = buildProposalSummary(toolName, tool, input);
    const { data, error } = await ctx.supabase.rpc("silvio_tool_propose_action", {
      p_company_id: ctx.companyId,
      p_user_id: ctx.userId,
      p_action_type: toolName,
      p_summary: summary.substring(0, 200),
      p_payload: {
        tool_name: toolName,
        tool_domain: tool.domain ?? null,
        input,
        channel: ctx.channel ?? "internal_chat",
        session_id: ctx.sessionId ?? null,
        trace_id: ctx.traceId ?? null,
      },
      p_session_id: null,
      p_persona_key: ctx.personaKey ?? "silvio",
      p_risk_level: riskLevel,
    });
    if (error) {
      console.warn("[silvioToolExecution] createActionProposal RPC error:", error.message);
      return "";
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = data as any;
    return String(r?.proposal_id ?? "");
  } catch (e) {
    console.warn(
      "[silvioToolExecution] createActionProposal threw:",
      e instanceof Error ? e.message : String(e),
    );
    return "";
  }
}

/**
 * MP-SILVIO-COPILOT-01 — cerca una regola decisionale attiva che copra questa
 * azione yellow. dominio = tool.domain; payload = input (flat). Read-only via RPC.
 * Difensivo: input non-oggetto / errore / nessun match → null (→ proposta HITL).
 */
async function matchDecisionRule(
  ctx: ToolContext,
  tool: SilvioTool,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: any,
): Promise<{ rule_id: string; azione: string } | null> {
  try {
    if (!input || typeof input !== "object" || Array.isArray(input)) return null;
    const dominio = tool.domain ?? null;
    if (!dominio) return null;
    const { data, error } = await ctx.supabase.rpc("silvio_match_decision_rule", {
      p_company_id: ctx.companyId,
      p_dominio: dominio,
      p_payload: input,
    });
    if (error || !data) return null;
    const r = data as { rule_id?: string; azione?: string };
    if (!r?.rule_id || !r?.azione) return null;
    return { rule_id: String(r.rule_id), azione: String(r.azione) };
  } catch {
    return null;
  }
}

/**
 * Audit log su `tool_execution_log` (tabella creata da MP-AIE-01).
 * Best-effort: errori di logging NON bloccano l'esecuzione.
 */
async function logAudit(
  ctx: ToolContext,
  tool: SilvioTool,
  toolName: string,
  fields: AuditFields,
): Promise<void> {
  try {
    await ctx.supabase.from("tool_execution_log").insert({
      company_id: ctx.companyId,
      user_id: ctx.userId,
      persona_key: ctx.personaKey ?? null,
      channel: ctx.channel ?? "internal_chat",
      tool_name: toolName,
      tool_domain: tool.domain ?? "meta",
      risk_level: tool.riskLevel ?? "safe",
      input_payload: fields.inputPayload,
      output_payload: fields.outputPayload,
      status: fields.status === "denied" ? "error" : fields.status,
      error_message: fields.status === "denied"
        ? `denied: ${fields.errorMessage}`
        : fields.errorMessage,
      proposal_id: fields.proposalId,
      duration_ms: fields.durationMs,
      trace_id: ctx.traceId ?? null,
      session_id: ctx.sessionId ?? null,
    });
  } catch (e) {
    console.warn(
      "[silvioToolExecution] audit log failed (non-blocking):",
      e instanceof Error ? e.message : String(e),
    );
  }
}

/**
 * Sanitizza payload per audit log: tronca > 50KB, rimuove fields PII pesanti.
 */
function sanitize(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  try {
    const json = JSON.stringify(redactSensitive(value));
    if (json.length > 50_000) {
      return { _truncated: true, _length: json.length, _preview: json.substring(0, 1000) };
    }
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return { _unserializable: true };
  }
}

const SENSITIVE_KEY_RE = /(password|passwd|secret|token|api[_-]?key|authorization|cookie|iban|tax_code|codice_fiscale|fiscal_code|phone|telefono|email)/i;

function redactSensitive(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[redacted-depth]";
  if (Array.isArray(value)) return value.map((item) => redactSensitive(item, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEY_RE.test(key) ? "[redacted]" : redactSensitive(nested, depth + 1);
    }
    return out;
  }
  return value;
}
