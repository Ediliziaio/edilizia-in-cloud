import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const headers = readFileSync(resolve(process.cwd(), "public/_headers"), "utf8");
const policy = headers.split("\n").find(line => line.trim().startsWith("Content-Security-Policy:")) ?? "";
const directives = new Map(policy.replace(/^\s*Content-Security-Policy:\s*/, "").split(";").map(part => {
  const [name, ...sources] = part.trim().split(/\s+/);
  return [name, sources] as const;
}));

function allowed(directive: string, target: string) {
  const url = new URL(target);
  return (directives.get(directive) ?? directives.get("default-src") ?? []).some(source => {
    if (source === "'self'") return url.protocol === "https:" && url.origin === "https://app.ediliziaincloud.com";
    if (source === "blob:") return url.protocol === "blob:";
    const host = /^(https|wss):\/\/(\*\.)?([^/]+)$/.exec(source);
    return !!host && url.protocol === `${host[1]}:` && (host[2] ? url.hostname.endsWith(`.${host[3]}`) : url.host === host[3]);
  });
}

describe("Production Fish voice transport and generated audio", () => {
  it.each([
    "https://demo.livekit.cloud/settings/regions",
    "wss://demo.livekit.cloud/rtc",
    "wss://demo.ofrankfurt1a.production.livekit.cloud/rtc",
  ])("allows the SDK transport request %s", url => {
    expect(allowed("connect-src", url)).toBe(true);
  });

  it("plays generated MP3 blobs and signed recordings from the existing storage", () => {
    expect(allowed("media-src", "blob:https://app.ediliziaincloud.com/00000000-0000-4000-8000-000000000000")).toBe(true);
    expect(allowed("media-src", "https://synthetic.supabase.co/storage/v1/object/sign/calls/demo.mp3?token=synthetic")).toBe(true);
  });

  it("keeps unrelated and insecure network destinations blocked", () => {
    expect(allowed("connect-src", "wss://demo.livekit.cloud.example.invalid/rtc")).toBe(false);
    expect(allowed("connect-src", "https://example.invalid/settings/regions")).toBe(false);
    expect(allowed("connect-src", "http://demo.livekit.cloud/settings/regions")).toBe(false);
    expect(allowed("media-src", "https://example.invalid/audio.mp3")).toBe(false);
  });

  it("does not enable blob scripts or change the microphone and camera policy", () => {
    expect(directives.get("script-src")).not.toContain("blob:");
    expect(directives.get("worker-src")).toContain("blob:");
    expect(headers).toContain("Permissions-Policy: camera=(), microphone=(self), geolocation=()");
  });
});
