import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
vi.mock("@/components/orders/SupplierSelect", () => ({ SupplierSelect: () => <p>fornitori</p> }));
vi.mock("@/components/warehouse/OrderSelectCombobox", () => ({ OrderSelectCombobox: () => <p>commesse</p> }));
const pdf = vi.hoisted(() => ({ pagine: vi.fn() }));
vi.mock("@/lib/ddt/dividiPdf", () => ({ paginePdfComeImmagini: pdf.pagine }));
import { FinestraBollaFotoRighe } from "@/components/ddt/FinestraBollaFotoRighe";
import type { DDTRigaNuova } from "@/hooks/useDDTRicezione";
import type { TestataBolla } from "@/lib/ddt/righeBolla";
import { leggiDDTdaAI } from "@/lib/ddt/letturaAI";

const schermo = (largo: boolean) => {
  window.matchMedia = ((q: string) => ({
    matches: largo, media: q, onchange: null, addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  })) as typeof window.matchMedia;
};
beforeEach(() => {
  schermo(true);
  URL.createObjectURL = vi.fn(() => "blob:foto");
  URL.revokeObjectURL = vi.fn();
  pdf.pagine.mockReset().mockResolvedValue(["data:image/jpeg;base64,p1", "data:image/jpeg;base64,p2"]);
});
afterEach(cleanup);

function Prova({ files, righeIniziali = [], conferma = vi.fn(), carico }: {
  files: File[]; righeIniziali?: DDTRigaNuova[]; conferma?: () => void; carico?: { visibile: boolean; valore: boolean; onChange: (v: boolean) => void };
}) {
  const [righe, setRighe] = useState(righeIniziali);
  const [t, setT] = useState<TestataBolla>({ numero: "", data: "2026-11-12", supplierId: null, orderId: null, destinazione: "magazzino" });
  return (
    <FinestraBollaFotoRighe
      open onOpenChange={vi.fn()} files={files} companyId="c" testata={t}
      onTestataChange={(p) => setT((x) => ({ ...x, ...p }))} righe={righe} onRigheChange={setRighe}
      carico={carico} conferma={{ etichetta: "Registra la bolla", onConferma: conferma }}
    />
  );
}

it("la foto sta a sinistra, sempre aperta, con zoom; le righe si scrivono a mano", async () => {
  const conferma = vi.fn();
  render(<Prova files={[new File(["x"], "bolla.jpg", { type: "image/jpeg" })]} conferma={conferma} />);
  const visori = await screen.findAllByAltText("Originale bolla.jpg");
  expect(visori.length).toBeGreaterThan(0);
  const comandi = screen.getByRole("toolbar", { name: "Comandi dell'originale" });
  expect(within(comandi).getByText("100%")).toBeInTheDocument();
  fireEvent.click(within(comandi).getByRole("button", { name: "Ingrandisci" }));
  expect(within(comandi).getByText("150%")).toBeInTheDocument();
  fireEvent.click(within(comandi).getByRole("button", { name: "Adatta" }));
  expect(within(comandi).getByText("100%")).toBeInTheDocument();

  const registra = screen.getByRole("button", { name: "Registra la bolla" });
  expect(registra).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Numero bolla"), { target: { value: "B-12" } });
  fireEvent.click(screen.getByRole("button", { name: "Aggiungi riga" }));
  await waitFor(() => expect(screen.getByLabelText("Descrizione riga 1")).toHaveFocus());
  expect(registra).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Descrizione riga 1"), { target: { value: "Coppi" } });
  fireEvent.change(screen.getByLabelText("Quantità riga 1"), { target: { value: "40" } });
  fireEvent.change(screen.getByLabelText("UM riga 1"), { target: { value: "pz" } });
  expect(registra).toBeEnabled();
  fireEvent.click(registra);
  expect(conferma).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Elimina riga 1" }));
  expect(screen.queryByLabelText("Descrizione riga 1")).not.toBeInTheDocument();
});

it("un PDF a più pagine si sfoglia pagina per pagina", async () => {
  render(<Prova files={[new File(["%PDF"], "bolla.pdf", { type: "application/pdf" })]} />);
  const comandi = await screen.findByRole("toolbar", { name: "Comandi dell'originale" });
  await within(comandi).findByText("Pagina 1 di 2");
  fireEvent.click(within(comandi).getByRole("button", { name: "Pagina successiva" }));
  expect(within(comandi).getByText("Pagina 2 di 2")).toBeInTheDocument();
});

it("se il PDF non si apre resta il visore del browser", async () => {
  pdf.pagine.mockRejectedValue(new Error("protetto"));
  render(<Prova files={[new File(["%PDF"], "bolla.pdf", { type: "application/pdf" })]} />);
  expect((await screen.findAllByTitle("Originale bolla.pdf"))[0]).toHaveAttribute("src", "blob:foto");
});

it("la correzione toglie l'abbinamento e conserva la lettura AI originale", async () => {
  const documento = { righe_merce: [{ descrizione: "Malta", quantita: 2, unita_misura: "pz" }] };
  const righe = leggiDDTdaAI(documento).righe;
  righe[0].purchase_order_item_id = "vecchia";
  const cambi: DDTRigaNuova[][] = [];
  render(
    <FinestraBollaFotoRighe open onOpenChange={vi.fn()} files={[]} companyId="c"
      testata={{ numero: "1", data: "2026-11-12", supplierId: null, orderId: null, destinazione: "magazzino" }}
      onTestataChange={vi.fn()} righe={righe} onRigheChange={(r) => cambi.push(r)} />,
  );
  expect(screen.getByText(/Nessun originale caricato/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Quantità riga 1"), { target: { value: "3" } });
  expect(cambi[0][0]).toMatchObject({ quantita: 3, prezzo_unitario: null, importo: null, origine: "manuale", purchase_order_item_id: null, ai_originale: documento.righe_merce[0] });
});

it("la spunta «Carica in magazzino» c'è, è già messa e si può togliere", () => {
  const cambia = vi.fn();
  render(<Prova files={[]} carico={{ visibile: true, valore: true, onChange: cambia }} />);
  const spunta = screen.getByRole("checkbox", { name: "Carica in magazzino" });
  expect(spunta).toBeChecked();
  fireEvent.click(spunta);
  expect(cambia).toHaveBeenCalledWith(false);
});

it("sul telefono la foto sta sopra, ridotta: un tocco la apre a tutto schermo", async () => {
  schermo(false);
  render(<Prova files={[new File(["x"], "bolla.jpg", { type: "image/jpeg" })]} />);
  expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
  fireEvent.click(await screen.findByRole("button", { name: "Ingrandisci la foto della bolla" }));
  expect(screen.getByRole("toolbar", { name: "Comandi dell'originale" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Chiudi foto/ }));
  expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Numero bolla")).toBeInTheDocument();
});
