import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, FileText, Monitor, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/usePermissions";
import { useEffectiveCompanyId, useTetTemplatePdf } from "@/hooks/useTettiProgetto";
import { TettiTemplateEditor } from "./TettiTemplateEditor";
import { TETTI_TEMPLATE_MODULES, findTettiTemplateModule, type TettiTemplateModuleId } from "@/lib/moduli-vendita/tettiTemplateModules";
import { createFullTettiTemplate, FULL_TETTI_MODULES, isFullTettiTemplate, upgradeTettiModuleTemplate } from "@/lib/moduli-vendita/fullTettiModules";
import { loadLocalTettiTemplate, saveLocalTettiTemplate, type LocalTettiTemplate } from "@/lib/moduli-vendita/localTettiTemplates";
import type { TetTemplatePdf } from "@/types/tetti";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function TettiModuleTemplatesPanel() {
  const t = useT();
  const companyId = useEffectiveCompanyId();
  const { data: base, isLoading, isError } = useTetTemplatePdf();
  if (!companyId || isLoading) return <p role="status">{t("Caricamento modelli Tetti…")}</p>;
  if (isError || !base) return <p role="alert">{t("Impossibile leggere il modello aziendale. Riprova prima di creare copie.")}</p>;
  return <TettiModulesWorkspace key={companyId} companyId={companyId} base={base} />;
}

