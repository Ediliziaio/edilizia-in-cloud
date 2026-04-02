/**
 * WarehouseLottiTab — gestione lotti di magazzino
 * BLOCCO C — Step 1
 *
 * Funzionalità:
 *  - Lista lotti con numero, fornitore, articolo, quantità, data scadenza
 *  - Creazione nuovo lotto (dialog)
 *  - Eliminazione lotto (con conferma)
 *  - Badge scadenza (verde / giallo / rosso)
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Trash2, Package, Loader2 } from "lucide-react";
import { differenceInDays, parseISO, format } from "date-fns";

interface Lotto {
  id: string;
  numero_lotto: string;
  articolo: string;
  fornitore: string | null;
  quantita: number;
  unita_misura: string | null;
  data_scadenza: string | null;
  note: string | null;
  created_at: string;
}

const emptyForm = {
  numero_lotto: "",
  articolo: "",
  fornitore: "",
  quantita: "",
  unita_misura: "pz",
  data_scadenza: "",
  note: "",
};

function ScadenzaBadge({ data }: { data: string | null }) {
  if (!data) return <span className="text-muted-foreground text-xs">—</span>;
  const days = differenceInDays(parseISO(data), new Date());
  let variant: "default" | "secondary" | "destructive" | "outline" = "default";
  let label = format(parseISO(data), "dd/MM/yyyy");
  if (days < 0) {
    variant = "destructive";
    label = `Scaduto (${Math.abs(days)}gg fa)`;
  } else if (days <= 30) {
    variant = "outline";
    label = `${label} (${days}gg)`;
  }
  return <Badge variant={variant} className="text-[10px]">{label}</Badge>;
}

export default function WarehouseLottiTab() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Lotto | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [isSaving, setIsSaving] = useState(false);

  const { data: lotti = [], isLoading } = useQuery({
    queryKey: ["warehouse-lotti", companyId],
    queryFn: async (): Promise<Lotto[]> => {
      const { data, error } = await (supabase as any)
        .from("warehouse_lotti")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!companyId,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("warehouse_lotti")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lotto eliminato");
      queryClient.invalidateQueries({ queryKey: ["warehouse-lotti", companyId] });
      setDeleteTarget(null);
    },
    onError: () => {
      toast.error("Errore nell'eliminazione del lotto");
      setDeleteTarget(null);
    },
  });

  const handleCreate = async () => {
    if (!form.numero_lotto.trim()) { toast.error("Inserisci il numero lotto"); return; }
    if (!form.articolo.trim()) { toast.error("Inserisci il nome articolo"); return; }
    if (!form.quantita || isNaN(Number(form.quantita))) { toast.error("Inserisci una quantità valida"); return; }
    setIsSaving(true);
    try {
      const { error } = await (supabase as any)
        .from("warehouse_lotti")
        .insert({
          company_id: companyId,
          numero_lotto: form.numero_lotto.trim(),
          articolo: form.articolo.trim(),
          fornitore: form.fornitore.trim() || null,
          quantita: Number(form.quantita),
          unita_misura: form.unita_misura || "pz",
          data_scadenza: form.data_scadenza || null,
          note: form.note.trim() || null,
        });
      if (error) { toast.error(error.message); return; }
      toast.success("Lotto creato");
      setDialogOpen(false);
      setForm(emptyForm);
      queryClient.invalidateQueries({ queryKey: ["warehouse-lotti", companyId] });
    } finally {
      setIsSaving(false);
    }
  };

  const set = (field: keyof typeof emptyForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5 text-primary" />
          <h2 className="font-semibold text-lg">Lotti</h2>
          <Badge variant="outline">{lotti.length}</Badge>
        </div>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" aria-hidden="true" /> Nuovo lotto
        </Button>
      </div>

      {lotti.length === 0 ? (
        <Card>
          <CardContent className="py-14 flex flex-col items-center justify-center gap-3 text-center">
            <Package className="h-12 w-12 text-muted-foreground/30" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium">Nessun lotto registrato</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Tieni traccia di numeri lotto, scadenze e fornitori per ogni materiale.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" aria-hidden="true" /> Crea primo lotto
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>N° Lotto</TableHead>
                  <TableHead>Articolo</TableHead>
                  <TableHead>Fornitore</TableHead>
                  <TableHead className="text-right">Quantità</TableHead>
                  <TableHead>Scadenza</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lotti.map((lotto) => (
                  <TableRow key={lotto.id}>
                    <TableCell className="font-mono text-sm font-medium">{lotto.numero_lotto}</TableCell>
                    <TableCell>{lotto.articolo}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{lotto.fornitore || "—"}</TableCell>
                    <TableCell className="text-right font-medium">
                      {lotto.quantita} {lotto.unita_misura || "pz"}
                    </TableCell>
                    <TableCell>
                      <ScadenzaBadge data={lotto.data_scadenza} />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setDeleteTarget(lotto)}
                        aria-label={`Elimina lotto ${lotto.numero_lotto}`}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Nuovo Lotto</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Numero lotto <span className="text-destructive">*</span></Label>
                <Input value={form.numero_lotto} onChange={set("numero_lotto")} placeholder="LOT-2026-001" />
              </div>
              <div className="space-y-1">
                <Label>Articolo <span className="text-destructive">*</span></Label>
                <Input value={form.articolo} onChange={set("articolo")} placeholder="Cemento Portland" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Fornitore</Label>
              <Input value={form.fornitore} onChange={set("fornitore")} placeholder="Italcementi S.p.A." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Quantità <span className="text-destructive">*</span></Label>
                <Input type="number" min="0" step="0.01" value={form.quantita} onChange={set("quantita")} placeholder="0" />
              </div>
              <div className="space-y-1">
                <Label>U.M.</Label>
                <Input value={form.unita_misura} onChange={set("unita_misura")} placeholder="pz" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Data scadenza</Label>
              <Input type="date" value={form.data_scadenza} onChange={set("data_scadenza")} />
            </div>
            <div className="space-y-1">
              <Label>Note</Label>
              <Input value={form.note} onChange={set("note")} placeholder="Opzionali..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isSaving}>Annulla</Button>
            <Button onClick={handleCreate} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isSaving ? "Salvataggio..." : "Crea lotto"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina lotto</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare il lotto <strong>{deleteTarget?.numero_lotto}</strong>?
              Questa azione non è reversibile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Eliminazione..." : "Elimina"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
