import {useState} from "react";
import {describe,it,expect} from "vitest";
import {render,screen,fireEvent} from "@testing-library/react";
import {FvMonitoraggioSettings} from "../../components/fotovoltaico/FvMonitoraggioSettings";
import {monitoraggioIniziale,htmlMonitoraggioFv} from "../../../supabase/functions/_shared/fvMonitoraggio";
function Modello(){const[v,set]=useState(monitoraggioIniziale());return <><FvMonitoraggioSettings value={v} onChange={set}/><div data-testid="anteprima" dangerouslySetInnerHTML={{__html:htmlMonitoraggioFv(v)}}/></>;}
describe("impostazioni monitoraggio nel modello",()=>{
 it("può attivare l’app inclusa senza imporre un costo e nascondere tutta la sezione",()=>{
  render(<Modello/>);expect(screen.getByTestId("anteprima").innerHTML).toBe("");
  fireEvent.click(screen.getByLabelText("Mostra la pagina monitoraggio"));fireEvent.change(screen.getByLabelText("Condizioni dell’app"),{target:{value:"inclusa"}});
  expect(screen.getByTestId("anteprima")).toHaveTextContent("Nessun costo aggiuntivo per l’app");expect(screen.queryByLabelText("Prezzo app netto (€)")).not.toBeInTheDocument();
  fireEvent.click(screen.getByLabelText("Mostra immagine standard dello smartphone"));expect(screen.queryByAltText(/Smartphone con app di monitoraggio/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByLabelText("Mostra la pagina monitoraggio"));expect(screen.getByTestId("anteprima").innerHTML).toBe("");
 });
 it("può mostrare un servizio annuale e rimuoverlo mantenendo l’app gratuita",()=>{
  render(<Modello/>);fireEvent.click(screen.getByLabelText("Mostra la pagina monitoraggio"));fireEvent.change(screen.getByLabelText("Condizioni dell’app"),{target:{value:"gratuita"}});
  fireEvent.click(screen.getByLabelText("Mostra un servizio aggiuntivo facoltativo"));fireEvent.change(screen.getByLabelText("Prezzo servizio netto (€)"),{target:{value:"120"}});
  expect(screen.getByTestId("anteprima")).toHaveTextContent("App gratuita");expect(screen.getByTestId("anteprima")).toHaveTextContent("120,00");
  fireEvent.click(screen.getByLabelText("Mostra un servizio aggiuntivo facoltativo"));expect(screen.getByTestId("anteprima")).not.toHaveTextContent("120,00");expect(screen.getByTestId("anteprima")).toHaveTextContent("App gratuita");
 });
});
