// MP05-FIX — SuperAdmin editor markup per task_kind.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Info } from "lucide-react";
import { toast } from "sonner";

interface MarkupRow {
  id: string;
  task_kind: string;
  markup_multiplier: number;
  min_charge_eur: number;
  display_label: string;
  description: string | null;
  enabled: boolean;
  // per_model_markup (migration 20270512000200): righe per-modello + cap.
  model_pattern: string | null;
  markup_max: number | null;
}

export function AdminMarkupConfigTab() {
  const qc = useQueryClient();

  const { data: rows, isLoading } = useQuery({
    queryKey: ["admin", "pricing-markup"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_pricing_markup")
        .select("*")
        .order("markup_multiplier", { ascending: false });
      if (error) throw error;
      return (data ?? []) as MarkupRow[];
    },
  });

  const updateMut = useMutation({
    mutationFn: async (row: { id: string } & Partial<MarkupRow>) => {
      const { id, ...updates } = row;
      const { error } = await supabase
        .from("ai_pricing_markup")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "pricing-markup"] });
      toast.success("Markup aggiornato");
    },
    onError: (e: Error) => toast.error(`Errore: ${e.message}`),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-sm">
          Il markup è <strong>moltiplicativo</strong>: ×3 significa{" "}
          <code>costo_reale × 3 = prezzo fatturato</code>. Esempio: chiamata
          costa $0,01 reale → con markup ×3 e tasso EUR 0,92 scala
          <strong> €0,0276</strong> dai crediti azienda.
        </AlertDescription>
      </Alert>

      {(rows ?? []).map((r) => {
        const marginPct = (((r.markup_multiplier - 1) / r.markup_multiplier) * 100).toFixed(1);
        const exampleEur = (0.01 * 0.92 * r.markup_multiplier).toFixed(5);

        return (
          <Card key={r.id}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold">{r.display_label}</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    {r.description}
                  </p>
                  <code className="text-xs text-muted-foreground">
                    {r.task_kind}
                    {r.model_pattern ? ` · modello: ${r.model_pattern}` : ""}
                    {r.markup_max != null ? ` · cap ×${r.markup_max}` : ""}
                  </code>
                </div>
                <Switch
                  checked={r.enabled}
                  onCheckedChange={(enabled) =>
                    updateMut.mutate({ id: r.id, enabled })
                  }
                  aria-label={`Abilita markup ${r.task_kind}`}
                />
              </div>
            </CardHeader>

            <CardContent className="pt-0">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label>Markup (×)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="1"
                    // Il DB ha CHECK markup_max >= markup_multiplier: senza il
                    // clamp l'update falliva con errore constraint criptico.
                    max={r.markup_max ?? 20}
                    defaultValue={r.markup_multiplier}
                    onBlur={(e) => {
                      const val = Number(e.target.value);
                      const cap = r.markup_max ?? 20;
                      if (val !== r.markup_multiplier && val >= 1 && val <= cap) {
                        updateMut.mutate({ id: r.id, markup_multiplier: val });
                      } else if (val > cap) {
                        toast.error(`Markup oltre il cap ×${cap} per questa riga (limite DB)`);
                      }
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Margine teorico</Label>
                  <div className="text-sm font-medium pt-2 text-emerald-600">
                    {marginPct}%
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Esempio €0,01 reale → azienda paga</Label>
                  <div className="text-sm font-mono pt-2">€{exampleEur}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
