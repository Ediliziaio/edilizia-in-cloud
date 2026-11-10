import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useSidebarOpenArea } from "@/hooks/useSidebarOpenArea";
import { useLoadingTimeout } from "@/hooks/useLoadingTimeout";

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("apre l’area della pagina e conserva i click manuali finché non si naviga", () => {
  localStorage.setItem("sidebar_open_area", "persone");
  const { result, rerender } = renderHook(
    ({ path, area }: { path: string; area: string | null }) =>
      useSidebarOpenArea(path, area),
    { initialProps: { path: "/ordini", area: "cantieri" as string | null } },
  );
  expect(result.current[0]).toBe("cantieri");
  act(() => result.current[1]("persone"));
  rerender({ path: "/ordini", area: "cantieri" });
  expect(result.current[0]).toBe("persone");
  act(() => result.current[1](null));
  expect(result.current[0]).toBeNull();
  rerender({ path: "/fatture", area: "finanza" });
  expect(result.current[0]).toBe("finanza");
  expect(localStorage.getItem("sidebar_open_area")).toBe("finanza");
  rerender({ path: "/profilo", area: null });
  expect(result.current[0]).toBe("finanza");
});

it("riparte con lo skeleton a ogni nuovo caricamento e cancella il timer precedente", () => {
  vi.useFakeTimers();
  const { result, rerender } = renderHook(
    ({ loading }) => useLoadingTimeout(loading, 1500),
    { initialProps: { loading: true } },
  );
  expect(result.current).toBe(false);
  act(() => vi.advanceTimersByTime(1500));
  expect(result.current).toBe(true);
  rerender({ loading: false });
  expect(result.current).toBe(false);
  rerender({ loading: true });
  expect(result.current).toBe(false);
  act(() => vi.advanceTimersByTime(1000));
  rerender({ loading: false });
  act(() => vi.advanceTimersByTime(1000));
  expect(result.current).toBe(false);
  rerender({ loading: true });
  act(() => vi.advanceTimersByTime(1499));
  expect(result.current).toBe(false);
  act(() => vi.advanceTimersByTime(1));
  expect(result.current).toBe(true);
});
