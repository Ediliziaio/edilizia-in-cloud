import { useState } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  Calendar,
  Search,
  SlidersHorizontal,
  UserRound,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  caricaContestoCollegamenti,
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
  scegliFiltroPianta,
  valoreFiltroPianta,
  type FiltriArchivioPiante,
} from "@/lib/planimetrie/elenco";
import { RicercaSchedaFiltro } from "./RicercaSchedaFiltro";
interface Props {
  value: FiltriArchivioPiante;
  onChange: (patch: Partial<FiltriArchivioPiante>) => void;
  piante: RigaPlanimetria[];
  mappa?: MappaCollegamenti;
  userId?: string;
  companyId?: string;
  accessi?: Record<TipoCollegamento, boolean>;
  risultati: number;
}
const stati = [
  ["attive", "Tutte le attive"],
  ["bozza", "Bozze"],
  ["in_uso", "In uso"],
  ["archiviata", "Archiviate"],
  ["tutte", "Tutte, incluse archiviate"],
] as const;
const displayDate = (iso: string) => iso.split("-").reverse().join("/");
export function FiltriArchivioPiante({
  value: v,
  onChange,
  piante,
  mappa,
  userId,
  companyId,
  accessi,
  risultati,
}: Props) {
  const [open, setOpen] = useState(false);
  const mobile = useIsMobile();
  const picker = (tipo: TipoCollegamento, toolbar = false) =>
    accessi?.[tipo] ? (
      <RicercaSchedaFiltro
        tipo={tipo}
        value={valoreFiltroPianta(v, tipo)}
        onChange={(value) => onChange(scegliFiltroPianta(v, tipo, value))}
        companyId={companyId}
        scelta={mappa?.[tipo][valoreFiltroPianta(v, tipo)]}
        className={toolbar ? "w-[170px]" : "w-full"}
      />
    ) : null;
  const selectedNames = useQueries({
    queries: TIPI_COLLEGAMENTO.map((tipo) => {
      const value = valoreFiltroPianta(v, tipo);
      return {
        queryKey: ["planimetrie-filtro-scheda", companyId, tipo, value],
        queryFn: async () => {
          const data = await caricaContestoCollegamenti(
            companyId!,
            { [tipo]: { id: value, nome: "" } },
            {
              cliente: false,
              contatto: false,
              preventivo: false,
              commessa: false,
              computo: false,
              [tipo]: true,
            },
          );
          return data[tipo][value] || null;
        },
        enabled:
          !!companyId &&
          !!accessi?.[tipo] &&
          !!value &&
          !["presenti", "nessuno"].includes(value) &&
          !mappa?.[tipo][value],
        staleTime: 60_000,
        retry: 1,
      };
    }),
  });
  const pills: Array<{ label: string; reset: Partial<FiltriArchivioPiante> }> =
    [];
  if (v.ricerca)
    pills.push({ label: `Ricerca: ${v.ricerca}`, reset: { ricerca: "" } });
  if (v.stato !== "attive")
    pills.push({
      label: `Stato: ${stati.find(([key]) => key === v.stato)?.[1]}`,
      reset: { stato: "attive" },
    });
  for (const tipo of TIPI_COLLEGAMENTO) {
    const value = valoreFiltroPianta(v, tipo);
    if (!value) continue;
    const label = DEFINIZIONI_COLLEGAMENTI[tipo].titolo;
    pills.push({
      label: `${label}: ${value === "presenti" ? "associato" : value === "nessuno" ? "nessuno" : mappa?.[tipo][value]?.nome || selectedNames[TIPI_COLLEGAMENTO.indexOf(tipo)].data?.nome || "selezionato"}`,
      reset: scegliFiltroPianta(v, tipo, ""),
    });
  }
  if (v.collegamento === "collegate" || v.collegamento === "libere")
    pills.push({
      label:
        v.collegamento === "collegate"
          ? "Con schede associate"
          : "Senza schede associate",
      reset: { collegamento: "tutti", riferimento: "" },
    });
  if (v.soloMie)
    pills.push({ label: "Solo i miei progetti", reset: { soloMie: false } });
  if (v.dal || v.al)
    pills.push({
      label:
        v.dal && v.al
          ? `Periodo: ${displayDate(v.dal)} – ${displayDate(v.al)}`
          : v.dal
            ? `Dal ${displayDate(v.dal)}`
            : `Al ${displayDate(v.al)}`,
      reset: { dal: "", al: "" },
    });
  const activeCount = pills.length - (v.ricerca ? 1 : 0);
  const period = (days: number) => {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - days + 1);
    onChange({ dal: giornoLocalePianta(start), al: giornoLocalePianta(end) });
  };
  return (
    <section aria-label="Filtri delle planimetrie" className="space-y-2">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-2.5 sm:p-3">
          <div className="relative min-w-[140px] flex-1">
            <Search
              className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              aria-label="Cerca una pianta"
              placeholder="Cerca progetto…"
              value={v.ricerca}
              onChange={(e) => onChange({ ricerca: e.target.value })}
              className="h-9 pl-8 pr-9"
            />
            {v.ricerca && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-0.5 top-0.5 h-8 w-8"
                aria-label="Svuota la ricerca"
                onClick={() => onChange({ ricerca: "" })}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <div className="hidden items-center gap-2 md:flex">
            {picker("cliente", true)}
            {picker("contatto", true)}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 px-2.5 sm:px-3"
            onClick={() => setOpen(true)}
            aria-label="Filtri"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Filtri</span>
            {activeCount > 0 && (
              <Badge className="ml-1 h-5 bg-orange-500 px-1.5 text-[10px] hover:bg-orange-500">
                {activeCount}
              </Badge>
            )}
          </Button>
        </CardContent>
      </Card>
      {(pills.length > 0 || v.ordine !== "recenti") && (
        <div
          className="flex flex-wrap items-center gap-1.5"
          aria-label="Filtri applicati"
        >
          {pills.map((pill) => (
            <Badge
              key={pill.label}
              variant="secondary"
              className="max-w-full gap-1 font-normal"
            >
              <span className="max-w-[250px] truncate" title={pill.label}>
                {pill.label}
              </span>
              <button
                type="button"
                aria-label={`Rimuovi filtro ${pill.label}`}
                onClick={() => onChange(pill.reset)}
                className="rounded-sm p-0.5 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground"
            onClick={() => onChange(FILTRI_PIANTE_INIZIALI)}
          >
            <X className="mr-1 h-3 w-3" />
            Azzera filtri
          </Button>
        </div>
      )}
      <p
        role="status"
        aria-live="polite"
        className="text-xs text-muted-foreground"
      >
        {risultati} di {piante.length} planimetrie
        {v.stato === "attive" ? " · escluse le archiviate" : ""}
      </p>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side={mobile ? "bottom" : "right"}
          className={
            mobile
              ? "flex max-h-[90dvh] flex-col rounded-t-2xl p-0"
              : "flex w-full flex-col overflow-hidden p-0 sm:max-w-md"
          }
        >
          <SheetHeader className="shrink-0 border-b px-5 py-5 text-left">
            <SheetTitle className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-orange-600" />
              Filtri planimetrie
              {activeCount > 0 && (
                <Badge className="bg-orange-500 text-[10px] hover:bg-orange-500">
                  {activeCount} attivi
                </Badge>
              )}
            </SheetTitle>
            <SheetDescription>
              Seleziona cliente, contatto, stato e periodo.
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
            <section className="space-y-3">
              <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <UserRound className="h-3.5 w-3.5" />
                Cliente e contatto
              </h3>
              {(["cliente", "contatto"] as const).map(
                (tipo) =>
                  accessi?.[tipo] && (
                    <div key={tipo} className="space-y-1.5">
                      <Label className="text-xs">
                        {DEFINIZIONI_COLLEGAMENTI[tipo].titolo}
                      </Label>
                      {picker(tipo)}
                    </div>
                  ),
              )}
            </section>
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Stato e autore
              </h3>
              <Select
                value={v.stato}
                onValueChange={(value) =>
                  onChange({ stato: value as FiltriArchivioPiante["stato"] })
                }
              >
                <SelectTrigger aria-label="Stato planimetria" className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {stati.map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label} (
                      {
                        filtraElencoPiante(
                          piante,
                          { ...v, stato: key },
                          mappa,
                          userId,
                        ).length
                      }
                      )
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <label className="flex w-fit items-center gap-2 text-sm">
                <Checkbox
                  checked={v.soloMie}
                  disabled={!userId}
                  onCheckedChange={(value) =>
                    onChange({ soloMie: value === true })
                  }
                />
                Solo i miei progetti
              </label>
            </section>
            <section className="space-y-3">
              <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" />
                Ultimo aggiornamento
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1.5 text-xs">
                  Dal
                  <Input
                    aria-label="Aggiornata dal"
                    type="date"
                    value={v.dal}
                    onChange={(e) => onChange({ dal: e.target.value })}
                    className="h-9"
                  />
                </label>
                <label className="space-y-1.5 text-xs">
                  Al
                  <Input
                    aria-label="Aggiornata al"
                    type="date"
                    value={v.al}
                    onChange={(e) => onChange({ al: e.target.value })}
                    className="h-9"
                  />
                </label>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[7, 30, 90].map((days) => (
                  <Button
                    key={days}
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    onClick={() => period(days)}
                  >
                    Ultimi {days} giorni
                  </Button>
                ))}
                {(v.dal || v.al) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => onChange({ dal: "", al: "" })}
                  >
                    Qualsiasi data
                  </Button>
                )}
              </div>
              {v.dal && v.al && v.dal > v.al && (
                <p role="alert" className="text-xs text-destructive">
                  La data iniziale deve precedere o coincidere con quella
                  finale.
                </p>
              )}
            </section>
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Preventivo e lavoro
              </h3>
              {(["preventivo", "commessa", "computo"] as const).map(
                (tipo) =>
                  accessi?.[tipo] && (
                    <div key={tipo} className="space-y-1.5">
                      <Label className="text-xs">
                        {DEFINIZIONI_COLLEGAMENTI[tipo].titolo}
                      </Label>
                      {picker(tipo)}
                    </div>
                  ),
              )}
            </section>
            <section className="space-y-2">
              <Label className="text-xs">Ordinamento</Label>
              <Select
                value={v.ordine}
                onValueChange={(value) =>
                  onChange({ ordine: value as FiltriArchivioPiante["ordine"] })
                }
              >
                <SelectTrigger aria-label="Ordina planimetrie" className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recenti">Ultime modificate</SelectItem>
                  <SelectItem value="nome">Nome A–Z</SelectItem>
                  <SelectItem value="meno_recenti">Meno recenti</SelectItem>
                </SelectContent>
              </Select>
            </section>
          </div>
          <div className="flex shrink-0 gap-2 border-t bg-background p-4">
            <Button
              variant="outline"
              onClick={() => onChange(FILTRI_PIANTE_INIZIALI)}
            >
              Azzera
            </Button>
            <Button
              className="flex-1"
              disabled={!!(v.dal && v.al && v.dal > v.al)}
              onClick={() => setOpen(false)}
            >
              Mostra {risultati}{" "}
              {risultati === 1 ? "planimetria" : "planimetrie"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </section>
  );
}
