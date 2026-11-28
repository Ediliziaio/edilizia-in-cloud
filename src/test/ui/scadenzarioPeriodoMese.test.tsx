import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NavigatoreMese, leggiMese, presetMese, spostaMese } from "@/components/scadenzario/NavigatoreMese";
import { RiepilogoPeriodo } from "@/components/scadenzario/RiepilogoPeriodo";
import type { RiepilogoPeriodo as Riepilogo } from "@/lib/finance/riepilogoPeriodoTipi";

afterEach(cleanup);
const s = (n: number, importo: number) => ({ n, importo });
const riepilogo: Riepilogo = {
  entrate: { totale: s(4, 1000), saldato: s(1, 200), aperto: s(3, 800), scaduto: s(1, 300) },
  uscite: { totale: s(2, 500), saldato: s(2, 500), aperto: s(0, 0), scaduto: s(0, 0) },
  arretrato: { entrate: s(2, 700), uscite: s(1, 90) },
  linguette: { aperte: 3, tutte: 6, da_incassare: 3, da_pagare: 0, scadute: 1, pagate: 3 },
  troncato: false,
};

describe("Navigatore del mese", () => {
  it("legge e sposta i mesi anche oltre l'anno", () => {
    expect(leggiMese(presetMese(2026, 11))).toEqual({ anno: 2026, mese: 11 });
    expect(leggiMese("30gg")).toBeNull();
    expect(spostaMese(2026, 12, 1)).toEqual({ anno: 2027, mese: 1 });
    expect(spostaMese(2026, 1, -1)).toEqual({ anno: 2025, mese: 12 });
  });
  it("le frecce cambiano mese, il nome apre la scelta", () => {
    const onMese = vi.fn(), onAnno = vi.fn();
    render(<NavigatoreMese preset="mese:2026-12" anno="2026" onMese={onMese} onAnno={onAnno} onProssimi30={vi.fn()} onPersonalizzato={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Dicembre 2026/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Mese dopo" }));
    expect(onMese).toHaveBeenCalledWith(2027, 1);
    fireEvent.click(screen.getByRole("button", { name: "Mese prima" }));
    expect(onMese).toHaveBeenCalledWith(2026, 11);
  });
  it("con «Tutti gli anni» le frecce sono spente", () => {
    render(<NavigatoreMese preset="" anno="all" onMese={vi.fn()} onAnno={vi.fn()} onProssimi30={vi.fn()} onPersonalizzato={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Anno prima" })).toBeDisabled();
  });
});

describe("Riepilogo del periodo", () => {
  it("mostra entrate e uscite separate e ogni riquadro è un filtro", () => {
    const onScegli = vi.fn();
    render(<RiepilogoPeriodo riepilogo={riepilogo} attivo="scade" conArretrato onScegli={onScegli} />);
    expect(screen.getByRole("button", { name: /Scade nel periodo/ })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: /Pagato \/ incassato/ }));
    fireEvent.click(screen.getByRole("button", { name: /Da incassare \/ pagare/ }));
    fireEvent.click(screen.getByRole("button", { name: /Arretrato/ }));
    expect(onScegli.mock.calls.map((c) => c[0])).toEqual(["pagato", "aperto", "arretrato"]);
  });
  it("mentre carica non scrive numeri e tiene i riquadri spenti", () => {
    render(<RiepilogoPeriodo riepilogo={undefined} attivo={null} conArretrato onScegli={vi.fn()} />);
    expect(screen.queryByText(/€/)).toBeNull();
    screen.getAllByRole("button").forEach((b) => expect(b).toBeDisabled());
  });
  it("senza inizio periodo l'arretrato è spento; se i numeri sono parziali lo dice", () => {
    render(<RiepilogoPeriodo riepilogo={{ ...riepilogo, arretrato: null, troncato: true }} attivo={null} conArretrato={false} onScegli={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Arretrato/ })).toBeDisabled();
    expect(screen.getAllByText("parziale").length).toBeGreaterThan(0);
  });
  it("mentre arrivano i numeri nuovi quelli vecchi si attenuano e non si premono", () => {
    render(<RiepilogoPeriodo riepilogo={riepilogo} attivo={null} conArretrato inAggiornamento onScegli={vi.fn()} />);
    screen.getAllByRole("button").forEach((b) => expect(b).toBeDisabled());
  });
  it("«Personalizzato» senza date dice di scegliere le date", () => {
    render(<RiepilogoPeriodo riepilogo={undefined} attivo={null} conArretrato={false} inAttesaDate onScegli={vi.fn()} />);
    expect(screen.getAllByText("Scegli le date").length).toBe(4);
  });
  it("sotto i riquadri: saldo netto atteso e settimana, senza verde", () => {
    const { container } = render(<RiepilogoPeriodo riepilogo={riepilogo} attivo="pagato" conArretrato onScegli={vi.fn()}
      settimana={{ incassare: s(1, 250), pagare: s(2, 90), troncato: false }} />);
    expect(screen.getByText("Saldo netto atteso").parentElement).toHaveTextContent("+800 €");
    expect(screen.getByText("Questa settimana").parentElement).toHaveTextContent(/250.*da incassare.*90.*da pagare/);
    expect(container.innerHTML).not.toMatch(/emerald|green/);
  });
  it("senza dati i due numeri restano al loro posto con un trattino", () => {
    render(<RiepilogoPeriodo riepilogo={undefined} attivo={null} conArretrato onScegli={vi.fn()} />);
    expect(screen.getByText("Saldo netto atteso").parentElement).toHaveTextContent("—");
  });
});
