import { beforeEach, describe, expect, it, vi } from "vitest";
import { avvisoEmissione, emissioneConDataOdierna } from "@/lib/fatturazione/emissioneBozza";

const m = vi.hoisted(() => ({ calls: [] as unknown[][], company: "company-a" as string | null,
  row: {id:"draft",company_id:"company-a",tipo:"fattura",numero:"Bozza ABCD",stato:"bozza",righe:[{}],cliente_snapshot:{ragione_sociale:"Cliente"}},
  rpc:vi.fn(),invalidateQueries:vi.fn(),from:vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({supabase:{from:m.from,rpc:m.rpc}}));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({useEffectiveCompanyId:()=>m.company}));
vi.mock("@tanstack/react-query", () => ({useQuery:(x:unknown)=>x,useMutation:(x:unknown)=>x,useQueryClient:()=>({invalidateQueries:m.invalidateQueries})}));
vi.mock("sonner", () => ({toast:{success:vi.fn(),error:vi.fn()}}));
import { useDocumentiFiscali, useEmittiDocumento } from "@/hooks/useDocumentiFiscali";

beforeEach(() => {
  m.calls=[];m.company="company-a";m.rpc.mockReset().mockResolvedValue({error:null});
  m.row={id:"draft",company_id:"company-a",tipo:"fattura",numero:"Bozza ABCD",stato:"bozza",righe:[{}],cliente_snapshot:{ragione_sociale:"Cliente"}};
  m.from.mockImplementation((table:string)=>{
    m.calls.push(["from",table]);
    const query:Record<string,unknown>={};
    for (const method of ["select","eq","is","not","in","or","gte","lte","order","range","abortSignal"]) {
      query[method]=(...args:unknown[])=>{m.calls.push([method,...args]);return query;};
    }
    query.single=async():Promise<{data:typeof m.row;error:null}>=>({data:m.row,error:null});
    query.then=(done:(x:unknown)=>unknown)=>Promise.resolve({data:[m.row],error:null,count:1}).then(done);
    return query;
  });
});

describe("Elenco ordinato dal database prima della pagina", () => {
  it("filtri calcolati e ricerca si combinano sul server, conteggio esatto", async () => {
    await (useDocumentiFiscali({scaduta:true,emessi:true,sdi:"in_elaborazione",search:"BIEMME (srl)",page:1}) as unknown as {queryFn:()=>Promise<unknown>}).queryFn();
    expect(m.calls).toContainEqual(["from","documenti_fiscali_elenco"]);
    expect(m.calls).toContainEqual(["select","*",{count:"exact"}]);
    expect(m.calls).toContainEqual(["eq","elenco_scaduta",true]);
    expect(m.calls).toContainEqual(["eq","elenco_fase_sdi","in_elaborazione"]);
    expect(m.calls).toContainEqual(["not","stato","in","(bozza,annullata)"]);
    expect(m.calls.filter(x=>x[0]==="or")).toHaveLength(1);
  });
  it.each(["da_inviare","in_elaborazione","scartata"] as const)("SDI %s non usa più l'approssimazione su AT/id null", async sdi => {
    await (useDocumentiFiscali({sdi}) as unknown as {queryFn:()=>Promise<unknown>}).queryFn();
    expect(m.calls).toContainEqual(["eq","elenco_fase_sdi",sdi]);
    expect(m.calls.some(x=>x[1]==="sdi_stato" || x[1]==="sdi_id_trasmissione")).toBe(false);
  });
  it("anno e progressivo numerico, non data né ordinamento alfabetico FPR 5 > FPR 74", async () => {
    const hook=useDocumentiFiscali({ordinamento:"progressivo",tipo:"fattura",page:1,perPage:25}) as unknown as {queryFn:()=>Promise<unknown>};
    await hook.queryFn();
    expect(m.calls.filter(x=>x[0]==="order")).toEqual([
      ["order","anno",{ascending:false,nullsFirst:false}],
      ["order","numero_progressivo",{ascending:false,nullsFirst:false}],
      ["order","data_emissione",{ascending:false}],
      ["order","id",{ascending:false}],
    ]);
    expect(m.calls.findIndex(x=>x[0]==="range")).toBeGreaterThan(m.calls.findIndex(x=>x[1]==="numero_progressivo"));
    expect(m.calls).toContainEqual(["range",25,49]);
    expect(m.calls).toContainEqual(["eq","company_id","company-a"]);
  });
  it.each([{showDeleted:true,ordinamento:"progressivo" as const},{showDeleted:false}])("cestino e altri utilizzatori conservano il loro ordine: %j", async filters => {
    await (useDocumentiFiscali(filters) as unknown as {queryFn:()=>Promise<unknown>}).queryFn();
    expect(m.calls.filter(x=>x[0]==="order")).toEqual([
      ["order",filters.showDeleted?"updated_at":"data_emissione",{ascending:false}],
      ["order","id",{ascending:false}],
    ]);
  });
});

describe("Un solo ingresso atomico per l'emissione nell'app", () => {
  it("non salva data/stato a parte e chiama il motore con il solo id", async () => {
    await (useEmittiDocumento() as unknown as {mutationFn:(id:string)=>Promise<unknown>}).mutationFn("draft");
    expect(m.rpc).toHaveBeenCalledExactlyOnceWith("documento_emetti_oggi",{p_documento_id:"draft"});
    expect(m.calls.some(x=>["update","insert"].includes(String(x[0])))).toBe(false);
  });
  it("propaga il motivo concreto del server, senza retry automatico dell'emissione", async () => {
    m.rpc.mockResolvedValue({error:{message:"Cronologia incoerente"}});
    await expect((useEmittiDocumento() as unknown as {mutationFn:(id:string)=>Promise<unknown>}).mutationFn("draft")).rejects.toThrow("Cronologia incoerente");
    expect(m.rpc).toHaveBeenCalledTimes(1);
  });
});

describe("Conferma coerente con i dati definitivi", () => {
  it("spiega data automatica, numero non prenotato, scadenze invariate e invio separato", () => {
    expect(emissioneConDataOdierna(m.row)).toBe(true);
    expect(avvisoEmissione(m.row)).toMatch(/aggiornata a oggi/);
    expect(avvisoEmissione(m.row)).toMatch(/Scadenze e importi restano invariati/);
    expect(avvisoEmissione(m.row)).toMatch(/SDI è il passaggio successivo/);
  });
  it.each(["emessa","inviata_sdi","rifiutata","pagata"])("non promette di ridatare %s", stato => {
    expect(emissioneConDataOdierna({...m.row,stato})).toBe(false);
  });
  it("non cambia la data dei recuperi già numerati", () => {
    expect(avvisoEmissione({...m.row,numero:"FPR 5/26"})).toMatch(/già presenti saranno mantenuti/);
    expect(emissioneConDataOdierna({...m.row,tipo:"ddt"})).toBe(false);
    expect(emissioneConDataOdierna({})).toBe(false);
  });
});
