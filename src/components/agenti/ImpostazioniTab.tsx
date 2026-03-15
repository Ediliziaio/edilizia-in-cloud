import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Shield, Eye, EyeOff, CheckCircle2, XCircle, Globe, DollarSign, AlertTriangle, Copy, Link } from "lucide-react";
import { toast } from "sonner";
import { queryKeys } from "@/lib/queryKeys";
import { logger } from "@/utils/logger";
import { callElevenLabsProxy } from "@/modules/ai-agents/hooks/useElevenLabsProxy";
import { calculateMarginPercent, formatEur } from "@/modules/ai-agents/lib/creditCalculator";

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

export function ImpostazioniTab() {
  const companyId = useEffectiveCompanyId();
  const queryClient = useQueryClient();

  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [domainWhitelist, setDomainWhitelist] = useState("");
  const [testStatus, setTestStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [isSaving, setIsSaving] = useState(false);
  const [globalMarkup, setGlobalMarkup] = useState("2.0");

  const { data: savedSettings } = useQuery({
    queryKey: queryKeys.platformSettingsAI.elevenlabs,
    queryFn: async () => {
      const { data } = await supabase
        .from("platform_settings" as never)
        .select("key, value")
        .in("key" as never, ["elevenlabs_api_key", "domain_whitelist"] as never);
      return (data as unknown as { key: string; value: string }[]) ?? [];
    },
  });

  useEffect(() => {
    if (savedSettings) {
      const keyVal = savedSettings.find((s) => s.key === "elevenlabs_api_key")?.value;
      const domainVal = savedSettings.find((s) => s.key === "domain_whitelist")?.value;
      if (keyVal) setApiKey(keyVal);
      if (domainVal) setDomainWhitelist(domainVal);
    }
  }, [savedSettings]);

  const hasApiKey = !!(savedSettings?.find((s) => s.key === "elevenlabs_api_key")?.value);

  // Pricing
  const { data: pricing, isLoading: pricingLoading } = useQuery({
    queryKey: queryKeys.platformSettingsAI.pricing,
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

  // Webhook URL
  const webhookUrl = companyId
    ? `${window.location.origin}/api/webhook/ai/${companyId}`
    : "";

  const handleTestConnection = async () => {
    if (!apiKey.trim()) { toast.error("Inserisci una API key"); return; }
    setTestStatus("loading");
    try {
      await callElevenLabsProxy({ action: "get_voices" });
      setTestStatus("success");
      toast.success("Connessione riuscita");
    } catch {
      setTestStatus("error");
      toast.error("Connessione fallita");
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const settings = [
        { key: "elevenlabs_api_key", value: apiKey.trim() },
        { key: "domain_whitelist", value: domainWhitelist.trim() },
      ];
      for (const setting of settings) {
        if (!setting.value) continue;
        const { error } = await supabase
          .from("platform_settings" as never)
          .upsert({ key: setting.key, value: setting.value, updated_at: new Date().toISOString() } as never, { onConflict: "key" as never });
        if (error) throw error;
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.platformSettingsAI.elevenlabs });
      toast.success("Configurazione salvata");
    } catch (err) {
      logger.error("Errore salvataggio", err);
      toast.error("Errore nel salvataggio");
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
          updated.cost_billed_per_min = Number(((updated.cost_real_per_min || 0) * (updated.markup_multiplier || 2)).toFixed(6));
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
    if (error) { toast.error("Errore nel salvataggio"); return; }
    toast.success(`Tariffa aggiornata`);
    setDirtyRows((prev) => { const n = new Set(prev); n.delete(row.id); return n; });
    queryClient.invalidateQueries({ queryKey: queryKeys.platformSettingsAI.pricing });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="h-6 w-6 text-primary" />
        <h2 className="text-xl font-bold text-foreground">Impostazioni Piattaforma</h2>
      </div>

      {/* API Key Banner */}
      {!hasApiKey && (
        <Card className="border-destructive bg-destructive/5">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
            <div>
              <p className="text-sm font-semibold text-destructive">API Key ElevenLabs non configurata</p>
              <p className="text-xs text-destructive/80">Gli agenti vocali non funzioneranno finché non configuri la chiave.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* API Key */}
      <Card>
        <CardHeader>
          <CardTitle>API Key ElevenLabs</CardTitle>
          <CardDescription>Chiave API gestita a livello piattaforma.</CardDescription>
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
                <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setShowKey(!showKey)}>
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <Button variant="outline" onClick={handleTestConnection} disabled={testStatus === "loading"}>
                {testStatus === "loading" ? "Test..." : "Testa connessione"}
              </Button>
            </div>
            {testStatus === "success" && <p className="text-sm text-primary flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Connessione riuscita</p>}
            {testStatus === "error" && <p className="text-sm text-destructive flex items-center gap-1"><XCircle className="h-3.5 w-3.5" /> Connessione fallita</p>}
          </div>
        </CardContent>
      </Card>

      {/* Webhook URL */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Link className="h-4 w-4" /> Webhook URL</CardTitle>
          <CardDescription>URL per ricevere callback dagli agenti AI.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input value={webhookUrl} readOnly className="font-mono text-xs" />
            <Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(webhookUrl); toast.success("URL copiato"); }}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Domain Whitelist */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Globe className="h-4 w-4" /> Whitelist Domini</CardTitle>
          <CardDescription>Domini autorizzati per il widget embed. Uno per riga.</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea value={domainWhitelist} onChange={(e) => setDomainWhitelist(e.target.value)} placeholder="example.com&#10;mysite.it" rows={4} className="font-mono text-sm" />
        </CardContent>
      </Card>

      {/* Pricing Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><DollarSign className="h-4 w-4" /> Prezzi & Markup</CardTitle>
        </CardHeader>
        <CardContent>
          {pricingLoading ? <Skeleton className="h-[200px]" /> : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Combinazione</TableHead>
                    <TableHead>Costo Reale (€/min)</TableHead>
                    <TableHead>Markup</TableHead>
                    <TableHead>Costo Azienda</TableHead>
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
                          <p className="text-[10px] font-mono text-muted-foreground">{row.llm_model} · {row.tts_model}</p>
                        </TableCell>
                        <TableCell>
                          <Input type="number" step={0.0001} min={0} value={row.cost_real_per_min} onChange={(e) => updateRow(row.id, "cost_real_per_min", parseFloat(e.target.value) || 0)} className="w-28 font-mono text-sm" />
                        </TableCell>
                        <TableCell>
                          <Input type="number" step={0.1} min={1} value={row.markup_multiplier} onChange={(e) => updateRow(row.id, "markup_multiplier", parseFloat(e.target.value) || 2)} className="w-16 font-mono text-sm" />
                        </TableCell>
                        <TableCell><span className="font-mono text-sm font-semibold text-primary">{formatEur(row.cost_billed_per_min, 4)}</span></TableCell>
                        <TableCell><Badge variant="secondary" className="text-[10px]">{marginPct}%</Badge></TableCell>
                        <TableCell><Switch checked={row.is_active} onCheckedChange={(v) => updateRow(row.id, "is_active", v)} /></TableCell>
                        <TableCell>
                          {dirtyRows.has(row.id) && <Button size="sm" variant="ghost" onClick={() => savePricingRow(row)}>Salva</Button>}
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

      {/* Save All */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving} size="lg">
          {isSaving ? "Salvataggio..." : "Salva Configurazione"}
        </Button>
      </div>
    </div>
  );
}
