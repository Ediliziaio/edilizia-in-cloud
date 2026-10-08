import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { confermaNavigazioneImpostazioni, useSettingsDraftGuard } from "@/hooks/useSettingsDraftGuard";

function Draft({ dirty }: { dirty: boolean }) {
  const canLeave = useSettingsDraftGuard(dirty);
  return <><a href="/azienda/impostazioni/sedi"><span>Sedi</span></a><a href={`${window.location.pathname}${window.location.search}#sezione`}>Sezione</a><a href="/azienda/impostazioni/sedi" target="_blank">Nuova scheda</a><button onClick={() => canLeave()}>Cambia tab</button></>;
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("Protezione delle modifiche alle impostazioni", () => {
  it("protegge anche la ricerca e non lascia protezioni attive dopo lo smontaggio", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { unmount } = render(<Draft dirty />);
    expect(confermaNavigazioneImpostazioni()).toBe(false);
    expect(confirm).toHaveBeenCalledOnce();
    unmount();
    expect(confermaNavigazioneImpostazioni()).toBe(true);
    expect(confirm).toHaveBeenCalledOnce();
  });
  it("annullare impedisce il link anche cliccando un elemento interno", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<Draft dirty />);
    expect(fireEvent.click(screen.getByText("Sedi"))).toBe(false);
    expect(confirm).toHaveBeenCalledTimes(1);
  });
  it("confermare permette il link", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<Draft dirty />);
    expect(fireEvent.click(screen.getByText("Sedi"))).toBe(true);
    expect(confirm).toHaveBeenCalledTimes(1);
  });
  it("senza modifiche non interrompe la navigazione", () => {
    const confirm = vi.spyOn(window, "confirm");
    render(<Draft dirty={false} />);
    expect(fireEvent.click(screen.getByText("Sedi"))).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });
  it("non interrompe nuova scheda, click modificati o sezioni della stessa pagina", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<Draft dirty />);
    expect(fireEvent.click(screen.getByText("Nuova scheda"))).toBe(true);
    expect(fireEvent.click(screen.getByText("Sedi"), { ctrlKey: true })).toBe(true);
    expect(fireEvent.click(screen.getByText("Sezione"))).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });
  it("protegge il cambio tab esplicito e il ricaricamento", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<Draft dirty />);
    fireEvent.click(screen.getByText("Cambia tab"));
    expect(confirm).toHaveBeenCalledOnce();
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
  it("rimuove le protezioni dopo salvataggio o smontaggio", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { rerender, unmount } = render(<Draft dirty />);
    rerender(<Draft dirty={false} />);
    expect(fireEvent.click(screen.getByText("Sedi"))).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
    unmount();
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});
