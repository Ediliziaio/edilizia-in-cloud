import { useState, useEffect } from "react";
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
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { VOICE_AGENT_TEMPLATES, templatesPerCategoria } from "@/lib/voice-agent-templates";
import { Switch } from "@/components/ui/switch";
import {
  ArrowLeft, Bot, Settings2, MessageSquare, Phone, BarChart3,
  Loader2, Save, Mic, Zap, Clock, TrendingUp, CheckCircle2, Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { ConversazioniTab } from "@/components/agenti/ConversazioniTab";
import { useAiAgentsBasePath } from "@/hooks/useAiAgentsBasePath";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { callElevenLabsProxy } from "@/modules/ai-agents/hooks/useElevenLabsProxy";
import type { UnifiedAgent } from "@/types/unifiedAgent.types";

type SubTab = "panoramica" | "configurazione" | "conversazioni" | "statistiche";

const safeNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

// Strumenti in-chiamata con backend reale (edge agent-tools): l'URL del webhook
// lo genera il server (elevenlabs-proxy) — qui solo on/off. Gli id coincidono
// con BACKED_EDILIZIA_TOOLS del proxy.
const STRUMENTI_CHIAMATA: Array<{ id: string; label: string; descrizione: string }> = [
  { id: "get_lead_info", label: "Riconosci il cliente", descrizione: "Sa chi sta chiamando: nome, lavori e preventivi aperti" },
  { id: "stato_consegna", label: "Stato consegna", descrizione: "Risponde a \"quando arriva la merce?\" con i dati della commessa" },
  { id: "stato_preventivo", label: "Stato preventivo", descrizione: "Dice se il preventivo è stato inviato, accettato o è scaduto" },
  { id: "create_appointment", label: "Fissa appuntamenti", descrizione: "Controlla l'agenda e prenota sopralluoghi negli slot liberi" },
  { id: "get_availability", label: "Disponibilità agenda", descrizione: "Propone gli orari liberi di una giornata" },
  { id: "crea_ticket", label: "Apri segnalazioni", descrizione: "Crea un ticket di assistenza col racconto del cliente" },
  { id: "assign_to_user", label: "Richiesta di richiamo", descrizione: "Lascia un'attività all'ufficio quando serve una persona vera" },
  { id: "search_products", label: "Cerca nel listino", descrizione: "Conferma se un prodotto o materiale è in catalogo" },
];

type EdiliziaToolCfg = { enabled?: boolean; webhook_url?: string };

/** Nome canonico dello strumento (come nei prompt) → id del toggle in UI. */
const CANONICO_A_UI: Record<string, string> = {
  info_cliente: "get_lead_info",
  stato_consegna: "stato_consegna",
  stato_preventivo: "stato_preventivo",
  fissa_appuntamento: "create_appointment",
  disponibilita: "get_availability",
  crea_ticket: "crea_ticket",
  richiesta_richiamo: "assign_to_user",
  info_prodotto: "search_products",
};

export default function AgentDetailPage() {
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const companyId = useEffectiveCompanyId();
  // Prefix dinamico: preserva contesto admin vs azienda sui link "Torna agli agenti"
  const basePath = useAiAgentsBasePath();
  const [activeTab, setActiveTab] = useState<SubTab>("panoramica");

  const { data: agent, isLoading } = useQuery({
    queryKey: ["agent-detail", companyId, agentId],
    enabled: !!agentId && !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_agents_v2")
        .select("*")
        .eq("company_id", companyId!)
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
  const [editTools, setEditTools] = useState<Record<string, boolean>>({});
  const [hasLoadedEdit, setHasLoadedEdit] = useState(false);

  useEffect(() => {
    setHasLoadedEdit(false);
  }, [agentId]);

  // Load edit state from agent — in useEffect per evitare setState durante
  // render (React anti-pattern che causava "Cannot update state during render"
  // + re-render multipli). `hasLoadedEdit` garantisce caricamento una sola
  // volta, così se l'utente modifica un campo non viene sovrascritto.
  useEffect(() => {
    if (agent && !hasLoadedEdit) {
      setEditNome(agent.nome);
      setEditDescrizione(agent.descrizione || "");
      setEditPrompt(agent.system_prompt || "");
      setEditPrimoMsg(agent.primo_messaggio || "");
      setEditLingua(agent.lingua || "it");
      setEditModel(agent.llm_model || "gemini-2.5-flash");
      setEditTemp(safeNumber(agent.temperatura, 0.7));
      const ediliziaTools = (agent.tools_config as { edilizia_tools?: Record<string, EdiliziaToolCfg> } | null)?.edilizia_tools ?? {};
      setEditTools(Object.fromEntries(STRUMENTI_CHIAMATA.map((t) => [t.id, !!ediliziaTools[t.id]?.enabled])));
      setHasLoadedEdit(true);
    }
  }, [agent, hasLoadedEdit]);

  const updateAgent = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Nessuna azienda associata");
      const nome = editNome.trim();
      const prompt = editPrompt.trim();
      if (!nome) throw new Error("Inserisci un nome per l'agente AI.");
      if (prompt.length < 20) throw new Error("Completa il prompt di sistema prima di salvare.");

      // Merge non distruttivo: i toggle governano `enabled`, ma un webhook_url
      // configurato a mano (o altri rami di tools_config) restano intatti.
      const prevConfig = (agent?.tools_config ?? {}) as Record<string, unknown> & { edilizia_tools?: Record<string, EdiliziaToolCfg> };
      const newToolsConfig = {
        ...prevConfig,
        edilizia_tools: {
          ...(prevConfig.edilizia_tools ?? {}),
          ...Object.fromEntries(STRUMENTI_CHIAMATA.map((t) => [t.id, {
            ...(prevConfig.edilizia_tools?.[t.id] ?? {}),
            enabled: !!editTools[t.id],
            webhook_url: prevConfig.edilizia_tools?.[t.id]?.webhook_url ?? "",
          }])),
        },
      };

      if (agent?.elevenlabs_agent_id) {
        await callElevenLabsProxy({
          action: "update_agent",
          agent_id: agent.elevenlabs_agent_id,
          payload: {
            name: nome,
            system_prompt: prompt,
            first_message: editPrimoMsg.trim() || "",
            language: editLingua,
            llm_model: editModel,
            tools_config: newToolsConfig,
          },
        });
      }

      const { error } = await supabase
        .from("ai_agents_v2")
        .update({
          nome,
          descrizione: editDescrizione.trim() || null,
          system_prompt: prompt,
          primo_messaggio: editPrimoMsg.trim() || null,
          lingua: editLingua,
          llm_model: editModel,
          temperatura: Math.min(1, Math.max(0, safeNumber(editTemp, 0.7))),
          tools_config: newToolsConfig,
        } as never)
        .eq("company_id", companyId)
        .eq("id", agentId!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Agente aggiornato");
      queryClient.invalidateQueries({ queryKey: ["agent-detail", companyId, agentId] });
      queryClient.invalidateQueries({ queryKey: ["unified-ai-agents"] });
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
        <Button variant="outline" className="mt-4 hidden md:inline-flex" onClick={() => navigate(basePath)}>
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Torna agli agenti
        </Button>
      </div>
    );
  }

  const isVoice = agent.tipo === "vocale" || agent.tipo === "campagna";
  const completionRate = safeNumber(agent.chiamate_totali) > 0
    ? `${Math.round((safeNumber(agent.chiamate_completate) / safeNumber(agent.chiamate_totali)) * 100)}%`
    : "–";
  const configIssues = [
    !editNome.trim() ? "Nome mancante" : null,
    editPrompt.trim().length < 20 ? "Prompt di sistema troppo breve" : null,
    (isVoice && agent.stato === "attivo" && !agent.elevenlabs_agent_id) ? "Collegamento ElevenLabs mancante" : null,
  ].filter(Boolean);
  const canSaveConfig = configIssues.length === 0;

  return (
    <div className="space-y-0">
      {/* Header */}
      <div className="px-6 pt-6 pb-4">
        <div className="flex items-center gap-3 mb-3">
          <Button variant="ghost" size="sm" className="hidden md:inline-flex" onClick={() => navigate(basePath)}>
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
            <StatCard icon={isVoice ? Phone : MessageSquare} label={isVoice ? "Chiamate" : "Chat"} value={isVoice ? safeNumber(agent.chiamate_totali) : safeNumber(agent.chat_totali)} />
            <StatCard icon={Clock} label="Minuti" value={Math.round(safeNumber(agent.minuti_totali))} />
            <StatCard icon={CheckCircle2} label="Completate" value={safeNumber(agent.chiamate_completate)} />
            <StatCard
              icon={TrendingUp}
              label="Tasso completamento"
              value={completionRate}
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
                <div className="flex justify-between"><span className="text-muted-foreground">Lingua</span><span>{(agent.lingua || "it").toUpperCase()}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Modello LLM</span><span>{agent.llm_model || "Non impostato"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Temperatura</span><span>{safeNumber(agent.temperatura, 0.7)}</span></div>
                {agent.voice_nome && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Voce</span><span className="flex items-center gap-1"><Mic className="h-3 w-3" />{agent.voice_nome}</span></div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Costi</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Crediti usati</span><span>{safeNumber(agent.costo_totale_crediti).toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Min. totali</span><span>{safeNumber(agent.minuti_totali).toFixed(1)}</span></div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Configurazione */}
        <TabsContent value="configurazione" className="mt-0 p-6">
          <div className="max-w-2xl space-y-4">
            <Card className={configIssues.length ? "border-amber-200 bg-amber-50/60" : "border-emerald-200 bg-emerald-50/60"}>
              <CardContent className="p-4">
                <p className="text-sm font-medium text-foreground">
                  {configIssues.length ? "Configurazione non pronta" : "Configurazione pronta per il salvataggio"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Gli agenti restano controllabili: nome e prompt sono obbligatori prima del salvataggio e dell'attivazione.
                </p>
                {configIssues.length > 0 && (
                  <ul className="mt-2 text-xs text-amber-800 list-disc pl-4 space-y-1">
                    {configIssues.map((issue) => <li key={String(issue)}>{issue}</li>)}
                  </ul>
                )}
              </CardContent>
            </Card>
            <div>
              <label className="text-sm font-medium mb-1 block">Nome</label>
              <Input value={editNome} onChange={(e) => setEditNome(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Descrizione</label>
              <Textarea value={editDescrizione} onChange={(e) => setEditDescrizione(e.target.value)} rows={2} />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1 gap-2">
                <label className="text-sm font-medium block">System Prompt</label>
                {/* Un textarea vuoto è il motivo per cui gli agenti nascono
                    generici: 5 mestieri già scritti coi 6 blocchi ElevenLabs
                    (Personalità/Contesto/Tono/Obiettivo/Limiti/Strumenti). */}
                <Select
                  value=""
                  onValueChange={(id) => {
                    const t = VOICE_AGENT_TEMPLATES.find((x) => x.id === id);
                    if (!t) return;
                    setEditPrompt(t.systemPrompt);
                    setEditPrimoMsg(t.primoMessaggio);
                    // Il prompt cita strumenti: senza abilitarli l'agente
                    // promette al modello cose che non puo' fare.
                    setEditTools((prev) => ({
                      ...prev,
                      ...Object.fromEntries(t.strumenti.map((c) => [CANONICO_A_UI[c] ?? c, true])),
                    }));
                    toast.info(`Template "${t.nome}" applicato`, {
                      description: t.variabili.length
                        ? `Variabili da passare in chiamata: ${t.variabili.map((v) => `{{${v}}}`).join(", ")}`
                        : undefined,
                    });
                  }}
                >
                  <SelectTrigger className="h-8 w-auto max-w-[280px] text-xs">
                    <SelectValue placeholder="Parti da un template edilizia…" />
                  </SelectTrigger>
                  <SelectContent>
                    {templatesPerCategoria().map((g) => (
                      <SelectGroup key={g.categoria}>
                        <SelectLabel>{g.categoria}</SelectLabel>
                        {g.templates.map((t) => (
                          <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Textarea value={editPrompt} onChange={(e) => setEditPrompt(e.target.value)} rows={8} className="font-mono text-xs" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Primo messaggio</label>
              <Textarea value={editPrimoMsg} onChange={(e) => setEditPrimoMsg(e.target.value)} rows={3} />
            </div>
            {isVoice && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-1.5">
                    <Wrench className="h-4 w-4" /> Strumenti in chiamata
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Cosa può fare davvero l'agente durante la telefonata, con i dati reali dell'azienda.
                    Si attivano al salvataggio, senza configurazioni tecniche.
                  </p>
                </CardHeader>
                <CardContent className="space-y-1">
                  {STRUMENTI_CHIAMATA.map((t) => (
                    <div key={t.id} className="flex items-center justify-between gap-3 py-1.5">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{t.label}</p>
                        <p className="text-xs text-muted-foreground">{t.descrizione}</p>
                      </div>
                      <Switch
                        checked={!!editTools[t.id]}
                        onCheckedChange={(v) => setEditTools((prev) => ({ ...prev, [t.id]: v }))}
                        aria-label={t.label}
                      />
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
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
            <Button onClick={() => updateAgent.mutate()} disabled={updateAgent.isPending || !canSaveConfig}>
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
            <StatCard icon={isVoice ? Phone : MessageSquare} label={isVoice ? "Chiamate totali" : "Chat totali"} value={isVoice ? safeNumber(agent.chiamate_totali) : safeNumber(agent.chat_totali)} />
            <StatCard icon={CheckCircle2} label="Completate" value={safeNumber(agent.chiamate_completate)} />
            <StatCard icon={Clock} label="Minuti totali" value={Math.round(safeNumber(agent.minuti_totali))} />
            <StatCard icon={TrendingUp} label="Crediti" value={safeNumber(agent.costo_totale_crediti).toFixed(2)} />
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
