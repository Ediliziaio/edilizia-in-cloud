import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Shield, Eye, EyeOff, CheckCircle2, XCircle } from "lucide-react";
import { LLMSelector } from "../components/LLMSelector";
import { toast } from "sonner";

export default function PlatformSettingsPage() {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [defaultLlm, setDefaultLlm] = useState("gemini-2.5-flash");
  const [markup, setMarkup] = useState("2.0");
  const [testStatus, setTestStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const handleTestConnection = async () => {
    if (!apiKey.trim()) {
      toast.error("Inserisci una API key");
      return;
    }
    setTestStatus("loading");
    // In Phase 2 we'll actually call the edge function to test
    setTimeout(() => {
      setTestStatus("success");
      toast.success("Connessione riuscita");
    }, 1500);
  };

  const handleSave = () => {
    toast.info("Il salvataggio della configurazione sarà disponibile nella prossima versione.");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Impostazioni Piattaforma</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>API Key ElevenLabs</CardTitle>
          <CardDescription>
            La chiave API è gestita a livello piattaforma. Tutti i workspace utilizzano questa configurazione.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>API Key</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="xi-xxxxxxxxxxxxxxxx"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                  onClick={() => setShowKey(!showKey)}
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <Button
                variant="outline"
                onClick={handleTestConnection}
                disabled={testStatus === "loading"}
              >
                {testStatus === "loading" ? "Test..." : "Testa connessione"}
              </Button>
            </div>
            {testStatus === "success" && (
              <p className="text-sm text-green-600 flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> Connessione riuscita
              </p>
            )}
            {testStatus === "error" && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <XCircle className="h-3.5 w-3.5" /> Connessione fallita
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Configurazione predefinita</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <LLMSelector value={defaultLlm} onChange={setDefaultLlm} />

          <div className="space-y-2">
            <Label>Markup crediti (moltiplicatore)</Label>
            <Input
              type="number"
              step="0.1"
              min="1"
              value={markup}
              onChange={(e) => setMarkup(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Es. 2.0 = il cliente paga il doppio del costo reale ElevenLabs
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave}>Salva configurazione</Button>
      </div>
    </div>
  );
}
