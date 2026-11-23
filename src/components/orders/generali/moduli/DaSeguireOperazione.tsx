import { useState } from "react";
import { ArrowUpRight, CalendarClock, ChevronLeft, ChevronRight, ClipboardList, ListChecks, ListTree, PackageCheck, PackageSearch, Truck, Wallet, type LucideIcon } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { UniformSelect } from "@/components/ui/uniform-select";
import { useCassaOperazione } from "@/hooks/useCassaOperazione";
import { useFasiConsegna, useReferentiPriorita } from "@/hooks/useDettagliPrioritaOperazione";
import type { MovimentiOperazione } from "@/hooks/useMovimentiOperazione";
import { aggiungiGiorni, fasiCronoprogramma, giornoLocale, lavoroRealeFasi, ritardoFase } from "@/lib/orders/cronoprogramma";
import type { RiepilogoGenerale } from "@/lib/orders/commesseGenerali";
import { CATEGORIE_PRIORITA, nelPeriodoRegistro, RIGHE_REGISTRO, type CategoriaPriorita, type PeriodoRegistro } from "@/lib/orders/generali/registroOperazione";
import { planningDay } from "@/lib/orders/planning";
import { formattaFabbisogno, MOTIVI_FABBISOGNO, type ConsegnaFase } from "@/lib/orders/generali/consegneFasi";
import { formatCurrency } from "@/lib/formatters";
import { dataBreve } from "../piano/formato";

type CommessaPriorita = { codice: string | null; nome: string | null };
type Consegna = { id: string; titolo: string };
type VocePriorita = {
  id: string;
  orderId: string | null;
  tipo: string;
  titolo: string;
  data: string | null;
  quando: string;
  prossima: string;
  icona: LucideIcon;
  ordine: number;
  dettaglio?: string;
  dataOrigine?: string | null;
  consegna?: Consegna;
  oda?: { id: string; numero: string };
} & ({ href: string; azione?: never } | { azione: () => void; href?: never });

