import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Wallet, Plus, ListOrdered, Pencil } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { useManualTreasury, type ManualAccount } from "@/hooks/useManualTreasury";
import { ManualTransactionsSheet } from "./ManualTransactionsSheet";

export function ManualTreasuryPanel({ autoOpenCreate = false, onAfterCreate }: { autoOpenCreate?: boolean; onAfterCreate?: () => void }) {
  const { accounts, isLoading, createAccount, updateAccount } = useManualTreasury();
  const [createOpen, setCreateOpen] = useState(autoOpenCreate);
  const [editing, setEditing] = useState<ManualAccount | null>(null);
  const [sheetAccount, setSheetAccount] = useState<ManualAccount | null>(null);
  const [form, setForm] = useState({ name: "", iban: "", opening: "" });

  function resetForm() { setForm({ name: "", iban: "", opening: "" }); }

  async function submitCreate() {
    if (!form.name.trim()) return;
    await createAccount.mutateAsync({ name: form.name.trim(), iban: form.iban, opening_balance: Number(String(form.opening).replace(",", ".")) || 0 });
    resetForm(); setCreateOpen(false); onAfterCreate?.();
  }
  async function submitEdit() {
    if (!editing) return;
    await updateAccount.mutateAsync({ id: editing.id, name: form.name.trim() || undefined, iban: form.iban, opening_balance: Number(String(form.opening).replace(",", ".")) || 0 });
    setEditing(null); resetForm();
  }

  return (
    <div className="space-y-3 max-sm:space-y-2">
      {/* Mobile: titolo corto e «+» a sola icona. */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-muted-foreground max-sm:hidden" />
          <h3 className="text-sm font-semibold max-sm:text-[13px]">Conti / casse manuali</h3>
          <span className="text-xs text-muted-foreground max-sm:hidden">(senza collegamento bancario)</span>
        </div>
        <Button size="sm" variant="outline" onClick={() => { resetForm(); setCreateOpen(true); }} aria-label="Aggiungi conto/cassa" className="tap-compact max-sm:h-8 max-sm:w-8 max-sm:px-0">
          <Plus className="h-4 w-4 mr-1 max-sm:mr-0" /> <span className="max-sm:hidden">Aggiungi conto/cassa</span>
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
      ) : accounts.length === 0 ? (
        <Card className="max-sm:border-0 max-sm:bg-transparent max-sm:shadow-none"><CardContent className="py-6 text-center text-sm text-muted-foreground max-sm:p-0 max-sm:text-left max-sm:text-xs">
          Nessun conto manuale.<span className="max-sm:hidden"> Creane uno per gestire saldo e movimenti senza collegare la banca — alimenta previsionali, tesoreria e controllo di gestione.</span>
        </CardContent></Card>
      ) : (
        <>
        {/* Mobile: un conto per riga, si tocca per i movimenti (via matita e bottone). */}
        <div className="divide-y divide-border overflow-hidden rounded-lg border bg-card sm:hidden">
          {accounts.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setSheetAccount(a)}
              className="tap-compact flex w-full items-center gap-2.5 px-3 py-2.5 text-left active:bg-muted"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold leading-tight">{a.display_name || a.account_name || "Conto"}</p>
                {a.iban && <p className="mt-0.5 truncate text-[11px] leading-tight text-muted-foreground">{a.iban}</p>}
              </div>
              <p className={`shrink-0 text-[13px] font-semibold tabular-nums ${Number(a.current_balance) >= 0 ? "" : "text-destructive"}`}>{formatCurrency(Number(a.current_balance ?? 0))}</p>
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 max-sm:hidden">
          {accounts.map((a) => (
            <Card key={a.id} className="overflow-hidden">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{a.display_name || a.account_name || "Conto"}</p>
                    {a.iban && <p className="text-xs text-muted-foreground truncate">{a.iban}</p>}
                  </div>
                  <button className="text-muted-foreground hover:text-foreground" aria-label="Modifica conto"
                    onClick={() => { setEditing(a); setForm({ name: a.display_name || a.account_name || "", iban: a.iban || "", opening: String(a.opening_balance ?? 0) }); }}>
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className={`text-xl font-bold ${Number(a.current_balance) >= 0 ? "text-slate-900" : "text-destructive"}`}>{formatCurrency(Number(a.current_balance ?? 0))}</p>
                <Button size="sm" variant="secondary" className="w-full" onClick={() => setSheetAccount(a)}>
                  <ListOrdered className="h-4 w-4 mr-1" /> Movimenti
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
        </>
      )}

      {/* Crea / Modifica */}
      <Dialog open={createOpen || !!editing} onOpenChange={(v) => { if (!v) { setCreateOpen(false); setEditing(null); resetForm(); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Modifica conto/cassa" : "Nuovo conto/cassa manuale"}</DialogTitle>
            <DialogDescription className="max-sm:sr-only">Il saldo si aggiorna da apertura + movimenti e alimenta tesoreria, previsionali e controllo di gestione.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Nome *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Es. Banca Intesa c/c oppure Cassa contanti" /></div>
            <div><Label className="text-xs">IBAN (opzionale)</Label><Input value={form.iban} onChange={(e) => setForm({ ...form, iban: e.target.value })} placeholder="IT.." /></div>
            <div><Label className="text-xs">Saldo di apertura €</Label><Input inputMode="decimal" value={form.opening} onChange={(e) => setForm({ ...form, opening: e.target.value })} placeholder="0,00" /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setCreateOpen(false); setEditing(null); resetForm(); }} className="max-sm:hidden">Annulla</Button>
            <Button onClick={editing ? submitEdit : submitCreate} disabled={createAccount.isPending || updateAccount.isPending || !form.name.trim()}>
              {editing ? "Salva" : "Crea conto"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ManualTransactionsSheet account={sheetAccount} open={!!sheetAccount} onOpenChange={(v) => !v && setSheetAccount(null)} />
    </div>
  );
}
