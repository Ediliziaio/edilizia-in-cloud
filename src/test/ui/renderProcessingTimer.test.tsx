import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RenderProcessingCard } from "@/components/render/RenderProcessingCard";

describe("attesa del render sincrono", () => {
  afterEach(() => vi.useRealTimers());
  it("avanza durante la richiesta HTTP e conserva lo stato reale del server", () => {
    vi.useFakeTimers();
    const container = document.createElement("div");
    const root = createRoot(container);
    act(() => root.render(<RenderProcessingCard elapsedSec={0} serverStage="generazione" />));
    act(() => vi.advanceTimersByTime(65_000));
    expect(container.textContent).toContain("65s trascorsi");
    expect(container.textContent).toContain("Elaborazione AI");
    act(() => root.render(<RenderProcessingCard elapsedSec={80} serverStage="controllo_qualita" />));
    expect(container.textContent).toContain("80s trascorsi");
    expect(container.textContent).toContain("Composizione del rendering");
    act(() => root.unmount());
    expect(vi.getTimerCount()).toBe(0);
  });
});
