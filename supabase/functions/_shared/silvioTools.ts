/**
 * Silvio Tool Catalog — JSON Schema OpenAI-compatible per tool calling.
 *
 * MP-AIE-01 v2: registry CENTRALE multi-canale.
 * Riusabile da: Silvio chat interna (✅), 18 personas web/mobile (via ai-orchestrator),
 * WhatsApp processor, Voice ElevenLabs, Telegram bot, Email agent, API.
 *
 * Ogni tool definito qui:
 *   1. Ha uno `schema` (formato OpenAI function tool) passato all'LLM
 *   2. Ha un `executor(args, ctx)` server-side che chiama la RPC SQL
 *   3. Dichiara permission (allowedRoles + allowedPersonas + allowedChannels)
 *   4. Dichiara riskLevel ('safe' | 'yellow' | 'red') per HITL routing
 *   5. Ritorna sempre JSON serializzabile (stringificabile per il LLM)
 *
 * Helper di esecuzione: ./silvioToolExecution.ts (executeToolWithRouting,
 * executeToolsParallel, getToolsForChannel, toolsToOpenAISpec).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

import { chargeDirectAiCall, estimateEmbeddingUsage } from "./directAiLedger.ts";
import { buildDdtCarico } from "./ddtCarico.ts";

/**
 * MP-AIE-01 v2 — canali AI supportati. Ogni tool dichiara su quali può essere
 * eseguito. Vuoto/undefined = disponibile su tutti i canali.
 */
export type Channel =
  | "internal_chat"   // Silvio nella chat web/mobile interna (1:1 DM)
  | "web_persona"     // 18 personas web (AssistenteAIPage)
  | "mobile"          // App mobile EiC nativa
  | "whatsapp"        // WhatsApp Business
  | "telegram"        // Telegram bot
  | "voice"           // ElevenLabs voice agent (telefono)
  | "email"           // Email autonomous agent (futuro)
  | "api"             // API per integrazioni terze (futuro)
  | "cron";           // Job schedulati (es. cron weekly reports)

/**
 * MP-AIE-01 v2 — risk level per HITL routing.
 *  - 'safe'   → esegue subito + log success
 *  - 'yellow' → crea action_proposal in pending (utente conferma via UI)
 *  - 'red'    → forza HITL anche per super_admin (es. azioni irreversibili)
 *
 * Bypass: se ctx.preApproved=true, anche yellow esegue subito (post-conferma UI).
 */
export type RiskLevel = "safe" | "yellow" | "red";

/**
 * Domain logico per filtering UI/RBAC + organizzazione tool.
 */
export type ToolDomain =
  | "ai"
  | "kpi"
  | "cantiere"
  | "fattura"
  | "banking"
  | "email"
  | "calendar"
  | "compliance"
  | "hr"
  | "crm"
  | "preventivi"
  | "filiera"
  | "anomalie"
  | "generative"
  | "knowledge"
  | "titolare"
  | "meta"
  // Valori già usati nel catalogo (MP-SILVIO-ACTIONS/TWINS/COPILOT) ma assenti
  // dal tipo: aggiunti per sanare l'incoerenza e renderli filtrabili.
  | "sales"
  | "finance"
  | "warehouse"
  | "operations"
  | "support"
  | "marketing";

export interface ToolContext {
  supabase: SupabaseClient;
  companyId: string;
  userId: string;
  primaryRole: string;
  /**
   * Track 1 Cervello Supremo: array di area_id KB universale a cui la persona corrente
   * ha accesso (es. ["02-finanza-cashflow","05-fiscale-compliance"]).
   * NULL = accesso a tutte le aree (es. silvio, brain, assistente_imprenditore).
   * Usato dal tool search_brain per restringere il RAG alle aree pertinenti.
   */
  kbAreasFilter?: string[] | null;