function TettiModulesWorkspace({ companyId, base }: { companyId: string; base: TetTemplatePdf }) {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const permissions = usePermissions();
  const canEdit = permissions.canEditSettingsPricing;
  const dirtyRef = useRef(false);
  const onDirtyChange = useCallback((dirty: boolean) => { dirtyRef.current = dirty; }, []);
  const selected = params.get("modello");
  const module = findTettiTemplateModule(selected);

  // Protect navigation through the surrounding settings/sidebar too, not only our back button.
  useEffect(() => {
    const guard = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent && !["Enter", " ", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
      const element = event.target instanceof Element ? event.target : null;
      if (element?.closest('[role="dialog"], [role="alertdialog"], [data-radix-popper-content-wrapper]')) return;
      if (!dirtyRef.current || !element?.closest("a,button,[role=tab]") || element.closest("[data-tetti-module-editor]")) return;
      if (!window.confirm(t("Ci sono modifiche non salvate nel modulo. Vuoi uscire senza salvarle?"))) {
        event.preventDefault(); event.stopPropagation();
      } else dirtyRef.current = false;
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
    if (dirtyRef.current && !window.confirm(t("Vuoi uscire senza salvare le modifiche al modulo?"))) return;
    dirtyRef.current = false;
    const next = new URLSearchParams(params);
    if (id) { next.set("modello", id); next.set("section", "page_cover"); }
    else { next.delete("modello"); next.delete("section"); }
    setParams(next);
  };
  const notice = <div className="flex gap-2 rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs leading-relaxed text-sky-950">
    <Monitor className="mt-0.5 h-4 w-4 shrink-0" />
    <p><strong>{t("Modelli dell'azienda.")}</strong> {t("Si salvano online e li vedono tutti i colleghi. Quando si crea un preventivo Tetti con uno di questi interventi, il PDF usa il modello personalizzato. Il template aziendale resta invariato.")}</p>
  </div>;
  if (selected) return <div className="space-y-4">
    <Button variant="outline" size="sm" onClick={() => open(null)}><ArrowLeft className="mr-2 h-4 w-4" />{t("Tutti i moduli Tetti")}</Button>
    {selected === "generale" ? <>
      <div><h2 className="text-xl font-semibold">{t("Template generale Tetti")}</h2><p className="text-sm text-muted-foreground">{t("Modello aziendale esistente: il suo salvataggio aggiorna il template online.")}</p></div>
      {canEdit ? <TettiTemplateEditor key={companyId + ":generale"} embedded /> : <p>{t("Non hai i permessi per modificare il modello aziendale.")}</p>}
    </> : !module ? <p role="alert">{t("Modulo non riconosciuto. Torna all'elenco per scegliere un modello.")}</p> : <>
      <div><p className="text-xs font-semibold uppercase tracking-wider text-orange-700">{t("Area Tetti / Modulo PDF")}</p><h2 className="mt-1 text-2xl font-semibold">{module.title}</h2><p className="mt-1 text-sm text-muted-foreground">{module.summary}</p></div>
      {notice}
      {canEdit ? <LocalModuleEditor key={companyId + ":" + module.id} companyId={companyId} moduleId={module.id} base={base} onDirtyChange={onDirtyChange} /> : <p>{t("Non hai i permessi per configurare i moduli.")}</p>}
    </>}
  </div>;
  return <section className="space-y-5">
    <div><p className="text-xs font-semibold uppercase tracking-wider text-orange-700">{t("Area Tetti")}</p><h2 className="mt-1 text-2xl font-semibold">{t("Un modulo per ogni intervento")}</h2><p className="mt-2 text-sm text-muted-foreground">{t("Scegli il modello, personalizza le sue pagine e controlla l'anteprima PDF. Ogni modulo conserva testi e impostazioni propri.")}</p></div>
    {notice}
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {TETTI_TEMPLATE_MODULES.map((item, index) => {
        let saved: LocalTettiTemplate | null = null;
        let error = false;
        try { saved = loadLocalTettiTemplate(companyId, item.id); } catch { error = true; }
        return <article key={item.id} className="flex flex-col rounded-xl border bg-background p-5">
          <div className="mb-4 flex items-center justify-between gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-50 text-sm font-semibold text-orange-700">{String(index + 1).padStart(2, "0")}</span><span className={"text-xs " + (error ? "text-red-700" : saved ? "text-emerald-700" : "text-muted-foreground")}>{error ? t("Modello da verificare") : saved ? t("Salvato") : t("Pronto da personalizzare")}</span></div>
          <h3 className="text-base font-semibold">{item.title}</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.summary}</p>
          <p className="mb-4 mt-3 flex items-center gap-1.5 text-xs text-muted-foreground"><CheckCircle2 className="h-3.5 w-3.5" />{t("Copertina, testi, esclusioni e FAQ dedicati")}</p>
          <Button aria-label={t("Configura {title}", { title: String(item.title ?? "") })} className="mt-auto w-full justify-between" variant={saved ? "outline" : "default"} disabled={!canEdit} onClick={() => open(item.id)}>{t("Configura modulo")}<ArrowRight className="ml-2 h-4 w-4 shrink-0" /></Button>
        </article>;
      })}
    </div>
    <div className="flex flex-col justify-between gap-3 rounded-xl border bg-muted/20 p-4 sm:flex-row sm:items-center">
      <div className="flex gap-3"><FileText className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" /><div><h3 className="text-sm font-semibold">{t("Template generale esistente")}</h3><p className="mt-1 text-xs text-muted-foreground">{t("È ancora quello usato dal preventivatore Tetti. Non viene sostituito dai nuovi moduli locali.")}</p></div></div>
      <Button variant="outline" size="sm" onClick={() => open("generale")}>{t("Apri template generale")}</Button>
    </div>
  </section>;
}

function LocalModuleEditor({ companyId, moduleId, base, onDirtyChange }: {
  companyId: string; moduleId: TettiTemplateModuleId; base: TetTemplatePdf; onDirtyChange: (dirty: boolean) => void;
}) {
  const t = useT();
  const [initial] = useState<{ record: LocalTettiTemplate | null; template: TetTemplatePdf | null; error: string | null }>(() => {
    try {
      const record = loadLocalTettiTemplate(companyId, moduleId);
      return { record, template: record?.template ?? createFullTettiTemplate(base, moduleId), error: null };
    } catch (error) { return { record: null, template: null, error: error instanceof Error ? error.message : t("Modello non leggibile.") }; }
  });
  const revision = useRef(initial.record?.savedAt ?? null);
  const [upgraded, setUpgraded] = useState<TetTemplatePdf | null>(null);
  const [dirty, setDirty] = useState(false);
  const reportDirty = useCallback((value: boolean) => { setDirty(value); onDirtyChange(value); }, [onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  if (!initial.template) return <p role="alert" className="rounded-lg border border-red-200 p-4 text-sm text-red-700">{initial.error}</p>;
  const current = upgraded ?? initial.template;
  const canUpgrade = FULL_TETTI_MODULES.includes(moduleId) && !isFullTettiTemplate(current);
  return <div data-tetti-module-editor>
    {canUpgrade && <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
      <p className="max-w-2xl">{t("Questa è la tua copia precedente. Puoi preparare l'edizione completa con le pagine del modello originale: i contenuti personalizzati vengono conservati.")} {dirty && t("Salva prima le modifiche e riapri il modulo per aggiornare la copia salvata.")}</p>
      <Button variant="outline" disabled={dirty} onClick={() => setUpgraded(upgradeTettiModuleTemplate(current, base, moduleId))}>{t("Prepara edizione completa")}</Button>
    </div>}
    <TettiTemplateEditor key={upgraded ? "full" : "saved"} embedded localModule={{
      id: moduleId, template: current, saved: !!initial.record && !upgraded, onDirtyChange: reportDirty,
      save: template => {
        const record = saveLocalTettiTemplate(companyId, moduleId, template, revision.current);
        revision.current = record.savedAt;
      },
    }} />
  </div>;
}
