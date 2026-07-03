/**
 * ProductPackagesDialog — gestione dei PACCHETTI/livelli di un servizio del
 * catalogo AEDIX (public.aedix_product_packages). Es: "Vendita Edile" → pacchetto
 * da 500€ e pacchetto da 5000€; "Edilizia in Cloud" → i vari piani.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Plus, Pencil, Trash2, Loader2, Package, Layers } from "lucide-react";

export interface ProductPackage {
  id: string;
  product_line_id: string;
  nome: string;
  descrizione: string | null;
  prezzo: number;
  ricorrenza: string;
  ltv_target: number;
  attivo: boolean;
  ordine: number;
}

const RICORRENZE = [
  { value: "mensile", label: "Mensile" },
  { value: "annuale", label: "Annuale" },
  { value: "una_tantum", label: "Una-tantum" },
];
const eur = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Math.round(n || 0));

type Draft = Partial<ProductPackage>;

export function ProductPackagesDialog({
  line, open, onOpenChange,
}: {
  line: { id: string; nome: string } | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Draft | null>(null); // null = form nascosto
  const [deletePkg, setDeletePkg] = useState<ProductPackage | null>(null);

  const { data: pkgs = [], isLoading } = useQuery({
    enabled: !!line?.id && open,
    queryKey: ["admin", "product-packages", line?.id],
    queryFn: async (): Promise<ProductPackage[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from("aedix_product_packages") as any)
        .select("*").eq("product_line_id", line!.id).order("ordine", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ProductPackage[];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin", "product-packages", line?.id] });
    qc.invalidateQueries({ queryKey: ["admin", "product-packages-counts"] });
  };

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const payload = {
        product_line_id: line!.id, nome: d.nome, descrizione: d.descrizione ?? null,
        prezzo: Number(d.prezzo) || 0, ricorrenza: d.ricorrenza || "mensile",
        ltv_target: Number(d.ltv_target) || 0, attivo: d.attivo ?? true,
        ordine: Number(d.ordine) || 0, updated_at: new Date().toISOString(),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase.from("aedix_product_packages") as any;
      const { error } = d.id ? await sb.update(payload).eq("id", d.id) : await sb.insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("Pacchetto salvato"); setForm(null); },
    onError: (e: unknown) => toast.error("Errore", { description: e instanceof Error ? e.message : String(e) }),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("aedix_product_packages") as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("Pacchetto eliminato"); setDeletePkg(null); },
    onError: (e: unknown) => toast.error("Errore", { description: e instanceof Error ? e.message : String(e) }),
  });

  const openNew = () => setForm({ ricorrenza: "mensile", attivo: true, prezzo: 0, ltv_target: 0, ordine: pkgs.reduce((m, p) => Math.max(m, p.ordine ?? 0), -1) + 1 });
  const canSave = !!form?.nome?.trim();

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setForm(null); onOpenChange(v); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Layers className="h-4 w-4" /> Pacchetti · {line?.nome}</DialogTitle>
          <DialogDescription>I livelli/prezzi di questo servizio (es. base, premium…).</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {isLoading ? (
            <div className="flex justify-center py-8 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : pkgs.length === 0 && !form ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-8 text-center">
              <Package className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Nessun pacchetto. Aggiungi il primo livello.</p>
            </div>
          ) : (
            pkgs.map((p) => (
              <div key={p.id} className={`flex items-center gap-3 rounded-lg border p-2.5 ${p.attivo ? "" : "opacity-55"}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 font-medium leading-tight">{p.nome}</div>
                  <div className="text-xs text-muted-foreground">
                    {eur(p.prezzo)} · {RICORRENZE.find((r) => r.value === p.ricorrenza)?.label ?? p.ricorrenza}
                    {p.ltv_target > 0 && <> · LTV {eur(p.ltv_target)}</>}
                  </div>
                </div>
                <Switch checked={p.attivo} onCheckedChange={(v) => save.mutate({ ...p, attivo: v })} aria-label="Attivo" />
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setForm({ ...p })} aria-label="Modifica"><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeletePkg(p)} aria-label="Elimina"><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))
          )}
        </div>

        {form ? (
          <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
            <div className="grid gap-1.5">
              <Label>Nome pacchetto *</Label>
              <Input value={form.nome ?? ""} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} placeholder="Es. Base / Premium / Da 5.000€" autoFocus />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1.5">
                <Label>Prezzo €</Label>
                <Input type="number" value={form.prezzo ?? 0} onChange={(e) => setForm((f) => ({ ...f, prezzo: Number(e.target.value) }))} />
              </div>
              <div className="grid gap-1.5">
                <Label>LTV €</Label>
                <Input type="number" value={form.ltv_target ?? 0} onChange={(e) => setForm((f) => ({ ...f, ltv_target: Number(e.target.value) }))} />
              </div>
              <div className="grid gap-1.5">
                <Label>Ricorrenza</Label>
                <Select value={form.ricorrenza ?? "mensile"} onValueChange={(v) => setForm((f) => ({ ...f, ricorrenza: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{RICORRENZE.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Descrizione</Label>
              <Textarea rows={2} value={form.descrizione ?? ""} onChange={(e) => setForm((f) => ({ ...f, descrizione: e.target.value }))} placeholder="Cosa include (opzionale)" />
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm"><Switch checked={form.attivo ?? true} onCheckedChange={(v) => setForm((f) => ({ ...f, attivo: v }))} /> Attivo</label>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setForm(null)}>Annulla</Button>
                <Button size="sm" disabled={!canSave || save.isPending} onClick={() => save.mutate(form)} className="gap-2">
                  {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}{form.id ? "Salva" : "Aggiungi"}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <Button variant="outline" onClick={openNew} className="w-full gap-2"><Plus className="h-4 w-4" /> Aggiungi pacchetto</Button>
        )}

        <AlertDialog open={!!deletePkg} onOpenChange={(v) => { if (!v) setDeletePkg(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminare "{deletePkg?.nome}"?</AlertDialogTitle>
              <AlertDialogDescription>Il pacchetto verrà eliminato definitivamente.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annulla</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { if (deletePkg) del.mutate(deletePkg.id); }}>{del.isPending ? "Eliminazione…" : "Elimina"}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
