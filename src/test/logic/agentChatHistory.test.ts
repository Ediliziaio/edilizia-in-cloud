import { describe, it, expect, vi } from "vitest";
import { agentChatHistory } from "../../../supabase/functions/_shared/agentChatHistory";
const company="11111111-2222-4333-8444-555555555555";
const session="aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
function db(parent: any = { id: session }, rows: any[] = []) {
 const calls: { table: string; steps: any[][] }[] = [];
 return { calls, rpc: vi.fn(async () => ({ data: { sessions: [], has_more: false }, error: null as null })),
 from(table: string) { const q={table,steps:[] as any[][]}; calls.push(q);
  const chain: any=new Proxy({}, {get(_,key) { if(key==="then") return (ok:any,bad:any)=>Promise.resolve({
    data: table.endsWith("sessions") ? parent : rows, error: null }).then(ok,bad);
    return (...args:any[])=>{q.steps.push([key,...args]);return chain;};}}); return chain;
 }};
}
describe("integrated tenant-scoped chat history",()=>{
 it("passes only validated filters and a bounded search to the internal RPC",async()=>{
  const client=db(); await agentChatHistory(client,company,"chat_sessions",{page:1,source:"sito",status:"attiva",search:" x "});
  expect(client.rpc).toHaveBeenCalledWith("agent_chat_history",{p_company_id:company,p_page:1,p_source:"sito",p_status:"attiva",p_search:"x"});
 });
 it.each([{page:-1},{page:0.5},{page:10001},{source:"other"},{status:"unknown"}])("rejects invalid filters %j",async filters=>{
  const client=db(); await expect(agentChatHistory(client,company,"chat_sessions",filters)).rejects.toThrow();
  expect(client.rpc).not.toHaveBeenCalled();
 });
 it("checks parent tenant before reading any transcript",async()=>{
  const client=db(null); await expect(agentChatHistory(client,company,"chat_messages",{session_id:session,source:"sito"})).rejects.toThrow();
  expect(client.calls).toHaveLength(1);
  expect(client.calls[0].steps).toContainEqual(["eq","company_id",company]);
 });
 it("normalizes widget messages, hides internal metadata and limits each page",async()=>{
  const client=db({id:session},Array.from({length:201},(_,i)=>({id:String(i),role:"assistant",content:"hello",created_at:"2026-10-11"})));
  const result=await agentChatHistory(client,company,"chat_messages",{session_id:session,source:"sito",page:1});
  expect(result.messages).toHaveLength(200);expect(result.has_more).toBe(true);
  expect(result.messages[0]).toEqual({id:"0",ruolo:"assistant",contenuto:"hello",creato_il:"2026-10-11"});
  expect(client.calls[1].steps).toContainEqual(["in","role",["user","assistant","agent"]]);
  expect(client.calls[1].steps).toContainEqual(["range",200,400]);
  expect(client.calls[1].steps).toContainEqual(["select","id,role,content,created_at"]);
 });
 it.each(["bad","';DROP TABLE x;"])("rejects invalid session identifiers %s",async id=>{
  const client=db();await expect(agentChatHistory(client,company,"chat_messages",{session_id:id,source:"sito"})).rejects.toThrow();
  expect(client.calls).toHaveLength(0);
 });
});
