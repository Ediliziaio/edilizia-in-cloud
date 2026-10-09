import { Blob as NodeBlob } from "node:buffer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DbMinimo } from "../helpers/edgeFinto";
import { useDashboardBillingKPI, useTopClientiByFatturato } from "@/hooks/billing/useDashboardBillingKPI";
import ReportFatturazione from "@/pages/azienda/fatturazione/ReportFatturazione";
import { caricaRegistroVendite } from "@/lib/fatturazione/caricaRegistroVendite";
import { invalidaStatisticheFatturazione } from "@/lib/fatturazione/invalidaStatistiche";
const mock = vi.hoisted(()=>({db:null as unknown as DbMinimo,download:vi.fn(),errorTable:""}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{from:(name:string)=>{
  const q=mock.db.from(name);if(mock.errorTable===name) Object.assign(q,{then:(resolve:(v:unknown)=>unknown)=>Promise.resolve({data:null,error:new Error("Rete")}).then(resolve)});return q;
}}}));
vi.mock("@/hooks/useEffectiveCompanyId",()=>({useEffectiveCompanyId:()=>"a"}));
vi.mock("@/lib/fatturazione/originaleEmessaImportata",()=>({scaricaFileOriginale:(...args:unknown[])=>mock.download(...args)}));
vi.mock("recharts",()=>{
  const Wrap=({children}:{children:React.ReactNode})=><div>{children}</div>;
  return {ResponsiveContainer:Wrap,AreaChart:({data}:{data:unknown})=><pre data-testid="mensile">{JSON.stringify(data)}</pre>,BarChart:({data}:{data:unknown})=><pre data-testid="clienti">{JSON.stringify(data)}</pre>,Area:():null=>null,Bar:():null=>null,XAxis:():null=>null,YAxis:():null=>null,CartesianGrid:():null=>null,Tooltip:():null=>null,Legend:():null=>null};
});
let client:QueryClient;
const wrapper=({children}:{children:React.ReactNode})=><QueryClientProvider client={client}>{children}</QueryClientProvider>;
beforeEach(()=>{
  vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(new Date("2026-10-09T12:00:00Z"));vi.stubGlobal("Blob",NodeBlob);
  client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});mock.db=new DbMinimo();mock.download.mockReset();mock.errorTable="";
  const base={company_id:"a",deleted_at:null as string|null,numero:"1/26",tipo:"fattura",stato:"emessa",data_emissione:"2026-10-01",data_scadenza:"2026-09-30",cliente_snapshot:{nome:"Mario",cognome:"Rossi",codice_fiscale:"RSSMRA80A01H501U"},imponibile_totale:1000,iva_totale:100,totale_documento:1100,importo_pagato:200,anagrafica_id:"anag"};
  mock.db.tabelle.documenti_fiscali=[{id:"n",...base},{id:"nc",...base,numero:"NC1/26",tipo:"nota_credito",imponibile_totale:-100,iva_totale:-10,totale_documento:-110,importo_pagato:0},{id:"bozza",...base,stato:"bozza",imponibile_totale:9999},{id:"proforma",...base,tipo:"proforma"},{id:"eliminata",...base,deleted_at:"2026-10-01"},{id:"estranea",...base,company_id:"b"},{id:"futura",...base,data_emissione:"2027-01-01",imponibile_totale:7777}];
  const ext={company_id:"a",external_provider:"xml_import",deleted_at:null as string|null,document_type:"invoice",status:"issued",invoice_number:"FPR 1/26",issue_date:"2026-09-01",client_company_name:"Mario Rossi",client_fiscal_code:"RSSMRA80A01H501U",subtotal:300,tax_amount:30,total:330,paid_amount:0};
  mock.db.tabelle.invoices=[{id:"e",...ext},{id:"enc",...ext,invoice_number:"FPR 2/26",document_type:"credit_note",subtotal:100,tax_amount:10,total:110},{id:"non_esterna",...ext,external_provider:null},{id:"estera_azienda",...ext,company_id:"b"}];
  mock.db.tabelle.movimenti_cassa_native=[{id:"m",company_id:"a",documento_id:"n",tipo:"incasso",data_movimento:"2026-10-05",importo:200},{id:"errata",company_id:"a",documento_id:"n",tipo:"entrata",data_movimento:"2026-10-05",importo:9999},{id:"bozza_cash",company_id:"a",documento_id:"bozza",tipo:"incasso",data_movimento:"2026-10-05",importo:9999},{id:"altro_mese",company_id:"a",documento_id:"n",tipo:"incasso",data_movimento:"2026-09-05",importo:100},{id:"altra_azienda",company_id:"b",documento_id:"n",tipo:"incasso",data_movimento:"2026-10-05",importo:9999}];
  mock.db.tabelle.fattura_pagamento_stato=[{fattura_id:"n",company_id:"a",importo_residuo:790,stato_pagamento:"parziale"},{fattura_id:"bozza",company_id:"a",importo_residuo:9999,stato_pagamento:"scaduta"},{fattura_id:"eliminata",company_id:"a",importo_residuo:9999,stato_pagamento:"scaduta"},{fattura_id:"proforma",company_id:"a",importo_residuo:9999,stato_pagamento:"scaduta"}];
});
afterEach(()=>{cleanup();client.clear();vi.unstubAllGlobals();vi.useRealTimers();});
describe("Statistiche reali: nativo + importato",()=>{
  it("fatturato netto, bozze escluse, NC sottratte, incassi non a zero e scaduto parziale incluso",async()=>{
    const {result}=renderHook(()=>useDashboardBillingKPI("a"),{wrapper});
    await waitFor(()=>expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toMatchObject({fatturato_mese:900,fatturato_ytd:1100,fatture_emesse_mese:1,fatture_in_bozza:1,incassato_mese:200,da_incassare_totale:790,scaduto:790,fatture_scadute_count:1,fatture_importate_incassi_da_verificare:1});
  });
  it("scadenze dei prossimi 30 giorni non sono una costante zero",async()=>{
    mock.db.tabelle.documenti_fiscali[0].data_scadenza="2026-10-20";mock.db.tabelle.fattura_pagamento_stato[0].stato_pagamento="in_attesa";
    const {result}=renderHook(()=>useDashboardBillingKPI("a"),{wrapper});await waitFor(()=>expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toMatchObject({in_scadenza_30gg:790,scaduto:0});
  });
  it("YTD e mese corrente non includono documenti datati nel futuro",async()=>{
    mock.db.tabelle.documenti_fiscali.push({...mock.db.tabelle.documenti_fiscali[0],id:"fine_mese",numero:"50/26",data_emissione:"2026-10-31",imponibile_totale:8888});
    const {result}=renderHook(()=>useDashboardBillingKPI("a"),{wrapper});await waitFor(()=>expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toMatchObject({fatturato_mese:900,fatturato_ytd:1100});
  });
  it("top clienti: storico incluso, omonimie non usate come identità, residuo reale",async()=>{
    const {result}=renderHook(()=>useTopClientiByFatturato("a"),{wrapper});await waitFor(()=>expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);expect(result.current.data![0]).toMatchObject({nome:"Mario Rossi",fatturato:1100,daIncassare:790,incassiImportatiDaVerificare:true});
  });
  it("report mensile e CSV includono importate, CF, persone fisiche e note già negative",async()=>{
    render(<ReportFatturazione/>,{wrapper});await screen.findByText(/di cui 2 importati/);
    const months=JSON.parse(screen.getByTestId("mensile").textContent!);
    expect(months.find((m:{mese:string})=>m.mese==="ott 26")).toMatchObject({fatturato:900,incassato:200});
    expect(months.find((m:{mese:string})=>m.mese==="set 26")).toMatchObject({fatturato:200,incassato:0});
    fireEvent.click(screen.getByRole("button",{name:/Registro IVA CSV/}));
    const csv=await mock.download.mock.calls[0][0].text();
    expect(csv).toContain("RSSMRA80A01H501U");expect(csv).toContain("Mario Rossi");expect(csv).toContain("FPR 2/26");expect(csv).toContain("-100,00");expect(csv).toContain("importata");expect(csv).not.toContain("9999");
  });
  it("un errore del caricamento storico non diventa un falso totale zero o un totale incompleto",async()=>{
    mock.errorTable="invoices";render(<ReportFatturazione/>,{wrapper});
    expect(await screen.findByRole("alert")).toHaveTextContent("Nessun totale parziale");expect(screen.queryByRole("button",{name:/Registro IVA/})).toBeNull();
  });
  it("azienda obbligatoria e invalidazioni circoscritte dopo import/incassi",async()=>{
    await expect(caricaRegistroVendite("")).rejects.toThrow("azienda");
    const spy=vi.spyOn(client,"invalidateQueries");invalidaStatisticheFatturazione(client,"a");
    expect(spy.mock.calls.map(c=>c[0]?.queryKey)).toEqual([["dashboard-billing-kpi","a"],["top-clienti-fatturato","a"],["documenti-report-all","a"]]);
  });
});
