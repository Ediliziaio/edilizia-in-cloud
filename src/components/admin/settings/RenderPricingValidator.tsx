/**
 * RenderPricingValidator — pannello validazione pricing render AI.
 *
 * RISOLVE: "i costi calcolati non corrispondono a quello che OpenAI mi addebita davvero".
 *
 * Cosa fa:
 *   1. Legge le righe attive di `render_provider_pricing` (openai/gemini, ecc.)
 *   2. Permette al super-admin di EDITARE il pricing inline (price/image, fallback)
 *   3. Mostra i prezzi UFFICIALI di riferimento (OpenAI/Gemini) per confronto
 *   4. Genera esempi di costo calcolato per token usage tipiche
 *
 * Le edge function `generate-render` leggono questa tabella in real-time tramite
 * `fetchPricing()` in `_shared/renderCost.ts` — quindi modificare un valore qui
 * cambia immediatamente il calcolo del costo per i NUOVI render.
 *
 * NB: i render già salvati hanno il loro costo "frozen" in
 * `render_sessions.cost_real_api`. Per ricalcolare retroattivamente serve un
 * job dedicato (out of scope qui).
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
import { Calculator, ChevronDown, ChevronUp, Edit2, Info, Loader2, Save, X, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { formatError } from "@/lib/errors";
import { cn } from "@/lib/utils";

interface PricingRow {
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

/**
 * Riferimenti ufficiali pricing API (aggiornare con doc provider).
 * USD → EUR cambio approssimativo 1.07 (variazione ±5% non compromette il confronto).
 *
 * Catalogo completo: copre tutte le feature AI della piattaforma.
 *   - Image generation (render): gpt-image-1, dall-e-2/3, gemini flash image
 *   - Chat / completions: gpt-4o, gpt-4o-mini, gpt-3.5, claude-3-5
 *   - Voice agents (TTS): elevenlabs
 *   - Transcription: whisper
 *   - Embeddings: text-embedding-3
 *   - Document analysis: gpt-4o-vision
 */
type PricingRef = {
  label: string;
  url: string;
  notes: string;
  category: "image" | "chat" | "voice" | "transcription" | "embedding" | "vision";
  example_per_image_eur: number; // valore principale da confrontare con price_output_image_eur
};

