import { beforeEach, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
const m = vi.hoisted(() => ({
  enqueue: vi.fn(),
  process: vi.fn(),
  auth: { user: { id: "operaio" }, profile: { company_id: "azienda" } },
  ufficio: false,
  cantieri: [
    {
      order_id: "cantiere",
      order: { order_code: "SIM-1", description: "Cantiere assegnato" },
    },
  ] as Array<{ order_id: string; order: { order_code: string; description: string } }>,
  permessi: { solaLettura: false, isAdmin: false, canEditOrders: false, canManagePurchasing: false, canEditWarehouse: false },
  documenti: [] as unknown[],
  soloDocumento: vi.fn(),
  lettura: "ai_subito" as "ai_subito" | "solo_foto",
  toast: vi.fn(),
}));
vi.mock("@/hooks/useImpostazioniAcquisti", () => ({
  useLetturaBolleTelefono: () => ({ data: m.lettura }),
}));
vi.mock("sonner", () => ({ toast: { success: m.toast, error: vi.fn() } }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => m.permessi }));
vi.mock("@/components/ddt/BollaTelefono", async (orig) => {
  const vero = await orig<typeof import("@/components/ddt/BollaTelefono")>();
  return {
    puoRegistrareBolle: vero.puoRegistrareBolle,
    puoCompilareSenzaAI: vero.puoCompilareSenzaAI,
    useSalvaSoloDocumento: () => m.soloDocumento,
    RevisioneBollaTelefono: ({ documento }: { documento: { id: string } }) => <div role="dialog">Revisione {documento.id}</div>,
    CompilaBollaTelefono: ({ orderId, files }: { orderId: string | null; files: File[] }) => <div role="dialog">Compila {String(orderId)} {files.length}</div>,
  };
});
vi.mock("@/hooks/campo/useCampoUfficio", () => ({
  useCampoUfficio: () => ({ data: m.ufficio }),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => m.auth }));
vi.mock("@/hooks/campo/useCampoAssignments", () => ({
  useCampoAssignments: () => ({
    data: m.cantieri,
    isLoading: false,
    isError: false,
  }),
}));
vi.mock("@/hooks/useDocumentiDDT", () => ({
  useDocumentiDDT: () => ({ data: m.documenti, refetch: vi.fn() }),
  STATO_DOCUMENTO: {},
}));
vi.mock("@/lib/campo/sync-queue", () => ({
  syncQueue: {
    getAll: async () => [] as unknown[],
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
  DividiPdfPannello: (): null => null,
}));
import CampoDDT from "@/pages/campo/CampoDDT";
beforeEach(() => {
  m.ufficio = false;
  m.lettura = "ai_subito";
  m.toast.mockReset();
  m.permessi = { solaLettura: false, isAdmin: false, canEditOrders: false, canManagePurchasing: false, canEditWarehouse: false };
  m.documenti = [];
  m.soloDocumento.mockReset().mockResolvedValue("d");
  m.cantieri = [
    {
      order_id: "cantiere",
      order: { order_code: "SIM-1", description: "Cantiere assegnato" },
    },
  ];
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
    screen.getByRole("button", { name: "Invia la bolla" }),
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
    screen.getByRole("button", { name: "Invia la bolla" }),
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
    screen.getByRole("button", { name: "Invia la bolla" }),
  ).toBeDisabled();
});

const dueCantieri = () => {
  m.cantieri = [
    { order_id: "a", order: { order_code: "SIM-A", description: "Primo" } },
    { order_id: "b", order: { order_code: "SIM-B", description: "Secondo" } },
  ];
};
const caricaBolla = async () => {
  fireEvent.change(screen.getByLabelText("Scegli le pagine del DDT"), {
    target: {
      files: [new File(["foto"], "bolla.jpg", { type: "image/jpeg" })],
    },
  });
  await screen.findByText("1. bolla.jpg");
};
it("ufficio (12/11/2026): «In magazzino» manda la bolla senza commessa", async () => {
  m.ufficio = true;
  dueCantieri();
  render(
    <MemoryRouter initialEntries={["/campo/ddt"]}>
      <CampoDDT />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole("button", { name: /In magazzino/ }));
  expect(screen.queryByRole("combobox", { name: "Cantiere" })).not.toBeInTheDocument();
  await caricaBolla();
  fireEvent.click(
    screen.getByRole("button", { name: "Invia la bolla" }),
  );
  await waitFor(() => expect(m.enqueue).toHaveBeenCalledTimes(1));
  expect(m.enqueue.mock.calls[0][0].payload.order_id).toBeNull();
});
it("ufficio con un solo cantiere può comunque scegliere il magazzino", async () => {
  m.ufficio = true;
  render(
    <MemoryRouter initialEntries={["/campo/ddt"]}>
      <CampoDDT />
    </MemoryRouter>,
  );
  const select = screen.getByRole("combobox", { name: "Cantiere" });
  expect(select).toHaveValue("cantiere");
  fireEvent.click(screen.getByRole("button", { name: /In magazzino/ }));
  await caricaBolla();
  fireEvent.click(
    screen.getByRole("button", { name: "Invia la bolla" }),
  );
  await waitFor(() => expect(m.enqueue).toHaveBeenCalledTimes(1));
  expect(m.enqueue.mock.calls[0][0].payload.order_id).toBeNull();
});
it("per l'operaio, in cantiere, il cantiere resta obbligatorio", async () => {
  dueCantieri();
  render(
    <MemoryRouter initialEntries={["/campo/ddt"]}>
      <CampoDDT />
    </MemoryRouter>,
  );
  expect(screen.getByRole("button", { name: /In cantiere/ })).toHaveAttribute("aria-pressed", "true");
  expect(
    screen.getByRole("option", { name: "Scegli il cantiere" }),
  ).toBeInTheDocument();
  await caricaBolla();
  expect(
    screen.getByRole("button", { name: "Invia la bolla" }),
  ).toBeDisabled();
});

