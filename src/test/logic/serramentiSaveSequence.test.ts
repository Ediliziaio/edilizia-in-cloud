import { describe, expect, it, vi } from "vitest";
import { salvaPoiSincronizza } from "@/lib/serramenti/salvataggioSequenziale";

describe("window before complements", () => {
  it("does not change complements when the window write fails", async () => {
    const follow = vi.fn();
    await expect(salvaPoiSincronizza(() => Promise.reject(new Error("failed")), follow)).rejects.toThrow("failed");
    expect(follow).not.toHaveBeenCalled();
  });
  it("waits for the window write before following its dimensions", async () => {
    let finish!: () => void;
    const saved = new Promise<void>((resolve) => { finish = resolve; });
    const follow = vi.fn(async () => {});
    const job = salvaPoiSincronizza(() => saved, follow);
    await Promise.resolve();
    expect(follow).not.toHaveBeenCalled();
    finish();
    await job;
    expect(follow).toHaveBeenCalledOnce();
  });
});
