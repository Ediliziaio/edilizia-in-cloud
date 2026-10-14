import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { useTaskLink } from "@/hooks/useTaskLink";

afterEach(cleanup);
describe("Collegamento Dashboard → Regia", () => {
  it("apre il record già autorizzato e non cerca identificativi fuori dalla lista", async () => {
    const open = vi.fn();
    const { rerender } = renderHook(({ id }) => useTaskLink([{ id: "allowed" }], id, open), { initialProps: { id: "foreign" } });
    await Promise.resolve(); expect(open).not.toHaveBeenCalled();
    rerender({ id: "allowed" }); await waitFor(() => expect(open).toHaveBeenCalledWith({ id: "allowed" }));
  });
  it("aspetta il caricamento del record prima di aprire", async () => {
    const open = vi.fn();
    const { rerender } = renderHook(({ rows }) => useTaskLink(rows, "task", open), { initialProps: { rows: [] as { id: string }[] } });
    await Promise.resolve(); expect(open).not.toHaveBeenCalled();
    rerender({ rows: [{ id: "task" }] }); await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
  });
  it("chiudere il pannello non lo riapre mentre l'URL sta ancora cambiando", async () => {
    const rows = [{ id: "task" }];
    function Panel() {
      const [selected, setSelected] = useState<{ id: string } | null>(null);
      useTaskLink(rows, "task", setSelected);
      return selected ? <button onClick={() => setSelected(null)}>Chiudi dettaglio</button> : <p>Dettaglio chiuso</p>;
    }
    render(<Panel />); await waitFor(() => expect(screen.getByRole("button", { name: "Chiudi dettaglio" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Chiudi dettaglio" }));
    await waitFor(() => expect(screen.getByText("Dettaglio chiuso")).toBeTruthy());
    await Promise.resolve(); expect(screen.queryByRole("button", { name: "Chiudi dettaglio" })).toBeNull();
  });
  it("un refetch non riapre un collegamento già gestito", async () => {
    const open = vi.fn();
    const { rerender } = renderHook(({ rows }) => useTaskLink(rows, "task", open), { initialProps: { rows: [{ id: "task", title: "Prima" }] } });
    await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    rerender({ rows: [{ id: "task", title: "Aggiornata" }] }); await Promise.resolve();
    expect(open).toHaveBeenCalledTimes(1);
  });
  it("un nuovo collegamento apre un altro record; rimuoverlo permette di riaprire lo stesso", async () => {
    const open = vi.fn(); const rows = [{ id: "a" }, { id: "b" }];
    const { rerender } = renderHook(({ id }) => useTaskLink(rows, id, open), { initialProps: { id: "a" as string | null } });
    await waitFor(() => expect(open).toHaveBeenCalledTimes(1)); rerender({ id: "b" });
    await waitFor(() => expect(open).toHaveBeenCalledTimes(2)); rerender({ id: null }); rerender({ id: "b" });
    await waitFor(() => expect(open).toHaveBeenCalledTimes(3));
  });
  it("annulla l'apertura quando il componente viene smontato", async () => {
    const open = vi.fn(); const { unmount } = renderHook(() => useTaskLink([{ id: "task" }], "task", open));
    unmount(); await Promise.resolve(); expect(open).not.toHaveBeenCalled();
  });
});
