/**
 * Tab Cash Flow Mensile Prospettico — replica l'Excel "OTP | Flusso Finanziario".
 *
 * Mostra una matrice mese × {saldo apertura, entrate breakdown, uscite breakdown,
 * saldo chiusura}. Le voci manuali (anticipi, F24, IVA, ecc.) sono editabili
 * tramite drawer dedicato.
 *
 * Alert visuali:
 *  - saldo_fine < 0  → riga rossa con icona AlertTriangle
 */

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ErrorBlock } from "@/components/controllo-gestione/ui/ErrorBlock";
import { EmptyState } from "@/components/controllo-gestione/ui/EmptyState";
import {
  useCashFlow,
  useCashFlowManuali,
  useUpsertCashFlowManuale,
  useDeleteCashFlowManuale,
  type CashFlowManuale,
} from "@/hooks/controlloGestione/useCashFlow";
import { formatCurrency, formatCurrencyCompact } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { ExportButton } from "@/components/controllo-gestione/ui/ExportButton";
import { exportXlsx } from "@/lib/controlloGestione/exportXlsx";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";

interface Props {
  anno: number;
}

const MESI_LABELS = [
  "Gen", "Feb", "Mar", "Apr", "Mag", "Giu",
  "Lug", "Ago", "Set", "Ott", "Nov", "Dic",
];

const RIGHE_ENTRATE = [
  { key: "scadenze",  label: "Incassi clienti (scadenze)" },
  { key: "fatture",   label: "Fatture aperte (extra)" },
  { key: "manuali",   label: "Voci manuali entrata" },
] as const;

const RIGHE_USCITE = [
  { key: "scadenze",  label: "Pagamenti fornitori (scadenze)" },
  { key: "personale", label: "Costo personale (cedolini)" },
  { key: "mutui",     label: "Rate mutui MLT" },
  { key: "manuali",   label: "Voci manuali uscita" },
  { key: "costi",     label: "Altri costi non a scadenza" },
] as const;

