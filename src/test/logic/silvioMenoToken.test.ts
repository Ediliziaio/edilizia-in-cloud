import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  domainsForClassification,
  getToolsForChannel,
  indiceAreeGruppoFisso,
  indiceAreeCaricabili,
  SILVIO_TOOLS,
  TOOL_CONTRACT_LEGEND,
  toolsToOpenAISpec,
  type ToolDomain,
} from "../../../supabase/functions/_shared/silvioTools";
import {
  BUDGET_RISULTATI_TURNO,
  domandaDiSolaLettura,
  GRUPPO_FISSO_STRUMENTI,
  limiteRisultatoStrumento,
  REGOLE_DATI_SILVIO,
} from "../../../supabase/functions/_shared/silvioRisparmioToken";
import { buildEnrichedSystemPrompt } from "../../../supabase/functions/_shared/promptBuilder";
import { cachePromptAnthropic, tokenCacheDaUsage } from "../../../supabase/functions/_shared/aiRouter";
import { silvioHistoryMessages } from "../../../supabase/functions/_shared/silvioAnswerQuality";
import { CHART_RULES, FINANCE_RECONCILIATION_RULES, MONEY_CONFIRMATION_RULES } from "../../../supabase/functions/_shared/chartRules";
import { SILVIO_REPLY_STYLE } from "../../../supabase/functions/_shared/silvioReplyStyle";
import { SITE_HEALTH_TOOL } from "../../../supabase/functions/_shared/silvioSiteHealth";
import { readFileSync } from "node:fs";

/**
 * Il costo di Silvio in chat (02/11/2026). Stima dichiarata: caratteri / 3,5.
 * In produzione la stessa domanda sui soldi costa ~15K token di schema contati
 * da Anthropic contro ~11K stimati qui: le soglie valgono da confronto, non da
 * conteggio esatto.
 */
const promptStaticoSilvio = (base: string): string => base + CHART_RULES + FINANCE_RECONCILIATION_RULES +
  MONEY_CONFIRMATION_RULES + TOOL_CONTRACT_LEGEND + SILVIO_REPLY_STYLE + REGOLE_DATI_SILVIO;
const token = (x: unknown) => Math.round(JSON.stringify(x).length / 3.5);

const schema = (area: string, soloLettura = false) => {
  const domains = domainsForClassification({ primaryArea: area });
  return toolsToOpenAISpec(getToolsForChannel({
    channel: "internal_chat", role: "company_admin", personaKey: "silvio", domains, soloLettura,
  }));
};
const nomi = (spec: Array<{ function: { name: string } }>) => spec.map((s) => s.function.name);

