import { useRef, useState } from "react";
import { useVariationTemplates } from "@/hooks/useVariationTemplates";
import { useSettingsDraftGuard } from "@/hooks/useSettingsDraftGuard";
import { blankVariationTemplate, VARIATION_TEMPLATE_COLORS, VARIATION_TEMPLATE_EXAMPLES, VARIATION_TEMPLATE_TAGS, type VariationTemplateContent, type VariationTemplateRow } from "@/lib/orders/variationTemplates";
import { variationTemplateExamplePdf } from "@/lib/orders/variationTemplateExample";
import { VariationTemplatePreview } from "@/components/orders/VariationTemplatePreview";
import { VariationTemplateAttachments } from "@/components/orders/VariationTemplateAttachments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { listVariationFiles, downloadVariationFile, uploadVariationFile } from "@/lib/orders/variationTemplateFiles";

export function VariationTemplatesPanel({ companyId, canEdit }: { companyId?: string; canEdit: boolean }) {
  const [archived,setArchived] = useState(false);
  const models = useVariationTemplates(companyId,true,archived);
  const [form, setForm] = useState<VariationTemplateContent | null>(null);
  const [previous, setPrevious] = useState<VariationTemplateRow | undefined>();
  const [creationId, setCreationId] = useState<string>();
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [pdf, setPdf] = useState<{ url: string; snapshot: string } | null>(null);
  const lock = useRef(false);
  const [variableTarget,setVariableTarget] = useState<"intro_text"|"conditions_text"|"payment_terms">("intro_text");
  const confirmExit = useSettingsDraftGuard(dirty);
  const busy = models.save.isPending || models.archive.isPending || models.restore?.isPending || pdfBusy || attachmentBusy;
  const start = (content: VariationTemplateContent, row?: VariationTemplateRow) => {
    if (!confirmExit() || busy) return;
    setForm(content); setPrevious(row); setCreationId(row ? undefined : crypto.randomUUID()); setDirty(canEdit && !row); setError(""); setPdf(null);
  };
  const change = <K extends keyof VariationTemplateContent>(key: K, value: VariationTemplateContent[K]) => {
    if (!form) return;
    setForm({ ...form, [key]: value }); setDirty(true); setError(""); setPdf(null);
  };
  return <section className="space-y-4" aria-label="Modelli delle varianti">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-lg font-semibold">Varianti e lavori extra</h2><p className="text-sm text-muted-foreground">Prepara una volta testi e condizioni. Nella commessa compili lavori, prezzo e tempi.</p></div>
      {canEdit && <Button disabled={busy || !companyId} onClick={() => start(blankVariationTemplate())}>Nuovo modello di variante</Button>}
    </div>
    {!canEdit && <p className="text-sm text-muted-foreground">Sola lettura: i modelli si possono consultare e provare, non modificare.</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {models.isError && <p role="alert" className="text-sm text-destructive">Modelli aziendali non disponibili. <Button variant="outline" size="sm" onClick={() => void models.refetch()}>Riprova</Button></p>}
    {models.isLoading && <p role="status">Caricamento modelli…</p>}
    {canEdit && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={archived} disabled={busy} onChange={e=>setArchived(e.target.checked)} />Mostra anche i modelli archiviati</label>}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {(models.data ?? []).map(row => <div className="space-y-2 rounded-lg border p-4" key={row.id}>
        <h3 className="font-medium">{row.name}{!row.is_active && <span className="ml-2 text-xs text-muted-foreground">Archiviato</span>}</h3><p className="text-sm text-muted-foreground">{row.document_heading} · v{row.revision} · {row.variation_kind ?? "aggiunta"}</p>
        <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => start(row, row)}>{canEdit ? "Modifica" : "Apri"}</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => start(row, row)}>Anteprima PDF</Button>
          {canEdit && row.is_active && <><Button size="sm" variant="outline" disabled={busy} onClick={async () => {
            if(!companyId || lock.current || !confirmExit() || !window.confirm("Creare una copia del modello, inclusi gli allegati PDF attivi?"))return;
            lock.current=true;setAttachmentBusy(true);setError("");let copied:VariationTemplateRow|undefined;
            try {copied=await models.save.mutateAsync({content:{...row,name:`${row.name.slice(0,100)} · copia`},creationId:crypto.randomUUID()});
              for(const file of await listVariationFiles(companyId,row.id)){const blob=await downloadVariationFile(file,companyId,row.id);await uploadVariationFile(companyId,copied.id,new File([blob],file.file_name,{type:"application/pdf"}));}
              setForm(copied);setPrevious(copied);setDirty(false);setPdf(null);
            }catch(e){if(copied){setForm(copied);setPrevious(copied);setDirty(false);}setError(`${e instanceof Error?e.message:"Copia non completata."}${copied?" La copia dei testi è salvata: verifica gli allegati prima di usarla.":""}`);}finally{lock.current=false;setAttachmentBusy(false);}
          }}>Duplica con allegati</Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={async () => {
              if (lock.current || !confirmExit() || !window.confirm("Archiviare il modello? I documenti delle commesse già creati non cambiano.")) return;
              lock.current = true; try { await models.archive.mutateAsync(row); if (previous?.id === row.id) { setForm(null); setDirty(false); } }
              catch (e) { setError(e instanceof Error ? e.message : "Archiviazione non riuscita."); } finally { lock.current = false; }
            }}>Archivia</Button></>}
          {canEdit && !row.is_active && <Button variant="outline" size="sm" disabled={busy} onClick={async()=>{if(lock.current)return;lock.current=true;try{await models.restore.mutateAsync(row);}catch(e){setError(e instanceof Error?e.message:"Ripristino non confermato");}finally{lock.current=false;}}}>Ripristina</Button>}
        </div>
      </div>)}
    </div>
    <div className="rounded-lg border p-3"><p className="mb-2 text-sm font-medium">Esempi da adattare</p><div className="flex flex-wrap gap-2">{VARIATION_TEMPLATE_EXAMPLES.map(example => <Button key={example.name} size="sm" variant="outline" disabled={busy} onClick={() => start(example)}>{example.name}</Button>)}</div><p className="mt-2 text-xs text-muted-foreground">Esempi di compilazione, non clausole legali verificate. Salva una copia per renderla disponibile alla tua azienda.</p></div>
    {form && <div className="grid items-start gap-4 xl:grid-cols-2" aria-label="Editor e anteprima del modello">
      <div className="space-y-4 rounded-lg border p-4 min-w-0" aria-label="Editor modello di variante">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium">Testi e stile del documento</h3><a href="#variation-model-preview" className="text-sm underline xl:hidden">Vedi PDF</a></div>
      <fieldset disabled={!canEdit || busy} className="space-y-3 min-w-0">
        <Label htmlFor="vt-name">Nome del modello *</Label><Input id="vt-name" maxLength={120} value={form.name} onChange={e => change("name", e.target.value)} />
        <Label htmlFor="vt-kind">Tipo di variante</Label><select id="vt-kind" className="h-11 w-full rounded-md border bg-background px-3 text-sm" value={form.variation_kind ?? "aggiunta"} onChange={e=>change("variation_kind",e.target.value as VariationTemplateContent["variation_kind"])}><option value="aggiunta">Aggiunta di lavori</option><option value="modifica">Modifica / sostituzione</option><option value="riduzione">Riduzione di lavori · importo sottratto</option></select>
        <Label htmlFor="vt-heading">Titolo del documento *</Label><Input id="vt-heading" maxLength={120} value={form.document_heading} onChange={e => change("document_heading", e.target.value)} />
        <Label htmlFor="vt-intro">Testo introduttivo</Label><Textarea id="vt-intro" rows={3} maxLength={3000} value={form.intro_text} onChange={e => change("intro_text", e.target.value)} />
        <Label htmlFor="vt-conditions">Condizioni della variante</Label><Textarea id="vt-conditions" rows={5} maxLength={10000} value={form.conditions_text} onChange={e => change("conditions_text", e.target.value)} />
        <Label htmlFor="vt-payment">Condizioni di pagamento del modello</Label><Textarea id="vt-payment" rows={2} maxLength={3000} value={form.payment_terms} onChange={e => change("payment_terms", e.target.value)} />
        <div className="grid gap-3 sm:grid-cols-2"><div><Label htmlFor="vt-color">Colore del documento</Label><select id="vt-color" value={form.primary_color} onChange={e => change("primary_color", e.target.value)} className="h-11 w-full rounded-md border bg-background px-3 text-sm">{Object.entries(VARIATION_TEMPLATE_COLORS).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></div>
          <div><Label htmlFor="vt-days">Tipo di giorni suggerito</Label><select id="vt-days" value={form.day_unit} onChange={e => change("day_unit", e.target.value as VariationTemplateContent["day_unit"])} className="h-11 w-full rounded-md border bg-background px-3 text-sm"><option value="calendario">Calendario</option><option value="lavorativi">Lavorativi</option></select></div></div>
      </fieldset>
      {canEdit && <div className="space-y-2 rounded-md border p-3"><Label htmlFor="vt-variable-target">Inserisci una variabile in</Label><select id="vt-variable-target" disabled={busy} value={variableTarget} onChange={e=>setVariableTarget(e.target.value as typeof variableTarget)} className="w-full border rounded-md p-2 text-sm"><option value="intro_text">Introduzione</option><option value="conditions_text">Condizioni</option><option value="payment_terms">Pagamento</option></select><div className="flex flex-wrap gap-2">{VARIATION_TEMPLATE_TAGS.map(tag=><Button key={tag} size="sm" variant="outline" disabled={busy} onClick={()=>change(variableTarget,`${form[variableTarget]}${form[variableTarget]?" ":""}{{${tag}}}`)}>{tag}</Button>)}</div></div>}
      <p className="break-words text-xs text-muted-foreground">Variabili disponibili: {VARIATION_TEMPLATE_TAGS.map(tag => `{{${tag}}}`).join(" · ")}. Non mettere prezzi, clienti o firme di vecchie commesse nel testo riutilizzabile.</p>
      <div className="flex flex-wrap gap-2">
        {canEdit && <Button disabled={busy || !companyId} onClick={async () => {
          if (lock.current || !form) return; lock.current = true; setError("");
          try { const saved = await models.save.mutateAsync({ content: form, previous, creationId }); setPrevious(saved); setForm(saved); setDirty(false); }
          catch (e) { setError(e instanceof Error ? e.message : "Salvataggio non riuscito."); } finally { lock.current = false; }
        }}>{models.save.isPending ? "Salvataggio…" : "Salva modello di variante"}</Button>}
        <Button variant="outline" disabled={busy} onClick={async () => {
          if (lock.current || !form) return; lock.current = true; setPdfBusy(true); setError("");
          try {
            const doc = await variationTemplateExamplePdf(form);
            setPdf({ url: doc.output("datauristring"), snapshot: JSON.stringify(form) });
          } catch (e) { setError(e instanceof Error ? e.message : "Esempio PDF non disponibile."); } finally { lock.current = false; setPdfBusy(false); }
        }}>{pdfBusy ? "Preparo esempio…" : "Prova con dati di esempio"}</Button>
        {pdf?.snapshot === JSON.stringify(form) && <a href={pdf.url} download="esempio-modello-variante.pdf" className="inline-flex min-h-11 items-center rounded-md border px-4 text-sm font-medium">Scarica esempio PDF</a>}
        <Button variant="ghost" disabled={busy} onClick={() => { if (confirmExit()) { setForm(null); setDirty(false); setPdf(null); } }}>Chiudi editor</Button>
      </div>
      {!dirty && previous && <p role="status" className="text-sm text-green-700">Modello salvato · disponibile nelle commesse dell'azienda.</p>}
      {companyId && previous?.company_id === companyId ? <VariationTemplateAttachments key={`${companyId}:${previous.id}`} company={companyId} template={previous.id} content={form} canEdit={canEdit} disabled={models.save.isPending || models.archive.isPending || pdfBusy} onBusyChange={setAttachmentBusy} /> : <p className="text-sm text-muted-foreground">Salva prima il modello per aggiungere allegati PDF.</p>}
      </div>
      <aside id="variation-model-preview" aria-label="Anteprima visiva della variante" className="min-w-0 space-y-2 xl:sticky xl:top-4 scroll-mt-4">
        <p className="text-xs text-muted-foreground">PDF reale con dati dimostrativi. Testi e colore si aggiornano dopo la digitazione; puoi vedere tutte le pagine, ingrandire, aprire e scaricare il documento.</p>
        <div className="h-[75dvh] min-h-[440px] max-h-[900px]"><VariationTemplatePreview content={form} scope={companyId} /></div>
        <p className="text-xs text-muted-foreground">La modifica aggiorna questa bozza, non i documenti già creati. Salva il modello per riutilizzarlo nelle nuove varianti.</p>
      </aside>
    </div>}
  </section>;
}
