import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {MemoryRouter,useLocation} from "react-router-dom";
import {beforeEach,afterEach,describe,expect,it,vi} from "vitest";
import {OrderSurveysCard} from "@/components/orders/OrderSurveysCard";
import {makeSurveyDetail} from "../fixtures/surveyDetail";
import type {SurveyRow} from "@/types/surveys";
import type {AppointmentData} from "@/components/appointments/AppointmentDialog";
const m=vi.hoisted(()=>({surveys:[] as SurveyRow[],appointments:[] as AppointmentData[],readOnly:false,canEdit:true,allowed:true,failed:false,from:vi.fn(),filters:[] as unknown[][],create:vi.fn(),calendar:vi.fn(),detail:vi.fn(),update:vi.fn()}));
vi.mock("@/contexts/AuthContext",()=>({useAuth:()=>({effectiveCompany:{id:"c1"}})}));
vi.mock("@/hooks/usePermissions",()=>({usePermissions:()=>({solaLettura:m.readOnly,canEditOrders:m.canEdit,canViewOrders:true,canViewSopralluoghi:m.allowed})}));
vi.mock("@/hooks/useCompanyStaffUsers",()=>({useCompanyStaffUsers:()=>({data:[{id:"t1",first_name:"Luca",last_name:"Tecnico"}]})}));
vi.mock("@/lib/api/surveys",()=>({listSurveysByOrder:async()=>m.surveys,sopralluoghiDaAgganciare:async():Promise<never[]>=>[],agganciaSopralluogo:vi.fn(),updateSurvey:m.update}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{from:m.from}}));
vi.mock("@/components/orders/OrderSurveyCreateDialog",()=>({OrderSurveyCreateDialog:(props:{commessa:object;onClose:()=>void;onCreated:(id:string)=>void})=>{m.create(props.commessa);return <div role="dialog" aria-label="Crea rilievo"><button onClick={props.onClose}>Chiudi creazione</button><button onClick={()=>props.onCreated("nuovo")}>Simula creazione</button></div>;}}));
vi.mock("@/components/sopralluoghi/SurveyDetailDialog",()=>({SurveyDetailDialog:(props:{surveyId:string;orderId:string;initialEditing:boolean;onClose:()=>void})=>{m.detail(props);return <div role="dialog" aria-label="Dettaglio rilievo"><button onClick={props.onClose}>Chiudi dettaglio</button></div>;}}));
vi.mock("@/components/appointments/AppointmentDialog",()=>({AppointmentDialog:(props:{defaultOrderId:string;showOrderSelect:boolean;readOnly:boolean;onOpenChange:(open:boolean)=>void})=>{m.calendar(props);return <div role="dialog" aria-label="Agenda"><button onClick={()=>props.onOpenChange(false)}>Chiudi agenda</button></div>;}}));
const appointment=(id:string,extra:Partial<AppointmentData>={}):AppointmentData=>({id,title:`Visita ${id}`,description:null,appointment_type:"rilievo_tecnico",appointment_date:"2026-11-20",appointment_time:"09:00:00",assigned_to:"t1",order_id:"o1",is_completed:false,...extra});
beforeEach(()=>{
 vi.clearAllMocks();m.readOnly=false;m.canEdit=true;m.allowed=true;m.failed=false;m.filters=[];
 m.surveys=[{...makeSurveyDetail().survey,id:"s1",code:"SOP-1",status:"completed",appointment_id:"a1"}];
 m.appointments=[appointment("a1"),appointment("a2"),appointment("a3",{status:"annullato"}),appointment("a4",{is_completed:true})];
 m.from.mockImplementation(()=>{const q={select:()=>q,eq:(...args:unknown[])=>{m.filters.push(args);return q;},order:()=>q,range:async()=>({data:m.failed?null:m.appointments,error:m.failed?new Error("offline"):null})};return q;});
});
afterEach(cleanup);
function Location(){return <output aria-label="Pagina corrente">{useLocation().pathname}</output>;}
function draw(){const client=new QueryClient({defaultOptions:{queries:{retry:false}}});return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/azienda/ordini/o1?tab=cantiere&vista_cantiere=sopralluoghi"]}><OrderSurveysCard orderId="o1" orderCode="ORD-1" clientId="cliente1" clientName="Mario Rossi" address="Via Test 8" /><Location/></MemoryRouter></QueryClientProvider>);}
describe("Sopralluoghi dentro la commessa",()=>{
 it("riunisce agenda e rilievi, con filtri reali e senza doppioni",async()=>{
  draw();await screen.findByRole("table",{name:"Sopralluoghi della commessa"});
  expect(await screen.findByRole("button",{name:"Tutti: 4 sopralluoghi"})).toBeInTheDocument();expect(screen.queryByRole("button",{name:"Visita a1"})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"Effettuati: 2 sopralluoghi"}));expect(screen.getByRole("button",{name:"SOP-1"})).toBeInTheDocument();expect(screen.getByRole("button",{name:"Visita a4"})).toBeInTheDocument();expect(screen.queryByRole("button",{name:"Visita a2"})).not.toBeInTheDocument();
  expect(m.filters).toEqual(expect.arrayContaining([["company_id","c1"],["order_id","o1"]]));expect(m.update).not.toHaveBeenCalled();
 });
 it("cerca e recupera dai risultati vuoti senza cambiare dati",async()=>{
  draw();await screen.findByRole("button",{name:"SOP-1"});fireEvent.change(screen.getByRole("textbox",{name:"Cerca sopralluoghi della commessa"}),{target:{value:"inesistente"}});
  expect(screen.getByText("Nessun sopralluogo con questi filtri")).toBeInTheDocument();fireEvent.click(screen.getByRole("button",{name:"Azzera filtri"}));expect(screen.getByRole("button",{name:"SOP-1"})).toBeInTheDocument();expect(m.update).not.toHaveBeenCalled();
 });
 it("fissa una visita in popup con la commessa già selezionata",async()=>{
  draw();fireEvent.click(screen.getByRole("button",{name:"Fissa sopralluogo"}));await screen.findByRole("dialog",{name:"Agenda"});
  expect(m.calendar).toHaveBeenCalledWith(expect.objectContaining({defaultOrderId:"o1",showOrderSelect:false,defaultAppointmentType:"rilievo_tecnico",requireTime:true}));expect(screen.getByLabelText("Pagina corrente")).toHaveTextContent("/azienda/ordini/o1");
 });
 it("nuovo rilievo e compilazione restano in popup sulla stessa commessa",async()=>{
  draw();fireEvent.click(screen.getByRole("button",{name:"Nuovo sopralluogo"}));await screen.findByRole("dialog",{name:"Crea rilievo"});
  expect(m.create).toHaveBeenCalledWith(expect.objectContaining({orderId:"o1",clientId:"cliente1",address:"Via Test 8"}));
  fireEvent.click(screen.getByRole("button",{name:"Simula creazione"}));await screen.findByRole("dialog",{name:"Dettaglio rilievo"});
  expect(m.detail).toHaveBeenCalledWith(expect.objectContaining({surveyId:"nuovo",orderId:"o1",initialEditing:true}));expect(screen.getByLabelText("Pagina corrente")).toHaveTextContent("/azienda/ordini/o1");
 });
 it("in sola lettura si consulta senza comandi di scrittura",async()=>{
  m.readOnly=true;draw();await screen.findByRole("button",{name:"SOP-1"});
  expect(screen.getByRole("button",{name:"Nuovo sopralluogo"})).toBeDisabled();expect(screen.getByRole("button",{name:"Fissa sopralluogo"})).toBeDisabled();expect(screen.queryByRole("button",{name:"Compila"})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"Visita a2"}));await screen.findByRole("dialog",{name:"Agenda"});expect(m.calendar).toHaveBeenCalledWith(expect.objectContaining({readOnly:true}));
 });
 it("un guasto all'agenda non viene presentato come elenco completo",async()=>{
  m.failed=true;draw();expect(await screen.findByRole("alert")).toHaveTextContent("Agenda non disponibile");expect(await screen.findByRole("button",{name:"SOP-1"})).toBeInTheDocument();
 });
 it("rispetta il permesso Sopralluoghi prima di leggere l'agenda",async()=>{
  m.allowed=false;draw();expect(screen.getByText(/serve il permesso/)).toBeInTheDocument();await waitFor(()=>expect(m.from).not.toHaveBeenCalled());expect(screen.queryByRole("button",{name:"Nuovo sopralluogo"})).not.toBeInTheDocument();
 });
});
