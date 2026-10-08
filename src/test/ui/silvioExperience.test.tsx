import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SilvioAnswer } from "@/components/silvio/SilvioAnswer";
import { SilvioContextBar } from "@/components/silvio/SilvioContextBar";
import { SilvioRequestStatus } from "@/components/silvio/SilvioRequestStatus";
import { SilvioActionSummary } from "@/components/silvio/SilvioActionSummary";
import { AiMessageMetaTop, AiMessageMetaBottom } from "@/components/silvio/AiMessageMeta";
import { resolveSilvioPageContext } from "@/hooks/useSilvioPageContext";
import { silvioContextSuggestions } from "@/lib/silvio/contextSuggestions";

const id = "1778464d-0839-4011-a3f8-d267f7c9120f";
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("Silvio: clear, contextual, accessible experience", () => {
  it.each(["ordini", "commesse"])("recognizes the actual %s order route", area => {
    expect(resolveSilvioPageContext(`/azienda/${area}/${id}`, "finanza")).toMatchObject({ entity_type: "order", entity_id: id });
  });
  it("never mistakes creation routes or invalid IDs for an order", () => {
    expect(resolveSilvioPageContext("/azienda/ordini/nuovo")).toBeNull();
    expect(resolveSilvioPageContext(`/azienda/ordini/${id}junk`)).toBeNull();
    expect(resolveSilvioPageContext("/azienda/ordini")).toMatchObject({ entity_type: "cantiere_overview", entity_id: null });
  });
  it("offers at most three relevant questions", () => {
    const context = resolveSilvioPageContext(`/azienda/ordini/${id}`);
    const questions = silvioContextSuggestions(context);
    expect(questions).toHaveLength(3);
    expect(questions.every(q => q.includes("commessa"))).toBe(true);
    expect(silvioContextSuggestions(null)).toHaveLength(3);
  });
  it("lets the user explicitly disable the next question's page reference", () => {
    const onToggle = vi.fn(); const context = resolveSilvioPageContext(`/azienda/ordini/${id}`)!;
    const ui = render(<SilvioContextBar context={context} enabled onToggle={onToggle} />);
    const button = screen.getByRole("button", { name: "Non usare questa pagina come riferimento" });
    expect(button).toHaveAttribute("aria-pressed", "true"); fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledOnce();
    ui.rerender(<SilvioContextBar context={context} enabled={false} onToggle={onToggle} />);
    expect(screen.getByRole("button", { name: "Usa questa pagina come riferimento" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText(/La cronologia resta invariata/)).toBeInTheDocument();
  });
  it("does not invent stages or completion as time elapses", () => {
    vi.useFakeTimers(); render(<SilvioRequestStatus phase="waiting" />);
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByRole("status")).toHaveTextContent("sta preparando la risposta");
    expect(screen.queryByText(/interrogando|analizzando|completata/i)).toBeNull();
    expect(screen.getByText(/Non serve reinviare/)).toBeInTheDocument();
  });
  it("does not claim that a question is saved before delivery is confirmed", () => {
    vi.useFakeTimers(); render(<SilvioRequestStatus phase="sending" />);
    act(() => vi.advanceTimersByTime(20_000));
    expect(screen.getByText("L’invio non è ancora confermato.")).toBeInTheDocument();
    expect(screen.queryByText(/Non serve reinviare/)).toBeNull();
  });
  it("shows recovery in place and exposes a keyboard-accessible stop", () => {
    const onStop = vi.fn(); render(<SilvioRequestStatus phase="recovering" onStop={onStop} />);
    expect(screen.getByRole("status")).toHaveTextContent("Recupero la risposta salvata");
    fireEvent.click(screen.getByRole("button", { name: "Interrompi attesa" }));
    expect(onStop).toHaveBeenCalledOnce();
  });
  it("preserves all caveats without displaying a sources panel", () => {
    const source = { id: "S1", title: "Rapportini demo", similarity: 0.8, snippet: "Estratto dimostrativo" };
    render(<SilvioAnswer content="Margine stimato: 18%. Mancano le ore degli ultimi tre giorni." sources={[source, source]} />);
    expect(screen.getByText(/Mancano le ore/)).toBeVisible();
    expect(screen.queryByText(/Fonti disponibili/)).toBeNull();
    expect(screen.queryByText("Rapportini demo")).toBeNull();
    expect(screen.queryByText("Estratto dimostrativo")).toBeNull();
    expect(screen.getByRole("button", { name: "Copia risposta" })).toBeVisible();
  });
  it("does not fabricate sources when there are none", () => {
    render(<SilvioAnswer content="Dati insufficienti." />);
    expect(screen.queryByText(/Fonti disponibili/)).toBeNull();
  });
  it("tolerates malformed legacy sources without breaking the answer", () => {
    render(<SilvioAnswer content="Risposta leggibile" sources={[null, { id: "S1", title: 42 }] as never} />);
    expect(screen.getByText("Risposta leggibile")).toBeVisible();
    expect(screen.queryByText(/Fonti disponibili/)).toBeNull();
  });
  it("keeps human review and uncertainty visible in plain Italian", () => {
    render(<AiMessageMetaTop meta={{ ai_confidence: "low", ai_requires_human_review: true }} />);
    expect(screen.getByText("Da verificare prima di agire")).toBeVisible();
    expect(screen.getByText("Risposta incerta")).toBeVisible();
  });
  it("deduplicates suggestions, limits them to three and never renders inert buttons", () => {
    const meta = { followup_suggestions: ["Uno", " Uno ", "", "Due", "Tre", "Quattro"] };
    const onAskFollowup = vi.fn(); const ui = render(<AiMessageMetaBottom meta={meta} onAskFollowup={onAskFollowup} />);
    expect(screen.getAllByRole("button")).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "Due" })); expect(onAskFollowup).toHaveBeenCalledWith("Due");
    ui.rerender(<AiMessageMetaBottom meta={meta} />); expect(screen.queryByRole("button")).toBeNull();
  });
  it("previews the draft recipient and lines without internal secrets", () => {
    render(<SilvioActionSummary actionType="create_quote_draft" payload={{ __tool_meta: { secret: "DO-NOT-SHOW" }, input: {
      client_name: "Cliente Demo", client_email: "demo@example.test", amount: 0,
      items: [{ name: "Posa piastrelle", quantity: 5, unit_price: 20 }],
    } }} />);
    expect(screen.getByText(/Non la invia al cliente/)).toBeVisible();
    expect(screen.getByText(/Cliente Demo/)).toBeVisible();
    expect(screen.getByText(/^0,00\s*€$/)).toBeVisible();
    expect(screen.queryByText(/DO-NOT-SHOW/)).toBeNull();
    fireEvent.click(screen.getByText("Controlla le voci e i prezzi"));
    expect(screen.getByText("IVA: da verificare")).toBeVisible();
  });
});
