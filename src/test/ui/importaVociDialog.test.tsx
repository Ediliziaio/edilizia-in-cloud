import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ImportaVociDialog } from "@/components/computo/ImportaVociDialog";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ effectiveCompany: { id: "d2000000-0000-4000-a000-000000000002" }, user: { id: "u1" } }),
}));

vi.mock("@/lib/computo/leggiFileComputo", async () => {
  const vero = await vi.importActual<typeof import("@/lib/computo/leggiFileComputo")>("@/lib/computo/leggiFileComputo");
  return { ...vero, leggiFileComputo: vi.fn(async () => { throw new vero.PdfDaLeggereConAi("Questo PDF non è un computo stampato da PriMus."); }) };
});
const server = vi.hoisted(() => ({ estraiSulServer: vi.fn() }));
vi.mock("@/lib/computo/estrazioneServer", () => server);

/** Computo inventato: nessun dato di clienti. */
const CSV = [
  "N.;Descrizione;U.M.;Quantità;Prezzo;Importo",
  "1;OPERE MURARIE;;;;",
  "1.1;Intonaco civile;mq;10,00;24,00;240,00",
  "1.2;Tinteggiatura;mq;20,00;;",
  "1.3;Battiscopa;m;15,00;6,00;90,00",
].join("\n");

async function apri(files: File[], props: Partial<Parameters<typeof ImportaVociDialog>[0]> = {}) {
  const onAggiungi = vi.fn();
  render(<ImportaVociDialog open onOpenChange={() => {}} onAggiungi={onAggiungi} vociPresenti={0} consentiAi={false} {...props} />);
  const input = screen.getByLabelText("File da cui importare le voci") as HTMLInputElement;
  await act(async () => { fireEvent.change(input, { target: { files } }); });
  return onAggiungi;
}

