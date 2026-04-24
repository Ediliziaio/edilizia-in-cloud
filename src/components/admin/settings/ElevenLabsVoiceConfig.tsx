import { useEffect, useMemo, useRef, useState } from "react";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  AlertCircle, RefreshCw, Mic, Star, Volume2, Search, Square, ToggleLeft, ToggleRight,
} from "lucide-react";
import {
  useElevenLabsVoicesDB, useElevenLabsVoicesAPI, useSyncVoicesToDB,
  useToggleVoiceActive, useSetDefaultVoice, useUpdateVoiceUseCase,
  type ElevenLabsVoiceDB,
} from "@/hooks/useAdminElevenLabsVoices";
import { toast } from "sonner";

const USE_CASE_LABELS: Record<string, string> = {
  agent: "Agente AI",
  narration: "Narrazione",
  general: "Generale",
};

const GENDER_LABELS: Record<string, string> = {
  male: "Uomo",
  female: "Donna",
  neutral: "Neutro",
};

/**
 * Audio singleton: una sola anteprima può essere in riproduzione alla volta.
 * FIX: prima ogni VoiceRow creava `new Audio()` ad ogni click; se l'utente
 * spam-cliccava più righe, audio sovrapposti. Ora c'è un Map module-level di
 * listener che spegne eventuali riproduzioni in corso.
 */
type PreviewSubscriber = (playingId: string | null) => void;
const subscribers = new Set<PreviewSubscriber>();
let currentAudio: HTMLAudioElement | null = null;
let currentId: string | null = null;

function notifyAll(id: string | null) {
  currentId = id;
  subscribers.forEach((s) => s(id));
}

function playPreview(id: string, url: string) {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  const audio = new Audio(url);
  currentAudio = audio;
  notifyAll(id);
  audio
    .play()
    .catch((err) => {
      notifyAll(null);
      currentAudio = null;
      toast.error(
        "Impossibile riprodurre l'anteprima: " +
          (err instanceof Error ? err.message : "autoplay bloccato?"),
      );
    });
  audio.onended = () => {
    if (currentAudio === audio) {
      currentAudio = null;
      notifyAll(null);
    }
  };
  audio.onerror = () => {
    if (currentAudio === audio) {
      currentAudio = null;
      notifyAll(null);
    }
  };
}

function stopPreview() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
    notifyAll(null);
  }
}

function usePlayingPreview(): string | null {
  const [id, setId] = useState<string | null>(currentId);
  useEffect(() => {
    const sub: PreviewSubscriber = (v) => setId(v);
    subscribers.add(sub);
    return () => {
      subscribers.delete(sub);
    };
  }, []);
  return id;
}

// ─── VoiceRow ────────────────────────────────────────────

