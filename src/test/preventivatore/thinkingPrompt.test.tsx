import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThinkingProgress, ThinkingPromptInput, type ThinkingStep } from "@/components/ui/thinking-prompt-input";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const steps: ThinkingStep[] = [{ id: "read", text: "Controllo dati", status: "active" }, { id: "apply", text: "Aggiorno bozza", status: "pending" }];

describe("fasi operative pubbliche controllate", () => {
  it("non fa avanzare o completare le fasi autonomamente", () => {
    render(<ThinkingProgress status="thinking" steps={steps} elapsedSeconds={8} simulated />);
    const list = screen.getByRole("list", { name: "Fasi operative" });
    expect(list.querySelector('[data-step-state="active"]')).toHaveTextContent("Controllo dati");
    expect(list.querySelector('[data-step-state="pending"]')).toHaveTextContent("Aggiorno bozza");
    expect(list.querySelector('[data-step-state="complete"]')).toBeNull();
    expect(screen.getByRole("button", { name: /Elaborazione in corso · simulazione/ })).toBeDisabled();
  });
  it("lo stato finale non dichiara completati passaggi ancora pendenti", () => {
    const { rerender } = render(<ThinkingProgress status="done" steps={steps} />);
    expect(screen.getByRole("button", { name: /Stato dei passaggi/ })).toHaveAttribute("aria-expanded", "false");
    rerender(<ThinkingProgress status="done" steps={steps.map(s => ({ ...s, status: "complete" }))} />);
    fireEvent.click(screen.getByRole("button", { name: /Passaggi completati/ }));
    expect(screen.getByRole("list", { name: "Fasi operative" })).toBeVisible();
  });
  it("segnala interruzione e normalizza tempi non finiti", () => {
    render(<ThinkingProgress status="stopped" steps={[{ ...steps[0], status: "stopped" }, steps[1]]} elapsedSeconds={Infinity} />);
    fireEvent.click(screen.getByRole("button", { name: /Operazione interrotta.*0s/ }));
    expect(screen.getByRole("list").querySelector('[data-step-state="stopped"]')).toHaveTextContent("interrotta");
    expect(screen.queryByText("Passaggi completati")).toBeNull();
  });
});

describe("composer animato del preventivo", () => {
  const props = () => ({ value: "Una richiesta", onValueChange: vi.fn(), onSubmit: vi.fn(), onStop: vi.fn(), busy: false });
  it("supporta Invio ma non invia durante composizione IME o Maiusc+Invio", () => {
    const p = props(); render(<ThinkingPromptInput {...p} />);
    const input = screen.getByRole("textbox");
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    expect(p.onSubmit).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter" }); expect(p.onSubmit).toHaveBeenCalledOnce();
  });
  it("in elaborazione Interrompi non invia e conserva il testo in bozza", () => {
    const p = props(); render(<ThinkingPromptInput {...p} busy />);
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Interrompi risposta" }));
    expect(p.onStop).toHaveBeenCalledOnce(); expect(p.onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox")).toHaveValue("Una richiesta");
  });
  it("disabilita l'invio vuoto e applica il limite del messaggio", () => {
    render(<ThinkingPromptInput {...props()} value="  " />);
    expect(screen.getByRole("button", { name: "Invia messaggio" })).toBeDisabled();
    expect(screen.getByRole("textbox")).toHaveAttribute("maxlength", "3000");
  });
  it("rispetta movimento ridotto anche per l'animazione nativa dell'input", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
    const p = props(); const { rerender } = render(<ThinkingPromptInput {...p} />);
    const animate = vi.fn(); Object.defineProperty(screen.getByRole("textbox"), "animate", { value: animate, configurable: true });
    rerender(<ThinkingPromptInput {...p} value="Un messaggio diverso e più lungo" />);
    expect(animate).not.toHaveBeenCalled();
  });
});
