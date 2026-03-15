import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, Bot, Settings2, MessageSquare, Phone, BarChart3,
  Loader2, Save, Mic, Zap, Clock, TrendingUp, CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { ConversazioniTab } from "@/components/agenti/ConversazioniTab";
import type { UnifiedAgent } from "@/types/unifiedAgent.types";

type SubTab = "panoramica" | "configurazione" | "conversazioni" | "statistiche";

export default function AgentDetailPage() {
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<SubTab>("panoramica");

  const { data: agent, isLoading } = useQuery({
    queryKey: ["agent-detail", agentId],
    enabled: !!agentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_agents_v2")
        .select("*")
        .eq("id", agentId!)
        .single();
      if (error) throw error;
      return data as unknown as UnifiedAgent;
    },
  });

  // Edit state
  const [editNome, setEditNome] = useState("");
  const [editDescrizione, setEditDescrizione] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  const [editPrimoMsg, setEditPrimoMsg] = useState("");
  const [editLingua, setEditLingua] = useState("it");
  const [editModel, setEditModel] = useState("");
  const [editTemp, setEditTemp] = useState(0.7);
  const [hasLoadedEdit, setHasLoadedEdit] = useState(false);

  // Load edit state from agent
  if (agent && !hasLoadedEdit) {
    setEditNome(agent.nome);
    setEditDescrizione(agent.descrizione || "");
    setEditPrompt(agent.system_prompt || "");
    setEditPrimoMsg(agent.primo_messaggio || "");
    setEditLingua(agent.lingua);
    setEditModel(agent.llm_model);
    setEditTemp(agent.temperatura);
    setHasLoadedEdit(true);
  }

  const updateAgent = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("ai_agents_v2")
        .update({
          nome: editNome,
          descrizione: editDescrizione || null,
          system_prompt: editPrompt || null,
          primo_messaggio: editPrimoMsg || null,
          lingua: editLingua,
          llm_model: editModel,
          temperatura: editTemp,
        } as never)
        .eq("id", agentId!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Agente aggiornato");
      queryClient.invalidateQueries({ queryKey: ["agent-detail", agentId] });
      queryClient.invalidateQueries({ queryKey: ["unified-agents"] });
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Agente non trovato.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/azienda/agenti-ai")}>
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Torna agli agenti
        </Button>
      </div>
    );
  }

  const isVoice = agent.tipo === "vocale" || agent.tipo === "campagna";

  return (
    <div className="space-y-0">
      {/* Header */}
      <div className="px-6 pt-6 pb-4">
        <div className="flex items-center gap-3 mb-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/azienda/agenti-ai")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Agenti
          </Button>
        </div>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Bot className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">{agent.nome}</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge variant="secondary" className="text-[10px]">{agent.tipo}</Badge>
                <Badge
                  variant={agent.stato === "attivo" ? "default" : "outline"}
                  className="text-[10px]"
                >
                  {agent.stato}
                </Badge>
                {agent.elevenlabs_agent_id && (
                  <Badge variant="outline" className="text-[10px]">
                    <Zap className="h-2.5 w-2.5 mr-0.5" /> ElevenLabs
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as SubTab)}>
        <div className="px-6 border-b border-border">
          <TabsList className="bg-transparent h-auto p-0 gap-0">
            {[
              { key: "panoramica", label: "Panoramica", icon: BarChart3 },
              { key: "configurazione", label: "Configurazione", icon: Settings2 },
              { key: "conversazioni", label: isVoice ? "Chiamate" : "Conversazioni", icon: isVoice ? Phone : MessageSquare },
              { key: "statistiche", label: "Statistiche", icon: TrendingUp },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger
                  key={tab.key}
                  value={tab.key}
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2.5 text-sm"
                >
                  <Icon className="h-4 w-4 mr-1.5" />
                  {tab.label}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        {/* Panoramica */}
        <TabsContent value="panoramica" className="mt-0 p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard icon={isVoice ? Phone : MessageSquare} label={isVoice ? "Chiamate" : "Chat"} value={isVoice ? agent.chiamate_totali : agent.chat_totali} />
            <StatCard icon={Clock} label="Minuti" value={Math.round(agent.minuti_totali)} />
            <StatCard icon={CheckCircle2} label="Completate" value={agent.chiamate_completate} />
            <StatCard
              icon={TrendingUp}
              label="Tasso completamento"
              value={agent.chiamate_totali > 0 ? `${Math.round((agent.chiamate_completate / agent.chiamate_totali) * 100)}%` : "–"}
            />
          </div>

          {agent.descrizione && (
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">{agent.descrizione}</p>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-2 gap-4 mt-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Dettagli</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Lingua</span><span>{agent.lingua.toUpperCase()}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Modello LLM</span><span>{agent.llm_model}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Temperatura</span><span>{agent.temperatura}</span></div>
                {agent.voice_nome && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Voce</span><span className="flex items-center gap-1"><Mic className="h-3 w-3" />{agent.voice_nome}</span></div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Costi</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Crediti usati</span><span>{agent.costo_totale_crediti.toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Min. totali</span><span>{agent.minuti_totali.toFixed(1)}</span></div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Configurazione */}
        <TabsContent value="configurazione" className="mt-0 p-6">
          <div className="max-w-2xl space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Nome</label>
              <Input value={editNome} onChange={(e) => setEditNome(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Descrizione</label>
              <Textarea value={editDescrizione} onChange={(e) => setEditDescrizione(e.target.value)} rows={2} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">System Prompt</label>
              <Textarea value={editPrompt} onChange={(e) => setEditPrompt(e.target.value)} rows={8} className="font-mono text-xs" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Primo messaggio</label>
              <Textarea value={editPrimoMsg} onChange={(e) => setEditPrimoMsg(e.target.value)} rows={3} />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Lingua</label>
                <Select value={editLingua} onValueChange={setEditLingua}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="it">Italiano</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="de">Deutsch</SelectItem>
                    <SelectItem value="fr">Français</SelectItem>
                    <SelectItem value="es">Español</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Modello LLM</label>
                <Select value={editModel} onValueChange={setEditModel}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gemini-2.5-flash">Gemini 2.5 Flash</SelectItem>
                    <SelectItem value="gemini-2.5-pro">Gemini 2.5 Pro</SelectItem>
                    <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                    <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
                    <SelectItem value="claude-3.5-sonnet">Claude 3.5 Sonnet</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Temperatura ({editTemp})</label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={editTemp}
                  onChange={(e) => setEditTemp(parseFloat(e.target.value))}
                  className="w-full mt-2"
                />
              </div>
            </div>
            <Button onClick={() => updateAgent.mutate()} disabled={updateAgent.isPending}>
              {updateAgent.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
              Salva configurazione
            </Button>
          </div>
        </TabsContent>

        {/* Conversazioni */}
        <TabsContent value="conversazioni" className="mt-0 p-6">
          <ConversazioniTab agentIdFilter={agentId} />
        </TabsContent>

        {/* Statistiche */}
        <TabsContent value="statistiche" className="mt-0 p-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard icon={isVoice ? Phone : MessageSquare} label={isVoice ? "Chiamate totali" : "Chat totali"} value={isVoice ? agent.chiamate_totali : agent.chat_totali} />
            <StatCard icon={CheckCircle2} label="Completate" value={agent.chiamate_completate} />
            <StatCard icon={Clock} label="Minuti totali" value={Math.round(agent.minuti_totali)} />
            <StatCard icon={TrendingUp} label="Crediti" value={agent.costo_totale_crediti.toFixed(2)} />
          </div>
          <p className="text-sm text-muted-foreground text-center mt-8">
            Grafici dettagliati saranno disponibili nelle prossime versioni.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: typeof Phone; label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-xl font-bold text-foreground">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
