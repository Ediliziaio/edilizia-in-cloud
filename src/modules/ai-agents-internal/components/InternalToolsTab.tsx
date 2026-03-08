import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CRM_TOOLS } from "../types/internalAgent.types";
import type { InternalAgent, InternalAgentUpdate } from "../types/internalAgent.types";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Eye, Pencil, Send, Search } from "lucide-react";

interface InternalToolsTabProps {
  agent: InternalAgent;
  onSave: (update: InternalAgentUpdate) => void;
}

const categoryConfig = {
  read: { label: "Lettura", icon: Search, color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  create: { label: "Creazione", icon: Pencil, color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  update: { label: "Aggiornamento", icon: Eye, color: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" },
  send: { label: "Invio", icon: Send, color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" },
};

export function InternalToolsTab({ agent, onSave }: InternalToolsTabProps) {
  const [enabledTools, setEnabledTools] = useState<string[]>(agent.enabled_tools || []);

  const toggleTool = (toolId: string) => {
    setEnabledTools((prev) =>
      prev.includes(toolId) ? prev.filter((t) => t !== toolId) : [...prev, toolId]
    );
  };

  const handleSave = () => {
    onSave({ enabled_tools: enabledTools });
    toast.success("Strumenti CRM aggiornati");
  };

  const readTools = CRM_TOOLS.filter((t) => t.category === "read");
  const writeTools = CRM_TOOLS.filter((t) => t.category !== "read");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Strumenti di Lettura</CardTitle>
          <p className="text-xs text-muted-foreground">
            Permettono all'agente di consultare i dati CRM durante la conversazione
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {readTools.map((tool) => {
            const cat = categoryConfig[tool.category];
            return (
              <div key={tool.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className={cat.color}>
                    {cat.label}
                  </Badge>
                  <div>
                    <p className="text-sm font-medium">{tool.label}</p>
                    <p className="text-xs text-muted-foreground">{tool.description}</p>
                  </div>
                </div>
                <Switch
                  checked={enabledTools.includes(tool.id)}
                  onCheckedChange={() => toggleTool(tool.id)}
                />
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Strumenti di Azione</CardTitle>
          <p className="text-xs text-muted-foreground">
            Permettono all'agente di creare, aggiornare e inviare dati nel CRM
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {writeTools.map((tool) => {
            const cat = categoryConfig[tool.category];
            return (
              <div key={tool.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className={cat.color}>
                    {cat.label}
                  </Badge>
                  <div>
                    <p className="text-sm font-medium">{tool.label}</p>
                    <p className="text-xs text-muted-foreground">{tool.description}</p>
                  </div>
                </div>
                <Switch
                  checked={enabledTools.includes(tool.id)}
                  onCheckedChange={() => toggleTool(tool.id)}
                />
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave}>Salva strumenti</Button>
      </div>
    </div>
  );
}
