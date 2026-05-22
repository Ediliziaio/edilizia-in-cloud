/**
 * useAdsAi — wrapper unico per le edge function AI del modulo Pubblicità.
 *
 * Espone:
 *   • generateCopy(brief, opts)   → ai-ads-copy-generate
 *   • generateImage(prompt, opts) → ai-ads-image-generate
 *   • isGenerating                → loading flag
 *
 * Pattern: chiama supabase.functions.invoke() che inietta automaticamente
 * il bearer token utente. Gli errori vengono trasformati in messaggi
 * user-friendly tramite toast (in caso di crediti insufficienti, schema
 * non applicato, etc.).
 */

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export interface CopyGenInput {
  brief: string;
  segment?: string;
  zone?: string;
  offer?: string;
  tone?: "professionale" | "familiare" | "tecnico" | "urgenza";
  variants?: number;
}

export interface CopyGenResult {
  copy_variants: string[];
  /** Titoli brevi punchy (≤40 char) per headline ad */
  titles?: string[];
  /** Descrizioni / primary text 90-180 char */
  descriptions?: string[];
  hooks: string[];
  cta_suggestions: string[];
  image_prompts: string[];
  warnings: string[];
  model_used?: string;
  cost_eur_cents?: number;
}

export interface ImageGenInput {
  prompt: string;
  aspect_ratio?: "1:1" | "4:5" | "9:16" | "16:9";
  quality?: "standard" | "hd";
  tags?: string[];
}

export interface ImageGenResult {
  media_id: string;
  public_url: string;
  width_px: number;
  height_px: number;
  cost_eur_cents?: number;
}

// ─── Video Script types ────────────────────────────────────────────────────────

export type VideoScriptStyle =
  | "problema-soluzione"
  | "prima-dopo"
  | "testimonial"
  | "offerta-diretta";

export interface VideoScriptInput {
  brief: string;
  segment?: string;
  zone?: string;
  duration: "15" | "30" | "60";
  style: VideoScriptStyle;
}

export interface VideoScene {
  scene: number;
  label: string;
  duration_seconds: number;
  overlay_text: string;
  voiceover: string;
  visual_direction: string;
}

export interface VideoScript {
  hook: string;
  platform: string;
  total_duration: string;
  scenes: VideoScene[];
  cta_final: string;
  tips: string[];
  model_used?: string;
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

export function useAdsAi(companyId: string | undefined) {
  const [isGeneratingCopy, setIsGeneratingCopy] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);

  const generateCopy = useCallback(
    async (input: CopyGenInput): Promise<CopyGenResult | null> => {
      if (!companyId) {
        toast.error("Azienda non identificata");
        return null;
      }
      if (input.brief.trim().length < 10) {
        toast.error("Brief troppo corto", { description: "Almeno 10 caratteri." });
        return null;
      }
      setIsGeneratingCopy(true);
      try {
        const { data, error } = await supabase.functions.invoke<CopyGenResult & { error?: string; user_message?: string }>(
          "ai-ads-copy-generate",
          {
            body: {
              company_id: companyId,
              brief: input.brief,
              segment: input.segment,
              zone: input.zone,
              offer: input.offer,
              tone: input.tone ?? "professionale",
              variants: input.variants ?? 5,
            },
          },
        );
        if (error) {
          // Errori HTTP della edge fn
          toast.error("Generazione copy fallita", {
            description: error.message,
          });
          return null;
        }
        if (data?.error) {
          // Errori applicativi (insufficient_credits, etc.)
          if (data.error === "insufficient_credits") {
            toast.error("Crediti AI insufficienti", {
              description: data.user_message ?? "Ricarica per continuare.",
            });
          } else {
            toast.error("Generazione copy fallita", {
              description: data.error,
            });
          }
          return null;
        }
        if (!data?.copy_variants || data.copy_variants.length === 0) {
          toast.error("Nessun copy generato", {
            description: "L'AI non ha prodotto varianti utilizzabili. Riprova con un brief più specifico.",
          });
          return null;
        }
        return data as CopyGenResult;
      } catch (err) {
        toast.error("Errore generazione copy", {
          description: String((err as Error).message ?? err),
        });
        return null;
      } finally {
        setIsGeneratingCopy(false);
      }
    },
    [companyId],
  );

  const generateImage = useCallback(
    async (input: ImageGenInput): Promise<ImageGenResult | null> => {
      if (!companyId) {
        toast.error("Azienda non identificata");
        return null;
      }
      if (input.prompt.trim().length < 10) {
        toast.error("Prompt troppo corto", { description: "Almeno 10 caratteri." });
        return null;
      }
      setIsGeneratingImage(true);
      try {
        const { data, error } = await supabase.functions.invoke<ImageGenResult & { error?: string; detail?: string }>(
          "ai-ads-image-generate",
          {
            body: {
              company_id: companyId,
              prompt: input.prompt,
              aspect_ratio: input.aspect_ratio ?? "1:1",
              quality: input.quality ?? "standard",
              tags: input.tags ?? [],
            },
          },
        );
        if (error) {
          toast.error("Generazione immagine fallita", {
            description: error.message,
          });
          return null;
        }
        if (data?.error) {
          if (data.error === "schema_not_applied") {
            toast.error("Database non pronto", {
              description: "La migration meta_ads non è stata applicata sul remoto.",
            });
          } else if (data.error === "openai_api_key_missing") {
            toast.error("API key OpenAI mancante", {
              description: "Configura OPENAI_API_KEY in Supabase Secrets.",
            });
          } else {
            toast.error("Generazione immagine fallita", {
              description: data.error,
            });
          }
          return null;
        }
        if (!data?.public_url) {
          toast.error("Nessuna immagine restituita");
          return null;
        }
        return data as ImageGenResult;
      } catch (err) {
        toast.error("Errore generazione immagine", {
          description: String((err as Error).message ?? err),
        });
        return null;
      } finally {
        setIsGeneratingImage(false);
      }
    },
    [companyId],
  );

