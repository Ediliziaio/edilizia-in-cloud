/**
 * Tab Cash Flow del Controllo di gestione.
 *
 * Due viste:
 *  - Registrato: i movimenti di prima nota dell'anno (consuntivo di cassa).
 *  - Previsionale: gli stessi movimenti attesi della pagina Previsionale,
 *    raggruppati per mese, più le voci manuali del CdG (riga a parte).
 *
 * Alert visuali: saldo di fine mese sotto zero → colonna rossa.
 */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
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
  type RigaCashFlow,
} from "@/hooks/controlloGestione/useCashFlow";
import { formatCurrency } from "@/lib/formatters";
import { euroIntero } from "@/lib/controlloGestione/formatoCG";
import { cn } from "@/lib/utils";
import { AlertTriangle, ExternalLink, Plus, Trash2 } from "lucide-react";
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
import { RecordedCashFlow } from "./RecordedCashFlow";

interface Props {
  anno: number;
}

const MESI_LABELS = [
  "Gen", "Feb", "Mar", "Apr", "Mag", "Giu",
  "Lug", "Ago", "Set", "Ott", "Nov", "Dic",
];

/** Righe della matrice, con i nomi delle categorie del Previsionale. */
const RIGHE_ENTRATE: { key: RigaCashFlow; label: string }[] = [
  { key: "clienti", label: "Incassi da clienti" },
  { key: "blocca-prezzo", label: "Blocca prezzo" },
  { key: "altri", label: "Altre entrate" },
  { key: "manuali", label: "Voci manuali (solo CdG)" },
];

const RIGHE_USCITE: { key: RigaCashFlow; label: string }[] = [
  { key: "fornitori", label: "Fornitori" },
  { key: "personale", label: "Personale" },
  { key: "fisco", label: "Fisco (F24, IVA)" },
  { key: "squadre", label: "Squadre esterne" },
  { key: "provvigioni", label: "Provvigioni" },
  { key: "altri", label: "Altri costi" },
  { key: "blocca-prezzo", label: "Blocca prezzo da restituire" },
  { key: "manuali", label: "Voci manuali (solo CdG)" },
];

/** Errore di lettura in parole semplici (mai «[object Object]»). */
function messaggioErrore(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return "Riprova tra poco.";
}

export function TabCashFlow({ anno }: Props) {
  const [mode, setMode] = useState<'registrato' | 'previsionale'>('registrato');
  const historical = anno < new Date().getFullYear();
  return <div className="space-y-4">
    <div className="inline-flex rounded-lg border bg-white p-1" role="group" aria-label="Tipo di flusso di cassa">
      <Button size="sm" variant={mode === 'registrato' ? 'default' : 'ghost'} aria-pressed={mode === 'registrato'} onClick={() => setMode('registrato')}>Registrato</Button>
      <Button size="sm" variant={mode === 'previsionale' ? 'default' : 'ghost'} aria-pressed={mode === 'previsionale'} onClick={() => setMode('previsionale')}>Previsionale</Button>
    </div>
    {mode === 'registrato' ? <RecordedCashFlow anno={anno} /> : historical ? <p role="note" className="rounded-lg border p-3 text-sm">Il {anno} è uno storico: usa «Registrato». Il previsionale parte dal mese in corso, mai dal saldo di oggi applicato al passato.</p> : <>
      <p role="note" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        Stessi numeri della pagina <Link to="/azienda/previsionale" className="font-medium underline">Previsionale</Link>, mese per mese:
        parte dalla disponibilità dei conti di oggi e somma solo incassi e pagamenti ancora attesi.
        Incassi e pagamenti già scaduti restano fuori dal saldo finché non li confermi (vedi sotto).
      </p>
      <ProjectedCashFlow anno={anno} />
    </>}
  </div>;
}

