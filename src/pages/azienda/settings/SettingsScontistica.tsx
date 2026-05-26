/**
 * SettingsScontistica — gestione regole di sconto aziendali.
 *
 * Funzionalità principali:
 *  - CRUD regole (nome, scope, fascia importo, sconto max, approva oltre,
 *    margine min, priorità)
 *  - Toggle attiva/disattiva da tabella senza aprire dialog
 *  - Simulatore live (replica compute_max_discount SQL) per testare combinazioni
 *    importo × commerciale × tag cliente × tipo lavoro
 *
 * Validazioni cross-field:
 *  - importo_max ≥ importo_min
 *  - approva_oltre_pct ≤ sconto_max_pct
 *  - salesperson_id obbligatorio se scope=per_commerciale
 *  - client_category obbligatorio se scope=per_cliente_cat
 *
 * Responsive: tabella su md+, card view su mobile.
 */
import { useState, useMemo, useEffect } from "react";
import {
  Plus, Pencil, Trash2, Percent, AlertCircle, Info, Calculator,
  CheckCircle2, XCircle, AlertTriangle, Loader2, ChevronRight,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import {
  useDiscountRules, useUpsertDiscountRule, useDeleteDiscountRule,
  type DiscountRule, type DiscountRuleScope,
} from "@/hooks/useDiscountRules";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";

/** Sentinel per Radix Select: "nessun valore" → null al salvataggio. */
const SELECT_NONE = "__none__";

/** Converte input number → number | null gestendo stringa vuota / NaN. */
function toNumOrNull(v: unknown): number | null {
  if (v === "" || v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
function toNum(v: unknown, fallback = 0): number {
  const n = toNumOrNull(v);
  return n ?? fallback;
}

const schema = z
  .object({
    name: z.string().trim().min(1, "Nome obbligatorio").max(100, "Max 100 caratteri"),
    scope: z.enum(["globale", "per_commerciale", "per_cliente_cat"]),
    salesperson_id: z.string().nullable().optional(),
    client_category: z.string().trim().nullable().optional(),
    tipo_lavoro: z.string().trim().nullable().optional(),
    importo_min: z.coerce.number().min(0, "Min ≥ 0").nullable().optional(),
    importo_max: z.coerce.number().min(0, "Max ≥ 0").nullable().optional(),
    margine_min_pct: z.coerce.number().min(0).max(99, "Margine min deve essere < 100% (altrimenti nessuno sconto applicabile)"),
    sconto_max_pct: z.coerce.number().min(0.1, "Sconto max deve essere > 0% (altrimenti la regola non concede sconti)").max(100),
    approva_oltre_pct: z.coerce.number().min(0).max(100).nullable().optional(),
    priority: z.coerce.number().int().min(1).max(1000),
    is_active: z.boolean(),
  })
  // Cross-validation: importo_max ≥ importo_min
  .refine(
    (v) => v.importo_max == null || (v.importo_min ?? 0) <= v.importo_max,
    { path: ["importo_max"], message: "Max deve essere ≥ Min" },
  )
  // approva_oltre ≤ sconto_max (sennò approvazione non scatta mai)
  .refine(
    (v) => v.approva_oltre_pct == null || v.approva_oltre_pct <= v.sconto_max_pct,
    { path: ["approva_oltre_pct"], message: "Deve essere ≤ Sconto max" },
  )
  // salesperson obbligatorio quando scope=per_commerciale
  .refine(
    (v) => v.scope !== "per_commerciale" || (v.salesperson_id != null && v.salesperson_id !== ""),
    { path: ["salesperson_id"], message: "Seleziona un commerciale" },
  )
  // client_category obbligatorio quando scope=per_cliente_cat
  .refine(
    (v) => v.scope !== "per_cliente_cat" || (v.client_category != null && v.client_category.trim() !== ""),
    { path: ["client_category"], message: "Inserisci il tag categoria cliente" },
  );

type FormValues = z.infer<typeof schema>;

const SCOPE_LABELS: Record<DiscountRuleScope, string> = {
  globale: "Globale",
  per_commerciale: "Per commerciale",
  per_cliente_cat: "Per categoria cliente",
};

const DEFAULT_VALUES: FormValues = {
  name: "",
  scope: "globale",
  salesperson_id: null,
  client_category: null,
  tipo_lavoro: null,
  importo_min: 0,
  importo_max: null,
  margine_min_pct: 15,
  sconto_max_pct: 10,
  approva_oltre_pct: null,
  priority: 100,
  is_active: true,
};

export default function SettingsScontistica() {
  const companyId = useEffectiveCompanyId();
  const { data: rules = [], isLoading } = useDiscountRules();
  const upsert = useUpsertDiscountRule();
  const del = useDeleteDiscountRule();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DiscountRule | null>(null);

  const { data: salespeople = [], isLoading: salespeopleLoading } = useQuery({
    queryKey: ["salespeople-active", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("salespeople")
        .select("id, first_name, last_name")
        .eq("company_id", companyId!)
        .eq("is_active", true)
        .order("last_name");
      if (error) throw error;
      return data as Array<{ id: string; first_name: string; last_name: string }>;
    },
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: DEFAULT_VALUES,
    mode: "onBlur",
  });

  const openNew = () => {
    setEditing(null);
    form.reset(DEFAULT_VALUES);
    setDialogOpen(true);
  };

  const openEdit = (rule: DiscountRule) => {
    setEditing(rule);
    // Spread di DEFAULT_VALUES PRIMA → garantisce che eventuali campi nulli
    // sulla regola siano normalizzati ai default (no field "fantasma" da
    // precedente edit). Pattern difensivo contro contaminazione stato form.
    form.reset({
      ...DEFAULT_VALUES,
      name: rule.name,
      scope: rule.scope,
      salesperson_id: rule.salesperson_id,
      client_category: rule.client_category,
      tipo_lavoro: rule.tipo_lavoro,
      importo_min: rule.importo_min,
      importo_max: rule.importo_max,
      margine_min_pct: rule.margine_min_pct,
      sconto_max_pct: rule.sconto_max_pct,
      approva_oltre_pct: rule.approva_oltre_pct,
      priority: rule.priority,
      is_active: rule.is_active,
    });
    setDialogOpen(true);
  };

  const onSubmit = (values: FormValues) => {
    const isEdit = !!editing?.id;
    upsert.mutate(
      {
        id: editing?.id,
        ...values,
        // Cleanup: se scope non li usa, nulla i campi correlati per evitare
        // dati orfani che confondono il matcher SQL.
        salesperson_id: values.scope === "per_commerciale" ? values.salesperson_id ?? null : null,
        client_category: values.scope === "per_cliente_cat" ? values.client_category ?? null : null,
        // tipo_lavoro: stringa vuota → null
        tipo_lavoro: values.tipo_lavoro?.trim() ? values.tipo_lavoro.trim() : null,
      },
      {
        onSuccess: () => {
          setDialogOpen(false);
          setEditing(null);
          toast.success(isEdit ? "Regola aggiornata" : "Regola creata", {
            description: `"${values.name}" è ora attiva nel matching sconti.`,
          });
        },
        onError: (err: Error) => {
          toast.error(isEdit ? "Errore aggiornamento" : "Errore creazione", {
            description: err.message,
          });
        },
      }
    );
  };

  // Toggle attiva/disattiva con UNDO 4s — niente dialog modale per non
  // rallentare power user, ma sicuro: click accidentale recuperabile.
  const handleToggleActive = (rule: DiscountRule, checked: boolean) => {
    upsert.mutate(
      { id: rule.id, is_active: checked },
      {
        onSuccess: () => {
          toast.success(
            checked
              ? `Regola "${rule.name}" attivata`
              : `Regola "${rule.name}" disattivata`,
            {
              duration: 4000,
              action: {
                label: "Annulla",
                onClick: () => {
                  upsert.mutate(
                    { id: rule.id, is_active: !checked },
                    {
                      onSuccess: () =>
                        toast.info("Modifica annullata", {
                          description: `Stato di "${rule.name}" ripristinato.`,
                        }),
                    },
                  );
                },
              },
            },
          );
        },
        onError: (err: Error) => {
          toast.error("Errore toggle regola", { description: err.message });
        },
      },
    );
  };

  const handleDelete = (rule: DiscountRule) => {
    del.mutate(rule.id, {
      onSuccess: () => {
        toast.success("Regola eliminata", {
          description: `"${rule.name}" è stata rimossa dalle regole attive.`,
        });
      },
      onError: (err: Error) => {
        toast.error("Errore eliminazione", { description: err.message });
      },
    });
  };

  const scope = form.watch("scope");
  // C3: pulizia campi scope-dependent al cambio scope. Evita "fantasmi"
  // (salesperson_id che resta valorizzato quando scope=globale, ecc.).
  // useEffect su scope: resetField solo se NON corrispondenti al nuovo scope.
  useEffect(() => {
    if (scope !== "per_commerciale") form.setValue("salesperson_id", null);
    if (scope !== "per_cliente_cat") form.setValue("client_category", null);
  }, [scope, form]);

  const activeCount = rules.filter((r) => r.is_active).length;
  // A3: sort esplicito per priority asc → garanzia di ordine visivo
  // coerente con la regola di matching SQL.
  const sortedRules = useMemo(
    () => [...rules].sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100)),
    [rules],
  );

  return (
    <TooltipProvider delayDuration={200}>
      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Percent className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold leading-tight">Regole di scontistica</h1>
              <p className="text-sm text-muted-foreground">
                Limiti di sconto per i commerciali — <strong>{rules.length}</strong> configurate,{" "}
                <strong>{activeCount}</strong> attive.
              </p>
            </div>
          </div>
          <Button onClick={openNew} size="sm" className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-1.5" />
            Nuova regola
          </Button>
        </div>

        {/* "Come funziona" — più scannabile */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Come funziona</AlertTitle>
          <AlertDescription className="text-sm space-y-1">
            <ul className="list-disc ml-5 space-y-0.5">
              <li>Ogni preventivo matcha tutte le regole con scope + fascia importo + tipo lavoro coerenti.</li>
              <li>Il sistema applica il limite <strong>più basso</strong> tra le regole matchanti (binding).</li>
              <li>Oltre <em>approva oltre %</em> → richiede approvazione admin.</li>
              <li>Oltre <em>sconto max %</em> → bloccato senza override admin.</li>
              <li>Il <strong>margine minimo</strong> non si scende mai sotto: lo sconto viene limitato in automatico.</li>
            </ul>
          </AlertDescription>
        </Alert>

        {/* Simulatore */}
        <DiscountSimulator rules={rules} salespeople={salespeople} />

        {/* Tabella / Card list */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Regole attive</CardTitle>
            <CardDescription>Ordinate per priorità crescente (più basso = valutato prima)</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Caricamento…
              </div>
            ) : rules.length === 0 ? (
              <div className="p-8 text-center border rounded-lg border-dashed">
                <AlertCircle className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
                <p className="font-medium">Nessuna regola configurata</p>
                <p className="text-sm text-muted-foreground mt-1">
                  In assenza di regole il limite è <strong>10%</strong> per tutti.
                </p>
                <Button onClick={openNew} size="sm" className="mt-4">
                  <Plus className="h-4 w-4 mr-1.5" />
                  Crea la prima regola
                </Button>
              </div>
            ) : (
              <>
                {/* Desktop: tabella */}
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Scope</TableHead>
                        <TableHead>Fascia importo</TableHead>
                        <TableHead className="text-right">Margine min</TableHead>
                        <TableHead className="text-right">Sconto max</TableHead>
                        <TableHead className="text-right">Approva oltre</TableHead>
                        <TableHead className="text-right">Prio</TableHead>
                        <TableHead>Attiva</TableHead>
                        <TableHead className="text-right">Azioni</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedRules.map((r) => (
                        <RuleRow
                          key={r.id}
                          rule={r}
                          salespeople={salespeople}
                          onToggle={(checked) => handleToggleActive(r, checked)}
                          onEdit={() => openEdit(r)}
                          onDelete={() => handleDelete(r)}
                          toggleDisabled={upsert.isPending}
                          deleteDisabled={del.isPending}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile: card list */}
                <div className="md:hidden space-y-2">
                  {sortedRules.map((r) => (
                    <RuleCard
                      key={r.id}
                      rule={r}
                      salespeople={salespeople}
                      onToggle={(checked) => handleToggleActive(r, checked)}
                      onEdit={() => openEdit(r)}
                      onDelete={() => handleDelete(r)}
                      toggleDisabled={upsert.isPending}
                      deleteDisabled={del.isPending}
                    />
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Dialog crea/modifica */}
        <Dialog open={dialogOpen} onOpenChange={(open) => {
          // Evita di chiudere accidentalmente in pending: se sta salvando, blocca.
          if (!open && upsert.isPending) return;
          setDialogOpen(open);
        }}>
          <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? "Modifica regola" : "Nuova regola di sconto"}</DialogTitle>
              <DialogDescription>
                Definisci condizioni di applicazione e limiti.
              </DialogDescription>
            </DialogHeader>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome regola *</FormLabel>
                      <FormControl>
                        <Input placeholder='es. "Sconto gold cliente fino 10k"' {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="scope"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo di regola</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="globale">Globale (tutti i commerciali + tutti i clienti)</SelectItem>
                          <SelectItem value="per_commerciale">Per commerciale specifico</SelectItem>
                          <SelectItem value="per_cliente_cat">Per categoria / tag cliente</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {scope === "per_commerciale" && (
                  <FormField
                    control={form.control}
                    name="salesperson_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Commerciale *</FormLabel>
                        <Select
                          onValueChange={(v) => field.onChange(v === SELECT_NONE ? null : v)}
                          value={field.value ?? SELECT_NONE}
                          disabled={salespeopleLoading}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder={salespeopleLoading ? "Caricamento…" : "Seleziona commerciale"} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value={SELECT_NONE}>— Seleziona —</SelectItem>
                            {salespeople.map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.first_name} {s.last_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {salespeople.length === 0 && !salespeopleLoading && (
                          <FormDescription className="text-xs text-amber-600">
                            ⚠ Nessun commerciale attivo. Aggiungili in Impostazioni › Commerciali.
                          </FormDescription>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {scope === "per_cliente_cat" && (
                  <FormField
                    control={form.control}
                    name="client_category"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tag / categoria cliente *</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="es. gold, silver, bronze"
                            {...field}
                            value={field.value ?? ""}
                            onChange={(e) => field.onChange(e.target.value || null)}
                          />
                        </FormControl>
                        <FormDescription className="text-xs">
                          Deve corrispondere a un tag presente sui contatti.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <FormField
                  control={form.control}
                  name="tipo_lavoro"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo di lavoro (opzionale)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="es. serramenti, ristrutturazione"
                          {...field}
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value || null)}
                        />
                      </FormControl>
                      <FormDescription className="text-xs">
                        Vuoto = la regola si applica a qualsiasi tipo di lavoro.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="importo_min"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Importo min (€)</FormLabel>
                        <FormControl>
                          <Input
                            type="number" step="0.01" min="0" inputMode="decimal"
                            value={field.value ?? 0}
                            onChange={(e) => field.onChange(toNum(e.target.value, 0))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="importo_max"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Importo max (€)</FormLabel>
                        <FormControl>
                          <Input
                            type="number" step="0.01" min="0" inputMode="decimal"
                            placeholder="∞ (vuoto)"
                            value={field.value ?? ""}
                            onChange={(e) => field.onChange(toNumOrNull(e.target.value))}
                          />
                        </FormControl>
                        <FormDescription className="text-xs">Vuoto = nessun limite</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="margine_min_pct"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Margine min post-sconto (%)</FormLabel>
                        <FormControl>
                          <Input
                            type="number" step="0.1" min="0" max="100" inputMode="decimal"
                            value={field.value ?? 0}
                            onChange={(e) => field.onChange(toNum(e.target.value, 0))}
                          />
                        </FormControl>
                        <FormDescription className="text-xs">Non si scende sotto.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="sconto_max_pct"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Sconto max consentito (%)</FormLabel>
                        <FormControl>
                          <Input
                            type="number" step="0.1" min="0" max="100" inputMode="decimal"
                            value={field.value ?? 0}
                            onChange={(e) => field.onChange(toNum(e.target.value, 0))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="approva_oltre_pct"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Approva oltre (%)</FormLabel>
                        <FormControl>
                          <Input
                            type="number" step="0.1" min="0" max="100" inputMode="decimal"
                            placeholder="— (nessuna soglia)"
                            value={field.value ?? ""}
                            onChange={(e) => field.onChange(toNumOrNull(e.target.value))}
                          />
                        </FormControl>
                        <FormDescription className="text-xs">
                          Oltre → autorizzazione admin.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="priority"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Priorità</FormLabel>
                        <FormControl>
                          <Input
                            type="number" step="1" min="1" max="1000" inputMode="numeric"
                            value={field.value ?? 100}
                            onChange={(e) => field.onChange(toNum(e.target.value, 100))}
                          />
                        </FormControl>
                        <FormDescription className="text-xs">Più basso = valutato prima.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="is_active"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <FormLabel>Regola attiva</FormLabel>
                        <FormDescription className="text-xs">
                          Se disattiva, non viene considerata.
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <DialogFooter className="gap-2 sm:gap-0">
                  <Button
                    type="button" variant="outline"
                    onClick={() => setDialogOpen(false)}
                    disabled={upsert.isPending}
                  >
                    Annulla
                  </Button>
                  <Button type="submit" disabled={upsert.isPending}>
                    {upsert.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                    {editing ? "Salva modifiche" : "Crea regola"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}

/* ─── Riga tabella (desktop) ──────────────────────────────────────────── */
function RuleRow({
  rule, salespeople, onToggle, onEdit, onDelete, toggleDisabled, deleteDisabled,
}: {
  rule: DiscountRule;
  salespeople: Array<{ id: string; first_name: string; last_name: string }>;
  onToggle: (checked: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  toggleDisabled?: boolean;
  deleteDisabled?: boolean;
}) {
  const salesperson = rule.scope === "per_commerciale" && rule.salesperson_id
    ? salespeople.find((s) => s.id === rule.salesperson_id)
    : null;

  return (
    <TableRow className={!rule.is_active ? "opacity-50" : ""}>
      <TableCell className="font-medium">
        {rule.name}
        {salesperson && (
          <div className="text-xs text-muted-foreground">
            {salesperson.first_name} {salesperson.last_name}
          </div>
        )}
        {rule.scope === "per_cliente_cat" && rule.client_category && (
          <div className="text-xs text-muted-foreground">Tag: {rule.client_category}</div>
        )}
        {rule.tipo_lavoro && (
          <div className="text-xs text-muted-foreground">Tipo: {rule.tipo_lavoro}</div>
        )}
      </TableCell>
      <TableCell>
        <Badge variant="outline">{SCOPE_LABELS[rule.scope]}</Badge>
      </TableCell>
      <TableCell className="text-sm">
        €{(rule.importo_min ?? 0).toLocaleString("it-IT")} –{" "}
        {rule.importo_max ? `€${rule.importo_max.toLocaleString("it-IT")}` : "∞"}
      </TableCell>
      <TableCell className="text-right">{rule.margine_min_pct}%</TableCell>
      <TableCell className="text-right font-medium">{rule.sconto_max_pct}%</TableCell>
      <TableCell className="text-right">
        {rule.approva_oltre_pct != null ? `${rule.approva_oltre_pct}%` : "—"}
      </TableCell>
      <TableCell className="text-right text-xs">{rule.priority}</TableCell>
      <TableCell>
        <Switch
          checked={rule.is_active}
          onCheckedChange={onToggle}
          disabled={toggleDisabled}
          aria-label={`Toggle attivazione regola ${rule.name}`}
        />
      </TableCell>
      <TableCell className="text-right">
        <div className="flex gap-1 justify-end">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={onEdit} aria-label="Modifica regola">
                <Pencil className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Modifica</TooltipContent>
          </Tooltip>
          <DeleteRuleButton rule={rule} onDelete={onDelete} disabled={deleteDisabled} />
        </div>
      </TableCell>
    </TableRow>
  );
}

/* ─── Card mobile ─────────────────────────────────────────────────────── */
function RuleCard({
  rule, salespeople, onToggle, onEdit, onDelete, toggleDisabled, deleteDisabled,
}: {
  rule: DiscountRule;
  salespeople: Array<{ id: string; first_name: string; last_name: string }>;
  onToggle: (checked: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  toggleDisabled?: boolean;
  deleteDisabled?: boolean;
}) {
  const salesperson = rule.scope === "per_commerciale" && rule.salesperson_id
    ? salespeople.find((s) => s.id === rule.salesperson_id)
    : null;

  return (
    <div className={`rounded-lg border p-3 space-y-2 ${!rule.is_active ? "opacity-50" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-sm truncate">{rule.name}</p>
            <Badge variant="outline" className="text-[10px]">{SCOPE_LABELS[rule.scope]}</Badge>
          </div>
          {salesperson && (
            <p className="text-[11px] text-muted-foreground">{salesperson.first_name} {salesperson.last_name}</p>
          )}
          {rule.scope === "per_cliente_cat" && rule.client_category && (
            <p className="text-[11px] text-muted-foreground">Tag: {rule.client_category}</p>
          )}
          {rule.tipo_lavoro && (
            <p className="text-[11px] text-muted-foreground">Tipo: {rule.tipo_lavoro}</p>
          )}
        </div>
        <Switch
          checked={rule.is_active}
          onCheckedChange={onToggle}
          disabled={toggleDisabled}
          aria-label={`Toggle attivazione regola ${rule.name}`}
        />
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <p className="text-[9px] uppercase text-muted-foreground">Sconto max</p>
          <p className="font-semibold">{rule.sconto_max_pct}%</p>
        </div>
        <div>
          <p className="text-[9px] uppercase text-muted-foreground">Approva oltre</p>
          <p className="font-semibold">{rule.approva_oltre_pct != null ? `${rule.approva_oltre_pct}%` : "—"}</p>
        </div>
        <div>
          <p className="text-[9px] uppercase text-muted-foreground">Margine min</p>
          <p className="font-semibold">{rule.margine_min_pct}%</p>
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>
          €{(rule.importo_min ?? 0).toLocaleString("it-IT")} – {rule.importo_max ? `€${rule.importo_max.toLocaleString("it-IT")}` : "∞"}
        </span>
        <span>prio {rule.priority}</span>
      </div>

      <div className="flex gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={onEdit} className="flex-1 h-10">
          <Pencil className="h-4 w-4 mr-1.5" />
          Modifica
        </Button>
        <DeleteRuleButton rule={rule} onDelete={onDelete} mobile disabled={deleteDisabled} />
      </div>
    </div>
  );
}

/* ─── Bottone elimina con conferma ────────────────────────────────────── */
function DeleteRuleButton({
  rule, onDelete, mobile = false, disabled = false,
}: { rule: DiscountRule; onDelete: () => void; mobile?: boolean; disabled?: boolean }) {
  return (
    <AlertDialog>
      {mobile ? (
        <AlertDialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-10 px-3"
            disabled={disabled}
            aria-label={`Elimina regola ${rule.name}`}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </AlertDialogTrigger>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                disabled={disabled}
                aria-label={`Elimina regola ${rule.name}`}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </AlertDialogTrigger>
          </TooltipTrigger>
          <TooltipContent>Elimina</TooltipContent>
        </Tooltip>
      )}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Eliminare la regola?</AlertDialogTitle>
          <AlertDialogDescription>
            La regola <strong>{rule.name}</strong> sarà rimossa. I preventivi esistenti
            non saranno toccati; i nuovi non la applicheranno più.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annulla</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={onDelete}
          >
            Elimina
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/* ─────────────────────────────────────────────────────────────────────
 * Simulatore di sconto — live preview di quale regola si applica.
 * Replica in-browser la logica del backend (compute_max_discount RPC).
 * ─────────────────────────────────────────────────────────────────────
 */
function DiscountSimulator({
  rules,
  salespeople,
}: {
  rules: DiscountRule[];
  salespeople: Array<{ id: string; first_name: string; last_name: string }>;
}) {
  const [simImporto, setSimImporto] = useState<number>(5000);
  const [simSconto, setSimSconto] = useState<number>(10);
  const [simSalesperson, setSimSalesperson] = useState<string>("any");
  const [simCategoria, setSimCategoria] = useState<string>("");
  const [simTipoLavoro, setSimTipoLavoro] = useState<string>("");

  const evaluation = useMemo(() => {
    const active = rules.filter((r) => r.is_active);
    const matching = active.filter((r) => {
      // Scope
      if (r.scope === "per_commerciale") {
        if (!simSalesperson || simSalesperson === "any") return false;
        if (r.salesperson_id !== simSalesperson) return false;
      }
      if (r.scope === "per_cliente_cat") {
        if (!simCategoria.trim()) return false;
        if (r.client_category?.toLowerCase() !== simCategoria.trim().toLowerCase()) return false;
      }
      // Tipo lavoro
      if (r.tipo_lavoro && r.tipo_lavoro.trim()) {
        if (r.tipo_lavoro.toLowerCase() !== simTipoLavoro.trim().toLowerCase()) return false;
      }
      // Fascia importo
      const imMin = r.importo_min ?? 0;
      const imMax = r.importo_max ?? Infinity;
      if (simImporto < imMin || simImporto > imMax) return false;
      return true;
    });

    if (matching.length === 0) {
      return {
        matchingRules: [] as DiscountRule[],
        bindingSconto: 10,
        bindingApprova: null as number | null,
        bindingMargine: 0,
        fallback: true,
      };
    }

    const minSconto = Math.min(...matching.map((r) => r.sconto_max_pct));
    const minApprova = matching
      .filter((r) => r.approva_oltre_pct != null)
      .reduce<number | null>(
        (acc, r) => (acc == null ? r.approva_oltre_pct! : Math.min(acc, r.approva_oltre_pct!)),
        null,
      );
    const maxMargine = Math.max(...matching.map((r) => r.margine_min_pct));

    return {
      matchingRules: matching,
      bindingSconto: minSconto,
      bindingApprova: minApprova,
      bindingMargine: maxMargine,
      fallback: false,
    };
  }, [rules, simImporto, simSalesperson, simCategoria, simTipoLavoro]);

  const verdict = useMemo(() => {
    const s = simSconto;
    const cap = evaluation.bindingSconto;
    const approva = evaluation.bindingApprova;
    if (s > cap) return { kind: "blocked" as const, label: `Oltre il limite (${cap}%) — richiede override admin` };
    if (approva != null && s > approva) return { kind: "approve" as const, label: `Oltre ${approva}% — richiede approvazione admin` };
    return { kind: "ok" as const, label: `Applicabile liberamente dal commerciale` };
  }, [simSconto, evaluation.bindingSconto, evaluation.bindingApprova]);

  const hasActiveRules = rules.some((r) => r.is_active);

  return (
    <Card className="border-l-4 border-l-primary">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Calculator className="h-4 w-4 text-primary" />
          Simulatore — verifica le regole
        </CardTitle>
        <CardDescription>
          Testa uno scenario reale: quale regola scatta, qual è il tetto, se serve approvazione.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasActiveRules && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Nessuna regola attiva: il simulatore usa il fallback predefinito (10%).
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Commerciale</label>
            <Select value={simSalesperson} onValueChange={setSimSalesperson}>
              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">— non specificato —</SelectItem>
                {salespeople.map((sp) => (
                  <SelectItem key={sp.id} value={sp.id}>
                    {sp.first_name} {sp.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Categoria cliente</label>
            <Input
              value={simCategoria}
              onChange={(e) => setSimCategoria(e.target.value)}
              placeholder="es. vip, standard"
              className="h-9 text-xs"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Tipo lavoro</label>
            <Input
              value={simTipoLavoro}
              onChange={(e) => setSimTipoLavoro(e.target.value)}
              placeholder="es. ristrutturazione"
              className="h-9 text-xs"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Importo € (subtotal)</label>
            <Input
              type="number" min="0" inputMode="decimal"
              value={simImporto}
              onChange={(e) => setSimImporto(toNum(e.target.value, 0))}
              className="h-9 text-xs"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Sconto richiesto %</label>
            <Input
              type="number" min="0" max="100" step="0.1" inputMode="decimal"
              value={simSconto}
              onChange={(e) => setSimSconto(toNum(e.target.value, 0))}
              className="h-9 text-xs"
            />
          </div>
        </div>

        {/* KPI binding */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-lg border p-3 bg-muted/30">
            <p className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground">Regole matchanti</p>
            <p className="text-lg font-bold mt-0.5">{evaluation.matchingRules.length}</p>
            {evaluation.fallback && (
              <p className="text-[10px] text-muted-foreground">Nessuna → fallback 10%</p>
            )}
            {evaluation.matchingRules.length > 0 && (
              <div className="mt-1.5 space-y-0.5 max-h-16 overflow-y-auto">
                {evaluation.matchingRules.slice(0, 4).map((r) => (
                  <Badge key={r.id} variant="outline" className="mr-1 text-[9px] h-4 px-1">
                    {r.name}
                  </Badge>
                ))}
                {evaluation.matchingRules.length > 4 && (
                  <span className="text-[10px] text-muted-foreground">
                    +{evaluation.matchingRules.length - 4} altre
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="rounded-lg border p-3 bg-muted/30">
            <p className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground">Tetto sconto (binding)</p>
            <p className="text-lg font-bold mt-0.5 tabular-nums">{evaluation.bindingSconto}%</p>
            {evaluation.bindingApprova != null && (
              <p className="text-[10px] text-muted-foreground">
                Approvazione oltre {evaluation.bindingApprova}%
              </p>
            )}
          </div>
          <div className="rounded-lg border p-3 bg-muted/30">
            <p className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground">Margine minimo</p>
            <p className="text-lg font-bold mt-0.5 tabular-nums">{evaluation.bindingMargine}%</p>
            <p className="text-[10px] text-muted-foreground">Non si scende sotto</p>
          </div>
        </div>

        {/* Verdetto */}
        <div className={`rounded-lg border-l-4 p-3 flex items-start gap-2 ${
          verdict.kind === "ok"
            ? "border-l-emerald-500 bg-emerald-50/50 dark:bg-emerald-900/10"
            : verdict.kind === "approve"
            ? "border-l-amber-500 bg-amber-50/50 dark:bg-amber-900/10"
            : "border-l-red-500 bg-red-50/50 dark:bg-red-900/10"
        }`}>
          {verdict.kind === "ok" ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
          ) : verdict.kind === "approve" ? (
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          ) : (
            <XCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
          )}
          <div className="text-xs">
            <p className="font-semibold">
              {verdict.kind === "ok" ? "OK" : verdict.kind === "approve" ? "Richiede approvazione" : "Bloccato"}
            </p>
            <p className="text-muted-foreground">{verdict.label}</p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground/40 ml-auto shrink-0 mt-0.5 hidden sm:block" />
        </div>
      </CardContent>
    </Card>
  );
}
