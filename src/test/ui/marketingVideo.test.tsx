import ConstructionVideoLesson from "@/components/marketing/ConstructionVideoLesson";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import MarginVideoLesson from "@/components/marketing/MarginVideoLesson";
afterEach(cleanup);
describe("video nel sito", () => {
  it("carica il player solo su richiesta e mantiene la riproduzione nella pagina", async () => {
    render(<MarginVideoLesson />);
    expect(document.querySelector("iframe")).toBeNull();
    expect(document.querySelector('a[target="_blank"]')).toBeNull();
    fireEvent.click(screen.getByRole("button", {name:"Guarda il video qui"}));
    const frame=screen.getByTitle("Il fatturato non è quello che ti resta — video Edilizia in Cloud");
    expect(frame).toHaveAttribute("src",expect.stringContaining("https://www.youtube-nocookie.com/embed/y2GEKRVgFnY"));
    expect(frame).toHaveFocus();
    fireEvent.click(screen.getByRole("button",{name:"Chiudi il video"}));
    expect(document.querySelector("iframe")).toBeNull();
    await waitFor(()=>expect(screen.getByRole("button",{name:/Riproduci Il fatturato/})).toHaveFocus());
  });
});

it("incorpora anche il video orizzontale senza aprire un sito esterno", () => {
  render(<ConstructionVideoLesson />);
  expect(document.querySelector("iframe")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /Riproduci Dove perdi soldi/ }));
  expect(screen.getByTitle("Dove perdi soldi in cantiere? I 5 buchi da controllare")).toHaveAttribute("src", expect.stringContaining("youtube-nocookie.com/embed/XBFZYERpQuA"));
  fireEvent.click(screen.getByRole("button", { name: "Chiudi il video" }));
  expect(document.querySelector("iframe")).toBeNull();
});
