import { useEffect, useRef, useState } from "react";
import { MapPin, Plus, Route, Trash2, Undo2 } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ViaggioSelect } from "./ViaggioSelect";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useCarburanteMezzo, useSalvaViaggio, useViaggiContesto } from "@/hooks/useMezziViaggi";
import {
  draftViaggioKey,
  erroriViaggio,
  numeroViaggio,
  riepilogoViaggio,
  type CantiereViaggio,
  type TrattaViaggio,
  type Viaggio,
  type ViaggioPayload,
} from "@/lib/mezzi/viaggi";
import { getRoute } from "@/lib/routing";
import type { ArrivoDaRapportino } from "@/lib/campo/arrivoRapportino";
import { formatData, giornoItaliano } from "@/types/mezzi";
import { toast } from "sonner";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

type Riga = Omit<TrattaViaggio, "km" | "minuti"> & {
  km: string;
  minuti: string;
};
interface Draft {
  id: string;
  versione: number;
  da: string;
  a: string;
  ci: string;
  cf: string;
  note: string;
  tariffa: string;
  tratte: Riga[];
  conducente?: string | null;
}
const dateInput = (value: string) => {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const nuovaTratta = (da = ""): Riga => ({
  id: crypto.randomUUID(),
  da,
  a: "",
  km: "",
  minuti: "",
  order_id: null,
  destinazione: "da_attribuire",
  fonte: "dichiarati",
});
function TappaInput({
  label,
  value,
  onChange,
  cantieri,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  cantieri: CantiereViaggio[];
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div className="flex gap-1">
      <Input
        aria-label={label}
        maxLength={250}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            aria-label={t("Scegli luogo per {label}", { label: String(label ?? "") })}
          >
            <MapPin className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="max-h-72 w-72 overflow-y-auto rounded-2xl p-2"
        >
          {[{ id: "sede", label: t("Sede") }, ...cantieri].map((c) => (
            <button
              key={c.id}
              type="button"
              className="block min-h-11 w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              onClick={() => {
                onChange(c.label);
                setOpen(false);
              }}
            >
              {c.label}
            </button>
          ))}
        </PopoverContent>
      </Popover>
    </div>
  );
}
function initial(viaggio?: Viaggio, arrivo?: ArrivoDaRapportino): Draft {
  return viaggio
    ? {
        id: viaggio.id,
        versione: viaggio.versione,
        da: dateInput(viaggio.partenza),
        a: dateInput(viaggio.arrivo),
        ci: viaggio.contatore_inizio?.toString() ?? "",
        cf: viaggio.contatore_fine?.toString() ?? "",
        note: viaggio.note,
        tariffa: viaggio.tariffa_km?.toString() ?? "",
        conducente: viaggio.conducente_hr_id,
        tratte: viaggio.tratte.map((t) => ({
          ...t,
          km: t.km?.toString() ?? "",
          minuti: t.minuti?.toString() ?? "",
        })),
      }
    : {
        id: arrivo?.id ?? crypto.randomUUID(),
        versione: 0,
        da: "",
        a: "",
        ci: "",
        cf: "",
        note: "",
        tariffa: "",
        tratte: [{
          ...nuovaTratta(arrivo ? arrivo.partenza ?? "" : "Sede"),
          km: arrivo?.km?.toString() ?? "",
        }],
      };
}
interface ViaggioDialogProps {
  companyId: string;
  mezzoId: string;
  viaggio?: Viaggio;
  arrivoRapportino?: ArrivoDaRapportino;
  onClose: () => void;
  defaultOrderId?: string;
}
export function ViaggioDialog(props: ViaggioDialogProps) {
  const { user } = useAuth();
  if (!user?.id) return null;
  return (
    <ViaggioForm
      key={`${props.companyId}:${user.id}:${props.mezzoId}:${props.viaggio?.id ?? props.arrivoRapportino?.id ?? "nuovo"}`}
      {...props}
    />
  );
}
function ViaggioForm({
  companyId,
  mezzoId,
  viaggio,
  arrivoRapportino,
  onClose,
  defaultOrderId,
}: ViaggioDialogProps) {
  const tr = useT();
  const { user } = useAuth();
  const storageKey = draftViaggioKey(companyId, user?.id ?? "", mezzoId) +
    (arrivoRapportino ? `:arrivo:${arrivoRapportino.id}` : "");
  const [draft, setDraft] = useState<Draft>(() => {
    if (!viaggio && user?.id)
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw && raw.length < 64000) {
          const d = JSON.parse(raw) as Draft;
          if (
            d.versione === 0 &&
            typeof d.id === "string" &&
            (!arrivoRapportino || d.id === arrivoRapportino.id) &&
            typeof d.da === "string" &&
            typeof d.a === "string" &&
            typeof d.ci === "string" &&
            typeof d.cf === "string" &&
            typeof d.note === "string" &&
            typeof d.tariffa === "string" &&
            (d.conducente === undefined ||
              d.conducente === null ||
              typeof d.conducente === "string") &&
            Array.isArray(d.tratte) &&
            d.tratte.length >= 1 &&
            d.tratte.length <= 30 &&
            d.tratte.every(
              (t) =>
                typeof t.id === "string" &&
                typeof t.da === "string" &&
                typeof t.a === "string" &&
                typeof t.km === "string" &&
                typeof t.minuti === "string" &&
                (t.order_id === null || typeof t.order_id === "string") &&
                ["commessa", "generale", "da_attribuire"].includes(
                  t.destinazione,
                ) &&
                ["stimati", "dichiarati"].includes(t.fonte),
            )
          )
            return d;
        }
      } catch {
        /* Le bozze non valide non vengono inviate. */
      }
    return initial(viaggio, arrivoRapportino);
  });
  const [storageError, setStorageError] = useState(false);
  const completed = useRef(false);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [routing, setRouting] = useState<string | null>(null);
  const context = useViaggiContesto(
    companyId,
    mezzoId,
    debounced,
    true,
    defaultOrderId,
  );
  const save = useSalvaViaggio(companyId);
  const [motivo, setMotivo] = useState("");
  const [presetDone, setPresetDone] = useState(false);
  // Adjust once when authorized server options arrive, without overwriting a restored draft.
  if (!presetDone && context.data) {
    setPresetDone(true);
    const site = context.data.cantieri.find((c) => c.id === defaultOrderId);
    if (site && !viaggio)
      setDraft((d) =>
        d.tratte.length === 1 && !d.tratte[0].a && !d.tratte[0].order_id
          ? {
              ...d,
              tratte: [
                {
                  ...d.tratte[0],
                  a: site.label,
                  order_id: site.id,
                  destinazione: "commessa",
                },
              ],
            }
          : d,
      );
  }
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    if (viaggio || !user?.id || completed.current) return;
    // Report actual storage availability while synchronizing the draft with the browser.
    try {
      localStorage.setItem(storageKey, JSON.stringify(draft));
      // eslint-disable-next-line react-hooks/set-state-in-effect -- feedback from browser storage synchronization
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [draft, storageKey, user?.id, viaggio]);
  const update = (patch: Partial<Draft>) =>
    setDraft((d) => ({ ...d, ...patch }));
  const row = (id: string, patch: Partial<Riga>) =>
    setDraft((d) => ({
      ...d,
      tratte: d.tratte.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }));
  const iso = (value: string) => {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString();
  };
  const dati: ViaggioPayload = {
    partenza: iso(draft.da),
    arrivo: iso(draft.a),
    contatore_inizio: numeroViaggio(draft.ci),
    contatore_fine: numeroViaggio(draft.cf),
    conducente_hr_id: context.data?.puo_verificare
      ? (draft.conducente === undefined
          ? context.data.mezzo.conducente_hr_id
          : draft.conducente) || null
      : (context.data?.mezzo.conducente_hr_id ?? null),
    note: draft.note,
    tratte: draft.tratte.map((t) => ({
      ...t,
      da: t.da.trim(),
      a: t.a.trim(),
      km: numeroViaggio(t.km),
      minuti: numeroViaggio(t.minuti),
    })),
    ...(context.data?.vede_costi && context.data?.puo_verificare
      ? { tariffa_km: numeroViaggio(draft.tariffa) }
      : {}),
  };
  const errors = erroriViaggio(dati);
  if (arrivoRapportino && dati.arrivo && giornoItaliano(dati.arrivo) !== arrivoRapportino.giorno)
    errors.push(`Indica l’arrivo del ${formatData(arrivoRapportino.giorno)}.`);
  if (arrivoRapportino && !dati.tratte.some(t => t.order_id === defaultOrderId && t.destinazione === "commessa"))
    errors.push("Collega almeno una tratta a questa commessa.");
  const summary = riepilogoViaggio(dati);
  const giornoPrezzo = dati.partenza ? giornoItaliano(dati.partenza) : "";
  const kmStima = summary.delta != null && Number.isFinite(summary.delta) && summary.delta >= 0 ? summary.delta : summary.km;
  const prima = draft.tratte[0];
  const ultima = draft.tratte.at(-1);
  const partenzaGiro = prima?.da.trim();
  const destinazioneUltima = ultima?.a.trim();
  const aggiungiRientro = Boolean(
    partenzaGiro && destinazioneUltima && partenzaGiro.toLowerCase() !== destinazioneUltima.toLowerCase() && draft.tratte.length < 30,
  );
  const locked =
    viaggio?.stato === "verificato" || viaggio?.stato === "annullato";
  const busy = save.isPending || routing != null;
  const canSave =
    !!context.data?.puo_scrivere &&
    !errors.length &&
    !busy &&
    (!locked || (context.data.puo_verificare && motivo.trim().length >= 5));
  const submit = async (azione: "salva" | "invia" | "verifica" | "annulla") => {
    if (!canSave || (azione === "annulla" && motivo.trim().length < 5)) return;
    try {
      await save.mutateAsync({
        mezzoId,
        id: draft.id,
        versione: draft.versione,
        azione,
        dati,
        motivo,
      });
      completed.current = true;
      if (!viaggio)
        try {
          localStorage.removeItem(storageKey);
        } catch {
          /* Nessuna perdita: il server ha confermato il salvataggio. */
        }
      toast.success(
        azione === "verifica"
          ? tr("Viaggio verificato, nessun costo contabile registrato")
          : azione === "annulla"
            ? tr("Viaggio annullato, storico conservato")
            : azione === "salva"
              ? tr("Bozza salvata")
              : tr("Viaggio inviato all’ufficio"),
      );
      onClose();
    } catch {
      /* Bozza e token rimangono disponibili per il retry. */
    }
  };
  const stima = async (t: Riga) => {
    const c = context.data;
    if (!c || busy) return;
    const point = (label: string) => {
      if (label === "Sede" && c.sede.lat != null && c.sede.lng != null)
        return { lat: c.sede.lat, lng: c.sede.lng };
      const x = c.cantieri.find(
        (x) => x.label === label || x.indirizzo === label,
      );
      return x?.lat != null && x?.lng != null
        ? { lat: x.lat, lng: x.lng }
        : null;
    };
    const from = point(t.da),
      to = point(t.a);
    if (!from || !to) {
      toast.info(
        tr("Scegli sedi o cantieri geolocalizzati dai suggerimenti, oppure inserisci i km manualmente."),
      );
      return;
    }
    setRouting(t.id);
    try {
      const result = await getRoute([from, to]);
      if (!result) throw new Error("Percorso non disponibile");
      row(t.id, {
        km: (Math.round(result.distanceMeters / 10) / 100).toString(),
        minuti: Math.round(result.durationSec / 60).toString(),
        fonte: "stimati",
      });
    } catch {
      toast.error(
        tr("Non riesco a stimare il percorso. Puoi compilare i km manualmente."),
      );
    } finally {
      setRouting(null);
    }
  };
  const number = (n: number | null) =>
    n == null || !Number.isFinite(n)
      ? "—"
      : n.toLocaleString(intlCampo(), { maximumFractionDigits: 2 });

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        className="flex max-h-[94dvh] max-w-3xl flex-col overflow-hidden rounded-2xl p-0"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="shrink-0 border-b px-4 py-4 sm:px-6">
          <DialogTitle>
            {viaggio ? tr("Rivedi viaggio") : arrivoRapportino ? tr("Completa l’arrivo del {giorno}", { giorno: formatData(arrivoRapportino.giorno) }) : tr("Registra viaggio e tappe")}
          </DialogTitle>
          <DialogDescription>
            {context.data?.mezzo.nome ?? tr("Mezzo")} ·{" "}
            {context.data?.mezzo.conducente
              ? tr("In carico a {conducente}", { conducente: String(context.data.mezzo.conducente ?? "") })
              : tr("Conducente non assegnato")}
            {". "}{tr("Registra il viaggio una sola volta, anche se trasporti più persone.")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5 overflow-y-auto px-4 py-4 sm:px-6">
          {context.isPending && (
            <p role="status">{tr("Carico mezzo e cantieri accessibili…")}</p>
          )}
          {context.isError && (
            <div
              role="alert"
              className="rounded-xl border border-amber-200 p-3 text-sm"
            >
              {context.error.message}{" "}
              <Button variant="outline" onClick={() => void context.refetch()}>
                {tr("Riprova")}
              </Button>
            </div>
          )}
          {storageError && (
            <p role="alert" className="text-sm text-amber-800">
              {tr("Questo browser non conserva la bozza. Non chiudere prima del salvataggio sul server.")}
            </p>
          )}
          <fieldset
            disabled={busy || !context.data?.puo_scrivere}
            className="space-y-5 disabled:opacity-70"
          >
            {context.data?.puo_verificare && (
              <div className="space-y-1">
                <Label>{tr("Chi ha guidato questo viaggio?")}</Label>
                <ViaggioSelect
                  label={tr("Conducente del viaggio")}
                  value={dati.conducente_hr_id ?? ""}
                  onValueChange={(value) =>
                    update({ conducente: value || null })
                  }
                  options={[
                    { value: "", label: "Da confermare" },
                    ...context.data.conducenti.map((c) => ({
                      value: c.id,
                      label: c.label,
                    })),
                  ]}
                />
                <p className="text-xs text-slate-600">
                  {tr("Per trovare altri conducenti, cerca per nome nel campo di ricerca qui sotto.")}
                </p>
              </div>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1 text-sm">
                <span className="flex items-center justify-between">
                  <Label htmlFor="viaggio-partenza">{tr("Partenza")}</Label>
                  {!arrivoRapportino && <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      update({ da: dateInput(new Date().toISOString()) })
                    }
                  >
                    {tr("Partenza ora")}
                  </Button>}
                </span>
                <Input
                  aria-label={tr("Data e ora partenza")}
                  id="viaggio-partenza"
                  type="datetime-local"
                  value={draft.da}
                  onChange={(e) => update({ da: e.target.value })}
                />
              </div>
              <div className="space-y-1 text-sm">
                <span className="flex items-center justify-between">
                  <Label htmlFor="viaggio-arrivo">{tr("Arrivo")}</Label>
                  {!arrivoRapportino && <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      update({ a: dateInput(new Date().toISOString()) })
                    }
                  >
                    {tr("Arrivo ora")}
                  </Button>}
                </span>
                <Input
                  aria-label={tr("Data e ora arrivo")}
                  id="viaggio-arrivo"
                  type="datetime-local"
                  value={draft.a}
                  onChange={(e) => update({ a: e.target.value })}
                />
              </div>
            </div>
            <details className="rounded-xl border bg-slate-50 p-3">
              <summary className="cursor-pointer text-sm font-semibold">
                {tr("Contachilometri iniziale e finale (facoltativi)")}
              </summary>
              <p className="mb-3 mt-2 text-xs text-slate-600">{tr("Facoltativo: inserisci entrambi, senza punti delle migliaia. Ultimo valore in anagrafica: {valore} km; potrebbe non essere aggiornato.", { valore: String(number(context.data?.mezzo.contatore ?? null) ?? "") })}</p>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1 text-sm">
                  {tr("Iniziale")}
                  <Input
                    aria-label={tr("Contachilometri iniziale")}
                    inputMode="decimal"
                    value={draft.ci}
                    onChange={(e) => update({ ci: e.target.value })}
                    placeholder={tr("es. 84210")}
                  />
                </label>
                <label className="space-y-1 text-sm">
                  {tr("Finale")}
                  <Input
                    aria-label={tr("Contachilometri finale")}
                    inputMode="decimal"
                    value={draft.cf}
                    onChange={(e) => update({ cf: e.target.value })}
                    placeholder={tr("es. 84290")}
                  />
                </label>
              </div>
            </details>
            <details className="rounded-xl border p-3">
              <summary className="cursor-pointer text-sm font-medium">
                {context.data?.puo_verificare ? tr("Cerca altri cantieri o conducenti") : tr("Cerca altri cantieri")}
              </summary>
              <div className="mt-2 space-y-2">
                <Label htmlFor="viaggio-cantieri-search">
                  {tr("Cerca cantieri o conducenti")}
                </Label>
                <Input
                  id="viaggio-cantieri-search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={tr("Codice o indirizzo, anche per ritiri e consegne…")}
                />
                {context.data?.altri_cantieri && (
                  <p className="text-xs text-slate-600">
                    {tr("Mostrati 50 cantieri: cerca per trovare gli altri.")}
                  </p>
                )}
              </div>
            </details>
            <ol className="space-y-3">
              {draft.tratte.map((t, i) => (
                <li
                  key={t.id}
                  className="space-y-3 rounded-2xl border bg-white p-3 sm:p-4"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">{tr("Tratta {i}", { i: i + 1 })}</h3>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={tr("Elimina tratta {i}", { i: i + 1 })}
                      disabled={draft.tratte.length === 1}
                      onClick={() =>
                        update({
                          tratte: draft.tratte.filter((x) => x.id !== t.id),
                        })
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1 text-sm">
                      <span>{tr("Da")}</span>
                      <TappaInput
                        label={tr("Partenza tratta {i}", { i: i + 1 })}
                        value={t.da}
                        onChange={(value) => row(t.id, { da: value })}
                        cantieri={context.data?.cantieri ?? []}
                      />
                    </div>
                    <div className="space-y-1 text-sm">
                      <span>A</span>
                      <TappaInput
                        label={tr("Destinazione tratta {i}", { i: i + 1 })}
                        value={t.a}
                        onChange={(value) => row(t.id, { a: value })}
                        cantieri={context.data?.cantieri ?? []}
                      />
                    </div>
                  </div>
                  <ViaggioSelect
                    label={tr("Attribuzione tratta {i}", { i: i + 1 })}
                    value={t.order_id ?? t.destinazione}
                    onValueChange={(value) =>
                      row(
                        t.id,
                        value === "generale" || value === "da_attribuire"
                          ? { destinazione: value, order_id: null }
                          : { destinazione: "commessa", order_id: value },
                      )
                    }
                    options={[
                      {
                        value: "da_attribuire",
                        label: "Da attribuire in ufficio",
                      },
                      {
                        value: "generale",
                        label: "Spostamento generale (non su commessa)",
                      },
                      ...(t.order_id &&
                      !context.data?.cantieri.some((c) => c.id === t.order_id)
                        ? [
                            {
                              value: t.order_id,
                              label: tr("Commessa già collegata"),
                            },
                          ]
                        : []),
                      ...(context.data?.cantieri.map((c) => ({
                        value: c.id,
                        label: c.label,
                      })) ?? []),
                    ]}
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1 text-sm">
                      {tr("Km della tratta")}
                      <Input
                        aria-label={tr("Km tratta {i}", { i: i + 1 })}
                        inputMode="decimal"
                        value={t.km}
                        onChange={(e) =>
                          row(t.id, { km: e.target.value, fonte: "dichiarati" })
                        }
                        placeholder={tr("Da completare")}
                      />
                    </label>
                    <Button
                      variant="outline"
                      className="self-end"
                      size="sm"
                      onClick={() => void stima(t)}
                    >
                      <Route className="mr-1 h-4 w-4" />
                      {routing === t.id ? tr("Calcolo…") : tr("Stima percorso")}
                    </Button>
                  </div>
                  <p className="text-xs text-slate-600">
                    {t.fonte === "stimati"
                      ? tr("Km stimati, da verificare")
                      : tr("Km dichiarati da chi guida")}
                  </p>
                  <details className="rounded-xl border p-2.5">
                    <summary className="cursor-pointer text-xs font-medium">
                      {tr("Tempi e tipo di km")}
                    </summary>
                    <div className="mt-3 space-y-3">
                      <label className="block space-y-1 text-sm">
                        {tr("Minuti di viaggio")}
                        <Input
                          aria-label={tr("Minuti tratta {i}", { i: i + 1 })}
                          inputMode="decimal"
                          value={t.minuti}
                          onChange={(e) =>
                            row(t.id, { minuti: e.target.value })
                          }
                          placeholder={tr("Facoltativi")}
                        />
                      </label>
                      <ViaggioSelect
                        label={tr("Fonte km tratta {i}", { i: i + 1 })}
                        value={t.fonte}
                        onValueChange={(value) =>
                          row(t.id, { fonte: value as Riga["fonte"] })
                        }
                        options={[
                          {
                            value: "dichiarati",
                            label: "Km dichiarati da chi guida",
                          },
                          {
                            value: "stimati",
                            label: "Km stimati, da verificare",
                          },
                        ]}
                      />
                    </div>
                  </details>
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={draft.tratte.length >= 30} onClick={() =>
                update({ tratte: [...draft.tratte, nuovaTratta(ultima?.a)] })
              }><Plus className="mr-1 h-4 w-4" /> {tr("Aggiungi tappa / tratta")}</Button>
              {aggiungiRientro && <Button type="button" variant="outline" onClick={() => {
                const ordini = [...new Set(draft.tratte.flatMap(t => t.order_id ? [t.order_id] : []))];
                const order_id = ordini.length === 1 ? ordini[0] : null;
                update({ tratte: [...draft.tratte, { ...nuovaTratta(destinazioneUltima), a: partenzaGiro!,
                  order_id, destinazione: order_id ? "commessa" : "generale" }] });
              }}><Undo2 className="mr-1 h-4 w-4" /> {tr("Aggiungi rientro")}</Button>}
            </div>
            <p className="text-xs text-slate-600">{tr("Stima o inserisci i km di ogni tratta, compreso il rientro. Puoi aggiornare i km effettivi prima della verifica.")}</p>
            <details className="rounded-xl border p-3">
              <summary className="cursor-pointer text-sm font-medium">
                {tr("Note viaggio (facoltative)")}
              </summary>
              <label className="mt-2 block space-y-1 text-sm">
                {tr("Note")}
                <textarea
                  aria-label={tr("Note viaggio")}
                  className="min-h-20 w-full rounded-xl border p-3"
                  maxLength={2000}
                  value={draft.note}
                  onChange={(e) => update({ note: e.target.value })}
                />
              </label>
            </details>
            {context.data?.vede_costi && context.data.puo_verificare && (
              <label className="block space-y-1 text-sm">
                {tr("Tariffa gestionale €/km (facoltativa)")}
                <Input
                  aria-label={tr("Tariffa gestionale al km")}
                  inputMode="decimal"
                  value={draft.tariffa}
                  onChange={(e) => update({ tariffa: e.target.value })}
                />
                <span className="block text-xs text-slate-600">
                  {tr("Tariffa onnicomprensiva, senza sommare di nuovo carburante e quote già incluse. È una simulazione gestionale, non un costo contabile.")}
                </span>
              </label>
            )}
            {viaggio && context.data?.puo_verificare && (
              <label className="block space-y-1 text-sm">
                {tr("Motivo rettifica o annullamento")}
                <Input
                  aria-label={tr("Motivo rettifica")}
                  maxLength={1000}
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder={tr("Obbligatorio per modificare verificati o annullare")}
                />
              </label>
            )}
          </fieldset>
          <div
            role="status"
            className="space-y-1 rounded-xl bg-blue-50 p-3 text-sm text-blue-950"
          >
            <p>
              <strong>{tr("{km} km", { km: String(number(summary.km) ?? "") })}</strong> {tr("nelle tratte · {mancanti} da misurare · {daAttribuire} da attribuire", { mancanti: summary.mancanti, daAttribuire: summary.daAttribuire })}
            </p>
            <p>{tr("Dichiarati: {kmDichiarati} km · Stimati: {kmStimati} km", { kmDichiarati: String(number(summary.kmDichiarati) ?? ""), kmStimati: String(number(summary.kmStimati) ?? "") })}</p>
            {context.data?.vede_costi && user?.id && giornoPrezzo && kmStima != null && dati.tariffa_km == null && (
              <StimaCarburanteViaggio company={companyId} mezzo={mezzoId} giorno={giornoPrezzo} km={kmStima}
                parziale={summary.delta == null && summary.mancanti > 0} />
            )}
            {summary.tappeDiscontinue && (
              <p>
                {tr("Il percorso ha un’interruzione tra le tappe: aggiungi la tratta mancante o correggi i luoghi.")}
              </p>
            )}
            {summary.tempiIncoerenti && (
              <p>
                {tr("La somma dei minuti di viaggio supera l’intervallo tra partenza e arrivo.")}
              </p>
            )}
            {summary.delta != null && (
              <p>
                {tr("Contachilometri: {delta} km · Scarto rispetto alle tratte: {scarto} km", { delta: number(summary.delta), scarto: number(summary.scarto) })}
                {summary.scarto != null && Math.abs(summary.scarto) > 0.1
                  ? ` ${tr("— da chiarire, non ripartito automaticamente")}`
                  : ""}
              </p>
            )}
          </div>
          {errors.length > 0 && (
            <ul className="list-inside list-disc text-xs text-slate-600">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          {save.isError && (
            <p
              role="alert"
              className="rounded-xl border border-red-200 p-3 text-sm text-red-800"
            >{tr("{message} La compilazione è rimasta aperta: non creare un nuovo viaggio se stai riprovando lo stesso invio.", { message: String(save.error.message ?? "") })}</p>
          )}
        </div>
        <DialogFooter className="shrink-0 flex-wrap gap-2 border-t bg-white px-4 py-3 sm:px-6">
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            {tr("Chiudi")}
          </Button>
          <Button
            variant="outline"
            disabled={!canSave}
            onClick={() => void submit("salva")}
          >
            {locked ? tr("Riapri come bozza") : tr("Salva bozza")}
          </Button>
          {context.data?.puo_verificare && viaggio && (
            <Button
              variant="outline"
              disabled={!canSave || motivo.trim().length < 5}
              onClick={() => void submit("annulla")}
            >
              {tr("Annulla viaggio")}
            </Button>
          )}
          {context.data?.puo_verificare ? (
            <Button
              disabled={
                !canSave || summary.daVerificare || !dati.conducente_hr_id
              }
              onClick={() => void submit("verifica")}
            >
              {tr("Verifica viaggio")}
            </Button>
          ) : (
            <Button disabled={!canSave} onClick={() => void submit("invia")}>
              {tr("Invia all’ufficio")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function StimaCarburanteViaggio({ company, mezzo, giorno, km, parziale }: {
  company: string; mezzo: string; giorno: string; km: number; parziale: boolean;
}) {
  const t = useT();
  const { data } = useCarburanteMezzo(company, mezzo, giorno);
  const consumo = data?.consumo?.litri_100;
  const prezzoLitro = data?.stima?.euro_litro;
  if (consumo == null || prezzoLitro == null) return null;
  return <p>{parziale ? t("Carburante parziale") : t("Carburante stimato")} · <strong>{formatCurrency(km * consumo / 100 * prezzoLitro)}</strong>
    {" "}{t("su {km} km ·", { km: km.toLocaleString(intlCampo(), { maximumFractionDigits: 2 }) })} {data.stima?.fonte === "mimit" ? t("media MIMIT") : t("prezzo aziendale")} {t("al netto IVA")}
  </p>;
}
