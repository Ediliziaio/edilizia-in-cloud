import type { ComponentProps } from "react";
import "@testing-library/jest-dom/vitest";
import {render,screen,fireEvent,waitFor,cleanup} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import type {DocumentoOperativo} from "@/lib/documentiOperativi/modello";
vi.mock("@/components/documentiOperativi/DestinazioneDocumento",()=>({DestinazioneDocumento:(): null=>null}));
import {OdaDettagliCard} from "@/components/orders/OdaDettagliCard";
const documento:DocumentoOperativo={tipo:"materiali",numero:"ODA-5",data:"2026-11-06",destinatario:{nome:"KLASSE",email:"ordini@esempio.it"},pagamento:"Bonifico · 60 giorni fine mese",righe:[]};
afterEach(cleanup);
const props:Omit<ComponentProps<typeof OdaDettagliCard>,"onSave">={documento,orderId:null,internalNotes:null,condizioniFornitore:"Bonifico · 60 giorni fine mese",paymentMethod:"bonifico",canEdit:true};
it("mostra subito i termini concordati e permette di cambiarli per questo ordine",async()=>{
 const save=vi.fn().mockResolvedValue(undefined);render(<OdaDettagliCard {...props} onSave={save}/>);
 expect(screen.getByText("Bonifico · 60 giorni fine mese")).toBeInTheDocument();
 fireEvent.click(screen.getByRole("button",{name:"Modifica dettagli"}));
 expect(screen.getByLabelText("Condizioni di pagamento dell’ordine")).toHaveValue(props.condizioniFornitore);
 fireEvent.change(screen.getByLabelText("Condizioni di pagamento dell’ordine"),{target:{value:"Bonifico a 30 giorni"}});
 fireEvent.change(screen.getByLabelText("Metodo di pagamento"),{target:{value:"riba"}});
 fireEvent.change(screen.getByLabelText("Email destinatario"),{target:{value:"acquisti@esempio.it"}});
 fireEvent.click(screen.getByRole("button",{name:"Salva dettagli ordine"}));
 await waitFor(()=>expect(save).toHaveBeenCalledWith(expect.objectContaining({payment_terms:"Bonifico a 30 giorni",payment_method:"riba",document_details:expect.objectContaining({destinatarioEmail:"acquisti@esempio.it"})})));
});
it("se il salvataggio fallisce mantiene il testo e permette di riprovare",async()=>{
 render(<OdaDettagliCard {...props} onSave={vi.fn().mockRejectedValue(new Error("offline"))}/>);
 fireEvent.click(screen.getByRole("button",{name:"Modifica dettagli"}));
 fireEvent.change(screen.getByLabelText("Istruzioni per consegna o accesso"),{target:{value:"Chiamare prima dello scarico"}});
 fireEvent.click(screen.getByRole("button",{name:"Salva dettagli ordine"}));
 expect(await screen.findByRole("alert")).toHaveTextContent("Dettagli non salvati");
 expect(screen.getByLabelText("Istruzioni per consegna o accesso")).toHaveValue("Chiamare prima dello scarico");
 expect(screen.getByRole("button",{name:"Salva dettagli ordine"})).toBeEnabled();
});
it("il ripristino delle condizioni usa l’anagrafica e l’annullamento non scrive",()=>{
 const save=vi.fn();render(<OdaDettagliCard {...props} documento={{...documento,pagamento:"Contanti"}} onSave={save}/>);
 fireEvent.click(screen.getByRole("button",{name:"Modifica dettagli"}));fireEvent.click(screen.getByRole("button",{name:"Usa condizioni del fornitore"}));expect(screen.getByLabelText("Condizioni di pagamento dell’ordine")).toHaveValue(props.condizioniFornitore);fireEvent.click(screen.getByRole("button",{name:"Annulla"}));expect(save).not.toHaveBeenCalled();
});
it("nasconde la modifica a chi consulta soltanto",()=>{render(<OdaDettagliCard {...props} canEdit={false} onSave={vi.fn()}/>);expect(screen.queryByRole("button",{name:"Modifica dettagli"})).not.toBeInTheDocument();});
