import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, startOfMonth } from "date-fns";
import { it } from "date-fns/locale";
import { Plus, Trash2, Target } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/queryKeys";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/formatters";
import { toast } from "sonner";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Legend, ResponsiveContainer, Cell,
} from "recharts";

interface CostBudgetManagerProps {
  dynamicCategories: string[];
  allCostsSorted: any[];
}

export function CostBudgetManager({ dynamicCategories, allCostsSorted }: CostBudgetManagerProps) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();

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
      queryClient.invalidateQueries({ queryKey: ["cost-budgets"] });
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
      queryClient.invalidateQueries({ queryKey: ["cost-budgets"] });
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
    const monthStart = new Date(`${selectedMonth}-01`);
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
    allCostsSorted.forEach((c: any) => {
      if (!c.due_date) return;
      const d = new Date(c.due_date);
      if (d >= monthStart && d <= monthEnd) {
        const cat = c.category || "Altro";
        map.set(cat, (map.get(cat) || 0) + Number(c.amount));
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

  const handleAdd = () => {
    if (!newCategory || !newAmount || parseFloat(newAmount) <= 0) {
      toast.error("Seleziona categoria e importo");
      return;
    }
    addBudgetMutation.mutate();
  };

  return (
    <div className="space-y-6">
      {/* Month selector + add form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" /> Budget per Categoria
          </CardTitle>
          <CardDescription>Imposta obiettivi di spesa mensili e confrontali con i costi effettivi</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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

          {/* Budget table */}
          {monthBudgets.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Categoria</TableHead>
                  <TableHead className="text-right">Budget</TableHead>
                  <TableHead className="text-right">Effettivo</TableHead>
                  <TableHead className="text-right">Scostamento</TableHead>
                  <TableHead className="w-10" />
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
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteBudgetMutation.mutate(b.id)}>
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      </TableCell>
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
                <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="category" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} />
                  <RechartsTooltip
                    formatter={(value: number, name: string) => [formatCurrency(value), name]}
                    contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px", fontSize: 12 }}
                  />
                  <Legend />
                  <Bar dataKey="Budget" fill="hsl(var(--muted-foreground))" radius={[3, 3, 0, 0]} barSize={16} opacity={0.4} />
                  <Bar dataKey="Effettivo" radius={[3, 3, 0, 0]} barSize={16}>
                    {chartData.map((entry, index) => (
                      <Cell key={index} fill={entry.overBudget ? "hsl(0 84% 60%)" : "hsl(142 76% 36%)"} />
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