  // ─── Video Script Generator ──────────────────────────────────────────────────
  const generateVideoScript = useCallback(
    async (input: VideoScriptInput): Promise<VideoScript | null> => {
      if (!companyId) { toast.error("Azienda non identificata"); return null; }
      if (input.brief.trim().length < 10) {
        toast.error("Brief troppo corto", { description: "Almeno 10 caratteri." });
        return null;
      }

      const totalSec = parseInt(input.duration);

      const styleLabels: Record<VideoScriptStyle, string[]> = {
        "problema-soluzione": ["Hook", "Il problema", "La soluzione", "Risultato", "CTA"],
        "prima-dopo":         ["Hook", "Prima (situazione)", "Dopo (trasformazione)", "Prova visiva", "CTA"],
        "testimonial":        ["Hook", "Chi parla", "Il problema risolto", "Risultati ottenuti", "CTA"],
        "offerta-diretta":    ["Hook urgenza", "Chi siamo", "L'offerta", "Garanzia", "CTA"],
      };
      const styleSplits: Record<VideoScriptStyle, number[]> = {
        "problema-soluzione": [0.15, 0.20, 0.30, 0.20, 0.15],
        "prima-dopo":         [0.12, 0.20, 0.33, 0.20, 0.15],
        "testimonial":        [0.12, 0.18, 0.25, 0.30, 0.15],
        "offerta-diretta":    [0.18, 0.17, 0.30, 0.20, 0.15],
      };

      const labels   = styleLabels[input.style];
      const splits   = styleSplits[input.style];
      const durations = splits.map(p => Math.max(2, Math.round(totalSec * p)));
      const platform  = totalSec <= 15 ? "Stories / Reels" : totalSec <= 30 ? "Feed + Reels" : "Feed";

      const scriptBrief = `[VIDEO SCRIPT ${input.duration}s – ${platform}] ${input.brief}.
Crea ${labels.length} scene sequenziali in stile "${input.style.replace(/-/g, " ")}":
${labels.map((l, i) => `  Scena ${i + 1} "${l}" (${durations[i]}s)`).join("\n")}.
Per ogni scena fornisci: testo overlay breve (max 8 parole, impatto visivo), voiceover (max 20 parole, colloquiale), direzione visiva per il cameraman.`;

      setIsGeneratingScript(true);
      try {
        const { data, error } = await supabase.functions.invoke<
          CopyGenResult & { error?: string; user_message?: string }
        >("ai-ads-copy-generate", {
          body: {
            company_id: companyId,
            brief: scriptBrief,
            segment: input.segment,
            zone: input.zone,
            tone: "familiare",
            variants: labels.length,
          },
        });

        if (error) {
          toast.error("Generazione script fallita", { description: error.message });
          return null;
        }
        if (data?.error === "insufficient_credits") {
          toast.error("Crediti AI insufficienti", { description: data.user_message ?? "Ricarica per continuare." });
          return null;
        }
        if (!data?.copy_variants?.length) {
          toast.error("Script non generato", { description: "Riprova con un brief più dettagliato." });
          return null;
        }

        return {
          hook:           data.hooks[0] ?? input.brief.slice(0, 60),
          platform,
          total_duration: `${input.duration}s`,
          scenes: labels.map((label, i) => {
            const text      = data.copy_variants[i] ?? data.hooks[i] ?? "";
            const sentences = text.split(/[.!\n]/).map(s => s.trim()).filter(Boolean);
            return {
              scene:             i + 1,
              label,
              duration_seconds:  durations[i],
              overlay_text:      (sentences[0] ?? text).slice(0, 60),
              voiceover:         sentences.slice(0, 2).join(". ").slice(0, 130),
              visual_direction:  data.image_prompts[i] ?? "",
            };
          }),
          cta_final:   data.cta_suggestions[0] ?? "Richiedi preventivo gratuito",
          tips:        data.warnings,
          model_used:  data.model_used,
        };
      } catch (err) {
        toast.error("Errore script video", { description: String((err as Error).message ?? err) });
        return null;
      } finally {
        setIsGeneratingScript(false);
      }
    },
    [companyId],
  );

  return {
    generateCopy,
    generateImage,
    generateVideoScript,
    isGeneratingCopy,
    isGeneratingImage,
    isGeneratingScript,
    isGenerating: isGeneratingCopy || isGeneratingImage || isGeneratingScript,
  };
}