const OFFICIAL_PRICING_REFERENCE: Record<string, PricingRef> = {
  // ── Image generation (render) ──
  "openai/gpt-image-1": {
    label: "OpenAI gpt-image-1 (output 1024×1024 HQ)",
    url: "https://platform.openai.com/docs/pricing",
    notes: "$40/1M output tokens · ~1500–3000 token/immagine HQ → ~$0.06–0.12/render → 0,055–0,110 €",
    category: "image",
    example_per_image_eur: 0.085,
  },
  "openai/dall-e-2": {
    label: "OpenAI dall-e-2 (1024×1024)",
    url: "https://platform.openai.com/docs/pricing",
    notes: "Pricing per immagine fissa: $0.020 → 0,019 €",
    category: "image",
    example_per_image_eur: 0.019,
  },
  "openai/dall-e-3": {
    label: "OpenAI dall-e-3 (1024×1024 HQ)",
    url: "https://platform.openai.com/docs/pricing",
    notes: "$0.080/immagine HQ 1024×1024 → 0,075 €",
    category: "image",
    example_per_image_eur: 0.075,
  },
  "gemini/gemini-2.5-flash-image": {
    label: "Gemini 2.5 Flash Image (output 1024)",
    url: "https://ai.google.dev/pricing",
    notes: "$0.039/output image (1290 token) + prompt token costo basso",
    category: "image",
    example_per_image_eur: 0.037,
  },

  // ── Chat completions ──
  "openai/gpt-4o": {
    label: "OpenAI gpt-4o (chat)",
    url: "https://platform.openai.com/docs/pricing",
    notes: "$2.50/1M input · $10.00/1M output → ~$0.0025-0.0125 per 1K token mix",
    category: "chat",
    example_per_image_eur: 0.0075,
  },
  "openai/gpt-4o-mini": {
    label: "OpenAI gpt-4o-mini (chat low-cost)",
    url: "https://platform.openai.com/docs/pricing",
    notes: "$0.15/1M input · $0.60/1M output → ~10× più economico di gpt-4o",
    category: "chat",
    example_per_image_eur: 0.0004,
  },
  "anthropic/claude-3-5-sonnet": {
    label: "Anthropic Claude 3.5 Sonnet",
    url: "https://www.anthropic.com/pricing",
    notes: "$3/1M input · $15/1M output → ~3× gpt-4o per output",
    category: "chat",
    example_per_image_eur: 0.009,
  },
  "anthropic/claude-3-5-haiku": {
    label: "Anthropic Claude 3.5 Haiku",
    url: "https://www.anthropic.com/pricing",
    notes: "$0.80/1M input · $4/1M output → low-cost tier",
    category: "chat",
    example_per_image_eur: 0.0024,
  },
  "gemini/gemini-2.0-flash": {
    label: "Gemini 2.0 Flash (chat)",
    url: "https://ai.google.dev/pricing",
    notes: "$0.10/1M input · $0.40/1M output (testo). Multi-modal supportato",
    category: "chat",
    example_per_image_eur: 0.0003,
  },

  // ── Voice / TTS ──
  "elevenlabs/eleven_multilingual_v2": {
    label: "ElevenLabs Multilingual v2 (TTS)",
    url: "https://elevenlabs.io/pricing",
    notes: "$0.30/1K char (~$0.02 per messaggio breve). Voice agents.",
    category: "voice",
    example_per_image_eur: 0.018,
  },
  "elevenlabs/eleven_turbo_v2_5": {
    label: "ElevenLabs Turbo v2.5",
    url: "https://elevenlabs.io/pricing",
    notes: "Latenza ridotta · $0.50/1K char per realtime conversation",
    category: "voice",
    example_per_image_eur: 0.030,
  },

  // ── Transcription ──
  "openai/whisper-1": {
    label: "OpenAI Whisper (audio → text)",
    url: "https://platform.openai.com/docs/pricing",
    notes: "$0.006/minuto audio. Usato per trascrizioni e voice memo.",
    category: "transcription",
    example_per_image_eur: 0.0056,
  },

  // ── Embeddings (search/RAG) ──
  "openai/text-embedding-3-small": {
    label: "OpenAI Embedding 3 small",
    url: "https://platform.openai.com/docs/pricing",
    notes: "$0.020/1M token. Doc analysis · semantic search.",
    category: "embedding",
    example_per_image_eur: 0.000019,
  },
  "openai/text-embedding-3-large": {
    label: "OpenAI Embedding 3 large",
    url: "https://platform.openai.com/docs/pricing",
    notes: "$0.130/1M token. Doc analysis premium.",
    category: "embedding",
    example_per_image_eur: 0.000122,
  },

  // ── Vision / Document analysis ──
  "openai/gpt-4o-vision": {
    label: "OpenAI gpt-4o (vision input)",
    url: "https://platform.openai.com/docs/pricing",
    notes: "Tile 512×512: ~85 input token. Documenti scansionati / OCR.",
    category: "vision",
    example_per_image_eur: 0.0008,
  },
};

function refKey(p: { provider_key: string; model: string }) {
  return `${p.provider_key}/${p.model}`;
}

function fmtEur(n: number, digits = 6) {
  return `${n.toFixed(digits)} €`;
}

interface DraftRow {
  price_output_image_eur: string;
  price_input_token_eur: string;
  price_output_token_eur: string;
  fallback_cost_per_call_eur: string;
}

