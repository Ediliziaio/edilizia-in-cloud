import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Copy, Check, Code, Eye, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import type { AIAgent } from "../types/agent.types";

interface AgentWidgetTabProps {
  agent: AIAgent;
}

type WidgetPosition = "bottom-right" | "bottom-left";

export function AgentWidgetTab({ agent }: AgentWidgetTabProps) {
  const [position, setPosition] = useState<WidgetPosition>("bottom-right");
  const [primaryColor, setPrimaryColor] = useState("#6366f1");
  const [showBranding, setShowBranding] = useState(true);
  const [copied, setCopied] = useState(false);

  const elAgentId = agent.elevenlabs_agent_id;

  const embedCode = `<!-- AI Agent Widget -->
<script>
  (function() {
    var script = document.createElement('script');
    script.src = 'https://elevenlabs.io/convai-widget/index.js';
    script.async = true;
    script.dataset.agentId = '${elAgentId || "YOUR_AGENT_ID"}';
    document.body.appendChild(script);
  })();
</script>`;

  const iframeCode = `<iframe
  src="https://elevenlabs.io/convai/${elAgentId || "YOUR_AGENT_ID"}"
  width="400"
  height="600"
  frameborder="0"
  allow="microphone"
  style="border-radius: 12px; border: 1px solid #e5e7eb;"
></iframe>`;

  const [codeType, setCodeType] = useState<"widget" | "iframe">("widget");

  const handleCopy = () => {
    const code = codeType === "widget" ? embedCode : iframeCode;
    navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success("Codice copiato negli appunti");
    setTimeout(() => setCopied(false), 2000);
  };

  if (!elAgentId) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
        <Code className="h-10 w-10 text-muted-foreground/40" />
        <p className="text-muted-foreground">
          L'agente non è ancora collegato alla piattaforma AI. Pubblica l'agente per ottenere il codice embed.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left — Configuration */}
      <div className="space-y-6">
        <div className="space-y-2">
          <Label>Tipo di embed</Label>
          <Select value={codeType} onValueChange={(v) => setCodeType(v as "widget" | "iframe")}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="widget">Widget (bolla flottante)</SelectItem>
              <SelectItem value="iframe">iFrame (inline)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {codeType === "widget" && (
          <div className="space-y-2">
            <Label>Posizione</Label>
            <Select value={position} onValueChange={(v) => setPosition(v as WidgetPosition)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bottom-right">In basso a destra</SelectItem>
                <SelectItem value="bottom-left">In basso a sinistra</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-2">
          <Label>Codice da integrare</Label>
          <div className="relative">
            <Textarea
              readOnly
              value={codeType === "widget" ? embedCode : iframeCode}
              rows={8}
              className="font-mono text-xs bg-muted/50"
            />
            <Button
              size="sm"
              variant="secondary"
              className="absolute top-2 right-2"
              onClick={handleCopy}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div className="rounded-lg border p-4 space-y-3">
          <p className="text-sm font-medium">Istruzioni</p>
          <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal list-inside">
            <li>Copia il codice sopra</li>
            <li>Incollalo prima del tag <code className="bg-muted px-1 rounded">&lt;/body&gt;</code> del tuo sito</li>
            <li>Il widget apparirà automaticamente su tutte le pagine</li>
          </ol>
        </div>
      </div>

      {/* Right — Preview */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Eye className="h-4 w-4 text-muted-foreground" />
          <Label>Anteprima</Label>
          <Badge variant="outline" className="text-xs">Live</Badge>
        </div>
        <div className="rounded-lg border bg-muted/20 overflow-hidden" style={{ height: 500 }}>
          <iframe
            src={`https://elevenlabs.io/convai/${elAgentId}`}
            width="100%"
            height="100%"
            frameBorder="0"
            allow="microphone"
            className="rounded-lg"
          />
        </div>
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open(`https://elevenlabs.io/convai/${elAgentId}`, "_blank")}
          >
            <ExternalLink className="h-4 w-4 mr-1" /> Apri in nuova finestra
          </Button>
        </div>
      </div>
    </div>
  );
}
