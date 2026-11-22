import { formOptions } from "@/test/helpers/changeFormControl";
import { changeFormControl } from "@/test/helpers/changeFormControl";
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
  online: true,
  toast: vi.fn(),
  comprimi: vi.fn(),
}));
vi.mock("@/lib/campo/compressImage", () => ({ compressImage: m.comprimi }));
vi.mock("@/hooks/campo/useNetworkStatus", () => ({ useNetworkStatus: () => m.online }));
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
  m.online = true;
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
  m.comprimi.mockReset().mockResolvedValue(new Blob(["ruotata"], { type: "image/jpeg" }));
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
  changeFormControl(screen.getByLabelText("Scegli le pagine del DDT"), {
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
      files: [expect.any(ArrayBuffer), expect.any(ArrayBuffer)],
      user_id: "operaio",
      company_id: "azienda",
      order_id: "cantiere",
      fileNames: ["fronte.heic", "retro.png"],
      fileTypes: ["image/heic", "image/png"],
    },
  });
  expect(new TextDecoder().decode(m.enqueue.mock.calls[0][0].payload.files[0])).toBe("foto1");
  await waitFor(() => expect(m.process).toHaveBeenCalledTimes(1));
  expect(screen.queryByText("1. fronte.heic")).not.toBeInTheDocument();
});
it("riordina, ruota e sostituisce pagine della stessa bolla prima di accodarla", async () => {
  apri();
  changeFormControl(screen.getByLabelText("Scegli le pagine del DDT"), { target: { files: [
    new File(["fronte"], "fronte.png", { type: "image/png" }),
    new File(["retro"], "retro.png", { type: "image/png" }),
  ] } });
  await screen.findByText("2. retro.png");
  const menu = (numero: number) => fireEvent.pointerDown(screen.getByRole("button", { name: `Modifica pagina ${numero}` }),
    { button: 0, ctrlKey: false, pointerType: "mouse" });
  menu(2);
  fireEvent.click(await screen.findByRole("menuitem", { name: "Sposta su" }));
  await screen.findByText("1. retro.png");
  menu(1);
  fireEvent.click(await screen.findByRole("menuitem", { name: "Ruota a destra" }));
  await screen.findByText("1. retro.jpg");
  expect(m.comprimi).toHaveBeenCalledWith(expect.any(File), 2800, 0.93, true);
  menu(2);
  fireEvent.click(await screen.findByRole("menuitem", { name: "Sostituisci" }));
  changeFormControl(screen.getByLabelText("Scegli una foto sostitutiva"), { target: { files: [
    new File(["nuova"], "fronte-nuovo.png", { type: "image/png" }),
  ] } });
  await screen.findByText("2. fronte-nuovo.png");
  fireEvent.click(screen.getByRole("button", { name: "Invia la bolla" }));
  await waitFor(() => expect(m.enqueue).toHaveBeenCalledOnce());
  const payload = m.enqueue.mock.calls[0][0].payload;
  expect(payload.fileNames).toEqual(["retro.jpg", "fronte-nuovo.png"]);
  expect(payload.files.map((page: ArrayBuffer) => new TextDecoder().decode(page))).toEqual(["ruotata", "nuova"]);
});
it("un errore di IndexedDB conserva le foto e non dichiara un invio riuscito", async () => {
  m.enqueue.mockRejectedValue(new Error("quota esaurita"));
  apri();
  changeFormControl(screen.getByLabelText("Scegli le pagine del DDT"), {
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
    "",
  );
  changeFormControl(screen.getByLabelText("Scegli le pagine del DDT"), {
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
  await caricaBolla();
  expect(screen.getByRole("button", { name: "Invia la bolla" })).toBeDisabled();
  changeFormControl(screen.getByRole("combobox", { name: "Cantiere" }), { target: { value: "cantiere" } });
  expect(screen.getByRole("button", { name: "Invia la bolla" })).toBeEnabled();
});

const dueCantieri = () => {
  m.cantieri = [
    { order_id: "a", order: { order_code: "SIM-A", description: "Primo" } },
    { order_id: "b", order: { order_code: "SIM-B", description: "Secondo" } },
  ];
};
const caricaBolla = async () => {
  changeFormControl(screen.getByLabelText("Scegli le pagine del DDT"), {
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
    formOptions().getByRole("option", { name: "Scegli il cantiere" }),
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

it("solo la foto: l'operaio vede l'accodamento finché l'ufficio non riceve il documento", async () => {
  m.lettura = "solo_foto";
  // Anche con i permessi che darebbero l'interruttore e la revisione.
  m.permessi = { ...m.permessi, canManagePurchasing: true, canEditWarehouse: true };
  const vista = apri();
  expect(screen.queryByRole("switch", { name: "Leggi con l'AI" })).not.toBeInTheDocument();
  expect(screen.getByText(/la legge e la registra l'ufficio/i)).toBeInTheDocument();
  await caricaBolla();
  fireEvent.click(screen.getByRole("button", { name: "Invia la bolla" }));
  await waitFor(() => expect(m.enqueue).toHaveBeenCalledTimes(1));
  expect(m.toast).toHaveBeenCalledWith("Bolla salvata sul telefono. Invio in coda.");
  // Nessuna finestra di revisione aspetta una lettura che non partirà.
  m.documenti = [{ id: "operazione", status: "review", files: [{ name: "bolla.jpg" }], created_at: "2026-11-12T08:00:00Z", order_id: "cantiere" }];
  vista.rerender(
    <MemoryRouter initialEntries={["/campo/ddt?order=cantiere"]}>
      <CampoDDT />
    </MemoryRouter>,
  );
  expect(screen.queryByText("Revisione operazione")).not.toBeInTheDocument();
});

it("salva la foto offline indicando la destinazione confermata", async () => {
  m.online = false;
  apri();
  await caricaBolla();
  expect(screen.getByText("SIM-1 · Cantiere assegnato", { selector: "p" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Salva la bolla sul telefono" }));
  await waitFor(() => expect(m.enqueue).toHaveBeenCalledOnce());
  expect(m.enqueue.mock.calls[0][0].payload).toMatchObject({ destinazione: "cantiere", order_id: "cantiere" });
  expect(m.toast).toHaveBeenCalledWith("Bolla salvata sul telefono. Partirà appena torna la connessione.");
});

it("solo la foto non tocca l'ufficio, che dal telefono tiene il suo interruttore", () => {
  m.lettura = "solo_foto";
  m.ufficio = true;
  m.permessi = { ...m.permessi, isAdmin: true };
  apri();
  expect(screen.getByRole("switch", { name: "Leggi con l'AI" })).toBeInTheDocument();
});
