/**
 * La revisione del tecnico (07/11/2026): quali righe guardare prima di
 * validare, e quali fasi si validano insieme.
 */
import { readFileSync } from "node:fs";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RevisioneTecnico } from "@/components/orders/materiali/RevisioneTecnico";
import { dettaglioRevisione, motivoRevisione, revisioneTecnico, type RigaPerRevisione } from "@/lib/distinta/revisioneTecnico";

const r = (p: Partial<RigaPerRevisione>): RigaPerRevisione => ({
  id: "m1", name: "EPS 10 cm", quantity: 120, unita_misura: "m²", quantita_calcolata: 120,
  origine_materiale: "computo", origini: [{}], ...p,
});

describe("quali righe guardare", () => {
  it("quantità cambiata a mano oltre l'1%, aggiunta a mano, senza quantità", () => {
    expect(motivoRevisione(r({}))).toBeNull();
    expect(motivoRevisione(r({ quantity: 120.5 }))).toBeNull();
    expect(motivoRevisione(r({ quantity: 140 }))).toBe("quantita_a_mano");
    expect(motivoRevisione(r({ origine_materiale: "manuale", origini: [], quantita_calcolata: null }))).toBe("aggiunta_a_mano");
    expect(motivoRevisione(r({ quantity: 0 }))).toBe("senza_quantita");
    // Le righe senza origine vengono dal preventivo: non si segnalano.
    expect(motivoRevisione(r({ origine_materiale: null, origini: null, quantita_calcolata: null }))).toBeNull();
  });
  it("il dettaglio dice quanto era calcolato", () => {
    expect(dettaglioRevisione({ riga: r({ quantity: 140 }), motivo: "quantita_a_mano" })).toBe("140 m² invece di 120 calcolati");
  });
  it("solo fasi in verifica; con una riga senza quantità la fase non si valida in blocco", () => {
    const rev = revisioneTecnico([
      { id: "f1", nome: "Cappotto", validazione: { stato: "da_validare" }, materiali: [r({}), r({ id: "m2", quantity: 140 })] },
      { id: "f2", nome: "Massetto", validazione: { stato: "da_validare" }, materiali: [r({ id: "m3", quantity: 0 })] },
      { id: "f3", nome: "Pavimenti", validazione: { stato: "validata" }, materiali: [r({ id: "m4" })] },
      { id: null, nome: "Senza fase", validazione: null, materiali: [r({ id: "m5" })] },
    ]);
    expect(rev.map((f) => [f.nome, f.daGuardare.length, f.validabileInBlocco])).toEqual([["Cappotto", 1, true], ["Massetto", 1, false]]);
  });
});

describe("il riquadro", () => {
  const rev = revisioneTecnico([
    { id: "f1", nome: "Cappotto", validazione: { stato: "da_validare" }, materiali: [r({}), r({ id: "m2", quantity: 140 })] },
    { id: "f2", nome: "Massetto", validazione: { stato: "da_validare" }, materiali: [r({ id: "m3", name: "Sabbia", quantity: 0 })] },
  ]);
  it("valida solo le fasi pronte, dopo la conferma", () => {
    const onValida = vi.fn();
    render(<RevisioneTecnico revisione={rev} onApriFase={vi.fn()} onValida={onValida} inCorso={false} />);
    expect(screen.getByText("2 fasi da validare")).toBeTruthy();
    expect(screen.getByText("Sabbia")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Valida la fase pronta" }));
    expect(onValida).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Valida" }));
    expect(onValida).toHaveBeenCalledWith([{ phaseId: "f1", nome: "Cappotto" }]);
  });
  it("il nome della fase la apre", () => {
    const onApriFase = vi.fn();
    render(<RevisioneTecnico revisione={rev} onApriFase={onApriFase} onValida={vi.fn()} inCorso={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Massetto" }));
    expect(onApriFase).toHaveBeenCalledWith("f2");
  });
  it("lo vede solo chi valida, e «Valida tutte» usa la stessa funzione del pulsante della fase", () => {
    expect(readFileSync("src/components/orders/materiali/MaterialiPerFase.tsx", "utf8")).toContain("{permessi.canValidateBom && (\n          <RevisioneTecnico");
    expect(readFileSync("src/hooks/useMaterialiPerFase.ts", "utf8")).toMatch(/validaFasi[\s\S]*materiali_fase_cambia_stato", \{ p_phase: f\.phaseId, p_azione: "valida" \}/);
  });
});
