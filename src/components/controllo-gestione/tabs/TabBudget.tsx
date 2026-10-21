/**
 * Tab Budget — budget contro consuntivo e previsione di fine anno.
 *
 * Il consuntivo è lo STESSO conto economico della scheda CE, sui mesi chiusi
 * (al 22 ottobre: gennaio-settembre). La previsione di fine anno è il
 * consuntivo ÷ mesi chiusi × 12. I totali (Valore della produzione, EBITDA,
 * utile…) hanno anche il budget, calcolato dalle voci.
 */

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { ErrorBlock } from "@/components/controllo-gestione/ui/ErrorBlock";
import { useBudgetConfronto, useUpsertBudget } from "@/hooks/controlloGestione/useBudget";
import { etichettaMesiChiusi, type RigaBudget } from "@/lib/controlloGestione/budgetCE";
import { formatEuroRiquadro, formatPct, leggiImporto, messaggioErrore } from "@/lib/controlloGestione/formatCG";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { Info, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ExportButton } from "@/components/controllo-gestione/ui/ExportButton";
import { exportXlsx } from "@/lib/controlloGestione/exportXlsx";

interface Props {
  anno: number;
}

const SEM_BG = {
  verde:  "bg-emerald-50 text-emerald-700",
  giallo: "bg-amber-50 text-amber-700",
  rosso:  "bg-rose-50 text-rose-700",
  grigio: "bg-muted/40 text-muted-foreground",
} as const;

/** Colore dello scostamento in euro: verde se migliora, rosso se peggiora. */
function coloreScostamento(r: RigaBudget): string {
  if (r.scostamento === 0) return "text-muted-foreground";
  const migliora = r.piuEMeglio ? r.scostamento > 0 : r.scostamento < 0;
  return migliora ? "text-emerald-700" : "text-rose-700";
}

