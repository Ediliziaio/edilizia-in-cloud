import { useEffect, useMemo, useState } from "react";
import { BrainCircuit, Check, FlaskConical, Loader2, Search, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ChatMarkdown, type ChatMarkdownSource } from "@/components/ui/ChatMarkdown";
import { useAuth } from "@/contexts/AuthContext";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type OpenRouterModel = {
  id: string;
  name?: string;
  context_length?: number;
  pricing?: {
    prompt?: string;
    completion?: string;
    request?: string;
  };
};

type ModelResult = {
  model: string;
  ok: boolean;
  status?: "pending" | "done";
  reply?: string;
  error?: string;
  attempts?: Array<{ model: string; error: string }>;
  duration_ms?: number;
  model_used?: string;
  tokens_total?: number;
  cost_usd?: number;
  cost_real_eur?: number;
  tool_calls?: Array<{ name: string }>;
  rag_sources?: ChatMarkdownSource[];
};

type CompareResponse = {
  ok?: boolean;
  charge_mode?: string;
  results?: ModelResult[];
};

const MAX_SELECTED_MODELS = 6;

const FALLBACK_MODELS: OpenRouterModel[] = [
  { id: "anthropic/claude-haiku-4.5", name: "Claude Haiku 4.5" },
  { id: "moonshotai/kimi-k2.5", name: "Kimi K2.5" },
  { id: "moonshotai/kimi-k2.6", name: "Kimi K2.6" },
  { id: "anthropic/claude-sonnet-4.5", name: "Claude Sonnet 4.5" },
  { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro" },
  { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash" },
  { id: "openai/gpt-5.1", name: "GPT-5.1" },
  { id: "openai/gpt-5-mini", name: "GPT-5 Mini" },
  { id: "qwen/qwen3-max", name: "Qwen3 Max" },
  { id: "deepseek/deepseek-chat-v3.1", name: "DeepSeek Chat V3.1" },
];

const DEFAULT_SELECTED = [
  "anthropic/claude-haiku-4.5",
  "moonshotai/kimi-k2.5",
  "moonshotai/kimi-k2.6",
];

const DEFAULT_PROMPT =
  "Per Demo Azienda S.r.l., dimmi quanto dovrei fatturare il mese prossimo per coprire costi fissi, incassi previsti, rate scadute dei clienti, costi variabili delle commesse, merce/manodopera e margini attesi. Voglio scenari pratici e azioni prioritarie.";

const MODEL_RUN_TIMEOUT_MS = 125_000;
const MODEL_RUN_CONCURRENCY = 2;

function isDemoLabVisible(email?: string | null, role?: string | null, companyName?: string | null) {
  const normalizedEmail = String(email ?? "").trim().toLowerCase();
  const normalizedCompany = String(companyName ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (normalizedEmail === "demo@azienda.srl") return true;
  return role === "super_admin" && normalizedCompany.includes("demo azienda");
}

function formatMoney(value?: number) {
  if (!Number.isFinite(value ?? NaN)) return "n.d.";
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 4,
  }).format(value ?? 0);
}

function formatUsd(value?: number) {
  if (!Number.isFinite(value ?? NaN)) return "n.d.";
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 4,
  }).format(value ?? 0);
}

function formatContext(value?: number) {
  if (!value) return null;
  return `${Math.round(value / 1000).toLocaleString("it-IT")}k ctx`;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(`${label}: timeout dopo ${Math.round(timeoutMs / 1000)} secondi`));
    }, timeoutMs);

    promise
      .then(resolve)
      .catch(reject)
      .finally(() => window.clearTimeout(timer));
  });
}

function normalizeModelError(message: string) {
  const raw = String(message || "");
  if (/timeout|timed out|Signal timed out|non risponde/i.test(raw)) {
    return "Questo modello non ha risposto in tempo da OpenRouter. Non è un problema della chat: prova a rilanciarlo, ridurre il prompt o testare un altro modello.";
  }
  return raw
    .replace(/^Tutti i modelli falliti per task 'persona_silvio' \(\d+ tentativi\)\s*/i, "")
    .trim() || "Il modello non ha restituito una risposta valida.";
}

