import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SilvioAnswer } from "@/components/silvio/SilvioAnswer";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const answer = '**Una priorità.**\n\n| Commessa | Prossimo passo |\n| --- | --- |\n| DEMO-001 | Verifica le ore |\n\nMancano i costi: budget non verificabile.';
const raw = `Preambolo interno.\n\n${JSON.stringify({ thinking: "SECRET", confidence: "high", answer })}`;

describe("Readable Silvio streaming", () => {
  it("formats unfinished emphasis and waits for a complete code block", () => {
    const ui = render(<SilvioAnswer content="**Una priorità" streaming />);
    expect(screen.getByText("Una priorità").tagName).toBe("STRONG");
    ui.rerender(<SilvioAnswer content={'Sintesi.\n```json\n{"product":"cemento"'} streaming />);
    expect(screen.getByText("Sintesi.")).toBeVisible();
    expect(ui.container.textContent).not.toContain("product");
    ui.rerender(<SilvioAnswer content={'Sintesi.\n```json\n{"product":"cemento"}\n```'} streaming />);
    expect(ui.container.querySelector("code")).toHaveTextContent('{"product":"cemento"}');
  });
  it("renders Markdown while receiving a partial envelope, without metadata or copy actions", () => {
    const ui = render(<SilvioAnswer content={'{"thinking":"SECRET'} streaming />);
    expect(screen.getByRole("status")).toHaveTextContent("sta preparando");
    expect(ui.container.textContent).not.toContain("SECRET");
    ui.rerender(<SilvioAnswer content={raw.slice(0, -2)} streaming />);
    expect(screen.getByText("Una priorità.").tagName).toBe("STRONG");
    expect(screen.getByRole("table")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("sta scrivendo");
    expect(screen.queryByRole("button", { name: "Copia risposta" })).toBeNull();
    expect(ui.container.textContent).not.toMatch(/SECRET|thinking|confidence|Preambolo/);
  });
  it("recovers a saved legacy response and copies only the complete public answer", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const ui = render(<SilvioAnswer content={raw} streaming />);
    ui.rerender(<SilvioAnswer content={raw} />);
    expect(screen.queryByText("Silvio sta scrivendo…")).toBeNull();
    expect(screen.getByText("Mancano i costi: budget non verificabile.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Copia risposta" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledExactlyOnceWith(answer));
    expect(ui.container.textContent).not.toMatch(/SECRET|confidence|thinking/);
  });
  it("does not expose private reasoning when no answer is available", () => {
    const ui = render(<SilvioAnswer content={'{"thinking":"SECRET"}'} />);
    expect(screen.getByText(/Non è disponibile una risposta leggibile/)).toBeVisible();
    expect(ui.container.textContent).not.toContain("SECRET");
  });
  it("does not show a sources panel during streaming or after completion", () => {
    const sources = [{ id: "S1", title: "Rapportino", snippet: "Ore da confermare", similarity: 0.8 }];
    const ui = render(<SilvioAnswer content={raw} streaming sources={sources} />);
    expect(screen.queryByText(/Fonti disponibili/)).toBeNull();
    ui.rerender(<SilvioAnswer content={raw} sources={sources} />);
    expect(screen.queryByText(/Fonti disponibili/)).toBeNull();
    expect(screen.queryByText("Ore da confermare")).toBeNull();
    expect(ui.container.querySelector("details")).toBeNull();
  });
  it("keeps one semantic table with labelled mobile cells, without duplicating values", () => {
    const ui = render(<SilvioAnswer content={answer} />);
    expect(screen.getAllByRole("table")).toHaveLength(1);
    expect(screen.getAllByText("DEMO-001")).toHaveLength(1);
    expect(ui.container.querySelector("tbody")).toHaveClass("max-sm:grid");
    expect(ui.container.querySelector('td span[aria-hidden="true"]')).toHaveTextContent("Prossimo passo");
  });
});
