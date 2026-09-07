/**
 * ImportaPrezzarioDialog — adozione di voci da un prezzario regionale ufficiale
 * (libreria centrale condivisa) nel listino lavorazioni aziendale della
 * Pavimenti (`pav_listino_voci`).
 *
 * Flusso:
 *   1. Si sceglie la fonte (`usePrezzarioFonti`) → "Regione Anno — nome".
 *   2. Si naviga per capitolo (`usePrezzarioCapitoli`) e/o si cerca a testo
 *      libero (`usePrezzarioVoci(fonteId, search)`, FTS italiana sul server).
 *   3. Si selezionano le voci (checkbox) con anteprima codice/descrizione/UM/
 *      prezzo/incidenza manodopera.
 *   4. Si imposta il ricarico % (default 15) e si adotta: `useAdottaPrezzario`
 *      scorpora manodopera/materiali, applica il margine e aggiunge la nota
 *      "Fonte: …". L'hook invalida già `["pav-listino-voci", companyId]`, quindi
 *      l'editor del listino riflette le nuove voci.
 *
 * Read-only: con `readOnly` il bottone di apertura non viene mostrato dal parent;
 * qui per sicurezza l'azione di adozione è comunque disabilitata.
 *
 * Vedi docs/superpowers/specs/2026-06-20-prezzari-regionali-design.md
 */
import { useMemo, useState } from "react";
import { Library, Search, Loader2, FolderTree, PackagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import {
  usePrezzarioFonti,
  usePrezzarioCapitoli,
  usePrezzarioVoci,
} from "@/lib/prezzario/queries";
// useAdottaPrezzario: versione pav-scoped (scrive su pav_listino_voci) — NON quella
// di @/lib/prezzario/queries, che è rst-scoped (scriverebbe nel listino Ristrutturazione).
import { useAdottaPrezzario } from "@/hooks/usePavimentiListino";
import type { PrezzarioFonte, PrezzarioVoce } from "@/lib/prezzario/tipi";

const RICARICO_DEFAULT = 15;

/** Etichetta fonte per la select: "Regione Anno — nome (vNN)". */
function labelFonte(f: PrezzarioFonte): string {
  const base = `${f.regione} ${f.anno} — ${f.nome}`;
  return f.versione ? `${base} (${f.versione})` : base;
}

/** Incidenza manodopera 0..1 → "NN%" (— se assente). */
function fmtIncidenza(v: number | null): string {
  if (v == null) return "—";
  return `${Math.round(v * 100)}%`;
}

export interface ImportaPrezzarioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Capitolo del listino aziendale a cui agganciare le voci (opzionale). */
  capitoloId?: string | null;
  /** Se true, l'adozione è disabilitata (wizard in sola lettura). */
  readOnly?: boolean;
}

