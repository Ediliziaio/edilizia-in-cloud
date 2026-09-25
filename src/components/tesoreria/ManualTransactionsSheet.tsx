import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2, Upload, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { useManualTreasury, type ManualAccount } from "@/hooks/useManualTreasury";
import { BankStatementImportDialog } from "./BankStatementImportDialog";
import { useConfirm } from "@/components/ui/confirm-dialog";

interface Row {
  id: string; booking_date: string; description: string | null; amount: number;
  category: string | null; counterparty_name: string | null; source: string | null;
}

export function ManualTransactionsSheet({ account, open, onOpenChange }: {
  account: ManualAccount | null; open: boolean; onOpenChange: (v: boolean) => void;
}) {
  const { upsertTx, deleteTx } = useManualTreasury();
  const confirm = useConfirm();
  const [importOpen, setImportOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), desc: "", amount: "", verso: "uscita" as "entrata" | "uscita" });

  const txQuery = useQuery({
    queryKey: ["manual-treasury", "tx", account?.id],
    enabled: !!account?.id && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_transactions")
        .select("id, booking_date, description, amount, category, counterparty_name, source")
        .eq("account_id", account!.id)
        .order("booking_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  async function handleAdd() {
    const raw = Number(String(form.amount).replace(",", "."));
    if (!isFinite(raw) || raw === 0) return;
    const signed = form.verso === "uscita" ? -Math.abs(raw) : Math.abs(raw);
    await upsertTx.mutateAsync({ account_id: account!.id, booking_date: form.date, description: form.desc, amount: signed, source: "manuale" });
    setForm((f) => ({ ...f, desc: "", amount: "" }));
    setAdding(false);
    txQuery.refetch();
  }

  const rows = txQuery.data ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{account?.display_name || account?.account_name || "Conto manuale"}</SheetTitle>
          <SheetDescription>
            Saldo attuale: <strong>{formatCurrency(Number(account?.current_balance ?? 0))}</strong>
            {" · "}apertura {formatCurrency(Number(account?.opening_balance ?? 0))}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 flex gap-2">
          <Button size="sm" onClick={() => setAdding((v) => !v)}><Plus className="h-4 w-4 mr-1" /> Movimento</Button>
          {/* Mobile no: niente importazioni da telefono. */}
          <Button size="sm" variant="outline" onClick={() => setImportOpen(true)} className="max-sm:hidden"><Upload className="h-4 w-4 mr-1" /> Importa estratto conto</Button>
        </div>

        {adding && (
          <div className="mt-3 rounded-lg border p-3 space-y-3 bg-muted/30">
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Data</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
              <div>
                <Label className="text-xs">Tipo</Label>
                <div className="flex gap-1">
                  <Button type="button" size="sm" variant={form.verso === "entrata" ? "default" : "outline"} className="flex-1" onClick={() => setForm({ ...form, verso: "entrata" })}>Entrata</Button>
                  <Button type="button" size="sm" variant={form.verso === "uscita" ? "default" : "outline"} className="flex-1" onClick={() => setForm({ ...form, verso: "uscita" })}>Uscita</Button>
                </div>
              </div>
            </div>
            <div><Label className="text-xs">Descrizione</Label><Input value={form.desc} onChange={(e) => setForm({ ...form, desc: e.target.value })} placeholder="Es. Pagamento fornitore X" /></div>
            <div><Label className="text-xs">Importo €</Label><Input inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0,00" /></div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Annulla</Button>
              <Button size="sm" onClick={handleAdd} disabled={upsertTx.isPending}>Salva</Button>
            </div>
          </div>
        )}

        <div className="mt-4 space-y-1">
          {txQuery.isLoading ? (
            Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center max-sm:py-3 max-sm:text-xs">Nessun movimento.<span className="max-sm:hidden"> Aggiungine uno o importa l'estratto conto.</span></p>
          ) : rows.map((r) => (
            <div key={r.id} className="flex items-center gap-3 rounded-lg border px-3 py-2 max-sm:gap-2">
              <div className={`max-sm:hidden ${r.amount >= 0 ? "text-green-700" : "text-destructive"}`}>
                {r.amount >= 0 ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate max-sm:text-[13px]">{r.description || "Movimento"}</p>
                <p className="text-xs text-muted-foreground max-sm:text-[11px]">
                  {format(new Date(r.booking_date), "dd/MM/yyyy", { locale: it })}
                  {r.source && r.source !== "manuale" ? ` · ${r.source === "import_ai" ? "AI" : "import"}` : ""}
                </p>
              </div>
              <p className={`font-mono text-sm max-sm:font-sans max-sm:text-[13px] max-sm:font-semibold ${r.amount >= 0 ? "text-green-700" : "text-destructive"}`}>
                {r.amount >= 0 ? "+" : "−"}{formatCurrency(Math.abs(r.amount))}
              </p>
              <button
                className="text-muted-foreground hover:text-destructive"
                aria-label="Elimina movimento"
                onClick={async () => {
                  if (await confirm({ title: "Eliminare il movimento?", description: "L'operazione non può essere annullata.", confirmLabel: "Elimina", variant: "destructive" })) {
                    await deleteTx.mutateAsync(r.id); txQuery.refetch();
                  }
                }}
              ><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>

        {account && (
          <BankStatementImportDialog
            account={account}
            open={importOpen}
            onOpenChange={setImportOpen}
            onImported={() => txQuery.refetch()}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
