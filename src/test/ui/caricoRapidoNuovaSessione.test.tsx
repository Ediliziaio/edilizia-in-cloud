import { readFileSync } from "node:fs";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { CaricoRapidoSheet } from "@/components/warehouse/CaricoRapidoSheet";

const state = vi.hoisted(() => ({ company: "azienda-a", query: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    effectiveCompany: { id: state.company },
    user: { email: "simulazione@example.invalid" },
  }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useQuery: ({ queryKey }: { queryKey: string[] }) => {
    state.query(queryKey);
    return {
      data:
        queryKey[0] === "carico-rapido-warehouses"
          ? [
              {
                id: `${state.company}-magazzino`,
                name: `Magazzino ${state.company}`,
                is_default: true,
              },
            ]
          : [],
      isLoading: false,
    };
  },
}));
vi.mock("@/hooks/warehouse/useBatchCarico", () => ({
  useBatchCarico: () => ({ isPending: false, mutateAsync: vi.fn() }),
}));
vi.mock("@/components/warehouse/StockItemDialog", () => ({
  StockItemDialog: (): null => null,
}));
vi.mock("@/components/warehouse/ManualArticleAdder", () => ({
  ManualArticleAdder: (): null => null,
}));
beforeEach(() => {
  state.company = "azienda-a";
  state.query.mockClear();
});

it("non legge il magazzino da chiuso e alla riapertura elimina note e foto del carico precedente", () => {
  const { rerender } = render(
    <CaricoRapidoSheet open={false} onOpenChange={vi.fn()} />,
    { wrapper: MemoryRouter },
  );
  expect(state.query).not.toHaveBeenCalled();
  rerender(<CaricoRapidoSheet open onOpenChange={vi.fn()} />);
  expect(
    screen.getByRole("combobox", { name: "Magazzino destinazione *" }),
  ).toHaveTextContent("Magazzino azienda-a");
  fireEvent.change(screen.getByLabelText("Note (opzionali)"), {
    target: { value: "Solo primo carico" },
  });
  const photo = document.querySelector(
    'input[type="file"][id="cr-product-photos"]',
  );
  expect(photo).not.toBeNull();
  fireEvent.change(photo!, {
    target: {
      files: [new File(["foto"], "primo-carico.png", { type: "image/png" })],
    },
  });
  expect(screen.getByText("primo-carico.png")).toBeInTheDocument();
  rerender(<CaricoRapidoSheet open={false} onOpenChange={vi.fn()} />);
  rerender(<CaricoRapidoSheet open onOpenChange={vi.fn()} />);
  expect(screen.getByLabelText("Note (opzionali)")).toHaveValue("");
  expect(screen.queryByText("primo-carico.png")).not.toBeInTheDocument();
});

it("il cambio azienda azzera il carico aperto e adotta il magazzino della nuova azienda", () => {
  const { rerender } = render(
    <CaricoRapidoSheet open onOpenChange={vi.fn()} />,
    { wrapper: MemoryRouter },
  );
  fireEvent.change(screen.getByLabelText("Note (opzionali)"), {
    target: { value: "Dati della prima azienda" },
  });
  state.company = "azienda-b";
  rerender(<CaricoRapidoSheet open onOpenChange={vi.fn()} />);
  expect(screen.getByLabelText("Note (opzionali)")).toHaveValue("");
  expect(
    screen.getByRole("combobox", { name: "Magazzino destinazione *" }),
  ).toHaveTextContent("Magazzino azienda-b");
});

it("il fornitore è facoltativo (11/11/2026): col solo magazzino si va avanti", () => {
  render(<CaricoRapidoSheet open onOpenChange={vi.fn()} />, {
    wrapper: MemoryRouter,
  });
  expect(screen.getByText("Fornitore (facoltativo)")).toBeInTheDocument();
  expect(screen.queryByText("Fornitore *")).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: /Inizia scansione/ }),
  ).toBeEnabled();
  expect(
    screen.queryByText(/Scegli prima fornitore/),
  ).not.toBeInTheDocument();
});

it("senza fornitore la conferma passa null al carico e al lotto, invece di fermarsi", () => {
  const src = readFileSync("src/components/warehouse/CaricoRapidoSheet.tsx", "utf8");
  expect(src).toContain("if (!warehouseId) return;");
  expect(src).not.toContain("if (!warehouseId || !supplierId) return;");
  expect(src).toContain("supplierId: supplierId ?? null,");
  expect(src).toContain("supplier_id: supplierId ?? null,");
});