describe("schema degli strumenti", () => {
  it("una domanda normale sui soldi resta sotto gli 8.500 token, e sotto i 12.000 col catalogo dell'area", () => {
    expect(token(schema("finance", true))).toBeLessThan(8_500);
    expect(token(schema("finance"))).toBeLessThan(12_000);
  });

  it("l'ordine degli strumenti e i byte sono stabili fra due richieste", () => {
    expect(JSON.stringify(schema("finance", true))).toBe(JSON.stringify(schema("finance", true)));
    // Anche con domini passati in un altro ordine: conta il registro.
    const a = getToolsForChannel({ channel: "internal_chat", role: "company_admin", domains: ["fattura", "kpi"] as ToolDomain[] });
    const b = getToolsForChannel({ channel: "internal_chat", role: "company_admin", domains: ["kpi", "fattura"] as ToolDomain[] });
    expect(a.map((t) => t.schema.function.name)).toEqual(b.map((t) => t.schema.function.name));
  });

  it("ogni area principale ha ancora gli strumenti che le servono, anche in sola lettura", () => {
    const attesi: Array<[string, string[]]> = [
      ["finance", ["get_overdue_payments", "lista_scadenze", "get_quadro_incassi", "get_cashflow_status"]], // fatture
      ["operations", ["analizza_stato_commesse", "report_commessa", "get_orders_summary"]], // commesse
      ["operations", ["lista_lavori_pose_periodo", "lista_cantieri_a_rischio", "get_employees_workload"]], // cantieri
      ["marketing", ["cerca_email_intelligente"]], // email
      ["hr", ["get_employees_workload", "lista_candidati"]], // personale
    ];
    for (const [area, servono] of attesi) {
      expect(nomi(schema(area, true))).toEqual(expect.arrayContaining(servono));
      expect(nomi(schema(area, true))).toContain("carica_strumenti");
    }
  });

  it("il tag dice sempre il rischio degli strumenti che non sono safe", () => {
    const tutti = toolsToOpenAISpec(getToolsForChannel({ channel: "internal_chat", role: "company_admin" }));
    const descrizione = (n: string) => tutti.find((s) => s.function.name === n)?.function.description ?? "";
    for (const [nome, t] of Object.entries(SILVIO_TOOLS)) {
      if (!nomi(tutti).includes(nome)) continue;
      const rischio = t.riskLevel ?? "safe";
      if (rischio === "safe" && !t.resultContract) expect(descrizione(nome)).not.toContain("rischio:");
      if (rischio !== "safe") expect(descrizione(nome)).toContain(`rischio:${rischio}`);
    }
    expect(TOOL_CONTRACT_LEGEND).toContain("Senza `rischio` il livello e safe");
    expect(TOOL_CONTRACT_LEGEND).toContain("yellow:");
    expect(TOOL_CONTRACT_LEGEND).toContain("red:");
  });
});

describe("sola lettura", () => {
  it("toglie solo gli strumenti che scrivono, e non aggiunge niente", () => {
    const tutti = nomi(schema("finance"));
    const lettura = nomi(schema("finance", true));
    expect(lettura.every((n) => tutti.includes(n))).toBe(true);
    expect(lettura.every((n) => (SILVIO_TOOLS[n].riskLevel ?? "safe") === "safe")).toBe(true);
    expect(lettura.length).toBeLessThan(tutti.length);
  });

  it("i permessi filtrano come prima", () => {
    const base = { channel: "internal_chat" as const, personaKey: "silvio", domains: domainsForClassification({ primaryArea: "finance" }) };
    const adm = getToolsForChannel({ ...base, role: "company_admin" }).map((t) => t.schema.function.name);
    for (const role of ["company_staff", "worker", "customer", "salesperson"]) {
      const pieno = getToolsForChannel({ ...base, role }).map((t) => t.schema.function.name);
      const lettura = getToolsForChannel({ ...base, role, soloLettura: true }).map((t) => t.schema.function.name);
      expect(lettura.every((n) => pieno.includes(n))).toBe(true);
      expect(pieno.every((n) => adm.includes(n) || SILVIO_TOOLS[n].allowedRoles?.includes(role) || SILVIO_TOOLS[n].allowedRoles?.includes("*"))).toBe(true);
    }
    // Un'area spenta nei permessi resta spenta anche in sola lettura.
    const spenta = getToolsForChannel({ ...base, role: "company_staff", soloLettura: true, staffPermissions: { can_view_billing: false } });
    expect(spenta.some((t) => t.domain === "fattura")).toBe(false);
  });

  it("riconosce le domande che leggono e nel dubbio tiene il catalogo pieno", () => {
    for (const q of ["quali fatture sono scadute?", "Quanto ho incassato a ottobre?", "chi lavora domani in via Roma?", "mostrami i cantieri a rischio", "com'è la cassa questa settimana?"]) {
      expect(domandaDiSolaLettura(q), q).toBe(true);
    }
    for (const q of [
      "manda un sollecito a Bianchi", "quali fatture sono scadute? mandagli un sollecito", "sì, procedi pure",
      "crea un preventivo per Rossi", "dimmi le scadute e fissa un appuntamento", "le fatture scadute?", "ok",
      "quanto manca? poi registra il pagamento", "fammi una bozza di email", "come faccio a farlo?",
    ]) {
      expect(domandaDiSolaLettura(q), q).toBe(false);
    }
    expect(domandaDiSolaLettura("quali fatture sono scadute?", true)).toBe(false);
  });

  it("il modello sa che le azioni si caricano", () => {
    const domini = domainsForClassification({ primaryArea: "finance" });
    expect(indiceAreeCaricabili(domini, true)).toContain("`azioni: true`");
    expect(indiceAreeCaricabili(domini)).not.toContain("`azioni: true`");
    // Anche quando tutte le aree sono gia' a bordo l'avviso resta.
    const tutti = [...new Set(Object.values(SILVIO_TOOLS).map((t) => t.domain).filter(Boolean))] as ToolDomain[];
    expect(indiceAreeCaricabili(tutti)).toBe("");
    expect(indiceAreeCaricabili(tutti, true)).toContain("`azioni: true`");
  });

  it("carica_strumenti accetta le azioni senza aree, e rifiuta la richiesta vuota", async () => {
    const carica = SILVIO_TOOLS.carica_strumenti.executor;
    const azioni = await carica({ aree: [], azioni: true }, {} as never) as { azioni?: boolean };
    expect(azioni.azioni).toBe(true);
    const vuota = await carica({ aree: [] }, {} as never) as { error?: string };
    expect(vuota.error).toContain("Area non riconosciuta");
  });

  it("le domande sui cantieri hanno le persone a bordo", () => {
    expect(domainsForClassification({ primaryArea: "operations" })).toContain("hr");
  });
});

