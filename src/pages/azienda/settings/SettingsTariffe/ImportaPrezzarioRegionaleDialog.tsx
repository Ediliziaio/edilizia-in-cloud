/**
 * ImportaPrezzarioRegionaleDialog — adozione di voci da un prezzario regionale
 * ufficiale (libreria centrale condivisa) DRITTE nel listino aziendale
 * `tariffe_aziendali` della pagina "Manodopera e Servizi".
 *
 * A differenza di `src/components/ristrutturazione/ImportaPrezzarioDialog.tsx`
 * (che adotta in `rst_listino_voci` scorporando manodopera/materiali), qui il
 * target è `tariffe_aziendali`: ogni voce diventa una tariffa con `prezzo_vendita`
 * = prezzo × (1 + ricarico%) e, per i soli admin, `costo_interno`/`prezzo_costo`
 * = prezzo base. La UM del prezzario viene mappata sull'enum `unita_fatturazione`
 * e il tipo è dedotto (ora ⇒ manodopera, altrimenti ⇒ altro).
 *
 * Flusso (replica UX del picker del computo):
 *   1. Si sceglie la fonte (`usePrezzarioFonti`) → "Regione Anno — nome".
 *   2. Si naviga per capitolo (`usePrezzarioCapitoli`) e/o si cerca a testo
 *      libero (`usePrezzarioVoci(fonteId, search)`, FTS italiana sul server).
 *   3. Si selezionano le voci (checkbox) con anteprima codice/descrizione/UM/
 *      prezzo/incidenza manodopera.
 *   4. Si imposta il ricarico % (default 0) e si importa in batch (chunk 200)
 *      su `tariffe_aziendali`. `onImported()` aggiorna il listino e chiude.
 *
 * Le tabelle `prezzario_*` non sono nei tipi generati di Supabase → usiamo il
 * cast `supabase as any` (stesso pattern di `src/lib/prezzario/queries.ts`).
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
import { supabase } from "@/integrations/supabase/client";
import {
  usePrezzarioFonti,
  usePrezzarioCapitoli,
  usePrezzarioVoci,
} from "@/lib/prezzario/queries";
import {
  legacyUnitaFrom,
  type UnitaFatturazione,
  type TipoTariffa,
} from "@/lib/tariffe/prezziarioImport";
import type { PrezzarioFonte, PrezzarioVoce } from "@/lib/prezzario/tipi";

// prezzario_* non rigenerati nei tipi Supabase: cast unico (come queries.ts).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = () => supabase as any;

const RICARICO_DEFAULT = 0;
const MAX_NOME_LEN = 120;
const CHUNK_SIZE = 200;

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

/**
 * Mappa la UM del prezzario (superset: cad/mq/mc/ml/kg/h/t/l/a_corpo…) sull'enum
 * `unita_fatturazione` di `tariffe_aziendali`. Fallback 'pz' per UM ignote.
 */
function umToUnitaFatturazione(um: string | null | undefined): UnitaFatturazione {
  const k = String(um ?? "").trim().toLowerCase();
  switch (k) {
    case "cad":
    case "cadauno":
    case "pz":
    case "n":
    case "nr":
      return "pz";
    case "m²":
    case "mq":
    case "m2":
      return "mq";
    case "m":
    case "ml":
    case "mt":
      return "ml";
    case "m³":
    case "mc":
    case "m3":
      return "mc";
    case "kg":
      return "kg";
    case "ora":
    case "h":
    case "ore":
      return "h";
    case "t": // tonnellata → kg (non c'è 't' nell'enum tariffe)
      return "kg";
    case "l": // litro → pz (non c'è 'l' nell'enum tariffe)
      return "pz";
    default:
      return "pz";
  }
}

/** ora ⇒ manodopera, qualsiasi altra UM ⇒ altro. */
function tipoFromUm(um: string | null | undefined): TipoTariffa {
  const k = String(um ?? "").trim().toLowerCase();
  return k === "ora" || k === "h" || k === "ore" ? "manodopera" : "altro";
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface ImportaPrezzarioRegionaleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Azienda corrente: tutte le voci vengono inserite per questa company. */
  companyId: string | undefined;
  /** Solo gli admin vedono/scrivono il costo (costo_interno/prezzo_costo). */
  isAdmin: boolean;
  /** Callback dopo un import riuscito (es. refetch/invalidate del listino). */
  onImported: () => void;
}

