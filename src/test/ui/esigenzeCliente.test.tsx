/**
 * «Cosa ti ha detto il cliente?»: la scheda dove il venditore tocca i problemi del
 * cliente (freddo, spifferi, muffa…). Facoltativa: non obbliga a niente, parte dalla
 * libreria dell'azienda (o dalle voci pronte del modulo) e il testo scelto si può
 * ritoccare per quel cliente. L'anteprima a destra mostra le scelte con lo stesso
 * titolo del PDF.
 */
import { useState } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EsigenzeCliente } from "@/components/preventivatore/EsigenzeCliente";
import { AnteprimaVeloce } from "@/components/preventivatore/AnteprimaVeloce";
import type { AnteprimaPreventivo } from "@/lib/preventivatore/anteprima";
import type { EsigenzaCliente } from "@/lib/preventivatore/esigenze";

afterEach(() => cleanup());

const LIBRERIA: EsigenzaCliente[] = [
  { titolo: "Bollette energetiche elevate", descrizione: "Testo dell'azienda sulle bollette." },
  { titolo: "Impianto vecchio o rumoroso", descrizione: "Testo dell'azienda sul rumore." },
];
const DELLA_CASA: EsigenzaCliente[] = [
  { titolo: "Caldo d'estate in casa", descrizione: "Dimensioniamo su metri quadrati ed esposizione." },
  { titolo: "Bollette energetiche elevate", descrizione: "Doppione della libreria: non deve comparire due volte." },
  { titolo: "Aria umida o stantia", descrizione: "Deumidificazione e ricambio d'aria." },
];

/** Il genitore tiene la scelta, come fa il wizard: così il componente si prova com'è usato. */
function Prova({
  iniziale = [],
  libreria,
  massimoNelPdf,
  disabled,
  visto,
}: {
  iniziale?: EsigenzaCliente[];
  libreria?: EsigenzaCliente[];
  massimoNelPdf?: number;
  disabled?: boolean;
  visto?: (v: EsigenzaCliente[]) => void;
}) {
  const [valore, setValore] = useState<EsigenzaCliente[]>(iniziale);
  visto?.(valore);
  return (
    <EsigenzeCliente
      valore={valore}
      onChange={setValore}
      libreria={libreria}
      dellaCasa={DELLA_CASA}
      massimoNelPdf={massimoNelPdf}
      disabled={disabled}
    />
  );
}

