/**
 * queryClassifier — MP-09 Cross-area orchestration
 *
 * Classifica una query utente come single-area vs multi-area, e nel secondo
 * caso la decompone in sub-query area-specifiche da invocare in parallelo
 * con le persona competenti.
 *
 * Usato da silvio-chat e ai-orchestrator per decidere se delegare al
 * Council orchestrator (ai-council-orchestrator).
 */
import { aiRouterComplete } from "./aiRouter.ts";

export type Area =
  | "finance" | "operations" | "sales" | "marketing"
  | "hr" | "compliance" | "client" | "fiscal" | "tech" | "strategic";

export interface QueryClassification {
  is_multi_area: boolean;
  primary_area: Area;
  involved_areas: Area[];
  involved_personas: string[];
  decomposition: Array<{
    area: Area;
    persona_key: string;
    sub_query: string;
    why: string;
  }>;
  synthesis_required: boolean;
  estimated_complexity: "simple" | "medium" | "complex";
}

const PERSONA_TO_AREA: Record<string, Area> = {
  cfo: "finance",
  controller: "finance",
  amministrazione: "operations",
  commercialista: "fiscal",
  legale: "compliance",
  compliance: "compliance",
  tecnico: "operations",
  pm_cantiere: "operations",
  capocantiere: "operations",
  acquisti: "operations",
  hr: "hr",
  sales: "sales",
  direttore_vendite: "sales",
  direttore_marketing: "marketing",
  cliente_tutor: "client",
  assistente_cliente: "client",
  assistente_imprenditore: "strategic",
  silvio: "strategic",
  brain: "strategic",
};

const VALID_AREAS: Area[] = [
  "finance",
  "operations",
  "sales",
  "marketing",
  "hr",
  "compliance",
  "client",
  "fiscal",
  "tech",
  "strategic",
];

const AREA_FALLBACK_PERSONA: Record<Area, string> = {
  finance: "cfo",
  operations: "pm_cantiere",
  sales: "sales",
  marketing: "direttore_marketing",
  hr: "hr",
  compliance: "compliance",
  client: "assistente_cliente",
  fiscal: "commercialista",
  tech: "tecnico",
  strategic: "assistente_imprenditore",
};

const VALID_PERSONAS = new Set(Object.keys(PERSONA_TO_AREA));
const VALID_AREA_SET = new Set<Area>(VALID_AREAS);

function isArea(value: unknown): value is Area {
  return typeof value === "string" && VALID_AREA_SET.has(value as Area);
}

