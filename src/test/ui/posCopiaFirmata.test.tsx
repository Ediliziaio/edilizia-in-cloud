import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  righe: [] as unknown[], erroreLista: null as unknown, upload: vi.fn(), firma: vi.fn(), insert: vi.fn(), apri: vi.fn(), errore: vi.fn(), ok: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "utente-1" } }) }));
vi.mock("sonner", () => ({ toast: { error: s.errore, success: s.ok } }));
vi.mock("@/lib/sicurezza/apriPdfPos", () => ({ apriUrlDocumentoPos: s.apri }));
vi.mock("@/integrations/supabase/client", () => {
  const lista: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order"]) lista[m] = () => lista;
  lista.range = () => Promise.resolve({ data: s.righe, error: s.erroreLista });
  return { supabase: { storage: { from: () => ({ upload: s.upload, createSignedUrl: s.firma }) }, from: () => ({ ...lista, insert: s.insert }) } };
});
import { CopiaFirmataSezione, controllaCopiaFirmata, LIMITE_COPIA_FIRMATA } from "@/components/sicurezza/pos/CopiaFirmataPos";

const copia = (extra: Record<string, unknown> = {}) => ({ id: "c1", emissione_id: "em-1", revisione: 2, file_path: "az/pos/aaa.pdf", file_name: "POS firmato.pdf", sha256: "a".repeat(64), dimensione: 250_000, firmato_il: "2026-10-28", note: "Firmata anche dal CSE", caricata_il: "2026-10-29T09:00:00+00:00", ...extra });
const fileFinto = (testa = "%PDF-", size = 4000, nome = "scansione.pdf") => {
  const bytes = new TextEncoder().encode(testa + "x".repeat(20));
  const file = Object.assign(new File([bytes as BlobPart], nome, { type: "application/pdf" }), {
    arrayBuffer: async () => bytes.buffer as ArrayBuffer, slice: () => ({ arrayBuffer: async () => new TextEncoder().encode(testa).buffer }) as Blob,
  });
  Object.defineProperty(file, "size", { value: size }); // la dimensione è di sola lettura: si fissa a mano
  return file;
};
const mostra = (extra: Partial<Parameters<typeof CopiaFirmataSezione>[0]> = {}) => {
  const onCaricata = vi.fn();
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <CopiaFirmataSezione companyId="az" posId="pos" revisione={2} emissioneId="em-1" puoCaricare onCaricata={onCaricata} {...extra} />
  </QueryClientProvider>);
  return onCaricata;
};
const scegli = (f: File) => fireEvent.change(screen.getByLabelText("File PDF firmato"), { target: { files: [f] } });

beforeEach(() => {
  vi.clearAllMocks(); s.righe = []; s.erroreLista = null;
  s.upload.mockResolvedValue({ error: null }); s.insert.mockResolvedValue({ error: null });
  s.firma.mockResolvedValue({ data: { signedUrl: "https://storage.esempio/firmata.pdf?token=x" }, error: null });
  s.apri.mockImplementation(async (risolvi: () => Promise<string>) => { await risolvi(); });
});
afterEach(cleanup);

describe("controlli sul file scelto", () => {
  it("accetta solo un PDF vero, non vuoto, entro i 20 MB", async () => {
    expect(await controllaCopiaFirmata(fileFinto())).toBeNull();
    expect(await controllaCopiaFirmata(fileFinto("%PDF-", 0))).toBe("Il file è vuoto");
    expect(await controllaCopiaFirmata(fileFinto("%PDF-", LIMITE_COPIA_FIRMATA + 1))).toMatch(/il limite è 20,0 MB/);
    expect(await controllaCopiaFirmata(fileFinto("<html"))).toMatch(/non è un PDF/);
  });
});

