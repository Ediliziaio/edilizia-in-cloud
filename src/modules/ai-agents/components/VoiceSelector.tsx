import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Play, Pause, Volume2, Search, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface VoiceOption {
  id: string;
  name: string;
  preview_url: string | null;
  category: string;
  gender?: string;
  accent?: string;
}

const BUILT_IN_VOICES: VoiceOption[] = [
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah", preview_url: null, category: "premade", gender: "female", accent: "american" },
  { id: "JBFqnCBsd6RMkjVDRZzb", name: "George", preview_url: null, category: "premade", gender: "male", accent: "british" },
  { id: "TX3LPaxmHKxFdv7VOQHJ", name: "Liam", preview_url: null, category: "premade", gender: "male", accent: "american" },
  { id: "XrExE9yKIg1WjnnlVkGX", name: "Matilda", preview_url: null, category: "premade", gender: "female", accent: "american" },
  { id: "onwK4e9ZLuTAKqWW03F9", name: "Daniel", preview_url: null, category: "premade", gender: "male", accent: "british" },
  { id: "pFZP5JQG7iQjIQuC4Bku", name: "Lily", preview_url: null, category: "premade", gender: "female", accent: "british" },
  { id: "iP95p4xoKVk53GoZ742B", name: "Chris", preview_url: null, category: "premade", gender: "male", accent: "american" },
  { id: "cgSgspJ2msm6clMCkdW9", name: "Jessica", preview_url: null, category: "premade", gender: "female", accent: "american" },
  { id: "CwhRBWXzGAHq8TQ4Fs17", name: "Roger", preview_url: null, category: "premade", gender: "male", accent: "american" },
  { id: "FGY2WhTYpPnrIDTdsKH5", name: "Laura", preview_url: null, category: "premade", gender: "female", accent: "american" },
];

interface VoiceSelectorProps {
  value: string | null;
  onChange: (voiceId: string) => void;
  stability?: number;
  onStabilityChange?: (val: number) => void;
  speed?: number;
  onSpeedChange?: (val: number) => void;
  similarity?: number;
  onSimilarityChange?: (val: number) => void;
}

export function VoiceSelector({
  value, onChange,
  stability = 0.5, onStabilityChange,
  speed = 1.0, onSpeedChange,
  similarity = 0.75, onSimilarityChange,
}: VoiceSelectorProps) {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [genderFilter, setGenderFilter] = useState("all");
  const [expressiveMode, setExpressiveMode] = useState(false);
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

  const filtered = BUILT_IN_VOICES.filter((v) => {
    const matchSearch = v.name.toLowerCase().includes(search.toLowerCase());
    const matchGender = genderFilter === "all" || v.gender === genderFilter;
    return matchSearch && matchGender;
  });

  const selectedVoice = BUILT_IN_VOICES.find((v) => v.id === value);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-2">
          <Volume2 className="h-4 w-4" /> Voce
        </Label>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Modalità Espressiva</span>
          <Switch checked={expressiveMode} onCheckedChange={setExpressiveMode} />
        </div>
      </div>

      {/* Current selection */}
      {selectedVoice && (
        <div className="flex items-center gap-2 border rounded-md px-3 py-2 bg-primary/5">
          <Volume2 className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">{selectedVoice.name}</span>
          <span className="text-xs text-muted-foreground capitalize">({selectedVoice.gender})</span>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Cerca voce..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
        <Select value={genderFilter} onValueChange={setGenderFilter}>
          <SelectTrigger className="w-[100px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti</SelectItem>
            <SelectItem value="male">Uomo</SelectItem>
            <SelectItem value="female">Donna</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Voice list */}
      <ScrollArea className="h-[180px] rounded-md border p-2">
        <div className="space-y-1">
          {filtered.map((voice) => (
            <button
              key={voice.id}
              onClick={() => onChange(voice.id)}
              className={cn(
                "w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors hover:bg-accent/50",
                value === voice.id && "bg-primary/10 ring-1 ring-primary"
              )}
            >
              <div className="flex items-center gap-2">
                <span className="font-medium">{voice.name}</span>
                <span className="text-[10px] text-muted-foreground capitalize">{voice.gender}</span>
              </div>
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

      {/* Voice settings */}
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" size="sm" className="w-full gap-2">
            <Settings2 className="h-4 w-4" /> Impostazioni voce
          </Button>
        </SheetTrigger>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Voce dell'agente</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-6">
            <div className="space-y-3">
              <Label className="text-sm">Stabilità</Label>
              <Slider
                value={[stability]}
                min={0} max={1} step={0.05}
                onValueChange={([v]) => onStabilityChange?.(v)}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Variabile</span>
                <span>{stability.toFixed(2)}</span>
                <span>Stabile</span>
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-sm">Velocità</Label>
              <Slider
                value={[speed]}
                min={0.7} max={1.2} step={0.05}
                onValueChange={([v]) => onSpeedChange?.(v)}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Lento</span>
                <span>{speed.toFixed(2)}x</span>
                <span>Veloce</span>
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-sm">Somiglianza</Label>
              <Slider
                value={[similarity]}
                min={0} max={1} step={0.05}
                onValueChange={([v]) => onSimilarityChange?.(v)}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Bassa</span>
                <span>{similarity.toFixed(2)}</span>
                <span>Alta</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Famiglia modelli TTS</Label>
              <Select defaultValue="turbo">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="turbo">Turbo v2.5</SelectItem>
                  <SelectItem value="standard">Multilingual v2</SelectItem>
                  <SelectItem value="flash">Flash</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
