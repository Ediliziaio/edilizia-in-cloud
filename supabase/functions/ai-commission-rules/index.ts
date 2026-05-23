import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { chat, InsufficientCreditsError } from "../_shared/ai-provider/index.ts";

interface RequestBody {
  company_id: string;
  prompt: string;
}

type RuleTrigger = "base" | "tier" | "bonus" | "malus" | "hold" | "payment_policy" | "quality";
type RuleBasis = "sold" | "collected" | "margin" | "revenue_period" | "errors" | "manual";

interface RuleDraft {
  name: string;
  description?: string | null;
  is_active?: boolean;
  priority?: number;
  scope?: "company" | "salesperson" | "order";
  trigger_type: RuleTrigger;
  basis: RuleBasis;
  condition: Record<string, unknown>;
  action: Record<string, unknown>;
  ai_prompt?: string | null;
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

const SYSTEM_PROMPT = `Sei un configuratore AI di regole provvigionali per aziende edili italiane.

Trasforma la descrizione libera dell'utente in regole JSON applicabili.
Non inventare condizioni non richieste. Se qualcosa e ambiguo, scegli l'interpretazione prudente e aggiungi una warning.

Schema output:
{
  "rules": [
    {
      "name": "string breve",
      "description": "string",
      "is_active": true,
      "priority": 40-120,
      "scope": "company",
      "trigger_type": "base|tier|bonus|malus|hold|payment_policy|quality",
      "basis": "sold|collected|margin|revenue_period|errors|manual",
      "condition": {},
      "action": {}
    }
  ],
  "warnings": ["string"]
}

Campi condition supportati:
- min_revenue: number
- min_margin_percent: number
- min_errors: number
- severity: "any|lieve|grave"
- collected_min_percent: number

Campi action supportati:
- commission_percent: number
- commission_fixed: number
- bonus_amount: number
- deduction_amount: number
- deduction_percent: number
- per_error: boolean
- hold_until_collected: boolean
- hold_commission: boolean

Esempi:
"4% sull'incassato" -> base, basis collected, action commission_percent 4.
"bonus 500 oltre 50k" -> bonus, basis revenue_period, condition min_revenue 50000, action bonus_amount 500.
"errore grave -150" -> malus, basis errors, condition min_errors 1 severity grave, action deduction_amount 150 per_error true.
"pagabile solo a saldo" -> payment_policy, basis collected, condition collected_min_percent 100, action hold_until_collected true.

Rispondi solo JSON valido.`;

const VALID_TRIGGERS = new Set(["base", "tier", "bonus", "malus", "hold", "payment_policy", "quality"]);
const VALID_BASIS = new Set(["sold", "collected", "margin", "revenue_period", "errors", "manual"]);

function asNumber(value: unknown, fallback = 0): number {
  const n = Number(value ?? fallback);
  return Number.isFinite(n) ? n : fallback;
}

function sanitizeRule(raw: Record<string, unknown>, prompt: string): RuleDraft | null {
  const trigger = String(raw.trigger_type ?? "");
  const basis = String(raw.basis ?? "");
  if (!VALID_TRIGGERS.has(trigger) || !VALID_BASIS.has(basis)) return null;

  const condition = typeof raw.condition === "object" && raw.condition !== null ? raw.condition as Record<string, unknown> : {};
  const action = typeof raw.action === "object" && raw.action !== null ? raw.action as Record<string, unknown> : {};

  return {
    name: String(raw.name ?? "Regola provvigionale").slice(0, 80),
    description: String(raw.description ?? "").slice(0, 220) || null,
    is_active: true,
    priority: Math.max(1, Math.min(999, Math.round(asNumber(raw.priority, 100)))),
    scope: "company",
    trigger_type: trigger as RuleTrigger,
    basis: basis as RuleBasis,
    condition,
    action,
    ai_prompt: prompt,
  };
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, corsHeaders);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401, corsHeaders);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: "unauthorized" }, 401, corsHeaders);

    const body = await req.json() as RequestBody;
    if (!body.company_id) return json({ error: "missing_company_id" }, 400, corsHeaders);
    if (!body.prompt || body.prompt.trim().length < 20) {
      return json({ error: "prompt_too_short" }, 400, corsHeaders);
    }

    const [profileRes, rolesRes] = await Promise.all([
      admin.from("profiles").select("company_id").eq("id", userData.user.id).maybeSingle(),
      admin.from("user_roles").select("role").eq("user_id", userData.user.id),
    ]);
    const isSuperAdmin = (rolesRes.data ?? []).some((role: { role: string }) => role.role === "super_admin");
    if (!isSuperAdmin && profileRes.data?.company_id !== body.company_id) {
      return json({ error: "forbidden" }, 403, corsHeaders);
    }

    const response = await chat({
      task_kind: "structured_extraction",
      company_id: body.company_id,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: body.prompt.trim() },
      ],
      max_tokens: 1800,
      temperature: 0.1,
      json_mode: true,
    } as never);

    const rawText = String(response?.content ?? "");
    const match = rawText.match(/\{[\s\S]*\}/);
    if (!match) return json({ error: "ai_invalid_output" }, 502, corsHeaders);

    let parsed: { rules?: unknown[]; warnings?: unknown[] };
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return json({ error: "ai_invalid_json" }, 502, corsHeaders);
    }

    const rules = Array.isArray(parsed.rules)
      ? parsed.rules
          .map((rule) => sanitizeRule(rule as Record<string, unknown>, body.prompt.trim()))
          .filter((rule): rule is RuleDraft => !!rule)
          .slice(0, 8)
      : [];

    return json({
      rules,
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map(String).slice(0, 5) : [],
    }, 200, corsHeaders);
  } catch (error) {
    if (error instanceof InsufficientCreditsError) {
      return json({ error: "insufficient_credits", message: error.user_message_it }, 402, corsHeaders);
    }
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: "internal_error", message }, 500, corsHeaders);
  }
});
