// src/test/ui/sottofasiContate.test.tsx
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SottofasiContate } from "@/components/campo/SottofasiContate";

const s = (name: string, fatta: boolean) => ({ name, fatta });
afterEach(cleanup);

describe("SottofasiContate", () => {
  it("senza sottofasi non mostra niente", () => {
    const { container } = render(<SottofasiContate sottofasi={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("dice quante sono fatte e cosa manca", () => {
    render(<SottofasiContate sottofasi={[s("Tracce", true), s("Cavi", false), s("Quadro", false)]} />);
    expect(screen.getByText("1 di 3 sottofasi")).toBeInTheDocument();
    expect(screen.getByText("Mancano: Cavi, Quadro")).toBeInTheDocument();
  });

  it("con molte mancanti ne nomina tre e conta le altre", () => {
    render(<SottofasiContate sottofasi={["a", "b", "c", "d", "e"].map((n) => s(n, false))} />);
    expect(screen.getByText("Mancano: a, b, c e altre 2")).toBeInTheDocument();
  });

  it("tutte fatte: lo dice senza elenco", () => {
    render(<SottofasiContate sottofasi={[s("Tracce", true), s("Cavi", true)]} />);
    expect(screen.getByText("Tutte le 2 sottofasi sono fatte")).toBeInTheDocument();
    expect(screen.queryByText(/Mancano/)).toBeNull();
  });
});
