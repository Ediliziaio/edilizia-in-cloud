import { afterEach, it, expect, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { HrMonthlyReview } from "@/components/personale/HrMonthlyReview";
vi.mock("@/components/personale/HrMonthClosure",()=>({HrMonthClosure:():null=>null}));
const state=vi.hoisted(()=>({error:false,calls:vi.fn()}));
vi.mock("@/hooks/useOperai",()=>({oggiRoma:()=>"2026-10-07"}));
vi.mock("@/hooks/useGiornate",()=>({useGiornate:()=>{state.calls();return {data:[{profilo_id:"p",data:"2026-10-05",anomalia:false}],isError:state.error,isLoading:false};}}));
vi.mock("@/hooks/useRichieste",()=>({useRichieste:()=>({data:[{stato:"in_attesa"}],isLoading:false,isError:false})}));
vi.mock("@/hooks/useOrganigramma",()=>({useAllHrProfili:()=>({data:[{id:"p",nome:"Test",cognome:"Persona",attivo:true,data_assunzione:"2026-10-05",giorni_lavorativi:["Lun","Mar","Mer"]}],isLoading:false,isError:false})}));
vi.mock("@/hooks/useHrFestivita",()=>({useHrFestivita:()=>({data:[] as unknown[],isLoading:false,isError:false})}));
afterEach(()=>{cleanup();state.error=false;vi.clearAllMocks();});
it("loads the monthly check only when opened and never calls missing records absences",()=>{
 render(<HrMonthlyReview mese="2026-10"/>);expect(state.calls).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole("button",{name:"Verifica il mese"}));
 expect(state.calls).toHaveBeenCalled();expect(screen.getByText("Giornate senza registrazione")).toBeTruthy();
 expect(screen.getByText(/non è un’assenza/)).toBeTruthy();expect(screen.getByText(/non chiude il mese automaticamente/)).toBeTruthy();
 expect(screen.getByText("2")).toBeTruthy();
});
it("does not expose apparently complete metrics after a read failure",()=>{
 state.error=true;render(<HrMonthlyReview mese="2026-10"/>);fireEvent.click(screen.getByRole("button",{name:"Verifica il mese"}));
 expect(screen.getByRole("alert").textContent).toContain("incompleto");expect(screen.queryByText("Giornate registrate")).toBeNull();
});
