/**
 * Tab PFN & Debiti — Posizione Finanziaria Netta + CRUD mutui + Aging.
 *
 * Sezioni:
 *  A. KPI PFN + componenti
 *  B. Mutui MLT (cg_loans) editabili
 *  C. Aging crediti / debiti (scadenze open per fascia)
 */

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { ErrorBlock } from "@/components/controllo-gestione/ui/ErrorBlock";
import { EmptyState } from "@/components/controllo-gestione/ui/EmptyState";
import {
  usePFN, useLoans, useAging,
  useUpsertLoan, useDeleteLoan,
  type Loan, type AgingFasce,
} from "@/hooks/controlloGestione/usePFN";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import {
  Building2, Plus, Trash2, AlertTriangle, TrendingDown, TrendingUp,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Props {
  anno: number;
}

export function TabPFNDebiti({ anno }: Props) {
  return (
    <div className="space-y-6">
      <PFNSection anno={anno} />
      <LoansSection />
      <AgingSection />
    </div>
  );
}

// ── A. PFN Section ──────────────────────────────────────────────────────────

function PFNSection({ anno }: { anno: number }) {
  const q = usePFN(anno);

  if (q.isLoading) {
    return <Skeleton className="h-32 w-full rounded-2xl" />;
  }
  if (q.isError) return <ErrorBlock onRetry={() => q.refetch()} />;
  if (!q.data) return null;

  const { pfn, componenti } = q.data;
  const indebitamento = componenti.mutui_mlt + componenti.banche_negative;
  const liquidita = componenti.cassa + componenti.banche_positive;

  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Posizione Finanziaria Netta</CardTitle>
        <p className="text-xs text-muted-foreground">
          PFN = (Mutui MLT + Banche scoperte) − (Cassa + Banche positive)
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
          <div
            className={cn(
              "rounded-2xl p-4",
              pfn > 0 ? "bg-rose-50" : "bg-emerald-50",
            )}
          >
            <p className="text-xs text-muted-foreground">PFN totale</p>
            <p
              className={cn(
                "mt-1 flex items-center gap-2 text-2xl font-bold tabular-nums",
                pfn > 0 ? "text-rose-700" : "text-emerald-700",
              )}
            >
              {pfn > 0 ? <TrendingDown className="h-5 w-5" /> : <TrendingUp className="h-5 w-5" />}
              {formatCurrency(pfn)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {pfn > 0 ? "Indebitamento netto" : "Posizione di cassa netta"}
            </p>
          </div>
          <div className="rounded-2xl bg-amber-50 p-4">
            <p className="text-xs text-muted-foreground">Indebitamento</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-amber-700">
              {formatCurrency(indebitamento)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Mutui {formatCurrency(componenti.mutui_mlt)} + Scoperti{" "}
              {formatCurrency(componenti.banche_negative)}
            </p>
          </div>
          <div className="rounded-2xl bg-blue-50 p-4">
            <p className="text-xs text-muted-foreground">Liquidità</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-blue-700">
              {formatCurrency(liquidita)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Cassa {formatCurrency(componenti.cassa)} + Banche+{" "}
              {formatCurrency(componenti.banche_positive)}
            </p>
          </div>
          <div className="rounded-2xl bg-muted/40 p-4">
            <p className="text-xs text-muted-foreground">Indice copertura</p>
            <p className="mt-1 text-xl font-bold tabular-nums">
              {indebitamento > 0
                ? `${((liquidita / indebitamento) * 100).toFixed(1)}%`
                : "—"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Liquidità / Indebitamento
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── B. Loans (Mutui MLT) ────────────────────────────────────────────────────

const LOAN_EMPTY: Omit<Loan, "id" | "company_id" | "created_at" | "updated_at"> = {
  banca: "",
  descrizione: "",
  capitale_iniziale: 0,
  capitale_residuo: 0,
  tasso_pct: 0,
  rata_mensile: 0,
  durata_mesi: 0,
  rate_pagate: 0,
  data_inizio: new Date().toISOString().slice(0, 10),
  data_fine: new Date().toISOString().slice(0, 10),
  is_active: true,
  note: "",
};

function LoansSection() {
  const q = useLoans();
  const upsert = useUpsertLoan();
  const del = useDeleteLoan();
  const { toast } = useToast();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Loan | null>(null);

  const handleNew = () => {
    setEditing(null);
    setEditorOpen(true);
  };

  const handleEdit = (loan: Loan) => {
    setEditing(loan);
    setEditorOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await del.mutateAsync(id);
      toast({ title: "Mutuo eliminato" });
    } catch (e) {
      toast({ title: "Errore", description: String(e), variant: "destructive" });
    }
  };

  return (
    <Card className="rounded-2xl">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="text-base">Mutui & Finanziamenti MLT</CardTitle>
          <p className="text-xs text-muted-foreground">
            Quote residue e rate mensili — alimentano PFN e Cash Flow.
          </p>
        </div>
        <Button size="sm" onClick={handleNew}>
          <Plus className="mr-2 h-4 w-4" />
          Nuovo mutuo
        </Button>
      </CardHeader>
      <CardContent>
        {q.isLoading && <Skeleton className="h-24 w-full" />}
        {q.isError && <ErrorBlock onRetry={() => q.refetch()} />}
        {q.data && q.data.length === 0 && (
          <EmptyState
            title="Nessun mutuo registrato"
            description="Aggiungi i tuoi mutui MLT per popolare PFN, SP e Cash Flow."
          />
        )}
        {q.data && q.data.length > 0 && (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Banca / descrizione</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Cap. residuo</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Rata</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Tasso</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Rate residue</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Fine</th>
                  <th className="w-20 px-3 py-2 text-right text-xs font-medium text-muted-foreground">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {q.data.map((l) => {
                  const residue = Math.max(0, l.durata_mesi - l.rate_pagate);
                  return (
                    <tr key={l.id} className="border-t">
                      <td className="px-3 py-2">
                        <div className="flex items-start gap-2">
                          <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                          <div>
                            <p className="font-medium">{l.banca}</p>
                            {l.descrizione && (
                              <p className="text-xs text-muted-foreground">{l.descrizione}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">
                        {formatCurrency(l.capitale_residuo)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatCurrency(l.rata_mensile)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-xs text-muted-foreground">
                        {l.tasso_pct.toFixed(2)}%
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-xs">
                        {residue}/{l.durata_mesi}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-xs text-muted-foreground">
                        {formatDate(l.data_fine)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7"
                            onClick={() => handleEdit(l)}
                          >
                            Modifica
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => handleDelete(l.id)}
                            aria-label="Elimina finanziamento"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      <LoanEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        loan={editing}
        onSubmit={async (input) => {
          try {
            await upsert.mutateAsync(input);
            toast({ title: editing ? "Mutuo aggiornato" : "Mutuo creato" });
            setEditorOpen(false);
          } catch (e) {
            toast({ title: "Errore", description: String(e), variant: "destructive" });
          }
        }}
      />
    </Card>
  );
}

function LoanEditor({
  open, onOpenChange, loan, onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  loan: Loan | null;
  onSubmit: (input: Loan | typeof LOAN_EMPTY & { id?: string }) => Promise<void>;
}) {
  const [form, setForm] = useState(loan ?? LOAN_EMPTY);

  // Re-init quando cambia il loan in editing.
  // (uso useEffect-like via key prop in parent ma qui basta resettare manualmente)
  if (loan && form.banca !== loan.banca && form.id !== loan.id) {
    setForm(loan);
  }

  const handle = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{loan ? "Modifica mutuo" : "Nuovo mutuo"}</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-3">
          <div>
            <Label className="text-xs">Banca *</Label>
            <Input
              value={form.banca}
              onChange={(e) => handle("banca", e.target.value)}
              placeholder="es. Banca Intesa"
            />
          </div>
          <div>
            <Label className="text-xs">Descrizione</Label>
            <Input
              value={form.descrizione ?? ""}
              onChange={(e) => handle("descrizione", e.target.value)}
              placeholder="es. Mutuo capannone Via Verdi"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Capitale iniziale (€) *</Label>
              <Input
                type="number"
                value={form.capitale_iniziale}
                onChange={(e) => handle("capitale_iniziale", Number(e.target.value))}
              />
            </div>
            <div>
              <Label className="text-xs">Capitale residuo (€) *</Label>
              <Input
                type="number"
                value={form.capitale_residuo}
                onChange={(e) => handle("capitale_residuo", Number(e.target.value))}
              />
            </div>
            <div>
              <Label className="text-xs">Tasso annuo (%)</Label>
              <Input
                type="number"
                step="0.001"
                value={form.tasso_pct}
                onChange={(e) => handle("tasso_pct", Number(e.target.value))}
              />
            </div>
            <div>
              <Label className="text-xs">Rata mensile (€) *</Label>
              <Input
                type="number"
                value={form.rata_mensile}
                onChange={(e) => handle("rata_mensile", Number(e.target.value))}
              />
            </div>
            <div>
              <Label className="text-xs">Durata totale (mesi)</Label>
              <Input
                type="number"
                value={form.durata_mesi}
                onChange={(e) => handle("durata_mesi", Number(e.target.value))}
              />
            </div>
            <div>
              <Label className="text-xs">Rate già pagate</Label>
              <Input
                type="number"
                value={form.rate_pagate}
                onChange={(e) => handle("rate_pagate", Number(e.target.value))}
              />
            </div>
            <div>
              <Label className="text-xs">Data inizio</Label>
              <Input
                type="date"
                value={form.data_inizio}
                onChange={(e) => handle("data_inizio", e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Data fine</Label>
              <Input
                type="date"
                value={form.data_fine}
                onChange={(e) => handle("data_fine", e.target.value)}
              />
            </div>
          </div>
          <Button
            className="w-full"
            onClick={() => onSubmit(loan ? { ...loan, ...form } : form)}
          >
            {loan ? "Aggiorna" : "Crea mutuo"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── C. Aging Section ────────────────────────────────────────────────────────

const FASCE_LABELS: Record<keyof AgingFasce, string> = {
  a_scadere: "A scadere",
  sc_30: "Scaduto 1-30g",
  sc_60: "Scaduto 31-60g",
  sc_90: "Scaduto 61-90g",
  sc_oltre: "Scaduto >90g",
};

const FASCE_COLORS: Record<keyof AgingFasce, string> = {
  a_scadere: "bg-emerald-50 text-emerald-700",
  sc_30:     "bg-amber-50 text-amber-700",
  sc_60:     "bg-orange-50 text-orange-700",
  sc_90:     "bg-rose-50 text-rose-700",
  sc_oltre:  "bg-rose-100 text-rose-800",
};

function AgingSection() {
  const [direction, setDirection] = useState<"out" | "in">("out");
  const q = useAging(direction);

  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Aging scadenze</CardTitle>
            <p className="text-xs text-muted-foreground">
              {direction === "out"
                ? "Debiti aperti per fascia (a scadere / scaduto)"
                : "Crediti aperti per fascia (a scadere / scaduto)"}
            </p>
          </div>
          <ToggleGroup
            type="single"
            value={direction}
            onValueChange={(v) => v && setDirection(v as "out" | "in")}
          >
            <ToggleGroupItem value="out" variant="outline" size="sm">
              Debiti
            </ToggleGroupItem>
            <ToggleGroupItem value="in" variant="outline" size="sm">
              Crediti
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </CardHeader>
      <CardContent>
        {q.isLoading && <Skeleton className="h-24 w-full" />}
        {q.isError && <ErrorBlock onRetry={() => q.refetch()} />}
        {q.data && (
          <>
            {/* Top fasce */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {(Object.keys(FASCE_LABELS) as Array<keyof AgingFasce>).map((k) => (
                <div
                  key={k}
                  className={cn(
                    "rounded-xl p-3",
                    FASCE_COLORS[k],
                  )}
                >
                  <p className="text-[10px] uppercase">{FASCE_LABELS[k]}</p>
                  <p className="mt-0.5 text-base font-bold tabular-nums">
                    {formatCurrency(q.data.fasce[k])}
                  </p>
                </div>
              ))}
            </div>

            {q.data.totale_scaduto > 0 && (
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <p>
                  Hai{" "}
                  <strong className="tabular-nums">
                    {formatCurrency(q.data.totale_scaduto)}
                  </strong>{" "}
                  di scaduto su {q.data.n_scadute} posizioni aperte.
                </p>
              </div>
            )}

            {/* Lista righe */}
            {q.data.righe.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                Nessuna scadenza aperta.
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto rounded-xl border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Descrizione</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Controparte</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Scadenza</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Residuo</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Fascia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {q.data.righe.slice(0, 50).map((r) => (
                      <tr key={r.id} className="border-t">
                        <td className="px-3 py-2 text-sm">{r.descrizione}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {r.controparte ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-right text-xs tabular-nums">
                          {formatDate(r.due_date)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">
                          {formatCurrency(r.residuo)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Badge variant="outline" className={cn("text-[10px]", FASCE_COLORS[r.fascia])}>
                            {FASCE_LABELS[r.fascia]}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {q.data.righe.length > 50 && (
                  <p className="border-t bg-muted/20 p-2 text-center text-xs text-muted-foreground">
                    Visualizzate prime 50 di {q.data.righe.length} righe.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
