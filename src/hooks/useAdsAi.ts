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

export function useAdsAi(companyId: string | undefined) {
  const [isGeneratingCopy, setIsGeneratingCopy] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);

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

  return {
    generateCopy,
    generateImage,
    isGeneratingCopy,
    isGeneratingImage,
    isGenerating: isGeneratingCopy || isGeneratingImage,
  };
}
