import {render,screen,fireEvent,cleanup} from "@testing-library/react";
import {afterEach,describe,it,expect,vi} from "vitest";
import {FvSceltaEconomiaAzienda} from "@/components/fotovoltaico/economiaAzienda/FvSceltaEconomiaAzienda";
afterEach(cleanup);
describe("Modalità aziendale nella fase Finanza",()=>{
 it("offre quattro modalità distinte e sceglie leasing",()=>{const onChange=vi.fn();render(<FvSceltaEconomiaAzienda valore="cash" onChange={onChange}/>);expect(screen.getAllByRole("radio")).toHaveLength(4);expect(screen.getByRole("radiogroup")).toHaveAccessibleName("Pagamento azienda nella fase Finanza");fireEvent.click(screen.getByRole("radio",{name:/^Leasing/}));expect(onChange).toHaveBeenCalledExactlyOnceWith("leasing");});
 it("in sola lettura conserva la scelta e non permette modifiche",()=>{const onChange=vi.fn();render(<FvSceltaEconomiaAzienda valore="leasing" onChange={onChange} readOnly/>);expect(screen.getByRole("radio",{name:/^Leasing/})).toHaveAttribute("aria-checked","true");for(const radio of screen.getAllByRole("radio")){expect(radio).toBeDisabled();fireEvent.click(radio);}expect(onChange).not.toHaveBeenCalled();});
});