describe("la scheda «Cosa ti ha detto il cliente?»", () => {
  it("è facoltativa e lo dice: senza scelte il PDF resta quello di sempre", () => {
    render(<Prova libreria={LIBRERIA} />);
    expect(screen.getByText("Cosa ti ha detto il cliente?")).toBeTruthy();
    expect(screen.getByText("Facoltativo")).toBeTruthy();
    expect(screen.getByText(/Se non scegli niente, il PDF resta quello di sempre/)).toBeTruthy();
    // Dice anche DOVE escono nel PDF, con le parole del PDF.
    expect(screen.getByText(/Il progetto.*Da dove partiamo/)).toBeTruthy();
    expect(screen.queryByLabelText("Esigenze scelte")).toBeNull();
  });

  it("con una libreria dell'azienda parte da quella; le voci pronte si aprono a richiesta, senza doppioni", () => {
    render(<Prova libreria={LIBRERIA} />);
    const gruppo = screen.getByRole("group", { name: "Esigenze del cliente" });
    expect(within(gruppo).getAllByRole("button").map((b) => b.textContent)).toEqual(LIBRERIA.map((v) => v.titolo));

    // «Altre idee pronte (2)»: le 3 del modulo meno quella già in libreria.
    fireEvent.click(screen.getByRole("button", { name: "Altre idee pronte (2)" }));
    expect(within(gruppo).getAllByRole("button").map((b) => b.textContent)).toEqual([
      ...LIBRERIA.map((v) => v.titolo), "Caldo d'estate in casa", "Aria umida o stantia",
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Nascondi le idee pronte" }));
    expect(within(gruppo).getAllByRole("button")).toHaveLength(2);
  });

  it("senza libreria le voci pronte sono già lì, e non c'è il pulsante per aprirle", () => {
    render(<Prova />);
    const gruppo = screen.getByRole("group", { name: "Esigenze del cliente" });
    expect(within(gruppo).getAllByRole("button").map((b) => b.textContent)).toEqual(DELLA_CASA.map((v) => v.titolo));
    expect(screen.queryByRole("button", { name: /Altre idee pronte/ })).toBeNull();
  });

  it("un tocco sceglie, un altro toglie; il testo scelto compare e si può ritoccare per quel cliente", () => {
    let ultimo: EsigenzaCliente[] = [];
    render(<Prova libreria={LIBRERIA} visto={(v) => { ultimo = v; }} />);
    const chip = () => screen.getByRole("button", { name: "Bollette energetiche elevate" });
    expect(chip().getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(chip());
    expect(chip().getAttribute("aria-pressed")).toBe("true");
    expect(ultimo).toEqual([{ titolo: "Bollette energetiche elevate", descrizione: "Testo dell'azienda sulle bollette." }]);
    expect(screen.getByText("1 scelta")).toBeTruthy();

    // La scheda resta bassa: il testo scelto si legge in una riga e si apre solo se serve ritoccarlo.
    expect(screen.getByText("Testo dell'azienda sulle bollette.")).toBeTruthy();
    expect(screen.queryByLabelText("Testo di «Bollette energetiche elevate» nel PDF")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Modifica il testo di «Bollette energetiche elevate»" }));
    const testo = screen.getByLabelText("Testo di «Bollette energetiche elevate» nel PDF") as HTMLTextAreaElement;
    expect(testo.value).toBe("Testo dell'azienda sulle bollette.");
    fireEvent.change(testo, { target: { value: "Per voi: il contatore da 6 kW costa troppo." } });
    expect(ultimo).toEqual([{ titolo: "Bollette energetiche elevate", descrizione: "Per voi: il contatore da 6 kW costa troppo." }]);

    fireEvent.click(chip());
    expect(chip().getAttribute("aria-pressed")).toBe("false");
    expect(ultimo).toEqual([]);
    expect(screen.queryByLabelText("Esigenze scelte")).toBeNull();
  });

  it("una voce senza testo propone «Aggiungi testo»; aperta e richiusa, il testo scritto resta", () => {
    let ultimo: EsigenzaCliente[] = [];
    render(<Prova libreria={[{ titolo: "Freddo d'inverno" }]} visto={(v) => { ultimo = v; }} />);
    fireEvent.click(screen.getByRole("button", { name: "Freddo d'inverno" }));
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi il testo di «Freddo d'inverno»" }));
    fireEvent.change(screen.getByLabelText("Testo di «Freddo d'inverno» nel PDF"), { target: { value: "Isoliamo il sottotetto." } });
    fireEvent.click(screen.getByRole("button", { name: "Chiudi il testo di «Freddo d'inverno»" }));
    expect(screen.queryByLabelText("Testo di «Freddo d'inverno» nel PDF")).toBeNull();
    expect(screen.getByText("Isoliamo il sottotetto.")).toBeTruthy();
    expect(ultimo).toEqual([{ titolo: "Freddo d'inverno", descrizione: "Isoliamo il sottotetto." }]);
  });

  it("la «x» della voce scelta la toglie", () => {
    let ultimo: EsigenzaCliente[] = [];
    render(<Prova libreria={LIBRERIA} iniziale={[{ titolo: "Impianto vecchio o rumoroso", descrizione: "x" }]} visto={(v) => { ultimo = v; }} />);
    fireEvent.click(screen.getByRole("button", { name: "Togli «Impianto vecchio o rumoroso»" }));
    expect(ultimo).toEqual([]);
  });

  it("«Aggiungi una tua»: titolo e testo scritti per quel cliente, segnati come solo suoi", () => {
    let ultimo: EsigenzaCliente[] = [];
    render(<Prova libreria={LIBRERIA} visto={(v) => { ultimo = v; }} />);
    fireEvent.click(screen.getByRole("button", { name: /Aggiungi una tua/ }));
    const aggiungi = screen.getByRole("button", { name: "Aggiungi" }) as HTMLButtonElement;
    expect(aggiungi.disabled).toBe(true); // senza titolo non si aggiunge niente
    fireEvent.change(screen.getByLabelText("Titolo della nuova esigenza"), { target: { value: "  Rumore dalla strada " } });
    fireEvent.change(screen.getByLabelText("Testo della nuova esigenza"), { target: { value: "Vetri stratificati." } });
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi" }));
    expect(ultimo).toEqual([{ titolo: "Rumore dalla strada", descrizione: "Vetri stratificati." }]);
    expect(screen.getByText("solo per questo cliente")).toBeTruthy();
    // il modulo si chiude, pronto per un'altra
    expect(screen.getByRole("button", { name: /Aggiungi una tua/ })).toBeTruthy();
  });

  it("«solo per questo cliente» è solo per le voci scritte a mano: una voce pronta scelta a idee chiuse non lo è", () => {
    render(<Prova libreria={LIBRERIA} iniziale={[{ titolo: "Caldo d'estate in casa", descrizione: "x" }, { titolo: "Rumore dalla strada", descrizione: "x" }]} />);
    // «Caldo d'estate in casa» è una voce pronta del modulo (le idee pronte sono chiuse); «Rumore dalla strada» no.
    expect(screen.getAllByText("solo per questo cliente")).toHaveLength(1);
    expect(within(screen.getByLabelText("Esigenze scelte")).getByText("Rumore dalla strada").parentElement?.textContent).toMatch(/solo per questo cliente/);
  });

  it("una voce già scelta non si aggiunge due volte, nemmeno scritta a mano con altre maiuscole", () => {
    let ultimo: EsigenzaCliente[] = [];
    render(<Prova libreria={LIBRERIA} iniziale={[{ titolo: "Bollette energetiche elevate", descrizione: "x" }]} visto={(v) => { ultimo = v; }} />);
    fireEvent.click(screen.getByRole("button", { name: /Aggiungi una tua/ }));
    fireEvent.change(screen.getByLabelText("Titolo della nuova esigenza"), { target: { value: "BOLLETTE energetiche  elevate" } });
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi" }));
    expect(ultimo).toHaveLength(1);
  });

  it("dove il PDF ne stampa poche (Serramenti: 3) avvisa quando se ne scelgono di più", () => {
    const scelte = ["Uno", "Due", "Tre", "Quattro"].map((titolo) => ({ titolo, descrizione: "x" }));
    render(<Prova massimoNelPdf={3} iniziale={scelte.slice(0, 3)} />);
    expect(screen.queryByText(/Nel PDF escono le prime/)).toBeNull();
    cleanup();
    render(<Prova massimoNelPdf={3} iniziale={scelte} />);
    expect(screen.getByText(/Nel PDF escono le prime 3/)).toBeTruthy();
  });

  it("bloccata (disabled) non si può scegliere, togliere né aggiungere", () => {
    render(<Prova libreria={LIBRERIA} disabled iniziale={[{ titolo: "Impianto vecchio o rumoroso", descrizione: "x" }]} />);
    for (const chip of within(screen.getByRole("group", { name: "Esigenze del cliente" })).getAllByRole("button")) {
      expect((chip as HTMLButtonElement).disabled).toBe(true);
    }
    expect(screen.queryByRole("button", { name: /Togli/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Aggiungi una tua/ })).toBeNull();
  });
});

describe("l'anteprima a destra mostra le scelte con il titolo del PDF", () => {
  const BASE: AnteprimaPreventivo = {
    emittente: "Bianchi Impianti", codice: "IDR-1", cliente: { nome: "Mario Rossi", righe: [] },
    gruppi: [], totali: [], totaleDocumento: null, avvisi: [], note: [],
  };

  it("con le scelte: la sezione c'è, sotto il cliente", () => {
    render(<AnteprimaVeloce dati={{ ...BASE, esigenze: { titolo: "Da dove partiamo", voci: ["Muffa e umidità alle pareti", "Bagno datato"] } }} />);
    const sezione = screen.getByRole("region", { name: "Da dove partiamo" });
    expect(within(sezione).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Muffa e umidità alle pareti", "Bagno datato"]);
  });

  it("senza scelte: nessuna sezione (l'anteprima è quella di sempre)", () => {
    render(<AnteprimaVeloce dati={BASE} />);
    expect(screen.queryByText("Da dove partiamo")).toBeNull();
    cleanup();
    render(<AnteprimaVeloce dati={{ ...BASE, esigenze: { titolo: "Da dove partiamo", voci: [] } }} />);
    expect(screen.queryByText("Da dove partiamo")).toBeNull();
  });
});