export function RenderPricingValidator() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftRow | null>(null);

  const pricingQuery = useQuery({
    queryKey: ["admin", "render-provider-pricing"],
    queryFn: async (): Promise<PricingRow[]> => {
      const { data, error } = await (supabase as unknown as {
        from: (table: string) => {
          select: (cols: string) => {
            is: (col: string, val: null) => {
              order: (col: string, opts: { ascending: boolean }) => Promise<{
                data: PricingRow[] | null;
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
    staleTime: 60 * 1000,
    enabled: open,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Partial<PricingRow> }) => {
      const { error } = await (supabase as unknown as {
        from: (t: string) => {
          update: (p: Partial<PricingRow>) => {
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
      toast.success("Pricing aggiornato", {
        description: "I prossimi render useranno questi nuovi valori. I render già salvati mantengono il costo originale.",
      });
      setEditingId(null);
      setDraft(null);
    },
    onError: (e: Error) => toast.error(formatError(e)),
  });

  const startEdit = (row: PricingRow) => {
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
    const parse = (v: string) => {
      const n = Number(v.replace(",", "."));
      return Number.isFinite(n) && n >= 0 ? n : 0;
    };
    updateMutation.mutate({
      id,
      payload: {
        price_output_image_eur: parse(draft.price_output_image_eur),
        price_input_token_eur: parse(draft.price_input_token_eur),
        price_output_token_eur: parse(draft.price_output_token_eur),
        fallback_cost_per_call_eur: parse(draft.fallback_cost_per_call_eur),
      },
    });
  };

  // Calcola la discrepanza % tra il pricing configurato e il riferimento ufficiale
  const rows = useMemo(() => {
    return (pricingQuery.data ?? []).map((row) => {
      const ref = OFFICIAL_PRICING_REFERENCE[refKey(row)];
      // Stima: per pricing_mode hybrid/per_image usiamo price_output_image_eur come confronto principale
      const configured = Number(row.price_output_image_eur || row.fallback_cost_per_call_eur);
      const reference = ref?.example_per_image_eur ?? null;
      const diffPct = reference != null && reference > 0
        ? ((configured - reference) / reference) * 100
        : null;
      return { ...row, ref, configured, reference, diffPct };
    });
  }, [pricingQuery.data]);

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
                <p className="text-sm font-semibold">Validazione & Pricing Render AI</p>
                <p className="text-xs text-muted-foreground">
                  Confronta il pricing configurato con i prezzi ufficiali OpenAI/Gemini ed edita i valori
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
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-xs space-y-1">
                <p>
                  La edge function <code className="bg-muted px-1 rounded">generate-render</code> legge queste righe
                  per calcolare <code className="bg-muted px-1 rounded">cost_real_api</code> usando token usage
                  reali. Modificando i valori qui, i prossimi render useranno il nuovo pricing.
                </p>
                <p className="text-muted-foreground">
                  ⚠️ I costi dei render <strong>già salvati</strong> restano frozen — i KPI sopra mostrano valori storici.
                </p>
              </AlertDescription>
            </Alert>

            {/* Catalogo pricing reference per TUTTE le AI features */}
            <PricingReferenceCatalog />


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
                Nessuna riga di pricing configurata. La edge function farà fallback su{" "}
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
                                title={`Discrepanza con prezzo ufficiale di riferimento`}
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

                      {/* Tabella valori */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-xs">
                        <FieldEdit
                          label="Prezzo per immagine output"
                          isEditing={isEditing}
                          value={isEditing ? draft!.price_output_image_eur : row.price_output_image_eur}
                          onChange={(v) => setDraft((d) => d ? { ...d, price_output_image_eur: v } : d)}
                          referenceValue={ref?.example_per_image_eur}
                        />
                        <FieldEdit
                          label="Token input (€/token)"
                          isEditing={isEditing}
                          value={isEditing ? draft!.price_input_token_eur : row.price_input_token_eur}
                          onChange={(v) => setDraft((d) => d ? { ...d, price_input_token_eur: v } : d)}
                          digits={10}
                        />
                        <FieldEdit
                          label="Token output (€/token)"
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

                      {/* Reference */}
                      {ref && (
                        <div className="mt-3 pt-2 border-t border-dashed text-[11px] text-muted-foreground">
                          <p className="flex items-center gap-1">
                            🔗 <strong className="text-foreground">{ref.label}:</strong>{" "}
                            <a href={ref.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                              docs ufficiali
                            </a>
                          </p>
                          <p className="mt-0.5">{ref.notes}</p>
                          <p className="mt-0.5">
                            Stima esempio: <code className="bg-muted px-1 rounded">{fmtEur(ref.example_per_image_eur, 4)}</code> per render 1024×1024 HQ
                          </p>
                        </div>
                      )}

                      {/* Save/Cancel toolbar */}
                      {isEditing && (
                        <div className="mt-3 flex items-center gap-2 justify-end pt-2 border-t">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={cancelEdit}
                            disabled={updateMutation.isPending}
                            className="h-7 gap-1 text-xs"
                          >
                            <X className="h-3 w-3" /> Annulla
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => saveEdit(row.id)}
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
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

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

/**
 * Catalogo pricing reference: mostra tutti i prezzi ufficiali noti, organizzati
 * per categoria. Usato come "cheat sheet" per il super admin che vuole verificare
 * o configurare nuove righe in render_provider_pricing / ai_usage_log markup.
 */
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
    embedding: { label: "Embeddings (RAG, doc analysis)", emoji: "🔎" },
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
                          <p className="font-mono text-xs">{item.example_per_image_eur.toFixed(6)} €</p>
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
              I prezzi sono in € (cambio USD ~1.07). Aggiornare se cambiano i listini.
              Ogni edge function dovrebbe loggare su <code className="bg-muted px-1 rounded">ai_usage_log</code> con
              {" "}<code className="bg-muted px-1 rounded">model</code> e{" "}
              <code className="bg-muted px-1 rounded">cost_eur</code> per essere tracciata nel monitor.
            </p>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
