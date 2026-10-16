import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
const db = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], fail: false, writes: 0 }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({
  select: () => {
    const filters: Record<string, unknown> = {};
    const q = { eq: (key: string, value: unknown) => { filters[key]=value; return q; }, in: async (_key: string, ids: string[]) => ({ data: db.rows.filter(r => Object.entries(filters).every(([k,v])=>r[k]===v) && ids.includes(String(r.id))).map(r=>({id:r.id})), error: null as null }) };
    return q;
  },
  insert: async (rows: Record<string, unknown>[]) => { db.writes++; if(db.fail)return {error:{message:"Permission denied",code:"42501"}}; db.rows.push(...rows); return {error:null}; },
}) } }));
import { contractOfficeTaskId, saveContractOfficeTasks } from "@/lib/orders/contractOfficeTasks";

beforeEach(()=>{vi.stubGlobal("crypto",webcrypto);db.rows=[];db.writes=0;db.fail=false;});
afterEach(()=>vi.unstubAllGlobals());
describe("adempimenti ufficio separati dai lavori",()=>{
  it("una ripresa non duplica né riapre un adempimento già completato",async()=>{
    const steps=[{nome:"Verifica quota",controlli:["Chiedere ripartizione"]}];
    await saveContractOfficeTasks("azienda-a","ordine-a","utente-a",steps);
    db.rows[0].status="completata";
    await saveContractOfficeTasks("azienda-a","ordine-a","utente-a",steps);
    expect(db.rows).toHaveLength(1);expect(db.writes).toBe(1);expect(db.rows[0].status).toBe("completata");
    expect(db.rows[0]).toMatchObject({assigned_to:null,due_date:null,category:"ordini",company_id:"azienda-a",order_id:"ordine-a"});
  });
  it("separa gli identificativi per ordine e segnala un errore di permesso",async()=>{
    expect(await contractOfficeTaskId("ordine-a","Quota")).not.toBe(await contractOfficeTaskId("ordine-b","Quota"));
    db.fail=true;
    await expect(saveContractOfficeTasks("a","o","u",[{nome:"Quota",controlli:[]}])).rejects.toMatchObject({code:"42501"});
    expect(db.rows).toEqual([]);
  });
});