export function ImportaPrezzarioDialog({
  open,
  onOpenChange,
  capitoloId,
  readOnly = false,
}: ImportaPrezzarioDialogProps) {
  const [fonteId, setFonteId] = useState<string | null>(null);
  const [capitoloFiltro, setCapitoloFiltro] = useState<string>("__all__");
  const [search, setSearch] = useState("");
  const [selezione, setSelezione] = useState<Record<string, PrezzarioVoce>>({});
  const [ricarico, setRicarico] = useState(String(RICARICO_DEFAULT));

  const fonti = usePrezzarioFonti();
  const capitoli = usePrezzarioCapitoli(fonteId);
  const voci = usePrezzarioVoci(fonteId, search);
  const adotta = useAdottaPrezzario();

  // Quando si cerca a testo libero ignoriamo il filtro capitolo (la FTS è
  // sull'intera fonte); altrimenti filtriamo lato client per capitolo scelto.
  const vociFiltrate = useMemo(() => {
    const rows = voci.data ?? [];
    if (search.trim() || capitoloFiltro === "__all__") return rows;
    return rows.filter((v) => v.capitolo_id === capitoloFiltro);
  }, [voci.data, search, capitoloFiltro]);

  const selezionate = useMemo(() => Object.values(selezione), [selezione]);
  const ricaricoNum = (() => {
    const n = Number(ricarico.replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  })();

  const toggleVoce = (voce: PrezzarioVoce, checked: boolean) => {
    setSelezione((prev) => {
      const next = { ...prev };
      if (checked) next[voce.id] = voce;
      else delete next[voce.id];
      return next;
    });
  };

  const resetState = () => {
    setFonteId(null);
    setCapitoloFiltro("__all__");
    setSearch("");
    setSelezione({});
    setRicarico(String(RICARICO_DEFAULT));
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) resetState();
    onOpenChange(next);
  };

  const handleFonteChange = (id: string) => {
    setFonteId(id);
    setCapitoloFiltro("__all__");
    setSearch("");
    setSelezione({});
  };

  const handleAdotta = () => {
    if (readOnly || !fonteId || selezionate.length === 0) return;
    adotta.mutate(
      { fonteId, voci: selezionate, ricaricoPct: ricaricoNum, capitoloId: capitoloId ?? undefined },
      {
        onSuccess: (r) => {
          const quante = `${r.inserite} ${r.inserite === 1 ? "voce aggiunta" : "voci aggiunte"} con ricarico ${ricaricoNum}%.`;
          // Il prezzario non porta l'unita' di misura per l'84% delle voci, e
          // il listino la mette a «cad» perche' la colonna non ammette vuoti.
          // Dirlo: una lavorazione da 12 EUR/m2 entrata come 12 EUR al pezzo
          // sbaglia il preventivo e non se ne accorge nessuno.
          if (r.senzaUnita > 0) {
            toast.warning("Voci adottate — controlla l'unita' di misura", {
              description:
                `${quante} Di queste, ${r.senzaUnita} ${r.senzaUnita === 1 ? "non aveva" : "non avevano"} ` +
                `l'unita' di misura nel prezzario: ${r.senzaUnita === 1 ? "e' stata impostata" : "sono state impostate"} ` +
                `a «cad». Correggila prima di usarle in un preventivo.`,
              duration: 10000,
            });
          } else {
            toast.success("Voci adottate nel listino", { description: quante });
          }
          handleOpenChange(false);
        },
        onError: (e) =>
          toast.error("Adozione non riuscita", {
            description: (e as Error).message,
          }),
      },
    );
  };

  const fontiRows = fonti.data ?? [];
  const capitoliRows = capitoli.data ?? [];
  const isCercando = Boolean(search.trim());

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[88vh] max-w-3xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle className="flex items-center gap-2">
            <Library className="h-4 w-4 text-primary" />
            Importa da prezzario regionale
          </DialogTitle>
          <DialogDescription>
            Adotta voci da un prezzario regionale ufficiale: vengono copiate nel
            tuo listino con il margine scelto e la nota della fonte.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {/* Selezione fonte */}
          <div className="space-y-1.5">
            <Label htmlFor="prezzario-fonte" className="text-xs font-medium">
              Prezzario (regione / anno)
            </Label>
            {fonti.isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Caricamento prezzari…
              </div>
            ) : fontiRows.length === 0 ? (
              <p className="rounded-md border border-dashed px-3 py-2.5 text-sm text-muted-foreground">
                Nessun prezzario regionale pubblicato è ancora disponibile.
              </p>
            ) : (
              <Select value={fonteId ?? undefined} onValueChange={handleFonteChange}>
                <SelectTrigger id="prezzario-fonte">
                  <SelectValue placeholder="Scegli un prezzario…" />
                </SelectTrigger>
                <SelectContent>
                  {fontiRows.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {labelFonte(f)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {fonteId && (
            <>
              {/* Filtri: capitolo + ricerca */}
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-xs font-medium">
                    <FolderTree className="h-3.5 w-3.5" /> Capitolo
                  </Label>
                  <Select
                    value={capitoloFiltro}
                    onValueChange={setCapitoloFiltro}
                    disabled={isCercando || capitoliRows.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Tutti i capitoli" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Tutti i capitoli</SelectItem>
                      {capitoliRows.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {[c.codice, c.titolo].filter(Boolean).join(" · ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="prezzario-search" className="text-xs font-medium">
                    Cerca voce
                  </Label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="prezzario-search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Codice o descrizione…"
                      className="pl-8"
                    />
                  </div>
                </div>
              </div>
              {isCercando && (
                <p className="-mt-1.5 text-[11px] text-muted-foreground">
                  La ricerca a testo libero esamina tutta la fonte (il filtro capitolo è ignorato).
                </p>
              )}

              {/* Elenco voci selezionabili */}
              <div className="overflow-hidden rounded-md border">
                {voci.isLoading ? (
                  <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Caricamento voci…
                  </div>
                ) : vociFiltrate.length === 0 ? (
                  <div className="py-12 text-center text-sm text-muted-foreground">
                    {isCercando
                      ? "Nessuna voce trovata per la ricerca."
                      : "Nessuna voce in questo capitolo."}
                  </div>
                ) : (
                  <ul className="max-h-[36vh] divide-y overflow-y-auto">
                    {vociFiltrate.map((v) => {
                      const checked = Boolean(selezione[v.id]);
                      return (
                        <li key={v.id}>
                          <label
                            className={cn(
                              "flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-accent/60",
                              checked && "bg-accent/40",
                            )}
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(c) => toggleVoce(v, c === true)}
                              className="mt-0.5"
                              aria-label={`Seleziona ${v.descrizione}`}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-center gap-1.5">
                                {v.codice && (
                                  <Badge variant="outline" className="font-mono text-[10px]">
                                    {v.codice}
                                  </Badge>
                                )}
                                <span className="text-sm font-medium leading-snug">
                                  {v.descrizione}
                                </span>
                              </span>
                              <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                                <span>UM: {v.unita_misura ?? "—"}</span>
                                <span>Manodopera: {fmtIncidenza(v.incidenza_manodopera_pct)}</span>
                              </span>
                            </span>
                            <span className="shrink-0 text-right text-sm font-semibold tabular-nums text-primary">
                              {formatCurrency(v.prezzo)}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer: ricarico + azione */}
        <DialogFooter className="flex-col gap-3 border-t px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1.5">
            <Label htmlFor="prezzario-ricarico" className="text-xs font-medium">
              Ricarico %
            </Label>
            <Input
              id="prezzario-ricarico"
              inputMode="decimal"
              value={ricarico}
              onChange={(e) => setRicarico(e.target.value)}
              className="h-9 w-28 text-right tabular-nums"
              disabled={!fonteId}
            />
          </div>
          <div className="flex items-center gap-3">
            {selezionate.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {selezionate.length} {selezionate.length === 1 ? "voce" : "voci"} selez.
              </span>
            )}
            <Button
              type="button"
              onClick={handleAdotta}
              disabled={
                readOnly || !fonteId || selezionate.length === 0 || adotta.isPending
              }
            >
              {adotta.isPending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <PackagePlus className="mr-1.5 h-4 w-4" />
              )}
              Adotta nel listino
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ImportaPrezzarioDialog;
