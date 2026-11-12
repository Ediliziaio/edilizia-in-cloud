/**
 * Una tabella larga dentro un elenco lungo (09/11/2026): la barra per andare a
 * destra stava sotto l'ultima riga. Con settemila fatture ricevute non la
 * raggiungeva nessuno.
 */
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const ROOT = join(__dirname, "../../..");
const leggi = (f: string) => readFileSync(join(ROOT, f), "utf8");
afterEach(cleanup);

describe("Il riquadro che scorre", () => {
  it("riceve la sua classe senza toccare quella della tabella", () => {
    render(
      <Table wrapperClassName="max-h-[70vh] tabella-scorrevole" className="mia-tabella">
        <TableHeader><TableRow><TableHead>Fornitore</TableHead></TableRow></TableHeader>
        <TableBody><TableRow><TableCell>Edil Rossi</TableCell></TableRow></TableBody>
      </Table>,
    );
    const tabella = screen.getByRole("table");
    expect(tabella).toHaveClass("mia-tabella");
    const riquadro = tabella.parentElement!;
    expect(riquadro).toHaveClass("overflow-auto", "max-h-[70vh]", "tabella-scorrevole");
  });

  it("dà il riquadro che scorre a chi ci mette sopra la barra", () => {
    let riquadro: HTMLDivElement | null = null;
    render(<Table wrapperRef={(el) => { riquadro = el; }}><TableBody><TableRow><TableCell>x</TableCell></TableRow></TableBody></Table>);
    expect(riquadro).toBe(screen.getByRole("table").parentElement);
  });

  it("senza la classe il riquadro resta come prima", () => {
    render(<Table><TableBody><TableRow><TableCell>x</TableCell></TableRow></TableBody></Table>);
    const riquadro = screen.getByRole("table").parentElement!;
    expect(riquadro).toHaveClass("relative", "w-full", "overflow-auto");
    expect(riquadro.className).not.toMatch(/undefined/);
  });
});

describe("Le fatture ricevute", () => {
  const pagina = leggi("src/pages/azienda/fatturazione/FattureRicevutePage.tsx");

  it("l'elenco ha un'altezza sua, così la barra orizzontale è a portata", () => {
    expect(pagina).toContain('wrapperClassName="max-h-[70vh] tabella-scorrevole"');
  });

  it("ha la barra di scorrimento in alto, come i DDT, agganciata al riquadro che scorre", () => {
    expect(pagina).toContain('<BarraScorrimentoOrizzontale contenitore={riquadroTabella}');
    expect(pagina).toContain("wrapperRef={setRiquadroTabella}");
    expect(pagina.indexOf("<BarraScorrimentoOrizzontale")).toBeLessThan(pagina.indexOf('wrapperRef={setRiquadroTabella}'));
  });

  it("l'intestazione resta ferma mentre si scorrono le righe", () => {
    expect(pagina).toMatch(/TableHeader className="sticky top-0 z-10 bg-card/);
  });
});

describe("Lo stile della barra", () => {
  const css = leggi("src/index.css");

  it("c'è, ed è sottile su tutt'e due i lati", () => {
    expect(css).toContain(".tabella-scorrevole { scrollbar-width: thin;");
    expect(css).toMatch(/\.tabella-scorrevole::-webkit-scrollbar \{[^}]*width: 10px; height: 10px;/);
  });

  it("il commento non promette che su Mac la barra resti sempre a vista", () => {
    // Lo decide il sistema: scriverlo qui eviterebbe di rifare il giro domani.
    expect(css).toMatch(/questo lo decide il sistema, non il\s+\* CSS/);
  });
});