async function readFunctionErrorMessage(error: unknown): Promise<string> {
  const fallback = error instanceof Error ? error.message : String(error ?? "");
  const context = (error as { context?: unknown } | null)?.context;
  if (context instanceof Response) {
    try {
      const text = await context.clone().text();
      if (!text) return `${context.status} ${context.statusText}`.trim();
      try {
        const parsed = JSON.parse(text) as { error?: unknown; message?: unknown; code?: unknown };
        const message = parsed.error ?? parsed.message ?? parsed.code;
        if (message) return String(message);
      } catch {
        return text.slice(0, 500);
      }
    } catch {
      return `${context.status} ${context.statusText}`.trim() || fallback;
    }
  }
  return fallback;
}

function isFunctionUnavailableError(error: unknown, message: string) {
  const name = (error as { name?: string } | null)?.name ?? "";
  const raw = `${name} ${message}`;
  return (
    name === "FunctionsFetchError" ||
    /failed to send a request to the edge function/i.test(raw) ||
    /function not found|404/i.test(raw)
  );
}

function normalizeLabReply(content?: string) {
  return String(content ?? "")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/^[ \t]*#{1,6}\s*.*?Risposta\s+Certificata.*$/gim, "")
    .replace(/\bRisposta\s+Certificata\b/gi, "")
    .replace(/\n#{1,3}\s+Fonti\s*[\s\S]*$/i, "")
    .replace(/\s*\[S\d+\+?\]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<unknown>,
) {
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (cursor < items.length) {
        const item = items[cursor++];
        await worker(item);
      }
    }),
  );
}

