/**
 * Editor delle voci manuali del Cash Flow (cg_cash_flow_manuali): solo ciò che il gestionale non
 * vede già (versamenti dei soci, dividendi, finanziamenti, spese fuori dallo scadenzario).
 */
import { useMemo, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  useCashFlowManuali,
  useUpsertCashFlowManuale,
  useDeleteCashFlowManuale,
  type CashFlowManuale,
} from "@/hooks/controlloGestione/useCashFlow";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { Plus, Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

const MESI_LABELS = [
  "Gen", "Feb", "Mar", "Apr", "Mag", "Giu",
  "Lug", "Ago", "Set", "Ott", "Nov", "Dic",
];

/** Errore di lettura in parole semplici (mai «[object Object]»). */
function messaggioErrore(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return "Riprova tra poco.";
}

// ── Editor voci manuali ─────────────────────────────────────────────────────

const CATEGORIE_DEFAULT = [
  "F24", "IVA", "IRPEF", "IRES", "IRAP", "INPS", "INAIL",
  "TFR", "13a/14a", "Tredicesima", "Quattordicesima",
  "Anticipo cliente", "SAL", "Caparra", "Acconto",
  "Anticipo socio", "Immissione capitale", "Dividendo",
  "Mutuo", "Leasing", "Altro",
];

export function CashFlowManualiEditor({
  open, onOpenChange, anno,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  anno: number;
}) {
  const q = useCashFlowManuali(anno);
  const upsert = useUpsertCashFlowManuale();
  const del = useDeleteCashFlowManuale();
  const { toast } = useToast();
  const [form, setForm] = useState<{
    mese: number;
    tipo: "entrata" | "uscita";
    categoria: string;
    descrizione: string;
    importo: string;
    note: string;
  }>(() => ({
    mese: new Date().getMonth() + 1,
    tipo: "uscita",
    categoria: "Anticipo socio",
    descrizione: "",
    importo: "",
    note: "",
  }));

  const totals = useMemo(() => {
    const e = (q.data ?? []).filter((r) => r.tipo === "entrata")
      .reduce((s, r) => s + Number(r.importo), 0);
    const u = (q.data ?? []).filter((r) => r.tipo === "uscita")
      .reduce((s, r) => s + Number(r.importo), 0);
    return { e, u };
  }, [q.data]);

  const handleAdd = async () => {
    const importo = Number(form.importo);
    if (!form.descrizione.trim() || !Number.isFinite(importo) || importo <= 0) {
      toast({
        title: "Dati incompleti",
        description: "Descrizione e importo positivo sono obbligatori.",
        variant: "destructive",
      });
      return;
    }
    try {
      await upsert.mutateAsync({
        anno,
        mese: form.mese,
        tipo: form.tipo,
        categoria: form.categoria,
        descrizione: form.descrizione.trim(),
        importo,
        note: form.note.trim() || null,
      });
      setForm((f) => ({ ...f, descrizione: "", importo: "", note: "" }));
      toast({ title: "Voce aggiunta" });
    } catch (e) {
      toast({ title: "Voce non salvata", description: messaggioErrore(e), variant: "destructive" });
    }
  };

  const handleDelete = async (r: CashFlowManuale) => {
    try {
      await del.mutateAsync(r.id);
      toast({ title: "Voce eliminata" });
    } catch (e) {
      toast({ title: "Voce non eliminata", description: messaggioErrore(e), variant: "destructive" });
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Voci manuali Cash Flow · {anno}</SheetTitle>
          <p className="text-xs text-muted-foreground">
            Solo ciò che il gestionale non vede già: versamenti dei soci, dividendi,
            finanziamenti, spese fuori dallo scadenzario. Scadenze, rate delle commesse,
            stipendi, F24 registrati e IVA stimata sono già nel conto: inserirli qui
            li conterebbe due volte.
          </p>
        </SheetHeader>

        {/* Form di inserimento rapido */}
        <div className="mt-4 space-y-3 rounded-xl border bg-muted/20 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Aggiungi voce
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Mese</Label>
              <Select
                value={String(form.mese)}
                onValueChange={(v) => setForm((f) => ({ ...f, mese: Number(v) }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MESI_LABELS.map((m, i) => (
                    <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select
                value={form.tipo}
                onValueChange={(v) => setForm((f) => ({ ...f, tipo: v as "entrata" | "uscita" }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="entrata">Entrata</SelectItem>
                  <SelectItem value="uscita">Uscita</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Categoria</Label>
              <Select
                value={form.categoria}
                onValueChange={(v) => setForm((f) => ({ ...f, categoria: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIE_DEFAULT.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Importo (€)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.importo}
                onChange={(e) => setForm((f) => ({ ...f, importo: e.target.value }))}
                placeholder="es. 8500"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Descrizione *</Label>
            <Input
              value={form.descrizione}
              onChange={(e) => setForm((f) => ({ ...f, descrizione: e.target.value }))}
              placeholder="es. F24 IVA mensile maggio"
            />
          </div>
          <div>
            <Label className="text-xs">Note</Label>
            <Textarea
              rows={2}
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              placeholder="opzionale"
            />
          </div>
          <Button
            className="w-full"
            disabled={upsert.isPending}
            onClick={handleAdd}
          >
            <Plus className="mr-2 h-4 w-4" />
            Aggiungi voce
          </Button>
        </div>

        {/* Tabella esistenti */}
        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Voci esistenti ({q.data?.length ?? 0})
            </p>
            <p className="text-xs text-muted-foreground">
              <span className="text-emerald-700">+{formatCurrency(totals.e)}</span>
              {" · "}
              <span className="text-rose-700">-{formatCurrency(totals.u)}</span>
            </p>
          </div>
          {q.isLoading && <Skeleton className="h-20 w-full" />}
          {q.data && q.data.length === 0 && (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              Nessuna voce manuale per il {anno}.
            </p>
          )}
          {q.data && q.data.length > 0 && (
            <ul className="divide-y rounded-xl border">
              {q.data.map((r) => (
                <li key={r.id} className="flex items-start gap-3 p-3">
                  <Badge
                    variant={r.tipo === "entrata" ? "default" : "destructive"}
                    className="mt-0.5 shrink-0"
                  >
                    {MESI_LABELS[r.mese - 1]}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.descrizione}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.categoria}
                      {r.note ? ` · ${r.note}` : ""}
                    </p>
                  </div>
                  <p
                    className={cn(
                      "shrink-0 text-right tabular-nums text-sm font-semibold",
                      r.tipo === "entrata" ? "text-emerald-700" : "text-rose-700",
                    )}
                  >
                    {r.tipo === "entrata" ? "+" : "-"}
                    {formatCurrency(Number(r.importo))}
                  </p>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(r)}
                    aria-label="Elimina riga cash flow"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
