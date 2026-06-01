import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, GitBranch, Loader2, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";

interface Variante {
  id: string;
  titolo: string;
  descrizione: string | null;
  importo: number;
  stato: "proposta" | "approvata" | "rifiutata";
  visibile_cliente: boolean;
  note: string | null;
  created_at: string;
}

interface VariantiCardProps {
  orderId: string;
  companyId: string;
  /** Se true, mostra solo le varianti visibili al cliente (read-only) */
  readOnly?: boolean;
}

const STATO_COLORS: Record<string, string> = {
  proposta: "bg-yellow-100 text-yellow-800",
  approvata: "bg-green-100 text-green-800",
  rifiutata: "bg-red-100 text-red-800",
};

const STATO_LABELS: Record<string, string> = {
  proposta: "Proposta",
  approvata: "Approvata",
  rifiutata: "Rifiutata",
};

const emptyForm = () => ({
  titolo: "",
  descrizione: "",
  importo: "",
  stato: "proposta" as const,
  visibile_cliente: true,
  note: "",
});

export function VariantiCard({ orderId, companyId, readOnly = false }: VariantiCardProps) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());

  const { data: varianti = [], isLoading } = useQuery({
    queryKey: ["varianti-cliente", orderId],
    queryFn: async () => {
      let q = supabase
        .from("varianti_cliente")
        .select("*")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false });
      if (readOnly) {
        q = q.eq("visibile_cliente", true);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as Variante[];
    },
    enabled: !!orderId,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!form.titolo.trim()) throw new Error("Titolo obbligatorio");
      if (!form.importo) throw new Error("Importo obbligatorio");
      const { error } = await supabase.from("varianti_cliente").insert({
        company_id: companyId,
        order_id: orderId,
        titolo: form.titolo.trim(),
        descrizione: form.descrizione.trim() || null,
        importo: parseFloat(form.importo) || 0,
        stato: form.stato,
        visibile_cliente: form.visibile_cliente,
        note: form.note.trim() || null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Variante aggiunta");
      queryClient.invalidateQueries({ queryKey: ["varianti-cliente", orderId] });
      setDialogOpen(false);
      setForm(emptyForm());
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateStatoMutation = useMutation({
    mutationFn: async ({ id, stato }: { id: string; stato: string }) => {
      const { error } = await supabase
        .from("varianti_cliente")
        .update({ stato })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["varianti-cliente", orderId] }),
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("varianti_cliente")
        .delete()
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Variante eliminata");
      queryClient.invalidateQueries({ queryKey: ["varianti-cliente", orderId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const totaleApprovato = varianti
    .filter((v) => v.stato === "approvata")
    .reduce((s, v) => s + (v.importo ?? 0), 0);

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-primary" aria-hidden="true" />
              Varianti di commessa
              <Badge variant="secondary">{varianti.length}</Badge>
            </CardTitle>
            <div className="flex items-center gap-2">
              {totaleApprovato > 0 && (
                <span className="text-sm text-green-600 font-semibold">
                  +{formatCurrency(totaleApprovato)} approvato
                </span>
              )}
              {!readOnly && (
                <Button size="sm" onClick={() => setDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-1" aria-hidden="true" />
                  Aggiungi variante
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : varianti.length === 0 ? (
            <div className="text-center py-6 space-y-2">
              <GitBranch className="h-8 w-8 text-muted-foreground/30 mx-auto" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">
                {readOnly ? "Nessuna variante comunicata." : "Nessuna variante aggiunta."}
              </p>
              {!readOnly && (
                <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Crea prima variante
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {varianti.map((v) => (
                <div
                  key={v.id}
                  className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/20 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{v.titolo}</span>
                      <Badge className={cn("text-xs border-0", STATO_COLORS[v.stato])}>
                        {STATO_LABELS[v.stato]}
                      </Badge>
                      {!readOnly && !v.visibile_cliente && (
                        <Badge variant="outline" className="text-xs text-muted-foreground">Solo interno</Badge>
                      )}
                    </div>
                    {v.descrizione && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{v.descrizione}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={cn("text-sm font-bold", v.stato === "approvata" ? "text-green-600" : v.stato === "rifiutata" ? "text-muted-foreground line-through" : "text-foreground")}>
                      {formatCurrency(v.importo)}
                    </span>
                    {!readOnly && (
                      <>
                        <Select
                          value={v.stato}
                          onValueChange={(val) => updateStatoMutation.mutate({ id: v.id, stato: val })}
                        >
                          <SelectTrigger className="h-7 text-xs w-28 border-none p-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(["proposta", "approvata", "rifiutata"] as const).map((s) => (
                              <SelectItem key={s} value={s} className="text-xs">{STATO_LABELS[s]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                          onClick={async () => {
                            if (
                              await confirm({
                                title: "Eliminare la variante?",
                                description:
                                  "La variante verrà rimossa definitivamente dalla commessa. L'operazione non può essere annullata.",
                                confirmLabel: "Elimina",
                                variant: "destructive",
                              })
                            ) {
                              deleteMutation.mutate(v.id);
                            }
                          }}
                          disabled={deleteMutation.isPending}
                          aria-label="Elimina variante"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      {!readOnly && (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Nuova variante di commessa</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <Label>Titolo *</Label>
                <Input
                  value={form.titolo}
                  onChange={(e) => setForm((p) => ({ ...p, titolo: e.target.value }))}
                  placeholder="Es. Aggiunta finestra extra"
                />
              </div>
              <div className="space-y-1">
                <Label>Descrizione</Label>
                <Textarea
                  value={form.descrizione}
                  onChange={(e) => setForm((p) => ({ ...p, descrizione: e.target.value }))}
                  placeholder="Dettagli della modifica richiesta..."
                  rows={2}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Importo (€) *</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.importo}
                    onChange={(e) => setForm((p) => ({ ...p, importo: e.target.value }))}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Stato</Label>
                  <Select
                    value={form.stato}
                    onValueChange={(v) => setForm((p) => ({ ...p, stato: v as typeof form.stato }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(["proposta", "approvata", "rifiutata"] as const).map((s) => (
                        <SelectItem key={s} value={s}>{STATO_LABELS[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="visibile_cliente"
                  checked={form.visibile_cliente}
                  onChange={(e) => setForm((p) => ({ ...p, visibile_cliente: e.target.checked }))}
                  className="h-4 w-4 rounded border-border"
                />
                <Label htmlFor="visibile_cliente" className="cursor-pointer text-sm font-normal">
                  Visibile al cliente
                </Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Annulla</Button>
              <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
                {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Aggiungi"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
