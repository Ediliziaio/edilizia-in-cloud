import { describe, it, expect, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn() } }));
import { supabase } from "@/integrations/supabase/client";
import { excludeArchivedOrders, loadArchivedOrderIds } from "./archivedOrderScope";
const id = (n: number) => `00000000-0000-4000-a000-${String(n).padStart(12,"0")}`;

describe("retired job scope", () => {
  it("keeps unlinked operational rows and chunks exclusions before counting/pagination", () => {
    const query = { or: vi.fn().mockReturnThis() };
    expect(excludeArchivedOrders(query, Array.from({length:101},(_,n)=>id(n)),"order_id")).toBe(query);
    expect(query.or).toHaveBeenCalledTimes(2);
    expect(query.or.mock.calls[0][0]).toMatch(/^order_id.is.null,order_id.not.in.\(/);
    expect(query.or.mock.calls[1][0]).toBe(`order_id.is.null,order_id.not.in.(${id(100)})`);
  });
  it("does not filter an empty archive", () => {
    const query = { or: vi.fn().mockReturnThis() };
    excludeArchivedOrders(query, []);
    expect(query.or).not.toHaveBeenCalled();
  });
  it("rejects injectable IDs before changing a query", () => {
    const query = { or: vi.fn().mockReturnThis() };
    expect(()=>excludeArchivedOrders(query,["x),id.not.is.null"])).toThrow();
    expect(query.or).not.toHaveBeenCalled();
  });
  it("loads all archive pages with tenant scoping", async () => {
    const query = { select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),not:vi.fn().mockReturnThis(),order:vi.fn().mockReturnThis(),range:vi.fn()
      .mockResolvedValueOnce({data:Array.from({length:500},(_,n)=>({id:id(n)})),error:null})
      .mockResolvedValueOnce({data:[{id:id(500)}],error:null}) };
    vi.mocked(supabase.from).mockReturnValue(query as never);
    expect(await loadArchivedOrderIds("tenant-a")).toHaveLength(501);
    expect(query.eq).toHaveBeenNthCalledWith(1,"company_id","tenant-a");
    expect(query.eq).toHaveBeenNthCalledWith(2,"company_id","tenant-a");
    expect(query.range).toHaveBeenNthCalledWith(2,500,999);
  });
  it("fails closed on an archive read error", async () => {
    const query = { select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),not:vi.fn().mockReturnThis(),order:vi.fn().mockReturnThis(),range:vi.fn().mockResolvedValue({data:null,error:new Error("offline")}) };
    vi.mocked(supabase.from).mockReturnValue(query as never);
    await expect(loadArchivedOrderIds("tenant-a")).rejects.toThrow("offline");
    await expect(loadArchivedOrderIds("")).rejects.toThrow("Azienda");
  });
});
