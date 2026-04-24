import { useState, useEffect } from "react";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Landmark, Eye, EyeOff, ExternalLink, CheckCircle2, XCircle, Loader2, ShieldCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface GoCardlessConfigCardProps {
  hasExistingId: boolean;
  hasExistingKey: boolean;
  enabled: boolean;
  onSaved: () => void;
}

export default function GoCardlessConfigCard({
  hasExistingId, hasExistingKey, enabled: initialEnabled, onSaved,
}: GoCardlessConfigCardProps) {
  const [secretId, setSecretId] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [showId, setShowId] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "error" | null>(null);
  const [editingId, setEditingId] = useState(false);
  const [editingKey, setEditingKey] = useState(false);

  // Mantiene `enabled` sincronizzato col prop quando il parent refetcha
  useEffect(() => {
    setEnabled(initialEnabled);
  }, [initialEnabled]);

  const isConfigured = hasExistingId && hasExistingKey;
  const hasUnsavedChanges =
    editingId || editingKey || enabled !== initialEnabled;

  // FIX: quando l'utente modifica credenziali o modalità, il risultato del test
  // precedente non è più valido → reset. Prima il badge "success" restava anche
  // dopo cambio API key, trasmettendo falsa sicurezza.
  useEffect(() => {
    setTestResult(null);
  }, [editingId, editingKey, enabled]);

  async function handleSave() {
    // FIX: valida PRIMA di costruire upserts. Prima il codice aggiungeva
    // "bank_gocardless_enabled" all'array e poi usciva con return se secretId/key
    // mancavano → ma aveva già predisposto l'upsert incompleto.
    if ((editingId || !hasExistingId) && !secretId.trim()) {
      toast.error("Secret ID richiesto");
      return;
    }
    if ((editingKey || !hasExistingKey) && !secretKey.trim()) {
      toast.error("Secret Key richiesta");
      return;
    }

    setSaving(true);
    try {
      const upserts: { key: string; value: string }[] = [
        { key: "bank_gocardless_enabled", value: String(enabled) },
      ];
      if (editingId || !hasExistingId) {
        upserts.push({ key: "bank_gocardless_secret_id", value: secretId });
      }
      if (editingKey || !hasExistingKey) {
        upserts.push({ key: "bank_gocardless_secret_key", value: secretKey });
      }

      for (const item of upserts) {
        const { error } = await supabase.from("platform_settings").upsert(
          {
            key: item.key,
            value: item.value,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "key" },
        );
        if (error) throw error;
      }

      toast.success("Configurazione salvata");
      setEditingId(false);
      setEditingKey(false);
      setSecretId("");
      setSecretKey("");
      setTestResult(null); // obbliga il re-test con le nuove credenziali
      onSaved();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Errore: " + msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke(
        "bank-test-connection",
      );
      if (error) throw error;
      if (data?.success) {
        setTestResult("success");
        toast.success(data.message || "Connessione OK");
      } else {
        setTestResult("error");
        toast.error(data?.error || "Test fallito");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setTestResult("error");
      toast.error("Errore: " + msg);
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Landmark className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">GoCardless Bank Account Data</CardTitle>
              <CardDescription>
                Provider PSD2 Open Banking per banche europee
              </CardDescription>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isConfigured ? (
              <Badge
                variant="outline"
                className="border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
              >
                <CheckCircle2 className="h-3 w-3 mr-1" /> Configurato
              </Badge>
            ) : (
              <Badge variant="secondary" className="border">
                <XCircle className="h-3 w-3 mr-1" /> Non configurato
              </Badge>
            )}
            {enabled && (
              <Badge variant="outline" className="border-primary/30 text-primary">
                <ShieldCheck className="h-3 w-3 mr-1" /> Attivo
              </Badge>
            )}
            {testResult === "success" && (
              <Badge
                variant="outline"
                className="border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
              >
                <CheckCircle2 className="h-3 w-3 mr-1" /> Test OK
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-lg border border-muted bg-muted/30 p-3">
          <p className="text-sm text-muted-foreground">
            Registrati su{" "}
            <a
              href="https://bankaccountdata.gocardless.com/overview/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary hover:underline inline-flex items-center gap-1"
            >
              bankaccountdata.gocardless.com <ExternalLink className="h-3 w-3" />
            </a>{" "}
            per ottenere le credenziali API. Dopo la registrazione, troverai Secret ID
            e Secret Key nella sezione "User Secrets".
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Secret ID</Label>
            {hasExistingId && !editingId ? (
              <div className="flex gap-2">
                <Input value="••••••••••••••••" disabled className="font-mono text-sm" />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditingId(true);
                    setSecretId("");
                  }}
                >
                  Modifica
                </Button>
              </div>
            ) : (
              <div className="relative">
                <Input
                  type={showId ? "text" : "password"}
                  value={secretId}
                  onChange={(e) => setSecretId(e.target.value)}
                  placeholder="Inserisci Secret ID"
                  className="pr-10 font-mono text-sm"
                  autoComplete="off"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full"
                  onClick={() => setShowId(!showId)}
                  type="button"
                  tabIndex={-1}
                >
                  {showId ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Secret Key</Label>
            {hasExistingKey && !editingKey ? (
              <div className="flex gap-2">
                <Input value="••••••••••••••••" disabled className="font-mono text-sm" />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditingKey(true);
                    setSecretKey("");
                  }}
                >
                  Modifica
                </Button>
              </div>
            ) : (
              <div className="relative">
                <Input
                  type={showKey ? "text" : "password"}
                  value={secretKey}
                  onChange={(e) => setSecretKey(e.target.value)}
                  placeholder="Inserisci Secret Key"
                  className="pr-10 font-mono text-sm"
                  autoComplete="off"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full"
                  onClick={() => setShowKey(!showKey)}
                  type="button"
                  tabIndex={-1}
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <Label className="text-sm font-medium">Modulo Tesoreria</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Abilita la sezione Tesoreria per le aziende della piattaforma
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>

        <div className="flex items-center gap-3 pt-2 flex-wrap">
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salva Configurazione
          </Button>
          <Button
            variant="outline"
            onClick={handleTest}
            disabled={testing || !isConfigured || hasUnsavedChanges}
            title={
              hasUnsavedChanges
                ? "Salva le modifiche prima di testare"
                : !isConfigured
                ? "Configura credenziali per testare"
                : ""
            }
          >
            {testing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : testResult === "success" ? (
              <CheckCircle2 className="h-4 w-4 mr-2 text-emerald-600 dark:text-emerald-400" />
            ) : testResult === "error" ? (
              <XCircle className="h-4 w-4 mr-2 text-destructive" />
            ) : null}
            Testa Connessione
          </Button>
          {hasUnsavedChanges && (
            <span className="text-xs text-orange-600 dark:text-orange-400">
              ● Modifiche non salvate
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
