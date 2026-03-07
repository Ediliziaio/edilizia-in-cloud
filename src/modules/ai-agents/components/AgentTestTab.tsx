import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FlaskConical, Plus, Play, Clock } from "lucide-react";

interface TestRun {
  id: string;
  name: string;
  status: "pending" | "running" | "passed" | "failed";
  createdAt: string;
}

export function AgentTestTab() {
  const [tests, setTests] = useState<TestRun[]>([]);

  const addTest = () => {
    const newTest: TestRun = {
      id: `test-${Date.now()}`,
      name: `Test ${tests.length + 1}`,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    setTests((prev) => [...prev, newTest]);
  };

  const statusVariant = (status: TestRun["status"]) => {
    switch (status) {
      case "passed": return "default" as const;
      case "failed": return "destructive" as const;
      case "running": return "secondary" as const;
      default: return "outline" as const;
    }
  };

  const statusLabel = (status: TestRun["status"]) => {
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
        <Button size="sm" onClick={addTest} className="gap-1">
          <Plus className="h-4 w-4" /> Aggiungi test
        </Button>
      </div>

      {tests.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center space-y-3 border rounded-lg bg-muted/10">
          <FlaskConical className="h-10 w-10 text-muted-foreground/30" />
          <p className="text-muted-foreground text-sm">
            Nessun test creato. Aggiungi un test per verificare il comportamento dell'agente.
          </p>
          <Button size="sm" variant="outline" onClick={addTest}>
            <Plus className="h-4 w-4 mr-1" /> Crea primo test
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-muted-foreground">Esecuzioni precedenti</h4>
          {tests.map((test) => (
            <div key={test.id} className="flex items-center justify-between border rounded-lg p-3">
              <div className="flex items-center gap-3">
                <FlaskConical className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{test.name}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {new Date(test.createdAt).toLocaleString("it")}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={statusVariant(test.status)}>{statusLabel(test.status)}</Badge>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Play className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
