import { describe, it, expect } from "vitest";
import { shouldReply, selectReplyIndexes } from "../../../supabase/functions/_shared/outreach-warmup-engage";

describe("shouldReply", () => {
  it("tasso 0.5 → una sì una no", () => {
    expect([0, 1, 2, 3].map((i) => shouldReply(i, 0.5))).toEqual([true, false, true, false]);
  });
  it("tasso ~0.33 → una ogni tre", () => {
    expect([0, 1, 2, 3, 4, 5].map((i) => shouldReply(i, 0.33))).toEqual([true, false, false, true, false, false]);
  });
  it("tasso 0 → mai", () => {
    expect([0, 1, 2].some((i) => shouldReply(i, 0))).toBe(false);
  });
  it("tasso 1 → sempre", () => {
    expect([0, 1, 2].every((i) => shouldReply(i, 1))).toBe(true);
  });
});

describe("selectReplyIndexes", () => {
  it("seleziona la frazione attesa", () => {
    expect(selectReplyIndexes(6, 0.5)).toEqual([0, 2, 4]);
    expect(selectReplyIndexes(6, 0.33)).toEqual([0, 3]);
  });
  it("zero coppie → vuoto", () => {
    expect(selectReplyIndexes(0, 0.5)).toEqual([]);
  });
});
