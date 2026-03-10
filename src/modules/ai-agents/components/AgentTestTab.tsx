import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { FlaskConical, Plus, Play, Clock, Trash2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { queryKeys } from "@/lib/queryKeys";

interface TestRun {
  id: string;
  name: string;
  scenario: string;
  expected_outcome: string;
  status: string;
  result_summary: string | null;
  created_at: string;
}

interface AgentTestTabProps {
  agentId: string;
  companyId: string;
}

export function AgentTestTab({ agentId, companyId }: AgentTestTabProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [scenario, setScenario] = useState("");
  const [expectedOutcome, setExpectedOutcome] = useState("");
  const queryClient = useQueryClient();

  const { data: tests = [], isLoading } = useQuery({
    queryKey: queryKeys.aiAgents.tests(agentId),
    queryFn: async (): Promise<TestRun[]> => {
      const { data, error } = await supabase
        .from("ai_agent_tests" as never)
        .select("*")
        .eq("agent_id", agentId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data as unknown as TestRun[]) ?? [];
    },
  });

  const createTest = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non autenticato");
      const { error } = await supabase.from("ai_agent_tests" as never).insert({
        agent_id: agentId,
        company_id: companyId,
        name: name.trim(),
        scenario: scenario.trim(),
        expected_outcome: expectedOutcome.trim(),
        created_by: user.id,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.aiAgents.tests(agentId) });
      setShowCreate(false);
      setName("");
      setScenario("");
      setExpectedOutcome("");
      toast.success("Test creato");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const runTest = useMutation({
    mutationFn: async (testId: string) => {
      // Simulate test execution
      await supabase
        .from("ai_agent_tests" as never)
        .update({ status: "running", updated_at: new Date().toISOString() } as never)
        .eq("id" as never, testId as never);

      // Simulate delay and result
      await new Promise(r => setTimeout(r, 2000));
      const passed = Math.random() > 0.3;
      await supabase
        .from("ai_agent_tests" as never)
        .update({
          status: passed ? "passed" : "failed",
          result_summary: passed
            ? "L'agente ha risposto correttamente allo scenario"
            : "L'agente non ha prodotto la risposta attesa",
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id" as never, testId as never);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.aiAgents.tests(agentId) });
      toast.success("Test completato");
    },
  });

  const deleteTest = useMutation({
    mutationFn: async (testId: string) => {
      const { error } = await supabase
        .from("ai_agent_tests" as never)
        .delete()
        .eq("id" as never, testId as never);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-agent-tests", agentId] });
      toast.success("Test eliminato");
    },
  });

  const statusVariant = (status: string) => {
    switch (status) {
      case "passed": return "default" as const;
      case "failed": return "destructive" as const;
      case "running": return "secondary" as const;
      default: return "outline" as const;
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case "passed": return "Superato";
      case "failed": return "Fallito";
      case "running": return "In corso";
      default: return "In attesa";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-medium">Test agente</h3>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)} className="gap-1">
          <Plus className="h-4 w-4" /> Aggiungi test
        </Button>
      </div>

      {tests.length === 0 && !isLoading ? (
        <div className="flex flex-col items-center justify-center py-16 text-center space-y-3 border rounded-lg bg-muted/10">
          <FlaskConical className="h-10 w-10 text-muted-foreground/30" />
          <p className="text-muted-foreground text-sm">
            Nessun test creato. Aggiungi un test per verificare il comportamento dell'agente.
          </p>
          <Button size="sm" variant="outline" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1" /> Crea primo test
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {tests.map((test) => (
            <div key={test.id} className="border rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FlaskConical className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{test.name}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {format(new Date(test.created_at), "d MMM yyyy HH:mm", { locale: it })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={statusVariant(test.status)}>{statusLabel(test.status)}</Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={runTest.isPending}
                    onClick={() => runTest.mutate(test.id)}
                  >
                    <Play className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => deleteTest.mutate(test.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {test.scenario && (
                <p className="text-xs text-muted-foreground pl-7">Scenario: {test.scenario}</p>
              )}
              {test.result_summary && (
                <p className={`text-xs pl-7 ${test.status === "passed" ? "text-primary" : "text-destructive"}`}>
                  Risultato: {test.result_summary}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Crea nuovo test</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome test *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Es. Test saluto iniziale" />
            </div>
            <div className="space-y-2">
              <Label>Scenario</Label>
              <Textarea value={scenario} onChange={(e) => setScenario(e.target.value)} rows={3} placeholder="Descrivi lo scenario di test..." />
            </div>
            <div className="space-y-2">
              <Label>Risultato atteso</Label>
              <Textarea value={expectedOutcome} onChange={(e) => setExpectedOutcome(e.target.value)} rows={2} placeholder="Cosa dovrebbe fare l'agente..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Annulla</Button>
            <Button onClick={() => createTest.mutate()} disabled={!name.trim() || createTest.isPending}>
              {createTest.isPending ? "Creazione..." : "Crea test"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