describe("Importa voci: il popup", () => {
  it("si apre con l'area di rilascio, il pulsante e i formati letti", () => {
    render(<ImportaVociDialog open onOpenChange={() => {}} onAggiungi={() => {}} vociPresenti={0} consentiAi />);
    expect(screen.getByText("Trascina qui i file")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Scegli file" })).toBeInTheDocument();
    const formati = within(screen.getByRole("list", { name: "Formati letti" })).getAllByRole("listitem").map(l => l.textContent);
    expect(formati).toEqual(["PriMus (XPWE)", "PDF", "Excel", "CSV", "Word", "Foto"]);
    const input = screen.getByLabelText("File da cui importare le voci");
    expect(input).toHaveAttribute("multiple");
    expect(input.closest("[data-zona-rilascio]") ?? screen.getByText("Trascina qui i file").closest("[data-zona-rilascio]")).not.toBeNull();
    expect(screen.queryByText(/Sonnet|GPT|OpenRouter|€ di AI/)).not.toBeInTheDocument();
  });

  it("legge, mostra le voci da rivedere e aggiunge solo dopo la conferma", async () => {
    const onAggiungi = await apri([new File([CSV], "voci.csv", { type: "text/csv" })], { vociPresenti: 4 });
    expect(await screen.findByText("Pronte 3 voci")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Aggiungi 3 voci" }, { timeout: 3000 })).toBeInTheDocument();
    expect(onAggiungi).not.toHaveBeenCalled();
    expect(screen.getByText(/Le 4 voci che ci sono già restano come sono/)).toBeInTheDocument();

    // La voce senza prezzo è segnalata e si filtra.
    const incerte = document.querySelectorAll("tr[data-incerta]");
    expect(incerte).toHaveLength(1);
    expect(incerte[0]).toHaveTextContent("Manca il prezzo");
    fireEvent.click(screen.getByRole("button", { name: "Da controllare (1)" }));
    expect(screen.getAllByLabelText("Descrizione")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Da controllare (1)" }));

    // Si corregge il prezzo e si toglie una voce.
    const prezzi = screen.getAllByLabelText("Prezzo");
    fireEvent.change(prezzi[1], { target: { value: "8" } });
    expect(document.querySelectorAll("tr[data-incerta]")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Togli Battiscopa" }));

    fireEvent.click(screen.getByRole("button", { name: "Aggiungi 2 voci" }));
    expect(onAggiungi).toHaveBeenCalledTimes(1);
    const [voci, esito] = onAggiungi.mock.calls[0];
    expect(voci.map((v: { descrizione: string; prezzo: string }) => [v.descrizione, v.prezzo])).toEqual([["Intonaco civile", "24"], ["Tinteggiatura", "8"]]);
    expect(esito).not.toBeNull();
  });

  it("un file che non si legge dice perché e non tocca niente", async () => {
    const onAggiungi = await apri([new File(["x"], "computo.dcf")]);
    expect(await screen.findByRole("alert")).toHaveTextContent("File › Esporta › XPWE");
    expect(screen.getByText(/Il documento non è stato modificato/)).toBeInTheDocument();
    expect(onAggiungi).not.toHaveBeenCalled();
  });

  it("più file insieme: quelli buoni si leggono, gli altri si spiegano", async () => {
    await apri([new File([CSV], "voci.csv", { type: "text/csv" }), new File(["x"], "foto.png", { type: "image/png" })]);
    expect(await screen.findByRole("button", { name: "Aggiungi 3 voci" }, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("foto.png non letto: Per leggere questo file serve l'AI");
  });

  it("un PDF che non viene da PriMus passa alla lettura con l'AI, con le sue fasi", async () => {
    server.estraiSulServer.mockImplementation(async (_f: File, o: { onStato: (s: { stato: string; dettaglio?: string }) => void }) => {
      o.onStato({ stato: "uploading" });
      o.onStato({ stato: "analyzing_ai", dettaglio: "3/3 pagine lette; analisi delle voci…" });
      return [{
        id: "a", capitolo_nome: "Demolizioni", codice_voce: null, codice_prezzario: null, descrizione_breve: "Rimozione sanitari",
        descrizione_estesa: null, unita_misura: "cad", quantita: 3, prezzo_unitario_computo: 40, confidence: 0.5, warnings: null,
      }];
    });
    await apri([new File(["%PDF"], "preventivo.pdf", { type: "application/pdf" })], { consentiAi: true });
    expect(await screen.findByRole("button", { name: "Aggiungi 1 voce" }, { timeout: 3000 })).toBeInTheDocument();
    expect(server.estraiSulServer).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/letto con l'AI/)).toBeInTheDocument();
    expect(document.querySelector("tr[data-incerta]")).toHaveTextContent("Lettura incerta");
  });

  it("si scelgono le voci, per voce o per capitolo: solo le selezionate si importano", async () => {
    const CSV2 = [
      "N.;Descrizione;U.M.;Quantità;Prezzo;Importo",
      "1;OPERE MURARIE;;;;",
      "1.1;Intonaco civile;mq;10,00;24,00;240,00",
      "1.2;Rasatura;mq;10,00;10,00;100,00",
      "2;TINTEGGIATURE;;;;",
      "2.1;Tinteggiatura;mq;20,00;8,00;160,00",
    ].join("\n");
    const onAggiungi = await apri([new File([CSV2], "voci.csv", { type: "text/csv" })]);
    await screen.findByRole("button", { name: "Aggiungi 3 voci" }, { timeout: 3000 });
    expect(document.querySelectorAll("tbody[data-capitolo]")).toHaveLength(2);
    expect(screen.getByTestId("contatore-selezione")).toHaveTextContent("3 selezionate su 3");
    expect(screen.getByText(/totale selezionate/)).toHaveTextContent("500,00 €");

    // Via un capitolo intero, poi una voce torna dentro.
    fireEvent.click(screen.getByLabelText("Seleziona il capitolo OPERE MURARIE"));
    expect(screen.getByTestId("contatore-selezione")).toHaveTextContent("1 selezionate su 3");
    fireEvent.click(screen.getByLabelText("Importa Rasatura"));
    expect(screen.getByTestId("contatore-selezione")).toHaveTextContent("2 selezionate su 3");
    expect(screen.getByLabelText("Seleziona il capitolo OPERE MURARIE")).toHaveProperty("indeterminate", true);
    expect(screen.getByText(/totale selezionate/)).toHaveTextContent("260,00 €");

    // Il capitolo si corregge.
    const capitoli = screen.getAllByLabelText("Capitolo");
    fireEvent.change(capitoli[1], { target: { value: "FINITURE" } });

    fireEvent.click(screen.getByRole("button", { name: "Aggiungi 2 voci" }));
    const [voci] = onAggiungi.mock.calls[0];
    expect(voci.map((v: { descrizione: string; capitolo: string }) => [v.descrizione, v.capitolo])).toEqual([["Rasatura", "FINITURE"], ["Tinteggiatura", "TINTEGGIATURE"]]);
  });

  it("mentre legge mostra il foglio con le righe che si accendono", async () => {
    await apri([new File([CSV], "voci.csv", { type: "text/csv" })]);
    const foglio = document.querySelector(".importa-voci-foglio");
    expect(foglio).not.toBeNull();
    expect(foglio).toHaveTextContent("CSV");
  });
});
