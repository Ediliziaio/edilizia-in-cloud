import { createRef } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ComputoImportPrimus, { type ComputoImportPrimusHandle } from "@/components/computo/ComputoImportPrimus";
import { bozzaVuota, voceVuota } from "@/lib/computo/editorNativo";
import type { ComputoStrutturato, ComputoVoceStrutturata } from "@/lib/computo/computoStrutturato";

const letto = vi.hoisted(() => ({ computo: null as unknown, errore: null as Error | null }));
vi.mock("@/lib/computo/leggiFileComputo", () => ({
  leggiFileComputo: vi.fn(async () => { if (letto.errore) throw letto.errore; return letto.computo; }),
}));

const voce = (descrizione: string, quantita: number, prezzo: number, extra: Partial<ComputoVoceStrutturata> = {}): ComputoVoceStrutturata => ({
  numero_ordine: "1", codici: [], codice_tariffa: "NP.1", descrizione, descrizione_troncata: false, unita_misura: "mq",
  quantita, prezzo_unitario: prezzo, importo: Math.round(quantita * prezzo * 100) / 100, sezione: null,
  super_categoria: { numero: 1, nome: "Opere edili" }, categoria: null, sotto_categoria: null,
  is_sicurezza: false, is_detrazione: false, a_corpo: false, misure: [], pagina: 1, avvisi: [], ...extra,
});
const computo = (p: Partial<ComputoStrutturato>): ComputoStrutturato => ({
  formato: "primus_pdf", metadata: {}, voci: [], totale_dichiarato: null, riepiloghi: [], prezzari: [], avvisi: [], ...p,
});

async function apriFile(onApplica = vi.fn(), bozza = bozzaVuota()) {
  const ref = createRef<ComputoImportPrimusHandle>();
  render(<ComputoImportPrimus ref={ref} bozza={bozza} onApplica={onApplica} onBusy={() => {}} />);
  const input = screen.getByLabelText("File del computo da importare") as HTMLInputElement;
  await act(async () => { fireEvent.change(input, { target: { files: [new File(["x"], "computo.pdf", { type: "application/pdf" })] } }); });
  return onApplica;
}

describe("Importa da PriMus", () => {
  it("prima di toccare la bozza dice se il totale torna con quello del documento", async () => {
    letto.errore = null;
    letto.computo = computo({ voci: [voce("Intonaco", 10, 24), voce("Pittura", 20, 8)], totale_dichiarato: 400 });
    const onApplica = await apriFile();
    expect(await screen.findByText("Uguale al totale stampato nel documento, al centesimo.")).toBeInTheDocument();
    expect(screen.getByText("400,00 €")).toBeInTheDocument();
    expect(onApplica).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Importa 2 lavorazioni" }));
    expect(onApplica).toHaveBeenCalledTimes(1);
    expect(onApplica.mock.calls[0][0].voci.map((v: { descrizione: string }) => v.descrizione)).toEqual(["Intonaco", "Pittura"]);
  });

  it("se il totale non torna lo dice, con la differenza", async () => {
    letto.errore = null;
    letto.computo = computo({ voci: [voce("Intonaco", 10, 24)], totale_dichiarato: 250 });
    await apriFile();
    expect(await screen.findByText(/Il documento dice 250,00 €: differenza -10,00 €/)).toBeInTheDocument();
  });

  it("le descrizioni abbreviate dal PDF sono un avviso solo, che dice dove sta il testo intero", async () => {
    letto.errore = null;
    letto.computo = computo({ voci: [voce("A ... B", 1, 1, { descrizione_troncata: true }), voce("C ... D", 1, 1, { descrizione_troncata: true })] });
    await apriFile();
    expect(await screen.findByText(/2 descrizioni sono abbreviate nel PDF/)).toHaveTextContent("File › Esporta › XPWE");
  });

  it("con voci già scritte dice che si aggiungono in coda", async () => {
    letto.errore = null;
    letto.computo = computo({ voci: [voce("Intonaco", 10, 24)] });
    await apriFile(vi.fn(), { ...bozzaVuota(), voci: [{ ...voceVuota(), descrizione: "Mia" }] });
    expect(await screen.findByText(/si aggiungono in coda alle 1 che ci sono già/)).toBeInTheDocument();
  });

  it("un file che non si legge non tocca la bozza e dice perché", async () => {
    letto.errore = new Error("Questo PDF non è un computo stampato da PriMus.");
    const onApplica = await apriFile();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Questo PDF non è un computo stampato da PriMus. La bozza non è stata modificata."));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onApplica).not.toHaveBeenCalled();
  });
});
