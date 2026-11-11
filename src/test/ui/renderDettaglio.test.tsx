import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { BeforeAfterSlider } from "@/components/render/BeforeAfterSlider";
import { RenderDetailViewer } from "@/components/render/RenderDetailViewer";

describe("Immagini e confronto del dettaglio", () => {
  it("mostra il risultato intero, affianca la sorgente 3D e consente lo zoom", () => {
    render(
      <RenderDetailViewer
        beforeUrl="source.png"
        afterUrl="actual.png"
        beforeLabel="Modello 3D di partenza"
        title="Bagno"
      />,
    );
    expect(screen.getByRole("img", { name: "Bagno" })).toHaveAttribute(
      "src",
      "actual.png",
    );
    expect(screen.getByRole("img", { name: "Bagno" }).className).toContain(
      "object-contain",
    );
    fireEvent.click(screen.getByRole("button", { name: "Affiancati" }));
    expect(
      screen.getByRole("img", { name: "Modello 3D di partenza" }),
    ).toHaveAttribute("src", "source.png");
    fireEvent.click(
      screen.getByRole("button", { name: "Ingrandisci il render" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Aumenta zoom" }));
    expect(screen.getByText("150%")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ripristina zoom" }));
    expect(screen.getByText("100%")).toBeInTheDocument();
  });
  it("mantiene il risultato accessibile quando manca la sorgente", () => {
    render(<RenderDetailViewer afterUrl="actual.png" title="Giardino" />);
    expect(screen.getByRole("button", { name: "Confronto" })).toBeDisabled();
    expect(screen.getByRole("img", { name: "Giardino" })).toBeInTheDocument();
  });
  it("nel confronto conserva il quadro intero e azzera il caricamento quando cambia risultato", () => {
    const images: Array<{ src: string; onload: (() => void) | null; naturalWidth: number; naturalHeight: number }> = [];
    class TestImage { src = ""; onload: (() => void) | null = null; onerror: (() => void) | null = null; naturalWidth = 1000; naturalHeight = 1200; constructor() { images.push(this); } }
    vi.stubGlobal("Image", TestImage);
    try {
      const { rerender } = render(<BeforeAfterSlider beforeUrl="source.png" afterUrl="first.png" preserveWholeImage beforeLabel="Modello 3D" afterLabel="Risultato AI" />);
      act(() => { images.forEach((image) => image.onload?.()); });
      const result = screen.getByRole("img", { name: "Risultato AI" });
      expect(result.className).toContain("object-contain"); expect(result.className).toContain("opacity-100");
      rerender(<BeforeAfterSlider beforeUrl="source.png" afterUrl="second.png" preserveWholeImage beforeLabel="Modello 3D" afterLabel="Risultato AI" />);
      expect(screen.getByRole("img", { name: "Risultato AI" }).className).toContain("opacity-0");
      act(() => images.at(-1)?.onload?.());
      expect(screen.getByRole("img", { name: "Risultato AI" })).toHaveAttribute("src", "second.png");
      expect(screen.getByRole("img", { name: "Risultato AI" }).className).toContain("opacity-100");
      const slider = screen.getByRole("slider", { name: "Confronta Modello 3D e Risultato AI" });
      fireEvent.keyDown(slider, { key: "End" }); expect(slider).toHaveAttribute("aria-valuenow", "100");
      fireEvent.keyDown(slider, { key: "Home" }); expect(slider).toHaveAttribute("aria-valuenow", "0");
    } finally { vi.unstubAllGlobals(); }
  });

});
