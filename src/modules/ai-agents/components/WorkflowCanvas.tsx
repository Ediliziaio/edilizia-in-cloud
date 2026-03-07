import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Play, Plus, ZoomIn, ZoomOut, Maximize2, MessageSquare,
  UserPlus, CalendarPlus, Bell, PhoneOff, Construction,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface WorkflowNode {
  id: string;
  type: string;
  label: string;
  x: number;
  y: number;
}

const AVAILABLE_NODES = [
  { type: "create_lead", label: "Crea Lead nel CRM", icon: UserPlus },
  { type: "create_appointment", label: "Fissa Appuntamento", icon: CalendarPlus },
  { type: "send_notification", label: "Invia Notifica Interna", icon: Bell },
  { type: "end_conversation", label: "Termina conversazione", icon: PhoneOff },
];

export function WorkflowCanvas() {
  const [nodes, setNodes] = useState<WorkflowNode[]>([
    { id: "start", type: "start", label: "Inizia", x: 300, y: 60 },
  ]);
  const [preventLoops, setPreventLoops] = useState(true);
  const [zoom, setZoom] = useState(100);

  const addNode = (type: string, label: string) => {
    const newNode: WorkflowNode = {
      id: `node-${Date.now()}`,
      type,
      label,
      x: 300,
      y: 60 + nodes.length * 100,
    };
    setNodes((prev) => [...prev, newNode]);
  };

  return (
    <div className="space-y-4">
      <Alert className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
        <Construction className="h-4 w-4 text-amber-600" />
        <AlertTitle className="text-amber-700 dark:text-amber-400">Funzionalità in sviluppo</AlertTitle>
        <AlertDescription className="text-amber-600 dark:text-amber-500">
          Il workflow visuale sarà disponibile in una prossima versione. Le modifiche effettuate qui non vengono salvate.
        </AlertDescription>
      </Alert>
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
      {/* Canvas */}
      <div className="space-y-3">
        {/* Toolbar */}
        <div className="flex items-center gap-2 border rounded-lg p-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZoom((z) => Math.min(150, z + 10))}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZoom((z) => Math.max(50, z - 10))}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZoom(100)}>
            <Maximize2 className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground ml-2">{zoom}%</span>
        </div>

        {/* Canvas area */}
        <div
          className="relative border rounded-lg bg-muted/10 overflow-hidden"
          style={{ minHeight: 400, transform: `scale(${zoom / 100})`, transformOrigin: "top left" }}
        >
          {nodes.map((node) => (
            <div
              key={node.id}
              className="absolute flex items-center gap-2 border rounded-lg bg-card px-4 py-3 shadow-sm cursor-move"
              style={{ left: node.x, top: node.y }}
            >
              {node.type === "start" ? (
                <Play className="h-4 w-4 text-primary" />
              ) : (
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="text-sm font-medium">{node.label}</span>
              {node.type === "start" && <Badge variant="secondary" className="text-[10px]">Inizio</Badge>}
            </div>
          ))}
        </div>
      </div>

      {/* Settings panel */}
      <div className="space-y-4 border rounded-lg p-4">
        <h3 className="font-medium text-sm">Impostazioni globali</h3>
        <div className="flex items-center justify-between">
          <Label className="text-sm">Previeni loop infiniti</Label>
          <Switch checked={preventLoops} onCheckedChange={setPreventLoops} />
        </div>

        <div className="border-t pt-4 space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground uppercase">Aggiungi nodo</h4>
          {AVAILABLE_NODES.map((n) => (
            <Button
              key={n.type}
              variant="outline"
              size="sm"
              className="w-full justify-start gap-2"
              onClick={() => addNode(n.type, n.label)}
            >
              <n.icon className="h-4 w-4" />
              {n.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
    </div>
  );
}
