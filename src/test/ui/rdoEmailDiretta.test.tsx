vi.mock("@/components/acquisti/StoricoAcquistiCard",()=>({StoricoAcquistiCard:():null=>null}));
import "@testing-library/jest-dom/vitest";
import {render,screen,fireEvent,cleanup} from "@testing-library/react";
import {afterEach,beforeEach,it,expect,vi} from "vitest";
import {MemoryRouter} from "react-router-dom";
import type {DocumentoOperativo} from "@/lib/documentiOperativi/modello";
const m=vi.hoisted(()=>({status:"da_inviare",updateSupplier:vi.fn(),updateRfq:vi.fn()}));
vi.mock("@/contexts/AuthContext",()=>({useAuth:()=>({effectiveCompany:{id:"c",name:"Impresa"}})}));
vi.mock("@tanstack/react-query",()=>({useQuery:()=>({data:[{id:"s",name:"Fornitore",email:"generale@example.invalid",email_ordini:"ordini@example.invalid"}],isFetching:false,isError:false,refetch:vi.fn()})}));
vi.mock("@/hooks/useOperationalSuppliers",()=>({useOperationalSuppliers:()=>({suppliers:[] as unknown[]})}));
vi.mock("@/hooks/useSupplierRfqs",()=>({CANALE_RICHIESTA_LABELS:{app:"App",email:"Email"},totaleRigaOfferta:(): null=>null,useSupplierRfqDetail:()=>({
 rfq:{id:"r",rfq_number:"RDO-9",titolo:"Tegole",status:"inviata",created_at:"2026-11-06",order_id:null as string|null},
 items:[{id:"i",descrizione:"Tegole",quantita:100,unita_misura:"pz"}],fornitori:[{id:"f",supplier_id:"s",status:m.status,suppliers:{name:"Fornitore",email:"generale@example.invalid"}}],quotes:[] as unknown[],isLoading:false,
 updateRfq:{mutate:m.updateRfq},updateFornitore:{mutate:m.updateSupplier},addItem:{mutate:vi.fn()},updateItem:{mutate:vi.fn()},deleteItem:{mutate:vi.fn()},addFornitore:{mutate:vi.fn()},removeFornitore:{mutate:vi.fn()},setQuote:{mutate:vi.fn()},aggiudica:{mutate:vi.fn()},segnaChiesta:{mutate:vi.fn()},registraOfferta:{mutate:vi.fn()},allegaOfferta:{mutate:vi.fn()}
})}));
vi.mock("@/components/orders/OdaFornitoreCard",()=>({OdaFornitoreCard:(): null=>null}));
vi.mock("@/components/orders/FornitoreCombobox",()=>({FornitoreCombobox:(): null=>null}));
vi.mock("@/components/rdo/EstraiOffertaAIDialog",()=>({EstraiOffertaAIDialog:(): null=>null}));
vi.mock("@/components/documentiOperativi/DocumentoEmailDialog",()=>({DocumentoEmailDialog:({open,modo,documento,onSent}:{open:boolean;modo:string;documento:DocumentoOperativo;onSent:()=>void})=>open ? <div role="dialog" aria-label={`Email diretta ${modo}`}><pre data-testid="documento">{JSON.stringify(documento)}</pre><button onClick={onSent}>Simula invio riuscito</button></div> : null}));
import SupplierRfqDetail from "@/pages/azienda/SupplierRfqDetail";
afterEach(cleanup);beforeEach(()=>{m.status="da_inviare";m.updateSupplier.mockReset();m.updateRfq.mockReset();});
const apri=()=>render(<MemoryRouter><SupplierRfqDetail/></MemoryRouter>);
it.each(["testo","PDF"])("la richiesta apre direttamente l’email con %s per il singolo fornitore",modo=>{apri();fireEvent.click(screen.getByRole("button",{name:`Email con ${modo} a Fornitore`}));expect(screen.getByRole("dialog",{name:`Email diretta ${modo.toLowerCase()}`})).toBeInTheDocument();const d=JSON.parse(screen.getByTestId("documento").textContent!);expect(d.tipo).toBe("richiesta");expect(d.destinatario.email).toBe("ordini@example.invalid");expect(d.righe[0].prezzo).toBeNull();expect(m.updateSupplier).not.toHaveBeenCalled();});
it("reinviare a chi ha risposto non cancella lo stato della risposta",()=>{m.status="risposta";apri();fireEvent.click(screen.getByRole("button",{name:"Email con testo a Fornitore"}));fireEvent.click(screen.getByRole("button",{name:"Simula invio riuscito"}));expect(m.updateSupplier).not.toHaveBeenCalled();});

it("una risposta arrivata mentre l’email è aperta viene preservata al successivo invio",()=>{const view=apri();fireEvent.click(screen.getByRole("button",{name:"Email con testo a Fornitore"}));m.status="risposta";view.rerender(<MemoryRouter><SupplierRfqDetail/></MemoryRouter>);fireEvent.click(screen.getByRole("button",{name:"Simula invio riuscito"}));expect(m.updateSupplier).not.toHaveBeenCalled();});
