import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, FileText, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/usePermissions";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useCompanyAnagraficaForTemplate } from "@/hooks/useCompanyAnagraficaForTemplate";
import { useTemplatePdf } from "@/lib/serramenti/queries";
import { SERRAMENTI_TEMPLATE_MODULES, findSerramentiTemplateModule, createSerramentiModuleTemplate, type SerramentiTemplateModuleId } from "@/lib/moduli-vendita/serramentiTemplateModules";
import { loadLocalSerramentiTemplate, saveLocalSerramentiTemplate } from "@/lib/moduli-vendita/localSerramentiTemplates";
import { refreshCombinatoVisuals } from "@/lib/moduli-vendita/serramentiVisualRefresh";
import type { SrTemplatePdfRow } from "@/types/serramenti";
import { SerramentiTemplateEditor } from "./SerramentiTemplateEditor";
import { SerramentiLocalModuleEditor } from "./SerramentiLocalModuleEditor";
import { createFullSerramentiTemplate, FULL_SERRAMENTI_MODULES, isFullSerramentiTemplate, upgradeSerramentiModuleTemplate } from "@/lib/moduli-vendita/fullSerramentiModules";

export function SerramentiModuleTemplatesPanel() {
  const companyId = useEffectiveCompanyId();
  const { data: template, isLoading, isError } = useTemplatePdf();
  const company = useCompanyAnagraficaForTemplate();
  if (!companyId || isLoading) return <p role="status">Caricamento moduli Serramenti…</p>;
  if (isError) return <p role="alert">Impossibile leggere il modello aziendale. Riprova prima di creare copie.</p>;
  const base: Partial<SrTemplatePdfRow> = { ...template, company_id: companyId };
  for (const field of ["ragione_sociale", "indirizzo_completo", "telefono", "email", "partita_iva"] as const) {
    base[field] = base[field] || company?.[field] || null;
  }
  return <Workspace key={companyId} companyId={companyId} base={base} />;
}

