import React,{useState} from "react";
import {createRoot} from "react-dom/client";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {Toaster} from "sonner";
import {TooltipProvider} from "@/components/ui/tooltip";
import {EmailConfigPanel} from "@/components/flow-builder/config-panels/EmailConfigPanel";
import "@/index.css";
const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
function App(){const[config,setConfig]=useState<Record<string,any>>({oggetto:"Conferma appuntamento",corpo:"<p>Ciao {{contatto.first_name}},</p><p>Questo è un collaudo locale.</p>"});return <QueryClientProvider client={client}><TooltipProvider><main className="mx-auto max-w-xl p-6"><h1 className="mb-2 text-xl font-semibold">Collaudo email locale</h1><p className="mb-6 rounded border border-amber-300 bg-amber-50 p-3 text-sm">Dati fittizi. Nessun collegamento al database. Invii reali disabilitati.</p><EmailConfigPanel config={config} companyId="test-company" triggerItemId="appuntamento_creato" onChange={(key,value)=>setConfig(c=>({...c,[key]:value}))} onPatch={patch=>setConfig(c=>({...c,...patch}))}/></main><Toaster/></TooltipProvider></QueryClientProvider>}
createRoot(document.getElementById("root")!).render(<App/>);
