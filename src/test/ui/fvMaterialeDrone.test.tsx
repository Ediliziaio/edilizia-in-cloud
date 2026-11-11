import {afterEach,describe,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {MaterialeDroneLocale} from "../../../dev/fotovoltaico-locale/MaterialeDroneLocale";
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
describe("Foto drone come riferimento locale",()=>{
 it("mostra una foto senza inviarla a servizi esterni e rilascia l’URL alla chiusura",()=>{
  const createObjectURL=vi.fn(()=>"blob:riferimento-locale"),revokeObjectURL=vi.fn();vi.stubGlobal("URL",{createObjectURL,revokeObjectURL});
  const {unmount}=render(<MaterialeDroneLocale/>);const file=new File(["immagine di test"],"tetto.jpg",{type:"image/jpeg"});fireEvent.change(screen.getByLabelText("Immagini del drone"),{target:{files:[file]}});
  expect(screen.getByRole("img",{name:"Foto di riferimento: tetto.jpg"})).toHaveAttribute("src","blob:riferimento-locale");expect(createObjectURL).toHaveBeenCalledWith(file);
  unmount();expect(revokeObjectURL).toHaveBeenCalledWith("blob:riferimento-locale");
 });
 it("rifiuta file non compatibili senza creare anteprime",()=>{
  const createObjectURL=vi.fn();vi.stubGlobal("URL",{createObjectURL,revokeObjectURL:vi.fn()});render(<MaterialeDroneLocale/>);
  fireEvent.change(screen.getByLabelText("Immagini del drone"),{target:{files:[new File(["x"],"rilievo.tif",{type:"image/tiff"})]}});expect(screen.getByRole("alert")).toHaveTextContent(/GeoTIFF.*importazione dedicata/);expect(createObjectURL).not.toHaveBeenCalled();
 });
 it("applica il limite di quattro immagini e consente la rimozione",()=>{
  const createObjectURL=vi.fn(()=>"blob:test"),revokeObjectURL=vi.fn();vi.stubGlobal("URL",{createObjectURL,revokeObjectURL});render(<MaterialeDroneLocale/>);
  const files=Array.from({length:5},(_,i)=>new File(["foto"],`drone-${i}.jpg`,{type:"image/jpeg"}));fireEvent.change(screen.getByLabelText("Immagini del drone"),{target:{files}});expect(screen.getByRole("alert")).toHaveTextContent(/massimo 4/);expect(createObjectURL).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Immagini del drone"),{target:{files:files.slice(0,1)}});fireEvent.click(screen.getByRole("button",{name:"Rimuovi immagine selezionata"}));expect(screen.queryByRole("img")).toBeNull();expect(revokeObjectURL).toHaveBeenCalledWith("blob:test");
 });
});
