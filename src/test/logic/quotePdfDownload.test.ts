/// <reference types="node" />
import { Blob as NodeBlob } from "node:buffer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchQuotePdf } from "@/lib/preventivi/quotePdfDownload";
beforeEach(() => vi.stubGlobal("Blob", NodeBlob));
afterEach(() => vi.unstubAllGlobals());
describe("download PDF preventivo", () => {
  it.each([undefined, null, "", "  "])("rifiuta URL assente: %s", async url => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(fetchQuotePdf(url)).rejects.toThrow("PDF non disponibile");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([403, 404, 500])("rifiuta HTTP %s anche con estensione .pdf", async status => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("expired", { status })));
    await expect(fetchQuotePdf("https://example.invalid/quote.pdf")).rejects.toThrow("Download PDF non riuscito");
  });
  it.each(["", "<html>error</html>", '{"error":"expired"}'])("rifiuta contenuto non PDF: %s", async content => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(content, { headers: { "content-type": "application/pdf" } })));
    await expect(fetchQuotePdf("https://example.invalid/quote.pdf")).rejects.toThrow("non è un PDF valido");
  });
  it("accetta PDF binario anche se lo storage non indica il MIME", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("%PDF-1.7\nfixture\n%%EOF"));
    vi.stubGlobal("fetch", fetcher);
    const blob = await fetchQuotePdf("https://example.invalid/quote.pdf");
    expect(blob.type).toBe("application/pdf");
    expect(await blob.text()).toContain("%PDF-1.7");
    expect(fetcher).toHaveBeenCalledWith(expect.any(String), { signal: expect.any(AbortSignal) });
  });
  it("propaga errori di rete senza creare download", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(fetchQuotePdf("https://example.invalid/quote.pdf")).rejects.toThrow("offline");
  });
});
