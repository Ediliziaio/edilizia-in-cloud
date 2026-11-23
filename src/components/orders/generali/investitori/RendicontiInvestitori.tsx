import { lazy, Suspense, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Download, Eye, FileText, Loader2, Search } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { OfficeSelect } from "@/components/orders/OfficeSelect";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { linkPdfRendiconto, useRendicontiInviati } from "@/hooks/useGeneraleInvestitori";
import type { RiepilogoGenerale } from "@/lib/orders/commesseGenerali";
import type { Fonte } from "@/lib/orders/generali/investitoriConti";
import type { RendicontoInviato } from "@/lib/orders/generali/investitoriLettura";
import { cercaNellOperazione } from "@/lib/orders/generali/registroOperazione";
import { createPdfPreviewUrl } from "@/lib/pdfPreviewSource";
import { DialogContentOperativo } from "../design/ContestoOperativo";
import { dataBreve } from "../piano/formato";
import { ReportMensile } from "./ReportMensile";

const PdfPanel = lazy(() => import("@/components/shared/PdfBlobLivePreviewPanel").then(m => ({ default: m.PdfBlobLivePreviewPanel })));
const STATI = {
  scaricato: { label: "Scaricato", tono: "blu" },
  inviato: { label: "Inviato", tono: "verde" },
  in_invio: { label: "In invio", tono: "arancio" },
  fallito: { label: "Non partito", tono: "rosso" },
} as const;
const PER_PAGINA = 15;

export function RendicontiInvestitori({ riepilogo, fonti, prepara, apriFonte }: {
  riepilogo: RiepilogoGenerale;
  fonti: Fonte[];
  prepara: (id: string) => void;
  apriFonte: (id: string) => void;
}) {
  const [parametri, setParametri] = useSearchParams();
  const mensile = parametri.get("rendiconto-aperto") === "1" || parametri.get("sezione-rendiconti") === "mensile";
  const mese = parametri.get("rendiconto-mese") ?? undefined;
  const fonteRichiesta = parametri.get("fonte-rendiconto");
  const fontiPdf = fonti.filter(f => f.tipo !== "propri");
  const fonte = fontiPdf.find(f => f.id === fonteRichiesta);
  const cambiaSezione = (sezione: "pdf" | "mensile") => {
    const p = new URLSearchParams(parametri);
    p.delete("rendiconto-aperto");
    p.set("sezione-rendiconti", sezione);
    p.set("vista-investitori", "rendiconti");
    setParametri(p, { replace: true });
  };
  const scegliFonte = (id: string) => {
    const p = new URLSearchParams(parametri);
    if (id) p.set("fonte-rendiconto", id);
    else p.delete("fonte-rendiconto");
    setParametri(p, { replace: true });
  };

  return <div className="space-y-2.5">
    <div className="generale-panel flex flex-wrap items-center gap-1.5 p-1.5" role="group" aria-label="Tipo di rendiconto">
      <Button size="sm" variant={mensile ? "ghost" : "secondary"} aria-pressed={!mensile} className="h-8 gap-1.5" onClick={() => cambiaSezione("pdf")}>
        <FileText className="size-4" aria-hidden="true" /> PDF per fonte
      </Button>
      <Button size="sm" variant={mensile ? "secondary" : "ghost"} aria-pressed={mensile} className="h-8 gap-1.5" onClick={() => cambiaSezione("mensile")}>
        <CalendarDays className="size-4" aria-hidden="true" /> Mensile operazione
      </Button>
    </div>
    {mensile ? <ReportMensile key={mese ?? ""} riepilogo={riepilogo} meseIniziale={mese} />
      : <StoricoRendiconti generaleId={riepilogo.generale.id} fonti={fontiPdf} fonte={fonte} scegliFonte={scegliFonte} prepara={prepara} apriFonte={apriFonte} />}
  </div>;
}

function nomeFile(r: RendicontoInviato) {
  return r.stato === "scaricato" && /\.pdf$/i.test(r.oggetto) ? r.oggetto
    : `Rendiconto ${r.fonteNome} ${(r.inviatoIl ?? r.creatoIl).slice(0, 10)}.pdf`;
}

