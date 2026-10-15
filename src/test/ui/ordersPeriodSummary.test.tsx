import {afterEach,describe,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {OrdersPeriodSummary} from "@/components/orders/OrdersPeriodSummary";
afterEach(cleanup);
const props=()=>({counts:{toComplete:35,completed:38,support:21},loading:false,failed:false,status:"all",onStatus:vi.fn(),showMargins:true,margins:{negative_margin:["outside-page-one"],low_margin:["a","b"],missing_costs:["x","y","z"],good:[] as string[]},marginLoading:false,marginFailed:false,focus:"all" as const,onFocus:vi.fn(),onRetry:vi.fn()});
describe("Riepilogo commesse del periodo",()=>{
  it("mantiene separati i tipi di margine e applica la scelta",()=>{
    const p=props();render(<OrdersPeriodSummary {...p}/>);
    fireEvent.click(screen.getByRole("button",{name:"Margine negativo 1"}));expect(p.onFocus).toHaveBeenCalledWith("negative_margin");
    expect(screen.getByRole("button",{name:"Margine sotto il 20% 2"})).toBeInTheDocument();expect(screen.getByRole("button",{name:"Costi da completare 3"})).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"Completati 38"}));expect(p.onStatus).toHaveBeenCalledWith("__completati__");
  });
  it("non trasforma un errore sui margini in zero criticità",()=>{
    const p=props();render(<OrdersPeriodSummary {...p} marginFailed/>);
    expect(screen.getByRole("alert")).toHaveTextContent("Margini non disponibili");expect(screen.queryByRole("button",{name:/Margine negativo/})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"Riprova margini"}));expect(p.onRetry).toHaveBeenCalledOnce();
  });
  it("nasconde i controlli economici quando il ruolo non può vedere i margini",()=>{
    render(<OrdersPeriodSummary {...props()} showMargins={false}/>);expect(screen.queryByRole("button",{name:/Margine negativo/})).not.toBeInTheDocument();expect(screen.getByRole("button",{name:"Da completare 35"})).toBeInTheDocument();
  });
});
