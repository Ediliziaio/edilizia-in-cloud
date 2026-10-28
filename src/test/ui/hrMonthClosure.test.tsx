import { afterEach, it, expect, vi } from "vitest";
import { render,fireEvent,screen,cleanup } from "@testing-library/react";
import { HrMonthClosure } from "@/components/personale/HrMonthClosure";
const s=vi.hoisted(()=>({closed:false,error:false,canEdit:true,mutate:vi.fn()}));
vi.mock("@/hooks/useHrMonthClosure",()=>({useHrMonthClosure:()=>({
 query:{data:s.closed?{stato:"chiuso",revisione:1}:null,isPending:false,isError:s.error},
 history:{data:[] as never[],isError:false},canEdit:s.canEdit,change:{mutate:s.mutate,isPending:false},
})}));
afterEach(()=>{cleanup();s.closed=false;s.error=false;s.canEdit=true;vi.clearAllMocks();});
it("cannot close an incomplete month or close merely by opening a dialog",()=>{
 const view=render(<HrMonthClosure month="2026-09" ready={false}/>);
 expect(screen.getByRole("button",{name:"Chiudi mese HR"}).hasAttribute("disabled")).toBe(true);
 view.rerender(<HrMonthClosure month="2026-09" ready/>);
 fireEvent.click(screen.getByRole("button",{name:"Chiudi mese HR"}));
 expect(s.mutate).not.toHaveBeenCalled();
 expect(screen.getByRole("button",{name:"Conferma chiusura"}).hasAttribute("disabled")).toBe(true);
});
it("requires a reason and explicit authorized confirmation to reopen",()=>{
 s.closed=true;render(<HrMonthClosure month="2026-09" ready={false}/>);
 fireEvent.click(screen.getByRole("button",{name:"Riapri mese HR"}));
 expect(screen.getByRole("button",{name:"Conferma riapertura"}).hasAttribute("disabled")).toBe(true);
 fireEvent.change(screen.getByLabelText("Motivo obbligatorio"),{target:{value:"Rettifica autorizzata del 30 settembre"}});
 fireEvent.click(screen.getByRole("button",{name:"Conferma riapertura"}));
 expect(s.mutate).toHaveBeenCalledWith({state:"aperto",reason:"Rettifica autorizzata del 30 settembre"},expect.any(Object));
});
it("exposes no state-changing control for read-only users and no false open state on error",()=>{
 s.canEdit=false;const view=render(<HrMonthClosure month="2026-09" ready/>);
 expect(screen.queryByRole("button",{name:"Chiudi mese HR"})).toBeNull();
 s.error=true;view.rerender(<HrMonthClosure month="2026-09" ready/>);
 expect(screen.getByRole("alert").textContent).toContain("non disponibile");
 expect(screen.queryByText("Mese HR aperto")).toBeNull();
});
