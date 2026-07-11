import { useState, useEffect, useRef } from "react";
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
  const [isApplying, setIsApplying] = useState(false);
  // Draft stringa per gli input numerici: svuotare il campo non deve far
  // saltare il valore a un default (parseFloat(...) || N) sotto le dita.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const draftKey = (id: string, field: string) => `${id}:${field}`;

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

  // Ref per leggere le righe dirty nell'effect di merge senza metterle
  // nelle deps (un dep su dirtyRows farebbe ri-sincronizzare con dati
  // stale al save). Deve stare PRIMA dell'effect di merge.
  const dirtyRowsRef = useRef(dirtyRows);
  useEffect(() => {
    dirtyRowsRef.current = dirtyRows;
  }, [dirtyRows]);

  useEffect(() => {
    if (!pricing) return;
    // Merge: le righe con modifiche non salvate NON vengono sovrascritte
    // dal refetch (l'invalidate di un'altra riga resettava tutto).
    setEditedPricing((prev) =>
      pricing.map((serverRow) => {
        const local = prev.find((r) => r.id === serverRow.id);
        return dirtyRowsRef.current.has(serverRow.id) && local ? local : serverRow;
      })
    );
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

  const handleNumericChange = (
    id: string,
    field: "cost_real_per_unit" | "markup_multiplier",
    raw: string
  ) => {
    setDrafts((prev) => ({ ...prev, [draftKey(id, field)]: raw }));
    const parsed = parseFloat(raw);
    if (!isNaN(parsed)) {
      updateRow(id, field, parsed);
    } else {
      // Campo vuoto/non parsabile: la riga resta dirty ma il valore
      // precedente non viene sostituito da un default.
      setDirtyRows((prev) => new Set(prev).add(id));
    }
  };

  const validateRow = (row: WhatsAppPricingRow): string | null => {
    const realDraft = drafts[draftKey(row.id, "cost_real_per_unit")];
    const markupDraft = drafts[draftKey(row.id, "markup_multiplier")];
    if (realDraft !== undefined && isNaN(parseFloat(realDraft))) return "Costo reale non valido";
    if (markupDraft !== undefined && isNaN(parseFloat(markupDraft))) return "Markup non valido";
    if (row.cost_real_per_unit < 0) return "Il costo reale deve essere ≥ 0";
    if (row.markup_multiplier < 1) return "Il markup deve essere almeno 1.0";
    return null;
  };

  const clearRowDrafts = (id: string) => {
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[draftKey(id, "cost_real_per_unit")];
      delete next[draftKey(id, "markup_multiplier")];
      return next;
    });
  };

  const savePricingRow = async (row: WhatsAppPricingRow) => {
    const validationError = validateRow(row);
    if (validationError) { toast.error(validationError); return; }
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
    clearRowDrafts(row.id);
    queryClient.invalidateQueries({ queryKey: ["whatsapp-pricing"] });
  };

  // Salvataggio immediato on-toggle: azione atomica per riga, non passa
  // dallo stato dirty (il flip locale senza save si perdeva).
  const toggleActive = async (row: WhatsAppPricingRow, value: boolean) => {
    setEditedPricing((prev) => prev.map((r) => (r.id === row.id ? { ...r, is_active: value } : r)));
    const { error } = await supabase
      .from("whatsapp_pricing" as never)
      .update({ is_active: value, updated_at: new Date().toISOString() } as never)
      .eq("id" as never, row.id as never);
    if (error) {
      setEditedPricing((prev) => prev.map((r) => (r.id === row.id ? { ...r, is_active: !value } : r)));
      toast.error("Errore nell'aggiornamento dello stato");
      return;
    }
    toast.success(`Tariffa "${row.label || row.category}" ${value ? "attivata" : "disattivata"}`);
    queryClient.invalidateQueries({ queryKey: ["whatsapp-pricing"] });
  };

  const applyGlobalMarkup = async () => {
    const markup = parseFloat(globalMarkup);
    if (isNaN(markup) || markup < 1) { toast.error("Markup deve essere almeno 1.0"); return; }
    // Base di calcolo = valori salvati (pricing), non lo stato locale non
    // salvato: evita di scrivere billed incoerenti col cost_real in DB.
    const rows = pricing ?? [];
    if (rows.length === 0) { toast.error("Nessuna tariffa da aggiornare"); return; }
    setIsApplying(true);
    try {
      let done = 0;
      for (const row of rows) {
        const newBilled = Number((row.cost_real_per_unit * markup).toFixed(6));
        const { error } = await supabase
          .from("whatsapp_pricing" as never)
          .update({ markup_multiplier: markup, cost_billed_per_unit: newBilled, updated_at: new Date().toISOString() } as never)
          .eq("id" as never, row.id as never);
        if (error) {
          toast.error(`Errore: applicate ${done} tariffe su ${rows.length}`, {
            description: error.message ?? "Aggiornamento interrotto.",
          });
          return;
        }
        done++;
      }
      toast.success(`Markup ${markup}x applicato a tutte le tariffe`);
    } finally {
      setIsApplying(false);
      queryClient.invalidateQueries({ queryKey: ["whatsapp-pricing"] });
    }
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
          <Button size="sm" className="mt-3" onClick={applyGlobalMarkup} disabled={isApplying}>
            {isApplying ? "Applicazione in corso..." : "Applica Markup a Tutte le Tariffe"}
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
                        <Input type="number" step={0.00001} min={0}
                          value={drafts[draftKey(row.id, "cost_real_per_unit")] ?? row.cost_real_per_unit}
                          onChange={(e) => handleNumericChange(row.id, "cost_real_per_unit", e.target.value)}
                          className="w-28 font-mono text-sm" />
                      </TableCell>
                      <TableCell>
                        <Input type="number" step={0.5} min={1}
                          value={drafts[draftKey(row.id, "markup_multiplier")] ?? row.markup_multiplier}
                          onChange={(e) => handleNumericChange(row.id, "markup_multiplier", e.target.value)}
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
                        <Switch checked={row.is_active} onCheckedChange={(v) => toggleActive(row, v)} />
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
