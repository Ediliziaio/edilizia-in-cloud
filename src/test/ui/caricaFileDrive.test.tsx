import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CaricaFileDriveDialog } from "@/components/documenti/CaricaFileDriveDialog";

const mock = vi.hoisted(() => ({ upload: vi.fn(), insert: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ insert: mock.insert }) },
}));
vi.mock("@/lib/commesse/caricaAllegatoConProgresso", () => ({
  caricaAllegatoConProgresso: mock.upload,
  oggettoGiaCaricato: () => false,
}));

beforeEach(() => {
  vi.resetAllMocks();
  mock.upload.mockResolvedValue(undefined);
  mock.insert.mockResolvedValue({ error: null });
});
afterEach(cleanup);

const pdf = (name: string) => new File(["contenuto di prova"], name, { type: "application/pdf" });

function apri(iniziali: File[] = []) {
  const archiviati = vi.fn();
  render(<CaricaFileDriveDialog open companyId="demo" userId="utente" iniziali={iniziali}
    cartelle={[{ id: "verbali", name: "Verbali" }]} cartellaIniziale="verbali"
    onClose={vi.fn()} onArchiviati={archiviati} onAnalizza={vi.fn()} analizzati={new Set()} />);
  return archiviati;
}

it("archivia tutti i file trascinati nella cartella corrente e completa la barra dopo il salvataggio", async () => {
  let fineInvio: () => void = () => {};
  mock.upload.mockImplementationOnce((_bucket, _path, _file, progresso) => new Promise<void>(resolve => {
    fineInvio = resolve;
    progresso(45);
  }));
  const archiviati = apri();
  const scheda = screen.getByRole("button", { name: "Seleziona o trascina i file" });
  fireEvent.drop(scheda, { dataTransfer: { types: ["Files"], files: [pdf("POS.pdf"), pdf("Verbale.pdf")] } });
  expect(screen.getByLabelText("Cartella di destinazione")).toHaveValue("verbali");
  fireEvent.click(screen.getByRole("button", { name: "Archivia 2 file" }));
  await waitFor(() => expect(screen.getByRole("progressbar", { name: "Caricamento POS.pdf" }))
    .toHaveAttribute("aria-valuenow", "45"));
  await screen.findByText("Caricamento in corso · 1 di 2 archiviati");
  expect(screen.getByRole("progressbar", { name: "Avanzamento archivio" })).toHaveAttribute("aria-valuenow", "50");
  fineInvio();
  await screen.findByText("2 file archiviati");
  expect(mock.insert).toHaveBeenCalledTimes(2);
  for (const [row] of mock.insert.mock.calls) {
    expect(row).toMatchObject({ folder_id: "verbali", shared: false, storage_path: `demo/utente/${row.id}` });
  }
  expect(screen.getByRole("progressbar", { name: "Avanzamento archivio" })).toHaveAttribute("aria-valuenow", "100");
  expect(archiviati).toHaveBeenCalledWith("verbali");
});

it("riprova solo il salvataggio fallito e conserva il percorso del file", async () => {
  mock.insert.mockResolvedValueOnce({ error: { code: "", message: "Network timeout" } });
  apri([pdf("POS.pdf"), pdf("Verbale.pdf")]);
  fireEvent.click(screen.getByRole("button", { name: "Archivia 2 file" }));
  fireEvent.click(await screen.findByRole("button", { name: "Riprova 1 file" }));
  await screen.findByText("2 file archiviati");
  expect(mock.upload).toHaveBeenCalledTimes(2);
  expect(mock.insert).toHaveBeenCalledTimes(3);
  expect(mock.insert.mock.calls[2][0]).toEqual(mock.insert.mock.calls[0][0]);
});