export function DaSeguireOperazione({
  dati, riepilogo, commesse, categoria, periodo, pagina, scegliCategoria, scegliPagina,
  edifici, edificio, scegliEdificio, edificioPerCommessa, periodoControlli,
  inCaricamento, errore, riprova, apriFase, apriRapportino, consegneFasi, apriMateriali, avvisoMateriali,
}: {
  dati?: MovimentiOperazione;
  riepilogo: RiepilogoGenerale;
  commesse: ReadonlyMap<string, CommessaPriorita>;
  categoria: CategoriaPriorita;
  periodo: PeriodoRegistro;
  pagina: number;
  scegliCategoria: (categoria: CategoriaPriorita) => void;
  scegliPagina: (pagina: number) => void;
  edifici: string[];
  edificio: string;
  edificioPerCommessa: ReadonlyMap<string, string>;
  periodoControlli: React.ReactNode;
  scegliEdificio: (nome: string) => void;
  inCaricamento: boolean;
  errore: boolean;
  riprova: () => void;
  apriFase: (commessaId: string, faseId: string) => void;
  apriRapportino: (commessaId: string, rapportinoId: string) => void;
  consegneFasi?: ConsegnaFase[];
  apriMateriali?: (orderId: string, faseId: string, articolo?: string) => void;
  avvisoMateriali?: React.ReactNode;
}) {
  const [parametri] = useSearchParams();
  const [consegnaAperta, setConsegnaAperta] = useState<Consegna | null>(null);
  const vedeCassa = riepilogo.permessi.importi && riepilogo.permessi.costi;
  const piano = new URLSearchParams(parametri);
  piano.set("scheda", "piano");
  piano.set("vista-piano", "cassa");
  piano.set("cassa-base", "attesi");
  piano.set("cassa-periodo", "futuro");
  const oggi = giornoLocale(new Date().toISOString());
  const solo = (tipo: CategoriaPriorita) => categoria === "tutte" || categoria === tipo;
  const perId = new Map(dati?.fasi.map(f => [f.id, f]));
  const fasi = solo("fasi") && dati ? fasiCronoprogramma(dati.fasi.map(f => ({
    ...f, percentuale: f.percentuale ?? 0, completata_il: f.completata_il ? giornoLocale(f.completata_il) : null,
  })), lavoroRealeFasi(dati.rapportiniCronoprogramma), oggi) : [];
  const voci: VocePriorita[] = [
    ...(solo("materiali") && apriMateriali ? consegneFasi ?? [] : []).flatMap((r): VocePriorita[] => {
      if (!nelPeriodoRegistro(r.serveEntro, periodo) || (categoria === "tutte" && !r.aRischio)) return [];
      const dettaglio = r.unitaDaVerificare ? "Unità di misura da verificare" : `Mancano ${formattaFabbisogno(r.mancanti, r.unita)}`;
      return [{
        id: r.id, orderId: r.orderId, titolo: r.articolo, tipo: MOTIVI_FABBISOGNO[r.motivo],
        icona: PackageSearch, ordine: r.aRischio ? 0 : 2, data: r.serveEntro,
        quando: r.serveEntro ? `Serve entro il ${dataBreve(r.serveEntro)}` : "Data fabbisogno da impostare",
        dettaglio: `${r.fase} · ${dettaglio}`, prossima: "Apri materiale",
        oda: r.oda ? { id: r.oda.id, numero: r.oda.oda_number } : undefined,
        azione: () => apriMateriali?.(r.orderId, r.idFase, r.articolo),
      }];
    }),
    ...fasi.flatMap((fase): VocePriorita[] => {
      if (fase.stato === "completata") return [];
      const ritardo = ritardoFase(fase);
      const dateDaVerificare = fase.dateIncoerenti || !fase.previstoInizio || !fase.previstoFine;
      if (!ritardo && !dateDaVerificare) return [];
      const orderId = perId.get(fase.id)!.order_id;
      const data = ritardo?.su === "inizio" ? fase.previstoInizio : fase.previstoFine ?? fase.previstoInizio;
      if (!nelPeriodoRegistro(data, periodo)) return [];
      const tipo = !ritardo ? "Date da verificare" : ritardo.su === "inizio" ? "Avvio in ritardo" : "Fine in ritardo";
      return [{
        id: fase.id, orderId, titolo: fase.nome, tipo, icona: CalendarClock, ordine: 1, data,
        quando: data ? `${ritardo?.su === "inizio" || !fase.previstoFine ? "Avvio previsto" : "Fine prevista"} ${dataBreve(data)}` : "Scadenza da impostare",
        dettaglio: ritardo ? `+${ritardo.giorni} gg` : undefined,
        prossima: "Apri lavorazione",
        azione: () => apriFase(orderId, fase.id),
      }];
    }),
    ...(solo("ordini") ? (dati?.ordini ?? []) : []).map((o): VocePriorita => {
      const titolo = o.oda_number ?? "Ordine d’acquisto";
      return {
        id: o.id, orderId: o.order_id, titolo, tipo: "Consegna in ritardo", icona: PackageCheck,
        ordine: 1, data: o.expected_delivery_date, quando: o.expected_delivery_date ? `Attesa il ${dataBreve(o.expected_delivery_date)}` : "Scadenza da impostare",
        dettaglio: o.supplier_id && dati?.fornitori[o.supplier_id] || undefined,
        href: `/azienda/ordini-acquisto/${o.id}`, prossima: "Apri ordine", consegna: { id: o.id, titolo },
      };
    }),
    ...(solo("ddt") ? (dati?.ddt ?? []) : []).map((d): VocePriorita => ({
      id: d.id, orderId: d.order_id, titolo: d.numero_ddt ?? "DDT",
      tipo: d.stato === "non_conforme" ? "DDT non conforme" : "DDT da verificare",
      icona: Truck, ordine: d.stato === "non_conforme" ? 0 : 2, data: d.data_ricezione, href: `/azienda/ddt/${d.id}`,
      quando: "Scadenza da impostare", dataOrigine: d.data_ricezione,
      prossima: "Apri DDT",
    })),
    ...(solo("rapportini") ? (dati?.rapportini ?? []) : []).map((r): VocePriorita => ({
      id: r.id, orderId: r.order_id, titolo: r.descrizione_lavori || "Rapportino", tipo: "Rapportino da approvare",
      icona: ClipboardList, ordine: 2, data: r.data_lavoro,
      quando: "Scadenza da impostare", dataOrigine: r.data_lavoro,
      prossima: "Apri rapportino", azione: () => apriRapportino(r.order_id, r.id),
    })),
  ];
  voci.sort((a, b) => a.ordine - b.ordine || (a.data ?? "9999").localeCompare(b.data ?? "9999") || a.id.localeCompare(b.id));
  const paginate = categoria === "fasi" || categoria === "materiali";
  const mostrate = categoria === "tutte" ? voci.slice(0, 8) : paginate
    ? voci.slice((pagina - 1) * RIGHE_REGISTRO, pagina * RIGHE_REGISTRO) : voci;
  const altre = paginate ? voci.length > pagina * RIGHE_REGISTRO
    : categoria === "ordini" || categoria === "ddt" || categoria === "rapportini" ? !!dati?.pagine?.[categoria]?.altre : false;

  return (
    <section aria-labelledby="cantiere-priorita" className="overflow-hidden rounded-xl border bg-card">
      <header className="generale-registro-header">
        <h3 id="cantiere-priorita" className="flex items-center gap-2 text-sm font-semibold">
          <ListChecks className="size-4 text-primary" aria-hidden="true" /> Priorità del cantiere
        </h3>
        <div className="generale-registro-strumenti">
          <div role="group" aria-label="Tipo di priorità" className="generale-registro-categorie">
            {CATEGORIE_PRIORITA.filter(([id]) => (id !== "cassa" || vedeCassa) && (id !== "materiali" || apriMateriali)).map(([id, label]) => (
              <Button key={id} type="button" size="sm" variant={categoria === id ? "secondary" : "outline"}
                aria-pressed={categoria === id} onClick={() => scegliCategoria(id)} className="h-8 gap-1 px-2 text-xs">
                {id === "cassa" && <Wallet className="size-3.5" aria-hidden="true" />}{label}
              </Button>
            ))}
          </div>
          {edifici.length > 0 && <UniformSelect aria-label="Edificio delle priorità" className="h-8"
            value={edificio} onChange={event => scegliEdificio(event.target.value)}>
            <option value="">Tutti gli edifici</option>
            {edifici.map(nome => <option key={nome} value={nome}>{nome}</option>)}
          </UniformSelect>}
          {periodoControlli}
        </div>
        {vedeCassa && <Button asChild size="icon" variant="ghost" className="size-8 max-md:hidden">
          <Link to={{ search: piano.toString() }} aria-label="Cassa e indicatori" title="Cassa e indicatori">
            <Wallet aria-hidden="true" />
          </Link>
        </Button>}
      </header>
      {categoria === "cassa" && vedeCassa ? (
        <ScadenzePriorita riepilogo={riepilogo} periodo={periodo} pagina={pagina} scegliPagina={scegliPagina} commesse={commesse} edificioPerCommessa={edificioPerCommessa} oggi={oggi} />
      ) : inCaricamento ? (
        <div className="p-3"><Skeleton className="h-28 w-full" /></div>
      ) : errore || !dati ? (
        <p role="alert" className="px-3 py-4 text-sm">Priorità non disponibili. <Button size="sm" variant="link" onClick={riprova}>Riprova</Button></p>
      ) : (
        <>
          {avvisoMateriali}
          {(categoria !== "materiali" || consegneFasi) &&
            <ListaPriorita voci={mostrate} commesse={commesse} edificioPerCommessa={edificioPerCommessa} apriConsegna={setConsegnaAperta} />}
          {categoria === "tutte" ? (
            (voci.length > 8 || Object.values(dati.pagine ?? {}).some(p => p.altre)) && (
              <p className="border-t px-3 py-2 text-xs text-muted-foreground">Prime {mostrate.length} priorità. Scegli una categoria per scorrere l’elenco.</p>
            )
          ) : <PaginePriorita pagina={pagina} altre={altre} righe={mostrate.length} scegliPagina={scegliPagina} />}
        </>
      )}
      <Sheet open={!!consegnaAperta} onOpenChange={open => { if (!open) setConsegnaAperta(null); }}>
        {consegnaAperta && <SheetContent className="space-y-4 p-4 sm:max-w-md sm:p-5">
          <LavorazioniConsegna consegna={consegnaAperta} commesse={commesse} apriFase={(ordineId, faseId) => {
            setConsegnaAperta(null);
            apriFase(ordineId, faseId);
          }} />
        </SheetContent>}
      </Sheet>
    </section>
  );
}

