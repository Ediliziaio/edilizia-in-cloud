import { useCallback, useEffect, useRef, useState } from "react";
import { createPdfPreviewUrl, revokePdfPreviewUrl } from "@/lib/pdfPreviewSource";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { PdfBlobLivePreviewPanel } from "@/components/shared/PdfBlobLivePreviewPanel";
import { archiveVariationFile, downloadVariationFile, listVariationFiles, uploadVariationFile, variationPackageName, VARIATION_FILES_MAX, type VariationTemplateFile } from "@/lib/orders/variationTemplateFiles";
import { variationTemplateExamplePdf, variationTemplateVisualKey } from "@/lib/orders/variationTemplateExample";
import type { VariationTemplateContent } from "@/lib/orders/variationTemplates";

export function VariationTemplateAttachments({ company, template, content, canEdit, disabled, onBusyChange }: { company: string; template: string; content: VariationTemplateContent; canEdit: boolean; disabled: boolean; onBusyChange: (busy: boolean) => void }) {
  const client = useQueryClient();
  const queryKey = ["variation-template-files", company, template];
  const files = useQuery({ queryKey, queryFn: () => listVariationFiles(company, template), staleTime: 60_000, retry: false });
  const [selected, setSelected] = useState<VariationTemplateFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [ready, setReady] = useState<{ url: string; name: string; snapshot: string } | null>(null);
  const readyUrl = useRef<string | null>(null);
  const lock = useRef(false);
  const alive = useRef(true);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; if (readyUrl.current) URL.revokeObjectURL(readyUrl.current); }; }, []);
  const snapshotFor = (rows: VariationTemplateFile[]) => `${company}:${template}:${variationTemplateVisualKey(content)}:${rows.map(row => `${row.id}:${row.file_size}`).join(",")}`;
  const snapshot = snapshotFor(files.data ?? []);
  const prepareDownload = async (blob: Blob, name: string, key: string) => {
    if (!alive.current) return;
    // Small files use the same data-URL download as the existing example PDF;
    // some embedded browsers do not hand off Blob URLs to their download manager.
    const dataUrl = blob.size <= 10 * 1024 * 1024 ? await new Promise<string>((resolve, reject) => {
      const reader = new FileReader(); reader.onerror = () => reject(new Error("Preparazione download non riuscita."));
      reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Download non disponibile."));
      reader.readAsDataURL(blob);
    }) : null;
    if (!alive.current) return;
    if (readyUrl.current) URL.revokeObjectURL(readyUrl.current);
    const url = dataUrl ?? URL.createObjectURL(blob); readyUrl.current = dataUrl ? null : url; setReady({ url, name, snapshot: key });
  };
  const run = async (work: () => Promise<void>) => {
    if (lock.current || disabled) return;
    lock.current = true; setBusy(true); onBusyChange(true); setError(""); setMessage(""); setReady(null);
    try { await work(); } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : "Operazione non riuscita."); }
    finally { lock.current = false; if (alive.current) { setBusy(false); onBusyChange(false); } }
  };
  return <section className="space-y-3 rounded-lg border p-3" aria-label="Allegati del modello">
    <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-medium">Allegati PDF</h4>{canEdit && <Button size="sm" variant="outline" disabled={busy || disabled || files.isLoading || files.isError} onClick={() => input.current?.click()}>Aggiungi PDF</Button>}</div>
    <p className="text-xs text-muted-foreground">Schede tecniche e condizioni, separati dalla variante. Fino a 10 PDF da 10 MB. Un file caricato non vale come firma o approvazione.</p>
    <input ref={input} type="file" accept="application/pdf,.pdf" className="sr-only" aria-label="Carica allegato PDF" disabled={!canEdit || busy || disabled} onChange={e => {
      const file = e.currentTarget.files?.[0]; e.currentTarget.value = "";
      if (file && canEdit) void run(async () => { await uploadVariationFile(company, template, file); await client.invalidateQueries({ queryKey }); if (alive.current) setMessage("Allegato aggiunto al modello."); });
    }} />
    {files.isLoading && <p role="status" className="text-sm">Caricamento allegati…</p>}
    {files.isError && <p role="alert" className="text-sm text-destructive">Allegati non disponibili. <Button size="sm" variant="outline" onClick={() => void files.refetch()}>Riprova</Button></p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {message && <p role="status" className="text-sm text-green-700">{message}</p>}
    {!files.isLoading && !files.isError && !files.data?.length && <p className="text-sm text-muted-foreground">Nessun allegato. Il PDF della variante si può scaricare anche da solo.</p>}
    <ul className="space-y-2">{(files.data ?? []).map(file => <li key={file.id} className="rounded border p-2"><p className="break-words text-sm font-medium">{file.file_name}</p><p className="text-xs text-muted-foreground">{(file.file_size / 1024).toFixed(0)} KB · PDF privato</p><div className="mt-1 flex flex-wrap gap-1">
      <Button size="sm" variant="ghost" disabled={busy || disabled} onClick={() => setSelected(file)}>Mostra PDF</Button>
      <Button size="sm" variant="ghost" disabled={busy || disabled} onClick={() => void run(async () => { const blob = await downloadVariationFile(file, company, template); await prepareDownload(blob, variationPackageName(file.file_name, 1), snapshot); })}>Scarica</Button>
      {canEdit && <Button size="sm" variant="ghost" disabled={busy || disabled} onClick={() => {
        if (window.confirm("Rimuovere l'allegato dal modello? Il file viene conservato nell'archivio, non modifica documenti già creati.")) void run(async () => { await archiveVariationFile(file, company, template); if (alive.current) setSelected(null); await client.invalidateQueries({ queryKey }); });
      }}>Rimuovi dal modello</Button>}
    </div></li>)}</ul>
    {!!files.data?.length && <Button variant="outline" disabled={busy || disabled || files.isError} onClick={() => void run(async () => {
      // Re-read once on explicit download, never on a keystroke. Do not deliver partial ZIPs.
      const currentFiles = await listVariationFiles(company, template);
      client.setQueryData(queryKey, currentFiles);
      if (currentFiles.length > VARIATION_FILES_MAX) throw new Error("Ci sono più di 10 allegati. Rimuovi quelli in più prima di preparare il pacchetto.");
      const [{ default: JSZip }, doc] = await Promise.all([import("jszip"), variationTemplateExamplePdf(content)]);
      const zip = new JSZip(); zip.file("00-esempio-variante.pdf", doc.output("arraybuffer"));
      for (const [index, file] of currentFiles.entries()) zip.file(variationPackageName(file.file_name, index + 1), await (await downloadVariationFile(file, company, template)).arrayBuffer());
      const blob = await zip.generateAsync({ type: "blob" });
      await prepareDownload(blob, "esempio-variante-e-allegati.zip", snapshotFor(currentFiles));
    })}>{busy ? "Operazione in corso…" : "Scarica esempio e allegati (ZIP)"}</Button>}
    {ready?.snapshot === snapshot && !busy && !files.isError && <div className="rounded border bg-muted/30 p-3"><p role="status" className="text-sm">{ready.name.endsWith(".zip") ? "Pacchetto pronto: PDF e allegati separati, non una variante firmata." : "Allegato pronto per il download."}</p><a className="inline-flex min-h-11 items-center text-sm font-medium underline" href={ready.url} download={ready.name}>Scarica {ready.name.endsWith(".zip") ? "ZIP pronto" : "allegato pronto"}</a></div>}
    {selected && <div className="space-y-2"><div className="flex flex-wrap justify-between gap-2"><p className="break-words text-sm">Anteprima: {selected.file_name}</p><Button size="sm" variant="ghost" onClick={() => setSelected(null)}>Chiudi allegato</Button></div><div className="h-[65dvh] min-h-[400px]"><AttachmentPreview key={selected.id} row={selected} company={company} template={template} /></div></div>}
  </section>;
}

function AttachmentPreview({ row, company, template }: { row: VariationTemplateFile; company: string; template: string }) {
  const alive = useRef(true);
  const urls = useRef(new Set<string>());
  useEffect(() => { alive.current = true; const owned = urls.current; return () => { alive.current = false; for (const url of owned) revokePdfPreviewUrl(url); owned.clear(); }; }, []);
  const render = useCallback(async () => { const blob = await downloadVariationFile(row, company, template); if (!alive.current) return ""; const url = createPdfPreviewUrl(blob); urls.current.add(url); return url; }, [row, company, template]);
  return <PdfBlobLivePreviewPanel renderBlobUrl={render} depsKey={`${company}:${template}:${row.id}`} downloadFileName={variationPackageName(row.file_name, 1)} showDownloadOnMobile />;
}
