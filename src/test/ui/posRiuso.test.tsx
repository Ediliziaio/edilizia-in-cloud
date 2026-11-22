import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { changeFormControl } from "@/test/helpers/changeFormControl";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { lavorazioneVuota, posVuoto } from "../../../supabase/functions/_shared/posModello";
const mocks=vi.hoisted(()=>({crea:vi.fn(),salva:vi.fn(),fonti:[] as unknown[]}));
vi.mock("@/hooks/usePos",()=>({
  useCreaPos:()=>({mutateAsync:mocks.crea,isPending:false}),
  useSalvaModelloPos:()=>({mutateAsync:mocks.salva,isPending:false}),
  useModelliPos:()=>({data:[] as never[]}),
  useArchiviaModelloPos:()=>({isPending:false}),
  usePosElenco:()=>({ data: mocks.fonti, isLoading: false, isError: false }),
}));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "a1" }));
vi.mock("@/components/warehouse/OrderSelectCombobox", () => ({ OrderSelectCombobox: (): null => null }));
vi.mock("@/hooks/useFascicoloCantiere",()=>({useCommesseFascicolo:()=>({data:[] as never[],isLoading:false,isError:false})}));
import { NuovoPosDialog } from "@/components/sicurezza/pos/NuovoPosDialog";
import { RiusoPosDialog } from "@/components/sicurezza/pos/RiusoPosDialog";
import type { PosRiga } from "@/hooks/usePos";
beforeAll(() => {
  if (!("ResizeObserver" in globalThis)) {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});
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

describe("punto di partenza di un nuovo POS", () => {
  const data = "2026-10-26T10:00:00Z";
  function nuovo() {
    const onCreato = vi.fn();
    mocks.crea.mockResolvedValue({ pos_id: "p-nuovo", avvisi: [] });
    render(<NuovoPosDialog commessa={{ id: "o-dest", nome: "Destinazione" }} commesseConPos={new Set()} onClose={vi.fn()} onCreato={onCreato} />);
    fireEvent.click(screen.getByRole("radio", { name: "Impresa affidataria ed esecutrice" }));
    return onCreato;
  }
  it("crea una bozza manuale dalla commessa scelta", async () => {
    const onCreato = nuovo();
    changeFormControl(screen.getByLabelText("Punto di partenza"), { target: { value: "manuale" } });
    fireEvent.click(screen.getByRole("button", { name: "Crea bozza POS" }));
    await waitFor(() => expect(mocks.crea).toHaveBeenCalledWith({ orderId: "o-dest", ruoloImpresa: "affidataria_esecutrice", manuale: true }));
    expect(onCreato).toHaveBeenCalledWith({ pos_id: "p-nuovo", avvisi: [] });
  });
  it("ricerca il documento da duplicare e passa l’identità e versione del sorgente", async () => {
    mocks.fonti = [
      { id: "p1", updated_at: data, revisione: 2, status: "approvato", commessa: { order_code: "ORD-1", description: "Serramenti Ovest" } },
      { id: "p2", updated_at: data, revisione: 0, status: "bozza", commessa: { order_code: "ORD-2", description: "Impianto Est" } },
    ];
    nuovo();
    changeFormControl(screen.getByLabelText("Punto di partenza"), { target: { value: "duplica" } });
    const crea = screen.getByRole("button", { name: "Crea bozza POS" });
    expect(crea).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: "Cerca un POS per codice o commessa" }), { target: { value: "Serramenti" } });
    expect(screen.queryByText(/Impianto Est/)).toBeNull();
    changeFormControl(screen.getByLabelText("POS da duplicare"), { target: { value: "p1" } });
    fireEvent.click(crea);
    await waitFor(() => expect(mocks.crea).toHaveBeenCalledWith({
      orderId: "o-dest", ruoloImpresa: "affidataria_esecutrice", sorgentePos: expect.objectContaining({ id: "p1", updated_at: data }),
    }));
    mocks.fonti = [];
  });
});
