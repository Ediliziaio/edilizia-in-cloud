import { useCallback, useEffect, useRef, useState } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { VoiceSelector } from "@/modules/ai-agents/components/VoiceSelector";
import { LLMSelector } from "@/modules/ai-agents/components/LLMSelector";
import { LANGUAGE_OPTIONS } from "@/modules/ai-agents/types/agent.types";
import { AGENT_TYPE_OPTIONS } from "../types/internalAgent.types";
import type { InternalAgent, InternalAgentUpdate } from "../types/internalAgent.types";
import { Badge } from "@/components/ui/badge";

interface InternalAgentTabProps {
  agent: InternalAgent;
  onSave: (update: InternalAgentUpdate) => void;
  isSaving: boolean;
}

export function InternalAgentTab({ agent, onSave, isSaving }: InternalAgentTabProps) {
  const [systemPrompt, setSystemPrompt] = useState(agent.system_prompt);
  const [firstMessage, setFirstMessage] = useState(agent.first_message);
  const [isInterruptible, setIsInterruptible] = useState(agent.is_interruptible);
  const [voiceId, setVoiceId] = useState(agent.voice_id);
  const [llmModel, setLlmModel] = useState(agent.llm_model);
  const [language, setLanguage] = useState(agent.language);
  const [agentType, setAgentType] = useState(agent.agent_type);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const triggerSave = useCallback(
    (update: InternalAgentUpdate) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onSave(update);
      }, 1500);
    },
    [onSave]
  );

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  // Highlight {{variables}} in prompt
  const highlightVars = (text: string) => {
    const parts = text.split(/({{[^}]+}})/g);
    return parts.map((part, i) =>
      part.startsWith("{{") ? (
        <Badge key={i} variant="secondary" className="text-xs mx-0.5 font-mono">
          {part}
        </Badge>
      ) : (
        <span key={i}>{part}</span>
      )
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left column — Prompts */}
      <div className="space-y-6">
        <div className="space-y-2">
          <Label>Tipo agente</Label>
          <Select
            value={agentType}
            onValueChange={(val) => {
              setAgentType(val as any);
              triggerSave({ agent_type: val as any });
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AGENT_TYPE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Prompt di sistema</Label>
          <Textarea
            value={systemPrompt}
            onChange={(e) => {
              setSystemPrompt(e.target.value);
              triggerSave({ system_prompt: e.target.value });
            }}
            placeholder="Descrivi il comportamento dell'agente... Usa {{client_name}}, {{last_order_name}} ecc."
            rows={10}
            className="resize-y min-h-[200px] font-mono text-sm"
          />
          {systemPrompt.includes("{{") && (
            <div className="text-xs text-muted-foreground flex flex-wrap gap-1 items-center">
              Variabili: {highlightVars(systemPrompt).filter((p) => typeof p !== "string" && p.props?.children?.startsWith("{{")}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label>Primo messaggio</Label>
          <Textarea
            value={firstMessage}
            onChange={(e) => {
              setFirstMessage(e.target.value);
              triggerSave({ first_message: e.target.value });
            }}
            placeholder="Il primo messaggio che l'agente dirà..."
            rows={3}
          />
        </div>

        <div className="flex items-center justify-between border rounded-lg p-3">
          <div>
            <p className="text-sm font-medium">Interrompibile</p>
            <p className="text-xs text-muted-foreground">Il cliente può interrompere l'agente mentre parla</p>
          </div>
          <Switch
            checked={isInterruptible}
            onCheckedChange={(val) => {
              setIsInterruptible(val);
              triggerSave({ is_interruptible: val });
            }}
          />
        </div>

        {isSaving && (
          <p className="text-xs text-muted-foreground animate-pulse">Salvataggio in corso...</p>
        )}
      </div>

      {/* Right column — Voice, LLM, Language */}
      <div className="space-y-6">
        <VoiceSelector
          value={voiceId}
          onChange={(val) => {
            setVoiceId(val);
            triggerSave({ voice_id: val });
          }}
        />
        <LLMSelector
          value={llmModel}
          onChange={(val) => {
            setLlmModel(val);
            triggerSave({ llm_model: val });
          }}
        />

        <div className="space-y-2">
          <Label>Lingua predefinita</Label>
          <Select
            value={language}
            onValueChange={(val) => {
              setLanguage(val);
              triggerSave({ language: val });
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGE_OPTIONS.map((lang) => (
                <SelectItem key={lang.code} value={lang.code}>
                  {lang.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
