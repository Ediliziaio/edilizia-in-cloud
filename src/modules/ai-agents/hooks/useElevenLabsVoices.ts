import { useQuery } from "@tanstack/react-query";
import { callElevenLabsProxy } from "./useElevenLabsProxy";

export interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  preview_url: string | null;
  category: string;
  labels?: Record<string, string>;
  fine_tuning?: { is_allowed_to_fine_tune: boolean };
}

interface GetVoicesResponse {
  voices: ElevenLabsVoice[];
}

function isItalianVoice(v: ElevenLabsVoice): boolean {
  const labels = v.labels || {};
  const language = (labels.language || labels.Language || "").toLowerCase();
  const accent = (labels.accent || labels.Accent || "").toLowerCase();
  const description = (labels.description || labels.Description || "").toLowerCase();
  return (
    language.includes("italian") ||
    language === "it" ||
    accent.includes("italian") ||
    description.includes("italian")
  );
}

export function useElevenLabsVoices() {
  return useQuery({
    queryKey: ["elevenlabs-voices"],
    queryFn: async () => {
      const data = await callElevenLabsProxy<GetVoicesResponse>({ action: "get_voices" });
      const all: ElevenLabsVoice[] = data?.voices ?? [];
      const italian = all.filter(isItalianVoice);
      // If no italian voices found, return all (fallback)
      return italian.length > 0 ? italian : all;
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
    retry: 1,
  });
}