export function AiModelTestDialog() {
  const { user, role, effectiveCompany } = useAuth();
  const companyId = useEffectiveCompanyId();
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState<OpenRouterModel[]>(FALLBACK_MODELS);
  const [loadingModels, setLoadingModels] = useState(false);
  const [query, setQuery] = useState("");
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [selected, setSelected] = useState<string[]>(DEFAULT_SELECTED);
  const [includeTools, setIncludeTools] = useState(true);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<ModelResult[]>([]);
  const [runError, setRunError] = useState<string | null>(null);

  const isLocalhost =
    typeof window !== "undefined" &&
    ["localhost", "127.0.0.1"].includes(window.location.hostname);
  const visible = isLocalhost || isDemoLabVisible(user?.email, role, effectiveCompany?.name);

  useEffect(() => {
    if (!open) return;

    const controller = new AbortController();
    const load = async () => {
      setLoadingModels(true);
      try {
        const res = await fetch("https://openrouter.ai/api/v1/models", {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`OpenRouter models ${res.status}`);
        const json = await res.json();
        const remoteModels = Array.isArray(json?.data) ? json.data as OpenRouterModel[] : [];
        const usable = remoteModels
          .filter((model) => model?.id && !model.id.includes(":free"))
          .map((model) => ({
            id: model.id,
            name: model.name ?? model.id,
            context_length: model.context_length,
            pricing: model.pricing,
          }));
        const merged = [...FALLBACK_MODELS, ...usable].filter(
          (model, index, arr) => arr.findIndex((item) => item.id === model.id) === index,
        );
        setModels(merged);
      } catch (err) {
        if (!controller.signal.aborted) {
          setModels(FALLBACK_MODELS);
        }
      } finally {
        if (!controller.signal.aborted) setLoadingModels(false);
      }
    };

    load();
    return () => controller.abort();
  }, [open]);

  const filteredModels = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return models.slice(0, 80);
    return models
      .filter((model) => {
        const label = `${model.name ?? ""} ${model.id}`.toLowerCase();
        return label.includes(q);
      })
      .slice(0, 120);
  }, [models, query]);

  if (!visible) return null;

  const toggleModel = (modelId: string) => {
    setSelected((current) => {
      if (current.includes(modelId)) return current.filter((id) => id !== modelId);
      if (current.length >= MAX_SELECTED_MODELS) {
        toast.warning(`Puoi confrontare massimo ${MAX_SELECTED_MODELS} modelli per volta.`);
        return current;
      }
      return [...current, modelId];
    });
  };

  const runComparison = async () => {
    if (!companyId) {
      toast.error("Azienda non pronta: ricarica la pagina e riprova.");
      return;
    }
    if (!prompt.trim()) {
      toast.error("Scrivi un prompt da testare.");
      return;
    }
    if (selected.length === 0) {
      toast.error("Seleziona almeno un modello.");
      return;
    }

    const modelsToRun = [...selected];
    setRunning(true);
    setRunError(null);
    setResults(modelsToRun.map((model) => ({ model, ok: false, status: "pending" })));

    const runOne = async (model: string) => {
      try {
        const { data, error } = await withTimeout(
          supabase.functions.invoke<CompareResponse>("ai-model-test-lab", {
            body: {
              action: "compare",
              company_id: companyId,
              prompt: prompt.trim(),
              models: [model],
              include_tools: includeTools,
            },
            timeout: MODEL_RUN_TIMEOUT_MS,
          }),
          MODEL_RUN_TIMEOUT_MS + 5_000,
          model,
        );

        if (error) throw error;
        if (!data?.ok || !Array.isArray(data.results) || !data.results[0]) {
          throw new Error("Risposta non valida dalla function ai-model-test-lab.");
        }

        const nextResult = {
          ...data.results[0],
          reply: normalizeLabReply(data.results[0].reply),
          status: "done" as const,
        };
        setResults((current) => current.map((item) => item.model === model ? nextResult : item));
      } catch (err) {
        const msg = await readFunctionErrorMessage(err);
        const looksLikeTimeout = /timeout|timed out|Signal timed out|non risponde/i.test(msg);
        const functionUnavailable = !looksLikeTimeout && isFunctionUnavailableError(err, msg);
        const errorMessage = functionUnavailable
          ? "La function ai-model-test-lab non è attiva su Supabase o non è raggiungibile dal localhost."
          : normalizeModelError(msg);

        setResults((current) =>
          current.map((item) =>
            item.model === model
              ? { model, ok: false, status: "done", error: errorMessage }
              : item,
          ),
        );
        return errorMessage;
      }
      return null;
    };

    try {
      const failures: string[] = [];
      await runWithConcurrency(modelsToRun, MODEL_RUN_CONCURRENCY, async (model) => {
        const failure = await runOne(model);
        if (failure) failures.push(failure);
      });
      if (failures.length === modelsToRun.length) {
        setRunError("Tutti i modelli hanno fallito. Prova a spegnere i tool oppure scegli modelli diversi.");
      }
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-10 rounded-xl border-orange-200 bg-orange-50 px-3 text-xs font-semibold text-orange-700 hover:bg-orange-100 hover:text-orange-800"
          title="Confronta modelli AI su Demo Azienda"
        >
          <FlaskConical className="mr-1.5 h-4 w-4" />
          AI Test
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[88vh] w-[96vw] max-w-[1500px] flex-col overflow-hidden p-0">
        <DialogHeader className="border-b px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-100 text-orange-700">
              <BrainCircuit className="h-5 w-5" />
            </span>
            <div>
              <DialogTitle>AI Test Lab</DialogTitle>
              <DialogDescription>
                Confronto locale per Demo Azienda: scegli i modelli, lancia lo stesso prompt e confronta qualità, tempi e costo reale.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[300px_1fr]">
          <aside className="min-h-0 border-b bg-slate-50/80 p-4 lg:border-b-0 lg:border-r">
            <div className="mb-3 flex items-center gap-2 rounded-lg border bg-white px-2">
              <Search className="h-4 w-4 text-slate-400" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cerca modello OpenRouter..."
                className="h-9 border-0 px-0 shadow-none focus-visible:ring-0"
              />
            </div>

            <div className="mb-3 flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Modelli selezionati {selected.length}/{MAX_SELECTED_MODELS}
              </div>
              {loadingModels && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
            </div>

            <ScrollArea className="h-[260px] rounded-lg border bg-white lg:h-[560px]">
              <div className="space-y-1 p-2">
                {filteredModels.map((model) => {
                  const checked = selected.includes(model.id);
                  return (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => toggleModel(model.id)}
                      className={cn(
                        "w-full rounded-md border px-2.5 py-2 text-left transition",
                        checked
                          ? "border-orange-300 bg-orange-50 text-orange-950"
                          : "border-transparent hover:border-slate-200 hover:bg-slate-50",
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <span
                          className={cn(
                            "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                            checked ? "border-orange-500 bg-orange-500 text-white" : "border-slate-300 bg-white",
                          )}
                        >
                          {checked && <Check className="h-3.5 w-3.5" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{model.name ?? model.id}</span>
                          <span className="block truncate text-[11px] text-slate-500">{model.id}</span>
                          {formatContext(model.context_length) && (
                            <span className="mt-1 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                              {formatContext(model.context_length)}
                            </span>
                          )}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </aside>

          <main className="min-h-0 overflow-y-auto p-4">
            <div className="space-y-4">
              <Card className="rounded-lg border-slate-200 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Prompt di test</p>
                    <p className="text-xs text-slate-500">Non sporca la chat normale e non addebita il wallet se la function usa `skipCharge`.</p>
                  </div>
                  <div className="flex items-center gap-2 rounded-full border bg-white px-3 py-1.5">
                    <Switch checked={includeTools} onCheckedChange={setIncludeTools} />
                    <span className="text-xs font-medium text-slate-600">Tool lettura/calcolo</span>
                  </div>
                </div>
                <Textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  className="min-h-[130px] resize-y"
                />
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    {selected.map((model) => (
                      <Badge key={model} variant="secondary" className="gap-1 rounded-full">
                        {model}
                        <button type="button" onClick={() => toggleModel(model)} aria-label={`Rimuovi ${model}`}>
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                  <Button
                    type="button"
                    onClick={runComparison}
                    disabled={running || selected.length === 0 || !prompt.trim()}
                    className="bg-orange-500 hover:bg-orange-600"
                  >
                    {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FlaskConical className="mr-2 h-4 w-4" />}
                    Lancia confronto
                  </Button>
                </div>
              </Card>

              {runError && (
              <Card className="rounded-lg border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  {runError}
                </Card>
              )}

              {results.length > 0 && (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {results.map((result) => (
                    <Card key={result.model} className="flex min-h-[360px] flex-col overflow-hidden rounded-lg border-slate-200 bg-[#f7f3ea]">
                      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-orange-100 bg-white/75">
                        <div className="min-w-0 p-3">
                          <p className="font-semibold text-slate-900">{result.model_used ?? result.model}</p>
                          <p className="text-xs text-slate-500">{result.model}</p>
                        </div>
                        <div className="flex flex-wrap justify-end gap-1.5 p-3 text-[11px]">
                          <Badge variant={result.status === "pending" ? "outline" : result.ok ? "secondary" : "destructive"}>
                            {result.status === "pending" ? "In corso" : result.ok ? "OK" : "Errore"}
                          </Badge>
                          {result.model_used === result.model && (
                            <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                              modello esatto
                            </Badge>
                          )}
                          {result.model_used && result.model_used !== result.model && (
                            <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                              usato fallback
                            </Badge>
                          )}
                        </div>
                      </div>
                      {result.status === "pending" ? (
                        <div className="m-4 flex flex-1 items-center justify-center rounded-2xl border border-dashed border-orange-200 bg-white/70 p-6 text-sm text-slate-500">
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Sto generando questa risposta...
                        </div>
                      ) : result.ok ? (
                        <div className="flex flex-1 flex-col p-4">
                          <div className="flex items-end gap-2">
                            <span className="mb-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-500 text-xs font-bold text-white shadow-sm">
                              S
                            </span>
                            <div className="min-w-0 flex-1 rounded-2xl rounded-bl-md border border-[#f4dfbd] bg-[#fff8ed] px-4 py-3 text-[14px] leading-relaxed text-slate-900 shadow-sm">
                              <ScrollArea className="h-[500px] pr-3">
                                <ChatMarkdown content={normalizeLabReply(result.reply)} />
                              </ScrollArea>
                            </div>
                          </div>
                          <div className="ml-10 mt-2 flex flex-wrap gap-1.5 text-[11px] text-slate-500">
                            <span>{result.duration_ms ?? 0} ms</span>
                            <span>·</span>
                            <span>{result.tokens_total ?? 0} token</span>
                            <span>·</span>
                            <span>{formatUsd(result.cost_usd)}</span>
                            <span>·</span>
                            <span>{formatMoney(result.cost_real_eur)}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="m-4 space-y-2 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
                          <p className="font-medium">{normalizeModelError(result.error ?? "Errore modello")}</p>
                          {Array.isArray(result.attempts) && result.attempts.length > 0 && (
                            <details className="rounded-md border border-red-100 bg-white/60 p-2 text-xs text-red-800">
                              <summary className="cursor-pointer font-semibold">Dettaglio tecnico</summary>
                              {result.attempts.map((attempt) => (
                                <p key={`${result.model}-${attempt.model}`}>
                                  <span className="font-semibold">{attempt.model}</span>: {attempt.error}
                                </p>
                              ))}
                            </details>
                          )}
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </main>
        </div>
      </DialogContent>
    </Dialog>
  );
}
