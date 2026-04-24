import { useState, useMemo } from "react";
import { Plus, Pencil, Trash2, Percent, AlertCircle, Info, Calculator, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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

import {
  useDiscountRules, useUpsertDiscountRule, useDeleteDiscountRule,
  type DiscountRule, type DiscountRuleScope,
} from "@/hooks/useDiscountRules";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";

const schema = z.object({
  name: z.string().min(1, "Nome obbligatorio"),
  scope: z.enum(["globale", "per_commerciale", "per_cliente_cat"]),
  salesperson_id: z.string().nullable().optional(),
  client_category: z.string().nullable().optional(),
  tipo_lavoro: z.string().nullable().optional(),
  importo_min: z.coerce.number().min(0).nullable().optional(),
  importo_max: z.coerce.number().min(0).nullable().optional(),
  margine_min_pct: z.coerce.number().min(0).max(100),
  sconto_max_pct: z.coerce.number().min(0).max(100),
  approva_oltre_pct: z.coerce.number().min(0).max(100).nullable().optional(),
  priority: z.coerce.number().int().min(1).max(1000),
  is_active: z.boolean(),
});
type FormValues = z.infer<typeof schema>;

const SCOPE_LABELS: Record<DiscountRuleScope, string> = {
  globale: "Globale",
  per_commerciale: "Per commerciale",
  per_cliente_cat: "Per categoria cliente",
};

export default function SettingsScontistica() {
  const companyId = useEffectiveCompanyId();
  const { data: rules = [], isLoading } = useDiscountRules();
  const upsert = useUpsertDiscountRule();
  const del = useDeleteDiscountRule();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DiscountRule | null>(null);

  const { data: salespeople = [] } = useQuery({
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
    defaultValues: {
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
    },
  });

  const openNew = () => {
    setEditing(null);
    form.reset({
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
    });
    setDialogOpen(true);
  };

  const openEdit = (rule: DiscountRule) => {
    setEditing(rule);
    form.reset({
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
    upsert.mutate(
      {
        id: editing?.id,
        ...values,
        salesperson_id: values.scope === "per_commerciale" ? values.salesperson_id ?? null : null,
        client_category: values.scope === "per_cliente_cat" ? values.client_category ?? null : null,
      },
      {
        onSuccess: () => {
          setDialogOpen(false);
          setEditing(null);
        },
      }
    );
  };

  const scope = form.watch("scope");

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Percent className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold leading-tight">Regole di scontistica</h1>
            <p className="text-sm text-muted-foreground">
              Limiti di sconto per i commerciali: {rules.length} regole configurate · {rules.filter((r) => r.is_active).length} attive.
            </p>
          </div>
        </div>
        <Button onClick={openNew} size="sm">
          <Plus className="h-4 w-4 mr-1.5" />
          Nuova regola
        </Button>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Come funziona</AlertTitle>
        <AlertDescription className="text-sm">
          Ogni regola che corrisponde al preventivo (commerciale + categoria cliente + importo + tipo di lavoro)
          contribuisce. Il sistema applica il limite <strong>più basso</strong> tra tutte le regole matchanti.
          Se il commerciale prova a superare <em>approva oltre %</em>, scatta il workflow di autorizzazione admin.
          Se invece prova a superare <em>sconto max</em>, il sistema non permette di applicarlo senza approvazione.
          Il <strong>margine minimo</strong> è un vincolo trasversale: se lo sconto lo farebbe scendere sotto,
          viene limitato automaticamente.
        </AlertDescription>
      </Alert>

      {/* ─── Simulatore sconto ─────────────────────────────────────── */}
      <DiscountSimulator rules={rules} salespeople={salespeople} />

      <Card>
        <CardHeader>
          <CardTitle>Regole attive</CardTitle>
          <CardDescription>{rules.length} regole configurate</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Caricamento…</div>
          ) : rules.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground border rounded-lg">
              <AlertCircle className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>Nessuna regola configurata.</p>
              <p className="text-sm">
                In assenza di regole il limite di sconto è <strong>10%</strong> per tutti.
              </p>
            </div>
          ) : (
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
                {rules.map((r) => (
                  <TableRow key={r.id} className={!r.is_active ? "opacity-50" : ""}>
                    <TableCell className="font-medium">
                      {r.name}
                      {r.scope === "per_commerciale" && r.salesperson_id && (
                        <div className="text-xs text-muted-foreground">
                          {salespeople.find((s) => s.id === r.salesperson_id)
                            ? `${salespeople.find((s) => s.id === r.salesperson_id)!.first_name} ${salespeople.find((s) => s.id === r.salesperson_id)!.last_name}`
                            : "—"}
                        </div>
                      )}
                      {r.scope === "per_cliente_cat" && r.client_category && (
                        <div className="text-xs text-muted-foreground">Tag: {r.client_category}</div>
                      )}
                      {r.tipo_lavoro && (
                        <div className="text-xs text-muted-foreground">Tipo lavoro: {r.tipo_lavoro}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{SCOPE_LABELS[r.scope]}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      €{(r.importo_min ?? 0).toLocaleString("it-IT")} –{" "}
                      {r.importo_max ? `€${r.importo_max.toLocaleString("it-IT")}` : "∞"}
                    </TableCell>
                    <TableCell className="text-right">{r.margine_min_pct}%</TableCell>
                    <TableCell className="text-right font-medium">{r.sconto_max_pct}%</TableCell>
                    <TableCell className="text-right">
                      {r.approva_oltre_pct != null ? `${r.approva_oltre_pct}%` : "—"}
                    </TableCell>
                    <TableCell className="text-right text-xs">{r.priority}</TableCell>
                    <TableCell>
                      <Switch
                        checked={r.is_active}
                        onCheckedChange={(checked) =>
                          upsert.mutate({ id: r.id, is_active: checked })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(r)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Eliminare la regola?</AlertDialogTitle>
                              <AlertDialogDescription>
                                La regola <strong>{r.name}</strong> sarà rimossa. I preventivi
                                esistenti non saranno toccati, ma i nuovi non la applicheranno più.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Annulla</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={() => del.mutate(r.id)}
                              >
                                Elimina
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Modifica regola" : "Nuova regola di sconto"}</DialogTitle>
            <DialogDescription>
              Definisci le condizioni e i limiti di sconto.
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
                      <FormLabel>Commerciale</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value ?? ""}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleziona commerciale" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {salespeople.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.first_name} {s.last_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
                      <FormLabel>Tag / categoria cliente</FormLabel>
                      <FormControl>
                        <Input placeholder="es. gold, silver, bronze" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormDescription className="text-xs">
                        Deve corrispondere a un tag presente sui contatti (marketing_contacts.tags).
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
                      <Input placeholder="es. serramenti, ristrutturazione" {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormDescription className="text-xs">
                      Se impostato, la regola si applica solo a preventivi con questo tipo di lavoro.
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
                        <Input type="number" step="0.01" min="0" {...field} value={field.value ?? 0} />
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
                      <FormLabel>Importo max (€, vuoto = ∞)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" min="0" {...field}
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value === "" ? null : Number(e.target.value))}
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
                  name="margine_min_pct"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Margine minimo post-sconto (%)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.1" min="0" max="100" {...field} />
                      </FormControl>
                      <FormDescription className="text-xs">
                        Il margine non può scendere sotto questa soglia.
                      </FormDescription>
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
                        <Input type="number" step="0.1" min="0" max="100" {...field} />
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
                        <Input type="number" step="0.1" min="0" max="100" {...field}
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value === "" ? null : Number(e.target.value))}
                        />
                      </FormControl>
                      <FormDescription className="text-xs">
                        Oltre questa soglia serve autorizzazione admin.
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
                        <Input type="number" step="1" min="1" max="1000" {...field} />
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
                        Se disattiva, la regola non viene considerata.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Annulla
                </Button>
                <Button type="submit" disabled={upsert.isPending}>
                  {editing ? "Salva" : "Crea regola"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
 * Simulatore di sconto — live preview di quale regola si applica
 *
 * Data una combinazione (commerciale × categoria × importo × tipo lavoro),
 * trova tutte le regole matchanti, mostra la "binding" (quella con lo
 * sconto max più basso) e il risultato del check.
 *
 * Replica in-browser la stessa logica che il backend applicherà al
 * preventivatore reale, così admin può testare le regole prima di farle
 * ai venditori.
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
    // Filtra regole matchanti
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
      // Fallback = 10% (come da UI empty-state)
      return {
        matchingRules: [] as DiscountRule[],
        bindingSconto: 10,
        bindingApprova: null as number | null,
        bindingMargine: 0,
        fallback: true,
      };
    }

    // Binding = regola più restrittiva
    const minSconto = Math.min(...matching.map((r) => r.sconto_max_pct));
    const minApprova = matching
      .filter((r) => r.approva_oltre_pct != null)
      .reduce<number | null>((acc, r) => (acc == null ? r.approva_oltre_pct! : Math.min(acc, r.approva_oltre_pct!)), null);
    const maxMargine = Math.max(...matching.map((r) => r.margine_min_pct));

    return {
      matchingRules: matching,
      bindingSconto: minSconto,
      bindingApprova: minApprova,
      bindingMargine: maxMargine,
      fallback: false,
    };
  }, [rules, simImporto, simSalesperson, simCategoria, simTipoLavoro]);

  // Verdetto finale
  const verdict = useMemo(() => {
    const s = simSconto;
    const cap = evaluation.bindingSconto;
    const approva = evaluation.bindingApprova;
    if (s > cap) return { kind: "blocked" as const, label: `Sconto oltre il limite (${cap}%) — richiede override admin` };
    if (approva != null && s > approva) return { kind: "approve" as const, label: `Sconto oltre ${approva}% — richiede approvazione` };
    return { kind: "ok" as const, label: `Applicabile liberamente dal commerciale` };
  }, [simSconto, evaluation.bindingSconto, evaluation.bindingApprova]);

  return (
    <Card className="border-l-4 border-l-primary">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Calculator className="h-4 w-4 text-primary" />
          Simulatore — verifica come si applicano le regole
        </CardTitle>
        <CardDescription>
          Inserisci uno scenario reale e scopri quale regola scatta, qual è il tetto di sconto, se serve approvazione.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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
            <label className="text-xs font-medium text-muted-foreground">Categoria cliente (tag)</label>
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
            <label className="text-xs font-medium text-muted-foreground">Importo preventivo €</label>
            <Input
              type="number"
              value={simImporto}
              onChange={(e) => setSimImporto(Number(e.target.value) || 0)}
              className="h-9 text-xs"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Sconto richiesto %</label>
            <Input
              type="number"
              value={simSconto}
              onChange={(e) => setSimSconto(Number(e.target.value) || 0)}
              className="h-9 text-xs"
            />
          </div>
        </div>

        {/* Risultato */}
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
            <p className="text-lg font-bold mt-0.5">{evaluation.bindingSconto}%</p>
            {evaluation.bindingApprova != null && (
              <p className="text-[10px] text-muted-foreground">
                Approvazione oltre {evaluation.bindingApprova}%
              </p>
            )}
          </div>
          <div className="rounded-lg border p-3 bg-muted/30">
            <p className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground">Margine minimo</p>
            <p className="text-lg font-bold mt-0.5">{evaluation.bindingMargine}%</p>
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
        </div>
      </CardContent>
    </Card>
  );
}
