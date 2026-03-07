import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Brain } from "lucide-react";
import { LLM_OPTIONS } from "../types/agent.types";

interface LLMSelectorProps {
  value: string;
  onChange: (model: string) => void;
}

const costLabel: Record<string, string> = { low: "€", medium: "€€", high: "€€€" };
const latencyLabel: Record<string, string> = { low: "Veloce", medium: "Medio", high: "Lento" };

export function LLMSelector({ value, onChange }: LLMSelectorProps) {
  return (
    <div className="space-y-2">
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
    </div>
  );
}
