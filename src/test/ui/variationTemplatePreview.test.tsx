import "@testing-library/jest-dom/vitest";
import { useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VariationTemplatePreview } from "@/components/orders/VariationTemplatePreview";
import { VARIATION_TEMPLATE_EXAMPLES } from "@/lib/orders/variationTemplates";
const mock = vi.hoisted(() => ({ build: vi.fn(), create: vi.fn(), revoke: vi.fn(), mountedKeys: [] as string[] }));
vi.mock("@/lib/orders/variationTemplateExample", async importOriginal => {
  const original = await importOriginal<typeof import("@/lib/orders/variationTemplateExample")>();
  return { ...original, variationTemplateExamplePdf: mock.build };
});
vi.mock("@/components/shared/PdfBlobLivePreviewPanel", () => ({ PdfBlobLivePreviewPanel: ({ renderBlobUrl, depsKey, downloadFileName, showDownloadOnMobile }: { renderBlobUrl: () => Promise<string>; depsKey: string; downloadFileName: string; showDownloadOnMobile: boolean }) => {
  const [url, setUrl] = useState(""); mock.mountedKeys.push(depsKey);
  return <><button onClick={async () => setUrl(await renderBlobUrl())}>Generate preview</button>{url && <a href={url} download={downloadFileName}>Download current</a>}<span>{showDownloadOnMobile ? "mobile-download" : "desktop-only"}</span></>;
} }));
beforeEach(() => {
  vi.clearAllMocks(); mock.mountedKeys = []; mock.create.mockReturnValue("blob:current");
  vi.stubGlobal("URL", { createObjectURL: mock.create, revokeObjectURL: mock.revoke });
  mock.build.mockResolvedValue({ output: () => new Blob(["DEMO"], { type: "application/pdf" }) });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("Anteprima visiva del modello", () => {
  const content = VARIATION_TEMPLATE_EXAMPLES[0];
  it("usa il PDF reale e consente il download anche sul telefono", async () => {
    render(<VariationTemplatePreview content={content} scope="company" />);
    fireEvent.click(screen.getByRole("button", { name: "Generate preview" }));
    expect(await screen.findByRole("link", { name: "Download current" })).toHaveAttribute("download", "esempio-modello-variante.pdf");
    expect(mock.build).toHaveBeenCalledWith(content); expect(mock.create).toHaveBeenCalledOnce(); expect(screen.getByText("mobile-download")).toBeInTheDocument();
  });
  it("nasconde il vecchio download subito dopo una modifica e libera il blob", async () => {
    const view = render(<VariationTemplatePreview content={content} scope="company" />);
    fireEvent.click(screen.getByRole("button", { name: "Generate preview" })); await screen.findByRole("link", { name: "Download current" });
    view.rerender(<VariationTemplatePreview content={{ ...content, conditions_text: "Nuove condizioni" }} scope="company" />);
    expect(screen.queryByRole("link", { name: "Download current" })).not.toBeInTheDocument(); expect(mock.revoke).toHaveBeenCalledWith("blob:current");
  });
  it("una generazione completata dopo cambio modello non crea un URL fuori contesto", async () => {
    let finish!: (value: unknown) => void; mock.build.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const view = render(<VariationTemplatePreview content={content} scope="company" />);
    fireEvent.click(screen.getByRole("button", { name: "Generate preview" })); await waitFor(() => expect(mock.build).toHaveBeenCalledOnce());
    view.rerender(<VariationTemplatePreview content={{ ...content, primary_color: "#14532d" }} scope="company" />);
    await act(async () => { finish({ output: () => new Blob(["OLD"]) }); });
    expect(mock.create).not.toHaveBeenCalled(); expect(screen.queryByRole("link", { name: "Download current" })).not.toBeInTheDocument();
  });
  it("rinominare il modello non rigenera le pagine; cambiare azienda cancella l'anteprima", async () => {
    const view = render(<VariationTemplatePreview content={content} scope="company" />);
    fireEvent.click(screen.getByRole("button", { name: "Generate preview" })); await screen.findByRole("link", { name: "Download current" });
    view.rerender(<VariationTemplatePreview content={{ ...content, name: "Nuovo nome libreria" }} scope="company" />);
    expect(screen.getByRole("link", { name: "Download current" })).toBeInTheDocument();
    view.rerender(<VariationTemplatePreview content={content} scope="other" />);
    expect(screen.queryByRole("link", { name: "Download current" })).not.toBeInTheDocument();
  });
});
