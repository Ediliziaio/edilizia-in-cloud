import { TemplateSectionNavigation } from "@/components/preventivi/TemplateSectionNavigation";
import { edileSectionExcluded } from "@/components/preventivi/templateNavigationState";
import { withEdilePageVisibility } from "@/components/preventivi/edilePageVisibility";
import { TemplateCoverDesignControls, COVER_DESIGN_CHOICES } from "@/components/preventivi/TemplateCoverDesignControls";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TemplateRowsEditor, TemplateSectionCard } from "@/components/preventivi/TemplateContentControls";
import { Switch } from "@/components/ui/switch";
import { Eye, EyeOff, Images, Loader2, Save, Wand2 } from "lucide-react";
import { templateEditorLayout, TemplateEditorNavigation, TemplateEditorSaveBar, TemplateEditorWorkspace } from "@/components/preventivi/TemplateEditorLayout";
import { COVER_PRESETS } from "@/components/termoidraulico/coverPresets";
import { TemplateCoverStylePicker, TemplateCoverTextFields } from "@/components/preventivi/TemplateCoverControls";
import { EditorFotoPagina } from "@/components/preventivi/EditorFotoPagina";
import { capitoloVisibile, conCapitoloVisibile } from "@/components/preventivi/pdf/ordineCapitoli";
import { fotoDellaLibreria } from "../../../supabase/functions/_shared/blocchiPreventivo";
import { leggiTestata, LUNGHEZZA_TESTATA } from "../../../supabase/functions/_shared/testatePagine";
import { SezionePaginaEdile } from "@/components/preventivi/SezionePaginaEdile";
import { OrdineCapitoli } from "@/components/preventivi/OrdineCapitoli";
import { PAGINE_EDITOR_EDILI } from "@/components/preventivi/pagineEditor";
import { PdfBlobLivePreviewPanel } from "@/components/shared/PdfBlobLivePreviewPanel";
import { InterventionTextPicker } from "@/components/preventivi/modules/InterventionTextPicker";
import { createFullFacTemplate, prepareFacPhotoRefresh, isFacLocalImage, FAC_FIXTURE_NOTICE, FAC_IMAGE_NOTICE, FAC_MODULE_TITLES, buildFacModulePreview, type FullFacModuleId, type FullFacTemplate } from "@/lib/moduli-vendita/fullFacModules";
import { facCopyChoices } from "@/lib/moduli-vendita/facInterventionCopy";
import { FacciateLocalImageField } from "./FacciateLocalImageField";
import { useFacDirtyGuard } from "./useFacDirtyGuard";
import { clearFacDraft, getFacDraft, putFacDraft } from "./facDraftRecovery";

export interface FacciateTemplateEditorProps {
  moduleId: FullFacModuleId; template: FullFacTemplate; saved: boolean;
  save: (template: FullFacTemplate) => void | Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
  getRevision?: () => string | null;
  /** Host changing company should disable writes before unmounting this workspace. */
  disabled?: boolean;
}

function Rows<T extends object>({ value, onChange, fields, empty, label }: {
  value: T[]; onChange: (rows: T[]) => void; fields: Array<[keyof T, string]>; empty: T; label: string;
}) {
  return <TemplateRowsEditor items={value} onChange={onChange} fields={fields.map(([key, title]) => ({ key, label: title, multiline: key !== fields[0][0] }))} empty={empty} itemLabel={label} addLabel={`Aggiungi ${label.toLowerCase()}`} emptyMessage="Nessuna voce. Inserisci i contenuti pertinenti alla tua proposta." />;
}

