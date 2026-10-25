import { describe, expect, it } from "vitest";
import { localPlanRequestAllowed, planFileExtension, localPlanOcrPlugin } from "../../../dev/preventivatore-ai/planOcrPlugin.mts";
import type { IncomingMessage } from "node:http";
const req = (remote = "127.0.0.1", host = "127.0.0.1:8081", origin = "http://127.0.0.1:8081", site = "same-origin") => ({ socket: { remoteAddress: remote }, headers: { host, origin, "sec-fetch-site": site } }) as Pick<IncomingMessage, "socket" | "headers">;
describe("OCR dev privato: nessuna apertura a terzi o accesso arbitrario ai file", () => {
  it("esiste solo nel server di sviluppo", () => expect(localPlanOcrPlugin().apply).toBe("serve"));
  it("accetta la pagina locale con origine identica", () => expect(localPlanRequestAllowed(req())).toBe(true));
  it.each([
    req("192.168.1.4"), req("127.0.0.1", "evil.example:8081", "http://evil.example:8081"),
    req("127.0.0.1", "localhost:8081", "https://evil.example"), req("127.0.0.1", "127.0.0.1:8081", "http://127.0.0.1:8081", "cross-site"),
    req("127.0.0.1", "localhost:8081", ""),
  ])("rifiuta host, origine o connessione non locale %#", input => expect(localPlanRequestAllowed(input)).toBe(false));
  it("riconosce il contenuto, non si fida del nome o del MIME", () => {
    expect(planFileExtension(new Uint8Array([255, 216, 255]))).toBe("jpg");
    expect(planFileExtension(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]))).toBe("png");
    expect(planFileExtension(new TextEncoder().encode("%PDF-1.7"))).toBe("pdf");
    expect(() => planFileExtension(new TextEncoder().encode("<script>"))).toThrow();
    expect(() => planFileExtension(new Uint8Array([]))).toThrow();
  });
});
