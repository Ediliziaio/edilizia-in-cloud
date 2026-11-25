import { UniformSelect } from "@/components/ui/uniform-select";
import { useRef, useState } from "react";
import { useVariationTemplates } from "@/hooks/useVariationTemplates";
import { useSettingsDraftGuard } from "@/hooks/useSettingsDraftGuard";
import { blankVariationTemplate, VARIATION_TEMPLATE_COLORS, VARIATION_TEMPLATE_EXAMPLES, VARIATION_TEMPLATE_TAGS, type VariationTemplateContent, type VariationTemplateRow } from "@/lib/orders/variationTemplates";
import { variationTemplateExamplePdf } from "@/lib/orders/variationTemplateExample";
import { VariationTemplatePreview } from "@/components/orders/VariationTemplatePreview";
import { VariationTemplateAttachments } from "@/components/orders/VariationTemplateAttachments";
import { DiscardDocumentDraft } from "@/components/shared/DiscardDocumentDraft";
import { DocumentEditorWorkspace, type VistaEditorDocumento } from "@/components/shared/DocumentEditorWorkspace";
import { Button } from "@/components/ui/button";
import { BOTTONE_NUOVO } from "@/components/orders/TestataScheda";
import { Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { listVariationFiles, downloadVariationFile, uploadVariationFile } from "@/lib/orders/variationTemplateFiles";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function VariationTemplatesPanel({ companyId, canEdit }: { companyId?: string; canEdit: boolean }) {
  const t = useT();
  const [archived,setArchived] = useState(false);
  const models = useVariationTemplates(companyId,true,archived);
  const [form, setForm] = useState<VariationTemplateContent | null>(null);
  const [iniziale, setIniziale] = useState<VariationTemplateContent | null>(null);
  const [vista, setVista] = useState<VistaEditorDocumento>("modifica");
  const [previous, setPrevious] = useState<VariationTemplateRow | undefined>();
  const [creationId, setCreationId] = useState<string>();
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [pdf, setPdf] = useState<{ url: string; snapshot: string } | null>(null);
  const lock = useRef(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const [variableTarget,setVariableTarget] = useState<"intro_text"|"conditions_text"|"payment_terms">("intro_text");
  const confirmExit = useSettingsDraftGuard(dirty);
  const canEditCurrent = canEdit && previous?.is_active !== false;
  const busy = models.save.isPending || models.archive.isPending || models.restore?.isPending || pdfBusy || attachmentBusy;
  const carica = (content: VariationTemplateContent, row?: VariationTemplateRow) => {
    setForm(content);
    setIniziale(content);
    setPrevious(row);
    setDirty(canEdit && !row);
    setPdf(null);
  };
  const start = (content: VariationTemplateContent, row?: VariationTemplateRow, vistaIniziale: VistaEditorDocumento = "modifica") => {
    if (busy) return;
    if (!row || row.id !== previous?.id || !form) {
      if (!confirmExit()) return;
      carica(content, row);
      setCreationId(row ? undefined : crypto.randomUUID());
      setError("");
    }
    setVista(vistaIniziale);
    requestAnimationFrame(() => editorRef.current?.scrollIntoView?.({ block: "start" }));
  };
  const change = <K extends keyof VariationTemplateContent>(key: K, value: VariationTemplateContent[K]) => {
    if (!form) return;
    setForm({ ...form, [key]: value }); setDirty(true); setError(""); setPdf(null);
  };
  return <section className="space-y-4" aria-label={t("Modelli delle varianti")}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-lg font-semibold">{t("Varianti e lavori extra")}</h2><p className="text-sm text-muted-foreground">{t("Prepara una volta testi e condizioni. Nella commessa compili lavori, prezzo e tempi.")}</p></div>
      {canEdit && <Button size="sm" className={BOTTONE_NUOVO} disabled={busy || !companyId} onClick={() => start(blankVariationTemplate())}><Plus className="h-3.5 w-3.5" />{t("Nuovo modello di variante")}</Button>}
    </div>
    {!canEdit && <p className="text-sm text-muted-foreground">{t("Sola lettura: i modelli si possono consultare e provare, non modificare.")}</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {models.isError && <p role="alert" className="text-sm text-destructive">{t("Modelli aziendali non disponibili.")} <Button variant="outline" size="sm" onClick={() => void models.refetch()}>{t("Riprova")}</Button></p>}
    {models.isLoading && <p role="status">{t("Caricamento modelli…")}</p>}
    {canEdit && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={archived} disabled={busy} onChange={e=>setArchived(e.target.checked)} />{t("Mostra anche i modelli archiviati")}</label>}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {(models.data ?? []).map(row => <div className="space-y-2 rounded-lg border p-4" key={row.id}>
        <h3 className="font-medium">{row.name}{!row.is_active && <span className="ml-2 text-xs text-muted-foreground">{t("Archiviato")}</span>}</h3><p className="text-sm text-muted-foreground">{row.document_heading} · v{row.revision} · {row.variation_kind === "riduzione" ? t("riduzione") : row.variation_kind === "modifica" ? t("modifica") : t("aggiunta")}</p>
        <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => start(row, row)}>{canEdit && row.is_active ? t("Modifica") : t("Apri")}</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => start(row, row, "anteprima")}>{t("Anteprima PDF")}</Button>
          {canEdit && row.is_active && <><Button size="sm" variant="outline" disabled={busy} onClick={async () => {
            if(!companyId || lock.current || !confirmExit() || !window.confirm(t("Creare una copia del modello, inclusi gli allegati PDF attivi?")))return;
            lock.current=true;setAttachmentBusy(true);setError("");let copied:VariationTemplateRow|undefined;
            try {copied=await models.save.mutateAsync({content:{...row,name:`${row.name.slice(0,100)} · copia`},creationId:crypto.randomUUID()});
              for(const file of await listVariationFiles(companyId,row.id)){const blob=await downloadVariationFile(file,companyId,row.id);await uploadVariationFile(companyId,copied.id,new File([blob],file.file_name,{type:"application/pdf"}));}
              carica(copied, copied);
              setVista("modifica");
            }catch(e){if(copied){carica(copied, copied);setVista("modifica");}setError(`${e instanceof Error?e.message:t("Copia non completata.")}${copied?` ${t("La copia dei testi è salvata: verifica gli allegati prima di usarla.")}`:""}`);}finally{lock.current=false;setAttachmentBusy(false);}
          }}>{t("Duplica con allegati")}</Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={async () => {
              if (lock.current || !confirmExit() || !window.confirm(t("Archiviare il modello? I documenti delle commesse già creati non cambiano."))) return;
              lock.current = true; try { await models.archive.mutateAsync(row); if (previous?.id === row.id) { setForm(null); setDirty(false); } }
              catch (e) { setError(e instanceof Error ? e.message : t("Archiviazione non riuscita.")); } finally { lock.current = false; }
            }}>{t("Archivia")}</Button></>}
          {canEdit && !row.is_active && <Button variant="outline" size="sm" disabled={busy} onClick={async()=>{if(lock.current)return;lock.current=true;try{await models.restore.mutateAsync(row);}catch(e){setError(e instanceof Error?e.message:t("Ripristino non confermato"));}finally{lock.current=false;}}}>{t("Ripristina")}</Button>}
        </div>
      </div>)}
    </div>
    <div className="rounded-lg border p-3"><p className="mb-2 text-sm font-medium">{t("Esempi da adattare")}</p><div className="flex flex-wrap gap-2">{VARIATION_TEMPLATE_EXAMPLES.map(example => <Button key={example.name} size="sm" variant="outline" disabled={busy} onClick={() => start(example)}>{example.name}</Button>)}</div><p className="mt-2 text-xs text-muted-foreground">{t("Esempi di compilazione, non clausole legali verificate. Salva una copia per renderla disponibile alla tua azienda.")}</p></div>
    {form && <div ref={editorRef} className="scroll-mt-4"><DocumentEditorWorkspace
      selezioneVista={{ vista, onChange: setVista }}
      previewClassName="xl:sticky xl:top-4"
      editor={<div className="min-w-0 space-y-4 rounded-lg border p-4" aria-label={t("Editor modello di variante")}>
      <h3 className="font-medium">{t("Testi e stile del documento")}</h3>
      <fieldset disabled={!canEditCurrent || busy} className="space-y-3 min-w-0">
        <Label htmlFor="vt-name">{t("Nome del modello *")}</Label><Input id="vt-name" maxLength={120} value={form.name} onChange={e => change("name", e.target.value)} />
        <Label htmlFor="vt-kind">{t("Tipo di variante")}</Label><UniformSelect id="vt-kind" className="h-11 w-full rounded-md border bg-background px-3 text-sm" value={form.variation_kind ?? "aggiunta"} onChange={e=>change("variation_kind",e.target.value as VariationTemplateContent["variation_kind"])}><option value="aggiunta">{t("Aggiunta di lavori")}</option><option value="modifica">{t("Modifica / sostituzione")}</option><option value="riduzione">{t("Riduzione di lavori · importo sottratto")}</option></UniformSelect>
        <Label htmlFor="vt-heading">{t("Titolo del documento *")}</Label><Input id="vt-heading" maxLength={120} value={form.document_heading} onChange={e => change("document_heading", e.target.value)} />
        <Label htmlFor="vt-intro">{t("Testo introduttivo")}</Label><Textarea id="vt-intro" rows={3} maxLength={3000} value={form.intro_text} onChange={e => change("intro_text", e.target.value)} />
        <Label htmlFor="vt-conditions">{t("Condizioni della variante")}</Label><Textarea id="vt-conditions" rows={5} maxLength={10000} value={form.conditions_text} onChange={e => change("conditions_text", e.target.value)} />
        <Label htmlFor="vt-payment">{t("Condizioni di pagamento del modello")}</Label><Textarea id="vt-payment" rows={2} maxLength={3000} value={form.payment_terms} onChange={e => change("payment_terms", e.target.value)} />
        <div className="grid gap-3 sm:grid-cols-2"><div><Label htmlFor="vt-color">{t("Colore del documento")}</Label><UniformSelect id="vt-color" value={form.primary_color} onChange={e => change("primary_color", e.target.value)} className="h-11 w-full rounded-md border bg-background px-3 text-sm">{Object.entries(VARIATION_TEMPLATE_COLORS).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</UniformSelect></div>
          <div><Label htmlFor="vt-days">{t("Tipo di giorni suggerito")}</Label><UniformSelect id="vt-days" value={form.day_unit} onChange={e => change("day_unit", e.target.value as VariationTemplateContent["day_unit"])} className="h-11 w-full rounded-md border bg-background px-3 text-sm"><option value="calendario">{t("Calendario")}</option><option value="lavorativi">{t("Lavorativi")}</option></UniformSelect></div></div>
      </fieldset>
      {canEditCurrent && <div className="space-y-2 rounded-md border p-3"><Label htmlFor="vt-variable-target">{t("Inserisci una variabile in")}</Label><UniformSelect id="vt-variable-target" disabled={busy} value={variableTarget} onChange={e=>setVariableTarget(e.target.value as typeof variableTarget)} className="w-full border rounded-md p-2 text-sm"><option value="intro_text">{t("Introduzione")}</option><option value="conditions_text">{t("Condizioni")}</option><option value="payment_terms">{t("Pagamento")}</option></UniformSelect><div className="flex flex-wrap gap-2">{VARIATION_TEMPLATE_TAGS.map(tag=><Button key={tag} size="sm" variant="outline" disabled={busy} onClick={()=>change(variableTarget,`${form[variableTarget]}${form[variableTarget]?" ":""}{{${tag}}}`)}>{tag}</Button>)}</div></div>}
      <p className="break-words text-xs text-muted-foreground">{t("Variabili disponibili: {variabili}. Non mettere prezzi, clienti o firme di vecchie commesse nel testo riutilizzabile.", { variabili: VARIATION_TEMPLATE_TAGS.map(tag => `{{${tag}}}`).join(" · ") })}</p>
      <div className="flex flex-wrap gap-2">
        {canEditCurrent && <Button disabled={busy || !companyId} onClick={async () => {
          if (lock.current || !form) return; lock.current = true; setError("");
          try { const saved = await models.save.mutateAsync({ content: form, previous, creationId }); carica(saved, saved); }
          catch (e) { setError(e instanceof Error ? e.message : t("Salvataggio non riuscito.")); } finally { lock.current = false; }
        }}>{models.save.isPending ? t("Salvataggio…") : t("Salva modello di variante")}</Button>}
        {canEditCurrent && <DiscardDocumentDraft disabled={busy || !dirty} onDiscard={() => {
          setForm(iniziale);
          setDirty(false);
          setError("");
          setPdf(null);
        }} />}
        <Button variant="outline" disabled={busy} onClick={async () => {
          if (lock.current || !form) return; lock.current = true; setPdfBusy(true); setError("");
          try {
            const doc = await variationTemplateExamplePdf(form);
            setPdf({ url: doc.output("datauristring"), snapshot: JSON.stringify(form) });
          } catch (e) { setError(e instanceof Error ? e.message : t("Esempio PDF non disponibile.")); } finally { lock.current = false; setPdfBusy(false); }
        }}>{pdfBusy ? t("Preparo esempio…") : t("Prova con dati di esempio")}</Button>
        {pdf?.snapshot === JSON.stringify(form) && <a href={pdf.url} download="esempio-modello-variante.pdf" className="inline-flex min-h-11 items-center rounded-md border px-4 text-sm font-medium">{t("Scarica esempio PDF")}</a>}
        <Button variant="ghost" disabled={busy} onClick={() => { if (confirmExit()) { setForm(null); setDirty(false); setPdf(null); } }}>{t("Chiudi editor")}</Button>
      </div>
      {dirty && <p className="text-sm text-amber-700">{t("Modifiche non salvate")}</p>}
      {!dirty && previous && <p role="status" className="text-sm text-green-700">{t("Modello salvato · disponibile nelle commesse dell'azienda.")}</p>}
      {previous?.is_active === false && <p className="text-sm text-muted-foreground">{t("Modello archiviato, in sola lettura. Ripristinalo dalla libreria e riaprilo per modificarlo.")}</p>}
      {companyId && previous?.company_id === companyId ? <VariationTemplateAttachments key={`${companyId}:${previous.id}`} company={companyId} template={previous.id} content={form} canEdit={canEditCurrent} disabled={models.save.isPending || models.archive.isPending || pdfBusy} onBusyChange={setAttachmentBusy} /> : <p className="text-sm text-muted-foreground">{t("Salva prima il modello per aggiungere allegati PDF.")}</p>}
      </div>}
      anteprima={<aside aria-label={t("Anteprima visiva della variante")} className="min-w-0 space-y-2">
        <p className="text-xs text-muted-foreground">{t("Esempio con testi e colori della bozza.")}</p>
        <div className="h-[75dvh] min-h-[440px] max-h-[900px]"><VariationTemplatePreview content={form} scope={companyId} /></div>
      </aside>}
    /></div>}
  </section>;
}
