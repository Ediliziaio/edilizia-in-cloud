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
  | "finance"
  | "operations"
  | "sales"
  | "marketing"
  | "hr"
  | "compliance"
  | "client"
  | "fiscal"
  | "tech"
  | "strategic";

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

const VALID_PERSONAS = new Set(Object.keys(PERSONA_TO_AREA));
const VALID_AREAS = new Set<Area>([
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
]);

const CLASSIFIER_PROMPT =
  `Sei un classificatore di intent multi-area per un sistema AI di gestione di imprese edili italiane.

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

export async function classifyQuery(
  opts: ClassifyOptions,
): Promise<QueryClassification> {
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

  try {
    const r = await aiRouterComplete({
      supabase: opts.supabase,
      taskKey: "query_classifier",
      messages: [
        { role: "system", content: CLASSIFIER_PROMPT },
        {
          role: "user",
          content:
            `Query utente:\n${opts.query}\n\nPersona corrente: ${opts.currentPersona}\n\nClassifica.`,
        },
      ],
      params: { temperature: 0.1, max_tokens: 1500 },
      responseFormat: { type: "json_object" },
      companyId: opts.companyId ?? null,
      userId: opts.userId ?? null,
    });

    const raw = (r.content ?? "").replace(/^```(?:json)?\s*/i, "").replace(
      /```\s*$/i,
      "",
    ).trim();
    const first = raw.indexOf("{");
    const last = raw.lastIndexOf("}");
    if (first < 0 || last <= first) return fallback;

    const parsed = JSON.parse(raw.substring(first, last + 1)) as Partial<
      QueryClassification
    >;
    const primaryArea = isValidArea(parsed.primary_area)
      ? parsed.primary_area
      : fallback.primary_area;
    const involvedAreas = Array.isArray(parsed.involved_areas)
      ? Array.from(new Set(parsed.involved_areas.filter(isValidArea)))
      : fallback.involved_areas;
    const involvedPersonas = Array.isArray(parsed.involved_personas)
      ? Array.from(new Set(parsed.involved_personas.filter(isValidPersona)))
      : fallback.involved_personas;
    const decomposition = Array.isArray(parsed.decomposition)
      ? parsed.decomposition
        .filter((d) => isValidArea(d?.area) && isValidPersona(d?.persona_key))
        .slice(0, 4)
      : [];

    return {
      is_multi_area: parsed.is_multi_area === true && decomposition.length > 1,
      primary_area: primaryArea,
      involved_areas: involvedAreas.length > 0
        ? involvedAreas
        : fallback.involved_areas,
      involved_personas: involvedPersonas.length > 0
        ? involvedPersonas
        : fallback.involved_personas,
      decomposition,
      synthesis_required: parsed.synthesis_required === true &&
        decomposition.length > 1,
      estimated_complexity:
        (parsed.estimated_complexity as "simple" | "medium" | "complex") ??
          "simple",
    };
  } catch (e) {
    console.warn(
      "[queryClassifier] failed (fallback to single-area):",
      e instanceof Error ? e.message : e,
    );
    return fallback;
  }
}

function isValidArea(value: unknown): value is Area {
  return typeof value === "string" && VALID_AREAS.has(value as Area);
}

function isValidPersona(value: unknown): value is string {
  return typeof value === "string" && VALID_PERSONAS.has(value);
}
