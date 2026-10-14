import { useMemo, useRef, useState } from "react";
import {
  Search,
  Wrench,
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { formatPrezzoUnitario } from "@/lib/tariffe/economiaTariffa";
import { formatCurrency } from "@/lib/formatters";
import { categoriaPrezzarioTariffa } from "@/lib/prezzario/catalogo";
import { unitaTariffa } from "@/lib/listino/costoTariffa";
import {
  GRUPPI_LAVORAZIONE,
  gruppoLavorazione,
} from "@/lib/tariffe/costoLavorazione";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import type { TariffaPro } from "@/hooks/usePreventivoCosti";
import { LinkImpostazione } from "@/components/impostazioni/LinkImpostazione";
import {
  areaDiVerticale,
  nomeArea as etichettaArea,
} from "@/lib/listino/areeStandard";

interface Props {
  tariffe: TariffaPro[];
  onPick: (tariffa: TariffaPro, quantita: number) => void;
  quantitaIniziale?: (t: TariffaPro) => number;
  prezzoUnitario?: (t: TariffaPro) => number;
  attivo?: boolean;
  ambito?: string;
  nomeArea?: string;
}
const unitaLeggibile = (t: TariffaPro) =>
  ({ mq: "m²", mc: "m³", a_corpo: "a corpo", h: "ore", gg: "giorni" })[
    unitaTariffa(t)
  ] ?? unitaTariffa(t);
const PAGINA = 30;

/** Catalogo del servizio: selezione, quantità e importo prima di aggiungere. */
export function TariffePicker({
  tariffe,
  onPick,
  quantitaIniziale,
  prezzoUnitario,
  attivo = true,
  ambito = "all",
  nomeArea,
}: Props) {
  const isMobile = useIsMobile();
  const dettagliRef = useRef<HTMLElement>(null);
  const elencoRef = useRef<HTMLDivElement>(null);
  const [cerca, setCerca] = useState("");
  const [filtroGruppo, setFiltroGruppo] = useState({ ambito, id: "all" });
  const [filtroPagina, setFiltroPagina] = useState({ ambito, numero: 0 });
  const [selezione, setSelezione] = useState<{
    ambito: string;
    id: string | null;
  }>({ ambito, id: null });
  const gruppo = filtroGruppo.ambito === ambito ? filtroGruppo.id : "all";
  const pagina = filtroPagina.ambito === ambito ? filtroPagina.numero : 0;
  const sceltaId = selezione.ambito === ambito ? selezione.id : null;
  const setGruppo = (id: string) => setFiltroGruppo({ ambito, id });
  const setPagina = (numero: number) => setFiltroPagina({ ambito, numero });
  const setSceltaId = (id: string | null) => setSelezione({ ambito, id });
  const [quantita, setQuantita] = useState("1");
  const attive = useMemo(
    () => tariffe.filter((t) => t.attivo !== false && t.attiva !== false),
    [tariffe],
  );
  const gruppi = GRUPPI_LAVORAZIONE.map((g) => ({
    ...g,
    count: attive.filter((t) => gruppoLavorazione(t) === g.id).length,
  })).filter((g) => g.count > 0);
  const filtrate = attive.filter(
    (t) =>
      (gruppo === "all" || gruppoLavorazione(t) === gruppo) &&
      cerca
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .every((p) =>
          [
            t.nome,
            t.tipo,
            t.codice,
            t.descrizione,
            t.fonte,
            categoriaPrezzarioTariffa(t),
            unitaLeggibile(t),
            unitaTariffa(t),
            GRUPPI_LAVORAZIONE.find((g) => g.id === gruppoLavorazione(t))?.nome,
          ]
            .join(" ")
            .toLowerCase()
            .includes(p),
        ),
  );
  const scelta = attive.find((t) => t.id === sceltaId);
  const paginaCorrente = Math.min(
    pagina,
    Math.max(0, Math.ceil(filtrate.length / PAGINA) - 1),
  );
  const visibili = filtrate.slice(
    paginaCorrente * PAGINA,
    (paginaCorrente + 1) * PAGINA,
  );
  const aCorpo = scelta && unitaTariffa(scelta) === "a_corpo";
  const qty = aCorpo ? 1 : Number(quantita.replace(",", "."));
  const prezzo = scelta
    ? (prezzoUnitario?.(scelta) ?? scelta.prezzo_vendita)
    : 0;
  const valida =
    !!scelta &&
    Number.isFinite(qty) &&
    qty > 0 &&
    Number.isFinite(prezzo) &&
    prezzo >= 0 &&
    Number.isFinite(qty * prezzo);
  function seleziona(t: TariffaPro) {
    setSceltaId(t.id);
    setQuantita(
      String(unitaTariffa(t) === "a_corpo" ? 1 : (quantitaIniziale?.(t) ?? 1)),
    );
    if (isMobile)
      requestAnimationFrame(() =>
        dettagliRef.current?.scrollIntoView?.({
          block: "start",
          behavior: "smooth",
        }),
      );
  }
  return (
    <div className="grid h-full min-h-0 grid-cols-1 overflow-hidden rounded-xl border md:grid-cols-[minmax(0,1fr)_280px] lg:grid-cols-[190px_minmax(0,1fr)_280px] max-md:block max-md:overflow-y-auto">
      <aside className="hidden min-h-0 overflow-y-auto border-r bg-muted/20 p-3 lg:block">
        <p className="mb-3 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Lavorazioni e servizi
        </p>
        <nav aria-label="Gruppi dei servizi" className="space-y-1">
          {[
            { id: "all", nome: "Tutti i servizi", count: attive.length },
            ...gruppi,
          ].map((g) => (
            <button
              type="button"
              key={g.id}
              aria-pressed={gruppo === g.id}
              aria-label={`${g.nome} ${g.count}`}
              onClick={() => {
                setGruppo(g.id);
                setPagina(0);
              }}
              className={cn(
                "flex w-full items-start justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-muted",
                gruppo === g.id && "bg-primary/10 font-semibold text-primary",
              )}
            >
              <span>{g.nome}</span>
              <span className="text-xs tabular-nums opacity-70">{g.count}</span>
            </button>
          ))}
        </nav>
      </aside>
      <div
        ref={elencoRef}
        className="flex min-h-0 min-w-0 flex-col max-md:h-[45vh]"
      >
        <div className="shrink-0 space-y-3 border-b p-4">
          <div className="relative">
            <Search
              className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"
              aria-hidden
            />
            <Input
              autoFocus={attivo && !isMobile}
              aria-label="Cerca tariffa nel listino"
              placeholder="Cerca posa, demolizione, codice…"
              value={cerca}
              onChange={(e) => {
                setCerca(e.target.value);
                setPagina(0);
              }}
              className="h-10 pl-9 pr-9"
            />
            {cerca && (
              <button
                type="button"
                aria-label="Azzera ricerca servizi"
                className="absolute right-3 top-3"
                onClick={() => {
                  setCerca("");
                  setPagina(0);
                }}
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </div>
          <select
            aria-label="Filtra servizi per lavorazione"
            className="h-10 w-full rounded-md border bg-background px-3 text-sm lg:hidden"
            value={gruppo}
            onChange={(e) => {
              setGruppo(e.target.value);
              setPagina(0);
            }}
          >
            <option value="all">Tutti i servizi</option>
            {gruppi.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nome} ({g.count})
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            {nomeArea && <span className="font-medium">{nomeArea} · </span>}
            {filtrate.length}{" "}
            {filtrate.length === 1
              ? "servizio disponibile"
              : "servizi disponibili"}{" "}
            · scegli una voce per impostare la quantità
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="space-y-2">
            {visibili.map((t) => (
              <button
                type="button"
                key={t.id}
                aria-pressed={sceltaId === t.id}
                onClick={() => seleziona(t)}
                className={cn(
                  "flex w-full items-start justify-between gap-3 rounded-lg border bg-background p-3 text-left transition hover:border-primary/50",
                  sceltaId === t.id && "border-primary bg-primary/5",
                )}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-semibold leading-snug">
                    {t.nome}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {
                      GRUPPI_LAVORAZIONE.find(
                        (g) => g.id === gruppoLavorazione(t),
                      )?.nome
                    }{" "}
                    · {unitaLeggibile(t)}
                    <span className="mt-1 block text-[11px]">
                      {areaDiVerticale(t.vertical_associato)
                        ? etichettaArea(areaDiVerticale(t.vertical_associato)!)
                        : "Comune / senza area"}
                    </span>
                  </span>
                  {t.codice && (
                    <span className="mt-1 block font-mono text-[11px] text-muted-foreground">
                      {t.codice}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-sm font-semibold tabular-nums">
                    {formatPrezzoUnitario(
                      prezzoUnitario?.(t) ?? t.prezzo_vendita,
                    )}
                  </span>
                  <span className="mt-1 block text-[11px] text-muted-foreground">
                    / {unitaLeggibile(t)}
                  </span>
                </span>
              </button>
            ))}
            {!filtrate.length && (
              <div className="p-6 text-center text-sm text-muted-foreground">
                Nessun servizio corrisponde ai filtri.
                <Button
                  variant="link"
                  onClick={() => {
                    setCerca("");
                    setGruppo("all");
                  }}
                >
                  Azzera i filtri
                </Button>
                <LinkImpostazione
                  to="/azienda/impostazioni/tariffe"
                  className="block text-sm text-primary"
                >
                  Apri il listino manodopera e servizi
                </LinkImpostazione>
              </div>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center justify-between gap-2 border-t px-4 py-2">
          <span role="status" className="text-xs text-muted-foreground">
            {filtrate.length
              ? `${paginaCorrente * PAGINA + 1}–${Math.min((paginaCorrente + 1) * PAGINA, filtrate.length)} di ${filtrate.length} ${filtrate.length === 1 ? "voce attiva" : "voci attive"}`
              : "0 voci attive"}
          </span>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              aria-label="Precedenti"
              disabled={paginaCorrente === 0}
              onClick={() => setPagina(paginaCorrente - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              aria-label="Successive"
              disabled={(paginaCorrente + 1) * PAGINA >= filtrate.length}
              onClick={() => setPagina(paginaCorrente + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
      <aside
        ref={dettagliRef}
        aria-label="Dettagli del servizio"
        className="flex min-h-0 flex-col overflow-y-auto border-t bg-muted/20 p-4 lg:border-l lg:border-t-0"
      >
        {!scelta ? (
          <div className="my-auto py-6 text-center">
            <Wrench className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">Scegli un servizio</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Qui vedrai cosa comprende, come si misura e l’importo da
              aggiungere.
            </p>
          </div>
        ) : (
          <div className="flex h-full flex-col gap-4 max-md:gap-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-start px-0 md:hidden"
              onClick={() => {
                setSceltaId(null);
                requestAnimationFrame(() =>
                  elencoRef.current?.scrollIntoView?.({
                    block: "start",
                    behavior: "smooth",
                  }),
                );
              }}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Scegli un altro servizio
            </Button>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Servizio selezionato
              </p>
              <h3 className="mt-2 text-base font-semibold leading-snug">
                {scelta.nome}
              </h3>
              <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                {scelta.descrizione ||
                  "Descrizione non presente nel listino. Potrai completarla sulla riga del preventivo."}
              </p>
              {scelta.fonte && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Fonte: {scelta.fonte}
                </p>
              )}
            </div>
            <div className="rounded-lg border bg-background p-3">
              <p className="text-xs text-muted-foreground">Prezzo di vendita</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">
                {formatPrezzoUnitario(prezzo)}{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  / {unitaLeggibile(scelta)}
                </span>
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quantita-servizio">
                {aCorpo
                  ? "Intervento a corpo"
                  : `Quantità (${unitaLeggibile(scelta)})`}
              </Label>
              <Input
                id="quantita-servizio"
                aria-label="Quantità servizio"
                inputMode="decimal"
                value={aCorpo ? "1" : quantita}
                disabled={!!aCorpo}
                onChange={(e) => setQuantita(e.target.value)}
              />
              {aCorpo && (
                <p className="text-xs text-muted-foreground">
                  Importo fisso per l’intero intervento.
                </p>
              )}
              {!valida && (
                <p className="text-xs text-destructive">
                  Inserisci una quantità maggiore di zero.
                </p>
              )}
            </div>
            {prezzo === 0 && (
              <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                Prezzo da completare nel preventivo.
              </p>
            )}
            <div className="mt-auto space-y-3 border-t pt-4">
              <div className="flex items-center justify-between text-sm">
                <span>Importo IVA esclusa</span>
                <strong className="tabular-nums">
                  {valida ? formatCurrency(qty * prezzo) : "—"}
                </strong>
              </div>
              <Button
                className="w-full"
                disabled={!valida}
                onClick={() => {
                  if (scelta && valida) {
                    onPick(scelta, qty);
                    setSceltaId(null);
                  }
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Aggiungi servizio
              </Button>
              <p className="text-[11px] text-muted-foreground max-md:hidden">
                Puoi aggiungere altre voci e modificare gli importi nel
                preventivo.
              </p>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

export function TariffePickerDialog({
  open,
  onClose,
  ...props
}: Props & { open: boolean; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="flex h-[80vh] max-h-[90vh] max-w-6xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-6 py-5 pr-12">
          <DialogTitle>Manodopera e servizi</DialogTitle>
          <DialogDescription>
            Scegli la lavorazione, verifica la quantità e aggiungila al
            preventivo.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 p-4">
          <TariffePicker
            {...props}
            onPick={(t, q) => {
              props.onPick(t, q);
              onClose();
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
