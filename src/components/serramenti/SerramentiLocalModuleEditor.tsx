import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useBeforeUnload } from "@/hooks/useBeforeUnload";
import { readLocalTemplateImage } from "@/lib/moduli-vendita/localTemplateImage";
import { findSerramentiTemplateModule, type SerramentiTemplateModuleId } from "@/lib/moduli-vendita/serramentiTemplateModules";
import { SR_PDF_PAGES_META, type SrTemplatePdfRow } from "@/types/serramenti";
import { SerramentiLivePreviewPanel } from "./SerramentiLivePreviewPanel";

const sections = [
  ["page_cover", "1 · Copertina"], ["contenuti", "2 · Proposta"], ["inclusioni", "3 · Inclusioni"],
  ["faq", "4 · Domande e limiti"], ["chiusura", "5 · Chiusura"], ["azienda", "6 · Azienda e condizioni"],
] as const;

interface Props {
  moduleId: SerramentiTemplateModuleId;
  initial: Partial<SrTemplatePdfRow>;
  saved: boolean;
  onSave: (template: Partial<SrTemplatePdfRow>) => void;
  onDirtyChange: (dirty: boolean) => void;
}

/** Deliberately no mutation hooks or cloud uploads: this editor owns only a local draft. */
export function SerramentiLocalModuleEditor({ moduleId, initial, saved, onSave, onDirtyChange }: Props) {
  const [form, setForm] = useState(initial);
  const [dirty, setDirty] = useState(!saved);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [params, setParams] = useSearchParams();
  const section = sections.some(s => s[0] === params.get("section")) ? params.get("section")! : "page_cover";
  const module = findSerramentiTemplateModule(moduleId)!;
  useBeforeUnload(dirty);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  const update = <K extends keyof SrTemplatePdfRow>(key: K, value: SrTemplatePdfRow[K]) => { setForm(f => ({ ...f, [key]: value })); setDirty(true); setError(""); };
  const text = (key: keyof SrTemplatePdfRow, label: string, multiline = false, maxLength = 350) => <label className="block space-y-1.5 text-sm"><span className="font-medium">{label}</span>{multiline
    ? <Textarea value={String(form[key] ?? "")} maxLength={maxLength} rows={3} onChange={e => update(key, e.target.value)} />
    : <Input value={String(form[key] ?? "")} maxLength={maxLength} onChange={e => update(key, e.target.value)} />}</label>;
  const list = (key: "incluso_default" | "perche_noi_default" | "pdf_cta_finale_passi", label: string, limit: number) => <fieldset className="space-y-2"><legend className="mb-2 text-sm font-medium">{label}</legend>{(form[key] ?? []).map((value, i) => <div key={i} className="flex gap-2"><Input aria-label={`${label} ${i + 1}`} value={value} maxLength={160} onChange={e => update(key, (form[key] ?? []).map((v, j) => j === i ? e.target.value : v))} /><Button size="sm" variant="ghost" aria-label={`Rimuovi ${label} ${i + 1}`} onClick={() => update(key, (form[key] ?? []).filter((_, j) => j !== i))}>×</Button></div>)}<Button size="sm" variant="outline" disabled={(form[key]?.length ?? 0) >= limit} onClick={() => update(key, [...(form[key] ?? []), ""])}>Aggiungi voce</Button><p className="text-xs text-muted-foreground">Fino a {limit} voci, per mantenere il PDF leggibile.</p></fieldset>;
  const paired = (key: "esigenze_default" | "soluzione_default", label: string, limit: number) => <fieldset className="space-y-3"><legend className="text-sm font-medium">{label}</legend>{(form[key] ?? []).map((value, i) => <div key={i} className="space-y-2 rounded-lg border p-3"><Input aria-label={`${label}: titolo ${i + 1}`} value={value.titolo} maxLength={100} onChange={e => update(key, (form[key] ?? []).map((v, j) => j === i ? { ...v, titolo: e.target.value } : v))} /><Textarea aria-label={`${label}: descrizione ${i + 1}`} value={value.descrizione} maxLength={250} placeholder="Dettaglio facoltativo" onChange={e => update(key, (form[key] ?? []).map((v, j) => j === i ? { ...v, descrizione: e.target.value } : v))} /><Button size="sm" variant="ghost" onClick={() => update(key, (form[key] ?? []).filter((_, j) => j !== i))}>Rimuovi voce {i + 1}</Button></div>)}<Button size="sm" variant="outline" disabled={(form[key]?.length ?? 0) >= limit} onClick={() => update(key, [...(form[key] ?? []), { titolo: "", descrizione: "" }])}>Aggiungi {label.toLowerCase()}</Button></fieldset>;
  const save = () => {
    if (!form.pdf_cover_hero?.trim()) { setError("Inserisci un titolo di copertina."); return; }
    if (form.condizioni_legali_attivo && !form.condizioni_legali_testo?.trim()) { setError("Scrivi le condizioni oppure disattiva la relativa pagina."); return; }
    try { onSave(form); setDirty(false); setError(""); toast.success("Modello salvato"); }
    catch (err) { setError(err instanceof Error ? err.message : "Salvataggio non riuscito."); }
  };
  const upload = async (file: File | undefined, key: "pdf_cover_image_url" | "logo_url") => {
    if (!file) return;
    setUploading(true);
    try { update(key, await readLocalTemplateImage(file)); }
    catch (err) { setError(err instanceof Error ? err.message : "Immagine non leggibile."); }
    finally { setUploading(false); }
  };
  return <div data-serramenti-local-editor className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background p-3"><p role="status" className="text-sm">{dirty ? "Modifiche da salvare" : "Salvato"}</p><Button disabled={uploading || !dirty} onClick={save}>Salva modello</Button></div>
    {error && <p role="alert" className="rounded-lg border border-red-200 p-3 text-sm text-red-700">{error}</p>}
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(390px,0.85fr)]">
      <div className="min-w-0 space-y-4"><nav aria-label="Sezioni del modulo" className="flex flex-wrap gap-2">{sections.map(([id, label]) => <Button key={id} size="sm" variant={id === section ? "default" : "outline"} aria-current={id === section ? "page" : undefined} onClick={() => { const next = new URLSearchParams(params); next.set("section", id); setParams(next, { replace: true }); }}>{label}</Button>)}</nav>
        <div className="space-y-5 rounded-xl border bg-background p-5">
          {section === "page_cover" && <>{text("pdf_cover_eyebrow", "Occhiello", false, 60)}{text("pdf_cover_hero", "Titolo di copertina", false, 100)}{text("pdf_cover_subhero", "Sottotitolo", true, 220)}
            <fieldset className="space-y-2"><legend className="text-sm font-medium">Spunti per il sottotitolo</legend>{[module.subtitle, `Una proposta chiara per ${module.title.toLowerCase()}: prodotti, dettagli e lavorazioni.`, "Dalle tue esigenze alla soluzione: scelte definite insieme, costi descritti per iscritto."].map(value => <button key={value} type="button" className="block w-full rounded-lg border p-3 text-left text-sm hover:bg-muted" onClick={() => update("pdf_cover_subhero", value)}>{value}</button>)}</fieldset>
            <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Colore copertina<Input type="color" value={form.pdf_cover_bg_color ?? module.color} onChange={e => update("pdf_cover_bg_color", e.target.value)} /></label><label className="text-sm">Colore delle pagine<Input type="color" value={form.colore_primario ?? module.color} onChange={e => update("colore_primario", e.target.value)} /></label></div>
            <label className="block space-y-2 text-sm"><span>Foto di copertina · PNG, JPG o WebP, massimo 1 MB</span><Input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={e => { void upload(e.target.files?.[0], "pdf_cover_image_url"); e.target.value = ""; }} /></label>
            {form.pdf_cover_image_url && <Button variant="outline" size="sm" onClick={() => update("pdf_cover_image_url", null)}>Rimuovi foto</Button>}<p className="text-xs text-muted-foreground">Senza foto, il PDF usa una copertina tipografica.</p>
          </>}
          {section === "contenuti" && <>{paired("esigenze_default", "Esigenze", 3)}{paired("soluzione_default", "Soluzione", 4)}{list("perche_noi_default", "Punti di valore", 4)}</>}
          {section === "inclusioni" && <><p className="text-sm text-muted-foreground">Testi di partenza: nel preventivo finale devono corrispondere alle voci effettivamente quotate.</p>{list("incluso_default", "Lavorazioni incluse", 6)}</>}
          {section === "faq" && <><p className="text-sm text-muted-foreground">Le esclusioni sono riportate nella domanda “Cosa non è compreso?”. Mantienile esplicite.</p>{(form.faq_items ?? []).map((faq, i) => <div key={i} className="space-y-2 rounded-lg border p-3"><Input aria-label={`Domanda ${i + 1}`} value={faq.domanda} maxLength={120} onChange={e => update("faq_items", (form.faq_items ?? []).map((v, j) => j === i ? { ...v, domanda: e.target.value } : v))} /><Textarea aria-label={`Risposta ${i + 1}`} value={faq.risposta} maxLength={450} rows={4} onChange={e => update("faq_items", (form.faq_items ?? []).map((v, j) => j === i ? { ...v, risposta: e.target.value } : v))} /><Button variant="ghost" size="sm" onClick={() => update("faq_items", (form.faq_items ?? []).filter((_, j) => j !== i))}>Rimuovi domanda {i + 1}</Button></div>)}<Button variant="outline" disabled={(form.faq_items?.length ?? 0) >= 6} onClick={() => update("faq_items", [...(form.faq_items ?? []), { domanda: "", risposta: "" }])}>Aggiungi domanda</Button></>}
          {section === "chiusura" && <>{text("pdf_cta_finale_titolo", "Titolo conclusivo", false, 100)}{list("pdf_cta_finale_passi", "Prossimi passi", 3)}</>}
          {section === "azienda" && <>{text("ragione_sociale", "Ragione sociale")}{text("indirizzo_completo", "Indirizzo")}{text("telefono", "Telefono")}{text("email", "Email")}{text("partita_iva", "Partita IVA")}
            <label className="block space-y-2 text-sm"><span>Logo locale · massimo 1 MB</span><Input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={e => { void upload(e.target.files?.[0], "logo_url"); e.target.value = ""; }} /></label>{form.logo_url && <Button size="sm" variant="outline" onClick={() => update("logo_url", null)}>Rimuovi logo</Button>}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!form.condizioni_legali_attivo} onChange={e => { const visible = e.target.checked; update("condizioni_legali_attivo", visible); update("pdf_pages_order", (form.pdf_pages_order ?? []).map(p => p.id === "condizioni" ? { ...p, visible } : p)); }} />Allega le condizioni aziendali</label>
            {text("condizioni_legali_testo", "Condizioni da verificare per questa fornitura", true, 12000)}<p className="text-xs text-muted-foreground">Non vengono inserite clausole o garanzie inventate. Prima dell'uso commerciale completa e verifica le condizioni applicabili.</p>
          </>}
        </div>
        <details className="rounded-xl border p-4"><summary className="cursor-pointer text-sm font-medium">Pagine del PDF</summary><p className="my-3 text-xs text-muted-foreground">Copertina, proposta, dettaglio prodotti e investimento compongono la base. Le condizioni si gestiscono nella sezione Azienda.</p>{(form.pdf_pages_order ?? []).filter(p => ["proposta", "allegato_tecnico", "investimento", "faq", "cta"].includes(p.id)).map(p => <label key={p.id} className="my-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={p.visible} disabled={SR_PDF_PAGES_META.find(meta => meta.id === p.id)?.obbligatoria} onChange={e => update("pdf_pages_order", (form.pdf_pages_order ?? []).map(v => v.id === p.id ? { ...v, visible: e.target.checked } : v))} />{SR_PDF_PAGES_META.find(meta => meta.id === p.id)?.label}</label>)}</details>
      </div>
      <aside className="min-w-0 space-y-2 xl:sticky xl:top-4"><p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-950">Anteprima dimostrativa: prodotti e importi di esempio, non un preventivo da inviare. Controlla tutte le pagine prima di salvare.</p><SerramentiLivePreviewPanel moduleId={moduleId} template={form} companyName={form.ragione_sociale} companyLogoUrl={form.logo_url} companyIndirizzo={form.indirizzo_completo} activeSection={section === "page_cover" ? "cover" : section === "chiusura" ? "cta" : null} /></aside>
    </div>
  </div>;
}
