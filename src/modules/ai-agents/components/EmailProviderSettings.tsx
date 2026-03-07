import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Eye, EyeOff, Mail, DollarSign } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { calculateMarginPercent, formatEur } from "../lib/creditCalculator";

interface EmailPricingRow {
  id: string;
  provider: string;
  label: string | null;
  cost_real_per_email: number;
  cost_billed_per_email: number;
  markup_multiplier: number;
  is_active: boolean;
}

export function EmailProviderSettings() {
  const queryClient = useQueryClient();
  const [provider, setProvider] = useState("sendgrid");
  const [emailApiKey, setEmailApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [globalMarkup, setGlobalMarkup] = useState("3.0");
  const [isSaving, setIsSaving] = useState(false);

  // Load settings
  const { data: settings } = useQuery({
    queryKey: ["platform-settings-email"],
    queryFn: async () => {
      const { data } = await supabase
        .from("platform_settings" as never)
        .select("key, value")
        .in("key" as never, ["email_provider", "email_provider_api_key"] as never);
      return (data as unknown as { key: string; value: string }[]) ?? [];
    },
  });

  useEffect(() => {
    if (settings) {
      const p = settings.find((s) => s.key === "email_provider")?.value;
      const k = settings.find((s) => s.key === "email_provider_api_key")?.value;
      if (p) setProvider(p);
      if (k) setEmailApiKey(k);
    }
  }, [settings]);

  // Load pricing
  const { data: pricing, isLoading: pricingLoading } = useQuery({
    queryKey: ["email-pricing"],
    queryFn: async (): Promise<EmailPricingRow[]> => {
      const { data, error } = await supabase
        .from("email_pricing" as never)
        .select("*")
        .order("cost_real_per_email", { ascending: true });
      if (error) throw error;
      return (data as unknown as EmailPricingRow[]) ?? [];
    },
  });

  const [editedPricing, setEditedPricing] = useState<EmailPricingRow[]>([]);
  const [dirtyRows, setDirtyRows] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (pricing) setEditedPricing(pricing);
  }, [pricing]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const pairs = [
        { key: "email_provider", value: provider },
        { key: "email_provider_api_key", value: emailApiKey.trim() },
      ];
      for (const pair of pairs) {
        if (!pair.value) continue;
        const { error } = await supabase
          .from("platform_settings" as never)
          .upsert(
            { key: pair.key, value: pair.value, updated_at: new Date().toISOString() } as never,
            { onConflict: "key" as never }
          );
        if (error) throw error;
      }
      queryClient.invalidateQueries({ queryKey: ["platform-settings-email"] });
      toast.success("Configurazione email salvata");
    } catch {
      toast.error("Errore nel salvataggio");
    } finally {
      setIsSaving(false);
    }
  };

  const updateRow = (id: string, field: keyof EmailPricingRow, value: unknown) => {
    setEditedPricing((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const updated = { ...r, [field]: value };
        if (field === "cost_real_per_email" || field === "markup_multiplier") {
          updated.cost_billed_per_email = Number(
            ((updated.cost_real_per_email || 0) * (updated.markup_multiplier || 3)).toFixed(6)
          );
        }
        return updated;
      })
    );
    setDirtyRows((prev) => new Set(prev).add(id));
  };

  const savePricingRow = async (row: EmailPricingRow) => {
    const { error } = await supabase
      .from("email_pricing" as never)
      .update({
        cost_real_per_email: row.cost_real_per_email,
        cost_billed_per_email: row.cost_billed_per_email,
        markup_multiplier: row.markup_multiplier,
        is_active: row.is_active,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id" as never, row.id as never);

    if (error) {
      toast.error("Errore nel salvataggio");
      return;
    }
    toast.success(`Tariffa "${row.label || row.provider}" aggiornata`);
    setDirtyRows((prev) => {
      const next = new Set(prev);
      next.delete(row.id);
      return next;
    });
    queryClient.invalidateQueries({ queryKey: ["email-pricing"] });
  };

  const applyGlobalMarkup = async () => {
    const markup = parseFloat(globalMarkup);
    if (isNaN(markup) || markup < 1) {
      toast.error("Markup deve essere almeno 1.0");
      return;
    }
    for (const row of editedPricing) {
      const newBilled = Number((row.cost_real_per_email * markup).toFixed(6));
      await supabase
        .from("email_pricing" as never)
        .update({
          markup_multiplier: markup,
          cost_billed_per_email: newBilled,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id" as never, row.id as never);
    }
    toast.success(`Markup ${markup}x applicato`);
    queryClient.invalidateQueries({ queryKey: ["email-pricing"] });
  };

  const previewReal = 0.0001;
  const previewMarkup = parseFloat(globalMarkup) || 3;
  const previewBilled = previewReal * previewMarkup;
  const previewMarginPct = calculateMarginPercent(previewBilled, previewReal);

  return (
    <>
      {/* Provider & API Key */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4" /> Email Provider
          </CardTitle>
          <CardDescription>
            Configura il provider email e la chiave API. Le aziende non vedranno mai questa chiave.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Provider</Label>
              <Select value={provider} onValueChange={setProvider}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sendgrid">SendGrid</SelectItem>
                  <SelectItem value="brevo">Brevo (Sendinblue)</SelectItem>
                  <SelectItem value="resend">Resend</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>API Key</Label>
              <div className="relative">
                <Input
                  type={showKey ? "text" : "password"}
                  value={emailApiKey}
                  onChange={(e) => setEmailApiKey(e.target.value)}
                  placeholder="SG.xxxxxxx o re_xxxxxxx"
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
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={isSaving} size="sm">
              {isSaving ? "Salvataggio..." : "Salva Provider"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Email Pricing */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-4 w-4" /> Prezzi Email & Markup
          </CardTitle>
          <CardDescription>
            Costo reale per email e prezzo addebitato alle aziende.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Global Markup */}
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Moltiplicatore Markup Globale Email</p>
                <p className="text-xs text-muted-foreground">Applica a tutte le tariffe email</p>
              </div>
              <Input
                type="number"
                step={0.5}
                min={1}
                value={globalMarkup}
                onChange={(e) => setGlobalMarkup(e.target.value)}
                className="w-24 text-center text-lg font-mono"
              />
            </div>
            <div className="bg-background border rounded-lg px-5 py-3 mt-4 grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-xs text-muted-foreground">Costo reale</p>
                <p className="text-sm font-mono">{formatEur(previewReal, 4)}/email</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Moltiplicatore</p>
                <p className="text-lg font-bold text-primary">× {previewMarkup}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Pagato dall'azienda</p>
                <p className="text-xl font-extrabold">{formatEur(previewBilled, 4)}/email</p>
              </div>
            </div>
            <p className="text-xs text-primary font-mono mt-2">
              Margine: {previewMarginPct}% · {formatEur(previewBilled - previewReal, 4)} per email
            </p>
            <Button size="sm" className="mt-3" onClick={applyGlobalMarkup}>
              Applica Markup a Tutte le Tariffe
            </Button>
          </div>

          {/* Pricing Table */}
          {pricingLoading ? (
            <Skeleton className="h-[200px]" />
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider / Label</TableHead>
                    <TableHead>Costo Reale (€/email)</TableHead>
                    <TableHead>Markup</TableHead>
                    <TableHead>Costo Azienda (€/email)</TableHead>
                    <TableHead>Margine</TableHead>
                    <TableHead>Stato</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {editedPricing.map((row) => {
                    const marginPct = calculateMarginPercent(
                      row.cost_billed_per_email,
                      row.cost_real_per_email
                    );
                    return (
                      <TableRow key={row.id}>
                        <TableCell>
                          <p className="font-medium text-sm">{row.label || row.provider}</p>
                          <p className="text-[10px] font-mono text-muted-foreground">{row.provider}</p>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step={0.00001}
                            min={0}
                            value={row.cost_real_per_email}
                            onChange={(e) =>
                              updateRow(row.id, "cost_real_per_email", parseFloat(e.target.value) || 0)
                            }
                            className="w-28 font-mono text-sm"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step={0.5}
                            min={1}
                            value={row.markup_multiplier}
                            onChange={(e) =>
                              updateRow(row.id, "markup_multiplier", parseFloat(e.target.value) || 3)
                            }
                            className="w-16 font-mono text-sm"
                          />
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-sm font-semibold text-primary">
                            {formatEur(row.cost_billed_per_email, 6)}
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
    </>
  );
}
