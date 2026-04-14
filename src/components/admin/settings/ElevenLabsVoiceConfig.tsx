import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  AlertCircle,
  RefreshCw,
  Mic,
  Star,
  Volume2,
} from "lucide-react";
import {
  useElevenLabsVoicesDB,
  useElevenLabsVoicesAPI,
  useSyncVoicesToDB,
  useToggleVoiceActive,
  useSetDefaultVoice,
  useUpdateVoiceUseCase,
  type ElevenLabsVoiceDB,
} from "@/hooks/useAdminElevenLabsVoices";

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
  onChangeUseCase: (id: string, uc: "agent" | "narration" | "general" | null) => void;
  isTogglingId: string | null;
  isSettingDefault: boolean;
}) {
  const [isPlaying, setIsPlaying] = useState(false);

  const handlePreview = () => {
    if (!voice.preview_url) return;
    const audio = new Audio(voice.preview_url);
    setIsPlaying(true);
    audio.play().catch(() => setIsPlaying(false));
    audio.onended = () => setIsPlaying(false);
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
        <p className="text-xs text-muted-foreground font-mono mt-0.5">{voice.voice_id}</p>
      </div>

      <div className="flex items-center gap-2">
        {/* Use case selector */}
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

        {/* Preview button */}
        {voice.preview_url && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={handlePreview}
            disabled={isPlaying}
            title="Ascolta anteprima"
          >
            <Volume2 className={`h-4 w-4 ${isPlaying ? "text-primary animate-pulse" : ""}`} />
          </Button>
        )}

        {/* Default radio */}
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

        {/* Active toggle */}
        <Switch
          checked={voice.is_active}
          onCheckedChange={(v) => onToggleActive(voice.id, v)}
          disabled={isTogglingId === voice.id}
        />
      </div>
    </div>
  );
}

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

  const handleToggleActive = (id: string, val: boolean) => {
    setTogglingId(id);
    toggleActiveMutation.mutate(
      { id, is_active: val },
      { onSettled: () => setTogglingId(null) }
    );
  };

  const handleSync = () => {
    syncMutation.mutate(apiVoices);
  };

  const filteredVoices = dbVoices.filter(
    (v) => filterUseCase === "all" || v.use_case === filterUseCase
  );
  const defaultVoiceId = dbVoices.find((v) => v.is_default)?.id ?? null;

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
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refetchAPI()}
              disabled={apiLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${apiLoading ? "animate-spin" : ""}`} />
              Ricarica da API
            </Button>
            <Button
              size="sm"
              onClick={handleSync}
              disabled={syncMutation.isPending || apiVoices.length === 0}
            >
              <RefreshCw
                className={`h-4 w-4 mr-2 ${syncMutation.isPending ? "animate-spin" : ""}`}
              />
              Sincronizza voci ({apiVoices.length})
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Alert se API key mancante */}
        {apiKeyMissing && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>ELEVENLABS_API_KEY non configurata.</strong> Configura la variabile
              d'ambiente nei segreti Supabase per sincronizzare le voci.
            </AlertDescription>
          </Alert>
        )}

        {/* API voices available info */}
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

        {/* Filter by use case */}
        {dbVoices.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Filtra per:</span>
            <RadioGroup
              value={filterUseCase}
              onValueChange={setFilterUseCase}
              className="flex gap-3"
            >
              {[{ value: "all", label: "Tutte" }, ...Object.entries(USE_CASE_LABELS).map(([k, v]) => ({ value: k, label: v }))].map(
                (opt) => (
                  <div key={opt.value} className="flex items-center gap-1.5">
                    <RadioGroupItem value={opt.value} id={`uc-${opt.value}`} />
                    <Label htmlFor={`uc-${opt.value}`} className="text-sm cursor-pointer">
                      {opt.label}
                    </Label>
                  </div>
                )
              )}
            </RadioGroup>
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
                : "Nessuna voce per il filtro selezionato."}
            </p>
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
            {filteredVoices.filter((v) => v.is_active).length}/{filteredVoices.length} voci attive
          </p>
        )}
      </CardContent>
    </Card>
  );
}