export function TabBudget({ anno }: Props) {
  const q = useBudgetConfronto(anno);
  const [editor, setEditor] = useState<RigaBudget | null>(null);

  if (q.isLoading) return <Skeleton className="h-96 w-full rounded-2xl" />;
  if (q.isError)   return <ErrorBlock onRetry={() => q.refetch()} />;
  if (!q.data) return null;

  const { righe, mesiChiusi, haBudget, ricavi, costi, utile } = q.data;
  const periodo = etichettaMesiChiusi(mesiChiusi);
  const annoChiuso = mesiChiusi === 12;
  // Budget ricavi sotto un terzo della previsione: quasi certamente un budget
  // vecchio o di prova. Lo diciamo invece di mostrare +500% in verde.
  const budgetSospetto = haBudget && ricavi.budget > 0 && ricavi.previsione > ricavi.budget * 3;

  return (
    <div className="space-y-4">
      {!haBudget ? (
        <div className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Inserisci il budget {anno}</p>
            <p className="mt-0.5 text-blue-900/80">
              Non c'è ancora un budget per il {anno}. Premi la matita accanto a ogni voce e scrivi
              quanto prevedi di incassare o spendere nell'anno: il confronto con il consuntivo
              compare da solo.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <RiquadroConfronto titolo="Ricavi" budget={ricavi.budget} previsione={ricavi.previsione} piuEMeglio annoChiuso={annoChiuso} />
          <RiquadroConfronto titolo="Costi" budget={costi.budget} previsione={costi.previsione} piuEMeglio={false} annoChiuso={annoChiuso} />
          <RiquadroConfronto titolo="Utile netto" budget={utile.budget} previsione={utile.previsione} piuEMeglio annoChiuso={annoChiuso} />
        </div>
      )}
      {budgetSospetto && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Il budget dei ricavi ({formatCurrency(ricavi.budget)}) è meno di un terzo della
          previsione di fine anno ({formatCurrency(ricavi.previsione)}): è ancora quello
          giusto? Se è un budget vecchio, aggiornalo.
        </div>
      )}

      <Card className="rounded-2xl">
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
          <div>
            <CardTitle className="text-base">Budget e consuntivo · {anno}</CardTitle>
            <p className="text-xs text-muted-foreground">
              {mesiChiusi === 0
                ? "Nessun mese ancora chiuso: il consuntivo e la previsione compaiono dalla fine del primo mese."
                : annoChiuso
                  ? "Anno chiuso: la previsione coincide con il consuntivo dell'anno, dallo stesso conto economico della scheda CE."
                  : `Consuntivo dei mesi chiusi (${periodo}), dallo stesso conto economico della scheda CE. Previsione fine anno = consuntivo ÷ ${mesiChiusi} mesi × 12. Semaforo: verde fino al 5% di scostamento sfavorevole, giallo fino al 15%, rosso oltre.`}
            </p>
          </div>
          <ExportButton
            onExport={async () => {
              await exportXlsx({
                filename: `budget_consuntivo_${anno}.xlsx`,
                brand: { title: "Budget e consuntivo", subtitle: `Esercizio ${anno} · consuntivo ${periodo}` },
                sheets: [{
                  name: `Budget ${anno}`,
                  columns: [
                    { header: "Cod", key: "codice", width: 6 },
                    { header: "Voce", key: "label", width: 30 },
                    { header: "Budget", key: "budget", width: 14, type: "number" },
                    { header: `Consuntivo ${periodo}`, key: "consuntivo", width: 18, type: "number" },
                    { header: "Previsione fine anno", key: "previsione", width: 18, type: "number" },
                    { header: "Scostamento €", key: "scostamento", width: 14, type: "number" },
                    { header: "Scostamento %", key: "scostamento_pct", width: 14 },
                  ],
                  rows: righe.map((v) => ({
                    ...v,
                    scostamento_pct: formatPct(v.scostamentoPct, 1, true),
                  })),
                  rowStyle: (row) => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const t = (row as any).tipo as string;
                    if (t === "subtot_grasso") return "total";
                    if (t === "subtot") return "subtot";
                    return "normal";
                  },
                }],
              });
            }}
          />
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="min-w-[180px] px-3 py-2 text-left text-xs font-medium text-muted-foreground">Voce</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Budget anno</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Consuntivo {periodo}</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Previsione fine anno</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Scostamento</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">%</th>
                  <th className="w-12 px-2 py-2"><span className="sr-only">Modifica</span></th>
                </tr>
              </thead>
              <tbody>
                {righe.map((v) => {
                  const isSub = v.tipo !== "voce";
                  return (
                    <tr
                      key={v.codice}
                      className={cn(
                        "border-t",
                        isSub && "bg-muted/30 font-semibold",
                        v.tipo === "subtot_grasso" && "bg-primary/5 font-bold",
                      )}
                    >
                      <td className="px-3 py-2">{v.label}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {v.budget !== 0 ? formatCurrency(v.budget) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {v.consuntivo !== 0 ? formatCurrency(v.consuntivo) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">
                        {v.previsione !== 0 ? formatCurrency(v.previsione) : "—"}
                      </td>
                      <td className={cn("px-3 py-2 text-right tabular-nums", coloreScostamento(v))}>
                        {v.scostamentoPct !== null ? formatCurrency(v.scostamento) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {v.scostamentoPct !== null ? (
                          <span className={cn("rounded-md px-2 py-0.5 text-xs font-medium", SEM_BG[v.semaforo])}>
                            {formatPct(v.scostamentoPct, 1, true)}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right">
                        {!isSub && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground"
                            onClick={() => setEditor(v)}
                            aria-label={`Modifica budget ${v.label}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {editor && (
        <BudgetEditor
          key={editor.codice}
          anno={anno}
          voce={editor}
          notaIniziale={q.note[editor.codice] ?? ""}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  );
}

function RiquadroConfronto({
  titolo, budget, previsione, piuEMeglio, annoChiuso,
}: {
  titolo: string;
  budget: number;
  previsione: number;
  piuEMeglio: boolean;
  annoChiuso: boolean;
}) {
  const scost = previsione - budget;
  const pct = budget !== 0 ? (scost / Math.abs(budget)) * 100 : null;
  const migliora = piuEMeglio ? scost >= 0 : scost <= 0;
  return (
    <Card className="rounded-2xl border-0 bg-muted/30">
      <CardContent className="p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{titolo}</p>
        <div className="mt-1 flex items-baseline justify-between gap-2">
          <p className="text-xl font-bold tabular-nums" title={formatCurrency(previsione)}>
            {formatEuroRiquadro(previsione)}
          </p>
          {pct !== null && (
            <span className={cn("text-sm font-semibold tabular-nums", migliora ? "text-emerald-700" : "text-rose-700")}>
              {formatPct(pct, 1, true)}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground" title={formatCurrency(budget)}>
          {annoChiuso ? "Consuntivo" : "Previsione fine anno"} · budget {formatEuroRiquadro(budget)}
        </p>
      </CardContent>
    </Card>
  );
}

function BudgetEditor({
  anno, voce, notaIniziale, onClose,
}: {
  anno: number;
  voce: RigaBudget;
  notaIniziale: string | null;
  onClose: () => void;
}) {
  const upsert = useUpsertBudget();
  const { toast } = useToast();
  // Montato con key = voce: lo stato parte già dai valori della voce.
  const [importo, setImporto] = useState(() => (voce.budget ? String(voce.budget).replace(".", ",") : ""));
  const [note, setNote] = useState(() => notaIniziale ?? "");

  const handleSave = async () => {
    const num = leggiImporto(importo);
    if (num === null || num < 0) {
      toast({ title: "Importo non valido", description: "Scrivi un numero, ad esempio 120.000", variant: "destructive" });
      return;
    }
    try {
      await upsert.mutateAsync({
        anno,
        codice: voce.codice,
        importo: num,
        note: note.trim() || null,
      });
      toast({ title: "Budget salvato" });
      onClose();
    } catch (e) {
      toast({ title: "Budget non salvato", description: messaggioErrore(e), variant: "destructive" });
    }
  };

  return (
    <Sheet open onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Budget {anno} — {voce.label}</SheetTitle>
          <SheetDescription>Quanto prevedi per tutto l'anno, IVA esclusa.</SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-4">
          <div>
            <Label htmlFor="budget-importo" className="text-xs">Importo annuo (€)</Label>
            <Input
              id="budget-importo"
              inputMode="decimal"
              value={importo}
              onChange={(e) => setImporto(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void handleSave(); }}
              placeholder="es. 120.000"
              autoFocus
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Consuntivo finora: {formatCurrency(voce.consuntivo)} · previsione fine anno:{" "}
              {formatCurrency(voce.previsione)}
            </p>
          </div>
          <div>
            <Label htmlFor="budget-note" className="text-xs">Note</Label>
            <Input
              id="budget-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="es. +12% sul 2025"
            />
          </div>
          <Button className="w-full" onClick={handleSave} disabled={upsert.isPending}>
            Salva budget
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
