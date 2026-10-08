import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SilvioAnswer } from "@/components/silvio/SilvioAnswer";
import { useSilvioChatScroll } from "@/hooks/useSilvioChatScroll";
import { shouldSendSilvioOnEnter } from "@/lib/silvio/composerKeyboard";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Silvio reading and composing", () => {
  it("copies the entire answer only after a deliberate click", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const content = "**Margine stimato**: 18%.\nMancano le ore: verifica prima di decidere.";
    render(<SilvioAnswer content={content} />);
    expect(writeText).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Copia risposta" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Risposta copiata."));
    expect(writeText).toHaveBeenCalledExactlyOnceWith(content);
  });
  it.each(["denied", "unavailable"])("does not claim copied when clipboard is %s", async reason => {
    vi.stubGlobal("navigator", { clipboard: reason === "denied" ? { writeText: vi.fn().mockRejectedValue(new Error("denied")) } : undefined });
    render(<SilvioAnswer content="Dati da verificare" />);
    fireEvent.click(screen.getByRole("button", { name: "Copia risposta" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Copia non riuscita"));
    expect(screen.queryByText("Copiata")).toBeNull();
  });
  it("resets copied state when the answer changes", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    const ui = render(<SilvioAnswer content="Prima risposta" />);
    fireEvent.click(screen.getByRole("button", { name: "Copia risposta" }));
    await screen.findByText("Copiata");
    ui.rerender(<SilvioAnswer content="Risposta aggiornata" />);
    expect(screen.queryByText("Copiata")).toBeNull();
  });
  it("does not add a copy button for empty content", () => {
    render(<SilvioAnswer content=" " />);
    expect(screen.queryByRole("button")).toBeNull();
  });
  it.each([
    ["Enter", false, false, 13, true],
    ["Enter", true, false, 13, false],
    ["Enter", false, true, 13, false],
    ["Enter", false, false, 229, false],
    ["a", false, false, 65, false],
  ])("handles key %s, shift %s, composing %s, code %s", (key, shiftKey, isComposing, keyCode, expected) => {
    expect(shouldSendSilvioOnEnter({ key, shiftKey, nativeEvent: { isComposing, keyCode } })).toBe(expected);
  });
});

function ScrollFixture({ latest = "one", open = true, channel = "a", history = false, hasMessages = true }) {
  const { scrollRef, contentRef, onScroll, showScrollDown, scrollToBottom, hasNewReply } = useSilvioChatScroll({ latestMessage: latest, open, channelId: channel, hasMessages });
  return <><div ref={scrollRef} onScroll={onScroll} data-testid="viewport"><div ref={contentRef}>{history && "Older"}{latest}</div></div>
    {showScrollDown && <button onClick={scrollToBottom}>{hasNewReply ? "Nuovi messaggi" : "Vai in fondo"}</button>}</>;
}
function metrics() {
  const el = screen.getByTestId("viewport");
  Object.defineProperties(el, { scrollHeight: { configurable: true, value: 1200 }, clientHeight: { configurable: true, value: 300 } });
  return el;
}
describe("Silvio respects the reader's position", () => {
  it("follows new content when reading the bottom", () => {
    const ui = render(<ScrollFixture />); const el = metrics(); el.scrollTop = 900;
    fireEvent.scroll(el);
    ui.rerender(<ScrollFixture latest="two" />);
    expect(el.scrollTop).toBe(1200);
    expect(screen.queryByRole("button")).toBeNull();
  });
  it("leaves history in place on new replies and returns only on request", () => {
    const ui = render(<ScrollFixture />); const el = metrics(); el.scrollTop = 100; fireEvent.scroll(el);
    ui.rerender(<ScrollFixture latest="two" />);
    expect(el.scrollTop).toBe(100);
    fireEvent.click(screen.getByRole("button", { name: "Nuovi messaggi" }));
    expect(el.scrollTop).toBe(1200);
    expect(screen.queryByRole("button")).toBeNull();
  });
  it("does not mistake prepended history for a new reply", () => {
    const ui = render(<ScrollFixture />); const el = metrics(); el.scrollTop = 100; fireEvent.scroll(el);
    ui.rerender(<ScrollFixture history />);
    expect(el.scrollTop).toBe(100);
    expect(screen.getByRole("button", { name: "Vai in fondo" })).toBeVisible();
  });
  it("resets position on another conversation and reopening", () => {
    const ui = render(<ScrollFixture />); const el = metrics(); el.scrollTop = 100; fireEvent.scroll(el);
    ui.rerender(<ScrollFixture channel="b" />); expect(el.scrollTop).toBe(1200);
    el.scrollTop = 100; fireEvent.scroll(el);
    ui.rerender(<ScrollFixture channel="b" open={false} />);
    ui.rerender(<ScrollFixture channel="b" />); expect(el.scrollTop).toBe(1200);
  });
  it("scrolls to history that arrives after opening", () => {
    const ui = render(<ScrollFixture hasMessages={false} />); const el = metrics();
    ui.rerender(<ScrollFixture />); expect(el.scrollTop).toBe(1200);
  });
  it("follows late image layout only when the reader has not scrolled away", () => {
    let resize: () => void = () => {};
    const disconnect = vi.fn();
    vi.stubGlobal("ResizeObserver", class { constructor(callback: () => void) { resize = callback; } observe() {} disconnect = disconnect; });
    const ui = render(<ScrollFixture />); const el = metrics();
    act(() => resize()); expect(el.scrollTop).toBe(1200);
    el.scrollTop = 100; fireEvent.scroll(el);
    act(() => resize()); expect(el.scrollTop).toBe(100);
    ui.unmount(); expect(disconnect).toHaveBeenCalled();
  });
});