  // ── MP-AIE-01 v2 — campi multi-canale ────────────────────────────────────
  /** Canale di provenienza. Default "internal_chat" se omesso (back-compat Silvio). */
  channel?: Channel;
  /** Persona AI che invoca il tool (silvio, cfo, pm_cantiere, ...). */
  personaKey?: string;
  /** ID conversazione/sessione corrente (se applicabile). */
  sessionId?: string;
  /** Trace ID per correlazione cross-system (audit). */
  traceId?: string;
  /**
   * Se true, esegue ANCHE i tool con riskLevel='yellow' direttamente (l'utente
   * ha già confermato via UI di action proposals). I tool 'red' richiedono
   * sempre HITL.
   */
  preApproved?: boolean;
  /**
   * MP-EMAIL: Bearer dell'utente, valorizzato SOLO nei contesti chat-utente
   * (es. silvio-chat). Serve ai tool che chiamano edge function RLS-scoped
   * (es. email-silvio-query) riusando i permessi reali dell'utente — niente
   * service-role cross-tenant. Assente in contesti cron/bot → il tool degrada.
   */
  authToken?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ToolExecutor = (args: any, ctx: ToolContext) => Promise<any>;

// Lazy import per non rompere bundle se brainEmbed non disponibile
async function tryGenerateEmbedding(text: string): Promise<number[] | null> {
  try {
    const { generateEmbedding } = await import("./brainEmbed.ts");
    return await generateEmbedding(text);
  } catch (e) {
    console.warn("[silvioTools] embedding skip:", e instanceof Error ? e.message : String(e));
    return null;
  }
}

async function shortHash(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .slice(0, 12)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function isAllowedSilvioStoragePath(path: string, ctx: ToolContext): boolean {
  const clean = String(path ?? "").trim();
  if (
    !clean ||
    clean.startsWith("/") ||
    clean.includes("\\") ||
    clean.length > 600 ||
    clean.split("/").some((segment) => segment === ".." || segment === "")
  ) {
    return false;
  }
  return clean.startsWith(`${ctx.companyId}/`) || clean.startsWith(`${ctx.userId}/`);
}

export interface SilvioTool {
  // OpenAI tool schema
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: any;
  executor: ToolExecutor;
  /** Ruoli che possono attivare questo tool. Vuoto = tutti. Includere "*" per "tutti". */
  allowedRoles?: string[];

  // ── MP-AIE-01 v2 — campi multi-canale ────────────────────────────────────
  /** Personas che hanno il tool nel proprio whitelist. Vuoto = tutte. Includere "*" per "tutte". */
  allowedPersonas?: string[];
  /** Canali su cui il tool è disponibile. Vuoto = tutti. */
  allowedChannels?: Channel[];
  /** Risk level: safe esegue subito, yellow chiede conferma, red forza HITL. Default "safe". */
  riskLevel?: RiskLevel;
  /** Domain logico per filtro UI/RBAC. */
  domain?: ToolDomain;
  /** Costo stimato EUR per esecuzione (per budgeting). Default 0. */
  estimatedCostEur?: number;
  /** Indicazioni compatte per il modello su come interpretare l'output. */
  resultContract?: string;
}

const DOMAIN_RESULT_CONTRACTS: Partial<Record<ToolDomain, string>> = {
  kpi: "Interpreta KPI per periodo/perimetro; separa venduto, incassato, residuo, margine e anomalie.",
  banking: "Non confondere fatturato e cassa: separa scaduti, incassi previsti, uscite, gap e scenario prudente.",
  cantiere: "Distingui venduto, pianificato, eseguibile e incassabile; cita date, merce, squadra e blocchi.",
  fattura: "Distingui bozza, invio, firma, fatturazione e incasso; indica imponibile, IVA, totale e scadenza.",
  preventivi: "Valuta prezzo insieme a margine, acconto, costi variabili, tempi incasso e rischio sconto.",
  crm: "Ordina clienti/opportunita per impatto operativo; non esporre nomi interni di persona/tool.",
  hr: "Collega disponibilita persone, costo, competenze, sicurezza e sostenibilita economica.",
  compliance: "Evidenzia evidenza, requisito, rischio, proprietario e scadenza; non dire tutto ok senza prove.",
  filiera: "Distingui ordine, conferma fornitore, merce in arrivo, ricevuta e mancante; collega alla posa.",
  anomalie: "Distingui chi registra da chi causa; riporta causa, impatto euro, ricorrenza e controllo preventivo.",
  knowledge: "Usa come supporto, non sostituisce dati aziendali recenti; cita limiti e freschezza della fonte.",
};

/**
 * Token-opt: legenda UNICA dei contratti/rischi, da appendere UNA volta al
 * system prompt dei caller che usano `toolsToOpenAISpec`. Le description dei
 * tool portano solo un tag compatto `[contratto:<dominio>|rischio:<livello>]`
 * (~25 char) invece di ~200 char ripetuti su ~185 tool (≈ -9K token/richiesta).
 */
export const TOOL_CONTRACT_LEGEND = [
  "",
  "## LEGENDA TOOL (tag compatti nelle description)",
  "Ogni tool ha un tag `[contratto:<dominio>|rischio:<livello>]` (oppure `Contratto: ...` esplicito + `[rischio:...]`).",
  "Contratto per dominio = come interpretare l'output del tool:",
  ...Object.entries(DOMAIN_RESULT_CONTRACTS).map(([d, c]) => `- ${d}: ${c}`),
  "- default: sintetizza dati in decisione operativa con perimetro, limiti e prossima azione.",
  "Rischio:",
  "- safe: puo leggere/calcolare; se mancano dati, non inventare.",
  "- yellow: se non pre-approvata, prepara proposta/bozza e chiedi conferma.",
  "- red: non presentarla come eseguita; serve conferma/revisione umana.",
].join("\n");

function enrichToolSchemaForLLM(tool: SilvioTool) {
  const schema = tool.schema ?? {};
  const originalDescription = String(schema?.function?.description ?? schema?.description ?? "").trim();
  const risk = tool.riskLevel ?? "safe";
  // Dominio con contratto dedicato in legenda; altrimenti "default".
  const contractKey = tool.domain && DOMAIN_RESULT_CONTRACTS[tool.domain] ? tool.domain : "default";
  const compactContract = [
    originalDescription,
    // I resultContract custom sono unici per tool (info non deduplicabile):
    // restano inline. Per tutti gli altri solo il tag, spiegato in TOOL_CONTRACT_LEGEND.
    tool.resultContract
      ? `Contratto: ${tool.resultContract}\n[rischio:${risk}]`
      : `[contratto:${contractKey}|rischio:${risk}]`,
  ].filter(Boolean).join("\n");

  if (schema?.function) {
    return {
      ...schema,
      function: {
        ...schema.function,
        description: compactContract,
      },
    };
  }

  return {
    ...schema,
    description: compactContract,
  };
}

// Helper per chiamare RPC e ritornare data | error
async function callRpc(supabase: SupabaseClient, fn: string, args: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { error: error.message };
  return data;
}

// ─── TOOL DEFINITIONS ───────────────────────────────────────────────────────

export const SILVIO_TOOLS: Record<string, SilvioTool> = {
  get_company_kpi: {
    schema: {
      type: "function",
      function: {
        name: "get_company_kpi",
        description: "Ritorna i KPI sintetici aziendali: numero commesse attive/anno, fatturato YTD, preventivi aperti, rate scadute, saldo banche, team size. Usa questo tool quando l'utente chiede una visione d'insieme o KPI generali.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    executor: async (_args, ctx) => callRpc(ctx.supabase, "silvio_tool_company_kpi", {
      p_company_id: ctx.companyId,
    }),
    allowedRoles: ["super_admin", "company_admin"],
    allowedPersonas: ["silvio", "cfo", "controller", "amministrazione", "assistente_imprenditore", "*"],
    allowedChannels: ["internal_chat", "web_persona", "mobile", "whatsapp", "telegram", "voice"],
    riskLevel: "safe",
    domain: "kpi",
  },

  get_manutenzione_overview: {
    schema: {
      type: "function",
      function: {
        name: "get_manutenzione_overview",
        description: "Panoramica MANUTENZIONE / ASSISTENZA: ticket aperti (totali, in lavorazione, urgenti + lista con cliente e priorità), contratti di manutenzione in scadenza nei prossimi 90 giorni (con canone), garanzie impianti in scadenza. Usa per 'ticket aperti', 'assistenza', 'interventi da fare o da pianificare', 'contratti manutenzione in scadenza', 'garanzie impianti', 'come va l'assistenza/manutenzione'.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    executor: async (_args, ctx) => callRpc(ctx.supabase, "silvio_tool_manutenzione_overview", {
      p_company_id: ctx.companyId,
    }),
    allowedRoles: ["super_admin", "company_admin"],
    allowedPersonas: ["silvio", "pm_cantiere", "capocantiere", "assistente_imprenditore", "amministrazione", "tecnico", "*"],
    allowedChannels: ["internal_chat", "web_persona", "mobile", "whatsapp", "telegram", "voice"],
    riskLevel: "safe",
    domain: "cantiere",
  },

  get_fotovoltaico_overview: {
    schema: {
      type: "function",
      function: {
        name: "get_fotovoltaico_overview",
        description: "Panoramica FOTOVOLTAICO: totali progetti attivi (potenza kWp totale, valore €, margine medio, n. firmati), pipeline per stato (bozza/emesso/firmato…) con valore e potenza, e progetti recenti (numero, titolo/cliente, comune, kWp, prezzo, payback, stato). Usa per 'progetti fotovoltaico', 'pipeline FV', 'offerte fotovoltaiche', 'quanti kWp ho venduto/in pipeline', 'preventivi fotovoltaico'. NB: margine_pct è una frazione (0.37 = 37%).",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    executor: async (_args, ctx) => callRpc(ctx.supabase, "silvio_tool_fotovoltaico_overview", {
      p_company_id: ctx.companyId,
    }),
    allowedRoles: ["super_admin", "company_admin"],
    allowedPersonas: ["silvio", "sales", "assistente_imprenditore", "amministrazione", "tecnico", "*"],
    allowedChannels: ["internal_chat", "web_persona", "mobile", "whatsapp", "telegram", "voice"],
    riskLevel: "safe",
    domain: "preventivi",
  },

  get_marginalita_commesse: {
    schema: {
      type: "function",
      function: {
        name: "get_marginalita_commesse",
        description: "Marginalità per COMMESSA: preventivato vs consuntivo (costi reali) → margine e scostamento per commessa, con KPI aggregati (n. commesse, margine totale, n. in perdita). Usa per 'margine commesse', 'scostamento preventivo/consuntivo', 'quali commesse erodono margine', 'commesse in perdita', 'come va il margine'. Parametri opzionali: anno (default corrente), status (filtro stato commessa).",
        parameters: {
          type: "object",
          properties: {
            anno: { type: "integer", description: "Anno di riferimento (es. 2026). Default: anno corrente." },
            status: { type: "string", description: "Filtro stato commessa (opzionale)." },
          },
          required: [],
        },
      },
    },
    executor: async (args, ctx) => {
      const res = await callRpc(ctx.supabase, "cg_get_marginalita_commesse", {
        p_company_id: ctx.companyId,
        p_anno: Number(args?.anno) || new Date().getFullYear(),
        p_status_filter: args?.status ?? null,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = res as any;
      if (!r || r.error) return r;
      // Token-efficient: KPI aggregati + le 15 commesse a margine più basso (le azionabili).
      const righe: unknown[] = Array.isArray(r.righe) ? r.righe : [];
      const critiche = [...righe]
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .sort((a: any, b: any) => (Number(a?.margine) || 0) - (Number(b?.margine) || 0))
        .slice(0, 15);
      return { kpi: r.kpi, meta: r.meta, n_commesse: righe.length, commesse_a_margine_piu_basso: critiche };
    },
    allowedRoles: ["super_admin", "company_admin"],
    allowedPersonas: ["silvio", "cfo", "controller", "pm_cantiere", "assistente_imprenditore", "amministrazione", "*"],
    allowedChannels: ["internal_chat", "web_persona", "mobile", "whatsapp", "telegram", "voice"],
    riskLevel: "safe",
    domain: "kpi",
  },

  get_sdi_overview: {
    schema: {
      type: "function",
      function: {
        name: "get_sdi_overview",
        description: "Stato SDI fatturazione elettronica attiva: ripartizione per stato di trasmissione (scartata/consegnata/mancata consegna/trasmessa/non inviata) con totali €, elenco fatture e note di credito SCARTATE da correggere (con errori SDI), conteggio documenti da inviare, note di credito recenti. Usa per 'fatture scartate', 'stato SDI', 'cosa devo trasmettere allo SDI', 'note di credito', 'fatture consegnate/non inviate'.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    executor: async (_args, ctx) => callRpc(ctx.supabase, "silvio_tool_sdi_overview", {
      p_company_id: ctx.companyId,
    }),
    allowedRoles: ["super_admin", "company_admin"],
    allowedPersonas: ["silvio", "cfo", "controller", "amministrazione", "assistente_imprenditore", "*"],
    allowedChannels: ["internal_chat", "web_persona", "mobile", "whatsapp", "telegram", "voice"],
    riskLevel: "safe",
    domain: "fattura",
  },

  crea_bozza_campagna_ads: {
    schema: {
      type: "function",
      function: {
        name: "crea_bozza_campagna_ads",
        description: "Crea e SALVA una BOZZA di campagna pubblicitaria (Meta o Google) — NON la pubblica (la pubblicazione richiede di collegare gli account, arriverà dopo). Tu componi obiettivo, pubblico/targeting, budget giornaliero consigliato, 2-3 varianti di copy (titolo+testo+CTA) e il concept della creatività, basandoti sui dati reali dell'azienda (clienti, area, servizi, budget), poi salvi qui. Usa quando l'utente chiede 'preparami una campagna/sponsorizzata Facebook/Instagram/Google'. Ritorna l'id della bozza salvata.",
        parameters: {
          type: "object",
          properties: {
            platform: { type: "string", enum: ["meta", "google"], description: "Piattaforma. Default 'meta' (Facebook/Instagram)." },
            obiettivo: { type: "string", description: "Obiettivo: lead, vendite, traffico, notorieta, contatti." },
            budget_giornaliero_eur: { type: "number", description: "Budget giornaliero consigliato in €." },
            durata_giorni: { type: "integer", description: "Durata campagna in giorni." },
            area_geografica: { type: "string", description: "Area target (comune/provincia/raggio km)." },
            target: { type: "object", description: "Targeting: {eta, interessi, raggio_km, comuni, ...}." },
            copy_varianti: { type: "array", items: { type: "object" }, description: "2-3 varianti: [{titolo, testo, cta}]." },
            creativita_concept: { type: "string", description: "Concept visual / immagine suggerita." },
            note: { type: "string", description: "Note opzionali." },
          },
          required: ["platform", "obiettivo", "copy_varianti"],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_crea_bozza_campagna_ads", {
      p_company_id: ctx.companyId,
      p_platform: args?.platform ?? "meta",
      p_obiettivo: args?.obiettivo ?? null,
      p_budget_giornaliero: args?.budget_giornaliero_eur != null ? Number(args.budget_giornaliero_eur) : null,
      p_durata_giorni: args?.durata_giorni != null ? Number(args.durata_giorni) : null,
      p_area: args?.area_geografica ?? null,
      p_target: args?.target ?? {},
      p_copy: args?.copy_varianti ?? [],
      p_concept: args?.creativita_concept ?? null,
      p_note: args?.note ?? null,
    }),
    allowedRoles: ["super_admin", "company_admin"],
    allowedPersonas: ["silvio", "sales", "assistente_imprenditore", "*"],
    allowedChannels: ["internal_chat", "web_persona", "mobile", "whatsapp", "telegram", "voice"],
    riskLevel: "safe",
    domain: "generative",
  },

  lista_bozze_campagne_ads: {
    schema: {
      type: "function",
      function: {
        name: "lista_bozze_campagne_ads",
        description: "Elenca le bozze di campagne pubblicitarie salvate (Meta/Google): piattaforma, obiettivo, budget, durata, area, stato. Usa per 'mostrami le campagne preparate', 'bozze sponsorizzate', 'che campagne ho pronto'.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    executor: async (_args, ctx) => callRpc(ctx.supabase, "silvio_lista_bozze_campagne_ads", {
      p_company_id: ctx.companyId,
    }),
    allowedRoles: ["super_admin", "company_admin"],
    allowedPersonas: ["silvio", "sales", "assistente_imprenditore", "*"],
    allowedChannels: ["internal_chat", "web_persona", "mobile", "whatsapp", "telegram", "voice"],
    riskLevel: "safe",
    domain: "generative",
  },

  get_serie_grafico: {
    schema: {
      type: "function",
      function: {
        name: "get_serie_grafico",
        description: "Ritorna una SERIE di dati REALI dell'azienda già pronta per essere disegnata come grafico. Metriche: 'fatturato_mensile' (€/mese, SOLO fatture emesse in EiC), 'venduto_mensile' (€/mese di commesse firmate — usa questa per il VENDUTO), 'incassi_mensili' (€/mese MULTI-FONTE: incassi fatture + rate commesse pagate, con breakdown 'fonti'), 'cantieri_per_stato', 'documenti_per_tipo', 'preventivi_per_stato', 'lead_per_fonte', 'scadenze_incassi' (€ attesi: residuo fatture + rate commesse future). Ritorna {titolo, unita, x_label, data:[{label,value}], fonti?, nota?}. Leggi sempre 'fonti' e 'nota': spiegano da dove vengono i numeri. IMPORTANTE: dopo aver ricevuto i dati, DISEGNA il grafico emettendo un blocco ```chart``` usando esattamente i data ricevuti + titolo/unita.",
        parameters: {
          type: "object",
          properties: {
            metric: {
              type: "string",
              enum: ["fatturato_mensile", "venduto_mensile", "incassi_mensili", "cantieri_per_stato", "documenti_per_tipo", "preventivi_per_stato", "lead_per_fonte", "scadenze_incassi"],
              description: "Quale serie restituire.",
            },
            mesi: { type: "integer", minimum: 3, maximum: 36, default: 12, description: "Mesi indietro (solo per le serie mensili)." },
          },
          required: ["metric"],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_serie_grafico", {
      p_company_id: ctx.companyId,
      p_metric: args?.metric ?? "fatturato_mensile",
      p_mesi: args?.mesi ?? 12,
    }),
    allowedRoles: ["super_admin", "company_admin"],
    allowedPersonas: ["silvio", "cfo", "controller", "amministrazione", "assistente_imprenditore", "sales", "pm_cantiere", "*"],
    allowedChannels: ["internal_chat", "web_persona", "mobile", "whatsapp", "telegram", "voice"],
    riskLevel: "safe",
    domain: "kpi",
    resultContract: "Disegna SUBITO un grafico ```chart``` con i data ricevuti (bar per ripartizioni/confronti, line/area per andamenti), poi 1 frase d'insight.",
  },

  get_orders_summary: {
    schema: {
      type: "function",
      function: {
        name: "get_orders_summary",
        description: "Ritorna lista commesse con order_id, cliente risolto da customer_id/profilo, valori, stato pagamenti, date lavori/posa e % avanzamento. Usa per domande tipo 'quante commesse aperte', 'lista commesse attive', 'valore commesse'.",
        parameters: {
          type: "object",
          properties: {
            status: {
              type: "string",
              enum: ["active", "closed", "all"],
              description: "Filtro stato: active=non saldate, closed=saldate, all=tutte",
            },
            limit: { type: "integer", minimum: 1, maximum: 50, default: 20 },
          },
          required: [],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_orders_summary", {
      p_company_id: ctx.companyId,
      p_status: args?.status ?? "active",
      p_limit: args?.limit ?? 20,
    }),
      allowedRoles: ["super_admin", "company_admin", "company_staff", "salesperson"],
      allowedPersonas: ["silvio", "pm_cantiere", "capocantiere", "assistente_imprenditore", "sales", "*"],
    allowedChannels: ["internal_chat", "web_persona", "mobile", "whatsapp", "telegram", "voice"],
    riskLevel: "safe",
    domain: "cantiere",
  },

  lista_lavori_pose_periodo: {
    schema: {
      type: "function",
      function: {
        name: "lista_lavori_pose_periodo",
        description: "Lista reale di lavori, pose, appuntamenti e arrivi merce in un periodo. Usa per richieste tipo 'pose prossima settimana', 'lavori dei prossimi 7 giorni', 'cosa succede in cantiere la settimana prossima', 'merci in arrivo'. Ritorna clienti, order_id, codici ordine, operai, subappaltatori e dettagli materiali/ODA.",
        parameters: {
          type: "object",
          properties: {
            start_date: { type: "string", format: "date", description: "Data inizio periodo. Se omessa usa oggi." },
            days: { type: "integer", minimum: 1, maximum: 60, default: 7, description: "Numero giorni da leggere." },
            include_materials: { type: "boolean", default: true, description: "Includi arrivi merce/ODA." },
          },
          required: [],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_lavori_pose_periodo", {
      p_company_id: ctx.companyId,
      p_user_id: ctx.userId,
      p_start_date: args?.start_date ?? null,
      p_days: args?.days ?? 7,
      p_include_materials: args?.include_materials !== false,
    }),
    allowedRoles: ["super_admin", "company_admin", "company_staff", "employee"],
    allowedPersonas: ["silvio", "pm_cantiere", "capocantiere", "assistente_imprenditore", "tecnico", "acquisti", "*"],
    allowedChannels: ["internal_chat", "web_persona", "mobile", "telegram", "voice"],
    riskLevel: "safe",
    domain: "cantiere",
    resultContract: "Mostra calendario operativo per giorno: lavori/pose, merce in arrivo, sopralluoghi, blocchi e cosa preparare prima.",
  },

  get_revenue_forecast: {
    schema: {
      type: "function",
      function: {
        name: "get_revenue_forecast",
        description: "Ritorna gli incassi futuri previsti nei prossimi N giorni (acconti, saldi, finanziamenti attesi), escludendo rate già scadute. Output normalizzato: total_expected_eur, expected_count, overdue_excluded_eur, data_quality, incassi_futuri. Usa per domande 'quanto incasso prossimo mese', 'cassa attesa', 'soldi in arrivo'. Per 'quanto devo fatturare per coprire costi fissi' usa calculate_revenue_needed_next_month.",
        parameters: {
          type: "object",
          properties: {
            days_ahead: {
              type: "integer", minimum: 1, maximum: 365, default: 30,
              description: "Giorni futuri da considerare (es. 30 per prossimo mese, 90 per trimestre)",
            },
          },
          required: [],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_revenue_forecast", {
      p_company_id: ctx.companyId,
      p_days_ahead: args?.days_ahead ?? 30,
    }),
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
    allowedPersonas: ["silvio", "cfo", "controller", "amministrazione", "assistente_imprenditore"],
    allowedChannels: ["internal_chat", "web_persona", "mobile", "telegram"],
    riskLevel: "safe",
    domain: "kpi",
    resultContract: "Rispondi come incassi previsti, non fatturato. Separa incassi futuri, scaduto escluso e qualita dati.",
  },

  calculate_revenue_needed_next_month: {
    schema: {
      type: "function",
      function: {
        name: "calculate_revenue_needed_next_month",
        description: "Calcola il target operativo del prossimo mese distinguendo fatturato, incasso reale e cassa libera dopo costi variabili. Usa SEMPRE per domande tipo 'quanto dovrei fatturare il mese prossimo per pagare i costi fissi', 'quanto devo vendere per coprire stipendi e fornitori', 'punto di pareggio cassa prossimo mese'. La risposta NON deve essere un numero secco: spiega che fatturato non significa incasso, considera materiali/manodopera/subappaltatori/IVA delle nuove commesse e presenta scenari (recupero crediti, nuove commesse con acconto protetto, mix prudente). Se il risultato contiene data_quality.warnings, dichiara quali dati aziendali mancano e non trattare un gap a 0 come certezza.",
        parameters: {
          type: "object",
          properties: {
            target_month: {
              type: "string",
              format: "date",
              description: "Primo giorno del mese target. Se omesso usa il mese prossimo.",
            },
            margin_pct: {
              type: "number",
              minimum: 0.05,
              maximum: 0.95,
              default: 0.30,
              description: "Margine operativo stimato sul nuovo fatturato. Default 30%.",
            },
          },
          required: [],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_revenue_needed_next_month", {
      p_company_id: ctx.companyId,
      p_target_month: args?.target_month ?? null,
      p_margin_pct: args?.margin_pct ?? 0.30,
    }),
    allowedRoles: ["super_admin", "company_admin"],
    allowedPersonas: ["silvio", "cfo", "controller", "amministrazione", "assistente_imprenditore"],
    allowedChannels: ["internal_chat", "web_persona", "mobile", "telegram"],
    riskLevel: "safe",
    domain: "banking",
    resultContract: "Dai target minimo certificabile e scenari: recupero crediti, nuovo venduto con acconto protetto, mix prudente. Evidenzia costi variabili e cassa libera.",
  },

  get_overdue_payments: {
    schema: {
      type: "function",
      function: {
        name: "get_overdue_payments",
        description: "Ritorna le rate (acconto, acconto2, saldo, finanziamento) SCADUTE e non pagate. Output normalizzato: total_overdue_eur, count, data_quality e priorita_recupero con azione_suggerita. Usa per domande 'chi mi deve pagare', 'quali clienti devo sollecitare prima', 'rate in ritardo', 'crediti scaduti'.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    executor: async (_args, ctx) => callRpc(ctx.supabase, "silvio_tool_overdue_payments", {
      p_company_id: ctx.companyId,
    }),
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
    allowedPersonas: ["silvio", "cfo", "controller", "amministrazione", "*"],
    allowedChannels: ["internal_chat", "web_persona", "mobile", "whatsapp", "telegram", "voice"],
    riskLevel: "safe",
    domain: "fattura",
    resultContract: "Ordina per priorita recupero; mostra cliente, rata, importo, giorni ritardo e prima azione consigliata.",
  },

  get_cashflow_status: {
    schema: {
      type: "function",
      function: {
        name: "get_cashflow_status",
        description: "Ritorna saldo banche aziendali + entrate/uscite ultimi N giorni dai movimenti bancari. Usa per 'saldo banca', 'cashflow', 'movimenti banca'.",
        parameters: {
          type: "object",
          properties: {
            days_back: { type: "integer", minimum: 1, maximum: 365, default: 30 },
          },
          required: [],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_cashflow_status", {
      p_company_id: ctx.companyId,
      p_days_back: args?.days_back ?? 30,
    }),
    allowedRoles: ["super_admin", "company_admin"],
    allowedPersonas: ["silvio", "cfo", "controller", "amministrazione"],
    allowedChannels: ["internal_chat", "web_persona", "mobile", "telegram"],
    riskLevel: "safe",
    domain: "banking",
  },

  get_cashflow_forecast_90d: {
    schema: {
      type: "function",
      function: {
        name: "get_cashflow_forecast_90d",
        description: "Previsione cashflow predittiva settimanale per i prossimi 90 giorni (13 settimane). Combina saldo banche attuale + rate future attese (con ritardi pagamento storici per cliente) + stipendi settimanali + fatture fornitori (60gg). Ritorna per ogni settimana: incassi attesi, uscite, saldo cumulativo, status (ok/warning/critical), totali periodo, settimane critiche, settimana di saldo minimo. Usa per: 'come sarà la cassa nei prossimi 3 mesi', 'avrò problemi di liquidità', 'previsione cashflow', 'cassa futura', 'rischio cassa negativa'.",
        parameters: {
          type: "object",
          properties: {
            weeks: {
              type: "integer", minimum: 4, maximum: 26, default: 13,
              description: "Numero settimane da prevedere (default 13 = ~90 giorni)",
            },
            apply_delay: {
              type: "boolean", default: true,
              description: "Se true, applica ritardo storico medio pagamenti per cliente (più realistico)",
            },
          },
          required: [],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_cashflow_forecast_90d", {
      p_company_id: ctx.companyId,
      p_weeks: args?.weeks ?? 13,
      p_apply_delay: args?.apply_delay ?? true,
    }),
    allowedRoles: ["super_admin", "company_admin"],
    allowedPersonas: ["silvio", "cfo", "controller", "amministrazione"],
    allowedChannels: ["internal_chat", "web_persona", "mobile"],
    riskLevel: "safe",
    domain: "banking",
  },

  get_quotes_summary: {
    schema: {
      type: "function",
      function: {
        name: "get_quotes_summary",
        description: "Riepilogo SOLO PREVENTIVI (conteggi, valori, breakdown per status, recenti). Usa per 'preventivi aperti/vinti/persi'. ATTENZIONE: per la pipeline vendite COMPLETA usa get_pipeline_forecast, che include anche le opportunità CRM (molte aziende fanno preventivi cartacei fuori EiC).",
        parameters: {
          type: "object",
          properties: {
            status: {
              type: "string",
              enum: ["open", "won", "lost", "all"],
              description: "Filtro: open=in attesa, won=vinti, lost=persi, all=tutti",
            },
          },
          required: [],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_quotes_summary", {
      p_company_id: ctx.companyId,
      p_status: args?.status ?? "all",
    }),
      allowedRoles: ["super_admin", "company_admin", "company_staff", "salesperson"],
      allowedPersonas: ["silvio", "sales", "direttore_vendite", "assistente_imprenditore", "*"],
    allowedChannels: ["internal_chat", "web_persona", "mobile", "whatsapp", "telegram"],
    riskLevel: "safe",
    domain: "preventivi",
  },

  search_orders: {
    schema: {
      type: "function",
      function: {
        name: "search_orders",
        description: "Cerca commesse per nome cliente, codice, descrizione lavoro, indirizzo o profilo cliente collegato. Usa per 'commessa Rossi', 'cantiere via Roma', 'lavori per Marco'. Ritorna sempre order_id quando trova la commessa: usalo per azioni successive.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Termine di ricerca (min 2 caratteri)" },
          },
          required: ["query"],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_search_orders", {
      p_company_id: ctx.companyId,
      p_query: args?.query ?? "",
    }),
      allowedRoles: ["super_admin", "company_admin", "company_staff", "salesperson"],
      allowedPersonas: ["silvio", "pm_cantiere", "capocantiere", "assistente_imprenditore", "sales", "*"],
    allowedChannels: ["internal_chat", "web_persona", "mobile", "whatsapp", "telegram", "voice"],
    riskLevel: "safe",
    domain: "cantiere",
  },

  get_industry_benchmark: {
    schema: {
      type: "function",
      function: {
        name: "get_industry_benchmark",
        description: "Confronta una metrica della tua azienda (es. DSO, margine, costo orario) con il benchmark di settore aggregato e anonimo costruito dai dati di tutti i clienti EiC opt-in. Cluster automatico per sector + area + dimensione. Privacy: solo dati aggregati con k-anonymity >= 5. Usa per 'come va la mia X rispetto al settore', 'sono nella media di mercato'.",
        parameters: {
          type: "object",
          properties: {
            metric_key: {
              type: "string",
              description: "Chiave metrica (es. 'dso_medio_giorni'). V1 supporta: dso_medio_giorni. Roadmap V2: margine_commessa_pct, costo_orario_operaio_eur, ecc.",
            },
          },
          required: ["metric_key"],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "get_industry_benchmark", {
      p_metric_key: args?.metric_key ?? "",
      p_company_id: ctx.companyId,
    }),
    allowedRoles: ["super_admin", "company_admin"],
    allowedPersonas: ["silvio", "cfo", "assistente_imprenditore", "direttore_marketing"],
    allowedChannels: ["internal_chat", "web_persona"],
    riskLevel: "safe",
    domain: "kpi",
  },

  get_executive_snapshot: {
    schema: {
      type: "function",
      function: {
        name: "get_executive_snapshot",
        description: "Snapshot completo C-level del MESE CORRENTE + YTD: orders attivi, revenue YTD/mese corrente, cashflow forecast, team cost, alerts open, LTV totale, top cliente. Usa per 'come va l'azienda OGGI', 'situazione generale', 'briefing'. NON USARE per mesi specifici passati: per quello usa get_monthly_performance.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    executor: async (_args, ctx) => callRpc(ctx.supabase, "silvio_executive_report", {
      p_company_id: ctx.companyId,
    }),
    allowedRoles: ["super_admin", "company_admin"],
    allowedPersonas: ["silvio", "cfo", "assistente_imprenditore"],
    allowedChannels: ["internal_chat", "web_persona", "mobile", "telegram"],
    riskLevel: "safe",
    domain: "kpi",
  },

  get_monthly_performance: {
    schema: {
      type: "function",
      function: {
        name: "get_monthly_performance",
        description: "Performance aziendale di UN MESE SPECIFICO (year + month). Ritorna: fatturato emesso, incassi reali, spese, margine cash, ordini creati, top 5 clienti del mese, confronto vs mese precedente. USA SEMPRE per domande tipo 'com'è andato il mese scorso', 'fatturato di aprile', 'incassi di marzo', 'come è stato marzo vs aprile', 'andamento ultimo mese'. Per il mese CORRENTE usa get_executive_snapshot. Per YTD usa get_company_kpi.",
        parameters: {
          type: "object",
          properties: {
            year: {
              type: "integer",
              minimum: 2020,
              maximum: 2100,
              description: "Anno del mese richiesto (es. 2026)",
            },
            month: {
              type: "integer",
              minimum: 1,
              maximum: 12,
              description: "Numero del mese 1-12 (1=Gennaio, 12=Dicembre). Per 'mese scorso' calcola = mese corrente - 1 (gestendo il rollback a dicembre dell'anno precedente).",
            },
          },
          required: ["year", "month"],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_monthly_performance", {
      p_company_id: ctx.companyId,
      p_year: args?.year,
      p_month: args?.month,
    }),
    allowedRoles: ["super_admin", "company_admin"],
    allowedPersonas: ["silvio", "cfo", "controller", "amministrazione", "assistente_imprenditore", "*"],
    allowedChannels: ["internal_chat", "web_persona", "mobile", "whatsapp", "telegram", "voice"],
    riskLevel: "safe",
    domain: "kpi",
    resultContract: "Riporta il fatturato emesso, incassi, spese e margine cash del mese richiesto. Confronta col mese precedente (delta % se >0). Cita i top 3 clienti. Se data_quality.warnings non vuoto, dichiara esplicitamente i limiti del dato.",
  },

  detect_frodi_anomalie: {
    schema: {
      type: "function",
      function: {
        name: "detect_frodi_anomalie",
        description: "Rileva anomalie sospette: fatture duplicate, importi anomali, sconti eccessivi, pagamenti molto in ritardo. Usa per 'controlla anomalie', 'frodi', 'audit'.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    executor: async (_args, ctx) => callRpc(ctx.supabase, "silvio_detect_frodi_anomalie", {
      p_company_id: ctx.companyId,
    }),
    allowedRoles: ["super_admin", "company_admin"],
    allowedPersonas: ["silvio", "cfo", "controller", "compliance", "assistente_imprenditore"],
    allowedChannels: ["internal_chat", "web_persona", "mobile"],
    riskLevel: "safe",
    domain: "anomalie",
  },

  universal_search: {
    schema: {
      type: "function",
      function: {
        name: "universal_search",
        description: "Cerca in TUTTO il sistema (orders, contatti, fatture ricevute, contratti) con keyword. Ritorna risultati raggruppati per tipo. Usa per 'trova X', 'cerca cliente Y', 'dove ho parlato di Z'.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Termine ricerca (min 2 char)" },
            limit: { type: "integer", minimum: 1, maximum: 50, default: 20 },
          },
          required: ["query"],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_universal_search", {
      p_company_id: ctx.companyId,
      p_query: args?.query ?? "",
      p_limit: args?.limit ?? 20,
    }),
      allowedRoles: ["super_admin", "company_admin", "company_staff"],
      allowedPersonas: ["silvio", "assistente_imprenditore", "*"],
    allowedChannels: ["internal_chat", "web_persona", "mobile", "whatsapp", "telegram"],
    riskLevel: "safe",
    domain: "knowledge",
  },

  get_foto_cantiere_summary: {
    schema: {
      type: "function",
      function: {
        name: "get_foto_cantiere_summary",
        description: "Statistiche foto cantiere analizzate da AI: totali / da analizzare / qualita (eccellente/buona/sufficiente/problematica/grave) / con problemi / score medio. Usa per 'qualita lavori', 'foto cantiere', 'come va il cantiere X'.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    executor: async (_args, ctx) => callRpc(ctx.supabase, "silvio_foto_cantiere_summary", {
      p_company_id: ctx.companyId,
      p_order_id: null,
    }),
    allowedRoles: ["super_admin", "company_admin"],
    allowedPersonas: ["silvio", "pm_cantiere", "capocantiere", "tecnico"],
    allowedChannels: ["internal_chat", "web_persona", "mobile"],
    riskLevel: "safe",
    domain: "cantiere",
  },

  get_employees_workload: {
    schema: {
      type: "function",
      function: {
        name: "get_employees_workload",
        description: "Ritorna carico di lavoro per ogni operaio attivo: ore lavorate ultimi 30gg, ordini attivi, % utilizzo, stato (libero/leggero/medio/pieno/overload). Usa per 'chi è libero', 'carico operai', 'chi posso assegnare', 'team in overload'.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    executor: async (_args, ctx) => callRpc(ctx.supabase, "silvio_employees_workload", {
      p_company_id: ctx.companyId,
    }),
    allowedRoles: ["super_admin", "company_admin"],
    allowedPersonas: ["silvio", "pm_cantiere", "capocantiere", "hr", "assistente_imprenditore"],
    allowedChannels: ["internal_chat", "web_persona", "mobile"],
    riskLevel: "safe",
    domain: "hr",
  },

  get_pricing_history: {
    schema: {
      type: "function",
      function: {
        name: "get_pricing_history",
        description: "Storico vendite di una voce/articolo: numero volte venduta, prezzo medio/min/max, costo medio, margine, markup % medio. Usa per 'a quanto ho venduto X', 'prezzo storico Y', 'margine articolo Z'.",
        parameters: {
          type: "object",
          properties: {
            item_name: { type: "string", description: "Nome articolo (anche parziale, min 2 char)" },
          },
          required: ["item_name"],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_pricing_history", {
      p_company_id: ctx.companyId,
      p_item_name: args?.item_name ?? "",
    }),
    allowedRoles: ["super_admin", "company_admin", "salesperson"],
    allowedPersonas: ["silvio", "cfo", "controller", "sales", "direttore_vendite"],
    allowedChannels: ["internal_chat", "web_persona", "mobile"],
    riskLevel: "safe",
    domain: "preventivi",
  },

  get_customers_ltv_top: {
    schema: {
      type: "function",
      function: {
        name: "get_customers_ltv_top",
        description: "Ritorna i top clienti per LTV predetto 12 mesi (Lifetime Value). Include ticket medio, fatturato storico, frequenza ordini, churn risk, azione consigliata. Usa per 'clienti più preziosi', 'top LTV', 'chi vale di più nel CRM'.",
        parameters: {
          type: "object",
          properties: {
            limit: { type: "integer", minimum: 1, maximum: 20, default: 10 },
          },
          required: [],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_top_value_customers", {
      p_company_id: ctx.companyId,
      p_limit: args?.limit ?? 10,
    }),
    allowedRoles: ["super_admin", "company_admin", "salesperson"],
    allowedPersonas: ["silvio", "sales", "direttore_vendite", "direttore_marketing", "assistente_imprenditore"],
    allowedChannels: ["internal_chat", "web_persona", "mobile"],
    riskLevel: "safe",
    domain: "crm",
  },

  get_customers_at_risk: {
    schema: {
      type: "function",
      function: {
        name: "get_customers_at_risk",
        description: "Ritorna clienti a rischio churn (>180gg inattivi) con azione consigliata. Usa per 'clienti a rischio', 'chi sta perdendo', 'clienti dormienti', 'chi devo riattivare'.",
        parameters: {
          type: "object",
          properties: {
            limit: { type: "integer", minimum: 1, maximum: 20, default: 10 },
          },
          required: [],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_top_at_risk_customers", {
      p_company_id: ctx.companyId,
      p_limit: args?.limit ?? 10,
    }),
    allowedRoles: ["super_admin", "company_admin", "salesperson"],
    allowedPersonas: ["silvio", "sales", "direttore_vendite", "direttore_marketing", "cliente_tutor", "assistente_cliente"],
    allowedChannels: ["internal_chat", "web_persona", "mobile"],
    riskLevel: "safe",
    domain: "crm",
  },

  get_top_customers: {
    schema: {
      type: "function",
      function: {
        name: "get_top_customers",
        description: "Ritorna top N clienti per fatturato cumulato (somma valore commesse). Usa per 'clienti migliori', 'top clienti', 'chi compra di più'.",
        parameters: {
          type: "object",
          properties: {
            limit: { type: "integer", minimum: 1, maximum: 50, default: 10 },
          },
          required: [],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_top_customers", {
      p_company_id: ctx.companyId,
      p_limit: args?.limit ?? 10,
    }),
    allowedRoles: ["super_admin", "company_admin", "salesperson"],
    allowedPersonas: ["silvio", "sales", "direttore_vendite", "direttore_marketing"],
    allowedChannels: ["internal_chat", "web_persona", "mobile"],
    riskLevel: "safe",
    domain: "crm",
  },

  // ── EXTENDED TOOLS ─────────────────────────────────────────────────────

  get_team_summary: {
    schema: {
      type: "function",
      function: {
        name: "get_team_summary",
        description: "Ritorna composizione team (employees attivi, ruoli, costo lordo/netto mensile) + richieste HR pending (ferie/permessi/malattia da approvare). Usa per 'quanti operai ho', 'costo personale', 'ferie da approvare', 'team aziendale'.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    executor: async (_args, ctx) => callRpc(ctx.supabase, "silvio_tool_team_summary", {
      p_company_id: ctx.companyId,
    }),
    allowedRoles: ["super_admin", "company_admin"],
    allowedPersonas: ["silvio", "hr", "assistente_imprenditore"],
    allowedChannels: ["internal_chat", "web_persona", "mobile"],
    riskLevel: "safe",
    domain: "hr",
  },

  get_warehouse_status: {
    schema: {
      type: "function",
      function: {
        name: "get_warehouse_status",
        description: "Ritorna stato magazzino: numero articoli, valore totale, articoli sotto soglia minima (da riordinare), top articoli per valore. Usa per 'magazzino', 'cosa devo riordinare', 'stock bassi', 'valore magazzino'.",
        parameters: {
          type: "object",
          properties: {
            search: {
              type: "string",
              description: "Filtro opzionale per nome o codice articolo",
            },
          },
          required: [],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_warehouse_status", {
      p_company_id: ctx.companyId,
      p_search: args?.search ?? null,
    }),
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
    allowedPersonas: ["silvio", "pm_cantiere", "capocantiere", "acquisti", "tecnico"],
    allowedChannels: ["internal_chat", "web_persona", "mobile", "whatsapp", "telegram"],
    riskLevel: "safe",
    domain: "cantiere",
  },

  get_suppliers_summary: {
    schema: {
      type: "function",
      function: {
        name: "get_suppliers_summary",
        description: "Ritorna lista fornitori attivi con categoria prodotto, contatti, lead time, rating. Usa per 'fornitori', 'da chi compriamo', 'lista fornitori'.",
        parameters: {
          type: "object",
          properties: {
            search: {
              type: "string",
              description: "Filtro opzionale per nome o categoria prodotto",
            },
          },
          required: [],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_suppliers_summary", {
      p_company_id: ctx.companyId,
      p_search: args?.search ?? null,
    }),
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
    allowedPersonas: ["silvio", "acquisti", "cfo", "assistente_imprenditore"],
    allowedChannels: ["internal_chat", "web_persona", "mobile"],
    riskLevel: "safe",
    domain: "filiera",
  },

  get_subappaltatori_summary: {
    schema: {
      type: "function",
      function: {
        name: "get_subappaltatori_summary",
        description: "Ritorna lista subappaltatori con ragione sociale, responsabile, contatti, P.IVA. Usa per 'subappaltatori', 'imprese esterne', 'partner edili'.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    executor: async (_args, ctx) => callRpc(ctx.supabase, "silvio_tool_subappaltatori_summary", {
      p_company_id: ctx.companyId,
    }),
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
    allowedPersonas: ["silvio", "pm_cantiere", "compliance", "assistente_imprenditore"],
    allowedChannels: ["internal_chat", "web_persona", "mobile"],
    riskLevel: "safe",
    domain: "filiera",
  },

  get_received_invoices: {
    schema: {
      type: "function",
      function: {
        name: "get_received_invoices",
        description: "Ritorna fatture passive ricevute dai fornitori (da pagare/pagate). Usa per 'fatture da pagare', 'pagamenti fornitori', 'scadenze fornitori'.",
        parameters: {
          type: "object",
          properties: {
            status: {
              type: "string",
              enum: ["unpaid", "paid", "all"],
              description: "Filtro: unpaid=da pagare, paid=pagate, all=tutte",
            },
          },
          required: [],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_received_invoices", {
      p_company_id: ctx.companyId,
      p_status: args?.status ?? "unpaid",
    }),
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
    allowedPersonas: ["silvio", "cfo", "controller", "amministrazione", "acquisti"],
    allowedChannels: ["internal_chat", "web_persona", "mobile"],
    riskLevel: "safe",
    domain: "fattura",
  },

  search_brain: {
    schema: {
      type: "function",
      function: {
        name: "search_brain",
        description: "Ricerca semantica nei documenti aziendali indicizzati (commesse, preventivi, clienti, fornitori, subappaltatori) tramite embedding. Usa quando la domanda richiede SEMANTICA non strutturata: 'che lavori abbiamo fatto a Firenze', 'fornitori specializzati in serramenti', 'commesse simili a quella di via Roma', 'note cliente Bianchi'. NON usare per domande con dati strutturati che hanno tool dedicati (es. quante commesse → usa get_orders_summary).",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Query in linguaggio naturale" },
            source_types: {
              type: "array",
              items: { type: "string", enum: ["order", "quote", "customer", "supplier", "subappaltatore", "chat_summary", "note"] },
              description: "Filtra solo certi tipi di documenti. Default tutti.",
            },
            limit: { type: "integer", minimum: 1, maximum: 15, default: 6 },
          },
          required: ["query"],
        },
      },
    },
    executor: async (args, ctx) => {
      const queryText = String(args?.query ?? "").trim();
      if (queryText.length < 3) return { error: "query troppo corta" };

      const embedding = await tryGenerateEmbedding(queryText);
      if (!embedding) {
        return { error: "embedding non disponibile (OPENAI_API_KEY mancante o servizio down)" };
      }

      const embeddingUsage = estimateEmbeddingUsage(queryText);
      await chargeDirectAiCall({
        supabase: ctx.supabase,
        idempotencyKey: `search_brain_embedding_${ctx.companyId}_${ctx.userId}_${await shortHash(queryText)}_${crypto.randomUUID()}`,
        companyId: ctx.companyId,
        userId: ctx.userId,
        taskKey: "search_brain_embedding",
        tierKey: "t1_economic",
        modelUsed: "text-embedding-3-small",
        personaKey: ctx.primaryRole ?? null,
        tokensIn: embeddingUsage.tokens,
        tokensOut: 0,
        costRealUsd: embeddingUsage.costUsd,
        metadata: {
          source: "silvio_tool_search_brain",
          limit: Math.min(args?.limit ?? 6, 15),
          source_types: args?.source_types ?? null,
          kb_areas_filter: ctx.kbAreasFilter ?? null,
        },
      });

      // Track 1 Cervello Supremo: applica filtro KB areas universali della persona corrente.
      // Se kbAreasFilter è null → ricerca su TUTTE le aree universali (es. Silvio, Brain, Imprenditore).
      // Se kbAreasFilter è array → restringe RAG alle sole aree pertinenti per qualità migliore.
      const universalCategories = ctx.kbAreasFilter && ctx.kbAreasFilter.length > 0
        ? ctx.kbAreasFilter
        : null;

      const { data, error } = await ctx.supabase.rpc("match_brain", {
        p_company_id: ctx.companyId,
        p_query_embedding: `[${embedding.join(",")}]`,
        p_match_count: Math.min(args?.limit ?? 6, 15),
        p_min_similarity: 0.72,
        p_source_types: args?.source_types ?? null,
        p_include_universal: true,
        p_universal_categories: universalCategories,
      });

      if (error) return { error: error.message };
      return {
        query: queryText,
        risultati: data ?? [],
        kb_filter_applicato: universalCategories,
        nota: data && data.length === 0 ? "Nessun match — prova una query diversa o usa tool strutturati." : undefined,
      };
    },
    allowedRoles: ["super_admin", "company_admin", "company_staff", "salesperson", "call_center"],
    allowedPersonas: ["*"],
    allowedChannels: ["internal_chat", "web_persona", "mobile", "whatsapp", "telegram", "voice", "email"],
    riskLevel: "safe",
    domain: "knowledge",
    estimatedCostEur: 0.02,
  },

  create_quote_draft: {
    schema: {
      type: "function",
      function: {
        name: "create_quote_draft",
        description: "Crea una BOZZA di preventivo nel sistema con cliente, descrizione lavori e voci dettagliate. La bozza ha status='draft' e l'utente potrà rivederla, modificarla e inviarla al cliente. Usa quando l'utente chiede 'fai un preventivo per X', 'crea un preventivo', 'genera bozza preventivo'. Le voci devono includere: name, description, quantity, unit_of_measure, unit_price, vat_rate.",
        parameters: {
          type: "object",
          properties: {
            client_name: { type: "string", description: "Nome cliente (obbligatorio, min 2 char)" },
            client_email: { type: "string", description: "Email cliente (opzionale)" },
            client_phone: { type: "string", description: "Telefono cliente (opzionale)" },
            client_address: { type: "string", description: "Indirizzo cliente (opzionale)" },
            title: { type: "string", description: "Titolo preventivo (es. 'Ristrutturazione bagno via Roma')" },
            description: { type: "string", description: "Descrizione generale lavori" },
            tipo_lavoro: { type: "string", description: "Categoria lavoro: 'Serramenti', 'Ristrutturazione', 'Manutenzione', ecc." },
            indirizzo_lavori: { type: "string", description: "Indirizzo dove si svolgeranno i lavori" },
            items: {
              type: "array",
              description: "Voci del preventivo (manodopera, materiali, ecc.)",
              items: {
                type: "object",
                properties: {
                  item_type: { type: "string", enum: ["material", "labor", "subcontract", "service", "other"] },
                  name: { type: "string", description: "Nome breve voce" },
                  description: { type: "string", description: "Descrizione dettagliata" },
                  quantity: { type: "number", description: "Quantità" },
                  unit_of_measure: { type: "string", description: "U.M. (pz, mq, ml, h, ...)" },
                  unit_price: { type: "number", description: "Prezzo unitario EUR" },
                  vat_rate: { type: "number", description: "% IVA (10, 22, 4 a seconda lavoro)" },
                },
                required: ["name", "quantity", "unit_price"],
              },
            },
            validity_days: { type: "integer", default: 30 },
            default_vat_rate: { type: "number", default: 22, description: "IVA default per voci che non la specificano. Per ristrutturazione casa privati: 10%. Manutenzione: 10%. Altro: 22%." },
          },
          required: ["client_name", "items"],
        },
      },
    },
    executor: async (args, ctx) => {
      const { data, error } = await ctx.supabase.rpc("silvio_create_quote_draft", {
        p_company_id: ctx.companyId,
        p_user_id: ctx.userId,
        p_client_name: args.client_name,
        p_client_email: args.client_email ?? null,
        p_client_phone: args.client_phone ?? null,
        p_client_address: args.client_address ?? null,
        p_title: args.title ?? null,
        p_description: args.description ?? null,
        p_tipo_lavoro: args.tipo_lavoro ?? null,
        p_indirizzo_lavori: args.indirizzo_lavori ?? null,
        p_items: args.items ?? [],
        p_validity_days: args.validity_days ?? 30,
        p_default_vat_rate: args.default_vat_rate ?? 22,
        p_internal_notes: "Bozza generata da Silvio AI",
      });
      if (error) return { error: error.message };
      return data;
    },
    allowedRoles: ["super_admin", "company_admin", "company_staff", "salesperson"],
    allowedPersonas: ["silvio", "sales", "direttore_vendite"],
    allowedChannels: ["internal_chat", "web_persona", "mobile"],
    riskLevel: "yellow",
    domain: "preventivi",
  },

  lista_fatture_restanti: {
    schema: {
      type: "function",
      function: {
        name: "lista_fatture_restanti",
        description: "Lista rate/fatture restanti sulle commesse con cliente reale, order_id e importo. Usa PRIMA di creare fatture quando l'utente chiede 'fammi le fatture restanti', 'quali fatture mancano', 'saldi/acconti da fatturare'. I risultati indicano can_create_invoice_draft: chiama create_invoice_draft solo su quelle righe e dopo conferma utente.",
        parameters: {
          type: "object",
          properties: {
            only_unpaid: { type: "boolean", default: true },
            limit: { type: "integer", minimum: 1, maximum: 200, default: 50 },
          },
          required: [],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_fatture_restanti", {
      p_company_id: ctx.companyId,
      p_user_id: ctx.userId,
      p_only_unpaid: args?.only_unpaid !== false,
      p_limit: args?.limit ?? 50,
    }),
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
    allowedPersonas: ["silvio", "amministrazione", "cfo", "controller", "assistente_imprenditore", "*"],
    allowedChannels: ["internal_chat", "web_persona", "mobile", "telegram", "voice"],
    riskLevel: "safe",
    domain: "fattura",
  },

  create_invoice_draft: {
    schema: {
      type: "function",
      function: {
        name: "create_invoice_draft",
        description: "Crea una riga fattura/rata su un ordine esistente. Usa quando l'utente chiede 'fai una fattura per ordine X', 'fammi la fattura del saldo per Y'. Prima usa lista_fatture_restanti o search_orders per recuperare order_id e cliente. Non chiamarla in massa senza conferma: la RPC deduplica e non crea rate già pagate.",
        parameters: {
          type: "object",
          properties: {
            order_id: { type: "string", description: "UUID ordine (da search_orders)" },
            rata_type: {
              type: "string",
              enum: ["acconto", "acconto_2", "saldo", "finanziamento"],
              description: "Tipo rata da fatturare",
            },
            amount: {
              type: "number",
              description: "Importo override (se omesso, usa quello dalla commessa).",
            },
            notes: { type: "string", description: "Note opzionali" },
          },
          required: ["order_id", "rata_type"],
        },
      },
    },
    executor: async (args, ctx) => {
      const { data, error } = await ctx.supabase.rpc("silvio_create_invoice_draft", {
        p_company_id: ctx.companyId,
        p_user_id: ctx.userId,
        p_order_id: args.order_id,
        p_rata_type: args.rata_type,
        p_amount: args.amount ?? null,
        p_notes: args.notes ?? null,
      });
      if (error) return { error: error.message };
      return data;
    },
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
    allowedPersonas: ["silvio", "amministrazione", "cfo"],
    allowedChannels: ["internal_chat", "web_persona", "mobile"],
    riskLevel: "yellow",
    domain: "fattura",
  },

  analyze_image: {
    schema: {
      type: "function",
      function: {
        name: "analyze_image",
        description: "Analizza un'immagine (foto cantiere, fattura scansionata, schema tecnico, ecc.) usando vision AI. Identifica violazioni sicurezza, % avanzamento lavori, materiali, anomalie. Per fatture/documenti: estrai dati strutturati. L'utente DEVE aver già caricato l'immagine e fornito storage_path o URL pubblico.",
        parameters: {
          type: "object",
          properties: {
            image_url: { type: "string", description: "URL pubblico o storage_path dell'immagine" },
            question: {
              type: "string",
              description: "Cosa analizzare specificamente (es. 'verifica DPI degli operai', 'calcola % avanzamento', 'estrai dati fattura')",
            },
            context: {
              type: "string",
              enum: ["cantiere_safety", "cantiere_progress", "fattura", "documento_tecnico", "generic"],
              description: "Tipo contesto per ottimizzare il prompt",
            },
          },
          required: ["image_url", "question"],
        },
      },
    },
    executor: async (args, ctx) => {
      const url = String(args?.image_url ?? "").trim();
      if (!url) return { error: "image_url mancante" };
      const question = String(args?.question ?? "Analizza dettagliatamente l'immagine.");
      const context = String(args?.context ?? "generic");

      // Resolve storage path → signed URL
      let imageUrl = url;
      if (!url.startsWith("http")) {
        if (!isAllowedSilvioStoragePath(url, ctx)) {
          return { error: "storage_path immagine non autorizzato per questa azienda/utente" };
        }
        try {
          const { data, error } = await ctx.supabase.storage
            .from("silvio-uploads").createSignedUrl(url, 600);
          if (error || !data?.signedUrl) {
            return { error: `Storage signed URL fallita: ${error?.message ?? "no url"}` };
          }
          imageUrl = data.signedUrl;
        } catch (e) {
          return { error: e instanceof Error ? e.message : String(e) };
        }
      }

      const contextPrompt: Record<string, string> = {
        cantiere_safety: "Sei un esperto sicurezza cantieri D.Lgs 81/08. Identifica DPI mancanti, ponteggi non a norma, rischi caduta, ostacoli. Lista violazioni con riferimento normativo.",
        cantiere_progress: "Sei un PM cantiere. Stima % completamento, identifica fasi lavoro visibili, segnala anomalie qualità.",
        fattura: "Estrai in JSON: numero, data, fornitore (ragione sociale, P.IVA), importo netto, IVA, totale, data scadenza, voci principali.",
        documento_tecnico: "Analizza il documento tecnico/disegno: identifica elementi, quote, materiali, eventuali normative.",
        generic: "Analizza dettagliatamente l'immagine in italiano professionale.",
      };

      try {
        const { aiRouterComplete } = await import("./aiRouter.ts");
        const start = Date.now();
        const result = await aiRouterComplete({
          supabase: ctx.supabase,
          taskKey: "vision_analysis",
          messages: [
            { role: "system", content: contextPrompt[context] },
            {
              role: "user",
              content: [
                { type: "text", text: question },
                { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
              ],
            },
          ],
          params: { temperature: 0.2, max_tokens: 1500 },
          companyId: ctx.companyId,
          userId: ctx.userId,
          personaKey: "silvio",
        });
        const durationMs = Date.now() - start;

        return {
          ok: true,
          context,
          analysis: result.content,
          model_used: result.modelUsed,
          ledger_id: result.ledgerId,
          duration_ms: durationMs,
          tokens: { in: result.promptTokens, out: result.completionTokens },
        };
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    },
    allowedRoles: ["super_admin", "company_admin", "company_staff", "salesperson"],
    allowedPersonas: ["silvio", "tecnico", "pm_cantiere", "capocantiere", "sales", "*"],
    allowedChannels: ["internal_chat", "web_persona", "mobile", "whatsapp", "telegram"],
    riskLevel: "safe",
    domain: "generative",
    estimatedCostEur: 0.1,
  },

  analyze_quote: {
    schema: {
      type: "function",
      function: {
        name: "analyze_quote",
        description: "Analizza un preventivo specifico per win-probability, congruità prezzi, suggerimenti upsell. Usa quando l'utente chiede 'analizza preventivo PREV-XXX', 'questo preventivo è competitivo?', 'come migliorarlo'.",
        parameters: {
          type: "object",
          properties: {
            quote_number: { type: "string", description: "Numero preventivo (es. 'PREV-2026-0002')" },
            quote_id: { type: "string", description: "UUID alternativa a quote_number" },
          },
          required: [],
        },
      },
    },
    executor: async (args, ctx) => {
      let quoteId = args?.quote_id as string | undefined;
      if (!quoteId && args?.quote_number) {
        const { data } = await ctx.supabase.from("quotes")
          .select("id").eq("company_id", ctx.companyId).eq("quote_number", args.quote_number).maybeSingle();
        quoteId = data?.id;
      }
      if (!quoteId) return { error: "quote_id o quote_number mancante / non trovato" };

      const { data: quote } = await ctx.supabase.from("quotes")
        .select("quote_number, status, client_name, title, tipo_lavoro, subtotal, vat_amount, total, totale_costo_interno, totale_overhead, margine_totale_percentuale, created_at, expires_at, sent_at, signed_at, refused_at")
        .eq("id", quoteId).maybeSingle();
      if (!quote) return { error: "Preventivo non accessibile" };

      const { data: items } = await ctx.supabase.from("quote_items")
        .select("name, item_type, quantity, unit_of_measure, unit_price, vat_rate, line_total")
        .eq("quote_id", quoteId);

      // Stats su quote_items per win benchmark sui simili (stesso tipo_lavoro, ultimi 12 mesi)
      const { data: similar } = await ctx.supabase.from("quotes")
        .select("status, total")
        .eq("company_id", ctx.companyId)
        .eq("tipo_lavoro", quote.tipo_lavoro ?? "")
        .gte("created_at", new Date(Date.now() - 365 * 86400 * 1000).toISOString());

      const wonCount = (similar ?? []).filter((s: { status: string }) =>
        ["accepted", "won", "vinto", "approved"].includes(s.status)).length;
      const totalSimilar = (similar ?? []).length;
      const winRate = totalSimilar > 0 ? (wonCount / totalSimilar) * 100 : null;
      const avgWonValue = totalSimilar > 0 ? (similar ?? [])
        .filter((s: { status: string }) => ["accepted", "won", "vinto", "approved"].includes(s.status))
        .reduce((sum: number, s: { total: number }) => sum + Number(s.total), 0) / Math.max(wonCount, 1) : null;

      return {
        ok: true,
        quote: { ...quote, items },
        benchmark: {
          tipo_lavoro: quote.tipo_lavoro,
          preventivi_simili_ultimi_12m: totalSimilar,
          vinti: wonCount,
          win_rate_pct: winRate ? Math.round(winRate) : null,
          valore_medio_vinti_eur: avgWonValue ? Math.round(avgWonValue) : null,
        },
        nota: "Usa questi dati per: (1) congruenza prezzi voci vs medie aziendali, (2) win-rate benchmark, (3) suggerimenti pratici.",
      };
    },
    allowedRoles: ["super_admin", "company_admin", "salesperson"],
    allowedPersonas: ["silvio", "sales", "direttore_vendite", "tecnico"],
    allowedChannels: ["internal_chat", "web_persona", "mobile"],
    riskLevel: "safe",
    domain: "preventivi",
    estimatedCostEur: 0.05,
  },

  analyze_computo_metrico: {
    schema: {
      type: "function",
      function: {
        name: "analyze_computo_metrico",
        description: "Analizza un computo metrico estimativo (BoQ) fornito come testo: identifica voci, verifica congruenza prezzi vs media mercato, segnala anomalie, suggerisce migliorie. Per ora accetta SOLO testo (in futuro PDF). Lo Silvio passa il testo del computo nel parametro 'computo_text'.",
        parameters: {
          type: "object",
          properties: {
            computo_text: {
              type: "string",
              description: "Testo del computo (anche in formato grezzo). Min 50 char.",
            },
            focus: {
              type: "string",
              enum: ["prezzi", "completezza", "norme", "tutto"],
              default: "tutto",
              description: "Aspetto su cui concentrare l'analisi",
            },
          },
          required: ["computo_text"],
        },
      },
    },
    executor: async (args, _ctx) => {
      const text = String(args?.computo_text ?? "").trim();
      if (text.length < 50) return { error: "Testo computo troppo corto (min 50 char)" };

      // L'analisi è "soft": ritorniamo il testo strutturato che permette al LLM di ragionarci.
      // Più avanti possiamo aggiungere parsing strutturato.
      return {
        ok: true,
        computo_lunghezza: text.length,
        focus: args.focus ?? "tutto",
        nota: "L'analisi del computo deve essere svolta dal LLM stesso usando questo testo. Il LLM deve identificare voci, prezzi, U.M., e dare feedback ragionato confrontando con prezziari di mercato (DEI, regionali) note dal Knowledge Base universale.",
        testo_da_analizzare: text.slice(0, 8000),
      };
    },
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
    allowedPersonas: ["silvio", "tecnico", "sales", "pm_cantiere"],
    allowedChannels: ["internal_chat", "web_persona", "mobile"],
    riskLevel: "safe",
    domain: "preventivi",
    estimatedCostEur: 0.08,
  },

  propose_action: {
    schema: {
      type: "function",
      function: {
        name: "propose_action",
        description: "Crea una BOZZA di azione che richiede conferma esplicita dell'utente prima di essere applicata. Usa quando l'utente chiede di FARE qualcosa che ha effetti reali (es. 'manda email recupero crediti', 'genera preventivo per X', 'sollecita pagamento'). NON usare per query di sola lettura.",
        parameters: {
          type: "object",
          properties: {
            action_type: {
              type: "string",
              description: "Tipo azione: email_recupero_crediti, sollecito_pagamento, preventivo_bozza, riordino_materiale, ecc.",
            },
            summary: {
              type: "string",
              description: "Sintesi human-readable di cosa farà l'azione (max 150 char)",
            },
            payload: {
              type: "object",
              description: "Dati strutturati pronti per l'esecuzione (es. {to_email, subject, body} per email)",
            },
            risk_level: {
              type: "string",
              enum: ["yellow", "red"],
              description: "yellow=conferma standard, red=azione irreversibile (es. invio fattura, cancellazione)",
            },
          },
          required: ["action_type", "summary", "payload"],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_propose_action", {
      p_company_id: ctx.companyId,
      p_user_id: ctx.userId,
      p_action_type: args?.action_type,
      p_summary: args?.summary,
      p_payload: args?.payload ?? {},
      p_session_id: null,
      p_persona_key: "silvio",
      p_risk_level: args?.risk_level ?? "yellow",
    }),
    allowedRoles: ["super_admin", "company_admin", "company_staff", "salesperson"],
    allowedPersonas: ["silvio", "*"],
    allowedChannels: ["internal_chat", "web_persona", "mobile", "whatsapp", "telegram", "voice"],
    riskLevel: "safe",
    domain: "meta",
  },

  // ═════════════════════════════════════════════════════════════════════════
  // MP-AIE-01 v2 — Tool Phase 2: operations + fattura + banking + hr +
  // compliance + email + calendar (defensive: ritornano '_note' se schema
  // mancante anziché errore SQL).
  // ═════════════════════════════════════════════════════════════════════════

  lista_scadenze: {
    schema: {
      type: "function",
      function: {
        name: "lista_scadenze",
        description: "Scadenze di incasso nei prossimi N giorni (default 30) da TUTTE le fonti: fatture CRM, fatture fiscali EiC e rate delle commesse non pagate (campo 'fonte' su ogni riga + breakdown 'fonti'). Ritorna conteggio, totali, scadute (overdue) e dettaglio ordinato per data.",
        parameters: {
          type: "object",
          properties: {
            days_ahead: { type: "integer", minimum: 1, maximum: 365, default: 30 },
            only_unpaid: { type: "boolean", default: true },
          },
          required: [],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_lista_scadenze", {
      p_company_id: ctx.companyId,
      p_user_id: ctx.userId,
      p_days_ahead: args?.days_ahead ?? 30,
      p_only_unpaid: args?.only_unpaid !== false,
    }),
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
    allowedPersonas: ["silvio", "cfo", "controller", "amministrazione", "*"],
    allowedChannels: ["internal_chat", "web_persona", "mobile", "whatsapp", "telegram", "voice", "email"],
    riskLevel: "safe",
    domain: "fattura",
  },

  get_quadro_incassi: {
    schema: {
      type: "function",
      function: {
        name: "get_quadro_incassi",
        description: "RICONCILIAZIONE INCASSI MULTI-FONTE: la fotografia vera di venduto/incassato/da incassare con il breakdown per fonte (rate commesse, fatture EiC, prima nota manuale, banca se collegata) + 'avvisi' che spiegano le discrepanze. USA SEMPRE QUESTO TOOL per domande su situazione economico-finanziaria, incassato, liquidità, prospetti: molte aziende NON usano la fatturazione EiC e registrano gli incassi sulle rate delle commesse — guardare solo le fatture porta a dire il falso ('nessun incasso'). Riporta i numeri PER FONTE, cita gli 'avvisi' e proponi le verifiche suggerite (es. collegare il conto corrente).",
        parameters: {
          type: "object",
          properties: {
            mesi: { type: "integer", minimum: 1, maximum: 24, default: 3, description: "Mesi indietro del periodo analizzato." },
          },
          required: [],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_quadro_incassi", {
      p_company_id: ctx.companyId,
      p_mesi: args?.mesi ?? 3,
    }),
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
    allowedPersonas: ["silvio", "cfo", "controller", "amministrazione", "*"],
    allowedChannels: ["internal_chat", "web_persona", "mobile", "whatsapp", "telegram", "voice", "email"],
    riskLevel: "safe",
    domain: "fattura",
  },

  lista_transazioni: {
    schema: {
      type: "function",
      function: {
        name: "lista_transazioni",
        description: "Lista delle transazioni bancarie ricevute negli ultimi N giorni. Filtro opzionale per mostrare solo quelle non ancora matchate con fatture.",
        parameters: {
          type: "object",
          properties: {
            days_back: { type: "integer", minimum: 1, maximum: 365, default: 30 },
            only_unmatched: { type: "boolean", default: false },
            limit: { type: "integer", minimum: 1, maximum: 200, default: 50 },
          },
          required: [],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_lista_transazioni", {
      p_company_id: ctx.companyId,
      p_user_id: ctx.userId,
      p_days_back: args?.days_back ?? 30,
      p_only_unmatched: args?.only_unmatched === true,
      p_limit: args?.limit ?? 50,
    }),
    allowedRoles: ["super_admin", "company_admin"],
    allowedPersonas: ["silvio", "cfo", "controller", "amministrazione"],
    allowedChannels: ["internal_chat", "web_persona", "mobile", "telegram"],
    riskLevel: "safe",
    domain: "banking",
  },

  lista_dipendenti_oggi: {
    schema: {
      type: "function",
      function: {
        name: "lista_dipendenti_oggi",
        description: "Lista dei dipendenti attivi oggi per la company. Include qualifica e ruolo. Read-only.",
        parameters: {
          type: "object",
          properties: {
            only_active: { type: "boolean", default: true },
          },
          required: [],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_lista_dipendenti_oggi", {
      p_company_id: ctx.companyId,
      p_user_id: ctx.userId,
      p_only_active: args?.only_active !== false,
    }),
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
    allowedPersonas: ["silvio", "pm_cantiere", "capocantiere", "hr", "assistente_imprenditore"],
    allowedChannels: ["internal_chat", "web_persona", "mobile", "whatsapp", "telegram"],
    riskLevel: "safe",
    domain: "hr",
  },

  verifica_durc: {
    schema: {
      type: "function",
      function: {
        name: "verifica_durc",
        description: "Verifica lo stato del DURC (Documento Unico Regolarità Contributiva) della tua azienda o di un subappaltatore specifico. Ritorna esito + data scadenza + giorni residui.",
        parameters: {
          type: "object",
          properties: {
            target_type: {
              type: "string",
              enum: ["self", "subcontractor"],
              description: "self = la tua azienda, subcontractor = un subappaltatore",
              default: "self",
            },
            target_id: {
              type: "string",
              description: "UUID del subappaltatore (richiesto se target_type=subcontractor)",
            },
          },
          required: [],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_verifica_durc", {
      p_company_id: ctx.companyId,
      p_user_id: ctx.userId,
      p_target_type: args?.target_type ?? "self",
      p_target_id: args?.target_id ?? null,
    }),
    allowedRoles: ["super_admin", "company_admin"],
    allowedPersonas: ["silvio", "compliance", "amministrazione", "assistente_imprenditore", "pm_cantiere"],
    allowedChannels: ["internal_chat", "web_persona", "mobile"],
    riskLevel: "safe",
    domain: "compliance",
  },

  lista_email_thread: {
    schema: {
      type: "function",
      function: {
        name: "lista_email_thread",
        description: "Lista delle ultime email ricevute dall'azienda (più recenti, escluse archiviate/cestino). Read-only. Usa per 'quante email ho ricevuto', 'ultime email arrivate'.",
        parameters: {
          type: "object",
          properties: {
            days_back: { type: "integer", minimum: 1, maximum: 90, default: 7 },
            limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
          },
          required: [],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_lista_email_thread", {
      p_company_id: ctx.companyId,
      p_user_id: ctx.userId,
      p_days_back: args?.days_back ?? 7,
      p_limit: args?.limit ?? 20,
    }),
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
    allowedPersonas: ["silvio", "amministrazione", "sales", "cliente_tutor", "assistente_cliente"],
    allowedChannels: ["internal_chat", "web_persona", "mobile"],
    riskLevel: "safe",
    domain: "email",
  },

  cerca_email: {
    schema: {
      type: "function",
      function: {
        name: "cerca_email",
        description: "Cerca nella posta in arrivo dell'azienda per mittente/fornitore e/o parole chiave (oggetto, testo, sintesi) in un periodo. Usa per 'trovami tutte le email del fornitore X', 'email su [argomento]', 'quante email da [cliente]'. Read-only.",
        parameters: {
          type: "object",
          properties: {
            mittente: { type: "string", description: "Mittente da cercare: email o nome, anche parziale (es. 'rossi', 'fornitore.it')." },
            query: { type: "string", description: "Parole chiave in oggetto/testo/sintesi (es. 'DDT', 'preventivo bagno', 'fattura')." },
            giorni_indietro: { type: "integer", minimum: 1, maximum: 365, default: 30 },
            limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
          },
          required: [],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_cerca_email", {
      p_company_id: ctx.companyId,
      p_user_id: ctx.userId,
      p_mittente: args?.mittente ?? null,
      p_query: args?.query ?? null,
      p_days_back: args?.giorni_indietro ?? 30,
      p_limit: args?.limit ?? 20,
    }),
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
    allowedPersonas: ["silvio", "amministrazione", "sales", "cliente_tutor", "assistente_cliente"],
    allowedChannels: ["internal_chat", "web_persona", "mobile"],
    riskLevel: "safe",
    domain: "email",
  },

  posta_da_lavorare: {
    schema: {
      type: "function",
      function: {
        name: "posta_da_lavorare",
        description: "Recupera le email recenti per fare il TRIAGE di cosa conta. Usa quando l'utente chiede 'cosa conta oggi nella posta', 'cosa devo fare', 'riepilogo email', 'a chi devo rispondere'. Dopo aver ricevuto i dati CLASSIFICA ogni email in: fattura/DDT fornitore · richiesta preventivo · risposta cliente · sollecito/pagamento · scadenza/burocrazia · altro-rumore; evidenzia importi e scadenze; presenta in ordine di PRIORITÀ cosa conta e cosa fare (rispondere, registrare, sollecitare). Read-only.",
        parameters: {
          type: "object",
          properties: {
            giorni_indietro: { type: "integer", minimum: 1, maximum: 30, default: 3 },
            limit: { type: "integer", minimum: 1, maximum: 50, default: 30 },
          },
          required: [],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_posta_da_lavorare", {
      p_company_id: ctx.companyId,
      p_user_id: ctx.userId,
      p_days_back: args?.giorni_indietro ?? 3,
      p_limit: args?.limit ?? 30,
    }),
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
    allowedPersonas: ["silvio", "amministrazione", "sales", "cliente_tutor", "assistente_cliente"],
    allowedChannels: ["internal_chat", "web_persona", "mobile"],
    riskLevel: "safe",
    domain: "email",
  },

  cerca_email_intelligente: {
    schema: {
      type: "function",
      function: {
        name: "cerca_email_intelligente",
        description: "Ricerca/sintesi INTELLIGENTE della posta in linguaggio naturale: per SIGNIFICATO (lamentele, argomenti, sentiment — ricerca semantica) o per filtri (mittente, categoria, periodo). Usa per 'trova le mail dove un cliente si lamenta', 'riassumi le email del fornitore X di questo mese', 'email che parlano di [tema]'. Read-only. (Differenza da cerca_email: questo capisce il SIGNIFICATO, non solo le parole esatte.)",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "La domanda/ricerca in linguaggio naturale" },
            azione: { type: "string", enum: ["lista", "conteggio", "sintesi"], default: "lista" },
          },
          required: ["query"],
        },
      },
    },
    executor: async (args, ctx) => {
      const baseUrl = Deno.env.get("SUPABASE_URL") ?? "";
      const q = String(args?.query ?? "").trim();
      if (!q) return { ok: false, error: "query_mancante" };
      // RLS-safe: usa il Bearer dell'utente. Se assente (contesto non-chat),
      // degrada con nota invece di tentare service-role cross-tenant.
      if (!ctx.authToken) {
        return { ok: false, azione: "non_disponibile", note: "La ricerca semantica email è disponibile solo nella chat utente." };
      }
      try {
        const res = await fetch(`${baseUrl}/functions/v1/email-silvio-query`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: ctx.authToken },
          body: JSON.stringify({ query: q.slice(0, 500), azione: args?.azione ?? "lista" }),
        });
        if (!res.ok) return { ok: false, error: `email_query_${res.status}` };
        return await res.json();
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "errore" };
      }
    },
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
    allowedPersonas: ["silvio", "amministrazione", "sales", "cliente_tutor", "assistente_cliente"],
    allowedChannels: ["internal_chat", "web_persona", "mobile"],
    riskLevel: "safe",
    domain: "email",
  },

  richieste_preventivo: {
    schema: {
      type: "function",
      function: {
        name: "richieste_preventivo",
        description: "Elenca le richieste di preventivo/opportunità rilevate automaticamente dalle email in arrivo (bozze da confermare in app). Usa per 'che richieste di preventivo sono arrivate', 'nuove opportunità dalle email', 'chi ha chiesto un preventivo questa settimana'. Read-only.",
        parameters: {
          type: "object",
          properties: { limit: { type: "integer", minimum: 1, maximum: 50, default: 20 } },
          required: [],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_richieste_preventivo", {
      p_company_id: ctx.companyId,
      p_user_id: ctx.userId,
      p_limit: args?.limit ?? 20,
    }),
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
    allowedPersonas: ["silvio", "amministrazione", "sales", "cliente_tutor", "assistente_cliente"],
    allowedChannels: ["internal_chat", "web_persona", "mobile"],
    riskLevel: "safe",
    domain: "email",
  },

  // ── F4 — Proattività: "cosa conta ORA" (briefing aggregato) ─────────────
  cosa_conta_ora: {
    schema: {
      type: "function",
      function: {
        name: "cosa_conta_ora",
        description: "Riepilogo PROATTIVO di cosa conta adesso per l'impresa, aggregando più fonti: scadenze imminenti, pagamenti/fatture scaduti, cantieri a rischio, preventivi da ricontattare, posta da lavorare e richieste di preventivo dalle email. Usa quando l'utente apre la chat o chiede 'novità?', 'cosa devo fare oggi?', 'cosa conta?', 'briefing', 'a che punto siamo'. Dopo i dati, presenta in ordine di PRIORITÀ (soldi e scadenze prima) cosa conta e l'azione consigliata, in modo sintetico. Read-only.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    executor: async (_args, ctx) => {
      const c = ctx.companyId, u = ctx.userId;
      // Ogni fonte è isolata: un errore non deve far fallire l'intero briefing.
      const safe = async (p: Promise<unknown>) => {
        try { return await p; } catch (e) { return { error: e instanceof Error ? e.message : "errore" }; }
      };
      const [scadenze, pagamenti, cantieri, preventivi, posta, richieste] = await Promise.all([
        safe(callRpc(ctx.supabase, "silvio_tool_lista_scadenze", { p_company_id: c, p_user_id: u, p_days_ahead: 14 })),
        safe(callRpc(ctx.supabase, "silvio_tool_overdue_payments", { p_company_id: c })),
        safe(callRpc(ctx.supabase, "silvio_tool_lista_cantieri_a_rischio", { p_company_id: c, p_risk_level_min: "high" })),
        safe(callRpc(ctx.supabase, "silvio_tool_identifica_quotes_da_followup", { p_company_id: c, p_priority_threshold: 60 })),
        safe(callRpc(ctx.supabase, "silvio_tool_posta_da_lavorare", { p_company_id: c, p_user_id: u, p_days_back: 3, p_limit: 20 })),
        safe(callRpc(ctx.supabase, "silvio_tool_richieste_preventivo", { p_company_id: c, p_user_id: u, p_limit: 10 })),
      ]);
      return {
        scadenze_imminenti: scadenze,
        pagamenti_scaduti: pagamenti,
        cantieri_a_rischio: cantieri,
        preventivi_da_ricontattare: preventivi,
        posta_da_lavorare: posta,
        richieste_preventivo_email: richieste,
      };
    },
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
    allowedPersonas: ["silvio", "amministrazione", "assistente_imprenditore"],
    allowedChannels: ["internal_chat", "web_persona", "mobile"],
    riskLevel: "safe",
    domain: "kpi",
  },

  richieste_fatture_da_registrare: {
    schema: {
      type: "function",
      function: {
        name: "fatture_da_registrare",
        description: "Elenca le fatture/DDT fornitore estratti automaticamente dai PDF allegati alle email, in attesa di registrazione (bozze da confermare in app). Usa per 'che fatture sono arrivate?', 'fatture da registrare', 'documenti fornitori dalle email'. Evidenzia eventuale ALERT IBAN (IBAN diverso da quello noto → possibile frode, verificare prima di pagare). Read-only.",
        parameters: {
          type: "object",
          properties: { limit: { type: "integer", minimum: 1, maximum: 50, default: 20 } },
          required: [],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_fatture_da_registrare", {
      p_company_id: ctx.companyId,
      p_user_id: ctx.userId,
      p_limit: args?.limit ?? 20,
    }),
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
    allowedPersonas: ["silvio", "amministrazione", "assistente_imprenditore"],
    allowedChannels: ["internal_chat", "web_persona", "mobile"],
    riskLevel: "safe",
    domain: "fattura",
  },

  // ── #1 Osservabilità — stato tecnico piattaforma (solo super admin) ─────
  stato_sistema: {
    schema: {
      type: "function",
      function: {
        name: "stato_sistema",
        description: "Stato tecnico della piattaforma: cron/automazioni che stanno FALLENDO nelle ultime 2 ore (con l'errore) + numero di automazioni attive. Usa quando un super admin chiede 'ci sono problemi tecnici?', 'stato del sistema', 'le automazioni girano?', 'qualcosa è rotto?'. Read-only. Solo super admin.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    executor: async (_args, ctx) => callRpc(ctx.supabase, "silvio_ops_health", {
      p_company_id: ctx.companyId,
      p_user_id: ctx.userId,
    }),
    allowedRoles: ["super_admin"],
    allowedPersonas: ["silvio", "assistente_imprenditore"],
    allowedChannels: ["internal_chat", "web_persona"],
    riskLevel: "safe",
    domain: "anomalie",
  },

  // ── MP-OPS-01 v2 — Reportino settimanale committente ────────────────────
  genera_reportino_settimanale_committente: {
    schema: {
      type: "function",
      function: {
        name: "genera_reportino_settimanale_committente",
        description: "Genera e invia al committente del cantiere un PDF settimanale con narrative AI, foto, KPI cantiere, prossimi step. Idempotente per (cantiere, settimana). Usa quando l'utente dice 'manda reportino al cliente di [cantiere]', 'reportino settimanale', 'aggiornamento committente'.",
        parameters: {
          type: "object",
          properties: {
            cantiere_id: { type: "string", description: "UUID del cantiere/ordine" },
            week_start: {
              type: "string",
              description: "Data inizio settimana YYYY-MM-DD (lunedì). Se omesso = settimana corrente.",
            },
            force_regenerate: {
              type: "boolean",
              description: "Se true, rigenera anche se già presente",
              default: false,
            },
            send_email: { type: "boolean", default: true },
            send_whatsapp: {
              type: "boolean",
              default: false,
              description: "Invio WhatsApp solo se richiesto esplicitamente dall'utente.",
            },
          },
          required: ["cantiere_id"],
        },
      },
    },
    executor: async (args, ctx) => {
      // 1. RPC pre-check + creazione record placeholder (idempotente)
      const result = await callRpc(ctx.supabase, "silvio_tool_genera_reportino_committente", {
        p_company_id: ctx.companyId,
        p_user_id: ctx.userId,
        p_cantiere_id: args?.cantiere_id,
        p_week_start: args?.week_start ?? null,
        p_force_regenerate: args?.force_regenerate === true,
        p_trigger_source: ctx.channel === "cron" ? "cron" : "conversation",
        p_triggered_by_persona: ctx.personaKey ?? "silvio",
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = result as any;
      if (r?.error) return r;
      if (r?.already_exists) {
        return {
          success: true,
          report_id: r.report_id,
          already_exists: true,
          message: r.message,
          cantiere_code: r.cantiere_code,
          week_start: r.week_start,
          week_end: r.week_end,
        };
      }

      // 2. Trigger async PDF generation + delivery (fire-and-forget)
      try {
        const { data: invokeRes, error: invokeErr } = await ctx.supabase.functions.invoke(
          "generate-customer-report-async",
          {
            body: {
              cantiere_id: args?.cantiere_id,
              week_start: r?.week_start,
              company_id: ctx.companyId,
              report_id: r?.report_id,
              send_email: args?.send_email !== false,
              send_whatsapp: args?.send_whatsapp === true,
              triggered_by_user_id: ctx.userId,
              triggered_by_persona: ctx.personaKey ?? "silvio",
            },
          },
        );
        if (invokeErr) {
          return {
            success: false,
            error: `Generazione PDF fallita: ${invokeErr.message}`,
            report_id: r?.report_id,
            cantiere_code: r?.cantiere_code,
          };
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const invokeData = invokeRes as any;
        return {
          success: true,
          report_id: r?.report_id,
          cantiere_code: r?.cantiere_code,
          week_start: r?.week_start,
          week_end: r?.week_end,
          pdf_url: invokeData?.pdf_signed_url,
          delivery: invokeData?.delivery,
          message: `Reportino per cantiere ${r?.cantiere_code} generato e inviato al committente`,
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          success: false,
          error: `Errore async PDF: ${msg.slice(0, 200)}`,
          report_id: r?.report_id,
        };
      }
    },
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
    allowedPersonas: ["silvio", "pm_cantiere", "capocantiere", "assistente_imprenditore", "*"],
    allowedChannels: ["internal_chat", "web_persona", "mobile", "whatsapp", "telegram", "voice", "cron"],
    riskLevel: "yellow",
    domain: "cantiere",
    estimatedCostEur: 0.08,
  },

  trova_slot_liberi: {
    schema: {
      type: "function",
      function: {
        name: "trova_slot_liberi",
        description: "Trova slot liberi nel calendario per programmare riunioni o appuntamenti. Default: 7 giorni avanti, durata 60min, 09:00-18:00.",
        parameters: {
          type: "object",
          properties: {
            durata_minuti: { type: "integer", minimum: 15, maximum: 480, default: 60 },
            giorni_avanti: { type: "integer", minimum: 1, maximum: 30, default: 7 },
            orario_inizio: { type: "string", description: "HH:MM (es. 09:00)", default: "09:00" },
            orario_fine: { type: "string", description: "HH:MM (es. 18:00)", default: "18:00" },
          },
          required: [],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_trova_slot_liberi", {
      p_company_id: ctx.companyId,
      p_user_id: ctx.userId,
      p_durata_minuti: args?.durata_minuti ?? 60,
      p_giorni_avanti: args?.giorni_avanti ?? 7,
      p_orario_inizio: args?.orario_inizio ?? "09:00",
      p_orario_fine: args?.orario_fine ?? "18:00",
    }),
    allowedRoles: ["super_admin", "company_admin", "company_staff", "salesperson"],
    allowedPersonas: ["silvio", "sales", "direttore_vendite", "assistente_imprenditore", "*"],
    allowedChannels: ["internal_chat", "web_persona", "mobile", "whatsapp", "telegram"],
    riskLevel: "safe",
    domain: "calendar",
  },

  // ═════════════════════════════════════════════════════════════════════════
  // MP-FAT-02 — Fatturazione Zero-Touch SAL→SDI→Reminder
  // ═════════════════════════════════════════════════════════════════════════

  verifica_anagrafica_fattura: {
    schema: {
      type: "function",
      function: {
        name: "verifica_anagrafica_fattura",
        description: "Verifica completezza anagrafica cliente per emissione fattura elettronica (PIVA/CF, indirizzo, SDI/PEC). Ritorna missing_fields se mancanti dati obbligatori.",
        parameters: {
          type: "object",
          properties: {
            customer_id: { type: "string", description: "UUID profile del cliente" },
          },
          required: ["customer_id"],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_verifica_anagrafica_fattura", {
      p_company_id: ctx.companyId,
      p_user_id: ctx.userId,
      p_customer_id: args?.customer_id,
    }),
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
    allowedPersonas: ["silvio", "amministrazione", "cfo", "controller", "sales"],
    allowedChannels: ["internal_chat", "web_persona", "mobile"],
    riskLevel: "safe",
    domain: "fattura",
  },

  avanza_fatt_zero_touch: {
    schema: {
      type: "function",
      function: {
        name: "avanza_fatt_zero_touch",
        description: "Avanza state machine fatturazione zero-touch a un nuovo stato. Usato dall'orchestratore edge per registrare gli step della pipeline SAL→SDI→reminder.",
        parameters: {
          type: "object",
          properties: {
            run_id: { type: "string", description: "UUID del run" },
            new_status: { type: "string", description: "Nuovo stato (es. 'composing_xml', 'sending_sdi', 'completed')" },
            metadata: { type: "object", description: "Metadati step (opzionali)" },
          },
          required: ["run_id", "new_status"],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_avanza_fatt_zero_touch", {
      p_company_id: ctx.companyId,
      p_user_id: ctx.userId,
      p_run_id: args?.run_id,
      p_new_status: args?.new_status,
      p_metadata: args?.metadata ?? {},
    }),
    allowedRoles: ["super_admin"],
    allowedPersonas: ["silvio", "amministrazione"],
    allowedChannels: ["internal_chat", "web_persona", "cron"],
    riskLevel: "safe",
    domain: "fattura",
  },

  lista_fatt_zero_touch_runs: {
    schema: {
      type: "function",
      function: {
        name: "lista_fatt_zero_touch_runs",
        description: "Lista degli ultimi N run di fatturazione zero-touch della company. Filtro opzionale per stato (pending/awaiting_hitl_approval/completed/failed).",
        parameters: {
          type: "object",
          properties: {
            status_filter: { type: "string", description: "Filtro stato (opzionale)" },
            limit: { type: "integer", minimum: 1, maximum: 200, default: 50 },
          },
          required: [],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_lista_fatt_zero_touch_runs", {
      p_company_id: ctx.companyId,
      p_user_id: ctx.userId,
      p_status_filter: args?.status_filter ?? null,
      p_limit: args?.limit ?? 50,
    }),
    allowedRoles: ["super_admin", "company_admin"],
    allowedPersonas: ["silvio", "amministrazione", "cfo", "controller", "assistente_imprenditore"],
    allowedChannels: ["internal_chat", "web_persona", "mobile"],
    riskLevel: "safe",
    domain: "fattura",
  },

  // ═════════════════════════════════════════════════════════════════════════
  // MP-FAT-03 — Prima Nota Auto + Anomaly Detection
  // ═════════════════════════════════════════════════════════════════════════

  flag_anomalia_finanziaria: {
    schema: {
      type: "function",
      function: {
        name: "flag_anomalia_finanziaria",
        description: "Registra un'anomalia finanziaria (duplicate payment, importo sospetto, controparte nuova alto valore, pattern split anti-antiriciclaggio). Crea record + alert per persona compliance/cfo.",
        parameters: {
          type: "object",
          properties: {
            anomaly_type: {
              type: "string",
              enum: ["duplicate_payment","unusual_high_amount","new_counterparty_high_value","split_pattern_suspicion","round_amount_pattern","off_hours_transaction","failed_chargeback","unauthorized_recurring"],
            },
            severity: { type: "string", enum: ["low","medium","high","critical"] },
            ai_description: { type: "string", description: "Descrizione AI (cosa, quando, dove)" },
            transaction_id: { type: "string", description: "UUID transazione (opzionale)" },
            amount: { type: "number", description: "Importo EUR" },
            counterparty_name: { type: "string" },
            ai_recommendation: { type: "string", description: "Cosa suggerisce di fare" },
            ai_confidence: { type: "number", minimum: 0, maximum: 1 },
          },
          required: ["anomaly_type", "severity", "ai_description"],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_flag_anomalia", {
      p_company_id: ctx.companyId,
      p_user_id: ctx.userId,
      p_anomaly_type: args?.anomaly_type,
      p_severity: args?.severity,
      p_ai_description: args?.ai_description,
      p_transaction_id: args?.transaction_id ?? null,
      p_amount: args?.amount ?? null,
      p_counterparty_name: args?.counterparty_name ?? null,
      p_ai_recommendation: args?.ai_recommendation ?? null,
      p_ai_confidence: args?.ai_confidence ?? null,
    }),
    allowedRoles: ["super_admin", "company_admin"],
    allowedPersonas: ["silvio", "controller", "cfo", "amministrazione", "compliance"],
    allowedChannels: ["internal_chat", "web_persona", "mobile", "cron"],
    riskLevel: "safe",
    domain: "anomalie",
  },

  lista_anomalie_aperte: {
    schema: {
      type: "function",
      function: {
        name: "lista_anomalie_aperte",
        description: "Lista anomalie finanziarie aperte (non false positive, non risolte). Filtro per severity minima.",
        parameters: {
          type: "object",
          properties: {
            severity_min: { type: "string", enum: ["low","medium","high","critical"], default: "medium" },
          },
          required: [],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_anomalie_aperte", {
      p_company_id: ctx.companyId,
      p_user_id: ctx.userId,
      p_severity_min: args?.severity_min ?? "medium",
    }),
    allowedRoles: ["super_admin", "company_admin"],
    allowedPersonas: ["silvio", "controller", "cfo", "amministrazione", "compliance", "assistente_imprenditore"],
    allowedChannels: ["internal_chat", "web_persona", "mobile", "telegram"],
    riskLevel: "safe",
    domain: "anomalie",
  },

  detect_duplicate_payments: {
    schema: {
      type: "function",
      function: {
        name: "detect_duplicate_payments",
        description: "Rileva pagamenti duplicati (stessa controparte + stesso importo + entro N giorni) negli ultimi giorni. Pre-filter rule-based prima di AI deep analysis.",
        parameters: {
          type: "object",
          properties: {
            days_back: { type: "integer", minimum: 1, maximum: 90, default: 7 },
          },
          required: [],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_detect_duplicate_payments", {
      p_company_id: ctx.companyId,
      p_user_id: ctx.userId,
      p_days_back: args?.days_back ?? 7,
    }),
    allowedRoles: ["super_admin", "company_admin"],
    allowedPersonas: ["silvio", "controller", "cfo", "amministrazione"],
    allowedChannels: ["internal_chat", "web_persona", "mobile", "cron"],
    riskLevel: "safe",
    domain: "anomalie",
  },

  // ═════════════════════════════════════════════════════════════════════════
  // MP-OPS-02 — Briefing Capomastro Mattutino
  // ═════════════════════════════════════════════════════════════════════════

  lista_cantieri_per_briefing: {
    schema: {
      type: "function",
      function: {
        name: "lista_cantieri_per_briefing",
        description: "Lista cantieri attivi che necessitano briefing mattutino (capomastro assegnato + canale preferenza valido + briefing non ancora inviato oggi). Usato dal cron 06:30.",
        parameters: {
          type: "object",
          properties: {
            briefing_date: { type: "string", description: "Data YYYY-MM-DD (default oggi)" },
          },
          required: [],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_lista_cantieri_per_briefing", {
      p_company_id: ctx.companyId,
      p_briefing_date: args?.briefing_date ?? null,
    }),
    allowedRoles: ["super_admin", "company_admin"],
    allowedPersonas: ["silvio", "pm_cantiere", "assistente_imprenditore"],
    allowedChannels: ["internal_chat", "web_persona", "cron"],
    riskLevel: "safe",
    domain: "cantiere",
  },

  log_briefing_sent: {
    schema: {
      type: "function",
      function: {
        name: "log_briefing_sent",
        description: "Registra l'invio di un briefing mattutino al capomastro (idempotente per cantiere+data).",
        parameters: {
          type: "object",
          properties: {
            cantiere_id: { type: "string" },
            briefing_date: { type: "string" },
            capomastro_user_id: { type: "string" },
            channel: { type: "string", enum: ["whatsapp","telegram","push","email","sms"] },
            ai_message: { type: "string" },
            weather_data: { type: "object" },
            safety_alerts: { type: "object" },
            external_message_id: { type: "string" },
            ai_cost_billed_eur: { type: "number" },
          },
          required: ["cantiere_id", "briefing_date", "capomastro_user_id", "channel", "ai_message"],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_log_briefing_sent", {
      p_company_id: ctx.companyId,
      p_user_id: ctx.userId,
      p_cantiere_id: args?.cantiere_id,
      p_briefing_date: args?.briefing_date,
      p_capomastro_user_id: args?.capomastro_user_id,
      p_channel: args?.channel,
      p_ai_message: args?.ai_message,
      p_weather_data: args?.weather_data ?? null,
      p_safety_alerts: args?.safety_alerts ?? null,
      p_external_message_id: args?.external_message_id ?? null,
      p_ai_cost_billed_eur: args?.ai_cost_billed_eur ?? null,
    }),
    allowedRoles: ["super_admin"],
    allowedPersonas: ["silvio", "pm_cantiere"],
    allowedChannels: ["internal_chat", "cron"],
    riskLevel: "safe",
    domain: "cantiere",
  },

  // ═════════════════════════════════════════════════════════════════════════
  // MP-OPS-03 — Giornale Cantiere Auto
  // ═════════════════════════════════════════════════════════════════════════

  genera_giornale_cantiere: {
    schema: {
      type: "function",
      function: {
        name: "genera_giornale_cantiere",
        description: "Genera giornale di cantiere formale per data specifica (default: oggi). Idempotente per (cantiere, data). Aggrega rapportini, foto, DDT, presenze, meteo. Usa per cron 18:00 o re-gen on-demand.",
        parameters: {
          type: "object",
          properties: {
            cantiere_id: { type: "string" },
            data: { type: "string", description: "YYYY-MM-DD (default oggi)" },
            force_regenerate: { type: "boolean", default: false },
          },
          required: ["cantiere_id"],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_genera_giornale", {
      p_company_id: ctx.companyId,
      p_user_id: ctx.userId,
      p_cantiere_id: args?.cantiere_id,
      p_data: args?.data ?? null,
      p_force_regenerate: args?.force_regenerate === true,
    }),
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
    allowedPersonas: ["silvio", "pm_cantiere", "capocantiere", "*"],
    allowedChannels: ["internal_chat", "web_persona", "mobile", "whatsapp", "telegram", "cron"],
    riskLevel: "safe",
    domain: "cantiere",
    estimatedCostEur: 0.05,
  },

  approva_giornale_cantiere: {
    schema: {
      type: "function",
      function: {
        name: "approva_giornale_cantiere",
        description: "Firma digitalmente il giornale di cantiere (PM o titolare). Genera signature_hash SHA-256. Una volta firmato non è più modificabile.",
        parameters: {
          type: "object",
          properties: {
            giornale_id: { type: "string" },
            observations: { type: "string", description: "Osservazioni opzionali del firmatario" },
          },
          required: ["giornale_id"],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_approva_giornale", {
      p_company_id: ctx.companyId,
      p_user_id: ctx.userId,
      p_giornale_id: args?.giornale_id,
      p_observations: args?.observations ?? null,
    }),
    allowedRoles: ["super_admin", "company_admin"],
    allowedPersonas: ["pm_cantiere", "assistente_imprenditore"],
    allowedChannels: ["internal_chat", "web_persona", "mobile"],
    riskLevel: "yellow", // firma legale → HITL conferma
    domain: "cantiere",
  },

  aggiorna_giornale_evento: {
    schema: {
      type: "function",
      function: {
        name: "aggiorna_giornale_evento",
        description: "Aggiunge un evento (visita DL, ispezione ASL, problema sicurezza, ecc.) al giornale del giorno. Solo se non ancora firmato.",
        parameters: {
          type: "object",
          properties: {
            cantiere_id: { type: "string" },
            data: { type: "string", description: "YYYY-MM-DD" },
            evento_type: { type: "string", description: "Es. 'visita_dl', 'ispezione_asl', 'problema_sicurezza'" },
            evento_descrizione: { type: "string" },
          },
          required: ["cantiere_id", "data", "evento_type", "evento_descrizione"],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_aggiorna_giornale_evento", {
      p_company_id: ctx.companyId,
      p_user_id: ctx.userId,
      p_cantiere_id: args?.cantiere_id,
      p_data: args?.data,
      p_evento_type: args?.evento_type,
      p_evento_descrizione: args?.evento_descrizione,
    }),
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
    allowedPersonas: ["silvio", "pm_cantiere", "capocantiere", "*"],
    allowedChannels: ["internal_chat", "web_persona", "mobile", "whatsapp", "telegram"],
    riskLevel: "yellow",
    domain: "cantiere",
  },

  // ═════════════════════════════════════════════════════════════════════════
  // MP-SALES-02 — Preventivo da Foto
  // ═════════════════════════════════════════════════════════════════════════

  crea_preventivo_da_foto: {
    schema: {
      type: "function",
      function: {
        name: "crea_preventivo_da_foto",
        description: "Crea un run di preventivo da foto: salva input (foto storage paths + descrizione + indirizzo) e avvia analisi vision asincrona. Risultato: run_id + status='pending'. L'edge preventivo-da-foto-orchestrator processa.",
        parameters: {
          type: "object",
          properties: {
            source: { type: "string", enum: ["portal_customer","public_landing","whatsapp","telegram","email","manual_ui"] },
            customer_id: { type: "string", description: "UUID profile (opzionale, se cliente esistente)" },
            lead_name: { type: "string" },
            lead_email: { type: "string" },
            lead_phone: { type: "string" },
            cantiere_address: { type: "string" },
            description: { type: "string", description: "Cosa vuole il cliente" },
            image_storage_paths: { type: "array", items: { type: "string" } },
            sketch_storage_paths: { type: "array", items: { type: "string" } },
            urgenza: { type: "string", enum: ["non_urgente","normale","urgente","molto_urgente"], default: "normale" },
            budget_hint_eur: { type: "number" },
          },
          required: ["source", "image_storage_paths"],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_crea_preventivo_da_foto", {
      p_company_id: ctx.companyId,
      p_user_id: ctx.userId,
      p_source: args?.source,
      p_customer_id: args?.customer_id ?? null,
      p_lead_name: args?.lead_name ?? null,
      p_lead_email: args?.lead_email ?? null,
      p_lead_phone: args?.lead_phone ?? null,
      p_cantiere_address: args?.cantiere_address ?? null,
      p_description: args?.description ?? null,
      p_image_storage_paths: args?.image_storage_paths ?? [],
      p_sketch_storage_paths: args?.sketch_storage_paths ?? null,
      p_urgenza: args?.urgenza ?? "normale",
      p_budget_hint_eur: args?.budget_hint_eur ?? null,
    }),
    allowedRoles: ["super_admin", "company_admin", "company_staff", "salesperson"],
    allowedPersonas: ["silvio", "sales", "pm_cantiere", "tecnico", "*"],
    allowedChannels: ["internal_chat", "web_persona", "mobile", "whatsapp", "telegram", "email", "api"],
    riskLevel: "yellow", // crea proposal review prima dell'invio
    domain: "preventivi",
    estimatedCostEur: 0.20,
  },

  lista_preventivi_da_foto_draft: {
    schema: {
      type: "function",
      function: {
        name: "lista_preventivi_da_foto_draft",
        description: "Lista i preventivi da foto generati da AI in attesa di revisione sales/PM. Default: solo status='draft_ready'.",
        parameters: {
          type: "object",
          properties: {
            status_filter: { type: "string", description: "Filtro stato (default 'draft_ready')" },
          },
          required: [],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_lista_preventivi_da_foto_draft", {
      p_company_id: ctx.companyId,
      p_user_id: ctx.userId,
      p_status_filter: args?.status_filter ?? "draft_ready",
    }),
    allowedRoles: ["super_admin", "company_admin", "salesperson"],
    allowedPersonas: ["silvio", "sales", "direttore_vendite", "pm_cantiere", "tecnico", "assistente_imprenditore"],
    allowedChannels: ["internal_chat", "web_persona", "mobile"],
    riskLevel: "safe",
    domain: "preventivi",
  },

  // ═════════════════════════════════════════════════════════════════════════
  // MP-HR-01 — Onboarding Dipendente Automatizzato
  // ═════════════════════════════════════════════════════════════════════════

  avvia_onboarding_dipendente: {
    schema: {
      type: "function",
      function: {
        name: "avvia_onboarding_dipendente",
        description: "Avvia il processo di onboarding completo per un dipendente: crea i 6 step (contratto, UNILAV, visita medica, formazione 16h, DPI, portale) e popola i dati contrattuali (CCNL, livello, qualifica, RAL).",
        parameters: {
          type: "object",
          properties: {
            employee_id: { type: "string", description: "UUID dipendente esistente" },
            ccnl: { type: "string", description: "Es. 'CCNL Edilizia Industria'", default: "CCNL Edilizia Industria" },
            livello: { type: "string", description: "Es. 'A2', '4° categoria'" },
            qualifica: { type: "string", description: "Es. 'muratore', 'carpentiere', 'capomastro'" },
            data_assunzione: { type: "string", description: "YYYY-MM-DD" },
            ore_settimana: { type: "integer", default: 40 },
            ral_eur: { type: "number", description: "Retribuzione Annua Lorda EUR" },
          },
          required: ["employee_id"],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_avvia_onboarding", {
      p_company_id: ctx.companyId,
      p_user_id: ctx.userId,
      p_employee_id: args?.employee_id,
      p_ccnl: args?.ccnl ?? "CCNL Edilizia Industria",
      p_livello: args?.livello ?? null,
      p_qualifica: args?.qualifica ?? null,
      p_data_assunzione: args?.data_assunzione ?? null,
      p_ore_settimana: args?.ore_settimana ?? 40,
      p_ral_eur: args?.ral_eur ?? null,
    }),
    allowedRoles: ["super_admin", "company_admin"],
    allowedPersonas: ["silvio", "hr", "assistente_imprenditore"],
    allowedChannels: ["internal_chat", "web_persona", "mobile"],
    riskLevel: "yellow",
    domain: "hr",
  },

  aggiorna_step_onboarding: {
    schema: {
      type: "function",
      function: {
        name: "aggiorna_step_onboarding",
        description: "Aggiorna lo stato di uno step di onboarding (contract_generation, unilav_sending, medical_scheduling, training_scheduling, dpi_delivery, portal_activation). Quando tutti completed, employee.onboarding_status = 'completed'.",
        parameters: {
          type: "object",
          properties: {
            employee_id: { type: "string" },
            step_key: { type: "string", enum: ["contract_generation","unilav_sending","medical_scheduling","training_scheduling","dpi_delivery","portal_activation"] },
            status: { type: "string", enum: ["pending","in_progress","completed","failed","skipped"] },
            document_path: { type: "string" },
            external_reference: { type: "string" },
            ai_content: { type: "string" },
            error_message: { type: "string" },
          },
          required: ["employee_id", "step_key", "status"],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_aggiorna_step_onboarding", {
      p_company_id: ctx.companyId,
      p_user_id: ctx.userId,
      p_employee_id: args?.employee_id,
      p_step_key: args?.step_key,
      p_status: args?.status,
      p_document_path: args?.document_path ?? null,
      p_external_reference: args?.external_reference ?? null,
      p_ai_content: args?.ai_content ?? null,
      p_error_message: args?.error_message ?? null,
    }),
    allowedRoles: ["super_admin", "company_admin"],
    allowedPersonas: ["silvio", "hr"],
    allowedChannels: ["internal_chat", "web_persona", "cron"],
    riskLevel: "yellow",
    domain: "hr",
  },

  lista_onboarding_in_corso: {
    schema: {
      type: "function",
      function: {
        name: "lista_onboarding_in_corso",
        description: "Lista dipendenti con onboarding in corso (non completed/blocked). Mostra: nome, qualifica, % step completati, eventuali step falliti.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    executor: async (_args, ctx) => callRpc(ctx.supabase, "silvio_tool_lista_onboarding_in_corso", {
      p_company_id: ctx.companyId,
      p_user_id: ctx.userId,
    }),
    allowedRoles: ["super_admin", "company_admin"],
    allowedPersonas: ["silvio", "hr", "assistente_imprenditore"],
    allowedChannels: ["internal_chat", "web_persona", "mobile"],
    riskLevel: "safe",
    domain: "hr",
  },

  verifica_completion_onboarding: {
    schema: {
      type: "function",
      function: {
        name: "verifica_completion_onboarding",
        description: "Verifica checklist onboarding di un dipendente: contratto firmato? UNILAV inviato? Visita medica? Formazione 16h? DPI? Portale attivo? Ritorna `all_complete` true/false.",
        parameters: {
          type: "object",
          properties: {
            employee_id: { type: "string" },
          },
          required: ["employee_id"],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_verifica_completion_onboarding", {
      p_company_id: ctx.companyId,
      p_user_id: ctx.userId,
      p_employee_id: args?.employee_id,
    }),
    allowedRoles: ["super_admin", "company_admin"],
    allowedPersonas: ["silvio", "hr", "assistente_imprenditore"],
    allowedChannels: ["internal_chat", "web_persona", "mobile"],
    riskLevel: "safe",
    domain: "hr",
  },

  // ═════════════════════════════════════════════════════════════════════════
  // MP-OPS-04 — SAL Automatico
  // ═════════════════════════════════════════════════════════════════════════

  compone_sal_da_rapportini: {
    schema: {
      type: "function",
      function: {
        name: "compone_sal_da_rapportini",
        description: "Avvia composizione SAL automatica aggregando rapportini, foto, DDT del periodo specificato. Default periodo: dall'ultimo SAL approvato a oggi. Output: run_id pending; orchestratore async farà composizione AI + calcoli ritenute.",
        parameters: {
          type: "object",
          properties: {
            order_id: { type: "string", description: "UUID cantiere" },
            period_start: { type: "string", description: "YYYY-MM-DD (default: dopo ultimo SAL)" },
            period_end: { type: "string", description: "YYYY-MM-DD (default: oggi)" },
            force_regenerate: { type: "boolean", default: false },
          },
          required: ["order_id"],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_compone_sal_da_rapportini", {
      p_company_id: ctx.companyId,
      p_user_id: ctx.userId,
      p_order_id: args?.order_id,
      p_period_start: args?.period_start ?? null,
      p_period_end: args?.period_end ?? null,
      p_force_regenerate: args?.force_regenerate === true,
    }),
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
    allowedPersonas: ["silvio", "pm_cantiere", "controller", "amministrazione"],
    allowedChannels: ["internal_chat", "web_persona", "mobile", "cron"],
    riskLevel: "yellow",
    domain: "fattura",
    estimatedCostEur: 0.05,
  },

  lista_sal_in_attesa: {
    schema: {
      type: "function",
      function: {
        name: "lista_sal_in_attesa",
        description: "Lista SAL in stato bozza/draft_ai (in attesa di approvazione PM). Include warnings AI di validazione.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    executor: async (_args, ctx) => callRpc(ctx.supabase, "silvio_tool_lista_sal_in_attesa", {
      p_company_id: ctx.companyId,
      p_user_id: ctx.userId,
    }),
    allowedRoles: ["super_admin", "company_admin"],
    allowedPersonas: ["silvio", "pm_cantiere", "controller", "cfo", "amministrazione"],
    allowedChannels: ["internal_chat", "web_persona", "mobile"],
    riskLevel: "safe",
    domain: "fattura",
  },

  approva_sal: {
    schema: {
      type: "function",
      function: {
        name: "approva_sal",
        description: "Approva un SAL bozza (yellow → HITL). Se ci sono warning bloccanti, richiede force_proceed_with_warnings=true. Una volta approvato è pronto per firma e invio committente/DL.",
        parameters: {
          type: "object",
          properties: {
            sal_id: { type: "string" },
            observations: { type: "string", description: "Osservazioni opzionali" },
            force_proceed_with_warnings: { type: "boolean", default: false },
          },
          required: ["sal_id"],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_approva_sal", {
      p_company_id: ctx.companyId,
      p_user_id: ctx.userId,
      p_sal_id: args?.sal_id,
      p_observations: args?.observations ?? null,
      p_force_proceed_with_warnings: args?.force_proceed_with_warnings === true,
    }),
    allowedRoles: ["super_admin", "company_admin"],
    allowedPersonas: ["pm_cantiere", "controller", "assistente_imprenditore"],
    allowedChannels: ["internal_chat", "web_persona", "mobile"],
    riskLevel: "yellow",
    domain: "fattura",
  },

  // ═════════════════════════════════════════════════════════════════════════
  // MP-OPS-05 — Materiale JIT + Reorder Predittivo
  // ═════════════════════════════════════════════════════════════════════════

  predici_consumo_materiali: {
    schema: {
      type: "function",
      function: {
        name: "predici_consumo_materiali",
        description: "Predice fabbisogno materiali per un cantiere su orizzonte 7/14/30 giorni basato su storico consumi.",
        parameters: {
          type: "object",
          properties: {
            order_id: { type: "string" },
            horizon_days: { type: "integer", enum: [7, 14, 30], default: 14 },
          },
          required: ["order_id"],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_predici_consumo_materiali", {
      p_company_id: ctx.companyId,
      p_user_id: ctx.userId,
      p_order_id: args?.order_id,
      p_horizon_days: args?.horizon_days ?? 14,
    }),
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
    allowedPersonas: ["silvio", "pm_cantiere", "acquisti", "capocantiere"],
    allowedChannels: ["internal_chat", "web_persona", "mobile", "cron"],
    riskLevel: "safe",
    domain: "cantiere",
  },

  lista_stockout_imminenti: {
    schema: {
      type: "function",
      function: {
        name: "lista_stockout_imminenti",
        description: "Lista materiali a rischio stock-out nei prossimi N giorni per tutti i cantieri attivi. Calcolato da saldo / consumo medio giornaliero.",
        parameters: {
          type: "object",
          properties: {
            days_ahead: { type: "integer", minimum: 1, maximum: 30, default: 7 },
          },
          required: [],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_lista_stockout_imminenti", {
      p_company_id: ctx.companyId,
      p_user_id: ctx.userId,
      p_days_ahead: args?.days_ahead ?? 7,
    }),
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
    allowedPersonas: ["silvio", "pm_cantiere", "acquisti", "capocantiere", "assistente_imprenditore"],
    allowedChannels: ["internal_chat", "web_persona", "mobile", "whatsapp", "telegram", "cron"],
    riskLevel: "safe",
    domain: "cantiere",
  },

  crea_proposta_ordine_fornitore: {
    schema: {
      type: "function",
      function: {
        name: "crea_proposta_ordine_fornitore",
        description: "Crea una proposed_purchase_order (yellow → HITL) con: fornitore consigliato + items + timing ottimale. Dopo approvazione il sistema crea PO reale e invia al fornitore.",
        parameters: {
          type: "object",
          properties: {
            supplier_id: { type: "string" },
            for_cantiere_id: { type: "string" },
            items: { type: "array", items: { type: "object" }, description: "[{material_sku, name, qty, unit, price_estimate, note}]" },
            proposal_reason: { type: "string", description: "Es. 'stockout imminente', 'ordine ricorrente'" },
            total_amount_eur: { type: "number" },
            optimal_send_date: { type: "string", description: "YYYY-MM-DD" },
            expected_delivery_date: { type: "string", description: "YYYY-MM-DD" },
          },
          required: ["supplier_id", "for_cantiere_id", "items", "proposal_reason", "total_amount_eur"],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_crea_proposta_ordine_fornitore", {
      p_company_id: ctx.companyId,
      p_user_id: ctx.userId,
      p_supplier_id: args?.supplier_id,
      p_for_cantiere_id: args?.for_cantiere_id,
      p_items: args?.items,
      p_proposal_reason: args?.proposal_reason,
      p_total_amount_eur: args?.total_amount_eur,
      p_optimal_send_date: args?.optimal_send_date ?? null,
      p_expected_delivery_date: args?.expected_delivery_date ?? null,
    }),
    allowedRoles: ["super_admin", "company_admin"],
    allowedPersonas: ["silvio", "acquisti", "pm_cantiere"],
    allowedChannels: ["internal_chat", "web_persona", "mobile", "cron"],
    riskLevel: "yellow",
    domain: "filiera",
  },

  lista_proposte_ordini_pending: {
    schema: {
      type: "function",
      function: {
        name: "lista_proposte_ordini_pending",
        description: "Lista proposed_purchase_orders in stato 'draft' (in attesa approval). Per UI inbox acquisti.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    executor: async (_args, ctx) => callRpc(ctx.supabase, "silvio_tool_lista_proposte_ordini_pending", {
      p_company_id: ctx.companyId,
      p_user_id: ctx.userId,
    }),
    allowedRoles: ["super_admin", "company_admin"],
    allowedPersonas: ["silvio", "acquisti", "pm_cantiere", "assistente_imprenditore"],
    allowedChannels: ["internal_chat", "web_persona", "mobile"],
    riskLevel: "safe",
    domain: "filiera",
  },

  // ═════════════════════════════════════════════════════════════════════════
  // MP-DATI-01 — Import guidato: Excel/CSV → gestionale (prodotti/articoli)
  // ═════════════════════════════════════════════════════════════════════════

  importa_prodotti: {
    schema: {
      type: "function",
      function: {
        name: "importa_prodotti",
        description:
          "Importa nel gestionale un elenco di prodotti/articoli letto da un file (Excel/CSV) caricato dall'utente. Usalo quando l'utente carica un file con prodotti/articoli/listino e chiede di inserirli/caricarli/importarli a sistema. Leggi il contenuto del file fornito nel messaggio, mappa le colonne dell'utente ai campi sotto e passa TUTTE le righe. destinazione='catalogo' → listino articoli per i preventivi; destinazione='magazzino' → giacenze/inventario. È yellow: l'utente conferma prima che venga scritto qualcosa. PRIMA di chiamarlo riassumi all'utente quante righe hai letto e come hai mappato le colonne.",
        parameters: {
          type: "object",
          properties: {
            destinazione: {
              type: "string",
              enum: ["catalogo", "magazzino"],
              description: "catalogo = listino articoli per preventivi; magazzino = giacenze/inventario",
            },
            prodotti: {
              type: "array",
              description: "Tutte le righe prodotto lette dal file (mappa le colonne dell'utente su questi campi).",
              items: {
                type: "object",
                properties: {
                  nome: { type: "string", description: "Nome/descrizione articolo — OBBLIGATORIO" },
                  descrizione: { type: "string" },
                  prezzo: { type: "number", description: "Prezzo di vendita in €" },
                  prezzo_acquisto: { type: "number", description: "Costo/prezzo d'acquisto in €" },
                  unita_misura: { type: "string", description: "Es. pz, mq, ml, kg, h" },
                  categoria: { type: "string" },
                  codice: { type: "string", description: "Codice / SKU / barcode" },
                  fornitore: { type: "string", description: "Nome fornitore, se presente" },
                  iva: { type: "number", description: "Aliquota IVA % (default 22)" },
                  quantita: { type: "number", description: "Solo magazzino: giacenza iniziale" },
                },
                required: ["nome"],
              },
            },
          },
          required: ["destinazione", "prodotti"],
        },
      },
    },
    executor: async (args, ctx) => {
      const dest = args?.destinazione === "magazzino" ? "magazzino" : "catalogo";
      const rows: Array<Record<string, unknown>> = Array.isArray(args?.prodotti) ? args.prodotti : [];
      if (rows.length === 0) return { error: "Nessun prodotto da importare." };
      if (rows.length > 2000) return { error: "Troppe righe in un'unica volta (max 2000): dividi il file." };

      const toNum = (v: unknown): number | null => {
        if (v === null || v === undefined || v === "") return null;
        const n = typeof v === "number"
          ? v
          : parseFloat(String(v).replace(/[^0-9,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
        return Number.isFinite(n) ? n : null;
      };
      const str = (v: unknown): string | null =>
        v === null || v === undefined ? null : (String(v).trim() || null);

      const clean = rows
        .map((r) => ({
          nome: (str(r?.nome) ?? "").slice(0, 300),
          descrizione: str(r?.descrizione),
          prezzo: toNum(r?.prezzo),
          prezzo_acquisto: toNum(r?.prezzo_acquisto),
          unita_misura: str(r?.unita_misura),
          categoria: str(r?.categoria),
          codice: str(r?.codice),
          iva: toNum(r?.iva),
          quantita: toNum(r?.quantita),
        }))
        .filter((r) => r.nome.length > 0);

      const scartati = rows.length - clean.length;
      if (clean.length === 0) return { error: "Nessuna riga valida: manca il nome del prodotto." };

      // De-dup intra-file: catalogo→chiave nome; magazzino→codice (se presente)
      // altrimenti nome. Evita conteggi gonfiati e conflitti sugli indici unici.
      const seen = new Set<string>();
      const deduped: typeof clean = [];
      let duplicatiFile = 0;
      for (const r of clean) {
        const key = (dest === "magazzino" && r.codice ? `c:${r.codice}` : `n:${r.nome}`).toLowerCase();
        if (seen.has(key)) { duplicatiFile++; continue; }
        seen.add(key);
        deduped.push(r);
      }

      let importati = 0;
      let giaEsistenti = 0;
      let falliti = 0;
      const errori: string[] = [];
      const isDupErr = (m: string) => /duplicate key|already exists|unique/i.test(m);

      // Inserisce un batch; se il chunk fallisce (es. un codice duplicato),
      // ricade riga-per-riga così un singolo record non fa perdere gli altri 99.
      const insertBatch = async (table: string, payload: Record<string, unknown>[], upsertOnName: boolean) => {
        const run = (rs: Record<string, unknown>[]) =>
          upsertOnName
            ? ctx.supabase.from(table).upsert(rs, { onConflict: "company_id,name", ignoreDuplicates: true }).select("id")
            : ctx.supabase.from(table).insert(rs).select("id");
        const { data, error } = await run(payload);
        if (!error) {
          const ins = data?.length ?? 0;
          importati += ins;
          if (upsertOnName) giaEsistenti += Math.max(0, payload.length - ins);
          return;
        }
        for (const row of payload) {
          const { data: d2, error: e2 } = await run([row]);
          if (e2) {
            if (isDupErr(e2.message)) giaEsistenti++;
            else { falliti++; if (errori.length < 5) errori.push(e2.message); }
          } else if ((d2?.length ?? 0) > 0) importati++;
          else giaEsistenti++;
        }
      };

      for (let i = 0; i < deduped.length; i += 100) {
        const part = deduped.slice(i, i + 100);
        if (dest === "catalogo") {
          await insertBatch("article_templates", part.map((r) => ({
            company_id: ctx.companyId,
            name: r.nome,
            description: r.descrizione,
            category: r.categoria,
            sku: r.codice,
            unit_of_measure: r.unita_misura,
            unit_price: r.prezzo,
            prezzo_vendita: r.prezzo,
            prezzo_acquisto_netto: r.prezzo_acquisto,
            standard_cost: r.prezzo_acquisto,
            vat_rate: r.iva ?? 22,
            modalita_prezzo: "pz",
            attivo: true,
          })), true);
        } else {
          await insertBatch("warehouse_stock", part.map((r) => ({
            company_id: ctx.companyId,
            name: r.nome,
            description: r.descrizione,
            quantity: Math.round(r.quantita ?? 0),
            unit_cost: r.prezzo_acquisto ?? r.prezzo ?? 0,
            vat_rate: r.iva ?? 22,
            internal_code: r.codice,
          })), false);
        }
      }

      return {
        ok: true,
        destinazione: dest,
        importati,
        gia_esistenti_saltati: giaEsistenti,
        righe_duplicate_nel_file: duplicatiFile,
        righe_senza_nome_ignorate: scartati,
        falliti,
        errori: errori.slice(0, 5),
        messaggio:
          `Importati ${importati} prodotti in ${dest === "catalogo" ? "catalogo articoli" : "magazzino"}` +
          (giaEsistenti ? ` · ${giaEsistenti} già presenti saltati` : "") +
          (duplicatiFile ? ` · ${duplicatiFile} duplicati nel file` : "") +
          (scartati ? ` · ${scartati} righe senza nome ignorate` : "") +
          (falliti ? ` · ${falliti} falliti` : "") + ".",
      };
    },
    allowedRoles: ["super_admin", "company_admin"],
    allowedPersonas: ["silvio", "assistente_imprenditore", "titolare"],
    allowedChannels: ["internal_chat", "web_persona", "mobile"],
    riskLevel: "yellow",
    domain: "filiera",
  },

  importa_fornitori: {
    schema: {
      type: "function",
      function: {
        name: "importa_fornitori",
        description:
          "Importa nel gestionale un elenco di FORNITORI letto da un file (Excel/CSV) caricato dall'utente. Usalo quando l'utente carica un elenco fornitori e chiede di inserirli/importarli. Leggi il file, mappa le colonne ai campi sotto e passa TUTTE le righe. È yellow: l'utente conferma prima dell'inserimento. PRIMA di chiamarlo, di' quanti fornitori hai letto.",
        parameters: {
          type: "object",
          properties: {
            fornitori: {
              type: "array",
              description: "Tutte le righe fornitore lette dal file (mappa le colonne su questi campi).",
              items: {
                type: "object",
                properties: {
                  nome: { type: "string", description: "Ragione sociale — OBBLIGATORIO" },
                  partita_iva: { type: "string" },
                  codice_fiscale: { type: "string" },
                  email: { type: "string" },
                  telefono: { type: "string" },
                  indirizzo: { type: "string" },
                  citta: { type: "string" },
                  provincia: { type: "string", description: "Sigla, es. MI" },
                  categoria: { type: "string", description: "Categoria merceologica" },
                  sito: { type: "string" },
                  note: { type: "string" },
                },
                required: ["nome"],
              },
            },
          },
          required: ["fornitori"],
        },
      },
    },
    executor: async (args, ctx) => {
      const rows: Array<Record<string, unknown>> = Array.isArray(args?.fornitori) ? args.fornitori : [];
      if (rows.length === 0) return { error: "Nessun fornitore da importare." };
      if (rows.length > 2000) return { error: "Troppe righe (max 2000): dividi il file." };
      const str = (v: unknown): string | null =>
        v === null || v === undefined ? null : (String(v).trim() || null);

      const clean = rows
        .map((r) => ({
          nome: (str(r?.nome) ?? "").slice(0, 300),
          partita_iva: str(r?.partita_iva),
          codice_fiscale: str(r?.codice_fiscale),
          email: str(r?.email),
          telefono: str(r?.telefono),
          indirizzo: str(r?.indirizzo),
          citta: str(r?.citta),
          provincia: str(r?.provincia)?.slice(0, 4).toUpperCase() ?? null,
          categoria: str(r?.categoria),
          sito: str(r?.sito),
          note: str(r?.note),
        }))
        .filter((r) => r.nome.length > 0);

      const scartati = rows.length - clean.length;
      if (clean.length === 0) return { error: "Nessuna riga valida: manca la ragione sociale." };

      // De-dup intra-file: P.IVA se presente, altrimenti nome.
      const seen = new Set<string>();
      const deduped: typeof clean = [];
      let duplicatiFile = 0;
      for (const r of clean) {
        const key = (r.partita_iva ? `p:${r.partita_iva}` : `n:${r.nome}`).toLowerCase();
        if (seen.has(key)) { duplicatiFile++; continue; }
        seen.add(key); deduped.push(r);
      }

      let importati = 0, giaEsistenti = 0, falliti = 0;
      const errori: string[] = [];
      const isDupErr = (m: string) => /duplicate key|already exists|unique/i.test(m);

      for (let i = 0; i < deduped.length; i += 100) {
        const part = deduped.slice(i, i + 100).map((r) => ({
          company_id: ctx.companyId,
          name: r.nome,
          vat_number: r.partita_iva,
          fiscal_code: r.codice_fiscale,
          email: r.email,
          phone: r.telefono,
          address: r.indirizzo,
          city: r.citta,
          province: r.provincia,
          product_category: r.categoria,
          website: r.sito,
          notes: r.note,
          country: "IT",
          is_active: true,
        }));
        const { data, error } = await ctx.supabase.from("suppliers").insert(part).select("id");
        if (!error) { importati += data?.length ?? 0; continue; }
        // fallback riga-per-riga: un fornitore duplicato non fa perdere gli altri
        for (const row of part) {
          const { data: d2, error: e2 } = await ctx.supabase.from("suppliers").insert([row]).select("id");
          if (e2) {
            if (isDupErr(e2.message)) giaEsistenti++;
            else { falliti++; if (errori.length < 5) errori.push(e2.message); }
          } else importati += d2?.length ?? 0;
        }
      }

      return {
        ok: true,
        importati,
        gia_esistenti_saltati: giaEsistenti,
        righe_duplicate_nel_file: duplicatiFile,
        righe_senza_nome_ignorate: scartati,
        falliti,
        errori: errori.slice(0, 5),
        messaggio:
          `Importati ${importati} fornitori` +
          (giaEsistenti ? ` · ${giaEsistenti} già presenti saltati` : "") +
          (duplicatiFile ? ` · ${duplicatiFile} duplicati nel file` : "") +
          (scartati ? ` · ${scartati} righe senza nome ignorate` : "") +
          (falliti ? ` · ${falliti} falliti` : "") + ".",
      };
    },
    allowedRoles: ["super_admin", "company_admin"],
    allowedPersonas: ["silvio", "assistente_imprenditore", "titolare", "acquisti"],
    allowedChannels: ["internal_chat", "web_persona", "mobile"],
    riskLevel: "yellow",
    domain: "filiera",
  },

  importa_clienti: {
    schema: {
      type: "function",
      function: {
        name: "importa_clienti",
        description:
          "Importa nella rubrica CRM un elenco di CLIENTI/contatti letto da un file (Excel/CSV) caricato dall'utente. Usalo quando l'utente carica un elenco clienti/anagrafica e chiede di inserirli/importarli. Leggi il file, mappa le colonne e passa TUTTE le righe. Inserisce contatti CRM (NON utenti con login). È yellow: l'utente conferma prima dell'inserimento. PRIMA di chiamarlo, di' quanti clienti hai letto.",
        parameters: {
          type: "object",
          properties: {
            clienti: {
              type: "array",
              description: "Tutte le righe cliente lette dal file (mappa le colonne su questi campi).",
              items: {
                type: "object",
                properties: {
                  nome: { type: "string", description: "Nome (persona) o ragione sociale — OBBLIGATORIO" },
                  cognome: { type: "string" },
                  azienda: { type: "string", description: "Ragione sociale, se diversa dal nome" },
                  email: { type: "string" },
                  telefono: { type: "string" },
                  indirizzo: { type: "string" },
                  citta: { type: "string" },
                  provincia: { type: "string", description: "Sigla, es. MI" },
                  partita_iva: { type: "string" },
                  codice_fiscale: { type: "string" },
                  note: { type: "string" },
                },
                required: ["nome"],
              },
            },
          },
          required: ["clienti"],
        },
      },
    },
    executor: async (args, ctx) => {
      const rows: Array<Record<string, unknown>> = Array.isArray(args?.clienti) ? args.clienti : [];
      if (rows.length === 0) return { error: "Nessun cliente da importare." };
      if (rows.length > 2000) return { error: "Troppe righe (max 2000): dividi il file." };
      const str = (v: unknown): string | null =>
        v === null || v === undefined ? null : (String(v).trim() || null);

      const clean = rows
        .map((r) => ({
          nome: str(r?.nome),
          cognome: str(r?.cognome),
          azienda: str(r?.azienda),
          email: str(r?.email),
          telefono: str(r?.telefono),
          indirizzo: str(r?.indirizzo),
          citta: str(r?.citta),
          provincia: str(r?.provincia)?.slice(0, 4).toUpperCase() ?? null,
          partita_iva: str(r?.partita_iva),
          codice_fiscale: str(r?.codice_fiscale),
          note: str(r?.note),
        }))
        .filter((r) => !!(r.nome || r.azienda));

      const scartati = rows.length - clean.length;
      if (clean.length === 0) return { error: "Nessuna riga valida: manca nome o ragione sociale." };

      // De-dup intra-file: email → telefono → nome+azienda.
      const seen = new Set<string>();
      const deduped: typeof clean = [];
      let duplicatiFile = 0;
      for (const r of clean) {
        const key = (r.email ? `e:${r.email}` : r.telefono ? `t:${r.telefono}` : `n:${r.nome ?? ""}|${r.azienda ?? ""}`).toLowerCase();
        if (seen.has(key)) { duplicatiFile++; continue; }
        seen.add(key); deduped.push(r);
      }

      let importati = 0, giaEsistenti = 0, falliti = 0;
      const errori: string[] = [];
      const isDupErr = (m: string) => /duplicate key|already exists|unique/i.test(m);

      for (let i = 0; i < deduped.length; i += 100) {
        const part = deduped.slice(i, i + 100).map((r) => ({
          company_id: ctx.companyId,
          first_name: (r.nome || r.azienda || "Cliente").slice(0, 120),
          last_name: r.cognome,
          company_name: r.azienda,
          email: r.email,
          phone: r.telefono,
          address: r.indirizzo,
          city: r.citta,
          province: r.provincia,
          vat_number: r.partita_iva,
          fiscal_code: r.codice_fiscale,
          notes: r.note,
          country: "IT",
          source: "silvio_import",
        }));
        const { data, error } = await ctx.supabase.from("marketing_contacts").insert(part).select("id");
        if (!error) { importati += data?.length ?? 0; continue; }
        for (const row of part) {
          const { data: d2, error: e2 } = await ctx.supabase.from("marketing_contacts").insert([row]).select("id");
          if (e2) {
            if (isDupErr(e2.message)) giaEsistenti++;
            else { falliti++; if (errori.length < 5) errori.push(e2.message); }
          } else importati += d2?.length ?? 0;
        }
      }

      return {
        ok: true,
        importati,
        gia_esistenti_saltati: giaEsistenti,
        righe_duplicate_nel_file: duplicatiFile,
        righe_senza_nome_ignorate: scartati,
        falliti,
        errori: errori.slice(0, 5),
        messaggio:
          `Importati ${importati} clienti nella rubrica CRM` +
          (giaEsistenti ? ` · ${giaEsistenti} già presenti saltati` : "") +
          (duplicatiFile ? ` · ${duplicatiFile} duplicati nel file` : "") +
          (scartati ? ` · ${scartati} righe senza nome ignorate` : "") +
          (falliti ? ` · ${falliti} falliti` : "") + ".",
      };
    },
    allowedRoles: ["super_admin", "company_admin"],
    allowedPersonas: ["silvio", "assistente_imprenditore", "titolare", "sales"],
    allowedChannels: ["internal_chat", "web_persona", "mobile"],
    riskLevel: "yellow",
    domain: "crm",
  },

  crea_promemoria: {
    schema: {
      type: "function",
      function: {
        name: "crea_promemoria",
        description:
          "Crea un PROMEMORIA/follow-up DATATO: riemerge come avviso nella campanella e nel briefing alla data indicata. Usalo quando l'utente dice 'ricordami…' / 'fra N giorni…', oppure DOPO un'azione per chiudere il cerchio (es. dopo un sollecito: crea un promemoria a +7 giorni per ricontrollare il pagamento). 'data' in formato YYYY-MM-DD; se l'utente dice 'tra N giorni'/'la prossima settimana' calcola tu la data esatta. È safe: crea solo un promemoria, non invia nulla.",
        parameters: {
          type: "object",
          properties: {
            titolo: { type: "string", description: "Cosa ricordare, in breve — OBBLIGATORIO" },
            data: { type: "string", description: "Data del promemoria YYYY-MM-DD — OBBLIGATORIA" },
            note: { type: "string", description: "Dettagli opzionali" },
          },
          required: ["titolo", "data"],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_crea_promemoria", {
      p_company_id: ctx.companyId,
      p_user_id: ctx.userId,
      p_title: args?.titolo,
      p_note: args?.note ?? null,
      p_remind_on: args?.data,
    }),
    allowedRoles: ["super_admin", "company_admin", "company_staff", "salesperson"],
    allowedPersonas: ["silvio", "assistente_imprenditore", "titolare", "sales", "acquisti"],
    allowedChannels: ["internal_chat", "web_persona", "mobile", "whatsapp"],
    riskLevel: "safe",
    domain: "meta",
  },

  // ═════════════════════════════════════════════════════════════════════════
  // MP-SILVIO-OPERATIVO — Silvio crea, non solo legge (2026-07-31).
  // Pattern "carica_ddt": il modello estrae le righe dal documento/testo che
  // l'utente fornisce, MOSTRA il riepilogo, ottiene conferma in chat, POI
  // chiama il tool con le righe strutturate.
  // ═════════════════════════════════════════════════════════════════════════
  importa_listino_prodotti: {
    schema: {
      type: "function",
      function: {
        name: "importa_listino_prodotti",
        description:
          "Importa un CATALOGO/LISTINO PRODOTTI nel listino aziendale (voci di listino usate poi nei preventivi). " +
          "Usalo quando l'utente fornisce un listino: PDF/foto allegati in chat (usa il testo estratto), testo incollato o dettatura. " +
          "FLUSSO OBBLIGATORIO: 1) estrai TU le righe (nome, codice, prezzi, unità) dal materiale fornito; 2) MOSTRA all'utente " +
          "un riepilogo (quante voci, 3-5 esempi con prezzo) e chiedi conferma; 3) SOLO dopo il sì chiama questo tool con le righe. " +
          "Deduplica da solo: le voci con codice o nome già presenti a listino vengono SALTATE (mai sovrascritte). Max 300 voci per chiamata " +
          "(per cataloghi più grandi procedi a blocchi). NON usarlo per DDT (usa carica_ddt) né per creare un preventivo.",
        parameters: {
          type: "object",
          properties: {
            righe: {
              type: "array",
              description: "Voci del listino da creare — almeno una",
              items: {
                type: "object",
                properties: {
                  nome: { type: "string", description: "Nome prodotto/voce — OBBLIGATORIO" },
                  codice: { type: "string", description: "Codice articolo/SKU se presente" },
                  descrizione: { type: "string" },
                  prezzo_vendita: { type: "number", description: "Prezzo di vendita unitario (imponibile)" },
                  prezzo_acquisto: { type: "number", description: "Prezzo/costo di acquisto unitario, se noto" },
                  unita: { type: "string", description: "Unità di misura (pz, mq, ml, h, kg, cad...)" },
                  iva: { type: "number", description: "Aliquota IVA % (default 22)" },
                },
                required: ["nome"],
              },
            },
            fonte: { type: "string", description: "Nome del catalogo/fornitore di provenienza (finisce nella descrizione)" },
            mostra_in_preventivo: { type: "boolean", description: "Se le voci devono comparire nel preventivatore (default true)" },
          },
          required: ["righe"],
        },
      },
    },
    executor: async (args, ctx) => {
      const righe = Array.isArray(args?.righe) ? (args.righe as Array<Record<string, unknown>>) : [];
      if (righe.length === 0) return { error: "Nessuna riga fornita: estrai prima le voci dal catalogo e falle confermare." };
      if (righe.length > 300) return { error: `Troppe voci (${righe.length}): massimo 300 per chiamata, procedi a blocchi.` };

      // Dedup contro l'esistente: per codice (esatto) e nome (case-insensitive).
      const { data: esistenti } = await ctx.supabase
        .from("article_families")
        .select("nome, codice")
        .eq("company_id", ctx.companyId)
        .is("deleted_at", null)
        .limit(5000);
      const nomiEsistenti = new Set(
        ((esistenti ?? []) as Array<{ nome?: string }>).map((r) => (r.nome ?? "").trim().toLowerCase()).filter(Boolean),
      );
      const codiciEsistenti = new Set(
        ((esistenti ?? []) as Array<{ codice?: string | null }>).map((r) => (r.codice ?? "").trim().toLowerCase()).filter(Boolean),
      );

      const fonte = typeof args?.fonte === "string" && args.fonte.trim() ? ` (import: ${args.fonte.trim()})` : "";
      const daInserire: Array<Record<string, unknown>> = [];
      let saltateDuplicate = 0;
      const vistiInBatch = new Set<string>();
      for (const r of righe) {
        const nome = String(r.nome ?? "").trim().slice(0, 200);
        if (!nome) continue;
        const codice = String(r.codice ?? "").trim().slice(0, 80) || null;
        const chiave = (codice ?? nome).toLowerCase();
        if (vistiInBatch.has(chiave)) { saltateDuplicate++; continue; }
        vistiInBatch.add(chiave);
        if (nomiEsistenti.has(nome.toLowerCase()) || (codice && codiciEsistenti.has(codice.toLowerCase()))) {
          saltateDuplicate++;
          continue;
        }
        const pv = Number(r.prezzo_vendita);
        const pa = Number(r.prezzo_acquisto);
        const iva = Number(r.iva);
        daInserire.push({
          company_id: ctx.companyId,
          vertical: "generico",
          nome,
          codice,
          descrizione: (String(r.descrizione ?? "").trim().slice(0, 1000) || null) ?? null,
          prezzo_base_vendita: Number.isFinite(pv) && pv >= 0 ? pv : null,
          prezzo_base_acquisto: Number.isFinite(pa) && pa >= 0 ? pa : null,
          unit_of_measure: String(r.unita ?? "").trim().slice(0, 20) || null,
          vat_rate: Number.isFinite(iva) && iva >= 0 && iva <= 100 ? iva : 22,
          attivo: true,
          mostra_preventivo: args?.mostra_in_preventivo === false ? false : true,
          ...(fonte ? { descrizione: ((String(r.descrizione ?? "").trim().slice(0, 900) || nome) + fonte).slice(0, 1000) } : {}),
        });
      }
      if (daInserire.length === 0) {
        return { create: 0, saltate_duplicate: saltateDuplicate, nota: "Tutte le voci erano già a listino (o senza nome): niente da creare." };
      }
      const { data: inserted, error } = await ctx.supabase
        .from("article_families")
        .insert(daInserire)
        .select("id, nome, prezzo_base_vendita");
      if (error) return { error: `Inserimento listino fallito: ${error.message}` };
      const create = (inserted ?? []).length;
      return {
        create,
        saltate_duplicate: saltateDuplicate,
        esempi: (inserted ?? []).slice(0, 5).map((r: { nome?: string; prezzo_base_vendita?: number | null }) => `${r.nome}${r.prezzo_base_vendita != null ? ` — €${r.prezzo_base_vendita}` : ""}`),
        dove: "Impostazioni → Listino (o il preventivatore, se mostra_in_preventivo).",
        nota: "Voci create ATTIVE. Prezzi/IVA modificabili in ogni momento dal Listino.",
      };
    },
    allowedRoles: ["super_admin", "company_admin"],
    allowedPersonas: ["silvio", "assistente_imprenditore", "titolare"],
    allowedChannels: ["internal_chat", "web_persona", "mobile"],
    riskLevel: "yellow",
    domain: "preventivi",
  },

  crea_preventivo_bozza: {
    schema: {
      type: "function",
      function: {
        name: "crea_preventivo_bozza",
        description:
          "Crea un PREVENTIVO in BOZZA completo di righe, pronto da rifinire e inviare dal preventivatore. " +
          "Usalo quando l'utente chiede 'fammi un preventivo per…' con cliente e lavori/prodotti. " +
          "FLUSSO: 1) raccogli/il deduci cliente e righe (descrizione, quantità, e prezzo se indicato); 2) mostra il riepilogo con il totale stimato " +
          "e chiedi conferma; 3) dopo il sì chiama questo tool. Per le righe SENZA prezzo prova ad abbinare una voce del LISTINO aziendale " +
          "per nome/codice e usa il suo prezzo; se non trova nulla mette 0 e lo segnala (l'utente completa nel builder). " +
          "È una BOZZA: non viene inviato nulla al cliente. Ritorna il link per aprirla nel builder.",
        parameters: {
          type: "object",
          properties: {
            cliente_nome: { type: "string", description: "Nome del cliente/ragione sociale — OBBLIGATORIO" },
            cliente_email: { type: "string" },
            cliente_telefono: { type: "string" },
            cliente_indirizzo: { type: "string" },
            titolo: { type: "string", description: "Titolo/oggetto del preventivo (es. 'Rifacimento bagno')" },
            righe: {
              type: "array",
              description: "Righe del preventivo — almeno una",
              items: {
                type: "object",
                properties: {
                  descrizione: { type: "string", description: "Descrizione voce — OBBLIGATORIA" },
                  quantita: { type: "number", description: "Quantità (default 1)" },
                  prezzo_unitario: { type: "number", description: "Prezzo unitario imponibile; se assente si tenta il listino" },
                  unita: { type: "string", description: "Unità di misura (pz, mq, h...)" },
                  tipo: { type: "string", enum: ["product", "service", "labor"], description: "Tipo voce (default product)" },
                },
                required: ["descrizione"],
              },
            },
            note: { type: "string", description: "Note interne o condizioni" },
            iva: { type: "number", description: "Aliquota IVA % di default per le righe (default 22)" },
          },
          required: ["cliente_nome", "righe"],
        },
      },
    },
    executor: async (args, ctx) => {
      const clienteNome = String(args?.cliente_nome ?? "").trim().slice(0, 200);
      const righe = Array.isArray(args?.righe) ? (args.righe as Array<Record<string, unknown>>) : [];
      if (!clienteNome) return { error: "cliente_nome mancante." };
      if (righe.length === 0) return { error: "Nessuna riga: un preventivo vuoto non serve a nessuno." };
      if (righe.length > 100) return { error: `Troppe righe (${righe.length}): massimo 100.` };

      // Numero preventivo dalla RPC ufficiale (stessa del QuoteBuilder).
      let quoteNumber = "";
      try {
        const { data: numData } = await ctx.supabase.rpc("generate_quote_number", { p_company_id: ctx.companyId });
        quoteNumber = typeof numData === "string" && numData ? numData : "";
      } catch { /* fallback sotto */ }
      if (!quoteNumber) quoteNumber = `OFF-SILVIO-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

      const ivaDefault = Number.isFinite(Number(args?.iva)) ? Number(args?.iva) : 22;
      const { data: quote, error: qErr } = await ctx.supabase
        .from("quotes")
        .insert({
          company_id: ctx.companyId,
          quote_number: quoteNumber,
          status: "bozza",
          client_name: clienteNome,
          client_email: String(args?.cliente_email ?? "").trim().slice(0, 200) || null,
          client_phone: String(args?.cliente_telefono ?? "").trim().slice(0, 50) || null,
          client_address: String(args?.cliente_indirizzo ?? "").trim().slice(0, 300) || null,
          title: String(args?.titolo ?? "").trim().slice(0, 200) || `Preventivo ${clienteNome}`,
          notes: String(args?.note ?? "").trim().slice(0, 2000) || null,
          created_by: ctx.userId,
          source: "silvio",
        })
        .select("id, quote_number")
        .single();
      if (qErr || !quote) return { error: `Creazione preventivo fallita: ${qErr?.message ?? "insert vuoto"}` };

      // Righe: prezzo esplicito > match listino (codice/nome) > 0 (segnalato).
      const items: Array<Record<string, unknown>> = [];
      const senzaPrezzo: string[] = [];
      let totale = 0;
      let sort = 0;
      for (const r of righe) {
        const descrizione = String(r.descrizione ?? "").trim().slice(0, 500);
        if (!descrizione) continue;
        const quantita = Number.isFinite(Number(r.quantita)) && Number(r.quantita) > 0 ? Number(r.quantita) : 1;
        let prezzo = Number(r.prezzo_unitario);
        let unita = String(r.unita ?? "").trim().slice(0, 20) || null;
        let familyId: string | null = null;
        if (!Number.isFinite(prezzo) || prezzo < 0) {
          // Tentativo listino: match sul nome (parola più significativa) o codice.
          const term = descrizione.split(/\s+/).filter((w) => w.length >= 4).slice(0, 3).join(" ") || descrizione;
          const { data: match } = await ctx.supabase
            .from("article_families")
            .select("id, nome, prezzo_base_vendita, unit_of_measure")
            .eq("company_id", ctx.companyId)
            .eq("attivo", true)
            .is("deleted_at", null)
            .ilike("nome", `%${term.slice(0, 60)}%`)
            .limit(1)
            .maybeSingle();
          const m = match as { id?: string; prezzo_base_vendita?: number | null; unit_of_measure?: string | null } | null;
          if (m?.prezzo_base_vendita != null) {
            prezzo = Number(m.prezzo_base_vendita);
            familyId = m.id ?? null;
            if (!unita && m.unit_of_measure) unita = m.unit_of_measure;
          } else {
            prezzo = 0;
            senzaPrezzo.push(descrizione.slice(0, 60));
          }
        }
        totale += prezzo * quantita;
        items.push({
          quote_id: quote.id,
          company_id: ctx.companyId,
          name: descrizione.slice(0, 200),
          description: descrizione,
          quantity: quantita,
          unit_price: prezzo,
          vat_rate: ivaDefault,
          unit_of_measure: unita,
          item_type: ["product", "service", "labor"].includes(String(r.tipo)) ? String(r.tipo) : "product",
          sort_order: sort++,
          ...(familyId ? { family_id: familyId } : {}),
        });
      }
      if (items.length > 0) {
        const { error: iErr } = await ctx.supabase.from("quote_items").insert(items);
        if (iErr) {
          // Niente righe → la bozza resta ma vuota: meglio dirlo chiaramente.
          return { error: `Preventivo ${quote.quote_number} creato ma righe NON salvate: ${iErr.message}. Aprilo nel builder e reinserisci le voci.`, quote_id: quote.id };
        }
      }
      return {
        quote_id: quote.id,
        quote_number: quote.quote_number,
        righe_create: items.length,
        totale_imponibile_stimato: Math.round(totale * 100) / 100,
        righe_senza_prezzo: senzaPrezzo,
        link: `/azienda/marketing/preventivi/${quote.id}/modifica`,
        nota: senzaPrezzo.length > 0
          ? `BOZZA creata. ${senzaPrezzo.length} righe senza prezzo (nessun match a listino): completale nel builder.`
          : "BOZZA creata: rifiniscila e inviala dal builder. Nulla è stato mandato al cliente.",
      };
    },
    allowedRoles: ["super_admin", "company_admin", "company_staff", "salesperson"],
    allowedPersonas: ["silvio", "assistente_imprenditore", "titolare", "sales"],
    allowedChannels: ["internal_chat", "web_persona", "mobile"],
    riskLevel: "safe",
    domain: "preventivi",
  },

  // ═════════════════════════════════════════════════════════════════════════
  // MP-DDT-CHAT — Registra un DDT fornitore caricato in chat (PDF/foto)
  // Riusa la pipeline provata (email_documento_estratto + buildDdtCarico →
  // bozza email_ddt_carico) che il titolare conferma nel pannello "DDT da
  // registrare" (Regia). Giacenza MAI toccata senza conferma umana. Chat-only:
  // il path WhatsApp ha già il suo tool carica_ddt e resta INTATTO.
  // ═════════════════════════════════════════════════════════════════════════
  carica_ddt: {
    schema: {
      type: "function",
      function: {
        name: "carica_ddt",
        description:
          "Registra un DDT/bolla di consegna FORNITORE caricato in chat (PDF o foto). Estrae numero, fornitore, data e le RIGHE (descrizione, codice, quantità, unità), cerca l'ordine d'acquisto del fornitore, confronta le quantità consegnate con quelle ordinate e prepara una BOZZA di carico che il titolare conferma nel pannello 'DDT da registrare'. La giacenza NON viene toccata finché il titolare non conferma. Chiamalo SOLO dopo aver mostrato all'utente i dati estratti (numero, fornitore, righe) e averne ottenuto conferma. Servono almeno il fornitore e una o più righe leggibili. NON usarlo per fatture o preventivi.",
        parameters: {
          type: "object",
          properties: {
            numero_ddt: { type: "string", description: "Numero del DDT, se leggibile" },
            fornitore: { type: "string", description: "Ragione sociale del fornitore — OBBLIGATORIO" },
            data_ddt: { type: "string", description: "Data DDT in formato YYYY-MM-DD (o gg/mm/aaaa) se leggibile" },
            righe: {
              type: "array",
              description: "Righe articolo del DDT — almeno una",
              items: {
                type: "object",
                properties: {
                  descrizione: { type: "string" },
                  codice: { type: "string", description: "Codice articolo/SKU se presente" },
                  quantita: { type: "number" },
                  unita_misura: { type: "string" },
                },
                required: ["descrizione"],
              },
            },
            riferimento_ordine: { type: "string", description: "Numero ordine d'acquisto citato sul DDT (es. 'Rif. Vs ordine 2025/128'), se presente" },
            note: { type: "string" },
          },
          required: ["fornitore", "righe"],
        },
      },
    },
    executor: async (args, ctx) => {
      const numero = (args?.numero_ddt ?? "").toString().trim();
      const fornitore = (args?.fornitore ?? "").toString().trim();
      if (!fornitore) return { error: "Mi serve la ragione sociale del fornitore per registrare il DDT." };
      const righeArg: any[] = Array.isArray(args?.righe) ? args.righe : [];
      if (righeArg.length === 0) {
        return { error: "Non vedo righe articolo leggibili nel DDT. Caricane uno più nitido (meglio un PDF) oppure registralo a mano nel gestionale." };
      }
      // Normalizza data libera (gg/mm/aaaa o aaaa-mm-gg) → ISO YYYY-MM-DD.
      const toIso = (raw?: string): string | null => {
        if (!raw) return null;
        const s = raw.toString().trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        const m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
        if (m) { const [, d, mo, y] = m; const yyyy = y.length === 2 ? `20${y}` : y; return `${yyyy}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`; }
        return null;
      };
      const dataIso = toIso(args?.data_ddt);
      // Match fornitore (suppliers per ragione sociale).
      let fornitoreMatchId: string | null = null;
      try {
        const { data: sup } = await ctx.supabase
          .from("suppliers").select("id")
          .eq("company_id", ctx.companyId).ilike("name", fornitore).limit(1).maybeSingle();
        fornitoreMatchId = sup?.id ?? null;
      } catch { fornitoreMatchId = null; }
      // Campi canonici (schema MP-06) attesi da buildDdtCarico.
      const campi: Record<string, unknown> = {
        numero: { valore: numero || null, conf: numero ? 0.8 : 0.3 },
        data: { valore: dataIso, conf: dataIso ? 0.7 : 0.2 },
        fornitore_ragione_sociale: { valore: fornitore, conf: 0.8 },
        riferimento_ordine: { valore: args?.riferimento_ordine ? args.riferimento_ordine.toString().trim() : null, conf: args?.riferimento_ordine ? 0.6 : 0.0 },
        righe: righeArg.map((r: any) => ({
          descrizione: (r?.descrizione ?? "").toString().trim(),
          codice: r?.codice ? r.codice.toString().trim() : null,
          qta: typeof r?.quantita === "number" ? r.quantita : null,
          unita_misura: r?.unita_misura ? r.unita_misura.toString().trim() : null,
        })),
        note_libere: args?.note ?? null,
        sorgente: "silvio_chat",
      };
      // Documento estratto (email_id NULL = sorgente non-email → pannello Regia).
      const { data: doc, error: docErr } = await ctx.supabase
        .from("email_documento_estratto")
        .insert({
          company_id: ctx.companyId,
          email_id: null,
          attachment_id: null,
          tipo: "ddt",
          confidenza_tipo: 0.8,
          campi,
          dati_incerti: [],
          note: args?.note ?? null,
          stato: "da_confermare",
          fornitore_match_id: fornitoreMatchId,
          fornitore_match_tipo: fornitoreMatchId ? "supplier" : null,
          iban_alert: false,
          created_by: ctx.userId,
        })
        .select("id, company_id, email_id, campi, fornitore_match_id")
        .single();
      if (docErr || !doc) return { error: `Errore salvando il DDT: ${docErr?.message ?? "insert non riuscita"}` };
      // Bozza di carico (match ODA + confronto righe) — helper condiviso.
      let caricoOk = false, ordineCollegato = false, scostamenti = 0; let caricoId: string | null = null;
      try {
        const carico = await buildDdtCarico(ctx.supabase, {
          id: doc.id, company_id: doc.company_id, email_id: doc.email_id,
          campi: (doc.campi ?? {}) as Record<string, unknown>, fornitore_match_id: doc.fornitore_match_id,
        }, ctx.userId);
        if (carico.ok) { caricoOk = true; ordineCollegato = !!carico.ordine_collegato; scostamenti = carico.scostamenti ?? 0; caricoId = carico.carico?.id ?? null; }
      } catch { /* bozza non generata: il documento resta comunque da confermare in Regia */ }
      return {
        ok: true,
        documento_estratto_id: doc.id,
        carico_id: caricoId,
        numero_ddt: numero || null,
        fornitore,
        fornitore_riconosciuto: !!fornitoreMatchId,
        ordine_collegato: caricoOk ? ordineCollegato : false,
        scostamenti: caricoOk ? scostamenti : null,
        message: caricoOk
          ? `DDT ${numero ? "#" + numero : ""} di ${fornitore} registrato come BOZZA${ordineCollegato ? " (ordine collegato)" : " (nessun ordine collegato)"}${scostamenti > 0 ? `, ${scostamenti} righe con scostamento da verificare` : ", quantità coerenti"}. Confermalo in 'DDT da registrare' (Regia) per aggiornare la giacenza.`
          : `DDT ${numero ? "#" + numero : ""} di ${fornitore} salvato come bozza. Completa il carico in 'DDT da registrare' (Regia).`,
      };
    },
    allowedRoles: ["super_admin", "company_admin"],
    allowedPersonas: ["silvio", "assistente_imprenditore", "titolare"],
    allowedChannels: ["internal_chat", "web_persona", "mobile"],
    riskLevel: "safe",
    domain: "filiera",
  },

  // ═════════════════════════════════════════════════════════════════════════
  // MP-FATT-PASSIVA-CHAT — Registra una fattura PASSIVA (fornitore) da chat.
  // Crea documento estratto (tipo='fattura') + BOZZA di scadenza (uscita) che il
  // titolare conferma nello Scadenzario → voce previsionale nel cashflow. NON
  // tocca la fatturazione fiscale/SDI. Chat-only; staging con conferma umana.
  // ═════════════════════════════════════════════════════════════════════════
  registra_fattura_passiva: {
    schema: {
      type: "function",
      function: {
        name: "registra_fattura_passiva",
        description:
          "Registra una FATTURA PASSIVA (ricevuta da un FORNITORE) caricata in chat (PDF/foto): estrae fornitore, numero, data, imponibile/IVA/totale e SCADENZA di pagamento, e prepara una BOZZA di scadenza che il titolare conferma nello Scadenzario (diventa una voce previsionale di uscita nel cashflow). NON registra la fattura fiscale (quella elettronica arriva da SDI) e NON paga nulla. Chiamalo SOLO dopo aver mostrato all'utente i dati estratti e averne ottenuto conferma. Servono almeno il fornitore e l'importo totale. NON usarlo per i DDT (usa carica_ddt), per i preventivi, né per le fatture ATTIVE emesse dall'azienda.",
        parameters: {
          type: "object",
          properties: {
            fornitore: { type: "string", description: "Ragione sociale del fornitore — OBBLIGATORIO" },
            numero: { type: "string", description: "Numero fattura, se leggibile" },
            data: { type: "string", description: "Data fattura YYYY-MM-DD (o gg/mm/aaaa)" },
            imponibile: { type: "number", description: "Imponibile (senza IVA), se leggibile" },
            iva: { type: "number", description: "Importo IVA, se leggibile" },
            totale: { type: "number", description: "Totale documento (imponibile + IVA) — OBBLIGATORIO" },
            scadenza: { type: "string", description: "Data di scadenza pagamento YYYY-MM-DD; se assente usa la data fattura" },
            iban: { type: "string", description: "IBAN del fornitore riportato in fattura, se presente" },
            note: { type: "string" },
          },
          required: ["fornitore", "totale"],
        },
      },
    },
    executor: async (args, ctx) => {
      const fornitore = (args?.fornitore ?? "").toString().trim();
      if (!fornitore) return { error: "Mi serve la ragione sociale del fornitore per registrare la fattura." };
      const totale = typeof args?.totale === "number" ? args.totale : parseFloat(String(args?.totale ?? "").replace(/\./g, "").replace(",", "."));
      if (!totale || isNaN(totale) || totale <= 0) return { error: "Mi serve l'importo totale della fattura (numero positivo)." };
      const toIso = (raw?: string): string | null => {
        if (!raw) return null;
        const s = raw.toString().trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        const m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
        if (m) { const [, d, mo, y] = m; const yyyy = y.length === 2 ? `20${y}` : y; return `${yyyy}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`; }
        return null;
      };
      const dataIso = toIso(args?.data);
      const scadenzaIso = toIso(args?.scadenza) ?? dataIso ?? new Date().toISOString().slice(0, 10);
      const ibanRaw = args?.iban ? args.iban.toString().trim() : null;
      // Match fornitore (suppliers per ragione sociale).
      let fornitoreMatchId: string | null = null;
      try {
        const { data: sup } = await ctx.supabase
          .from("suppliers").select("id").eq("company_id", ctx.companyId).ilike("name", fornitore).limit(1).maybeSingle();
        fornitoreMatchId = sup?.id ?? null;
      } catch { fornitoreMatchId = null; }
      const campi: Record<string, unknown> = {
        numero: { valore: args?.numero ? args.numero.toString().trim() : null, conf: args?.numero ? 0.7 : 0.0 },
        data: { valore: dataIso, conf: dataIso ? 0.7 : 0.2 },
        fornitore_ragione_sociale: { valore: fornitore, conf: 0.8 },
        imponibile: { valore: typeof args?.imponibile === "number" ? args.imponibile : null },
        iva: { valore: typeof args?.iva === "number" ? args.iva : null },
        totale: { valore: totale, conf: 0.8 },
        scadenza: { valore: scadenzaIso, conf: args?.scadenza ? 0.6 : 0.2 },
        iban: { valore: ibanRaw },
        note_libere: args?.note ?? null,
        sorgente: "silvio_chat",
      };
      const { data: doc, error: docErr } = await ctx.supabase
        .from("email_documento_estratto")
        .insert({
          company_id: ctx.companyId, email_id: null, attachment_id: null, tipo: "fattura", confidenza_tipo: 0.8,
          campi, dati_incerti: [], note: args?.note ?? null, stato: "da_confermare",
          fornitore_match_id: fornitoreMatchId, fornitore_match_tipo: fornitoreMatchId ? "supplier" : null,
          iban_estratto: ibanRaw, iban_alert: false, created_by: ctx.userId,
        })
        .select("id").single();
      if (docErr || !doc) return { error: `Errore salvando la fattura: ${docErr?.message ?? "insert non riuscita"}` };
      // Bozza di scadenza (uscita = passiva) — confermabile nello Scadenzario.
      const descr = `${fornitore} — ${args?.numero ? args.numero.toString().trim() : "fattura"}`.trim();
      const { data: bozza, error: bzErr } = await ctx.supabase
        .from("email_scadenza_bozza")
        .insert({
          company_id: ctx.companyId, email_id: null, documento_estratto_id: doc.id,
          direzione: "uscita", amount: totale, due_date: scadenzaIso, descrizione: descr,
          controparte_id: fornitoreMatchId, controparte_tipo: fornitoreMatchId ? "supplier" : null,
          stato: "bozza", created_by: ctx.userId,
        })
        .select("id").single();
      if (bzErr) {
        return { ok: true, documento_estratto_id: doc.id, bozza_scadenza_id: null, fornitore, totale,
          message: `Fattura di ${fornitore} salvata, ma non sono riuscito a creare la bozza di scadenza (${bzErr.message}). Verifica nello Scadenzario.` };
      }
      return {
        ok: true,
        documento_estratto_id: doc.id,
        bozza_scadenza_id: bozza?.id ?? null,
        fornitore,
        totale,
        scadenza: scadenzaIso,
        fornitore_riconosciuto: !!fornitoreMatchId,
        message:
          `Fattura passiva di ${fornitore} (€ ${totale.toFixed(2)}${scadenzaIso ? `, scadenza ${scadenzaIso}` : ""}) salvata come BOZZA di scadenza. ` +
          `Confermala nello Scadenzario → "Da registrare" per inserirla tra le uscite previste.` +
          (ibanRaw ? ` Ho letto un IBAN: verifica che sia quello corretto del fornitore prima di pagare.` : ""),
      };
    },
    allowedRoles: ["super_admin", "company_admin"],
    allowedPersonas: ["silvio", "assistente_imprenditore", "titolare"],
    allowedChannels: ["internal_chat", "web_persona", "mobile"],
    riskLevel: "safe",
    domain: "fattura",
  },

  // ═════════════════════════════════════════════════════════════════════════
  // MP-SALES-01 — Lead First-Touch < 60s
  // ═════════════════════════════════════════════════════════════════════════

  crea_lead_first_touch: {
    schema: {
      type: "function",
      function: {
        name: "crea_lead_first_touch",
        description: "Acquisisce un nuovo lead da qualsiasi canale (Meta/Google/TikTok ads, form sito, WhatsApp, missed call, email). Idempotente: se stesso contatto+source entro 1h → ritorna duplicate. AI agent prenderà contatto entro 60s via canale appropriato.",
        parameters: {
          type: "object",
          properties: {
            source_channel: { type: "string", enum: ["meta_lead_ads","google_ads","tiktok_lead","linkedin","website_form","whatsapp_inbound","telegram_inbound","missed_call","email_inbound","referral"] },
            contact_name: { type: "string" },
            contact_phone: { type: "string" },
            contact_email: { type: "string" },
            contact_address: { type: "string" },
            vertical_interest: { type: "string", description: "Es. 'serramentisti', 'tetti', 'bagni'" },
            source_campaign: { type: "string" },
            source_landing_url: { type: "string" },
            raw_payload: { type: "object", description: "Payload originale del webhook/form" },
          },
          required: ["source_channel"],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_crea_lead_first_touch", {
      p_company_id: ctx.companyId,
      p_user_id: ctx.userId,
      p_source_channel: args?.source_channel,
      p_contact_name: args?.contact_name ?? null,
      p_contact_phone: args?.contact_phone ?? null,
      p_contact_email: args?.contact_email ?? null,
      p_contact_address: args?.contact_address ?? null,
      p_vertical_interest: args?.vertical_interest ?? null,
      p_source_campaign: args?.source_campaign ?? null,
      p_source_landing_url: args?.source_landing_url ?? null,
      p_raw_payload: args?.raw_payload ?? {},
    }),
    allowedRoles: ["super_admin", "company_admin", "salesperson"],
    allowedPersonas: ["silvio", "sales", "direttore_vendite", "*"],
    allowedChannels: ["internal_chat", "web_persona", "whatsapp", "telegram", "email", "api", "cron"],
    riskLevel: "safe",
    domain: "crm",
  },

  lista_lead_first_touch: {
    schema: {
      type: "function",
      function: {
        name: "lista_lead_first_touch",
        description: "Dashboard KPI lead first-touch: conteggio + SLA met (target <60s) + outcomes (qualified, appointments, passed_to_human). Filtro per outcome + giorni recenti.",
        parameters: {
          type: "object",
          properties: {
            days_back: { type: "integer", minimum: 1, maximum: 180, default: 30 },
            outcome_filter: { type: "string" },
          },
          required: [],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_lista_lead_first_touch", {
      p_company_id: ctx.companyId,
      p_user_id: ctx.userId,
      p_days_back: args?.days_back ?? 30,
      p_outcome_filter: args?.outcome_filter ?? null,
    }),
    allowedRoles: ["super_admin", "company_admin", "salesperson"],
    allowedPersonas: ["silvio", "sales", "direttore_vendite", "direttore_marketing", "assistente_imprenditore"],
    allowedChannels: ["internal_chat", "web_persona", "mobile"],
    riskLevel: "safe",
    domain: "crm",
  },

  chiudi_lead_first_touch: {
    schema: {
      type: "function",
      function: {
        name: "chiudi_lead_first_touch",
        description: "Imposta outcome finale di un lead first-touch (qualified_appointment_booked, qualified_passed_to_human, unqualified, no_response, spam, duplicate). Opzionale: appointment_at + passed_to_user_id.",
        parameters: {
          type: "object",
          properties: {
            run_id: { type: "string" },
            outcome: { type: "string", enum: ["qualified_appointment_booked","qualified_passed_to_human","unqualified","no_response","spam","duplicate"] },
            appointment_at: { type: "string", description: "ISO8601 timestamp" },
            passed_to_user_id: { type: "string" },
          },
          required: ["run_id", "outcome"],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_chiudi_lead_first_touch", {
      p_run_id: args?.run_id,
      p_company_id: ctx.companyId,
      p_outcome: args?.outcome,
      p_appointment_at: args?.appointment_at ?? null,
      p_passed_to_user_id: args?.passed_to_user_id ?? null,
    }),
    allowedRoles: ["super_admin", "company_admin", "salesperson"],
    allowedPersonas: ["silvio", "sales", "direttore_vendite"],
    allowedChannels: ["internal_chat", "web_persona", "mobile"],
    riskLevel: "safe",
    domain: "crm",
  },

  // ═════════════════════════════════════════════════════════════════════════
  // MP-SALES-03 — Win-back Clienti Dormienti
  // ═════════════════════════════════════════════════════════════════════════

  identify_dormant_customers: {
    schema: {
      type: "function",
      function: {
        name: "identify_dormant_customers",
        description: "Identifica clienti dormienti (nessun ordine ultimi N giorni, opt-in valido, no winback recente). Calcola dormancy_score basato su LTV + storico orders + recenza ottimale.",
        parameters: {
          type: "object",
          properties: {
            threshold_days: { type: "integer", minimum: 30, maximum: 730, default: 180 },
            top_n: { type: "integer", minimum: 1, maximum: 200, default: 50 },
          },
          required: [],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_identify_dormant_customers", {
      p_company_id: ctx.companyId,
      p_user_id: ctx.userId,
      p_threshold_days: args?.threshold_days ?? 180,
      p_top_n: args?.top_n ?? 50,
    }),
    allowedRoles: ["super_admin", "company_admin", "salesperson"],
    allowedPersonas: ["silvio", "sales", "direttore_vendite", "direttore_marketing", "cliente_tutor"],
    allowedChannels: ["internal_chat", "web_persona", "mobile", "cron"],
    riskLevel: "safe",
    domain: "crm",
  },

  crea_winback_draft: {
    schema: {
      type: "function",
      function: {
        name: "crea_winback_draft",
        description: "Crea bozza campagna winback per cliente dormiente (status='draft' → review obbligatoria). Include AI analysis + offer summary + offered_products + messaggio pronto. Verifica opt-out cliente automaticamente (GDPR).",
        parameters: {
          type: "object",
          properties: {
            customer_id: { type: "string" },
            dormancy_days: { type: "integer" },
            dormancy_score: { type: "number" },
            customer_ltv_eur: { type: "number" },
            customer_orders_count: { type: "integer" },
            ai_analysis: { type: "string", description: "Ragionamento AI su cosa proporre" },
            ai_offer_summary: { type: "string", description: "Sintesi offerta (max 200 char)" },
            offered_products: { type: "array", items: { type: "object" } },
            ai_message: { type: "string", description: "Messaggio personalizzato pronto" },
            ai_cost_billed_eur: { type: "number" },
            channel: { type: "string", enum: ["email","whatsapp","sms","phone_call","letter","telegram"], default: "email" },
          },
          required: ["customer_id", "dormancy_days", "ai_analysis", "ai_offer_summary", "ai_message"],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_crea_winback_draft", {
      p_company_id: ctx.companyId,
      p_user_id: ctx.userId,
      p_customer_id: args?.customer_id,
      p_dormancy_days: args?.dormancy_days,
      p_dormancy_score: args?.dormancy_score ?? null,
      p_customer_ltv_eur: args?.customer_ltv_eur ?? null,
      p_customer_orders_count: args?.customer_orders_count ?? null,
      p_ai_analysis: args?.ai_analysis,
      p_ai_offer_summary: args?.ai_offer_summary,
      p_offered_products: args?.offered_products ?? [],
      p_ai_message: args?.ai_message,
      p_ai_cost_billed_eur: args?.ai_cost_billed_eur ?? null,
      p_channel: args?.channel ?? "email",
    }),
    allowedRoles: ["super_admin", "company_admin", "salesperson"],
    allowedPersonas: ["silvio", "sales", "direttore_vendite", "cliente_tutor"],
    allowedChannels: ["internal_chat", "web_persona", "cron"],
    riskLevel: "yellow",
    domain: "crm",
    estimatedCostEur: 0.06,
  },

  lista_winback_campaigns: {
    schema: {
      type: "function",
      function: {
        name: "lista_winback_campaigns",
        description: "Lista campagne winback con KPI: count totale, draft, sent, converted. Per UI dashboard sales.",
        parameters: {
          type: "object",
          properties: {
            status_filter: { type: "string" },
          },
          required: [],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_lista_winback_campaigns", {
      p_company_id: ctx.companyId,
      p_user_id: ctx.userId,
      p_status_filter: args?.status_filter ?? null,
    }),
    allowedRoles: ["super_admin", "company_admin", "salesperson"],
    allowedPersonas: ["silvio", "sales", "direttore_vendite", "direttore_marketing", "assistente_imprenditore"],
    allowedChannels: ["internal_chat", "web_persona", "mobile"],
    riskLevel: "safe",
    domain: "crm",
  },

  // ═════════════════════════════════════════════════════════════════════════
  // MP-COMP-03 — Subappaltatore Compliance Unificato
  // ═════════════════════════════════════════════════════════════════════════

  lista_subappaltatori_compliance: {
    schema: {
      type: "function",
      function: {
        name: "lista_subappaltatori_compliance",
        description: "Lista subappaltatori con compliance_score (DURC + visura + DVR + POS + SOA + polizza RC + Cassa Edile). Filtro `only_non_compliant=true` per vedere solo quelli a rischio.",
        parameters: {
          type: "object",
          properties: {
            only_non_compliant: { type: "boolean", default: false },
          },
          required: [],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_lista_subappaltatori_compliance", {
      p_company_id: ctx.companyId,
      p_user_id: ctx.userId,
      p_only_non_compliant: args?.only_non_compliant === true,
    }),
    allowedRoles: ["super_admin", "company_admin"],
    allowedPersonas: ["silvio", "compliance", "amministrazione", "pm_cantiere", "assistente_imprenditore"],
    allowedChannels: ["internal_chat", "web_persona", "mobile"],
    riskLevel: "safe",
    domain: "compliance",
  },

  archivia_documento_subappaltatore: {
    schema: {
      type: "function",
      function: {
        name: "archivia_documento_subappaltatore",
        description: "Archivia documento subappaltatore (DURC/visura/DVR/POS/SOA/polizza RC/Cassa Edile). Trigger automatico marca i precedenti dello stesso tipo come superseded.",
        parameters: {
          type: "object",
          properties: {
            subappaltatore_id: { type: "string" },
            tipo: { type: "string", enum: ["durc","visura","dvr","pos","soa","polizza_rc","cassa_edile","antimafia","iscrizione_albo","formazione_operai","altro"] },
            data_emissione: { type: "string", description: "YYYY-MM-DD" },
            scadenza: { type: "string", description: "YYYY-MM-DD" },
            storage_path: { type: "string" },
            numero_protocollo: { type: "string" },
            esito: { type: "string", enum: ["regolare","irregolare","in_attesa","valid","expired","errore"] },
            ai_extracted_data: { type: "object" },
          },
          required: ["subappaltatore_id", "tipo", "data_emissione", "scadenza"],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_archivia_documento_subappaltatore", {
      p_company_id: ctx.companyId,
      p_user_id: ctx.userId,
      p_subappaltatore_id: args?.subappaltatore_id,
      p_tipo: args?.tipo,
      p_data_emissione: args?.data_emissione,
      p_scadenza: args?.scadenza,
      p_storage_path: args?.storage_path ?? null,
      p_numero_protocollo: args?.numero_protocollo ?? null,
      p_esito: args?.esito ?? null,
      p_ai_extracted_data: args?.ai_extracted_data ?? null,
    }),
    allowedRoles: ["super_admin", "company_admin"],
    allowedPersonas: ["silvio", "compliance", "amministrazione"],
    allowedChannels: ["internal_chat", "web_persona", "mobile"],
    riskLevel: "safe",
    domain: "compliance",
  },

  lista_documenti_in_scadenza: {
    schema: {
      type: "function",
      function: {
        name: "lista_documenti_in_scadenza",
        description: "Lista documenti subappaltatori in scadenza nei prossimi N giorni (default 30). Include scaduti e in_scadenza.",
        parameters: {
          type: "object",
          properties: {
            days_ahead: { type: "integer", minimum: 1, maximum: 365, default: 30 },
          },
          required: [],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_lista_documenti_in_scadenza", {
      p_company_id: ctx.companyId,
      p_user_id: ctx.userId,
      p_days_ahead: args?.days_ahead ?? 30,
    }),
    allowedRoles: ["super_admin", "company_admin"],
    allowedPersonas: ["silvio", "compliance", "amministrazione", "pm_cantiere"],
    allowedChannels: ["internal_chat", "web_persona", "mobile", "telegram"],
    riskLevel: "safe",
    domain: "compliance",
  },

  richiedi_rinnovo_documento: {
    schema: {
      type: "function",
      function: {
        name: "richiedi_rinnovo_documento",
        description: "Registra richiesta rinnovo documento subappaltatore (con timestamp). Genera follow-up email/WhatsApp.",
        parameters: {
          type: "object",
          properties: {
            doc_id: { type: "string" },
            deadline: { type: "string", description: "YYYY-MM-DD entro cui ricevere il nuovo documento" },
          },
          required: ["doc_id"],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_richiedi_rinnovo_documento", {
      p_company_id: ctx.companyId,
      p_user_id: ctx.userId,
      p_doc_id: args?.doc_id,
      p_deadline: args?.deadline ?? null,
    }),
    allowedRoles: ["super_admin", "company_admin"],
    allowedPersonas: ["silvio", "compliance", "amministrazione"],
    allowedChannels: ["internal_chat", "web_persona", "mobile"],
    riskLevel: "yellow",
    domain: "compliance",
  },

  // ═════════════════════════════════════════════════════════════════════════
  // MP-FAT-04 — Cashflow Forecast 90gg con Scenari
  // ═════════════════════════════════════════════════════════════════════════

  get_cashflow_forecast_scenarios: {
    schema: {
      type: "function",
      function: {
        name: "get_cashflow_forecast_scenarios",
        description: "Carica forecast cashflow 90gg con 3 scenari (realistic/best/worst). Include daily_balances, primo giorno a rischio, AI recommendations azioni correttive.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    executor: async (_args, ctx) => callRpc(ctx.supabase, "silvio_tool_get_cashflow_forecast_scenarios", {
      p_company_id: ctx.companyId,
      p_user_id: ctx.userId,
    }),
    allowedRoles: ["super_admin", "company_admin"],
    allowedPersonas: ["silvio", "cfo", "controller", "amministrazione", "assistente_imprenditore"],
    allowedChannels: ["internal_chat", "web_persona", "mobile", "telegram"],
    riskLevel: "safe",
    domain: "banking",
  },

  simula_intervento_cashflow: {
    schema: {
      type: "function",
      function: {
        name: "simula_intervento_cashflow",
        description: "Simula impatto di un intervento sul cashflow: sollecito cliente, posticipo fornitore, anticipo SAL, apertura linea credito.",
        parameters: {
          type: "object",
          properties: {
            intervention_type: { type: "string", enum: ["sollecito_cliente","posticipo_fornitore","apertura_credito","anticipo_sal"] },
            amount: { type: "number" },
            target_date: { type: "string", description: "YYYY-MM-DD" },
            description: { type: "string" },
          },
          required: ["intervention_type", "amount", "target_date"],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_simula_intervento_cashflow", {
      p_company_id: ctx.companyId,
      p_user_id: ctx.userId,
      p_intervention_type: args?.intervention_type,
      p_amount: args?.amount,
      p_target_date: args?.target_date,
      p_description: args?.description ?? null,
    }),
    allowedRoles: ["super_admin", "company_admin"],
    allowedPersonas: ["silvio", "cfo", "controller", "amministrazione"],
    allowedChannels: ["internal_chat", "web_persona", "mobile"],
    riskLevel: "safe",
    domain: "banking",
  },

  save_cashflow_snapshot: {
    schema: {
      type: "function",
      function: {
        name: "save_cashflow_snapshot",
        description: "[INTERNAL] Salva snapshot forecast cashflow giornaliero. Chiamato da edge ai-cashflow-forecast-builder.",
        parameters: {
          type: "object",
          properties: {
            scenario: { type: "string", enum: ["realistic","best","worst"] },
            starting_balance_eur: { type: "number" },
            daily_balances: { type: "array" },
            min_balance_eur: { type: "number" },
            min_balance_date: { type: "string" },
            max_balance_eur: { type: "number" },
            risk_days_count: { type: "integer" },
            risk_days_list: { type: "array" },
            first_risk_date: { type: "string" },
            ai_recommendations: { type: "array" },
            ai_cost_billed_eur: { type: "number" },
            ai_confidence: { type: "number" },
          },
          required: ["scenario", "starting_balance_eur", "daily_balances"],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_save_cashflow_snapshot", {
      p_company_id: ctx.companyId,
      p_scenario: args?.scenario,
      p_starting_balance_eur: args?.starting_balance_eur,
      p_daily_balances: args?.daily_balances,
      p_min_balance_eur: args?.min_balance_eur,
      p_min_balance_date: args?.min_balance_date ?? null,
      p_max_balance_eur: args?.max_balance_eur,
      p_risk_days_count: args?.risk_days_count ?? 0,
      p_risk_days_list: args?.risk_days_list ?? [],
      p_first_risk_date: args?.first_risk_date ?? null,
      p_ai_recommendations: args?.ai_recommendations ?? [],
      p_ai_cost_billed_eur: args?.ai_cost_billed_eur ?? null,
      p_ai_confidence: args?.ai_confidence ?? null,
    }),
    allowedRoles: ["super_admin"],
    allowedPersonas: ["silvio", "cfo"],
    allowedChannels: ["internal_chat", "cron"],
    riskLevel: "safe",
    domain: "banking",
  },

  // ═════════════════════════════════════════════════════════════════════════
  // MP-HR-02 — Cedolini + Presenze + Assenze
  // ═════════════════════════════════════════════════════════════════════════

  calcola_ore_mese_dipendente: {
    schema: {
      type: "function",
      function: {
        name: "calcola_ore_mese_dipendente",
        description: "Aggrega ore assenze (ferie/malattia/permessi/legge 104) per dipendente in un mese specifico. Per ore lavorate effettive integrare con rapportini.",
        parameters: {
          type: "object",
          properties: {
            employee_id: { type: "string" },
            year: { type: "integer" },
            month: { type: "integer", minimum: 1, maximum: 12 },
          },
          required: ["employee_id", "year", "month"],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_calcola_ore_mese_dipendente", {
      p_company_id: ctx.companyId,
      p_user_id: ctx.userId,
      p_employee_id: args?.employee_id,
      p_year: args?.year,
      p_month: args?.month,
    }),
    allowedRoles: ["super_admin", "company_admin"],
    allowedPersonas: ["silvio", "hr", "amministrazione"],
    allowedChannels: ["internal_chat", "web_persona", "mobile"],
    riskLevel: "safe",
    domain: "hr",
  },

  genera_cedolino_dipendente: {
    schema: {
      type: "function",
      function: {
        name: "genera_cedolino_dipendente",
        description: "Genera cedolino mensile per dipendente. Idempotente per (employee, anno, mese). Yellow → richiede revisione consulente del lavoro prima invio.",
        parameters: {
          type: "object",
          properties: {
            employee_id: { type: "string" },
            year: { type: "integer" },
            month: { type: "integer", minimum: 1, maximum: 12 },
            force_regenerate: { type: "boolean", default: false },
          },
          required: ["employee_id", "year", "month"],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_genera_cedolino_dipendente", {
      p_company_id: ctx.companyId,
      p_user_id: ctx.userId,
      p_employee_id: args?.employee_id,
      p_year: args?.year,
      p_month: args?.month,
      p_force_regenerate: args?.force_regenerate === true,
    }),
    allowedRoles: ["super_admin", "company_admin"],
    allowedPersonas: ["silvio", "hr", "amministrazione"],
    allowedChannels: ["internal_chat", "web_persona", "mobile", "cron"],
    riskLevel: "yellow",
    domain: "hr",
  },

  lista_cedolini_da_revisionare: {
    schema: {
      type: "function",
      function: {
        name: "lista_cedolini_da_revisionare",
        description: "Lista cedolini auto_ai pending review consulente. Filtro per anno/mese.",
        parameters: {
          type: "object",
          properties: {
            year: { type: "integer" },
            month: { type: "integer" },
          },
          required: [],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_lista_cedolini_da_revisionare", {
      p_company_id: ctx.companyId,
      p_user_id: ctx.userId,
      p_year: args?.year ?? null,
      p_month: args?.month ?? null,
    }),
    allowedRoles: ["super_admin", "company_admin"],
    allowedPersonas: ["silvio", "hr", "amministrazione", "assistente_imprenditore"],
    allowedChannels: ["internal_chat", "web_persona", "mobile"],
    riskLevel: "safe",
    domain: "hr",
  },

  registra_assenza: {
    schema: {
      type: "function",
      function: {
        name: "registra_assenza",
        description: "Registra assenza dipendente (ferie/malattia/infortunio/permesso/legge 104/maternità/sciopero). Status iniziale 'pending', richiede approvazione admin.",
        parameters: {
          type: "object",
          properties: {
            employee_id: { type: "string" },
            data_inizio: { type: "string", description: "YYYY-MM-DD" },
            data_fine: { type: "string", description: "YYYY-MM-DD" },
            tipo_assenza: { type: "string", enum: ["ferie","permesso_retribuito","malattia","infortunio","maternita","congedo_studio","sciopero","permesso_legge_104","rol","altro"] },
            ore_giorno: { type: "number", default: 8 },
            note: { type: "string" },
            giustificativo_path: { type: "string" },
          },
          required: ["employee_id", "data_inizio", "data_fine", "tipo_assenza"],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_registra_assenza", {
      p_company_id: ctx.companyId,
      p_user_id: ctx.userId,
      p_employee_id: args?.employee_id,
      p_data_inizio: args?.data_inizio,
      p_data_fine: args?.data_fine,
      p_tipo_assenza: args?.tipo_assenza,
      p_ore_giorno: args?.ore_giorno ?? 8,
      p_note: args?.note ?? null,
      p_giustificativo_path: args?.giustificativo_path ?? null,
    }),
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
    allowedPersonas: ["silvio", "hr", "*"],
    allowedChannels: ["internal_chat", "web_persona", "mobile", "whatsapp"],
    riskLevel: "yellow",
    domain: "hr",
  },

  // ═════════════════════════════════════════════════════════════════════════
  // MP-OPS-06 — Quality Check Foto Cantiere AI
  // ═════════════════════════════════════════════════════════════════════════

  analizza_qualita_foto: {
    schema: {
      type: "function",
      function: {
        name: "analizza_qualita_foto",
        description: "Salva analisi qualità AI di una foto cantiere: quality/safety/order score 1-10 + detected elements + safety/quality issues + recommendations. Aggiorna anche foto_cantiere campi AI esistenti per back-compat.",
        parameters: {
          type: "object",
          properties: {
            foto_id: { type: "string" },
            quality_score: { type: "number", minimum: 0, maximum: 10 },
            safety_score: { type: "number", minimum: 0, maximum: 10 },
            order_score: { type: "number", minimum: 0, maximum: 10 },
            detected_elements: { type: "object" },
            safety_issues: { type: "array", description: "[{type, severity, description}]" },
            quality_issues: { type: "array" },
            recommendations: { type: "string" },
            ai_model: { type: "string" },
            ai_cost_billed_eur: { type: "number" },
            ai_confidence: { type: "number" },
            vertical_specific_checks: { type: "object" },
          },
          required: ["foto_id"],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_analizza_qualita_foto", {
      p_company_id: ctx.companyId,
      p_user_id: ctx.userId,
      p_foto_id: args?.foto_id,
      p_quality_score: args?.quality_score ?? null,
      p_safety_score: args?.safety_score ?? null,
      p_order_score: args?.order_score ?? null,
      p_detected_elements: args?.detected_elements ?? null,
      p_safety_issues: args?.safety_issues ?? [],
      p_quality_issues: args?.quality_issues ?? [],
      p_recommendations: args?.recommendations ?? null,
      p_ai_model: args?.ai_model ?? null,
      p_ai_cost_billed_eur: args?.ai_cost_billed_eur ?? null,
      p_ai_confidence: args?.ai_confidence ?? null,
      p_vertical_specific_checks: args?.vertical_specific_checks ?? null,
    }),
    allowedRoles: ["super_admin", "company_admin"],
    allowedPersonas: ["silvio", "tecnico", "pm_cantiere", "compliance"],
    allowedChannels: ["internal_chat", "cron", "api"],
    riskLevel: "safe",
    domain: "cantiere",
    estimatedCostEur: 0.10,
  },

  trend_qualita_cantiere: {
    schema: {
      type: "function",
      function: {
        name: "trend_qualita_cantiere",
        description: "Trend qualità foto cantiere ultimi N giorni: avg score, count critical, safety/quality issues totali, trend ultima settimana.",
        parameters: {
          type: "object",
          properties: {
            cantiere_id: { type: "string" },
            period_days: { type: "integer", minimum: 1, maximum: 365, default: 30 },
          },
          required: ["cantiere_id"],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_trend_qualita_cantiere", {
      p_company_id: ctx.companyId,
      p_user_id: ctx.userId,
      p_cantiere_id: args?.cantiere_id,
      p_period_days: args?.period_days ?? 30,
    }),
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
    allowedPersonas: ["silvio", "pm_cantiere", "tecnico", "capocantiere", "assistente_imprenditore"],
    allowedChannels: ["internal_chat", "web_persona", "mobile"],
    riskLevel: "safe",
    domain: "cantiere",
  },

  lista_foto_critical_recenti: {
    schema: {
      type: "function",
      function: {
        name: "lista_foto_critical_recenti",
        description: "Lista foto con critical safety issues rilevate negli ultimi N giorni. Per dashboard alert urgenti.",
        parameters: {
          type: "object",
          properties: {
            days_back: { type: "integer", minimum: 1, maximum: 90, default: 7 },
          },
          required: [],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_lista_foto_critical_recenti", {
      p_company_id: ctx.companyId,
      p_user_id: ctx.userId,
      p_days_back: args?.days_back ?? 7,
    }),
    allowedRoles: ["super_admin", "company_admin"],
    allowedPersonas: ["silvio", "pm_cantiere", "tecnico", "compliance", "assistente_imprenditore"],
    allowedChannels: ["internal_chat", "web_persona", "mobile", "telegram", "whatsapp"],
    riskLevel: "safe",
    domain: "cantiere",
  },

  // ═════════════════════════════════════════════════════════════════════════
  // MP-SALES-04 — Dynamic Pricing Preventivi
  // ═════════════════════════════════════════════════════════════════════════

  storico_pricing_voce: {
    schema: {
      type: "function",
      function: {
        name: "storico_pricing_voce",
        description: "Cerca pricing storico per voce simile (ILIKE descrizione) ultimi N mesi. Ritorna avg/min/max + samples.",
        parameters: {
          type: "object",
          properties: {
            voce_descrizione: { type: "string" },
            months_back: { type: "integer", minimum: 1, maximum: 60, default: 12 },
          },
          required: ["voce_descrizione"],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_storico_pricing_voce", {
      p_company_id: ctx.companyId,
      p_user_id: ctx.userId,
      p_voce_descrizione: args?.voce_descrizione,
      p_months_back: args?.months_back ?? 12,
    }),
    allowedRoles: ["super_admin", "company_admin", "salesperson"],
    allowedPersonas: ["silvio", "sales", "direttore_vendite", "tecnico", "controller"],
    allowedChannels: ["internal_chat", "web_persona", "mobile"],
    riskLevel: "safe",
    domain: "preventivi",
  },

  suggerisci_prezzo_voce: {
    schema: {
      type: "function",
      function: {
        name: "suggerisci_prezzo_voce",
        description: "AI propone prezzo ottimale per voce computo + 3 varianti (economy/standard/premium). Considera storico + costi reali + margine target. Salva audit in pricing_suggestions.",
        parameters: {
          type: "object",
          properties: {
            voce_descrizione: { type: "string" },
            qty: { type: "number" },
            unita_misura: { type: "string" },
            cost_real_eur: { type: "number", description: "Costo unitario reale" },
            customer_id: { type: "string" },
            quote_id: { type: "string" },
            ai_reasoning: { type: "string" },
            ai_confidence: { type: "number" },
            ai_cost_billed_eur: { type: "number" },
          },
          required: ["voce_descrizione", "qty", "unita_misura", "cost_real_eur"],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_suggerisci_prezzo_voce", {
      p_company_id: ctx.companyId,
      p_user_id: ctx.userId,
      p_voce_descrizione: args?.voce_descrizione,
      p_qty: args?.qty,
      p_unita_misura: args?.unita_misura,
      p_cost_real_eur: args?.cost_real_eur,
      p_customer_id: args?.customer_id ?? null,
      p_quote_id: args?.quote_id ?? null,
      p_ai_reasoning: args?.ai_reasoning ?? null,
      p_ai_confidence: args?.ai_confidence ?? null,
      p_ai_cost_billed_eur: args?.ai_cost_billed_eur ?? null,
    }),
    allowedRoles: ["super_admin", "company_admin", "salesperson"],
    allowedPersonas: ["silvio", "sales", "direttore_vendite", "tecnico"],
    allowedChannels: ["internal_chat", "web_persona", "mobile"],
    riskLevel: "safe",
    domain: "preventivi",
    estimatedCostEur: 0.03,
  },

  simula_what_if_pricing: {
    schema: {
      type: "function",
      function: {
        name: "simula_what_if_pricing",
        description: "Simula impatto cambiamento margine (+/- N%) sul totale quote. Utile per aggiustamenti rapidi.",
        parameters: {
          type: "object",
          properties: {
            quote_id: { type: "string" },
            margin_change_pct: { type: "number", description: "Es. +5 = aumenta margine di 5pp; -3 = riduce di 3pp" },
          },
          required: ["quote_id", "margin_change_pct"],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_simula_what_if_pricing", {
      p_company_id: ctx.companyId,
      p_user_id: ctx.userId,
      p_quote_id: args?.quote_id,
      p_margin_change_pct: args?.margin_change_pct,
    }),
    allowedRoles: ["super_admin", "company_admin", "salesperson"],
    allowedPersonas: ["silvio", "sales", "direttore_vendite", "controller"],
    allowedChannels: ["internal_chat", "web_persona", "mobile"],
    riskLevel: "safe",
    domain: "preventivi",
  },

  analizza_storico_pricing_cliente: {
    schema: {
      type: "function",
      function: {
        name: "analizza_storico_pricing_cliente",
        description: "Analizza pattern pricing cliente: variant breakdown, acceptance rate, raccomandazione approccio (price-sensitive vs value-oriented).",
        parameters: {
          type: "object",
          properties: {
            customer_id: { type: "string" },
          },
          required: ["customer_id"],
        },
      },
    },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_analizza_storico_pricing_cliente", {
      p_company_id: ctx.companyId,
      p_user_id: ctx.userId,
      p_customer_id: args?.customer_id,
    }),
    allowedRoles: ["super_admin", "company_admin", "salesperson"],
    allowedPersonas: ["silvio", "sales", "direttore_vendite", "cliente_tutor"],
    allowedChannels: ["internal_chat", "web_persona", "mobile"],
    riskLevel: "safe",
    domain: "preventivi",
  },

  // ═════════════════════════════════════════════════════════════════════════
  // MP-AIE-03 — Action Proposals UI Avanzata (4 tool)
  // ═════════════════════════════════════════════════════════════════════════

  approve_proposal_with_edits: {
    schema: { type: "function", function: { name: "approve_proposal_with_edits", description: "Approva una proposal con payload modificato dall'utente. Salva diff originale vs modificato.", parameters: { type: "object", properties: { proposal_id: { type: "string" }, user_edited_payload: { type: "object" }, edit_reasoning: { type: "string" } }, required: ["proposal_id", "user_edited_payload"] } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_approve_proposal_with_edits", { p_company_id: ctx.companyId, p_proposal_id: args?.proposal_id, p_user_edited_payload: args?.user_edited_payload, p_edit_reasoning: args?.edit_reasoning ?? null }),
    allowedRoles: ["super_admin", "company_admin"],
    allowedPersonas: ["silvio", "*"], allowedChannels: ["web_persona", "internal_chat"], riskLevel: "red", domain: "ai",
  },

  batch_approve_proposals: {
    schema: { type: "function", function: { name: "batch_approve_proposals", description: "Approva in batch multiple proposal pendenti. Crea batch_id condiviso.", parameters: { type: "object", properties: { proposal_ids: { type: "array", items: { type: "string" } } }, required: ["proposal_ids"] } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_batch_approve_proposals", { p_company_id: ctx.companyId, p_proposal_ids: args?.proposal_ids }),
    allowedRoles: ["super_admin", "company_admin"],
    allowedPersonas: ["silvio", "*"], allowedChannels: ["web_persona", "internal_chat"], riskLevel: "red", domain: "ai",
  },

  undo_executed_action: {
    schema: { type: "function", function: { name: "undo_executed_action", description: "Annulla un'azione eseguita entro l'undo window. Solo per azioni reversibili (is_reversible=true).", parameters: { type: "object", properties: { proposal_id: { type: "string" }, reason: { type: "string" } }, required: ["proposal_id"] } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_undo_executed_action", { p_company_id: ctx.companyId, p_proposal_id: args?.proposal_id, p_reason: args?.reason ?? null }),
    allowedRoles: ["super_admin", "company_admin"],
    allowedPersonas: ["silvio", "*"], riskLevel: "yellow", domain: "ai",
  },

  get_proposal_audit_log: {
    schema: { type: "function", function: { name: "get_proposal_audit_log", description: "Ritorna l'audit log completo (created/viewed/edited/approved/rejected/executed/undone) di una proposal.", parameters: { type: "object", properties: { proposal_id: { type: "string" } }, required: ["proposal_id"] } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_get_proposal_audit_log", { p_company_id: ctx.companyId, p_proposal_id: args?.proposal_id }),
    allowedRoles: ["super_admin", "company_admin"],
    allowedPersonas: ["silvio", "compliance", "*"], riskLevel: "safe", domain: "ai",
  },

  // ═════════════════════════════════════════════════════════════════════════
  // MP-COMP-04 — Pratiche Edilizie Workflow (6 tool)
  // ═════════════════════════════════════════════════════════════════════════

  identifica_tipo_pratica: {
    schema: { type: "function", function: { name: "identifica_tipo_pratica", description: "AI suggerisce il tipo di pratica edilizia (CILA/SCIA/PdC) basato su descrizione intervento.", parameters: { type: "object", properties: { tipologia_intervento: { type: "string" }, ubicazione: { type: "string" } }, required: ["tipologia_intervento"] } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_identifica_tipo_pratica", { p_company_id: ctx.companyId, p_tipologia_intervento: args?.tipologia_intervento, p_ubicazione: args?.ubicazione ?? null }),
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
    allowedPersonas: ["silvio", "tecnico", "compliance", "*"], riskLevel: "safe", domain: "compliance",
  },

  checklist_documenti_pratica: {
    schema: { type: "function", function: { name: "checklist_documenti_pratica", description: "Genera checklist documenti per pratica edilizia (CILA/SCIA/PdC).", parameters: { type: "object", properties: { pratica_id: { type: "string" } }, required: ["pratica_id"] } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_checklist_documenti_pratica", { p_company_id: ctx.companyId, p_pratica_id: args?.pratica_id }),
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
    allowedPersonas: ["silvio", "tecnico", "compliance", "*"], riskLevel: "safe", domain: "compliance",
  },

  genera_relazione_tecnica: {
    schema: { type: "function", function: { name: "genera_relazione_tecnica", description: "Avvia generazione AI della relazione tecnica per una pratica edilizia (template_type: standard|superbonus|paesaggistica).", parameters: { type: "object", properties: { pratica_id: { type: "string" }, template_type: { type: "string" } }, required: ["pratica_id"] } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_genera_relazione_tecnica", { p_company_id: ctx.companyId, p_pratica_id: args?.pratica_id, p_template_type: args?.template_type ?? "standard" }),
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
    allowedPersonas: ["silvio", "tecnico", "compliance", "*"], riskLevel: "yellow", domain: "compliance", estimatedCostEur: 0.05,
  },

  verifica_completezza_pratica: {
    schema: { type: "function", function: { name: "verifica_completezza_pratica", description: "Verifica documenti caricati vs richiesti. Ritorna mancanti.", parameters: { type: "object", properties: { pratica_id: { type: "string" } }, required: ["pratica_id"] } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_verifica_completezza_pratica", { p_company_id: ctx.companyId, p_pratica_id: args?.pratica_id }),
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
    allowedPersonas: ["silvio", "tecnico", "compliance", "*"], riskLevel: "safe", domain: "compliance",
  },

  prepara_invio_sue: {
    schema: { type: "function", function: { name: "prepara_invio_sue", description: "Prepara invio pratica al SUE comunale (se completa). Setta scadenza_silenzio_assenso.", parameters: { type: "object", properties: { pratica_id: { type: "string" } }, required: ["pratica_id"] } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_prepara_invio_sue", { p_company_id: ctx.companyId, p_pratica_id: args?.pratica_id }),
    allowedRoles: ["super_admin", "company_admin"],
    allowedPersonas: ["silvio", "tecnico", "compliance"], riskLevel: "red", domain: "compliance",
  },

  monitoraggio_pratica_status: {
    schema: { type: "function", function: { name: "monitoraggio_pratica_status", description: "Lista pratiche edilizie attive con giorni da invio + giorni a silenzio assenso.", parameters: { type: "object", properties: { pratica_id: { type: "string" } } } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_monitoraggio_pratica_status", { p_company_id: ctx.companyId, p_pratica_id: args?.pratica_id ?? null }),
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
    allowedPersonas: ["silvio", "tecnico", "compliance", "pm_cantiere", "*"], riskLevel: "safe", domain: "compliance",
  },

  // ═════════════════════════════════════════════════════════════════════════
  // MP-FAT-05 — Report CFO Settimanale (3 tool)
  // ═════════════════════════════════════════════════════════════════════════

  genera_report_cfo_settimanale: {
    schema: { type: "function", function: { name: "genera_report_cfo_settimanale", description: "Genera report CFO settimanale (skeleton + narrative AI). Idempotente per company+week_start.", parameters: { type: "object", properties: { week_start: { type: "string", format: "date" }, force_regenerate: { type: "boolean" } } } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_genera_report_cfo_settimanale", { p_company_id: ctx.companyId, p_week_start: args?.week_start ?? null, p_force_regenerate: args?.force_regenerate ?? false }),
    allowedRoles: ["super_admin", "company_admin"],
    allowedPersonas: ["silvio", "cfo", "controller", "*"], riskLevel: "safe", domain: "fattura", estimatedCostEur: 0.04,
  },

  invia_report_cfo: {
    schema: { type: "function", function: { name: "invia_report_cfo", description: "Invia report CFO via email/whatsapp. Aggiorna sent_at.", parameters: { type: "object", properties: { report_id: { type: "string" }, channels: { type: "array", items: { type: "string", enum: ["email", "whatsapp"] } } }, required: ["report_id"] } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_invia_report_cfo", { p_company_id: ctx.companyId, p_report_id: args?.report_id, p_channels: args?.channels ?? ["email"] }),
    allowedRoles: ["super_admin", "company_admin"],
    allowedPersonas: ["silvio", "cfo", "controller"], riskLevel: "yellow", domain: "fattura",
  },

  chiedi_riassunto_settimana: {
    schema: { type: "function", function: { name: "chiedi_riassunto_settimana", description: "Recupera l'ultimo report CFO settimanale generato per quick chat.", parameters: { type: "object", properties: {} } } },
    executor: async (_args, ctx) => callRpc(ctx.supabase, "silvio_tool_chiedi_riassunto_settimana", { p_company_id: ctx.companyId }),
    allowedRoles: ["super_admin", "company_admin"],
    allowedPersonas: ["silvio", "cfo", "assistente_imprenditore", "*"], riskLevel: "safe", domain: "fattura",
  },

  // ═════════════════════════════════════════════════════════════════════════
  // MP-FAT-06 — Reportistica Fiscale Auto (5 tool)
  // ═════════════════════════════════════════════════════════════════════════

  genera_lipe_trimestrale: {
    schema: { type: "function", function: { name: "genera_lipe_trimestrale", description: "Genera Liquidazione Periodica IVA trimestrale (LIPE).", parameters: { type: "object", properties: { year: { type: "integer" }, quarter: { type: "integer", minimum: 1, maximum: 4 } }, required: ["year", "quarter"] } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_genera_lipe_trimestrale", { p_company_id: ctx.companyId, p_year: args?.year, p_quarter: args?.quarter }),
    allowedRoles: ["super_admin", "company_admin", "accountant"],
    allowedPersonas: ["silvio", "commercialista", "controller", "cfo", "*"], riskLevel: "yellow", domain: "fattura",
  },

  genera_f24_mese: {
    schema: { type: "function", function: { name: "genera_f24_mese", description: "Genera F24 mensile (ritenute + INPS + IVA).", parameters: { type: "object", properties: { year: { type: "integer" }, month: { type: "integer", minimum: 1, maximum: 12 } }, required: ["year", "month"] } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_genera_f24_mese", { p_company_id: ctx.companyId, p_year: args?.year, p_month: args?.month }),
    allowedRoles: ["super_admin", "company_admin", "accountant"],
    allowedPersonas: ["silvio", "commercialista", "controller", "amministrazione"], riskLevel: "yellow", domain: "fattura",
  },

  genera_cu_anno: {
    schema: { type: "function", function: { name: "genera_cu_anno", description: "Genera Certificazione Unica annuale per dipendenti/collaboratori.", parameters: { type: "object", properties: { year: { type: "integer" } }, required: ["year"] } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_genera_cu_anno", { p_company_id: ctx.companyId, p_year: args?.year }),
    allowedRoles: ["super_admin", "company_admin", "accountant"],
    allowedPersonas: ["silvio", "commercialista", "hr", "amministrazione"], riskLevel: "yellow", domain: "fattura",
  },

  verifica_quadrature_contabili: {
    schema: { type: "function", function: { name: "verifica_quadrature_contabili", description: "Verifica quadrature contabili per periodo (IVA esigibile/detraibile, ritenute).", parameters: { type: "object", properties: { period_start: { type: "string", format: "date" }, period_end: { type: "string", format: "date" } }, required: ["period_start", "period_end"] } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_verifica_quadrature_contabili", { p_company_id: ctx.companyId, p_period_start: args?.period_start, p_period_end: args?.period_end }),
    allowedRoles: ["super_admin", "company_admin", "accountant"],
    allowedPersonas: ["silvio", "commercialista", "controller", "cfo", "*"], riskLevel: "safe", domain: "fattura",
  },

  invia_lipe_ade: {
    schema: { type: "function", function: { name: "invia_lipe_ade", description: "Invia LIPE all'Agenzia Entrate (action red, richiede HITL).", parameters: { type: "object", properties: { report_id: { type: "string" } }, required: ["report_id"] } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_invia_lipe_ade", { p_company_id: ctx.companyId, p_report_id: args?.report_id }),
    allowedRoles: ["super_admin", "company_admin", "accountant"],
    allowedPersonas: ["silvio", "commercialista"], riskLevel: "red", domain: "fattura",
  },

  // ═════════════════════════════════════════════════════════════════════════
  // MP-HR-03 — Allocazione Operai Ottimale (5 tool)
  // ═════════════════════════════════════════════════════════════════════════

  suggerisci_squadra_cantiere: {
    schema: { type: "function", function: { name: "suggerisci_squadra_cantiere", description: "Suggerisce top-N operai per un cantiere/lavorazione basato su skill + productivity score.", parameters: { type: "object", properties: { cantiere_id: { type: "string" }, lavorazione: { type: "string" }, team_size: { type: "integer", default: 3 } }, required: ["cantiere_id"] } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_suggerisci_squadra_cantiere", { p_company_id: ctx.companyId, p_cantiere_id: args?.cantiere_id, p_lavorazione: args?.lavorazione ?? null, p_team_size: args?.team_size ?? 3 }),
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
    allowedPersonas: ["silvio", "pm_cantiere", "hr", "*"], riskLevel: "safe", domain: "hr",
  },

  analizza_competenze_operaio: {
    schema: { type: "function", function: { name: "analizza_competenze_operaio", description: "Skill matrix di un operaio (proficiency, ore, productivity per skill).", parameters: { type: "object", properties: { employee_id: { type: "string" } }, required: ["employee_id"] } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_analizza_competenze_operaio", { p_company_id: ctx.companyId, p_employee_id: args?.employee_id }),
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
    allowedPersonas: ["silvio", "pm_cantiere", "hr", "*"], riskLevel: "safe", domain: "hr",
  },

  aggiorna_skill_da_rapportini: {
    schema: { type: "function", function: { name: "aggiorna_skill_da_rapportini", description: "Aggiorna employee_skills.productivity_score aggregando rapportini periodo.", parameters: { type: "object", properties: { employee_id: { type: "string" }, period_start: { type: "string", format: "date" }, period_end: { type: "string", format: "date" } }, required: ["employee_id"] } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_aggiorna_skill_da_rapportini", { p_company_id: ctx.companyId, p_employee_id: args?.employee_id, p_period_start: args?.period_start ?? null, p_period_end: args?.period_end ?? null }),
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
    allowedPersonas: ["silvio", "hr"], riskLevel: "yellow", domain: "hr",
  },

  top_performer_lavorazione: {
    schema: { type: "function", function: { name: "top_performer_lavorazione", description: "Top-N performer per skill_key.", parameters: { type: "object", properties: { skill_key: { type: "string" }, top_n: { type: "integer", default: 5 } }, required: ["skill_key"] } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_top_performer_lavorazione", { p_company_id: ctx.companyId, p_skill_key: args?.skill_key, p_top_n: args?.top_n ?? 5 }),
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
    allowedPersonas: ["silvio", "pm_cantiere", "hr", "capocantiere", "*"], riskLevel: "safe", domain: "hr",
  },

  analizza_squadra_storia: {
    schema: { type: "function", function: { name: "analizza_squadra_storia", description: "Storia performance squadra (employee_ids → media produttività/qualità).", parameters: { type: "object", properties: { employee_ids: { type: "array", items: { type: "string" } } }, required: ["employee_ids"] } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_analizza_squadra_storia", { p_company_id: ctx.companyId, p_employee_ids: args?.employee_ids }),
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
    allowedPersonas: ["silvio", "pm_cantiere", "hr", "*"], riskLevel: "safe", domain: "hr",
  },

  // ═════════════════════════════════════════════════════════════════════════
  // MP-HR-04 — Sicurezza Operai DPI/Formazione/Visite (6 tool)
  // ═════════════════════════════════════════════════════════════════════════

  stato_sicurezza_operaio: {
    schema: { type: "function", function: { name: "stato_sicurezza_operaio", description: "Stato compliance operaio: formazioni + visite + DPI essenziali.", parameters: { type: "object", properties: { employee_id: { type: "string" } }, required: ["employee_id"] } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_stato_sicurezza_operaio", { p_company_id: ctx.companyId, p_employee_id: args?.employee_id }),
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
    allowedPersonas: ["silvio", "hr", "compliance", "pm_cantiere", "*"], riskLevel: "safe", domain: "hr",
  },

  operai_non_conformi_sicurezza: {
    schema: { type: "function", function: { name: "operai_non_conformi_sicurezza", description: "Lista operai non conformi (formazioni mancanti, visite scadute, DPI assenti).", parameters: { type: "object", properties: {} } } },
    executor: async (_args, ctx) => callRpc(ctx.supabase, "silvio_tool_operai_non_conformi_sicurezza", { p_company_id: ctx.companyId }),
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
    allowedPersonas: ["silvio", "hr", "compliance", "pm_cantiere", "*"], riskLevel: "safe", domain: "hr",
  },

  formazioni_in_scadenza: {
    schema: { type: "function", function: { name: "formazioni_in_scadenza", description: "Formazioni operai in scadenza nei prossimi N giorni.", parameters: { type: "object", properties: { days_ahead: { type: "integer", default: 30 } } } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_formazioni_in_scadenza", { p_company_id: ctx.companyId, p_days_ahead: args?.days_ahead ?? 30 }),
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
    allowedPersonas: ["silvio", "hr", "compliance", "*"], riskLevel: "safe", domain: "hr",
  },

  prenota_formazione_operaio: {
    schema: { type: "function", function: { name: "prenota_formazione_operaio", description: "Registra formazione completata (o pianificata) per operaio.", parameters: { type: "object", properties: { employee_id: { type: "string" }, formation_type: { type: "string" }, ente_erogante: { type: "string" }, data_completamento: { type: "string", format: "date" } }, required: ["employee_id", "formation_type"] } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_prenota_formazione_operaio", { p_company_id: ctx.companyId, p_employee_id: args?.employee_id, p_formation_type: args?.formation_type, p_ente_erogante: args?.ente_erogante ?? null, p_data_completamento: args?.data_completamento ?? null }),
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
    allowedPersonas: ["silvio", "hr", "compliance"], riskLevel: "yellow", domain: "hr",
  },

  genera_modulo_consegna_dpi: {
    schema: { type: "function", function: { name: "genera_modulo_consegna_dpi", description: "Registra consegna DPI per operaio (insert multipli da array dpi_items).", parameters: { type: "object", properties: { employee_id: { type: "string" }, dpi_items: { type: "array", items: { type: "object" } } }, required: ["employee_id", "dpi_items"] } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_genera_modulo_consegna_dpi", { p_company_id: ctx.companyId, p_employee_id: args?.employee_id, p_dpi_items: args?.dpi_items }),
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
    allowedPersonas: ["silvio", "hr", "compliance"], riskLevel: "yellow", domain: "hr",
  },

  blocca_operaio_da_cantiere: {
    schema: { type: "function", function: { name: "blocca_operaio_da_cantiere", description: "Blocca operaio (is_active=false) per non conformità.", parameters: { type: "object", properties: { employee_id: { type: "string" }, reason: { type: "string" } }, required: ["employee_id", "reason"] } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_blocca_operaio_da_cantiere", { p_company_id: ctx.companyId, p_employee_id: args?.employee_id, p_reason: args?.reason }),
    allowedRoles: ["super_admin", "company_admin"],
    allowedPersonas: ["silvio", "hr", "compliance"], riskLevel: "red", domain: "hr",
  },

  // ═════════════════════════════════════════════════════════════════════════
  // MP-OPS-07 — Pianificazione Multi-Cantiere (5 tool)
  // ═════════════════════════════════════════════════════════════════════════

  pianifica_cantiere: {
    schema: { type: "function", function: { name: "pianifica_cantiere", description: "Crea allocazioni cantiere (employees/subcontractors/mezzi).", parameters: { type: "object", properties: { cantiere_id: { type: "string" }, resources: { type: "array", items: { type: "object" } }, start_date: { type: "string", format: "date" }, end_date: { type: "string", format: "date" } }, required: ["cantiere_id", "resources"] } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_pianifica_cantiere", { p_company_id: ctx.companyId, p_cantiere_id: args?.cantiere_id, p_resources: args?.resources, p_start_date: args?.start_date ?? null, p_end_date: args?.end_date ?? null }),
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
    allowedPersonas: ["silvio", "pm_cantiere", "*"], riskLevel: "yellow", domain: "cantiere",
  },

  ottimizza_allocazioni_settimana: {
    schema: { type: "function", function: { name: "ottimizza_allocazioni_settimana", description: "AI ottimizza allocazioni per settimana (scenario: balanced|max_throughput|min_overtime).", parameters: { type: "object", properties: { start_date: { type: "string", format: "date" }, scenario: { type: "string" } } } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_ottimizza_allocazioni_settimana", { p_company_id: ctx.companyId, p_start_date: args?.start_date ?? null, p_scenario: args?.scenario ?? "balanced" }),
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
    allowedPersonas: ["silvio", "pm_cantiere"], riskLevel: "yellow", domain: "cantiere", estimatedCostEur: 0.06,
  },

  identifica_conflitti_allocazione: {
    schema: { type: "function", function: { name: "identifica_conflitti_allocazione", description: "Lista conflitti (stesso operaio su 2+ cantieri stesso periodo).", parameters: { type: "object", properties: {} } } },
    executor: async (_args, ctx) => callRpc(ctx.supabase, "silvio_tool_identifica_conflitti_allocazione", { p_company_id: ctx.companyId }),
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
    allowedPersonas: ["silvio", "pm_cantiere", "capocantiere", "*"], riskLevel: "safe", domain: "cantiere",
  },

  prevedi_impatto_ritardo: {
    schema: { type: "function", function: { name: "prevedi_impatto_ritardo", description: "Stima allocazioni impattate da ritardo cantiere.", parameters: { type: "object", properties: { cantiere_id: { type: "string" }, delay_days: { type: "integer" } }, required: ["cantiere_id", "delay_days"] } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_prevedi_impatto_ritardo", { p_company_id: ctx.companyId, p_cantiere_id: args?.cantiere_id, p_delay_days: args?.delay_days }),
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
    allowedPersonas: ["silvio", "pm_cantiere", "*"], riskLevel: "safe", domain: "cantiere",
  },

  sposta_allocazione: {
    schema: { type: "function", function: { name: "sposta_allocazione", description: "Sposta una allocazione su nuove date.", parameters: { type: "object", properties: { allocation_id: { type: "string" }, new_start: { type: "string", format: "date" }, new_end: { type: "string", format: "date" }, reason: { type: "string" } }, required: ["allocation_id", "new_start", "new_end"] } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_sposta_allocazione", { p_company_id: ctx.companyId, p_allocation_id: args?.allocation_id, p_new_start: args?.new_start, p_new_end: args?.new_end, p_reason: args?.reason ?? null }),
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
    allowedPersonas: ["silvio", "pm_cantiere"], riskLevel: "yellow", domain: "cantiere",
  },

  // ═════════════════════════════════════════════════════════════════════════
  // MP-OPS-08 — Sicurezza POS Auto (4 tool)
  // ═════════════════════════════════════════════════════════════════════════

  genera_pos_cantiere: {
    schema: { type: "function", function: { name: "genera_pos_cantiere", description: "Genera POS (Piano Operativo Sicurezza) per cantiere conforme D.Lgs 81/08.", parameters: { type: "object", properties: { cantiere_id: { type: "string" }, force_regenerate: { type: "boolean" } }, required: ["cantiere_id"] } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_genera_pos_cantiere", { p_company_id: ctx.companyId, p_cantiere_id: args?.cantiere_id, p_force_regenerate: args?.force_regenerate ?? false }),
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
    allowedPersonas: ["silvio", "compliance", "tecnico"], riskLevel: "red", domain: "compliance", estimatedCostEur: 0.08,
  },

  genera_duvri_cantiere: {
    schema: { type: "function", function: { name: "genera_duvri_cantiere", description: "Genera DUVRI per cantiere con subappalti.", parameters: { type: "object", properties: { cantiere_id: { type: "string" } }, required: ["cantiere_id"] } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_genera_duvri_cantiere", { p_company_id: ctx.companyId, p_cantiere_id: args?.cantiere_id }),
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
    allowedPersonas: ["silvio", "compliance"], riskLevel: "red", domain: "compliance", estimatedCostEur: 0.05,
  },

  valida_dpi_operai_cantiere: {
    schema: { type: "function", function: { name: "valida_dpi_operai_cantiere", description: "Valida DPI degli operai allocati al cantiere (casco/scarpe).", parameters: { type: "object", properties: { cantiere_id: { type: "string" } }, required: ["cantiere_id"] } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_valida_dpi_operai_cantiere", { p_company_id: ctx.companyId, p_cantiere_id: args?.cantiere_id }),
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
    allowedPersonas: ["silvio", "compliance", "pm_cantiere", "capocantiere"], riskLevel: "safe", domain: "compliance",
  },

  verifica_formazioni_operai: {
    schema: { type: "function", function: { name: "verifica_formazioni_operai", description: "Verifica formazioni e visite mediche operai allocati al cantiere.", parameters: { type: "object", properties: { cantiere_id: { type: "string" } }, required: ["cantiere_id"] } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_verifica_formazioni_operai", { p_company_id: ctx.companyId, p_cantiere_id: args?.cantiere_id }),
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
    allowedPersonas: ["silvio", "compliance", "pm_cantiere", "hr"], riskLevel: "safe", domain: "compliance",
  },

  // ═════════════════════════════════════════════════════════════════════════
  // MP-PRED-02 — Cantiere Ritardo Prediction (5 tool)
  // ═════════════════════════════════════════════════════════════════════════

  predici_data_fine_cantiere: {
    schema: { type: "function", function: { name: "predici_data_fine_cantiere", description: "Ultima previsione data fine cantiere + risk level.", parameters: { type: "object", properties: { cantiere_id: { type: "string" } }, required: ["cantiere_id"] } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_predici_data_fine_cantiere", { p_company_id: ctx.companyId, p_cantiere_id: args?.cantiere_id }),
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
    allowedPersonas: ["silvio", "pm_cantiere", "assistente_imprenditore", "*"], riskLevel: "safe", domain: "cantiere",
  },

  analizza_cause_ritardo: {
    schema: { type: "function", function: { name: "analizza_cause_ritardo", description: "Analizza cause primarie e fattori contribuenti al ritardo.", parameters: { type: "object", properties: { cantiere_id: { type: "string" } }, required: ["cantiere_id"] } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_analizza_cause_ritardo", { p_company_id: ctx.companyId, p_cantiere_id: args?.cantiere_id }),
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
    allowedPersonas: ["silvio", "pm_cantiere", "*"], riskLevel: "safe", domain: "cantiere",
  },

  genera_piano_recovery_cantiere: {
    schema: { type: "function", function: { name: "genera_piano_recovery_cantiere", description: "AI propone piano recovery cantiere a rischio.", parameters: { type: "object", properties: { cantiere_id: { type: "string" }, target_date: { type: "string", format: "date" } }, required: ["cantiere_id"] } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_genera_piano_recovery_cantiere", { p_company_id: ctx.companyId, p_cantiere_id: args?.cantiere_id, p_target_date: args?.target_date ?? null }),
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
    allowedPersonas: ["silvio", "pm_cantiere"], riskLevel: "yellow", domain: "cantiere", estimatedCostEur: 0.05,
  },

  lista_cantieri_a_rischio: {
    schema: { type: "function", function: { name: "lista_cantieri_a_rischio", description: "Lista cantieri con risk_level >= soglia (low/medium/high/critical).", parameters: { type: "object", properties: { risk_level_min: { type: "string", enum: ["low", "medium", "high", "critical"] } } } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_lista_cantieri_a_rischio", { p_company_id: ctx.companyId, p_risk_level_min: args?.risk_level_min ?? "medium" }),
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
    allowedPersonas: ["silvio", "pm_cantiere", "assistente_imprenditore", "*"], riskLevel: "safe", domain: "cantiere",
  },

  calcola_costo_ritardo: {
    schema: { type: "function", function: { name: "calcola_costo_ritardo", description: "Stima costo ritardo cantiere (penali + costi extra).", parameters: { type: "object", properties: { cantiere_id: { type: "string" }, delay_days: { type: "integer" } }, required: ["cantiere_id", "delay_days"] } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_calcola_costo_ritardo", { p_company_id: ctx.companyId, p_cantiere_id: args?.cantiere_id, p_delay_days: args?.delay_days }),
    allowedRoles: ["super_admin", "company_admin"],
    allowedPersonas: ["silvio", "pm_cantiere", "cfo", "controller", "*"], riskLevel: "safe", domain: "cantiere",
  },

  // ═════════════════════════════════════════════════════════════════════════
  // MP-SALES-05 — Proposal Commerciale PDF (4 tool)
  // ═════════════════════════════════════════════════════════════════════════

  genera_proposal_commerciale: {
    schema: { type: "function", function: { name: "genera_proposal_commerciale", description: "Genera proposal commerciale PDF da preventivo (cover, about us, case studies, FAQ, CTA).", parameters: { type: "object", properties: { quote_id: { type: "string" }, force_regenerate: { type: "boolean" }, target_audience: { type: "string" } }, required: ["quote_id"] } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_genera_proposal_commerciale", { p_company_id: ctx.companyId, p_quote_id: args?.quote_id, p_force_regenerate: args?.force_regenerate ?? false, p_target_audience: args?.target_audience ?? null }),
    allowedRoles: ["super_admin", "company_admin", "company_staff", "salesperson"],
    allowedPersonas: ["silvio", "sales", "direttore_vendite", "*"], riskLevel: "yellow", domain: "crm", estimatedCostEur: 0.10,
  },

  trova_case_studies_simili: {
    schema: { type: "function", function: { name: "trova_case_studies_simili", description: "Trova orders completati simili a una quote (per tipo lavoro + importo).", parameters: { type: "object", properties: { quote_id: { type: "string" }, similarity_threshold: { type: "number" } }, required: ["quote_id"] } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_trova_case_studies_simili", { p_company_id: ctx.companyId, p_quote_id: args?.quote_id, p_similarity_threshold: args?.similarity_threshold ?? 0.6 }),
    allowedRoles: ["super_admin", "company_admin", "company_staff", "salesperson"],
    allowedPersonas: ["silvio", "sales", "direttore_vendite", "*"], riskLevel: "safe", domain: "crm",
  },

  analizza_proposal_engagement: {
    schema: { type: "function", function: { name: "analizza_proposal_engagement", description: "Engagement proposal (sent/opened/page views/outcome).", parameters: { type: "object", properties: { proposal_id: { type: "string" } }, required: ["proposal_id"] } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_analizza_proposal_engagement", { p_company_id: ctx.companyId, p_proposal_id: args?.proposal_id }),
    allowedRoles: ["super_admin", "company_admin", "company_staff", "salesperson"],
    allowedPersonas: ["silvio", "sales", "direttore_vendite", "*"], riskLevel: "safe", domain: "crm",
  },

  invia_proposal_cliente: {
    schema: { type: "function", function: { name: "invia_proposal_cliente", description: "Invia proposal al cliente via canali specificati.", parameters: { type: "object", properties: { proposal_id: { type: "string" }, channels: { type: "array", items: { type: "string", enum: ["email", "whatsapp", "portal"] } }, message: { type: "string" } }, required: ["proposal_id"] } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_invia_proposal_cliente", { p_company_id: ctx.companyId, p_proposal_id: args?.proposal_id, p_channels: args?.channels ?? ["email"], p_message: args?.message ?? null }),
    allowedRoles: ["super_admin", "company_admin", "company_staff", "salesperson"],
    allowedPersonas: ["silvio", "sales", "direttore_vendite"], riskLevel: "yellow", domain: "crm",
  },

  // ── MP-SILVIO-ACTIONS-EXTERNAL-01 — esecuzione verso l'esterno (sempre yellow) ──
  componi_e_invia_messaggio: {
    schema: { type: "function", function: { name: "componi_e_invia_messaggio", description: "Compone e invia un messaggio a un contatto (cliente/fornitore/dipendente/lead) sul canale scelto. Richiede conferma (non invia subito).", parameters: { type: "object", properties: { destinatario_tipo: { type: "string", enum: ["cliente", "fornitore", "dipendente", "lead"] }, destinatario_id: { type: "string" }, canale: { type: "string", enum: ["email", "whatsapp", "sms"], default: "email" }, oggetto: { type: "string" }, corpo: { type: "string" }, scopo: { type: "string", enum: ["sollecito", "followup", "informativo", "richiesta_doc", "offerta"] } }, required: ["destinatario_tipo", "destinatario_id", "corpo"] } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_componi_e_invia_messaggio", { p_company_id: ctx.companyId, p_user_id: ctx.userId, p_dest_tipo: args?.destinatario_tipo, p_dest_id: args?.destinatario_id, p_canale: args?.canale ?? "email", p_oggetto: args?.oggetto ?? null, p_corpo: args?.corpo, p_scopo: args?.scopo ?? "informativo" }),
    allowedRoles: ["super_admin", "company_admin", "company_staff", "salesperson"],
    allowedPersonas: ["silvio", "assistente_imprenditore", "cfo", "pm_cantiere"], riskLevel: "yellow", domain: "sales", estimatedCostEur: 0.01,
  },
  rispondi_a_email: {
    schema: { type: "function", function: { name: "rispondi_a_email", description: "Risponde a un thread email entrante. Silvio redige, l'utente conferma l'invio.", parameters: { type: "object", properties: { thread_id: { type: "string" }, corpo: { type: "string" }, allega_documento_id: { type: "string" } }, required: ["thread_id", "corpo"] } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_rispondi_a_email", { p_company_id: ctx.companyId, p_user_id: ctx.userId, p_thread_id: args?.thread_id, p_corpo: args?.corpo, p_doc_id: args?.allega_documento_id ?? null }),
    allowedRoles: ["super_admin", "company_admin", "company_staff", "salesperson"],
    allowedPersonas: ["silvio", "assistente_imprenditore"], riskLevel: "yellow", domain: "sales", estimatedCostEur: 0.01,
  },

  // ── MP-SILVIO-ACTIONS-TWINS-01 — gemelli d'azione (tutti yellow → action_proposal) ──
  invia_sollecito_pagamento: {
    schema: { type: "function", function: { name: "invia_sollecito_pagamento", description: "Invia sollecito al cliente per fattura scaduta. Escalation per giorni di ritardo. Conferma richiesta.", parameters: { type: "object", properties: { cliente_id: { type: "string" }, fattura_id: { type: "string" }, tono: { type: "string", enum: ["cortese", "fermo", "ultimo_avviso"], default: "cortese" }, canale: { type: "string", enum: ["email", "whatsapp"], default: "email" } }, required: ["fattura_id"] } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_invia_sollecito_pagamento", { p_company_id: ctx.companyId, p_user_id: ctx.userId, p_cliente_id: args?.cliente_id ?? null, p_fattura_id: args?.fattura_id, p_tono: args?.tono ?? "cortese", p_canale: args?.canale ?? "email" }),
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
    allowedPersonas: ["silvio", "cfo", "assistente_imprenditore"], riskLevel: "yellow", domain: "finance", estimatedCostEur: 0.01,
  },
  invia_followup_preventivo: {
    schema: { type: "function", function: { name: "invia_followup_preventivo", description: "Invia follow-up al cliente per un preventivo in attesa. Conferma richiesta.", parameters: { type: "object", properties: { cliente_id: { type: "string" }, quote_id: { type: "string" }, canale: { type: "string", enum: ["email", "whatsapp"], default: "email" } }, required: ["quote_id"] } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_invia_followup_preventivo", { p_company_id: ctx.companyId, p_user_id: ctx.userId, p_cliente_id: args?.cliente_id ?? null, p_quote_id: args?.quote_id, p_canale: args?.canale ?? "email" }),
    allowedRoles: ["super_admin", "company_admin", "company_staff", "salesperson"],
    allowedPersonas: ["silvio", "sales", "assistente_imprenditore"], riskLevel: "yellow", domain: "crm", estimatedCostEur: 0.01,
  },
  invia_ordine_fornitore: {
    schema: { type: "function", function: { name: "invia_ordine_fornitore", description: "Prepara e invia un ordine al fornitore (es. stockout imminente). Conferma richiesta.", parameters: { type: "object", properties: { fornitore_id: { type: "string" }, articolo_id: { type: "string" }, quantita: { type: "number" }, canale: { type: "string", enum: ["email", "whatsapp"], default: "email" } }, required: ["fornitore_id"] } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_invia_ordine_fornitore", { p_company_id: ctx.companyId, p_user_id: ctx.userId, p_fornitore_id: args?.fornitore_id, p_articolo_id: args?.articolo_id ?? null, p_quantita: args?.quantita ?? null, p_canale: args?.canale ?? "email" }),
    allowedRoles: ["super_admin", "company_admin"],
    allowedPersonas: ["silvio", "pm_cantiere", "assistente_imprenditore"], riskLevel: "yellow", domain: "warehouse", estimatedCostEur: 0.01,
  },
  convoca_formazione_operaio: {
    schema: { type: "function", function: { name: "convoca_formazione_operaio", description: "Convoca un dipendente per una formazione/rinnovo in scadenza. Conferma richiesta.", parameters: { type: "object", properties: { dipendente_id: { type: "string" }, formazione: { type: "string" }, canale: { type: "string", enum: ["email", "whatsapp"], default: "email" } }, required: ["dipendente_id"] } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_convoca_formazione_operaio", { p_company_id: ctx.companyId, p_user_id: ctx.userId, p_dipendente_id: args?.dipendente_id, p_formazione: args?.formazione ?? null, p_canale: args?.canale ?? "email" }),
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
    allowedPersonas: ["silvio", "hr", "assistente_imprenditore"], riskLevel: "yellow", domain: "hr", estimatedCostEur: 0.01,
  },
  lancia_winback: {
    schema: { type: "function", function: { name: "lancia_winback", description: "Lancia una campagna win-back verso un cliente dormiente. Conferma richiesta.", parameters: { type: "object", properties: { cliente_id: { type: "string" }, offerta: { type: "string" }, canale: { type: "string", enum: ["email", "whatsapp"], default: "email" } }, required: ["cliente_id"] } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_lancia_winback", { p_company_id: ctx.companyId, p_user_id: ctx.userId, p_cliente_id: args?.cliente_id, p_offerta: args?.offerta ?? null, p_canale: args?.canale ?? "email" }),
    allowedRoles: ["super_admin", "company_admin", "company_staff", "salesperson"],
    allowedPersonas: ["silvio", "sales", "assistente_imprenditore"], riskLevel: "yellow", domain: "crm", estimatedCostEur: 0.01,
  },
  invia_cedolino_dipendente: {
    schema: { type: "function", function: { name: "invia_cedolino_dipendente", description: "Invia il cedolino a un dipendente. Conferma richiesta.", parameters: { type: "object", properties: { dipendente_id: { type: "string" }, cedolino_id: { type: "string" }, canale: { type: "string", enum: ["email", "whatsapp"], default: "email" } }, required: ["dipendente_id"] } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_invia_cedolino", { p_company_id: ctx.companyId, p_user_id: ctx.userId, p_dipendente_id: args?.dipendente_id, p_cedolino_id: args?.cedolino_id ?? null, p_canale: args?.canale ?? "email" }),
    allowedRoles: ["super_admin", "company_admin"],
    allowedPersonas: ["silvio", "hr", "assistente_imprenditore"], riskLevel: "yellow", domain: "hr", estimatedCostEur: 0.01,
  },
  blocca_slot_calendario: {
    schema: { type: "function", function: { name: "blocca_slot_calendario", description: "Blocca uno slot nel calendario (es. per sopralluogo). Conferma richiesta.", parameters: { type: "object", properties: { inizio: { type: "string", description: "ISO timestamp" }, fine: { type: "string", description: "ISO timestamp" }, motivo: { type: "string" } }, required: ["inizio"] } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_blocca_slot_calendario", { p_company_id: ctx.companyId, p_user_id: ctx.userId, p_inizio: args?.inizio, p_fine: args?.fine ?? null, p_motivo: args?.motivo ?? null }),
    allowedRoles: ["super_admin", "company_admin", "company_staff", "salesperson"],
    allowedPersonas: ["silvio", "pm_cantiere", "assistente_imprenditore"], riskLevel: "yellow", domain: "operations", estimatedCostEur: 0.01,
  },

  // ── MP-SILVIO-COPILOT-01 — copilota app + memoria preferenze (entrambi safe) ──
  guida_a: {
    schema: { type: "function", function: { name: "guida_a", description: "Spiega come fare un'operazione nell'app (passi) e fornisce il deep-link (route_path + query_params) per aprire la schermata giusta, eventualmente pre-compilata. Usalo quando l'utente chiede 'come faccio a...' o 'dove sta...'.", parameters: { type: "object", properties: { operazione: { type: "string", description: "es: creare una nota di credito" }, precompila: { type: "boolean", default: false }, entita_id: { type: "string", description: "id entità per pre-compilare (es. fattura da stornare, cliente)" } }, required: ["operazione"] } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_guida_a", { p_company_id: ctx.companyId, p_operazione: args?.operazione, p_precompila: args?.precompila ?? false, p_entita_id: args?.entita_id ?? null }),
    allowedRoles: ["*"],
    allowedPersonas: ["silvio", "assistente_imprenditore", "*"], riskLevel: "safe", domain: "support", estimatedCostEur: 0.005,
  },
  salva_regola_decisionale: {
    schema: { type: "function", function: { name: "salva_regola_decisionale", description: "Salva una preferenza decisionale del titolare (es. 'sotto 5000€ approva sempre i preventivi'). NON esegue nulla: registra solo la regola, che resta consultiva finché il titolare non attiva l'auto-approvazione. Vale solo per azioni a rischio medio (mai contratti/HR critici).", parameters: { type: "object", properties: { dominio: { type: "string", description: "es: preventivi, pagamenti, fornitori" }, campo: { type: "string", description: "campo da valutare, es: importo" }, operatore: { type: "string", enum: ["<", "<=", ">", ">=", "=", "!="], default: "<" }, valore: { type: "number", description: "soglia numerica (es. 5000)" }, azione: { type: "string", enum: ["auto_approva", "auto_rifiuta", "avvisa"], default: "avvisa" } }, required: ["dominio", "campo", "valore"] } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_salva_regola_decisionale", { p_company_id: ctx.companyId, p_user_id: ctx.userId, p_dominio: args?.dominio, p_condizione: { field: args?.campo, op: args?.operatore ?? "<", value: args?.valore }, p_azione: args?.azione ?? "avvisa", p_origine: "esplicito" }),
    allowedRoles: ["super_admin", "company_admin"],
    allowedPersonas: ["silvio", "assistente_imprenditore", "cfo"], riskLevel: "safe", domain: "support", estimatedCostEur: 0.005,
  },

  // ── MP-SILVIO-CREATIVE-01 — artefatti on-demand (asincroni via coda, yellow: costano) ──
  genera_creativita: {
    schema: { type: "function", function: { name: "genera_creativita", description: "Genera un'immagine/grafica social brandizzata seguendo i canoni di brand. Asincrono: accoda un job e ritorna subito {job_id, eta_seconds}. Conferma richiesta (consuma crediti).", parameters: { type: "object", properties: { tipo: { type: "string", enum: ["immagine"], default: "immagine" }, brief: { type: "string", description: "cosa rappresentare, es: post vendita ristrutturazione bagno chiavi in mano" }, formato: { type: "string", enum: ["1:1", "4:5", "9:16", "16:9"], default: "4:5" }, contesto_commessa_id: { type: "string", description: "opzionale: aggancia dati reali di una commessa" } }, required: ["brief"] } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_enqueue_creativita", { p_company_id: ctx.companyId, p_user_id: ctx.userId, p_tipo: "immagine", p_brief: args?.brief, p_formato: args?.formato ?? "4:5", p_commessa_id: args?.contesto_commessa_id ?? null }),
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
    allowedPersonas: ["silvio", "assistente_imprenditore", "marketing"], riskLevel: "safe", domain: "marketing", estimatedCostEur: 0.06,
    resultContract: "Se il tool risponde ok:false → NON dire che stai creando l'immagine: spiega l'errore in una frase semplice. Se ok:true (hai un job_id reale) → rispondi SOLO con UNA frase breve e umana (es. \"Sto creando l'immagine, sarà pronta tra pochi secondi 👇\"), SENZA tecnicismi (vietato 'job', 'Job ID', 'controlla il job', 'in elaborazione', 'eta_seconds', 'stato'). Poi emetti SUBITO, su righe a parte, un blocco fenced con linguaggio 'silvio-image' contenente ESATTAMENTE {\"job_id\":\"<il job_id ricevuto>\"} — usa il job_id vero, mai inventato. L'immagine si rivela da sola nella chat. Dopo, in una riga, puoi offrire di preparare una campagna sponsorizzata.",
  },
  // NOTE: genera_documento rimosso (audit senior 2026-05-30): accodava job tipo='document'
  // mai processati dal worker (orfani) e duplicava il tool maturo genera_relazione_tecnica.
  // Per le relazioni tecniche usare genera_relazione_tecnica (path reale end-to-end).

  // ── MP-SILVIO-SIMULATION-01 — what-if composito (sola lettura → safe) ──
  simula_scenario_aziendale: {
    schema: { type: "function", function: { name: "simula_scenario_aziendale", description: "Simula uno scenario composito (nuova commessa, termini di pagamento, assunzione, sconto) e ne valuta l'impatto su cassa, margine e carico squadre su un orizzonte temporale. Restituisce numeri base reali + impatto stimato + leve concrete (incassi anticipabili): usa questi dati per raccontare se la cassa regge e cosa fare. Sola lettura, non modifica nulla.", parameters: { type: "object", properties: { ipotesi: { type: "string", description: "descrizione naturale dello scenario" }, orizzonte_mesi: { type: "integer", default: 6 }, variabili: { type: "object", description: "es {nuova_commessa_eur:80000, incasso_giorni:60, fornitori_giorni:30, costo_fornitori_eur:50000}" } }, required: ["ipotesi"] } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_simula_scenario", { p_company_id: ctx.companyId, p_ipotesi: args?.ipotesi, p_orizzonte: args?.orizzonte_mesi ?? 6, p_variabili: args?.variabili ?? {} }),
    allowedRoles: ["super_admin", "company_admin"],
    allowedPersonas: ["silvio", "cfo", "assistente_imprenditore", "*"], riskLevel: "safe", domain: "finance", estimatedCostEur: 0.02,
  },

  // ═════════════════════════════════════════════════════════════════════════
  // MP-SALES-06 — Pipeline Forecast Sales (4 tool)
  // ═════════════════════════════════════════════════════════════════════════

  stima_probabilita_close_quote: {
    schema: { type: "function", function: { name: "stima_probabilita_close_quote", description: "Stima probabilità close quote (heuristic baseline + AI factors).", parameters: { type: "object", properties: { quote_id: { type: "string" } }, required: ["quote_id"] } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_stima_probabilita_close_quote", { p_company_id: ctx.companyId, p_quote_id: args?.quote_id }),
    allowedRoles: ["super_admin", "company_admin", "company_staff", "salesperson"],
    allowedPersonas: ["silvio", "sales", "direttore_vendite", "*"], riskLevel: "safe", domain: "crm",
  },

  get_pipeline_forecast: {
    schema: { type: "function", function: { name: "get_pipeline_forecast", description: "Forecast pipeline aggregato MULTI-FONTE (totale, weighted, 30/60/90gg): opportunità CRM aperte + preventivi inviati non collegati a un'opportunità (i collegati contano una volta sola — molte aziende fanno preventivi cartacei fuori EiC, quindi le opportunità sono la fonte primaria). Leggi 'fonti' per il breakdown e 'nota_lettura' per i caveat (es. opportunità senza valore stimato).", parameters: { type: "object", properties: { horizon_days: { type: "integer", default: 90 } } } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_get_pipeline_forecast", { p_company_id: ctx.companyId, p_horizon_days: args?.horizon_days ?? 90 }),
    allowedRoles: ["super_admin", "company_admin", "company_staff", "salesperson"],
    allowedPersonas: ["silvio", "sales", "direttore_vendite", "cfo", "*"], riskLevel: "safe", domain: "crm",
  },

  identifica_quotes_da_followup: {
    schema: { type: "function", function: { name: "identifica_quotes_da_followup", description: "Quotes attive con probabilità >= soglia (priorità follow-up).", parameters: { type: "object", properties: { priority_threshold: { type: "number", default: 60 } } } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_identifica_quotes_da_followup", { p_company_id: ctx.companyId, p_priority_threshold: args?.priority_threshold ?? 60 }),
    allowedRoles: ["super_admin", "company_admin", "company_staff", "salesperson"],
    allowedPersonas: ["silvio", "sales", "direttore_vendite", "*"], riskLevel: "safe", domain: "crm",
  },

  suggerisci_azione_per_quote: {
    schema: { type: "function", function: { name: "suggerisci_azione_per_quote", description: "Suggerisce next-action per quote (call/email/wait).", parameters: { type: "object", properties: { quote_id: { type: "string" } }, required: ["quote_id"] } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_suggerisci_azione_per_quote", { p_company_id: ctx.companyId, p_quote_id: args?.quote_id }),
    allowedRoles: ["super_admin", "company_admin", "company_staff", "salesperson"],
    allowedPersonas: ["silvio", "sales", "direttore_vendite", "*"], riskLevel: "safe", domain: "crm",
  },

  // ═════════════════════════════════════════════════════════════════════════
  // QUOTE FROM CAPTURE — generazione preventivi da foto/audio/testo (8 tool)
  // ═════════════════════════════════════════════════════════════════════════

  create_capture_run: {
    schema: { type: "function", function: { name: "create_capture_run", description: "Crea un nuovo run di estrazione preventivo da foto/audio/testo. Ritorna run_id.", parameters: { type: "object", properties: { capture_mode: { type: "string", enum: ["foto", "audio", "testo", "mixed"] }, image_paths: { type: "array", items: { type: "string" } }, audio_path: { type: "string" }, description: { type: "string" }, vertical_key: { type: "string" } }, required: ["capture_mode"] } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_create_capture_run", { p_company_id: ctx.companyId, p_capture_mode: args?.capture_mode, p_image_paths: args?.image_paths ?? null, p_audio_path: args?.audio_path ?? null, p_description: args?.description ?? null, p_vertical_key: args?.vertical_key ?? null }),
    allowedRoles: ["super_admin", "company_admin", "company_staff", "salesperson"],
    allowedPersonas: ["silvio", "sales", "direttore_vendite", "*"], riskLevel: "safe", domain: "preventivi",
  },

  get_capture_run: {
    schema: { type: "function", function: { name: "get_capture_run", description: "Recupera dati di un capture run (estratto cliente + prodotti + status).", parameters: { type: "object", properties: { run_id: { type: "string" } }, required: ["run_id"] } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_get_capture_run", { p_company_id: ctx.companyId, p_run_id: args?.run_id }),
    allowedRoles: ["super_admin", "company_admin", "company_staff", "salesperson"],
    allowedPersonas: ["silvio", "sales", "direttore_vendite", "*"], riskLevel: "safe", domain: "preventivi",
  },

  apply_capture_review: {
    schema: { type: "function", function: { name: "apply_capture_review", description: "Trasforma un capture run reviewato in quote + quote_items + auto-create/update marketing_contact. Strategia contact: auto/manual/always_new/use_existing.", parameters: { type: "object", properties: { run_id: { type: "string" }, corrections: { type: "object", properties: { customer: { type: "object" }, products: { type: "array" }, contact_strategy: { type: "string", enum: ["auto", "manual", "always_new", "use_existing"] }, existing_contact_id: { type: "string" } } } }, required: ["run_id", "corrections"] } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_apply_capture_review", { p_company_id: ctx.companyId, p_run_id: args?.run_id, p_corrections: args?.corrections ?? {} }),
    allowedRoles: ["super_admin", "company_admin", "company_staff", "salesperson"],
    allowedPersonas: ["silvio", "sales", "direttore_vendite"], riskLevel: "yellow", domain: "preventivi",
  },

  match_product_alias: {
    schema: { type: "function", function: { name: "match_product_alias", description: "Cerca alias prodotto cached per nome locale (es. 'infisso PVC' → article_template_id). Bumpa use_count.", parameters: { type: "object", properties: { alias_text: { type: "string" } }, required: ["alias_text"] } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_match_product_alias", { p_company_id: ctx.companyId, p_alias_text: args?.alias_text }),
    allowedRoles: ["super_admin", "company_admin", "company_staff", "salesperson"],
    allowedPersonas: ["silvio", "sales", "*"], riskLevel: "safe", domain: "preventivi",
  },

  register_product_alias: {
    schema: { type: "function", function: { name: "register_product_alias", description: "Registra un alias prodotto dopo che l'utente ha confermato il match.", parameters: { type: "object", properties: { alias_text: { type: "string" }, article_template_id: { type: "string" }, family_id: { type: "string" }, tariffa_id: { type: "string" }, learned_from: { type: "string", enum: ["manual", "capture_review", "history", "import"] }, confidence: { type: "number" } }, required: ["alias_text"] } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_register_product_alias", { p_company_id: ctx.companyId, p_alias_text: args?.alias_text, p_article_template_id: args?.article_template_id ?? null, p_family_id: args?.family_id ?? null, p_tariffa_id: args?.tariffa_id ?? null, p_learned_from: args?.learned_from ?? "capture_review", p_confidence: args?.confidence ?? 0.95 }),
    allowedRoles: ["super_admin", "company_admin", "company_staff", "salesperson"],
    allowedPersonas: ["silvio", "sales", "*"], riskLevel: "safe", domain: "preventivi",
  },

  lookup_contact_live: {
    schema: { type: "function", function: { name: "lookup_contact_live", description: "Cerca contact candidates per email/telefono/nome (UI suggestion live).", parameters: { type: "object", properties: { email: { type: "string" }, phone: { type: "string" }, name_hint: { type: "string" } } } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_lookup_contact_live", { p_company_id: ctx.companyId, p_email: args?.email ?? null, p_phone: args?.phone ?? null, p_name_hint: args?.name_hint ?? null }),
    allowedRoles: ["super_admin", "company_admin", "company_staff", "salesperson"],
    allowedPersonas: ["silvio", "sales", "direttore_vendite", "*"], riskLevel: "safe", domain: "crm",
  },

  // ═════════════════════════════════════════════════════════════════════════
  // VISITA COMMERCIALE — debrief AI post-visita (4 tool)
  // ═════════════════════════════════════════════════════════════════════════
  create_visit_debrief: {
    schema: { type: "function", function: { name: "create_visit_debrief", description: "Crea debrief visita commerciale (audio + foto + note). L'edge ai-visit-debrief-analyzer poi analizza.", parameters: { type: "object", properties: { contact_id: { type: "string" }, quote_id: { type: "string" }, order_id: { type: "string" }, audio_path: { type: "string" }, image_paths: { type: "array", items: { type: "string" } }, free_notes: { type: "string" }, visit_location: { type: "string" } } } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_create_visit_debrief", { p_company_id: ctx.companyId, p_contact_id: args?.contact_id ?? null, p_quote_id: args?.quote_id ?? null, p_order_id: args?.order_id ?? null, p_audio_path: args?.audio_path ?? null, p_image_paths: args?.image_paths ?? null, p_free_notes: args?.free_notes ?? null, p_visit_location: args?.visit_location ?? null }),
    allowedRoles: ["super_admin", "company_admin", "company_staff", "salesperson"],
    allowedPersonas: ["silvio", "sales", "direttore_vendite", "*"], riskLevel: "safe", domain: "crm",
  },

  lista_visite_a_rischio: {
    schema: { type: "function", function: { name: "lista_visite_a_rischio", description: "Visite ad alta probabilità di close ma senza follow-up (rischio perdita).", parameters: { type: "object", properties: { days_back: { type: "integer", default: 14 } } } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_lista_visite_a_rischio", { p_company_id: ctx.companyId, p_days_back: args?.days_back ?? 14 }),
    allowedRoles: ["super_admin", "company_admin", "company_staff", "salesperson"],
    allowedPersonas: ["silvio", "sales", "direttore_vendite", "*"], riskLevel: "safe", domain: "crm",
  },

  // ═════════════════════════════════════════════════════════════════════════
  // DYNAMIC PRICING REAL-TIME (2 tool)
  // ═════════════════════════════════════════════════════════════════════════
  get_dynamic_pricing_factors: {
    schema: { type: "function", function: { name: "get_dynamic_pricing_factors", description: "Aggrega fattori dinamici di pricing: domanda, stagione, materie prime, concorrenti. Ritorna suggested_adjustment_pct.", parameters: { type: "object", properties: { product_category: { type: "string" }, material_keys: { type: "array", items: { type: "string" } } } } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_get_dynamic_pricing_factors", { p_company_id: ctx.companyId, p_product_category: args?.product_category ?? null, p_material_keys: args?.material_keys ?? null }),
    allowedRoles: ["super_admin", "company_admin", "company_staff", "salesperson"],
    allowedPersonas: ["silvio", "sales", "direttore_vendite", "controller", "cfo", "*"], riskLevel: "safe", domain: "preventivi",
  },

  record_competitor_signal: {
    schema: { type: "function", function: { name: "record_competitor_signal", description: "Registra un segnale di pricing competitor (es. 'X ha alzato +5%').", parameters: { type: "object", properties: { competitor_name: { type: "string" }, product_category: { type: "string" }, signal_type: { type: "string", enum: ["price_increase", "price_decrease", "promotion", "new_product", "market_share"] }, signal_value: { type: "number" }, description: { type: "string" }, zone: { type: "string" } }, required: ["competitor_name", "product_category", "signal_type"] } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_record_competitor_signal", { p_company_id: ctx.companyId, p_competitor_name: args?.competitor_name, p_product_category: args?.product_category, p_signal_type: args?.signal_type, p_signal_value: args?.signal_value ?? null, p_description: args?.description ?? null, p_zone: args?.zone ?? null }),
    allowedRoles: ["super_admin", "company_admin", "company_staff", "salesperson"],
    allowedPersonas: ["silvio", "sales", "direttore_vendite", "*"], riskLevel: "safe", domain: "crm",
  },

  // ═════════════════════════════════════════════════════════════════════════
  // ROUTE OPTIMIZATION (2 tool)
  // ═════════════════════════════════════════════════════════════════════════
  optimize_route: {
    schema: { type: "function", function: { name: "optimize_route", description: "Ottimizza percorso operaio: nearest-neighbor TSP su stops disponibili in distance_matrix_cache.", parameters: { type: "object", properties: { start_location_id: { type: "string" }, stop_location_ids: { type: "array", items: { type: "string" } }, end_location_id: { type: "string" }, default_stop_min: { type: "integer", default: 60 } }, required: ["start_location_id", "stop_location_ids"] } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_optimize_route_nearest_neighbor", { p_company_id: ctx.companyId, p_start_location_id: args?.start_location_id, p_stop_location_ids: args?.stop_location_ids, p_end_location_id: args?.end_location_id ?? null, p_default_stop_min: args?.default_stop_min ?? 60 }),
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
    allowedPersonas: ["silvio", "pm_cantiere", "capocantiere", "*"], riskLevel: "safe", domain: "cantiere",
  },

  save_route_plan: {
    schema: { type: "function", function: { name: "save_route_plan", description: "Salva piano percorso giornaliero per un operaio.", parameters: { type: "object", properties: { plan_date: { type: "string", format: "date" }, employee_id: { type: "string" }, start_location_id: { type: "string" }, end_location_id: { type: "string" }, stops: { type: "array" }, total_distance_km: { type: "number" }, total_duration_min: { type: "integer" } }, required: ["plan_date", "employee_id", "stops"] } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_save_route_plan", { p_company_id: ctx.companyId, p_plan_date: args?.plan_date, p_employee_id: args?.employee_id, p_start_location_id: args?.start_location_id ?? null, p_end_location_id: args?.end_location_id ?? null, p_stops: args?.stops, p_total_distance_km: args?.total_distance_km ?? null, p_total_duration_min: args?.total_duration_min ?? null, p_strategy: args?.strategy ?? "nearest_neighbor" }),
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
    allowedPersonas: ["silvio", "pm_cantiere", "capocantiere"], riskLevel: "safe", domain: "cantiere",
  },

  // ═════════════════════════════════════════════════════════════════════════
  // VIDEO MONITORING SICUREZZA CANTIERE (3 tool)
  // ═════════════════════════════════════════════════════════════════════════
  register_camera_device: {
    schema: { type: "function", function: { name: "register_camera_device", description: "Registra dispositivo camera per cantiere (IP cam, drone, helmet cam, app mobile).", parameters: { type: "object", properties: { cantiere_id: { type: "string" }, device_name: { type: "string" }, device_type: { type: "string", enum: ["ip_camera", "drone", "mobile_app", "helmet_cam", "webhook"] }, alert_phone: { type: "string" }, alert_email: { type: "string" } }, required: ["cantiere_id", "device_name", "device_type"] } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_register_camera_device", { p_company_id: ctx.companyId, p_cantiere_id: args?.cantiere_id, p_device_name: args?.device_name, p_device_type: args?.device_type, p_alert_phone: args?.alert_phone ?? null, p_alert_email: args?.alert_email ?? null }),
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
    allowedPersonas: ["silvio", "compliance", "pm_cantiere"], riskLevel: "yellow", domain: "compliance",
  },

  lista_violazioni_attive: {
    schema: { type: "function", function: { name: "lista_violazioni_attive", description: "Violazioni cantiere recenti high/critical da camera devices.", parameters: { type: "object", properties: { hours_back: { type: "integer", default: 24 } } } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_lista_violazioni_attive", { p_company_id: ctx.companyId, p_hours_back: args?.hours_back ?? 24 }),
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
    allowedPersonas: ["silvio", "compliance", "pm_cantiere", "capocantiere", "*"], riskLevel: "safe", domain: "compliance",
  },

  // ═════════════════════════════════════════════════════════════════════════
  // COMPLAINTS / RECLAMI SENTIMENT (4 tool)
  // ═════════════════════════════════════════════════════════════════════════
  create_complaint: {
    schema: { type: "function", function: { name: "create_complaint", description: "Crea reclamo cliente da qualsiasi sorgente. L'edge ai-complaint-analyzer poi analizza e auto-escalate se critical.", parameters: { type: "object", properties: { source: { type: "string", enum: ["email", "whatsapp", "telegram", "web_form", "phone", "review_google", "review_facebook", "visit_in_person", "manual"] }, raw_text: { type: "string" }, customer_name: { type: "string" }, customer_email: { type: "string" }, customer_phone: { type: "string" }, contact_id: { type: "string" }, related_order_id: { type: "string" }, related_quote_id: { type: "string" } }, required: ["source", "raw_text"] } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_create_complaint", { p_company_id: ctx.companyId, p_source: args?.source, p_raw_text: args?.raw_text, p_customer_name: args?.customer_name ?? null, p_customer_email: args?.customer_email ?? null, p_customer_phone: args?.customer_phone ?? null, p_contact_id: args?.contact_id ?? null, p_related_order_id: args?.related_order_id ?? null, p_related_quote_id: args?.related_quote_id ?? null }),
    allowedRoles: ["super_admin", "company_admin", "company_staff", "call_center"],
    allowedPersonas: ["silvio", "assistente_cliente", "*"], riskLevel: "safe", domain: "crm",
  },

  lista_reclami_aperti: {
    schema: { type: "function", function: { name: "lista_reclami_aperti", description: "Reclami aperti ordinati per urgenza.", parameters: { type: "object", properties: { urgency_min: { type: "string", enum: ["low", "medium", "high", "critical"], default: "low" } } } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_lista_reclami_aperti", { p_company_id: ctx.companyId, p_urgency_min: args?.urgency_min ?? "low" }),
    allowedRoles: ["super_admin", "company_admin", "company_staff", "call_center"],
    allowedPersonas: ["silvio", "assistente_cliente", "direttore_vendite", "*"], riskLevel: "safe", domain: "crm",
  },

  resolve_complaint: {
    schema: { type: "function", function: { name: "resolve_complaint", description: "Marca reclamo come risolto con note risoluzione.", parameters: { type: "object", properties: { complaint_id: { type: "string" }, resolution_notes: { type: "string" }, action_taken: { type: "string" }, customer_satisfied: { type: "boolean" } }, required: ["complaint_id", "resolution_notes"] } } },
    executor: async (args, ctx) => callRpc(ctx.supabase, "silvio_tool_resolve_complaint", { p_company_id: ctx.companyId, p_complaint_id: args?.complaint_id, p_resolution_notes: args?.resolution_notes, p_action_taken: args?.action_taken ?? null, p_customer_satisfied: args?.customer_satisfied ?? null }),
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
    allowedPersonas: ["silvio", "assistente_cliente", "*"], riskLevel: "yellow", domain: "crm",
  },

  // ── MP-06: Activity Brain ─────────────────────────────────────────────────
  // Query strutturata sul log delle attività azienda (modifiche, decisioni, alert).
  // Usata per domande tipo "cosa è cambiato sui preventivi questa settimana?"
  // "chi ha modificato il listino?" "ultimi 10 contatti CRM aggiornati".
  query_activity: {
    schema: {
      type: "function",
      function: {
        name: "query_activity",
        description: "Ricerca filtrata sul log attività aziendale (company_activity_log): cosa è cambiato, quando, da chi, con quale impatto. Usa per domande tipo 'cosa è successo questa settimana sui preventivi', 'chi ha cambiato il listino', 'ultimi assunti', 'modifiche critiche oggi'.",
        parameters: {
          type: "object",
          properties: {
            query_text: { type: "string", description: "Testo libero da cercare in description/target_label/event_type (ILIKE)." },
            categories: {
              type: "array",
              items: { type: "string", enum: ["modification", "decision", "alert", "auth_event", "integration_event", "system_event", "chat_message"] },
              description: "Filtro categorie. Vuoto = tutte.",
            },
            event_types: {
              type: "array",
              items: { type: "string" },
              description: "Filtro tipi evento (es. 'quote.created', 'employee.hired'). Vuoto = tutti.",
            },
            target_table: { type: "string", description: "Limita a una tabella specifica (orders/quotes/marketing_contacts/employees/listino_prezzi)." },
            min_importance: { type: "string", enum: ["low", "normal", "high", "critical"], description: "Soglia minima di importanza." },
            from_iso: { type: "string", description: "Inizio range in ISO (es. '2027-03-01T00:00:00Z')." },
            to_iso: { type: "string", description: "Fine range in ISO." },
            limit: { type: "integer", minimum: 1, maximum: 100, default: 30 },
          },
          required: [],
        },
      },
    },
    executor: async (args, ctx) => {
      const data = await callRpc(ctx.supabase, "search_company_activity", {
        p_company_id: ctx.companyId,
        p_query_text: args?.query_text ?? null,
        p_categories: Array.isArray(args?.categories) && args.categories.length > 0 ? args.categories : null,
        p_event_types: Array.isArray(args?.event_types) && args.event_types.length > 0 ? args.event_types : null,
        p_target_table: args?.target_table ?? null,
        p_min_importance: args?.min_importance ?? null,
        p_actor_user_id: null,
        p_from: args?.from_iso ?? null,
        p_to: args?.to_iso ?? null,
        p_limit: Math.min(Math.max(Number(args?.limit ?? 30), 1), 100),
      });
      if (data && typeof data === "object" && "error" in data) return data;
      return {
        risultati: data ?? [],
        nota: Array.isArray(data) && data.length === 0
          ? "Nessuna attività trovata con i filtri indicati."
          : undefined,
      };
    },
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
    allowedPersonas: ["*"],
    allowedChannels: ["internal_chat", "web_persona", "mobile"],
    riskLevel: "safe",
    domain: "knowledge",
  },
};

/**
 * Ritorna i tool disponibili per il ruolo dell'utente.
 *
 * @deprecated MP-AIE-01 v2: preferire `getToolsForChannel` (più potente e
 * canale-aware). Mantenuto per back-compat con silvio-chat esistente.
 */
export function getToolsForRole(role: string): SilvioTool[] {
  // FAIL-CLOSED: senza allowedRoles il tool è riservato a DEFAULT_TOOL_ALLOWED_ROLES.
  return Object.values(SILVIO_TOOLS).filter(t => {
    const roles = t.allowedRoles && t.allowedRoles.length > 0 ? t.allowedRoles : DEFAULT_TOOL_ALLOWED_ROLES;
    return roles.includes(role) || roles.includes("*");
  });
}

/**
 * Token-opt (audit 2026-06): domini SEMPRE inclusi quando si filtra per aree.
 * Sono i tool cross-area (KPI overview, ricerca knowledge, memoria/AI, grafici,
 * copilota app, calendario): senza di questi Silvio perde le domande trasversali.
 */
export const CORE_TOOL_DOMAINS: ToolDomain[] = [
  "ai",
  "calendar",
  "generative",
  "knowledge",
  "kpi",
  "meta",
  "support",
  "titolare",
];

/**
 * Mappa `primary_area`/`involved_areas` (output di classifyQuery, _shared/queryClassifier.ts)
 * → domini tool da inviare al modello. `null` = nessun filtro (catalogo completo):
 * usato per le aree intrinsecamente cross-ecosystem (strategic) o rare (tech).
 *
 * Mappa volutamente GENEROSA (vincolo prodotto: "potente al 100%"): meglio 60-90
 * tool sicuri che 30 che perdono i casi cross-area.
 */
const AREA_TOOL_DOMAINS: Record<string, ToolDomain[] | null> = {
  // crm incluso: pipeline/forecast (get_pipeline_forecast & co.) sono domain crm
  // ma servono alle domande finance su target venduto/incassi futuri.
  finance: ["anomalie", "banking", "crm", "fattura", "finance", "preventivi"],
  fiscal: ["banking", "compliance", "fattura", "finance"],
  operations: ["anomalie", "cantiere", "filiera", "operations", "warehouse"],
  sales: ["cantiere", "crm", "email", "preventivi", "sales"],
  marketing: ["crm", "email", "marketing", "sales"],
  hr: ["compliance", "finance", "hr"],
  compliance: ["cantiere", "compliance", "filiera", "hr"],
  client: ["crm", "email", "fattura", "preventivi", "sales"],
  tech: null,
  strategic: null,
};

/**
 * Converte la classificazione della query (primary_area + involved_areas) nel
 * set di domini tool da passare a `getToolsForChannel({ domains })`.
 *
 * Ritorna `null` (= catalogo completo) quando:
 *   - una delle aree coinvolte è cross-ecosystem (strategic/tech) o sconosciuta;
 *   - è anche il fallback naturale: classifyQuery in errore ritorna primary_area
 *     della persona corrente ("strategic" per Silvio) → nessun filtro.
 *
 * Output ordinato e deduplicato → lista tool deterministica (stessa
 * classificazione = stessi byte nel body → prompt cache Anthropic riusabile).
 */
export function domainsForClassification(opts: {
  primaryArea: string;
  involvedAreas?: string[];
}): ToolDomain[] | null {
  const areas = new Set<string>([opts.primaryArea, ...(opts.involvedAreas ?? [])]);
  const out = new Set<ToolDomain>(CORE_TOOL_DOMAINS);
  for (const area of areas) {
    const mapped = AREA_TOOL_DOMAINS[area];
    if (mapped === null || mapped === undefined) return null;
    for (const d of mapped) out.add(d);
  }
  return [...out].sort();
}

/**
 * Ruoli di default per i tool che NON dichiarano `allowedRoles`.
 * SICUREZZA (fail-closed): l'assenza di allowedRoles NON significa "tutti" —
 * significa "solo i ruoli privilegiati". Un tool pensato per staff/venditori/
 * operai deve dichiararlo esplicitamente (es. `allowedRoles: [..., "company_staff"]`).
 */
export const DEFAULT_TOOL_ALLOWED_ROLES = ["super_admin", "company_admin"];

/**
 * RBAC granulare per-utente (MVP 2026-07-31): dominio tool → permesso
 * `staff_permissions.can_view_*` che ne gata la visibilità per i ruoli staff.
 * Colma il gap "Silvio guarda solo il ruolo, mai i permessi per-utente":
 * un operatore a cui l'admin ha tolto la finanza non deve poter chiedere
 * l'EBITDA a Silvio. Semantica ADDITIVO-RESTRITTIVA e fail-open sui buchi:
 *  - si applica SOLO se il chiamante passa `staffPermissions` (tipicamente
 *    per primaryRole='company_staff'; gli admin non la passano);
 *  - esclude un tool SOLO se il permesso mappato è ESPLICITAMENTE false;
 *  - domini non mappati (ai, meta, knowledge, generative, anomalie, email,
 *    filiera, titolare) restano invariati.
 */
export const DOMAIN_STAFF_PERMISSION: Partial<Record<ToolDomain, string>> = {
  kpi: "can_view_financial_reports",
  finance: "can_view_financial_reports",
  banking: "can_view_tesoreria",
  fattura: "can_view_billing",
  cantiere: "can_view_orders",
  operations: "can_view_orders",
  warehouse: "can_view_warehouse",
  crm: "can_view_marketing",
  marketing: "can_view_marketing",
  sales: "can_view_marketing_opportunities",
  preventivi: "can_view_preventivi",
  hr: "can_view_employees",
  calendar: "can_view_calendar",
  compliance: "can_view_sicurezza_cantiere",
  support: "can_view_tickets",
};

/**
 * MP-AIE-01 v2 — filtra i tool per canale + role + persona + domain.
 * Funzione canonica usata da: silvio-chat, ai-orchestrator, whatsapp-ai-processor,
 * telegram-bot-processor, internal-agent-tools (voice).
 *
 * Logica:
 *   - allowedChannels vuoto/undefined = disponibile su TUTTI i canali
 *   - allowedRoles vuoto/undefined = FAIL-CLOSED su DEFAULT_TOOL_ALLOWED_ROLES
 *     (solo admin); include "*" = disponibile per TUTTI i ruoli
 *   - allowedPersonas vuoto/undefined o include "*" = disponibile per TUTTE le personas
 *   - domain filter è opzionale (omettilo per ricevere tutti)
 *   - domains (plurale) filtra in OR su un set di domini; i tool SENZA domain
 *     dichiarato passano sempre (cross-area by definition). null/[] = no filtro.
 */
export function getToolsForChannel(opts: {
  channel: Channel;
  role: string;
  personaKey?: string;
  domain?: ToolDomain;
  domains?: ToolDomain[] | null;
  /** RBAC granulare per-utente (vedi DOMAIN_STAFF_PERMISSION): riga
   *  staff_permissions dell'utente. Se assente/null → nessun filtro extra. */
  staffPermissions?: Record<string, unknown> | null;
}): SilvioTool[] {
  const out: SilvioTool[] = [];
  const domainSet = opts.domains && opts.domains.length > 0 ? new Set(opts.domains) : null;
  for (const tool of Object.values(SILVIO_TOOLS)) {
    // Channel filter
    if (tool.allowedChannels && tool.allowedChannels.length > 0) {
      if (!tool.allowedChannels.includes(opts.channel)) continue;
    }
    // Role filter — FAIL-CLOSED: un tool senza allowedRoles è riservato agli
    // admin (default DEFAULT_TOOL_ALLOWED_ROLES), mai esposto a tutti i ruoli.
    const toolRoles = tool.allowedRoles && tool.allowedRoles.length > 0
      ? tool.allowedRoles
      : DEFAULT_TOOL_ALLOWED_ROLES;
    if (!toolRoles.includes(opts.role) && !toolRoles.includes("*")) continue;
    // Persona filter
    if (opts.personaKey && tool.allowedPersonas && tool.allowedPersonas.length > 0) {
      if (!tool.allowedPersonas.includes(opts.personaKey) && !tool.allowedPersonas.includes("*")) continue;
    }
    // Domain filter (singolo, back-compat)
    if (opts.domain && tool.domain !== opts.domain) continue;
    // Domain-set filter (token-opt): tool senza domain = sempre incluso
    if (domainSet && tool.domain && !domainSet.has(tool.domain)) continue;
    // RBAC granulare per-utente (MVP): esclude il tool SOLO se il permesso
    // staff mappato sul suo dominio è esplicitamente false.
    if (opts.staffPermissions && tool.domain) {
      const permKey = DOMAIN_STAFF_PERMISSION[tool.domain];
      if (permKey && opts.staffPermissions[permKey] === false) continue;
    }
    out.push(tool);
  }
  return out;
}

/**
 * MP-AIE-01 v2 — converte una lista di SilvioTool in OpenAI function-calling spec.
 * Usato per costruire il body `params.tools` di aiRouterComplete.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toolsToOpenAISpec(tools: SilvioTool[]): any[] {
  return tools.map(enrichToolSchemaForLLM);
}

/**
 * Esegue un tool by name + args.
 *
 * @deprecated MP-AIE-01 v2: preferire `executeToolWithRouting` da
 * `silvioToolExecution.ts` (gestisce risk-level + audit log + permission
 * complete su persona/channel). Mantenuto per back-compat con silvio-chat.
 */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<unknown> {
  const tool = SILVIO_TOOLS[name];
  if (!tool) return { error: `Tool sconosciuto: ${name}` };
  const channel = ctx.channel ?? "internal_chat";
  // FAIL-CLOSED: senza allowedRoles il tool è riservato a DEFAULT_TOOL_ALLOWED_ROLES.
  const toolRoles = tool.allowedRoles && tool.allowedRoles.length > 0 ? tool.allowedRoles : DEFAULT_TOOL_ALLOWED_ROLES;
  if (!toolRoles.includes(ctx.primaryRole) && !toolRoles.includes("*")) {
    return { error: `Tool ${name} non autorizzato per ruolo ${ctx.primaryRole}` };
  }
  if (ctx.personaKey && tool.allowedPersonas && !tool.allowedPersonas.includes(ctx.personaKey) && !tool.allowedPersonas.includes("*")) {
    return { error: `Tool ${name} non autorizzato per persona ${ctx.personaKey}` };
  }
  if (tool.allowedChannels && !tool.allowedChannels.includes(channel)) {
    return { error: `Tool ${name} non disponibile sul canale ${channel}` };
  }
  const risk = tool.riskLevel ?? "safe";
  if ((risk === "yellow" || risk === "red") && !ctx.preApproved) {
    return {
      error: `Tool ${name} richiede conferma esplicita prima dell'esecuzione`,
      riskLevel: risk,
      requires_confirmation: true,
    };
  }
  try {
    return await tool.executor(args, ctx);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