describe("cache del prompt", () => {
  beforeEach(() => {
    vi.stubGlobal("Deno", { env: { get: (k: string): string | undefined => process.env[k] } });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const supabaseFinto = {
    rpc: () => Promise.resolve({ data: { prompt: null }, error: null }),
    from: () => ({
      select: () => ({
        eq: () => {
          const r = {
            limit: () => ({ maybeSingle: () => Promise.resolve({ data: { content: "PREAMBOLO", version: 3 }, error: null }) }),
            then: (ok: (v: { data: never[]; error: null }) => unknown) => ok({ data: [], error: null }),
          };
          return r;
        },
      }),
    }),
  };

  const costruisci = async (quando: string, messaggio: string, azienda: string) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(quando));
    const fatto = await buildEnrichedSystemPrompt({
      supabase: supabaseFinto,
      personaKey: "silvio",
      basePrompt: "PERSONA SILVIO",
      personaVersion: 3,
      recommendedTierKey: "t4_premium",
      userContext: `Oggi ${quando}, azienda ${azienda}`,
      memoryContext: `memoria di ${azienda}`,
      ragContextBlock: `documenti su ${messaggio}`,
      ragSourcesCount: 2,
      sessionId: `sessione-${azienda}`,
      companyId: azienda,
      userId: "u1",
    });
    vi.useRealTimers();
    return fatto;
  };

  it("il prefisso e' identico fra richieste con data, messaggio e azienda diversi", async () => {
    const a = await costruisci("2026-11-02T09:03:00Z", "fatture scadute", "azienda-a");
    const b = await costruisci("2026-11-05T18:41:00Z", "cantieri fermi", "azienda-b");
    expect(promptStaticoSilvio(a.systemPromptStatic)).toBe(promptStaticoSilvio(b.systemPromptStatic));
    expect(a.systemPromptDynamic).not.toBe(b.systemPromptDynamic);
    for (const dentro of ["azienda-a", "azienda-b", "fatture scadute", "memoria di", "Oggi 2026-11"]) {
      expect(promptStaticoSilvio(a.systemPromptStatic)).not.toContain(dentro);
    }
  });

  it("silvio-chat compone il blocco che va in cache con questi pezzi e solo questi", () => {
    const sorgente = readFileSync("supabase/functions/silvio-chat/index.ts", "utf8");
    expect(sorgente).toContain("const staticSystemPrompt = builtPrompt.systemPromptStatic + CHART_RULES + FINANCE_RECONCILIATION_RULES + MONEY_CONFIRMATION_RULES + TOOL_CONTRACT_LEGEND + SILVIO_REPLY_STYLE + REGOLE_DATI_SILVIO + (gruppoFisso ? indiceAreeGruppoFisso() : \"\");");
    expect(sorgente).toContain('promptCache: { ttl: "5m" as const, coda: true }');
    expect(REGOLE_DATI_SILVIO).toContain("l'azione NON è conclusa");
  });

  const messaggi = () => [
    { role: "system" as const, content: "S".repeat(2000) },
    { role: "system" as const, content: "dinamico" },
    { role: "user" as const, content: "domanda" },
  ];

  it("Silvio chiede 5 minuti e la coda: breakpoint su ogni system e cache a livello di richiesta", () => {
    const { messages, cacheCoda } = cachePromptAnthropic("anthropic/claude-sonnet-4.5", messaggi(), { ttl: "5m", coda: true });
    expect(cacheCoda).toBe(true);
    expect(messages[0].content[0].cache_control).toEqual({ type: "ephemeral" });
    expect(messages[1].content[0].cache_control).toEqual({ type: "ephemeral" });
    expect(messages[2]).toEqual({ role: "user", content: "domanda" });
  });

  it("chi non chiede niente resta come prima: un'ora sul primo blocco, niente coda", () => {
    const { messages, cacheCoda } = cachePromptAnthropic("anthropic/claude-sonnet-4.5", messaggi());
    expect(cacheCoda).toBe(false);
    expect(messages[0].content[0].cache_control).toEqual({ type: "ephemeral", ttl: "1h" });
    expect(messages[1].content[0].cache_control).toEqual({ type: "ephemeral" });
  });

  it("con la coda i breakpoint non superano mai i 4 di Anthropic", () => {
    const tanti = [1, 2, 3, 4, 5].map((n) => ({ role: "system" as const, content: `${n}`.repeat(400) }));
    const { messages, cacheCoda } = cachePromptAnthropic("anthropic/claude-sonnet-4.5", tanti, { coda: true });
    expect(cacheCoda).toBe(true);
    expect(messages).toHaveLength(3);
    expect(messages[2].content[0].text).toContain("5".repeat(400));
  });

  it("sugli altri modelli niente cache_control e un solo system", () => {
    const { messages, cacheCoda } = cachePromptAnthropic("openai/gpt-4o-mini", messaggi(), { ttl: "5m", coda: true });
    expect(cacheCoda).toBe(false);
    expect(messages[0].role).toBe("system");
    expect(typeof messages[0].content).toBe("string");
    expect(messages).toHaveLength(2);
  });

  it("i kill-switch spengono la coda senza redeploy", () => {
    vi.stubEnv("AI_PROMPT_CACHE_TAIL_DISABLED", "true");
    expect(cachePromptAnthropic("anthropic/claude-sonnet-4.5", messaggi(), { coda: true }).cacheCoda).toBe(false);
  });

  it("legge letture e scritture in cache dai nomi che usa OpenRouter e da quelli di Anthropic", () => {
    expect(tokenCacheDaUsage({ prompt_tokens_details: { cached_tokens: 39127, cache_write_tokens: 0 } }))
      .toEqual({ cachedTokens: 39127, cacheWriteTokens: 0 });
    expect(tokenCacheDaUsage({ prompt_tokens_details: { cached_tokens: 0, cache_write_tokens: 42122 } }))
      .toEqual({ cachedTokens: 0, cacheWriteTokens: 42122 });
    expect(tokenCacheDaUsage({ cache_read_input_tokens: 10, cache_creation_input_tokens: 20 }))
      .toEqual({ cachedTokens: 10, cacheWriteTokens: 20 });
    expect(tokenCacheDaUsage({})).toEqual({ cachedTokens: 0, cacheWriteTokens: 0 });
    expect(tokenCacheDaUsage(null as unknown)).toEqual({ cachedTokens: 0, cacheWriteTokens: 0 });
  });
});

