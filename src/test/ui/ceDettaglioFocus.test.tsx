import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DettaglioVoceMeseSheet } from "@/components/controllo-gestione/ui/DettaglioVoceMeseSheet";
vi.mock("@/hooks/controlloGestione/useDettaglioVoceMese", () => ({ useDettaglioVoceMese: () => ({ data: { meta: { label: "Ricavi", totale: 0 }, righe: [] as unknown[], raggruppamento: [] as unknown[] }, isLoading: false, isError: false, refetch: vi.fn() }) }));
afterEach(cleanup);
it("descrive il mese e restituisce il focus al valore che ha aperto il dettaglio", async () => {
  function Harness() {
    const [open, setOpen] = useState(false);
    return <><button onClick={() => setOpen(true)}>Apri ricavi gennaio</button><DettaglioVoceMeseSheet open={open} onOpenChange={setOpen} anno={2026} mese={1} codice="01" /></>;
  }
  render(<Harness />);
  const origin = screen.getByRole("button", { name: "Apri ricavi gennaio" });
  origin.focus();
  fireEvent.click(origin);
  expect(await screen.findByRole("dialog")).toHaveAccessibleDescription("Gennaio 2026");
  fireEvent.click(screen.getByRole("button", { name: /Chiudi|Close/ }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  await waitFor(() => expect(origin).toHaveFocus());
});
