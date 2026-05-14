import { supabase } from "@/integrations/supabase/client";

export type SrAiDraftSource = "testo" | "foto" | "mixed";

export interface SrAiDraftImageInput {
  name: string;
  mime: string;
  data_base64: string;
}

export interface SrAiDraftItem {
  id: string;
  ambiente: string | null;
  tipologia: string;
  tipologia_label: string;
  materiale: string | null;
  serie: string | null;
  vetro: string | null;
  apertura: string | null;
  colore_interno: string | null;
  colore_esterno: string | null;
  larghezza_mm: number | null;
  altezza_mm: number | null;
  quantita: number;
  family_id: string | null;
  family_nome: string | null;
  listino_voce_id: string | null;
  supplier_catalog_id: string | null;
  supplier_product_line_id: string | null;
  prezzo_unitario: number | null;
  prezzo_totale: number | null;
  note: string | null;
  confidence: number;
  missing_fields: string[];
  warnings: string[];
}

export interface SrAiDraftResult {
  items: SrAiDraftItem[];
  warnings: string[];
  questions: string[];
  summary: string | null;
  model_used?: string | null;
  duration_ms?: number;
}

export async function fileToDraftImage(file: File): Promise<SrAiDraftImageInput> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Lettura immagine fallita"));
    reader.readAsDataURL(file);
  });
  const [, base64 = ""] = dataUrl.split(",");
  return {
    name: file.name,
    mime: file.type || "image/jpeg",
    data_base64: base64,
  };
}

export async function generateSerramentiAiDraft(input: {
  progettoId: string;
  prompt: string;
  images: SrAiDraftImageInput[];
  source: SrAiDraftSource;
}): Promise<SrAiDraftResult> {
  const { data, error } = await supabase.functions.invoke<SrAiDraftResult>(
    "sr-ai-preventivo-draft",
    {
      body: {
        progetto_id: input.progettoId,
        prompt: input.prompt,
        images: input.images,
        source: input.source,
      },
    },
  );

  if (error) {
    throw new Error(error.message || "Analisi AI non disponibile");
  }
  if (!data) {
    throw new Error("La funzione AI non ha restituito dati");
  }
  return data;
}
