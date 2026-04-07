import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ElevenLabsVoiceDB {
  id: string;
  voice_id: string;
  name: string;
  language: string;
  gender: "male" | "female" | "neutral" | null;
  preview_url: string | null;
  is_active: boolean;
  is_default: boolean;
  use_case: "agent" | "narration" | "general" | null;
  category: string | null;
  created_at: string;
  updated_at: string;
}

export interface ElevenLabsAPIVoice {
  voice_id: string;
  name: string;
  preview_url: string | null;
  category: string | null;
  labels: Record<string, string> | null;
}

/** Fetch voices saved in DB */
export function useElevenLabsVoicesDB() {
  return useQuery({
    queryKey: ["admin", "elevenlabs-voices"],
    queryFn: async (): Promise<ElevenLabsVoiceDB[]> => {
      const { data, error } = await supabase
        .from("elevenlabs_voices" as never)
        .select("id, voice_id, name, language, gender, preview_url, is_active, is_default, use_case, category, created_at, updated_at" as never)
        .order("name" as never);
      if (error) throw new Error(error.message);
      return (data ?? []) as ElevenLabsVoiceDB[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** Fetch available Italian voices from ElevenLabs API (via proxy) */
export function useElevenLabsVoicesAPI() {
  return useQuery({
    queryKey: ["admin", "elevenlabs-voices-api"],
    queryFn: async (): Promise<ElevenLabsAPIVoice[]> => {
      const { data, error } = await supabase.functions.invoke("elevenlabs-proxy", {
        body: { action: "get_voices" },
      });
      if (error) throw new Error(error.message);
      const voices = (data?.voices ?? []) as ElevenLabsAPIVoice[];
      // Filter Italian voices
      return voices.filter((v) => {
        const lang = v.labels?.language?.toLowerCase() ?? "";
        const accent = v.labels?.accent?.toLowerCase() ?? "";
        const desc = v.labels?.description?.toLowerCase() ?? "";
        return (
          lang === "italian" ||
          lang === "it" ||
          accent === "italian" ||
          accent === "it" ||
          desc.includes("italian") ||
          desc.includes("italiano")
        );
      });
    },
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
}

/** Sync voices from API to DB */
export function useSyncVoicesToDB() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (voices: ElevenLabsAPIVoice[]) => {
      if (voices.length === 0) throw new Error("Nessuna voce italiana trovata da ElevenLabs");
      const rows = voices.map((v) => ({
        voice_id: v.voice_id,
        name: v.name,
        language: v.labels?.language ?? "it",
        gender: detectGender(v.name, v.labels),
        preview_url: v.preview_url,
        category: v.category,
        is_active: true,
        is_default: false,
        use_case: detectUseCase(v.name, v.labels),
      }));
      const { error } = await supabase
        .from("elevenlabs_voices" as never)
        .upsert(rows as never, { onConflict: "voice_id" } as never);
      if (error) throw new Error(error.message);
      return rows.length;
    },
    onSuccess: (count: number) => {
      toast.success(`${count} voci sincronizzate con successo`);
      void qc.invalidateQueries({ queryKey: ["admin", "elevenlabs-voices"] });
    },
    onError: (err: Error) => toast.error(`Errore sincronizzazione: ${err.message}`),
  });
}

/** Toggle active/inactive for a voice */
export function useToggleVoiceActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("elevenlabs_voices" as never)
        .update({ is_active } as never)
        .eq("id" as never, id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "elevenlabs-voices"] });
    },
    onError: (err: Error) => toast.error(`Errore: ${err.message}`),
  });
}

/** Set a voice as the default (clears previous default first) */
export function useSetDefaultVoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (voiceId: string) => {
      // Clear existing default
      const { error: clearError } = await supabase
        .from("elevenlabs_voices" as never)
        .update({ is_default: false } as never)
        .eq("is_default" as never, true);
      if (clearError) throw new Error(clearError.message);
      // Set new default
      const { error } = await supabase
        .from("elevenlabs_voices" as never)
        .update({ is_default: true } as never)
        .eq("id" as never, voiceId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Voce predefinita impostata");
      void qc.invalidateQueries({ queryKey: ["admin", "elevenlabs-voices"] });
    },
    onError: (err: Error) => toast.error(`Errore: ${err.message}`),
  });
}

/** Set voice use_case */
export function useUpdateVoiceUseCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      use_case,
    }: {
      id: string;
      use_case: "agent" | "narration" | "general" | null;
    }) => {
      const { error } = await supabase
        .from("elevenlabs_voices" as never)
        .update({ use_case } as never)
        .eq("id" as never, id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "elevenlabs-voices"] });
    },
    onError: (err: Error) => toast.error(`Errore: ${err.message}`),
  });
}

// Helpers
function detectGender(
  name: string,
  labels: Record<string, string> | null
): "male" | "female" | "neutral" | null {
  const gender = labels?.gender?.toLowerCase() ?? "";
  if (gender === "male" || gender === "m") return "male";
  if (gender === "female" || gender === "f") return "female";
  // Heuristic from name
  const n = name.toLowerCase();
  if (n.includes("male") || n.includes("uomo")) return "male";
  if (n.includes("female") || n.includes("donna")) return "female";
  return "neutral";
}

function detectUseCase(
  name: string,
  labels: Record<string, string> | null
): "agent" | "narration" | "general" | null {
  const useCase = labels?.use_case?.toLowerCase() ?? "";
  const desc = labels?.description?.toLowerCase() ?? "";
  if (useCase.includes("agent") || desc.includes("agent") || desc.includes("assistente")) {
    return "agent";
  }
  if (useCase.includes("narr") || desc.includes("narr") || name.toLowerCase().includes("narr")) {
    return "narration";
  }
  return "general";
}
