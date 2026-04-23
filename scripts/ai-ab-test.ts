// MP05 — A/B testing script per confrontare modelli OpenRouter.
// Uso:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     bun run scripts/ai-ab-test.ts --task=bot_operativo_operaio --n=5
//
// Output: tabella console + file ab-test-<task>-<ts>.json per analisi.

import fs from "node:fs";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "❌ Serve SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY nelle env vars",
  );
  process.exit(1);
}

// Parse CLI args --key=value
const args: Record<string, string> = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith("--"))
    .map((a) => {
      const [k, ...rest] = a.substring(2).split("=");
      return [k, rest.join("=")];
    }),
);

const TASK_KIND = args.task ?? "bot_operativo_operaio";
const N_SAMPLES = Number(args.n ?? 5);

interface Prompt {
  role: "system" | "user" | "assistant";
  content: string;
}

const TEST_PROMPTS: Record<string, Prompt[]> = {
  bot_operativo_operaio: [
    {
      role: "system",
      content:
        "Sei l'assistente di cantiere. Rispondi conciso in italiano.",
    },
    {
      role: "user",
      content: "oggi 8 ore cantiere Rossi, 50 mattoni e foto tetto",
    },
  ],
  bot_operativo_titolare: [
    {
      role: "system",
      content: "Sei l'assistente del titolare. Tono professionale, sintetico.",
    },
    {
      role: "user",
      content: "Come va il cantiere Villa Rossi?",
    },
  ],
  assistenza_clienti: [
    {
      role: "system",
      content:
        "Sei l'assistente clienti. Tono formale. Aiuta a risolvere o apri ticket.",
    },
    {
      role: "user",
      content: "Buongiorno, quando finite i lavori del bagno?",
    },
  ],
  lead_qualificazione: [
    {
      role: "system",
      content:
        "Sei un consulente commerciale edile. Qualifica il lead in 4-6 turni.",
    },
    { role: "user", content: "Ciao, mi interessa rifare il bagno" },
  ],
  parse_rapportino: [
    {
      role: "system",
      content:
        'Estrai dati rapportino in JSON: {"ore_lavorate":N, "cantiere":"...", "attivita":["..."]}',
    },
    { role: "user", content: "8 ore villa rossi ho messo la rete primo piano" },
  ],
};

const MODELS = [
  "anthropic/claude-sonnet-4",
  "anthropic/claude-haiku-4",
  "openai/gpt-4o",
  "openai/gpt-4o-mini",
  "moonshot/kimi-k2",
  "deepseek/deepseek-v3",
];

interface RunResult {
  ok: boolean;
  latency_ms: number;
  cost_usd: number;
  tokens: number;
  content_sample?: string;
  error?: string;
}

interface ModelStats {
  model: string;
  success_rate: number;
  avg_latency_ms: number;
  avg_cost_usd: number;
  avg_tokens: number;
  samples: RunResult[];
}

async function runOne(model: string): Promise<RunResult> {
  const start = Date.now();
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/functions/v1/ai-provider-test`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SERVICE_KEY}`,
        },
        body: JSON.stringify({
          task_kind: TASK_KIND,
          messages: TEST_PROMPTS[TASK_KIND] ?? TEST_PROMPTS.bot_operativo_operaio,
          model_override: model,
        }),
      },
    );
    const latency = Date.now() - start;
    const body = (await resp.json()) as Record<string, unknown>;
    if (!resp.ok) {
      return {
        ok: false,
        latency_ms: latency,
        cost_usd: 0,
        tokens: 0,
        error: String(body.error_message ?? body.error ?? "unknown"),
      };
    }
    return {
      ok: true,
      latency_ms: latency,
      cost_usd: Number(body.cost_usd ?? 0),
      tokens: Number(
        (body.usage as { total_tokens?: number } | undefined)?.total_tokens ?? 0,
      ),
      content_sample: String(body.content ?? "").substring(0, 80),
    };
  } catch (e) {
    return {
      ok: false,
      latency_ms: Date.now() - start,
      cost_usd: 0,
      tokens: 0,
      error: String(e),
    };
  }
}

async function main() {
  console.log(`\n🧪 A/B Test — task=${TASK_KIND} n=${N_SAMPLES}\n`);
  const results: ModelStats[] = [];

  for (const model of MODELS) {
    process.stdout.write(`  ${model.padEnd(32)} `);
    const runs: RunResult[] = [];
    for (let i = 0; i < N_SAMPLES; i++) {
      const r = await runOne(model);
      runs.push(r);
      process.stdout.write(r.ok ? "." : "✗");
      await new Promise((r) => setTimeout(r, 500));
    }
    process.stdout.write("\n");

    const okRuns = runs.filter((r) => r.ok);
    const safeDiv = (arr: number[]) =>
      arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

    results.push({
      model,
      success_rate: runs.length > 0 ? okRuns.length / runs.length : 0,
      avg_latency_ms: safeDiv(okRuns.map((r) => r.latency_ms)),
      avg_cost_usd: safeDiv(okRuns.map((r) => r.cost_usd)),
      avg_tokens: safeDiv(okRuns.map((r) => r.tokens)),
      samples: runs.slice(0, 2),
    });
  }

  console.log("\n═══════════════════════════════════════════");
  console.log(`REPORT — ${TASK_KIND}  (N=${N_SAMPLES})`);
  console.log("═══════════════════════════════════════════\n");
  console.table(
    results.map((r) => ({
      model: r.model,
      success: `${(r.success_rate * 100).toFixed(0)}%`,
      latency_ms: Math.round(r.avg_latency_ms),
      cost_usd: r.avg_cost_usd.toFixed(5),
      tokens: Math.round(r.avg_tokens),
    })),
  );

  const outPath = `ab-test-${TASK_KIND}-${Date.now()}.json`;
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\n📄 Risultati salvati in: ${outPath}`);
}

main().catch((e) => {
  console.error("❌", e);
  process.exit(1);
});
