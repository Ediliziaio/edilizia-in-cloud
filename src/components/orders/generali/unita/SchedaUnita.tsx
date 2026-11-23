import { UniformSelect } from "@/components/ui/uniform-select";
// src/components/orders/generali/unita/SchedaUnita.tsx
// La scheda «Unità e vendite» della generale: tabellone disponibilità (o tabella), avviso delle
// garanzie per gli immobili da costruire, nuove unità in serie, l'unità aperta.
// Da telefono si guarda il tabellone e si cambia lo stato di vendita, nient'altro.
import { CaricaFileUnita } from "@/components/orders/generali/unita/CaricaFileUnita";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { IntestazioneScheda } from "../design/ElementiScheda";
import { LayoutGrid, Plus, Ruler, Search, ShieldAlert, Table2, FolderUp, ListChecks } from "lucide-react";
import { useUnitaDalPiano } from "@/hooks/useUnitaDalPiano";
import type { RigaSerie } from "@/lib/orders/generali/unitaSerie";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TablePagination } from "@/components/ui/table-pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { PropsScheda } from "@/components/orders/generali/tipiScheda";
import { DividiUnitaDialog } from "@/components/orders/generali/unita/DividiUnitaDialog";
import { SerieUnitaDialog } from "@/components/orders/generali/unita/SerieUnitaDialog";
import { TabellaUnita } from "@/components/orders/generali/unita/TabellaUnita";
import { TabelloneUnita } from "@/components/orders/generali/unita/TabelloneUnita";
import { UnitaDialog } from "@/components/orders/generali/unita/UnitaDialog";
import { BottoneListino } from "@/components/orders/generali/vendita/BottoneListino";
import { STILE_STATO, dataBreve, euro } from "@/components/orders/generali/unita/aspetto";
import { useIsMobile } from "@/hooks/use-mobile";
import { useUnitaGenerale } from "@/hooks/useGeneraleUnita";
import { NOMI_STATO, STATI_VENDITA, confrontaSigle, etichettaPiano, raggruppaTabellone, unitaVive } from "@/lib/orders/generali/unita";
import { cantiereInAmbito, cercaNellOperazione, paginaRegistro } from "@/lib/orders/generali/registroOperazione";
import { useCriterioRipartizione } from "@/hooks/useCommesseGenerali";
import { avvisoGaranzie, contiUnita, riepilogoVendite } from "@/lib/orders/generali/unitaConti";
import { cn } from "@/lib/utils";

const RIGHE_UNITA = [24, 48, 96];

