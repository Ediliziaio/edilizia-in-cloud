/**
 * «Obiettivo di margine e tempi» nello step Economia (07/11/2026).
 *
 * Florin: «organizza per bene che si vedano le colonne giustamente e organizza bene le risposte». Qui si prova
 * che i numeri che contano stanno nei riquadri, che le tabelle hanno colonne vere con l'intestazione giusta
 * sopra ogni numero, e che il margine dice a colpo d'occhio se raggiunge l'obiettivo.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/preventivatore/usePuoVedereImpresa", () => ({ usePuoVedereImpresa: () => true }));

import { ObiettivoETempiCard } from "@/components/moduli/ObiettivoETempiCard";

// Il preventivo dello screenshot di Florin: 5.286,87 € IVA inclusa, costi 3.381 €.
const righe = [
  { descrizione: "Posa gres", capitolo_nome: "Pavimenti", quantita: 1, costo_materiali: 1500, costo_manodopera: 381 },
  { descrizione: "Rimozione pavimento", capitolo_nome: "Demolizioni", quantita: 1, costo_materiali: 697, costo_manodopera: 803 },
];
const base = { imponibile: 4333.5, totale: 5286.87, costoTot: 3381, righeSenzaCosto: 0 };

function apri() {
  render(<ObiettivoETempiCard righe={righe} base={base} />);
  fireEvent.click(screen.getByRole("button", { name: /Obiettivo di margine e tempi/ }));
}

/** Il testo di una colonna, per intestazione: prova che il numero sta sotto la sua etichetta. */
function colonna(tabella: HTMLElement, nome: string): string[] {
  const intestazioni = within(tabella).getAllByRole("columnheader").map((th) => th.textContent);
  const i = intestazioni.indexOf(nome);
  expect(i).toBeGreaterThanOrEqual(0);
  return within(tabella).getAllByRole("row").slice(1).map((tr) => tr.querySelectorAll("td")[i]?.textContent ?? "");
}

describe("Il margine, organizzato", () => {
  it("i quattro numeri che contano stanno in riquadri, ognuno con la sua etichetta", () => {
    apri();
    const margine = screen.getByRole("region", { name: "Margine a ritroso" });
    expect(within(margine).getByText("Spesa massima").nextSibling).toHaveTextContent("3.033,45");
    expect(within(margine).getByText("Costi di oggi").nextSibling).toHaveTextContent("3.381,00");
    expect(within(margine).getByText("Margine reale").nextSibling).toHaveTextContent("22%");
    expect(within(margine).getByText("Prezzo minimo").nextSibling).toHaveTextContent("5.892,60");
  });

  it("dove tagliare è una tabella: voce, capitolo, costo, peso e taglio nelle loro colonne", () => {
    apri();
    const tabella = screen.getAllByRole("table")[0];
    expect(colonna(tabella, "Voce")).toEqual(["Posa gres", "Rimozione pavimento"]);
    expect(colonna(tabella, "Capitolo")).toEqual(["Pavimenti", "Demolizioni"]);
    expect(colonna(tabella, "Taglio")[0]).toMatch(/−193,36/);
  });

  it("i ritocchi di prezzo hanno margine in euro e in percentuale separati, e oggi in evidenza", () => {
    apri();
    const tabella = screen.getAllByRole("table")[1];
    expect(colonna(tabella, "Prezzo")).toEqual(["−10%", "−5%", "Oggi", "+5%"]);
    expect(colonna(tabella, "Margine %")[2]).toBe("22%");
    const oggi = within(tabella).getAllByRole("row").find((r) => r.textContent?.startsWith("Oggi"))!;
    expect(oggi.className).toMatch(/font-semibold/);
  });
});

describe("I tempi, organizzati", () => {
  it("i campi sono divisi in Squadra e Calendario, con l'unità dentro il campo", () => {
    apri();
    expect(screen.getByRole("group", { name: "Squadra" })).toBeInTheDocument();
    const calendario = screen.getByRole("group", { name: "Calendario" });
    expect(within(calendario).getByLabelText("Voglio finire in")).toBeInTheDocument();
    expect(within(calendario).getByText("giorni")).toBeInTheDocument();
  });

  it("ore, giorni e settimane in riquadri; la squadra in una tabella con le colonne giuste", () => {
    apri();
    const tempi = screen.getByRole("region", { name: "Tempi e personale" });
    expect(within(tempi).getByText("Ore-persona")).toBeInTheDocument();
    expect(within(tempi).getByText("Giorni con 2 operai")).toBeInTheDocument();
    const squadra = within(tempi).getByRole("table");
    expect(within(squadra).getAllByRole("columnheader").map((th) => th.textContent)).toEqual(["Operai", "Giorni lavorativi", "Rispetto a oggi"]);
    expect(colonna(squadra, "Operai")).toContain("2 (oggi)");
  });

  it("scelto l'inizio lavori, compare la fine prevista e la colonna «Fine»", () => {
    apri();
    fireEvent.change(screen.getByLabelText("Inizio lavori"), { target: { value: "2026-11-09" } });
    const tempi = screen.getByRole("region", { name: "Tempi e personale" });
    expect(within(tempi).getByText("Fine prevista").nextSibling?.textContent).toMatch(/\/11\/2026/);
    expect(within(within(tempi).getByRole("table")).getAllByRole("columnheader").map((th) => th.textContent)).toContain("Fine");
  });
});
