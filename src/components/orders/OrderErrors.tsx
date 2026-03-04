import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, AlertTriangle, Package, Wrench, Truck, Ruler, Hash, MessageSquare, HelpCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface OrderError {
  id: string;
  error_type: string;
  error_category: string;
  amount: number;
  description: string;
  error_date: string;
  created_at: string;
}

interface OrderErrorsProps {
  orderId: string;
}

const ERROR_TYPES = [
  { value: "merce", label: "Merce", icon: Package, description: "Errore ordinazione materiale" },
  { value: "manodopera", label: "Manodopera", icon: Wrench, description: "Errore lavorazione" },
];

const ERROR_CATEGORIES = [
  { value: "fornitore", label: "Errore fornitore", icon: Truck, color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300" },
  { value: "misura", label: "Errore misura", icon: Ruler, color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
  { value: "quantita", label: "Errore quantità", icon: Hash, color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300" },
  { value: "lavorazione", label: "Errore lavorazione", icon: Wrench, color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
  { value: "comunicazione", label: "Errore comunicazione", icon: MessageSquare, color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300" },
  { value: "altro", label: "Altro", icon: HelpCircle, color: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300" },
];

export function OrderErrors({ orderId }: OrderErrorsProps) {
  const { user, effectiveCompany } = useAuth();
  
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [errorType, setErrorType] = useState("merce");
  const [errorCategory, setErrorCategory] = useState("altro");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [errorDate, setErrorDate] = useState(new Date().toISOString().split("T")[0]);

  const { data: errors = [] } = useQuery({
    queryKey: ["order-errors", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_errors")
        .select("*")
        .eq("order_id", orderId)
        .order("error_date", { ascending: false });
      if (error) throw error;
      return data as OrderError[];
    },
    enabled: !!orderId,
  });

  const addErrorMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("order_errors").insert({
        order_id: orderId,
        company_id: effectiveCompany!.id,
        error_type: errorType,
        error_category: errorCategory,
        amount: parseFloat(amount) || 0,
        description: description.trim(),
        error_date: errorDate,
        created_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order-errors", orderId] });
      toast.success("Errore registrato", { description: "L'errore è stato aggiunto all'ordine." });
      resetForm();
    },
    onError: () => {
      toast.error("Errore", { description: "Impossibile salvare l'errore." });
    },
  });

  const deleteErrorMutation = useMutation({
    mutationFn: async (errorId: string) => {
      const { error } = await supabase.from("order_errors").delete().eq("id", errorId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order-errors", orderId] });
      toast.success("Errore rimosso", { description: "L'errore è stato eliminato." });
    },
    onError: () => {
      toast.error("Errore", { description: "Impossibile eliminare." });
    },
  });

  const resetForm = () => {
    setDialogOpen(false);
    setErrorType("merce");
    setErrorCategory("altro");
    setAmount("");
    setDescription("");
    setErrorDate(new Date().toISOString().split("T")[0]);
  };

  const handleSave = () => {
    if (!description.trim()) {
      toast.error("Errore", { description: "Inserisci il motivo dell'errore." });
      return;
    }
    if (!amount || parseFloat(amount) <= 0) {
      toast.error("Errore", { description: "Inserisci un importo valido." });
      return;
    }
    addErrorMutation.mutate();
  };

  const totalErrors = errors.reduce((sum, e) => sum + e.amount, 0);
  const totalMerce = errors.filter(e => e.error_type === "merce").reduce((sum, e) => sum + e.amount, 0);
  const totalManodopera = errors.filter(e => e.error_type === "manodopera").reduce((sum, e) => sum + e.amount, 0);

  // Category breakdown sorted by frequency
  const categoryBreakdown = ERROR_CATEGORIES
    .map(cat => {
      const catErrors = errors.filter(e => e.error_category === cat.value);
      return { ...cat, count: catErrors.length, total: catErrors.reduce((s, e) => s + e.amount, 0) };
    })
    .filter(c => c.count > 0)
    .sort((a, b) => b.count - a.count);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" />
          Errori / Perdite
        </CardTitle>
        <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Aggiungi
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {errors.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessun errore registrato</p>
        ) : (
          <>
            {errors.map((err) => {
              const typeConfig = ERROR_TYPES.find(t => t.value === err.error_type);
              const catConfig = ERROR_CATEGORIES.find(c => c.value === err.error_category);
              const Icon = typeConfig?.icon || Package;
              return (
                <div key={err.id} className="flex items-start justify-between gap-2 p-3 rounded-lg border bg-muted/30">
                  <div className="flex items-start gap-3 min-w-0">
                    <Icon className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">
                          {typeConfig?.label || err.error_type}
                        </span>
                        {catConfig && (
                          <Badge variant="outline" className={`text-xs ${catConfig.color}`}>
                            {catConfig.label}
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">{formatDate(err.error_date)}</span>
                      </div>
                      <p className="text-sm mt-1 break-words">{err.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-semibold text-destructive text-sm">
                      -{formatCurrency(err.amount)}
                    </span>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Eliminare questo errore?</AlertDialogTitle>
                          <AlertDialogDescription>L'errore verrà rimosso dall'ordine.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annulla</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteErrorMutation.mutate(err.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Elimina
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              );
            })}

            {/* Summary by type */}
            <div className="pt-2 border-t space-y-1">
              {totalMerce > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Errori Merce</span>
                  <span className="text-destructive">{formatCurrency(totalMerce)}</span>
                </div>
              )}
              {totalManodopera > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Errori Manodopera</span>
                  <span className="text-destructive">{formatCurrency(totalManodopera)}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold">
                <span>Totale Perdite</span>
                <span className="text-destructive">-{formatCurrency(totalErrors)}</span>
              </div>
            </div>

            {/* Summary by category */}
            {categoryBreakdown.length > 0 && (
              <div className="pt-2 border-t space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Frequenza per categoria</p>
                {categoryBreakdown.map(cat => (
                  <div key={cat.value} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={`text-xs ${cat.color}`}>
                        {cat.label}
                      </Badge>
                      <span className="text-muted-foreground">× {cat.count}</span>
                    </div>
                    <span className="text-destructive">{formatCurrency(cat.total)}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>

      {/* Add Error Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registra Errore</DialogTitle>
            <DialogDescription>Inserisci i dettagli dell'errore o perdita economica.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tipo Errore</Label>
              <Select value={errorType} onValueChange={setErrorType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ERROR_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>
                      <div className="flex items-center gap-2">
                        <t.icon className="h-4 w-4" />
                        <span>{t.label}</span>
                        <span className="text-xs text-muted-foreground">- {t.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Categoria Errore</Label>
              <Select value={errorCategory} onValueChange={setErrorCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ERROR_CATEGORIES.map(c => (
                    <SelectItem key={c.value} value={c.value}>
                      <div className="flex items-center gap-2">
                        <c.icon className="h-4 w-4" />
                        <span>{c.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Importo Perso (€) *</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">€</span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="pl-8"
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Motivo / Descrizione *</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descrivi cosa è andato storto..."
                rows={3}
                maxLength={500}
              />
            </div>
            <div className="space-y-2">
              <Label>Data Errore</Label>
              <Input
                type="date"
                value={errorDate}
                onChange={(e) => setErrorDate(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetForm}>Annulla</Button>
            <Button onClick={handleSave} disabled={addErrorMutation.isPending}>
              {addErrorMutation.isPending ? "Salvataggio..." : "Salva Errore"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
