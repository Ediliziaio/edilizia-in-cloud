import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InputDossier } from "@/lib/orders/generali/rendiconto";

/**
 * Il bottone «Rendiconto» della commessa generale: cosa vede chi usa l'app. I numeri sono
 * quelli veri dei moduli (fixture); finte solo le letture, il PDF e l'invio.
 */
const m = vi.hoisted(() => ({
  mobile: false,
  modifica: true,
  invia: vi.fn(),
  input: null as unknown,
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
// Le caselle di Radix misurano il contenitore: in jsdom basta che non cadano.
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => m.mobile }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canEditOrders: m.modifica }) }));
vi.mock("@react-pdf/renderer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@react-pdf/renderer")>()),
  pdf: () => ({ toBlob: async () => new Blob(["%PDF-1.4"], { type: "application/pdf" }) }),
}));
vi.mock("@/hooks/useGeneraleRendiconto", () => ({
  useDatiDossier: () => ({ input: m.input, isLoading: false }),
  useFotoDossier: () => ({ data: [] as unknown[], isLoading: false }),
  useInviaDossier: () => ({ mutate: m.invia, isPending: false }),
  useStoricoDossier: () => ({
    isLoading: false, isError: false, refetch: vi.fn(),
    data: [{
      id: "d1", modello: "banca", titolo: "Rendiconto", sezioni: ["sintesi", "piano"], livello: "margini", destinatari: ["fidi@banca.example"],
      oggetto: "Rendiconto Residenza Via Roma", stato: "inviato", esiti: [] as unknown[], errore: null as string | null,
      pdfPath: "a/g1/d1.pdf", xlsxPath: null as string | null, creatoIl: "2027-05-02T10:00:00Z", inviatoIl: "2027-05-02T10:00:01Z",
    }],
  }),
  linkFileDossier: vi.fn(),
  fotoPerPdf: vi.fn(),
}));

const { BottoneRendiconto } = await import("@/components/orders/generali/rendiconto/RendicontoGenerale");
const { inputSviluppo, riepilogoSviluppo } = await import("@/test/fixtures/generaleRendiconto");

const prepara = (i: InputDossier) => {
  m.input = { ...i, sezioni: undefined, periodo: undefined, modello: undefined, foto: undefined, note: undefined };
  return i.riepilogo;
};

beforeEach(() => {
  m.mobile = false;
  m.modifica = true;
  m.invia.mockReset();
  URL.createObjectURL = vi.fn(() => "blob:anteprima") as never;
  URL.revokeObjectURL = vi.fn() as never;
});
afterEach(cleanup);

const apri = async (r: ReturnType<typeof riepilogoSviluppo>) => {
  render(<BottoneRendiconto riepilogo={r} />);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Rendiconto/ })); });
};
const casella = (nome: string) => screen.getByRole("checkbox", { name: new RegExp(nome) });

describe("Rendiconto della commessa generale", () => {
  it("da telefono: solo lo storico, con il PDF da riaprire", async () => {
    m.mobile = true;
    await apri(prepara(inputSviluppo()));
    expect(screen.getByText("Rendiconti inviati")).toBeInTheDocument();
    expect(screen.getByText("A fidi@banca.example")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Apri il PDF/ })).toBeInTheDocument();
    expect(screen.queryByText("Per chi è")).not.toBeInTheDocument();
  });

  it("per la banca: senza la posizione dei soci; «Per i soci» la mette e toglie i documenti", async () => {
    await apri(prepara(inputSviluppo()));
    expect(casella("Posizione di soci e investitori")).not.toBeChecked();
    expect(casella("Fonti, debito e rendimenti")).toBeChecked();
    expect(casella("Contratto e SAL")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Per i soci" }));
    expect(casella("Posizione di soci e investitori")).toBeChecked();
    expect(casella("Documenti")).not.toBeChecked();
  });

  it("chi non vede i margini non può scegliere piano, cassa e investitori, e sa perché", async () => {
    const riepilogo = riepilogoSviluppo({ importi: true, costi: false, margini: false });
    await apri(prepara(inputSviluppo({ riepilogo, piano: null, conti: null, fotografie: null })));
    expect(casella("Piano economico")).toBeDisabled();
    expect(casella("Posizione di soci e investitori")).toBeDisabled();
    expect(screen.getAllByText("Serve il permesso di vedere i margini.").length).toBeGreaterThanOrEqual(4);
  });

  it("parte solo con «Invia», a tutti gli indirizzi scritti", async () => {
    await apri(prepara(inputSviluppo()));
    const invia = () => screen.getByRole("button", { name: /^Invia/ });
    await waitFor(() => expect(screen.getByRole("button", { name: /^PDF$/ })).toBeEnabled());
    expect(invia()).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Invia a"), { target: { value: "fidi@banca.example; nonvalido" } });
    expect(screen.getByText(/Non sembrano indirizzi email: nonvalido/)).toBeInTheDocument();
    expect(invia()).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Invia a"), { target: { value: "fidi@banca.example, socio@edil.example" } });
    expect(m.invia).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Invia a 2 destinatari" })); });
    expect(m.invia).toHaveBeenCalledTimes(1);
    const inviato = m.invia.mock.calls[0][0];
    expect(inviato.destinatari).toEqual(["fidi@banca.example", "socio@edil.example"]);
    expect(inviato.modello).toBe("banca");
    expect(inviato.sezioni).not.toContain("investitori");
    expect(inviato.excel).toBeNull();
  });

  it("cambiare le scelte blocca l'invio finché non si aggiorna l'anteprima", async () => {
    await apri(prepara(inputSviluppo()));
    await waitFor(() => expect(screen.getByRole("button", { name: /^PDF$/ })).toBeEnabled());
    fireEvent.click(casella("Unità e vendite"));
    expect(screen.getByText(/aggiorna l'anteprima prima di scaricare o inviare/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^PDF$/ })).toBeDisabled();
  });

  it("senza il permesso di modificare: si scarica, non si invia", async () => {
    m.modifica = false;
    await apri(prepara(inputSviluppo()));
    expect(screen.queryByLabelText("Invia a")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Invia/ })).not.toBeInTheDocument();
    expect(screen.getByText(/per inviarli serve il permesso/)).toBeInTheDocument();
  });
});