function ListaPriorita({ voci, commesse, edificioPerCommessa, apriConsegna }: {
  voci: VocePriorita[];
  commesse: ReadonlyMap<string, CommessaPriorita>;
  edificioPerCommessa: ReadonlyMap<string, string>;
  apriConsegna?: (c: Consegna) => void;
}) {
  const referenti = useReferentiPriorita(voci.flatMap(voce => voce.orderId && commesse.has(voce.orderId) ? [voce.orderId] : []));
  if (!voci.length) return <p className="px-3 py-4 text-sm text-muted-foreground">Nessuna priorità per questo filtro.</p>;
  const mostraDate = voci.some(voce => voce.dataOrigine);
  const mostraAzioni = voci.some(voce => voce.oda || (apriConsegna && voce.consegna));
  return (
    <div className="overflow-x-auto">
      <table aria-label="Priorità operative" className="generale-registro-tabella generale-priorita-tabella">
        <thead><tr>
          <th scope="col">Elemento</th>
          <th scope="col">Priorità</th>
          <th scope="col">Commessa</th>
          {edificioPerCommessa.size > 0 && <th scope="col">Edificio</th>}
          {mostraDate && <th scope="col">Data documento</th>}
          <th scope="col">Scadenza</th>
          <th scope="col">Referente</th>
          {mostraAzioni && <th scope="col">Azioni</th>}
        </tr></thead>
        <tbody>
          {voci.map(voce => {
            const commessa = voce.orderId ? commesse.get(voce.orderId) : undefined;
            const referente = voce.orderId ? referenti.data?.[voce.orderId] : undefined;
            const nome = [commessa?.codice, commessa?.nome !== commessa?.codice ? commessa?.nome : undefined].filter(Boolean).join(" · ");
            const chi = referenti.isLoading ? "In caricamento" : referente === null ? "Da assegnare" : referente ?? "Non disponibile";
            const Icona = voce.icona;
            const classe = "generale-registro-testo rounded text-left font-medium text-primary hover:underline";
            const etichetta = `${voce.titolo} · ${voce.tipo} · ${voce.prossima}`;
            const titoloCompleto = [voce.titolo, voce.dettaglio].filter(Boolean).join(" · ");
            const contenuto = (
              <>
                {voce.titolo}
                {voce.dettaglio && <span className="ml-1.5 text-xs font-normal text-muted-foreground">· {voce.dettaglio}</span>}
              </>
            );
            return (
              <tr key={`${voce.tipo}:${voce.id}`}>
                <td className="generale-priorita-elemento">
                  {voce.href ? <Link to={voce.href} aria-label={etichetta} title={titoloCompleto} className={classe}>{contenuto}</Link>
                    : <button type="button" onClick={voce.azione} aria-label={etichetta} title={titoloCompleto} className={classe}>{contenuto}</button>}
                </td>
                <td className="generale-priorita-stato"><span className="generale-registro-stato" data-tono={voce.tipo === "DDT non conforme" ? "rosso" : voce.ordine <= 1 ? "arancio" : "blu"}>
                  <Icona className="size-3.5" aria-hidden="true" /> {voce.tipo}
                </span></td>
                <td className="generale-priorita-meta" data-etichetta="Commessa" title={nome}><span className="block max-w-40 truncate">{nome || "—"}</span></td>
                {edificioPerCommessa.size > 0 && <td className="generale-priorita-meta" data-etichetta="Edificio">{voce.orderId ? edificioPerCommessa.get(voce.orderId) ?? "—" : "—"}</td>}
                {mostraDate && <td data-etichetta="Documento" className="generale-priorita-meta tabular-nums text-muted-foreground">{dataBreve(voce.dataOrigine ?? null)}</td>}
                <td data-etichetta="Scadenza" className="generale-priorita-meta text-muted-foreground">{voce.quando}</td>
                <td className="generale-priorita-meta" data-etichetta="Referente">{nome ? chi : "—"}</td>
                {mostraAzioni && <td className="generale-priorita-azioni" data-vuoto={!voce.oda && !(voce.consegna && apriConsegna)}>{voce.oda ? <Link className="text-xs text-primary hover:underline"
                  to={`/azienda/ordini-acquisto/${voce.oda.id}`}>{voce.oda.numero}</Link>
                  : voce.consegna && apriConsegna ? <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs"
                    onClick={() => apriConsegna(voce.consegna!)}><ListTree className="size-3.5" aria-hidden="true" /> Fasi collegate</Button> : "—"}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PaginePriorita({ pagina, altre, righe, scegliPagina }: { pagina: number; altre: boolean; righe: number; scegliPagina: (p: number) => void }) {
  if (pagina === 1 && !altre) return null;
  return (
    <nav aria-label="Pagine delle priorità" className="generale-registro-pagine flex flex-wrap items-center justify-between gap-2 border-t px-3 py-1">
      <span className="text-xs tabular-nums text-muted-foreground">
        Pagina {pagina}{righe > 0 && ` · Righe ${(pagina - 1) * RIGHE_REGISTRO + 1}–${(pagina - 1) * RIGHE_REGISTRO + righe}`}
      </span>
      <div className="flex gap-1">
        {pagina > 1 && righe === 0 && <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => scegliPagina(1)}>Prima pagina</Button>}
        <Button type="button" size="sm" variant="outline" className="h-8" disabled={pagina <= 1}
          onClick={() => scegliPagina(pagina - 1)}><ChevronLeft className="size-4" aria-hidden="true" /> Indietro</Button>
        <Button type="button" size="sm" variant="outline" className="h-8" disabled={!altre}
          onClick={() => scegliPagina(pagina + 1)}>Avanti <ChevronRight className="size-4" aria-hidden="true" /></Button>
      </div>
    </nav>
  );
}

function LavorazioniConsegna({ consegna, commesse, apriFase }: {
  consegna: Consegna;
  commesse: ReadonlyMap<string, CommessaPriorita>;
  apriFase: (commessaId: string, faseId: string) => void;
}) {
  const q = useFasiConsegna(consegna.id, new Set(commesse.keys()));
  return (
    <>
      <SheetHeader className="pr-8 text-left">
        <SheetTitle>Lavorazioni collegate</SheetTitle>
        <SheetDescription>{consegna.titolo} · Associazioni dalle righe materiali</SheetDescription>
      </SheetHeader>
      {q.isLoading ? <Skeleton className="h-20 w-full" /> : q.isError ? (
        <p role="alert" className="text-sm">Lavorazioni non disponibili. <Button size="sm" variant="link" onClick={() => void q.refetch()}>Riprova</Button></p>
      ) : q.data?.length ? (
        <ul className="divide-y rounded-lg border">
          {q.data.map(f => <li key={f.id}>
            <button type="button" className="flex w-full items-center justify-between gap-2 p-3 text-left hover:bg-muted/40" onClick={() => apriFase(f.order_id, f.id)}>
              <span><span className="block text-sm font-medium">{f.name}</span><span className="text-xs text-muted-foreground">{commesse.get(f.order_id)?.nome}</span></span>
              <ArrowUpRight className="size-4 text-primary" aria-hidden="true" />
            </button>
          </li>)}
        </ul>
      ) : <p className="text-sm text-muted-foreground">Nessuna fase collegata alle righe di questo ordine.</p>}
      <Button asChild size="sm" variant="outline"><Link to={`/azienda/ordini-acquisto/${consegna.id}`}>Apri ordine</Link></Button>
    </>
  );
}

function ScadenzePriorita({ riepilogo, periodo, pagina, scegliPagina, commesse, edificioPerCommessa, oggi }: {
  riepilogo: RiepilogoGenerale;
  periodo: PeriodoRegistro;
  pagina: number;
  scegliPagina: (pagina: number) => void;
  commesse: ReadonlyMap<string, CommessaPriorita>;
  edificioPerCommessa: ReadonlyMap<string, string>;
  oggi: string;
}) {
  const q = useCassaOperazione(riepilogo);
  if (q.isLoading) return <div className="p-3"><Skeleton className="h-28 w-full" /></div>;
  if (q.isError) return <p role="alert" className="p-3 text-sm">Scadenze di cassa non disponibili. <Button size="sm" variant="link" onClick={q.refetch}>Riprova</Button></p>;
  const predefinito = !periodo.dal && !periodo.al;
  const intervallo = predefinito ? { dal: "", al: aggiungiGiorni(oggi, 30) } : periodo;
  const scadenze = [...new Map(q.previsti.map(m => [m.id, m])).values()].filter(m => !m.possibleDuplicate);
  const dataScadenza = (data: string | null) => data?.startsWith("9999") ? "" : planningDay(data);
  const senzaData = scadenze.filter(m => !dataScadenza(m.date)).length;
  const voci = scadenze.flatMap((m): VocePriorita[] => {
    const data = dataScadenza(m.date);
    if (!data || !nelPeriodoRegistro(data, intervallo)) return [];
    const entrata = m.direction === "in";
    return [{
      id: m.id, orderId: m.orderId ?? null, titolo: m.description, tipo: entrata ? "Incasso atteso" : "Pagamento atteso", icona: Wallet,
      ordine: 0, data, quando: `${data < oggi ? "Scaduto il" : "Scade il"} ${dataBreve(data)}`,
      dettaglio: [formatCurrency(m.cents / 100), m.estimated && "Stimato", m.counterparty].filter(Boolean).join(" · "),
      prossima: m.href === "/azienda/costi" && m.costId ? "Apri costo" : "Apri fonte",
      href: m.href === "/azienda/costi" && m.costId ? `/azienda/costi?costo=${encodeURIComponent(m.costId)}` : m.href,
    }];
  }).sort((a, b) => a.data!.localeCompare(b.data!) || a.id.localeCompare(b.id));
  const mostrate = voci.slice((pagina - 1) * RIGHE_REGISTRO, pagina * RIGHE_REGISTRO);
  const daRiconciliare = q.previsti.length - scadenze.length;
  return (
    <>
      <p className="border-b px-3 py-2 text-xs text-muted-foreground">
        Cassa dell’intera operazione · {predefinito ? "Scadute e prossimi 30 giorni" : "Periodo selezionato"} · IVA inclusa
      </p>
      <ListaPriorita voci={mostrate} commesse={commesse} edificioPerCommessa={edificioPerCommessa} />
      {(senzaData > 0 || daRiconciliare > 0 || q.avvisi.length > 0) && <p role="status" className="border-t px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
        {[senzaData > 0 && `${senzaData} senza data`, daRiconciliare > 0 && `${daRiconciliare} da riconciliare`, ...q.avvisi].filter(Boolean).join(" · ")}
      </p>}
      <PaginePriorita pagina={pagina} altre={voci.length > pagina * RIGHE_REGISTRO} righe={mostrate.length} scegliPagina={scegliPagina} />
    </>
  );
}
