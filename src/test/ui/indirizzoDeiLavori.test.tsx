/**
 * «Indirizzo dei lavori» nel passo Contatto (06/10/2026): di serie i lavori sono allo stesso indirizzo del
 * cliente e lo seguono; si sceglie «altrove» solo quando sono in un altro posto. Il blocco vero e la sua logica
 * (`useIndirizzoLavori`), con un modulo finto accanto che tiene i campi e registra ogni scrittura.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { IndirizzoDeiLavori } from "@/components/preventivatore/IndirizzoDeiLavori";
import { useIndirizzoLavori, type ChiaveIndirizzo } from "@/lib/preventivatore/useIndirizzoLavori";

type Campi = Record<string, string | null>;
type Scrittura = [chiave: string, valore: string | null];

const CAMPI = ["indirizzo", "citta", "cap", "provincia"] as const;
const CLIENTE: Campi = { cliente_indirizzo: "Via Tortona 33", cliente_citta: "Milano", cliente_cap: "20121", cliente_provincia: "MI" };
const ALTROVE: Campi = { cantiere_indirizzo: "Via Roma 12", cantiere_citta: "Torino", cantiere_cap: "10121", cantiere_provincia: "TO" };

function Prova({ iniziale, scritture }: { iniziale: Campi; scritture: Scrittura[] }) {
  const [form, setForm] = useState<Campi>(iniziale);
  const scrivi = (chiave: ChiaveIndirizzo, valore: string | null) => {
    scritture.push([chiave, valore]);
    setForm((f) => ({ ...f, [chiave]: valore }));
  };
  const ind = useIndirizzoLavori(form, scrivi);
  return (
    <div>
      {CAMPI.map((c) => (
        <input key={c} aria-label={`cliente ${c}`} value={form[`cliente_${c}`] ?? ""} onChange={(e) => ind.cambiaCliente(c, e.target.value)} />
      ))}
      {/* Il contatto scelto dal CRM: l'indirizzo intero in un colpo solo. */}
      <button type="button" onClick={() => ind.impostaCliente({ indirizzo: "Corso Roma 5", citta: "Bergamo", cap: "24100", provincia: "BG" })}>crm</button>
      {/* Un'altra mano (assistente, recupero) che cambia cliente e cantiere insieme, senza passare dai campi. */}
      <button type="button" onClick={() => setForm((f) => ({ ...f, cliente_indirizzo: "Via Garibaldi 8", cliente_citta: "Brescia", cantiere_indirizzo: "Via Roma 12", cantiere_citta: "Torino" }))}>
        assistente
      </button>
      <IndirizzoDeiLavori
        altrove={ind.altrove}
        onAltrove={ind.scegliAltrove}
        lavori={ind.lavori}
        riassunto={ind.riassunto}
        onScrivi={ind.scriviLavori}
      />
      <output data-testid="cantiere">{JSON.stringify(CAMPI.map((c) => form[`cantiere_${c}`] ?? null))}</output>
    </div>
  );
}

const monta = (iniziale: Campi = {}) => {
  const scritture: Scrittura[] = [];
  render(<Prova iniziale={iniziale} scritture={scritture} />);
  return scritture;
};
const spunta = () => screen.getByRole("checkbox", { name: /Lavori allo stesso indirizzo del cliente/ });
const cantiere = () => JSON.parse(screen.getByTestId("cantiere").textContent ?? "[]") as Array<string | null>;
const campiLavori = () => screen.queryByRole("group", { name: "Indirizzo dei lavori" });
const dentro = () => within(campiLavori() as HTMLElement);
const scriviCliente = (campo: string, valore: string) => fireEvent.change(screen.getByLabelText(`cliente ${campo}`), { target: { value: valore } });
const valoreDi = (etichetta: string) => (dentro().getByLabelText(etichetta) as HTMLInputElement).value;

afterEach(() => cleanup());

