import {act,cleanup,fireEvent,render,screen} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {AvvisoAttesaCommesse} from "@/components/orders/AvvisoAttesaCommesse";
beforeEach(()=>vi.useFakeTimers());afterEach(()=>{cleanup();vi.useRealTimers();});
it("per un’attesa breve non mostra errori; dopo la soglia offre di riprovare senza uscire",async()=>{
 const retry=vi.fn();render(<AvvisoAttesaCommesse delay={1000} onRetry={retry}/>);expect(screen.queryByRole("alert")).toBeNull();await act(async()=>vi.advanceTimersByTimeAsync(1000));expect(screen.getByRole("alert")).toHaveTextContent("più del previsto");fireEvent.click(screen.getByRole("button",{name:"Riprova caricamento"}));expect(retry).toHaveBeenCalledOnce();
});
it("se i dati arrivano prima della soglia non lascia timer o avvisi pendenti",()=>{const view=render(<AvvisoAttesaCommesse onRetry={()=>{}}/>);view.unmount();expect(vi.getTimerCount()).toBe(0);});
