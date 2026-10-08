/// <reference types="node" />
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { AgentThinking, PixelDotsLoader } from "@/components/ui/ai-agent-response";
import { SilvioRequestStatus } from "@/components/silvio/SilvioRequestStatus";
import { SilvioAnswer } from "@/components/silvio/SilvioAnswer";

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("Silvio: animated waiting without invented progress", () => {
  it("renders nine decorative dots with staggered chevron timing", () => {
    const { container } = render(<PixelDotsLoader />);
    expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
    const dots = container.querySelectorAll(".silvio-pixel-dot");
    expect(dots).toHaveLength(9);
    expect(Array.from(dots).map(dot => (dot as HTMLElement).style.animationDelay))
      .toEqual(["90ms", "180ms", "270ms", "0ms", "90ms", "180ms", "90ms", "180ms", "270ms"]);
  });
  it("waits for real activity events rather than advancing a simulated timeline", () => {
    vi.useFakeTimers();
    render(<SilvioRequestStatus phase="waiting" />);
    act(() => vi.advanceTimersByTime(120_000));
    expect(screen.getByRole("status")).toHaveTextContent("Silvio sta preparando la risposta…");
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.queryByText(/completat|analizzo|attività avviate/i)).toBeNull();
  });
  it("reflects request prop changes, not elapsed-time phase guesses", () => {
    const ui = render(<SilvioRequestStatus phase="sending" />);
    expect(screen.getByRole("status")).toHaveTextContent("Invio della domanda…");
    ui.rerender(<SilvioRequestStatus phase="waiting" />);
    expect(screen.getByRole("status")).toHaveTextContent("sta preparando la risposta");
    ui.rerender(<SilvioRequestStatus phase="recovering" />);
    expect(screen.getByRole("status")).toHaveTextContent("Recupero la risposta salvata…");
  });
  it("shows only received activities and never marks tool starts as completed", () => {
    const ui = render(<SilvioRequestStatus phase="waiting" activities={[{ id: "a", label: "Analizzo i cantieri" }]} />);
    expect(screen.getByText("Analizzo i cantieri")).toBeVisible();
    ui.rerender(<SilvioRequestStatus phase="waiting" activities={[
      { id: "a", label: "Analizzo i cantieri" }, { id: "b", label: "Controllo fatture e pagamenti" },
    ]} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Attività avviate · 2")).toBeVisible();
    expect(screen.queryByText(/completat|riuscit/i)).toBeNull();
    expect(ui.container.querySelector(".lucide-check")).toBeNull();
  });
  it("deduplicates real IDs, ignores empty events and hides legacy tool names", () => {
    render(<AgentThinking label="In attesa" activities={[
      { id: "a", label: "Eseguo: search_brain" }, { id: "a", label: "Duplicato" },
      { id: "b", label: " " }, { id: "", label: "Evento senza ID" },
    ]} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("Consulto i dati disponibili")).toBeVisible();
    expect(screen.queryByText(/search_brain|Duplicato|senza ID/)).toBeNull();
  });
  it("lets users collapse activities without hiding request status or stop", () => {
    const onStop = vi.fn();
    render(<SilvioRequestStatus phase="waiting" onStop={onStop} activities={[{ id: "a", label: "Analizzo i cantieri" }]} />);
    const toggle = screen.getByRole("button", { name: "Nascondi attività avviate" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(toggle);
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.getByRole("status")).toBeVisible();
    expect(screen.getByRole("button", { name: "Mostra attività avviate" })).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(screen.getByRole("button", { name: "Interrompi attesa" }));
    expect(onStop).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Mostra attività avviate" }));
    expect(screen.getByText("Analizzo i cantieri")).toBeVisible();
  });
  it.each(["sending", "recovering"] as const)("does not show obsolete activities during %s", phase => {
    render(<SilvioRequestStatus phase={phase} activities={[{ id: "a", label: "Analizzo i cantieri" }]} />);
    expect(screen.queryByRole("list")).toBeNull();
  });
  it("disables every animation for reduced motion and keeps high-contrast text readable", () => {
    const css = readFileSync("src/components/ui/ai-agent-response.css", "utf8");
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*\.silvio-pixel-dot,[\s\S]*\.silvio-thinking-shimmer,[\s\S]*\.silvio-thinking-step\s*\{\s*animation: none;/);
    expect(css).toMatch(/@media \(forced-colors: active\)[\s\S]*color: CanvasText/);
  });
  it("keeps the same animation during streaming and removes it when the answer is complete", () => {
    const ui = render(<SilvioAnswer content="" streaming />);
    expect(ui.container.querySelectorAll(".silvio-pixel-dot")).toHaveLength(9);
    expect(screen.getByRole("status")).toHaveTextContent("sta preparando");
    ui.rerender(<SilvioAnswer content="Sintesi" streaming />);
    expect(screen.getByRole("status")).toHaveTextContent("sta scrivendo");
    expect(ui.container.querySelectorAll(".silvio-pixel-grid")).toHaveLength(1);
    ui.rerender(<SilvioAnswer content="Sintesi" />);
    expect(ui.container.querySelector(".silvio-pixel-grid")).toBeNull();
    expect(screen.getByRole("button", { name: "Copia risposta" })).toBeVisible();
  });
});
