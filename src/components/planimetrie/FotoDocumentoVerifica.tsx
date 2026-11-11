import { useState, type MouseEvent } from "react";
import { Maximize2, ScanLine, ZoomIn, ZoomOut } from "lucide-react";
import type { VerificaLettura, ZonaFotoDocumento } from "../../../shared/planimetrie/letturaTipi.ts";
import type { Pianta } from "./editor/adattatore";
import { MiniPiantaVerifica } from "./editor/EvidenzaVerificaPianta";
import { useBlobRef } from "./useBlobRef";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Props {
  file?: Blob; url?: string; verifiche: VerificaLettura[]; attiva?: VerificaLettura; pianta: Pianta;
  onSeleziona: (v: VerificaLettura) => void; onZone: (id: string, zone: ZonaFotoDocumento[]) => void; solaLettura?: boolean;
}

export function FotoDocumentoVerifica(props: Props) {
  const [aperta, setAperta] = useState(false);
  const [zoom, setZoom] = useState(1);
  return <>
    <div className="flex items-center justify-between gap-2 border-b px-3 py-2"><h3 className="text-sm font-semibold">Documento originale</h3><div className="flex gap-1">
      <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label="Riduci foto" disabled={zoom <= 1} onClick={() => setZoom((n) => Math.max(1, n - 0.5))}><ZoomOut className="h-4 w-4" /></Button>
      <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label="Ingrandisci foto" disabled={zoom >= 4} onClick={() => setZoom((n) => Math.min(4, n + 0.5))}><ZoomIn className="h-4 w-4" /></Button>
      <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label="Apri foto grande e confronto" onClick={() => setAperta(true)}><Maximize2 className="h-4 w-4" /></Button>
    </div></div>
    <div className="h-64 shrink-0 overflow-auto bg-slate-100 p-2 max-lg:h-48"><FotoConZone {...props} zoom={zoom} /></div>
    {props.attiva && <div className="border-b bg-orange-50 px-3 py-2 text-xs text-orange-950"><p className="font-medium">Quota evidenziata nel confronto</p><p className="mt-1 line-clamp-3">{props.attiva.descrizione}</p><Button type="button" variant="link" size="sm" className="h-7 px-0 text-xs" onClick={() => setAperta(true)}>{props.attiva.zoneFoto?.length ? "Apri il dettaglio della foto" : "Indica dove si legge sulla foto"}</Button></div>}
    <Dialog open={aperta} onOpenChange={setAperta}><DialogContent className="flex max-h-[95dvh] w-[96vw] max-w-7xl flex-col gap-3 overflow-hidden p-4 sm:p-5">
      <DialogHeader><DialogTitle>Foto e pianta a confronto</DialogTitle><DialogDescription>Ingrandisci il foglio e confronta la quota evidenziata. Segnare una zona della foto non conferma la misura.</DialogDescription></DialogHeader>
      <div className="min-w-48 space-y-1 text-xs"><label htmlFor="quota-confronto-foto" className="font-medium">Quota da confrontare</label><select id="quota-confronto-foto" className="h-9 w-full rounded-md border bg-background px-2" value={props.attiva?.id ?? ""} onChange={(e) => { const v = props.verifiche.find((v) => v.id === e.target.value); if (v) props.onSeleziona(v); }}><option value="" disabled>Scegli un controllo</option>{props.verifiche.map((v) => <option key={v.id} value={v.id}>{v.descrizione}</option>)}</select></div>
      <ConfrontoGrande {...props} />
    </DialogContent></Dialog>
  </>;
}

