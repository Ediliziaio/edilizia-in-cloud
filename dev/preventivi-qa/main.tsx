import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "../../src/index.css";
import { FvLivePreviewPanel } from "../../src/components/fotovoltaico/FvLivePreviewPanel";
import { SerramentiLivePreviewPanel } from "../../src/components/serramenti/SerramentiLivePreviewPanel";
import { createFullFvTemplate, FULL_FV_MODULES } from "../../src/lib/moduli-vendita/fullFvModules";
import { createFullSerramentiTemplate, FULL_SERRAMENTI_MODULES } from "../../src/lib/moduli-vendita/fullSerramentiModules";
import type { FullFvModuleId } from "../../src/lib/moduli-vendita/fullFvModules";
import type { SerramentiTemplateModuleId } from "../../src/lib/moduli-vendita/serramentiTemplateModules";

function Qa() {
  const [scelta, setScelta] = useState("fv-nuovo");
  const modello = scelta.slice(3);
  const fv = scelta.startsWith("fv-");
  const template = useMemo(() => fv ? createFullFvTemplate({} as never, "qa", modello as FullFvModuleId) : createFullSerramentiTemplate({ company_id: "qa", ragione_sociale: "Impresa QA" }, modello as SerramentiTemplateModuleId), [fv, modello]);
  return <main className="flex h-dvh flex-col bg-white">
    <header className="flex flex-wrap items-center gap-3 border-b p-3"><h1 className="text-base font-semibold">Layout originali QA</h1>
      <select aria-label="Modello" value={scelta} onChange={e => setScelta(e.target.value)} className="rounded border p-2">
        {FULL_FV_MODULES.map(id => <option key={id} value={`fv-${id}`}>Fotovoltaico: {id}</option>)}
        {FULL_SERRAMENTI_MODULES.map(id => <option key={id} value={`sr-${id}`}>Serramenti: {id}</option>)}
      </select>
    </header>
    <section className="min-h-0 flex-1 p-2">{fv ? <FvLivePreviewPanel form={template} companyName="Impresa QA" activeSection="page_cover" /> : <SerramentiLivePreviewPanel moduleId={modello as SerramentiTemplateModuleId} template={template} companyName="Impresa QA" activeSection="page_cover" />}</section>
  </main>;
}
if (import.meta.env.DEV) createRoot(document.getElementById("root")!).render(<Qa />);
