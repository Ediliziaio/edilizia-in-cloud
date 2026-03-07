import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Play, Pause, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface VoiceOption {
  id: string;
  name: string;
  preview_url: string | null;
  category: string;
}

// Pre-built voices for Phase 1 (no API call needed)
const BUILT_IN_VOICES: VoiceOption[] = [
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah", preview_url: null, category: "premade" },
  { id: "JBFqnCBsd6RMkjVDRZzb", name: "George", preview_url: null, category: "premade" },
  { id: "TX3LPaxmHKxFdv7VOQHJ", name: "Liam", preview_url: null, category: "premade" },
  { id: "XrExE9yKIg1WjnnlVkGX", name: "Matilda", preview_url: null, category: "premade" },
  { id: "onwK4e9ZLuTAKqWW03F9", name: "Daniel", preview_url: null, category: "premade" },
  { id: "pFZP5JQG7iQjIQuC4Bku", name: "Lily", preview_url: null, category: "premade" },
  { id: "iP95p4xoKVk53GoZ742B", name: "Chris", preview_url: null, category: "premade" },
  { id: "cgSgspJ2msm6clMCkdW9", name: "Jessica", preview_url: null, category: "premade" },
  { id: "CwhRBWXzGAHq8TQ4Fs17", name: "Roger", preview_url: null, category: "premade" },
  { id: "FGY2WhTYpPnrIDTdsKH5", name: "Laura", preview_url: null, category: "premade" },
];

interface VoiceSelectorProps {
  value: string | null;
  onChange: (voiceId: string) => void;
}

export function VoiceSelector({ value, onChange }: VoiceSelectorProps) {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const togglePlay = (voice: VoiceOption) => {
    if (!voice.preview_url) return;
    if (playingId === voice.id) {
      audioRef.current?.pause();
      setPlayingId(null);
    } else {
      if (audioRef.current) audioRef.current.pause();
      const audio = new Audio(voice.preview_url);
      audio.onended = () => setPlayingId(null);
      audio.play();
      audioRef.current = audio;
      setPlayingId(voice.id);
    }
  };

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-2">
        <Volume2 className="h-4 w-4" /> Voce
      </Label>
      <ScrollArea className="h-[200px] rounded-md border p-2">
        <div className="space-y-1">
          {BUILT_IN_VOICES.map((voice) => (
            <button
              key={voice.id}
              onClick={() => onChange(voice.id)}
              className={cn(
                "w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors hover:bg-accent/50",
                value === voice.id && "bg-primary/10 ring-1 ring-primary"
              )}
            >
              <span className="font-medium">{voice.name}</span>
              {voice.preview_url && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={(e) => { e.stopPropagation(); togglePlay(voice); }}
                >
                  {playingId === voice.id ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                </Button>
              )}
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
