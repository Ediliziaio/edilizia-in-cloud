import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CassaScadenze } from "@/components/orders/generali/piano/CassaScadenze";
import type { RiepilogoGenerale } from "@/lib/orders/commesseGenerali";
const m = vi.hoisted(() => ({ scadenze: vi.fn(), fonti: vi.fn() }));
vi.mock("@/hooks/useCassaOperazione", () => ({
  useCassaOperazione: () => ({ isError: false, refetch: m.scadenze }),
}));
vi.mock("@/hooks/useGeneraleInvestitori", () => ({
  useMovimentiFonti: () => ({ isError: true, refetch: m.fonti }),
}));
afterEach(cleanup);
it("Riprova rilegge anche i movimenti delle fonti che hanno fallito", () => {
  render(
    <CassaScadenze
      riepilogo={
        {
          generale: { id: "g" },
          permessi: { margini: true },
        } as RiepilogoGenerale
      }
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Riprova" }));
  expect(m.scadenze).toHaveBeenCalledOnce();
  expect(m.fonti).toHaveBeenCalledOnce();
});