export function ImportaPrezzarioRegionaleDialog({
  open,
  onOpenChange,
  companyId,
  isAdmin,
  onImported,
}: ImportaPrezzarioRegionaleDialogProps) {
  const [fonteId, setFonteId] = useState<string | null>(null);
  const [capitoloFiltro, setCapitoloFiltro] = useState<string>("__all__");
  const [search, setSearch] = useState("");
  const [selezione, setSelezione] = useState<Record<string, PrezzarioVoce>>({});
  const [ricarico, setRicarico] = useState(String(RICARICO_DEFAULT));
  const [importing, setImporting] = useState(false);

  const fonti = usePrezzarioFonti();
  const capitoli = usePrezzarioCapitoli(fonteId);
  const voci = usePrezzarioVoci(fonteId, search);

  // Con la ricerca a testo libero ignoriamo il filtro capitolo (la FTS è
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

  /** Seleziona tutte le voci attualmente mostrate (capitolo o ricerca correnti). */
  const selezionaTutteFiltrate = () =>
    setSelezione((prev) => {
      const next = { ...prev };
      for (const v of vociFiltrate) next[v.id] = v;
      return next;
    });

  /** Azzera l'intera selezione. */
  const azzeraSelezione = () => setSelezione({});

  const tutteSelezionate =
    vociFiltrate.length > 0 && vociFiltrate.every((v) => Boolean(selezione[v.id]));

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

  /** Costruisce il payload `tariffe_aziendali` per una voce del prezzario. */
  const toPayload = (v: PrezzarioVoce) => {
    const prezzoBase = Number(v.prezzo) || 0;
    const unitaFatt = umToUnitaFatturazione(v.unita_misura);
    const payload: Record<string, unknown> = {
      company_id: companyId,
      nome: (v.descrizione ?? "").slice(0, MAX_NOME_LEN).trim(),
      tipo: tipoFromUm(v.unita_misura),
      unita_fatturazione: unitaFatt,
      // Backward-compat: popoliamo anche la colonna legacy `unita`.
      unita: legacyUnitaFrom(unitaFatt),
      prezzo_vendita: round2(prezzoBase * (1 + ricaricoNum / 100)),
      vertical_associato: null,
      attivo: true,
    };
    if (isAdmin) {
      payload.costo_interno = prezzoBase;
      payload.prezzo_costo = prezzoBase;
    }
    return payload;
  };

  const handleImport = async () => {
    if (!fonteId || selezionate.length === 0) return;
    if (!companyId) {
      toast.error("Azienda non disponibile");
      return;
    }
    setImporting(true);
    try {
      const payloads = selezionate.map(toPayload);
      // Insert in batch (chunk 200) per non superare i limiti del PostgREST.
      for (let i = 0; i < payloads.length; i += CHUNK_SIZE) {
        const chunk = payloads.slice(i, i + CHUNK_SIZE);
        const { error } = await sb().from("tariffe_aziendali").insert(chunk);
        if (error) throw new Error(error.message);
      }
      const n = payloads.length;
      toast.success("Voci importate nel listino", {
        description: `${n} ${n === 1 ? "voce aggiunta" : "voci aggiunte"} con ricarico ${ricaricoNum}%.`,
      });
      onImported();
      handleOpenChange(false);
    } catch (e) {
      toast.error("Importazione non riuscita", {
        description: e instanceof Error ? e.message : "Errore durante l'import.",
      });
    } finally {
      setImporting(false);
    }
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
            tuo listino Manodopera e Servizi con il ricarico scelto
            {isAdmin ? " e il costo base come costo interno" : ""}.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {/* Selezione fonte */}
          <div className="space-y-1.5">
            <Label htmlFor="prezzario-reg-fonte" className="text-xs font-medium">
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
                <SelectTrigger id="prezzario-reg-fonte">
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
                  <Label htmlFor="prezzario-reg-search" className="text-xs font-medium">
                    Cerca voce
                  </Label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="prezzario-reg-search"
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
                  <>
                    <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-1.5">
                      <span className="text-[11px] text-muted-foreground">
                        {vociFiltrate.length} {vociFiltrate.length === 1 ? "voce" : "voci"}
                        {isCercando ? " (ricerca)" : capitoloFiltro !== "__all__" ? " (capitolo)" : ""}
                      </span>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={selezionaTutteFiltrate}
                          disabled={tutteSelezionate}
                        >
                          Seleziona tutti
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-muted-foreground"
                          onClick={azzeraSelezione}
                          disabled={selezionate.length === 0}
                        >
                          Azzera
                        </Button>
                      </div>
                    </div>
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
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer: ricarico + azione */}
        <DialogFooter className="flex-col gap-3 border-t px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1.5">
            <Label htmlFor="prezzario-reg-ricarico" className="text-xs font-medium">
              Ricarico %
            </Label>
            <Input
              id="prezzario-reg-ricarico"
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
              onClick={handleImport}
              disabled={!fonteId || selezionate.length === 0 || importing}
            >
              {importing ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <PackagePlus className="mr-1.5 h-4 w-4" />
              )}
              Importa nel listino
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ImportaPrezzarioRegionaleDialog;
