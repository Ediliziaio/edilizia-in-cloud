import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CampoVoceRdo } from "@/components/rdo/CampoVoceRdo";
import { setupRadixMenus, scegliNelMenu } from "@/test/helpers/radixMenus";
setupRadixMenus();
vi.mock("sonner",()=>({toast:{error:vi.fn()}}));
afterEach(cleanup);
it.each(["-1","0",""])("non salva la quantità non valida %s", async value=>{
 const save=vi.fn();render(<CampoVoceRdo campo="quantita" valore={15} disabled={false} onSave={save}/>);
 const input=screen.getByLabelText("Quantità richiesta");fireEvent.change(input,{target:{value}});fireEvent.blur(input);
 expect(save).not.toHaveBeenCalled();expect(input).toHaveValue(15);
});
it("un errore di rete ripristina il valore salvato e permette di riprovare",async()=>{
 const save=vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
 render(<CampoVoceRdo campo="quantita" valore={15} disabled={false} onSave={save}/>);
 const input=screen.getByLabelText("Quantità richiesta");fireEvent.change(input,{target:{value:"20"}});fireEvent.blur(input);
 await waitFor(()=>expect(input).toBeEnabled());expect(input).toHaveValue(15);
 fireEvent.change(input,{target:{value:"20"}});fireEvent.blur(input);
 await waitFor(()=>expect(input).toBeEnabled());expect(input).toHaveValue(20);expect(save).toHaveBeenCalledTimes(2);
});
it("una descrizione vuota non sovrascrive il fabbisogno",()=>{
 const save=vi.fn();render(<CampoVoceRdo campo="descrizione" valore="Tasselli" disabled={false} onSave={save}/>);
 const input=screen.getByLabelText("Descrizione voce richiesta");fireEvent.change(input,{target:{value:"   "}});fireEvent.blur(input);
 expect(input).toHaveValue("Tasselli");expect(save).not.toHaveBeenCalled();
});
it("recepisce un valore aggiornato sul server e non salva al semplice blur",()=>{
 const save=vi.fn();const view=render(<CampoVoceRdo campo="quantita" valore={15} disabled={false} onSave={save}/>);
 view.rerender(<CampoVoceRdo campo="quantita" valore={25} disabled={false} onSave={save}/>);
 const input=screen.getByLabelText("Quantità richiesta");expect(input).toHaveValue(25);fireEvent.blur(input);expect(save).not.toHaveBeenCalled();
});

it("l'unità richiesta si sceglie da un menu e salva la sigla", async () => {
 const save = vi.fn().mockResolvedValue(undefined);
 render(<CampoVoceRdo campo="unita_misura" valore="pz" disabled={false} onSave={save} />);
 await scegliNelMenu("Unità di misura richiesta", /^kg/);
 await waitFor(() => expect(save).toHaveBeenCalledWith("kg"));
});

it("«ML» di una richiesta vecchia si legge «ml», senza riscriverla da sola", () => {
 const save = vi.fn();
 render(<CampoVoceRdo campo="unita_misura" valore="ML" disabled={false} onSave={save} />);
 expect(screen.getByRole("combobox", { name: "Unità di misura richiesta" })).toHaveTextContent("ml");
 expect(save).not.toHaveBeenCalled();
});

it("una richiesta già inviata non lascia cambiare l'unità", () => {
 render(<CampoVoceRdo campo="unita_misura" valore="pz" disabled onSave={vi.fn()} />);
 expect(screen.getByRole("combobox", { name: "Unità di misura richiesta" })).toBeDisabled();
});
