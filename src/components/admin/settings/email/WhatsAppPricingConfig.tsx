import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { MessageSquare } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { calculateMarginPercent, formatEur } from "@/modules/ai-agents/lib/creditCalculator";

interface WhatsAppPricingRow {
  id: string;
  provider: string;
  label: string | null;
  category: string;
  country_code: string;
  cost_real_per_unit: number;
  cost_billed_per_unit: number;
  markup_multiplier: number;
  is_active: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  marketing:      "Marketing",
  utility:        "Utility",
  authentication: "Auth",
  service:        "Service",
};

const CATEGORY_COLORS: Record<string, string> = {
  marketing:      "bg-blue-100 text-blue-800",
  utility:        "bg-green-100 text-green-800",
  authentication: "bg-purple-100 text-purple-800",
  service:        "bg-gray-100 text-gray-800",
};

export function WhatsAppPricingConfig() {
  const queryClient = useQueryClient();
  const [globalMarkup, setGlobalMarkup] = useState("2.2");
  const [editedPricing, setEditedPricing] = useState<WhatsAppPricingRow[]>([]);
  const [dirtyRows, setDirtyRows] = useState<Set<string>>(new Set());

  const { data: pricing, isLoading } = useQuery({
    queryKey: ["whatsapp-pricing"],
    queryFn: async (): Promise<WhatsAppPricingRow[]> => {
      const { data, error } = await supabase
        .from("whatsapp_pricing" as never)
        .select("*")
        .order("cost_real_per_unit", { ascending: true });
      if (error) throw error;
      return (data as unknown as WhatsAppPricingRow[]) ?? [];
    },
  });

  useEffect(() => {
    if (pricing) setEditedPricing(pricing);
  }, [pricing]);

  const updateRow = (id: string, field: keyof WhatsAppPricingRow, value: unknown) => {
    setEditedPricing((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const updated = { ...r, [field]: value };
        if (field === "cost_real_per_unit" || field === "markup_multiplier") {
          updated.cost_billed_per_unit = Number(
            ((updated.cost_real_per_unit || 0) * (updated.markup_multiplier || 2.2)).toFixed(6)
          );
        }
        return updated;
      })
    );
    setDirtyRows((prev) => new Set(prev).add(id));
  };

  const savePricingRow = async (row: WhatsAppPricingRow) => {
    const { error } = await supabase
      .from("whatsapp_pricing" as never)
      .update({
        cost_real_per_unit: row.cost_real_per_unit,
        cost_billed_per_unit: row.cost_billed_per_unit,
        markup_multiplier: row.markup_multiplier,
        is_active: row.is_active,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id" as never, row.id as never);

    if (error) { toast.error("Errore nel salvataggio"); return; }
    toast.success(`Tariffa "${row.label || row.category}" aggiornata`);
    setDirtyRows((prev) => { const next = new Set(prev); next.delete(row.id); return next; });
    queryClient.invalidateQueries({ queryKey: ["whatsapp-pricing"] });
  };

  const applyGlobalMarkup = async () => {
    const markup = parseFloat(globalMarkup);
    if (isNaN(markup) || markup < 1) { toast.error("Markup deve essere almeno 1.0"); return; }
    for (const row of editedPricing) {
      const newBilled = Number((row.cost_real_per_unit * markup).toFixed(6));
      await supabase
        .from("whatsapp_pricing" as never)
        .update({ markup_multiplier: markup, cost_billed_per_unit: newBilled, updated_at: new Date().toISOString() } as never)
        .eq("id" as never, row.id as never);
    }
    toast.success(`Markup ${markup}x applicato a tutte le tariffe`);
    queryClient.invalidateQueries({ queryKey: ["whatsapp-pricing"] });
  };

  const previewReal = 0.054;
  const previewMarkup = parseFloat(globalMarkup) || 2.2;
  const previewBilled = previewReal * previewMarkup;
  const previewMarginPct = calculateMarginPercent(previewBilled, previewReal);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4" /> Prezzi WhatsApp & Markup
        </CardTitle>
        <CardDescription>Costo reale per messaggio e prezzo addebitato alle aziende per categoria e paese.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Global Markup */}
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Moltiplicatore Markup Globale</p>
              <p className="text-xs text-muted-foreground">Applica a tutte le tariffe WhatsApp</p>
            </div>
            <Input
              type="number" step={0.5} min={1}
              value={globalMarkup}
              onChange={(e) => setGlobalMarkup(e.target.value)}
              className="w-24 text-center text-lg font-mono"
            />
          </div>
          <div className="bg-background border rounded-lg px-3 sm:px-5 py-3 mt-4 grid grid-cols-3 gap-2 sm:gap-4 text-center">
            <div>
              <p className="text-xs text-muted-foreground">Costo reale</p>
              <p className="text-sm font-mono">{formatEur(previewReal, 4)}/msg</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Moltiplicatore</p>
              <p className="text-lg font-bold text-primary">× {previewMarkup}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pagato dall'azienda</p>
              <p className="text-xl font-extrabold">{formatEur(previewBilled, 4)}/msg</p>
            </div>
          </div>
          <p className="text-xs text-primary font-mono mt-2">
            Margine: {previewMarginPct}% · {formatEur(previewBilled - previewReal, 4)} per messaggio
          </p>
          <Button size="sm" className="mt-3" onClick={applyGlobalMarkup}>
            Applica Markup a Tutte le Tariffe
          </Button>
        </div>

        {/* Pricing Table */}
        {isLoading ? (
          <Skeleton className="h-[200px]" />
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Provider / Label</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Paese</TableHead>
                  <TableHead>Costo Reale (€/msg)</TableHead>
                  <TableHead>Markup</TableHead>
                  <TableHead>Costo Azienda (€/msg)</TableHead>
                  <TableHead>Margine</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {editedPricing.map((row) => {
                  const marginPct = calculateMarginPercent(row.cost_billed_per_unit, row.cost_real_per_unit);
                  return (
                    <TableRow key={row.id}>
                      <TableCell>
                        <p className="font-medium text-sm">{row.label || row.provider}</p>
                        <p className="text-xs font-mono text-muted-foreground">{row.provider}</p>
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-xs ${CATEGORY_COLORS[row.category] ?? "bg-gray-100 text-gray-800"}`}>
                          {CATEGORY_LABELS[row.category] ?? row.category}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs font-mono">{row.country_code}</span>
                      </TableCell>
                      <TableCell>
                        <Input type="number" step={0.00001} min={0} value={row.cost_real_per_unit}
                          onChange={(e) => updateRow(row.id, "cost_real_per_unit", parseFloat(e.target.value) || 0)}
                          className="w-28 font-mono text-sm" />
                      </TableCell>
                      <TableCell>
                        <Input type="number" step={0.5} min={1} value={row.markup_multiplier}
                          onChange={(e) => updateRow(row.id, "markup_multiplier", parseFloat(e.target.value) || 2.2)}
                          className="w-16 font-mono text-sm" />
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-sm font-semibold text-primary">
                          {formatEur(row.cost_billed_per_unit, 6)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">{marginPct}%</Badge>
                      </TableCell>
                      <TableCell>
                        <Switch checked={row.is_active} onCheckedChange={(v) => updateRow(row.id, "is_active", v)} />
                      </TableCell>
                      <TableCell>
                        {dirtyRows.has(row.id) && (
                          <Button size="sm" variant="ghost" onClick={() => savePricingRow(row)}>Salva</Button>
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
  );
}
