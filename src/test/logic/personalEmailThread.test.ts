import { beforeEach, describe, expect, it, vi } from "vitest";
import { readPersonalEmailThread } from "@/lib/email/personalThread";
const calls = vi.hoisted(() => ({from:vi.fn(),eq:vi.fn(),inside:vi.fn(),order:vi.fn()}));
vi.mock("@/integrations/supabase/client", () => {
  const query = {select:vi.fn().mockReturnThis(),eq:calls.eq,in:calls.inside,order:calls.order};
  calls.eq.mockReturnValue(query);calls.inside.mockReturnValue(query);calls.from.mockReturnValue(query);
  return {supabase:{from:calls.from}};
});
beforeEach(() => {calls.from.mockClear();calls.eq.mockClear();calls.inside.mockClear();calls.order.mockReset();});
describe("Lettura personale di una conversazione email", () => {
  it("vincola un link diretto al proprietario e alle caselle disponibili", async () => {
    calls.order.mockResolvedValue({data:[{id:"message"}],error:null as Error|null});
    await readPersonalEmailThread("thread","me",["mine"]);
    expect(calls.eq).toHaveBeenCalledWith("thread_id","thread");
    expect(calls.eq).toHaveBeenCalledWith("user_id","me");
    expect(calls.inside).toHaveBeenCalledWith("oauth_connection_id",["mine"]);
  });
  it("non effettua una lettura senza identità o con caselle ancora vuote", async () => {
    expect(await readPersonalEmailThread("thread",undefined,["mine"])).toEqual([]);
    expect(await readPersonalEmailThread("thread","me",[])).toEqual([]);
    expect(calls.from).not.toHaveBeenCalled();
  });
  it("propaga un errore senza sostituirlo con una conversazione vuota", async () => {
    calls.order.mockResolvedValue({data:null as unknown[],error:new Error("offline")});
    await expect(readPersonalEmailThread("thread","me",["mine"])).rejects.toThrow("offline");
  });
});