describe("Indirizzo dei lavori: stesso indirizzo del cliente", () => {
  it("all'apertura, senza niente di scritto: «stesso indirizzo» spuntato, nessun campo e nessuna scrittura", () => {
    const scritture = monta();
    expect(spunta().getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("Scrivi qui sopra l'indirizzo del cliente.")).toBeTruthy();
    expect(campiLavori()).toBeNull();
    expect(scritture).toEqual([]);
  });

  it("scrivendo l'indirizzo del cliente i lavori lo seguono a ogni tasto, anche alla seconda modifica, e il riepilogo lo mostra", () => {
    monta();
    scriviCliente("indirizzo", "Via Tortona 33");
    scriviCliente("citta", "Milano");
    scriviCliente("cap", "20121");
    scriviCliente("provincia", "MI");
    expect(cantiere()).toEqual(["Via Tortona 33", "Milano", "20121", "MI"]);
    expect(screen.getByText("Via Tortona 33, 20121 Milano (MI)")).toBeTruthy();
    expect(campiLavori()).toBeNull();
    // Correggere il cliente corregge anche i lavori: era il punto che una copia fatta a metà perdeva.
    scriviCliente("indirizzo", "Via Tortona 35");
    expect(cantiere()[0]).toBe("Via Tortona 35");
    scriviCliente("indirizzo", "");
    expect(cantiere()[0]).toBeNull();
    expect(spunta().getAttribute("aria-checked")).toBe("true");
  });

  it("un preventivo di prima (cantiere vuoto, cliente scritto) si apre su «stesso indirizzo» senza scrivere niente; alla prima modifica del cliente i lavori si riempiono per intero", () => {
    const scritture = monta(CLIENTE);
    expect(spunta().getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("Via Tortona 33, 20121 Milano (MI)")).toBeTruthy();
    expect(scritture).toEqual([]);
    expect(cantiere()).toEqual([null, null, null, null]);
    scriviCliente("citta", "Monza");
    expect(cantiere()).toEqual(["Via Tortona 33", "Monza", "20121", "MI"]);
  });

  it("un indirizzo dei lavori uguale a meno di maiuscole e spazi vale come lo stesso", () => {
    monta({ ...CLIENTE, cantiere_indirizzo: "via  tortona 33 ", cantiere_citta: "MILANO", cantiere_cap: "20121", cantiere_provincia: "mi" });
    expect(spunta().getAttribute("aria-checked")).toBe("true");
    expect(campiLavori()).toBeNull();
  });

  it("il contatto scelto dal CRM porta l'indirizzo intero, e i lavori lo copiano in un colpo solo", () => {
    monta(CLIENTE);
    fireEvent.click(screen.getByRole("button", { name: "crm" }));
    expect((screen.getByLabelText("cliente indirizzo") as HTMLInputElement).value).toBe("Corso Roma 5");
    expect(cantiere()).toEqual(["Corso Roma 5", "Bergamo", "24100", "BG"]);
    expect(screen.getByText("Corso Roma 5, 24100 Bergamo (BG)")).toBeTruthy();
  });
});

