import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Brain, ChevronDown, Settings2 } from "lucide-react";
import { LLM_OPTIONS } from "../types/agent.types";
import { useState } from "react";

interface LLMSelectorProps {
  value: string;
  onChange: (model: string) => void;
  temperature?: number;
  onTemperatureChange?: (val: number) => void;
  maxTokens?: number;
  onMaxTokensChange?: (val: number) => void;
  // AI advanced — optional, backward-compatible
  thinkingEnabled?: boolean;
  onThinkingEnabledChange?: (val: boolean) => void;
  backupLlm?: string;
  onBackupLlmChange?: (val: string) => void;
}

const costLabel: Record<string, string> = { low: "€", medium: "€€", high: "€€€" };
const latencyLabel: Record<string, string> = { low: "Veloce", medium: "Medio", high: "Lento" };

export function LLMSelector({
  value, onChange,
  temperature = 0.7, onTemperatureChange,
  maxTokens = 4096, onMaxTokensChange,
  thinkingEnabled = false, onThinkingEnabledChange,
  backupLlm = "none", onBackupLlmChange,
}: LLMSelectorProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  return (
    <div className="space-y-3">
      <Label className="flex items-center gap-2">
        <Brain className="h-4 w-4" /> Modello LLM
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Seleziona modello" />
        </SelectTrigger>
        <SelectContent>
          {LLM_OPTIONS.map((opt) => (
            <SelectItem key={opt.id} value={opt.id}>
              <div className="flex items-center gap-2">
                <span>{opt.name}</span>
                <Badge variant="outline" className="text-[10px] px-1 py-0">{opt.provider}</Badge>
                <span className="text-[10px] text-muted-foreground">
                  {latencyLabel[opt.latency]} · {costLabel[opt.cost]}
                </span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Advanced LLM settings */}
      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full">
          <Settings2 className="h-3.5 w-3.5" />
          <span>Impostazioni avanzate LLM</span>
          <ChevronDown className={`h-3.5 w-3.5 ml-auto transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3 space-y-4 pl-1 border-l-2 border-muted ml-[7px] pl-4">
          {/* Temperature */}
          <div className="space-y-2">
            <Label className="text-sm">Temperatura</Label>
            <Slider
              value={[temperature]}
              min={0} max={2} step={0.1}
              onValueChange={([v]: number[]) => onTemperatureChange?.(v)}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Deterministico</span>
              <span>{temperature.toFixed(1)}</span>
              <span>Creativo</span>
            </div>
          </div>

          {/* Max tokens */}
          <div className="space-y-2">
            <Label className="text-sm">Limite token</Label>
            <Input
              type="number"
              value={maxTokens}
              onChange={(e) => onMaxTokensChange?.(parseInt(e.target.value) || 4096)}
              min={256}
              max={128000}
              step={256}
              className="h-8"
            />
            <p className="text-xs text-muted-foreground">Numero massimo di token per risposta</p>
          </div>

          {/* Thinking budget */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Budget di riflessione</p>
              <p className="text-xs text-muted-foreground">
                Attiva il ragionamento esteso (solo claude-sonnet-4-6+)
              </p>
            </div>
            <Switch
              checked={thinkingEnabled}
              onCheckedChange={(val) => onThinkingEnabledChange?.(val)}
            />
          </div>

          {/* Backup LLM */}
          <div className="space-y-2">
            <Label className="text-sm">Backup LLM</Label>
            <Select
              value={backupLlm}
              onValueChange={(val) => onBackupLlmChange?.(val)}
            >
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nessun backup</SelectItem>
                <SelectItem value="claude-haiku-4-5-20251001">Claude Haiku 4.5 (economico)</SelectItem>
                <SelectItem value="claude-sonnet-4-6">Claude Sonnet 4.6 (bilanciato)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Modello di fallback usato automaticamente in caso di errore del primario
            </p>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