describe("copia firmata del POS", () => {
  it("senza copie lo dice; con le copie le elenca con revisione e date e permette di scaricarle", async () => {
    mostra();
    expect(await screen.findByText("Nessuna copia firmata caricata.")).toBeTruthy();
    cleanup();
    s.righe = [copia(), copia({ id: "c2", revisione: 1, file_name: "vecchia.pdf", firmato_il: null, note: null, dimensione: 2_500_000, file_path: "az/pos/bbb.pdf" })];
    mostra();
    const lista = await screen.findByRole("list");
    const prima = within(lista).getAllByRole("listitem")[0];
    expect(prima.textContent).toContain("POS firmato.pdf");
    expect(prima.textContent).toContain("Revisione 2 · firmata il 28/10/2026 · caricata il 29/10/2026 · 244 KB");
    expect(prima.textContent).toContain("Firmata anche dal CSE");
    expect(within(lista).getAllByRole("listitem")[1].textContent).toContain("2,4 MB");
    fireEvent.click(within(prima).getByRole("button", { name: "Scarica" }));
    await waitFor(() => expect(s.firma).toHaveBeenCalledWith("az/pos/aaa.pdf", 300));
    expect(s.apri).toHaveBeenCalledTimes(1);
  });

  it("carica il file nella cartella del proprio POS, registra impronta, dimensione e data, e lo comunica all'editor", async () => {
    const onCaricata = mostra();
    await screen.findByText("Nessuna copia firmata caricata.");
    const caricare = screen.getByRole("button", { name: /Carica la copia firmata/ });
    expect(caricare).toBeDisabled();
    scegli(fileFinto("%PDF-", 4000, "firmato dal datore.pdf"));
    fireEvent.change(screen.getByLabelText("Firmata il (facoltativo)"), { target: { value: "2026-10-30" } });
    fireEvent.change(screen.getByLabelText("Nota (facoltativa)"), { target: { value: "  Scansione a colori  " } });
    fireEvent.click(screen.getByRole("button", { name: /Carica la copia firmata/ }));
    await waitFor(() => expect(s.insert).toHaveBeenCalledTimes(1));
    const [percorso, , opzioni] = s.upload.mock.calls[0];
    expect(percorso).toMatch(/^az\/pos\/[0-9a-f-]{36}\.pdf$/);
    expect(opzioni).toMatchObject({ contentType: "application/pdf", upsert: false });
    const riga = s.insert.mock.calls[0][0];
    expect(riga).toMatchObject({ company_id: "az", pos_id: "pos", emissione_id: "em-1", revisione: 2, file_path: percorso, file_name: "firmato dal datore.pdf", dimensione: 4000, firmato_il: "2026-10-30", note: "Scansione a colori", caricata_da: "utente-1" });
    expect(riga.sha256).toMatch(/^[0-9a-f]{64}$/);
    await waitFor(() => expect(onCaricata).toHaveBeenCalledWith("2026-10-30"));
    expect(s.ok).toHaveBeenCalledWith("Copia firmata conservata");
  });

  it("senza data dichiarata la riga non ne inventa una", async () => {
    const onCaricata = mostra();
    await screen.findByText("Nessuna copia firmata caricata.");
    scegli(fileFinto());
    fireEvent.click(screen.getByRole("button", { name: /Carica la copia firmata/ }));
    await waitFor(() => expect(s.insert).toHaveBeenCalled());
    expect(s.insert.mock.calls[0][0]).toMatchObject({ firmato_il: null, note: null });
    await waitFor(() => expect(onCaricata).toHaveBeenCalledWith(null));
  });

  it("un file che non è un PDF non parte: nessun caricamento e un messaggio chiaro", async () => {
    mostra();
    await screen.findByText("Nessuna copia firmata caricata.");
    scegli(fileFinto("<html"));
    fireEvent.click(screen.getByRole("button", { name: /Carica la copia firmata/ }));
    await waitFor(() => expect(s.errore).toHaveBeenCalledWith(expect.stringContaining("non è un PDF")));
    expect(s.upload).not.toHaveBeenCalled();
    expect(s.insert).not.toHaveBeenCalled();
  });

  it("se il caricamento fallisce non registra nulla; se la registrazione è rifiutata mostra il motivo del database", async () => {
    s.upload.mockResolvedValue({ error: { message: "rete" } });
    mostra();
    await screen.findByText("Nessuna copia firmata caricata.");
    scegli(fileFinto());
    fireEvent.click(screen.getByRole("button", { name: /Carica la copia firmata/ }));
    await waitFor(() => expect(s.errore).toHaveBeenCalledWith(expect.stringContaining("Caricamento del file non riuscito")));
    expect(s.insert).not.toHaveBeenCalled();
    s.errore.mockClear(); s.upload.mockResolvedValue({ error: null });
    s.insert.mockResolvedValue({ error: { message: "La copia firmata deve riferirsi a un PDF emesso di questo POS" } });
    fireEvent.click(screen.getByRole("button", { name: /Carica la copia firmata/ }));
    await waitFor(() => expect(s.errore).toHaveBeenCalledWith("La copia firmata deve riferirsi a un PDF emesso di questo POS"));
    s.errore.mockClear();
    s.insert.mockResolvedValue({ error: { message: "duplicate key value violates unique constraint \"pos_copie_firmate_file_path_key\"" } });
    fireEvent.click(screen.getByRole("button", { name: /Carica la copia firmata/ }));
    await waitFor(() => expect(s.errore).toHaveBeenCalledWith("Copia firmata non registrata: riprova"));
  });

  it("senza il PDF approvato della revisione non si carica, e lo dice", async () => {
    mostra({ emissioneId: null });
    await screen.findByText("Nessuna copia firmata caricata.");
    expect(screen.getByText(/non è ancora pronto/)).toBeTruthy();
    expect(screen.getByLabelText("File PDF firmato")).toBeDisabled();
    expect(screen.getByRole("button", { name: /Carica la copia firmata/ })).toBeDisabled();
  });

  it("in sola lettura si vedono e si scaricano le copie, ma non c'è il caricamento", async () => {
    s.righe = [copia()];
    mostra({ puoCaricare: false });
    expect(await screen.findByText("POS firmato.pdf")).toBeTruthy();
    expect(screen.queryByLabelText("File PDF firmato")).toBeNull();
    expect(screen.queryByRole("button", { name: /Carica la copia firmata/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Scarica" })).toBeTruthy();
  });

  it("un errore di lettura non si scambia per «nessuna copia»", async () => {
    s.erroreLista = { message: "boom" };
    mostra();
    expect((await screen.findByRole("alert")).textContent).toContain("non sono disponibili");
    expect(screen.queryByText("Nessuna copia firmata caricata.")).toBeNull();
  });
});
