import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SilvioConversazione, type ConversazioneSilvio } from "@/components/silvio/SilvioConversazione";

describe("Silvio risponde nel popup", () => {
  it("la domanda resta nel popup, le proposte si applicano solo col clic e solo quelle spuntate", async () => {
    const chiedi = vi.fn<ConversazioneSilvio["chiedi"]>().mockResolvedValue({
      testo: "Le metto in fila da lunedì.",
      proposte: [
        { tipo: "date", livello: "sottofase", id: "s1", nome: "Tracce", dal: "2026-11-09", al: "2026-11-10", primaDal: null, primaAl: null },
        { tipo: "chi", sottofaseId: "s1", sottofase: "Tracce", chiId: "p1", chi: "Mario Rossi", genere: "persona" },
      ],
      scartate: ["«Sanitari» è già fatta"],
    });
    const applica = vi.fn<ConversazioneSilvio["applica"]>().mockResolvedValue();
    render(<SilvioConversazione conversazione={{ chiedi, applica }} domande={["Pianifica le date di fasi e sottofasi"]} />);

    fireEvent.click(screen.getByRole("button", { name: "Pianifica le date di fasi e sottofasi" }));
    expect(await screen.findByText("Le metto in fila da lunedì.")).toBeInTheDocument();
    expect(chiedi).toHaveBeenCalledExactlyOnceWith("Pianifica le date di fasi e sottofasi", [], []);
    expect(applica).not.toHaveBeenCalled();
    expect(screen.getByText(/già fatta/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: /Mario Rossi/ }));
    fireEvent.click(screen.getByRole("button", { name: "Applica 1" }));
    await waitFor(() => expect(applica).toHaveBeenCalledTimes(1));
    expect(applica.mock.calls[0][0]).toEqual([expect.objectContaining({ tipo: "date", id: "s1" })]);
    expect(await screen.findByText(/Applicato/)).toBeInTheDocument();
  });

  it("la graffetta carica il file, lo mostra, lo manda con la domanda e si può togliere", async () => {
    const carica = vi.fn<NonNullable<ConversazioneSilvio["carica"]>>().mockImplementation(async (f) => ({ path: `az/u/${f.name}`, nome: f.name }));
    const chiedi = vi.fn<ConversazioneSilvio["chiedi"]>().mockResolvedValue({ testo: "Letto.", proposte: [], scartate: [] });
    render(<SilvioConversazione conversazione={{ chiedi, applica: vi.fn(), carica }} domande={["Pianifica"]} />);
    const pdf = new File(["%PDF"], "crono.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText("Scegli i file da allegare"), { target: { files: [pdf] } });
    expect(await screen.findByText("crono.pdf")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pianifica" }));
    await screen.findByText("Letto.");
    expect(chiedi).toHaveBeenCalledWith("Pianifica", [], [{ path: "az/u/crono.pdf", nome: "crono.pdf" }]);
    fireEvent.click(screen.getByRole("button", { name: "Togli crono.pdf" }));
    expect(screen.queryByText("crono.pdf")).not.toBeInTheDocument();
  });

  it("senza carica non c'è la graffetta; troppi file: si dice il limite", async () => {
    const { unmount } = render(<SilvioConversazione conversazione={{ chiedi: vi.fn(), applica: vi.fn() }} domande={[]} />);
    expect(screen.queryByLabelText("Allega un file (PDF, foto, testo)")).not.toBeInTheDocument();
    unmount();
    const carica = vi.fn<NonNullable<ConversazioneSilvio["carica"]>>().mockImplementation(async (f) => ({ path: f.name, nome: f.name }));
    render(<SilvioConversazione conversazione={{ chiedi: vi.fn(), applica: vi.fn(), carica }} domande={[]} />);
    const files = ["a", "b", "c", "d"].map((n) => new File(["x"], `${n}.pdf`));
    fireEvent.change(screen.getByLabelText("Scegli i file da allegare"), { target: { files } });
    expect(await screen.findByText(/Al massimo 3 file/)).toBeInTheDocument();
    await waitFor(() => expect(carica).toHaveBeenCalledTimes(3));
  });

  it("un errore si legge nel popup e si può riprovare", async () => {
    const chiedi = vi.fn<ConversazioneSilvio["chiedi"]>().mockRejectedValue(new Error("Silvio non risponde: riprova tra poco"));
    render(<SilvioConversazione conversazione={{ chiedi, applica: vi.fn() }} domande={[]} />);
    fireEvent.change(screen.getByLabelText("Domanda per Silvio"), { target: { value: "Cosa manca?" } });
    fireEvent.click(screen.getByRole("button", { name: "Manda a Silvio" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Silvio non risponde");
    expect(screen.getByLabelText("Domanda per Silvio")).toHaveValue("");
  });
});
