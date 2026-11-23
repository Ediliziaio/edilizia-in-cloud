import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Layers, PackageSearch, Search, ShoppingCart, Sparkles } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { NavigazioneArticoli } from "@/components/orders/materiali/NavigazioneArticoli";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { UniformSelect } from "@/components/ui/uniform-select";
import { useEdificiPriorita } from "@/hooks/useDettagliPrioritaOperazione";
import { useCodaMaterialiOperazione, useIndiceMaterialiOperazione, useMagazzinoMaterialiOperazione, useMaterialiOperazione, type RegistroMateriale } from "@/hooks/useMaterialiOperazione";
import { usePermissions } from "@/hooks/usePermissions";
import { gruppiNavigazioneArticoli, type VistaArticoli } from "@/lib/distinta/navigazioneArticoli";
import { ETICHETTA_STATO_MATERIALE } from "@/lib/distinta/statoMateriale";
import { acquistabile, ETICHETTA_STATO_FASE } from "@/lib/distinta/statiFase";
import { CODE_MATERIALI, nellaCodaMateriali, prontoDaOrdinare, quoteGiacenzaMateriali, type CodaMateriali } from "@/lib/distinta/registroMaterialiOperazione";
import { ODA_STATUS_COLORS, ODA_STATUS_LABELS } from "@/lib/odaStatus";
import type { RiepilogoGenerale } from "@/lib/orders/commesseGenerali";
import { cercaNellOperazione, paginaRegistro, RIGHE_REGISTRO } from "@/lib/orders/generali/registroOperazione";
import { unitaMateriale, type ProcurementItem } from "@/lib/orders/materialProcurement";
import { dataBreve } from "../piano/formato";
import { AmbitoOperazione } from "./AmbitoOperazione";
import { AcquistiMaterialiOperazione } from "./AcquistiMaterialiOperazione";
import { RipartizioneComputoOperazione } from "./RipartizioneComputoOperazione";
import { ProposteMaterialiOperazione } from "./ProposteMaterialiOperazione";
import { RiservaMaterialeOperazione } from "./RiservaMaterialeOperazione";

const numero = new Intl.NumberFormat("it", { maximumFractionDigits: 4 });
const quantita = (n: number, riga: ProcurementItem) => `${numero.format(n)} ${unitaMateriale(riga)}`;

function StatoOrdiniMateriale({ riga }: { riga: RegistroMateriale }) {
  const parziale = !riga.piano.review && riga.acquisto.stato === "ordinato" && riga.piano.issued > 0
    && riga.piano.issued < Number(riga.quantity);
  const stato = riga.piano.daScorta > 0 && riga.acquisto.stato === "da_ordinare"
    ? (riga.piano.remaining > 0 ? "Scorta parziale" : "Da scorta")
    : parziale ? "Ordinato in parte" : riga.stock_item_id && riga.acquisto.stato === "da_ordinare"
    ? "Da magazzino" : ETICHETTA_STATO_MATERIALE[riga.acquisto.stato];
  const odaAttivo = riga.oda.some(o => o.status !== "annullato");
  const collegamento = (o: RegistroMateriale["oda"][number]) => <Link key={o.id}
    className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-primary hover:underline"
    to={`/azienda/ordini-acquisto/${o.id}`}>
    {o.oda_number}
    <span className={`rounded px-1 py-0.5 text-[11px] ${ODA_STATUS_COLORS[o.status] ?? "bg-muted text-muted-foreground"}`}>
      {ODA_STATUS_LABELS[o.status] ?? o.status}
    </span>
  </Link>;
  return <div className="flex min-w-32 flex-col items-start gap-0.5 py-0.5">
    <span className="generale-registro-stato" title={riga.acquisto.dettaglio ?? undefined}
      data-tono={riga.acquisto.stato === "consegnato" || riga.acquisto.stato === "installato" ? "verde" : odaAttivo ? "blu" : undefined}>
      {stato}
    </span>
    {riga.oda.length === 1 && collegamento(riga.oda[0])}
    {riga.oda.length > 1 && <Popover>
      <PopoverTrigger asChild><Button size="sm" variant="link" className="h-auto px-0 text-xs">{riga.oda.length} ordini collegati</Button></PopoverTrigger>
      <PopoverContent align="start" className="flex w-auto max-w-[90vw] flex-col items-start gap-2 p-3">
        {riga.oda.map(collegamento)}
      </PopoverContent>
    </Popover>}
  </div>;
}