function StoricoRendiconti({ generaleId, fonti, fonte, scegliFonte, prepara, apriFonte }: {
  generaleId: string;
  fonti: Fonte[];
  fonte: Fonte | undefined;
  scegliFonte: (id: string) => void;
  prepara: (id: string) => void;
  apriFonte: (id: string) => void;
}) {
  const query = useRendicontiInviati(generaleId);
  const [ricerca, setRicerca] = useState("");
  const [stato, setStato] = useState("");
  const [pagina, setPagina] = useState(1);
  const [scaricando, setScaricando] = useState<string>();
  const [anteprima, setAnteprima] = useState<{ r: RendicontoInviato; path: string; trigger: HTMLButtonElement }>();
  const nomi = new Map(fonti.map(f => [f.id, f.nome]));
  const righe = (query.data ?? []).filter(r => (!fonte || r.fonteId === fonte.id) && (!stato || r.stato === stato)
    && cercaNellOperazione(ricerca, [r.fonteNome, nomi.get(r.fonteId ?? ""), r.oggetto, r.destinatario, r.versionePiano]));
  const pagine = Math.max(1, Math.ceil(righe.length / PER_PAGINA));
  const corrente = Math.min(pagina, pagine);
  const inizio = (corrente - 1) * PER_PAGINA;

  const scarica = async (r: RendicontoInviato, path: string) => {
    setScaricando(r.id);
    try {
      window.location.assign(await linkPdfRendiconto(path, nomeFile(r)));
    } catch {
      toast.error("Impossibile scaricare il PDF. Riprova.");
    } finally {
      setScaricando(undefined);
    }
  };

  return <section aria-label="Storico dei rendiconti" className="generale-panel min-w-0">
    <header className="flex flex-wrap items-center gap-2 px-3 py-2">
      <h3 className="mr-auto flex items-center gap-2 text-sm font-semibold">
        <FileText className="size-4 text-primary" aria-hidden="true" /> Storico dei rendiconti
      </h3>
      {fonti.length > 0 && <>
        <OfficeSelect label="Fonte del rendiconto" value={fonte?.id ?? ""} onValueChange={id => { setPagina(1); scegliFonte(id); }}
          className="h-8 w-52 max-w-full text-xs"
          options={[{ value: "", label: "Tutte le fonti" }, ...fonti.map(f => ({ value: f.id, label: f.nome }))]} />
        <Button type="button" size="sm" className="h-8" disabled={!fonte} onClick={() => fonte && prepara(fonte.id)}>Prepara PDF</Button>
      </>}
    </header>
    <div className="generale-registro-strumenti border-t bg-muted/25 px-3 py-1.5">
      <div className="relative min-w-[12rem] max-w-sm flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-2 size-4 text-muted-foreground" aria-hidden="true" />
        <Input type="search" aria-label="Cerca rendiconto" placeholder="Fonte, email, documento o versione…" className="h-8 pl-8 text-sm"
          value={ricerca} onChange={e => { setRicerca(e.target.value); setPagina(1); }} />
      </div>
      <OfficeSelect label="Stato del rendiconto" value={stato} onValueChange={v => { setStato(v); setPagina(1); }}
        className="h-8 w-40 text-xs" options={[{ value: "", label: "Tutti gli stati" },
          ...Object.entries(STATI).map(([value, { label }]) => ({ value, label }))]} />
    </div>
    {query.isLoading ? <Skeleton className="m-3 h-8" /> : query.isError ? <div role="alert" className="flex items-center gap-2 p-3 text-sm">
      Storico dei rendiconti non disponibile.
      <Button type="button" size="sm" variant="outline" onClick={() => void query.refetch()}>Riprova</Button>
    </div> : !righe.length ? <p role="status" className="border-t px-3 py-3 text-sm text-muted-foreground">
      {query.data?.length ? "Nessun rendiconto corrisponde ai filtri." : "Nessun rendiconto archiviato."}
    </p> : <>
      <div className="overflow-x-auto">
        <table aria-label="PDF archiviati" className="generale-registro-tabella min-w-[42rem]">
          <thead className="bg-muted/40"><tr>
            <th scope="col">Data</th><th scope="col">Fonte e destinatario</th><th scope="col">Documento</th>
            <th scope="col">Stato</th><th scope="col"><span className="sr-only">Azioni PDF</span></th>
          </tr></thead>
          <tbody>{righe.slice(inizio, inizio + PER_PAGINA).map(r => {
            const nomeAttuale = nomi.get(r.fonteId ?? "");
            const data = dataBreve((r.inviatoIl ?? r.creatoIl).slice(0, 10));
            return <tr key={r.id}>
              <td className="tabular-nums">{data}</td>
              <td>
                {nomeAttuale && r.fonteId ? <button type="button" className="font-medium text-primary hover:underline"
                  onClick={() => apriFonte(r.fonteId!)}>{nomeAttuale}</button> : <span className="font-medium">{r.fonteNome}</span>}
                {r.destinatario && r.destinatario !== "—" && r.stato !== "scaricato" && <span className="block text-xs text-muted-foreground">{r.destinatario}</span>}
              </td>
              <td>
                <span className="generale-registro-testo" title={r.oggetto}>{r.oggetto || "Rendiconto PDF"}</span>
                {(r.versionePiano || r.conPiano !== null) && <span className="block text-xs text-muted-foreground">
                  {[r.versionePiano, r.conPiano === false ? "senza il piano voce per voce" : r.conPiano ? "con il piano voce per voce" : null].filter(Boolean).join(" · ")}
                </span>}
              </td>
              <td>
                <span className="generale-registro-stato" data-tono={STATI[r.stato].tono}>{STATI[r.stato].label}</span>
                {r.stato === "fallito" && r.errore && <p className="max-w-44 whitespace-normal text-xs text-destructive">{r.errore}</p>}
              </td>
              <td>{r.pdfPath && <div className="flex justify-end gap-1">
                <Button type="button" size="sm" variant="outline" className="h-7 gap-1.5 px-2 text-xs"
                  onClick={e => r.pdfPath && setAnteprima({ r, path: r.pdfPath, trigger: e.currentTarget })}>
                  <Eye className="size-3.5" aria-hidden="true" /> Apri PDF
                </Button>
                <Button type="button" size="icon" variant="ghost" className="size-7" disabled={!!scaricando}
                  title="Scarica PDF" aria-label={`Scarica il PDF di ${r.fonteNome} del ${data}`}
                  onClick={() => r.pdfPath && void scarica(r, r.pdfPath)}>
                  {scaricando === r.id ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Download className="size-3.5" aria-hidden="true" />}
                </Button>
              </div>}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      <footer className="flex items-center justify-between gap-2 border-t px-3 py-1.5 text-xs text-muted-foreground">
        <span role="status">{pagine > 1 ? `${inizio + 1}–${Math.min(inizio + PER_PAGINA, righe.length)} di ` : ""}
          {righe.length} {righe.length === 1 ? "rendiconto" : "rendiconti"}</span>
        {pagine > 1 && <nav aria-label="Pagine dello storico" className="flex gap-1">
          <Button type="button" size="icon" variant="outline" className="size-7" aria-label="Pagina precedente" disabled={corrente <= 1}
            onClick={() => setPagina(corrente - 1)}><ChevronLeft className="size-4" aria-hidden="true" /></Button>
          <Button type="button" size="icon" variant="outline" className="size-7" aria-label="Pagina successiva" disabled={corrente >= pagine}
            onClick={() => setPagina(corrente + 1)}><ChevronRight className="size-4" aria-hidden="true" /></Button>
        </nav>}
      </footer>
    </>}
    {anteprima && <AnteprimaRendiconto {...anteprima} chiudi={() => setAnteprima(undefined)} />}
  </section>;
}

function AnteprimaRendiconto({ r, path, trigger, chiudi }: {
  r: RendicontoInviato; path: string; trigger: HTMLButtonElement; chiudi: () => void;
}) {
  return <Dialog open onOpenChange={open => { if (!open) chiudi(); }}>
    <DialogContentOperativo struttura="contenuta" className="flex h-[90dvh] max-w-5xl flex-col gap-2 overflow-hidden p-3 sm:p-4"
      onCloseAutoFocus={e => { e.preventDefault(); trigger.focus(); }}>
      <DialogHeader className="min-w-0 shrink-0 pr-7">
        <DialogTitle className="break-words text-base">Rendiconto di {r.fonteNome}</DialogTitle>
        <DialogDescription>{[dataBreve((r.inviatoIl ?? r.creatoIl).slice(0, 10)), r.versionePiano].filter(Boolean).join(" · ")}</DialogDescription>
      </DialogHeader>
      <div className="min-h-0 flex-1 overflow-hidden">
        <Suspense fallback={<p role="status" className="p-3 text-sm">Caricamento PDF…</p>}>
          <PdfPanel headerLabel="PDF archiviato" downloadFileName={nomeFile(r)} vistaPagina
            depsKey={r.id} debounceMs={0} renderBlobUrl={async () => {
              const response = await fetch(await linkPdfRendiconto(path));
              if (!response.ok) throw new Error("Impossibile aprire il PDF archiviato.");
              return createPdfPreviewUrl(await response.blob());
            }} />
        </Suspense>
      </div>
    </DialogContentOperativo>
  </Dialog>;
}
