import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  FolderTree,
  Library,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useDebounce } from "@/hooks/useDebounce";
import {
  usePrezzarioFonti,
  usePrezzarioVociPagina,
  PREZZARIO_PAGE_SIZE,
} from "@/lib/prezzario/queries";
import {
  capitoliDiscendenti,
  erroreVoce,
  percorsoCapitolo,
} from "@/lib/prezzario/catalogo";
import type { PrezzarioCapitolo, PrezzarioVoce } from "@/lib/prezzario/tipi";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";

export type SelezionePrezzario = Record<string, PrezzarioVoce>;
interface Props {
  fonteId: string | null;
  onFonte: (id: string) => void;
  capitoli: PrezzarioCapitolo[];
  erroreCapitoli?: boolean;
  caricamentoCapitoli?: boolean;
  onRiprovaCapitoli: () => void;
  selezione: SelezionePrezzario;
  onSelezione: (voci: SelezionePrezzario) => void;
  disabled?: boolean;
  giaImportate?: Set<string>;
  giaImportata?: (voce: PrezzarioVoce) => boolean;
  valida?: (voce: PrezzarioVoce) => string | null;
  anteprima?: (voce: PrezzarioVoce) => string | null;
}

/** Browser condiviso: selezione persistente tra pagine e capitoli; nessun troncamento del catalogo. */
export function SelettorePrezzario({
  fonteId,
  onFonte,
  capitoli,
  erroreCapitoli,
  caricamentoCapitoli,
  onRiprovaCapitoli,
  selezione,
  onSelezione,
  disabled = false,
  giaImportate,
  giaImportata,
  valida = erroreVoce,
  anteprima,
}: Props) {
  const fonti = usePrezzarioFonti();
  const [capitolo, setCapitolo] = useState<string | null>(null);
  const [cercaCapitolo, setCercaCapitolo] = useState("");
  const [cerca, setCerca] = useState("");
  const [pagina, setPagina] = useState(0);
  const [mostraSelezione, setMostraSelezione] = useState(false);
  const [paginaSelezione, setPaginaSelezione] = useState(0);
  const elenco = useRef<HTMLUListElement>(null);
  const ricerca = useDebounce(cerca, 250);
  useEffect(() => {
    if (elenco.current) elenco.current.scrollTop = 0;
  }, [pagina, paginaSelezione, mostraSelezione, ricerca, capitolo]);
  const capitoliIds = useMemo(
    () => (capitolo ? capitoliDiscendenti(capitoli, capitolo) : undefined),
    [capitoli, capitolo],
  );
  const query = usePrezzarioVociPagina({
    fonteId: mostraSelezione ? null : fonteId,
    search: ricerca,
    capitoliIds,
    pagina,
  });
  const selezionate = Object.values(selezione);
  const totale = mostraSelezione
    ? selezionate.length
    : (query.data?.totale ?? 0);
  const paginaCorrente = mostraSelezione
    ? Math.min(
        paginaSelezione,
        Math.max(0, Math.ceil(totale / PREZZARIO_PAGE_SIZE) - 1),
      )
    : pagina;
  const righe = mostraSelezione
    ? selezionate.slice(
        paginaCorrente * PREZZARIO_PAGE_SIZE,
        (paginaCorrente + 1) * PREZZARIO_PAGE_SIZE,
      )
    : (query.data?.voci ?? []);
  const occupato =
    disabled || (!mostraSelezione && (query.isFetching || cerca !== ricerca));
  const cambiaPagina = (p: number) =>
    mostraSelezione ? setPaginaSelezione(p) : setPagina(p);
  const rivediSelezione = () => {
    setPaginaSelezione(0);
    setMostraSelezione(true);
  };
  const senzaUnita = righe.filter((v) => !v.unita_misura?.trim()).length;
  const inErrore = selezionate.filter((v) => valida(v));
  const capitoliVisibili = capitoli.filter((c) =>
    `${c.codice ?? ""} ${c.titolo}`
      .toLowerCase()
      .includes(cercaCapitolo.toLowerCase()),
  );
  const scegliCapitolo = (id: string | null) => {
    setCapitolo(id);
    setPagina(0);
  };
  const toggle = (v: PrezzarioVoce, checked: boolean) => {
    const next = { ...selezione };
    if (checked) next[v.id] = v;
    else delete next[v.id];
    onSelezione(next);
  };
  const presente = (v: PrezzarioVoce) =>
    giaImportate?.has(v.id) || giaImportata?.(v);
  const bloccata = (v: PrezzarioVoce) =>
    presente(v) || (!!valida(v) && !!v.unita_misura?.trim());
  const dellaPagina = righe.filter((v) => selezione[v.id] || !bloccata(v));
  const tutte =
    dellaPagina.length > 0 && dellaPagina.every((v) => !!selezione[v.id]);

  return (
    <div className="space-y-3">
      <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="space-y-1.5">
          <Label htmlFor="catalogo-fonte">Regione e anno</Label>
          {fonti.isError ? (
            <div role="alert" className="text-sm text-destructive">
              I prezziari non si sono caricati.{" "}
              <Button variant="link" onClick={() => void fonti.refetch()}>
                Riprova
              </Button>
            </div>
          ) : (
            <select
              id="catalogo-fonte"
              value={fonteId ?? ""}
              disabled={disabled || fonti.isLoading}
              onChange={(e) => {
                onFonte(e.target.value);
                setCapitolo(null);
                setCercaCapitolo("");
                setCerca("");
                setPagina(0);
                setMostraSelezione(false);
                setPaginaSelezione(0);
              }}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="" disabled>
                {fonti.isLoading
                  ? "Caricamento prezziari…"
                  : "Scegli un prezziario"}
              </option>
              {(fonti.data ?? []).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.regione} · {f.anno} — {f.nome}
                  {f.versione && !/\bed[.\s]*\d|edizione|versione/i.test(f.nome)
                    ? ` (${f.versione})`
                    : ""}
                </option>
              ))}
            </select>
          )}
          {!fonti.isLoading && !fonti.isError && fonti.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nessun prezziario pubblicato disponibile.
            </p>
          )}
        </div>
        {fonteId && (
          <Button
            variant="outline"
            className="h-auto bg-primary/5 px-4 py-2 text-left"
            aria-label="Mostra voci selezionate"
            disabled={disabled || selezionate.length === 0}
            onClick={rivediSelezione}
          >
            <span>
              <strong className="tabular-nums">{selezionate.length}</strong>{" "}
              {selezionate.length === 1
                ? "voce selezionata"
                : "voci selezionate"}
              <span className="block text-xs font-normal text-muted-foreground">
                Rivedi e completa prima di importare
              </span>
            </span>
          </Button>
        )}
      </div>
      {!fonteId ? (
        <div className="rounded-xl border border-dashed px-6 py-14 text-center text-muted-foreground">
          <Library className="mx-auto mb-3 h-8 w-8" aria-hidden="true" />
          Scegli regione e anno, poi consulta le categorie e seleziona le voci
          da importare.
        </div>
      ) : (
        <div
          className={cn(
            "grid min-h-0 overflow-hidden rounded-xl border",
            !mostraSelezione && "lg:grid-cols-[240px_minmax(0,1fr)]",
          )}
        >
          {!mostraSelezione && (
            <aside className="space-y-3 border-b bg-muted/20 p-3 lg:border-b-0 lg:border-r">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <FolderTree className="h-4 w-4" aria-hidden="true" />
                Categorie del prezziario
              </div>
              <Input
                aria-label="Cerca categoria"
                placeholder="Cerca categoria…"
                value={cercaCapitolo}
                disabled={disabled}
                onChange={(e) => setCercaCapitolo(e.target.value)}
                className="h-9"
              />
              {caricamentoCapitoli ? (
                <p role="status" className="text-sm text-muted-foreground">
                  Caricamento categorie…
                </p>
              ) : erroreCapitoli ? (
                <div role="alert" className="text-sm text-destructive">
                  Categorie non caricate.{" "}
                  <Button variant="link" onClick={onRiprovaCapitoli}>
                    Riprova
                  </Button>
                </div>
              ) : (
                <nav
                  aria-label="Categorie del prezziario"
                  className="max-h-[48vh] space-y-1 overflow-y-auto"
                >
                  <button
                    type="button"
                    disabled={disabled}
                    aria-current={!capitolo ? "true" : undefined}
                    onClick={() => scegliCapitolo(null)}
                    className={cn(
                      "w-full rounded-md px-2.5 py-2 text-left text-sm",
                      !capitolo && "bg-primary/10 font-semibold text-primary",
                    )}
                  >
                    Tutte le categorie
                  </button>
                  {capitoliVisibili.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      disabled={disabled}
                      aria-current={capitolo === c.id ? "true" : undefined}
                      onClick={() => scegliCapitolo(c.id)}
                      title={percorsoCapitolo(capitoli, c.id)}
                      className={cn(
                        "block w-full rounded-md px-2.5 py-2 text-left text-xs hover:bg-muted disabled:opacity-60",
                        capitolo === c.id &&
                          "bg-primary/10 font-semibold text-primary",
                      )}
                    >
                      {c.codice && (
                        <span className="mr-1 font-mono text-muted-foreground">
                          {c.codice}
                        </span>
                      )}{" "}
                      {c.titolo}
                    </button>
                  ))}
                  {capitoliVisibili.length === 0 && (
                    <p className="px-2 text-xs text-muted-foreground">
                      Nessuna categoria trovata.
                    </p>
                  )}
                </nav>
              )}
            </aside>
          )}
          <div className="min-w-0">
            <div className="space-y-2 border-b p-3">
              {mostraSelezione ? (
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">
                      Rivedi le voci selezionate
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Tutte le categorie e le pagine. Puoi completare le unità
                      mancanti o togliere una voce.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={disabled}
                    onClick={() => setMostraSelezione(false)}
                  >
                    Torna al catalogo
                  </Button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search
                      className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <Input
                      aria-label="Cerca codice o descrizione"
                      placeholder="Cerca codice o descrizione…"
                      value={cerca}
                      disabled={disabled}
                      onChange={(e) => {
                        setCerca(e.target.value);
                        setPagina(0);
                      }}
                      className="h-10 pl-9"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {capitolo
                      ? percorsoCapitolo(capitoli, capitolo)
                      : "Tutte le categorie"}
                    {capitolo ? " · include i sottocapitoli" : ""}
                  </p>
                </>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/20 px-3 py-2">
              <span role="status" className="text-xs text-muted-foreground">
                {!mostraSelezione && query.isFetching
                  ? "Caricamento…"
                  : `${totale.toLocaleString("it-IT")} ${mostraSelezione ? (totale === 1 ? "voce selezionata" : "voci selezionate") : totale === 1 ? "voce trovata" : "voci trovate"}`}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={occupato || dellaPagina.length === 0}
                  onClick={() => {
                    const next = { ...selezione };
                    for (const v of dellaPagina) {
                      if (tutte) delete next[v.id];
                      else next[v.id] ??= v;
                    }
                    onSelezione(next);
                  }}
                >
                  {tutte
                    ? "Deseleziona questa pagina"
                    : "Seleziona questa pagina"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={disabled || selezionate.length === 0}
                  onClick={() => onSelezione({})}
                >
                  Azzera selezione
                </Button>
              </div>
            </div>
            {senzaUnita > 0 && (
              <p className="border-b bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                {senzaUnita}{" "}
                {senzaUnita === 1
                  ? "voce di questa pagina non ha"
                  : "voci di questa pagina non hanno"}{" "}
                l’unità di misura.{" "}
                {mostraSelezione
                  ? "Indica l’unità corretta prima di importare."
                  : "Seleziona le voci e indica l’unità corretta."}
              </p>
            )}
            {!mostraSelezione && query.isError ? (
              <div role="alert" className="p-6 text-center text-sm">
                Le voci non si sono caricate.{" "}
                <Button variant="link" onClick={() => void query.refetch()}>
                  Riprova
                </Button>
              </div>
            ) : !mostraSelezione && query.isLoading ? (
              <div className="flex justify-center gap-2 p-12 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                Caricamento voci…
              </div>
            ) : (
              <ul
                ref={elenco}
                aria-label={
                  mostraSelezione ? "Voci selezionate" : "Voci del prezziario"
                }
                className="max-h-[43vh] divide-y overflow-y-auto"
              >
                {righe.map((v) => {
                  const scelta = selezione[v.id];
                  const corrente = scelta ?? v;
                  const unitaOriginale =
                    corrente.unita_misura_originale === undefined
                      ? v.unita_misura
                      : corrente.unita_misura_originale;
                  const errore = valida(corrente);
                  const giaPresente = presente(v);
                  const preview = anteprima?.(corrente);
                  return (
                    <li
                      key={v.id}
                      className={cn("px-3 py-3", scelta && "bg-primary/5")}
                    >
                      <div className="flex items-start gap-3">
                        <Checkbox
                          aria-label={`Seleziona ${v.codice ?? v.id}`}
                          checked={!!scelta}
                          disabled={disabled || (!scelta && !!bloccata(v))}
                          onCheckedChange={(checked) =>
                            toggle(corrente, checked === true)
                          }
                          className="mt-1"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap gap-2 text-[11px]">
                            <span className="font-mono font-semibold">
                              {v.codice ?? "Senza codice"}
                            </span>
                            <span className="text-muted-foreground">
                              {percorsoCapitolo(capitoli, v.capitolo_id)}
                            </span>
                            {giaPresente && (
                              <span className="text-emerald-700">
                                Già nel listino
                              </span>
                            )}
                          </div>
                          <p
                            className="mt-1 line-clamp-3 text-sm"
                            title={v.descrizione}
                          >
                            {v.descrizione}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Unità del prezziario:{" "}
                            {unitaOriginale || "non indicata"}
                            {v.incidenza_manodopera_pct != null
                              ? ` · Manodopera ${(v.incidenza_manodopera_pct * 100).toLocaleString("it-IT")}%`
                              : ""}
                          </p>
                          {errore && (
                            <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                              {errore}
                            </p>
                          )}
                          {scelta && !unitaOriginale?.trim() && (
                            <label className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                              Unità da usare per {v.codice ?? "questa voce"}
                              <select
                                aria-label={`Unità per ${v.codice ?? v.id}`}
                                value={scelta.unita_misura ?? ""}
                                disabled={disabled}
                                onChange={(e) =>
                                  onSelezione({
                                    ...selezione,
                                    [v.id]: {
                                      ...scelta,
                                      unita_misura_originale: unitaOriginale,
                                      unita_misura: e.target.value,
                                    },
                                  })
                                }
                                className="h-8 rounded-md border bg-background px-2"
                              >
                                <option value="" disabled>
                                  Scegli unità
                                </option>
                                {[
                                  "cad",
                                  "mq",
                                  "mc",
                                  "ml",
                                  "kg",
                                  "h",
                                  "gg",
                                  "km",
                                  "a_corpo",
                                ].map((um) => (
                                  <option key={um} value={um}>
                                    {um === "a_corpo" ? "a corpo" : um}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}
                          {preview && (
                            <p className="mt-1 text-xs font-medium text-primary">
                              {preview}
                            </p>
                          )}
                        </div>
                        <span className="shrink-0 text-sm font-semibold tabular-nums">
                          {formatCurrency(Number(v.prezzo))}
                        </span>
                      </div>
                    </li>
                  );
                })}
                {righe.length === 0 && (
                  <li className="p-10 text-center text-sm text-muted-foreground">
                    {mostraSelezione
                      ? "La selezione è vuota. Torna al catalogo per scegliere altre voci."
                      : "Nessuna voce corrisponde a categoria e ricerca."}
                  </li>
                )}
              </ul>
            )}
            <div className="flex items-center justify-between gap-2 border-t px-3 py-2">
              <span className="text-xs text-muted-foreground">
                {totale > 0
                  ? `${paginaCorrente * PREZZARIO_PAGE_SIZE + 1}–${Math.min((paginaCorrente + 1) * PREZZARIO_PAGE_SIZE, totale)} di ${totale.toLocaleString("it-IT")}`
                  : "0 voci"}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  aria-label="Pagina precedente"
                  disabled={occupato || paginaCorrente === 0}
                  onClick={() => cambiaPagina(paginaCorrente - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  aria-label="Pagina successiva"
                  disabled={
                    occupato ||
                    (paginaCorrente + 1) * PREZZARIO_PAGE_SIZE >= totale
                  }
                  onClick={() => cambiaPagina(paginaCorrente + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
      {inErrore.length > 0 && (
        <div
          role="alert"
          className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200"
        >
          <p>
            {inErrore.length}{" "}
            {inErrore.length === 1
              ? "voce selezionata da completare"
              : "voci selezionate da completare"}{" "}
            prima dell’importazione.
          </p>
          {!mostraSelezione && (
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              disabled={disabled}
              onClick={rivediSelezione}
            >
              Completa le selezionate
            </Button>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            {inErrore.map((v) => (
              <button
                key={v.id}
                type="button"
                disabled={disabled}
                className="inline-flex items-center gap-1 rounded border border-amber-300 px-2 py-1 text-xs"
                onClick={() => toggle(v, false)}
                aria-label={`Rimuovi dalla selezione ${v.codice ?? v.id}`}
              >
                {v.codice ?? v.descrizione.slice(0, 35)} · {valida(v)}{" "}
                <X className="h-3 w-3" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
