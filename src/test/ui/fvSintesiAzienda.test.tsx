import {describe,it,expect} from "vitest";
import {render,screen} from "@testing-library/react";
import {FvSintesiAzienda} from "@/components/fotovoltaico/economiaAzienda/FvSintesiAzienda";
import {INITIAL} from "@/pages/azienda/fotovoltaico/FotovoltaicoWizard/constants";
import {datiGrenke,tabellaGrenke} from "../../../dev/fotovoltaico-locale/grenkeScenario";
import {calcolaEconomiaAzienda,type InputEconomiaAzienda} from "../../../supabase/functions/_shared/fvEconomiaAzienda";
const euro=(v:number)=>v.toLocaleString("it-IT",{style:"currency",currency:"EUR"}).replace(/\u00a0/g," ");
const input=():InputEconomiaAzienda=>({companyId:tabellaGrenke().companyId,imponibile:57377.05,iva:.22,produzioneAnnua:74260.94,parametri:datiGrenke(INITIAL).economia_azienda!.parametri});
describe("Riepilogo aziendale in fase 6",()=>{
 it.each([[60,4657.80,1552.60],[72,4065.60,1355.20]])("distingue scadenza trimestrale ed equivalente mensile IVA inclusa a %i mesi",(durata,trimestrale,mensile)=>{const i=input();i.parametri={...i.parametri,durataNoleggioMesi:durata};render(<FvSintesiAzienda input={i} risultato={calcolaEconomiaAzienda(i)}/>);expect(screen.getByText(euro(trimestrale))).toBeVisible();expect(screen.getByText(euro(mensile))).toBeVisible();expect(screen.getByText("ogni 3 mesi")).toBeVisible();expect(screen.getByText(/Prima di assicurazione/)).toBeVisible();expect(screen.getByText(/Pagamento anticipato/)).toBeVisible();});
 it("mostra il pagamento all’avvio nell’acquisto diretto",()=>{const i=input();i.parametri={...i.parametri,modo:"cash"};render(<FvSintesiAzienda input={i} risultato={calcolaEconomiaAzienda(i)}/>);expect(screen.getByText("VALORE DELLA FORNITURA")).toBeVisible();expect(screen.getByText("Pagamento all’avvio con risorse proprie.")).toBeVisible();expect(screen.queryByText("ogni 3 mesi")).not.toBeInTheDocument();});
});
