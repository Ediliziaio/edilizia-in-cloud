import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Settings2, Loader2, Zap, Layers, ShieldCheck } from "lucide-react";

/**
 * Editor dei default per-piano per-feature.
 *
 * Sorgente: tabella `plan_feature_defaults` (migration 20260417000009).
 * Fa il JOIN a sinistra con `platform_feature_flags` così anche le feature
 * che non hanno ancora un default esplicito per questo piano vengono
 * mostrate come righe modificabili.
 *
 * Scritture passano dal client con RLS (solo super_admin può INSERT/UPDATE
 * /DELETE, policy su migration 000009). La resolver RPC consulta questa
 * tabella con priorità sul vecchio `plans_included[]`.
 */

interface Props {
  planId: string;
  planSlug: string;
  planName: string;
}

interface FeatureFlagRow {
  key: string;
  name: string;
  description: string | null;
  category: string | null;
  is_beta: boolean | null;
  default_value: boolean | null;
  plans_included: string[] | null;
  sort_order: number | null;
}

interface PlanFeatureDefaultRow {
  id: string;
  plan_id: string;
  feature_key: string;
  is_enabled: boolean;
  limit_value: number | null;
  credits_included: number | null;
  credit_type: string | null;
  notes: string | null;
}

interface MergedRow {
  flag: FeatureFlagRow;
  defaultRow: PlanFeatureDefaultRow | null;
  /** Stato effettivo risolto per questo piano (is_enabled). */
  effectiveEnabled: boolean;
  /** Sorgente dello stato: 'plan_default' se esiste riga, 'plan' se solo in plans_included, 'default' altrimenti. */
  source: "plan_default" | "plan" | "default";
}

const CREDIT_TYPES = ["ai", "email", "whatsapp", "render"] as const;

