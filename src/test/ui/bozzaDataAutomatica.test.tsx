import {afterEach,describe,expect,it,vi} from "vitest";
import {cleanup,render,screen} from "@testing-library/react";
import {EditorDatiDocumento} from "@/pages/azienda/fatturazione/editor/EditorDatiDocumento";
import type {EditorState} from "@/pages/azienda/fatturazione/editor/useEditorState";
vi.mock("@tanstack/react-query",()=>({useQueryClient:()=>({invalidateQueries:vi.fn()})}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{rpc:vi.fn()}}));
const state=(extra:Record<string,unknown>={})=>({id:"draft",tipo:"fattura",stato:"bozza",numero:"Bozza TEST0001",data_emissione:"2026-10-12",data_scadenza:"",serie:"",...extra}) as EditorState;
afterEach(cleanup);
describe("La data della bozza non si confonde con quella definitiva",()=>{
  it("indica la data automatica e non offre un calendario che verrebbe ignorato",()=>{
    const dispatch=vi.fn();render(<EditorDatiDocumento state={state()} dispatch={dispatch}/>);
    expect(screen.getByRole("button",{name:"Oggi, quando emetti"})).toBeDisabled();
    expect(screen.getByText(/non riserva numeri/)).toBeInTheDocument();
    expect(screen.getByDisplayValue("Bozza (senza numero)")).toHaveAttribute("readonly");
    expect(dispatch).not.toHaveBeenCalled(); // nessuna scrittura all'apertura
  });
  it("un recupero già numerato continua a mostrare la sua data",()=>{
    render(<EditorDatiDocumento state={state({numero:"FPR 5/26"})} dispatch={vi.fn()}/>);
    expect(screen.getByRole("button",{name:"12/10/2026"})).toBeEnabled();
    expect(screen.queryByText("Oggi, quando emetti")).not.toBeInTheDocument();
  });
  it("una scartata resta con data bloccata e non viene spacciata per nuova emissione",()=>{
    render(<EditorDatiDocumento state={state({numero:"FPR 74/26",stato:"rifiutata"})} dispatch={vi.fn()} dataBloccata/>);
    expect(screen.getByRole("button",{name:"12/10/2026"})).toBeDisabled();
    expect(screen.queryByText("Oggi, quando emetti")).not.toBeInTheDocument();
  });
  it("preventivi e proforma conservano il calendario",()=>{
    render(<EditorDatiDocumento state={state({tipo:"proforma",numero:"PF-1"})} dispatch={vi.fn()}/>);
    expect(screen.getByRole("button",{name:"12/10/2026"})).toBeEnabled();
  });
});