function ConfrontoGrande(props: Props) {
  const [zoom, setZoom] = useState(1);
  const [annota, setAnnota] = useState(false);
  return <>
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" size="sm" variant="outline" aria-label="Riduci foto grande" disabled={zoom <= 1} onClick={() => setZoom((n) => Math.max(1, n - 0.5))}><ZoomOut className="h-4 w-4" /></Button>
      <output aria-label="Zoom foto grande" className="min-w-12 text-center text-xs tabular-nums">{zoom * 100}%</output>
      <Button type="button" size="sm" variant="outline" aria-label="Ingrandisci foto grande" disabled={zoom >= 6} onClick={() => setZoom((n) => Math.min(6, n + 0.5))}><ZoomIn className="h-4 w-4" /></Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setZoom(1)}>Adatta foto</Button>
      {!props.solaLettura && <><Button type="button" size="sm" variant={annota ? "secondary" : "outline"} aria-pressed={annota} disabled={!props.attiva || (props.attiva.zoneFoto?.length ?? 0) >= 8} onClick={() => setAnnota((v) => !v)}><ScanLine className="mr-1.5 h-4 w-4" />{annota ? "Annulla selezione zona" : "Segna quota sulla foto"}</Button>{!!props.attiva?.zoneFoto?.length && <Button type="button" size="sm" variant="ghost" onClick={() => props.onZone(props.attiva!.id, [])}>Rimuovi zone della quota</Button>}</>}
    </div>
    {annota && <p role="status" className="rounded-md bg-orange-50 p-2 text-sm text-orange-950">Tocca due angoli opposti per racchiudere la scritta sul foglio. Puoi segnare più zone per le quote discordanti. La misura resta da verificare.</p>}
    <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto md:grid-cols-[minmax(0,1fr)_260px]">
      <div className="max-h-[62dvh] min-h-48 overflow-auto rounded-lg border bg-slate-100 p-2"><FotoConZone key={`${props.attiva?.id}:${annota}`} {...props} grande zoom={zoom} annota={annota} onFinito={() => setAnnota(false)} /></div>
      <div className="flex min-h-0 flex-col gap-2"><div className="min-h-48 flex-1"><MiniPiantaVerifica pianta={props.pianta} verifica={props.attiva} /></div><p className="text-xs text-muted-foreground">Arancione: elemento o quota da confrontare. Il disegno rimane provvisorio.</p>{props.attiva && <p className="text-xs">{props.attiva.descrizione}</p>}{props.attiva && !props.attiva.zoneFoto?.length && <p className="text-xs text-orange-800">Zona della foto non ancora collegata. Non viene indicata una posizione presunta.</p>}</div>
    </div>
  </>;
}

function FotoConZone({ file, url, verifiche, attiva, onSeleziona, onZone, zoom, grande, annota, onFinito }: Props & { zoom: number; grande?: boolean; annota?: boolean; onFinito?: () => void }) {
  const ref = useBlobRef<HTMLImageElement>(file, "src");
  const [inizio, setInizio] = useState<{ x: number; y: number } | null>(null);
  const [errore, setErrore] = useState("");
  const segna = (e: MouseEvent<HTMLDivElement>) => {
    if (!annota || !attiva) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const p = { x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)) };
    if (!inizio) { setInizio(p); return; }
    const zona = { x: Math.min(inizio.x, p.x), y: Math.min(inizio.y, p.y), larghezza: Math.abs(p.x - inizio.x), altezza: Math.abs(p.y - inizio.y) };
    try { onZone(attiva.id, [...(attiva.zoneFoto ?? []), zona]); setInizio(null); setErrore(""); onFinito?.(); }
    catch (e) { setErrore(e instanceof Error ? e.message : "Zona non salvata."); setInizio(null); }
  };
  return <><div data-testid={grande ? "foto-grande-annotabile" : "foto-con-zone"} className={`relative mx-auto ${annota ? "cursor-crosshair" : ""}`} style={{ width: grande ? `${60 * zoom}dvh` : `${zoom * 100}%`, maxWidth: zoom === 1 ? "100%" : "none" }} onClick={segna}>
    <img ref={ref} src={file ? undefined : url} alt={grande ? "Foto originale ingrandita con quote" : "Foto originale da confrontare con la pianta"} className="block h-auto w-full max-w-none select-none" draggable={false} />
    {verifiche.flatMap((v) => (v.zoneFoto ?? []).map((z, i) => <button type="button" key={`${v.id}-${i}`} aria-label={`Quota sulla foto: ${v.descrizione}, zona ${i + 1}`} aria-pressed={attiva?.id === v.id} disabled={annota} onClick={(e) => { e.stopPropagation(); onSeleziona(v); }} className={`absolute min-h-1 min-w-1 rounded-sm border-2 ${annota ? "pointer-events-none" : ""} ${attiva?.id === v.id ? "border-orange-600 bg-orange-400/25 ring-2 ring-white" : "border-blue-600/70 bg-blue-300/10"}`} style={{ left: `${z.x * 100}%`, top: `${z.y * 100}%`, width: `${z.larghezza * 100}%`, height: `${z.altezza * 100}%` }} />))}
    {inizio && <span className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-orange-600" style={{ left: `${inizio.x * 100}%`, top: `${inizio.y * 100}%` }} />}
  </div>{errore && <p role="alert" className="p-2 text-xs text-red-700">{errore}</p>}</>;
}
