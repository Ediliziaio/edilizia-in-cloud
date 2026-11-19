import { useState, type ContextType } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { AuthContext } from "../../src/contexts/AuthContext";
import { OrderItemsList, type OrderItem } from "../../src/components/orders/OrderItemsList";
import { salvaPreparazioneForniture } from "../../src/lib/orders/salvaPreparazioneForniture";
import { Button } from "../../src/components/ui/button";
import { SimulazioneAcquisti } from "./SimulazioneAcquisti";
import "../../src/index.css";

if (import.meta.env.VITE_ARTICOLI_ISOLATI !== "true") throw new Error("Apri questa prova sulla porta locale 8098 con vite.articoli-local.config.ts: è il server con dati isolati.");
const auth = { effectiveCompany: { id: "articoli-demo-locale", name: "Azienda dimostrativa" }, user: { id: "utente-locale" }, role: "company_admin", isLoading: false } as ContextType<typeof AuthContext>;
const qc = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
function Preview() {
  const [items, setItems] = useState<OrderItem[]>([]);
  const [nonce, setNonce] = useState(1);
  const [costi, setCosti] = useState(true);
  return <main className="min-h-screen bg-slate-50 p-4 sm:p-8"><div className="mx-auto max-w-5xl space-y-4">
    <p className="text-sm font-semibold text-amber-800">Prova locale con dati simulati · Nessun collegamento al database del gestionale</p>
    <h1 className="text-2xl font-semibold">Preparazione degli articoli</h1>
    <div className="flex flex-wrap gap-2"><Button onClick={() => setNonce(n => n + 1)}>Apri preparazione</Button><Button variant="outline" onClick={() => setCosti(v => !v)}>Vista {costi ? "senza" : "con"} costi</Button><Button asChild variant="outline"><a href="/?simulazione=appartamento">Simulazione: ristrutturazione completa</a></Button></div>
    <output hidden data-testid="righe-demo">{JSON.stringify(items)}</output>
    <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={!items.length} onClick={() => setItems(rows=>rows.map((r,i)=>i===0?{...r,prezzo_fonte:"ordine",purchase_price:(r.purchase_price??0)+10,prezzo_da_definire:false}:r))}>Simula prezzo da ODA</Button><Button variant="outline" disabled={!items.length} onClick={() => setItems(rows=>rows.map((r,i)=>i===0?{...r,ddt_riga_origine_id:"ddt-simulato",purchase_price:(r.purchase_price??0)+5,prezzo_da_definire:false}:r))}>Simula prezzo da fattura e DDT</Button></div>
    <OrderItemsList items={items} onItemsChange={righe => setItems(righe.map(r => ({ ...r, id: r.id ?? crypto.randomUUID() })))} editable allowEdit canViewCosts={costi} fallbackCompanyId="articoli-demo-locale" vista="compatta"
      onSalvaForniture={async (righe,richiesta) => { const ids=await salvaPreparazioneForniture("commessa-demo-locale",righe,richiesta);setItems(prima=>[...prima,...righe.map((r,i)=>({...r,id:ids[i]}))]); }}
      onItemUpdate={r => setItems(prima => prima.map(i => i === r || (i.id && i.id === r.id) ? r : i))}
      richiesta={{ tipo: "nuovo", phaseId: null, nonce }}
      stockPickBlockedReason="Questa prova non registra prelievi. Nel gestionale si usa il servizio di magazzino con i suoi controlli." />
  </div></main>;
}
createRoot(document.getElementById("root")!).render(<QueryClientProvider client={qc}><AuthContext.Provider value={auth}><MemoryRouter>{new URLSearchParams(location.search).get("simulazione")==="appartamento"?<SimulazioneAcquisti />:<Preview />}</MemoryRouter></AuthContext.Provider></QueryClientProvider>);
