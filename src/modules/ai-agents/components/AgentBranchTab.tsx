import { useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  GitBranch, Plus, Trash2, MoreHorizontal, ChevronDown, Trophy, Settings2, Save,
} from "lucide-react";
import {
  useAgentBranches, useCreateBranch, useUpdateBranch, useDeleteBranch, useUpdateTrafficSplit,
  type AgentBranch,
} from "../hooks/useAgentBranches";
import { useAgent } from "../hooks/useAgents";

const LLM_OPTIONS = [
  { value: "gpt-4o", label: "GPT-4o" },
  { value: "gpt-4o-mini", label: "GPT-4o Mini" },
  { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
  { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
  { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
  { value: "claude-3.5-sonnet", label: "Claude 3.5 Sonnet" },
];

interface Props {
  agentId: string;
  companyId: string;
}

export function AgentBranchTab({ agentId, companyId }: Props) {
  const { data: branches = [], isLoading } = useAgentBranches(agentId);
  const { data: agent } = useAgent(agentId);
  const createBranch = useCreateBranch(agentId);
  const updateBranch = useUpdateBranch(agentId);
  const deleteBranch = useDeleteBranch(agentId);
  const updateTraffic = useUpdateTrafficSplit(agentId);

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [editBranch, setEditBranch] = useState<AgentBranch | null>(null);
  const [localSplits, setLocalSplits] = useState<Record<string, number>>({});
  const [splitDirty, setSplitDirty] = useState(false);

  // Init main branch if none exist
  const needsInit = !isLoading && branches.length === 0;

  const handleInitMain = useCallback(() => {
    createBranch.mutate({
      agent_id: agentId,
      company_id: companyId,
      name: "Principale",
      traffic_percent: 100,
      is_main: true,
    });
  }, [agentId, companyId, createBranch]);

  const handleCreate = () => {
    if (!newName.trim()) return;
    const currentTotal = branches.reduce((s, b) => s + b.traffic_percent, 0);
    const newPercent = branches.length > 0 ? 0 : 100;
    createBranch.mutate({
      agent_id: agentId,
      company_id: companyId,
      name: newName.trim(),
      traffic_percent: Math.min(newPercent, 100 - currentTotal),
    });
    setNewName("");
    setShowCreate(false);
  };

  const handleDelete = (branch: AgentBranch) => {
    deleteBranch.mutate(branch.id);
    setSplitDirty(false);
  };

  // Traffic split management
  const splits = useMemo(() => {
    const map: Record<string, number> = {};
    branches.forEach((b) => { map[b.id] = localSplits[b.id] ?? b.traffic_percent; });
    return map;
  }, [branches, localSplits]);

  const totalSplit = useMemo(() => Object.values(splits).reduce((s, v) => s + v, 0), [splits]);

  const handleSplitChange = (id: string, value: number) => {
    setLocalSplits((prev) => ({ ...prev, [id]: value }));
    setSplitDirty(true);
  };

  const handleSaveSplits = () => {
    const payload = branches.map((b) => ({
      id: b.id,
      traffic_percent: splits[b.id] ?? b.traffic_percent,
    }));
    updateTraffic.mutate(payload);
    setSplitDirty(false);
    setLocalSplits({});
  };

  // Winner detection (≥30 conversations for significance)
  const winner = useMemo(() => {
    const eligible = branches.filter((b) => b.conversations_count >= 30);
    if (eligible.length < 2) return null;
    return eligible.reduce((best, b) => {
      const rate = b.conversations_count > 0 ? b.appointments_count / b.conversations_count : 0;
      const bestRate = best.conversations_count > 0 ? best.appointments_count / best.conversations_count : 0;
      return rate > bestRate ? b : best;
    });
  }, [branches]);

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-[300px]" /></div>;
  }

  if (needsInit) {
    return (
      <div className="text-center py-12 space-y-4">
        <GitBranch className="h-12 w-12 mx-auto text-muted-foreground" />
        <h3 className="text-lg font-medium">A/B Testing</h3>
        <p className="text-muted-foreground text-sm max-w-md mx-auto">
          Crea varianti del tuo agente con configurazioni diverse e confronta le performance.
        </p>
        <Button onClick={handleInitMain}>Inizializza branch principale</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitBranch className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-medium">A/B Testing</h3>
          <Badge variant="outline" className="text-xs">{branches.length} varianti</Badge>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)} className="gap-1">
          <Plus className="h-4 w-4" /> Crea variante
        </Button>
      </div>

      {/* Traffic Split */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Divisione Traffico</CardTitle>
            <div className="flex items-center gap-2">
              {totalSplit !== 100 && (
                <Badge variant="destructive" className="text-xs">Totale: {totalSplit}% (deve essere 100%)</Badge>
              )}
              {splitDirty && (
                <Button size="sm" variant="outline" onClick={handleSaveSplits} disabled={totalSplit !== 100} className="gap-1">
                  <Save className="h-3.5 w-3.5" /> Salva split
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {branches.map((branch) => (
            <div key={branch.id} className="flex items-center gap-4">
              <span className="w-32 text-sm font-medium truncate">{branch.name}</span>
              <Slider
                value={[splits[branch.id] ?? branch.traffic_percent]}
                onValueChange={([v]) => handleSplitChange(branch.id, v)}
                max={100}
                step={1}
                className="flex-1"
              />
              <span className="w-12 text-sm text-right font-mono">{splits[branch.id] ?? branch.traffic_percent}%</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Comparative Dashboard */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Performance comparative</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Variante</TableHead>
                  <TableHead className="text-right">Traffico</TableHead>
                  <TableHead className="text-right">Conversazioni</TableHead>
                  <TableHead className="text-right">Appuntamenti</TableHead>
                  <TableHead className="text-right">Tasso</TableHead>
                  <TableHead className="text-right">Durata media</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {branches.map((branch) => {
                  const rate = branch.conversations_count > 0
                    ? ((branch.appointments_count / branch.conversations_count) * 100).toFixed(1)
                    : "–";
                  const avgDur = branch.avg_duration_seconds > 0
                    ? `${Math.round(branch.avg_duration_seconds)}s`
                    : "–";
                  const isWinner = winner?.id === branch.id;

                  return (
                    <TableRow key={branch.id} className={isWinner ? "bg-primary/5" : ""}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{branch.name}</span>
                          {branch.is_main && <Badge variant="secondary" className="text-[10px]">Principale</Badge>}
                          {isWinner && (
                            <Badge className="gap-1 text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/30">
                              <Trophy className="h-3 w-3" /> Vincitore
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{branch.traffic_percent}%</TableCell>
                      <TableCell className="text-right">{branch.conversations_count}</TableCell>
                      <TableCell className="text-right">{branch.appointments_count}</TableCell>
                      <TableCell className="text-right font-mono">{rate}%</TableCell>
                      <TableCell className="text-right text-muted-foreground">{avgDur}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setEditBranch(branch)}>
                              <Settings2 className="h-4 w-4 mr-2" /> Configura override
                            </DropdownMenuItem>
                            {!branch.is_main && (
                              <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(branch)}>
                                <Trash2 className="h-4 w-4 mr-2" /> Elimina
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {branches.every((b) => b.conversations_count < 30) && branches.length > 1 && (
            <p className="text-xs text-muted-foreground mt-3">
              Servono almeno 30 conversazioni per variante per determinare un vincitore statisticamente significativo.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuova variante</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Nome variante</Label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="es. Tono formale, Prompt breve..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Annulla</Button>
            <Button onClick={handleCreate} disabled={!newName.trim()}>Crea</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Override Dialog */}
      {editBranch && (
        <BranchOverrideDialog
          branch={editBranch}
          agent={agent}
          onClose={() => setEditBranch(null)}
          onSave={(update) => {
            updateBranch.mutate({ id: editBranch.id, ...update });
            setEditBranch(null);
          }}
        />
      )}
    </div>
  );
}

interface OverrideDialogProps {
  branch: AgentBranch;
  agent: any;
  onClose: () => void;
  onSave: (update: Record<string, any>) => void;
}

function BranchOverrideDialog({ branch, agent, onClose, onSave }: OverrideDialogProps) {
  const [prompt, setPrompt] = useState(branch.system_prompt ?? "");
  const [firstMsg, setFirstMsg] = useState(branch.first_message ?? "");
  const [voiceId, setVoiceId] = useState(branch.voice_id ?? "");
  const [llm, setLlm] = useState(branch.llm_model ?? "");

  const handleSave = () => {
    onSave({
      system_prompt: prompt || null,
      first_message: firstMsg || null,
      voice_id: voiceId || null,
      llm_model: llm || null,
    });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Override – {branch.name}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Lascia vuoto per utilizzare la configurazione dell'agente principale.
        </p>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          <Collapsible defaultOpen>
            <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium w-full py-1">
              <ChevronDown className="h-4 w-4" /> System Prompt
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={agent?.system_prompt?.slice(0, 100) + "..." || "Prompt principale..."}
                rows={6}
              />
            </CollapsibleContent>
          </Collapsible>

          <Collapsible>
            <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium w-full py-1">
              <ChevronDown className="h-4 w-4" /> Primo messaggio
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <Textarea
                value={firstMsg}
                onChange={(e) => setFirstMsg(e.target.value)}
                placeholder={agent?.first_message || "Messaggio dell'agente principale..."}
                rows={3}
              />
            </CollapsibleContent>
          </Collapsible>

          <Collapsible>
            <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium w-full py-1">
              <ChevronDown className="h-4 w-4" /> Voce
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <Input
                value={voiceId}
                onChange={(e) => setVoiceId(e.target.value)}
                placeholder={agent?.voice_id || "Voice ID ElevenLabs..."}
              />
            </CollapsibleContent>
          </Collapsible>

          <Collapsible>
            <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium w-full py-1">
              <ChevronDown className="h-4 w-4" /> Modello LLM
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <Select value={llm} onValueChange={setLlm}>
                <SelectTrigger>
                  <SelectValue placeholder={agent?.llm_model || "Modello principale"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Usa principale</SelectItem>
                  {LLM_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CollapsibleContent>
          </Collapsible>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={handleSave}>Salva override</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
