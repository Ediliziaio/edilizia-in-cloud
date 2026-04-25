/**
 * AIPricingValidator — pannello unificato di validazione & pricing per TUTTI i
 * sistemi AI della piattaforma.
 *
 * RISOLVE: avere un solo posto dove super-admin vede e modifica i listini di
 * tutte le AI (render, chat, voice, vision, automazioni) invece di un pannello
 * isolato solo per il render.
 *
 * STRUTTURA:
 *   ├─ Catalogo pricing ufficiale (cheat-sheet 14 modelli, link doc provider)
 *   └─ Tabs:
 *       ├─ Render API     → tabella `render_provider_pricing`
 *       │                   (letta da generate-render/_shared/renderCost.ts)
 *       ├─ Markup per Task → tabella `ai_pricing_markup`
 *       │                   (letta da _shared/ai-provider/billing.ts)
 *       └─ Agenti AI       → tabella `ai_agent_pricing`
 *                            (Anthropic Haiku/Sonnet, ElevenLabs voice)
 *
 * Le edit sono inline (no dialog) per essere veloci. Toast in caso di
 * successo/errore. Le modifiche sono in real-time per le edge function:
 * la prossima invocazione AI userà i nuovi valori.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Calculator, ChevronDown, ChevronUp, Edit2, Info, Loader2, Save, X, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { formatError } from "@/lib/errors";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface RenderPricingRow {
  id: string;
  provider_key: string;
  model: string;
  pricing_mode: "per_image" | "per_token" | "hybrid";
  price_input_image_eur: number;
  price_input_token_eur: number;
  price_output_image_eur: number;
  price_output_token_eur: number;
  fallback_cost_per_call_eur: number;
  effective_from: string;
  effective_to: string | null;
  notes: string | null;
}

interface MarkupRow {
  id: string;
  task_kind: string;
  display_label: string;
  markup_multiplier: number;
  min_charge_eur: number;
  description: string | null;
  enabled: boolean;
}

interface AgentPricingRow {
  id: string;
  provider: string;
  label: string | null;
  model_tier: "standard" | "advanced" | "voice";
  cost_real_per_unit: number;
  cost_billed_per_unit: number;
  markup_multiplier: number;
  unit_label: string;
  is_active: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// REFERENCE CATALOG — prezzi ufficiali noti per confronto
// ─────────────────────────────────────────────────────────────────────────────

type PricingRef = {
  label: string;
  url: string;
  notes: string;
  category: "image" | "chat" | "voice" | "transcription" | "embedding" | "vision";
  example_eur: number; // valore tipico "per unità di output"
};

const OFFICIAL_PRICING_REFERENCE: Record<string, PricingRef> = {
  // ── Image generation ──
  "openai/gpt-image-1": {
    label: "OpenAI gpt-image-1 (1024×1024 HQ)",
    url: "https://platform.openai.com/docs/pricing",
    notes: "$40/1M output tokens · ~1500–3000 token/HQ → ~$0.06–0.12/render",
    category: "image",
    example_eur: 0.085,
  },
  "openai/dall-e-2": {
    label: "OpenAI dall-e-2 (1024×1024)",
    url: "https://platform.openai.com/docs/pricing",
    notes: "$0.020/immagine fissa",
    category: "image",
    example_eur: 0.019,
  },
  "openai/dall-e-3": {
    label: "OpenAI dall-e-3 (1024×1024 HQ)",
    url: "https://platform.openai.com/docs/pricing",
    notes: "$0.080/immagine HQ",
    category: "image",
    example_eur: 0.075,
  },
  "gemini/gemini-2.5-flash-image": {
    label: "Gemini 2.5 Flash Image",
    url: "https://ai.google.dev/pricing",
    notes: "$0.039/output image (~1290 token)",
    category: "image",
    example_eur: 0.037,
  },

  // ── Chat completions ──
  "openai/gpt-4o": {
    label: "OpenAI gpt-4o",
    url: "https://platform.openai.com/docs/pricing",
    notes: "$2.50/1M input · $10/1M output",
    category: "chat",
    example_eur: 0.0075,
  },
  "openai/gpt-4o-mini": {
    label: "OpenAI gpt-4o-mini (low-cost)",
    url: "https://platform.openai.com/docs/pricing",
    notes: "$0.15/1M input · $0.60/1M output",
    category: "chat",
    example_eur: 0.0004,
  },
  "anthropic/claude-3-5-sonnet": {
    label: "Anthropic Claude 3.5 Sonnet",
    url: "https://www.anthropic.com/pricing",
    notes: "$3/1M input · $15/1M output",
    category: "chat",
    example_eur: 0.009,
  },
  "anthropic/claude-3-5-haiku": {
    label: "Anthropic Claude 3.5 Haiku",
    url: "https://www.anthropic.com/pricing",
    notes: "$0.80/1M input · $4/1M output",
    category: "chat",
    example_eur: 0.0024,
  },
  "gemini/gemini-2.0-flash": {
    label: "Gemini 2.0 Flash",
    url: "https://ai.google.dev/pricing",
    notes: "$0.10/1M input · $0.40/1M output",
    category: "chat",
    example_eur: 0.0003,
  },

  // ── Voice / TTS ──
  "elevenlabs/eleven_multilingual_v2": {
    label: "ElevenLabs Multilingual v2",
    url: "https://elevenlabs.io/pricing",
    notes: "$0.30/1K char (~$0.02/messaggio breve)",
    category: "voice",
    example_eur: 0.018,
  },
  "elevenlabs/eleven_turbo_v2_5": {
    label: "ElevenLabs Turbo v2.5",
    url: "https://elevenlabs.io/pricing",
    notes: "Latenza ridotta · $0.50/1K char realtime",
    category: "voice",
    example_eur: 0.030,
  },

  // ── Transcription ──
  "openai/whisper-1": {
    label: "OpenAI Whisper",
    url: "https://platform.openai.com/docs/pricing",
    notes: "$0.006/minuto audio",
    category: "transcription",
    example_eur: 0.0056,
  },

  // ── Embeddings ──
  "openai/text-embedding-3-small": {
    label: "OpenAI Embedding 3 small",
    url: "https://platform.openai.com/docs/pricing",
    notes: "$0.020/1M token (RAG, semantic search)",
    category: "embedding",
    example_eur: 0.000019,
  },
  "openai/text-embedding-3-large": {
    label: "OpenAI Embedding 3 large",
    url: "https://platform.openai.com/docs/pricing",
    notes: "$0.130/1M token (RAG premium)",
    category: "embedding",
    example_eur: 0.000122,
  },

  // ── Vision ──
  "openai/gpt-4o-vision": {
    label: "OpenAI gpt-4o (vision)",
    url: "https://platform.openai.com/docs/pricing",
    notes: "Tile 512×512: ~85 input token (OCR documenti)",
    category: "vision",
    example_eur: 0.0008,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function refKey(p: { provider_key: string; model: string }) {
  return `${p.provider_key}/${p.model}`;
}

function fmtEur(n: number, digits = 6) {
  return `${n.toFixed(digits)} €`;
}

const parseNum = (v: string) => {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

// Generic Supabase typed-helpers wrapper (le tabelle usano nomi che Supabase
// types non genera — usiamo unknown cast per evitare any)
type SupabaseAny = unknown;

// ─────────────────────────────────────────────────────────────────────────────
// TAB 1 — RENDER PRICING (render_provider_pricing)
// ─────────────────────────────────────────────────────────────────────────────

interface RenderDraft {
  price_output_image_eur: string;
  price_input_token_eur: string;
  price_output_token_eur: string;
  fallback_cost_per_call_eur: string;
}

function RenderPricingTab() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<RenderDraft | null>(null);

  const pricingQuery = useQuery({
    queryKey: ["admin", "render-provider-pricing"],
    queryFn: async (): Promise<RenderPricingRow[]> => {
      const { data, error } = await (supabase as SupabaseAny as {
        from: (t: string) => {
          select: (c: string) => {
            is: (col: string, v: null) => {
              order: (col: string, opts: { ascending: boolean }) => Promise<{
                data: RenderPricingRow[] | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
      })
        .from("render_provider_pricing")
        .select(
          "id, provider_key, model, pricing_mode, price_input_image_eur, price_input_token_eur, price_output_image_eur, price_output_token_eur, fallback_cost_per_call_eur, effective_from, effective_to, notes",
        )
        .is("effective_to", null)
        .order("provider_key", { ascending: true });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    staleTime: 60_000,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Partial<RenderPricingRow> }) => {
      const { error } = await (supabase as SupabaseAny as {
        from: (t: string) => {
          update: (p: Partial<RenderPricingRow>) => {
            eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
          };
        };
      })
        .from("render_provider_pricing")
        .update(payload)
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "render-provider-pricing"] });
      toast.success("Pricing render aggiornato", {
        description: "I prossimi render useranno questi valori. Quelli già salvati restano frozen.",
      });
      setEditingId(null);
      setDraft(null);
    },
    onError: (e: Error) => toast.error(formatError(e)),
  });

  const startEdit = (row: RenderPricingRow) => {
    setEditingId(row.id);
    setDraft({
      price_output_image_eur: row.price_output_image_eur.toString(),
      price_input_token_eur: row.price_input_token_eur.toString(),
      price_output_token_eur: row.price_output_token_eur.toString(),
      fallback_cost_per_call_eur: row.fallback_cost_per_call_eur.toString(),
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(null);
  };

  const saveEdit = (id: string) => {
    if (!draft) return;
    updateMutation.mutate({
      id,
      payload: {
        price_output_image_eur: parseNum(draft.price_output_image_eur),
        price_input_token_eur: parseNum(draft.price_input_token_eur),
        price_output_token_eur: parseNum(draft.price_output_token_eur),
        fallback_cost_per_call_eur: parseNum(draft.fallback_cost_per_call_eur),
      },
    });
  };

  const rows = useMemo(() => {
    return (pricingQuery.data ?? []).map((row) => {
      const ref = OFFICIAL_PRICING_REFERENCE[refKey(row)];
      const configured = Number(row.price_output_image_eur || row.fallback_cost_per_call_eur);
      const reference = ref?.example_eur ?? null;
      const diffPct = reference != null && reference > 0
        ? ((configured - reference) / reference) * 100
        : null;
      return { ...row, ref, configured, reference, diffPct };
    });
  }, [pricingQuery.data]);

  return (
    <div className="space-y-3">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-xs">
          Tabella <code className="bg-muted px-1 rounded">render_provider_pricing</code>.
          Letta da <code className="bg-muted px-1 rounded">generate-render</code> in tempo reale per calcolare{" "}
          <code className="bg-muted px-1 rounded">cost_real_api</code> usando token usage del provider.
          ⚠️ I render già salvati restano con il loro costo frozen.
        </AlertDescription>
      </Alert>

      {pricingQuery.isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : pricingQuery.error ? (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between gap-2">
            <span>Errore: {formatError(pricingQuery.error)}</span>
            <Button size="sm" variant="outline" onClick={() => pricingQuery.refetch()}>
              <RefreshCw className="h-3 w-3 mr-1" /> Riprova
            </Button>
          </AlertDescription>
        </Alert>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground py-6 text-center">
          Nessuna riga di pricing render. Fallback su{" "}
          <code className="bg-muted px-1 rounded">render_provider_config.cost_real_per_render</code>.
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const isEditing = editingId === row.id;
            const ref = row.ref;
            return (
              <div key={row.id} className="rounded-lg border p-3 bg-muted/20">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="font-mono text-xs">
                        {row.provider_key}/{row.model}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px] capitalize">
                        {row.pricing_mode.replace("_", " ")}
                      </Badge>
                      {row.diffPct != null && (
                        <Badge
                          variant={Math.abs(row.diffPct) > 30 ? "destructive" : Math.abs(row.diffPct) > 10 ? "default" : "secondary"}
                          className="text-[10px]"
                          title="Discrepanza vs prezzo ufficiale"
                        >
                          {row.diffPct > 0 ? "+" : ""}{row.diffPct.toFixed(0)}% vs ufficiale
                        </Badge>
                      )}
                    </div>
                    {row.notes && (
                      <p className="text-[11px] text-muted-foreground mt-1 italic">{row.notes}</p>
                    )}
                  </div>
                  {!isEditing && (
                    <Button size="sm" variant="ghost" onClick={() => startEdit(row)} className="h-7 gap-1 text-xs">
                      <Edit2 className="h-3 w-3" /> Modifica
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-xs">
                  <FieldEdit
                    label="€/immagine output"
                    isEditing={isEditing}
                    value={isEditing ? draft!.price_output_image_eur : row.price_output_image_eur}
                    onChange={(v) => setDraft((d) => d ? { ...d, price_output_image_eur: v } : d)}
                    referenceValue={ref?.example_eur}
                  />
                  <FieldEdit
                    label="€/token input"
                    isEditing={isEditing}
                    value={isEditing ? draft!.price_input_token_eur : row.price_input_token_eur}
                    onChange={(v) => setDraft((d) => d ? { ...d, price_input_token_eur: v } : d)}
                    digits={10}
                  />
                  <FieldEdit
                    label="€/token output"
                    isEditing={isEditing}
                    value={isEditing ? draft!.price_output_token_eur : row.price_output_token_eur}
                    onChange={(v) => setDraft((d) => d ? { ...d, price_output_token_eur: v } : d)}
                    digits={10}
                  />
                  <FieldEdit
                    label="Fallback per call"
                    isEditing={isEditing}
                    value={isEditing ? draft!.fallback_cost_per_call_eur : row.fallback_cost_per_call_eur}
                    onChange={(v) => setDraft((d) => d ? { ...d, fallback_cost_per_call_eur: v } : d)}
                  />
                </div>

                {ref && (
                  <div className="mt-3 pt-2 border-t border-dashed text-[11px] text-muted-foreground">
                    <p>
                      🔗 <strong className="text-foreground">{ref.label}</strong> —{" "}
                      <a href={ref.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                        docs ufficiali ↗
                      </a>
                    </p>
                    <p className="mt-0.5">{ref.notes}</p>
                    <p className="mt-0.5">
                      Stima ufficiale: <code className="bg-muted px-1 rounded">{fmtEur(ref.example_eur, 4)}</code>
                    </p>
                  </div>
                )}

                {isEditing && (
                  <div className="mt-3 flex items-center gap-2 justify-end pt-2 border-t">
                    <Button size="sm" variant="ghost" onClick={cancelEdit} disabled={updateMutation.isPending} className="h-7 gap-1 text-xs">
                      <X className="h-3 w-3" /> Annulla
                    </Button>
                    <Button size="sm" onClick={() => saveEdit(row.id)} disabled={updateMutation.isPending} className="h-7 gap-1 text-xs">
                      {updateMutation.isPending ? (
                        <><Loader2 className="h-3 w-3 animate-spin" /> Salvo…</>
                      ) : (
                        <><Save className="h-3 w-3" /> Salva</>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 2 — MARKUP PER TASK (ai_pricing_markup)
// ─────────────────────────────────────────────────────────────────────────────

interface MarkupDraft {
  markup_multiplier: string;
  min_charge_eur: string;
}

function MarkupTab() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<MarkupDraft | null>(null);

  const markupQuery = useQuery({
    queryKey: ["admin", "ai-pricing-markup"],
    queryFn: async (): Promise<MarkupRow[]> => {
      const { data, error } = await (supabase as SupabaseAny as {
        from: (t: string) => {
          select: (c: string) => {
            order: (col: string, opts: { ascending: boolean }) => Promise<{
              data: MarkupRow[] | null;
              error: { message: string } | null;
            }>;
          };
        };
      })
        .from("ai_pricing_markup")
        .select("id, task_kind, display_label, markup_multiplier, min_charge_eur, description, enabled")
        .order("markup_multiplier", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    staleTime: 60_000,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Partial<MarkupRow> }) => {
      const { error } = await (supabase as SupabaseAny as {
        from: (t: string) => {
          update: (p: Partial<MarkupRow>) => {
            eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
          };
        };
      })
        .from("ai_pricing_markup")
        .update(payload)
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "ai-pricing-markup"] });
      toast.success("Markup aggiornato", {
        description: "Le prossime chiamate AI applicheranno il nuovo moltiplicatore.",
      });
      setEditingId(null);
      setDraft(null);
    },
    onError: (e: Error) => toast.error(formatError(e)),
  });

  const startEdit = (row: MarkupRow) => {
    setEditingId(row.id);
    setDraft({
      markup_multiplier: row.markup_multiplier.toString(),
      min_charge_eur: row.min_charge_eur.toString(),
    });
  };

  return (
    <div className="space-y-3">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-xs">
          Tabella <code className="bg-muted px-1 rounded">ai_pricing_markup</code>.
          Letta da <code className="bg-muted px-1 rounded">deduct_ai_credits_with_markup</code> per applicare il
          margine al costo reale del provider in base al tipo di task.
        </AlertDescription>
      </Alert>

      {markupQuery.isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : markupQuery.error ? (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between gap-2">
            <span>Errore: {formatError(markupQuery.error)}</span>
            <Button size="sm" variant="outline" onClick={() => markupQuery.refetch()}>
              <RefreshCw className="h-3 w-3 mr-1" /> Riprova
            </Button>
          </AlertDescription>
        </Alert>
      ) : (markupQuery.data ?? []).length === 0 ? (
        <p className="text-xs text-muted-foreground py-6 text-center">
          Nessuna policy markup configurata. Esegui la migration MP05.
        </p>
      ) : (
        <div className="rounded-lg border divide-y">
          {(markupQuery.data ?? []).map((row) => {
            const isEditing = editingId === row.id;
            return (
              <div key={row.id} className="px-3 py-2.5 hover:bg-muted/20">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium">{row.display_label}</p>
                      <Badge variant="outline" className="font-mono text-[10px]">{row.task_kind}</Badge>
                      {!row.enabled && <Badge variant="destructive" className="text-[10px]">Disattivo</Badge>}
                    </div>
                    {row.description && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">{row.description}</p>
                    )}
                  </div>

                  {!isEditing ? (
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-mono text-sm font-semibold tabular-nums">
                        ×{Number(row.markup_multiplier).toFixed(2)}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        min {fmtEur(Number(row.min_charge_eur), 4)}
                      </span>
                      <Button size="sm" variant="ghost" onClick={() => startEdit(row)} className="h-7 gap-1 text-xs">
                        <Edit2 className="h-3 w-3" /> Modifica
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      <div className="flex flex-col">
                        <label className="text-[9px] uppercase text-muted-foreground tracking-wide">Markup ×</label>
                        <Input
                          type="number"
                          step="0.1"
                          min="1"
                          max="20"
                          value={draft!.markup_multiplier}
                          onChange={(e) => setDraft((d) => d ? { ...d, markup_multiplier: e.target.value } : d)}
                          className="h-7 w-20 font-mono text-xs"
                        />
                      </div>
                      <div className="flex flex-col">
                        <label className="text-[9px] uppercase text-muted-foreground tracking-wide">Min €</label>
                        <Input
                          type="number"
                          step="0.001"
                          min="0"
                          value={draft!.min_charge_eur}
                          onChange={(e) => setDraft((d) => d ? { ...d, min_charge_eur: e.target.value } : d)}
                          className="h-7 w-24 font-mono text-xs"
                        />
                      </div>
                      <div className="flex gap-1 self-end">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => { setEditingId(null); setDraft(null); }}
                          disabled={updateMutation.isPending}
                          className="h-7 gap-1 text-xs"
                        >
                          <X className="h-3 w-3" /> Annulla
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => {
                            if (!draft) return;
                            const m = parseNum(draft.markup_multiplier);
                            if (m < 1 || m > 20) {
                              toast.error("Markup deve essere tra 1.0 e 20.0");
                              return;
                            }
                            updateMutation.mutate({
                              id: row.id,
                              payload: {
                                markup_multiplier: m,
                                min_charge_eur: parseNum(draft.min_charge_eur),
                              },
                            });
                          }}
                          disabled={updateMutation.isPending}
                          className="h-7 gap-1 text-xs"
                        >
                          {updateMutation.isPending ? (
                            <><Loader2 className="h-3 w-3 animate-spin" /> Salvo…</>
                          ) : (
                            <><Save className="h-3 w-3" /> Salva</>
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 3 — AGENTI AI (ai_agent_pricing)
// ─────────────────────────────────────────────────────────────────────────────

interface AgentDraft {
  cost_real_per_unit: string;
  cost_billed_per_unit: string;
  markup_multiplier: string;
}

function AgentPricingTab() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AgentDraft | null>(null);

  const agentQuery = useQuery({
    queryKey: ["admin", "ai-agent-pricing"],
    queryFn: async (): Promise<AgentPricingRow[]> => {
      const { data, error } = await (supabase as SupabaseAny as {
        from: (t: string) => {
          select: (c: string) => {
            order: (col: string, opts: { ascending: boolean }) => Promise<{
              data: AgentPricingRow[] | null;
              error: { message: string } | null;
            }>;
          };
        };
      })
        .from("ai_agent_pricing")
        .select("id, provider, label, model_tier, cost_real_per_unit, cost_billed_per_unit, markup_multiplier, unit_label, is_active")
        .order("provider", { ascending: true });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    staleTime: 60_000,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Partial<AgentPricingRow> }) => {
      const { error } = await (supabase as SupabaseAny as {
        from: (t: string) => {
          update: (p: Partial<AgentPricingRow>) => {
            eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
          };
        };
      })
        .from("ai_agent_pricing")
        .update(payload)
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "ai-agent-pricing"] });
      toast.success("Listino agente AI aggiornato");
      setEditingId(null);
      setDraft(null);
    },
    onError: (e: Error) => toast.error(formatError(e)),
  });

  const startEdit = (row: AgentPricingRow) => {
    setEditingId(row.id);
    setDraft({
      cost_real_per_unit: row.cost_real_per_unit.toString(),
      cost_billed_per_unit: row.cost_billed_per_unit.toString(),
      markup_multiplier: row.markup_multiplier.toString(),
    });
  };

  return (
    <div className="space-y-3">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-xs">
          Tabella <code className="bg-muted px-1 rounded">ai_agent_pricing</code>.
          Listino per agenti AI conversazionali (Anthropic Haiku/Sonnet, ElevenLabs voice).
          Markup applicato dal motore di billing per calcolare il costo addebitato all'azienda.
        </AlertDescription>
      </Alert>

      {agentQuery.isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : agentQuery.error ? (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between gap-2">
            <span>Errore: {formatError(agentQuery.error)}</span>
            <Button size="sm" variant="outline" onClick={() => agentQuery.refetch()}>
              <RefreshCw className="h-3 w-3 mr-1" /> Riprova
            </Button>
          </AlertDescription>
        </Alert>
      ) : (agentQuery.data ?? []).length === 0 ? (
        <p className="text-xs text-muted-foreground py-6 text-center">
          Nessun listino agente configurato.
        </p>
      ) : (
        <div className="rounded-lg border divide-y">
          {(agentQuery.data ?? []).map((row) => {
            const isEditing = editingId === row.id;
            const margin = Number(row.cost_billed_per_unit) - Number(row.cost_real_per_unit);
            const marginPct = Number(row.cost_billed_per_unit) > 0
              ? (margin / Number(row.cost_billed_per_unit)) * 100
              : 0;
            return (
              <div key={row.id} className="px-3 py-2.5 hover:bg-muted/20">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium">{row.label ?? row.provider}</p>
                      <Badge variant="outline" className="font-mono text-[10px]">{row.provider}</Badge>
                      <Badge variant="secondary" className="text-[10px] capitalize">{row.model_tier}</Badge>
                      {!row.is_active && <Badge variant="destructive" className="text-[10px]">Disattivo</Badge>}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Unità: <code className="bg-muted px-1 rounded">{row.unit_label}</code>
                    </p>
                  </div>

                  {!isEditing ? (
                    <div className="flex items-center gap-3 shrink-0 flex-wrap">
                      <div className="text-right">
                        <p className="text-[10px] text-muted-foreground">Costo reale</p>
                        <p className="font-mono text-xs">{fmtEur(Number(row.cost_real_per_unit), 4)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-muted-foreground">Addebitato</p>
                        <p className="font-mono text-xs">{fmtEur(Number(row.cost_billed_per_unit), 4)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-muted-foreground">Margine</p>
                        <p className={cn("font-mono text-xs font-semibold", margin > 0 ? "text-emerald-600" : "text-destructive")}>
                          {marginPct.toFixed(0)}%
                        </p>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => startEdit(row)} className="h-7 gap-1 text-xs">
                        <Edit2 className="h-3 w-3" /> Modifica
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-end gap-2 shrink-0 flex-wrap">
                      <div className="flex flex-col">
                        <label className="text-[9px] uppercase text-muted-foreground tracking-wide">Costo reale</label>
                        <Input
                          type="number"
                          step="0.0001"
                          min="0"
                          value={draft!.cost_real_per_unit}
                          onChange={(e) => setDraft((d) => d ? { ...d, cost_real_per_unit: e.target.value } : d)}
                          className="h-7 w-24 font-mono text-xs"
                        />
                      </div>
                      <div className="flex flex-col">
                        <label className="text-[9px] uppercase text-muted-foreground tracking-wide">Addebitato</label>
                        <Input
                          type="number"
                          step="0.0001"
                          min="0"
                          value={draft!.cost_billed_per_unit}
                          onChange={(e) => setDraft((d) => d ? { ...d, cost_billed_per_unit: e.target.value } : d)}
                          className="h-7 w-24 font-mono text-xs"
                        />
                      </div>
                      <div className="flex flex-col">
                        <label className="text-[9px] uppercase text-muted-foreground tracking-wide">Markup ×</label>
                        <Input
                          type="number"
                          step="0.1"
                          min="1"
                          value={draft!.markup_multiplier}
                          onChange={(e) => setDraft((d) => d ? { ...d, markup_multiplier: e.target.value } : d)}
                          className="h-7 w-20 font-mono text-xs"
                        />
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => { setEditingId(null); setDraft(null); }}
                          disabled={updateMutation.isPending}
                          className="h-7 gap-1 text-xs"
                        >
                          <X className="h-3 w-3" /> Annulla
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => {
                            if (!draft) return;
                            updateMutation.mutate({
                              id: row.id,
                              payload: {
                                cost_real_per_unit: parseNum(draft.cost_real_per_unit),
                                cost_billed_per_unit: parseNum(draft.cost_billed_per_unit),
                                markup_multiplier: parseNum(draft.markup_multiplier),
                              },
                            });
                          }}
                          disabled={updateMutation.isPending}
                          className="h-7 gap-1 text-xs"
                        >
                          {updateMutation.isPending ? (
                            <><Loader2 className="h-3 w-3 animate-spin" /> Salvo…</>
                          ) : (
                            <><Save className="h-3 w-3" /> Salva</>
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FIELD EDIT (shared)
// ─────────────────────────────────────────────────────────────────────────────

function FieldEdit({
  label,
  value,
  isEditing,
  onChange,
  referenceValue,
  digits = 6,
}: {
  label: string;
  value: string | number;
  isEditing: boolean;
  onChange: (v: string) => void;
  referenceValue?: number;
  digits?: number;
}) {
  const numericValue = typeof value === "number" ? value : Number(value || 0);
  const refDiff = referenceValue != null && referenceValue > 0
    ? ((numericValue - referenceValue) / referenceValue) * 100
    : null;
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      {isEditing ? (
        <Input
          type="number"
          step="0.000001"
          min="0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 font-mono text-xs"
        />
      ) : (
        <p className="font-mono text-xs">
          {fmtEur(numericValue, digits)}
          {refDiff != null && Math.abs(refDiff) > 5 && (
            <span className={cn("ml-1 text-[10px]", refDiff > 0 ? "text-emerald-600" : "text-amber-600")}>
              ({refDiff > 0 ? "+" : ""}{refDiff.toFixed(0)}%)
            </span>
          )}
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// REFERENCE CATALOG (cheat-sheet)
// ─────────────────────────────────────────────────────────────────────────────

function PricingReferenceCatalog() {
  const [expanded, setExpanded] = useState(false);
  const grouped = useMemo(() => {
    const map = new Map<PricingRef["category"], Array<{ key: string } & PricingRef>>();
    for (const [key, ref] of Object.entries(OFFICIAL_PRICING_REFERENCE)) {
      if (!map.has(ref.category)) map.set(ref.category, []);
      map.get(ref.category)!.push({ key, ...ref });
    }
    return map;
  }, []);

  const CATEGORY_LABELS: Record<PricingRef["category"], { label: string; emoji: string }> = {
    image: { label: "Image generation (Render)", emoji: "🖼" },
    chat: { label: "Chat / Completions", emoji: "💬" },
    voice: { label: "Voice / TTS", emoji: "🎙" },
    transcription: { label: "Transcription", emoji: "🎧" },
    embedding: { label: "Embeddings (RAG)", emoji: "🔎" },
    vision: { label: "Vision / OCR documenti", emoji: "👁" },
  };

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <div className="rounded-lg border bg-muted/10">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center justify-between p-3 hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Info className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium">
                Catalogo prezzi ufficiali (cheat-sheet) — {Object.keys(OFFICIAL_PRICING_REFERENCE).length} modelli AI tracciati
              </span>
            </div>
            {expanded
              ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
              : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="p-3 pt-0 space-y-3">
            {(["image", "chat", "voice", "transcription", "embedding", "vision"] as const).map((cat) => {
              const items = grouped.get(cat);
              if (!items || items.length === 0) return null;
              const meta = CATEGORY_LABELS[cat];
              return (
                <div key={cat} className="space-y-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {meta.emoji} {meta.label}
                  </p>
                  <div className="rounded-md border divide-y">
                    {items.map((item) => (
                      <div key={item.key} className="px-3 py-2 flex items-start justify-between gap-3 text-xs hover:bg-muted/30">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">{item.label}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{item.notes}</p>
                          <code className="text-[10px] text-muted-foreground/80 mt-0.5 inline-block">{item.key}</code>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-mono text-xs">{item.example_eur.toFixed(6)} €</p>
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-primary hover:underline"
                          >
                            docs ↗
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            <p className="text-[10px] text-muted-foreground italic pt-1">
              Prezzi in € (cambio USD ~1.07). Aggiornare se cambiano i listini provider.
            </p>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export function AIPricingValidator() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"render" | "markup" | "agent">("render");

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors text-left"
            aria-expanded={open}
          >
            <div className="flex items-center gap-2">
              <Calculator className="h-4 w-4 text-primary" />
              <div>
                <p className="text-sm font-semibold">Validazione & Pricing AI</p>
                <p className="text-xs text-muted-foreground">
                  Listini centrali per render, markup per task e agenti AI · cheat-sheet prezzi ufficiali provider
                </p>
              </div>
            </div>
            {open
              ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
              : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0 space-y-3">
            {/* Catalogo riferimento prezzi ufficiali */}
            <PricingReferenceCatalog />

            {/* Tabs sui 3 listini configurabili */}
            <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
              <TabsList className="grid grid-cols-3 w-full">
                <TabsTrigger value="render" className="text-xs">🖼 Render API</TabsTrigger>
                <TabsTrigger value="markup" className="text-xs">📈 Markup per Task</TabsTrigger>
                <TabsTrigger value="agent" className="text-xs">🤖 Agenti AI</TabsTrigger>
              </TabsList>
              <TabsContent value="render" className="mt-3">
                <RenderPricingTab />
              </TabsContent>
              <TabsContent value="markup" className="mt-3">
                <MarkupTab />
              </TabsContent>
              <TabsContent value="agent" className="mt-3">
                <AgentPricingTab />
              </TabsContent>
            </Tabs>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