export function FacciateTemplateEditor({ moduleId, template, saved, save, onDirtyChange, getRevision, disabled = false }: FacciateTemplateEditorProps) {
  const [form, setForm] = useState(() => structuredClone(getFacDraft(template.company_id, moduleId)?.template ?? template));
  const [baseline, setBaseline] = useState(() => getFacDraft(template.company_id, moduleId)?.baseline ?? JSON.stringify(template));
  const [persisted, setPersisted] = useState(saved);
  const [coverLibraryOpen, setCoverLibraryOpen] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const saveInFlight = useRef(false);
  const discarded = useRef(false);
  const [saving, setSaving] = useState(false), [error, setError] = useState(""), [status, setStatus] = useState("");
  const [params, setParams] = useSearchParams();
  const defaults = useMemo(() => createFullFacTemplate({ ...template, company_id: template.company_id }, moduleId), [template, moduleId]);
  const serialized = JSON.stringify(form), dirty = serialized !== baseline;
  const generation = useRef(0);
  useEffect(() => () => { generation.current += 1; }, []);
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useLayoutEffect(() => {
    if (discarded.current) return;
    if (dirty) putFacDraft(template.company_id, moduleId, { template: form, baseline, revision: getRevision?.() ?? null });
    else clearFacDraft(template.company_id, moduleId);
  }, [form, baseline, dirty, getRevision, template.company_id, moduleId]);
  useFacDirtyGuard(dirty, () => { discarded.current = true; clearFacDraft(template.company_id, moduleId); });
  const patch = (values: Partial<FullFacTemplate>) => { setForm(previous => ({ ...previous, ...values })); setStatus(""); };
  const update = <K extends keyof FullFacTemplate>(key: K, value: FullFacTemplate[K]) => patch({ [key]: value } as Pick<FullFacTemplate, K>);
  const sectionGroups = [
    { title: "AZIENDA", items: [{ id: "brand", voce: "Azienda e stile", emoji: "🏢", descrizione: "Identità aziendale, logo, colori e caratteri", pagina: null }] },
    { title: "PAGINE DEL PDF", items: PAGINE_EDITOR_EDILI.map(item => item.id === "page_testimonianze" ? { ...item, descrizione: "Testimonianze autentiche inserite dall'azienda, solo in locale" } : item) },
    { title: "DATI & CONTENUTI", items: [
      { id: "progetto", voce: "Esigenze e soluzione", emoji: "📝", descrizione: "Il punto di partenza e la risposta proposta", pagina: "progetto" },
      { id: "fixture", voce: "Prezzi di esempio", emoji: "🧮", descrizione: "Dati dimostrativi per verificare l'impaginazione", pagina: null },
    ] },
  ];
  const sections = sectionGroups.flatMap(group => group.items);
  const sectionParam = params.get("section") || "page_cover";
  const section = sections.some(p => p.id === sectionParam) ? sectionParam : "page_cover";
  const active = sections.find(p => p.id === section)!;
  const ownCard = ["brand", "progetto", "fixture", "page_cover", "page_chi_siamo", "page_percorso", "page_crono", "page_ordine", "page_condizioni", "page_testimonianze"].includes(section);
  const openSection = (id: string) => { const next = new URLSearchParams(params); next.set("section", id); setParams(next, { replace: true }); };
  const text = (key: keyof FullFacTemplate, label: string, multiline = false) => <label className="block space-y-1 text-sm" key={key}>{label}
    {multiline ? <Textarea aria-label={label} value={String(form[key] ?? "")} rows={4} onChange={e => patch({ [key]: e.target.value })} />
      : <Input aria-label={label} value={String(form[key] ?? "")} onChange={e => patch({ [key]: e.target.value })} />}</label>;
  const setPageVisibility = (chapter: string, visible: boolean) => {
    setForm(previous => withEdilePageVisibility(previous, chapter, visible));
    setStatus("");
  };
  const visibilityChapter = ({ page_chi_siamo: "chiSiamo", page_percorso: "percorso", page_crono: "tempi" } as Record<string, string>)[section];
  const list = (key: "esigenze" | "soluzione" | "usp" | "percorso" | "garanzie") => <Rows value={form[key]} onChange={value => update(key, value)} fields={[["titolo", "Titolo"], ["descrizione", "Descrizione"]]} empty={{ titolo: "", descrizione: "" }} label="Voce" />;
  const photo = (value: string | null, onChange: (url: string | null) => void) => <FacciateLocalImageField value={value} onChange={onChange} />;
  const faq = <Rows value={form.faq} onChange={value => update("faq", value)} fields={[["domanda", "Domanda"], ["risposta", "Risposta"]]} empty={{ domanda: "", risposta: "" }} label="Domanda" />;
  const submit = async () => {
    if (disabled || saveInFlight.current || (!dirty && persisted)) return;
    saveInFlight.current = true;
    setSaving(true); setError(""); const token = generation.current;
    const snapshot = structuredClone(form);
    try { await save(snapshot); if (token === generation.current) { setBaseline(JSON.stringify(snapshot)); setPersisted(true); setStatus("Modulo salvato in locale."); } }
    catch (e) { if (token === generation.current) setError(e instanceof Error ? e.message : String(e)); }
    finally { saveInFlight.current = false; if (token === generation.current) setSaving(false); }
  };
  const fixture = useMemo(() => buildFacModulePreview(form.company_id, form, moduleId), [form, moduleId]);
  const photoRefresh = useMemo(() => prepareFacPhotoRefresh(form, moduleId), [form, moduleId]);
  // The native schema uses the renovation sector, but its generic photo migration is not suitable for façades.
  const nativeBlocks = { ...form.pdf_blocchi, modulo_foto_revisione: 2 };
  // The mask is for the shared UI only, never a migration of a saved Facciate copy.
  const updateNativeBlocks = (value: Record<string, unknown>) => {
    const { modulo_foto_revisione: _mask, ...rest } = value;
    update("pdf_blocchi", Object.prototype.hasOwnProperty.call(form.pdf_blocchi, "modulo_foto_revisione")
      ? { ...rest, modulo_foto_revisione: form.pdf_blocchi.modulo_foto_revisione } : rest);
  };
  const coverPhotos = useMemo(() => {
    // Never fall back to the generic renovation library for older Facciate copies.
    const photos = [...fotoDellaLibreria("ristrutturazione", { modulo_foto: [], ...defaults.pdf_blocchi }), ...fotoDellaLibreria("ristrutturazione", { modulo_foto: [], ...form.pdf_blocchi })];
    return photos.filter((photo, index) => isFacLocalImage(photo.url) && photos.findIndex(other => other.url === photo.url) === index);
  }, [defaults.pdf_blocchi, form.pdf_blocchi]);
  const reviewHeading = leggiTestata("recensioni", "edili", form.pdf_blocchi);
  // These native PDF style keys are already supported by the renderer and local
  // passthrough schema. Do not import the reference sector's stock image or copy.
  const coverFields: Record<string, unknown> = { ...form };
  const applyCoverStyle = (id: string) => {
    const preset = COVER_PRESETS.find(item => item.id === id);
    if (!preset) return;
    const styles: Record<string, unknown> = Object.fromEntries(Object.entries(preset.patch).filter(([key]) => key !== "pdf_cover_image_url"));
    patch(styles);
  };
  const setReviewHeading = (key: keyof typeof LUNGHEZZA_TESTATA, value: string) => {
    const previous = form.pdf_blocchi.testata_recensioni;
    update("pdf_blocchi", { ...form.pdf_blocchi, testata_recensioni: { ...(previous && typeof previous === "object" ? previous : {}), [key]: value } });
  };
  return <div data-fac-module-editor className="space-y-4">
    <fieldset disabled={disabled || saving} className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-orange-200 bg-gradient-to-r from-orange-50 to-amber-50/60 p-4">
      <div className="flex items-start gap-3"><div className="rounded-xl bg-orange-500 p-2.5 text-white"><Wand2 className="h-5 w-5" aria-hidden="true" /></div><div><h3 className="text-sm font-semibold">Testi pronti per questo intervento</h3><p className="mt-1 text-xs text-muted-foreground">Scegli una variante per {FAC_MODULE_TITLES[moduleId]}. Le foto e gli altri contenuti restano invariati.</p></div></div>
      <InterventionTextPicker title={FAC_MODULE_TITLES[moduleId]} choices={facCopyChoices(moduleId, defaults)} onApply={values => { if (!disabled && !saveInFlight.current) patch(values); }} />
    </fieldset>
    {photoRefresh.added > 0 && <div className="rounded border border-sky-200 bg-sky-50 p-3 text-sm"><p>Questa copia iniziale ha {photoRefresh.added} pagine senza foto di serie. Puoi aggiungere le immagini illustrative Facciate mantenendo testi e foto personalizzate.</p><Button variant="outline" disabled={disabled || saving} onClick={() => update("pdf_blocchi", photoRefresh.blocks)}>Completa le foto Facciate</Button><p className="text-xs">Controlla l'anteprima e salva in locale per conservare l'aggiornamento.</p></div>}
    <TemplateEditorWorkspace>
      <TemplateEditorNavigation>
        <nav aria-label="Pagine del PDF Facciate" className={templateEditorLayout.navigationPanel}>
          <TemplateSectionNavigation groups={sectionGroups.map(group => ({ label: group.title, items: group.items.map(item => ({ id: item.id, label: item.voce, emoji: item.emoji, descr: item.descrizione })) }))} activeSection={section} onSelect={openSection} isExcluded={id => edileSectionExcluded(form, id)} />
        </nav>
      </TemplateEditorNavigation>
      <div data-template-content className={templateEditorLayout.content}>
      <fieldset disabled={disabled || saving} className="min-w-0 space-y-4">
        {ownCard && <TemplateSectionCard icon={() => <span aria-hidden="true">{active.emoji}</span>} title={active.voce} description={active.descrizione} toggle={visibilityChapter ? { value: !edileSectionExcluded(form, section), onChange: value => setPageVisibility(visibilityChapter, value), label: "Mostra nel PDF" } : undefined}>
        {section === "brand" && <>
          {[ ["ragione_sociale", "Ragione sociale"], ["indirizzo_completo", "Indirizzo"], ["telefono", "Telefono"], ["email", "Email"], ["partita_iva", "Partita IVA"] ].map(([key, label]) => text(key as keyof FullFacTemplate, label))}
          <FacciateLocalImageField label="Logo aziendale" value={form.logo_url} onChange={url => update("logo_url", url)} />
          <div className="grid grid-cols-2 gap-3">{(["color_primary", "color_accent"] as const).map((key, i) => <label key={key} className="text-sm">{i ? "Colore accento" : "Colore primario"}<Input type="color" aria-label={i ? "Colore accento" : "Colore primario"} value={form[key] || "#465b50"} onChange={e => update(key, e.target.value)} /></label>)}</div>
          <label className="block text-sm">Carattere<select aria-label="Carattere" value={form.font_family || "helvetica"} onChange={e => update("font_family", e.target.value)} className="ml-2 rounded border p-2"><option value="helvetica">Lineare</option><option value="editoriale">Editoriale</option><option value="times">Classico</option></select></label>
        </>}
        {section === "page_cover" && <>
          <TemplateCoverStylePicker presets={COVER_PRESETS} activeId={COVER_PRESETS.find(preset => Object.entries(preset.patch).filter(([key]) => key !== "pdf_cover_image_url").every(([key, value]) => coverFields[key] === value))?.id} onApply={applyCoverStyle} />
          <TemplateCoverTextFields value={{ eyebrow: form.pdf_cover_eyebrow, title: form.cover_title, subtitle: form.cover_subtitle }} onChange={(field, value) => {
            if (field === "eyebrow") update("pdf_cover_eyebrow", value ?? "");
            if (field === "title") update("cover_title", value ?? "");
            if (field === "subtitle") update("cover_subtitle", value ?? "");
          }} />
          <p className="text-[11px] text-muted-foreground">Una parola fra asterischi esce in corsivo, come nel documento originale. Controlla il risultato nell'anteprima PDF.</p>
          <FacciateLocalImageField label="Immagine copertina" value={form.pdf_cover_image_url} onChange={url => patch({ pdf_cover_image_url: url, cover_image_url: url })} />
          <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" aria-expanded={coverLibraryOpen} onClick={() => setCoverLibraryOpen(value => !value)}><Images className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />{coverLibraryOpen ? "Chiudi libreria copertina" : "Scegli dalla libreria del modulo"}</Button><Button type="button" size="sm" variant="ghost" onClick={() => patch({ pdf_cover_image_url: defaults.pdf_cover_image_url, cover_image_url: defaults.cover_image_url })}>Ripristina immagine del modulo</Button></div>
          {coverLibraryOpen && <div aria-label="Libreria foto Facciate" className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto rounded-md border p-2 sm:grid-cols-3">{coverPhotos.map(photo => <button type="button" key={photo.url} aria-label={`Usa ${photo.nome} in copertina`} aria-pressed={form.pdf_cover_image_url === photo.url} className={`overflow-hidden rounded-md border text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${form.pdf_cover_image_url === photo.url ? "border-orange-500 ring-1 ring-orange-500" : "hover:border-orange-300"}`} onClick={() => { patch({ pdf_cover_image_url: photo.url, cover_image_url: photo.url }); setCoverLibraryOpen(false); }}><img src={photo.url} alt="" loading="lazy" className="aspect-video w-full object-cover" /><span className="block px-2 py-1 text-[10px]">{photo.nome}</span></button>)}</div>}
          <p className="text-xs text-muted-foreground">{FAC_IMAGE_NOTICE}</p>
          <FacciateLocalImageField label="Logo copertina" value={form.cover_logo_url} onChange={url => update("cover_logo_url", url)} />
<TemplateCoverDesignControls hasImage={!!form.pdf_cover_image_url} fields={[
{id:"eyebrowSize",kind:"range",value:Number(coverFields.pdf_cover_eyebrow_size ?? 10),min:7,max:20,step:1,unit:"pt",onChange:value=>patch({ pdf_cover_eyebrow_size: value })},
{id:"titleSize",kind:"range",value:Number(coverFields.pdf_cover_title_size ?? 30),min:16,max:60,step:1,unit:"pt",onChange:value=>patch({ pdf_cover_title_size: value })},
{id:"subtitleSize",kind:"range",value:Number(coverFields.pdf_cover_subtitle_size ?? 13),min:8,max:24,step:1,unit:"pt",onChange:value=>patch({ pdf_cover_subtitle_size: value })},
{id:"overlayOpacity",kind:"range",value:Number(coverFields.pdf_cover_overlay_opacity ?? 65),min:0,max:100,step:1,unit:"%",onChange:value=>patch({ pdf_cover_overlay_opacity: value })},
{id:"textAlign",kind:"choice",value:String(coverFields.pdf_cover_text_align ?? "left"),choices:COVER_DESIGN_CHOICES.textAlign,onChange:value=>patch({ pdf_cover_text_align: value } as Record<string, unknown>)},
{id:"textVertical",kind:"choice",value:String(coverFields.pdf_cover_text_vertical ?? "bottom"),choices:COVER_DESIGN_CHOICES.textVertical,onChange:value=>patch({ pdf_cover_text_vertical: value } as Record<string, unknown>)},
{id:"logoPosition",kind:"choice",value:String(coverFields.pdf_cover_logo_position ?? form.cover_logo_position ?? "top_left"),choices:COVER_DESIGN_CHOICES.logoPosition,onChange:value=>patch({ pdf_cover_logo_position: value } as Record<string, unknown>)},
{id:"overlayStyle",kind:"choice",value:String(coverFields.pdf_cover_overlay_style ?? "flat"),choices:COVER_DESIGN_CHOICES.overlayStyle,onChange:value=>patch({ pdf_cover_overlay_style: value } as Record<string, unknown>)},
{id:"decorationStyle",kind:"choice",value:String(coverFields.pdf_cover_decoration_style ?? "none"),choices:COVER_DESIGN_CHOICES.decorationStyle,onChange:value=>patch({ pdf_cover_decoration_style: value } as Record<string, unknown>)},
{id:"textColor",kind:"color",value:form.pdf_cover_text_color,fallback:"#FFFFFF",onChange:value=>patch({ pdf_cover_text_color: value })},
{id:"backgroundColor",kind:"color",value:form.pdf_cover_bg_color,fallback:"#0F2542",onChange:value=>patch({ pdf_cover_bg_color: value })},
{id:"showDecoration",kind:"toggle",value:!!form.pdf_cover_show_decoration,onChange:value=>patch({ pdf_cover_show_decoration: value })},
{id:"showClientCard",kind:"toggle",value:!!form.pdf_cover_show_client_card,onChange:value=>patch({ pdf_cover_show_client_card: value })}
]}></TemplateCoverDesignControls>
        </>}
        {section === "progetto" && <><h4>Esigenze</h4>{list("esigenze")}<h4>Soluzione</h4>{list("soluzione")}</>}
        {section === "page_chi_siamo" && <>{text("chi_siamo", "Presentazione azienda", true)}<h4>Elementi distintivi verificabili</h4>{list("usp")}</>}
        {section === "page_percorso" && <>{list("percorso")}</>}
        {section === "page_crono" && <><Rows value={form.cronoprogramma} onChange={value => update("cronoprogramma", value)} fields={[["fase", "Fase"], ["descrizione", "Descrizione"], ["durata", "Durata"]]} empty={{ fase: "", descrizione: "", durata: "Da concordare" }} label="Fase" /></>}
        {section === "page_ordine" && <OrdineCapitoli visibilitySettings={form} onVisibilityChange={setPageVisibility} ordine={form.pdf_ordine_capitoli} pagine={form.pdf_pagine_libere} onOrdine={value => update("pdf_ordine_capitoli", value)} onPagine={value => update("pdf_pagine_libere", value)} campoFoto={photo} settore="ristrutturazione" blocchi={nativeBlocks} onBlocchi={updateNativeBlocks} apriSezione={openSection} ordineDiSerie={defaults.pdf_ordine_capitoli} />}
        {section === "page_condizioni" && <>
          {text("payment_terms_text", "Modalità di pagamento", true)}{text("validity_text", "Validità e note", true)}
          {text("condizioni_legali_testo", "Condizioni proprie da verificare", true)}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!form.condizioni_legali_attivo} disabled={!form.condizioni_legali_testo?.trim()} onChange={e => update("condizioni_legali_attivo", e.target.checked)} />Allega le condizioni scritte qui</label>
          <p className="text-xs text-muted-foreground">L'anteprima conserva sempre l'indicazione che dati e prezzi sono dimostrativi.</p>
        </>}
        {section === "page_testimonianze" && <>
          <label className="flex items-center justify-between gap-2 text-xs">Mostra nel PDF<Switch aria-label="Mostra «Dicono di noi» nel PDF" checked={capitoloVisibile(form.pdf_ordine_capitoli, form.pdf_pagine_libere, "recensioni")} onCheckedChange={value => update("pdf_ordine_capitoli", conCapitoloVisibile(form.pdf_ordine_capitoli, form.pdf_pagine_libere, "recensioni", value))} /></label>
          <p className="text-xs text-muted-foreground">Inserisci solo testimonianze autentiche autorizzate. Nessuna recensione online viene letta o importata. Senza testimonianze la pagina non compare nel PDF.</p>
          {([ ["occhiello", "Occhiello testimonianze"], ["titolo", "Titolo testimonianze"], ["intro", "Introduzione testimonianze"] ] as const).map(([key, label]) => <label key={key} className="block space-y-1 text-xs">{label}<Textarea aria-label={label} rows={key === "intro" ? 3 : 2} maxLength={LUNGHEZZA_TESTATA[key]} value={String((form.pdf_blocchi.testata_recensioni as Record<string, unknown> | undefined)?.[key] ?? "")} placeholder={reviewHeading[key] || "Testo di serie del modulo"} onChange={event => setReviewHeading(key, event.target.value)} /></label>)}
          <Rows value={form.testimonianze} onChange={value => update("testimonianze", value)} fields={[["autore", "Autore"], ["ruolo", "Ruolo o contesto"], ["testo", "Testimonianza"]]} empty={{ autore: "", testo: "", ruolo: null }} label="Testimonianza" />
          <EditorFotoPagina chiave="recensioni" settore="ristrutturazione" salvati={nativeBlocks} onSalvati={updateNativeBlocks} campoFoto={photo} nota="Foto illustrativa: non rappresenta l'autore della testimonianza. Compare soltanto se la pagina ha spazio." />
        </>}
        {section === "fixture" && <><p className="text-sm">{FAC_FIXTURE_NOTICE}</p><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th className="text-left">Lavorazione</th><th>Quantità</th><th>Prezzo</th><th>Importo</th></tr></thead><tbody>{fixture.capitoli.flatMap(c => c.voci).map(v => <tr key={v.id} className="border-t"><td className="py-2">{v.descrizione}</td><td>{v.quantita} {v.unitaMisura}</td><td>{v.prezzoUnitario.toFixed(2)}</td><td>{v.importo.toFixed(2)}</td></tr>)}</tbody></table></div><p>Totale IVA inclusa: {fixture.totali.totale.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}</p><p className="text-xs">Il computo è un esempio per verificare l'impaginazione. Il collegamento al preventivatore non è ancora attivo.</p></>}
        </TemplateSectionCard>}
        {section === "page_lavori" && <p className="text-xs text-muted-foreground">Aggiungi soltanto fotografie di lavori aziendali reali e autorizzate.</p>}
        {section !== "page_testimonianze" && <SezionePaginaEdile sezione={section} settore="ristrutturazione" blocchi={nativeBlocks} onBlocchi={updateNativeBlocks} ordine={form.pdf_ordine_capitoli} pagine={form.pdf_pagine_libere} onOrdine={value => update("pdf_ordine_capitoli", value)} mostraGaranzie={form.show_garanzie} onMostraGaranzie={value => update("show_garanzie", value)} campoFoto={photo}
          contenuti={{ domande: faq, garanzie: list("garanzie"), lavori: <div className="space-y-3">{(form.gallery_lavori || []).map((item, index) => <div key={item.id} className="space-y-2 rounded border p-3"><FacciateLocalImageField label={`Lavoro ${index + 1}`} value={item.url} onChange={url => update("gallery_lavori", url ? (form.gallery_lavori || []).map((g, i) => i === index ? { ...g, url } : g) : (form.gallery_lavori || []).filter((_, i) => i !== index))} /><Input aria-label={`Didascalia lavoro ${index + 1}`} value={item.didascalia || ""} onChange={e => update("gallery_lavori", (form.gallery_lavori || []).map((g, i) => i === index ? { ...g, didascalia: e.target.value } : g))} /></div>)}<FacciateLocalImageField label="Nuovo lavoro aziendale" value={null} onChange={url => { if (url) update("gallery_lavori", [...(form.gallery_lavori || []), { id: crypto.randomUUID(), url, didascalia: "", luogo: null }]); }} /></div> }} />}
      </fieldset>
      <TemplateEditorSaveBar>
        <div className="min-w-0 flex-1"><p role="status" aria-live="polite" className={`text-xs ${dirty ? "text-amber-700" : "text-muted-foreground"}`}>{saving ? "Salvataggio locale in corso…" : status || (dirty ? "Modifiche non salvate" : persisted ? "Copia locale salvata" : "Nuovo modulo non ancora salvato")}</p>{error && <p role="alert" className="mt-1 break-words text-xs text-destructive">Salvataggio non riuscito: {error}. Le modifiche restano da salvare.</p>}</div>
        <div className="flex items-center gap-2"><Button type="button" variant="outline" data-show-template-preview><Eye className="mr-2 h-4 w-4" aria-hidden="true" />Anteprima PDF</Button><Button type="button" className="bg-orange-500 text-white hover:bg-orange-600" onClick={submit} disabled={(!dirty && persisted) || saving || disabled}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="mr-2 h-4 w-4" aria-hidden="true" />}{saving ? "Salvataggio…" : "Salva modulo in locale"}</Button></div>
      </TemplateEditorSaveBar>
      </div>
      <aside data-template-preview className={`${templateEditorLayout.preview} ${templateEditorLayout.previewPanel}`} ref={previewRef} tabIndex={-1} aria-label="Anteprima PDF Facciate"><PdfBlobLivePreviewPanel activeSection={section} depsKey={`${moduleId}:${serialized}`} enabled={!disabled} renderBlobUrl={async () => {
        const { renderFacPreviewBlobUrl } = await import("./facPdfAdapter");
        return renderFacPreviewBlobUrl(form.company_id, form, moduleId);
      }} /></aside>
    </TemplateEditorWorkspace>
  </div>;
}
