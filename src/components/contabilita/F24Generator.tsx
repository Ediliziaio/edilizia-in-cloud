import { useState } from "react";
import { F24Entry, TRIBUTI_PREDEFINITI } from "@/hooks/useF24";
import { formatCurrency } from "@/lib/formatters";
import { fiscalAmountTotal } from "@/lib/fatturazione/fiscalWorkspace";
import {
  fiscalDate,
  fiscalDue,
  fiscalMatch,
} from "@/lib/fatturazione/fiscalInsights";
import {
  FiscalMetric,
  FiscalSelectFilter,
} from "@/components/fatturazione/FiscalSectionLayout";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Plus, X, Save } from "lucide-react";

interface Props {
  readOnly?: boolean;
  periodMonth?: number;
  periodMonths?: number[];
  entries: F24Entry[];
  isLoading: boolean;
  onSalva: (
    data: Partial<F24Entry> & { tributo_code: string; importo: number },
    versione?: string,
  ) => Promise<void>;
  onAnteprima?: (mese: number) => Promise<string>;
  isSalvando: boolean;
  totaleAPagare: number | null;
  scadentiProssimi30gg: F24Entry[];
}

const MESI = [
  "Gennaio",
  "Febbraio",
  "Marzo",
  "Aprile",
  "Maggio",
  "Giugno",
  "Luglio",
  "Agosto",
  "Settembre",
  "Ottobre",
  "Novembre",
  "Dicembre",
];

function StatoBadge({ stato }: { stato: F24Entry["stato"] }) {
  if (stato === "pagato") {
    return (
      <Badge className="bg-green-100 text-green-800 border-green-200">
        Pagamento dichiarato
      </Badge>
    );
  }
  if (stato === "annullato") {
    return (
      <Badge className="bg-gray-100 text-gray-600 border-gray-200">
        Annullato
      </Badge>
    );
  }
  return (
    <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">
      Da pagare
    </Badge>
  );
}

interface FormState {
  tributo_code: string;
  importo: string;
  data_scadenza: string;
  mese: string;
  note: string;
}

const defaultForm: FormState = {
  tributo_code: "",
  importo: "",
  data_scadenza: "",
  mese: "",
  note: "",
};