function VoiceRow({
  voice,
  isDefault,
  onToggleActive,
  onSetDefault,
  onChangeUseCase,
  isTogglingId,
  isSettingDefault,
}: {
  voice: ElevenLabsVoiceDB;
  isDefault: boolean;
  onToggleActive: (id: string, val: boolean) => void;
  onSetDefault: (id: string) => void;
  onChangeUseCase: (
    id: string,
    uc: "agent" | "narration" | "general" | null,
  ) => void;
  isTogglingId: string | null;
  isSettingDefault: boolean;
}) {
  const playingId = usePlayingPreview();
  const isPlaying = playingId === voice.id;

  const handlePreview = () => {
    if (!voice.preview_url) return;
    if (isPlaying) {
      stopPreview();
    } else {
      playPreview(voice.id, voice.preview_url);
    }
  };

  return (
    <div className="flex items-center gap-3 py-3 px-4 rounded-lg border bg-card hover:bg-accent/30 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{voice.name}</span>
          {isDefault && (
            <Badge className="gap-1 text-xs">
              <Star className="h-3 w-3" /> Default
            </Badge>
          )}
          {voice.gender && (
            <Badge variant="outline" className="text-xs">
              {GENDER_LABELS[voice.gender] ?? voice.gender}
            </Badge>
          )}
          <Badge variant="secondary" className="text-xs">
            {voice.language.toUpperCase()}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate">
          {voice.voice_id}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Select
          value={voice.use_case ?? "general"}
          onValueChange={(v) =>
            onChangeUseCase(voice.id, v as "agent" | "narration" | "general")
          }
        >
          <SelectTrigger className="h-7 text-xs w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="agent">Agente AI</SelectItem>
            <SelectItem value="narration">Narrazione</SelectItem>
            <SelectItem value="general">Generale</SelectItem>
          </SelectContent>
        </Select>

        {voice.preview_url && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={handlePreview}
            title={isPlaying ? "Interrompi" : "Ascolta anteprima"}
          >
            {isPlaying ? (
              <Square className="h-4 w-4 text-primary" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
          </Button>
        )}

        <Button
          variant={isDefault ? "default" : "outline"}
          size="sm"
          className="h-7 text-xs"
          onClick={() => onSetDefault(voice.id)}
          disabled={isDefault || isSettingDefault}
        >
          <Star className="h-3 w-3 mr-1" />
          {isDefault ? "Default" : "Imposta"}
        </Button>

        <Switch
          checked={voice.is_active}
          onCheckedChange={(v) => onToggleActive(voice.id, v)}
          disabled={isTogglingId === voice.id}
        />
      </div>
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────

export function ElevenLabsVoiceConfig() {
  const { data: dbVoices = [], isLoading: dbLoading } = useElevenLabsVoicesDB();
  const {
    data: apiVoices = [],
    isLoading: apiLoading,
    isError: apiError,
    refetch: refetchAPI,
  } = useElevenLabsVoicesAPI();

  const syncMutation = useSyncVoicesToDB();
  const toggleActiveMutation = useToggleVoiceActive();
  const setDefaultMutation = useSetDefaultVoice();
  const updateUseCaseMutation = useUpdateVoiceUseCase();

  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [filterUseCase, setFilterUseCase] = useState<string>("all");
  const [search, setSearch] = useState("");

  // Stop preview quando si smonta la pagina
  const stopRef = useRef(stopPreview);
  useEffect(() => stopRef.current, []);

  const handleToggleActive = (id: string, val: boolean) => {
    setTogglingId(id);
    toggleActiveMutation.mutate(
      { id, is_active: val },
      { onSettled: () => setTogglingId(null) },
    );
  };

  const handleSync = () => {
    syncMutation.mutate(apiVoices);
  };

  const filteredVoices = useMemo(() => {
    const q = search.trim().toLowerCase();
    return dbVoices.filter((v) => {
      if (filterUseCase !== "all" && v.use_case !== filterUseCase) return false;
      if (q) {
        const hay = `${v.name} ${v.voice_id} ${v.language}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [dbVoices, filterUseCase, search]);

  const defaultVoiceId = dbVoices.find((v) => v.is_default)?.id ?? null;

  const activeCount = filteredVoices.filter((v) => v.is_active).length;
  const allActive = filteredVoices.length > 0 && activeCount === filteredVoices.length;
  const someActive = activeCount > 0 && !allActive;

  const bulkToggle = async (activate: boolean) => {
    // Agisce su tutte le voci filtrate (rispetto all'attuale vista)
    const targets = filteredVoices.filter((v) => v.is_active !== activate);
    if (targets.length === 0) return;
    // Esegui le mutazioni in parallelo
    for (const v of targets) {
      toggleActiveMutation.mutate({ id: v.id, is_active: activate });
    }
    toast.success(
      `${targets.length} voci ${activate ? "attivate" : "disattivate"}`,
    );
  };

  const apiKeyMissing = apiError && apiVoices.length === 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Mic className="h-4 w-4" />
              Voci ElevenLabs (Italiano)
            </CardTitle>
            <CardDescription className="mt-1">
              Gestisci le voci italiane disponibili per gli agenti vocali AI
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refetchAPI()}
              disabled={apiLoading}
            >
              <RefreshCw
                className={`h-4 w-4 mr-2 ${apiLoading ? "animate-spin" : ""}`}
              />
              Ricarica da API
            </Button>
            <Button
              size="sm"
              onClick={handleSync}
              disabled={syncMutation.isPending || apiVoices.length === 0}
            >
              <RefreshCw
                className={`h-4 w-4 mr-2 ${
                  syncMutation.isPending ? "animate-spin" : ""
                }`}
              />
              Sincronizza voci ({apiVoices.length})
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {apiKeyMissing && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>ELEVENLABS_API_KEY non configurata.</strong> Configura la variabile
              d'ambiente nei segreti Supabase per sincronizzare le voci.
            </AlertDescription>
          </Alert>
        )}

        {apiVoices.length > 0 && (
          <Alert>
            <AlertDescription>
              {apiVoices.length} voci italiane disponibili da ElevenLabs API.{" "}
              {dbVoices.length > 0
                ? `${dbVoices.length} sincronizzate nel DB.`
                : "Nessuna voce sincronizzata nel DB — clicca 'Sincronizza voci'."}
            </AlertDescription>
          </Alert>
        )}

        {/* Toolbar: search + filter + bulk actions */}
        {dbVoices.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-[320px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Cerca voce..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>

            <span className="text-sm text-muted-foreground">Filtra:</span>
            <RadioGroup
              value={filterUseCase}
              onValueChange={setFilterUseCase}
              className="flex gap-3"
            >
              {[
                { value: "all", label: "Tutte" },
                ...Object.entries(USE_CASE_LABELS).map(([k, v]) => ({
                  value: k,
                  label: v,
                })),
              ].map((opt) => (
                <div key={opt.value} className="flex items-center gap-1.5">
                  <RadioGroupItem value={opt.value} id={`uc-${opt.value}`} />
                  <Label htmlFor={`uc-${opt.value}`} className="text-sm cursor-pointer">
                    {opt.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>

            {filteredVoices.length > 0 && (
              <div className="ml-auto flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => void bulkToggle(true)}
                  disabled={allActive || toggleActiveMutation.isPending}
                  title="Attiva tutte le voci filtrate"
                >
                  <ToggleRight className="h-3.5 w-3.5 mr-1" />
                  Attiva tutte
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => void bulkToggle(false)}
                  disabled={(!someActive && !allActive) || toggleActiveMutation.isPending}
                  title="Disattiva tutte le voci filtrate"
                >
                  <ToggleLeft className="h-3.5 w-3.5 mr-1" />
                  Disattiva tutte
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Voice list */}
        {dbLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : filteredVoices.length === 0 ? (
          <div className="py-10 text-center text-muted-foreground">
            <Mic className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">
              {dbVoices.length === 0
                ? "Nessuna voce nel database. Sincronizza da ElevenLabs."
                : search || filterUseCase !== "all"
                ? "Nessuna voce per i filtri selezionati."
                : "Nessuna voce disponibile."}
            </p>
            {(search || filterUseCase !== "all") && dbVoices.length > 0 && (
              <Button
                variant="link"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setFilterUseCase("all");
                }}
                className="text-xs"
              >
                Reset filtri
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredVoices.map((voice) => (
              <VoiceRow
                key={voice.id}
                voice={voice}
                isDefault={voice.id === defaultVoiceId}
                onToggleActive={handleToggleActive}
                onSetDefault={(id) => setDefaultMutation.mutate(id)}
                onChangeUseCase={(id, uc) =>
                  updateUseCaseMutation.mutate({ id, use_case: uc })
                }
                isTogglingId={togglingId}
                isSettingDefault={setDefaultMutation.isPending}
              />
            ))}
          </div>
        )}

        {filteredVoices.length > 0 && (
          <p className="text-xs text-muted-foreground text-right">
            {activeCount}/{filteredVoices.length} voci attive
          </p>
        )}
      </CardContent>
    </Card>
  );
}
