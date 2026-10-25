import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QuoteChatResponse } from "@/components/quotes/dev/QuoteChatResponse";

afterEach(cleanup);
describe("Risposte preventivi leggibili, senza effetti esterni", () => {
  it("rende grassetti, paragrafi, titoletti ed elenchi senza cambiare numeri o unità", () => {
    const { container } = render(<QuoteChatResponse content={'## Pavimento cucina\n\nHo trovato **54,11 €/m²** per 9,87 m².\n\n- **Formato:** 30×30 cm\n- Spessore: 9 mm\n\nDa confermare prima di includere.'} />);
    expect(screen.getByRole("heading", { name: "Pavimento cucina", level: 4 })).toBeInTheDocument();
    expect(container.querySelector("strong")).toHaveTextContent("54,11 €/m²");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(container.querySelectorAll("p")).toHaveLength(2);
    expect(container).toHaveTextContent("9,87 m²");
  });
  it("mantiene gli a capo singoli e normalizza CRLF senza un muro di testo", () => {
    const { container } = render(<QuoteChatResponse content={"Prima riga\r\nSeconda riga\r\n\r\nAltro paragrafo"} />);
    expect(container.querySelectorAll("p")).toHaveLength(2); expect(container.querySelectorAll("br")).toHaveLength(1);
  });
  it("valorizza le etichette dei riferimenti già salvati, senza cambiare il codice", () => {
    const code = "LOM252.OC.EEA.Pa02.C1206.L0005.0220.-";
    const { container } = render(<QuoteChatResponse content={`Fonte: Lombardia 2025\nCodice ufficiale: ${code}\nPrezzo originale di listino: 54,11 €`} />);
    expect(container.querySelectorAll("strong")).toHaveLength(3); expect(container.querySelector("code")).toHaveTextContent(code);
    expect(container.querySelectorAll("p")).toHaveLength(3);
  });
  it("preserva prezzo manuale distinto dal listino e non applica calcoli", () => {
    const { container } = render(<QuoteChatResponse content={"Prezzo originale di listino: 54,11 €\nPrezzo nella bozza: 70,00 €"} />);
    expect(container).toHaveTextContent("54,11 €"); expect(container).toHaveTextContent("70,00 €");
  });
  it("mantiene la numerazione esplicita, anche se non parte da uno", () => {
    const { container } = render(<QuoteChatResponse content={"3. Primo dato\n4) Secondo dato"} />);
    expect(screen.getByRole("list")).toHaveAttribute("start", "3"); expect(container.querySelectorAll("li")[1]).toHaveAttribute("value", "4");
  });
  it("tratta HTML, link e immagini come testo inerte", () => {
    const text = '<img src="https://esterno.test/traccia" onerror="alert(1)">\n<script>alert(1)</script>\n[Apri](javascript:alert(1))\n![pianta](https://esterno.test/pianta.png)';
    const { container } = render(<QuoteChatResponse content={text} />);
    expect(container.querySelector("img, script, iframe, a, svg")).toBeNull(); expect(container).toHaveTextContent('<script>alert(1)</script>');
  });
  it("non esegue fence per immagini/job/grafici né formatta il codice al loro interno", () => {
    const { container } = render(<QuoteChatResponse content={'```silvio-image\n{"job_id":"11111111-1111-4111-a111-111111111111"}\n**letterale**\n```'} />);
    expect(container.querySelector("pre")).toHaveTextContent("**letterale**"); expect(container.querySelector("strong, img, iframe")).toBeNull();
  });
  it("mantiene delimitatori incompleti, escape e codici con underscore", () => {
    const { container } = render(<QuoteChatResponse content={'**incompleto\n\\**letterale\\**\nCODICE_MATERIALE_01 e `**codice**`'} />);
    expect(container.querySelector("strong")).toBeNull(); expect(container).toHaveTextContent("**incompleto");
    expect(container).toHaveTextContent("CODICE_MATERIALE_01"); expect(container.querySelector("code")).toHaveTextContent("**codice**");
  });
  it("gestisce testo vuoto e testi legacy lunghi senza troncamento", () => {
    const { container, rerender } = render(<QuoteChatResponse content="" />); expect(container.textContent).toBe("");
    const text = "**testo** ".repeat(2500); rerender(<QuoteChatResponse content={text} />);
    expect(container.textContent).toBe(text); expect(container.querySelectorAll("strong")).toHaveLength(0);
  });
});