export function F24Generator({
  entries,
  isLoading,
  onSalva,
  isSalvando,
  totaleAPagare,
  readOnly = true,
  periodMonth,
  periodMonths,
  onAnteprima,
}: Props) {
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState("tutti"),
    [search, setSearch] = useState(""),
    [detail, setDetail] = useState<F24Entry | null>(null);
  const unpaid = entries.filter((entry) => entry.stato === "da_pagare");
  const overdue = unpaid.filter(
    (entry) => fiscalDue(entry.data_scadenza) === "scaduta",
  );
  const upcoming = unpaid.filter(
    (entry) => fiscalDue(entry.data_scadenza) === "prossima",
  );
  const filtered = entries.filter(
    (entry) =>
      fiscalMatch(
        search,
        entry.tributo_code,
        entry.tributo_descrizione,
        entry.note,
      ) &&
      (filter === "tutti" ||
        filter === entry.stato ||
        (filter === "scaduti" && overdue.some((r) => r.id === entry.id)) ||
        (filter === "prossimi" && upcoming.some((r) => r.id === entry.id)) ||
        (filter === "senza_data" &&
          entry.stato === "da_pagare" &&
          fiscalDue(entry.data_scadenza) === "mancante")),
  );
  const amount = (rows: F24Entry[]) => {
    const total = fiscalAmountTotal(rows.map((entry) => entry.importo));
    return total === null ? "Da verificare" : formatCurrency(total);
  };
  const [form, setForm] = useState<FormState>({
    ...defaultForm,
    mese: periodMonth ? String(periodMonth) : "",
  });
  const [saveError, setSaveError] = useState("");
  const [prepared, setPrepared] = useState<{
    versione: string;
    fingerprint: string;
  } | null>(null);
  const [preparing, setPreparing] = useState(false);
  const confirmedPreview = prepared?.fingerprint === JSON.stringify(form);

  const handleSalva = async () => {
    if (readOnly || !form.tributo_code || !form.importo) return;
    setSaveError("");
    try {
      const amount = Number(form.importo);
      if (
        !Number.isFinite(amount) ||
        amount <= 0 ||
        amount > 1e9 ||
        Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001
      )
        throw Error(
          "Inserisci un importo positivo con al massimo due decimali",
        );
      if (!onAnteprima || !form.mese)
        throw Error("Mese e verifica del server obbligatori");
      if (
        (periodMonth && Number(form.mese) !== periodMonth) ||
        (periodMonths && !periodMonths.includes(Number(form.mese)))
      )
        throw Error("Il mese deve appartenere al periodo selezionato");
      if (!confirmedPreview) {
        setPreparing(true);
        const fingerprint = JSON.stringify(form);
        const versione = await onAnteprima(Number(form.mese));
        setPrepared({ versione, fingerprint });
        return;
      }
      await onSalva(
        {
          tributo_code: form.tributo_code,
          importo: parseFloat(form.importo),
          data_scadenza: form.data_scadenza || null,
          mese: form.mese ? parseInt(form.mese) : undefined,
          note: form.note || undefined,
        },
        prepared!.versione,
      );
      setPrepared(null);
      setForm({ ...defaultForm, mese: periodMonth ? String(periodMonth) : "" });
      setShowForm(false);
    } catch (e) {
      setPrepared(null);
      setSaveError(
        `Registrazione non riuscita. ${e instanceof Error ? e.message : "Verifica codice, importo e riferimento al documento del consulente."} Nessun successo confermato.`,
      );
    } finally {
      setPreparing(false);
    }
  };

  const handleCancel = () => {
    setPrepared(null);
    setSaveError("");
    setForm({ ...defaultForm, mese: periodMonth ? String(periodMonth) : "" });
    setShowForm(false);
  };

  return (
    <div className="space-y-4">
      {/* Summary row */}
      <div className="grid gap-3 sm:grid-cols-3">
        <FiscalMetric
          label="Registrazioni da pagare nel periodo"
          value={
            totaleAPagare === null
              ? "Importo da verificare"
              : formatCurrency(totaleAPagare)
          }
          description={`${unpaid.length} registrazioni gestionali · non una delega trasmessa`}
          onClick={() => setFilter("da_pagare")}
          active={filter === "da_pagare"}
        />
        <FiscalMetric
          label="Scadute nel periodo"
          value={overdue.length}
          description={`${amount(overdue)} · scadenza precedente a oggi`}
          onClick={() => setFilter("scaduti")}
          active={filter === "scaduti"}
          warning={overdue.length > 0}
        />
        <FiscalMetric
          label="Scadenze del periodo entro 30 giorni"
          value={upcoming.length}
          description={`${amount(upcoming)} · oggi incluso`}
          onClick={() => setFilter("prossimi")}
          active={filter === "prossimi"}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="min-w-48 flex-1"
          aria-label="Cerca registrazioni F24"
          placeholder="Codice tributo, descrizione o riferimento…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <FiscalSelectFilter
          label="Filtro registrazioni F24"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "tutti", label: "Tutte le registrazioni" },
            { value: "da_pagare", label: "Da pagare · registrate" },
            { value: "scaduti", label: "Scadute" },
            { value: "prossimi", label: "Entro 30 giorni" },
            { value: "pagato", label: "Pagamento dichiarato" },
            { value: "annullato", label: "Annullate" },
            { value: "senza_data", label: "Senza scadenza valida" },
          ]}
        />
        {(filter !== "tutti" || search) && (
          <Button
            variant="ghost"
            onClick={() => {
              setFilter("tutti");
              setSearch("");
            }}
          >
            Azzera filtri F24
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Riepiloghi dell’intero periodo selezionato; i filtri cambiano solo
        l’elenco. Pagamenti e quietanze non vengono certificati da questa vista.
      </p>

      {!showForm && !readOnly ? (
        <Button variant="outline" onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nuovo F24
        </Button>
      ) : showForm && !readOnly ? (
        <div className="border rounded-lg p-4 space-y-4 bg-card">
          <h3 className="text-sm font-semibold">Nuovo F24</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Tributo</Label>
              <Select
                value={form.tributo_code}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, tributo_code: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona tributo..." />
                </SelectTrigger>
                <SelectContent>
                  {TRIBUTI_PREDEFINITI.map((t) => (
                    <SelectItem key={t.code} value={t.code}>
                      {t.code} — {t.descrizione}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Importo (€)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="0,00"
                value={form.importo}
                onChange={(e) =>
                  setForm((f) => ({ ...f, importo: e.target.value }))
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label>Data scadenza</Label>
              <Input
                type="date"
                value={form.data_scadenza}
                onChange={(e) =>
                  setForm((f) => ({ ...f, data_scadenza: e.target.value }))
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label>Mese di riferimento</Label>
              <Select
                value={form.mese}
                disabled={!!periodMonth}
                onValueChange={(v) => setForm((f) => ({ ...f, mese: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona mese..." />
                </SelectTrigger>
                <SelectContent>
                  {MESI.map(
                    (m, i) =>
                      (!periodMonths || periodMonths.includes(i + 1)) && (
                        <SelectItem key={i + 1} value={String(i + 1)}>
                          {m}
                        </SelectItem>
                      ),
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label>
                Riferimento al prospetto del consulente (obbligatorio)
              </Label>
              <Textarea
                placeholder="Note aggiuntive..."
                value={form.note}
                onChange={(e) =>
                  setForm((f) => ({ ...f, note: e.target.value }))
                }
                rows={2}
              />
            </div>
          </div>

          {confirmedPreview && (
            <div
              role="status"
              className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm"
            >
              Verifica: codice {form.tributo_code} ·{" "}
              {formatCurrency(Number(form.importo))} · mese {form.mese}.
              <p>
                Riferimento: {form.note}. La conferma registra questo importo,
                senza trasmissioni o pagamenti. Una modifica ai dati richiede
                una nuova anteprima.
              </p>
            </div>
          )}
          <div className="flex gap-2">
            <Button
              onClick={handleSalva}
              disabled={
                isSalvando ||
                preparing ||
                !onAnteprima ||
                !form.mese ||
                !form.tributo_code ||
                !form.importo ||
                form.note.trim().length < 5
              }
              size="sm"
            >
              <Save className="h-4 w-4 mr-1.5" />
              {isSalvando || preparing
                ? "Verifica in corso…"
                : confirmedPreview
                  ? "Conferma registrazione"
                  : "Verifica anteprima"}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleCancel}>
              <X className="h-4 w-4 mr-1.5" />
              Annulla
            </Button>
          </div>
        </div>
      ) : null}
      {saveError && (
        <p role="alert" className="text-sm text-red-700">
          {saveError}
        </p>
      )}

      {/* Table — scroll orizzontale su mobile (6 colonne sfondavano il layout a 375px) */}
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tributo</TableHead>
              <TableHead className="text-right">Importo</TableHead>
              <TableHead>Scadenza</TableHead>
              <TableHead>Mese</TableHead>
              <TableHead>Stato</TableHead>
              <TableHead className="text-right">Azioni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-4 w-48" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-20 ml-auto" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-16" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-20 rounded-full" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-8 w-16 ml-auto" />
                  </TableCell>
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center text-muted-foreground py-8"
                >
                  {entries.length
                    ? "Nessuna registrazione corrisponde ai filtri"
                    : "Nessun F24 registrato"}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>
                    <div className="font-medium text-sm">
                      {entry.tributo_code}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {entry.tributo_descrizione}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {fiscalAmountTotal([entry.importo]) === null
                      ? "Importo da verificare"
                      : formatCurrency(entry.importo)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {fiscalDate(entry.data_scadenza, "Non indicata")}
                  </TableCell>
                  <TableCell className="text-sm">
                    {entry.mese ? MESI[entry.mese - 1] : "—"}
                  </TableCell>
                  <TableCell>
                    <StatoBadge stato={entry.stato} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDetail(entry)}
                    >
                      Dati e documenti
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <Dialog
        open={!!detail}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>
              Registrazione F24 · {detail?.tributo_code}
            </DialogTitle>
            <DialogDescription>
              Consultazione del dato registrato. Non attesta invio, addebito o
              validità di una quietanza.
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <dl className="space-y-3 text-sm">
              {[
                ["Importo", amount([detail])],
                ["Scadenza", fiscalDate(detail.data_scadenza, "Non indicata")],
                [
                  "Pagamento dichiarato",
                  fiscalDate(detail.data_pagamento, "Non indicato"),
                ],
                ["Riferimento registrato", detail.note || "Non presente"],
                [
                  "Documento associato",
                  detail.pdf_url || "Nessun riferimento ad allegato",
                ],
                [
                  "Verifica quietanza",
                  "Non disponibile: occorrono esito, identificativo e corrispondenza con questa registrazione.",
                ],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border p-3">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="mt-1 break-words">{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