function isPersona(value: unknown): value is string {
  return typeof value === "string" && VALID_PERSONAS.has(value);
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function isRevenueTargetQuestion(query: string): boolean {
  const q = query.toLowerCase();
  const asksRevenueTarget = /\b(fattur\w*|fatture|incass\w*|vend\w*|venduto|ordini nuovi|nuove commesse|nuovi clienti|fare di fatturato)\b/.test(q)
    && /\b(quanto|quanti|quale importo|che importo|target|obiettivo)\b/.test(q);
  const hasCashNeed = /\b(costi fissi|stipendi|personale|fornitori|saldi dei clienti|crediti|rate scadute|cassa|cashflow|liquidita|liquidità|pareggio|break even|gap di cassa)\b/.test(q);
  const hasForwardPeriod = /\b(mese prossimo|prossimo mese|mese dopo|prossimi 30 giorni|30 giorni|settimana prossima|prossima settimana|prossimo periodo)\b/.test(q);
  const asksCashCoverage = /\b(quanto|quanti|quale importo|che importo)\b/.test(q) && hasCashNeed && hasForwardPeriod;

  return (asksRevenueTarget && hasCashNeed && hasForwardPeriod) || asksCashCoverage;
}

function isCashOrMarginDecisionQuestion(query: string): boolean {
  const q = query.toLowerCase();
  const hasEconomics = /\b(cassa|cashflow|liquidita|liquidità|margine|marginalita|marginalità|incass\w*|fattur\w*|venduto|acconto|fornitori|materiali|merce|manodopera|subappaltatori|costi variabili|iva)\b/.test(q);
  const asksDecision = /\b(quanto|posso|conviene|rischio|rischioso|avviare|partire|accettare|scontare|prezzo|coprire|pagare|chiedere|minimo|simula|scenario)\b/.test(q);

  return hasEconomics && asksDecision;
}

function isCollectionPriorityQuestion(query: string): boolean {
  const q = query.toLowerCase();
  const hasCollectionAction = /\b(sollecit\w*|recuper\w*|incass\w*|chiam\w*|scriv\w*|promemoria|reminder|messa in mora|chi mi deve pagare|chi deve pagare)\b/.test(q);
  const hasReceivableTarget = /\b(clienti|cliente|crediti|rate|saldo|saldi|acconti|pagamenti|scadut\w*|ritardo|insolut\w*)\b/.test(q);
  const asksPriority = /\b(quali|chi|prima|priorit\w*|urgente|subito|ordine|elenco|lista)\b/.test(q);

  return hasCollectionAction && hasReceivableTarget && asksPriority;
}

function sanitizeClassification(
  parsed: Partial<QueryClassification>,
  fallback: QueryClassification,
  originalQuery: string,
): QueryClassification {
  const primaryArea = isArea(parsed.primary_area) ? parsed.primary_area : fallback.primary_area;
  const parsedPersonas = Array.isArray(parsed.involved_personas)
    ? parsed.involved_personas.filter(isPersona)
    : [];
  const parsedAreas = Array.isArray(parsed.involved_areas)
    ? parsed.involved_areas.filter(isArea)
    : [];

  const involvedPersonas = unique(parsedPersonas.length > 0 ? parsedPersonas : fallback.involved_personas).slice(0, 4);
  const areasFromPersonas = involvedPersonas
    .map((persona) => PERSONA_TO_AREA[persona])
    .filter((area): area is Area => Boolean(area));
  const involvedAreas = unique(
    [...parsedAreas, ...areasFromPersonas, primaryArea].filter(isArea),
  ).slice(0, 4);

  const rawDecomposition = Array.isArray(parsed.decomposition) ? parsed.decomposition : [];
  const decomposition = rawDecomposition
    .slice(0, 4)
    .map((item) => {
      const record = (item ?? {}) as Record<string, unknown>;
      const area = isArea(record.area) ? record.area : primaryArea;
      const personaKey = isPersona(record.persona_key)
        ? record.persona_key
        : AREA_FALLBACK_PERSONA[area];
      return {
        area: PERSONA_TO_AREA[personaKey] ?? area,
        persona_key: personaKey,
        sub_query: typeof record.sub_query === "string" && record.sub_query.trim()
          ? record.sub_query.trim().slice(0, 1000)
          : originalQuery.slice(0, 1000),
        why: typeof record.why === "string" && record.why.trim()
          ? record.why.trim().slice(0, 500)
          : "Area coinvolta nella richiesta multi-consulente.",
      };
    })
    .filter((item) => isPersona(item.persona_key));

  const complexity = parsed.estimated_complexity === "complex" || parsed.estimated_complexity === "medium"
    ? parsed.estimated_complexity
    : "simple";
  const multiArea = parsed.is_multi_area === true && decomposition.length > 1;
  const finalPersonas = multiArea
    ? unique(decomposition.map((item) => item.persona_key)).slice(0, 4)
    : involvedPersonas;
  const finalAreas = multiArea
    ? unique(decomposition.map((item) => item.area)).slice(0, 4)
    : involvedAreas;

  return {
    is_multi_area: multiArea,
    primary_area: primaryArea,
    involved_areas: finalAreas.length > 0 ? finalAreas : fallback.involved_areas,
    involved_personas: finalPersonas.length > 0 ? finalPersonas : fallback.involved_personas,
    decomposition: multiArea ? decomposition : [],
    synthesis_required: multiArea && parsed.synthesis_required === true,
    estimated_complexity: multiArea ? complexity : "simple",
  };
}

const CLASSIFIER_PROMPT = `Sei un classificatore di intent multi-area per un sistema AI di gestione di imprese edili italiane.

## Aree disponibili
- finance (cashflow, margini, banca, finanziamenti)
- operations (cantieri, magazzino, acquisti, produzione)
- sales (preventivi, trattative, conversion)
- marketing (lead gen, campagne, SEO)
- hr (assunzioni, presenze, busta paga, CCNL)
- compliance (sicurezza, DURC, AI Act, GDPR, contratti)
- fiscal (IVA, F24, dichiarazioni, bonus fiscali)
- client (post-vendita, supporto, customer care)
- tech (software, integrazioni, infrastruttura)
- strategic (decisioni alto livello, analisi cross-funzionali)

## Personas
silvio, cfo, commercialista, controller, legale, tecnico, pm_cantiere,
capocantiere, hr, sales, direttore_vendite, direttore_marketing,
amministrazione, acquisti, compliance, cliente_tutor, assistente_cliente,
assistente_imprenditore, brain

## Regole
1. Una query è multi-area se richiede dati/analisi da > 1 area DIVERSE.
2. "posso assumere?" = multi-area (hr + finance + strategic)
3. "qual è il DSO?" = single-area (finance)
4. "ciao Silvio" = single-area conversational
5. Decomposition: max 4 sub-query
6. NON inventare aree o personas non in lista

## Output JSON obbligatorio
{
  "is_multi_area": boolean,
  "primary_area": "<area>",
  "involved_areas": ["<area1>", "<area2>"],
  "involved_personas": ["<persona1>", "<persona2>"],
  "decomposition": [
    { "area": "<area>", "persona_key": "<persona>", "sub_query": "<testo>", "why": "<motivo>" }
  ],
  "synthesis_required": boolean,
  "estimated_complexity": "simple" | "medium" | "complex"
}`;

export interface ClassifyOptions {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  query: string;
  currentPersona: string;
  companyId?: string | null;
  userId?: string | null;
}

export async function classifyQuery(opts: ClassifyOptions): Promise<QueryClassification> {
  const fallback: QueryClassification = {
    is_multi_area: false,
    primary_area: PERSONA_TO_AREA[opts.currentPersona] ?? "strategic",
    involved_areas: [PERSONA_TO_AREA[opts.currentPersona] ?? "strategic"],
    involved_personas: [opts.currentPersona],
    decomposition: [],
    synthesis_required: false,
    estimated_complexity: "simple",
  };

  if (Deno.env.get("COUNCIL_ENABLED") === "false") return fallback;
  if (!opts.query || opts.query.trim().length < 10) return fallback;
  if (
    isRevenueTargetQuestion(opts.query) ||
    isCashOrMarginDecisionQuestion(opts.query) ||
    isCollectionPriorityQuestion(opts.query)
  ) {
    return {
      is_multi_area: false,
      primary_area: "finance",
      involved_areas: ["finance"],
      involved_personas: [isPersona(opts.currentPersona) ? opts.currentPersona : "silvio"],
      decomposition: [],
      synthesis_required: false,
      estimated_complexity: "simple",
    };
  }

  try {
    const r = await aiRouterComplete({
      supabase: opts.supabase,
      taskKey: "query_classifier",
      messages: [
        { role: "system", content: CLASSIFIER_PROMPT },
        {
          role: "user",
          content: `Query utente:\n${opts.query}\n\nPersona corrente: ${opts.currentPersona}\n\nClassifica.`,
        },
      ],
      params: { temperature: 0.1, max_tokens: 1500 },
      responseFormat: { type: "json_object" },
      companyId: opts.companyId ?? null,
      userId: opts.userId ?? null,
    });

    const raw = (r.content ?? "").replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    const first = raw.indexOf("{");
    const last = raw.lastIndexOf("}");
    if (first < 0 || last <= first) return fallback;

    const parsed = JSON.parse(raw.substring(first, last + 1)) as Partial<QueryClassification>;
    return sanitizeClassification(parsed, fallback, opts.query);
  } catch (e) {
    console.warn("[queryClassifier] failed (fallback to single-area):", e instanceof Error ? e.message : e);
    return fallback;
  }
}