export function TabCashFlow({ anno }: Props) {
  const cf = useCashFlow(anno, 1, 12);
  const [editorOpen, setEditorOpen] = useState(false);
  const isMobile = useIsMobile();

  if (cf.isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    );
  }
  if (cf.isError) return <ErrorBlock onRetry={() => cf.refetch()} />;
  if (!cf.data) return null;

  const { mesi, meta } = cf.data;
  const isAllZero = mesi.every((m) =>
    m.entrate_totali === 0 && m.uscite_totali === 0,
  );

  return (
    <div className="space-y-4">
      {/* KPI head */}
      <div className="grid grid-cols-2 gap-3 max-sm:gap-2 lg:grid-cols-4">
        <KPIBoxCF
          label="Saldo apertura"
          value={formatCurrency(meta.saldo_apertura)}
          tone="neutral"
        />
        <KPIBoxCF
          label="Saldo chiusura prev."
          value={formatCurrency(meta.saldo_chiusura)}
          tone={meta.saldo_chiusura >= 0 ? "green" : "red"}
        />
        <KPIBoxCF
          label="Entrate totali"
          value={formatCurrency(mesi.reduce((s, m) => s + m.entrate_totali, 0))}
          tone="blue"
        />
        <KPIBoxCF
          label="Uscite totali"
          value={formatCurrency(mesi.reduce((s, m) => s + m.uscite_totali, 0))}
          tone="amber"
        />
      </div>

      {/* Mobile no: spiegazione tecnica, esportazione e voci manuali sono da
          scrivania. Restano i quattro numeri e i dodici mesi. */}
      <div className="flex items-center justify-between max-sm:hidden">
        <div>
          <p className="text-sm text-muted-foreground">
            Cash Flow Mensile Prospettico · {anno}
          </p>
          <p className="text-xs text-muted-foreground">
            Saldo iniziale = somma current_balance dei conti bancari attivi (oggi).
            Voci stimate da scadenze/cedolini/mutui + voci manuali utente.
          </p>
        </div>
        <div className="flex gap-2">
          <ExportButton
            onExport={async () => {
              await exportXlsx({
                filename: `cash_flow_${anno}.xlsx`,
                brand: { title: "Cash Flow Mensile Prospettico", subtitle: `Esercizio ${anno}` },
                sheets: [
                  {
                    name: `CashFlow ${anno}`,
                    columns: [
                      { header: "Mese", key: "mese", width: 8 },
                      { header: "Saldo apertura", key: "saldo_inizio", width: 16, type: "number" },
                      { header: "Entrate scadenze", key: "ent_sc", width: 16, type: "number" },
                      { header: "Entrate manuali", key: "ent_man", width: 16, type: "number" },
                      { header: "Totale entrate", key: "entrate_totali", width: 16, type: "number" },
                      { header: "Uscite scadenze", key: "usc_sc", width: 16, type: "number" },
                      { header: "Uscite personale", key: "usc_pers", width: 16, type: "number" },
                      { header: "Uscite mutui", key: "usc_mut", width: 14, type: "number" },
                      { header: "Uscite manuali", key: "usc_man", width: 16, type: "number" },
                      { header: "Totale uscite", key: "uscite_totali", width: 16, type: "number" },
                      { header: "Flusso netto", key: "flusso_netto", width: 16, type: "number" },
                      { header: "Saldo chiusura", key: "saldo_fine", width: 16, type: "number" },
                    ],
                    rows: mesi.map((m) => ({
                      mese: MESI_LABELS[m.mese - 1],
                      saldo_inizio: m.saldo_inizio,
                      ent_sc: m.entrate.scadenze,
                      ent_man: m.entrate.manuali,
                      entrate_totali: m.entrate_totali,
                      usc_sc: m.uscite.scadenze,
                      usc_pers: m.uscite.personale,
                      usc_mut: m.uscite.mutui,
                      usc_man: m.uscite.manuali,
                      uscite_totali: m.uscite_totali,
                      flusso_netto: m.flusso_netto,
                      saldo_fine: m.saldo_fine,
                    })),
                  },
                ],
              });
            }}
          />
          <Button onClick={() => setEditorOpen(true)} size="sm">
            <Plus className="mr-2 h-4 w-4" /> Voci manuali
          </Button>
        </div>
      </div>

      {isAllZero && meta.saldo_apertura === 0 && (
        <EmptyState
          title="Nessun dato di cash flow"
          description="Non ho scadenze, cedolini o mutui per quest'anno. Inserisci almeno qualche voce manuale per iniziare a vedere la previsione."
        />
      )}

      {/* Mobile: dodici righe (mese, entrate, uscite, saldo a fine mese) al
          posto della matrice a quattordici colonne da scorrere di lato. */}
      {isMobile && (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="grid grid-cols-[2.5rem_1fr_1fr_1fr] gap-2 border-b bg-muted/40 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            <span>Mese</span>
            <span className="text-right">Entrate</span>
            <span className="text-right">Uscite</span>
            <span className="text-right">Saldo</span>
          </div>
          <ul className="divide-y text-[13px] tabular-nums">
            {mesi.map((m) => (
              <li
                key={m.mese}
                className={cn("grid grid-cols-[2.5rem_1fr_1fr_1fr] items-center gap-2 px-3 py-2", m.saldo_fine < 0 && "bg-rose-50/60")}
              >
                <span className="font-medium">{MESI_LABELS[m.mese - 1]}</span>
                <span className="text-right text-emerald-700">{formatCurrencyCompact(m.entrate_totali)}</span>
                <span className="text-right text-amber-700">{formatCurrencyCompact(m.uscite_totali)}</span>
                <span className={cn("text-right font-semibold", m.saldo_fine < 0 ? "text-rose-700" : "text-foreground")}>
                  {formatCurrencyCompact(m.saldo_fine)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Tabella matrice */}
      <Card className="rounded-2xl max-sm:hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Matrice mensile</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="sticky left-0 z-10 min-w-[200px] bg-muted/40 px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                    Voce
                  </th>
                  {MESI_LABELS.map((m, i) => {
                    const mese = mesi[i];
                    return (
                      <th
                        key={m}
                        className={cn(
                          "min-w-[90px] px-2 py-2 text-right text-xs font-medium text-muted-foreground",
                          mese?.sotto_zero && "bg-rose-50 text-rose-700",
                        )}
                      >
                        {m}
                        {mese?.sotto_zero && (
                          <AlertTriangle className="mx-auto h-3 w-3 text-rose-600" />
                        )}
                      </th>
                    );
                  })}
                  <th className="min-w-[100px] bg-primary/5 px-2 py-2 text-right text-xs font-semibold">
                    Totale
                  </th>
                </tr>
              </thead>

              <tbody>
                {/* Saldo apertura */}
                <tr className="border-t bg-muted/30">
                  <td className="sticky left-0 z-10 bg-muted/30 px-3 py-2 font-semibold">
                    Saldo apertura
                  </td>
                  {mesi.map((m, i) => (
                    <td
                      key={i}
                      className={cn(
                        "px-2 py-2 text-right tabular-nums text-xs",
                        m.saldo_inizio < 0 && "text-destructive font-semibold",
                      )}
                    >
                      {formatCurrencyCompact(m.saldo_inizio)}
                    </td>
                  ))}
                  <td className="bg-primary/5 px-2 py-2 text-right text-xs">—</td>
                </tr>

                {/* Sezione ENTRATE */}
                <tr className="border-t bg-emerald-50/50">
                  <td
                    colSpan={14}
                    className="sticky left-0 z-10 bg-emerald-50/50 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-emerald-700"
                  >
                    Entrate
                  </td>
                </tr>
                {RIGHE_ENTRATE.map((r) => {
                  const valori = mesi.map((m) => m.entrate[r.key] ?? 0);
                  const totale = valori.reduce((a, b) => a + b, 0);
                  if (totale === 0) return null;
                  return (
                    <tr key={`e-${r.key}`} className="border-t">
                      <td className="sticky left-0 z-10 bg-background px-3 py-2 pl-6 text-sm">
                        {r.label}
                      </td>
                      {valori.map((v, i) => (
                        <td
                          key={i}
                          className="px-2 py-2 text-right tabular-nums text-xs"
                        >
                          {v !== 0 ? formatCurrencyCompact(v) : "—"}
                        </td>
                      ))}
                      <td className="bg-primary/5 px-2 py-2 text-right text-xs font-semibold">
                        {formatCurrencyCompact(totale)}
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t bg-emerald-100/50 font-semibold">
                  <td className="sticky left-0 z-10 bg-emerald-100/50 px-3 py-2">
                    Totale entrate
                  </td>
                  {mesi.map((m, i) => (
                    <td key={i} className="px-2 py-2 text-right tabular-nums text-xs">
                      {m.entrate_totali !== 0
                        ? formatCurrencyCompact(m.entrate_totali)
                        : "—"}
                    </td>
                  ))}
                  <td className="bg-primary/5 px-2 py-2 text-right text-xs font-bold">
                    {formatCurrencyCompact(
                      mesi.reduce((s, m) => s + m.entrate_totali, 0),
                    )}
                  </td>
                </tr>

                {/* Sezione USCITE */}
                <tr className="border-t bg-rose-50/50">
                  <td
                    colSpan={14}
                    className="sticky left-0 z-10 bg-rose-50/50 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-rose-700"
                  >
                    Uscite
                  </td>
                </tr>
                {RIGHE_USCITE.map((r) => {
                  const valori = mesi.map((m) => m.uscite[r.key] ?? 0);
                  const totale = valori.reduce((a, b) => a + b, 0);
                  if (totale === 0) return null;
                  return (
                    <tr key={`u-${r.key}`} className="border-t">
                      <td className="sticky left-0 z-10 bg-background px-3 py-2 pl-6 text-sm">
                        {r.label}
                      </td>
                      {valori.map((v, i) => (
                        <td
                          key={i}
                          className="px-2 py-2 text-right tabular-nums text-xs text-rose-700"
                        >
                          {v !== 0 ? `-${formatCurrencyCompact(v)}` : "—"}
                        </td>
                      ))}
                      <td className="bg-primary/5 px-2 py-2 text-right text-xs font-semibold text-rose-700">
                        -{formatCurrencyCompact(totale)}
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t bg-rose-100/50 font-semibold">
                  <td className="sticky left-0 z-10 bg-rose-100/50 px-3 py-2">
                    Totale uscite
                  </td>
                  {mesi.map((m, i) => (
                    <td
                      key={i}
                      className="px-2 py-2 text-right tabular-nums text-xs text-rose-700"
                    >
                      {m.uscite_totali !== 0
                        ? `-${formatCurrencyCompact(m.uscite_totali)}`
                        : "—"}
                    </td>
                  ))}
                  <td className="bg-primary/5 px-2 py-2 text-right text-xs font-bold text-rose-700">
                    -{formatCurrencyCompact(
                      mesi.reduce((s, m) => s + m.uscite_totali, 0),
                    )}
                  </td>
                </tr>

                {/* Flusso netto */}
                <tr className="border-t bg-muted/30 font-medium">
                  <td className="sticky left-0 z-10 bg-muted/30 px-3 py-2">
                    Flusso netto del mese
                  </td>
                  {mesi.map((m, i) => (
                    <td
                      key={i}
                      className={cn(
                        "px-2 py-2 text-right tabular-nums text-xs",
                        m.flusso_netto < 0 ? "text-rose-700" : "text-emerald-700",
                      )}
                    >
                      {m.flusso_netto !== 0
                        ? formatCurrencyCompact(m.flusso_netto)
                        : "—"}
                    </td>
                  ))}
                  <td className="bg-primary/5 px-2 py-2 text-right text-xs font-bold">
                    {formatCurrencyCompact(
                      mesi.reduce((s, m) => s + m.flusso_netto, 0),
                    )}
                  </td>
                </tr>

                {/* Saldo chiusura */}
                <tr className="border-t-2 border-foreground/20 bg-primary/10 font-bold">
                  <td className="sticky left-0 z-10 bg-primary/10 px-3 py-2.5">
                    Saldo chiusura
                  </td>
                  {mesi.map((m, i) => (
                    <td
                      key={i}
                      className={cn(
                        "px-2 py-2.5 text-right tabular-nums text-sm",
                        m.saldo_fine < 0
                          ? "bg-rose-100 text-rose-800"
                          : "text-foreground",
                      )}
                    >
                      {formatCurrencyCompact(m.saldo_fine)}
                    </td>
                  ))}
                  <td className="bg-primary/5 px-2 py-2.5 text-right text-sm">—</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <CashFlowManualiEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        anno={anno}
      />
    </div>
  );
}

// ── KPI mini-box ────────────────────────────────────────────────────────────

function KPIBoxCF({
  label, value, tone,
}: {
  label: string;
  value: string;
  tone: "neutral" | "blue" | "green" | "amber" | "red";
}) {
  const palette: Record<typeof tone, string> = {
    neutral: "bg-muted/40",
    blue: "bg-blue-50",
    green: "bg-emerald-50",
    amber: "bg-amber-50",
    red: "bg-rose-50",
  };
  return (
    <Card className={cn("rounded-2xl border-0", palette[tone])}>
      <CardContent className="p-4 max-sm:px-3 max-sm:py-2.5">
        <p className="text-xs text-muted-foreground max-sm:text-[11px]">{label}</p>
        <p className="mt-1 text-xl font-bold tabular-nums max-sm:mt-0.5 max-sm:text-[17px]">{value}</p>
      </CardContent>
    </Card>
  );
}

// ── Editor voci manuali ─────────────────────────────────────────────────────

const CATEGORIE_DEFAULT = [
  "F24", "IVA", "IRPEF", "IRES", "IRAP", "INPS", "INAIL",
  "TFR", "13a/14a", "Tredicesima", "Quattordicesima",
  "Anticipo cliente", "SAL", "Caparra", "Acconto",
  "Anticipo socio", "Immissione capitale", "Dividendo",
  "Mutuo", "Leasing", "Altro",
];

function CashFlowManualiEditor({
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
    categoria: "F24",
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
      toast({ title: "Errore", description: String(e), variant: "destructive" });
    }
  };

  const handleDelete = async (r: CashFlowManuale) => {
    try {
      await del.mutateAsync(r.id);
      toast({ title: "Voce eliminata" });
    } catch (e) {
      toast({ title: "Errore", description: String(e), variant: "destructive" });
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Voci manuali Cash Flow · {anno}</SheetTitle>
          <p className="text-xs text-muted-foreground">
            F24, IVA, anticipi soci, SAL, dividendi e tutto ciò che non passa
            automaticamente da scadenze/cedolini/mutui.
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
