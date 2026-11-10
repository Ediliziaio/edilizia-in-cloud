import { useId, useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEFINIZIONI_COLLEGAMENTI,
  TIPI_COLLEGAMENTO,
  type MappaCollegamenti,
  type TipoCollegamento,
} from "@/lib/planimetrie/collegamenti";
import type { RigaPlanimetria } from "@/lib/planimetrie/archivio";
import {
  FILTRI_PIANTE_INIZIALI,
  filtraElencoPiante,
  giornoLocalePianta,
  type FiltriArchivioPiante,
} from "@/lib/planimetrie/elenco";
interface Props {
  value: FiltriArchivioPiante;
  onChange: (patch: Partial<FiltriArchivioPiante>) => void;
  piante: RigaPlanimetria[];
  mappa?: MappaCollegamenti;
  userId?: string;
  risultati: number;
}
const stati = [
  ["attive", "Tutte le attive"],
  ["bozza", "Bozze"],
  ["in_uso", "In uso"],
  ["archiviata", "Archiviate"],
  ["tutte", "Tutte"],
] as const;
const linkLabels: Record<string, string> = {
  tutti: "Tutti i collegamenti",
  collegate: "Con collegamenti",
  libere: "Da collegare",
  contatto: "Contatto CRM",
  cliente: "Cliente",
  preventivo: "Preventivo",
  commessa: "Commessa",
  computo: "Computo metrico",
};
const displayDate = (iso: string) => iso.split("-").reverse().join("/");
export function FiltriArchivioPiante({
  value: v,
  onChange,
  piante,
  mappa,
  userId,
  risultati,
}: Props) {
  const id = useId();
  const [expanded, setExpanded] = useState<boolean | null>(null);
  const advanced = !!(v.dal || v.al || v.soloMie || v.riferimento);
  const open = expanded ?? advanced;
  const tipo = TIPI_COLLEGAMENTO.includes(v.collegamento as TipoCollegamento)
    ? (v.collegamento as TipoCollegamento)
    : null;
  const ids = tipo
    ? new Set(
        piante
          .map((p) => p[DEFINIZIONI_COLLEGAMENTI[tipo].colonna])
          .filter(Boolean),
      )
    : new Set();
  const refs = tipo
    ? Object.values(mappa?.[tipo] || {})
        .filter((r) => ids.has(r.id))
        .sort((a, b) => a.nome.localeCompare(b.nome, "it"))
    : [];
  const pills: Array<{ label: string; reset: Partial<FiltriArchivioPiante> }> =
    [];
  if (v.ricerca)
    pills.push({ label: `Ricerca: ${v.ricerca}`, reset: { ricerca: "" } });
  if (v.stato !== "attive")
    pills.push({
      label: `Stato: ${stati.find(([key]) => key === v.stato)?.[1]}`,
      reset: { stato: "attive" },
    });
  if (v.collegamento !== "tutti")
    pills.push({
      label: linkLabels[v.collegamento],
      reset: { collegamento: "tutti", riferimento: "" },
    });
  if (v.riferimento)
    pills.push({
      label: `Scheda: ${refs.find((r) => r.id === v.riferimento)?.nome || "Scheda selezionata"}`,
      reset: { riferimento: "" },
    });
  if (v.soloMie)
    pills.push({ label: "Solo i miei progetti", reset: { soloMie: false } });
  if (v.dal)
    pills.push({ label: `Dal ${displayDate(v.dal)}`, reset: { dal: "" } });
  if (v.al) pills.push({ label: `Al ${displayDate(v.al)}`, reset: { al: "" } });
  const period = (days: number) => {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - days + 1);
    onChange({ dal: giornoLocalePianta(start), al: giornoLocalePianta(end) });
  };
  return (
    <section
      aria-label="Filtri delle planimetrie"
      className="space-y-3 rounded-xl border bg-card p-3 sm:p-4"
    >
      <div
        role="group"
        aria-label="Stato delle planimetrie"
        className="flex gap-1 overflow-x-auto pb-1"
      >
        {stati.map(([key, label]) => (
          <Button
            key={key}
            size="sm"
            variant={v.stato === key ? "secondary" : "ghost"}
            aria-pressed={v.stato === key}
            onClick={() => onChange({ stato: key })}
            className="shrink-0"
          >
            {label}
            <span className="ml-1.5 text-xs text-muted-foreground">
              {
                filtraElencoPiante(piante, { ...v, stato: key }, mappa, userId)
                  .length
              }
            </span>
          </Button>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_180px_180px_auto]">
        <div className="relative sm:col-span-2 xl:col-span-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground"
          />
          <Input
            aria-label="Cerca una pianta"
            placeholder="Cerca progetto, cliente, commessa…"
            value={v.ricerca}
            onChange={(e) => onChange({ ricerca: e.target.value })}
            className="pl-9 pr-10"
          />
          {v.ricerca && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1 h-8 w-8"
              aria-label="Svuota la ricerca"
              onClick={() => onChange({ ricerca: "" })}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        <Select
          value={v.collegamento}
          onValueChange={(value) =>
            onChange({
              collegamento: value as FiltriArchivioPiante["collegamento"],
              riferimento: "",
            })
          }
        >
          <SelectTrigger aria-label="Filtra collegamenti">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(linkLabels).map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={v.ordine}
          onValueChange={(value) =>
            onChange({ ordine: value as FiltriArchivioPiante["ordine"] })
          }
        >
          <SelectTrigger aria-label="Ordina planimetrie">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recenti">Ultime modificate</SelectItem>
            <SelectItem value="nome">Nome A–Z</SelectItem>
            <SelectItem value="meno_recenti">Meno recenti</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant={open ? "secondary" : "outline"}
          aria-expanded={open}
          aria-controls={id}
          className="sm:col-span-2 xl:col-span-1"
          onClick={() => setExpanded(!open)}
        >
          <SlidersHorizontal className="mr-2 h-4 w-4" />
          Filtri avanzati
          {pills.length > 0 && (
            <span className="ml-2 rounded bg-primary/10 px-1.5 text-xs">
              {pills.length}
            </span>
          )}
        </Button>
      </div>
      {open && (
        <div id={id} className="space-y-4 border-t pt-4">
          <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
            <div className="space-y-1.5">
              <label
                htmlFor={`${id}-dal`}
                className="text-xs font-medium text-muted-foreground"
              >
                Aggiornata dal
              </label>
              <Input
                id={`${id}-dal`}
                aria-label="Aggiornata dal"
                type="date"
                value={v.dal}
                onChange={(e) => onChange({ dal: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor={`${id}-al`}
                className="text-xs font-medium text-muted-foreground"
              >
                Aggiornata al
              </label>
              <Input
                id={`${id}-al`}
                aria-label="Aggiornata al"
                type="date"
                value={v.al}
                onChange={(e) => onChange({ al: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">
                Scheda specifica
              </p>
              <Select
                disabled={!tipo || (!refs.length && !v.riferimento)}
                value={v.riferimento || "all"}
                onValueChange={(value) =>
                  onChange({ riferimento: value === "all" ? "" : value })
                }
              >
                <SelectTrigger aria-label="Filtra per scheda specifica">
                  <SelectValue placeholder="Scegli il tipo di collegamento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {tipo
                      ? "Tutte le schede associate"
                      : "Scegli prima il collegamento"}
                  </SelectItem>
                  {v.riferimento &&
                    !refs.some((r) => r.id === v.riferimento) && (
                      <SelectItem value={v.riferimento}>
                        Scheda selezionata
                      </SelectItem>
                    )}
                  {refs.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                {!tipo
                  ? "Scegli Cliente, Preventivo, Commessa, Computo o Contatto nel filtro collegamenti."
                  : !refs.length
                    ? "Nessuna scheda consultabile tra quelle associate alle planimetrie."
                    : "Solo schede già associate alle planimetrie."}
              </p>
            </div>
          </div>
          <div
            className="flex flex-wrap items-center gap-2"
            role="group"
            aria-label="Periodi rapidi"
          >
            <span className="mr-1 text-xs text-muted-foreground">
              Ultimo aggiornamento:
            </span>
            {[7, 30, 90].map((days) => (
              <Button
                key={days}
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => period(days)}
              >
                Ultimi {days} giorni
              </Button>
            ))}
            {(v.dal || v.al) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => onChange({ dal: "", al: "" })}
              >
                Qualsiasi data
              </Button>
            )}
          </div>
          <label className="flex w-fit items-center gap-2 text-sm">
            <Checkbox
              checked={v.soloMie}
              disabled={!userId}
              onCheckedChange={(value) => onChange({ soloMie: value === true })}
            />
            Solo i miei progetti
          </label>
          {v.dal && v.al && v.dal > v.al && (
            <p role="alert" className="text-xs text-destructive">
              La data iniziale deve precedere o coincidere con quella finale.
            </p>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <p
          role="status"
          aria-live="polite"
          className="text-xs text-muted-foreground"
        >
          {risultati} di {piante.length} planimetrie
          {v.stato === "attive"
            ? " · escluse le archiviate"
            : v.stato === "tutte"
              ? " · incluse le archiviate"
              : ""}
        </p>
        {(pills.length > 0 || v.ordine !== "recenti") && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => onChange(FILTRI_PIANTE_INIZIALI)}
          >
            Azzera filtri
          </Button>
        )}
      </div>
      {!!pills.length && (
        <div className="flex flex-wrap gap-1.5" aria-label="Filtri applicati">
          {pills.map((pill) => (
            <button
              key={pill.label}
              aria-label={`Rimuovi filtro ${pill.label}`}
              onClick={() => onChange(pill.reset)}
              className="inline-flex max-w-full items-center gap-1.5 rounded-full border bg-muted/35 px-2.5 py-1 text-xs text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="max-w-[250px] truncate" title={pill.label}>
                {pill.label}
              </span>
              <X className="h-3 w-3 shrink-0" aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
