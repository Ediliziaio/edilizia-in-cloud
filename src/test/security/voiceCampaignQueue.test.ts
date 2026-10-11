import fs from "node:fs";
import { describe, expect, it } from "vitest";
const queue=fs.readFileSync("supabase/migrations/20281011111000_campagne_voce_coda_sicura.sql","utf8");
const grants=fs.readFileSync("supabase/migrations/20281011112000_agenti_runtime_scritture_solo_server.sql","utf8");
const billingRpc=fs.readFileSync("supabase/migrations/20281011113000_addebiti_ai_rpc_solo_server.sql","utf8");
describe("voice campaign queue cannot bypass editor controls",()=>{
 it("legacy debit RPCs cannot accept browser-supplied costs",()=>{
  for(const signature of ["consume_ai_credits(uuid,numeric,text,uuid,uuid)","deduct_ai_credits_with_markup(uuid,text,text,numeric,integer,integer,uuid,jsonb)"]){
   expect(billingRpc).toContain(`REVOKE ALL ON FUNCTION public.${signature} FROM PUBLIC,anon,authenticated`);
   expect(billingRpc).toContain(`GRANT EXECUTE ON FUNCTION public.${signature} TO service_role`);
  }
 });
 it("browser cannot mutate the queue or fabricate the billing journal",()=>{
  expect(grants).toContain("FROM PUBLIC,anon,authenticated");
  expect(grants).toContain("GRANT SELECT");
  for(const table of ["ai_campaigns_v2","ai_campaign_contacts","ai_agent_conversations","ai_conversations_v2","ai_credit_usage","ai_credit_transactions"])
   expect(grants).toContain(table);
  expect(grants).not.toMatch(/GRANT (ALL|UPDATE|INSERT|DELETE).*TO authenticated/s);
 });
 it("claim and provider start have independent atomic guards",()=>{
  expect(queue).toContain("FOR UPDATE SKIP LOCKED");
  expect(queue).toContain("pg_try_advisory_xact_lock");
  expect(queue).toContain("r.stato='prenotata'");
  expect(queue).toContain("r.metadata->>'claim_token'=p_token::text");
  expect(queue).toContain("c.company_id=p_company_id");
 });
 it("unknown outcomes are paused, not requeued for another phone call",()=>{
  expect(queue).toContain("IF EXISTS(SELECT 1 FROM public.ai_campaign_contacts WHERE campaign_id=c.id AND stato='esito_incerto')");
  expect(queue).toContain("IF p_state IN ('esito_incerto','in_coda')");
 });
 it("cron is created inactive and uses Vault with a short network timeout",()=>{
  expect(queue).toContain("vault.decrypted_secrets");
  expect(queue).toContain("timeout_milliseconds:=15000");
  expect(queue).toContain("active:=false");
 });
});
