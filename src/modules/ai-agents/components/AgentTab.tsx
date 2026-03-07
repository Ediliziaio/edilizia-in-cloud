import { useCallback, useEffect, useRef, useState } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VoiceSelector } from "./VoiceSelector";
import { LLMSelector } from "./LLMSelector";
import { LANGUAGE_OPTIONS, type AIAgent, type AIAgentUpdate } from "../types/agent.types";

interface AgentTabProps {
  agent: AIAgent;
  onSave: (update: AIAgentUpdate) => void;
  isSaving: boolean;
}

export function AgentTab({ agent, onSave, isSaving }: AgentTabProps) {
  const [systemPrompt, setSystemPrompt] = useState(agent.system_prompt);
  const [firstMessage, setFirstMessage] = useState(agent.first_message);
  const [isInterruptible, setIsInterruptible] = useState(agent.is_interruptible);
  const [voiceId, setVoiceId] = useState(agent.voice_id);
  const [llmModel, setLlmModel] = useState(agent.llm_model);
  const [language, setLanguage] = useState(agent.language);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Auto-save with debounce
  const triggerSave = useCallback(
    (update: AIAgentUpdate) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onSave(update);
      }, 1500);
    },
    [onSave]
  );

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  const handlePromptChange = (val: string) => {
    setSystemPrompt(val);
    triggerSave({ system_prompt: val });
  };

  const handleFirstMessageChange = (val: string) => {
    setFirstMessage(val);
    triggerSave({ first_message: val });
  };

  const handleInterruptibleChange = (val: boolean) => {
    setIsInterruptible(val);
    triggerSave({ is_interruptible: val });
  };

  const handleVoiceChange = (val: string) => {
    setVoiceId(val);
    triggerSave({ voice_id: val });
  };

  const handleLlmChange = (val: string) => {
    setLlmModel(val);
    triggerSave({ llm_model: val });
  };

  const handleLanguageChange = (val: string) => {
    setLanguage(val);
    triggerSave({ language: val });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left column — Prompts */}
      <div className="space-y-6">
        <div className="space-y-2">
          <Label>Prompt di sistema</Label>
          <Textarea
            value={systemPrompt}
            onChange={(e) => handlePromptChange(e.target.value)}
            placeholder="Descrivi il comportamento e la personalità dell'agente..."
            rows={10}
            className="resize-y min-h-[200px]"
          />
        </div>

        <div className="space-y-2">
          <Label>Primo messaggio</Label>
          <Textarea
            value={firstMessage}
            onChange={(e) => handleFirstMessageChange(e.target.value)}
            placeholder="Il primo messaggio che l'agente invierà..."
            rows={3}
          />
        </div>

        <div className="flex items-center justify-between border rounded-lg p-3">
          <div>
            <p className="text-sm font-medium">Interrompibile</p>
            <p className="text-xs text-muted-foreground">L'utente può interrompere l'agente mentre parla</p>
          </div>
          <Switch checked={isInterruptible} onCheckedChange={handleInterruptibleChange} />
        </div>

        {isSaving && (
          <p className="text-xs text-muted-foreground animate-pulse">Salvataggio in corso...</p>
        )}
      </div>

      {/* Right column — Voice, LLM, Language */}
      <div className="space-y-6">
        <VoiceSelector value={voiceId} onChange={handleVoiceChange} />
        <LLMSelector value={llmModel} onChange={handleLlmChange} />

        <div className="space-y-2">
          <Label>Lingua predefinita</Label>
          <Select value={language} onValueChange={handleLanguageChange}>
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
