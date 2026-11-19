import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useSelezioneRighe } from "@/hooks/useSelezioneRighe";

describe("selezione limitata alla pagina visibile", () => {
  it("seleziona la pagina, gestisce lo stato misto e conserva solo gli errori", () => {
    const { result } = renderHook(() => useSelezioneRighe([{ id: "a" }, { id: "b" }], "pagina-1"));
    act(() => result.current.alterna("a"));
    expect(result.current.parziale).toBe(true);
    act(() => result.current.pagina(true));
    expect(result.current.tutte).toBe(true);
    act(() => result.current.mantieni(["b"]));
    expect([...result.current.ids]).toEqual(["b"]);
  });
  it("cambiando azienda o filtri azzera la selezione, anche tornando alla pagina precedente", () => {
    const { result, rerender } = renderHook(({ ambito }) => useSelezioneRighe([{ id: "a" }], ambito), { initialProps: { ambito: "prima" } });
    act(() => result.current.pagina(true));
    rerender({ ambito: "seconda" });
    expect(result.current.ids.size).toBe(0);
    rerender({ ambito: "prima" });
    expect(result.current.ids.size).toBe(0);
  });
});
