import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { lavorazioneVuota, posVuoto } from "../../../supabase/functions/_shared/posModello";
const mocks=vi.hoisted(()=>({crea:vi.fn(),salva:vi.fn()}));
vi.mock("@/hooks/usePos",()=>({useCreaPos:()=>({mutateAsync:mocks.crea,isPending:false}),useSalvaModelloPos:()=>({mutateAsync:mocks.salva,isPending:false})}));
vi.mock("@/hooks/useFascicoloCantiere",()=>({useCommesseFascicolo:()=>({data:[],isLoading:false,isError:false})}));
import { RiusoPosDialog } from "@/components/sicurezza/pos/RiusoPosDialog";
import type { PosRiga } from "@/hooks/usePos";
afterEach(()=>{cleanup();vi.clearAllMocks();});
function mostra() {
 const c=posVuoto();c.lavorazioni=[{...lavorazioneVuota("l1"),titolo:"Posa"}];
 const pos={id:"p1",company_id:"a1",order_id:"o1",updated_at:"2026-10-26T10:00:00Z",revisione:3,contenuto:c,commessa:{order_code:"ORD-1"}} as PosRiga;
 const chiudi=vi.fn();render(<MemoryRouter><RiusoPosDialog pos={pos} onClose={chiudi}/></MemoryRouter>);return {chiudi,pos};
}
describe("scelta esplicita fra copia e standard",()=>{
 it("non crea una copia senza aver scelto la commessa",()=>{
  mostra();expect((screen.getByRole("button",{name:"Crea una copia in bozza"}) as HTMLButtonElement).disabled).toBe(true);expect(mocks.crea).not.toHaveBeenCalled();
 });
 it("richiede campo di impiego e verifica dei testi prima di salvare lo standard",async()=>{
  const {pos,chiudi}=mostra();fireEvent.click(screen.getByRole("button",{name:"Salva modello"}));
  const salva=screen.getByRole("button",{name:"Salva lo standard"}) as HTMLButtonElement;
  expect(salva.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("Nome dello standard aziendale"),{target:{value:"Serramenti"}});
  fireEvent.change(screen.getByLabelText("Campo d’impiego e limiti"),{target:{value:"Posa interna"}});
  expect(salva.disabled).toBe(true);
  fireEvent.click(screen.getByRole("checkbox"));fireEvent.click(salva);
  await waitFor(()=>expect(mocks.salva).toHaveBeenCalledWith({pos,nome:"Serramenti",ambito:"Posa interna",testiVerificati:true}));
  expect(chiudi).toHaveBeenCalledOnce();
 });
 it("conserva il modulo quando il server rifiuta il salvataggio",async()=>{
  mocks.salva.mockRejectedValueOnce(new Error("POS cambiato")); const {chiudi}=mostra();
  fireEvent.click(screen.getByRole("button",{name:"Salva modello"}));
  fireEvent.change(screen.getByLabelText("Nome dello standard aziendale"),{target:{value:"Standard"}});
  fireEvent.change(screen.getByLabelText("Campo d’impiego e limiti"),{target:{value:"Interni"}});
  fireEvent.click(screen.getByRole("checkbox"));fireEvent.click(screen.getByRole("button",{name:"Salva lo standard"}));
  await waitFor(()=>expect(mocks.salva).toHaveBeenCalledOnce());expect(chiudi).not.toHaveBeenCalled();expect(screen.getByDisplayValue("Standard")).toBeTruthy();
 });
});
