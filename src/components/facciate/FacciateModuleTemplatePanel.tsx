import { useCallback, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { createFullFacTemplate, FAC_MODULE_TITLES, isFullFacModuleId, type FacBranding, type FullFacModuleId } from "@/lib/moduli-vendita/fullFacModules";
import { loadLocalFacTemplate, localFacTemplateKey, saveLocalFacTemplate } from "@/lib/moduli-vendita/localFacTemplates";
import { FacciateTemplateEditor } from "./FacciateTemplateEditor";
import { getFacDraft } from "./facDraftRecovery";

export interface FacciateModuleTemplatePanelProps {
  moduleId: FullFacModuleId;
  companyId: string;
  /** Optional snapshot supplied by the host from an already-read Rst template. No read/write hook here. */
  branding?: FacBranding;
  onDirtyChange?: (dirty: boolean) => void;
}

export function FacciateModuleTemplatePanel(props: FacciateModuleTemplatePanelProps) {
  if (!props.companyId?.trim() || !isFullFacModuleId(props.moduleId)) return <p role="alert">Seleziona un'azienda e un modulo Facciate valido.</p>;
  if (props.branding?.company_id && props.branding.company_id !== props.companyId) return <p role="alert">Il modello aziendale appartiene a un'altra azienda. Attendi il caricamento dei dati corretti.</p>;
  return <Workspace key={`${props.companyId}:${props.moduleId}`} {...props} />;
}

function Workspace({ companyId, moduleId, branding, onDirtyChange }: FacciateModuleTemplatePanelProps) {
  const [params, setParams] = useSearchParams();
  const [initial] = useState(() => {
    try {
      const draft = getFacDraft(companyId, moduleId);
      if (draft) return { record: draft.revision ? { savedAt: draft.revision } : null, template: draft.template, error: "" };
      const record = loadLocalFacTemplate(companyId, moduleId);
      return { record, template: record?.template ?? createFullFacTemplate({ ...branding, company_id: companyId }, moduleId), error: "" };
    } catch (e) { return { record: null, template: null, error: e instanceof Error ? e.message : String(e) }; }
  });
  const revision = useRef(initial.record?.savedAt ?? null);
  const dirty = useCallback((value: boolean) => onDirtyChange?.(value), [onDirtyChange]);
  if (!initial.template) return <p role="alert">{initial.error}</p>;
  const remoteLogo = [branding?.logo_url, branding?.cover_logo_url].some(url => url && /^https?:/.test(url));
  return <section className="space-y-4">
    <Button variant="outline" onClick={() => { const next = new URLSearchParams(params); next.delete("modello"); next.delete("section"); next.delete("edizione"); setParams(next); }}>← Moduli Facciate</Button>
    <header><p className="text-xs uppercase tracking-wider text-emerald-800">Facciate e isolamento · Modello PDF</p><h2 className="text-2xl font-semibold">{FAC_MODULE_TITLES[moduleId]}</h2></header>
    <p className="rounded border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950">Modello dell'azienda: testi, immagini e impostazioni si salvano online e li vedono tutti i colleghi. Il PDF usa le pagine originali del Piano dei lavori e prezzi dimostrativi; il collegamento al preventivatore è ancora da attivare.</p>
    {remoteLogo && <p className="text-xs text-muted-foreground">I loghi online non vengono scaricati: puoi caricarne uno nel modello, in Azienda e stile o Copertina.</p>}
    <FacciateTemplateEditor moduleId={moduleId} template={initial.template} saved={!!initial.record} getRevision={() => revision.current} onDirtyChange={dirty} save={async template => {
      const commit = () => { revision.current = saveLocalFacTemplate(companyId, moduleId, template, revision.current).savedAt; };
      if (typeof navigator !== "undefined" && navigator.locks) await navigator.locks.request(localFacTemplateKey(companyId, moduleId), commit);
      else commit();
    }} />
  </section>;
}

export default FacciateModuleTemplatePanel;
