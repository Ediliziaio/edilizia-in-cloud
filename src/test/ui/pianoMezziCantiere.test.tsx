vi.mock("@/hooks/useMezziPianoEconomia", () => ({
  usePersonePianoMezzi: () => ({
    data: [
      { id: "capo", nome: "Capo DEMO", in_cantiere: true, capocantiere: true },
    ],
    isLoading: false,
    isError: false,
  }),
  useMezziPianoEconomia: () => ({
    fonti: {
      data: { fonti: [], legami: [] },
      isLoading: false,
      isError: false,
    },
    collega: { isPending: false },
  }),
}));
vi.mock("@/components/orders/SupplierSelect", () => ({
  SupplierSelect: () => null,
}));
vi.mock("@/components/mezzi/ViaggioSelect", () => ({
  ViaggioSelect: ({
    label,
    value,
    onValueChange,
    options,
    disabled,
  }: {
    label: string;
    value: string;
    onValueChange: (v: string) => void;
    options: { value: string; label: string }[];
    disabled?: boolean;
  }) => (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      disabled={disabled}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
}));
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  costi: true,
  edit: true,
  priceError: false,
  rows: [] as unknown[],
  mutate: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    canViewMezzi: true,
    canEditMezzi: state.edit,
    canViewCosts: state.costi,
    solaLettura: false,
    isAdmin: false,
  }),
}));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({
  useEffectiveCompanyId: () => "company",
}));
vi.mock("@/hooks/useMezzi", () => ({
  useMezzi: () => ({
    data: [
      {
        id: "betoniera",
        nome: "Betoniera propria",
        tipo: "attrezzatura",
        possesso: "proprieta",
        stato: "in_servizio",
        gestione: "singola",
      },
    ],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/hooks/usePianoMezziCantiere", () => ({
  usePianoMezziCantiere: () => ({
    piani: {
      data: state.rows,
      isError: false,
      isLoading: false,
      refetch: vi.fn(),
    },
    prezzi: {
      data: {},
      isError: state.priceError,
      isFetching: false,
      refetch: vi.fn(),
    },
    salva: { mutateAsync: state.mutate, isPending: false },
  }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({
    data:
      queryKey[0] === "mezzi-piani-fasi"
        ? [
            {
              id: "fase-a",
              name: "Getti",
              start_date: "2026-11-02",
              end_date: "2026-11-06",
            },
          ]
        : { work_start_date: "2026-11-01", work_end_date: "2026-12-31" },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/components/mezzi/MezziCommessaCard", () => ({
  MezziCommessaCard: () => null,
}));
vi.mock("@/components/mezzi/MezzoFormDialog", () => ({
  MezzoFormDialog: () => null,
}));
import { PianoMezziCantiere } from "@/components/mezzi/PianoMezziCantiere";
afterEach(cleanup);
beforeEach(() => {
  state.costi = true;
  state.edit = true;
  state.priceError = false;
  state.rows = [];
  state.mutate.mockClear();
});
describe("UX pianificazione mezzi", () => {
  it("dalla fase precompila la lavorazione e riusa le sue date su richiesta", () => {
    render(<PianoMezziCantiere orderId="o" faseId="fase-a" />);
    fireEvent.click(screen.getByRole("button", { name: "Pianifica risorsa" }));
    expect(
      (screen.getByLabelText("Dove serve") as HTMLSelectElement).value,
    ).toBe("fasi");
    expect(
      (screen.getByRole("checkbox", { name: "Getti" }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Usa le date delle fasi selezionate",
      }),
    );
    expect((screen.getByLabelText("Dal") as HTMLInputElement).value).toBe(
      "2026-11-02",
    );
    expect(
      (screen.getByLabelText("Al (compreso)") as HTMLInputElement).value,
    ).toBe("2026-11-06");
  });
  it("senza permesso costi salva il piano senza cancellare o inviare importi", async () => {
    state.costi = false;
    render(<PianoMezziCantiere orderId="o" />);
    fireEvent.click(screen.getByRole("button", { name: "Pianifica risorsa" }));
    fireEvent.change(screen.getByLabelText("Mezzo o attrezzatura"), {
      target: { value: "betoniera" },
    });
    expect(screen.queryByLabelText("Importo €")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Usa il capocantiere" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Salva pianificazione" }),
    );
    await waitFor(() => expect(state.mutate).toHaveBeenCalledTimes(1));
    expect(state.mutate.mock.calls[0][0]).not.toHaveProperty("costo");
    expect(state.mutate.mock.calls[0][0].responsabile_hr_id).toBe("capo");
    expect(state.mutate.mock.calls[0][0].fase_ids).toEqual([]);
  });
  it("un errore sui costi non permette di sovrascriverli con valori vuoti", () => {
    state.priceError = true;
    state.rows = [
      {
        id: "p",
        mezzo_id: "betoniera",
        fase_ids: [],
        dal: "2030-01-01",
        al: "2030-01-31",
        quantita: 1,
        annullato: false,
      },
    ];
    render(<PianoMezziCantiere orderId="o" />);
    expect(
      (
        screen.getByRole("button", {
          name: "Betoniera propria",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByText("Tutto il cantiere"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("lettura sola: dettaglio consultabile senza comandi di modifica", () => {
    state.edit = false;
    state.rows = [
      {
        id: "p",
        mezzo_id: "betoniera",
        fase_ids: [],
        dal: "2030-01-01",
        al: "2030-01-31",
        quantita: 1,
        annullato: false,
      },
    ];
    render(<PianoMezziCantiere orderId="o" />);
    expect(
      screen.queryByRole("button", { name: "Pianifica risorsa" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Betoniera propria" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Salva pianificazione" }),
    ).toBeNull();
  });
});
