import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { pickPublicApiKey, probeDatabase, runSentinel } from "../../../scripts/sentinella-database.mjs";

const anon="a."+Buffer.from(JSON.stringify({role:"anon"})).toString("base64url")+".c";
const service="a."+Buffer.from(JSON.stringify({role:"service_role"})).toString("base64url")+".c";
const env={TOKEN:"test-management",REF:"rsbrguhkodgnqfomrevo",SUPABASE_PUBLISHABLE_KEY:anon};
describe("independent sentinel measures the actual public API",()=>{
 it("never uses secret/service-role keys as a public probe",()=>{
  expect(pickPublicApiKey([{type:"secret",api_key:"sb_secret_not-public"},{api_key:service}])).toBeNull();
  expect(pickPublicApiKey([{api_key:service},{api_key:anon}])).toBe(anon);
  expect(pickPublicApiKey([{type:"publishable",api_key:"sb_publishable_test",disabled:true}])).toBeNull();
 });
 it("a healthy check uses one small attempt, not three",async()=>{
  const send=vi.fn().mockResolvedValueOnce(Response.json(true)).mockResolvedValueOnce(Response.json([{ok:1}]));
  const wait=vi.fn();const result=await runSentinel(env,send,wait);
  expect(result.healthy).toBe(true);expect(result.attempts).toHaveLength(1);expect(send).toHaveBeenCalledTimes(2);expect(wait).not.toHaveBeenCalled();
 });
 it("Management API SELECT 1 cannot hide a broken public REST path",async()=>{
  const send=vi.fn((url:string)=>Promise.resolve(url.includes("api.supabase.com")?Response.json([{ok:1}]):new Response("",{status:503})));
  const result=await runSentinel(env,send,vi.fn());expect(result.healthy).toBe(false);expect(result.attempts).toHaveLength(3);
 });
 it("an administrative outage is distinguished from app availability",async()=>{
  const send=vi.fn().mockResolvedValueOnce(Response.json(true)).mockResolvedValueOnce(new Response("",{status:503}));
  const result=await runSentinel(env,send,vi.fn());expect(result.healthy).toBe(true);expect(result.managementHealthy).toBe(false);
 });
 it("200 with an error object is not a successful database probe",async()=>{
  const send=vi.fn().mockResolvedValueOnce(Response.json({error:"failure"})).mockResolvedValueOnce(Response.json([{ok:1}]));
  expect((await probeDatabase({ref:env.REF,token:env.TOKEN,publicKey:anon},send)).publicApi.outcome).toBe("failed");
 });
 it("measures elapsed milliseconds including intervals over a minute",async()=>{
  const send=vi.fn().mockResolvedValueOnce(Response.json(true)).mockResolvedValueOnce(Response.json([{ok:1}]));
  const clock=vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(90_000).mockReturnValueOnce(90_000).mockReturnValueOnce(90_001);
  const result=await probeDatabase({ref:env.REF,token:env.TOKEN,publicKey:anon},send,clock);
  expect(result.publicApi.durationMs).toBe(90_000);expect(result.publicApi.outcome).toBe("slow");
 });
 it("test mode is explicit and cannot accidentally report green",async()=>{
  const send=vi.fn((url:string)=>Promise.resolve(url.includes("api.supabase.com")?Response.json([{ok:1}]):Response.json(true)));
  expect((await runSentinel({...env,PROVA:"true"},send,vi.fn())).healthy).toBe(false);
 });
 it("the internal heartbeat uses gateway timing, not pg_net batch timestamps",()=>{
  const sql=readFileSync("supabase/migrations/20281013110000_battito_verifica_misura_reale.sql","utf8");
  expect(sql).toContain("x-envoy-upstream-service-time");expect(sql).not.toContain("EXTRACT(MILLISECONDS");expect(sql).not.toContain("r.created - b.avviato_il");
  expect(sql).toContain("FROM PUBLIC,anon,authenticated");expect(sql).toContain("LIMIT 1000");
 });
});
