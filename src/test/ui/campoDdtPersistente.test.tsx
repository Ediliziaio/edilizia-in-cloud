import { beforeEach, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
const m = vi.hoisted(() => ({
  enqueue: vi.fn(),
  process: vi.fn(),
  auth: { user: { id: "operaio" }, profile: { company_id: "azienda" } },
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => m.auth }));
vi.mock("@/hooks/campo/useCampoAssignments", () => ({
  useCampoAssignments: () => ({
    data: [
      {
        order_id: "cantiere",
        order: { order_code: "SIM-1", description: "Cantiere assegnato" },
      },
    ],
    isLoading: false,
    isError: false,
  }),
}));
vi.mock("@/hooks/useDocumentiDDT", () => ({
  useDocumentiDDT: () => ({ data: [], refetch: vi.fn() }),
  STATO_DOCUMENTO: {},
}));
vi.mock("@/lib/campo/sync-queue", () => ({
  syncQueue: {
    getAll: async () => [],
    on: () => () => {},
    enqueue: m.enqueue,
    processQueue: m.process,
  },
  syncItemScope: () => ({}),
}));
vi.mock("@/lib/ddt/dividiPdf", () => ({
  contaPagine: vi.fn().mockResolvedValue(1),
  leggiPerDividere: vi.fn(),
}));
vi.mock("@/components/ddt/DividiPdfPannello", () => ({
  DividiPdfPannello: () => null,
}));
import CampoDDT from "@/pages/campo/CampoDDT";
beforeEach(() => {
  m.enqueue.mockReset().mockResolvedValue("operazione");
  m.process.mockReset().mockResolvedValue(undefined);
});
const apri = () =>
  render(
    <MemoryRouter initialEntries={["/campo/ddt?order=cantiere"]}>
      <CampoDDT />
    </MemoryRouter>,
  );
it("salva tutte le foto dello stesso DDT prima di avviare la rete, senza richiedere prezzi", async () => {
  apri();
  const files = [
    new File(["foto1"], "fronte.heic", { type: "image/heic" }),
    new File(["foto2"], "retro.png", { type: "image/png" }),
  ];
  fireEvent.change(screen.getByLabelText("Scegli le pagine del DDT"), {
    target: { files },
  });
  await screen.findByText("1. fronte.heic");
  fireEvent.click(
    screen.getByRole("button", { name: "Salva e analizza il DDT" }),
  );
  await waitFor(() => expect(m.enqueue).toHaveBeenCalledTimes(1));
  expect(m.enqueue.mock.calls[0][0]).toMatchObject({
    type: "documento_ddt",
    payload: {
      files,
      user_id: "operaio",
      company_id: "azienda",
      order_id: "cantiere",
      fileNames: ["fronte.heic", "retro.png"],
    },
  });
  await waitFor(() => expect(m.process).toHaveBeenCalledTimes(1));
  expect(screen.queryByText("1. fronte.heic")).not.toBeInTheDocument();
});
it("un errore di IndexedDB conserva le foto e non dichiara un invio riuscito", async () => {
  m.enqueue.mockRejectedValue(new Error("quota esaurita"));
  apri();
  fireEvent.change(screen.getByLabelText("Scegli le pagine del DDT"), {
    target: {
      files: [new File(["foto"], "bolla.jpg", { type: "image/jpeg" })],
    },
  });
  await screen.findByText("1. bolla.jpg");
  fireEvent.click(
    screen.getByRole("button", { name: "Salva e analizza il DDT" }),
  );
  await waitFor(() => expect(m.enqueue).toHaveBeenCalledTimes(1));
  expect(m.process).not.toHaveBeenCalled();
  expect(screen.getByText("1. bolla.jpg")).toBeInTheDocument();
});
it("rifiuta un formato non supportato prima di salvare e non accetta cantieri estranei dal link", async () => {
  render(
    <MemoryRouter initialEntries={["/campo/ddt?order=estraneo"]}>
      <CampoDDT />
    </MemoryRouter>,
  );
  expect(screen.getByRole("combobox", { name: "Cantiere" })).toHaveValue(
    "cantiere",
  );
  fireEvent.change(screen.getByLabelText("Scegli le pagine del DDT"), {
    target: {
      files: [
        new File(["exe"], "programma.exe", {
          type: "application/octet-stream",
        }),
      ],
    },
  });
  expect(m.enqueue).not.toHaveBeenCalled();
  expect(
    screen.getByRole("button", { name: "Salva e analizza il DDT" }),
  ).toBeDisabled();
});