it("con l'AI, chi può registrare vede subito cosa ha letto, da confermare", async () => {
  m.permessi = { ...m.permessi, canEditWarehouse: true };
  const vista = apri();
  await caricaBolla();
  fireEvent.click(screen.getByRole("button", { name: "Invia la bolla" }));
  await waitFor(() => expect(m.enqueue).toHaveBeenCalledTimes(1));
  expect(screen.queryByText("Revisione operazione")).not.toBeInTheDocument();
  m.documenti = [{ id: "operazione", status: "review", files: [{ name: "bolla.jpg" }], created_at: "2026-11-12T08:00:00Z", order_id: "cantiere" }];
  vista.rerender(
    <MemoryRouter initialEntries={["/campo/ddt?order=cantiere"]}>
      <CampoDDT />
    </MemoryRouter>,
  );
  expect(await screen.findByText("Revisione operazione")).toBeInTheDocument();
});

it("l'operaio senza permessi non ha l'interruttore: l'AI legge e l'ufficio conferma", () => {
  apri();
  expect(screen.queryByRole("switch", { name: "Leggi con l'AI" })).not.toBeInTheDocument();
});

it("AI spenta: si compila sul telefono, oppure la bolla resta all'ufficio", async () => {
  m.permessi = { ...m.permessi, canManagePurchasing: true };
  apri();
  await caricaBolla();
  fireEvent.click(screen.getByRole("switch", { name: "Leggi con l'AI" }));
  expect(screen.queryByRole("button", { name: "Invia la bolla" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Compila ora" }));
  expect(screen.getByRole("dialog")).toHaveTextContent("Compila cantiere 1");
  expect(m.enqueue).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "La compila l'ufficio" }));
  await waitFor(() => expect(m.soloDocumento).toHaveBeenCalledWith([expect.any(File)], "cantiere"));
  expect(m.enqueue).not.toHaveBeenCalled();
});

it("l'operaio (12/11/2026) manda «In magazzino» senza commessa: la destinazione va nella coda", async () => {
  dueCantieri();
  render(
    <MemoryRouter initialEntries={["/campo/ddt"]}>
      <CampoDDT />
    </MemoryRouter>,
  );
  const magazzino = screen.getByRole("button", { name: /In magazzino/ });
  expect(magazzino).toBeEnabled();
  fireEvent.click(magazzino);
  expect(screen.queryByRole("combobox", { name: "Cantiere" })).not.toBeInTheDocument();
  await caricaBolla();
  fireEvent.click(screen.getByRole("button", { name: "Invia la bolla" }));
  await waitFor(() => expect(m.enqueue).toHaveBeenCalledTimes(1));
  expect(m.enqueue.mock.calls[0][0].payload).toMatchObject({ order_id: null, destinazione: "magazzino" });
});

it("l'operaio senza cantieri assegnati parte da «In magazzino» e può inviare", async () => {
  m.cantieri = [];
  render(
    <MemoryRouter initialEntries={["/campo/ddt"]}>
      <CampoDDT />
    </MemoryRouter>,
  );
  expect(screen.getByRole("button", { name: /In magazzino/ })).toHaveAttribute("aria-pressed", "true");
  await caricaBolla();
  expect(screen.getByRole("button", { name: "Invia la bolla" })).toBeEnabled();
});

it("solo la foto: l'operaio non vede l'interruttore AI, invia, e legge «Inviata: l'ufficio la controlla»", async () => {
  m.lettura = "solo_foto";
  // Anche con i permessi che darebbero l'interruttore e la revisione.
  m.permessi = { ...m.permessi, canManagePurchasing: true, canEditWarehouse: true };
  const vista = apri();
  expect(screen.queryByRole("switch", { name: "Leggi con l'AI" })).not.toBeInTheDocument();
  expect(screen.getByText(/la legge e la registra l'ufficio/)).toBeInTheDocument();
  await caricaBolla();
  fireEvent.click(screen.getByRole("button", { name: "Invia la bolla" }));
  await waitFor(() => expect(m.enqueue).toHaveBeenCalledTimes(1));
  expect(m.toast).toHaveBeenCalledWith(expect.stringMatching(/l'ufficio la controlla/));
  // Nessuna finestra di revisione aspetta una lettura che non partirà.
  m.documenti = [{ id: "operazione", status: "review", files: [{ name: "bolla.jpg" }], created_at: "2026-11-12T08:00:00Z", order_id: "cantiere" }];
  vista.rerender(
    <MemoryRouter initialEntries={["/campo/ddt?order=cantiere"]}>
      <CampoDDT />
    </MemoryRouter>,
  );
  expect(screen.queryByText("Revisione operazione")).not.toBeInTheDocument();
});

it("solo la foto non tocca l'ufficio, che dal telefono tiene il suo interruttore", () => {
  m.lettura = "solo_foto";
  m.ufficio = true;
  m.permessi = { ...m.permessi, isAdmin: true };
  apri();
  expect(screen.getByRole("switch", { name: "Leggi con l'AI" })).toBeInTheDocument();
});
