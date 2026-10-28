import { useState, type SetStateAction } from "react";
import {
  useDailyHours,
  type DailyHoursController,
} from "@/hooks/useDailyHours";
import { dailyHoursError } from "@/lib/orders/dailyHours";
import { oggiRoma } from "@/hooks/useOperai";
import { formatCurrency } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { DailyHoursLedger } from "./DailyHoursLedger";

export function DailyHoursPanel({
  orderId,
  month,
  onMonthChange,
  embedded = false,
}: {
  orderId?: string;
  month?: string;
  onMonthChange?: (month: string) => void;
  embedded?: boolean;
}) {
  const periodo = month
    ? {
        da: `${month}-01`,
        a: `${month}-${new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate()}`,
      }
    : undefined;
  const controller = useDailyHours(orderId, periodo);
  if (!controller.allowed)
    return embedded ? (
      <p className="rounded-xl border bg-white p-4 text-sm text-muted-foreground">
        Registro ore non disponibile con i permessi attuali.
      </p>
    ) : null;
  const visibleController =
    month && onMonthChange
      ? {
          ...controller,
          month,
          setMonth: (value: SetStateAction<string>) =>
            onMonthChange(typeof value === "function" ? value(month) : value),
        }
      : controller;
  return (
    <DailyHoursView
      key={`${controller.companyId}-${orderId ?? "all"}`}
      controller={visibleController}
      orderId={orderId}
      embedded={embedded}
    />
  );
}
export function DailyHoursView({
  controller: c,
  orderId,
  embedded = false,
}: {
  controller: DailyHoursController;
  orderId?: string;
  embedded?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState(oggiRoma());
  const [employee, setEmployee] = useState("");
  const [job, setJob] = useState(orderId ?? "");
  const [hours, setHours] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [cancelId, setCancelId] = useState<string | null>(null);
  const lines = c.data?.lines ?? [];
  const pending = lines.filter((r) => r.pending);
  const registered = lines.filter((r) => !r.pending);
  const incomplete = registered.some((r) => r.cost == null);
  const missingCount =
    pending.length + registered.filter((r) => r.cost == null).length;
  const total = registered.reduce((s, r) => s + (r.cost ?? 0), 0);
  async function save() {
    const invalid = dailyHoursError(day, hours, employee, job, oggiRoma());
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await c.save({
        requestId,
        orderId: job,
        employeeId: employee,
        day,
        hours: Number(hours.replace(",", ".")),
        note,
      });
      c.setMonth(day.slice(0, 7));
      setMessage(
        result.da_valorizzare
          ? "Ore salvate, da valorizzare. Imposta la tariffa e verifica il rapportino prima dell’approvazione."
          : "Ore confermate: costo della commessa aggiornato.",
      );
      setRequestId(crypto.randomUUID());
      setHours("");
      setNote("");
      setOpen(false);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Registrazione non riuscita. Riprova.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function cancel() {
    const row = lines.find((r) => r.reportId === cancelId);
    if (!row) return;
    setBusy(true);
    setError("");
    try {
      await c.cancel(row.reportId, row.updatedAt, row.orderId);
      setCancelId(null);
      setMessage(
        "Registrazione annullata. Le ore e gli eventuali costi sono stati stornati.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Annullamento non riuscito.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="space-y-4 rounded-xl border bg-white p-4"
      aria-label="Registro giornaliero ore"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">Ore giornaliere per cantiere</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Ore effettive da ufficio e rapportini, con stato di approvazione e
            costi.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {embedded && (
            <Button variant="outline" onClick={c.retry} disabled={c.loading}>
              Aggiorna
            </Button>
          )}
          {c.canEdit && (
            <Button
              onClick={() => {
                setError("");
                setOpen(true);
              }}
              disabled={c.loading || !!c.error}
            >
              Registra ore
            </Button>
          )}
        </div>
      </div>
      {message && (
        <p
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm"
        >
          {message}
        </p>
      )}
      {!embedded && (
        <div className="flex flex-wrap items-center gap-3">
          <Label htmlFor="daily-month">Mese</Label>
          <Input
            id="daily-month"
            className="w-44"
            type="month"
            value={c.month}
            onChange={(e) => {
              if (/^\d{4}-(?:0[1-9]|1[0-2])$/.test(e.target.value))
                c.setMonth(e.target.value);
            }}
          />
          <Button variant="ghost" onClick={c.retry}>
            Aggiorna
          </Button>
        </div>
      )}
      {c.error ? (
        <p role="alert" className="text-sm text-destructive">
          {c.error}{" "}
          <Button variant="outline" onClick={c.retry}>
            Riprova
          </Button>
        </p>
      ) : c.loading ? (
        <p role="status">Caricamento registro…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              [
                "Ore confermate",
                `${registered.reduce((s, r) => s + r.hours, 0).toLocaleString("it-IT")} h`,
              ],
              [
                "Ore in attesa",
                `${pending.reduce((s, r) => s + r.hours, 0).toLocaleString("it-IT")} h`,
              ],
              ...(c.showCosts
                ? [
                    [
                      incomplete
                        ? "Costo confermato incompleto"
                        : "Costo confermato",
                      incomplete ? "Da completare" : formatCurrency(total),
                    ],
                    [
                      "Da valorizzare",
                      `${missingCount} ${missingCount === 1 ? "registrazione" : "registrazioni"}`,
                    ],
                  ]
                : []),
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 font-semibold">{value}</p>
              </div>
            ))}
          </div>
          {!!pending.length && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
              Le ore in attesa non sono ancora nei costi effettivi. Per quelle
              senza tariffa, completa la scheda dipendente e approva il
              rapportino dalla commessa.
            </p>
          )}
          <DailyHoursLedger
            key={c.month}
            controller={c}
            busy={busy}
            onCancel={(reportId) => {
              setError("");
              setCancelId(reportId);
            }}
          />
        </>
      )}
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!busy) setOpen(v);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Registra ore giornaliere</DialogTitle>
            <DialogDescription>
              Confermi ore effettivamente lavorate. La previsione e i prezzi del
              preventivo restano invariati.
            </DialogDescription>
          </DialogHeader>
          <fieldset disabled={busy} className="space-y-4">
            <div>
              <Label htmlFor="daily-day">Data</Label>
              <Input
                id="daily-day"
                type="date"
                max={oggiRoma()}
                value={day}
                onChange={(e) => {
                  setDay(e.target.value);
                  setRequestId(crypto.randomUUID());
                }}
              />
            </div>
            <div>
              <Label htmlFor="daily-person">Dipendente</Label>
              <select
                id="daily-person"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={employee}
                onChange={(e) => {
                  setEmployee(e.target.value);
                  setRequestId(crypto.randomUUID());
                }}
              >
                <option value="">Seleziona dipendente</option>
                {c.data?.activePeople.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="daily-job">Cantiere / commessa</Label>
              <select
                id="daily-job"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={job}
                disabled={!!orderId}
                onChange={(e) => {
                  setJob(e.target.value);
                  setRequestId(crypto.randomUUID());
                }}
              >
                <option value="">Seleziona cantiere</option>
                {c.data?.orders.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="daily-hours">Ore lavorate</Label>
              <Input
                id="daily-hours"
                inputMode="decimal"
                value={hours}
                placeholder="Es. 7,5"
                onChange={(e) => {
                  setHours(e.target.value);
                  setRequestId(crypto.randomUUID());
                }}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Se lavori in due cantieri, registra una riga per ciascuno. Il
                totale giornaliero non può superare 24 ore.
              </p>
            </div>
            <div>
              <Label htmlFor="daily-note">Note (facoltative)</Label>
              <Textarea
                id="daily-note"
                value={note}
                maxLength={4000}
                onChange={(e) => {
                  setNote(e.target.value);
                  setRequestId(crypto.randomUUID());
                }}
              />
            </div>
            <p className="rounded-lg bg-slate-50 p-3 text-sm">
              Con tariffa disponibile aggiorno il costo della commessa. Senza
              tariffa salvo le ore in attesa, senza inventare un costo a zero.
            </p>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </fieldset>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              Chiudi
            </Button>
            <Button disabled={busy} onClick={save}>
              {busy ? "Salvataggio…" : "Conferma ore"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!cancelId}
        onOpenChange={(v) => {
          if (!v && !busy) setCancelId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Annullare queste ore?</DialogTitle>
            <DialogDescription>
              Storno le ore e il costo storico di questa registrazione. La
              traccia rimane nei rapportini. Poi puoi inserire la giornata
              corretta.
            </DialogDescription>
          </DialogHeader>
          {error && <p role="alert">{error}</p>}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setCancelId(null)}
            >
              Mantieni
            </Button>
            <Button variant="destructive" disabled={busy} onClick={cancel}>
              Annulla ore
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
