import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Shield, Eye, EyeOff, CheckCircle2, XCircle, Globe, DollarSign, AlertTriangle } from "lucide-react";
import { LLMSelector } from "../components/LLMSelector";
import { toast } from "sonner";
import { callElevenLabsProxy } from "../hooks/useElevenLabsProxy";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { calculateMarginPercent, formatEur } from "../lib/creditCalculator";


interface PricingRow {
  id: string;
  llm_model: string;
  tts_model: string;
  cost_real_per_min: number;
  cost_billed_per_min: number;
  markup_multiplier: number;
  is_active: boolean;
  label: string | null;
}

export default function PlatformSettingsPage() {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [defaultLlm, setDefaultLlm] = useState("gemini-2.5-flash");
  const [globalMarkup, setGlobalMarkup] = useState("2.0");
  const [domainWhitelist, setDomainWhitelist] = useState("");
  const [testStatus, setTestStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [isSaving, setIsSaving] = useState(false);
  const queryClient = useQueryClient();

  // Load existing API key from platform_settings
  const [subscriptionPrice, setSubscriptionPrice] = useState("49");
  const [trialDays, setTrialDays] = useState("14");
  const [welcomeBonus, setWelcomeBonus] = useState("5");

  const { data: savedSettings } = useQuery({
    queryKey: ["platform-settings-elevenlabs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("platform_settings" as never)
        .select("key, value")
        .in("key" as never, ["elevenlabs_api_key", "default_llm_model", "domain_whitelist", "ai_subscription_price_eur", "ai_subscription_trial_days", "ai_welcome_bonus_eur"] as never);
      return (data as unknown as { key: string; value: string }[]) ?? [];
    },
  });

  useEffect(() => {
    if (savedSettings) {
      const keyVal = savedSettings.find(s => s.key === "elevenlabs_api_key")?.value;
      const llmVal = savedSettings.find(s => s.key === "default_llm_model")?.value;
      const domainVal = savedSettings.find(s => s.key === "domain_whitelist")?.value;
      if (keyVal) setApiKey(keyVal);
      if (llmVal) setDefaultLlm(llmVal);
      if (domainVal) setDomainWhitelist(domainVal);
    }
  }, [savedSettings]);

  const hasApiKey = !!(savedSettings?.find(s => s.key === "elevenlabs_api_key")?.value);

  // Fetch pricing
  const { data: pricing, isLoading: pricingLoading } = useQuery({
    queryKey: ["platform-pricing"],
    queryFn: async (): Promise<PricingRow[]> => {
      const { data, error } = await supabase
        .from("platform_pricing" as never)
        .select("*")
        .order("cost_real_per_min", { ascending: true });
      if (error) throw error;
      return (data as unknown as PricingRow[]) ?? [];
    },
  });

  const [editedPricing, setEditedPricing] = useState<PricingRow[]>([]);
  const [dirtyRows, setDirtyRows] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (pricing) setEditedPricing(pricing);
  }, [pricing]);

  const handleTestConnection = async () => {
    if (!apiKey.trim()) {
      toast.error("Inserisci una API key");
      return;
    }
    setTestStatus("loading");
    try {
      await callElevenLabsProxy({ action: "get_voices" });
      setTestStatus("success");
      toast.success("Connessione riuscita");
    } catch {
      setTestStatus("error");
      toast.error("Connessione fallita. Verifica la API key.");
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const settings = [
        { key: "elevenlabs_api_key", value: apiKey.trim() },
        { key: "default_llm_model", value: defaultLlm },
        { key: "domain_whitelist", value: domainWhitelist.trim() },
      ];

      for (const setting of settings) {
        if (!setting.value) continue;
        const { error } = await supabase
          .from("platform_settings" as never)
          .upsert({ key: setting.key, value: setting.value, updated_at: new Date().toISOString() } as never, { onConflict: "key" as never });
        if (error) throw error;
      }

      queryClient.invalidateQueries({ queryKey: ["platform-settings-elevenlabs"] });
      toast.success("Configurazione salvata con successo");
    } catch (err) {
      console.error(err);
      toast.error("Errore nel salvataggio della configurazione");
    } finally {
      setIsSaving(false);
    }
  };

  const updateRow = (id: string, field: keyof PricingRow, value: unknown) => {
    setEditedPricing((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const updated = { ...r, [field]: value };
        if (field === "cost_real_per_min" || field === "markup_multiplier") {
          updated.cost_billed_per_min = Number(
            ((updated.cost_real_per_min || 0) * (updated.markup_multiplier || 2)).toFixed(6)
          );
        }
        return updated;
      })
    );
    setDirtyRows((prev) => new Set(prev).add(id));
  };

  const savePricingRow = async (row: PricingRow) => {
    const { error } = await supabase
      .from("platform_pricing" as never)
      .update({
        cost_real_per_min: row.cost_real_per_min,
        cost_billed_per_min: row.cost_billed_per_min,
        markup_multiplier: row.markup_multiplier,
        is_active: row.is_active,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id" as never, row.id as never);

    if (error) {
      toast.error("Errore nel salvataggio");
      return;
    }
    toast.success(`Tariffa "${row.label}" aggiornata`);
    setDirtyRows((prev) => {
      const next = new Set(prev);
      next.delete(row.id);
      return next;
    });
    queryClient.invalidateQueries({ queryKey: ["platform-pricing"] });
  };

  const applyGlobalMarkup = async () => {
    const markup = parseFloat(globalMarkup);
    if (isNaN(markup) || markup < 1) {
      toast.error("Markup deve essere almeno 1.0");
      return;
    }

    for (const row of editedPricing) {
      const newBilled = Number((row.cost_real_per_min * markup).toFixed(6));
      await supabase
        .from("platform_pricing" as never)
        .update({
          markup_multiplier: markup,
          cost_billed_per_min: newBilled,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id" as never, row.id as never);
    }

    toast.success(`Markup ${markup}x applicato a tutte le tariffe`);
    queryClient.invalidateQueries({ queryKey: ["platform-pricing"] });
  };

  const previewReal = 0.02;
  const previewMarkup = parseFloat(globalMarkup) || 2;
  const previewBilled = previewReal * previewMarkup;
  const previewMarginPct = calculateMarginPercent(previewBilled, previewReal);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Impostazioni Piattaforma</h1>
      </div>

      {/* API Key Missing Banner */}
      {!hasApiKey && (
        <Card className="border-destructive bg-destructive/5">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
            <div>
              <p className="text-sm font-semibold text-destructive">API Key ElevenLabs non configurata</p>
              <p className="text-xs text-destructive/80">
                Gli agenti AI non potranno funzionare finché non configuri la chiave API qui sotto e salvi.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* API Key Section */}
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
              <p className="text-sm text-primary flex items-center gap-1">
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

      {/* Pricing & Markup Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-4 w-4" /> Prezzi & Markup
          </CardTitle>
          <CardDescription>
            Configura i costi reali ElevenLabs e il markup addebitato alle aziende.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Global Markup */}
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Moltiplicatore Markup Globale</p>
                <p className="text-xs text-muted-foreground">Applica questo moltiplicatore a tutte le tariffe</p>
              </div>
              <Input
                type="number"
                step={0.1}
                min={1}
                value={globalMarkup}
                onChange={(e) => setGlobalMarkup(e.target.value)}
                className="w-24 text-center text-lg font-mono"
              />
            </div>

            <div className="bg-background border rounded-lg px-5 py-3 mt-4 grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-xs text-muted-foreground">Costo reale EL</p>
                <p className="text-sm font-mono">€{previewReal.toFixed(4)}/min</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Moltiplicatore</p>
                <p className="text-lg font-bold text-primary">× {previewMarkup}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Pagato dall'azienda</p>
                <p className="text-xl font-extrabold">{formatEur(previewBilled, 4)}/min</p>
              </div>
            </div>
            <p className="text-xs text-primary font-mono mt-2">
              Margine piattaforma: {previewMarginPct}% · {formatEur(previewBilled - previewReal, 4)} su ogni {formatEur(previewBilled, 4)}
            </p>
            <Button size="sm" className="mt-3" onClick={applyGlobalMarkup}>
              Applica Markup a Tutte le Tariffe
            </Button>
          </div>

          {/* Pricing Table */}
          {pricingLoading ? (
            <Skeleton className="h-[300px]" />
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Combinazione</TableHead>
                    <TableHead>Costo Reale EL (€/min)</TableHead>
                    <TableHead>Markup</TableHead>
                    <TableHead>Costo Azienda (€/min)</TableHead>
                    <TableHead>Margine</TableHead>
                    <TableHead>Stato</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {editedPricing.map((row) => {
                    const marginPct = calculateMarginPercent(row.cost_billed_per_min, row.cost_real_per_min);
                    return (
                      <TableRow key={row.id}>
                        <TableCell>
                          <p className="font-medium text-sm">{row.label || `${row.llm_model} + ${row.tts_model}`}</p>
                          <p className="text-[10px] font-mono text-muted-foreground">
                            {row.llm_model} · {row.tts_model}
                          </p>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step={0.0001}
                            min={0}
                            value={row.cost_real_per_min}
                            onChange={(e) => updateRow(row.id, "cost_real_per_min", parseFloat(e.target.value) || 0)}
                            className="w-28 font-mono text-sm"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step={0.1}
                            min={1}
                            value={row.markup_multiplier}
                            onChange={(e) => updateRow(row.id, "markup_multiplier", parseFloat(e.target.value) || 2)}
                            className="w-16 font-mono text-sm"
                          />
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-sm font-semibold text-primary">
                            {formatEur(row.cost_billed_per_min, 4)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-[10px]">
                            {marginPct}%
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={row.is_active}
                            onCheckedChange={(v) => updateRow(row.id, "is_active", v)}
                          />
                        </TableCell>
                        <TableCell>
                          {dirtyRows.has(row.id) && (
                            <Button size="sm" variant="ghost" onClick={() => savePricingRow(row)}>
                              Salva
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>


      {/* Email Provider & Pricing — configurazione spostata in Admin Settings → Email */}

      {/* Default config */}
      <Card>
        <CardHeader>
          <CardTitle>Configurazione predefinita</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <LLMSelector value={defaultLlm} onChange={setDefaultLlm} />
        </CardContent>
      </Card>

      {/* Domain whitelist */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-4 w-4" /> Whitelist Domini
          </CardTitle>
          <CardDescription>
            Domini autorizzati per il widget embed. Uno per riga.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={domainWhitelist}
            onChange={(e) => setDomainWhitelist(e.target.value)}
            placeholder={"esempio.it\nwww.miosito.com"}
            rows={4}
          />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? "Salvataggio..." : "Salva configurazione"}
        </Button>
      </div>
    </div>
  );
}
