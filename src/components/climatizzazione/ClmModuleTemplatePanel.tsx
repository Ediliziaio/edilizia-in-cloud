import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useClmTemplatePdf } from "@/hooks/useClimatizzazioneProgetto";
import { ClimatizzazioneTemplateEditor } from "./ClimatizzazioneTemplateEditor";
import type { ClmTemplatePdf } from "@/types/climatizzazione";
import { createFullClmTemplate, CLM_MODULE_TITLES, type FullClmModuleId } from "@/lib/moduli-vendita/fullClmModules";
import { loadLocalClmTemplate, saveLocalClmTemplate } from "@/lib/moduli-vendita/localClmTemplates";

export function ClmModuleTemplatePanel({ moduleId }: { moduleId: FullClmModuleId }) {
  const companyId = useEffectiveCompanyId();
  const { data: base, isLoading, isError } = useClmTemplatePdf();
  if (!companyId || isLoading) return <p role="status">Caricamento modello Climatizzazione…</p>;
  if (isError || !base) return <p role="alert">Impossibile leggere il modello aziendale. Riprova prima di preparare la copia.</p>;
  return <Workspace key={`${companyId}:${moduleId}`} companyId={companyId} moduleId={moduleId} base={base} />;
}
function Workspace({ companyId, moduleId, base }: { companyId: string; moduleId: FullClmModuleId; base: ClmTemplatePdf }) {
  const [params, setParams] = useSearchParams();
  const [initial] = useState(() => {
    try { const record = loadLocalClmTemplate(companyId, moduleId); return { record, template: record?.template ?? createFullClmTemplate(base, moduleId), error: "" }; }
    catch (error) { return { record: null, template: null, error: String(error) }; }
  });
  const revision = useRef(initial.record?.savedAt ?? null);
  const dirtyRef = useRef(false);
  const [leaveTarget, setLeaveTarget] = useState<HTMLElement | null>(null);
  const onDirtyChange = useCallback((value: boolean) => { dirtyRef.current = value; }, []);
  useEffect(() => {
    const guard = (event: MouseEvent) => {
      const el = event.target instanceof Element ? event.target : null;
      if (el?.closest('[role="dialog"], [role="alertdialog"], [data-radix-popper-content-wrapper]')) return;
      if (!dirtyRef.current || !el?.closest("a,button,[role=tab]") || el.closest("[data-clm-module-editor]")) return;
      const target = el.closest<HTMLElement>("a,button,[role=tab]");
      if (!target) return;
      event.preventDefault(); event.stopPropagation();
      setLeaveTarget(target);
    };
    document.addEventListener("click", guard, true);
    return () => { document.removeEventListener("click", guard, true); };
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
    <AlertDialog open={!!leaveTarget} onOpenChange={open => { if (!open) setLeaveTarget(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>Uscire senza salvare?</AlertDialogTitle><AlertDialogDescription>Le modifiche non salvate di questo modulo andranno perse. La copia salvata e il modello online resteranno invariati.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Resta nel modulo</AlertDialogCancel><AlertDialogAction onClick={() => { const target = leaveTarget; setLeaveTarget(null); dirtyRef.current = false; target?.click(); }}>Esci senza salvare</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <div className="flex flex-wrap justify-between gap-2"><Button variant="outline" onClick={() => navigate(false)}>← Moduli Climatizzazione</Button><Button variant="ghost" onClick={() => navigate(true)}>Apri la bozza precedente</Button></div>
    <div><p className="text-xs font-semibold uppercase tracking-wider text-orange-700">Area Climatizzazione · Modulo PDF</p><h2 className="text-2xl font-semibold">{CLM_MODULE_TITLES[moduleId]}</h2><p className="text-sm text-muted-foreground">Le pagine del modello originale, con testi e immagini dedicati a questo intervento.</p></div>
    <p className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-950"><strong>Modello dell'azienda.</strong> Testi, immagini e impostazioni si salvano online e li vedono tutti i colleghi. Quando crei un preventivo con questo intervento, il PDF usa questo modello. La bozza precedente e il template aziendale restano invariati.</p>
    <div data-clm-module-editor><ClimatizzazioneTemplateEditor embedded localModule={{ id: moduleId, template: initial.template, saved: !!initial.record, onDirtyChange,
      save: template => { revision.current = saveLocalClmTemplate(companyId, moduleId, template, revision.current).savedAt; },
    }} /></div>
  </section>;
}