export function SchedaUnita({ riepilogo, puoModificare }: PropsScheda) {
  const [parametri, setParametri] = useSearchParams();
  const richiesto = parametri.get("stato-vendita");
  const filtroStato = STATI_VENDITA.find(s => s === richiesto) ?? null;
  const cerca = parametri.get("cerca-unita") ?? "";
  const edificio = parametri.get("edificio-unita") ?? "";
  const piano = parametri.get("piano-unita") ?? "";
  const aggiornaFiltro = (scelte: Record<string, string>) => {
    const p = new URLSearchParams(parametri);
    for (const [key, valore] of Object.entries(scelte)) {
      if (valore) p.set(key, valore);
      else p.delete(key);
    }
    p.delete("pagina-unita");
    setParametri(p, { replace: true });
  };
  const generaleId = riepilogo.generale.id;
  const telefono = useIsMobile();
  const { data: e, isLoading, isError, refetch } = useUnitaGenerale(generaleId);
  const vista = !telefono && parametri.get("vista-unita") === "tabella" ? "tabella" : "tabellone";
  const setVista = (scelta: string) => aggiornaFiltro({ "vista-unita": scelta === "tabella" ? scelta : "" });
  const aperta = parametri.get("unita");
  const setAperta = (id: string | null) => {
    const p = new URLSearchParams(parametri);
    if (id) p.set("unita", id);
    else p.delete("unita");
    setParametri(p, { replace: !id });
  };
  const [daDividere, setDaDividere] = useState<string | null>(null);
  const [serie, setSerie] = useState(false);
  const [caricaFile, setCaricaFile] = useState(false);

  const criterio = useCriterioRipartizione(riepilogo.generale.id);
  const conti = useMemo(() => (e ? contiUnita(e, criterio.data?.criterio ?? "auto") : null), [e, criterio.data]);
  const vendite = useMemo(() => (e ? riepilogoVendite(e) : null), [e]);

  // Le vendite del piano che non sono ancora unità: si propongono già compilate.
  const sigleNote = useMemo(() => e?.unita.map((u) => u.sigla) ?? [], [e]);
  const puoGestire = !!puoModificare && !telefono && !!e?.permessi.modifica;
  const dalPiano = useUnitaDalPiano(generaleId, sigleNote, puoGestire && riepilogo.permessi.margini);
  const [serieDalPiano, setSerieDalPiano] = useState<RigaSerie[] | null>(null);
  const apriSerie = (righe: RigaSerie[] | null) => { setSerieDalPiano(righe); setSerie(true); };
  // Dalla panoramica («Crea le unità dal piano») si arriva con ?dal-piano=1: la finestra si apre
  // già compilata, appena il piano è letto; chiudendola il parametro se ne va.
  const chiestoDalPiano = parametri.get("dal-piano") === "1" && !!dalPiano && puoGestire;
  const serieAperta = serie || chiestoDalPiano;
  const righeSerie = chiestoDalPiano && !serie ? dalPiano!.righe : serieDalPiano;
  const cambiaSerie = (aperta: boolean) => {
    setSerie(aperta);
    if (!aperta && parametri.has("dal-piano")) {
      const p = new URLSearchParams(parametri);
      p.delete("dal-piano");
      setParametri(p, { replace: true });
    }
  };

  if (isLoading) return <Skeleton className="h-64 w-full rounded-lg" />;
  if (isError || !e || !conti || !vendite) {
    return (
      <div role="alert" className="space-y-3 rounded-lg border p-4">
        <p className="text-sm">Non riesco a leggere le unità.</p>
        <Button size="sm" onClick={() => void refetch()}>Riprova</Button>
      </div>
    );
  }

  // Serie, divisione, prezzi e pagamenti: da tablet e computer, con il permesso di modificare.
  const gestisci = puoModificare && e.permessi.modifica && !telefono;
  const garanzie = avvisoGaranzie(e);
  const sigle = e.unita.map((u) => u.sigla);
  const unitaAperta = e.unita.find((u) => u.orderId === aperta) ?? null;
  const divise = e.unita.filter((u) => u.divisaIl).sort((a, b) => confrontaSigle(a.sigla, b.sigla));
  const vuota = vendite.unita === 0;
  const senzaMq = e.unita.filter((u) => !u.divisaIl && u.mq === null).length;
  const vive = unitaVive(e.unita);
  const edifici = [...new Set(vive.map(u => u.edificio).filter((v): v is string => !!v))].sort(confrontaSigle);
  const piani = [...new Set(vive.map(u => u.piano).filter((v): v is string => !!v))].sort(confrontaSigle);
  const filtrate = vive.filter(u =>
    (!filtroStato || u.stato === filtroStato) && (!edificio || u.edificio === edificio) && (!piano || u.piano === piano) &&
    (!cerca.trim() || cercaNellOperazione(cerca, [u.sigla, u.codice, u.nome, u.edificio, u.tipologia, u.acquirente, u.piano && etichettaPiano(u.piano)])),
  );
  const ordinate = vista === "tabella"
    ? [...filtrate].sort((a, b) => confrontaSigle(a.sigla, b.sigla))
    : raggruppaTabellone(filtrate).flatMap(e => e.piani.flatMap(p => p.unita));
  const dimensione = Number(parametri.get("righe-unita"));
  const righePerPagina = RIGHE_UNITA.includes(dimensione) ? dimensione : RIGHE_UNITA[0];
  const pagine = Math.max(1, Math.ceil(ordinate.length / righePerPagina));
  const pagina = Math.min(pagine, paginaRegistro(parametri.get("pagina-unita")));
  const elencoInVista = { ...e, unita: ordinate.slice((pagina - 1) * righePerPagina, pagina * righePerPagina) };
  const venditeInVista = riepilogoVendite(elencoInVista);
  const conFiltri = !!(filtroStato || edificio || piano || cerca.trim());
  const linkCantiere = unitaAperta ? cantiereInAmbito(parametri, unitaAperta.orderId) : undefined;

  return (
    <div className="generale-sheet space-y-3">
      <IntestazioneScheda icona={LayoutGrid} titolo="Unità e vendite" descrizione={telefono ? undefined : "Disponibilità, acquirenti e incassi. L’analisi economica resta sull’intera operazione."} />
      {/* I m² mancanti: senza, l'operazione non ha i €/m² (16/11/2026). Si scrivono in tabella. */}
      {gestisci && senzaMq > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-dashed bg-muted/30 px-3 py-2 text-sm">
          <Ruler className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            {senzaMq === 1 ? "Un'unità non ha i metri quadri" : `${senzaMq} unità su ${vendite.unita} non hanno i metri quadri`}:
            <span className="text-muted-foreground"> senza, l'operazione non ha il costo e il prezzo al metro quadro.</span>
          </span>
          <Button size="sm" variant="outline" className="h-7" onClick={() => setVista("tabella")}>
            Scrivili in tabella
          </Button>
        </div>
      )}
      {!vuota && <div className="generale-table-toolbar generale-filtri-unita flex-wrap gap-2">
        <div className="generale-cerca-unita relative min-w-40 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2 size-4 text-muted-foreground" aria-hidden="true" />
          <Input type="search" aria-label="Cerca unità" placeholder="Cerca unità o acquirente…"
            className="h-8 pl-8 text-xs" value={cerca} onChange={e => aggiornaFiltro({ "cerca-unita": e.target.value })} />
        </div>
        {edifici.length > 0 && <UniformSelect aria-label="Edificio delle unità" className="h-8 min-w-32" value={edificio}
          onChange={e => aggiornaFiltro({ "edificio-unita": e.target.value })}>
          <option value="">{telefono ? "Edifici" : "Tutti gli edifici"}</option>
          {edifici.map(e => <option value={e} key={e}>{e}</option>)}
        </UniformSelect>}
        {piani.length > 0 && <UniformSelect aria-label="Piano delle unità" className="h-8 min-w-24" value={piano}
          onChange={e => aggiornaFiltro({ "piano-unita": e.target.value })}>
          <option value="">{telefono ? "Piani" : "Tutti i piani"}</option>
          {piani.map(p => <option value={p} key={p}>{etichettaPiano(p)}</option>)}
        </UniformSelect>}
        <UniformSelect aria-label="Filtra unità per stato vendita" className="h-8 min-w-28" value={filtroStato ?? ""}
          onChange={e => aggiornaFiltro({ "stato-vendita": e.target.value })}>
          <option value="">{telefono ? "Stati" : "Tutti gli stati"}</option>
          {STATI_VENDITA.map(s => <option value={s} key={s}>{NOMI_STATO[s].tante}</option>)}
        </UniformSelect>
        {conFiltri && <div className="generale-esito-filtri-unita flex min-w-0 flex-wrap items-center justify-between gap-x-2">
          <span role="status" className="text-xs tabular-nums text-muted-foreground">{ordinate.length} di {vendite.unita} unità</span>
          <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => aggiornaFiltro({
            "cerca-unita": "", "edificio-unita": "", "piano-unita": "", "stato-vendita": "",
          })}>Azzera filtri</Button>
        </div>}
      </div>}
      {!vuota && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <ul aria-label="Unità per stato" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {STATI_VENDITA.map((s) => (
              <li key={s} className="inline-flex items-center gap-1.5">
                <span className={cn("h-2.5 w-2.5 rounded-sm", STILE_STATO[s].punto)} aria-hidden="true" />
                <span className="text-muted-foreground">{NOMI_STATO[s].tante}</span>
                <span className="font-medium tabular-nums">{vendite.conteggi[s]}</span>
              </li>
            ))}
          </ul>
          {!telefono && e.permessi.importi && (
            <span className="text-xs text-muted-foreground">
              Venduto {euro(vendite.venduto)} · incassato {euro(vendite.incassato)}
            </span>
          )}
          {!telefono && (
            <div className="ml-auto flex items-center gap-2">
              <ToggleGroup type="single" size="sm" value={vista} onValueChange={v => v && setVista(v)} aria-label="Vista">
                <ToggleGroupItem value="tabellone" aria-label="Tabellone"><LayoutGrid className="mr-1.5 h-3.5 w-3.5" /> Tabellone</ToggleGroupItem>
                <ToggleGroupItem value="tabella" aria-label="Tabella"><Table2 className="mr-1.5 h-3.5 w-3.5" /> Tabella</ToggleGroupItem>
              </ToggleGroup>
              <BottoneListino generaleId={generaleId} operazione={riepilogo.generale.nome} unita={e.unita} vedeImporti={e.permessi.importi} />
              {gestisci && (
                <Button size="sm" variant="outline" onClick={() => setCaricaFile(true)}><FolderUp className="mr-1.5 h-3.5 w-3.5" /> Carica piante e documenti</Button>
              )}
              {gestisci && dalPiano && (
                <Button size="sm" variant="outline" onClick={() => apriSerie(dalPiano.righe)} title={`Il piano elenca ancora ${dalPiano.composizione} da creare`}>
                  <ListChecks className="mr-1.5 h-3.5 w-3.5" /> Dal piano ({dalPiano.righe.length})
                </Button>
              )}
              {gestisci && (
                <Button size="sm" onClick={() => apriSerie(null)}><Plus className="mr-1.5 h-3.5 w-3.5" /> Nuove unità in serie</Button>
              )}
            </div>
          )}
        </div>
      )}

      {garanzie && (telefono ? (
        <details className="rounded-md border border-amber-300 bg-amber-50 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          <summary className="cursor-pointer px-3 py-2.5 font-medium">
            Garanzie pre-rogito · {garanzie.sigle.length} {garanzie.sigle.length === 1 ? "unità interessata" : "unità interessate"}
          </summary>
          <p className="border-t border-amber-200 px-3 py-2 dark:border-amber-500/30">
            {garanzie.sigle.join(", ")}. Garanzie per gli immobili da costruire (D.Lgs. 122/2005).
          </p>
        </details>
      ) : (
        <div role="note" className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            Immobili da costruire: su {garanzie.sigle.join(", ")} ci sono somme versate prima del rogito
            {garanzie.somme !== null && <> ({euro(garanzie.somme)})</>}. Se l'acquirente è una persona fisica serve una
            fideiussione di pari importo e, al rogito, la polizza assicurativa decennale (D.Lgs. 122/2005).
          </p>
        </div>
      ))}

      {vuota ? (
        <div className="rounded-lg border bg-card px-4 py-6 text-center">
          {gestisci && dalPiano ? (
            <>
              {/* Due partenze esplicite, nessuna nascosta: dalle vendite del piano o a mano. */}
              <p className="text-sm">
                Il piano economico elenca <span className="font-medium">{dalPiano.composizione}</span>
                {e.permessi.importi && dalPiano.valore > 0 && <> per <span className="font-medium tabular-nums">{euro(dalPiano.valore)}</span></>}.
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">Si creano con i nomi e i prezzi del piano: prima di confermare li controlli e li correggi.</p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                <Button size="sm" onClick={() => apriSerie(dalPiano.righe)}><ListChecks className="mr-1.5 h-3.5 w-3.5" /> Crea dalle vendite del piano</Button>
                <Button size="sm" variant="outline" onClick={() => apriSerie(null)}><Plus className="mr-1.5 h-3.5 w-3.5" /> Scrivi a mano</Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {telefono ? "Nessuna unità." : "Scrivi le unità tutte insieme: A1, A2… con piano, m², millesimi e prezzo di listino, anche incollandole da Excel."}
              </p>
              {gestisci && (
                <Button size="sm" className="mt-3" onClick={() => apriSerie(null)}><Plus className="mr-1.5 h-3.5 w-3.5" /> Nuove unità in serie</Button>
              )}
            </>
          )}
        </div>
      ) : elencoInVista.unita.length === 0 ? <div className="generale-panel p-6 text-sm text-muted-foreground">Nessuna unità corrisponde ai filtri.</div> : vista === "tabella" && !telefono ? (
        <TabellaUnita elenco={elencoInVista} conti={conti} riepilogo={venditeInVista} onApri={setAperta} generaleId={generaleId}
          puoModificare={gestisci} totale={pagine > 1 ? "Totale pagina" : conFiltri ? "Totale selezione" : "Totale"} />
      ) : (
        <div className={cn(!telefono && "rounded-lg border bg-card p-3")}>
          <TabelloneUnita unita={elencoInVista.unita} vedeImporti={e.permessi.importi} onApri={setAperta} telefono={telefono} />
        </div>
      )}
      <TablePagination currentPage={pagina} totalPages={pagine} pageSize={righePerPagina} totalItems={ordinate.length}
        pageSizeOptions={RIGHE_UNITA} onPageSizeChange={n => aggiornaFiltro({ "righe-unita": String(n) })}
        onPageChange={n => {
          const p = new URLSearchParams(parametri);
          if (n > 1) p.set("pagina-unita", String(n));
          else p.delete("pagina-unita");
          setParametri(p);
        }} />

      {!telefono && divise.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {divise.map((d) => {
            const parti = e.unita.filter((u) => u.origineId === d.id).map((u) => u.sigla).sort(confrontaSigle);
            return `${d.sigla} divisa il ${dataBreve(d.divisaIl)}${parti.length ? ` in ${parti.join(", ")}` : ""}`;
          }).join(" · ")}
        </p>
      )}

      <UnitaDialog
        generaleId={generaleId}
        operazione={riepilogo.generale.nome}
        unita={unitaAperta}
        elenco={e}
        conti={conti}
        gestisci={gestisci}
        telefono={telefono}
        linkCantiere={linkCantiere}
        onChiudi={() => setAperta(null)}
        onDividi={(id) => { setAperta(null); setDaDividere(id); }}
      />
      {gestisci && (
        <>
          <SerieUnitaDialog open={serieAperta} onOpenChange={cambiaSerie} generaleId={generaleId} sigleEsistenti={sigle} vedeImporti={e.permessi.importi} dalPiano={righeSerie} />
          <DividiUnitaDialog
            generaleId={generaleId}
            unita={e.unita.find((u) => u.orderId === daDividere) ?? null}
            sigleEsistenti={sigle}
            vedeImporti={e.permessi.importi}
            onChiudi={() => setDaDividere(null)}
          />
        </>
      )}
      {caricaFile && (
        <CaricaFileUnita
          generaleId={generaleId}
          modello={riepilogo.generale.modello}
          unita={e.unita.filter((u) => !u.divisaIl).map((u) => ({ orderId: u.orderId, sigla: u.sigla }))}
          onClose={() => setCaricaFile(false)}
        />
      )}
    </div>
  );
}
