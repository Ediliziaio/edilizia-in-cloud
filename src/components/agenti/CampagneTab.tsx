import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import {
  Plus, Play, Pause, Trash2, Megaphone, CheckCircle2, Phone, BarChart3,
  Calendar, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { it } from "date-fns/locale";

interface Campaign {
  id: string;
  nome: string;
  descrizione: string | null;
  agent_id: string;
  stato: string;
  tipo: string;
  totale_contatti: number;
  chiamate_effettuate: number;
  chiamate_completate: number;
  chiamate_no_risposta: number;
  tasso_risposta: number;
  crediti_utilizzati: number;
  data_inizio: string | null;
  data_fine: string | null;
  schedulata_il: string | null;
  creato_il: string;
}

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  bozza: { label: "Bozza", variant: "secondary" },
  programmata: { label: "Programmata", variant: "outline" },
  in_corso: { label: "In corso", variant: "default" },
  completata: { label: "Completata", variant: "secondary" },
  in_pausa: { label: "In pausa", variant: "destructive" },
};

export function CampagneTab() {
  const companyId = useEffectiveCompanyId();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createStep, setCreateStep] = useState(1);
  const [form, setForm] = useState({ nome: "", descrizione: "", agent_id: "", tipo: "outbound" });

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["ai-campaigns-v2", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_campaigns_v2" as never)
        .select("*")
        .eq("company_id", companyId!)
        .order("creato_il", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Campaign[];
    },
  });

  const { data: agents = [] } = useQuery({
    queryKey: ["ai-agents-v2-select", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("ai_agents_v2" as never)
        .select("id, nome, tipo")
        .eq("company_id", companyId!);
      return (data ?? []) as unknown as { id: string; nome: string; tipo: string }[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!companyId || !form.agent_id) throw new Error("Dati mancanti");
      const { error } = await supabase.from("ai_campaigns_v2" as never).insert({
        company_id: companyId,
        nome: form.nome,
        descrizione: form.descrizione || null,
        agent_id: form.agent_id,
        tipo: form.tipo,
        stato: "bozza",
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-campaigns-v2"] });
      toast.success("Campagna creata");
      setShowCreateDialog(false);
      setCreateStep(1);
      setForm({ nome: "", descrizione: "", agent_id: "", tipo: "outbound" });
    },
    onError: () => toast.error("Errore nella creazione"),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, stato }: { id: string; stato: string }) => {
      const { error } = await supabase
        .from("ai_campaigns_v2" as never)
        .update({ stato } as never)
        .eq("id" as never, id as never);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai-campaigns-v2"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ai_campaigns_v2" as never).delete().eq("id" as never, id as never);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-campaigns-v2"] });
      toast.success("Campagna eliminata");
    },
  });

  const filtered = statusFilter === "all" ? campaigns : campaigns.filter((c) => c.stato === statusFilter);

  const statsActive = campaigns.filter((c) => c.stato === "in_corso").length;
  const statsCompleted = campaigns.filter((c) => c.stato === "completata").length;
  const statsCalls = campaigns.reduce((s, c) => s + c.chiamate_effettuate, 0);
  const statsRate = statsCalls > 0
    ? Math.round(campaigns.reduce((s, c) => s + c.chiamate_completate, 0) / statsCalls * 100)
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Campagne Outbound</h2>
          <p className="text-sm text-muted-foreground">Gestisci campagne di chiamate in uscita con i tuoi agenti AI</p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4 mr-2" /> Nuova Campagna
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Attive", value: statsActive, icon: Megaphone, color: "text-primary" },
          { label: "Completate", value: statsCompleted, icon: CheckCircle2, color: "text-primary/70" },
          { label: "Chiamate Totali", value: statsCalls, icon: Phone, color: "text-primary/60" },
          { label: "Tasso Risposta", value: `${statsRate}%`, icon: BarChart3, color: "text-primary/50" },
        ].map((s) => (
          <Card key={s.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold flex items-center gap-2">
                <s.icon className={`h-5 w-5 ${s.color}`} />
                {s.value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter */}
      <Select value={statusFilter} onValueChange={setStatusFilter}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Filtra per stato" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tutti gli stati</SelectItem>
          <SelectItem value="bozza">Bozza</SelectItem>
          <SelectItem value="programmata">Programmata</SelectItem>
          <SelectItem value="in_corso">In corso</SelectItem>
          <SelectItem value="completata">Completata</SelectItem>
          <SelectItem value="in_pausa">In pausa</SelectItem>
        </SelectContent>
      </Select>

      {/* Campaign Cards */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Megaphone className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>Nessuna campagna trovata</p>
            <Button variant="outline" className="mt-4" onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" /> Crea la prima campagna
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((c) => {
            const badge = STATUS_MAP[c.stato] || STATUS_MAP.bozza;
            const progress = c.totale_contatti > 0
              ? Math.round((c.chiamate_effettuate / c.totale_contatti) * 100)
              : 0;
            return (
              <Card key={c.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base">{c.nome}</CardTitle>
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  </div>
                  {c.descrizione && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{c.descrizione}</p>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div>
                      <p className="font-mono font-bold text-foreground">{c.totale_contatti}</p>
                      <p className="text-muted-foreground">Contatti</p>
                    </div>
                    <div>
                      <p className="font-mono font-bold text-foreground">{c.chiamate_completate}</p>
                      <p className="text-muted-foreground">Risposte</p>
                    </div>
                    <div>
                      <p className="font-mono font-bold text-foreground">{Math.round(c.tasso_risposta)}%</p>
                      <p className="text-muted-foreground">Risposta</p>
                    </div>
                  </div>

                  {c.totale_contatti > 0 && (
                    <div className="space-y-1">
                      <Progress value={progress} className="h-2" />
                      <p className="text-[10px] text-muted-foreground text-right">{progress}% completato</p>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-border">
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(c.creato_il), "dd MMM yyyy", { locale: it })}
                    </span>
                    <div className="flex gap-1">
                      {(c.stato === "bozza" || c.stato === "programmata" || c.stato === "in_pausa") && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => updateStatus.mutate({ id: c.id, stato: "in_corso" })}
                        >
                          <Play className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {c.stato === "in_corso" && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => updateStatus.mutate({ id: c.id, stato: "in_pausa" })}
                        >
                          <Pause className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-7 w-7">
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Eliminare la campagna?</AlertDialogTitle>
                            <AlertDialogDescription>Questa azione non può essere annullata.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Annulla</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteMutation.mutate(c.id)}>Elimina</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Dialog — 3-step wizard */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuova Campagna — Step {createStep}/3</DialogTitle>
          </DialogHeader>

          {createStep === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nome campagna</Label>
                <Input
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  placeholder="Es. Richiamo lead freddi"
                />
              </div>
              <div className="space-y-2">
                <Label>Descrizione (opzionale)</Label>
                <Textarea
                  value={form.descrizione}
                  onChange={(e) => setForm({ ...form, descrizione: e.target.value })}
                  placeholder="Obiettivo della campagna..."
                  rows={3}
                />
              </div>
            </div>
          )}

          {createStep === 2 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Agente AI</Label>
                <Select value={form.agent_id} onValueChange={(v) => setForm({ ...form, agent_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona agente" />
                  </SelectTrigger>
                  <SelectContent>
                    {agents.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.nome} ({a.tipo})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tipo campagna</Label>
                <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="outbound">Outbound (chiamate in uscita)</SelectItem>
                    <SelectItem value="follow_up">Follow-up</SelectItem>
                    <SelectItem value="survey">Sondaggio</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {createStep === 3 && (
            <div className="space-y-3">
              <Card className="bg-muted/50">
                <CardContent className="p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Nome</span>
                    <span className="font-medium">{form.nome}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Agente</span>
                    <span className="font-medium">{agents.find((a) => a.id === form.agent_id)?.nome || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tipo</span>
                    <span className="font-medium capitalize">{form.tipo.replace("_", " ")}</span>
                  </div>
                </CardContent>
              </Card>
              <p className="text-xs text-muted-foreground">
                La campagna verrà creata come bozza. Potrai aggiungere i contatti e configurare la schedulazione in seguito.
              </p>
            </div>
          )}

          <DialogFooter className="gap-2">
            {createStep > 1 && (
              <Button variant="outline" onClick={() => setCreateStep(createStep - 1)}>Indietro</Button>
            )}
            {createStep < 3 ? (
              <Button
                onClick={() => setCreateStep(createStep + 1)}
                disabled={createStep === 1 ? !form.nome : !form.agent_id}
              >
                Avanti
              </Button>
            ) : (
              <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creazione..." : "Crea Campagna"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
