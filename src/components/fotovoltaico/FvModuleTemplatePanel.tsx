import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useTemplatePdf } from "@/lib/fotovoltaico/queries";
import { FotovoltaicoTemplateEditor, type FvTemplate } from "./FotovoltaicoTemplateEditor";
import { createFullFvTemplate, fvModuleTitle, type FullFvModuleId } from "@/lib/moduli-vendita/fullFvModules";
import { loadLocalFvTemplate, saveLocalFvTemplate } from "@/lib/moduli-vendita/localFvTemplates";

export function FvModuleTemplatePanel({ moduleId }: { moduleId: FullFvModuleId }) {
  const companyId = useEffectiveCompanyId();
  const { data: base, isLoading, isError } = useTemplatePdf();
  if (!companyId || isLoading) return <p role="status">Caricamento modello Fotovoltaico…</p>;
  if (isError) return <p role="alert">Impossibile leggere il modello aziendale. Riprova prima di preparare la copia.</p>;
  return <Workspace key={`${companyId}:${moduleId}`} companyId={companyId} moduleId={moduleId} base={(base ?? {}) as FvTemplate} />;
}
function Workspace({ companyId, moduleId, base }: { companyId: string; moduleId: FullFvModuleId; base: FvTemplate }) {
  const [params, setParams] = useSearchParams();
  const [initial] = useState(() => {
    try { const record = loadLocalFvTemplate(companyId, moduleId); return { record, template: record?.template ?? createFullFvTemplate(base, companyId, moduleId), error: "" }; }
    catch (error) { return { record: null, template: null, error: String(error) }; }
  });
  const revision = useRef(initial.record?.savedAt ?? null);
  const dirtyRef = useRef(false);
  const onDirtyChange = useCallback((value: boolean) => { dirtyRef.current = value; }, []);
  useEffect(() => {
    const guard = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent && !["Enter", " ", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
      const el = event.target instanceof Element ? event.target : null;
      if (el?.closest('[role="dialog"], [role="alertdialog"], [data-radix-popper-content-wrapper]')) return;
      if (!dirtyRef.current || !el?.closest("a,button,[role=tab]") || el.closest("[data-fv-module-editor]")) return;
      if (!window.confirm("Uscire senza salvare le modifiche al modulo?")) { event.preventDefault(); event.stopPropagation(); }
      else dirtyRef.current = false;
    };
    document.addEventListener("click", guard, true);
    document.addEventListener("pointerdown", guard, true);
    document.addEventListener("keydown", guard, true);
    return () => { document.removeEventListener("click", guard, true); document.removeEventListener("pointerdown", guard, true); document.removeEventListener("keydown", guard, true); };
  }, []);
  const navigate = (previous: boolean) => {
    const next = new URLSearchParams(params);
    next.delete("section");
    if (previous) next.set("edizione", "precedente");
    else { next.delete("modello"); next.delete("edizione"); }
    setParams(next);
  };
  if (!initial.template) return <p role="alert">{initial.error}</p>;
  return <section className="space-y-4">
    <div className="flex flex-wrap justify-between gap-2"><Button variant="outline" onClick={() => navigate(false)}>← Moduli Fotovoltaico</Button><Button variant="ghost" onClick={() => navigate(true)}>Apri la bozza precedente</Button></div>
    <div><p className="text-xs font-semibold uppercase tracking-wider text-orange-700">Area Fotovoltaico</p><h2 className="text-2xl font-semibold">{fvModuleTitle(moduleId)}</h2><p className="text-sm text-muted-foreground">Le pagine del modello originale, con contenuti dedicati a questo intervento.</p></div>
    <p className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-950"><strong>Modello dell'azienda.</strong> Testi, immagini e impostazioni si salvano online e li vedono tutti i colleghi. Quando crei un preventivo con questo intervento, il PDF usa questo modello. La bozza precedente e il template aziendale restano invariati.</p>
    <div data-fv-module-editor><FotovoltaicoTemplateEditor embedded localModule={{ id: moduleId, template: initial.template, saved: !!initial.record, onDirtyChange,
      save: template => { revision.current = saveLocalFvTemplate(companyId, moduleId, template, revision.current).savedAt; },
    }} /></div>
  </section>;
}
