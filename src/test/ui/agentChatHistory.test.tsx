import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
const mocks=vi.hoisted(()=>({query:vi.fn(),history:vi.fn()}));
vi.mock("@tanstack/react-query",()=>({useQuery:(options:any)=>mocks.query(options)}));
vi.mock("@/hooks/useEffectiveCompanyId",()=>({useEffectiveCompanyId:()=>"company"}));
vi.mock("@/lib/agentChatHistory",()=>({agentChatHistoryRequest:(...args:any[])=>mocks.history(...args)}));
import { ChatConversazioniTab } from "@/components/agenti/ChatConversazioniTab";
const site={id:"session",source:"sito",canale:"widget sito",stato:"attiva",iniziata_il:"invalid",messaggi_totali:3,durata_secondi:30,agent_nome:"Visitatore del sito"};
beforeEach(()=>{mocks.query.mockReset();mocks.history.mockReset();});
afterEach(cleanup);
describe("chat history UI",()=>{
 it("shows server errors rather than an empty history",()=>{
  mocks.query.mockReturnValue({isError:true,error:new Error("Server non aggiornato"),refetch:vi.fn()});
  render(<ChatConversazioniTab/>);
  expect(screen.getByRole("alert")).toHaveTextContent("Server non aggiornato");
  expect(screen.queryByText("Nessuna sessione chat")).not.toBeInTheDocument();
 });
 it("keeps source and company in transcript requests and handles invalid dates",async()=>{
  mocks.query.mockImplementation((q:any)=>q.queryKey[0]==="chat-sessions"
   ?{data:{sessions:[site],has_more:true},isLoading:false}
   :{data:{messages:[],has_more:false},isLoading:false});
  render(<ChatConversazioniTab/>);
  expect(screen.getByText("Data non disponibile")).toBeInTheDocument();
  fireEvent.click(screen.getByText("Visitatore del sito"));
  const query=mocks.query.mock.calls.filter(([q])=>q.queryKey[0]==="chat-messages").at(-1)![0];
  expect(query.enabled).toBe(true);await query.queryFn();
  expect(mocks.history).toHaveBeenCalledWith("company","chat_messages",{session_id:"session",source:"sito",page:0});
 });
 it("paginates the complete server-side history",async()=>{
  mocks.query.mockImplementation((q:any)=>q.queryKey[0]==="chat-sessions"
   ?{data:{sessions:[site],has_more:true},isLoading:false}:{isLoading:false});
  render(<ChatConversazioniTab/>);
  fireEvent.click(screen.getByRole("button",{name:"Successive"}));
  expect(screen.getByText("Pagina 2")).toBeInTheDocument();
  const query=mocks.query.mock.calls.filter(([q])=>q.queryKey[0]==="chat-sessions").at(-1)![0];
  await query.queryFn();expect(mocks.history).toHaveBeenCalledWith("company","chat_sessions",expect.objectContaining({page:1}));
 });
});
