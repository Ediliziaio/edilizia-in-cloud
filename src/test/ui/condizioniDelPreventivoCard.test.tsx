/**
 * Le condizioni di UN preventivo, scritte per quel cliente (07/11/2026).
 *
 * Chi ha il permesso «Riscrivere le condizioni su un documento» le cambia qui, anche partendo da un altro
 * modello di «Contratti e condizioni»; chi non lo ha le vede e basta. Il modello dell'azienda non cambia.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const stato = vi.hoisted(() => ({ permessi: {} as Record<string, unknown>, modelli: [] as unknown[] }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => stato.permessi }));
vi.mock("@/hooks/useCondizioniArchivio", () => ({ useCondizioniArchivio: () => ({ modelli: stato.modelli }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { name: "Edile Prova" } }) }));
vi.mock("@/components/shared/PdfBlobLivePreviewPanel", () => ({
  PdfBlobLivePreviewPanel: ({ depsKey }: { depsKey: string }) => <div data-testid="anteprima-pdf">{depsKey}</div>,
}));
vi.mock("@/components/ui/rich-text-editor", () => ({
  RichTextEditor: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea aria-label="Editor" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

import { CondizioniDelPreventivoCard } from "@/components/moduli/CondizioniDelPreventivoCard";

const modello = (p: Record<string, unknown> = {}) => ({
  id: "m1", nome: "Standard", ambito: "preventivo", predefinito: true, attivo: true, versione: 2,
  clausole: [{ titolo: "Pagamenti", testo: "30% alla firma." }], ...p,
});

function disegna(progetto: Record<string, unknown> | null = null) {
  const onChange = vi.fn();
  render(<MemoryRouter><CondizioniDelPreventivoCard progetto={progetto as never} onChange={onChange} /></MemoryRouter>);
  return onChange;
}

beforeEach(() => {
  stato.permessi = { isAdmin: false, canRiscrivereCondizioni: true };
  stato.modelli = [modello(), modello({ id: "m2", nome: "Cliente grande", predefinito: false, clausole: [{ titolo: "Pagamenti", testo: "60 giorni fine mese." }] })];
});

describe("Con il permesso", () => {
  it("si parte da un altro modello dell'archivio e si salva solo per questo preventivo", () => {
    const onChange = disegna();
    fireEvent.click(screen.getByRole("button", { name: /Scrivi condizioni solo per questo preventivo/ }));
    expect((screen.getByLabelText("Editor") as HTMLTextAreaElement).value).toContain("30% alla firma.");
    fireEvent.change(screen.getByLabelText("Parti dalle condizioni di un altro modello"), { target: { value: "m2" } });
    expect((screen.getByLabelText("Editor") as HTMLTextAreaElement).value).toContain("60 giorni fine mese.");
    fireEvent.click(screen.getByRole("button", { name: "Salva per questo preventivo" }));
    expect(onChange).toHaveBeenCalledWith({ condizioni_testo: expect.stringContaining("60 giorni fine mese.") });
  });

  it("si torna a quelle del modello con un clic", () => {
    const onChange = disegna({ condizioni_testo: "<p>Solo per Rossi.</p>" });
    fireEvent.click(screen.getByRole("button", { name: /Torna a quelle del modello/ }));
    expect(onChange).toHaveBeenCalledWith({ condizioni_testo: null });
  });
});

describe("Senza il permesso", () => {
  it("le vede, non le cambia, e sa quale permesso serve", () => {
    stato.permessi = { isAdmin: false, canRiscrivereCondizioni: false, canEditSettingsPricing: false };
    disegna();
    expect(screen.queryByRole("button", { name: /Scrivi condizioni/ })).toBeNull();
    expect(screen.getByText(/serve il permesso «Riscrivere le condizioni su un documento»/)).toBeInTheDocument();
  });
});

describe("L'anteprima è il PDF di quello che esce", () => {
  it("del modello, finché non si riscrivono", () => {
    disegna();
    fireEvent.click(screen.getByRole("button", { name: /Anteprima/ }));
    expect(screen.getByTestId("anteprima-pdf").textContent).toMatch(/^m1:2:/);
  });

  it("di questo preventivo, quando sono riscritte", () => {
    disegna({ condizioni_testo: "<p>Solo per Rossi.</p>" });
    fireEvent.click(screen.getByRole("button", { name: /Anteprima/ }));
    expect(screen.getByTestId("anteprima-pdf").textContent).toMatch(/^documento:1:/);
  });
});