function ProjectedCashFlow({ anno }: Props) {
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
  if (cf.isError) return <div className="space-y-2">
    <ErrorBlock onRetry={() => cf.refetch()} />
    <p className="text-sm text-muted-foreground">{messaggioErrore(cf.error)}</p>
  </div>;
  if (!cf.data) return null;

  const { mesi, meta, esclusi } = cf.data;
  const isAllZero = mesi.every((m) =>
    m.entrate_totali === 0 && m.uscite_totali === 0,
  );
  const righeEntrate = RIGHE_ENTRATE.filter((r) => mesi.some((m) => (m.entrate[r.key] ?? 0) !== 0));
  const righeUscite = RIGHE_USCITE.filter((r) => mesi.some((m) => (m.uscite[r.key] ?? 0) !== 0));
  const totEntrate = mesi.reduce((s, m) => s + m.entrate_totali, 0);
  const totUscite = mesi.reduce((s, m) => s + m.uscite_totali, 0);
  const primoSotto = mesi.find((m) => m.sotto_zero);

  return (
    <div className="space-y-4">
      {meta.fonti_non_lette.length > 0 && (
        <p role="alert" className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
          Non è stato possibile leggere: {meta.fonti_non_lette.join(", ")}. I numeri riguardano solo il resto.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 max-sm:gap-2 lg:grid-cols-4">
        <KPIBoxCF
          label={anno === new Date().getFullYear() ? "Disponibile oggi" : "Saldo a inizio anno"}
          value={formatCurrency(meta.saldo_apertura)}
          sub={meta.saldo_fonte === "banca"
            ? `Conti in Tesoreria${meta.saldi_aggiornati_al ? ` · al ${new Date(meta.saldi_aggiornati_al).toLocaleDateString("it-IT")}` : ""}`
            : meta.saldo_fonte === "prima-nota" ? "Dalla prima nota (nessun conto)" : undefined}
          tone="neutral"
        />
        <KPIBoxCF
          label={`Saldo previsto a fine ${anno}`}
          value={formatCurrency(meta.saldo_chiusura)}
          sub={primoSotto ? `Sotto zero da ${MESI_LABELS[primoSotto.mese - 1]}` : undefined}
          tone={meta.saldo_chiusura >= 0 ? "green" : "red"}
        />
        <KPIBoxCF label="Entrate attese" value={formatCurrency(totEntrate)} tone="blue" />
        <KPIBoxCF label="Uscite attese" value={formatCurrency(totUscite)} tone="amber" />
      </div>

      <EsclusiDalSaldo esclusi={esclusi} manualiNetto={meta.manuali_netto} />

      {/* Mobile: spiegazione tecnica, esportazione e voci manuali sono da
          scrivania. Restano i quattro numeri e i mesi. */}
      <div className="flex flex-wrap items-center justify-between gap-2 max-sm:hidden">
        <p className="text-sm text-muted-foreground">
          Previsione mese per mese · {anno}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/azienda/previsionale"><ExternalLink className="mr-2 h-4 w-4" />Apri il previsionale completo</Link>
          </Button>
          <ExportButton
            onExport={async () => {
              const colonne = [
                ...righeEntrate.map((r) => ({ key: `e_${r.key}`, header: `Entrate · ${r.label}` })),
                ...righeUscite.map((r) => ({ key: `u_${r.key}`, header: `Uscite · ${r.label}` })),
              ];
              await exportXlsx({
                filename: `cash_flow_${anno}.xlsx`,
                brand: { title: "Cash flow previsionale", subtitle: `Esercizio ${anno}` },
                sheets: [
                  {
                    name: `CashFlow ${anno}`,
                    columns: [
                      { header: "Mese", key: "mese", width: 8 },
                      { header: "Saldo inizio mese", key: "saldo_inizio", width: 16, type: "number" },
                      ...colonne.map((c) => ({ header: c.header, key: c.key, width: 18, type: "number" as const })),
                      { header: "Totale entrate", key: "entrate_totali", width: 16, type: "number" },
                      { header: "Totale uscite", key: "uscite_totali", width: 16, type: "number" },
                      { header: "Flusso netto", key: "flusso_netto", width: 16, type: "number" },
                      { header: "Saldo fine mese", key: "saldo_fine", width: 16, type: "number" },
                    ],
                    rows: mesi.map((m) => ({
                      mese: MESI_LABELS[m.mese - 1],
                      saldo_inizio: m.saldo_inizio,
                      ...Object.fromEntries(righeEntrate.map((r) => [`e_${r.key}`, m.entrate[r.key] ?? 0])),
                      ...Object.fromEntries(righeUscite.map((r) => [`u_${r.key}`, m.uscite[r.key] ?? 0])),
                      entrate_totali: m.entrate_totali,
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

      {isAllZero && (
        <EmptyState
          title="Nessun movimento atteso"
          description="Non risultano incassi o pagamenti con una data nei prossimi mesi. Controlla scadenze e rate delle commesse, oppure aggiungi una voce manuale."
        />
      )}

      {/* Mobile: una riga per mese (entrate, uscite, saldo a fine mese). */}
      {isMobile && (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="grid grid-cols-[2.5rem_1fr_1fr_1fr] gap-2 border-b bg-muted/40 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            <span>Mese</span>
            <span className="text-right">Entrate</span>
            <span className="text-right">Uscite</span>
            <span className="text-right">Saldo</span>
          </div>
          <ul className="divide-y text-[12px] tabular-nums">
            {mesi.map((m) => (
              <li
                key={m.mese}
                className={cn("grid grid-cols-[2.5rem_1fr_1fr_1fr] items-center gap-2 px-3 py-2", m.saldo_fine < 0 && "bg-rose-50/60")}
              >
                <span className="font-medium">{MESI_LABELS[m.mese - 1]}</span>
                <span className="text-right text-emerald-700">{euroIntero(m.entrate_totali)}</span>
                <span className="text-right text-amber-700">{euroIntero(m.uscite_totali)}</span>
                <span className={cn("text-right font-semibold", m.saldo_fine < 0 ? "text-rose-700" : "text-foreground")}>
                  {euroIntero(m.saldo_fine)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Tabella matrice */}
      <Card className="rounded-2xl max-sm:hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Mese per mese (importi in euro, IVA compresa)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">Entrate, uscite e saldo previsti per mese, anno {anno}</caption>
              <thead className="bg-muted/40">
                <tr>
                  <th scope="col" className="sticky left-0 z-10 min-w-[200px] bg-muted/40 px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                    Voce
                  </th>
                  {mesi.map((mese) => (
                    <th
                      scope="col"
                      key={mese.mese}
                      className={cn(
                        "min-w-[104px] px-2 py-2 text-right text-xs font-medium text-muted-foreground",
                        mese.sotto_zero && "bg-rose-50 text-rose-700",
                      )}
                    >
                      {MESI_LABELS[mese.mese - 1]}
                      {mese.sotto_zero && (
                        <AlertTriangle className="ml-auto h-3 w-3 text-rose-600" aria-label="saldo sotto zero" />
                      )}
                    </th>
                  ))}
                  <th scope="col" className="min-w-[112px] bg-primary/5 px-2 py-2 text-right text-xs font-semibold">
                    Totale
                  </th>
                </tr>
              </thead>

              <tbody>
                <RigaSaldo label="Saldo inizio mese" valori={mesi.map((m) => m.saldo_inizio)} />

                <tr className="border-t bg-emerald-50/50">
                  <td
                    colSpan={mesi.length + 2}
                    className="sticky left-0 z-10 bg-emerald-50/50 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-emerald-700"
                  >
                    Entrate
                  </td>
                </tr>
                {righeEntrate.map((r) => (
                  <RigaImporti key={`e-${r.key}`} label={r.label} valori={mesi.map((m) => m.entrate[r.key] ?? 0)} />
                ))}
                <RigaImporti label="Totale entrate" valori={mesi.map((m) => m.entrate_totali)} totale className="bg-emerald-100/50 font-semibold" />

                <tr className="border-t bg-rose-50/50">
                  <td
                    colSpan={mesi.length + 2}
                    className="sticky left-0 z-10 bg-rose-50/50 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-rose-700"
                  >
                    Uscite
                  </td>
                </tr>
                {righeUscite.map((r) => (
                  <RigaImporti key={`u-${r.key}`} label={r.label} valori={mesi.map((m) => m.uscite[r.key] ?? 0)} uscita />
                ))}
                <RigaImporti label="Totale uscite" valori={mesi.map((m) => m.uscite_totali)} uscita totale className="bg-rose-100/50 font-semibold" />

                <tr className="border-t bg-muted/30 font-medium">
                  <td className="sticky left-0 z-10 bg-muted/30 px-3 py-2">Flusso netto del mese</td>
                  {mesi.map((m, i) => (
                    <td
                      key={i}
                      className={cn(
                        "whitespace-nowrap px-2 py-2 text-right tabular-nums text-xs",
                        m.flusso_netto < 0 ? "text-rose-700" : "text-emerald-700",
                      )}
                    >
                      {m.flusso_netto !== 0 ? euroIntero(m.flusso_netto) : "—"}
                    </td>
                  ))}
                  <td className="whitespace-nowrap bg-primary/5 px-2 py-2 text-right text-xs font-bold tabular-nums">
                    {euroIntero(totEntrate - totUscite)}
                  </td>
                </tr>

                <RigaSaldo label="Saldo fine mese" valori={mesi.map((m) => m.saldo_fine)} forte />
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

function RigaImporti({ label, valori, uscita = false, totale = false, className }: {
  label: string; valori: number[]; uscita?: boolean; totale?: boolean; className?: string;
}) {
  const somma = valori.reduce((a, b) => a + b, 0);
  const fmt = (v: number) => (v !== 0 ? euroIntero(uscita ? -v : v) : "—");
  return (
    <tr className={cn("border-t", className)}>
      <td className={cn("sticky left-0 z-10 px-3 py-2 text-sm", totale ? "bg-inherit" : "bg-background pl-6")}>{label}</td>
      {valori.map((v, i) => (
        <td key={i} className={cn("whitespace-nowrap px-2 py-2 text-right tabular-nums text-xs", uscita && "text-rose-700")}>
          {fmt(v)}
        </td>
      ))}
      <td className={cn("whitespace-nowrap bg-primary/5 px-2 py-2 text-right text-xs tabular-nums", totale ? "font-bold" : "font-semibold", uscita && "text-rose-700")}>
        {euroIntero(uscita ? -somma : somma)}
      </td>
    </tr>
  );
}

function RigaSaldo({ label, valori, forte = false }: { label: string; valori: number[]; forte?: boolean }) {
  return (
    <tr className={cn(forte ? "border-t-2 border-foreground/20 bg-primary/10 font-bold" : "border-t bg-muted/30")}>
      <td className={cn("sticky left-0 z-10 px-3 py-2 font-semibold", forte ? "bg-primary/10" : "bg-muted/30")}>{label}</td>
      {valori.map((v, i) => (
        <td
          key={i}
          className={cn(
            "whitespace-nowrap px-2 py-2 text-right tabular-nums",
            forte ? "text-sm" : "text-xs",
            v < 0 && (forte ? "bg-rose-100 text-rose-800" : "font-semibold text-destructive"),
          )}
        >
          {euroIntero(v)}
        </td>
      ))}
      <td className="bg-primary/5 px-2 py-2 text-right text-xs">—</td>
    </tr>
  );
}

/** Cosa resta fuori dal saldo e perché, con il link per confermarlo nel Previsionale. */
function EsclusiDalSaldo({ esclusi, manualiNetto }: {
  esclusi: NonNullable<ReturnType<typeof useCashFlow>["data"]>["esclusi"];
  manualiNetto: number;
}) {
  const righe = [
    { n: esclusi.incassi_scaduti.numero, testo: `${esclusi.incassi_scaduti.numero} incassi già scaduti per ${formatCurrency(esclusi.incassi_scaduti.importo)}: non sono soldi sicuri, li conti solo quando li confermi.`, href: "/azienda/previsionale?incassi-scaduti=1" },
    { n: esclusi.uscite_scadute.numero, testo: `${esclusi.uscite_scadute.numero} pagamenti scaduti e non segnati pagati per ${formatCurrency(-esclusi.uscite_scadute.importo)}: spesso sono già pagati, controllali.`, href: "/azienda/previsionale?uscite-scadute=1" },
    { n: esclusi.senza_data.numero, testo: `${esclusi.senza_data.numero} movimenti senza data (netto ${formatCurrency(esclusi.senza_data.importo)}): mettigli una data per vederli nel mese giusto.`, href: "/azienda/previsionale" },
    { n: esclusi.forse_doppi.numero, testo: `${esclusi.forse_doppi.numero} incassi forse già compresi nelle rate (netto ${formatCurrency(esclusi.forse_doppi.importo)}): collegali alla rata giusta.`, href: "/azienda/previsionale" },
  ].filter((r) => r.n > 0);
  if (!righe.length && manualiNetto === 0) return null;
  return (
    <details className="rounded-lg border bg-white p-3 text-sm" open={righe.length > 0}>
      <summary className="cursor-pointer font-medium">Cosa resta fuori dal saldo</summary>
      <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
        {righe.map((r) => (
          <li key={r.testo}>
            {r.testo} <Link className="font-medium text-blue-700 underline" to={r.href}>Apri nel Previsionale</Link>
          </li>
        ))}
        {manualiNetto !== 0 && (
          <li>
            Le voci manuali del Controllo di gestione ({formatCurrency(manualiNetto)} nel periodo) ci sono solo qui:
            è l'unica differenza col saldo della pagina Previsionale.
          </li>
        )}
      </ul>
    </details>
  );
}

// ── KPI mini-box ────────────────────────────────────────────────────────────

function KPIBoxCF({
  label, value, sub, tone,
}: {
  label: string;
  value: string;
  sub?: string;
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
    <Card className={cn("min-w-0 rounded-2xl border-0", palette[tone])}>
      <CardContent className="p-4 max-sm:px-3 max-sm:py-2.5">
        <p className="text-xs text-muted-foreground max-sm:text-[11px]">{label}</p>
        <p className="mt-1 break-words text-xl font-bold tabular-nums max-sm:mt-0.5 max-sm:text-[15px]">{value}</p>
        {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
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
