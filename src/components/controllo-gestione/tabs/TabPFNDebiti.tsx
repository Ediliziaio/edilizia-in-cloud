/**
 * Tab PFN & Debiti — Posizione Finanziaria Netta + CRUD mutui + Aging.
 *
 * Sezioni:
 *  A. KPI PFN + componenti
 *  B. Mutui MLT (cg_loans) editabili
 *  C. Aging crediti / debiti (scadenze open per fascia)
 */

import { useState } from "react";
import { Link } from "react-router-dom";
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
  usePFN, useLoans, useAging, useContiPFN,
  useUpsertLoan, useDeleteLoan,
  type Loan, type AgingFasce,
} from "@/hooks/controlloGestione/usePFN";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { percIt } from "@/lib/controlloGestione/formatoCG";
import { erroreFinanziamento } from "@/lib/controlloGestione/finanziamenti";
import { cn } from "@/lib/utils";
import {
  Building2, Plus, Trash2, AlertTriangle, TrendingDown, TrendingUp,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/components/ui/confirm-dialog";

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
  const conti = useContiPFN();

  if (q.isLoading) {
    return <Skeleton className="h-32 w-full rounded-2xl" />;
  }
  if (q.isError) return <ErrorBlock onRetry={() => q.refetch()} />;
  if (!q.data) return null;

  const { pfn, componenti } = q.data;
  const indebitamento = componenti.mutui_mlt + componenti.banche_negative;
  const liquidita = componenti.cassa + componenti.banche_positive;
  const annoCorrente = new Date().getFullYear();
  // Il Previsionale parte dal disponibile dichiarato dalla banca (o dal saldo se manca).
  const disponibileTotale = conti.data?.reduce((s, c) => s + (c.disponibile ?? c.saldo), 0) ?? null;
  const saldoContabile = componenti.banche_positive - componenti.banche_negative;

  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Posizione finanziaria netta (PFN)</CardTitle>
        <p className="text-xs text-muted-foreground">
          Quanto devi alle banche meno i soldi che hai sui conti: (mutui e finanziamenti + conti in rosso) − (cassa + conti in attivo).
          {" "}Se è <strong>negativa</strong> hai più liquidità che debiti finanziari; se è <strong>positiva</strong> sei indebitato per quella cifra.
          {anno !== annoCorrente && ` È la posizione di oggi, non a fine ${anno}: i saldi storici dei conti non sono salvati.`}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div
            className={cn(
              "min-w-0 rounded-2xl p-4",
              pfn > 0 ? "bg-rose-50" : "bg-emerald-50",
            )}
          >
            <p className="text-xs text-muted-foreground">PFN oggi</p>
            <p
              className={cn(
                "mt-1 flex flex-wrap items-center gap-2 text-2xl font-bold tabular-nums",
                pfn > 0 ? "text-rose-700" : "text-emerald-700",
              )}
            >
              {pfn > 0 ? <TrendingDown className="h-5 w-5" /> : <TrendingUp className="h-5 w-5" />}
              {formatCurrency(pfn)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {pfn > 0
                ? "Indebitamento netto: i debiti finanziari superano la liquidità"
                : "Cassa netta: la liquidità copre tutti i debiti finanziari"}
            </p>
          </div>
          <div className="min-w-0 rounded-2xl bg-amber-50 p-4">
            <p className="text-xs text-muted-foreground">Debiti finanziari</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-amber-700">
              {formatCurrency(indebitamento)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Mutui {formatCurrency(componenti.mutui_mlt)} + conti in rosso{" "}
              {formatCurrency(componenti.banche_negative)}
            </p>
          </div>
          <div className="min-w-0 rounded-2xl bg-blue-50 p-4">
            <p className="text-xs text-muted-foreground">Liquidità</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-blue-700">
              {formatCurrency(liquidita)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Conti in attivo {formatCurrency(componenti.banche_positive)}
              {componenti.cassa !== 0 && ` + cassa ${formatCurrency(componenti.cassa)}`}
            </p>
          </div>
          <div className="min-w-0 rounded-2xl bg-muted/40 p-4">
            <p className="text-xs text-muted-foreground">Copertura dei debiti</p>
            <p className="mt-1 text-xl font-bold tabular-nums">
              {indebitamento > 0 ? percIt((liquidita / indebitamento) * 100) : "—"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Liquidità ÷ debiti finanziari: sopra il 100% potresti estinguerli tutti oggi.
            </p>
          </div>
        </div>

        {conti.data && conti.data.length > 0 && (
          <details className="rounded-xl border p-3 text-sm">
            <summary className="cursor-pointer font-medium">Da quali conti viene (saldo contabile e disponibile)</summary>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Conti attivi con saldo contabile e disponibile</caption>
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="py-1.5 pr-3 text-left font-medium">Conto</th>
                    <th scope="col" className="py-1.5 pr-3 text-right font-medium">Saldo contabile (PFN)</th>
                    <th scope="col" className="py-1.5 text-right font-medium">Disponibile (Previsionale)</th>
                  </tr>
                </thead>
                <tbody>
                  {conti.data.map((c) => (
                    <tr key={c.id} className="border-t">
                      <td className="py-1.5 pr-3">{c.nome}</td>
                      <td className={cn("whitespace-nowrap py-1.5 pr-3 text-right tabular-nums", c.saldo < 0 && "font-medium text-rose-700")}>{formatCurrency(c.saldo)}</td>
                      <td className="whitespace-nowrap py-1.5 text-right tabular-nums text-muted-foreground">
                        {c.disponibile == null ? <span title="La banca non dichiara un disponibile: si usa il saldo">{formatCurrency(c.saldo)}*</span> : formatCurrency(c.disponibile)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t font-semibold">
                    <td className="py-1.5 pr-3">Totale</td>
                    <td className="whitespace-nowrap py-1.5 pr-3 text-right tabular-nums">{formatCurrency(saldoContabile)}</td>
                    <td className="whitespace-nowrap py-1.5 text-right tabular-nums">{disponibileTotale == null ? "—" : formatCurrency(disponibileTotale)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              La PFN usa il <strong>saldo contabile</strong> (quello del bilancio); il Previsionale parte dal{" "}
              <strong>disponibile</strong>, cioè i soldi che puoi spendere oggi. Se i due totali sono molto diversi,
              aggiorna i saldi in <Link to="/azienda/tesoreria" className="font-medium text-primary underline">Tesoreria</Link>.
              {conti.data.some((c) => c.disponibile == null) && " * conto senza disponibile: vale il saldo."}
            </p>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

// ── B. Loans (Mutui MLT) ────────────────────────────────────────────────────

type LoanForm = Omit<Loan, "id" | "company_id" | "created_at" | "updated_at">;

/** Giorno di calendario locale (toISOString è in UTC: dopo mezzanotte dava il giorno prima). */
const oggiLocale = () => new Date().toLocaleDateString("en-CA");

const loanVuoto = (): LoanForm => ({
  banca: "",
  descrizione: "",
  capitale_iniziale: 0,
  capitale_residuo: 0,
  tasso_pct: 0,
  rata_mensile: 0,
  durata_mesi: 0,
  rate_pagate: 0,
  data_inizio: oggiLocale(),
  data_fine: oggiLocale(),
  is_active: true,
  note: "",
});

/** Messaggio dell'errore in parole semplici (mai «[object Object]»). */
function messaggioErrore(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return "Riprova tra poco.";
}

function LoansSection() {
  const q = useLoans();
  const upsert = useUpsertLoan();
  const del = useDeleteLoan();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Loan | null>(null);
  // Ogni apertura rimonta il modulo: prima «Nuovo mutuo» dopo una modifica
  // ripartiva dai dati (e dall'id) del mutuo appena aperto e lo sovrascriveva.
  const [aperture, setAperture] = useState(0);

  const handleNew = () => {
    setEditing(null);
    setAperture((n) => n + 1);
    setEditorOpen(true);
  };

  const handleEdit = (loan: Loan) => {
    setEditing(loan);
    setAperture((n) => n + 1);
    setEditorOpen(true);
  };

  const handleDelete = async (loan: Loan) => {
    const ok = await confirm({
      title: `Eliminare il finanziamento «${loan.banca}»?`,
      description: "Esce da PFN, Stato patrimoniale e indici. L'operazione non si annulla.",
      confirmLabel: "Elimina",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await del.mutateAsync(loan.id);
      toast({ title: "Finanziamento eliminato" });
    } catch (e) {
      toast({ title: "Finanziamento non eliminato", description: messaggioErrore(e), variant: "destructive" });
    }
  };

  return (
    <Card className="rounded-2xl">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="text-base">Mutui & Finanziamenti MLT</CardTitle>
          <p className="text-xs text-muted-foreground">
            Capitale ancora da restituire e rata: entrano nella PFN, nello Stato patrimoniale e nella
            copertura delle rate (DSCR). Le rate entrano nella previsione di cassa solo se sono nello scadenzario.
          </p>
        </div>
        <Button size="sm" onClick={handleNew} className="shrink-0">
          <Plus className="mr-2 h-4 w-4" />
          Nuovo finanziamento
        </Button>
      </CardHeader>
      <CardContent>
        {q.isLoading && <Skeleton className="h-24 w-full" />}
        {q.isError && <ErrorBlock onRetry={() => q.refetch()} />}
        {q.data && q.data.length === 0 && (
          <EmptyState
            title="Nessun finanziamento registrato"
            description="Aggiungi mutui e finanziamenti a medio-lungo termine: senza, la PFN considera solo i conti correnti."
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
                        {percIt(Number(l.tasso_pct), 2)}
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
                            onClick={() => handleDelete(l)}
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
        key={`${editing?.id ?? "nuovo"}-${aperture}`}
        open={editorOpen}
        onOpenChange={setEditorOpen}
        loan={editing}
        saving={upsert.isPending}
        onSubmit={async (input) => {
          const problema = erroreFinanziamento(input);
          if (problema) {
            toast({ title: "Controlla i dati", description: problema, variant: "destructive" });
            return;
          }
          try {
            await upsert.mutateAsync(editing ? { ...input, id: editing.id } : input);
            toast({ title: editing ? "Finanziamento aggiornato" : "Finanziamento aggiunto" });
            setEditorOpen(false);
          } catch (e) {
            toast({ title: "Finanziamento non salvato", description: messaggioErrore(e), variant: "destructive" });
          }
        }}
      />
    </Card>
  );
}

function LoanEditor({
  open, onOpenChange, loan, onSubmit, saving,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  loan: Loan | null;
  saving: boolean;
  onSubmit: (input: LoanForm) => Promise<void>;
}) {
  // Il componente si rimonta a ogni apertura (key nel genitore): lo stato parte sempre giusto.
  const [form, setForm] = useState<LoanForm>(() => {
    if (!loan) return loanVuoto();
    const { id: _id, company_id: _c, created_at: _cr, updated_at: _u, ...campi } = loan;
    return campi;
  });

  const handle = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{loan ? "Modifica finanziamento" : "Nuovo finanziamento"}</SheetTitle>
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
            disabled={saving}
            onClick={() => onSubmit(form)}
          >
            {loan ? "Salva le modifiche" : "Aggiungi finanziamento"}
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">Scadenze aperte per anzianità</CardTitle>
            <p className="text-xs text-muted-foreground">
              {direction === "out"
                ? "Quanto devi ai fornitori secondo lo scadenzario, diviso per quanto è in ritardo."
                : "Quanto ti devono i clienti secondo lo scadenzario, diviso per quanto è in ritardo."}
              {q.data && ` Totale aperto ${formatCurrency(q.data.totale)} su ${q.data.n_aperte} posizioni.`}
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
                        <td className="px-3 py-2 text-sm">
                          <Link to="/azienda/scadenzario" className="hover:text-primary hover:underline">
                            {r.descrizione || "Scadenza senza descrizione"}
                          </Link>
                        </td>
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
                <p className="border-t bg-muted/20 p-2 text-center text-xs text-muted-foreground">
                  {q.data.righe.length > 50 ? `Le prime 50 di ${q.data.righe.length}, dalla più vecchia. ` : ""}
                  <Link to="/azienda/scadenzario" className="font-medium text-primary underline">Apri lo scadenzario</Link> per segnarle pagate o cambiarne la data.
                </p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
