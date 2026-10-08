import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { WhatsAppComposer } from "@/components/whatsapp/WhatsAppComposer";
vi.mock("@/hooks/whatsapp/useWhatsAppNumbers", () => ({ useWhatsAppNumbers: () => ({ data: [{ id: "number", stato: "active", webhook_verified: true }] }) }));
vi.mock("@/hooks/whatsapp/useWhatsAppCompliance", () => ({ useWhatsAppWindow: () => ({ data: { open: true }, isLoading: false }), useApprovedTemplates: () => ({ data: [] as unknown[] }) }));
afterEach(cleanup);
describe("WhatsApp composer preserves intent and draft", () => {
  it("preserves a new AI draft arriving during an earlier send", async () => {
    let resolve!: (value: boolean) => void;
    const onSend = vi.fn(() => new Promise<boolean>(r => { resolve = r; }));
    const view = render(<WhatsAppComposer phone="0000" onSend={onSend} compatto />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Prima bozza" } });
    fireEvent.click(screen.getByRole("button", { name: /invia/i }));
    view.rerender(<WhatsAppComposer phone="0000" onSend={onSend} compatto seedText="Nuova bozza AI" seedAt={1} />);
    resolve(true);
    await waitFor(() => expect(screen.getByRole("button", { name: /invia/i })).not.toBeDisabled());
    expect(screen.getByRole("textbox")).toHaveValue("Nuova bozza AI");
    expect(onSend).toHaveBeenCalledTimes(1);
  });
  it("does not clear a draft when the caller omits acknowledgement", async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    render(<WhatsAppComposer phone="0000" onSend={onSend} compatto />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Bozza senza ricevuta" } });
    fireEvent.click(screen.getByRole("button", { name: /invia/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Invio non confermato");
    expect(screen.getByRole("textbox")).toHaveValue("Bozza senza ricevuta");
    expect(onSend).toHaveBeenCalledTimes(1);
  });
  it("locks immediately against double clicks and clears only on success", async () => {
    let resolve!: (value: boolean) => void;
    const onSend = vi.fn(() => new Promise<boolean>(r => { resolve = r; }));
    render(<WhatsAppComposer phone="0000" onSend={onSend} compatto />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Messaggio fittizio" } });
    const button = screen.getByRole("button", { name: /invia/i });
    fireEvent.click(button); fireEvent.click(button);
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("textbox")).toHaveValue("Messaggio fittizio");
    resolve(true);
    await waitFor(() => expect(screen.getByRole("textbox")).toHaveValue(""));
  });
  it("keeps failed text and the same idempotency key; editing creates a new intent", async () => {
    const onSend = vi.fn().mockResolvedValue(false);
    render(<WhatsAppComposer phone="0000" onSend={onSend} compatto />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Prima bozza" } });
    fireEvent.click(screen.getByRole("button", { name: /invia/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("testo è conservato");
    expect(screen.getByRole("textbox")).toHaveValue("Prima bozza");
    const key = onSend.mock.calls[0][0].idempotencyKey;
    fireEvent.click(screen.getByRole("button", { name: /invia/i }));
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(2));
    expect(onSend.mock.calls[1][0].idempotencyKey).toBe(key);
    await screen.findByRole("alert");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Nuova bozza" } });
    fireEvent.click(screen.getByRole("button", { name: /invia/i }));
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(3));
    expect(onSend.mock.calls[2][0].idempotencyKey).not.toBe(key);
  });
  it("handles thrown timeouts without losing text or sending again automatically", async () => {
    const onSend = vi.fn().mockRejectedValue(new Error("Esito incerto"));
    render(<WhatsAppComposer phone="0000" onSend={onSend} compatto />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Bozza" } });
    fireEvent.click(screen.getByRole("button", { name: /invia/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Esito incerto");
    expect(screen.getByRole("textbox")).toHaveValue("Bozza");
    expect(onSend).toHaveBeenCalledTimes(1);
  });
});