export default function MaterialiOperazione({ riepilogo, apri, genera, apriProposte }: {
  riepilogo: RiepilogoGenerale;
  apri: (id: string, ricerca?: string) => void;
  genera?: (id: string, computoId?: string) => void;
  apriProposte?: (id: string, fase: string | null) => void;
}) {
  const { generale, figlie } = riepilogo;
  const [params, setParams] = useSearchParams();
  const permessi = usePermissions();
  const [destinazione, setDestinazione] = useState<string | null>(null);
  const [ripartisci, setRipartisci] = useState(false);
  const [acquisti, setAcquisti] = useState(false);
  const [proposte, setProposte] = useState(false);
  const [riserva, setRiserva] = useState<{ riga: RegistroMateriale; stockId: string; suggerita: number; commessa: string }>();
  const [esitoRiserva, setEsitoRiserva] = useState("");
  const richiestaVista = params.get("vista-materiali");
  const vista: VistaArticoli = richiestaVista === "fornitori" || richiestaVista === "magazzino" ? richiestaVista : "fasi";
  const gruppoRichiesto = params.get("gruppo-materiali");
  const richiesta = generale.modello === "appalto" ? "" : params.get("materiali-edificio") ?? "";
  const ricerca = (params.get("materiali-ricerca") ?? "").trim().slice(0, 100);
  const pagina = paginaRegistro(params.get("materiali-pagina"));
  const richiestaCoda = params.get("materiali-coda");
  const coda = richiestaCoda && Object.hasOwn(CODE_MATERIALI, richiestaCoda) ? richiestaCoda as CodaMateriali : "tutti";
  const edificiQuery = useEdificiPriorita(generale.modello === "appalto" ? undefined : generale.id);
  const edificioDi: ReadonlyMap<string, string> = useMemo(() => new Map((edificiQuery.data ?? []).flatMap(u => u.edificio ? [[u.order_id, u.edificio] as const] : [])), [edificiQuery.data]);
  const edifici = [...new Set(edificioDi.values())].sort((a, b) => a.localeCompare(b, "it", { numeric: true }));
  const edificio = edifici.includes(richiesta) ? richiesta : "";
  const attendeEdificio = !!richiesta && !edificiQuery.data;
  const vistaScorte = vista === "magazzino" && permessi.canViewWarehouse === true;
  const codaAttiva = coda !== "tutti" || vistaScorte;
  const indice = useIndiceMaterialiOperazione(generale.id, edificio, vista === "magazzino", !attendeEdificio && !codaAttiva);
  const registro = useCodaMaterialiOperazione(generale.id, !attendeEdificio && codaAttiva, false, vistaScorte ? "" : edificio);
  const magazzino = useMagazzinoMaterialiOperazione(vistaScorte);
  const quote = useMemo(() => vistaScorte && registro.data && magazzino.data
    ? quoteGiacenzaMateriali(registro.data, magazzino.data.stock, magazzino.data.codici) : null,
  [vistaScorte, registro.data, magazzino.data]);
  const { gruppi, idVisibili } = (() => {
    const fasi = new Map<string, { id: string | null; nome: string; materiali: NonNullable<typeof indice.data> }>();
    const fornitori = new Map<string, string>();
    const unitaVisibili = vistaScorte && edificio ? new Set((edificiQuery.data ?? [])
      .filter(u => u.edificio === edificio).map(u => u.order_id)) : null;
    const dati = codaAttiva ? (registro.data ?? []).filter(r => nellaCodaMateriali(r, coda)
      && (!unitaVisibili || unitaVisibili.has(r.order_id))) : indice.data ?? [];
    const righe = dati.filter(r => cercaNellOperazione(ricerca, [r.name, r.product_code, r.fase?.name, r.fornitore?.name]));
    for (const riga of righe) {
      const nome = riga.fase?.name?.trim();
      const id = nome ? `fase:${nome.replace(/\s+/g, " ").toLocaleLowerCase("it")}` : "_senza";
      const fase = fasi.get(id);
      if (fase) fase.materiali.push(riga);
      else fasi.set(id, { id, nome: nome || "Senza fase", materiali: [riga] });
      if (riga.supplier_id && riga.fornitore?.name) fornitori.set(riga.supplier_id, riga.fornitore.name);
    }
    const perNome = [...fasi.values()].sort((a, b) => a.nome.localeCompare(b.nome, "it", { numeric: true }));
    const gruppi = gruppiNavigazioneArticoli(perNome, vista, [...fornitori].map(([id, name]) => ({ id, name })),
      magazzino.data?.stock, magazzino.data?.codici, quote ? id => quote.get(id)?.suggerita ?? 0 : undefined);
    return { gruppi, idVisibili: gruppi.flatMap(g => g.articoli) };
  })();
  const gruppo = gruppi.find(g => g.id === gruppoRichiesto);
  const selezionati = gruppo?.articoli ?? idVisibili;
  const inizioPagina = (pagina - 1) * RIGHE_REGISTRO;
  const attendeMagazzino = vistaScorte && magazzino.isPending;
  const idsPagina = attendeMagazzino ? [] : selezionati.slice(inizioPagina, inizioPagina + RIGHE_REGISTRO);
  const materiali = useMaterialiOperazione(generale.id, edificio, codaAttiva ? [] : idsPagina);
  const commesse = new Map(figlie.map(f => [f.id, f.codice || f.nome]));
  const aggiornaFiltro = (chiave: string, valore: string) => {
    const p = new URLSearchParams(params);
    if (valore) p.set(chiave, valore);
    else p.delete(chiave);
    if (chiave !== "gruppo-materiali") p.delete("gruppo-materiali");
    p.delete("materiali-pagina");
    setParams(p, { replace: true });
  };
  const sfoglia = (n: number) => {
    const p = new URLSearchParams(params);
    if (n > 1) p.set("materiali-pagina", String(n));
    else p.delete("materiali-pagina");
    setParams(p);
  };
  const altre = selezionati.length > inizioPagina + RIGHE_REGISTRO;
  const idsNellaPagina = new Set(idsPagina);
  const righe = codaAttiva ? (registro.data ?? []).filter(r => idsNellaPagina.has(r.id)) : materiali.data ?? [];
  const righePerId = new Map(righe.map(r => [r.id, r]));
  const sezioni = (gruppo ? [gruppo] : gruppi).flatMap(g => {
    const articoli = g.articoli.flatMap(id => {
      const riga = righePerId.get(id);
      return riga ? [riga] : [];
    });
    return articoli.length ? [{ ...g, articoli }] : [];
  });
  const errore = attendeEdificio ? edificiQuery.isError
    : (codaAttiva ? registro.isError : indice.isError || materiali.isError) || (vistaScorte && magazzino.isError);
  const caricamento = !errore && (attendeEdificio || attendeMagazzino
    || (codaAttiva ? registro.isPending : indice.isPending || (idsPagina.length > 0 && materiali.isPending)));
  const opzioniDestinazione = edificio ? figlie.filter(f => edificioDi.get(f.id) === edificio) : figlie;
  const sceltaValida = destinazione === generale.id || opzioniDestinazione.some(f => f.id === destinazione);
  const puoComprare = !permessi.solaLettura && permessi.canEditOrders && permessi.canViewCosts;
  const puoRiservare = vistaScorte && !permessi.solaLettura && permessi.canEditOrders && permessi.canEditWarehouse;

  return <section aria-label="Materiali dell’operazione" className="min-w-0 overflow-hidden rounded-xl border bg-card">
    <header className="generale-registro-header">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold">
        <PackageSearch className="size-4 text-primary" aria-hidden="true" /> Articoli e materiali
      </h3>
      <div className="generale-registro-strumenti">
        {edifici.length > 0 && <UniformSelect aria-label="Edificio dei materiali" value={edificio} className="h-8"
          onChange={e => aggiornaFiltro("materiali-edificio", e.target.value)}>
          <option value="">Tutti gli edifici</option>
          {edifici.map(e => <option key={e} value={e}>{e}</option>)}
        </UniformSelect>}
        <form key={ricerca} role="search" aria-label="Cerca tra i materiali" className="flex min-w-0 gap-1" onSubmit={e => {
          e.preventDefault();
          aggiornaFiltro("materiali-ricerca", String(new FormData(e.currentTarget).get("articolo") ?? "").trim().slice(0, 100));
        }}>
          <Input type="search" name="articolo" aria-label="Nome del materiale" placeholder="Cerca materiale…" defaultValue={ricerca}
            maxLength={100} className="h-8 min-w-0 max-w-44 text-xs md:text-xs" />
          <Button type="submit" size="icon" variant="outline" className="size-8 shrink-0" aria-label="Cerca materiale">
            <Search className="size-4" aria-hidden="true" />
          </Button>
        </form>
        <Button type="button" size="sm" variant="outline" className="h-8 px-2 text-xs" onClick={() => apri(generale.id)}>
          Materiali della generale
        </Button>
        {genera && <Button type="button" size="sm" className="h-8 px-2 text-xs" onClick={() => setDestinazione(edificio ? "" : generale.id)}>
          <Sparkles className="size-4" aria-hidden="true" /> Genera dal computo
        </Button>}
      </div>
    </header>
    <div className="flex flex-wrap items-center gap-1 border-b px-2 py-1.5">
      <div role="group" aria-label="Coda dei materiali" className="flex flex-wrap gap-1">
        {(Object.entries(CODE_MATERIALI) as [CodaMateriali, string][]).map(([id, label]) =>
          <Button key={id} type="button" size="sm" variant={coda === id ? "default" : "outline"} className="h-7 px-2 text-xs"
            aria-pressed={coda === id} onClick={() => aggiornaFiltro("materiali-coda", id === "tutti" ? "" : id)}>{label}</Button>)}
        {apriProposte && <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setProposte(true)}>Proposte dal computo</Button>}
      </div>
      <div className="ml-auto flex flex-wrap gap-1">
        {genera && <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setRipartisci(true)}>
          <Layers className="size-3.5" /> Ripartisci il computo
        </Button>}
        {puoComprare && <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setAcquisti(true)}>
          <ShoppingCart className="size-3.5" /> Prepara per fornitore
        </Button>}
      </div>
    </div>
    {quote && <p className="border-b px-3 py-1.5 text-xs text-muted-foreground">
      Il libero suggerito è distribuito per data di fabbisogno su tutta l’operazione. Riserve e prelievi registrati sono indicati a parte.
    </p>}
    {esitoRiserva && <p role="status" className="border-b bg-emerald-50 px-3 py-1.5 text-xs text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">{esitoRiserva}</p>}
    <div className="grid min-w-0 items-start gap-2 p-2 lg:grid-cols-[12.5rem_minmax(0,1fr)]">
      <NavigazioneArticoli vista={vista} onVista={v => aggiornaFiltro("vista-materiali", v === "fasi" ? "" : v)}
        gruppi={gruppi} scelto={gruppo?.id ?? "_tutti"} onGruppo={id => aggiornaFiltro("gruppo-materiali", id === "_tutti" ? "" : id)}
        totale={idVisibili.length} aggiornamento={vista === "magazzino" && magazzino.isFetching} errore={vista === "magazzino" && magazzino.isError} />
      <div className="min-w-0 overflow-hidden rounded-lg border">
    {caricamento ? <Skeleton className="m-2 h-48" /> : errore ? (
      <p role="status" className="p-3 text-sm">
        Elenco dei materiali non disponibile. <Button type="button" size="sm" variant="link"
          onClick={() => void (attendeEdificio ? edificiQuery.refetch() : magazzino.isError ? magazzino.refetch()
            : codaAttiva ? registro.refetch() : indice.isError ? indice.refetch() : materiali.refetch())}>Riprova</Button>
      </p>
    ) : righe.length === 0 ? (
      <p className="px-3 py-4 text-sm text-muted-foreground">Nessun materiale corrisponde ai filtri.</p>
    ) : <div className="overflow-x-auto">
      <table aria-label="Elenco materiali dell’operazione" className="generale-registro-tabella generale-registro-materiali">
        <thead><tr>
          <th scope="col">Articolo</th><th scope="col">Acquisto e OdA</th><th scope="col">Commessa</th>
          <th scope="col" className="text-right">Previsti</th><th scope="col" className="text-right">In bozza</th>
          <th scope="col" className="text-right">Ordinati</th><th scope="col" className="text-right">Arrivati</th>
          {quote && <><th scope="col" className="text-right">Riservati o prelevati</th><th scope="col" className="text-right">Libero suggerito</th></>}
          <th scope="col" className="text-right">{quote ? "Da comprare (stima)" : "Residuo"}</th>
          {edifici.length > 0 && <th scope="col">Edificio</th>}
          <th scope="col">Fase</th><th scope="col">Serve entro</th><th scope="col">Fornitore</th><th scope="col">Verifica tecnica</th>
        </tr></thead>
        {sezioni.map(sezione => <tbody key={sezione.id}>
          <tr><th scope="rowgroup" colSpan={12 + Number(edifici.length > 0) + (quote ? 2 : 0)} className="bg-muted/70">
            <span className="font-semibold text-foreground">{sezione.nome}</span>
            <span className="ml-2 font-normal tabular-nums">{sezione.articoli.length} in questa pagina</span>
          </th></tr>
          {sezione.articoli.map(riga => {
          const commessa = riga.order_id === generale.id ? "Generale" : commesse.get(riga.order_id) ?? "Commessa";
          const preparazione = riga.validazione ? ETICHETTA_STATO_FASE[riga.validazione] : null;
          const avviso = riga.piano.review ?? (riga.verifica?.stato === "da_verificare" ? riga.verifica.motivi.join(" · ") || "Verifica i dati del materiale" : null);
          const giacenza = quote?.get(riga.id);
          const stockId = riga.piano.daScorta > 0 ? riga.stock_item_id
            : !riga.stock_item_id && giacenza?.suggerita ? giacenza.candidato?.id : null;
          const modificaRiserva = puoRiservare && stockId && !riga.posizioni?.length && !riga.supplier_rfq_item_id
            && !riga.auto_deducted && (riga.status === "da_ordinare" || riga.status === "ordinato" || !riga.status)
            && riga.fulfillment_status !== "delivered" && !riga.piano.received && !Number(riga.quantity_received)
            && !avviso;
          return <tr key={riga.id} data-articolo>
            <td>
              <button type="button" className="generale-registro-testo text-left font-medium text-primary hover:underline"
                title={`Apri materiali · ${commessa} · ${riga.name}`} onClick={() => apri(riga.order_id, riga.name)}>
                {riga.product_code && <span className="mr-1.5 font-mono text-xs text-muted-foreground">{riga.product_code}</span>}
                {riga.name}
              </button>
              {modificaRiserva && <Button type="button" variant="outline" size="sm" className="ml-1.5 h-6 px-1.5 text-[11px]"
                aria-label={`${riga.piano.daScorta > 0 ? "Modifica riserva" : "Riserva"} di ${riga.name} · ${commessa}`}
                onClick={() => setRiserva({ riga, stockId, suggerita: giacenza?.suggerita ?? 0, commessa })}>
                {riga.piano.daScorta > 0 ? "Modifica" : "Riserva"}
              </Button>}
            </td>
            <td><StatoOrdiniMateriale riga={riga} /></td>
            <td className="font-mono text-xs">{commessa}</td>
            <td className="text-right tabular-nums">{quantita(Number(riga.quantity) || 0, riga)}</td>
            <td className="text-right tabular-nums">{quantita(riga.piano.drafted, riga)}</td>
            <td className="text-right tabular-nums">{quantita(riga.piano.issued, riga)}</td>
            <td className="text-right tabular-nums">{riga.acquisto.unitaDaVerificare ? "—" : quantita(riga.piano.received, riga)}</td>
            {quote && <><td className="text-right tabular-nums">
                {giacenza?.riservata ? `${quantita(giacenza.riservata, riga)} riservati` : "—"}
                {!!giacenza?.prelevata && <span className="block text-[11px] text-muted-foreground">{quantita(giacenza.prelevata, riga)} prelevati</span>}
              </td>
              <td className="text-right tabular-nums">{giacenza?.verifica ? "Da verificare" : quantita(giacenza?.suggerita ?? 0, riga)}</td></>}
            <td className="text-right tabular-nums font-medium">{quote
              ? giacenza?.daComprare == null ? "—" : quantita(giacenza.daComprare, riga)
              : avviso || (riga.stock_item_id && !riga.piano.daScorta) ? "—" : quantita(riga.piano.remaining, riga)}</td>
            {edifici.length > 0 && <td>{edificioDi.get(riga.order_id) ?? "—"}</td>}
            <td>{riga.fase?.name || "Senza fase"}</td><td>{dataBreve(riga.data_fabbisogno)}</td>
            <td><span className="block max-w-36 truncate" title={riga.fornitore?.name ?? undefined}>{riga.fornitore?.name || "—"}</span></td>
            <td>{(avviso || preparazione || prontoDaOrdinare(riga)) ? <span className="generale-registro-stato"
              data-tono={avviso || !acquistabile(riga.validazione) ? "arancio" : "verde"}
              title={avviso ?? undefined}>{avviso ? "Da verificare" : preparazione ?? "Pronto da ordinare"}</span> : "—"}</td>
          </tr>;
        })}</tbody>)}
      </table>
    </div>}
    {(pagina > 1 || altre) && <nav aria-label="Pagine dei materiali" className="generale-registro-pagine flex items-center justify-between gap-2 border-t px-3 py-1">
      <span className="text-xs text-muted-foreground">Pagina {pagina}{righe.length > 0 && ` · Righe ${(pagina - 1) * RIGHE_REGISTRO + 1}–${(pagina - 1) * RIGHE_REGISTRO + righe.length}`}</span>
      <div className="flex gap-1">
        <Button type="button" size="sm" variant="outline" className="h-8" disabled={pagina <= 1} onClick={() => sfoglia(pagina - 1)}>
          <ChevronLeft className="size-4" aria-hidden="true" /> Indietro
        </Button>
        <Button type="button" size="sm" variant="outline" className="h-8" disabled={!altre} onClick={() => sfoglia(pagina + 1)}>
          Avanti <ChevronRight className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </nav>}
      </div>
    </div>
    {riserva && <RiservaMaterialeOperazione generaleId={generale.id} {...riserva} chiudi={() => setRiserva(undefined)} salvata={q => {
      setEsitoRiserva(q === 0 ? `Riserva liberata per ${riserva.commessa}.`
        : `${quantita(q, riserva.riga)} riservati a ${riserva.commessa}.`);
      setRiserva(undefined);
    }} />}
    {ripartisci && genera && <RipartizioneComputoOperazione riepilogo={riepilogo} edifici={edificioDi} chiudi={() => setRipartisci(false)} genera={genera} />}
    {acquisti && puoComprare && <AcquistiMaterialiOperazione riepilogo={riepilogo} edificio={edificio} ricerca={ricerca}
      idsGruppo={gruppo ? new Set(gruppo.articoli) : undefined} chiudi={() => setAcquisti(false)} />}
    {proposte && apriProposte && <ProposteMaterialiOperazione riepilogo={riepilogo} edificio={edificio} edifici={edificioDi}
      chiudi={() => setProposte(false)} apri={(id, fase) => { setProposte(false); apriProposte(id, fase); }} />}
    <Dialog open={!!genera && destinazione !== null} onOpenChange={aperto => { if (!aperto) setDestinazione(null); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Genera materiali dal computo</DialogTitle>
          <DialogDescription>Scegli dove preparare le proposte. Puoi rivederle prima di aggiungerle agli articoli.</DialogDescription>
        </DialogHeader>
        <AmbitoOperazione fissi={[{ id: generale.id, nome: "Commessa generale", codice: generale.codice }]}
          figlie={opzioniDestinazione} etichetta="Destinazione dei materiali" valore={destinazione ?? ""} onChange={setDestinazione} />
        <DialogFooter>
          <Button type="button" disabled={!sceltaValida} onClick={() => {
            if (!destinazione || !sceltaValida) return;
            setDestinazione(null);
            genera?.(destinazione);
          }}>Continua al computo</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}
