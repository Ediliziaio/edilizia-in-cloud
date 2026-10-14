import { describe,expect,it,vi } from "vitest";
import { readFileSync } from "node:fs";
describe("Google full-sync propagates incomplete reads",()=>{
  it("preserves HTTP 502 and does not continue reconciliation",async()=>{
    const source=readFileSync("supabase/functions/google-calendar-sync/index.ts","utf8");
    const body=source.match(/async function fullSync\(userId: string, companyId: string\): Promise<Response> \{([\s\S]*?)\n\}/)![1];
    const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
    const run=new AsyncFunction("cleanupCrmDuplicates","pullBusySlots","reconcilePrimary","json","userId","companyId",body);
    const reconcile=vi.fn();
    const response=await run(async()=>({cleaned:0}),async()=>Response.json({error:"Incomplete calendar"},{status:502}),
      reconcile,(body:unknown,status=200)=>Response.json(body,{status}),"user","company");
    expect(response.status).toBe(502);expect(reconcile).not.toHaveBeenCalled();
  });
});