describe("Indirizzo dei lavori: altrove", () => {
  it("un preventivo con i lavori altrove si apre su «altrove», coi campi scritti; cambiare il cliente non li tocca", () => {
    const scritture = monta({ ...CLIENTE, ...ALTROVE });
    expect(spunta().getAttribute("aria-checked")).toBe("false");
    expect(valoreDi("Via e numero")).toBe("Via Roma 12");
    expect(valoreDi("Città")).toBe("Torino");
    expect(valoreDi("CAP")).toBe("10121");
    expect(valoreDi("Provincia")).toBe("TO");
    scriviCliente("indirizzo", "Via Tortona 99");
    expect(cantiere()).toEqual(["Via Roma 12", "Torino", "10121", "TO"]);
    expect(scritture.filter(([chiave]) => chiave.startsWith("cantiere_"))).toEqual([]);
  });

  it("togliendo la spunta i campi si aprono vuoti; ciò che si scrive resta dei lavori e il cliente non cambia", () => {
    monta(CLIENTE);
    fireEvent.click(spunta());
    expect(spunta().getAttribute("aria-checked")).toBe("false");
    // Niente CAP del cliente rimasto per sbaglio.
    expect(cantiere()).toEqual([null, null, null, null]);
    fireEvent.change(dentro().getByLabelText("Via e numero"), { target: { value: "Via Roma 12" } });
    fireEvent.change(dentro().getByLabelText("Città"), { target: { value: "Torino" } });
    fireEvent.change(dentro().getByLabelText("CAP"), { target: { value: "10121" } });
    fireEvent.change(dentro().getByLabelText("Provincia"), { target: { value: "to" } });
    expect(cantiere()).toEqual(["Via Roma 12", "Torino", "10121", "TO"]);
    expect((screen.getByLabelText("cliente indirizzo") as HTMLInputElement).value).toBe("Via Tortona 33");
    expect((screen.getByLabelText("cliente citta") as HTMLInputElement).value).toBe("Milano");
    // E il cliente, cambiato dopo, non sposta i lavori.
    scriviCliente("citta", "Monza");
    expect(cantiere()).toEqual(["Via Roma 12", "Torino", "10121", "TO"]);
  });

  it("la provincia è di due lettere", () => {
    monta(CLIENTE);
    fireEvent.click(spunta());
    expect((dentro().getByLabelText("Provincia") as HTMLInputElement).maxLength).toBe(2);
  });

  it("rimettendo la spunta i lavori tornano uguali al cliente; togliendola di nuovo ricompare ciò che si era scritto", () => {
    monta(CLIENTE);
    fireEvent.click(spunta());
    fireEvent.change(dentro().getByLabelText("Via e numero"), { target: { value: "Via Roma 12" } });
    fireEvent.change(dentro().getByLabelText("Città"), { target: { value: "Torino" } });

    fireEvent.click(spunta());
    expect(spunta().getAttribute("aria-checked")).toBe("true");
    expect(campiLavori()).toBeNull();
    expect(cantiere()).toEqual(["Via Tortona 33", "Milano", "20121", "MI"]);

    // Un tocco per sbaglio non fa perdere l'indirizzo scritto.
    fireEvent.click(spunta());
    expect(valoreDi("Via e numero")).toBe("Via Roma 12");
    expect(valoreDi("Città")).toBe("Torino");
    expect(cantiere()).toEqual(["Via Roma 12", "Torino", null, null]);
  });

  it("scrivendo nei campi dei lavori non si richiudono, nemmeno se ciò che si scrive diventa uguale al cliente", () => {
    monta({ ...CLIENTE, ...ALTROVE });
    fireEvent.change(dentro().getByLabelText("Via e numero"), { target: { value: "Via Tortona 33" } });
    fireEvent.change(dentro().getByLabelText("Città"), { target: { value: "Milano" } });
    fireEvent.change(dentro().getByLabelText("CAP"), { target: { value: "20121" } });
    fireEvent.change(dentro().getByLabelText("Provincia"), { target: { value: "MI" } });
    // Uguali a quelli del cliente, ma la scelta è «altrove»: i campi restano dove sono finché non si spunta.
    expect(spunta().getAttribute("aria-checked")).toBe("false");
    expect(valoreDi("Via e numero")).toBe("Via Tortona 33");
  });

  it("se un'altra mano (assistente, recupero) cambia cliente e cantiere insieme, i lavori restano quelli diversi e i campi si aprono", () => {
    monta(CLIENTE);
    expect(campiLavori()).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "assistente" }));
    expect(spunta().getAttribute("aria-checked")).toBe("false");
    expect(valoreDi("Via e numero")).toBe("Via Roma 12");
    expect(cantiere()[0]).toBe("Via Roma 12");
  });

  it("il contatto del CRM, con i lavori altrove, cambia il cliente e non tocca i lavori", () => {
    monta({ ...CLIENTE, ...ALTROVE });
    fireEvent.click(screen.getByRole("button", { name: "crm" }));
    expect((screen.getByLabelText("cliente citta") as HTMLInputElement).value).toBe("Bergamo");
    expect(cantiere()).toEqual(["Via Roma 12", "Torino", "10121", "TO"]);
  });
});

describe("Indirizzo dei lavori: si legge e si usa", () => {
  it("casella con la sua etichetta, tutta cliccabile; campi con le loro etichette", () => {
    monta(CLIENTE);
    const casella = spunta();
    expect(casella.tagName).toBe("BUTTON");
    // L'etichetta intera è cliccabile, non solo il quadratino.
    fireEvent.click(screen.getByText("Lavori allo stesso indirizzo del cliente"));
    expect(casella.getAttribute("aria-checked")).toBe("false");
    for (const nome of ["Via e numero", "Città", "CAP", "Provincia"]) expect(dentro().getByLabelText(nome)).toBeTruthy();
  });
});
