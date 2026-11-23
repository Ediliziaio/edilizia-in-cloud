import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useUnaVolta } from "@/hooks/campo/useUnaVolta";

describe("Doppio tocco sulla timbratura (collaudo 23/11)", () => {
  it("due tocchi nello stesso istante fanno partire una sola timbratura", () => {
    const { result } = renderHook(() => useUnaVolta());
    const timbra = vi.fn(() => new Promise(() => {}));
    act(() => {
      result.current(() => timbra());
      result.current(() => timbra());
    });
    expect(timbra).toHaveBeenCalledTimes(1);
  });

  it("finita la richiesta, anche con errore, il pulsante torna a funzionare", async () => {
    const { result } = renderHook(() => useUnaVolta());
    const timbra = vi.fn().mockRejectedValueOnce(new Error("rete")).mockResolvedValue(undefined);
    await act(async () => { result.current(() => timbra()); });
    await act(async () => { result.current(() => timbra()); });
    expect(timbra).toHaveBeenCalledTimes(2);
  });

  it("se l'azione si rompe subito non resta bloccato", () => {
    const { result } = renderHook(() => useUnaVolta());
    expect(() => result.current(() => { throw new Error("rotta"); })).toThrow("rotta");
    const timbra = vi.fn(() => Promise.resolve());
    result.current(() => timbra());
    expect(timbra).toHaveBeenCalledTimes(1);
  });
});
