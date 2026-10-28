import { it, expect, vi } from "vitest";
import { readAllPages } from "@/lib/personale/readAllPages";
it("reads all pages and never truncates at the API limit",async()=>{
 const read=vi.fn(async(from:number,to:number)=>({data:Array.from({length:Math.max(0,Math.min(to+1,1003)-from)},(_,i)=>i+from),error:null}));
 expect(await readAllPages(read)).toHaveLength(1003);expect(read).toHaveBeenCalledTimes(3);
});
it("rejects partial totals if a later page fails",async()=>{
 const read=async(from:number)=>({data:from===0?Array(500).fill(1):null,error:from===0?null:new Error("page failed")});
 await expect(readAllPages(read)).rejects.toThrow("page failed");
});
