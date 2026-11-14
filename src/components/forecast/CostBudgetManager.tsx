import { useId, useState, useMemo } from "react";
import { COLORI_GRAFICO, TESTO_ASSE, defsGrafico, idSvg } from "@/components/charts/grafici/comune";
import { usePreferisceMenoMovimento } from "@/hooks/usePreferisceMenoMovimento";
import { partiPerCategoria } from "@/lib/costi/partiPerCategoria";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, startOfMonth } from "date-fns";
import { it } from "date-fns/locale";
import { Plus, Trash2, Target } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/queryKeys";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { formatCurrency, formatCurrencyCompact } from "@/lib/formatters";
import { toast } from "sonner";
import { AvvisoSolaLettura } from "@/components/common/AvvisoSolaLettura";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Legend, ResponsiveContainer, Cell,
} from "recharts";

interface CostBudgetManagerProps {
  dynamicCategories: string[];
  allCostsSorted: any[];
  /** Come in CostsTable: chi ha «Costi» in sola lettura non aggiunge né elimina budget. */
  soloLettura?: boolean;
}

export function CostBudgetManager({ dynamicCategories, allCostsSorted, soloLettura = false }: CostBudgetManagerProps) {
  const idBudget = idSvg(useId());
  const fermoBudget = usePreferisceMenoMovimento();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const [selectedMonth, setSelectedMonth] = useState(() => format(startOfMonth(new Date()), "yyyy-MM"));
  const [newCategory, setNewCategory] = useState("");
  const [newAmount, setNewAmount] = useState("");

  // Months options: current ± 6
  const monthOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = -3; i <= 9; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      opts.push({ value: format(d, "yyyy-MM"), label: format(d, "MMMM yyyy", { locale: it }) });
    }
    return opts;
  }, []);

  const { data: budgets = [], isLoading } = useQuery({
    queryKey: queryKeys.costs.budgets(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cost_budgets")
        .select("*")
        .eq("company_id", companyId!)
        .order("month")
        .order("category");
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
  });

  const addBudgetMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("cost_budgets").upsert({
        company_id: companyId!,
        category: newCategory,
        month: `${selectedMonth}-01`,
        budget_amount: parseFloat(newAmount),
      }, { onConflict: "company_id,category,month" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.costs.budgets(companyId) });
      setNewCategory("");
      setNewAmount("");
      toast.success("Budget salvato");
    },
    onError: () => toast.error("Errore nel salvataggio"),
  });

  const deleteBudgetMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cost_budgets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.costs.budgets(companyId) });
      toast.success("Budget rimosso");
    },
  });

  // Budgets for selected month
  const monthBudgets = useMemo(() =>
    budgets.filter((b: any) => b.month?.startsWith(selectedMonth)),
  [budgets, selectedMonth]);

  // Actual costs for selected month by category
  const actualByCategory = useMemo(() => {
    const map = new Map<string, number>();
    // 14/11/2026: confronto sul testo «aaaa-mm». Con le date, «2026-11-30» era la
    // mezzanotte UTC e la fine del mese quella locale: l'ultimo giorno usciva dal conto,
    // e con lui tutti gli stipendi.
    allCostsSorted.forEach((c: any) => {
      if (!c.due_date) return;
      if (String(c.due_date).slice(0, 7) === selectedMonth) {
        // Una fattura divisa per categoria (conti per riga) si conta per parti.
        for (const p of partiPerCategoria(c, Number(c.amount))) {
          const cat = p.categoria || "Altro";
          map.set(cat, (map.get(cat) || 0) + p.importo);
        }
      }
    });
    return map;
  }, [allCostsSorted, selectedMonth]);

  // Chart data
  const chartData = useMemo(() => {
    const categories = new Set<string>();
    monthBudgets.forEach((b: any) => categories.add(b.category));
    actualByCategory.forEach((_, cat) => categories.add(cat));

    return Array.from(categories).map(cat => {
      const budget = monthBudgets.find((b: any) => b.category === cat)?.budget_amount || 0;
      const actual = actualByCategory.get(cat) || 0;
      return { category: cat, Budget: Number(budget), Effettivo: actual, overBudget: actual > Number(budget) && Number(budget) > 0 };
    }).sort((a, b) => b.Effettivo - a.Effettivo);
  }, [monthBudgets, actualByCategory]);

  // Budget dell'anno del mese scelto: per ogni coppia categoria+mese con un
  // budget, lo speso della stessa categoria nello stesso mese (si confronta
  // solo ciò che ha un budget, così un mese senza budget non sembra uno sforamento).
  const annoBudget = selectedMonth.slice(0, 4);
  const budgetAnno = useMemo(() => {
    const righe = budgets.filter((b: any) => String(b.month ?? "").startsWith(annoBudget));
    if (righe.length === 0) return null;
    const spesoPer = new Map<string, number>(); // chiave "yyyy-MM|categoria"
    allCostsSorted.forEach((c: any) => {
      if (!c.due_date || !String(c.due_date).startsWith(annoBudget)) return;
      const ym = String(c.due_date).slice(0, 7);
      for (const p of partiPerCategoria(c, Number(c.amount))) {
        const k = `${ym}|${p.categoria || "Altro"}`;
        spesoPer.set(k, (spesoPer.get(k) || 0) + p.importo);
      }
    });
    const perCategoria = new Map<string, { budget: number; speso: number }>();
    let budget = 0;
    let speso = 0;
    for (const b of righe as any[]) {
      const ym = String(b.month).slice(0, 7);
      const v = Number(b.budget_amount) || 0;
      const sp = spesoPer.get(`${ym}|${b.category}`) || 0;
      budget += v;
      speso += sp;
      const r = perCategoria.get(b.category) ?? { budget: 0, speso: 0 };
      r.budget += v;
      r.speso += sp;
      perCategoria.set(b.category, r);
    }
    const fuori = [...perCategoria.entries()].filter(([, r]) => r.speso > r.budget).map(([cat, r]) => ({ cat, oltre: r.speso - r.budget })).sort((a, b) => b.oltre - a.oltre);
    return { budget, speso, fuori, mesi: new Set(righe.map((b: any) => String(b.month).slice(0, 7))).size };
  }, [budgets, allCostsSorted, annoBudget]);

  const handleAdd = () => {
    if (!newCategory || !newAmount || parseFloat(newAmount) <= 0) {
      toast.error("Seleziona categoria e importo");
      return;
    }
    addBudgetMutation.mutate();
  };

  const pctBudget = budgetAnno && budgetAnno.budget > 0 ? (budgetAnno.speso / budgetAnno.budget) * 100 : 0;
  return (
    <div className="space-y-6">
      {budgetAnno && budgetAnno.budget > 0 && (
        <div className="grid gap-4 rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 p-4 text-slate-50 shadow-sm motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-500 dark:border-slate-700 md:grid-cols-[280px_minmax(0,1fr)]">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Budget {annoBudget}</p>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span className="text-3xl font-bold tabular-nums tracking-tight">{Math.round(pctBudget)}%</span>
              <span className="text-xs text-slate-400">speso, su {budgetAnno.mesi} {budgetAnno.mesi === 1 ? "mese" : "mesi"} con budget</span>
            </div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(pctBudget, 100))} aria-label={`Budget ${annoBudget}`}>
              <div className={`cg-barra-cresce h-full rounded-full bg-gradient-to-r ${pctBudget > 100 ? "from-rose-500 to-orange-400" : pctBudget > 85 ? "from-amber-400 to-yellow-300" : "from-emerald-400 to-teal-300"}`} style={{ width: `${Math.max(2, Math.min(pctBudget, 100))}%` }} />
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
              <div><dt className="text-slate-400">Budget</dt><dd className="font-semibold tabular-nums">{formatCurrencyCompact(budgetAnno.budget)}</dd></div>
              <div><dt className="text-slate-400">Speso</dt><dd className="font-semibold tabular-nums">{formatCurrencyCompact(budgetAnno.speso)}</dd></div>
              <div><dt className="text-slate-400">{budgetAnno.speso > budgetAnno.budget ? "Oltre" : "Resta"}</dt><dd className={`font-semibold tabular-nums ${budgetAnno.speso > budgetAnno.budget ? "text-rose-300" : "text-emerald-300"}`}>{formatCurrencyCompact(Math.abs(budgetAnno.budget - budgetAnno.speso))}</dd></div>
            </dl>
          </div>
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Categorie fuori budget</p>
            {budgetAnno.fuori.length === 0 ? (
              <p className="text-xs text-emerald-300">Nessuna: ogni categoria con un budget ci sta dentro.</p>
            ) : (
              <ul className="grid gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2">
                {budgetAnno.fuori.slice(0, 8).map((f) => (
                  <li key={f.cat} className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate text-slate-200">{f.cat}</span>
                    <span className="shrink-0 font-semibold tabular-nums text-rose-300">+{formatCurrency(f.oltre)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
      {/* Month selector + add form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" /> Budget per Categoria
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {soloLettura ? (
            <AvvisoSolaLettura>
              Sola lettura: qui serve il permesso «Costi», e chi ce l&apos;ha in «Sola lettura» non può scrivere.
            </AvvisoSolaLettura>
          ) : (
            <div className="flex flex-col sm:flex-row gap-3">
              <div>
                <Label className="text-xs">Mese</Label>
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {monthOptions.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <Label className="text-xs">Categoria</Label>
                <Select value={newCategory} onValueChange={setNewCategory}>
                  <SelectTrigger><SelectValue placeholder="Seleziona..." /></SelectTrigger>
                  <SelectContent>
                    {dynamicCategories.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-[140px]">
                <Label className="text-xs">Budget (€)</Label>
                <Input type="number" step="0.01" value={newAmount} onChange={e => setNewAmount(e.target.value)} placeholder="0.00" />
              </div>
              <div className="flex items-end">
                <Button size="sm" onClick={handleAdd} disabled={addBudgetMutation.isPending} className="gap-1">
                  <Plus className="h-4 w-4" /> Aggiungi
                </Button>
              </div>
            </div>
          )}

          {/* Budget table */}
          {monthBudgets.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Categoria</TableHead>
                  <TableHead className="text-right">Budget</TableHead>
                  <TableHead className="text-right">Effettivo</TableHead>
                  <TableHead className="text-right">Scostamento</TableHead>
                  {!soloLettura && <TableHead className="w-10" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthBudgets.map((b: any) => {
                  const actual = actualByCategory.get(b.category) || 0;
                  const delta = actual - Number(b.budget_amount);
                  const over = delta > 0;
                  return (
                    <TableRow key={b.id}>
                      <TableCell className="font-medium">{b.category}</TableCell>
                      <TableCell className="text-right">{formatCurrency(Number(b.budget_amount))}</TableCell>
                      <TableCell className="text-right">{formatCurrency(actual)}</TableCell>
                      <TableCell className={`text-right font-medium ${over ? "text-destructive" : "text-emerald-600"}`}>
                        {over ? "+" : ""}{formatCurrency(delta)}
                      </TableCell>
                      {!soloLettura && (
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            aria-label={`Elimina budget ${b.category}`}
                            onClick={async () => {
                              if (await confirm({
                                title: "Eliminare questo budget?",
                                description: `Budget "${b.category}" verrà rimosso. L'operazione non può essere annullata.`,
                                confirmLabel: "Elimina",
                                variant: "destructive",
                              })) {
                                deleteBudgetMutation.mutate(b.id);
                              }
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Budget vs Actual Chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Budget vs Effettivo — {monthOptions.find(o => o.value === selectedMonth)?.label}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap="24%">
                  {defsGrafico(idBudget, { budget: "hsl(var(--muted-foreground))", ok: COLORI_GRAFICO.verde, fuori: COLORI_GRAFICO.rosso })}
                  <CartesianGrid fill={`url(#${idBudget}-punti)`} strokeDasharray="4 6" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="category" tick={TESTO_ASSE} axisLine={false} tickLine={false} />
                  <YAxis tick={TESTO_ASSE} axisLine={false} tickLine={false} width={60} tickFormatter={formatCurrencyCompact} />
                  <RechartsTooltip
                    cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.5 }}
                    formatter={(value: number, name: string) => [formatCurrency(value), name]}
                    contentStyle={{ backgroundColor: "hsl(var(--popover))", borderColor: "hsl(var(--border))", borderRadius: "12px", fontSize: 12 }}
                  />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} formatter={(v: string) => <span className="text-muted-foreground">{v}</span>} />
                  <Bar dataKey="Budget" fill={`url(#${idBudget}-barra-budget)`} fillOpacity={0.55} radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={!fermoBudget} animationDuration={700} />
                  <Bar dataKey="Effettivo" fill={COLORI_GRAFICO.verde} radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={!fermoBudget} animationDuration={700} animationBegin={120}>
                    {chartData.map((entry, index) => (
                      /* Rosso se la categoria è fuori budget, verde se ci sta. */
                      <Cell key={index} fill={`url(#${idBudget}-barra-${entry.overBudget ? "fuori" : "ok"})`} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
