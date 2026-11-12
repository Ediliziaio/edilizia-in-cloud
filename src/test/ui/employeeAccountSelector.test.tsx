import { afterEach,expect,it,vi } from "vitest";
import { cleanup,fireEvent,render,screen,waitFor } from "@testing-library/react";
import { CreateUserWizard } from "@/components/users/CreateUserWizard";
const state=vi.hoisted(()=>({loading:false,error:false}));
vi.mock("@/hooks/useEmployeeAccountOptions",()=>({useEmployeeAccountOptions:()=>({options:[{id:"existing-worker",first_name:"Sauro",last_name:"Stacchetti",email:"sauro@example.test"}],loading:state.loading,error:state.error})}));
afterEach(()=>{cleanup();state.loading=false;state.error=false;});
it("scegliere il personale esistente passa il suo ID alla creazione dell’accesso",async()=>{
 const onSubmit=vi.fn().mockResolvedValue({});
 render(<CreateUserWizard companyId="company" open onOpenChange={()=>{}} onSubmit={onSubmit}/>);
 fireEvent.click(screen.getByText("Operaio / Tecnico"));
 fireEvent.change(screen.getByLabelText("Scheda del personale"),{target:{value:"existing-worker"}});
 fireEvent.click(screen.getByRole("button",{name:/crea utente/i}));
 await waitFor(()=>expect(onSubmit).toHaveBeenCalledTimes(1));
 expect(onSubmit.mock.calls[0][0]).toMatchObject({employee_id:"existing-worker",first_name:"Sauro",last_name:"Stacchetti",email:"sauro@example.test",role_type:"employee"});
});
it("se il personale non può essere verificato, la creazione operaio resta bloccata",()=>{
 state.error=true;
 render(<CreateUserWizard companyId="company" open onOpenChange={()=>{}} onSubmit={vi.fn()}/>);
 fireEvent.click(screen.getByText("Operaio / Tecnico"));
 expect(screen.getByRole("button",{name:/crea utente/i})).toBeDisabled();
 expect(screen.getByRole("alert")).toHaveTextContent("Non riesco a verificare il personale");
});
