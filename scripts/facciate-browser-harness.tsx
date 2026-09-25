/** Standalone local QA entry, never imported by the app or its routes. */
import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, useSearchParams } from "react-router-dom";
import { FacciateModuleTemplatePanel } from "../src/components/facciate/FacciateModuleTemplatePanel";
import { isFullFacModuleId } from "../src/lib/moduli-vendita/fullFacModules";
import "../src/index.css";

function Harness() {
  const [params] = useSearchParams(), id = params.get("modello");
  return <main className="p-6"><nav className="mb-4 flex gap-4"><Link to="?area=facciate">Sidebar elenco</Link><Link to="?area=facciate&modello=cappotto">Apri cappotto</Link><Link to="?area=facciate&modello=balconi">Apri balconi</Link><Link to="?designer=1">Designer esterno</Link></nav>
    {id && isFullFacModuleId(id) ? <FacciateModuleTemplatePanel companyId="qa-browser" moduleId={id} branding={{ ragione_sociale: "Impresa QA locale" }} /> : <p>Elenco moduli</p>}
  </main>;
}
createRoot(document.getElementById("root")!).render(<BrowserRouter><Harness /></BrowserRouter>);
