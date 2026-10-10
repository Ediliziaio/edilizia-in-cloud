import { describe, expect, it } from "vitest";
import { automationWebhookUrl } from "../../../supabase/functions/_shared/automationWebhook";
describe("automation webhook target safety", () => {
  it.each(["https://api.example.com/receive", "http://8.8.8.8/event"])("allows public HTTP(S) %s", url => {
    expect(automationWebhookUrl(url).protocol.startsWith("http")).toBe(true);
  });
  it.each([
    "file:///etc/passwd", "ftp://example.com", "data:text/plain,test", "https://user:secret@example.com",
    "http://localhost", "http://localhost.", "http://test.local", "http://service.internal", "http://internal",
    "http://127.0.0.2", "http://127.1", "http://2130706433", "http://0x7f000001", "http://0.0.0.0",
    "http://10.10.0.1", "http://172.31.255.255", "http://192.168.1.2", "http://169.254.20.1", "http://100.64.1.2",
    "http://[::1]", "http://[::ffff:127.0.0.1]", "http://[fc00::1]",
  ])("rejects internal/invalid target %s", url => {
    expect(() => automationWebhookUrl(url)).toThrow();
  });
});