function Workspace({ companyId, base }: { companyId: string; base: Partial<SrTemplatePdfRow> }) {
  const [params, setParams] = useSearchParams();
  const { canEditSettingsPricing: canEdit } = usePermissions();
  const dirty = useRef(false);
  const onDirtyChange = useCallback((value: boolean) => { dirty.current = value; }, []);
  const selected = params.get("modello");
  const module = findSerramentiTemplateModule(selected);
  useEffect(() => {
    const guard = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent && !["Enter", " ", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('[role="dialog"], [role="alertdialog"], [data-radix-popper-content-wrapper]')) return;
      if (!dirty.current || !target?.closest("a,button,[role=tab]") || target.closest("[data-serramenti-local-editor]")) return;
      if (window.confirm("Uscire senza salvare le modifiche al modulo?")) dirty.current = false;
      else { event.preventDefault(); event.stopPropagation(); }
    };
    document.addEventListener("click", guard, true);
    document.addEventListener("pointerdown", guard, true);
    document.addEventListener("keydown", guard, true);
    return () => {
      document.removeEventListener("click", guard, true);
      document.removeEventListener("pointerdown", guard, true);
      document.removeEventListener("keydown", guard, true);
    };
  }, []);
  const open = (id: string | null) => {
    if (dirty.current && !window.confirm("Uscire senza salvare le modifiche al modulo?")) return;
    dirty.current = false;
    const next = new URLSearchParams(params);
    if (id) { next.set("modello", id); next.set("section", "page_cover"); }
    else { next.delete("modello"); next.delete("section"); }
    setParams(next);
  };
  const notice = <div className="flex gap-2 rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs leading-relaxed text-sky-950"><Monitor className="h-4 w-4 shrink-0" /><p><strong>Modelli dell'azienda.</strong> Si salvano online e li vedono tutti i colleghi. Finestre, persiane e intervento combinato si usano già quando si crea un preventivo Serramenti; gli altri interventi non sono ancora collegati al preventivatore. Il template aziendale resta invariato.</p></div>;
  if (selected) return <div className="space-y-4">
    <Button variant="outline" size="sm" onClick={() => open(null)}><ArrowLeft className="mr-2 h-4 w-4" />Tutti i moduli Serramenti</Button>
    {selected === "generale" ? <><p className="rounded-lg border p-3 text-sm">Template generale esistente: il suo salvataggio aggiorna il modello aziendale online.</p>{canEdit && <SerramentiTemplateEditor embedded />}</>
      : !module ? <p role="alert">Modulo non riconosciuto. Torna all'elenco.</p>
      : <><div><p className="text-xs font-semibold uppercase tracking-wider text-orange-700">Area Serramenti / Modulo PDF</p><h2 className="mt-1 text-2xl font-semibold">{module.title}</h2><p className="mt-1 text-sm text-muted-foreground">{module.summary}</p></div>{notice}
        {canEdit ? <LocalEditor key={companyId + ":" + module.id} companyId={companyId} moduleId={module.id} base={base} onDirtyChange={onDirtyChange} /> : <p>Non hai i permessi per configurare i moduli.</p>}</>}
  </div>;
  return <section className="space-y-5"><div><p className="text-xs font-semibold uppercase tracking-wider text-orange-700">Area Serramenti</p><h2 className="mt-1 text-2xl font-semibold">Scegli il modulo da preparare</h2><p className="mt-2 text-sm text-muted-foreground">Sette modelli distinti. Configura le pagine una volta, controlla il PDF e salva la tua versione.</p></div>{notice}
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{SERRAMENTI_TEMPLATE_MODULES.map((m, index) => {
      let status = "Pronto da personalizzare";
      const fullEdition = FULL_SERRAMENTI_MODULES.includes(m.id);
      let cover = fullEdition ? createFullSerramentiTemplate(base, m.id).pdf_cover_image_url : null;
      try {
        const record = loadLocalSerramentiTemplate(companyId, m.id);
        if (record) {
          status = fullEdition && !isFullSerramentiTemplate(record.template) ? "Aggiornamento completo disponibile" : "Salvato";
          // Explicit image removal must not be silently reversed in the catalog.
          if (isFullSerramentiTemplate(record.template)) cover = record.template.pdf_cover_image_url;
        }
      } catch { status = "Modello da verificare"; }
      return <article key={m.id} className="flex flex-col overflow-hidden rounded-xl border bg-background">
        <div className="relative flex h-36 items-end justify-between overflow-hidden p-4 text-white" style={{ backgroundColor: m.color }}>
          {cover && <img src={cover} alt={`Immagine illustrativa — ${m.title}`} loading="lazy" className="absolute inset-0 h-full w-full object-cover object-top" />}
          <div className="absolute inset-0 bg-gradient-to-t from-black/65 to-transparent" />
          <FileText className="relative h-6 w-6" /><span className="relative text-xs tracking-widest">MODULO {String(index + 1).padStart(2, "0")}</span>
        </div>
        <div className="flex flex-1 flex-col p-5">
          <span className={`w-fit rounded-full px-2 py-1 text-xs ${fullEdition ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>{fullEdition ? "Edizione PDF completa" : "Edizione essenziale · da completare"}</span>
          <h3 className="mt-3 font-semibold">{m.title}</h3><p className="mt-2 text-sm text-muted-foreground">{m.summary}</p>
          <p className="mb-4 mt-3 text-xs text-muted-foreground">{status}</p>
          <Button className="mt-auto justify-between" disabled={!canEdit} onClick={() => open(m.id)} aria-label={`Configura ${m.title}`}>Configura modulo<ArrowRight className="h-4 w-4" /></Button>
        </div>
      </article>;
    })}</div>
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/20 p-4"><div><h3 className="text-sm font-semibold">Template generale esistente</h3><p className="text-xs text-muted-foreground">Rimane quello usato dal preventivatore Serramenti.</p></div><Button variant="outline" onClick={() => open("generale")}>Apri template generale</Button></div>
  </section>;
}

function LocalEditor({ companyId, moduleId, base, onDirtyChange }: { companyId: string; moduleId: SerramentiTemplateModuleId; base: Partial<SrTemplatePdfRow>; onDirtyChange: (dirty: boolean) => void }) {
  const [initial] = useState(() => {
    try { const record = loadLocalSerramentiTemplate(companyId, moduleId); return { record, template: record?.template ?? createFullSerramentiTemplate(base, moduleId), error: null as string | null }; }
    catch (error) { return { record: null, template: null, error: error instanceof Error ? error.message : "Modello non leggibile." }; }
  });
  const revision = useRef(initial.record?.savedAt ?? null);
  const [upgraded, setUpgraded] = useState<Partial<SrTemplatePdfRow> | null>(null);
  const [editing, setEditing] = useState(false);
  const trackDirty = useCallback((value: boolean) => { setEditing(value); onDirtyChange(value); }, [onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  if (!initial.template) return <p role="alert">{initial.error}</p>;
  if (FULL_SERRAMENTI_MODULES.includes(moduleId)) {
    const current = upgraded ?? initial.template;
    const save = (template: Partial<SrTemplatePdfRow>) => {
      revision.current = saveLocalSerramentiTemplate(companyId, moduleId, template, revision.current).savedAt;
    };
    return <div data-serramenti-local-editor className="space-y-4">
      {moduleId === "combinato" && current.pdf_blocchi?.modulo_visual_revision !== 3 && initial.record && <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm">
        <p className="font-medium">Nuova veste grafica del Combinato</p>
        <p className="mt-1 text-muted-foreground">Copertina dedicata e immagini meno ripetitive. Aggiorna soltanto le immagini di serie riconosciute: testi e foto personalizzati restano invariati. Controlla l'anteprima prima di salvare.</p>
        <Button variant="outline" className="mt-3" disabled={editing} onClick={() => setUpgraded(refreshCombinatoVisuals(current))}>Prepara aggiornamento immagini</Button>
        {editing && <p className="mt-2">Salva prima le modifiche in corso.</p>}
      </div>}
      {!isFullSerramentiTemplate(current) && <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">
        <p>Questa è la tua copia precedente. Puoi aggiungere le sezioni complete del modello originale conservando i campi che hai personalizzato. Il salvataggio resta manuale.</p>
        {editing && <p className="mt-2">Salva le modifiche in corso prima di preparare l'edizione completa.</p>}
        <Button disabled={editing} className="mt-3" variant="outline" onClick={() => {
          setUpgraded(upgradeSerramentiModuleTemplate(current, base, moduleId));
        }}>Prepara edizione completa</Button>
      </div>}
      <SerramentiTemplateEditor key={upgraded ? "upgraded" : "existing"} embedded localModule={{ id: moduleId, template: current, saved: !!initial.record && !upgraded, onDirtyChange: trackDirty, save }} />
    </div>;
  }
  return <SerramentiLocalModuleEditor moduleId={moduleId} initial={initial.template} saved={!!initial.record} onDirtyChange={onDirtyChange} onSave={template => {
    revision.current = saveLocalSerramentiTemplate(companyId, moduleId, template, revision.current).savedAt;
  }} />;
}