export function PlanFeatureDefaultsCard({ planId, planSlug, planName }: Props) {
  const queryClient = useQueryClient();

  // Query 1: catalog completo di feature flags
  const { data: flags = [], isLoading: flagsLoading } = useQuery({
    queryKey: ["admin-feature-flags-catalog"] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_feature_flags")
        .select("key, name, description, category, is_beta, default_value, plans_included, sort_order")
        .order("sort_order", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as FeatureFlagRow[];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Query 2: righe plan_feature_defaults per questo piano
  const { data: defaults = [], isLoading: defaultsLoading } = useQuery({
    queryKey: queryKeys.admin.planFeatureDefaults(planId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plan_feature_defaults")
        .select("id, plan_id, feature_key, is_enabled, limit_value, credits_included, credit_type, notes")
        .eq("plan_id", planId);
      if (error) throw error;
      return (data ?? []) as PlanFeatureDefaultRow[];
    },
    staleTime: 30 * 1000,
  });

  const isLoading = flagsLoading || defaultsLoading;

  // JOIN in JS + calcolo source
  const rows: MergedRow[] = useMemo(() => {
    const defaultsByKey = new Map(defaults.map(d => [d.feature_key, d]));
    return flags.map(flag => {
      const pfd = defaultsByKey.get(flag.key) ?? null;
      let effectiveEnabled: boolean;
      let source: MergedRow["source"];
      if (pfd) {
        effectiveEnabled = pfd.is_enabled;
        source = "plan_default";
      } else if (flag.plans_included && flag.plans_included.includes(planSlug)) {
        effectiveEnabled = true;
        source = "plan";
      } else {
        effectiveEnabled = Boolean(flag.default_value);
        source = "default";
      }
      return { flag, defaultRow: pfd, effectiveEnabled, source };
    });
  }, [flags, defaults, planSlug]);

  // Toggle rapido: upsert con is_enabled invertito (lascia invariati gli altri campi)
  const toggleMutation = useMutation({
    mutationFn: async (args: { row: MergedRow; newEnabled: boolean }) => {
      const { row, newEnabled } = args;
      const payload = {
        plan_id: planId,
        feature_key: row.flag.key,
        is_enabled: newEnabled,
        limit_value: row.defaultRow?.limit_value ?? null,
        credits_included: row.defaultRow?.credits_included ?? null,
        credit_type: row.defaultRow?.credit_type ?? null,
        notes: row.defaultRow?.notes ?? null,
      };
      const { error } = await supabase
        .from("plan_feature_defaults")
        .upsert(payload, { onConflict: "plan_id,feature_key" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.planFeatureDefaults(planId) });
      // Invalida anche i feature-flag state risolti per company — il cambio di default
      // deve riflettersi subito nella UI delle aziende con questo piano
      queryClient.invalidateQueries({ queryKey: ["feature-access"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Editor dialog: modifica completa di una riga
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorTarget, setEditorTarget] = useState<MergedRow | null>(null);
  const [editorForm, setEditorForm] = useState({
    is_enabled: false,
    limit_value: "",
    credits_included: "",
    credit_type: "" as "" | typeof CREDIT_TYPES[number],
    notes: "",
  });

  const openEditor = (row: MergedRow) => {
    setEditorTarget(row);
    setEditorForm({
      is_enabled: row.effectiveEnabled,
      limit_value: row.defaultRow?.limit_value?.toString() ?? "",
      credits_included: row.defaultRow?.credits_included?.toString() ?? "",
      credit_type: (row.defaultRow?.credit_type as typeof editorForm.credit_type) ?? "",
      notes: row.defaultRow?.notes ?? "",
    });
    setEditorOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!editorTarget) throw new Error("Nessuna feature selezionata");
      const limit = editorForm.limit_value.trim() === "" ? null : Number(editorForm.limit_value);
      const credits = editorForm.credits_included.trim() === "" ? null : Number(editorForm.credits_included);
      if (limit !== null && (!Number.isFinite(limit) || !Number.isInteger(limit))) {
        throw new Error("limit_value deve essere un intero (vuoto = illimitato)");
      }
      if (credits !== null && !Number.isFinite(credits)) {
        throw new Error("credits_included deve essere numerico");
      }
      if (credits !== null && !editorForm.credit_type) {
        throw new Error("Scegli un credit_type se imposti credits_included");
      }
      const payload = {
        plan_id: planId,
        feature_key: editorTarget.flag.key,
        is_enabled: editorForm.is_enabled,
        limit_value: limit,
        credits_included: credits,
        credit_type: editorForm.credit_type || null,
        notes: editorForm.notes.trim() || null,
      };
      const { error } = await supabase
        .from("plan_feature_defaults")
        .upsert(payload, { onConflict: "plan_id,feature_key" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.planFeatureDefaults(planId) });
      queryClient.invalidateQueries({ queryKey: ["feature-access"] });
      toast.success("Default salvato");
      setEditorOpen(false);
      setEditorTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // "Ripristina default": elimina la riga esplicita → resolver ricade sul legacy plans_included
  const resetMutation = useMutation({
    mutationFn: async (row: MergedRow) => {
      if (!row.defaultRow) return; // niente da cancellare
      const { error } = await supabase
        .from("plan_feature_defaults")
        .delete()
        .eq("id", row.defaultRow.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.planFeatureDefaults(planId) });
      queryClient.invalidateQueries({ queryKey: ["feature-access"] });
      toast.success("Ripristinato default legacy");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const explicitCount = defaults.length;
  const totalCount = flags.length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-primary" />
              Default per-piano (plan_feature_defaults)
            </CardTitle>
            <CardDescription>
              Toggle sblocco/blocco per ogni feature, limiti numerici e crediti inclusi per <code>{planSlug}</code>.
              Le righe esplicite (<Badge variant="secondary" className="text-[0.65rem] px-1">plan_default</Badge>)
              hanno priorità su <code>plans_included[]</code> legacy.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1">
              <Layers className="h-3 w-3" />
              {explicitCount}/{totalCount} esplicite
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[300px] w-full" />
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[200px]">Feature</TableHead>
                  <TableHead className="w-[100px]">Stato</TableHead>
                  <TableHead className="w-[90px] text-right">Limite</TableHead>
                  <TableHead className="w-[130px] text-right">Crediti inclusi</TableHead>
                  <TableHead className="w-[110px]">Sorgente</TableHead>
                  <TableHead className="w-[200px] text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const { flag, defaultRow, effectiveEnabled, source } = row;
                  const creditsLabel = defaultRow?.credits_included != null
                    ? `${defaultRow.credits_included} ${defaultRow.credit_type ?? ""}`
                    : "—";
                  const limitLabel = defaultRow?.limit_value != null
                    ? (defaultRow.limit_value === 0 ? "bloccato" : defaultRow.limit_value.toString())
                    : "—";
                  return (
                    <TableRow key={flag.key}>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium">{flag.name}</span>
                            {flag.is_beta && (
                              <Badge variant="outline" className="text-[0.6rem] px-1 border-amber-300 text-amber-700">
                                BETA
                              </Badge>
                            )}
                          </div>
                          <code className="text-[0.65rem] text-muted-foreground">{flag.key}</code>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={effectiveEnabled}
                          disabled={toggleMutation.isPending}
                          onCheckedChange={(checked) =>
                            toggleMutation.mutate({ row, newEnabled: checked })
                          }
                        />
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {limitLabel}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {creditsLabel}
                      </TableCell>
                      <TableCell>
                        {source === "plan_default" ? (
                          <Badge variant="default" className="gap-1">
                            <ShieldCheck className="h-3 w-3" /> plan_default
                          </Badge>
                        ) : source === "plan" ? (
                          <Badge variant="secondary">plans_included</Badge>
                        ) : (
                          <Badge variant="outline">default</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEditor(row)}>
                            <Zap className="h-3 w-3 mr-1" /> Avanzate
                          </Button>
                          {defaultRow && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={resetMutation.isPending}
                              onClick={() => resetMutation.mutate(row)}
                            >
                              Reset
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* Editor avanzato */}
      <Dialog
        open={editorOpen}
        onOpenChange={(open) => {
          setEditorOpen(open);
          if (!open) setEditorTarget(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editorTarget?.flag.name ?? "Feature"} — default per {planName}
            </DialogTitle>
            <DialogDescription>
              Imposta abilitazione, limite numerico e crediti mensili inclusi per questo piano.
              I valori vuoti equivalgono a "non impostato" (il resolver ricade sul default globale
              o sul legacy <code>plans_included[]</code>).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between gap-4 rounded-md border p-3">
              <div>
                <Label className="text-sm">Abilitata di default</Label>
                <p className="text-xs text-muted-foreground">
                  Se spento, il piano blocca la feature per tutte le aziende abbonate (salvo override per-azienda).
                </p>
              </div>
              <Switch
                checked={editorForm.is_enabled}
                onCheckedChange={(v) => setEditorForm(f => ({ ...f, is_enabled: v }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Limit value (intero)</Label>
                <Input
                  type="number"
                  step="1"
                  placeholder="vuoto = illimitato"
                  value={editorForm.limit_value}
                  onChange={(e) => setEditorForm(f => ({ ...f, limit_value: e.target.value }))}
                />
                <p className="text-[0.65rem] text-muted-foreground">0 = bloccato, vuoto = illimitato</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Credits included</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={editorForm.credits_included}
                  onChange={(e) => setEditorForm(f => ({ ...f, credits_included: e.target.value }))}
                />
                <p className="text-[0.65rem] text-muted-foreground">EUR per ai/email/wa, intero per render</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Credit type</Label>
              <Select
                value={editorForm.credit_type || "none"}
                onValueChange={(v) => setEditorForm(f => ({
                  ...f, credit_type: v === "none" ? "" : v as typeof CREDIT_TYPES[number],
                }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Nessuno" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Nessuno —</SelectItem>
                  {CREDIT_TYPES.map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Note (interne)</Label>
              <Textarea
                value={editorForm.notes}
                onChange={(e) => setEditorForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Es: lancio Q2 include 50€ AI/mese per piani Pro"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)}>Annulla</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Salva default
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
