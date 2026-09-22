import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState, type ReactNode } from "react";

vi.mock("@/components/ui/rich-text-editor-safe", () => ({
  RichTextEditorSafe: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea aria-label="Testo" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

// Il voto del Profilo azienda si legge dal database: qui basta sapere che c'è.
vi.mock("@/components/preventivi/VotoOnlineDelProfilo", () => ({
  VotoOnlineDelProfilo: () => <p>Il voto del Profilo azienda</p>,
}));

import { OrdineCapitoli } from "@/components/preventivi/OrdineCapitoli";

/** «Ordine e pagine» nell'editor, usato come lo usa un'azienda. */
afterEach(cleanup);

function Editor({ contenuti }: { contenuti?: Partial<Record<"recensioni" | "domande" | "garanzie" | "lavori", ReactNode>> }) {
  const [ordine, setOrdine] = useState<unknown>(null);
  const [pagine, setPagine] = useState<unknown>([]);
  const [blocchi, setBlocchi] = useState<Record<string, unknown>>({});
  return (
    <>
      <OrdineCapitoli
        ordine={ordine} pagine={pagine} onOrdine={setOrdine} onPagine={(v) => setPagine(v)} campoFoto={() => <div>foto</div>}
        settore="bagni" blocchi={blocchi} onBlocchi={setBlocchi} contenuti={contenuti}
      />
      <output data-testid="salvato">{JSON.stringify({ ordine, pagine, blocchi })}</output>
    </>
  );
}
const salvato = () => JSON.parse(screen.getByTestId("salvato").textContent ?? "{}");
const righe = () => screen.getAllByRole("listitem").map((li) => (li.querySelector("p")?.textContent ?? "").replace(/pagina vostra$/, "").trim());

describe("editor: ordine e pagine", () => {
  it("mostra l'ordine di serie, con l'apertura in testa", () => {
    render(<Editor />);
    expect(righe().slice(0, 3)).toEqual(["Apertura", "Chi siamo", "Il progetto"]);
  });

  it("sposta un capitolo e salva l'ordine", () => {
    render(<Editor />);
    fireEvent.click(screen.getByRole("button", { name: "Sposta su Il tuo investimento" }));
    const ordine = salvato().ordine.map((v: { chiave: string }) => v.chiave);
    // Di serie prima del prezzo c'è «Cosa è compreso» (22/09/2026): si scambia con quello.
    expect(ordine.indexOf("investimento")).toBeLessThan(ordine.indexOf("compreso"));
  });

  it("nasconde un capitolo, ma non il prezzo", () => {
    render(<Editor />);
    fireEvent.click(screen.getByRole("button", { name: "Nascondi Chi siamo" }));
    expect(salvato().ordine.find((v: { chiave: string }) => v.chiave === "chiSiamo").visibile).toBe(false);
    expect(screen.queryByRole("button", { name: "Nascondi Il tuo investimento" })).toBeNull();
  });

  it("aggiunge una pagina vostra, la scrive, e la mette prima del prezzo", () => {
    render(<Editor />);
    fireEvent.click(screen.getByRole("button", { name: /Aggiungi una pagina vostra/ }));
    const titolo = screen.getByPlaceholderText("Le nostre *certificazioni*.");
    fireEvent.change(titolo, { target: { value: "Lo *showroom*." } });
    const s = salvato();
    expect(s.pagine).toHaveLength(1);
    expect(s.pagine[0].titolo).toBe("Lo *showroom*.");
    const ordine = s.ordine.map((v: { chiave: string }) => v.chiave);
    expect(ordine.indexOf(`libera:${s.pagine[0].id}`)).toBe(ordine.indexOf("piano") - 1);
    expect(within(screen.getAllByRole("listitem")[ordine.indexOf(`libera:${s.pagine[0].id}`)]).getByText("pagina vostra")).toBeTruthy();
  });

  it("«Di serie» torna all'ordine di partenza", () => {
    render(<Editor />);
    fireEvent.click(screen.getByRole("button", { name: "Sposta su Il tuo investimento" }));
    fireEvent.click(screen.getByRole("button", { name: /Di serie/ }));
    expect(salvato().ordine).toBeNull();
  });

  // 22/09/2026 — I blocchi della libreria si modificano da qui.
  it("le pagine-promessa sono accese e chiedono di rileggerle; la matita apre l'editor del blocco", () => {
    render(<Editor />);
    expect(screen.getAllByText(/Promette qualcosa al cliente: rileggila/).length).toBe(5);
    fireEvent.click(screen.getByRole("button", { name: "Modifica Protezione della casa" }));
    const titolo = screen.getByDisplayValue("Trattiamo la tua casa *come se fosse la nostra*.");
    fireEvent.change(titolo, { target: { value: "La tua casa, *protetta*." } });
    expect(salvato().blocchi).toEqual({ protezione: { titolo: "La tua casa, *protetta*." } });
    // Svuotare il campo per riscriverlo non fa ricomparire il testo di serie.
    fireEvent.change(screen.getByDisplayValue("La tua casa, *protetta*."), { target: { value: "" } });
    expect((screen.getAllByRole("textbox").find((t) => (t as HTMLInputElement).value === "" ) as HTMLInputElement | undefined)).toBeDefined();
  });

  // 22/09/2026 — Le pagine che raccontano l'azienda si scrivono tutte da qui.
  it("«Dicono di noi»: la matita apre testata, voto e recensioni; si salva solo il campo cambiato", () => {
    render(<Editor contenuti={{ recensioni: <p>Le recensioni del modello</p>, domande: <p>Le domande del modello</p> }} />);
    fireEvent.click(screen.getByRole("button", { name: "Modifica Dicono di noi" }));
    expect(screen.getByLabelText("Occhiello")).toHaveValue("Dicono di noi");
    expect(screen.getByLabelText("Titolo")).toHaveValue("La parola ai *nostri clienti*.");
    // L'introduzione di serie cambia coi contenuti: il campo è vuoto e lo dice.
    expect(screen.getByLabelText("Introduzione")).toHaveValue("");
    expect(screen.getByLabelText("Introduzione")).toHaveAttribute("placeholder", expect.stringMatching(/Cambia con quello che c'è/));
    expect(screen.getByText("Il voto del Profilo azienda")).toBeInTheDocument();
    expect(screen.getByText("Le recensioni del modello")).toBeInTheDocument();
    expect(screen.queryByText("Le domande del modello")).toBeNull();
    fireEvent.change(screen.getByLabelText("Titolo"), { target: { value: "Parlano *loro*." } });
    expect(salvato().blocchi).toEqual({ testata_recensioni: { titolo: "Parlano *loro*." } });
  });

  it("anche domande, garanzie e lavori hanno la matita; «Torna ai testi di serie» toglie la testata", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<Editor contenuti={{ garanzie: <p>Le garanzie del modello</p> }} />);
    for (const nome of ["Domande e risposte", "I nostri lavori"]) {
      expect(screen.getByRole("button", { name: `Modifica ${nome}` })).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole("button", { name: "Modifica Le garanzie" }));
    expect(screen.getByText("Le garanzie del modello")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Torna ai testi di serie/ })).toBeNull();
    fireEvent.change(screen.getByLabelText("Occhiello"), { target: { value: "Siamo sicuri" } });
    expect(salvato().blocchi).toEqual({ testata_garanzie: { occhiello: "Siamo sicuri" } });
    fireEvent.click(screen.getByRole("button", { name: /Torna ai testi di serie/ }));
    expect(salvato().blocchi).toEqual({});
  });

  it("una tavola esce da sola: un posto solo; una foto la sostituisce, e una tavola sostituisce le foto", () => {
    render(<Editor />);
    // Nei bagni i controlli hanno di serie la tavola dell'acqua.
    fireEvent.click(screen.getByRole("button", { name: "Modifica Controlli di qualità" }));
    expect(screen.getByText("La tavola")).toBeInTheDocument();
    expect(screen.getByText(/Una tavola esce da sola e intera/)).toBeInTheDocument();
    const dallaLibreria = (nome: string) => {
      fireEvent.click(screen.getByRole("button", { name: /Scegli dalla libreria/ }));
      fireEvent.click(screen.getAllByText(nome, { selector: "span" })[0].closest("button") as HTMLButtonElement);
    };
    dallaLibreria("installazione");
    expect(salvato().blocchi.controlli.foto).toEqual(["/pdf-stock/bagni/installazione.jpg"]);
    dallaLibreria("protezione");
    expect(salvato().blocchi.controlli.foto).toEqual(["/pdf-stock/bagni/installazione.jpg", "/pdf-stock/bagni/protezione.jpg"]);
    expect(screen.getByText("Foto (al massimo due)")).toBeInTheDocument();
    dallaLibreria("tavola dal vecchio al nuovo");
    expect(salvato().blocchi.controlli.foto).toEqual(["/pdf-stock/bagni/tavola-dal-vecchio-al-nuovo.jpg"]);
  });

  it("«Torna ai testi di serie» cancella le scelte di quel blocco", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<Editor />);
    fireEvent.click(screen.getByRole("button", { name: "Modifica Come funziona" }));
    fireEvent.change(screen.getByDisplayValue("Quello che non vedrai, *fatto bene*."), { target: { value: "Sotto le piastrelle." } });
    expect(Object.keys(salvato().blocchi)).toEqual(["comeFunziona"]);
    fireEvent.click(screen.getByRole("button", { name: /Torna ai testi di serie/ }));
    expect(salvato().blocchi).toEqual({});
  });
});