describe("tetti del turno", () => {
  it("i risultati si accorciano solo dopo il budget del turno", () => {
    expect(limiteRisultatoStrumento(0)).toBe(8_000);
    expect(limiteRisultatoStrumento(BUDGET_RISULTATI_TURNO - 1)).toBe(8_000);
    expect(limiteRisultatoStrumento(BUDGET_RISULTATI_TURNO)).toBe(3_000);
  });

  it("lo storico accorcia solo i messaggi vecchi e lo dichiara", () => {
    const lungo = "x".repeat(1400);
    const righe = Array.from({ length: 10 }, (_, i) => ({ id: `m${i}`, sender_id: "u1", content: `${i}${lungo}` }));
    const storico = silvioHistoryMessages(righe, {
      assistantSenderId: "silvio", currentSenderId: "u1", currentContent: "adesso", currentMessageId: "corrente",
      vecchi: { recenti: 6, maxChars: 600 },
    });
    expect(storico).toHaveLength(10);
    expect(storico[0].content.length).toBeLessThan(700);
    expect(storico[0].content).toContain("parziale");
    expect(storico[3].content.length).toBeLessThan(700);
    expect(storico[4].content).not.toContain("parziale");
    expect(storico[9].content).not.toContain("parziale");
  });
});

describe("gruppo fisso di strumenti", () => {
  it("«carico di lavoro» e' una domanda, «carica il documento» no", () => {
    expect(domandaDiSolaLettura("Chi è più carico di lavoro questa settimana?")).toBe(true);
    expect(domandaDiSolaLettura("Dimmi dove carico il documento e caricalo tu")).toBe(false);
  });

  const base = { channel: "internal_chat", role: "company_admin", personaKey: "silvio", gruppoFisso: GRUPPO_FISSO_STRUMENTI } as const;
  const conEspansi = (domains?: ToolDomain[]) => getToolsForChannel({ ...base, domains });

  it("ogni nome esiste ed e' nella chat interna: un nome sbagliato sparisce in silenzio", () => {
    const presenti = new Set(conEspansi().map((t) => t.schema.function.name));
    expect([...GRUPPO_FISSO_STRUMENTI].filter((n) => !presenti.has(n))).toEqual([]);
  });

  it("stessi byte a ogni domanda, e meno del catalogo di un'area larga", () => {
    const uno = JSON.stringify(toolsToOpenAISpec(conEspansi()));
    expect(JSON.stringify(toolsToOpenAISpec(conEspansi([])))).toBe(uno);
    expect(token(toolsToOpenAISpec(conEspansi()))).toBeLessThan(10_000);
    expect(token(toolsToOpenAISpec(conEspansi()))).toBeLessThan(token(schema("operations")));
  });

  it("la domanda sui ritardi trova il suo strumento nel gruppo, senza riscrivere la cache", () => {
    expect(GRUPPO_FISSO_STRUMENTI.has(SITE_HEALTH_TOOL)).toBe(true);
  });

  it("carica_strumenti aggiunge l'area intera, azioni comprese", () => {
    const nomiArea = conEspansi(["warehouse"]).map((t) => t.schema.function.name);
    expect(nomiArea).toContain("registra_movimento_magazzino");
    expect(nomiArea).toContain("crea_task");
  });

  it("non scavalca ruolo e permessi", () => {
    const staff = getToolsForChannel({ ...base, role: "company_staff", staffPermissions: { can_view_billing: false } }).map((t) => t.schema.function.name);
    expect(staff).not.toContain("get_overdue_payments");
    const pieno = getToolsForChannel({ channel: "internal_chat", role: "company_staff", personaKey: "silvio" }).map((t) => t.schema.function.name);
    expect(staff.filter((n) => !pieno.includes(n))).toEqual([]);
  });

  it("l'indice nomina ogni area caricabile ed e' sempre lo stesso testo", () => {
    expect(indiceAreeGruppoFisso()).toBe(indiceAreeGruppoFisso());
    for (const area of ["magazzino", "sicurezza", "mezzi", "posta"]) expect(indiceAreeGruppoFisso()).toContain(`- ${area} (`);
    expect(indiceAreeGruppoFisso()).not.toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });
});
