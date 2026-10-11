import { describe, expect, it, vi } from "vitest";
import { dispatchVoiceCampaign } from "../../../supabase/functions/_shared/voiceCampaignDispatch";
const claim={id:"recipient",company_id:"company",agent_id:"agent",contact_id:"contact",claim_token:"token"};
function db(data:any=claim,error:any=null) {
 return {rpc:vi.fn(async(name:string,_args?:any)=>name==="claim_voice_campaign_contact"?{data,error}:{error:null})};
}
function response(body:any,status=200){return new Response(JSON.stringify(body),{status});}
describe("safe voice campaign dispatcher",()=>{
 it("does not call the provider when no eligible claim exists",async()=>{
  const client=db(null);const send=vi.fn();
  expect(await dispatchVoiceCampaign(client,"https://local.test","service",send)).toEqual({processed:0});
  expect(send).not.toHaveBeenCalled();
 });
 it("does not call after a failed claim",async()=>{
  const send=vi.fn();await expect(dispatchVoiceCampaign(db(null,{message:"locked"}),"https://local.test","service",send)).rejects.toThrow();
  expect(send).not.toHaveBeenCalled();
 });
 it("sends the trusted queue token and records only a confirmed conversation",async()=>{
  const client=db();const send=vi.fn(async(_url:string,_options:RequestInit)=>response({success:true,conversation_id:"conversation"}));
  expect(await dispatchVoiceCampaign(client,"https://local.test","service",send)).toMatchObject({started:true});
  expect(JSON.parse(send.mock.calls[0][1]!.body as string)).toMatchObject({company_id:"company",contact_id:"contact",campaign_recipient_id:"recipient",campaign_claim_token:"token"});
  expect(client.rpc).toHaveBeenLastCalledWith("finish_voice_campaign_attempt",expect.objectContaining({p_state:"in_chiamata",p_conversation_id:"conversation"}));
  expect(send).toHaveBeenCalledTimes(1);
 });
 it.each([response({error:"bad gateway"},502),response({success:true}),response({outcome_unknown:true},400)])("never retries unknown outcomes",async res=>{
  const client=db();const send=vi.fn(async()=>res);
  expect(await dispatchVoiceCampaign(client,"https://local.test","service",send)).toMatchObject({uncertain:true});
  expect(send).toHaveBeenCalledTimes(1);
  expect(client.rpc).toHaveBeenLastCalledWith("finish_voice_campaign_attempt",expect.objectContaining({p_state:"esito_incerto"}));
 });
 it("a timeout is paused and not retried",async()=>{
  const client=db();const send=vi.fn(async()=>{throw new Error("timeout");});
  expect(await dispatchVoiceCampaign(client,"https://local.test","service",send)).toMatchObject({uncertain:true});
  expect(send).toHaveBeenCalledTimes(1);
 });
 it.each([400,401,402,409,429,403])("pauses configuration, billing and plan errors (%s)",async status=>{
  const client=db();await dispatchVoiceCampaign(client,"https://local.test","service",vi.fn(async()=>response({error:"not available"},status)));
  expect(client.rpc).toHaveBeenLastCalledWith("finish_voice_campaign_attempt",expect.objectContaining({p_state:"in_coda"}));
 });
 it("fresh opt-out is excluded, not treated as a plan error",async()=>{
  const client=db();await dispatchVoiceCampaign(client,"https://local.test","service",vi.fn(async()=>response({contact_excluded:true},403)));
  expect(client.rpc).toHaveBeenLastCalledWith("finish_voice_campaign_attempt",expect.objectContaining({p_state:"escluso"}));
 });
 it("deleted contacts cannot block the rest of a campaign",async()=>{
  const client=db({...claim,contact_id:null});const send=vi.fn();await dispatchVoiceCampaign(client,"https://local.test","service",send);
  expect(send).not.toHaveBeenCalled();
  expect(client.rpc).toHaveBeenLastCalledWith("finish_voice_campaign_attempt",expect.objectContaining({p_state:"escluso"}));
 });
 it("a failed outcome save cannot imply successful dispatch",async()=>{
  const client=db();client.rpc.mockImplementation(async(name:string)=>name==="claim_voice_campaign_contact"?{data:claim,error:null}:{error:{message:"db unavailable"}} as any);
  await expect(dispatchVoiceCampaign(client,"https://local.test","service",vi.fn(async()=>response({success:true,conversation_id:"call"})))).rejects.toThrow("coda resta bloccata");
 });
});
